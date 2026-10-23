// ================================================
// PANEL_ASIGNATURAS.JS — Mis asignaturas y su avance
// Se guardan en este navegador (localStorage).
// ================================================

const SUBJECT_ICONS = { book: "Libro", database: "Base de datos", code: "Programación", sigma: "Matemática", network: "Redes", chart: "Estadística", cap: "General", palette: "Diseño" };
const SUBJECT_COLORS = { violet: "Violeta", blue: "Azul", green: "Verde", teal: "Turquesa", pink: "Rosa", amber: "Ámbar" };

function initAsignaturas() { renderAsignaturas(); }

function renderAsignaturas() {
  const wrap = document.getElementById("asignaturasWrap");
  if (!wrap) return;
  const P = Party, esc = P.esc;
  const { list, sample } = PartyData.getSubjects();

  const tiles = list.map((s) => `
    <article class="p-card" style="--c:${PartyData.subjectColors[s.color] || PartyData.subjectColors.violet}">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
        <span class="file-ico" style="width:44px;height:44px;--c:var(--c)">${P.icon(s.icon || "book")}</span>
        <div style="flex:1;min-width:0"><div style="font-weight:800;overflow-wrap:break-word;word-break:normal;hyphens:auto;line-height:1.25;font-size:14px">${esc(s.name).replace(/_/g, "_<wbr>")}</div>
          <div style="font-size:12px;color:var(--color-muted)">Avance del semestre</div></div>
        <span style="font-size:20px;font-weight:800;color:var(--c);flex-shrink:0">${s.pct}%</span>
      </div>
      <div class="progress"><i style="width:${s.pct}%"></i></div>
      <div style="display:flex;gap:6px;margin-top:14px;flex-wrap:wrap;align-items:center">
        <button class="btn-ghost" style="padding:6px 9px;font-size:12px;gap:5px" onclick="bumpAsignatura('${s.id}',-10)" aria-label="Restar 10%">${P.icon("minus")}10%</button>
        <button class="btn-ghost" style="padding:6px 9px;font-size:12px;gap:5px" onclick="bumpAsignatura('${s.id}',10)" aria-label="Sumar 10%">${P.icon("plus")}10%</button>
        <span style="display:flex;gap:6px;margin-left:auto">
          <button class="btn-ghost" style="padding:6px 8px" onclick="renameAsignatura('${s.id}')" aria-label="Renombrar" title="Renombrar">${P.icon("pencil")}</button>
          <button class="btn-ghost" style="padding:6px 8px;color:var(--color-danger)" onclick="deleteAsignatura('${s.id}')" aria-label="Eliminar" title="Eliminar">${P.icon("trash")}</button>
        </span>
      </div>
    </article>`).join("");

  wrap.innerHTML = `
    <div class="lib">
      <div class="lib-main">
        <div class="card-head" style="margin-bottom:4px">
          <div><h3 style="font-size:18px">${P.icon("book")}Mis asignaturas</h3>
            ${sample ? `<p style="margin:4px 0 0;font-size:12.5px;color:var(--color-muted)">Estas son asignaturas de ejemplo. Sube tu horario o agrega las tuyas: se guardan en este navegador.</p>` : ""}</div>
          <button class="btn primary" style="margin:0" onclick="addAsignatura()">${P.icon("plus")} Nueva asignatura</button>
        </div>
        <div class="grid asig-grid">${tiles || `<div class="empty">Todavía no tienes asignaturas. Sube tu horario con el asistente o agrega la primera.</div>`}</div>
      </div>
      <aside class="lib-chat" id="asigDrop">
        <div class="g-wrap">
          <div class="lib-chat-title">${P.icon("sparkles")} Asistente de horario</div>
          <div id="asigLog" class="g-log" aria-live="polite"></div>
          <form class="g-form" onsubmit="asigSend(event)">
            <button type="button" class="btn secondary g-send" title="Adjuntar foto, PDF o Word" aria-label="Adjuntar archivo" onclick="document.getElementById('asigFile').click()" style="margin:0">📎</button>
            <input id="asigInput" autocomplete="off" placeholder="Adjunta tu horario o escribe…" aria-label="Mensaje">
            <button class="btn primary g-send" type="submit" aria-label="Enviar">➤</button>
          </form>
          <input id="asigFile" type="file" accept="image/*,.pdf,.docx,.txt" hidden onchange="asigFile(this)">
        </div>
      </aside>
    </div>`;
  const drop = document.getElementById("asigDrop");
  ["dragover", "dragenter"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("drop"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove("drop")));
  drop.addEventListener("drop", (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) asigHandle(f); });
  if (!_asigMsgs.length) asigIntro();
  drawAsigChat();
}

// ---------- asistente de horario (chat) ----------
let _asigMsgs = [], _asigStatus = "";
const asigUI = {
  say(html, chips) { _asigMsgs.push({ who: "bot", html, chips: PartySchedule.chipsOf(chips) }); drawAsigChat(); },
  status(t) { _asigStatus = t || ""; drawAsigChat(); },
};
function drawAsigChat() {
  const log = document.getElementById("asigLog");
  if (!log) return;
  log.innerHTML = _asigMsgs.map((m) => `<div class="g-msg ${m.who}"><div class="g-bubble">${m.html}${m.who === "bot" ? PartySchedule.chipHTML(m.chips) : ""}</div></div>`).join("")
    + (_asigStatus ? `<div class="g-msg bot"><div class="g-bubble"><i>${Party.esc(_asigStatus)}</i></div></div>` : "");
  log.scrollTop = log.scrollHeight;
}
function asigIntro() {
  const g = PartySchedule.greeting();
  const pick = () => document.getElementById("asigFile")?.click();
  if (g) asigUI.say(`${g}<br>Ya tengo tu horario. Si cambió, sube el nuevo y lo actualizo.`, [{ label: "Subir un horario nuevo", fn: pick }]);
  else asigUI.say(`Sube una <b>foto, PDF o Word</b> de tu horario (el boletín de carga académica de Duoc UC) y lo leo por ti: creo tus asignaturas, sus carpetas y cuadernos de apuntes.`, [{ label: "📎 Subir mi horario", fn: pick }]);
}
function asigFile(inp) { const f = inp.files[0]; inp.value = ""; if (f) asigHandle(f); }
function asigHandle(f) {
  _asigMsgs.push({ who: "user", html: "📎 " + Party.esc(f.name), chips: [] });
  drawAsigChat();
  PartySchedule.handleFile(f, asigUI);
}
function asigSend(e) {
  e.preventDefault();
  const inp = document.getElementById("asigInput"), t = inp.value.trim();
  if (!t) return;
  inp.value = "";
  _asigMsgs.push({ who: "user", html: Party.esc(t), chips: [] });
  const r = PartySchedule.answer(t) || (/semana/i.test(t) && PartySchedule.hasSchedule() ? { html: PartySchedule.weekHTML([], /pr[oó]xima|siguiente|que viene/i.test(t)) } : null);
  asigUI.say(r ? r.html : "Puedo leer tu horario si adjuntas la foto, el PDF o el Word con el clip 📎. También puedes preguntarme “¿qué tengo hoy?” o “mi horario”.");
}

function addAsignatura() {
  const opt = (obj) => Object.entries(obj).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
  Party.modal({
    title: "Nueva asignatura",
    html: `<label>Nombre</label><input id="asName" maxlength="80" placeholder="Ej: Estructuras de Datos">
           <label>Color</label><select id="asColor">${opt(SUBJECT_COLORS)}</select>
           <label>Ícono</label><select id="asIcon">${opt(SUBJECT_ICONS)}</select>
           <label>Avance actual (%)</label><input id="asPct" type="number" min="0" max="100" value="0">`,
    confirm: "Agregar",
    onConfirm: (ov) => {
      const name = ov.querySelector("#asName").value.trim();
      if (!name) { showToast("Escribe un nombre.", "warning"); return false; }
      const cur = PartyData.getSubjects();
      const list = cur.sample ? [] : cur.list;
      list.push({
        id: "s_" + Date.now(), name,
        color: ov.querySelector("#asColor").value, icon: ov.querySelector("#asIcon").value,
        pct: Math.max(0, Math.min(100, parseInt(ov.querySelector("#asPct").value, 10) || 0)),
      });
      PartyData.saveSubjects(list);
      renderAsignaturas();
      showToast("Asignatura agregada ✓", "success");
      const created = list[list.length - 1];
      if (typeof Lib !== "undefined") setTimeout(() => Lib.afterSubjectCreated(created), 60);
    },
  });
}

function renameAsignatura(id) {
  const list = PartyData.getSubjects().list;
  const s = list.find((x) => x.id === id);
  if (!s) return;
  Party.modal({
    title: "Renombrar asignatura",
    html: `<label>Nombre</label><input id="asRen" maxlength="80" value="${Party.esc(s.name)}">`,
    confirm: "Guardar",
    onConfirm: (ov) => {
      const v = ov.querySelector("#asRen").value.trim();
      if (!v) return false;
      s.name = v;
      PartyData.saveSubjects(list);
      renderAsignaturas();
    },
  });
}

function bumpAsignatura(id, delta) {
  const list = PartyData.getSubjects().list;
  const s = list.find((x) => x.id === id);
  if (!s) return;
  s.pct = Math.max(0, Math.min(100, s.pct + delta));
  PartyData.saveSubjects(list);
  renderAsignaturas();
}

function deleteAsignatura(id) {
  PartyData.saveSubjects(PartyData.getSubjects().list.filter((x) => x.id !== id));
  renderAsignaturas();
}
