// ================================================
// panel_agentes_ia.js — Centro de control de los agentes de IA
//   · Conectar / desconectar el agente (vía el lanzador local, puerto 8786)
//   · Consola en vivo + comandos acotados (ayuda, estado, iniciar, detener, reiniciar, verificar, probar, db_check, tests)
//   · Qué agentes, proveedores y modelos hay conectados
// ================================================

const AgentesIA = (() => {
  const LKEY = "party_launcher_url";
  const lurl = () => (localStorage.getItem(LKEY) || "http://localhost:8786").replace(/\/$/, "");
  const aurl = () => (window.PartyAgent ? PartyAgent.base() : "http://localhost:8787");
  const esc = (t) => Party.esc(String(t ?? ""));
  const fmt = (n) => Number(n || 0).toLocaleString("es-CL");
  let timer = null, since = 0, hist = [], hi = -1, st = { launcher: false, agente: false, proceso: false }, lastAgentFetch = 0, busy = false, lastErr = "";

  async function j(url, opt, ms = 2500) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
    try { const r = await fetch(url, { ...opt, signal: ctl.signal }); if (!r.ok) throw new Error("HTTP " + r.status); return await r.json(); }
    finally { clearTimeout(t); }
  }
  const post = (path, body) => j(lurl() + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) }, 20000);

  // ---------- consola ----------
  const con = () => document.getElementById("aiConsole");
  function line(o) {
    const c = con(); if (!c) return;
    const cls = o.o === "tú" ? "me" : /error|traceback|exception|❌/i.test(o.txt) ? "err" : /✅|startup complete|running on/i.test(o.txt) ? "ok" : "";
    const d = document.createElement("div"); d.className = "ai-l " + cls;
    d.innerHTML = `<span class="t">${esc(o.t)}</span><span class="o">${esc(o.o)}</span><span class="x">${esc(o.txt)}</span>`;
    const stick = c.scrollTop + c.clientHeight >= c.scrollHeight - 24;
    c.appendChild(d); while (c.children.length > 1500) c.removeChild(c.firstChild);
    if (stick) c.scrollTop = c.scrollHeight;
  }
  function note(txt, o = "party") { line({ t: new Date().toLocaleTimeString("es-CL", { hour12: false }), o, txt }); }

  async function runCmd(raw) {
    const cmd = raw.trim(); if (!cmd) return;
    hist.unshift(cmd); hi = -1;
    if (!st.launcher) { note(`> ${cmd}`, "tú"); note("El lanzador está desconectado. Abre agent/iniciar_launcher.bat (doble clic) y vuelve a intentar.", "party"); return; }
    try { const r = await post("/cmd", { cmd }); if (r.mensaje) r.mensaje.split("\n").forEach((x) => note(x, "launcher")); }
    catch (e) { note("No pude contactar al lanzador: " + e.message, "party"); }
    poll(true);
  }

  // ---------- estado ----------
  const dot = (ok, warn) => `<i class="ai-dot ${ok ? "on" : warn ? "warn" : ""}"></i>`;
  function bar() {
    const b = document.getElementById("aiBar"); if (!b) return;
    const L = st.launcher, A = st.agente;
    b.innerHTML = `
      <div class="ai-state">${dot(L)} <b>Lanzador</b> <small>${L ? "conectado" : "desconectado"}</small></div>
      <div class="ai-state">${dot(A, st.proceso)} <b>Agente</b> <small>${A ? "encendido" : st.proceso ? "arrancando…" : "apagado"}</small></div>
      ${(() => { const d = typeof PartyStore !== "undefined" ? PartyStore.status() : null; if (!d) return ""; const ok = d.remoto && !d.error; return `<div class="ai-state" title="${Party.esc(d.error || "Tus datos se guardan en Supabase (tabla party_docs)")}">${dot(ok, !ok && d.pendientes)} <b>Base de datos</b> <small>${ok ? "sincronizada" : d.error ? "sin conexión (" + d.pendientes + " pendientes)" : "conectando…"}</small></div>`; })()}
      <div class="ai-btns">
        ${A || st.proceso
          ? `<button class="btn secondary" data-ai="detener" ${L ? "" : "disabled"}>Desconectar</button><button class="btn secondary" data-ai="reiniciar" ${L ? "" : "disabled"}>Reiniciar</button>`
          : `<button class="btn primary" data-ai="iniciar" ${L ? "" : "disabled"}>Conectar agente</button>`}
      </div>`;
    const h = document.getElementById("aiHelp");
    if (h) h.hidden = L;
  }

  async function poll(force) {
    if (!document.body.contains(document.getElementById("agentesIaWrap"))) { clearInterval(timer); timer = null; return; }
    if (busy && !force) return; busy = true;
    try {
      let s = null, err = "";
      try { s = await j(lurl() + "/status", null, 4000); } catch (e) { s = null; err = e.name === "AbortError" ? "no respondió a tiempo" : e.message; }
      if (!s) {                                           // prueba la otra forma de llamar al mismo equipo (localhost ↔ 127.0.0.1)
        const alt = lurl().includes("localhost") ? lurl().replace("localhost", "127.0.0.1") : lurl().replace("127.0.0.1", "localhost");
        try { s = await j(alt + "/status", null, 4000); if (s) { try { localStorage.setItem(LKEY, alt); } catch {} note("Lanzador encontrado en " + alt, "party"); } } catch { /* sigue desconectado */ }
      }
      if (!s && err && err !== lastErr) { lastErr = err; note("No logro hablar con el lanzador (" + lurl() + "): " + err + ". Si la ventana del lanzador está abierta, abre " + lurl() + "/status en otra pestaña para ver si responde.", "party"); }
      if (s) lastErr = "";
      st.launcher = !!s; st.proceso = !!s?.proceso; st.agente = !!s?.agente_responde;
      if (!s) { // sin lanzador: igual detecta si el agente corre por su cuenta (iniciar.bat)
        try { await j(aurl() + "/health", null, 1200); st.agente = true; } catch { st.agente = false; }
      }
      bar();
      if (s) {
        const l = await j(lurl() + "/logs?since=" + since, null, 2000).catch(() => null);
        if (l) { if (l.ultimo < since) { const c = con(); if (c) c.innerHTML = ""; } l.lineas.forEach(line); since = l.ultimo; }
      }
      if (st.agente && (force || Date.now() - lastAgentFetch > 5000)) { lastAgentFetch = Date.now(); await cards(); }
      else if (!st.agente) offCards();
    } finally { busy = false; }
  }

  // ---------- tarjetas ----------
  const card = (id, title, body) => { const el = document.getElementById(id); if (el) el.innerHTML = `<h4>${title}</h4>${body}`; };
  function offCards() {
    ["aiOrq", "aiProv", "aiSem", "aiUso"].forEach((id, i) => card(id, ["Orquestaciones", "Proveedores y modelos", "Búsqueda y memoria", "Uso de tokens"][i],
      `<p class="ai-muted">Agente apagado. Pulsa <b>Conectar agente</b> para ver esta información.</p>`));
  }
  async function cards() {
    const A = aurl();
    const [ag, sem, uso, est] = await Promise.all([j(A + "/agentes").catch(() => null), j(A + "/semantico").catch(() => null), j(A + "/uso").catch(() => null), j(A + "/estadisticas").catch(() => null)]);
    const modo = window.PartyAgent ? PartyAgent.getMode() : "grafo";
    if (ag) {
      card("aiOrq", "Orquestaciones", ag.orquestaciones.map((o) => `
        <div class="ai-item ${o.id === modo ? "sel" : ""}">
          <div>${dot(o.disponible)} <b>${esc(o.nombre)}</b> <small>${esc(o.framework)}</small>${o.id === modo ? ` <span class="ai-tag">en uso en el chat</span>` : ""}</div>
          <ul>${o.agentes.map((a) => `<li><b>${esc(a.rol)}</b>${a.herramientas.length ? ` <small>· ${a.herramientas.map(esc).join(", ")}</small>` : ""}</li>`).join("")}</ul>
        </div>`).join("") + `<p class="ai-muted">Se elige en el chat con «Orquestación de la IA». Las reglas internas siempre responden primero (0 tokens).</p>`);
      card("aiProv", "Proveedores y modelos", `<div class="ai-chips">${ag.proveedores.map((p) => `<span class="ai-chip ${p.clave ? "ok" : ""}" title="${p.clave ? "clave configurada" : "sin clave en agent/.env"}">${dot(p.clave && !p.en_enfriamiento, p.en_enfriamiento)} ${esc(p.nombre)}${p.en_enfriamiento ? " · en pausa" : ""}</span>`).join("")}</div>`
        + Object.entries(ag.niveles).map(([n, cs]) => `<div class="ai-nivel"><b>${esc(n.replace(/^\d_/, ""))}</b> ${cs.map((c) => `<span class="${c.conectado ? "" : "off"}">${esc(c.proveedor)}/${esc(c.modelo)}</span>`).join("")}</div>`).join(""));
    }
    if (sem) card("aiSem", "Búsqueda y memoria", `
      <div class="ai-kv"><span>Embeddings</span><b>${dot(sem.remoto_disponible, !sem.remoto_disponible)} ${esc(sem.modelo)}</b></div>
      <div class="ai-kv"><span>Modo</span><b>${sem.remoto_disponible ? "semántico (IA)" : "respaldo local por palabras"}</b></div>
      <div class="ai-kv"><span>pgvector (Supabase)</span><b>${dot(sem.pgvector)} ${sem.pgvector ? "conectado" : "sin conexión"}</b></div>
      <div class="ai-kv"><span>Fragmentos indexados</span><b>${fmt(sem.vectores_locales)}</b></div>
      <div class="ai-kv"><span>Memoria del chat</span><b>${esc(window.PartyAgent ? PartyAgent.MEMORIAS[PartyAgent.getMemory()] : "")}</b></div>
      ${sem.ultimo_error ? `<p class="ai-muted err">Último error: ${esc(sem.ultimo_error)}</p>` : ""}`);
    const prov = (uso?.proveedores || []).filter((p) => p.clave);
    let sinTok = "";
    if (est && est.total > 0) sinTok = `<div class="ai-big"><b>${est.pct_sin_tokens}%</b><span>de las preguntas se resolvieron <b>sin tokens</b> (${fmt(est.sin_tokens)} de ${fmt(est.total)})</span></div>`;
    card("aiUso", "Uso de tokens", sinTok + (prov.length ? prov.map((p) => {
      const v = p.ventanas.find((w) => w.tokens_limite) || p.ventanas[0];
      return v ? `<div class="ai-kv"><span>${esc(p.nombre)} <small>${esc(v.nombre)}</small></span><b>${v.tokens_limite ? `${fmt(v.tokens_usados)} / ${fmt(v.tokens_limite)}` : `${fmt(v.tokens_usados)} tokens`}</b></div>` : "";
    }).join("") : `<p class="ai-muted">Sin datos de uso todavía.</p>`) + (est?.total ? `<div class="ai-kv"><span>Tokens gastados (registro)</span><b>${fmt(est.tokens)}</b></div>` : ""));
  }

  // ---------- montaje ----------
  function init() {
    const w = document.getElementById("agentesIaWrap"); if (!w) return;
    since = 0;
    w.innerHTML = `
      <div class="p-card ai-top">
        <div class="card-head"><h3>${Party.icon("bot")}Agentes IA</h3></div>
        <p class="ai-muted">Enciende o apaga el agente, mira qué está conectado y sigue lo que hace en la consola.</p>
        <div id="aiBar" class="ai-bar"></div>
        <div id="aiHelp" class="ai-help" hidden>
          <b>El lanzador no está encendido.</b> Un navegador no puede abrir programas por sí solo, así que hace falta un programa pequeño que quede abierto:
          <ol><li>Abre la carpeta <code>Party/agent</code>.</li><li>Haz doble clic en <code>iniciar_launcher.bat</code> (Linux/Mac: <code>iniciar_launcher.sh</code>) y déjalo abierto.</li><li>Vuelve aquí: este indicador se pone verde solo.</li></ol>
        </div>
      </div>
      <div class="ai-grid">
        <div class="p-card ai-card" id="aiOrq"></div><div class="p-card ai-card" id="aiProv"></div>
        <div class="p-card ai-card" id="aiSem"></div><div class="p-card ai-card" id="aiUso"></div>
      </div>
      <div class="p-card ai-term">
        <div class="card-head"><h3>Consola</h3><button class="btn secondary" data-ai="limpiar" style="padding:4px 10px;font-size:12px">Limpiar</button></div>
        <div id="aiConsole" class="ai-console" aria-live="polite"></div>
        <form id="aiForm" class="ai-form" autocomplete="off"><span>&gt;</span><input id="aiInput" placeholder="Escribe un comando: ayuda, estado, iniciar, detener, verificar, probar, tests…" spellcheck="false" /><button class="btn primary" type="submit">Enviar</button></form>
        <div class="ai-cmds">${["ayuda", "estado", "iniciar", "detener", "reiniciar", "verificar", "probar", "db_check", "tests"].map((c) => `<button type="button" class="chip" data-ai="${c}">${c}</button>`).join("")}</div>
      </div>`;
    bar(); offCards();
    note("Consola de Party lista. Escribe «ayuda» para ver los comandos.");
    w.addEventListener("click", (e) => { const b = e.target.closest("[data-ai]"); if (!b || b.disabled) return; if (b.dataset.ai === "limpiar") { const c = con(); if (c) c.innerHTML = ""; } else runCmd(b.dataset.ai); });
    const inp = w.querySelector("#aiInput");
    w.querySelector("#aiForm").addEventListener("submit", (e) => { e.preventDefault(); const v = inp.value; inp.value = ""; runCmd(v); });
    inp.addEventListener("keydown", (e) => {
      if (e.key === "ArrowUp" && hist.length) { hi = Math.min(hi + 1, hist.length - 1); inp.value = hist[hi]; e.preventDefault(); }
      if (e.key === "ArrowDown") { hi = Math.max(hi - 1, -1); inp.value = hi >= 0 ? hist[hi] : ""; e.preventDefault(); }
    });
    clearInterval(timer); timer = setInterval(poll, 1500); poll(true);
  }
  return { init };
})();

function initAgentesIA() { AgentesIA.init(); }
