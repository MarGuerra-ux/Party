// ===============================
// SCRUM.JS — Tablero Kanban
// ===============================

let currentColumns = [];
let currentTasks   = [];

async function initScrum() {
  await loadScrumData();
  renderColumnSelect();
  renderKanban();
}

// ===============================
// CARGAR DATOS
// ===============================

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

// ===============================
// KANBAN
// ===============================

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
    board.innerHTML = `<p class="muted-text">No hay columnas para este grupo.</p>`;
    return;
  }

  currentColumns.forEach(col => {
    const tasks = currentTasks.filter(t => t.column_id === col.id);
    const colDiv = document.createElement("div");
    colDiv.className = "kanban-column";
    colDiv.innerHTML = `
      <div class="column-header">
        <span class="column-title">${col.icon || ""} ${col.title}</span>
        <span class="badge">${tasks.length}</span>
      </div>
      ${tasks.length
        ? tasks.map(taskHtml).join("")
        : `<p class="muted-text" style="font-size:13px;padding:8px 0">Sin tareas</p>`}
    `;
    board.appendChild(colDiv);
  });
}

function taskHtml(task) {
  const ownerName = task.students?.full_name || "Sin dueño";
  return `
    <article class="task-card">
      <h4>${task.title}</h4>
      <p>
        <b>Dueño:</b> ${ownerName}<br>
        <b>Permiso:</b> ${task.permission || "member"}
      </p>
      <div class="task-actions">
        <button class="btn secondary" onclick="moveTask('${task.id}')">Mover</button>
        <button class="btn warning"   onclick="editTask('${task.id}')">Editar</button>
        <button class="btn danger"    onclick="deleteTask('${task.id}')">Eliminar</button>
      </div>
    </article>`;
}

// ===============================
// TAREAS — CRUD
// ===============================

async function addTask() {
  const input            = document.getElementById("taskTitle");
  const columnSelect     = document.getElementById("columnSelect");
  const permissionSelect = document.getElementById("taskPermission");
  if (!input || !columnSelect) return;

  const title = input.value.trim();
  if (!title) { alert("Escribí una tarea."); return; }

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

  if (error) { alert("Error al crear tarea."); console.error(error.message); return; }
  input.value = "";
  await loadScrumData();
  renderKanban();
}

async function editTask(id) {
  const task = currentTasks.find(t => t.id === id);
  if (!task) return;

  const title = prompt("Nuevo nombre:", task.title);
  if (!title?.trim()) return;
  const permission = prompt("Permiso (owner / member / readonly):", task.permission);

  const { error } = await supabaseClient
    .from("scrum_tasks")
    .update({ title: title.trim(), permission: permission || task.permission })
    .eq("id", id);

  if (error) { alert("Error al editar."); return; }
  await loadScrumData();
  renderKanban();
}

async function moveTask(id) {
  const task = currentTasks.find(t => t.id === id);
  if (!task) return;

  const options = currentColumns.map(c => c.title).join(" / ");
  const input   = prompt(`Mover a columna:\n${options}`)?.trim().toLowerCase();
  if (!input) return;

  const col = currentColumns.find(c => c.title.toLowerCase() === input);
  if (!col) { alert("Columna no encontrada."); return; }

  const { error } = await supabaseClient
    .from("scrum_tasks").update({ column_id: col.id }).eq("id", id);

  if (error) { alert("Error al mover."); return; }
  await loadScrumData();
  renderKanban();
}

async function deleteTask(id) {
  if (!confirm("¿Eliminar esta tarea?")) return;
  const { error } = await supabaseClient.from("scrum_tasks").delete().eq("id", id);
  if (error) { alert("Error al eliminar."); return; }
  await loadScrumData();
  renderKanban();
}

// ===============================
// COLUMNAS — CRUD
// ===============================

async function addColumn() {
  const title = prompt("Nombre de la nueva columna");
  if (!title?.trim()) return;
  const icon     = prompt("Ícono (opcional)", "📌") || "";
  const position = currentColumns.length;

  const { error } = await supabaseClient.from("scrum_columns").insert([{
    id:       uid("col"),
    group_id: getState().selected.groupId,
    title:    title.trim(),
    icon,
    position,
  }]);

  if (error) { alert("Error al crear columna."); return; }
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

  const { error } = await supabaseClient
    .from("scrum_columns")
    .update({ title: name.trim(), icon: icon || "" })
    .eq("id", col.id);

  if (error) { alert("Error al renombrar."); return; }
  await loadScrumData();
  renderColumnSelect();
  renderKanban();
}

async function deleteSelectedColumn() {
  const select = document.getElementById("columnSelect");
  if (!select || currentColumns.length <= 1) {
    alert("Debe quedar al menos una columna."); return;
  }

  const col = currentColumns.find(c => c.id === select.value);
  if (!col || !confirm(`¿Eliminar columna "${col.title}"?`)) return;

  const fallback = currentColumns.find(c => c.id !== col.id);
  await supabaseClient
    .from("scrum_tasks").update({ column_id: fallback.id }).eq("column_id", col.id);

  const { error } = await supabaseClient
    .from("scrum_columns").delete().eq("id", col.id);

  if (error) { alert("Error al eliminar columna."); return; }
  await loadScrumData();
  renderColumnSelect();
  renderKanban();
}
