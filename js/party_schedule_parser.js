// ================================================
// PARTY_SCHEDULE_PARSER.JS
// Convierte las palabras (con posición) de un "Boletín de carga
// académica" de Duoc UC en: asignaturas (secciones) y bloques de
// horario. Usa la geometría de las tablas, no solo el texto:
//   · encabezados Lunes…Sábado → columnas
//   · etiquetas "19:01-19:40" → filas
//   · códigos "BDY1103-002V" → celdas
//   · tabla inferior (Sección, Sala, Asignatura, Fechas, Profesor)
// Tolera errores típicos del OCR (¥ por Y, 1 por I, etc.).
// Funciona en el navegador (window.ScheduleParser) y en Node.
// ================================================
(function (root) {
  const cx = (w) => (w.x0 + w.x1) / 2;
  const cy = (w) => (w.y0 + w.y1) / 2;
  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  const mode = (arr) => { const m = new Map(); arr.forEach((v) => m.set(v, (m.get(v) || 0) + 1)); return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]; };
  const ROOM_RX = /^P[A4]-?\w{2,5}$/i;
  const cleanTok = (t) => String(t).replace(/^[^A-Za-z0-9¥]+|[^A-Za-z0-9]+$/g, "");
  const CODE_RX = /(\d{4})\s*[-–—]\s*(\d{3})/;
  const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const DAY_KEYS = ["lunes", "martes", "mierc", "jueves", "viernes", "sabad"];

  const toMin = (h, m) => +h * 60 + +m;
  const fmt = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

  // "20:01-10:40" (OCR) → "10:01-10:40": corrige la hora usando duración y orden
  function fixRange(h1, m1, h2, m2, prevStart) {
    const cands = [[h1, m1, h2, m2], [h2, m1, h2, m2], [h1, m1, h1, m2]];
    for (const [a, b, c, d] of cands) {
      const s = toMin(a, b), e = toMin(c, d), dur = e - s;
      if (dur >= 25 && dur <= 70 && s >= (prevStart ?? 0) && +a < 24) return [s, e];
    }
    const s = toMin(h1, m1), e = toMin(h2, m2);
    return [s, e > s ? e : s + 40];
  }

  function fixCode(raw) { // IS¥1102-003v → ISY1102-003V
    return raw.toUpperCase().replace(/[¥]/g, "Y").replace(/\(([A-Z])\)/g, "$1").replace(/\s+/g, "");
  }

  const CONF = ["I1L|T", "S58", "B8E", "O0QD", "G6C", "Z2", "Y¥V", "PR"];
  const same = (a, b) => a === b || CONF.some((g) => g.includes(a) && g.includes(b));
  const sim = (x, y) => [0, 1, 2].reduce((n, i) => n + (x[i] && y[i] && same(x[i], y[i]) ? 1 : 0), 0);
  const tokenParts = (txt) => { // [{letters, key, suffix}] de cualquier texto que contenga un código
    const out = [], rx = /([A-Z0-9¥|]{3})\s?(\d{4})\s*[-–—]\s*(\d{3})\s*\(?([A-Z])?\)?/gi;
    let m; const t = String(txt).toUpperCase();
    while ((m = rx.exec(t))) out.push({ letters: m[1], key: `${m[2]}-${m[3]}`, suffix: m[4] || "" });
    return out;
  };

  const SMALL = new Set(["de", "del", "la", "las", "el", "los", "en", "y", "e", "con", "para", "a", "al"]);
  const title = (s) => s.toLowerCase().split(/\s+/).map((w, i) => (i && SMALL.has(w) ? w : /^(i|ii|iii|iv|v|vi)$/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");

  function parse(words) {
    const warnings = [];
    const W = [];
    words.filter((w) => w.text && w.text.trim()).forEach((w) => { // "GESTIÓN|11.08.2026" → dos palabras
      const parts = w.text.split("|").filter(Boolean);
      if (parts.length < 2 || w.text.length < 6) return W.push(w);
      const total = parts.reduce((n, x) => n + x.length, 0), width = w.x1 - w.x0; let x = w.x0;
      parts.forEach((t) => { const wd = (width * t.length) / total; W.push({ ...w, text: t, x0: x, x1: x + wd }); x += wd; });
    });
    if (W.length < 15) return { sections: [], slots: [], warnings: ["Casi no se pudo leer texto."] };

    // códigos completos y limpios del documento (p. ej. GPY1102-003V, ISY1102-003V)
    // dígitos del código: "1102-002" mal leído → "1102-003" si ese otro aparece mucho más
    const kc = new Map();
    W.forEach((w) => { const m = w.text.match(CODE_RX); if (m) { const k = `${m[1]}-${m[2]}`; kc.set(k, (kc.get(k) || 0) + 1); } });
    const canon = (k) => {
      let best = k;
      kc.forEach((n, o) => { if (o !== k && o.slice(0, 4) === k.slice(0, 4) && [...o.slice(5)].filter((c, i) => c !== k[5 + i]).length === 1 && n >= 3 * (kc.get(best) || 1)) best = o; });
      return best;
    };
    // Lecturas de código del documento, agrupadas por parecido (E≈B, 1≈I, ¥≈Y…).
    // Cada grupo aporta una versión "limpia" de 3 letras; los grupos débiles se descartan.
    const DIG2LET = { 1: "I", 0: "O", 5: "S", 8: "S", 6: "G", 2: "Z" };
    const groups = new Map(); // key -> [{rep, weight, clean, cleanW}]
    W.forEach((w) => tokenParts(w.text).forEach((t) => {
      const wt = 0.3 + (w.conf || 50) / 100, l = t.letters.replace("¥", "Y");
      t.key = canon(t.key);
      const list = groups.get(t.key) || groups.set(t.key, []).get(t.key);
      let g = list.find((x) => sim(x.rep, l) === 3);
      if (!g) { g = { rep: l, weight: 0, clean: "", cleanW: 0 }; list.push(g); }
      g.weight += wt;
      if (/^[A-Z]{3}$/.test(l) && wt > g.cleanW) { g.clean = l; g.cleanW = wt; }
    }));
    const valid = new Map(); // key -> Set(letras limpias)
    groups.forEach((list, k) => {
      const top = Math.max(...list.map((g) => g.weight));
      const keep = list.filter((g) => g.weight >= Math.max(1.2, top * 0.35) || list.length === 1);
      valid.set(k, new Set((keep.length ? keep : [list[0]]).map((g) => g.clean || g.rep.replace(/[0-9]/g, (d) => DIG2LET[d] || "X"))));
    });
    const resolveLetters = (key, raws, avoid = new Set()) => {
      const cands = [...(valid.get(key) || [])];
      if (!cands.length) return raws[0]?.replace(/[^A-Z]/g, "") || "";
      const score = (c) => raws.reduce((n, r) => n + sim(c, r), 0);
      const ok = cands.filter((c) => !avoid.has(c));
      return (ok.length ? ok : cands).sort((p, q) => score(q) - score(p))[0];
    };

    // ---- 1) encabezados de los días → columnas ----
    const cand = DAY_KEYS.map(() => []);
    W.forEach((w) => {
      const n = norm(w.text).replace(/[^a-z]/g, "");
      DAY_KEYS.forEach((k, i) => { if (n.length >= 4 && (n.startsWith(k) || (n.length >= 5 && k.startsWith(n)))) cand[i].push(w); });
    });
    const picked = cand.map((l) => l.sort((a, b) => (b.conf || 0) - (a.conf || 0))[0]).map((w, i) => (w ? { i, x: cx(w), y: cy(w) } : null)).filter(Boolean);
    if (picked.length < 2) return { sections: [], slots: [], warnings: ["No encontré los días de la semana (Lunes…Sábado)."] };
    const hy = median(picked.map((p) => p.y));
    const good = picked.filter((p) => Math.abs(p.y - hy) < 80);
    // ajuste lineal x = a + b·i
    const n = good.length, sx = good.reduce((s, p) => s + p.i, 0), sxx = good.reduce((s, p) => s + p.i * p.i, 0);
    const sy = good.reduce((s, p) => s + p.x, 0), sxy = good.reduce((s, p) => s + p.i * p.x, 0);
    const b = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1), a = (sy - b * sx) / n;
    const colX = DAY_KEYS.map((_, i) => a + b * i), spacing = Math.abs(b);

    // ---- 2) filas horarias ----
    const timeRx = /(\d{1,2})\s*[:.]\s*(\d{2})\s*[-–—]\s*(\d{1,2})\s*[:.]\s*(\d{2})/;
    const rows = [];
    const left = W.filter((w) => cy(w) > hy && cx(w) < colX[0] - spacing * 0.45);
    const lbls = [];
    left.forEach((w) => {
      let t = w.text;
      if (!timeRx.test(t) && /^\d{1,2}\s*[:.]\s*\d{2}\s*[-–—]\s*\d{1,2}$/.test(t)) { // "10:01-10" + "40"
        const nx = left.find((z) => z !== w && Math.abs(cy(z) - cy(w)) < 12 && z.x0 > w.x1 - 6 && z.x0 < w.x1 + 140 && /^:?[0-9SsOoIl]{2}$/.test(z.text));
        if (nx) t = t + ":" + nx.text.replace(/^:/, "").replace(/[Ss]/g, "5").replace(/[Oo]/g, "0").replace(/[Il]/g, "1");
      }
      if (timeRx.test(t)) lbls.push({ y: cy(w), t });
    });
    lbls.sort((p, q) => p.y - q.y).forEach((w) => {
      const m = w.t.match(timeRx), prev = rows.length ? rows[rows.length - 1].s : 0;
      const [s, e] = fixRange(m[1], m[2], m[3], m[4], prev);
      rows.push({ y: w.y, s, e });
    });
    if (!rows.length) return { sections: [], slots: [], warnings: ["No encontré las horas de las clases (19:01-19:40…)."] };
    const lastRowY = rows[rows.length - 1].y;

    // ---- 3) tabla inferior de secciones ----
    const find = (rx) => W.filter((w) => cy(w) > lastRowY && rx.test(norm(w.text).replace(/[^a-z.]/g, "")));
    const hdr = {
      sala: find(/^sala$/)[0], nombre: find(/nombre/)[0], inicio: find(/^inicio$/)[0], final: find(/^final$/)[0],
      tipo: find(/^tipo$/)[0], prof: find(/^profesor$/)[0], asig: find(/^asignatura$/)[0],
    };
    const tableY = median(Object.values(hdr).filter(Boolean).map(cy)) || lastRowY + 90;
    const colSala = hdr.sala ? hdr.sala.x0 - 25 : 0;
    const colNom = hdr.nombre ? hdr.nombre.x0 - 18 : (hdr.sala ? hdr.sala.x1 + 15 : 250);
    const colIni = hdr.inicio ? hdr.inicio.x0 - 12 : (hdr.asig ? hdr.asig.x1 + 20 : 520);
    const colFin = hdr.final ? hdr.final.x0 - 12 : colIni + 110;
    const colTipo = hdr.tipo ? hdr.tipo.x0 - 14 : colFin + 240;
    const colProf = hdr.prof ? hdr.prof.x0 - 40 : colTipo + 110;

    const below = W.filter((w) => cy(w) > tableY + 25);
    const anchors = [];
    below.filter((w) => CODE_RX.test(w.text)).sort((p, q) => cy(p) - cy(q)).forEach((w) => {
      const m = w.text.match(CODE_RX), key = canon(`${m[1]}-${m[2]}`);
      const last = anchors[anchors.length - 1];
      if (last && Math.abs(last.y - cy(w)) < 24) last.words.push(w); else anchors.push({ key, y: cy(w), words: [w] });
    });

    const sections = [], usedCodes = new Set();
    anchors.forEach((an, i) => {
      const top = an.y - 12, bot = i + 1 < anchors.length ? anchors[i + 1].y - 12 : an.y + 110;
      const band = below.filter((w) => cy(w) >= top && cy(w) < bot);
      const inCol = (lo, hi) => band.filter((w) => cx(w) >= lo && cx(w) < hi);
      const lines = (ws) => {
        const L = []; ws.sort((p, q) => cy(p) - cy(q)).forEach((w) => { const l = L.find((z) => Math.abs(z.y - cy(w)) < 9); if (l) l.w.push(w); else L.push({ y: cy(w), w: [w] }); });
        return L.sort((p, q) => p.y - q.y).flatMap((l) => l.w.sort((p, q) => p.x0 - q.x0));
      };
      // código con letras: se resuelve contra los códigos limpios del documento
      const raws = [...an.words, ...band].flatMap((w) => tokenParts(w.text)).filter((t) => canon(t.key) === an.key).map((t) => t.letters);
      const letters = resolveLetters(an.key, raws, usedCodes);
      usedCodes.add(letters);
      const code = letters && /^[A-Z]{3}$/.test(letters) ? letters + an.key.split("-")[0] : "";
      const secNum = an.key.split("-")[1], sec = secNum + "V";
      // nombre
      let nameWords = lines(inCol(colNom, colIni)).map((w) => w.text)
        .filter((t) => !CODE_RX.test(t))
        .filter((t) => /[A-Za-zÁÉÍÓÚÑáéíóúñ0-9]/.test(t));
      nameWords = nameWords.filter((t) => !/^\(?v\)?$/i.test(t) && !/^[|_—+\-]+$/.test(t));
      if (nameWords.length && /^[lL|]$/.test(nameWords[nameWords.length - 1])) nameWords[nameWords.length - 1] = "I";
      let name = nameWords.join(" ").replace(/\bSEG\.?\s/i, "SEGURIDAD ").replace(/\bING\.?\s/i, "INGENIERIA ").replace(/\s+/g, " ").trim();
      const truncated = name.length >= 25;
      // fechas
      const dtxt = inCol(colIni, colTipo).map((w) => w.text).join(" ").replace(/(?<=\d)[gG](?=\W|$)/g, "6").replace(/(?<=\d)[sS](?=\W|$)/g, "5").replace(/(?<=\d)[oO]/g, "0");
      const dates = [...dtxt.matchAll(/(\d{1,2})\s*[.,\-\/]\s*(\d{2})\s*[.,\-\/]\s*(20\d{2})/g)].filter((m) => +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31).map((m) => `${m[3]}-${m[2]}-${String(m[1]).padStart(2, "0")}`);
      // profesor
      const teacher = title(lines(band.filter((w) => cx(w) >= colProf)).map((w) => w.text).filter((t) => /[A-Za-zÁÉÍÓÚÑ]{2,}/.test(t)).join(" "));
      const room = inCol(colSala, colNom).map((w) => w.text).join("").toUpperCase().match(/P[A4]-?[A-Z]{2}[A-Z0-9]/)?.[0] || "";
      sections.push({ key: an.key, code, sec, full: code ? `${code}-${sec}` : `${an.key}V`, name: title(name), rawName: name, truncated, start: dates[0] || "", end: dates[1] || "", teacher, room });
    });
    if (!sections.length) warnings.push("No encontré la tabla de asignaturas (Sección, Sala, Nombre…).");

    // ---- 4) celdas de la grilla → bloques ----
    const dayOf = (w) => { let di = 0, dd = 1e9; colX.forEach((x, i) => { const d = Math.abs(cx(w) - x); if (d < dd) { dd = d; di = i; } }); return dd > spacing * 0.65 ? -1 : di; };
    const rowOf = (w) => { let ri = -1; rows.forEach((r, i) => { if (r.y <= cy(w) + 14) ri = i; }); return ri; };
    const inGrid = (w) => cy(w) > hy + 12 && cy(w) < tableY - 12;
    const fullOf = (key, raw) => { const l = resolveLetters(key, [raw]); return l ? `${l}${key.split("-")[0]}` : ""; };
    const cells = new Map(); // "día|fila" -> {day,row,full,key,room}
    W.filter((w) => inGrid(w) && CODE_RX.test(w.text)).forEach((w) => {
      const parts = tokenParts(w.text); if (!parts.length) return;
      parts.forEach((t) => (t.key = canon(t.key)));
      const di = dayOf(w), ri = rowOf(w); if (di < 0 || ri < 0) return;
      const code3 = fullOf(parts[0].key, parts[0].letters);
      const sec = sections.find((x) => x.key === parts[0].key && x.code === code3) || sections.find((x) => x.key === parts[0].key);
      const rm = W.find((z) => z !== w && ROOM_RX.test(cleanTok(z.text)) && cy(z) > cy(w) + 4 && cy(z) < cy(w) + 38 && Math.abs(cx(z) - cx(w)) < 75);
      cells.set(`${di}|${ri}`, { day: di, row: ri, full: sec ? sec.full : `${code3}-${parts[0].key.split("-")[1]}V`, key: parts[0].key, room: rm ? cleanTok(rm.text).toUpperCase() : "" });
    });
    // salas sueltas: la celda existe aunque el código no se haya leído → hereda de la fila vecina
    W.filter((w) => inGrid(w) && ROOM_RX.test(cleanTok(w.text))).forEach((w) => {
      const di = dayOf(w), ri = rowOf(w); if (di < 0 || ri < 0 || cells.has(`${di}|${ri}`)) return;
      const nb = cells.get(`${di}|${ri + 1}`) || cells.get(`${di}|${ri - 1}`);
      if (nb) cells.set(`${di}|${ri}`, { ...nb, row: ri, room: cleanTok(w.text).toUpperCase(), inferred: true });
    });
    const byKey = new Map();
    [...cells.values()].forEach((c) => { const k = `${c.full}|${c.day}`; (byKey.get(k) || byKey.set(k, []).get(k)).push(c); });
    const slots = [];
    byKey.forEach((list) => {
      list.sort((p, q) => p.row - q.row);
      let cur = null;
      list.forEach((c) => {
        if (cur && c.row === cur.lastRow + 1) { cur.lastRow = c.row; cur.rooms.push(c.room); }
        else { if (cur) slots.push(cur); cur = { full: c.full, day: c.day, firstRow: c.row, lastRow: c.row, rooms: [c.room] }; }
      });
      if (cur) slots.push(cur);
    });
    const out = slots.map((s2) => {
      const sec = sections.find((x) => x.full === s2.full);
      const rooms = s2.rooms.filter(Boolean), roomDigit = rooms.filter((r) => /\d$/.test(r));
      return { day: s2.day, from: fmt(rows[s2.firstRow].s), to: fmt(rows[s2.lastRow].e), section: s2.full, room: mode(roomDigit.length ? roomDigit : rooms) || sec?.room || "" };
    }).sort((p, q) => p.day - q.day || p.from.localeCompare(q.from));

    // salas por sección: la más repetida en la grilla
    sections.forEach((sec) => {
      const rs = out.filter((o) => o.section === sec.full).map((o) => o.room).filter(Boolean);
      const dg = rs.filter((r) => /\d$/.test(r));
      sec.room = mode(dg.length ? dg : rs) || sec.room;
    });

    // alumno
    let student = "";
    const comma = W.find((w) => /^[A-ZÁÉÍÓÚÑ]{3,},$/.test(w.text) && cy(w) < hy);
    if (comma) {
      const next = W.filter((w) => Math.abs(cy(w) - cy(comma)) < 14 && w.x0 > comma.x1 && w.x0 - comma.x1 < 60).sort((p, q) => p.x0 - q.x0)[0];
      if (next) student = title(`${next.text} ${comma.text.replace(",", "")}`);
    }

    if (!out.length) warnings.push("No pude ubicar los bloques de clase en la grilla.");
    return { student, sections, slots: out, warnings, days: DAYS };
  }

  const api = { parse, title, DAYS };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.ScheduleParser = api;
})(typeof window !== "undefined" ? window : globalThis);
