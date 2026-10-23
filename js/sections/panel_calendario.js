// ================================================
// PANEL_CALENDARIO.JS — v3
// Toggle día/noche + días compactos
// ================================================

let calState = {
  year:         new Date().getFullYear(),
  month:        new Date().getMonth(),
  events:       [],
  selected:     null,
  action:       null,
  dateSelected: null,
  tema:         localStorage.getItem("cal_tema") || "noche",
};

const EVENT_TYPES = {
  prueba:  { label: "Prueba",   color: "#f0546a" },
  entrega: { label: "Entrega",  color: "#f5a524" },
  clase:   { label: "Clase",    color: "#2dd4a0" },
  reunion: { label: "Reunión",  color: "#38bdf8" },
  general: { label: "General",  color: "#a78bfa" },
};

// ================================================
// INIT
// ================================================

async function initCalendario() {
  await loadEvents();
  renderCalendar();
  renderEventList();
  renderLeyenda();
  aplicarTemaCalendario(calState.tema);
}

// ================================================
// CARGAR EVENTOS
// ================================================

async function loadEvents() {
  const groupId = getState().selected.groupId;
  if (!groupId) { calState.events = []; return; }

  const { data, error } = await supabaseClient
    .from("events")
    .select("id, title, event_date, type, description")
    .eq("group_id", groupId)
    .order("event_date", { ascending: true });

  if (error) { console.error(error.message); return; }
  calState.events = data || [];
}

// ================================================
// TOGGLE TEMA DÍA / NOCHE
// ================================================

function toggleCalTema(tema) {
  calState.tema = tema;
  localStorage.setItem("cal_tema", tema);
  aplicarTemaCalendario(tema);
}

function aplicarTemaCalendario(tema) {
  const colLeft  = document.querySelector(".cal-col-left");
  const colRight = document.querySelector(".cal-col-right");

  if (!colLeft || !colRight) return;

  if (tema === "dia") {
    colLeft.classList.add("cal-tema-dia");
    colRight.classList.add("cal-tema-dia");
  } else {
    colLeft.classList.remove("cal-tema-dia");
    colRight.classList.remove("cal-tema-dia");
  }

  // Actualizar botones activos
  document.querySelectorAll(".cal-theme-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tema === tema);
  });
}

// ================================================
// RENDER GRID
// ================================================

function renderCalendar() {
  const wrap = document.getElementById("calGrid");
  if (!wrap) return;

  const { year, month } = calState;
  const hoy = new Date();

  const label = document.getElementById("calMonthLabel");
  if (label) {
    label.textContent = new Date(year, month, 1)
      .toLocaleDateString("es-CL", { month: "long", year: "numeric" })
      .replace(/^\w/, c => c.toUpperCase());
  }

  const primerDia = new Date(year, month, 1).getDay();
  const diasEnMes = new Date(year, month + 1, 0).getDate();
  const offset    = (primerDia + 6) % 7;

  const eventsByDay = {};
  calState.events.forEach(ev => {
    const key = ev.event_date.slice(0, 10);
    if (!eventsByDay[key]) eventsByDay[key] = [];
    eventsByDay[key].push(ev);
  });

  let html = "";
  for (let i = 0; i < offset; i++) {
    html += `<div class="cal-day cal-empty"></div>`;
  }

  for (let d = 1; d <= diasEnMes; d++) {
    const fecha  = `${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const evsDia = eventsByDay[fecha] || [];
    const isHoy  = d === hoy.getDate() && month === hoy.getMonth() && year === hoy.getFullYear();
    const isSel  = fecha === calState.dateSelected;

    const dots = evsDia.slice(0, 3).map(ev =>
      `<span class="cal-dot" style="background:${EVENT_TYPES[ev.type]?.color || "#a78bfa"}"></span>`
    ).join("");

    html += `
      <div class="cal-day
        ${isHoy  ? "cal-hoy"           : ""}
        ${evsDia.length ? "cal-tiene-eventos" : ""}
        ${isSel  ? "cal-selected"       : ""}"
           onclick="selectDate('${fecha}')">
        <span class="cal-day-num">${d}</span>
        <div class="cal-dots">${dots}</div>
      </div>`;
  }

  wrap.innerHTML = html;
}

// ================================================
// SELECCIONAR FECHA
// ================================================

function selectDate(fecha) {
  calState.dateSelected = fecha;
  calState.selected     = null;
  renderCalendar();
  openActionModal("add", null, fecha);
}

// ================================================
// LISTA DE PRÓXIMOS EVENTOS
// ================================================

function renderEventList() {
  const lista = document.getElementById("eventList");
  if (!lista) return;

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const proximos = calState.events.filter(ev => new Date(ev.event_date) >= hoy);

  if (!proximos.length) {
    lista.innerHTML = `<p class="muted-text" style="padding:12px 0">No hay eventos próximos.</p>`;
    return;
  }

  lista.innerHTML = proximos.map(ev => {
    const d     = new Date(ev.event_date);
    const dias  = Math.round((d - hoy) / 86400000);
    const tipo  = EVENT_TYPES[ev.type] || EVENT_TYPES.general;
    const isSel = calState.selected?.id === ev.id;

    return `
      <div class="event-list-item ${isSel ? "event-list-selected" : ""}"
           onclick="selectEvent('${ev.id}')">
        <div class="upcoming-fecha" style="border-color:${tipo.color}">
          <span class="upcoming-dia">${d.getDate()}</span>
          <span class="upcoming-mes">${d.toLocaleDateString("es-CL",{month:"short"})}</span>
        </div>
        <div class="upcoming-info">
          <p class="upcoming-titulo">${ev.title}</p>
          <span class="upcoming-meta" style="color:${tipo.color}">${tipo.label}</span>
          <span class="upcoming-meta"> · ${
            dias === 0 ? "¡Hoy!" : dias === 1 ? "Mañana" : `En ${dias} días`
          }</span>
        </div>
      </div>`;
  }).join("");
}

// ================================================
// SELECCIONAR EVENTO EN LISTA
// ================================================

function selectEvent(id) {
  const ev = calState.events.find(e => e.id === id);
  if (!ev) return;

  if (calState.selected?.id === id) {
    calState.selected = null;
    renderEventList();
    closeActionModal();
    return;
  }

  calState.selected     = ev;
  calState.dateSelected = null;
  renderCalendar();
  renderEventList();
}

// ================================================
// BARRA DE ACCIONES
// ================================================

function triggerAction(action) {
  calState.action = action;

  if (action === "add") {
    openActionModal("add", null, calState.dateSelected || null);
    return;
  }

  if (!calState.selected) {
    showToast("Primero seleccioná un evento de la lista.");
    return;
  }

  openActionModal(action, calState.selected, null);
}

// ================================================
// MODAL DE ACCIÓN
// ================================================

function openActionModal(action, ev, fecha) {
  const overlay = document.getElementById("calModalOverlay");
  const box     = document.getElementById("calModalBox");
  if (!overlay || !box) return;

  let html = "";

  if (action === "add") {
    const fechaVal = fecha || calState.dateSelected || new Date().toISOString().slice(0,10);
    html = `
      <div class="cal-modal-header" style="border-left:4px solid #22c55e">
        <span style="font-size:18px">＋</span>
        <h3>Agregar evento</h3>
      </div>
      <input id="m_title" type="text" placeholder="Nombre del evento"
             style="width:100%;margin-bottom:10px">
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <input id="m_date" type="date" value="${fechaVal}" style="flex:1">
        <select id="m_type" style="flex:1">
          ${Object.entries(EVENT_TYPES).map(([k,t]) =>
            `<option value="${k}">${t.label}</option>`
          ).join("")}
        </select>
      </div>
      <input id="m_desc" type="text" placeholder="Descripción (opcional)"
             style="width:100%;margin-bottom:14px">
      <div style="display:flex;gap:8px">
        <button class="btn primary" style="flex:1" onclick="saveAdd()">Guardar</button>
        <button class="btn secondary" onclick="closeActionModal()">Cancelar</button>
      </div>`;
  }

  else if (action === "edit" && ev) {
    const fechaActual = ev.event_date.slice(0,10);
    html = `
      <div class="cal-modal-header" style="border-left:4px solid #38bdf8">
        <span style="font-size:18px">✎</span>
        <h3>Editar evento</h3>
      </div>
      <input id="m_title" type="text" value="${ev.title}"
             style="width:100%;margin-bottom:10px">
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <input id="m_date" type="date" value="${fechaActual}" style="flex:1">
        <select id="m_type" style="flex:1">
          ${Object.entries(EVENT_TYPES).map(([k,t]) =>
            `<option value="${k}" ${k===ev.type?"selected":""}>${t.label}</option>`
          ).join("")}
        </select>
      </div>
      <input id="m_desc" type="text" placeholder="Descripción"
             value="${ev.description || ""}" style="width:100%;margin-bottom:14px">
      <div style="display:flex;gap:8px">
        <button class="btn primary" style="flex:1" onclick="saveEdit('${ev.id}')">
          Guardar cambios
        </button>
        <button class="btn secondary" onclick="closeActionModal()">Cancelar</button>
      </div>`;
  }

  else if (action === "delete" && ev) {
    const d    = new Date(ev.event_date);
    const tipo = EVENT_TYPES[ev.type] || EVENT_TYPES.general;
    html = `
      <div class="cal-modal-header" style="border-left:4px solid #ef4444">
        <span style="font-size:18px">✕</span>
        <h3>Eliminar evento</h3>
      </div>
      <div class="modal-evento" style="border-left:3px solid ${tipo.color};margin-bottom:16px">
        <strong style="font-size:14px">${ev.title}</strong><br>
        <span style="color:${tipo.color};font-size:12px">${tipo.label}</span>
        <span style="font-size:12px;color:#6b7a99">
          · ${d.toLocaleDateString("es-CL",{weekday:"long",day:"numeric",month:"long"})}
        </span>
        ${ev.description
          ? `<p style="font-size:12px;color:#8a9ab8;margin:6px 0 0">${ev.description}</p>`
          : ""}
      </div>
      <p style="font-size:13px;color:#d4ddf0;margin:0 0 14px">
        ¿Confirmar la eliminación?
      </p>
      <div style="display:flex;gap:8px">
        <button class="btn danger"    style="flex:1" onclick="saveDelete('${ev.id}')">
          Sí, eliminar
        </button>
        <button class="btn secondary" style="flex:1" onclick="closeActionModal()">
          No, cancelar
        </button>
      </div>`;
  }

  box.innerHTML = html;
  overlay.style.display = "flex";
  document.getElementById("m_title")?.focus();
}

function closeActionModal() {
  const overlay = document.getElementById("calModalOverlay");
  if (overlay) overlay.style.display = "none";
}

// ================================================
// CRUD — AGREGAR
// ================================================

async function saveAdd() {
  const title = document.getElementById("m_title")?.value.trim();
  const fecha = document.getElementById("m_date")?.value;
  const type  = document.getElementById("m_type")?.value;
  const desc  = document.getElementById("m_desc")?.value.trim();

  if (!title) { showToast("Escribí un nombre para el evento."); return; }
  if (!fecha) { showToast("Seleccioná una fecha."); return; }

  const state   = getState();
  const student = JSON.parse(localStorage.getItem("active_student"));

  const { error } = await supabaseClient.from("events").insert([{
    id:          uid("ev"),
    group_id:    state.selected.groupId,
    owner_id:    student?._dev_mode ? null : student?.id,
    title,
    event_date:  `${fecha}T12:00:00+00:00`,
    type:        type || "general",
    description: desc || "",
  }]);

  if (error) { showToast("Error al guardar."); console.error(error.message); return; }

  closeActionModal();
  calState.dateSelected = null;
  await loadEvents();
  renderCalendar();
  renderEventList();
  showToast("Evento agregado ✓", "success");
}

// ================================================
// CRUD — EDITAR
// ================================================

async function saveEdit(id) {
  const title = document.getElementById("m_title")?.value.trim();
  const fecha = document.getElementById("m_date")?.value;
  const type  = document.getElementById("m_type")?.value;
  const desc  = document.getElementById("m_desc")?.value.trim();

  if (!title) { showToast("El nombre no puede estar vacío."); return; }

  const { error } = await supabaseClient.from("events").update({
    title,
    event_date:  `${fecha}T12:00:00+00:00`,
    type:        type || "general",
    description: desc || "",
  }).eq("id", id);

  if (error) { showToast("Error al editar."); return; }

  calState.selected = null;
  closeActionModal();
  await loadEvents();
  renderCalendar();
  renderEventList();
  showToast("Evento actualizado ✓", "success");
}

// ================================================
// CRUD — ELIMINAR
// ================================================

async function saveDelete(id) {
  const { error } = await supabaseClient.from("events").delete().eq("id", id);
  if (error) { showToast("Error al eliminar."); return; }

  calState.selected = null;
  closeActionModal();
  await loadEvents();
  renderCalendar();
  renderEventList();
  showToast("Evento eliminado.", "danger");
}

// ================================================
// NAVEGACIÓN DE MES
// ================================================

function prevMonth() {
  calState.month--;
  if (calState.month < 0) { calState.month = 11; calState.year--; }
  renderCalendar();
}

function nextMonth() {
  calState.month++;
  if (calState.month > 11) { calState.month = 0; calState.year++; }
  renderCalendar();
}

// ================================================
// LEYENDA
// ================================================

function renderLeyenda() {
  const wrap = document.getElementById("calLeyenda");
  if (!wrap) return;
  wrap.innerHTML = Object.entries(EVENT_TYPES).map(([, t]) =>
    `<span class="leyenda-item">
      <span class="leyenda-dot" style="background:${t.color}"></span>${t.label}
    </span>`
  ).join("");
}
