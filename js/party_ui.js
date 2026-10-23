// ================================================
// PARTY_UI.JS — Shell compartido
// Iconos, logo, ilustraciones, menú lateral, topbar,
// buscador (Ctrl K), notificaciones y menú de usuario.
// ================================================

(function () {
  const P = (window.Party = window.Party || {});

  // ------------------------------------------------
  // Utilidades
  // ------------------------------------------------
  P.esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  P.student = () => {
    try { return JSON.parse(localStorage.getItem("active_student")); } catch { return null; }
  };
  P.firstName = () => (P.student()?.full_name || "Estudiante").trim().split(/\s+/)[0];
  P.initial = (name) => (name || "?").trim().charAt(0).toUpperCase();

  P.role = () => {
    try {
      const st = typeof getState === "function" ? getState() : null;
      return st?.session?.active_role || st?.session?.role || "student";
    } catch { return "student"; }
  };

  // Pestañas visibles según rol (null = todas)
  P.allowedTabs = (role = P.role()) => {
    if (role === "master") return null;
    if (role === "admin")
      return ["inicio", "miembros", "institucion", "grupos", "mensajeria", "anuncios", "asistente", "configuraciones"];
    if (role === "teacher")
      return ["inicio", "miembros", "calendario", "biblioteca", "chat", "mensajeria", "anuncios", "encuestas", "sorteo",
              "constructor_ia", "agentes_ia", "asistente", "asignaturas", "integraciones", "grupos", "configuraciones"];
    return ["inicio", "miembros", "scrum", "calendario", "apuntes", "biblioteca", "chat", "mensajeria", "anuncios",
            "lista", "sorteo", "encuestas", "constructor_ia", "agentes_ia", "asistente", "asignaturas", "integraciones",
            "grupos", "configuraciones"];
  };

  // ------------------------------------------------
  // Iconos (trazo 24x24, estilo lineal)
  // ------------------------------------------------
  const ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    dashboard: '<rect x="3" y="3" width="7.5" height="9" rx="2"/><rect x="13.5" y="3" width="7.5" height="5.5" rx="2"/><rect x="13.5" y="11.5" width="7.5" height="9.5" rx="2"/><rect x="3" y="15" width="7.5" height="6" rx="2"/>',
    book: '<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>',
    note: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    library: '<rect x="3.5" y="4" width="4.5" height="16" rx="1.2"/><rect x="9.5" y="4" width="4.5" height="16" rx="1.2"/><path d="m15.8 6.2 3.6-1 3 12.8-3.6 1z"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>',
    tasks: '<rect x="3" y="3" width="18" height="18" rx="4.5"/><path d="m8 12 3 3 5-6"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14c2.8 0 4.5 1.9 4.5 5"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.6A8 8 0 1 1 21 12z"/>',
    bot: '<rect x="4" y="8" width="16" height="12" rx="4.5"/><path d="M12 4v4M9 14v1.5M15 14v1.5"/><circle cx="12" cy="3.3" r="1"/>',
    chart: '<rect x="3" y="3" width="18" height="18" rx="4.5"/><path d="M8 17v-5M12 17V8M16 17v-3"/>',
    dice: '<path d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7z"/><path d="M12 12 3.5 7M12 12l8.5-5M12 12v9.5"/>',
    megaphone: '<path d="M3 11v3a1 1 0 0 0 1 1h3l8 4V6L7 10H4a1 1 0 0 0-1 1z"/><path d="M18.5 9a4 4 0 0 1 0 6"/>',
    building: '<path d="M3 21h18M5 21V9l7-5 7 5v12"/><path d="M9 21v-6h6v6M9 11h.01M15 11h.01"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    sparkles: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 3v4M17 5h4M5 17v4M3 19h4"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
    plug: '<path d="M9 2v5M15 2v5M6 7h12v4a6 6 0 0 1-12 0zM12 17v5"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    cap: '<path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 8 9 6 9-6"/>',
    layout: '<rect x="3" y="3" width="18" height="18" rx="3.5"/><path d="M3 9h18M9 21V9"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8z"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    cloud: '<path d="M7 18a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 9.5 4.3 4.3 0 0 1 17.5 18z"/>',
    video: '<rect x="2.5" y="6" width="13" height="12" rx="3"/><path d="m15.5 10.5 6-3.5v10l-6-3.5z"/>',
    more: '<circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>',
    database: '<ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    code: '<path d="m8 8-5 4 5 4M16 8l5 4-5 4M14 5l-4 14"/>',
    sigma: '<path d="M18 5H6l6 7-6 7h12"/>',
    network: '<circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="19" r="2.5"/><circle cx="19" cy="19" r="2.5"/><path d="M12 7.5v4M12 11.5 6 17M12 11.5l6 5.5"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 2-2 0-1.5-1-1.7-1-3 0-1 .8-2 2-2h2.5A3.5 3.5 0 0 0 21 10.5C21 6.4 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7" r="1"/>',
    crown: '<path d="M3 18 2 7l5.5 4L12 4l4.5 7L22 7l-1 11z"/><path d="M4 21h16"/>',
    construction: '<path d="m14.7 6.3 3 3M3 21l6.5-1.5L20 9a2.1 2.1 0 0 0-3-3L6.5 16.5z"/>',
  };
  P.icon = (name, cls = "") =>
    `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ""}</svg>`;
  P.iconFill = (name) => P.icon(name, "fill");

  // ------------------------------------------------
  // Logo (tres personas)
  // ------------------------------------------------
  P.logo = (cls = "logo") => `
    <svg class="${cls}" viewBox="0 0 64 52" aria-hidden="true">
      <defs>
        <linearGradient id="pgA" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7dd3fc"/><stop offset="1" stop-color="#4f6bff"/></linearGradient>
        <linearGradient id="pgB" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c4b5fd"/><stop offset="1" stop-color="#7c3aed"/></linearGradient>
        <linearGradient id="pgC" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f9a8d4"/><stop offset="1" stop-color="#ec4899"/></linearGradient>
      </defs>
      <circle cx="13" cy="19" r="7" fill="url(#pgA)"/>
      <path d="M2 44c0-8 5-13 11-13s11 5 11 13z" fill="url(#pgA)"/>
      <circle cx="51" cy="19" r="7" fill="url(#pgC)"/>
      <path d="M40 44c0-8 5-13 11-13s11 5 11 13z" fill="url(#pgC)"/>
      <circle cx="32" cy="14" r="8.5" fill="url(#pgB)" stroke="#0e1630" stroke-width="2"/>
      <path d="M18 48c0-10 6-16 14-16s14 6 14 16z" fill="url(#pgB)" stroke="#0e1630" stroke-width="2"/>
    </svg>`;

  // ------------------------------------------------
  // Ilustración del hero (atardecer + montañas)
  // ------------------------------------------------
  P.heroArt = () => `
    <svg class="hero-art" viewBox="0 0 1000 240" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <radialGradient id="hSunGlow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffb36b" stop-opacity=".75"/><stop offset="1" stop-color="#ff6aa2" stop-opacity="0"/></radialGradient>
        <linearGradient id="hSun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd27a"/><stop offset="1" stop-color="#ff6f91"/></linearGradient>
        <linearGradient id="hMtA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b2f86"/><stop offset="1" stop-color="#2a1760"/></linearGradient>
        <linearGradient id="hMtB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2d1a6b"/><stop offset="1" stop-color="#150f45"/></linearGradient>
      </defs>
      <g fill="#fff">
        <circle cx="90" cy="30" r="1.6" opacity=".8"/><circle cx="210" cy="64" r="1.2" opacity=".6"/><circle cx="330" cy="22" r="1.8" opacity=".9"/>
        <circle cx="470" cy="48" r="1.2" opacity=".6"/><circle cx="640" cy="26" r="1.6" opacity=".8"/><circle cx="780" cy="58" r="1.2" opacity=".6"/>
        <circle cx="905" cy="34" r="1.8" opacity=".85"/><circle cx="155" cy="104" r="1" opacity=".5"/><circle cx="560" cy="86" r="1" opacity=".5"/>
      </g>
      <circle cx="610" cy="176" r="120" fill="url(#hSunGlow)"/>
      <circle cx="610" cy="182" r="46" fill="url(#hSun)"/>
      <path d="M0 240V160l70-42 62 46 78-70 74 62 70-34 96 76 60-40 82 54 88-62 80 50 90-58 70 44 80-40v94z" fill="url(#hMtA)" opacity=".95"/>
      <path d="M0 240V196l90-36 80 40 100-58 90 66 110-50 80 44 120-60 90 62 100-44 140 42v98z" fill="url(#hMtB)"/>
    </svg>`;

  // ------------------------------------------------
  // Robot asistente
  // ------------------------------------------------
  P.robot = () => `
    <svg class="robot" viewBox="0 0 200 210" aria-hidden="true">
      <defs>
        <radialGradient id="rGlow" cx="50%" cy="55%" r="50%"><stop offset="0" stop-color="#8b5cf6" stop-opacity=".55"/><stop offset="1" stop-color="#8b5cf6" stop-opacity="0"/></radialGradient>
        <linearGradient id="rBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#c9d2ff"/></linearGradient>
        <linearGradient id="rSuit" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5b7cff"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient>
      </defs>
      <circle cx="100" cy="115" r="92" fill="url(#rGlow)"/>
      <rect x="62" y="118" width="76" height="66" rx="30" fill="url(#rBody)"/>
      <rect x="80" y="134" width="40" height="26" rx="13" fill="url(#rSuit)"/>
      <circle cx="100" cy="147" r="5" fill="#bff3ff"/>
      <ellipse cx="54" cy="146" rx="13" ry="18" fill="url(#rBody)" transform="rotate(14 54 146)"/>
      <path d="M140 138c14-4 24-18 22-36" stroke="#e5e9ff" stroke-width="17" stroke-linecap="round" fill="none"/>
      <circle cx="162" cy="98" r="11" fill="#ffffff"/>
      <rect x="40" y="34" width="120" height="88" rx="38" fill="url(#rBody)"/>
      <circle cx="36" cy="80" r="10" fill="url(#rSuit)"/><circle cx="164" cy="80" r="10" fill="url(#rSuit)"/>
      <rect x="53" y="48" width="94" height="58" rx="28" fill="#0f1544"/>
      <rect x="53" y="48" width="94" height="58" rx="28" fill="none" stroke="#3b4bb8" stroke-width="1.5"/>
      <ellipse cx="82" cy="72" rx="9" ry="11" fill="#55d6ff"/><ellipse cx="118" cy="72" rx="9" ry="11" fill="#55d6ff"/>
      <ellipse cx="85" cy="68" rx="3" ry="4" fill="#fff" opacity=".85"/><ellipse cx="121" cy="68" rx="3" ry="4" fill="#fff" opacity=".85"/>
      <path d="M88 90q12 9 24 0" stroke="#55d6ff" stroke-width="3.5" stroke-linecap="round" fill="none"/>
      <path d="M100 34V20" stroke="#c9d2ff" stroke-width="4" stroke-linecap="round"/>
      <circle cx="100" cy="15" r="6" fill="#f472b6"/>
      <path d="M176 38l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="#fff" opacity=".95"/>
      <path d="M24 52l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill="#9ab0ff"/>
      <path d="M186 134l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#c4b5fd"/>
    </svg>`;

  // ------------------------------------------------
  // Navegación
  // ------------------------------------------------
  const ON_PANEL = () => !!document.getElementById("inicio") && !!document.querySelector(".tab[data-tab]");

  P.MAIN_NAV = [
    { id: "inicio",          label: "Inicio",          icon: "home",      href: "inicio.html" },
    { id: "asignaturas",     label: "Mis Asignaturas", icon: "book",      tab: "asignaturas" },
    { id: "apuntes",         label: "Apuntes",         icon: "note",      tab: "apuntes" },
    { id: "biblioteca",      label: "Biblioteca",      icon: "library",   tab: "biblioteca" },
    { id: "calendario",      label: "Calendario",      icon: "calendar",  tab: "calendario" },
    { id: "scrum",           label: "Tareas",          icon: "tasks",     tab: "scrum" },
    { id: "grupos",          label: "Grupos",          icon: "users",     href: "grupos.html" },
    { id: "asistente",       label: "Chat IA",         icon: "chat",      tab: "asistente", badge: "Nuevo" },
    { id: "agentes_ia",      label: "Agentes IA",      icon: "bot",       tab: "agentes_ia" },
    { id: "encuestas",       label: "Encuestas",       icon: "chart",     tab: "encuestas" },
    { id: "sorteo",          label: "Sorteos",         icon: "dice",      tab: "sorteo" },
    { id: "anuncios",        label: "Anuncios",        icon: "megaphone", tab: "anuncios" },
    { id: "institucion",     label: "Institución",     icon: "building",  tab: "institucion" },
    { id: "configuraciones", label: "Configuración",   icon: "settings",  tab: "configuraciones" },
  ];

  P.GROUP_NAV = [
    { tab: "inicio",          label: "Panel",          icon: "dashboard" },
    { tab: "grupos",          label: "Grupos",         icon: "users" },
    { tab: "miembros",        label: "Miembros",       icon: "cap" },
    { tab: "scrum",           label: "Tareas",         icon: "tasks" },
    { tab: "calendario",      label: "Calendario",     icon: "calendar" },
    { tab: "apuntes",         label: "Apuntes",        icon: "note" },
    { tab: "biblioteca",      label: "Biblioteca",     icon: "library" },
    { tab: "chat",            label: "Chat del grupo", icon: "chat" },
    { tab: "agentes_ia",      label: "Agentes IA",     icon: "bot" },
    { tab: "encuestas",       label: "Encuestas",      icon: "chart" },
    { tab: "sorteo",          label: "Sorteos",        icon: "dice" },
    { tab: "anuncios",        label: "Anuncios",       icon: "megaphone" },
    { tab: "configuraciones", label: "Configuración",  icon: "settings" },
    { sep: "Más herramientas" },
    { tab: "asistente",       label: "Chat IA",        icon: "sparkles", badge: "Nuevo" },
    { tab: "asignaturas",     label: "Mis Asignaturas",icon: "book" },
    { tab: "lista",           label: "Listas",         icon: "list" },
    { tab: "mensajeria",      label: "Mensajería",     icon: "mail" },
    { tab: "constructor_ia",  label: "Constructor IA", icon: "layout" },
    { tab: "institucion",     label: "Institución",    icon: "building" },
  ];

  // Ir a una sección del panel (desde cualquier página)
  P.go = (tab) => {
    const btn = document.querySelector(`.tab[data-tab="${tab}"]`);
    if (btn && ON_PANEL()) {
      btn.click();
      document.querySelector(".app")?.classList.remove("nav-open");
      return;
    }
    localStorage.setItem("panel_tab_inicial", tab);
    location.href = "panel.html";
  };

  P.logout = () => {
    localStorage.removeItem("active_student");
    localStorage.removeItem("logichive_v1");
    location.href = "../index.html";
  };

  // Estado "próximamente" reutilizable para las secciones en construcción
  P.soon = (wrapId, icon, title, text) => {
    const wrap = document.getElementById(wrapId);
    if (!wrap) return;
    wrap.innerHTML = `
      <div class="p-card soon">
        <span class="file-ico">${P.icon(icon)}</span>
        <h3>${P.esc(title)}</h3>
        <p>${P.esc(text)}</p>
      </div>`;
  };

  // ------------------------------------------------
  // Toast global y modal (reemplazan alert/prompt)
  // ------------------------------------------------
  if (typeof window.showToast !== "function") {
    window.showToast = function (msg, type = "info") {
      const colors = { info: "#1e2a5a", success: "#0f3d33", danger: "#4a1822", warning: "#4a3208" };
      const t = document.createElement("div");
      t.textContent = msg;
      t.style.cssText = `position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
        background:${colors[type] || colors.info};color:#eef1fb;padding:11px 22px;border-radius:99px;
        font-size:13px;font-weight:600;z-index:9999;pointer-events:none;
        border:1px solid rgba(255,255,255,.12);box-shadow:0 12px 30px rgba(0,0,0,.4);animation:fadeInUp .2s ease;`;
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 2600);
    };
  }

  P.modal = ({ title, text = "", html = "", confirm = "Aceptar", cancel = "Cancelar", onConfirm }) => {
    const ov = document.createElement("div");
    ov.className = "p-modal-overlay";
    ov.innerHTML = `
      <div class="p-modal" role="dialog" aria-modal="true">
        <h3>${P.esc(title)}</h3>
        ${text ? `<p>${P.esc(text)}</p>` : ""}
        <div class="p-modal-body">${html}</div>
        <div class="actions">
          ${cancel ? `<button class="btn secondary" data-x="cancel">${P.esc(cancel)}</button>` : ""}
          <button class="btn primary" data-x="ok">${P.esc(confirm)}</button>
        </div>
      </div>`;
    const close = () => ov.remove();
    ov.addEventListener("click", async (e) => {
      if (e.target === ov || e.target.dataset.x === "cancel") close();
      if (e.target.dataset.x === "ok") {
        const keep = onConfirm ? await onConfirm(ov) : undefined;
        if (keep !== false) close();
      }
    });
    document.body.appendChild(ov);
    ov.querySelector("input,textarea,select")?.focus();
    return ov;
  };

  // ------------------------------------------------
  // Construcción del shell
  // ------------------------------------------------
  function renderSidebar(mode, active) {
    const side = document.getElementById("partySide");
    if (!side) return;
    const allowed = P.allowedTabs();
    const ok = (tab) => !allowed || allowed.includes(tab);
    let html = "";

    if (mode === "group") {
      html = P.GROUP_NAV.map((it) => {
        if (it.sep) return `<div class="nav-sep">${it.sep}</div>`;
        return `<button class="nav-item tab${it.tab === "inicio" ? " active" : ""}" data-tab="${it.tab}" ${ok(it.tab) ? "" : 'style="display:none"'}>
          ${P.icon(it.icon)}<span class="grow">${it.label}</span>${it.badge ? `<span class="nav-badge">${it.badge}</span>` : ""}</button>`;
      }).join("");
      html += `<div class="side-spacer"></div>
        <button class="back-btn" onclick="location.href='inicio.html'">${P.icon("home")} Volver al inicio</button>`;
    } else {
      html = P.MAIN_NAV.filter((it) => !it.tab || ok(it.tab))
        .map((it) => {
          const act = it.id === active ? " active" : "";
          const badge = it.badge ? `<span class="nav-badge">${it.badge}</span>` : "";
          const inner = `${P.icon(it.icon)}<span class="grow">${it.label}</span>${badge}`;
          return it.href
            ? `<a class="nav-item${act}" href="${it.href}">${inner}</a>`
            : `<button class="nav-item${act}" data-go="${it.tab}">${inner}</button>`;
        })
        .join("");
      html += `<div class="side-spacer"></div>
        <div class="pro-card">
          <div class="t">${P.icon("crown")} Party Pro</div>
          <p>Potencia tu experiencia con más funciones de IA</p>
          <button class="btn primary" id="proBtn">Ver planes</button>
        </div>`;
    }
    side.innerHTML = html;

    side.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => P.go(b.dataset.go)));
    side.querySelector("#proBtn")?.addEventListener("click", () =>
      P.modal({
        title: "Party Pro",
        text: "Más funciones de IA, almacenamiento extendido y agentes personalizados. Los planes se anunciarán pronto.",
        confirm: "Entendido",
        cancel: "",
      })
    );
    side.addEventListener("click", (e) => {
      if (e.target.closest(".nav-item")) document.querySelector(".app")?.classList.remove("nav-open");
    });
  }

  function renderBrand() {
    const el = document.getElementById("partyBrand");
    if (!el) return;
    el.setAttribute("href", "inicio.html");
    el.innerHTML = `${P.logo()}<div class="brand-text"><strong>Party</strong><span>Tu equipo. Tu estudio. Todo en un solo lugar.</span></div>`;
  }

  function renderTop() {
    const top = document.getElementById("partyTop");
    if (!top) return;
    const st = P.student();
    const name = st?.full_name || "Invitado";
    top.innerHTML = `
      <button class="icon-btn menu-toggle" id="menuToggle" aria-label="Menú">${P.icon("menu")}</button>
      <button class="search-box" id="searchBtn" aria-label="Buscar">
        ${P.icon("search")}<span class="grow">Buscar en tus apuntes, tareas, archivos...</span><span class="kbd">Ctrl K</span>
      </button>
      <div class="top-spacer"></div>
      <div class="has-dd">
        <button class="icon-btn" id="bellBtn" aria-label="Notificaciones">${P.icon("bell")}<span class="dot" id="bellDot" style="display:none"></span></button>
        <div class="dropdown" id="bellDd"></div>
      </div>
      <div class="has-dd">
        <button class="avatar" id="avatarBtn" aria-label="Cuenta">${P.esc(P.initial(name))}</button>
        <div class="dropdown" id="avatarDd"></div>
      </div>`;

    document.getElementById("menuToggle").addEventListener("click", () =>
      document.querySelector(".app").classList.toggle("nav-open")
    );
    document.getElementById("searchBtn").addEventListener("click", P.openPalette);

    const bell = document.getElementById("bellDd");
    const av = document.getElementById("avatarDd");
    const closeAll = () => { bell.classList.remove("open"); av.classList.remove("open"); };

    document.getElementById("bellBtn").addEventListener("click", async (e) => {
      e.stopPropagation();
      const was = bell.classList.contains("open");
      closeAll();
      if (was) return;
      bell.innerHTML = `<h4>Notificaciones</h4><div class="dd-item"><small>Cargando...</small></div>`;
      bell.classList.add("open");
      let items = [];
      try { items = window.PartyData ? await PartyData.notifications() : []; } catch {}
      bell.innerHTML = `<h4>Notificaciones</h4>` + (items.length
        ? items.map((n) => `
            <button class="dd-item" data-go="${n.tab}">
              <span class="dd-ico act-ico ${n.color || ""}">${P.icon(n.icon || "bell")}</span>
              <span><b>${P.esc(n.title)}</b><small>${P.esc(n.sub)}</small></span>
            </button>`).join("")
        : `<div class="dd-item"><small>Estás al día. No hay avisos nuevos 🎉</small></div>`);
      bell.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => P.go(b.dataset.go)));
      document.getElementById("bellDot").style.display = "none";
    });

    const dark = document.documentElement.getAttribute("data-theme") !== "light";
    av.innerHTML = `
      <div class="dd-item" style="cursor:default">
        <span class="avatar sm">${P.esc(P.initial(name))}</span>
        <span><b>${P.esc(name)}</b><small>${P.esc(st?.email || st?.phone || "Sesión de desarrollo")}</small></span>
      </div>
      <div class="dd-sep"></div>
      <button class="dd-item" data-act="cfg"><span class="dd-ico">${P.icon("settings")}</span>Configuración</button>
      <button class="dd-item" data-act="groups"><span class="dd-ico">${P.icon("users")}</span>Mis grupos</button>
      <button class="dd-item" data-act="theme"><span class="dd-ico">${P.icon(dark ? "sun" : "moon")}</span>${dark ? "Tema claro" : "Tema oscuro"}</button>
      <div class="dd-sep"></div>
      <button class="dd-item" data-act="out"><span class="dd-ico">${P.icon("logout")}</span>Cerrar sesión</button>`;
    document.getElementById("avatarBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      const was = av.classList.contains("open");
      closeAll();
      if (!was) av.classList.add("open");
    });
    av.addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      const a = b.dataset.act;
      if (a === "cfg") P.go("configuraciones");
      if (a === "groups") location.href = "grupos.html";
      if (a === "out") P.logout();
      if (a === "theme") {
        const next = dark ? "light" : "dark";
        try {
          const cfg = JSON.parse(localStorage.getItem("logichive_config") || "{}");
          cfg.theme = next;
          localStorage.setItem("logichive_config", JSON.stringify(cfg));
        } catch {}
        document.documentElement.setAttribute("data-theme", next);
        renderTop();
      }
    });
    document.addEventListener("click", closeAll);

    if (window.PartyData) PartyData.notifications().then((n) => {
      const d = document.getElementById("bellDot");
      if (d && n.length) d.style.display = "";
    }).catch(() => {});
  }

  // ------------------------------------------------
  // Buscador (Ctrl K)
  // ------------------------------------------------
  let paletteEl = null, selIdx = 0, searchTimer = null;

  P.openPalette = () => {
    if (!paletteEl) {
      paletteEl = document.createElement("div");
      paletteEl.className = "palette-overlay";
      paletteEl.innerHTML = `
        <div class="palette" role="dialog" aria-label="Buscar">
          <div class="palette-input">${P.icon("search")}<input id="palInput" placeholder="Buscar apuntes, tareas, eventos o ir a una sección..." autocomplete="off"><span class="kbd">Esc</span></div>
          <div class="palette-results" id="palRes"></div>
        </div>`;
      document.body.appendChild(paletteEl);
      paletteEl.addEventListener("mousedown", (e) => { if (e.target === paletteEl) P.closePalette(); });
      const inp = paletteEl.querySelector("#palInput");
      inp.addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => runSearch(inp.value.trim()), 220);
        renderResults(staticMatches(inp.value.trim()), []);
      });
      inp.addEventListener("keydown", (e) => {
        const items = paletteEl.querySelectorAll(".dd-item");
        if (e.key === "ArrowDown") { selIdx = Math.min(selIdx + 1, items.length - 1); markSel(items); e.preventDefault(); }
        if (e.key === "ArrowUp")   { selIdx = Math.max(selIdx - 1, 0); markSel(items); e.preventDefault(); }
        if (e.key === "Enter")     { items[selIdx]?.click(); }
      });
    }
    paletteEl.classList.add("open");
    const inp = paletteEl.querySelector("#palInput");
    inp.value = "";
    renderResults(staticMatches(""), []);
    setTimeout(() => inp.focus(), 20);
  };

  P.closePalette = () => paletteEl?.classList.remove("open");

  function markSel(items) {
    items.forEach((el, i) => el.classList.toggle("sel", i === selIdx));
    items[selIdx]?.scrollIntoView({ block: "nearest" });
  }

  function staticMatches(q) {
    const allowed = P.allowedTabs();
    const all = P.MAIN_NAV.filter((n) => !n.tab || !allowed || allowed.includes(n.tab));
    const ql = q.toLowerCase();
    return all.filter((n) => !ql || n.label.toLowerCase().includes(ql)).slice(0, ql ? 5 : 6);
  }

  async function runSearch(q) {
    if (q.length < 2 || !window.PartyData) return;
    let found = [];
    try { found = await PartyData.search(q); } catch {}
    if (paletteEl?.querySelector("#palInput").value.trim() === q) renderResults(staticMatches(q), found);
  }

  function renderResults(sections, found) {
    const res = paletteEl.querySelector("#palRes");
    let html = sections.length ? `<h4>Ir a</h4>` : "";
    html += sections.map((n) => `
      <button class="dd-item" ${n.href ? `data-href="${n.href}"` : `data-go="${n.tab}"`}>
        <span class="dd-ico act-ico">${P.icon(n.icon)}</span><span>${n.label}</span></button>`).join("");
    const groups = { nota: "Apuntes", tarea: "Tareas", evento: "Eventos" };
    Object.keys(groups).forEach((k) => {
      const list = found.filter((f) => f.kind === k);
      if (!list.length) return;
      html += `<h4>${groups[k]}</h4>` + list.map((f) => `
        <button class="dd-item" data-go="${f.tab}">
          <span class="dd-ico act-ico ${f.color}">${P.icon(f.icon)}</span>
          <span><b>${P.esc(f.title)}</b><small>${P.esc(f.sub || "")}</small></span></button>`).join("");
    });
    if (!html) html = `<div class="dd-item"><small>Sin resultados.</small></div>`;
    res.innerHTML = html;
    selIdx = 0;
    const items = res.querySelectorAll(".dd-item");
    markSel(items);
    items.forEach((el) => el.addEventListener("click", () => {
      P.closePalette();
      if (el.dataset.href) location.href = el.dataset.href;
      else if (el.dataset.go) P.go(el.dataset.go);
    }));
  }

  document.addEventListener("keydown", (e) => {
    if (!document.getElementById("partyTop")) return; // solo en páginas con shell
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      P.openPalette();
    }
    if (e.key === "Escape") P.closePalette();
  });

  // ------------------------------------------------
  // Montaje
  // ------------------------------------------------
  P.mount = () => {
    const body = document.body;
    renderBrand();
    renderTop();
    renderSidebar(body.dataset.partyMode || "main", body.dataset.partyActive || "");
  };

  P.mount();
})();
