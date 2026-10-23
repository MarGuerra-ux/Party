// ===============================
// PANEL.JS — Scrum + tabs
// ===============================

let state = getState();
let currentColumns = [];
let currentTasks   = [];

function init() {
  applyRoleVisibility();
  setupTabs();
  loadPanel();

  // Tab inicial desde otra página (ej: Inicio → Calendario)
  const tabInicial = localStorage.getItem("panel_tab_inicial");
  if (tabInicial) {
    localStorage.removeItem("panel_tab_inicial");
    const btn = document.querySelector(`.tab[data-tab="${tabInicial}"]`);
    if (btn) setTimeout(() => btn.click(), 50);
  }
}

async function loadPanel() {
  await renderContext();
  await loadScrumData();
  renderColumnSelect();
  renderKanban();
}

// ===============================
// CONTEXTO DEL GRUPO
// ===============================

async function renderContext() {
  const context = document.getElementById("panelContext");
  if (!context) return;

  const groupId = state.selected.groupId;
  if (!groupId) { context.textContent = "Grupo no seleccionado."; return; }

  const { data, error } = await supabaseClient
    .from("groups")
    .select(`id, name, sections(id, name, careers(id, name))`)
    .eq("id", groupId)
    .single();

  if (error || !data) { context.textContent = "No se pudo cargar el grupo."; return; }

  context.textContent =
    `${data.sections?.careers?.name || "Carrera"} → ` +
    `${data.sections?.name || "Sección"} → ` +
    `${data.name || "Grupo"}`;
}

// ===============================
// TABS
// ===============================

function setupTabs() {
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      const panel = document.getElementById(btn.dataset.tab);
      if (panel) panel.classList.add("active");
    });
  });
}

// ===============================
// CARGAR DATOS SCRUM
// ===============================

async function loadScrumData() {
  const groupId = state.selected.groupId;
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
    board.innerHTML = "<p>No hay columnas para este grupo.</p>";
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
// AGREGAR TAREA
// ===============================

async function addTask() {
  const input           = document.getElementById("taskTitle");
  const columnSelect    = document.getElementById("columnSelect");
  const permissionSelect = document.getElementById("taskPermission");
  if (!input || !columnSelect) return;

  const title = input.value.trim();
  if (!title) { alert("Escribí una tarea."); return; }

  const student  = JSON.parse(localStorage.getItem("active_student"));
  const ownerId  = student?.id || null;
  const position = currentTasks.filter(t => t.column_id === columnSelect.value).length;

  const { error } = await supabaseClient.from("scrum_tasks").insert([{
    id:         uid("task"),
    group_id:   state.selected.groupId,
    column_id:  columnSelect.value,
    title,
    owner_id:   ownerId,
    permission: permissionSelect?.value || "member",
    position,
  }]);

  if (error) { alert("Error al crear tarea."); console.error(error.message); return; }

  input.value = "";
  await loadScrumData();
  renderKanban();
}

// ===============================
// EDITAR TAREA
// ===============================

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

// ===============================
// MOVER TAREA
// ===============================

async function moveTask(id) {
  const task = currentTasks.find(t => t.id === id);
  if (!task) return;

  const options = currentColumns.map(c => `${c.title}`).join(" / ");
  const colNames = currentColumns.map(c => c.title.toLowerCase());

  const input = prompt(`Mover a columna:\n${options}`)?.trim().toLowerCase();
  if (!input) return;

  const col = currentColumns.find(c => c.title.toLowerCase() === input);
  if (!col) { alert("Columna no encontrada. Escribí el nombre exacto."); return; }

  const { error } = await supabaseClient
    .from("scrum_tasks")
    .update({ column_id: col.id })
    .eq("id", id);

  if (error) { alert("Error al mover."); return; }
  await loadScrumData();
  renderKanban();
}

// ===============================
// ELIMINAR TAREA
// ===============================

async function deleteTask(id) {
  if (!confirm("¿Eliminar esta tarea?")) return;

  const { error } = await supabaseClient
    .from("scrum_tasks").delete().eq("id", id);

  if (error) { alert("Error al eliminar."); return; }
  await loadScrumData();
  renderKanban();
}

// ===============================
// COLUMNAS
// ===============================

async function addColumn() {
  const title = prompt("Nombre de la nueva columna");
  if (!title?.trim()) return;
  const icon = prompt("Ícono (opcional)", "📌") || "";
  const position = currentColumns.length;

  const { error } = await supabaseClient.from("scrum_columns").insert([{
    id:       uid("col"),
    group_id: state.selected.groupId,
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
  const col = currentColumns.find(c => c.id === select?.value);
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
  if (!select) return;

  if (currentColumns.length <= 1) { alert("Debe quedar al menos una columna."); return; }

  const col = currentColumns.find(c => c.id === select.value);
  if (!col || !confirm(`¿Eliminar columna "${col.title}"? Las tareas pasarán a la primera columna.`)) return;

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

// ===============================
// INICIO
// ===============================

init();
