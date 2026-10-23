// ================================================
// PANEL_INICIO.JS — Resumen del grupo (pestaña "Panel")
// ================================================

const MEMBER_COLORS = ["#fbbf24", "#f472b6", "#38bdf8", "#34d399", "#a78bfa", "#fb923c", "#60a5fa", "#f87171"];

async function initInicio() {
  const wrap = document.getElementById("inicio");
  if (!wrap) return;
  wrap.innerHTML = `<p class="muted-text">Cargando resumen del grupo...</p>`;
  const groupId = getState().selected.groupId;
  const data = groupId ? await cargarResumenReal(groupId) : resumenEjemplo();
  renderResumen(wrap, data);
}

async function cargarResumenReal(groupId) {
  const q = (p) => p.then((r) => r.data || []).catch(() => []);
  const me = Party.student()?.id;

  const [miembros, columnas, tareas, eventos, actTasks, actEvents, actNotes] = await Promise.all([
    q(supabaseClient.from("student_groups").select("role, students(id, full_name)").eq("group_id", groupId)),
    q(supabaseClient.from("scrum_columns").select("id, title, position").eq("group_id", groupId).order("position")),
    q(supabaseClient.from("scrum_tasks").select("id, title, column_id, created_at, owner:owner_id(full_name)")
      .eq("group_id", groupId).order("created_at", { ascending: false }).limit(100)),
    q(supabaseClient.from("events").select("id, title, event_date, type")
      .eq("group_id", groupId).gte("event_date", new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
      .order("event_date", { ascending: true }).limit(3)),
    q(supabaseClient.from("scrum_tasks").select("title, created_at, owner:owner_id(full_name)")
      .eq("group_id", groupId).order("created_at", { ascending: false }).limit(3)),
    q(supabaseClient.from("events").select("title, created_at, owner:owner_id(full_name)")
      .eq("group_id", groupId).order("created_at", { ascending: false }).limit(2)),
    q(supabaseClient.from("notes").select("title, created_at, owner:owner_id(full_name)")
      .eq("group_id", groupId).order("created_at", { ascending: false }).limit(2)),
  ]);

  const colMap = {};
  columnas.forEach((c) => (colMap[c.id] = c.title));
  const isDone  = (t) => PartyData.DONE_RE.test(colMap[t.column_id] || "");
  const isDoing = (t) => PartyData.DOING_RE.test(colMap[t.column_id] || "");
  const done = tareas.filter(isDone).length;
  const doing = tareas.filter(isDoing).length;
  const todo = tareas.length - done - doing;

  const activity = [
    ...actTasks.map((t) => ({ at: t.created_at, icon: "tasks", color: "violet", who: t.owner?.full_name, text: "creó una tarea", what: t.title })),
    ...actEvents.map((e) => ({ at: e.created_at, icon: "calendar", color: "cyan", who: e.owner?.full_name, text: "añadió el evento", what: e.title })),
    ...actNotes.map((n) => ({ at: n.created_at, icon: "note", color: "green", who: n.owner?.full_name, text: "guardó el apunte", what: n.title })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 4);

  return {
    demo: false,
    miembros: miembros.filter((m) => m.students).map((m) => ({
      name: m.students.full_name, id: m.students.id,
      role: m.role === "owner" ? "Administrador" : "Miembro", isMe: m.students.id === me,
    })),
    stats: { miembros: miembros.length, total: tareas.length, doing, done },
    donut: { todo, doing, done },
    eventos: eventos.map((e) => ({ title: e.title, date: e.event_date, type: e.type })),
    tareas: tareas.filter((t) => !isDone(t)).slice(0, 4).map((t) => ({
      title: t.title, col: colMap[t.column_id] || "Pendiente", who: t.owner?.full_name || "", at: t.created_at, doing: isDoing(t),
    })),
    actividad: activity,
  };
}

function resumenEjemplo() {
  const d = (n, h = 9) => { const x = new Date(); x.setDate(x.getDate() + n); x.setHours(h, 0, 0, 0); return x.toISOString(); };
  const ago = (h) => new Date(Date.now() - h * 36e5).toISOString();
  const names = ["Marco", "Catalina", "Diego", "Valentina"];
  return {
    demo: true,
    miembros: names.map((n, i) => ({ name: n, role: i === 0 ? "Administrador" : "Miembro", isMe: i === 0 })),
    stats: { miembros: 8, total: 5, doing: 2, done: 1 },
    donut: { todo: 2, doing: 2, done: 1 },
    eventos: [
      { title: "Reunión de avance",                  date: d(1, 15), type: "reunion" },
      { title: "Posible evaluación de Cloud Native", date: d(5, 9),  type: "prueba" },
    ],
    tareas: [
      { title: "Definir tema presentación",     col: "Alta",  who: "Marco",     at: d(0), doing: false },
      { title: "Dividir secciones del informe", col: "Media", who: "Catalina",  at: d(2), doing: true },
      { title: "Revisar dataset del proyecto",  col: "Media", who: "Diego",     at: d(3), doing: true },
      { title: "Preparar versión final",        col: "Baja",  who: "Valentina", at: d(3), doing: false },
    ],
    actividad: [
      { at: ago(48), icon: "upload", color: "green",  who: "Diego",     text: "subió un archivo",   what: "Proyecto_CloudNative.zip" },
      { at: ago(72), icon: "tasks",  color: "violet", who: "Catalina",  text: "creó una tarea",     what: "Dividir secciones del informe" },
      { at: ago(96), icon: "chat",   color: "cyan",   who: "Valentina", text: "comentó en el chat", what: "Revisen la última versión del informe" },
    ],
  };
}

function renderResumen(wrap, d) {
  const P = Party, esc = P.esc, s = d.stats;
  const tag = `<span class="tag-demo">Ejemplo</span>`;

  const stat = (color, icon, n, label) => `
    <div class="stat-card" style="--c:${color};cursor:default">
      <span class="stat-ico">${P.icon(icon)}</span>
      <span><div class="stat-num">${n}</div><div class="stat-lbl">${label}</div></span>
    </div>`;

  const tools = [["tasks", "Resumir tareas", "resumir"], ["chart", "Crear encuesta", "encuesta"], ["search", "Buscar apuntes", "apuntes"], ["calendar", "Planificar reunión", "reunion"]];
  const chat = `
    <section class="p-card span-8" style="border-color:color-mix(in srgb,var(--color-accent) 45%,transparent);background:linear-gradient(135deg,color-mix(in srgb,var(--color-btn-primary-bg) 14%,var(--bg-card)),var(--bg-card) 70%)">
      <div class="card-head" style="margin-bottom:4px">
        <h3><span class="act-ico" style="width:34px;height:34px">${P.icon("sparkles")}</span>Chat del grupo con IA</h3>
        <span class="ia-badge">IA</span>
      </div>
      <p style="margin:0 0 14px;font-size:12.5px;color:var(--color-muted)">Consulta, organiza y coordina con tu grupo.</p>
      <form class="ai-input" id="grpAiForm" autocomplete="off" style="height:56px">
        <input id="grpAiInput" placeholder="Escribe un mensaje o pídele algo a la IA del grupo..." aria-label="Mensaje para la IA del grupo">
        <button type="button" class="mic" id="grpMic" aria-label="Dictar">${P.icon("mic")}</button>
        <button type="submit" class="send" aria-label="Enviar">${P.icon("send")}</button>
      </form>
      <div class="chips">${tools.map(([ic, t, k]) => `<button class="chip" data-chip="${k}">${P.icon(ic)}${t}</button>`).join("")}</div>
    </section>`;

  const miembros = d.miembros.slice(0, 4).map((m, i) => `
    <div class="row member-row" style="background:transparent;border:0;padding:6px 0">
      <span class="member-av" style="--c:${MEMBER_COLORS[i % MEMBER_COLORS.length]}">${esc(P.initial(m.name))}</span>
      <div class="grow"><div class="t">${esc(m.name)}${m.isMe ? " (Tú)" : ""}</div><div class="role">${esc(m.role)}</div></div>
      <span class="kebab">${P.iconFill("more")}</span>
    </div>`).join("") || `<div class="empty">Aún no hay miembros.</div>`;
  const miembrosCard = `
    <section class="p-card span-4">
      <div class="card-head"><h3>Miembros (${s.miembros})</h3><button class="btn-link" data-go="miembros">Ver todos ${P.icon("arrow")}</button></div>
      ${miembros}
    </section>`;

  const tot = d.donut.todo + d.donut.doing + d.donut.done;
  const pct = tot ? Math.round((d.donut.done / tot) * 100) : 0;
  const R = 52, C = 2 * Math.PI * R;
  const seg = (n, color, offset) => {
    const len = tot ? (n / tot) * C : 0;
    return n ? `<circle r="${R}" cx="70" cy="70" fill="none" stroke="${color}" stroke-width="16" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 70 70)"/>` : "";
  };
  const T = tot || 1;
  const donut = `
    <svg class="donut" viewBox="0 0 140 140" role="img" aria-label="${pct}% de tareas completadas">
      <circle r="${R}" cx="70" cy="70" fill="none" stroke="color-mix(in srgb,var(--color-text) 10%,transparent)" stroke-width="16"/>
      ${seg(d.donut.done, "var(--color-success)", 0)}
      ${seg(d.donut.doing, "var(--color-warning)", (d.donut.done / T) * C)}
      ${seg(d.donut.todo, "var(--color-accent)", ((d.donut.done + d.donut.doing) / T) * C)}
      <text x="70" y="68" text-anchor="middle" font-size="24" font-weight="800">${pct}%</text>
      <text x="70" y="86" text-anchor="middle" font-size="9.5" style="fill:var(--color-muted)">Completadas</text>
    </svg>`;
  const progreso = `
    <section class="p-card span-4">
      <div class="card-head"><h3>Progreso de tareas</h3></div>
      <div class="donut-wrap">${donut}
        <div class="legend">
          <span style="--c:var(--color-accent)"><i></i>${d.donut.todo} Por hacer</span>
          <span style="--c:var(--color-warning)"><i></i>${d.donut.doing} En proceso</span>
          <span style="--c:var(--color-success)"><i></i>${d.donut.done} Finalizadas</span>
        </div>
      </div>
    </section>`;

  const TYPE_TONE = { prueba: "danger", entrega: "warn", reunion: "info", clase: "ok", general: "violet" };
  const eventos = d.eventos.length ? d.eventos.map((e) => {
    const dt = new Date(e.date);
    return `
      <div class="row">
        <div class="date-chip" style="--c:var(--color-accent)"><small>${PartyData.MONTHS_UP[dt.getMonth()]}</small><b>${dt.getDate()}</b></div>
        <div class="grow"><div class="t">${esc(e.title)}</div><div class="s">${PartyData.hhmm(dt) === "00:00" ? "Todo el día" : PartyData.hhmm(dt)}</div></div>
        <span class="pill ${TYPE_TONE[e.type] || ""}">${PartyData.relLabel(e.date)}</span>
      </div>`;
  }).join("") : `<div class="empty">No hay eventos próximos.</div>`;
  const eventosCard = `
    <section class="p-card span-8">
      <div class="card-head"><h3>${P.icon("calendar")}Próximos eventos del grupo</h3><button class="btn-link" data-go="calendario">Ver calendario ${P.icon("arrow")}</button></div>
      <div class="row-list">${eventos}</div>
      <button class="add-link" data-go="calendario">${P.icon("plus")} Nuevo evento</button>
    </section>`;

  const tareas = d.tareas.length ? d.tareas.map((t) => `
    <div class="row">
      <span class="check-circle" style="cursor:default"></span>
      <div class="grow"><div class="t">${esc(t.title)}</div><div class="s">${esc(t.who)}${t.who ? " · " : ""}${PartyData.relLabel(t.at)}</div></div>
      <span class="pill ${t.doing ? "info" : ""}">${esc(t.col)}</span>
    </div>`).join("") : `<div class="empty">No hay tareas pendientes. ¡Buen trabajo, equipo! 🎉</div>`;
  const tareasCard = `
    <section class="p-card span-6">
      <div class="card-head"><h3>${P.icon("tasks")}Tareas del grupo</h3><button class="btn-link" data-go="scrum">Ver todas ${P.icon("arrow")}</button></div>
      <div class="row-list">${tareas}</div>
      <button class="add-link" data-go="scrum">${P.icon("plus")} Nueva tarea</button>
    </section>`;

  const files = [
    { name: "Proyecto_CloudNative.zip",   sub: "Diego · Hace 2 días" },
    { name: "Apuntes_Clase_4.pdf",        sub: "Valentina · Hace 3 días" },
    { name: "Dataset_proyecto.csv",       sub: "Marco · Hace 5 días" },
    { name: "Presentacion_avance.pptx",   sub: "Catalina · Hace 1 semana" },
  ];
  const archivos = files.map((f) => {
    const m = PartyData.fileMeta(f.name);
    return `
      <div class="row clickable" data-go="biblioteca">
        <span class="file-ico" style="--c:${m.c}">${P.icon(m.icon)}</span>
        <div class="grow"><div class="t">${esc(f.name)}</div><div class="s">${esc(f.sub)}</div></div>
        <span class="kebab">${P.iconFill("more")}</span>
      </div>`;
  }).join("");
  const archivosCard = `
    <section class="p-card span-6">
      <div class="card-head"><h3>${P.icon("folder")}Archivos del grupo ${tag}</h3><button class="btn-link" data-go="biblioteca">Ver todos ${P.icon("arrow")}</button></div>
      <div class="row-list">${archivos}</div>
    </section>`;

  const act = d.actividad.length ? d.actividad.map((a) => `
    <div class="row">
      <span class="act-ico ${a.color}">${P.icon(a.icon)}</span>
      <div class="grow"><div class="t">${esc(a.who || "Alguien")} ${esc(a.text)}</div><div class="s">${esc(a.what)} · ${PartyData.ago(a.at)}</div></div>
    </div>`).join("") : `<div class="empty">Aún no hay actividad en el grupo.</div>`;
  const actCard = `
    <section class="p-card span-7">
      <div class="card-head"><h3>${P.icon("zap")}Actividad reciente del grupo</h3></div>
      <div class="row-list">${act}</div>
    </section>`;

  const tile = (color, icon, label, k) => `<button class="tool-tile" style="--c:${color}" data-chip="${k}"><span class="file-ico">${P.icon(icon)}</span>${label}</button>`;
  const toolsCard = `
    <section class="p-card span-5">
      <div class="card-head"><h3>Herramientas rápidas</h3></div>
      <div class="tools-grid">
        ${tile("var(--color-info)", "file", "Generar resumen IA", "resumir")}
        ${tile("var(--color-success)", "chart", "Crear encuesta", "encuesta")}
        ${tile("var(--color-pink)", "calendar", "Planificar reunión", "reunion")}
        ${tile("var(--color-warning)", "dice", "Repartir tareas", "repartir")}
      </div>
    </section>`;

  wrap.innerHTML = `
    ${d.demo ? `<div class="demo-pill" style="background:color-mix(in srgb,var(--color-warning) 14%,transparent);border-color:color-mix(in srgb,var(--color-warning) 35%,transparent);color:var(--color-warning);margin:0 0 14px">${P.icon("sparkles")} Vista de ejemplo — entra a un grupo desde la sección Grupos para ver sus datos reales</div>` : ""}
    <section class="stats-row" style="margin-top:0">
      ${stat("var(--color-accent-2)", "users", s.miembros, "Miembros")}
      ${stat("var(--color-info)", "tasks", s.total, "Tareas totales")}
      ${stat("var(--color-warning)", "zap", s.doing, "En proceso")}
      ${stat("var(--color-success)", "check", s.done, "Finalizadas")}
    </section>
    <div class="dash-grid">${chat}${miembrosCard}${progreso}${eventosCard}${tareasCard}${archivosCard}${actCard}${toolsCard}</div>`;

  bindResumen(wrap);
}

function bindResumen(wrap) {
  wrap.addEventListener("click", (e) => {
    const go = e.target.closest("[data-go]");
    if (go) { Party.go(go.dataset.go); return; }
    const chip = e.target.closest("[data-chip]");
    if (!chip) return;
    const k = chip.dataset.chip;
    if (k === "resumir")  { localStorage.setItem("party_assistant_query", "Resumir tareas"); Party.go("asistente"); }
    if (k === "apuntes")  { localStorage.setItem("party_assistant_prefill", "Buscar "); Party.go("asistente"); }
    if (k === "encuesta") Party.go("encuestas");
    if (k === "reunion")  Party.go("calendario");
    if (k === "repartir") Party.go("sorteo");
  });

  const form = wrap.querySelector("#grpAiForm");
  const input = wrap.querySelector("#grpAiInput");
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = input.value.trim();
    if (!v) { input.focus(); return; }
    localStorage.setItem("party_assistant_query", v);
    Party.go("asistente");
  });

  wrap.querySelector("#grpMic")?.addEventListener("click", () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { showToast("Tu navegador no soporta dictado por voz.", "warning"); return; }
    const rec = new SR();
    rec.lang = "es-CL";
    rec.onresult = (ev) => { input.value = ev.results[0][0].transcript; input.focus(); };
    rec.onerror = () => showToast("No se pudo usar el micrófono.", "warning");
    showToast("Escuchando… habla ahora 🎙️");
    rec.start();
  });
}
