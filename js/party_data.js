// ================================================
// PARTY_DATA.JS — Datos de los tableros
// Usa Supabase cuando hay datos reales; si el usuario
// no tiene grupos (o está en modo desarrollo) muestra
// datos de ejemplo, marcados como tales en la interfaz.
// ================================================

(function () {
  const D = (window.PartyData = {});
  const DAYS_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const DAYS_UP = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
  const MONTHS_UP = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
  const DONE_RE = /final|hecho|listo|done|complet|termin/i;
  const DOING_RE = /proceso|doing|curso|progreso/i;

  D.DAYS_UP = DAYS_UP;
  D.MONTHS_UP = MONTHS_UP;
  D.DONE_RE = DONE_RE;
  D.DOING_RE = DOING_RE;

  // ------------------------------------------------
  // Fechas
  // ------------------------------------------------
  const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const dayDiff = (a, b) => Math.round((startOfDay(a) - startOfDay(b)) / 864e5);
  const pad = (n) => String(n).padStart(2, "0");
  D.hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  D.dayDiff = dayDiff;

  D.relLabel = (iso, withTime = false) => {
    const d = new Date(iso), now = new Date();
    const diff = dayDiff(d, now);
    if (diff === 0) {
      if (withTime && d > now) {
        const mins = Math.round((d - now) / 60000);
        if (mins < 60) return `En ${Math.max(mins, 1)} min`;
        const h = Math.round(mins / 60);
        return `En ${h} ${h === 1 ? "hora" : "horas"}`;
      }
      return "Hoy";
    }
    if (diff === 1) return "Mañana";
    if (diff < 0) return d.toLocaleDateString("es-CL", { day: "numeric", month: "short" });
    if (diff <= 6) return `${DAYS_SHORT[d.getDay()]} ${d.getDate()}`;
    return `En ${diff} días`;
  };

  D.ago = (iso) => {
    if (!iso) return "";
    const d = new Date(iso), s = Math.floor((Date.now() - d) / 1000);
    if (s < 60) return "Hace un momento";
    if (s < 3600) return `Hace ${Math.floor(s / 60)} min`;
    if (s < 86400) { const h = Math.floor(s / 3600); return `Hace ${h} ${h === 1 ? "hora" : "horas"}`; }
    if (s < 604800) { const n = Math.floor(s / 86400); return `Hace ${n} ${n === 1 ? "día" : "días"}`; }
    if (s < 2592000) { const n = Math.floor(s / 604800); return `Hace ${n} ${n === 1 ? "semana" : "semanas"}`; }
    return d.toLocaleDateString("es-CL", { day: "numeric", month: "short" });
  };

  const addDays = (n, h = 0, m = 0) => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(h, m, 0, 0); return d; };
  const hoursAgo = (h) => new Date(Date.now() - h * 36e5).toISOString();

  D.fileMeta = (name = "") => {
    const ext = name.split(".").pop().toLowerCase();
    if (ext === "pdf") return { c: "var(--color-danger)", icon: "file" };
    if (ext === "zip" || ext === "rar") return { c: "var(--color-accent)", icon: "folder" };
    if (ext === "csv" || ext === "xlsx") return { c: "var(--color-success)", icon: "chart" };
    if (ext === "ppt" || ext === "pptx") return { c: "var(--color-warning)", icon: "layout" };
    return { c: "var(--color-accent-2)", icon: "file" };
  };

  // ------------------------------------------------
  // Contexto del usuario
  // ------------------------------------------------
  let _ctx = null, _dash = null;

  D.ctx = async () => {
    if (_ctx) return _ctx;
    const st = Party.student();
    let memberships = [];
    if (st && !st._dev_mode && (typeof supabaseClient !== "undefined" && supabaseClient)) {
      try {
        const { data } = await supabaseClient
          .from("student_groups").select("role, group_id, groups(id, name)").eq("student_id", st.id);
        memberships = data || [];
      } catch (e) { console.warn("Party: no se pudieron cargar las membresías", e); }
    }
    _ctx = { student: st, memberships, groupIds: memberships.map((m) => m.group_id), demo: !memberships.length };
    return _ctx;
  };

  D.invalidate = () => { _dash = null; };

  // ------------------------------------------------
  // Asignaturas (guardadas en el navegador)
  // ------------------------------------------------
  const SUBJ_KEY = "party_asignaturas";
  const SAMPLE_SUBJECTS = [
    { id: "s1", name: "Taller de BDD",    icon: "database", color: "violet", pct: 70 },
    { id: "s2", name: "Ing. de Software", icon: "code",     color: "blue",   pct: 45 },
    { id: "s3", name: "Cálculo II",       icon: "sigma",    color: "green",  pct: 30 },
    { id: "s4", name: "Redes de Comp.",   icon: "network",  color: "teal",   pct: 60 },
  ];
  D.subjectColors = { violet: "#8b5cf6", blue: "#4f8cff", green: "#2dd4a0", teal: "#22d3c5", pink: "#ec4899", amber: "#f5a524" };
  D.getSubjects = () => {
    try {
      const raw = localStorage.getItem(SUBJ_KEY);
      if (raw) return { list: JSON.parse(raw), sample: false };
    } catch {}
    return { list: SAMPLE_SUBJECTS.map((s) => ({ ...s })), sample: true };
  };
  D.saveSubjects = (list) => { if (window.PartyStore) PartyStore.set(SUBJ_KEY, list); else localStorage.setItem(SUBJ_KEY, JSON.stringify(list)); D.invalidate(); };

  // ------------------------------------------------
  // Datos de ejemplo
  // ------------------------------------------------
  function buildDemo() {
    // Los ejemplos usan los nombres de TUS asignaturas (si ya las creaste) en vez de "Cálculo II", etc.
    const _s = D.getSubjects();
    const nice = (n) => { const x = String(n).replace(/_\s*\d{3}[A-Za-z]?\s*$/, "").replace(/\s+/g, " ").trim(); return window.ScheduleParser?.title ? ScheduleParser.title(x) : x; };
    const real = _s.sample ? null : _s.list.map((x) => nice(x.name));
    const sn = (i, fallback) => (real ? (real.length ? real[i % real.length] : "tu asignatura") : fallback);
    const weekdays = [];
    for (let i = 0; weekdays.length < 4; i++) {
      const d = addDays(i);
      if (d.getDay() !== 0 && d.getDay() !== 6) weekdays.push(i);
    }
    const slots = [
      { title: sn(0, "Taller de Bases de Datos"), h: 10, m: 0, end: "11:30", room: "Sala 09" },
      { title: sn(1, "Ingeniería de Software"),   h: 14, m: 0, end: "15:30", room: "Sala 12" },
      { title: sn(2, "Cálculo II"),               h: 8,  m: 0, end: "09:30", room: "Sala 08" },
      { title: sn(3, "Inglés Técnico"),           h: 10, m: 0, end: "11:30", room: "Sala 07" },
    ];
    const clases = slots.map((s, i) => {
      const d = addDays(weekdays[i], s.h, s.m);
      return { title: s.title, date: d.toISOString(), time: `${D.hhmm(d)} - ${s.end}`, room: s.room };
    });

    const evalDay = addDays(2, 9, 0);
    const tareas = [
      { id: "d1", title: "Informe de laboratorio",     sub: sn(0, "Taller de BDD"),         pill: D.relLabel(addDays(1)), tone: "danger" },
      { id: "d2", title: "Resolver ejercicios guía 3", sub: sn(2, "Cálculo II"),            pill: D.relLabel(addDays(2)), tone: "" },
      { id: "d3", title: "Preparar presentación",      sub: sn(1, "Ing. de Software"),      pill: D.relLabel(addDays(3)), tone: "" },
      { id: "d4", title: "Leer capítulo 5",            sub: sn(3, "Redes de Computadores"), pill: D.relLabel(addDays(3)), tone: "" },
    ];
    const longDate = evalDay.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });
    return {
      demo: true,
      stats: { evals: 3, tareas: 5, apuntes: 12, grupos: 2 },
      clases, tareas,
      archivos: [
        { name: "PPT_3.1_Ciclos_SQL.pdf",              sub: sn(0, "Taller de BDD") + " · " + D.ago(hoursAgo(2)) },
        { name: "Apuntes Clase 5 - Normalización.pdf", sub: sn(0, "Taller de BDD") + " · Ayer" },
        { name: "Guía_3.pdf",                          sub: sn(2, "Cálculo II") + " · Ayer" },
      ],
      actividad: [
        { icon: "upload",   color: "green",  title: "Subiste un nuevo apunte", sub: `Apuntes Clase 5 - Normalización.pdf · ${sn(0, "Taller de BDD")} · ${D.ago(hoursAgo(2))}` },
        { icon: "tasks",    color: "violet", title: "Creaste una tarea",       sub: `Resolver ejercicios guía 3 · ${sn(2, "Cálculo II")} · ${D.ago(hoursAgo(5))}` },
        { icon: "calendar", color: "amber",  title: "Nuevo evento detectado",  sub: `Se encontró "${longDate} examen" · ${sn(2, "Cálculo II")} · ${D.ago(hoursAgo(26))}` },
      ],
      recs: [
        { icon: "note",     color: "violet", title: "Tienes 2 apuntes sin revisar",      sub: sn(0, "Taller de BDD"),           btn: "Revisar", tab: "apuntes" },
        { icon: "calendar", color: "amber",  title: "Se detectó una posible evaluación", sub: longDate.charAt(0).toUpperCase() + longDate.slice(1), btn: "Agregar", tab: "calendario" },
        { icon: "book",     color: "green",  title: "Materia rezagada en el chat",       sub: "PPT 3.1 · " + sn(0, "Taller de BDD"), btn: "Ver",     tab: "asistente" },
      ],
      eventosProx: [{ title: "Evaluación de " + sn(2, "Cálculo II"), event_date: evalDay.toISOString(), type: "prueba" }],
      sample: { clases: true, tareas: true, archivos: true, actividad: true, recs: true },
    };
  }
  D.demo = buildDemo;

  // ------------------------------------------------
  // Dashboard personal
  // ------------------------------------------------
  D.dashboard = () => (_dash ||= buildDashboard());

  async function buildDashboard() {
    const c = await D.ctx();
    const demo = buildDemo();
    const subj = D.getSubjects();
    demo.asignaturas = subj.list;
    demo.sample.asignaturas = subj.sample;
    if (c.demo || !(typeof supabaseClient !== "undefined" && supabaseClient)) return demo;

    const ids = c.groupIds, me = c.student.id;
    const today = startOfDay(new Date());
    const now = new Date();
    const semStart = new Date(now.getFullYear(), now.getMonth() < 7 ? 2 : 7, 1).toISOString();
    const q = (p) => p.then((r) => r.data || []).catch(() => []);

    const [tasks, events, notesCount, recentEvents, recentNotes] = await Promise.all([
      q(supabaseClient.from("scrum_tasks")
        .select("id, title, group_id, column_id, owner_id, created_at, groups(name), scrum_columns(title), owner:owner_id(full_name)")
        .in("group_id", ids).order("created_at", { ascending: false }).limit(200)),
      q(supabaseClient.from("events")
        .select("id, title, event_date, type, description, group_id, groups(name)")
        .in("group_id", ids).gte("event_date", today.toISOString()).order("event_date", { ascending: true }).limit(60)),
      supabaseClient.from("notes").select("id", { count: "exact", head: true }).in("group_id", ids).gte("created_at", semStart)
        .then((r) => r.count || 0).catch(() => 0),
      q(supabaseClient.from("events")
        .select("id, title, created_at, owner_id, groups(name), owner:owner_id(full_name)")
        .in("group_id", ids).order("created_at", { ascending: false }).limit(4)),
      q(supabaseClient.from("notes")
        .select("id, title, created_at, owner_id, groups(name), owner:owner_id(full_name)")
        .in("group_id", ids).order("created_at", { ascending: false }).limit(4)),
    ]);

    const isDone = (t) => DONE_RE.test(t.scrum_columns?.title || "");
    const pending = tasks.filter((t) => !isDone(t));
    const mine = pending.filter((t) => t.owner_id === me);
    const list = mine.length ? mine : pending;

    const weekEnd = new Date(now.getTime() + 7 * 864e5);
    const evals = events.filter((e) => (e.type === "prueba" || /prueba|examen|evaluaci/i.test(e.title)) && new Date(e.event_date) <= weekEnd);

    const out = { ...demo, demo: false, sample: { ...demo.sample } };
    out.stats = { evals: evals.length, tareas: list.length, apuntes: notesCount, grupos: ids.length };

    out.tareas = list.slice(0, 4).map((t) => ({
      id: t.id, groupId: t.group_id, real: true,
      title: t.title, sub: t.groups?.name || "Grupo",
      pill: t.scrum_columns?.title || "Pendiente",
      tone: DOING_RE.test(t.scrum_columns?.title || "") ? "info" : "",
    }));
    out.sample.tareas = false;

    const clases = events.filter((e) => e.type === "clase").slice(0, 4);
    if (clases.length) {
      out.clases = clases.map((e) => ({ title: e.title, date: e.event_date, time: D.hhmm(new Date(e.event_date)), room: e.description || e.groups?.name || "" }));
      out.sample.clases = false;
    }

    out.eventosProx = events.filter((e) => dayDiff(new Date(e.event_date), now) <= 7).slice(0, 8);

    const nameOf = (r) => (r.owner_id === me ? null : r.owner?.full_name?.split(" ")[0] || "Alguien");
    const act = [];
    tasks.slice(0, 4).forEach((t) => act.push({ at: t.created_at, icon: "tasks", color: "violet",
      title: nameOf(t) ? `${nameOf(t)} creó una tarea` : "Creaste una tarea", sub: `${t.title} · ${t.groups?.name || ""}` }));
    recentEvents.forEach((e) => act.push({ at: e.created_at, icon: "calendar", color: "amber",
      title: nameOf(e) ? `${nameOf(e)} añadió un evento` : "Añadiste un evento", sub: `${e.title} · ${e.groups?.name || ""}` }));
    recentNotes.forEach((n) => act.push({ at: n.created_at, icon: "note", color: "green",
      title: nameOf(n) ? `${nameOf(n)} guardó un apunte` : "Guardaste un apunte", sub: `${n.title} · ${n.groups?.name || ""}` }));
    act.sort((a, b) => new Date(b.at) - new Date(a.at));
    if (act.length) {
      out.actividad = act.slice(0, 4).map((a) => ({ ...a, sub: `${a.sub} · ${D.ago(a.at)}` }));
      out.sample.actividad = false;
    }

    const recs = [];
    if (evals[0]) recs.push({ icon: "calendar", color: "amber", title: `Prepárate para "${evals[0].title}"`, sub: `${D.relLabel(evals[0].event_date)} · ${evals[0].groups?.name || ""}`, btn: "Ver", tab: "calendario" });
    if (list.length) recs.push({ icon: "tasks", color: "violet", title: `Tienes ${list.length} ${list.length === 1 ? "tarea pendiente" : "tareas pendientes"}`, sub: "Organiza tu semana", btn: "Revisar", tab: "scrum" });
    if (recentNotes[0]) recs.push({ icon: "note", color: "green", title: "Repasa tu último apunte", sub: recentNotes[0].title, btn: "Abrir", tab: "apuntes" });
    if (recs.length) { out.recs = recs; out.sample.recs = false; }

    out.raw = { tasks, events, pending: list };
    return out;
  }

  D.completeTask = async (taskId, groupId) => {
    const { data: cols } = await supabaseClient.from("scrum_columns").select("id, title").eq("group_id", groupId);
    const done = (cols || []).find((c) => DONE_RE.test(c.title));
    if (!done) return false;
    const { error } = await supabaseClient.from("scrum_tasks").update({ column_id: done.id }).eq("id", taskId);
    if (!error) D.invalidate();
    return !error;
  };

  D.notifications = async () => {
    const d = await D.dashboard();
    const out = [];
    (d.eventosProx || []).filter((e) => dayDiff(new Date(e.event_date), new Date()) <= 3).slice(0, 3).forEach((e) =>
      out.push({ icon: "calendar", color: e.type === "prueba" ? "red" : "amber", title: e.title, sub: `${D.relLabel(e.event_date)} · ${D.hhmm(new Date(e.event_date))}`, tab: "calendario" }));
    if (d.stats.tareas) out.push({ icon: "tasks", color: "violet", title: `${d.stats.tareas} ${d.stats.tareas === 1 ? "tarea pendiente" : "tareas pendientes"}`, sub: "Revisa tu tablero", tab: "scrum" });
    return out;
  };

  // ------------------------------------------------
  // Búsqueda global (Ctrl K) y búsqueda de apuntes
  // ------------------------------------------------
  D.search = async (term) => {
    const c = await D.ctx();
    const clean = term.replace(/[%,()]/g, " ").trim();
    const lower = clean.toLowerCase();
    if (c.demo || !(typeof supabaseClient !== "undefined" && supabaseClient)) {
      const d = buildDemo();
      return [
        ...d.tareas.filter((t) => (t.title + t.sub).toLowerCase().includes(lower))
          .map((t) => ({ kind: "tarea", tab: "scrum", icon: "tasks", color: "violet", title: t.title, sub: t.sub })),
        ...d.archivos.filter((a) => a.name.toLowerCase().includes(lower))
          .map((a) => ({ kind: "nota", tab: "apuntes", icon: "note", color: "green", title: a.name, sub: a.sub })),
      ];
    }
    const ids = c.groupIds, like = `%${clean}%`;
    const q = (p) => p.then((r) => r.data || []).catch(() => []);
    const [notes, tasks, events] = await Promise.all([
      q(supabaseClient.from("notes").select("id, title, groups(name)").in("group_id", ids).ilike("title", like).limit(4)),
      q(supabaseClient.from("scrum_tasks").select("id, title, groups(name)").in("group_id", ids).ilike("title", like).limit(4)),
      q(supabaseClient.from("events").select("id, title, event_date, groups(name)").in("group_id", ids).ilike("title", like).limit(4)),
    ]);
    return [
      ...notes.map((n) => ({ kind: "nota", tab: "apuntes", icon: "note", color: "green", title: n.title, sub: n.groups?.name })),
      ...tasks.map((t) => ({ kind: "tarea", tab: "scrum", icon: "tasks", color: "violet", title: t.title, sub: t.groups?.name })),
      ...events.map((e) => ({ kind: "evento", tab: "calendario", icon: "calendar", color: "amber", title: e.title, sub: `${D.relLabel(e.event_date)} · ${e.groups?.name || ""}` })),
    ];
  };
})();
