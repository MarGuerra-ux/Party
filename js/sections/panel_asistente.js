// ================================================
// PANEL_ASISTENTE.JS — Chat IA de Party
// Conversaciones guardadas en Supabase (party_docs), con copia local.
// Ruta directa (reglas + Supabase) primero; el LLM queda
// reservado para lo que las reglas no resuelven.
// ================================================

const CONV_KEY = "party_conversations";
let _convs = [], _activeConv = null;

function loadConvs() {
  try { _convs = JSON.parse(localStorage.getItem(CONV_KEY) || "[]"); } catch { _convs = []; }
}
function saveConvs() {
  if (typeof PartyStore !== "undefined") PartyStore.set(CONV_KEY, _convs.slice(0, 30)); else try { localStorage.setItem(CONV_KEY, JSON.stringify(_convs.slice(0, 30))); } catch {}
}
const curConv = () => _convs.find((c) => c.id === _activeConv);

function newConv() {
  const c = { id: "c_" + Date.now(), title: "Nueva conversación", messages: [], at: Date.now() };
  _convs.unshift(c);
  _activeConv = c.id;
  saveConvs();
  return c;
}

function initAsistente() {
  const wrap = document.getElementById("asistenteWrap");
  if (!wrap) return;
  const P = Party;
  loadConvs();
  if (!_convs.length) newConv();
  if (!curConv()) _activeConv = _convs[0].id;

  wrap.innerHTML = `
    <div class="chat-layout">
      <aside class="p-card chat-side">
        <button class="btn primary full" id="newChatBtn" style="margin:0">${P.icon("plus")} Nueva conversación</button>
        <div class="conv-list" id="convList"></div>
        <p style="font-size:11.5px;color:var(--color-muted);margin:6px 0 0" id="ruleStats"></p>
      </aside>
      <section class="p-card">
        <div class="card-head"><h3>${P.icon("sparkles")}Chat IA <span class="ia-badge">PARTY</span></h3></div>
        <div class="chat-box">
          <div class="chat-log" id="chatLog" aria-live="polite"></div>
          <div id="agentMeter" class="agent-meter" aria-live="polite"></div>
          <label class="agent-mode" title="Cómo se orquesta la IA cuando una pregunta necesita un modelo. Las reglas internas siempre responden primero, con 0 tokens.">
            Orquestación de la IA:
            <select id="agentMode">${Object.entries(PartyAgent.MODOS).map(([k, v]) => `<option value="${k}" ${PartyAgent.getMode() === k ? "selected" : ""}>${P.esc(v)}</option>`).join("")}</select>
            Memoria:
            <select id="agentMemory" title="Cómo recuerda la conversación: todo, solo los últimos turnos, o un resumen">${Object.entries(PartyAgent.MEMORIAS).map(([k, v]) => `<option value="${k}" ${PartyAgent.getMemory() === k ? "selected" : ""}>${P.esc(v)}</option>`).join("")}</select>
          </label>
          <div class="chips" style="margin:0 0 10px">
            ${[["¿Qué tengo esta semana?"], ["Tareas pendientes"], ["Próximas evaluaciones"], ["Resumen de mis asignaturas"], ["Ayuda"]]
              .map(([t]) => `<button class="chip" data-q="${P.esc(t)}">${P.esc(t)}</button>`).join("")}
          </div>
          <form class="chat-compose" id="chatForm" autocomplete="off">
            <button type="button" class="btn-ghost" id="chatAttach" title="Adjuntar foto, PDF o Word" aria-label="Adjuntar archivo" style="padding:0 14px;flex-shrink:0">📎</button>
            <input id="chatInput" placeholder="Escribe tu consulta o adjunta un archivo..." aria-label="Mensaje">
            <input id="chatFile" type="file" accept="image/*,.pdf,.docx,.txt,.pptx" multiple hidden>
            <button class="send" type="submit" aria-label="Enviar">${P.icon("send")}</button>
          </form>
        </div>
      </section>
    </div>`;

  renderConvList();
  renderChat();
  refreshMeter();
  if (typeof PartyStore !== "undefined") PartyStore.pull(CONV_KEY).then((ch) => {
    if (!ch || !document.getElementById("convList")) return;
    loadConvs(); if (!_convs.length) newConv(); if (!curConv()) _activeConv = _convs[0].id;
    renderConvList(); renderChat();
  });

  wrap.querySelector("#newChatBtn").addEventListener("click", () => { newConv(); renderConvList(); renderChat(); });
  wrap.querySelector("#convList").addEventListener("click", (e) => {
    const del = e.target.closest("[data-del]");
    if (del) {
      _convs = _convs.filter((c) => c.id !== del.dataset.del);
      if (!_convs.length) newConv();
      _activeConv = _convs[0].id;
      saveConvs(); renderConvList(); renderChat();
      return;
    }
    const it = e.target.closest("[data-conv]");
    if (it) { _activeConv = it.dataset.conv; renderConvList(); renderChat(); }
  });
  wrap.querySelectorAll("[data-q]").forEach((b) => b.addEventListener("click", () => sendChat(b.dataset.q)));
  wrap.querySelector("#chatForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const inp = wrap.querySelector("#chatInput");
    const v = inp.value.trim();
    if (!v) return;
    inp.value = "";
    sendChat(v);
  });
  wrap.querySelector("#chatLog").addEventListener("click", onChatAction);
  wrap.querySelector("#chatAttach").addEventListener("click", () => wrap.querySelector("#chatFile").click());
  wrap.querySelector("#agentMode")?.addEventListener("change", (e) => PartyAgent.setMode(e.target.value));
  wrap.querySelector("#agentMemory")?.addEventListener("change", (e) => PartyAgent.setMemory(e.target.value));
  wrap.querySelector("#chatFile").addEventListener("change", (e) => { const f = [...e.target.files]; e.target.value = ""; if (f.length) attachFiles(f); });
  const box = wrap.querySelector(".chat-box");
  ["dragover", "dragenter"].forEach((ev) => box.addEventListener(ev, (e) => e.preventDefault()));
  box.addEventListener("drop", (e) => { e.preventDefault(); const f = [...e.dataTransfer.files]; if (f.length) attachFiles(f); });

  // Consulta o texto que llegó desde el dashboard
  const q = localStorage.getItem("party_assistant_query");
  const pre = localStorage.getItem("party_assistant_prefill");
  localStorage.removeItem("party_assistant_query");
  localStorage.removeItem("party_assistant_prefill");
  if (q) sendChat(q);
  else if (pre) { const inp = wrap.querySelector("#chatInput"); inp.value = pre; inp.focus(); }
}

function renderConvList() {
  const el = document.getElementById("convList");
  if (!el) return;
  el.innerHTML = _convs.map((c) => `
    <button class="conv-item ${c.id === _activeConv ? "active" : ""}" data-conv="${c.id}">
      ${Party.icon("chat")}<span>${Party.esc(c.title)}</span>
      <span class="kebab" data-del="${c.id}" title="Eliminar" style="flex:none">${Party.icon("trash")}</span>
    </button>`).join("");
  const rules = _convs.reduce((n, c) => n + c.messages.filter((m) => m.role === "bot" && m.source === "rules").length, 0);
  const toks = _convs.reduce((n, c) => n + c.messages.reduce((a, m) => a + (m.tokens || 0), 0), 0);
  const st = document.getElementById("ruleStats");
  if (st) st.innerHTML = `Respuestas sin IA (reglas + Supabase): <b>${rules}</b><br>Tokens usados en estas conversaciones: <b>${toks.toLocaleString("es-CL")}</b>`;
  if (st && typeof PartyAgent !== "undefined" && !renderConvList._busy) {
    renderConvList._busy = true;
    PartyAgent.stats().then((x) => { renderConvList._busy = false; const el = document.getElementById("ruleStats"); if (x && el && x.total) el.innerHTML += `<br>Total guardado en Supabase: <b>${x.pct}%</b> de ${x.total} consultas sin tokens`; }).catch(() => { renderConvList._busy = false; });
  }
}

function renderChat() {
  const log = document.getElementById("chatLog");
  if (!log) return;
  const c = curConv();
  if (!c.messages.length) {
    const g = window.PartySchedule ? PartySchedule.greeting() : null;
    log.innerHTML = `<div class="msg bot">${g || `¡Hola, ${Party.esc(Party.firstName())}!`} Pregúntame por tu semana, tus tareas o tus evaluaciones; también puedes adjuntar una foto, PDF o Word con el clip 📎. Escribe <b>ayuda</b> para ver todo lo que puedo hacer sin gastar IA.</div>`;
    return;
  }
  log.innerHTML = c.messages.map((m) => m.role === "user"
    ? `<div class="msg user">${Party.esc(m.text)}</div>`
    : `<div class="msg bot">${m.html}${m.acciones?.length && !m.accionesHechas ? PartyAgent.actionsHTML(m.acciones, m.key || "m") : ""}${m.source === "rules" ? `<span class="src">⚡ 0 tokens usados · Respondí con reglas internas</span>` : ""}</div>`).join("");
  log.scrollTop = log.scrollHeight;
}

async function sendChat(text) {
  const c = curConv();
  c.messages.push({ role: "user", text });
  if (c.title === "Nueva conversación") c.title = text.slice(0, 32);
  renderChat();
  const log = document.getElementById("chatLog");
  log.insertAdjacentHTML("beforeend", `<div class="msg bot" id="typing">Pensando…</div>`);
  log.scrollTop = log.scrollHeight;

  const res = await Party.assistant.route(text);
  document.getElementById("typing")?.remove();

  if (res) {
    c.messages.push({ role: "bot", html: res.html, source: res.source, intent: res.intent });
    PartyAgent.noteRules();
  } else {
    // Sin regla que lo resuelva: el agente decide qué modelo usar y PIDE PERMISO antes de gastar tokens.
    const pl = await PartyAgent.plan(text);
    if (pl.kind === "rules") c.messages.push({ role: "bot", html: pl.html, source: "rules", intent: "AGENT_RULES" });
    else if (pl.kind === "confirm") c.messages.push({ role: "bot", html: pl.html, source: "agent-pending", planId: pl.plan.plan_id });
    else if (pl.kind === "auto") { c.messages.push({ role: "bot", html: "Pensando…", source: "agent-pending", planId: pl.plan.plan_id }); await runAgent(c, c.messages[c.messages.length - 1], true); }
    else if (pl.kind === "nocupo") c.messages.push({ role: "bot", html: pl.html, source: "agent-error" });
    else if (pl.kind === "offline") c.messages.push({ role: "bot", source: "agent-offline", html: `Esta consulta necesita un modelo de IA y el agente está apagado. Enciéndelo con <code>agent/iniciar.bat</code> (o <code>iniciar.sh</code>). Mientras tanto resuelvo con reglas lo que puedo: escribe <b>ayuda</b>.` });
    else c.messages.push({ role: "bot", html: pl.html, source: "agent-error" });
  }
  c.at = Date.now();
  saveConvs();
  renderConvList();
  renderChat();
}

async function refreshMeter() {
  const el = document.getElementById("agentMeter");
  if (el) el.innerHTML = await PartyAgent.meterHTML();
}
async function runAgent(c, m, aprobado) {
  const r = await PartyAgent.run(m.planId, aprobado);
  m.html = r.html; m.tokens = r.tokens || 0; m.source = r.cancelado ? "agent-cancel" : "agent"; m.acciones = r.acciones; m.key = "k" + Date.now();
  saveConvs(); renderConvList(); renderChat(); refreshMeter();
}

async function onChatAction(e) {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const c = curConv();
  if (b.dataset.act === "agent-use" || b.dataset.act === "agent-no") {
    const m = c.messages.find((x) => x.planId === b.dataset.plan);
    if (m) { b.disabled = true; m.html = b.dataset.act === "agent-use" ? "Consultando al modelo…" : m.html; renderChat(); await runAgent(c, m, b.dataset.act === "agent-use"); }
    return;
  }
  if (b.dataset.act === "agent-add") {
    const m = c.messages.find((x) => x.key === b.dataset.key);
    const a = m?.acciones?.[+b.dataset.i];
    if (a) {
      b.disabled = true;
      const r = await PartyAgent.addEvent(a);
      b.parentElement.innerHTML = r.html;
      a.hecho = true; if (m.acciones.every((x) => x.hecho)) m.accionesHechas = true;
      saveConvs();
    }
    return;
  }
  const last = () => [...c.messages].reverse().find((m) => m.html && m.html.includes(b.dataset.act));
  if (b.dataset.act === "cancel-task") {
    const m = last(); if (m) m.html = "Listo, no creé la tarea.";
  }
  if (b.dataset.act === "confirm-task") {
    b.disabled = true;
    const r = await Party.assistant.confirmCreateTask(b.dataset.title);
    const m = last(); if (m) { m.html = r.html; m.source = "rules"; }
  }
  saveConvs();
  renderChat();
}

// ---------- adjuntar archivos al chat ----------
const chatUI = {
  say(html, chips) {
    const c = curConv();
    c.messages.push({ role: "bot", html: html + PartySchedule.chipHTML(PartySchedule.chipsOf(chips)), source: "rules" });
    saveConvs(); renderChat();
  },
  status(t) {
    document.getElementById("schedStatus")?.remove();
    const log = document.getElementById("chatLog");
    if (t && log) { log.insertAdjacentHTML("beforeend", `<div class="msg bot" id="schedStatus"><i>${Party.esc(t)}</i></div>`); log.scrollTop = log.scrollHeight; }
  },
};
// Varios archivos, o uno cuyo nombre empieza con un número tipo 2.1.1, son material de clases:
// se pregunta asignatura y experiencia y se guardan en la Biblioteca. Un solo archivo "normal" se lee como horario.
const MATERIAL_RE = /^\s*\d{1,2}(\.\d{1,3})+/;
async function attachFiles(files) {
  if (files.length === 1 && !MATERIAL_RE.test(files[0].name)) return attachToChat(files[0]);
  const c = curConv();
  c.messages.push({ role: "user", text: "📎 " + files.map((f) => f.name).join(" · ") });
  if (c.title === "Nueva conversación") c.title = "Material de clases";
  saveConvs(); renderChat();
  await Lib.ingest(files, { ui: chatUI });
}
async function attachToChat(file) {
  const c = curConv();
  c.messages.push({ role: "user", text: "📎 " + file.name });
  if (c.title === "Nueva conversación") c.title = file.name.slice(0, 32);
  saveConvs(); renderChat();
  await PartySchedule.handleFile(file, chatUI);
}
