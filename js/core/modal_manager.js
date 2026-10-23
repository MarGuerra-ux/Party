// ================================================
// MODAL_MANAGER.JS
// Organizador Marco
// Gestión centralizada de modales redimensionables
// ================================================

const MODAL_MANAGER_CONFIG = {

  enabled: true,

  storagePrefix: "modal_size_",

  defaults: {
    width: 1400,
    height: 900
  },

  minWidth: 900,
  minHeight: 600

};

// ================================================
// REGISTRO DE MODALS
// ================================================

const RESIZABLE_MODALS = {

  // ==========================================
  // APUNTES
  // ==========================================

  noteModalBox: {

    width: 1400,
    height: 900,

    enabled: true

  }

};

// ================================================
// HELPERS
// ================================================

function getModalStorageKey(modalId) {

  return (
    MODAL_MANAGER_CONFIG.storagePrefix +
    modalId
  );

}

function getModalConfig(modalId) {

  return (
    RESIZABLE_MODALS[modalId] ||
    MODAL_MANAGER_CONFIG.defaults
  );

}

function isModalRegistered(modalId) {

  return !!RESIZABLE_MODALS[modalId];

}

// ================================================
// REGISTRO DINÁMICO
// ================================================

function registerModal(modalId, config = {}) {

  RESIZABLE_MODALS[modalId] = {

    width:
      config.width ??
      MODAL_MANAGER_CONFIG.defaults.width,

    height:
      config.height ??
      MODAL_MANAGER_CONFIG.defaults.height,

    enabled:
      config.enabled ?? true

  };

}

// ================================================
// GUARDAR TAMAÑO
// ================================================

function saveModalSize(modalId) {

  const modal =
    document.getElementById(modalId);

  if (!modal) return;

  try {

    localStorage.setItem(

      getModalStorageKey(modalId),

      JSON.stringify({

        width: modal.offsetWidth,
        height: modal.offsetHeight

      })

    );

  }
  catch (error) {

    console.error(
      "[ModalManager] Error guardando tamaño",
      error
    );

  }

}

// ================================================
// RESTAURAR TAMAÑO
// ================================================

function restoreModalSize(modalId) {

  const modal =
    document.getElementById(modalId);

  if (!modal) return;

  try {

    const saved = JSON.parse(

      localStorage.getItem(
        getModalStorageKey(modalId)
      ) || "{}"

    );

    const config =
      getModalConfig(modalId);

    const width =
      saved.width || config.width;

    const height =
      saved.height || config.height;

    modal.style.width =
      width + "px";

    modal.style.height =
      height + "px";

    modal.style.minWidth =
      MODAL_MANAGER_CONFIG.minWidth + "px";

    modal.style.minHeight =
      MODAL_MANAGER_CONFIG.minHeight + "px";

  }
  catch (error) {

    console.error(
      "[ModalManager] Error restaurando tamaño",
      error
    );

  }

}

// ================================================
// OBSERVAR CAMBIOS DE TAMAÑO
// ================================================

function watchModalResize(modalId) {

  const modal =
    document.getElementById(modalId);

  if (!modal) return;

  if (modal._resizeObserver) {

    modal._resizeObserver.disconnect();

  }

  const observer =
    new ResizeObserver(() => {

      saveModalSize(modalId);

    });

  observer.observe(modal);

  modal._resizeObserver =
    observer;

}

// ================================================
// RESETEAR TAMAÑO
// ================================================

function resetModalSize(modalId) {

  const modal =
    document.getElementById(modalId);

  if (!modal) return;

  localStorage.removeItem(
    getModalStorageKey(modalId)
  );

  const config =
    getModalConfig(modalId);

  modal.style.width =
    config.width + "px";

  modal.style.height =
    config.height + "px";

}

// ================================================
// OBTENER TAMAÑO ACTUAL
// ================================================

function getCurrentModalSize(modalId) {

  const modal =
    document.getElementById(modalId);

  if (!modal) return null;

  return {

    width: modal.offsetWidth,
    height: modal.offsetHeight

  };

}

// ================================================
// DESTRUIR OBSERVER
// ================================================

function destroyResizableModal(modalId) {

  const modal =
    document.getElementById(modalId);

  if (!modal) return;

  if (modal._resizeObserver) {

    modal._resizeObserver.disconnect();

    delete modal._resizeObserver;

  }

}

// ================================================
// INICIALIZAR MODAL
// ================================================

function initResizableModal(modalId) {

  if (
    !MODAL_MANAGER_CONFIG.enabled
  ) {
    return;
  }

  const config =
    RESIZABLE_MODALS[modalId];

  if (!config) {

    console.warn(
      `[ModalManager] Modal no registrado: ${modalId}`
    );

    return;

  }

  if (!config.enabled) {

    return;

  }

  restoreModalSize(modalId);

  watchModalResize(modalId);

}

// ================================================
// DEBUG
// ================================================

function listRegisteredModals() {

  return Object.keys(
    RESIZABLE_MODALS
  );

}