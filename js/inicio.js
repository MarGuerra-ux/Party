// ================================================
// INICIO.JS — Dashboard de bienvenida de Party
// Se renderiza en #dash (pages/inicio.html)
// ================================================

const QUOTES = [
  "La organización de hoy es el éxito de mañana.",
  "Un paso a la vez: la constancia le gana al talento.",
  "Estudiar en equipo es avanzar el doble.",
  "Lo que planificas hoy lo celebras mañana.",
  "Pequeños avances diarios, grandes resultados.",
];

function saludoPorHora() {
  const h = new Date().getHours();
  if (h >= 6 && h < 12) return "Buenos días";
  if (h >= 12 && h < 20) return "Buenas tardes";
  return "Buenas noches";
}

async function initInicio() {
  const student = Party.student();
  if (!student) { location.href = "../index.html"; return; }

  const root = document.getElementById("dash");
  if (!root) return;
  root.innerHTML = `<div class="hero" style="min-height:190px">${Party.heroArt()}</div>`;

  const d = await PartyData.dashboard();
  const P = Party, esc = P.esc;
  // Horario del estudiante (si lo subió): saludo y próximas clases reales
  let greet = null;
  if (window.PartySchedule) {
    await PartySchedule.pull();
    const up = PartySchedule.upcoming(4);
    if (up.length) { d.clases = up; d.sample.clases = false; }
    else if (PartySchedule.hasSchedule()) { d.clases = []; d.sample.clases = false; }   // con horario real nunca mostrar clases de ejemplo
    greet = PartySchedule.greeting();
  }
  const tag = (k) => (d.sample[k] ? `<span class="tag-demo">Ejemplo</span>` : "");

  // ---------- Hero ----------
  const quote = QUOTES[new Date().getDate() % QUOTES.length];
  const hero = `
    <section class="hero">
      ${P.heroArt()}
      <div class="hero-text">
        <h1>¡${saludoPorHora()}, ${esc(P.firstName())}! <span aria-hidden="true">👋</span></h1>
        <p>Vamos con todo, un paso más cerca de tus metas.</p>
        ${d.demo ? `<span class="demo-pill">${P.icon("sparkles")} Vista de ejemplo — únete a un grupo para ver tus datos reales</span>` : ""}
      </div>
      <blockquote class="hero-quote" style="margin:0">“${esc(quote)}”</blockquote>
    </section>`;

  // ---------- Estadísticas ----------
  const stat = (color, icon, n, label, go) => `
    <button class="stat-card" style="--c:${color}" data-go="${go}">
      <span class="stat-ico">${P.icon(icon)}</span>
      <span><div class="stat-num">${n}</div><div class="stat-lbl">${label}</div></span>
    </button>`;
  const stats = `
    <section class="stats-row">
      ${stat("var(--color-danger)",   "calendar", d.stats.evals,   "Evaluaciones<br>esta semana", "calendario")}
      ${stat("var(--color-info)",     "tasks",    d.stats.tareas,  "Tareas pendientes",           "scrum")}
      ${stat("var(--color-success)",  "book",     d.stats.apuntes, "Apuntes<br>este semestre",    "apuntes")}
      ${stat("var(--color-accent-2)", "users",    d.stats.grupos,  "Grupos<br>activos",           "__grupos")}
    </section>`;

  // ---------- Asistente IA ----------
  const chips = [
    ["calendar", "Mi semana", "semana"], ["search", "Buscar en mis apuntes", "buscar"],
    ["tasks", "Crear tarea", "tarea"], ["book", "Resumen de asignatura", "resumen"], ["file", "Analizar archivo", "archivo"],
  ];
  const ai = `
    <section class="ai-card">
      <div class="ai-body">
        <h2 class="ai-title">${P.icon("sparkles")} Pregúntale a Party, tu asistente académico <span class="ia-badge">IA</span></h2>
        <p class="ai-sub">${greet ? greet : "Busca información, revisa tus tareas, crea eventos, encuentra archivos y más..."}</p>
        <form class="ai-input" id="aiForm" autocomplete="off">
          <input id="aiInput" placeholder="¿Qué necesitas hoy?" aria-label="Pregunta al asistente">
          <button type="button" class="mic" id="micBtn" title="Dictar" aria-label="Dictar">${P.icon("mic")}</button>
          <button type="submit" class="send" aria-label="Enviar">${P.icon("send")}</button>
        </form>
        <div class="chips">
          ${chips.map(([ic, t, k]) => `<button class="chip" data-chip="${k}">${P.icon(ic)}${t}</button>`).join("")}
        </div>
      </div>
      ${P.robot()}
    </section>`;

  // ---------- Próximas clases ----------
  const chipColors = ["var(--color-info)", "var(--color-accent-2)", "var(--color-accent-2)", "var(--color-accent)"];
  const clases = d.clases.length
    ? d.clases.map((c, i) => {
        const dt = new Date(c.date);
        return `
        <div class="row">
          <div class="date-chip" style="--c:${chipColors[i % 4]}"><small>${PartyData.DAYS_UP[dt.getDay()]}</small><b>${dt.getDate()}</b></div>
          <div class="grow"><div class="t">${esc(c.title)}</div><div class="s">${esc(c.time)}${c.room ? " | " + esc(c.room) : ""}</div></div>
          <span class="pill ${i === 0 ? "warn" : ""}">${PartyData.relLabel(c.date, true)}</span>
        </div>`;
      }).join("")
    : `<div class="empty">No tienes clases próximas.</div>`;

  // ---------- Tareas pendientes ----------
  const tareas = d.tareas.length
    ? d.tareas.map((t) => `
        <div class="row" data-task="${esc(t.id)}" data-group="${esc(t.groupId || "")}" data-real="${t.real ? 1 : 0}">
          <button class="check-circle" aria-label="Completar tarea">${P.icon("check")}</button>
          <div class="grow"><div class="t">${esc(t.title)}</div><div class="s">${esc(t.sub)}</div></div>
          <span class="pill ${t.tone || ""}">${esc(t.pill)}</span>
        </div>`).join("")
    : `<div class="empty">¡Sin tareas pendientes! 🎉</div>`;

  // ---------- Asignaturas ----------
  const subj = d.asignaturas.slice(0, 4).map((s) => `
    <button class="subject-tile" style="--c:${PartyData.subjectColors[s.color] || PartyData.subjectColors.violet}" data-go="asignaturas">
      <span class="file-ico">${P.icon(s.icon || "book")}</span>
      <span class="name">${esc(s.name)}</span>
      <span class="progress"><i style="width:${Math.max(0, Math.min(100, s.pct))}%"></i></span>
      <span class="pct">${s.pct}%</span>
    </button>`).join("");

  // ---------- Archivos recientes ----------
  const archivos = d.archivos.map((f) => {
    const m = PartyData.fileMeta(f.name);
    return `
      <div class="row clickable" data-go="biblioteca">
        <span class="file-ico" style="--c:${m.c}">${P.icon(m.icon)}</span>
        <div class="grow"><div class="t">${esc(f.name)}</div><div class="s">${esc(f.sub)}</div></div>
        <span class="kebab">${P.iconFill("more")}</span>
      </div>`;
  }).join("");

  // ---------- Actividad / recomendaciones ----------
  const actividad = d.actividad.map((a) => `
    <div class="row">
      <span class="act-ico ${a.color}">${P.icon(a.icon)}</span>
      <div class="grow"><div class="t">${esc(a.title)}</div><div class="s">${esc(a.sub)}</div></div>
    </div>`).join("");

  const recs = d.recs.map((r) => `
    <div class="row">
      <span class="act-ico ${r.color}">${P.icon(r.icon)}</span>
      <div class="grow"><div class="t">${esc(r.title)}</div><div class="s">${esc(r.sub)}</div></div>
      <button class="btn-sm" data-go="${r.tab}">${esc(r.btn)}</button>
    </div>`).join("");

  const head = (icon, title, link, go, key) => `
    <div class="card-head">
      <h3>${P.icon(icon)}${title}${key ? tag(key) : ""}</h3>
      ${link ? `<button class="btn-link" data-go="${go}">${link} ${P.icon("arrow")}</button>` : ""}
    </div>`;

  const grid = `
    <div class="dash-grid">
      <section class="p-card span-7">${head("clock", "Mis próximas clases", "Ver calendario", "calendario", "clases")}<div class="row-list">${clases}</div></section>
      <section class="p-card span-5">${head("tasks", "Tareas pendientes", "Ver todas", "scrum", "tareas")}<div class="row-list" id="taskList">${tareas}</div>
        <button class="add-link" data-go="scrum">${P.icon("plus")} Nueva tarea</button></section>

      <section class="p-card span-7">${head("book", "Asignaturas", "Ver todas", "asignaturas", "asignaturas")}<div class="subject-grid">${subj}</div></section>
      <section class="p-card span-5">${head("folder", "Archivos recientes", "Ver biblioteca", "biblioteca", "archivos")}<div class="row-list">${archivos}</div></section>

      <section class="p-card span-7">${head("zap", "Actividad reciente", "Ver todas", "scrum", "actividad")}<div class="row-list">${actividad}</div></section>
      <section class="p-card span-5">${head("sparkles", "Recomendaciones para ti", "Ver más", "asistente", "recs")}<div class="row-list">${recs}</div></section>
    </div>`;

  root.innerHTML = hero + stats + ai + grid;
  bindDashboard(root);
}

// ------------------------------------------------
// Eventos
// ------------------------------------------------
function askAssistant(text, auto) {
  localStorage.setItem(auto ? "party_assistant_query" : "party_assistant_prefill", text);
  Party.go("asistente");
}

function bindDashboard(root) {
  root.addEventListener("click", async (e) => {
    const go = e.target.closest("[data-go]");
    if (go) {
      const t = go.dataset.go;
      if (t === "__grupos") location.href = "grupos.html";
      else Party.go(t);
      return;
    }

    const chip = e.target.closest("[data-chip]");
    if (chip) {
      const k = chip.dataset.chip;
      if (k === "semana")  askAssistant("¿Qué tengo esta semana?", true);
      if (k === "buscar")  askAssistant("Buscar ", false);
      if (k === "tarea")   askAssistant("Crear tarea ", false);
      if (k === "resumen") askAssistant("Resumen de mis asignaturas", true);
      if (k === "archivo") Party.go("biblioteca");
      return;
    }

    const circle = e.target.closest(".check-circle");
    if (circle) {
      const row = circle.closest(".row");
      if (circle.classList.contains("done")) return;
      circle.classList.add("done");
      row.classList.add("is-done");
      if (row.dataset.real === "1") {
        const ok = await PartyData.completeTask(row.dataset.task, row.dataset.group);
        if (ok) showToast("¡Tarea completada! ✓", "success");
        else {
          circle.classList.remove("done");
          row.classList.remove("is-done");
          showToast("Este grupo no tiene una columna 'Finalizado'.", "warning");
        }
      } else {
        showToast("Tarea marcada (datos de ejemplo)", "success");
      }
    }
  });

  const form = document.getElementById("aiForm");
  const input = document.getElementById("aiInput");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = input.value.trim();
    if (!v) { input.focus(); return; }
    askAssistant(v, true);
  });

  document.getElementById("micBtn").addEventListener("click", () => {
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

initInicio();
