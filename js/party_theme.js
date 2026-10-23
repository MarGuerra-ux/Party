// ================================================
// PARTY_THEME.JS — Aplica tema/colores guardados
// Se carga en <head> para evitar el "parpadeo" de tema.
// Usa la misma clave que Configuración (logichive_config).
// ================================================
(function () {
  var root = document.documentElement;
  try {
    var cfg = JSON.parse(localStorage.getItem("logichive_config") || "{}");
    root.setAttribute("data-theme", cfg.theme || "dark");
    if (cfg.customColors) {
      Object.keys(cfg.customColors).forEach(function (k) {
        root.style.setProperty(k, cfg.customColors[k]);
      });
    }
    if (cfg.fontSize) root.style.setProperty("--font-size-base", cfg.fontSize + "px");
  } catch (e) {
    root.setAttribute("data-theme", "dark");
  }
})();
