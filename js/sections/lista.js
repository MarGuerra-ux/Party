// ===============================
// LISTA.JS — listas chequeables
// ===============================

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
    .select(`id, title, created_at,
             list_items(id, text, checked, position)`)
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
    const items  = (list.list_items || []).sort((a,b) => a.position - b.position);
    const total  = items.length;
    const done   = items.filter(i => i.checked).length;

    return `
      <article class="card list-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <h3 style="margin:0;font-size:15px">${list.title}</h3>
          <div style="display:flex;gap:6px;align-items:center">
            <span class="muted-text" style="font-size:12px">${done}/${total}</span>
            <button class="btn-icon-danger" onclick="deleteList('${list.id}')" title="Eliminar lista">✕</button>
          </div>
        </div>
        <div class="list-items-wrap" id="items_${list.id}">
          ${items.map(item => itemHtml(item, list.id)).join("")}
        </div>
        <div style="display:flex;gap:8px;margin-top:10px">
          <input type="text" placeholder="Nuevo ítem..."
                 id="newitem_${list.id}"
                 style="flex:1;font-size:13px"
                 onkeydown="if(event.key==='Enter')addItem('${list.id}')">
          <button class="btn primary" onclick="addItem('${list.id}')">＋</button>
        </div>
      </article>`;
  }).join("");
}

function itemHtml(item, listId) {
  return `
    <div class="list-item ${item.checked ? "list-item-done" : ""}" id="item_${item.id}">
      <input type="checkbox" ${item.checked ? "checked" : ""}
             onchange="toggleItem('${item.id}', '${listId}', this.checked)">
      <span class="list-item-text">${item.text}</span>
      <button class="btn-icon-danger" onclick="deleteItem('${item.id}', '${listId}')">✕</button>
    </div>`;
}

// ===============================
// CRUD LISTAS
// ===============================

async function createList() {
  const input = document.getElementById("newListTitle");
  const title = input?.value.trim();
  if (!title) { alert("Escribí un nombre para la lista."); return; }

  const state   = getState();
  const student = JSON.parse(localStorage.getItem("active_student"));

  const { error } = await supabaseClient.from("lists").insert([{
    id:       uid("list"),
    group_id: state.selected.groupId,
    owner_id: student?._dev_mode ? null : student?.id,
    title,
  }]);

  if (error) { alert("Error al crear lista."); return; }
  if (input) input.value = "";
  await loadLists();
  renderLists();
}

async function deleteList(id) {
  if (!confirm("¿Eliminar esta lista y todos sus ítems?")) return;
  const { error } = await supabaseClient.from("lists").delete().eq("id", id);
  if (error) { alert("Error al eliminar."); return; }
  await loadLists();
  renderLists();
}

// ===============================
// CRUD ÍTEMS
// ===============================

async function addItem(listId) {
  const input = document.getElementById(`newitem_${listId}`);
  const text  = input?.value.trim();
  if (!text) return;

  const list     = listsData.find(l => l.id === listId);
  const position = (list?.list_items?.length || 0);

  const { error } = await supabaseClient.from("list_items").insert([{
    id: uid("item"), list_id: listId, text, position,
  }]);

  if (error) { alert("Error al agregar ítem."); return; }
  if (input) input.value = "";
  await loadLists();
  renderLists();
}

async function toggleItem(itemId, listId, checked) {
  await supabaseClient.from("list_items").update({ checked }).eq("id", itemId);
  // Actualizar solo el ítem visual sin recargar todo
  const el = document.getElementById(`item_${itemId}`);
  if (el) {
    el.classList.toggle("list-item-done", checked);
    const span = el.querySelector(".list-item-text");
    if (span) span.style.textDecoration = checked ? "line-through" : "";
  }
  // Actualizar contador
  const list = listsData.find(l => l.id === listId);
  if (list) {
    const item = list.list_items?.find(i => i.id === itemId);
    if (item) item.checked = checked;
  }
}

async function deleteItem(itemId, listId) {
  await supabaseClient.from("list_items").delete().eq("id", itemId);
  await loadLists();
  renderLists();
}
