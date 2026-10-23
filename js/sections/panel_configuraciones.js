// ================================================
// PANEL_CONFIGURACIONES.JS
// Tema, colores, perfil, tabs, fuente, peligro
// ================================================

const CONFIG_KEY = "logichive_config";

const DEFAULT_CONFIG = {
  theme:        "dark",
  fontSize:     14,
  accentPreset: "blue",
  customColors: {},
  tabOrder:     ["scrum","calendario","apuntes","lista","sorteo","encuestas",
                 "maquetador","asistente","institucion","grupos","configuraciones"],
  hiddenTabs:   [],
  colorPaints:  ["#ef4444","#38bdf8","#22c55e","#f59e0b"],
};

// Variables CSS editables — nombre → label amigable
const CSS_VARS = {
  "--bg-primary":    "Fondo principal",
  "--bg-secondary":  "Fondo secundario",
  "--bg-card":       "Fondo tarjetas",
  "--color-text":    "Texto principal",
  "--color-muted":   "Texto secundario",
  "--color-accent":  "Color de acento",
  "--color-accent-2":"Acento secundario (degradado)",
  "--color-border":  "Bordes",
  "--color-btn-primary-bg": "Botón primario",
  "--color-btn-primary-text": "Texto botón primario",
  "--color-danger":  "Color peligro/rojo",
  "--color-success": "Color éxito/verde",
};

const ACCENT_PRESETS = {
  blue:   { label: "Party (default)", "--color-accent": "#6c8bff", "--color-btn-primary-bg": "#4f6bff", "--color-accent-2": "#8b5cf6" },
  green:  { label: "Verde",           "--color-accent": "#34d399", "--color-btn-primary-bg": "#059669", "--color-accent-2": "#14b8a6" },
  purple: { label: "Violeta",         "--color-accent": "#a78bfa", "--color-btn-primary-bg": "#7c3aed", "--color-accent-2": "#ec4899" },
  orange: { label: "Naranja",         "--color-accent": "#fb923c", "--color-btn-primary-bg": "#ea580c", "--color-accent-2": "#f43f5e" },
  gray:   { label: "Gris neutro",     "--color-accent": "#94a3b8", "--color-btn-primary-bg": "#475569", "--color-accent-2": "#64748b" },
};

// ================================================
// CARGAR / GUARDAR CONFIG
// ================================================

function loadConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : { ...DEFAULT_CONFIG };
  } catch { return { ...DEFAULT_CONFIG }; }
}

function saveConfig(cfg) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

// ================================================
// INIT
// ================================================

function initConfiguraciones() {
  const wrap = document.getElementById("configWrap");
  if (!wrap) return;

  const cfg    = loadConfig();
  const student = JSON.parse(localStorage.getItem("active_student"));

  wrap.innerHTML = `

    <!-- PERFIL PERSONAL -->
    <div class="config-section">
      <h3 class="config-section-title">👤 Perfil personal</h3>
      <div class="config-row">
        <div class="avatar-circle" id="configAvatar">
          ${getInitials(student?.full_name || "U")}
        </div>
        <div style="flex:1;display:flex;flex-direction:column;gap:8px">
          <input id="cfg_name" type="text" placeholder="Nombre para mostrar"
                 value="${student?.full_name || ""}" style="width:100%">
          <input id="cfg_email" type="email" placeholder="Correo"
                 value="${student?.email || ""}" style="width:100%">
          <button class="btn primary" onclick="saveProfile()" style="align-self:flex-start">
            Guardar perfil
          </button>
        </div>
      </div>
    </div>

    <!-- TEMA -->
    <div class="config-section">
      <h3 class="config-section-title">🎨 Tema</h3>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="config-theme-btn ${cfg.theme==='dark'?'active':''}"
                onclick="setTheme('dark')">
          🌙 Oscuro
        </button>
        <button class="config-theme-btn ${cfg.theme==='light'?'active':''}"
                onclick="setTheme('light')">
          ☀️ Claro
        </button>
      </div>
    </div>

    <!-- PALETAS PREDEFINIDAS -->
    <div class="config-section">
      <h3 class="config-section-title">🖌️ Paleta de acento</h3>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${Object.entries(ACCENT_PRESETS).map(([key, p]) => `
          <button class="config-preset-btn ${cfg.accentPreset===key?'active':''}"
                  onclick="setAccentPreset('${key}')"
                  style="--preset-color:${p['--color-accent']}">
            <span class="preset-dot" style="background:${p['--color-accent']}"></span>
            ${p.label}
          </button>
        `).join("")}
      </div>
    </div>

    <!-- COLORES PERSONALIZADOS -->
    <div class="config-section">
      <h3 class="config-section-title">🔬 Colores avanzados</h3>
      <p class="muted-text" style="font-size:12px;margin:0 0 12px">
        Hacé click en cualquier color para cambiarlo.
      </p>
      <div class="config-colors-grid">
        ${Object.entries(CSS_VARS).map(([varName, label]) => {
          const current = cfg.customColors?.[varName]
            || getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
            || "#111b31";
          return `
            <div class="config-color-row">
              <span class="config-color-label">${label}</span>
              <div class="config-color-swatch"
                   style="background:${current}"
                   onclick="openColorPicker('${varName}', '${current}', this)">
              </div>
              <input type="color" class="config-color-input hidden"
                     value="${current.length===7?current:'#111b31'}"
                     oninput="applyColorVar('${varName}', this.value, this.previousElementSibling)"
                     onchange="saveColorVar('${varName}', this.value)">
            </div>`;
        }).join("")}
      </div>
      <button class="btn secondary" style="margin-top:12px" onclick="resetColors()">
        Restablecer colores por defecto
      </button>
    </div>

    <!-- TAMAÑO DE FUENTE -->
    <div class="config-section">
      <h3 class="config-section-title">🔡 Tamaño de texto</h3>
      <div style="display:flex;align-items:center;gap:14px">
        <span style="font-size:11px;color:var(--color-muted)">A</span>
        <input type="range" id="fontSizeRange" min="12" max="18" step="1"
               value="${cfg.fontSize || 14}"
               oninput="previewFontSize(this.value)"
               onchange="saveFontSize(this.value)"
               style="flex:1">
        <span style="font-size:18px;color:var(--color-muted)">A</span>
        <span id="fontSizeLabel" style="font-size:13px;color:var(--color-muted);min-width:32px">
          ${cfg.fontSize || 14}px
        </span>
      </div>
    </div>

    <!-- VISIBILIDAD DE TABS -->
    <div class="config-section">
      <h3 class="config-section-title">📑 Pestañas visibles</h3>
      <p class="muted-text" style="font-size:12px;margin:0 0 12px">
        Ocultá las secciones que no usás.
      </p>
      <div class="config-tabs-list" id="configTabsList"></div>
      <button class="btn secondary" style="margin-top:10px" onclick="applyTabVisibility()">
        Aplicar cambios
      </button>
    </div>

    <!-- COLORES DE PINTURA (calendario) -->
    <div class="config-section">
      <h3 class="config-section-title">🪣 Colores de pintura del calendario</h3>
      <p class="muted-text" style="font-size:12px;margin:0 0 12px">
        Estos son tus 4 colores rápidos al colorear días.
      </p>
      <div style="display:flex;gap:12px;align-items:center">
        ${cfg.colorPaints.map((c, i) => `
          <div style="position:relative">
            <div class="config-color-swatch large"
                 style="background:${c}"
                 onclick="this.nextElementSibling.click()"></div>
            <input type="color" value="${c}" style="position:absolute;opacity:0;width:0;height:0"
                   onchange="savePaintColor(${i}, this.value, this.previousElementSibling)">
          </div>
        `).join("")}
      </div>
    </div>

    <!-- ZONA DE PELIGRO -->
    <div class="config-section config-danger-zone">
      <h3 class="config-section-title" style="color:#ef4444">⚠️ Zona de peligro</h3>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <div>
            <p style="margin:0;font-size:14px;font-weight:500">Limpiar configuración</p>
            <p class="muted-text" style="font-size:12px;margin:4px 0 0">Restaura todos los ajustes al estado inicial.</p>
          </div>
          <button class="btn danger" onclick="resetAllConfig()">Resetear config</button>
        </div>
        <hr style="border-color:#2a1a1a;margin:4px 0">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <div>
            <p style="margin:0;font-size:14px;font-weight:500">Cerrar sesión</p>
            <p class="muted-text" style="font-size:12px;margin:4px 0 0">Salís de la app. Tus datos se mantienen.</p>
          </div>
          <button class="btn danger" onclick="doLogout()">Cerrar sesión</button>
        </div>
        <hr style="border-color:#2a1a1a;margin:4px 0">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <div>
            <p style="margin:0;font-size:14px;font-weight:500">Eliminar cuenta</p>
            <p class="muted-text" style="font-size:12px;margin:4px 0 0">Acción irreversible. Se eliminan todos tus datos.</p>
          </div>
          <button class="btn danger" onclick="deleteAccount()">Eliminar cuenta</button>
        </div>
      </div>
    </div>`;

  renderTabsConfig(cfg);
}

// ================================================
// PERFIL
// ================================================

async function saveProfile() {
  const name  = document.getElementById("cfg_name")?.value.trim();
  const email = document.getElementById("cfg_email")?.value.trim();

  const student = JSON.parse(localStorage.getItem("active_student"));
  if (!student) return;

  student.full_name = name || student.full_name;
  student.email     = email || student.email;
  localStorage.setItem("active_student", JSON.stringify(student));

  if (!student._dev_mode) {
    await supabaseClient.from("students")
      .update({ full_name: name, email })
      .eq("id", student.id);
  }

  document.getElementById("configAvatar").textContent = getInitials(name);
  showToast("Perfil actualizado ✓", "success");
}

function getInitials(name) {
  return name.split(" ").slice(0,2).map(w => w[0]?.toUpperCase() || "").join("");
}

// ================================================
// TEMA CLARO / OSCURO
// ================================================

function setTheme(theme) {
  const cfg = loadConfig();
  cfg.theme  = theme;
  saveConfig(cfg);
  document.documentElement.setAttribute("data-theme", theme);

  document.querySelectorAll(".config-theme-btn").forEach(b => b.classList.remove("active"));
  document.querySelector(`.config-theme-btn[onclick="setTheme('${theme}')"]`)?.classList.add("active");
  showToast(`Tema ${theme === "dark" ? "oscuro" : "claro"} aplicado`, "success");
}

// ================================================
// PALETA PREDEFINIDA
// ================================================

function setAccentPreset(key) {
  const preset = ACCENT_PRESETS[key];
  if (!preset) return;

  const cfg = loadConfig();
  cfg.accentPreset = key;
  Object.entries(preset).forEach(([varName, val]) => {
    if (varName.startsWith("--")) {
      cfg.customColors[varName] = val;
      document.documentElement.style.setProperty(varName, val);
    }
  });
  saveConfig(cfg);

  document.querySelectorAll(".config-preset-btn").forEach(b => b.classList.remove("active"));
  document.querySelector(`.config-preset-btn[onclick="setAccentPreset('${key}')"]`)?.classList.add("active");
  showToast(`Paleta "${preset.label}" aplicada`, "success");
}

// ================================================
// COLORES PERSONALIZADOS
// ================================================

function openColorPicker(varName, current, swatchEl) {
  const input = swatchEl.nextElementSibling;
  if (input) input.click();
}

function applyColorVar(varName, value, swatchEl) {
  document.documentElement.style.setProperty(varName, value);
  if (swatchEl) swatchEl.style.background = value;
  document.getElementById("fontSizeLabel") // trigger repaint
}

function saveColorVar(varName, value) {
  const cfg = loadConfig();
  cfg.customColors[varName] = value;
  saveConfig(cfg);
}

function resetColors() {
  if (!confirm("¿Restablecer todos los colores personalizados?")) return;
  const cfg = loadConfig();
  cfg.customColors = {};
  cfg.accentPreset = "blue";
  saveConfig(cfg);
  // Quitar variables inline
  Object.keys(CSS_VARS).forEach(v => document.documentElement.style.removeProperty(v));
  _tabsInited["configuraciones"] = false;
  initConfiguraciones();
  showToast("Colores restablecidos", "success");
}

// ================================================
// COLORES DE PINTURA
// ================================================

function savePaintColor(index, value, swatchEl) {
  const cfg = loadConfig();
  cfg.colorPaints[index] = value;
  saveConfig(cfg);
  if (swatchEl) swatchEl.style.background = value;
  showToast("Color de pintura guardado ✓", "success");
}

// ================================================
// TAMAÑO DE FUENTE
// ================================================

function previewFontSize(val) {
  document.documentElement.style.setProperty("--font-size-base", val + "px");
  const lbl = document.getElementById("fontSizeLabel");
  if (lbl) lbl.textContent = val + "px";
}

function saveFontSize(val) {
  const cfg = loadConfig();
  cfg.fontSize = parseInt(val);
  saveConfig(cfg);
  showToast(`Fuente: ${val}px`, "success");
}

// ================================================
// VISIBILIDAD DE TABS
// ================================================

const TAB_LABELS = {
  scrum: "Scrum", calendario: "Calendario", apuntes: "Apuntes",
  lista: "Listas", sorteo: "Sorteo", encuestas: "Encuestas",
  maquetador: "Maquetador", asistente: "Asistente IA",
  institucion: "Institución", grupos: "Grupos",
};

function renderTabsConfig(cfg) {
  const wrap = document.getElementById("configTabsList");
  if (!wrap) return;

  wrap.innerHTML = Object.entries(TAB_LABELS).map(([key, label]) => {
    const isHidden = cfg.hiddenTabs?.includes(key);
    return `
      <label class="config-tab-toggle">
        <input type="checkbox" data-tab="${key}" ${isHidden ? "" : "checked"}>
        <span>${label}</span>
      </label>`;
  }).join("");
}

function applyTabVisibility() {
  const cfg      = loadConfig();
  const checkboxes = document.querySelectorAll(".config-tab-toggle input");
  const hidden   = [];

  checkboxes.forEach(cb => {
    const tab = cb.dataset.tab;
    const btn = document.querySelector(`.tab[data-tab="${tab}"]`);
    if (cb.checked) {
      if (btn) btn.style.display = "";
    } else {
      hidden.push(tab);
      if (btn) btn.style.display = "none";
    }
  });

  cfg.hiddenTabs = hidden;
  saveConfig(cfg);
  showToast("Pestañas actualizadas ✓", "success");
}

// ================================================
// ZONA DE PELIGRO
// ================================================

function resetAllConfig() {
  if (!confirm("¿Resetear toda la configuración al estado inicial?")) return;
  localStorage.removeItem(CONFIG_KEY);
  Object.keys(CSS_VARS).forEach(v => document.documentElement.style.removeProperty(v));
  document.documentElement.removeAttribute("data-theme");
  _tabsInited["configuraciones"] = false;
  initConfiguraciones();
  showToast("Configuración reseteada", "success");
}

function doLogout() {
  if (!confirm("¿Cerrar sesión?")) return;
  localStorage.removeItem("active_student");
  localStorage.removeItem("logichive_v1");
  location.href = "../index.html";
}

async function deleteAccount() {
  const student = JSON.parse(localStorage.getItem("active_student"));
  if (!student) return;

  const confirm1 = confirm("⚠️ Esta acción es IRREVERSIBLE.\n¿Seguro que querés eliminar tu cuenta y todos tus datos?");
  if (!confirm1) return;
  const confirm2 = confirm(`Escribís "ELIMINAR" para confirmar.\n\n¿Es tu decisión final?`);
  if (!confirm2) return;

  if (!student._dev_mode) {
    await supabaseClient.from("students").delete().eq("id", student.id);
  }

  localStorage.clear();
  location.href = "../index.html";
}
