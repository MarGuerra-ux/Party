// ================================================
// PARTY_SCHEDULE.JS — horario del estudiante
//  · Guarda el horario (navegador + tabla student_schedules si existe)
//  · Saludo de bienvenida: "Hola Marco! Hoy lunes te toca …"
//  · Próximas clases para el dashboard
//  · Flujo "sube tu horario": leer → revisar → guardar → crear
//    asignaturas → carpetas → cuadernos borrador
// Usa DocReader (lector) y ScheduleParser (formato Duoc UC).
// ================================================

window.PartySchedule = (() => {
  const KEY = "party_horario";
  const esc = (s) => Party.esc(s);
  const DAYS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
  const ICONS = [[/dato|bdd/i, "database"], [/segur|calidad|red/i, "network"], [/cloud|program|desarroll|software/i, "code"], [/proyecto|gestion|gestión/i, "chart"], [/solucion|inteligen|ia\b/i, "cap"]];
  const COLORS = ["violet", "blue", "green", "teal", "pink", "amber"];
  const noAccent = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
  const norm = (s) => noAccent(s).toLowerCase().replace(/_\s*\d{3}[a-z]?\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();

  // ---------- almacenamiento ----------
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
  async function save(data) {
    const rec = { ...data, savedAt: Date.now() };
    try { localStorage.setItem(KEY, JSON.stringify(rec)); } catch { return { local: false, remote: false }; }
    let remote = false;
    try {
      const me = Party.student();
      if (me && !me._dev_mode && typeof supabaseClient !== "undefined") {
        const { error } = await supabaseClient.from("student_schedules").upsert({ student_id: me.id, data: rec, updated_at: new Date().toISOString() });
        remote = !error; if (error) console.warn("student_schedules:", error.message);
      }
    } catch (e) { console.warn(e); }
    return { local: true, remote };
  }
  // trae el horario desde Supabase si este navegador aún no lo tiene
  async function pull() {
    pullRooms();
    if (load()) return load();
    try {
      const me = Party.student();
      if (me && !me._dev_mode && typeof supabaseClient !== "undefined") {
        const { data } = await supabaseClient.from("student_schedules").select("data").eq("student_id", me.id).maybeSingle();
        if (data?.data) { localStorage.setItem(KEY, JSON.stringify(data.data)); return data.data; }
      }
    } catch {}
    return null;
  }

  // ---------- salas de la sede ----------
  // Catálogo base (misma info que la tabla campus_rooms); Supabase la puede ampliar.
  const ROOMS_KEY = "party_rooms";
  const ROOMS = { LC8: { building: "Bloque central", floor: 2 }, LC9: { building: "Bloque central", floor: 2 }, DST1: { building: "Segundo bloque", floor: 5 } };
  try { Object.assign(ROOMS, JSON.parse(localStorage.getItem(ROOMS_KEY)) || {}); } catch {}
  const roomCode = (r) => String(r || "").toUpperCase().replace(/^PA[\s-]*/, "").replace(/\s+/g, "");
  const roomInfo = (r) => ROOMS[roomCode(r)] || null;
  const roomWhere = (r) => { const i = roomInfo(r); return i ? `${i.floor}º piso, ${i.building.toLowerCase()}` : ""; };
  async function pullRooms() {
    try {
      if (typeof supabaseClient === "undefined") return;
      const { data, error } = await supabaseClient.from("campus_rooms").select("code,building,floor");
      if (error || !data?.length) return;
      const m = {}; data.forEach((r) => (m[roomCode(r.code)] = { building: r.building, floor: r.floor }));
      Object.assign(ROOMS, m); localStorage.setItem(ROOMS_KEY, JSON.stringify(m));
    } catch {}
  }
  const roomTxt = (r) => (r ? `${esc(r)}${roomWhere(r) ? " (" + esc(roomWhere(r)) + ")" : ""}` : "");

  // ---------- nombres y horas ----------
  const strip = (n) => String(n || "").replace(/_\s*\d{3}[A-Za-z]?\s*$/, "").replace(/\s+/g, " ").trim();
  const pretty = (n) => ScheduleParser.title(strip(n));
  const toMin = (t) => { const [h, m] = t.split(":"); return +h * 60 + +m; };
  const friendly = (t) => { const m = Math.round(toMin(t) / 5) * 5; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };
  const secOf = (data, full) => data.sections.find((s) => s.full === full);
  // El horario sigue a "Mis Asignaturas": si borras una asignatura sus clases dejan de aparecer,
  // si la renombras el horario usa el nombre nuevo, y si la vuelves a crear se vincula sola.
  function liveSub(sec) {
    const subs = PartyData.getSubjects();
    if (subs.sample || !sec) return { show: true, name: null };
    let s = sec.subjectId && subs.list.find((x) => x.id === sec.subjectId);
    if (!s) s = findSubject(sec.subjectName || sec.name, String(sec.sec || "").slice(0, 3), subs.list);
    if (s) return { show: true, name: pretty(s.name) };
    return { show: !sec.subjectId, name: null };   // vinculada antes y ya no existe → se oculta
  }
  const titleOf = (data, slot) => { const s = secOf(data, slot.section); return liveSub(s).name || pretty(s?.subjectName || s?.name || slot.section); };
  const visibleSlots = (data) => (data?.slots || []).filter((x) => liveSub(secOf(data, x.section)).show);
  const inRange = (sec, d) => { const t = d.toISOString().slice(0, 10); return !(sec?.start && t < sec.start) && !(sec?.end && t > sec.end); };

  function forDay(date = new Date()) {
    const data = load(); if (!data?.slots?.length) return [];
    const di = (date.getDay() + 6) % 7;
    return visibleSlots(data).filter((s) => s.day === di && inRange(secOf(data, s.section), date))
      .map((s) => ({ ...s, title: titleOf(data, s), start: friendly(s.from), end: friendly(s.to) }))
      .sort((a, b) => a.from.localeCompare(b.from));
  }
  const nowMin = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };

  // próximas clases (hoy lo que no terminó, y los días siguientes)
  function upcoming(n = 4) {
    const out = [];
    for (let i = 0; i < 8 && out.length < n; i++) {
      const d = new Date(); d.setDate(d.getDate() + i); d.setHours(0, 0, 0, 0);
      forDay(d).forEach((c) => {
        if (i === 0 && toMin(c.to) <= nowMin()) return;
        const [h, m] = c.start.split(":"); const at = new Date(d); at.setHours(+h, +m, 0, 0);
        if (out.length < n) out.push({ title: c.title, date: at.toISOString(), time: `${c.start} - ${c.end}`, room: c.room || "" });
      });
    }
    return out;
  }

  const hasSchedule = () => !!load()?.slots?.length;

  // Días de la semana (lun–dom) que faltan: desde HOY hasta el domingo.
  // next=true → la semana siguiente completa. Hoy solo cuenta lo que aún no terminó.
  function weekDays({ next = false } = {}) {
    const out = [], today = new Date(); today.setHours(0, 0, 0, 0);
    const di = (today.getDay() + 6) % 7;                       // 0 = lunes
    const start = new Date(today); start.setDate(today.getDate() + (next ? 7 - di : 0));
    const last = new Date(today); last.setDate(today.getDate() + (6 - di) + (next ? 7 : 0));
    for (let d = new Date(start); d <= last; d.setDate(d.getDate() + 1)) {
      const date = new Date(d), isToday = date.getTime() === today.getTime();
      out.push({ date, isToday, classes: forDay(date).filter((c) => !isToday || toMin(c.to) > nowMin()) });
    }
    return out;
  }

  // events: [{ date, title }] reales (no de ejemplo). Devuelve HTML con lo que resta de la semana.
  function weekHTML(events = [], next = false) {
    const days = weekDays({ next }), today = new Date(); today.setHours(0, 0, 0, 0);
    const di = (today.getDay() + 6) % 7;
    const rows = days.map(({ date, isToday, classes }) => {
      const evs = events.filter((e) => new Date(e.date).toDateString() === date.toDateString());
      if (!classes.length && !evs.length) return "";
      const nm = DAYS[(date.getDay() + 6) % 7], diff = Math.round((date - today) / 864e5);
      const lab = isToday ? "Hoy" : diff === 1 ? "Mañana" : nm[0].toUpperCase() + nm.slice(1);
      const lines = [
        ...classes.map((c) => `🕒 <b>${esc(c.title)}</b> — ${c.start} a ${c.end}${c.room ? " · " + roomTxt(c.room) : ""}`),
        ...evs.map((e) => `📌 <b>${esc(e.title)}</b>`),
      ];
      return `<li><b>${isToday || diff === 1 ? `${lab} · ${nm} ${date.getDate()}` : `${lab} ${date.getDate()}`}</b><br>${lines.join("<br>")}</li>`;
    }).join("");
    const head = next ? "Tu próxima semana:" : di === 0 ? "Tu semana:" : `Lo que te queda de la semana (hasta el domingo):`;
    if (!rows) return next ? "La próxima semana no tienes clases ni eventos registrados. 🎉" : `No te quedan clases ni eventos esta semana. 🎉 Si quieres, pregúntame por la <b>próxima semana</b>.`;
    return `${head}<ul>${rows}</ul>`;
  }

  // "Hola Marco! Hoy lunes te toca Taller de Base de Datos a las 19:00."
  function greeting() {
    const data = load(); if (!data?.slots?.length) return null;
    const name = Party.firstName(), now = new Date(), t0 = forDay(now);
    const left = t0.filter((c) => toMin(c.to) > nowMin());
    const day = DAYS[(now.getDay() + 6) % 7];
    const list = (arr) => arr.map((c) => `<b>${esc(c.title)}</b> a las ${c.start}`).join(" y luego ");
    if (left.length) {
      const cur = left.find((c) => toMin(c.from) <= nowMin());
      if (cur) return `¡Hola ${esc(name)}! Ahora estás en clase de <b>${esc(cur.title)}</b>${cur.room ? " (" + roomTxt(cur.room) + ")" : ""}, hasta las ${cur.end}.`;
      return `¡Hola ${esc(name)}! Hoy ${day} te toca ${list(left)}${left[0].room ? " en " + roomTxt(left[0].room) : ""}.`;
    }
    for (let i = 1; i < 8; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      const c = forDay(d);
      if (c.length) return `¡Hola ${esc(name)}! ${t0.length ? "Por hoy ya terminaste tus clases." : "Hoy no tienes clases."} ${i === 1 ? "Mañana" : "El"} ${DAYS[(d.getDay() + 6) % 7]} te toca ${list(c)}.`;
    }
    return `¡Hola ${esc(name)}! No tienes clases en los próximos días.`;
  }

  // respuestas del asistente: "¿qué tengo hoy / mañana?", "mi horario"
  function answer(text) {
    const data = load();
    const t = noAccent(text).toLowerCase();
    const rm = t.match(/(?:donde|ubicacion|queda|piso|sala)\D{0,25}?\b((?:pa-?)?(?:lc|dst)\s?\d)\b/);
    if (rm) { const w = roomWhere(rm[1]); const code = roomCode(rm[1]); return { html: w ? `La sala <b>${esc(code)}</b> está en el <b>${esc(w)}</b>.` : `Aún no tengo registrada la sala ${esc(code)}.` }; }
    if (!/(horario|clases?|que tengo|que me toca|me toca)/.test(t) || /semana/.test(t)) return null;
    if (!data?.slots?.length) return { html: `Aún no tengo tu horario. Súbelo desde <b>Mis Asignaturas</b> (foto, PDF o Word) y lo leo por ti.` };
    const day = /manana/.test(t) ? 1 : 0;
    const d = new Date(); d.setDate(d.getDate() + day);
    const c = forDay(d), label = day ? "mañana" : "hoy";
    if (/horario/.test(t) && !/hoy|manana/.test(t)) {
      const rows = DAYS.slice(0, 6).map((nm, i) => {
        const sl = visibleSlots(data).filter((s) => s.day === i).sort((a, b) => a.from.localeCompare(b.from));
        return sl.length ? `<li><b>${nm[0].toUpperCase() + nm.slice(1)}:</b> ${sl.map((s) => `${esc(titleOf(data, s))} (${friendly(s.from)}–${friendly(s.to)}${s.room ? ", " + roomTxt(s.room) : ""})`).join("; ")}</li>` : "";
      }).join("");
      return { html: `Tu horario:<ul>${rows}</ul>` };
    }
    return { html: c.length ? `Para ${label} tienes:<ul>${c.map((x) => `<li><b>${esc(x.title)}</b> — ${x.start} a ${x.end}${x.room ? " · " + roomTxt(x.room) : ""}</li>`).join("")}</ul>` : `${label[0].toUpperCase() + label.slice(1)} no tienes clases. 🎉` };
  }

  // ================================================
  // FLUJO DE IMPORTACIÓN
  // ================================================
  const acts = new Map(); let seq = 0;
  const chipsOf = (chips) => (chips || []).map((c) => { const id = "sa" + ++seq; acts.set(id, c.fn); return { label: c.label, id }; });
  function runAct(id) { const f = acts.get(id); if (f) f(); else showToast("Esa opción ya expiró; sube el archivo de nuevo.", "warning"); }
  const chipHTML = (list) => list.length ? `<div class="g-chips" style="margin-top:8px">${list.map((c) => `<button type="button" class="g-chip" onclick="PartySchedule.runAct('${c.id}')">${c.label}</button>`).join("")}</div>` : "";

  // busca una asignatura ya creada que se parezca al nombre leído
  function findSubject(name, secNum, subjects) {
    const toks = (s) => norm(s).split(" ").filter((t) => t.length >= 3);
    const mine = toks(name).map((t) => t.replace(/^seg$/, "seguridad"));
    if (mine.length < 2) return null;
    let best = null, bestScore = 0;
    subjects.forEach((s) => {
      const theirs = toks(s.name);
      const hit = mine.filter((t) => theirs.some((u) => u === t || (t.length >= 4 && u.startsWith(t.slice(0, 4)) && (u.startsWith(t) || t.startsWith(u.slice(0, Math.min(u.length, t.length)))))));
      let score = hit.length / mine.length;
      if (new RegExp("_" + secNum + "\\b", "i").test(s.name)) score += 0.25;
      if (hit.length >= 2 && score > bestScore) { best = s; bestScore = score; }
    });
    return bestScore >= 0.6 ? best : null;
  }

  function summaryHTML(data) {
    const rows = data.sections.map((s) => {
      const sl = data.slots.filter((x) => x.section === s.full).sort((a, b) => a.day - b.day);
      const when = sl.map((x) => `${DAYS[x.day].slice(0, 3)} ${friendly(x.from)}–${friendly(x.to)}`).join(", ") || "sin bloques";
      return `<li><b>${esc(s.subjectName || s.name)}</b>${s.truncated && !s.subjectId ? " ⚠️" : ""}<br><small>${esc(s.full)}${s.teacher ? " · " + esc(s.teacher) : ""}<br>${esc(when)}${s.room ? " · " + roomTxt(s.room) : ""}</small></li>`;
    }).join("");
    return `<ul class="g-topics" style="padding-left:18px">${rows}</ul>`;
  }

  function reviewModal(data, done) {
    const dayOpts = (v) => DAYS.slice(0, 6).map((d, i) => `<option value="${i}" ${i === v ? "selected" : ""}>${d}</option>`).join("");
    const secRows = data.sections.map((s, i) => `<div class="rv-sec"><input data-sn="${i}" value="${esc(s.subjectName || s.name)}" aria-label="Nombre"><input data-st="${i}" value="${esc(s.teacher || "")}" placeholder="Profesor" aria-label="Profesor"><small>${esc(s.full)}</small></div>`).join("");
    const slotRows = data.slots.map((x, i) => `<div class="rv-slot"><select data-sd="${i}">${dayOpts(x.day)}</select><input data-sf="${i}" value="${esc(x.from)}" aria-label="Desde"><input data-se="${i}" value="${esc(x.to)}" aria-label="Hasta"><input data-sr="${i}" value="${esc(x.room || "")}" placeholder="Sala" aria-label="Sala"><span class="rv-name">${esc(pretty(secOf(data, x.section)?.name || x.section))}</span><label class="rv-del"><input type="checkbox" data-sx="${i}"> quitar</label></div>`).join("");
    Party.modal({
      title: "Revisar y corregir el horario",
      html: `<p style="margin:0 0 8px;font-size:12.5px;color:var(--color-muted)">La lectura de una foto puede tener errores. Corrige nombres, profesor, días y horas.</p>
        <div class="rv-box"><h4>Asignaturas</h4>${secRows}<h4>Bloques de clase</h4>${slotRows}</div>`,
      confirm: "Guardar cambios",
      onConfirm: (ov) => {
        const val = (sel) => ov.querySelector(sel)?.value.trim();
        data.sections.forEach((s, i) => { s.subjectName = val(`[data-sn="${i}"]`) || s.name; s.teacher = val(`[data-st="${i}"]`) || ""; });
        const keep = [];
        data.slots.forEach((x, i) => {
          if (ov.querySelector(`[data-sx="${i}"]`).checked) return;
          const f = val(`[data-sf="${i}"]`), e = val(`[data-se="${i}"]`);
          if (!/^\d{1,2}:\d{2}$/.test(f) || !/^\d{1,2}:\d{2}$/.test(e)) return keep.push(x);
          keep.push({ ...x, day: +val(`[data-sd="${i}"]`), from: f.padStart(5, "0"), to: e.padStart(5, "0"), room: val(`[data-sr="${i}"]`) || "" });
        });
        data.slots = keep; done(data);
      },
    });
  }

  /**
   * handleFile(file, ui)
   *  ui = { say(html, chips[{label, fn}]), status(text) }
   */
  async function handleFile(file, ui) {
    const kind = DocReader.kindOf(file);
    if (kind === "other") return ui.say(`No sé leer archivos <b>.${esc(file.name.split(".").pop())}</b> todavía. Puedo leer fotos (JPG, PNG), PDF, Word (.docx) y texto.`);
    let res;
    try {
      ui.status("Leyendo tu archivo… (la primera vez descarga el lector, puede tardar un poco)");
      res = await DocReader.read(file, { onProgress: ui.status, accept: (w) => ScheduleParser.parse(w).slots.length > 0 });
    } catch (e) {
      console.error(e); ui.status("");
      return ui.say("No pude leer el archivo. Revisa tu conexión a internet (el lector se descarga la primera vez) e inténtalo de nuevo.");
    }
    ui.status("");
    window.__lastOCR = res.words; // para depurar la lectura desde la consola
    const data = ScheduleParser.parse(res.words);
    if (!data.sections.length || !data.slots.length) {
      const words = res.words.length;
      return ui.say(`Leí el archivo (${words} palabras) pero no reconozco un horario de Duoc UC en él${data.warnings[0] ? ` (${esc(data.warnings[0])})` : ""}. Si es un horario, prueba con una foto más recta y con buena luz, o con el PDF.`,
        [{ label: "Guardarlo en la Biblioteca (elegir asignatura y experiencia)", fn: () => Lib.ingest([file], { ui }) }]);
    }

    // une con las asignaturas que el usuario ya tiene
    const subs = PartyData.getSubjects();
    const mine = subs.sample ? [] : subs.list;
    data.sections.forEach((s) => {
      const m = findSubject(s.name, s.sec.slice(0, 3), mine);
      if (m) { s.subjectId = m.id; s.subjectName = m.name.replace(/_\s*\d{3}[A-Za-z]?\s*$/, "").trim(); }
    });
    data.source = file.name;
    present(data, file, ui);
  }

  function present(data, file, ui) {
    const n = data.sections.length;
    ui.say(`He leído la información de tu horario${data.student ? ` (<b>${esc(data.student)}</b>)` : ""}: <b>${n} asignatura${n === 1 ? "" : "s"}</b> y ${data.slots.length} bloques de clase.${summaryHTML(data)}Revisa que esté bien. Los nombres con ⚠️ pueden venir cortados en el boletín.`, [
      { label: "✅ Está bien, guardar", fn: () => afterSave(data, file, ui) },
      { label: "✏️ Corregir datos", fn: () => reviewModal(data, (d) => present(d, file, ui)) },
    ]);
  }

  async function afterSave(data, file, ui) {
    const r = await save(data);
    PartyData.invalidate && PartyData.invalidate();
    ui.say(`Horario guardado ✓ ${r.remote ? "También quedó en tu cuenta (Supabase)." : "Quedó en este navegador; para guardarlo también en Supabase falta crear la tabla <code>student_schedules</code> (te dejé el SQL)."}<br>${greeting() || ""}`);
    ui.say(`¿Quieres que cree <b>cada asignatura</b> en tu panel? Las que ya tienes no se duplican.`, [
      { label: "Sí, crear asignaturas", fn: () => createSubjects(data, file, ui) },
      { label: "Ya las tengo", fn: () => createSubjects(data, file, ui, true) },
      { label: "Ahora no", fn: () => storeOriginal(file, ui) },
    ]);
  }

  async function createSubjects(data, file, ui, linkOnly) {
    const cur = PartyData.getSubjects();
    const list = cur.sample ? [] : cur.list;
    let created = 0, linked = 0;
    data.sections.forEach((s, i) => {
      let sub = s.subjectId && list.find((x) => x.id === s.subjectId);
      if (!sub) sub = findSubject(s.subjectName || s.name, s.sec.slice(0, 3), list);
      if (sub) { linked++; }
      else if (!linkOnly) {
        const nm = noAccent(s.subjectName || s.name).toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();
        sub = { id: "s_" + Date.now() + "_" + i, name: `${nm}_${s.sec}`, icon: (ICONS.find(([rx]) => rx.test(nm)) || [0, "book"])[1], color: COLORS[(list.length) % COLORS.length], pct: 0 };
        list.push(sub); created++;
      }
      if (sub) { Object.assign(sub, { code: s.code, section: s.sec, teacher: s.teacher || sub.teacher || "", room: s.room || sub.room || "" }); s.subjectId = sub.id; }
    });
    PartyData.saveSubjects(list);
    await save(data);
    if (typeof renderAsignaturas === "function") renderAsignaturas();
    ui.say(`Listo ✓ Creé <b>${created}</b> asignatura(s) nueva(s) y vinculé <b>${linked}</b> que ya tenías.`);
    const subjects = data.sections.map((s) => list.find((x) => x.id === s.subjectId)).filter(Boolean);
    if (!subjects.length) return storeOriginal(file, ui);
    ui.say(`¿Creo la <b>carpeta de cada asignatura</b> en la Biblioteca?`, [
      { label: "Sí, crear carpetas", fn: () => askUnits(subjects, file, ui) },
      { label: "Ahora no", fn: () => storeOriginal(file, ui) },
    ]);
  }

  function askUnits(subjects, file, ui) {
    const lbl = localStorage.getItem("party_unit_label") || "Experiencia";
    const L = lbl.toLowerCase();
    ui.say(`Tus unidades se llaman <b>${esc(lbl)}s</b> (como en Duoc UC). ¿Cuántas tiene cada asignatura?`,
      [2, 3, 4, 5].map((n) => ({ label: String(n), fn: () => makeFolders(subjects, n, lbl, file, ui) })).concat([{ label: "Que se creen según el material", fn: () => makeFolders(subjects, 0, lbl, file, ui) }]));
  }

  async function makeFolders(subjects, units, lbl, file, ui) {
    try { await Lib.setupSubjects(subjects, { units, label: lbl }); } catch (e) { console.error(e); return ui.say("No pude crear las carpetas en este navegador."); }
    ui.say(`Carpetas creadas ✓ (${subjects.length}${units ? `, con ${units} ${esc(lbl.toLowerCase())}s cada una` : ""}). Las ves en <b>Biblioteca</b>.`);
    if (units && getState().selected.groupId) {
      return ui.say(`¿Quieres un <b>cuaderno borrador</b> para cada ${esc(lbl.toLowerCase())}? Quedan como apuntes ya ligados a la asignatura.`, [
        { label: "Sí, crear cuadernos", fn: async () => { await Lib.setupSubjects(subjects, { units, drafts: true, label: lbl }); ui.say("Cuadernos borrador creados ✓ Los encuentras en <b>Apuntes</b> y dentro de cada carpeta."); storeOriginal(file, ui); } },
        { label: "No por ahora", fn: () => storeOriginal(file, ui) },
      ]);
    }
    storeOriginal(file, ui);
  }

  function storeOriginal(file, ui) {
    ui.say(`¿Guardo el archivo original del horario en la Biblioteca (carpeta <b>Mi horario</b>)?`, [
      { label: "Sí, guardarlo", fn: async () => { await Lib.saveInFolder(file, "Mi horario"); finish(ui, "Archivo guardado en Biblioteca → Mi horario ✓"); } },
      { label: "No", fn: () => finish(ui) },
    ]);
  }
  function finish(ui, extra) {
    ui.say(`${extra ? extra + "<br>" : ""}¡Todo listo! Así te saludaré en tu panel:<br><i>${greeting() || ""}</i>`);
  }

  return { roomInfo, roomWhere, load, save, pull, hasSchedule, forDay, upcoming, greeting, answer, weekDays, weekHTML, handleFile, runAct, chipsOf, chipHTML, findSubject, friendly };
})();
