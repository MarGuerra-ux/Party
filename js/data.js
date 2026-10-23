// ===============================
// DATA.JS — Estado global
// Todo viene de Supabase.
// localStorage solo guarda sesión y navegación.
// ===============================

const STORAGE_KEY = "logichive_v1";

const defaultState = {
  session: {
    role:      "student",
    user:      "",
    studentId: null,
  },
  selected: {
    careerId:  null,
    sectionId: null,
    groupId:   null,
  },
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneState(defaultState);
    const saved = JSON.parse(raw);
    return normalizeState(saved);
  } catch {
    return cloneState(defaultState);
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getState()       { return loadState(); }
function setState(state)  { saveState(normalizeState(state)); }

function normalizeState(state) {
  return {
    session: {
      ...defaultState.session,
      ...(state.session || {}),
    },
    selected: {
      ...defaultState.selected,
      ...(state.selected || {}),
    },
  };
}

function cloneState(value) {
  return JSON.parse(JSON.stringify(value));
}

// ===============================
// UTILIDADES GLOBALES
// ===============================

function uid(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 9999)}`;
}

function requireAdmin() {
  return getState().session?.role === "admin";
}

function applyRoleVisibility() {
  const isAdmin = requireAdmin();
  document.querySelectorAll(".admin-only").forEach(el => {
    el.style.display = isAdmin ? "block" : "none";
  });
}

function logout() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem("active_student");
  location.href = "../index.html";
}
