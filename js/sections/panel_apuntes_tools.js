// ================================================
// PANEL_APUNTES_TOOLS.JS
//  1) Barra de herramientas del editor de apuntes
//  2) NoteGuide: chat guía que liga el apunte con una asignatura
//     y con la PPT que se está viendo en clase.
// Funciona sin IA (reglas + datos locales). Cuando el servicio de LLM
// esté conectado, NoteGuide.llm(...) es el punto donde se enchufa.
// ================================================

// ---------- helpers ----------
const _esc = (s) => (window.Party && Party.esc ? Party.esc(s) : String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
const _norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9.\s]/g, " ").replace(/\s+/g, " ").trim();

// ================================================
// 1) TOOLBAR
// ================================================

const NOTE_FONTS = [
  ["inherit", "Fuente"], ["Georgia", "Georgia"], ["Arial", "Arial"], ["Verdana", "Verdana"],
  ["'Courier New'", "Código"], ["'Trebuchet MS'", "Trebuchet"], ["'Comic Sans MS'", "Manuscrita"],
];

function noteToolbarHTML(note) {
  const b = (tool, label, title, arg = "") =>
    `<button type="button" class="tb-btn" title="${title}" aria-label="${title}" onmousedown="event.preventDefault()" onclick="noteTool('${tool}','${arg}')">${label}</button>`;
  const sep = `<span class="toolbar-sep"></span>`;
  return `
  <div class="note-toolbar" role="toolbar" aria-label="Herramientas de formato">
    <div class="tb-group">${b("undo", "↶", "Deshacer")}${b("redo", "↷", "Rehacer")}</div>${sep}
    <div class="tb-group">
      <select class="toolbar-select" style="width:116px" onchange="noteTool('block',this.value);this.selectedIndex=0" title="Estilo de párrafo">
        <option value="">Estilo</option><option value="p">Párrafo</option><option value="h1">Título</option>
        <option value="h2">Subtítulo</option><option value="h3">Sección</option><option value="blockquote">Cita</option><option value="pre">Código</option>
      </select>
      <select class="toolbar-select" style="width:104px" onchange="noteTool('font',this.value);this.selectedIndex=0" title="Fuente">
        ${NOTE_FONTS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}
      </select>
      <select class="toolbar-select" style="width:74px" onchange="noteTool('size',this.value);this.selectedIndex=0" title="Tamaño">
        <option value="">Tam.</option><option value="2">Chico</option><option value="3">Normal</option><option value="5">Grande</option><option value="7">Enorme</option>
      </select>
    </div>${sep}
    <div class="tb-group">
      ${b("bold", "<b>B</b>", "Negrita (Ctrl+B)")}${b("italic", "<i>I</i>", "Cursiva (Ctrl+I)")}
      ${b("underline", "<u>U</u>", "Subrayado (Ctrl+U)")}${b("strikeThrough", "<s>S</s>", "Tachado")}
      ${b("superscript", "x²", "Superíndice")}${b("subscript", "x₂", "Subíndice")}
    </div>${sep}
    <div class="tb-group">
      <label class="tb-color-wrap" title="Color de texto"><span class="tb-color-icon" style="border-bottom:3px solid #38bdf8" id="tbTxtIco">A</span>
        <input type="color" value="#38bdf8" class="tb-color-input" oninput="document.getElementById('tbTxtIco').style.borderColor=this.value;noteTool('foreColor',this.value)"></label>
      <label class="tb-color-wrap" title="Marcador"><span class="tb-color-icon" style="background:#fde68a;color:#111;padding:0 4px;border-radius:3px">✎</span>
        <input type="color" value="#fde68a" class="tb-color-input" oninput="noteTool('hiliteColor',this.value)"></label>
    </div>${sep}
    <div class="tb-group">
      ${b("justifyLeft", "⫷", "Alinear a la izquierda")}${b("justifyCenter", "≡", "Centrar")}${b("justifyRight", "⫸", "Alinear a la derecha")}${b("justifyFull", "☰", "Justificar")}
    </div>${sep}
    <div class="tb-group">
      ${b("insertUnorderedList", "• —", "Lista con viñetas")}${b("insertOrderedList", "1.", "Lista numerada")}${b("check", "☑", "Lista de verificación")}
      ${b("outdent", "⇤", "Disminuir sangría")}${b("indent", "⇥", "Aumentar sangría")}
    </div>${sep}
    <div class="tb-group">
      ${b("callout", "💡", "Caja destacada (Importante, Definición, Ejemplo, Ojo)")}${b("table", "▦", "Insertar tabla")}${b("hr", "—", "Línea divisoria")}
      ${b("link", "🔗", "Enlace")}${b("date", "📅", "Insertar fecha de hoy")}${b("clear", "⌫", "Quitar formato")}
      ${b("image", "🖼", "Insertar imagen (también puedes pegarla con Ctrl+V o arrastrarla)")}${b("shot", "📸", "Pegar la captura de pantalla que acabas de hacer")}
    </div>${sep}
    <label class="tb-pin-label" title="Fijar apunte"><input type="checkbox" id="n_pinned" ${note?.pinned ? "checked" : ""} style="accent-color:var(--color-accent);width:auto;margin:0"> 📌</label>
  </div>`;
}

let _noteRange = null;
document.addEventListener("selectionchange", () => {
  const ed = document.getElementById("n_editor");
  const sel = window.getSelection();
  if (ed && sel && sel.rangeCount && ed.contains(sel.anchorNode)) _noteRange = sel.getRangeAt(0).cloneRange();
});
function _restoreRange() {
  const ed = document.getElementById("n_editor");
  if (!ed) return false;
  ed.focus();
  if (_noteRange && ed.contains(_noteRange.startContainer)) {
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(_noteRange);
  } else {
    const r = document.createRange(); r.selectNodeContents(ed); r.collapse(false);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
  }
  return true;
}
function _insertHTML(html) { if (_restoreRange()) document.execCommand("insertHTML", false, html); }

function noteTool(tool, arg) {
  if (!_restoreRange()) return;
  const ex = (c, v = null) => document.execCommand(c, false, v);
  switch (tool) {
    case "block":    if (arg) ex("formatBlock", arg === "p" ? "<p>" : `<${arg}>`); break;
    case "font":     if (arg) ex("fontName", arg); break;
    case "size":     if (arg) ex("fontSize", arg); break;
    case "check":    _insertHTML(`<div class="chk"><input type="checkbox"> <span>Tarea</span></div><p><br></p>`); break;
    case "hr":       _insertHTML(`<hr><p><br></p>`); break;
    case "date":     _insertHTML(`<span>${_esc(NoteGuide.today())}</span>&nbsp;`); break;
    case "clear":    ex("removeFormat"); ex("formatBlock", "<p>"); break;
    case "table":    NoteGuide.insertTable(3, 3); break;
    case "callout":  NoteGuide.calloutMenu(); break;
    case "link":     NoteGuide.linkDialog(); break;
    case "image":    if (typeof NoteImages !== "undefined") NoteImages.pick(); break;
    case "shot":     if (typeof NoteImages !== "undefined") NoteImages.shot(); break;
    default:         ex(tool, arg || null);
  }
  NoteGuide.updateCount();
}

// ================================================
// 2) NOTEGUIDE
// ================================================

const NoteGuide = (() => {
  const PPT_KEY = "party_ppts";
  const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const DAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const ABBR = { bdd: "base de datos", bd: "base de datos", ing: "ingenieria", comp: "computacion", prog: "programacion", sw: "software", mat: "matematica", est: "estadistica", fis: "fisica", quim: "quimica" };
  const STOP = new Set(["de", "del", "la", "el", "los", "las", "y", "e", "en", "a", "para", "con"]);

  let S = null; // estado de la sesión de guía

  const today = () => { const d = new Date(); return `${DAYS[d.getDay()]} ${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`; };
  const subjects = () => PartyData.getSubjects().list;
  const pptStore = () => { try { return JSON.parse(localStorage.getItem(PPT_KEY)) || {}; } catch { return {}; } };
  const savePpts = (o) => { try { PartyStore.set(PPT_KEY, o); } catch { showToast("No se pudo guardar la PPT en este navegador.", "warning"); } };
  const pptsOf = (sid) => pptStore()[sid] || [];
  const editor = () => document.getElementById("n_editor");

  // ---------- coincidencia de asignatura al escribir ----------
  const expand = (n) => n.split(" ").map((t) => ABBR[t] || t).join(" ");
  const sig = (n) => n.split(" ").filter((t) => t.length > 2 && !STOP.has(t));
  function matchSubject(text) {
    const nt = _norm(text);
    if (nt.length < 5) return null;
    const typed = sig(nt);
    for (const s of subjects()) {
      if (S.rejected.has(s.id)) continue;
      const variants = [_norm(s.name), expand(_norm(s.name))];
      if (variants.some((v) => v.startsWith(nt) || nt.startsWith(v))) return s;
      if (typed.length >= 2) {
        const vt = variants.flatMap(sig);
        if (typed.every((t) => vt.some((v) => v.startsWith(t) || t.startsWith(v)))) return s;
      }
    }
    return null;
  }

  // ---------- chat ----------
  function say(html, chips = [], who = "bot") {
    S.msgs.push({ who, html, chips, used: false });
    render();
  }
  function render() {
    const log = document.getElementById("gLog");
    if (!log) return;
    log.innerHTML = S.msgs.map((m, i) => `
      <div class="g-msg ${m.who}">
        <div class="g-bubble">${m.html}</div>
        ${m.chips.length && !m.used ? `<div class="g-chips">${m.chips.map((c, j) => `<button type="button" class="g-chip" onclick="NoteGuide.pick(${i},${j})">${c.label}</button>`).join("")}</div>` : ""}
      </div>`).join("");
    log.scrollTop = log.scrollHeight;
  }
  function pick(i, j) {
    const m = S.msgs[i], c = m.chips[j];
    if (!c) return;
    m.used = true;
    S.msgs.push({ who: "user", html: _esc(c.say || c.label.replace(/<[^>]+>/g, "")), chips: [], used: true });
    act(c.act, c.arg);
  }

  // ---------- ciclo de vida ----------
  function open(note) {
    const ed = editor();
    const meta = noteMeta(note);
    S = { msgs: [], subject: null, ppt: null, rejected: new Set(), asked: new Set(), stage: "subject", wait: null,
          noteId: note?.id || "new", dismissed: new Set(), pend: {}, evAsked: new Set() };
    S.events = evLoad(S.noteId);
    if (meta.subjectId) {
      S.subject = subjects().find((s) => s.id === meta.subjectId) || { id: meta.subjectId, name: meta.subjectName };
      S.stage = "action";
    }
    document.getElementById("pane_guia").innerHTML = `
      <div class="g-wrap">
        <div id="gLog" class="g-log" aria-live="polite"></div>
        <form class="g-form" onsubmit="NoteGuide.send(event)">
          <input id="gInput" autocomplete="off" placeholder="Responde o escribe aquí…" aria-label="Mensaje para la guía">
          <button class="btn primary g-send" type="submit" aria-label="Enviar">➤</button>
        </form>
        <p class="g-foot">Modo sin IA: genero desde tus PPT con reglas. Con el LLM conectado, resúmenes más finos.</p>
      </div>
      <input type="file" id="gFile" accept=".pptx" hidden onchange="NoteGuide.onFile(this)">`;
    const title = document.getElementById("n_title");
    let t;
    const check = () => { clearTimeout(t); t = setTimeout(maybeSuggest, 700); };
    title?.addEventListener("input", check);
    let te;
    const evCheck = () => { clearTimeout(te); te = setTimeout(scanEvents, 1300); };
    ed?.addEventListener("input", () => { check(); evCheck(); updateCount(); });
    ed?.addEventListener("change", (e) => { if (e.target.type === "checkbox") e.target.toggleAttribute("checked", e.target.checked); });
    updateCount();
    if (S.stage === "action") {
      say(`Apunte de <b>${_esc(S.subject.name)}</b>. ¿Qué hacemos hoy?`, actionChips());
    } else {
      askSubject();
    }
  }
  function close() { S = null; }

  function askSubject(text) {
    S.stage = "subject";
    const chips = subjects().slice(0, 8).map((s) => ({ label: _esc(s.name), act: "setSubject", arg: s.id }));
    chips.push({ label: "Sin asignatura", act: "noSubject" });
    say(text || `¡Hola! Te voy guiando mientras escribes. <b>¿De qué asignatura es este apunte?</b> Elige o empieza a escribir el nombre.`, chips);
  }

  // sugerencia en vivo mientras se escribe el título o la 1ª línea
  function maybeSuggest() {
    if (!S || S.subject || S.stage !== "subject" || S.wait) return;
    const first = (editor()?.innerText || "").split("\n").find((l) => l.trim()) || "";
    const typed = [document.getElementById("n_title")?.value || "", first];
    for (const txt of typed) {
      const s = matchSubject(txt);
      if (s && !S.asked.has(s.id)) {
        S.asked.add(s.id);
        S.fromEditor = txt === first && !!first;
        S.suggested = s;
        say(`¿Es de tu asignatura <b>${_esc(s.name)}</b>?`, [
          { label: "Sí", act: "yesSubject", arg: s.id }, { label: "No", act: "noMatch", arg: s.id }]);
        return;
      }
    }
  }

  function act(name, arg) {
    switch (name) {
      case "yesSubject":
      case "setSubject": return setSubject(arg, name === "yesSubject");
      case "noMatch":    S.rejected.add(arg); say("Ok. ¿Cuál es entonces?", subjects().map((s) => ({ label: _esc(s.name), act: "setSubject", arg: s.id })).concat([{ label: "Sin asignatura", act: "noSubject" }])); break;
      case "noSubject":  S.stage = "free"; say("Listo, apunte libre. Si después quieres ligarlo a una asignatura, escribe su nombre."); break;
      case "evAdd":      return evAdd(arg);
      case "evSkip":     return evSkip(arg);
      case "evDel":      return evDel(arg, true);
      case "evKeep":     return evDel(arg, false);
      case "ppt":        return askPpt();
      case "usePpt":     return usePpt(arg);
      case "upload":     document.getElementById("gFile")?.click(); break;
      case "paste":      S.wait = "paste"; say("Pega los temas, <b>uno por línea</b>, y envíalos. (Primero escribe el código, ej. “2.1”, en la primera línea si quieres nombrarla.)"); break;
      case "own":        return ownNotes();
      case "insertTopic": return insertTopic(+arg);
      case "topicsIn":   return insertTopics();
      case "summary":    return doSummary();
      case "cards":      return doCards();
      case "vocab":      return doVocab();
      case "changePpt":  return askPpt();
      case "actions":    say("¿Qué hacemos ahora?", actionChips()); break;
    }
  }

  // ---------- paso 1: asignatura → encabezado ----------
  function setSubject(id, fromSuggest) {
    const s = subjects().find((x) => x.id === id);
    if (!s) return;
    S.subject = s;
    const ed = editor();
    const dateStr = today();
    if (ed && !ed.querySelector("[data-note-subject]")) {
      // si lo escrito en el editor era el nombre a medias, lo reemplazamos
      if (fromSuggest && S.fromEditor) {
        const first = [...ed.childNodes].find((n) => (n.textContent || "").trim());
        if (first && sig(_norm(first.textContent)).length && matchSubject_loose(first.textContent, s)) first.remove();
      }
      ed.insertAdjacentHTML("afterbegin",
        `<h2 data-note-subject="${_esc(s.id)}" data-note-subject-name="${_esc(s.name)}">${_esc(s.name)}</h2><p class="note-date">${_esc(dateStr)}</p><p><br></p>`);
    }
    const title = document.getElementById("n_title");
    if (title && (!title.value.trim() || matchSubject_loose(title.value, s))) title.value = `${s.name} · ${dateStr.split(" ").slice(1, 4).join(" ")}`;
    refreshSubjTag();
    say(`Listo ✓ Puse <b>${_esc(s.name)}</b> arriba y debajo la fecha de hoy.`);
    askPpt();
  }
  const matchSubject_loose = (txt, s) => {
    const nt = _norm(txt), v = [_norm(s.name), expand(_norm(s.name))];
    return nt.length >= 3 && v.some((x) => x.startsWith(nt) || nt.startsWith(x));
  };
  function refreshSubjTag() {
    const el = document.getElementById("n_subjtag");
    if (el) el.innerHTML = S?.subject ? `📚 ${_esc(S.subject.name)}${S.ppt ? " · PPT " + _esc(S.ppt.code) : ""}` : "";
  }

  // ---------- paso 2: PPT ----------
  function askPpt() {
    S.stage = "ppt";
    S.wait = "ppt";
    const saved = pptsOf(S.subject.id);
    const chips = saved.map((p, i) => ({ label: `📑 ${_esc(p.code)} · ${_esc(p.name).slice(0, 28)}`, act: "usePpt", arg: i }));
    chips.push({ label: "⬆ Subir PPT (.pptx)", act: "upload" }, { label: "📋 Pegar temas", act: "paste" }, { label: "Ninguna, escribo libre", act: "own" });
    say(`<b>¿Qué PPT está revisando el profesor?</b> Escribe el número (ej. <i>2.1</i>) o elige.`, chips);
  }
  function findPpt(q) {
    const nq = _norm(q).replace(/^ppt\s*/, "");
    if (!nq) return null;
    return pptsOf(S.subject.id).findIndex((p) => _norm(p.code) === nq || _norm(p.code).startsWith(nq + ".") || _norm(p.name).includes(nq));
  }
  function usePpt(i) {
    const p = pptsOf(S.subject.id)[i];
    if (!p) return;
    S.ppt = p; S.wait = null; S.stage = "action";
    setHeaderPpt();
    refreshSubjTag();
    const topics = topicList(p);
    say(`<b>PPT ${_esc(p.code)}</b> · ${topics.length} temas:<ol class="g-topics">${topics.map((t) => `<li>${_esc(t)}</li>`).join("")}</ol>`,
      [{ label: "Insertar temario en el apunte", act: "topicsIn" }]);
    say("¿Qué quieres hacer con esta PPT?", actionChips());
  }
  function setHeaderPpt() {
    const h = editor()?.querySelector("[data-note-subject]");
    if (h && S.ppt) h.setAttribute("data-note-ppt", S.ppt.code);
    const d = editor()?.querySelector(".note-date");
    if (d && S.ppt && !d.textContent.includes("PPT")) d.textContent += ` · PPT ${S.ppt.code}`;
  }
  const topicList = (p) => [...new Set(p.slides.map((s) => s.title).filter(Boolean))];
  const actionChips = () => {
    const c = [{ label: "📝 Escribir mis notas", act: "own" }];
    if (S.ppt) c.push({ label: "🧾 Resumen de la PPT", act: "summary" }, { label: "🃏 Tarjetas de preguntas", act: "cards" }, { label: "📖 Vocabulario", act: "vocab" }, { label: "🔁 Cambiar de PPT", act: "changePpt" });
    else c.push({ label: "📑 Elegir una PPT", act: "ppt" });
    return c;
  };

  // subir / pegar
  async function onFile(inp) {
    const f = inp.files[0]; inp.value = "";
    if (!f) return;
    say(`Leyendo <b>${_esc(f.name)}</b>…`);
    try {
      const slides = await parsePptx(f);
      if (!slides.length) { say("No encontré texto en esa PPT (¿son solo imágenes?). Prueba pegando los temas."); return; }
      const code = (S.pendingCode || (f.name.match(/\d+(?:\.\d+)+/) || [])[0] || "").trim();
      savePptFor(code || f.name.replace(/\.pptx$/i, ""), f.name.replace(/\.pptx$/i, ""), slides);
    } catch (e) { console.error(e); say("No pude leer ese archivo. Debe ser un .pptx (no .ppt antiguo). Puedes pegar los temas a mano."); }
  }
  function savePptFor(code, name, slides) {
    const all = pptStore();
    const list = all[S.subject.id] = all[S.subject.id] || [];
    const i = list.findIndex((p) => _norm(p.code) === _norm(code));
    const item = { code, name, slides };
    if (i >= 0) list[i] = item; else list.push(item);
    savePpts(all);
    usePpt(list.findIndex((p) => p.code === code));
  }
  function pasteTopics(text) {
    const lines = text.split("\n").map((l) => l.replace(/^[\s\-•*\d.)]+/, "").trim()).filter(Boolean);
    let code = S.pendingCode || "";
    const m = (text.split("\n")[0] || "").trim().match(/^(?:ppt\s*)?(\d+(?:\.\d+)+)$/i);
    if (m) { code = m[1]; lines.shift(); }
    if (!lines.length) { say("No vi temas. Escribe uno por línea."); return; }
    S.wait = null;
    savePptFor(code || "Temario " + (pptsOf(S.subject.id).length + 1), "Temario pegado", lines.map((t, i) => ({ n: i + 1, title: t, body: [] })));
  }

  async function parsePptx(file) {
    if (!window.JSZip) {
      await new Promise((ok, no) => { const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
    }
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const num = (n) => +n.match(/slide(\d+)\.xml/)[1];
    const names = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => num(a) - num(b));
    const out = [];
    for (const n of names) {
      const doc = new DOMParser().parseFromString(await zip.file(n).async("string"), "application/xml");
      let title = "", body = [];
      for (const sp of doc.getElementsByTagName("p:sp")) {
        const ph = sp.getElementsByTagName("p:ph")[0];
        const type = ph?.getAttribute("type") || "";
        const paras = [...sp.getElementsByTagName("a:p")].map((p) => [...p.getElementsByTagName("a:t")].map((t) => t.textContent).join("").trim()).filter(Boolean);
        if (!paras.length) continue;
        if (/title/i.test(type) && !title) title = paras.join(" "); else body.push(...paras);
      }
      if (!body.length) body = [...doc.getElementsByTagName("a:t")].map((t) => t.textContent.trim()).filter(Boolean).filter((t) => t !== title);
      if (!title && body.length) title = body.shift();
      if (title || body.length) out.push({ n: num(n), title: title.slice(0, 140), body: body.slice(0, 40) });
    }
    return out;
  }

  // ---------- paso 3: acciones ----------
  function ownNotes() {
    S.stage = "free"; S.wait = null;
    const topics = S.ppt ? topicList(S.ppt) : [];
    say(`Perfecto, escribe tus notas${S.ppt ? ". Si cambian de tema, toca uno para insertarlo como título:" : "."} Yo sigo aquí si necesitas algo.`,
      topics.slice(0, 12).map((t, i) => ({ label: _esc(t).slice(0, 34), act: "insertTopic", arg: i, say: "Tema: " + t })).concat([{ label: "⚙ Otras opciones", act: "actions" }]));
  }
  function insertTopic(i) {
    const t = topicList(S.ppt)[i];
    if (t) append(`<h3>${_esc(t)}</h3><p><br></p>`);
    S.msgs[S.msgs.length - 1] && render();
  }
  function insertTopics() {
    append(`<h3>Temario · PPT ${_esc(S.ppt.code)}</h3><ol>${topicList(S.ppt).map((t) => `<li>${_esc(t)}</li>`).join("")}</ol><p><br></p>`);
    say("Temario insertado al final del apunte ✓");
  }
  const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

  function doSummary() {
    if (!S.ppt) return askPpt();
    const sl = S.ppt.slides;
    const parts = sl.filter((s) => s.title).map((s) => `<h3>${_esc(s.title)}</h3>${s.body.length ? `<ul>${s.body.slice(0, 3).map((b) => `<li>${_esc(clip(b, 160))}</li>`).join("")}</ul>` : ""}`);
    append(`<h2>Resumen · PPT ${_esc(S.ppt.code)}</h2>${parts.join("")}<p><br></p>`);
    const nobody = sl.every((s) => !s.body.length);
    say(`Resumen insertado ✓ (${sl.length} láminas, título + ideas principales).${nobody ? " Como solo tengo los temas, el resumen es el temario; sube la .pptx para más detalle." : ""}`, [{ label: "⚙ Otras opciones", act: "actions" }]);
  }
  function doCards() {
    if (!S.ppt) return askPpt();
    const pairs = S.ppt.slides.filter((s) => s.title && s.body.length).map((s) => [`¿De qué trata «${s.title}»?`, s.body.slice(0, 2).map((b) => clip(b, 200)).join(" · ")]);
    if (!pairs.length) { say("Esta PPT solo tiene títulos, así que no hay respuestas de dónde sacar tarjetas. Sube la .pptx completa.", [{ label: "⬆ Subir PPT (.pptx)", act: "upload" }]); return; }
    append(`<h2>Tarjetas de repaso · PPT ${_esc(S.ppt.code)}</h2><table class="note-table"><thead><tr><th>Pregunta</th><th>Respuesta</th></tr></thead><tbody>${pairs.map(([q, a]) => `<tr><td>${_esc(q)}</td><td>${_esc(a)}</td></tr>`).join("")}</tbody></table><p><br></p>`);
    say(`${pairs.length} tarjetas insertadas ✓ Tapa la columna “Respuesta” y practica.`, [{ label: "⚙ Otras opciones", act: "actions" }]);
  }
  function doVocab() {
    if (!S.ppt) return askPpt();
    const found = new Map();
    const rx = [/^([^:–—]{3,45})\s*[:–—]\s+(.{12,})$/, /^(.{3,45}?)\s+(?:es|son|se define como|se denomina|corresponde a|consiste en)\s+(.{12,})$/i];
    for (const s of S.ppt.slides) for (const b of s.body) for (const r of rx) { const m = b.match(r); if (m && m[1].split(" ").length <= 6 && !found.has(m[1].trim())) { found.set(m[1].trim(), m[2].trim()); break; } }
    if (!found.size) {
      append(`<h2>Vocabulario · PPT ${_esc(S.ppt.code)}</h2><ul>${topicList(S.ppt).map((t) => `<li><b>${_esc(t)}</b>: </li>`).join("")}</ul><p><br></p>`);
      say("No detecté definiciones explícitas en la PPT, así que dejé los temas como lista para que completes cada definición con tus palabras.", [{ label: "⚙ Otras opciones", act: "actions" }]);
      return;
    }
    append(`<h2>Vocabulario · PPT ${_esc(S.ppt.code)}</h2><ul>${[...found].map(([t, d]) => `<li><b>${_esc(t)}</b>: ${_esc(clip(d, 220))}</li>`).join("")}</ul><p><br></p>`);
    say(`${found.size} términos insertados ✓`, [{ label: "⚙ Otras opciones", act: "actions" }]);
  }

  // ---------- chat libre ----------
  function send(e) {
    e.preventDefault();
    const inp = document.getElementById("gInput");
    const text = inp.value.trim();
    if (!text || !S) return;
    inp.value = "";
    S.msgs.push({ who: "user", html: _esc(text), chips: [], used: true });
    const n = _norm(text);
    if (S.wait === "paste") return pasteTopics(text);
    if (!S.subject) {
      const s = matchSubject(text) || subjects().find((x) => _norm(x.name) === n);
      if (s) { S.fromEditor = false; return setSubject(s.id, false); }
      return say("No encontré esa asignatura entre las tuyas. Elige una o agrégala en <b>Mis Asignaturas</b>.", subjects().slice(0, 8).map((x) => ({ label: _esc(x.name), act: "setSubject", arg: x.id })).concat([{ label: "Sin asignatura", act: "noSubject" }]));
    }
    if (/\b(resumen|resumir)\b/.test(n)) return doSummary();
    if (/tarjeta|flash|pregunta/.test(n)) return doCards();
    if (/vocab|gloss|termino|palabras/.test(n)) return doVocab();
    if (/fecha|hoy/.test(n)) { append(`<p>${_esc(today())}</p>`); return say("Fecha insertada ✓"); }
    if (S.wait === "ppt" || /ppt|clase|unidad|\d+\.\d+/.test(n)) {
      const m = n.match(/\d+(?:\.\d+)+/);
      const q = m ? m[0] : text;
      const i = findPpt(q);
      if (i >= 0) return usePpt(i);
      S.pendingCode = m ? m[0] : "";
      return say(`No tengo la PPT <b>${_esc(q)}</b> de ${_esc(S.subject.name)} todavía. Súbela o pega sus temas y la dejo guardada para la próxima clase.`,
        [{ label: "⬆ Subir PPT (.pptx)", act: "upload" }, { label: "📋 Pegar temas", act: "paste" }, { label: "Escribo libre", act: "own" }]);
    }
    say("No te entendí del todo. Puedo:", actionChips());
  }

  // ================================================
  // FECHAS DE PRUEBAS → CALENDARIO
  // "prueba 24 de octubre" → pregunta si se agrega al calendario;
  // si esa fecha se borra del apunte → pregunta si se quita del calendario.
  // ================================================
  const EV_KEY = "party_note_events";
  const evAll = () => { try { return JSON.parse(localStorage.getItem(EV_KEY)) || {}; } catch { return {}; } };
  const evLoad = (id) => evAll()[id] || [];
  const evSave = () => { if (!S) return; const a = evAll(); a[S.noteId] = S.events; try { PartyStore.set(EV_KEY, a); } catch {} };
  const EV_KINDS = [
    ["prueba", /\b(prueba|examen|certamen|solemne|control|quiz|test|evaluaci[oó]n)\b/i, "Prueba"],
    ["entrega", /\b(entrega|informe|trabajo)\b/i, "Entrega"],
    ["reunion", /\b(reuni[oó]n)\b/i, "Reunión"],
    ["general", /\b(fecha)\b/i, "Evento"],
  ];
  const MONTHS_RX = "(ene(?:ro)?|feb(?:rero)?|mar(?:zo)?|abr(?:il)?|may(?:o)?|jun(?:io)?|jul(?:io)?|ago(?:sto)?|sep(?:t(?:iembre)?|tiembre)?|set(?:iembre)?|oct(?:ubre)?|nov(?:iembre)?|dic(?:iembre)?)";
  const MON = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12 };

  function dateIso(d, m, y) {
    const now = new Date(); let year = y ? (+y < 100 ? 2000 + +y : +y) : now.getFullYear();
    if (+m < 1 || +m > 12 || +d < 1 || +d > 31) return null;
    let dt = new Date(year, +m - 1, +d);
    if (dt.getMonth() !== +m - 1) return null; // 31 de febrero, etc.
    if (!y && dt < new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30)) dt = new Date(year + 1, +m - 1, +d);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  }
  // [{kind, label, iso}] encontrados en el texto del apunte (misma línea: palabra clave + fecha)
  function findMentions(text) {
    const out = [], seen = new Set();
    const rxA = new RegExp("\\b(\\d{1,2})\\s*(?:de\\s+)?" + MONTHS_RX + "\\b(?:\\s*(?:de|del)?\\s*(\\d{4}))?", "gi");
    const rxB = /\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/g;
    text.split(/\n+/).forEach((line) => {
      const dates = [];
      let m;
      rxA.lastIndex = 0; while ((m = rxA.exec(line))) { const iso = dateIso(m[1], MON[m[2].toLowerCase().slice(0, 3)], m[3]); if (iso) dates.push({ iso, at: m.index }); }
      rxB.lastIndex = 0; while ((m = rxB.exec(line))) { const iso = dateIso(m[1], m[2], m[3]); if (iso) dates.push({ iso, at: m.index }); }
      dates.forEach((d) => {
        const kw = EV_KINDS.map(([k, rx, label]) => { const f = line.match(rx); return f ? { k, label, dist: Math.abs(f.index - d.at) } : null; }).filter((x) => x && x.dist <= 70).sort((a, b) => a.dist - b.dist)[0];
        if (!kw) return;
        const key = kw.k + "|" + d.iso;
        if (!seen.has(key)) { seen.add(key); out.push({ kind: kw.k, label: kw.label, iso: d.iso }); }
      });
    });
    return out;
  }
  const longDate = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });

  function scanEvents() {
    if (!S) return;
    const ms = findMentions(editor()?.innerText || "");
    // 1) fechas nuevas → ofrecer agregarlas
    ms.forEach((m) => {
      const key = m.kind + "|" + m.iso;
      if (S.events.some((e) => e.kind === m.kind && e.iso === m.iso) || S.dismissed.has(key) || S.evAsked.has(key)) return;
      S.evAsked.add(key); S.pend[key] = m;
      say(`Detecté una <b>${m.label.toLowerCase()}</b> para el <b>${_esc(longDate(m.iso))}</b>. ¿La agrego al calendario?`,
        [{ label: "Sí, agregar", act: "evAdd", arg: key }, { label: "No", act: "evSkip", arg: key }]);
    });
    // 2) fechas ligadas que ya no están en el apunte → ofrecer quitarlas
    S.events.forEach((e) => {
      const key = "del|" + e.eventId;
      if (ms.some((m) => m.kind === e.kind && m.iso === e.iso) || S.evAsked.has(key)) return;
      S.evAsked.add(key);
      say(`Borraste la fecha de la <b>${_esc(e.label.toLowerCase())}</b> (${_esc(longDate(e.iso))}). ¿La quito también del calendario?`,
        [{ label: "Sí, quitarla", act: "evDel", arg: e.eventId }, { label: "No, dejarla", act: "evKeep", arg: e.eventId }]);
    });
  }
  const refreshCalendar = async () => {
    try { PartyData.invalidate && PartyData.invalidate(); if (typeof loadEvents === "function") { await loadEvents(); if (typeof renderCalendar === "function") renderCalendar(); if (typeof renderEventList === "function") renderEventList(); } } catch (e) { console.warn(e); }
  };
  async function evAdd(key) {
    const m = S.pend[key]; if (!m) return;
    const gid = getState().selected.groupId;
    if (!gid || typeof supabaseClient === "undefined") return say("Para guardar eventos en el calendario tienes que estar dentro de un grupo.");
    const student = JSON.parse(localStorage.getItem("active_student") || "null");
    const subj = S.subject ? S.subject.name.replace(/_\s*\d{3}[A-Za-z]?\s*$/, "").trim() : (document.getElementById("n_title")?.value.trim() || "");
    const title = subj ? `${m.label} · ${subj}` : m.label;
    const id = uid("ev");
    const { error } = await supabaseClient.from("events").insert([{
      id, group_id: gid, owner_id: student?._dev_mode ? null : student?.id, title,
      event_date: `${m.iso}T12:00:00+00:00`, type: m.kind, description: "Agregado desde un apunte",
    }]);
    if (error) { console.error(error); return say("No pude guardar el evento. Inténtalo de nuevo."); }
    S.events.push({ eventId: id, kind: m.kind, label: m.label, iso: m.iso, title }); evSave();
    refreshCalendar();
    say(`Listo ✓ Agregué <b>${_esc(title)}</b> al calendario el ${_esc(longDate(m.iso))}.`);
  }
  function evSkip(key) { S.dismissed.add(key); say("Ok, no la agrego."); }
  async function evDel(eventId, remove) {
    const e = S.events.find((x) => x.eventId === eventId); if (!e) return;
    if (remove) {
      const { error } = await supabaseClient.from("events").delete().eq("id", eventId);
      if (error) { console.error(error); return say("No pude quitarla del calendario."); }
      say(`Quité <b>${_esc(e.title)}</b> del calendario ✓`);
      refreshCalendar();
    } else say("Ok, la dejo en el calendario.");
    S.events = S.events.filter((x) => x.eventId !== eventId); evSave();
  }
  // un apunte nuevo recibe su id al guardarse: pasamos las fechas ligadas
  function noteSaved(id) { if (!S) return; const a = evAll(); delete a["new"]; S.noteId = id; a[id] = S.events; try { PartyStore.set(EV_KEY, a); } catch {} }

  // ---------- editor ----------
  function append(html) {
    const ed = editor();
    if (!ed) return;
    ed.insertAdjacentHTML("beforeend", html);
    ed.scrollTop = ed.scrollHeight;
    updateCount();
  }
  function updateCount() {
    const el = document.getElementById("n_count");
    if (!el) return;
    const w = (editor()?.innerText || "").trim().split(/\s+/).filter(Boolean).length;
    el.textContent = `${w} palabra${w === 1 ? "" : "s"}`;
  }

  // ---------- herramientas con diálogo ----------
  function insertTable(r, c) {
    const row = (tag) => `<tr>${Array.from({ length: c }, () => `<${tag}>&nbsp;</${tag}>`).join("")}</tr>`;
    _insertHTML(`<table class="note-table"><thead>${row("th")}</thead><tbody>${Array.from({ length: r - 1 }, () => row("td")).join("")}</tbody></table><p><br></p>`);
  }
  function calloutMenu() {
    const kinds = { imp: ["❗", "Importante"], def: ["📘", "Definición"], ex: ["🧪", "Ejemplo"], warn: ["⚠️", "Ojo"] };
    Party.modal({
      title: "Caja destacada",
      html: `<div class="g-chips" style="margin:6px 0">${Object.entries(kinds).map(([k, [i, l]]) => `<label style="display:inline-flex;gap:6px;align-items:center;margin:0"><input type="radio" name="clk" value="${k}" ${k === "imp" ? "checked" : ""} style="width:auto;margin:0">${i} ${l}</label>`).join("")}</div>`,
      confirm: "Insertar",
      onConfirm: (ov) => {
        const k = ov.querySelector("input[name=clk]:checked").value;
        _insertHTML(`<blockquote class="cl cl-${k}"><b>${kinds[k][0]} ${kinds[k][1]}:</b> </blockquote><p><br></p>`);
      },
    });
  }
  function linkDialog() {
    Party.modal({
      title: "Insertar enlace",
      html: `<label>Dirección (URL)</label><input id="lkUrl" placeholder="https://…">`,
      confirm: "Insertar",
      onConfirm: (ov) => {
        let u = ov.querySelector("#lkUrl").value.trim();
        if (!u) return false;
        if (!/^https?:\/\//i.test(u)) u = "https://" + u;
        if (_restoreRange()) {
          const sel = window.getSelection();
          if (sel.isCollapsed) document.execCommand("insertHTML", false, `<a href="${_esc(u)}" target="_blank" rel="noopener">${_esc(u)}</a>`);
          else document.execCommand("createLink", false, u);
        }
      },
    });
  }

  return { open, close, pick, send, onFile, today, insertTable, calloutMenu, linkDialog, updateCount, noteSaved, findMentions };
})();

// ---------- metadatos del apunte (asignatura / PPT) ----------
function noteMeta(note) {
  if (!note?.content) return {};
  const d = new DOMParser().parseFromString(note.content, "text/html");
  const h = d.querySelector("[data-note-subject]");
  return h ? { subjectId: h.getAttribute("data-note-subject"), subjectName: h.getAttribute("data-note-subject-name") || h.textContent, ppt: h.getAttribute("data-note-ppt") } : {};
}

function noteSideTab(pane) {
  document.querySelectorAll(".side-tab").forEach((b) => b.classList.toggle("active", b.dataset.pane === pane));
  document.querySelectorAll(".side-pane").forEach((p) => p.classList.toggle("active", p.id === "pane_" + pane));
}
