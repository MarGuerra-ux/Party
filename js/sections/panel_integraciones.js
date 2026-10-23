// ================================================
// PANEL_INTEGRACIONES.JS — Conexiones con otras apps
// (vista preparada; las conexiones llegan más adelante)
// ================================================

const INTEGRATIONS = [
  { id: "gcal",   name: "Google Calendar", icon: "calendar", color: "var(--color-info)",     text: "Sincroniza evaluaciones y entregas con tu calendario." },
  { id: "gdrive", name: "Google Drive",    icon: "cloud",    color: "var(--color-success)",  text: "Adjunta documentos de tu Drive a la biblioteca del grupo." },
  { id: "meet",   name: "Google Meet",     icon: "video",    color: "var(--color-warning)",  text: "Crea la videollamada de la reunión con un clic." },
  { id: "teams",  name: "Microsoft Teams", icon: "users",    color: "var(--color-accent)",   text: "Recibe avisos de Party dentro de tu equipo de Teams." },
  { id: "github", name: "GitHub",          icon: "code",     color: "var(--color-accent-2)", text: "Vincula el repositorio del proyecto y sus entregas." },
  { id: "notion", name: "Notion",          icon: "note",     color: "var(--color-pink)",     text: "Importa tus apuntes y páginas de estudio." },
];

function initIntegraciones() {
  const wrap = document.getElementById("integracionesWrap");
  if (!wrap) return;
  const P = Party;
  let wanted = [];
  try { wanted = JSON.parse(localStorage.getItem("party_int_interest") || "[]"); } catch {}

  wrap.innerHTML = `
    <div class="card-head" style="margin-bottom:16px">
      <div><h3 style="font-size:18px">${P.icon("plug")}Integraciones</h3>
        <p style="margin:4px 0 0;font-size:12.5px;color:var(--color-muted)">Conecta Party con las herramientas que ya usas. Marca las que más te interesan.</p></div>
    </div>
    <div class="int-grid">
      ${INTEGRATIONS.map((i) => `
        <article class="p-card int-card" style="--c:${i.color}">
          <div class="top">
            <span class="file-ico" style="width:42px;height:42px">${P.icon(i.icon)}</span>
            <b style="flex:1">${i.name}</b><span class="pill violet">Pronto</span>
          </div>
          <p>${i.text}</p>
          <button class="btn-ghost" data-int="${i.id}" style="justify-content:center">${wanted.includes(i.id) ? "✓ Me interesa" : "Me interesa"}</button>
        </article>`).join("")}
    </div>`;

  wrap.addEventListener("click", (e) => {
    const b = e.target.closest("[data-int]");
    if (!b) return;
    const id = b.dataset.int;
    wanted = wanted.includes(id) ? wanted.filter((x) => x !== id) : [...wanted, id];
    localStorage.setItem("party_int_interest", JSON.stringify(wanted));
    b.textContent = wanted.includes(id) ? "✓ Me interesa" : "Me interesa";
  });
}
