// ================================================
// PANEL_ESTATICO_TOP.JS — v4 (Party)
// Router de pestañas, contexto del grupo, tema,
// sub-pestañas y edición del grupo.
// ================================================

let _tabsInited = {};

async function initPanel() {
  applyTheme();
  applyRoleVisibility();
  const edit = document.getElementById("editGroupBtn");
  if (edit) edit.innerHTML = `${Party.icon("pencil")} Editar grupo`;
  await renderContext();
  setupTabs();
  checkTabInicial();
}

// ================================================
// TEMA
// ================================================
function applyTheme() {
  try {
    const cfg = loadConfig ? loadConfig() : {};
    document.documentElement.setAttribute("data-theme", cfg.theme || "dark");
    if (cfg.customColors) {
      Object.entries(cfg.customColors).forEach(([k, v]) => document.documentElement.style.setProperty(k, v));
    }
    if (cfg.fontSize) document.documentElement.style.setProperty("--font-size-base", cfg.fontSize + "px");
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "dark");
  }
}

// ================================================
// CONTEXTO DEL GRUPO
// ================================================
async function renderContext() {
  const ctx     = document.getElementById("panelContext");
  const groupId = getState().selected.groupId;
  if (!ctx) return;

  if (!groupId) { ctx.textContent = "Sin grupo seleccionado — elige uno en la sección Grupos."; return; }

  const { data, error } = await supabaseClient
    .from("groups")
    .select("id, name, owner_id, sections(id, name, careers(id, name))")
    .eq("id", groupId)
    .single();

  if (error || !data) { ctx.textContent = "No se pudo cargar el grupo."; return; }

  window._currentGroup = data;
  ctx.textContent =
    `${data.sections?.careers?.name || "Carrera"} → ${data.sections?.name || "Sección"} → ${data.name}`;
}

// ================================================
// EDITAR GRUPO (solo dueño o administración)
// ================================================
function editarGrupo() {
  const g = window._currentGroup;
  const student = Party.student();
  if (!g) { showToast("Primero selecciona un grupo.", "warning"); return; }

  const role = Party.role();
  const puede = g.owner_id === student?.id || role === "admin" || role === "master";
  if (!puede) { showToast("Solo el dueño del grupo puede editarlo.", "warning"); return; }

  Party.modal({
    title: "Editar grupo",
    text: "Cambia el nombre con el que tu equipo ve este grupo.",
    html: `<input id="egName" value="${Party.esc(g.name)}" maxlength="60" placeholder="Nombre del grupo">`,
    confirm: "Guardar",
    onConfirm: async (ov) => {
      const name = ov.querySelector("#egName").value.trim();
      if (!name) { showToast("Escribe un nombre.", "warning"); return false; }
      const { error } = await supabaseClient.from("groups").update({ name }).eq("id", g.id);
      if (error) { showToast("No se pudo guardar el cambio.", "danger"); return false; }
      showToast("Grupo actualizado ✓", "success");
      await renderContext();
      _tabsInited["inicio"] = false;
      if (document.getElementById("inicio").classList.contains("active")) { _tabsInited["inicio"] = true; initTab("inicio"); }
    },
  });
}

// ================================================
// TABS
// ================================================
function setupTabs() {
  document.querySelectorAll(".tab[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab)?.classList.add("active");

      const tab = btn.dataset.tab;
      syncChrome(tab, btn);

      // Biblioteca se vuelve a leer en cada visita: otras secciones (horario, asignaturas) pueden haber creado carpetas
      if (!_tabsInited[tab] || tab === "biblioteca") {
        _tabsInited[tab] = true;
        initTab(tab);
      }
    });
  });

  // Sub-pestañas = atajos a las pestañas del menú lateral
  document.querySelectorAll(".subtab[data-sub]").forEach(sb => {
    sb.addEventListener("click", () => document.querySelector(`.tab[data-tab="${sb.dataset.sub}"]`)?.click());
  });

  const defaultTab = document.querySelector(".tab.active")?.dataset.tab;
  if (defaultTab && !_tabsInited[defaultTab]) {
    _tabsInited[defaultTab] = true;
    initTab(defaultTab);
  }
}

function syncChrome(tab, btn) {
  document.querySelectorAll(".subtab").forEach(s => s.classList.toggle("active", s.dataset.sub === tab));
  const title = document.getElementById("pageTitle");
  if (title) {
    title.textContent = tab === "inicio" ? "Panel del Grupo" : (btn?.querySelector(".grow")?.textContent || "Panel del Grupo");
  }
  document.querySelector(".app")?.classList.remove("nav-open");
  window.scrollTo({ top: 0 });
}

// ================================================
// ROUTER DE SECCIONES
// ================================================
function initTab(tab) {
  const map = {
    inicio: "initInicio", scrum: "initScrum", calendario: "initCalendario", apuntes: "initApuntes",
    biblioteca: "initBiblioteca", lista: "initLista", sorteo: "initSorteo", encuestas: "initEncuestas",
    grupos: "initGruposTab", configuraciones: "initConfiguraciones", constructor_ia: "initConstructorIA",
    agentes_ia: "initAgentesIA", anuncios: "initAnuncios", chat: "initChat", mensajeria: "initMensajeria",
    institucion: "initInstitucion", maquetador: "initMaquetador", asistente: "initAsistente",
    miembros: "initMiembros", asignaturas: "initAsignaturas", integraciones: "initIntegraciones",
  };
  const fn = window[map[tab]];
  if (typeof fn === "function") fn();
}

// ================================================
// TAB INICIAL DESDE OTRA PÁGINA
// ================================================
function checkTabInicial() {
  const tabInicial = localStorage.getItem("panel_tab_inicial");
  if (!tabInicial) return;
  localStorage.removeItem("panel_tab_inicial");
  const btn = document.querySelector(`.tab[data-tab="${tabInicial}"]`);
  if (btn) setTimeout(() => btn.click(), 80);
}

// ================================================
// VISIBILIDAD POR ROL
// ================================================
function applyRoleVisibility() {
  const role = Party.role();
  const isAdmin   = role === "admin" || role === "master";
  const isTeacher = role === "teacher" || isAdmin;

  document.querySelectorAll(".admin-only").forEach(el => { el.style.display = isAdmin ? "" : "none"; });
  document.querySelectorAll(".teacher-only").forEach(el => { el.style.display = isTeacher ? "" : "none"; });

  const allowedTabs = Party.allowedTabs(role);
  if (!allowedTabs) return;
  document.querySelectorAll(".tab[data-tab]").forEach(btn => {
    btn.style.display = allowedTabs.includes(btn.dataset.tab) ? "" : "none";
  });
}

// (showToast viene de js/party_ui.js)
initPanel();
