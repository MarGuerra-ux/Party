// ================================================
// PANEL_LISTAS.JS — v2
// Colores personalizados por lista
// ================================================

let listsData = [];

async function initLista() {
  await loadLists();
  renderLists();
}

async function loadLists() {
  const groupId = getState().selected.groupId;
  if (!groupId) { listsData = []; return; }

  const { data, error } = await supabaseClient
    .from("lists")
    .select("id, title, created_at, bg_color, text_color, list_items(id, text, checked, position)")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false });

  if (error) { console.error(error.message); return; }
  listsData = data || [];
}

function renderLists() {
  const wrap = document.getElementById("listsWrap");
  if (!wrap) return;

  if (!listsData.length) {
    wrap.innerHTML = `<p class="muted-text">No hay listas aún. ¡Creá la primera!</p>`;
    return;
  }

  wrap.innerHTML = listsData.map(list => {
    const items    = (list.list_items || []).sort((a,b) => a.position - b.position);
    const total    = items.length;
    const done     = items.filter(i => i.checked).length;
    const bgColor  = list.bg_color   || "var(--bg-card)";
    const txtColor = list.text_color || "var(--color-text)";
    const isDark   = list.bg_color ? isDarkColor(list.bg_color) : true;
    const mutedCol = isDark ? "rgba(255,255,255,.45)" : "rgba(0,0,0,.45)";

    return `
      <article class="card list-card"
               style="background:${bgColor};border-color:${isDark ? "rgba(255,255,255,.1)" : "rgba(0,0,0,.1)"}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <h3 style="margin:0;font-size:15px;color:${txtColor}">${list.title}</h3>
          <div style="display:flex;gap:6px;align-items:center">
            <span style="font-size:12px;color:${mutedCol}">${done}/${total}</span>
            <button class="list-color-btn" title="Personalizar colores"
                    onclick="openListColorModal('${list.id}')">🎨</button>
            <button class="btn-icon-danger" onclick="deleteList('${list.id}')">✕</button>
          </div>
        </div>

        <!-- Barra de progreso -->
        ${total > 0 ? `
          <div style="background:${isDark?"rgba(255,255,255,.1)":"rgba(0,0,0,.1)"};
                      border-radius:99px;height:4px;margin-bottom:12px;overflow:hidden">
            <div style="background:var(--color-accent);width:${Math.round((done/total)*100)}%;
                        height:100%;border-radius:99px;transition:width .3s"></div>
          </div>` : ""}

        <div class="list-items-wrap" id="items_${list.id}">
          ${items.map(item => itemHtml(item, list.id, txtColor, mutedCol)).join("")}
        </div>

        <div style="display:flex;gap:8px;margin-top:10px">
          <input type="text" placeholder="Nuevo ítem..."
                 id="newitem_${list.id}"
                 style="flex:1;font-size:13px;background:${isDark?"rgba(255,255,255,.08)":"rgba(0,0,0,.06)"};
                        border-color:${isDark?"rgba(255,255,255,.15)":"rgba(0,0,0,.15)"};
                        color:${txtColor}"
                 onkeydown="if(event.key==='Enter')addItem('${list.id}')">
          <button class="btn primary" onclick="addItem('${list.id}')">＋</button>
        </div>
      </article>`;
  }).join("");
}

function itemHtml(item, listId, txtColor, mutedCol) {
  return `
    <div class="list-item ${item.checked ? "list-item-done" : ""}" id="item_${item.id}">
      <input type="checkbox" ${item.checked ? "checked" : ""}
             style="accent-color:var(--color-accent)"
             onchange="toggleItem('${item.id}', '${listId}', this.checked)">
      <span class="list-item-text"
            style="color:${item.checked ? mutedCol : txtColor};
                   text-decoration:${item.checked ? "line-through" : "none"}">
        ${item.text}
      </span>
      <button class="btn-icon-danger" onclick="deleteItem('${item.id}', '${listId}')">✕</button>
    </div>`;
}

// ================================================
// MODAL DE COLORES DE LISTA
// ================================================

function openListColorModal(listId) {
  const list = listsData.find(l => l.id === listId);
  if (!list) return;

  const overlay = document.createElement("div");
  overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.6);
    z-index:300;display:flex;align-items:center;justify-content:center`;

  overlay.innerHTML = `
    <div style="background:var(--bg-card);border:1px solid var(--color-border);
                border-radius:16px;padding:24px;width:100%;max-width:340px">
      <h3 style="margin:0 0 16px;font-size:15px">🎨 Colores de "${list.title}"</h3>

      <div style="margin-bottom:14px">
        <label style="font-size:13px;color:var(--color-muted);display:block;margin-bottom:6px">
          Color de fondo
        </label>
        <div style="display:flex;gap:8px;align-items:center">
          <input type="color" id="lc_bg" value="${list.bg_color || "#111b31"}"
                 style="width:40px;height:36px;cursor:pointer;border-radius:8px;border:none">
          <span id="lc_bg_preview" style="flex:1;padding:8px 12px;border-radius:8px;
                font-size:13px;background:${list.bg_color || "#111b31"};
                color:${list.text_color || "var(--color-text)"}">
            Vista previa
          </span>
        </div>
      </div>

      <div style="margin-bottom:20px">
        <label style="font-size:13px;color:var(--color-muted);display:block;margin-bottom:6px">
          Color de texto
        </label>
        <input type="color" id="lc_text" value="${list.text_color || "#f6f7fb"}"
               style="width:40px;height:36px;cursor:pointer;border-radius:8px;border:none">
      </div>

      <div style="display:flex;gap:8px">
        <button class="btn primary" style="flex:1" onclick="saveListColors('${listId}')">
          Guardar
        </button>
        <button class="btn secondary" onclick="this.closest('[style*=fixed]').remove()">
          Cancelar
        </button>
      </div>
    </div>`;

  // Preview en tiempo real
  overlay.querySelector("#lc_bg").addEventListener("input", e => {
    overlay.querySelector("#lc_bg_preview").style.background = e.target.value;
  });
  overlay.querySelector("#lc_text").addEventListener("input", e => {
    overlay.querySelector("#lc_bg_preview").style.color = e.target.value;
  });

  document.body.appendChild(overlay);
}

async function saveListColors(listId) {
  const bg   = document.getElementById("lc_bg")?.value;
  const text = document.getElementById("lc_text")?.value;

  await supabaseClient.from("lists")
    .update({ bg_color: bg, text_color: text }).eq("id", listId);

  document.querySelector("[style*='fixed'][style*='z-index: 300'], [style*='fixed'][style*='z-index:300']")?.remove();
  await loadLists();
  renderLists();
}

function isDarkColor(hex) {
  const r = parseInt(hex.slice(1,3)||"0",16);
  const g = parseInt(hex.slice(3,5)||"0",16);
  const b = parseInt(hex.slice(5,7)||"0",16);
  return (r*0.299 + g*0.587 + b*0.114) < 128;
}

// ================================================
// CRUD LISTAS
// ================================================

async function createList() {
  const input = document.getElementById("newListTitle");
  const title = input?.value.trim();
  if (!title) { showToast("Escribí un nombre para la lista."); return; }

  const state   = getState();
  const student = JSON.parse(localStorage.getItem("active_student"));

  const { error } = await supabaseClient.from("lists").insert([{
    id: uid("list"), group_id: state.selected.groupId,
    owner_id: student?._dev_mode ? null : student?.id,
    title,
  }]);

  if (error) { showToast("Error al crear lista."); return; }
  if (input) input.value = "";
  await loadLists();
  renderLists();
}

async function deleteList(id) {
  if (!confirm("¿Eliminar esta lista y todos sus ítems?")) return;
  await supabaseClient.from("lists").delete().eq("id", id);
  await loadLists();
  renderLists();
}

// ================================================
// CRUD ÍTEMS
// ================================================

async function addItem(listId) {
  const input = document.getElementById(`newitem_${listId}`);
  const text  = input?.value.trim();
  if (!text) return;

  const list     = listsData.find(l => l.id === listId);
  const position = list?.list_items?.length || 0;

  await supabaseClient.from("list_items").insert([{
    id: uid("item"), list_id: listId, text, position,
  }]);

  if (input) input.value = "";
  await loadLists();
  renderLists();
}

async function toggleItem(itemId, listId, checked) {
  await supabaseClient.from("list_items").update({ checked }).eq("id", itemId);
  const list = listsData.find(l => l.id === listId);
  if (list) {
    const item = list.list_items?.find(i => i.id === itemId);
    if (item) item.checked = checked;
  }
  // Actualizar solo visualmente sin recargar todo
  const el = document.getElementById(`item_${itemId}`);
  const list2 = listsData.find(l => l.id === listId);
  const bg    = list2?.bg_color;
  const isDark = bg ? isDarkColor(bg) : true;
  const mutedCol = isDark ? "rgba(255,255,255,.45)" : "rgba(0,0,0,.45)";
  const txtColor = list2?.text_color || "var(--color-text)";
  if (el) {
    el.classList.toggle("list-item-done", checked);
    const span = el.querySelector(".list-item-text");
    if (span) {
      span.style.textDecoration = checked ? "line-through" : "none";
      span.style.color          = checked ? mutedCol : txtColor;
    }
  }
  // Recargar para actualizar barra de progreso
  await loadLists();
  renderLists();
}

async function deleteItem(itemId, listId) {
  await supabaseClient.from("list_items").delete().eq("id", itemId);
  await loadLists();
  renderLists();
}
