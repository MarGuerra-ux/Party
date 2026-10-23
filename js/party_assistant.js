// ================================================
// PARTY_ASSISTANT.JS — Ruta directa del asistente
// Router de intención + motor de reglas sobre Supabase.
// Resuelve consultas conocidas SIN llamar a ningún LLM
// (0 tokens). Si no reconoce la intención, devuelve null
// y la interfaz lo deriva al servicio de IA (cuando exista).
// ================================================

(function () {
  const P = (window.Party = window.Party || {});
  const A = (P.assistant = {});
  const esc = (s) => P.esc(s);

  // ---------- Intenciones ----------
  const INTENTS = [
    { id: "HELP",          re: /^(ayuda|help|qué puedes hacer|que puedes hacer|hola)\b/i },
    { id: "CREATE_TASK",   re: /^(crear|crea|agrega|agregar|nueva)\s+tarea\s*:?\s*(.*)$/i },
    { id: "WEEK",          re: /\b(qué|que|cuáles|cuales|actividades?|clases|agenda|tengo|toca|queda|hay)\b[^?.!]*\bsemana\b|\bsemana\b[^?.!]*\b(que\s+viene|próxima|proxima|siguiente)\b|mi\s+semana/i },
    { id: "EVALS",         re: /(próxim|proxim)\w*\s+(evaluaci|prueba|examen)|cuándo\s+(es|son|tengo)\s+(la\s+|el\s+|mi\s+)?(prueba|examen|evaluaci)|evaluaciones/i },
    { id: "PENDING_TASKS", re: /tareas?\s+pendientes?|(qué|que)\s+tareas|mis\s+tareas|resumir\s+tareas|resumen\s+de\s+tareas/i },
    { id: "SEARCH",        re: /^(buscar|busca|encuentra)\s+(en\s+mis\s+apuntes\s+)?(.+)$/i },
    { id: "SUBJECTS",      re: /resumen\s+de\s+(mis\s+)?asignaturas|mis\s+asignaturas|avance\s+(de\s+)?(mis\s+)?asignaturas/i },
  ];

  A.classify = (text) => {
    const t = text.trim();
    for (const it of INTENTS) {
      const m = t.match(it.re);
      if (m) return { id: it.id, match: m };
    }
    return null;
  };

  const li = (items) => `<ul>${items.map((x) => `<li>${x}</li>`).join("")}</ul>`;
  const demoNote = (d) => (d.demo ? `<span class="src">Datos de ejemplo — aún no perteneces a un grupo.</span>` : "");

  // ---------- Handlers ----------
  const H = {
    HELP: async () => ({
      html: `Soy el asistente de Party. Sin gastar IA, puedo:${li([
        "<b>¿Qué tengo esta semana?</b> — agenda de clases y evaluaciones",
        "<b>Tareas pendientes</b> — resumen de tu tablero",
        "<b>Próximas evaluaciones</b>",
        "<b>Buscar …</b> — en tus apuntes, tareas y eventos",
        "<b>Resumen de mis asignaturas</b> — avance por materia",
        "<b>Crear tarea …</b> — con confirmación antes de guardar",
      ])}Para pedidos más abiertos (resúmenes, planes de estudio) se usará un modelo de IA cuando el servicio esté conectado.`,
    }),

    // "¿Qué tengo esta semana?" → lo que RESTA de la semana (de hoy al domingo). "la próxima semana" → la siguiente.
    // Solo mezcla datos reales: el horario subido por el estudiante y los eventos de su calendario.
    WEEK: async (m, text = "") => {
      const d = await PartyData.dashboard();
      const next = /pr[oó]xima|siguiente|que\s+viene/i.test(text);
      const sched = !!(window.PartySchedule && PartySchedule.hasSchedule());
      const events = (d.demo ? [] : (d.raw?.events || []))
        .filter((e) => !(sched && e.type === "clase"))
        .map((e) => ({ date: e.event_date, title: e.title }));
      if (!sched && !events.length) return { html: `Aún no tengo tu horario ni eventos esta semana. Sube tu horario desde <b>Mis Asignaturas</b> (foto, PDF o Word) y lo organizo por ti.` };
      const nota = sched ? "" : `<span class="src">Aún no tengo tu horario: solo veo los eventos del calendario.</span>`;
      return { html: PartySchedule.weekHTML(events, next) + nota };
    },

    EVALS: async () => {
      const d = await PartyData.dashboard();
      const src = d.demo ? d.eventosProx : d.raw.events;
      const ev = src.filter((e) => e.type === "prueba" || /prueba|examen|evaluaci/i.test(e.title)).slice(0, 5);
      return { html: ev.length ? `Próximas evaluaciones:${li(ev.map((e) => `<b>${esc(e.title)}</b> — ${esc(PartyData.relLabel(e.event_date))}`))}${demoNote(d)}` : `No hay evaluaciones registradas próximamente.${demoNote(d)}` };
    },

    PENDING_TASKS: async () => {
      const d = await PartyData.dashboard();
      const items = d.demo
        ? d.tareas.map((t) => `<b>${esc(t.title)}</b> · ${esc(t.sub)} (${esc(t.pill)})`)
        : d.raw.pending.slice(0, 8).map((t) => `<b>${esc(t.title)}</b> · ${esc(t.groups?.name || "")} (${esc(t.scrum_columns?.title || "Pendiente")})`);
      return { html: items.length ? `Tienes <b>${d.stats.tareas}</b> ${d.stats.tareas === 1 ? "tarea pendiente" : "tareas pendientes"}:${li(items)}${demoNote(d)}` : `No tienes tareas pendientes. ¡Buen trabajo! 🎉${demoNote(d)}` };
    },

    SEARCH: async (m) => {
      const term = (m.match[3] || "").trim();
      if (term.length < 2) return { html: "¿Qué quieres buscar? Escribe, por ejemplo: <b>buscar normalización</b>." };
      const r = await PartyData.search(term);
      const names = { nota: "Apunte", tarea: "Tarea", evento: "Evento" };
      return { html: r.length ? `Encontré ${r.length} resultado${r.length === 1 ? "" : "s"} para “${esc(term)}”:${li(r.map((x) => `${names[x.kind] || ""}: <b>${esc(x.title)}</b>${x.sub ? " · " + esc(x.sub) : ""}`))}` : `No encontré nada con “${esc(term)}” en tus apuntes, tareas o eventos.` };
    },

    SUBJECTS: async () => {
      const { list, sample } = PartyData.getSubjects();
      return { html: `Avance por asignatura:${li(list.map((s) => `<b>${esc(s.name)}</b> — ${s.pct}%`))}${sample ? `<span class="src">Asignaturas de ejemplo: edítalas en “Mis Asignaturas”.</span>` : ""}` };
    },

    // Escritura: pide confirmación; el guardado lo hace A.confirmCreateTask
    CREATE_TASK: async (m) => {
      const title = (m.match[2] || "").trim();
      if (title.length < 3) return { html: "¿Cómo se llama la tarea? Escribe, por ejemplo: <b>crear tarea Estudiar para la prueba</b>." };
      const gid = typeof getState === "function" ? getState().selected.groupId : null;
      if (!gid) return { html: "Para crear tareas necesito que entres a un grupo (sección Grupos)." };
      return {
        html: `¿Creo esta tarea en tu grupo activo?<br><b>${esc(title)}</b>
          <div style="display:flex;gap:8px;margin-top:10px">
            <button class="btn-sm" data-act="confirm-task" data-title="${esc(title)}">Confirmar</button>
            <button class="btn-ghost" style="padding:6px 12px" data-act="cancel-task">Cancelar</button>
          </div>`,
      };
    },
  };

  // Guarda la tarea y confirma SOLO si Supabase respondió bien
  A.confirmCreateTask = async (title) => {
    const gid = getState().selected.groupId;
    const me = P.student();
    const { data: cols, error: e1 } = await supabaseClient
      .from("scrum_columns").select("id, title, position").eq("group_id", gid).order("position").limit(1);
    if (e1 || !cols?.length) return { ok: false, html: "No encontré una columna en tu tablero para guardar la tarea." };
    const row = { id: uid("t"), group_id: gid, column_id: cols[0].id, title, owner_id: me?._dev_mode ? null : me?.id, permission: "member", position: 0 };
    const { data, error } = await supabaseClient.from("scrum_tasks").insert([row]).select("id").maybeSingle();
    if (error || !data) return { ok: false, html: "No pude guardar la tarea. Inténtalo de nuevo." };
    PartyData.invalidate();
    return { ok: true, html: `✅ Tarea creada en <b>${esc(cols[0].title)}</b>: ${esc(title)}` };
  };

  // ---------- Punto de entrada ----------
  // Devuelve { html, source:'rules', intent } o null si requiere LLM
  A.route = async (text) => {
    // horario del estudiante (si lo subió): "¿qué tengo hoy?", "mi horario"
    if (window.PartySchedule) { await PartySchedule.pull(); const sc = PartySchedule.answer(text); if (sc) return { ...sc, source: "rules", intent: "SCHEDULE" }; }
    // Pedidos que exigen razonar (organizar, priorizar, comparar…) no son de reglas: pasan al agente.
    if (/\b(organiz|planific|prioriz|reorganiz|conflict|estrategi|compar|analiz|distribu)\w*/.test(text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase())) return null;
    const c = A.classify(text);
    if (!c) return null;
    try {
      const res = await H[c.id](c, text);
      return { ...res, source: "rules", intent: c.id };
    } catch (e) {
      console.error("Party assistant:", e);
      return { html: "Ocurrió un error al consultar tus datos.", source: "rules", intent: c.id };
    }
  };
})();
