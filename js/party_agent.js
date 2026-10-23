// ================================================
// PARTY_AGENT.JS — cliente del agente de IA
// Flujo: reglas (0 tokens) → /plan (qué modelo y cuántos tokens, NO gasta) →
//        el usuario elige Usar / No usar → /run (consumo real) → medidor.
// Las claves de los proveedores viven en el servidor del agente (carpeta agent/), nunca aquí.
// ================================================
window.PartyAgent = (() => {
  const URL_KEY = "party_agent_url", SES_KEY = "party_agent_session";
  const base = () => (localStorage.getItem(URL_KEY) || "http://localhost:8787").replace(/\/$/, "");
  const esc = (t) => Party.esc(String(t ?? ""));
  const sesion = () => { let s = localStorage.getItem(SES_KEY); if (!s) { s = "ses_" + Date.now().toString(36); localStorage.setItem(SES_KEY, s); } return s; };
  const usuario = () => Party.student()?.id || "anon";
  const fmt = (n) => Number(n || 0).toLocaleString("es-CL");
  // Orquestación: grafo (LangGraph, el más barato) | serial | jerarquico (equipo CrewAI del curso IL2.3)
  const MODE_KEY = "party_agent_mode";
  const MODOS = { grafo: "Grafo (1 agente)", serial: "Equipo serial (CrewAI)", jerarquico: "Equipo jerárquico (CrewAI)" };
  const getMode = () => { const m = localStorage.getItem(MODE_KEY); return MODOS[m] ? m : "grafo"; };
  const setMode = (m) => { if (MODOS[m]) localStorage.setItem(MODE_KEY, m); };
  // Memoria de la conversación (IL2.2): buffer = todo · window = últimos turnos · summary = resumen + últimos turnos
  const MEM_KEY = "party_agent_memory";
  const MEMORIAS = { window: "Ventana (últimos turnos)", buffer: "Buffer (todo el historial)", summary: "Resumen (ahorra tokens)" };
  const getMemory = () => { const m = localStorage.getItem(MEM_KEY); return MEMORIAS[m] ? m : "window"; };
  const setMemory = (m) => { if (MEMORIAS[m]) localStorage.setItem(MEM_KEY, m); };
  const NIVEL = { "1_rapido": "rápido", "2_equilibrado": "equilibrado", "3_razonamiento": "razonamiento", vision: "visión" };

  async function api(path, body, ms = 90000) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(base() + path, { method: body ? "POST" : "GET", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, signal: ctl.signal });
      if (!r.ok) { const e = new Error((await r.json().catch(() => ({}))).detail || "HTTP " + r.status); e.status = r.status; throw e; }
      return await r.json();
    } finally { clearTimeout(t); }
  }

  let _up = { t: 0, ok: false };
  async function available() {
    if (Date.now() - _up.t < 15000) return _up.ok;
    try { await api("/health", null, 2500); _up = { t: Date.now(), ok: true }; } catch { _up = { t: Date.now(), ok: false }; }
    return _up.ok;
  }

  // ---------- contexto: se manda al servidor; el modelo lo consulta con herramientas ----------
  const plain = (html) => { const d = document.createElement("div"); d.innerHTML = html || ""; return (d.textContent || "").replace(/\s+/g, " ").trim(); };
  async function context() {
    const ctx = { hoy: new Date().toLocaleDateString("sv-SE"), horario: [], eventos: [], apuntes: [] };
    try {
      if (window.PartySchedule && PartySchedule.hasSchedule()) {
        const seen = new Set();
        for (let k = 0; k < 7; k++) {
          const d = new Date(); d.setDate(d.getDate() + k); const idx = (d.getDay() + 6) % 7;
          if (seen.has(idx)) continue; seen.add(idx);
          PartySchedule.forDay(d).forEach((c) => ctx.horario.push({ dia: idx, desde: c.start, hasta: c.end, asignatura: c.title, sala: c.room || "" }));
        }
      }
    } catch (e) { console.warn(e); }
    try {
      const gid = getState().selected.groupId;
      if (gid && typeof supabaseClient !== "undefined") {
        const [ev, nt] = await Promise.all([
          supabaseClient.from("events").select("id, title, event_date, type").eq("group_id", gid).order("event_date").limit(150),
          supabaseClient.from("notes").select("id, title, content").eq("group_id", gid).limit(30),
        ]);
        ctx.grupo = gid;
        ctx.eventos = (ev.data || []).map((e) => ({ id: e.id, titulo: e.title, fecha: String(e.event_date).slice(0, 10), tipo: e.type }));
        ctx.apuntes = (nt.data || []).map((n) => ({ id: n.id, titulo: n.title, texto: plain(n.content).slice(0, 1500) }));
      }
    } catch (e) { console.warn(e); }
    try { if (typeof Lib !== "undefined" && Lib.materialForAgent) ctx.material = await Lib.materialForAgent(); } catch (e) { console.warn(e); }
    return ctx;
  }

  // ---------- texto de la respuesta ----------
  const rich = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>");

  // ---------- medidor ----------
  function meterLine(p) {
    const v = p.ventanas.find((w) => (w.tokens_limite && w.tokens_usados > 0) || (w.peticiones_limite && w.peticiones > 0)) || p.ventanas.find((w) => w.tokens_limite) || p.ventanas[0];
    if (!v) return `${p.nombre}`;
    let txt;
    if (v.tokens_limite) txt = `${fmt(v.tokens_usados)}/${fmt(v.tokens_limite)} tokens · ${v.nombre}`;
    else if (v.peticiones_limite) txt = `${fmt(v.peticiones)}/${fmt(v.peticiones_limite)} peticiones · ${v.nombre}`;
    else txt = `${fmt(v.tokens_usados)} tokens usados · ${v.nombre}`;
    const real = p.real && p.real.tokens_restantes != null ? ` · quedan ${fmt(p.real.tokens_restantes)} (dato del proveedor)` : "";
    return `<span title="${esc(p.nombre + " " + p.renueva + (v.limite_origen ? " · límite " + v.limite_origen + " en modelos.yaml" : ""))}"><b>${esc(p.nombre)}</b> ${txt}${real}</span>`;
  }
  async function meterHTML() {
    if (!(await available())) return `IA desconectada · enciende el agente (<code>agent/iniciar.bat</code>). Las reglas internas siguen funcionando.`;
    try {
      const { proveedores } = await api("/uso", null, 4000);
      const con = proveedores.filter((p) => p.clave);
      if (!con.length) return "Sin claves de IA configuradas (archivo <code>agent/.env</code>).";
      return "Tokens usados: " + con.map(meterLine).join(" &nbsp;|&nbsp; ");
    } catch { return "No pude leer el medidor de tokens."; }
  }

  // ---------- paso 1: planear (no gasta tokens) ----------
  async function plan(text, imagen) {
    if (!(await available())) return { kind: "offline" };
    let p;
    try { p = await api("/plan", { sesion: sesion(), usuario: usuario(), pregunta: text, contexto: await context(), imagen: imagen || null, orquestacion: getMode(), memoria: getMemory() }, 20000); }
    catch (e) { return { kind: "error", html: "No pude consultar al agente: " + esc(e.message) }; }
    if (p.modo === "reglas") return { kind: "rules", html: rich(p.respuesta), aviso: p.aviso };
    if (p.modo === "sin_cupo") return { kind: "nocupo", html: esc(p.mensaje) };
    return { kind: p.requiere_confirmacion ? "confirm" : "auto", plan: p, html: confirmHTML(p) };
  }

  function confirmHTML(p) {
    const e = p.estimacion;
    return `<div class="agent-confirm">
      <b>Esta pregunta usará tokens</b>${p.orquestacion && p.orquestacion !== "grafo" ? ` · <b>${esc(MODOS[p.orquestacion])}</b>` : ""} en <b>${esc(p.proveedor_nombre)} · ${esc(p.modelo)}</b><br>
      <small>Estimado: ${fmt(e.minimo)}–${fmt(e.maximo)} tokens (aproximado; el consumo real lo informa el proveedor).<br>
      Nivel <b>${esc(NIVEL[p.nivel] || p.nivel)}</b>: ${esc(p.razon)}<br>
      ${esc(p.proveedor_nombre)} ${esc(p.renueva)} <span style="opacity:.7">(${esc(p.renueva_fuente)})</span></small>
      <div class="g-chips" style="margin-top:8px">
        <button type="button" class="g-chip" data-act="agent-use" data-plan="${esc(p.plan_id)}">Usar</button>
        <button type="button" class="g-chip" data-act="agent-no" data-plan="${esc(p.plan_id)}">No usar</button>
      </div></div>`;
  }

  // ---------- paso 2: ejecutar ----------
  async function run(planId, aprobado = true) {
    let r;
    try { r = await api("/run", { plan_id: planId, aprobado }); }
    catch (e) { return { html: e.status === 404 ? "El plan expiró. Vuelve a hacer la pregunta." : "No pude ejecutar: " + esc(e.message), tokens: 0 }; }
    if (r.cancelado) return { html: "Ok, no usé ningún modelo. <small>0 tokens usados.</small>", tokens: 0, cancelado: true };
    if (r.modo === "error") {
      const det = r.errores?.length ? `<details style="margin-top:6px"><summary>Detalle técnico (por qué falló cada modelo)</summary><small>${r.errores.map((x) => esc(x)).join("<br>")}</small></details>` : "";
      return { html: esc(r.mensaje) + det, tokens: r.tokens?.total || 0 };
    }
    const m = r.modelo_final || {};
    const nivel = NIVEL[r.nivel_final] || r.nivel_final;
    const pasos = r.plan?.pasos?.length ? `<details style="margin-top:6px"><summary>Plan del agente (${r.plan.pasos.length} pasos)</summary><ol style="margin:4px 0 0 18px">${r.plan.pasos.map((s) => `<li><b>${esc(s.prioridad || "")}</b> · ${esc(s.accion)}</li>`).join("")}</ol></details>` : "";
    const traza = r.traza?.length ? `<details><summary>Cómo decidió</summary><small>${r.traza.map((t) => esc(t)).join("<br>")}</small></details>` : "";
    const t = r.tokens || {};
    const linea = `<span class="src">🤖 ${r.orquestacion && r.orquestacion !== "grafo" ? esc(MODOS[r.orquestacion]) + " · " : ""}${esc(m.proveedor || "")} · ${esc(m.modelo || "")} · nivel ${esc(nivel)}${r.escalado ? " (escaló)" : ""} · <b>${fmt(t.total)} tokens</b> ${t.exacto ? "" : "(aprox.)"}</span>`;
    return { html: rich(r.respuesta) + pasos + traza + linea, tokens: t.total || 0, acciones: r.acciones || [], recuerdos: r.recuerdos_guardados || [] };
  }

  // ---------- escritura con confirmación: el modelo propone, el usuario decide ----------
  function actionsHTML(acciones, msgKey) {
    if (!acciones?.length) return "";
    return `<div class="agent-actions"><b>Propuestas para tu calendario</b>` + acciones.map((a, i) => `
      <div class="agent-act" data-key="${esc(msgKey)}-${i}">📅 ${esc(a.titulo)} — ${esc(a.fecha)} (${esc(a.evento)})
        <button type="button" class="g-chip" data-act="agent-add" data-i="${i}" data-key="${esc(msgKey)}">Agregar</button></div>`).join("") + `</div>`;
  }
  async function addEvent(a) {
    const gid = getState().selected.groupId;
    if (!gid || typeof supabaseClient === "undefined") return { ok: false, html: "Para agregar eventos tienes que estar dentro de un grupo." };
    const me = Party.student();
    const { error } = await supabaseClient.from("events").insert([{ id: uid("ev"), group_id: gid, owner_id: me?._dev_mode ? null : me?.id,
      title: a.titulo, event_date: `${a.fecha}T12:00:00+00:00`, type: a.evento, description: a.descripcion || "Propuesto por el asistente" }]);
    if (error) { console.error(error); return { ok: false, html: "No pude guardar el evento." }; }
    PartyData.invalidate();
    return { ok: true, html: `✅ Agregué <b>${esc(a.titulo)}</b> al calendario (${esc(a.fecha)}).` };
  }

  // El navegador resolvió la pregunta solo (reglas + Supabase): se anota como «sin tokens» para la métrica del agente.
  async function noteRules() {
    // 1) Supabase (tabla agent_queries): queda guardado aunque el agente esté apagado
    try {
      const m = Party.student();
      if (m && !m._dev_mode && typeof supabaseClient !== "undefined") await supabaseClient.from("agent_queries").insert({ student_id: m.id, session_id: sesion(), via: "reglas_cliente", tokens: 0 });
    } catch {}
    // 2) contador local del agente (si está encendido)
    try { if (await available()) await api("/registro", { via: "reglas_cliente", sesion: sesion(), usuario: usuario() }, 3000); } catch {}
  }
  // Estadística guardada en Supabase: cuántas preguntas se resolvieron sin tokens.
  async function stats() {
    try {
      const m = Party.student();
      if (!m || m._dev_mode || typeof supabaseClient === "undefined") return null;
      const { data, error } = await supabaseClient.from("agent_queries").select("via,tokens").eq("student_id", m.id).limit(5000);
      if (error || !data) return null;
      const by = {}; let tokens = 0;
      data.forEach((r) => { by[r.via] = (by[r.via] || 0) + 1; tokens += r.tokens || 0; });
      const total = Object.entries(by).filter(([k]) => k !== "cancelado").reduce((a, [, v]) => a + v, 0);
      const sin = (by.reglas || 0) + (by.reglas_cliente || 0);
      return { total, sin, pct: total ? Math.round(1000 * sin / total) / 10 : 0, tokens, by };
    } catch { return null; }
  }

  return { stats, noteRules, MEMORIAS, getMemory, setMemory, MODOS, getMode, setMode, available, plan, run, meterHTML, actionsHTML, addEvent, rich, base };
})();
