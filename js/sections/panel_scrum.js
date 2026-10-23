// ================================================
// PANEL_SCRUM.JS — v2
// Kanban con flechas de movimiento + drag & drop
// ================================================

let currentColumns = [];
let currentTasks   = [];
let dragTask       = null;
let dragOverCol    = null;

async function initScrum() {
  await loadScrumData();
  renderColumnSelect();
  renderKanban();
}

// ================================================
// CARGAR DATOS
// ================================================

async function loadScrumData() {
  const groupId = getState().selected.groupId;
  if (!groupId) { currentColumns = []; currentTasks = []; return; }

  const [colRes, taskRes] = await Promise.all([
    supabaseClient
      .from("scrum_columns")
      .select("*")
      .eq("group_id", groupId)
      .order("position", { ascending: true }),
    supabaseClient
      .from("scrum_tasks")
      .select("id, title, column_id, owner_id, permission, position, students:owner_id(full_name)")
      .eq("group_id", groupId)
      .order("position", { ascending: true }),
  ]);

  currentColumns = colRes.data  || [];
  currentTasks   = taskRes.data || [];
}

// ================================================
// KANBAN
// ================================================

function renderColumnSelect() {
  const select = document.getElementById("columnSelect");
  if (!select) return;
  select.innerHTML = currentColumns
    .map(c => `<option value="${c.id}">${c.title}</option>`)
    .join("");
}

function renderKanban() {
  const board = document.getElementById("kanbanBoard");
  if (!board) return;
  board.innerHTML = "";

  if (!currentColumns.length) {
    board.innerHTML = `<p class="muted-text">No hay columnas. Creá una para empezar.</p>`;
    return;
  }

  currentColumns.forEach((col, colIndex) => {
    const tasks = currentTasks.filter(t => t.column_id === col.id);
    const colDiv = document.createElement("div");
    colDiv.className = "kanban-column";
    colDiv.dataset.colId = col.id;

    // Drag over column
    colDiv.addEventListener("dragover", e => {
      e.preventDefault();
      dragOverCol = col.id;
      document.querySelectorAll(".kanban-column").forEach(c => c.classList.remove("drag-over"));
      colDiv.classList.add("drag-over");
    });

    colDiv.addEventListener("drop", async e => {
      e.preventDefault();
      colDiv.classList.remove("drag-over");
      if (dragTask && dragOverCol && dragTask.column_id !== dragOverCol) {
        await moveTaskToColumn(dragTask.id, dragOverCol);
      }
      dragTask = null; dragOverCol = null;
    });

    colDiv.innerHTML = `
      <div class="column-header">
        <span class="column-title">${col.icon || ""} ${col.title}</span>
        <span class="badge">${tasks.length}</span>
      </div>
      <div class="tasks-wrap" id="tasks_${col.id}">
        ${tasks.length
          ? tasks.map((t, tIdx) => taskHtml(t, colIndex, tIdx)).join("")
          : `<p class="muted-text" style="font-size:12px;padding:8px 0;text-align:center">Sin tareas</p>`}
      </div>`;

    board.appendChild(colDiv);
  });
}

function taskHtml(task, colIndex, taskIndex) {
  const ownerName   = task.students?.full_name || "Sin dueño";
  const isFirst     = colIndex === 0;
  const isLast      = colIndex === currentColumns.length - 1;
  const colId       = task.column_id;

  return `
    <article class="task-card"
             draggable="true"
             id="task_${task.id}"
             ondragstart="onDragStart(event, '${task.id}')"
             ondragend="onDragEnd(event)">

      <div class="task-drag-handle" title="Arrastrá para mover">⠿</div>

      <div class="task-body">
        <h4>${task.title}</h4>
        <p class="task-meta">
          <b>${ownerName}</b> · ${task.permission || "member"}
        </p>
      </div>

      <div class="task-arrow-btns">
        ${!isFirst
          ? `<button class="arrow-btn left"
               title="Mover a columna anterior"
               onclick="moveTaskArrow('${task.id}', 'left')">‹</button>`
          : `<span class="arrow-placeholder"></span>`}
        ${!isLast
          ? `<button class="arrow-btn right"
               title="Mover a columna siguiente"
               onclick="moveTaskArrow('${task.id}', 'right')">›</button>`
          : `<span class="arrow-placeholder"></span>`}
      </div>

      <div class="task-actions">
        <button class="btn secondary" onclick="editTask('${task.id}')">Editar</button>
        <button class="btn danger"    onclick="deleteTask('${task.id}')">✕</button>
      </div>
    </article>`;
}

// ================================================
// DRAG & DROP
// ================================================

function onDragStart(e, taskId) {
  dragTask = currentTasks.find(t => t.id === taskId);
  e.dataTransfer.effectAllowed = "move";
  setTimeout(() => {
    const el = document.getElementById(`task_${taskId}`);
    if (el) el.classList.add("dragging");
  }, 0);
}

function onDragEnd(e) {
  document.querySelectorAll(".task-card").forEach(c => c.classList.remove("dragging"));
  document.querySelectorAll(".kanban-column").forEach(c => c.classList.remove("drag-over"));
}

// ================================================
// FLECHAS ← →
// ================================================

async function moveTaskArrow(taskId, direction) {
  const task    = currentTasks.find(t => t.id === taskId);
  if (!task) return;

  const colIdx  = currentColumns.findIndex(c => c.id === task.column_id);
  const newIdx  = direction === "left" ? colIdx - 1 : colIdx + 1;

  if (newIdx < 0 || newIdx >= currentColumns.length) return;

  await moveTaskToColumn(taskId, currentColumns[newIdx].id);
}

async function moveTaskToColumn(taskId, newColId) {
  const { error } = await supabaseClient
    .from("scrum_tasks")
    .update({ column_id: newColId })
    .eq("id", taskId);

  if (error) { showToast("Error al mover tarea."); return; }
  await loadScrumData();
  renderKanban();
}

// ================================================
// TAREAS — CRUD
// ================================================

async function addTask() {
  const input            = document.getElementById("taskTitle");
  const columnSelect     = document.getElementById("columnSelect");
  const permissionSelect = document.getElementById("taskPermission");
  if (!input || !columnSelect) return;

  const title = input.value.trim();
  if (!title) { showToast("Escribí una tarea."); return; }

  const student  = JSON.parse(localStorage.getItem("active_student"));
  const position = currentTasks.filter(t => t.column_id === columnSelect.value).length;

  const { error } = await supabaseClient.from("scrum_tasks").insert([{
    id:         uid("task"),
    group_id:   getState().selected.groupId,
    column_id:  columnSelect.value,
    title,
    owner_id:   student?._dev_mode ? null : student?.id,
    permission: permissionSelect?.value || "member",
    position,
  }]);

  if (error) { showToast("Error al crear tarea."); return; }
  input.value = "";
  await loadScrumData();
  renderKanban();
}

async function editTask(id) {
  const task = currentTasks.find(t => t.id === id);
  if (!task) return;

  // Modal simple de edición
  const overlay = document.createElement("div");
  overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:300;
    display:flex;align-items:center;justify-content:center`;
  overlay.innerHTML = `
    <div style="background:var(--bg-card);border:1px solid var(--color-border);
                border-radius:16px;padding:24px;width:100%;max-width:380px">
      <h3 style="margin:0 0 14px">Editar tarea</h3>
      <input id="et_title" type="text" value="${task.title}" style="width:100%;margin-bottom:10px">
      <select id="et_perm" style="width:100%;margin-bottom:14px">
        <option value="member"   ${task.permission==="member"   ?"selected":""}>Miembro</option>
        <option value="owner"    ${task.permission==="owner"    ?"selected":""}>Owner</option>
        <option value="readonly" ${task.permission==="readonly" ?"selected":""}>Solo lectura</option>
      </select>
      <div style="display:flex;gap:8px">
        <button class="btn primary" style="flex:1" id="et_save">Guardar</button>
        <button class="btn secondary" id="et_cancel">Cancelar</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  document.getElementById("et_title").focus();

  document.getElementById("et_cancel").onclick = () => overlay.remove();
  document.getElementById("et_save").onclick   = async () => {
    const title = document.getElementById("et_title").value.trim();
    const perm  = document.getElementById("et_perm").value;
    if (!title) return;

    await supabaseClient.from("scrum_tasks")
      .update({ title, permission: perm }).eq("id", id);

    overlay.remove();
    await loadScrumData();
    renderKanban();
  };
}

async function deleteTask(id) {
  if (!confirm("¿Eliminar esta tarea?")) return;
  await supabaseClient.from("scrum_tasks").delete().eq("id", id);
  await loadScrumData();
  renderKanban();
}

// ================================================
// COLUMNAS — CRUD
// ================================================

async function addColumn() {
  const title = prompt("Nombre de la nueva columna");
  if (!title?.trim()) return;
  const icon     = prompt("Ícono (opcional)", "📌") || "";
  const position = currentColumns.length;

  const { error } = await supabaseClient.from("scrum_columns").insert([{
    id: uid("col"), group_id: getState().selected.groupId,
    title: title.trim(), icon, position,
  }]);

  if (error) { showToast("Error al crear columna."); return; }
  await loadScrumData();
  renderColumnSelect();
  renderKanban();
}

async function renameSelectedColumn() {
  const select = document.getElementById("columnSelect");
  const col    = currentColumns.find(c => c.id === select?.value);
  if (!col) return;

  const name = prompt("Nuevo nombre:", col.title);
  if (!name?.trim()) return;
  const icon = prompt("Ícono:", col.icon || "");

  await supabaseClient.from("scrum_columns")
    .update({ title: name.trim(), icon: icon || "" }).eq("id", col.id);
  await loadScrumData();
  renderColumnSelect();
  renderKanban();
}

async function deleteSelectedColumn() {
  const select = document.getElementById("columnSelect");
  if (!select || currentColumns.length <= 1) {
    showToast("Debe quedar al menos una columna."); return;
  }

  const col = currentColumns.find(c => c.id === select.value);
  if (!col || !confirm(`¿Eliminar "${col.title}"?`)) return;

  const fallback = currentColumns.find(c => c.id !== col.id);
  await supabaseClient.from("scrum_tasks")
    .update({ column_id: fallback.id }).eq("column_id", col.id);
  await supabaseClient.from("scrum_columns").delete().eq("id", col.id);
  await loadScrumData();
  renderColumnSelect();
  renderKanban();
}
