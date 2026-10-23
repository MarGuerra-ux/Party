// ===============================
// APUNTES.JS — estilo Google Keep
// ===============================

let notesData = [];

async function initApuntes() {
  await loadNotes();
  renderNotes();
}

async function loadNotes() {
  const groupId = getState().selected.groupId;
  if (!groupId) { notesData = []; return; }

  const { data, error } = await supabaseClient
    .from("notes")
    .select("id, title, content, color, pinned, created_at")
    .eq("group_id", groupId)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) { console.error(error.message); return; }
  notesData = data || [];
}

function renderNotes() {
  const wrap = document.getElementById("notesGrid");
  if (!wrap) return;

  if (!notesData.length) {
    wrap.innerHTML = `<p class="muted-text">No hay apuntes aún. ¡Creá el primero!</p>`;
    return;
  }

  wrap.innerHTML = notesData.map(note => `
    <article class="note-card" style="background:${note.color || "#111b31"}"
             onclick="openNoteModal('${note.id}')">
      <div class="note-card-header">
        <h4>${note.title}</h4>
        ${note.pinned ? `<span title="Fijado">📌</span>` : ""}
      </div>
      <p class="note-preview">${note.content?.slice(0, 120) || "Sin contenido"}${note.content?.length > 120 ? "…" : ""}</p>
    </article>
  `).join("");
}

// ===============================
// MODAL APUNTE
// ===============================

function openNoteModal(id) {
  const note = id ? notesData.find(n => n.id === id) : null;
  showNoteModal(note);
}

function newNote() {
  showNoteModal(null);
}

function showNoteModal(note) {
  const overlay = document.getElementById("noteModalOverlay");
  const box     = document.getElementById("noteModalBox");
  if (!overlay || !box) return;

  const NOTE_COLORS = ["#111b31","#1a2a1a","#2a1a1a","#1a1a2a","#2a2a1a"];

  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <h3 style="margin:0;font-size:16px">${note ? "Editar apunte" : "Nuevo apunte"}</h3>
      <button class="btn secondary" onclick="closeNoteModal()">✕</button>
    </div>
    <input id="n_title" type="text" placeholder="Título" value="${note?.title || ""}"
           style="width:100%;margin-bottom:10px">
    <textarea id="n_content" placeholder="Contenido del apunte..."
              style="width:100%;min-height:120px;margin-bottom:10px;resize:vertical">${note?.content || ""}</textarea>
    <div style="display:flex;gap:6px;margin-bottom:14px;align-items:center">
      <span style="font-size:12px;color:#6b7a99">Color:</span>
      ${NOTE_COLORS.map(c => `
        <span onclick="document.getElementById('n_color').value='${c}'"
              style="width:22px;height:22px;border-radius:50%;background:${c};cursor:pointer;
                     border:2px solid ${note?.color===c ? '#38bdf8':'#1e3a5f'}"></span>
      `).join("")}
      <input type="hidden" id="n_color" value="${note?.color || "#111b31"}">
    </div>
    <label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:14px;cursor:pointer">
      <input type="checkbox" id="n_pinned" ${note?.pinned ? "checked" : ""}> Fijar apunte
    </label>
    <div style="display:flex;gap:8px">
      <button class="btn primary" style="flex:1"
              onclick="${note ? `saveEditNote('${note.id}')` : "saveNewNote()"}">
        ${note ? "Guardar cambios" : "Crear apunte"}
      </button>
      ${note ? `<button class="btn danger" onclick="deleteNote('${note.id}')">Eliminar</button>` : ""}
      <button class="btn secondary" onclick="closeNoteModal()">Cancelar</button>
    </div>
  `;

  overlay.style.display = "flex";
  document.getElementById("n_title")?.focus();
}

function closeNoteModal() {
  const o = document.getElementById("noteModalOverlay");
  if (o) o.style.display = "none";
}

// ===============================
// CRUD
// ===============================

async function saveNewNote() {
  const title   = document.getElementById("n_title")?.value.trim();
  const content = document.getElementById("n_content")?.value.trim();
  const color   = document.getElementById("n_color")?.value || "#111b31";
  const pinned  = document.getElementById("n_pinned")?.checked || false;

  if (!title) { alert("El título no puede estar vacío."); return; }

  const state   = getState();
  const student = JSON.parse(localStorage.getItem("active_student"));

  const { error } = await supabaseClient.from("notes").insert([{
    id:       uid("note"),
    group_id: state.selected.groupId,
    owner_id: student?._dev_mode ? null : student?.id,
    title, content: content || "", color, pinned,
  }]);

  if (error) { alert("Error al guardar."); console.error(error.message); return; }
  closeNoteModal();
  await loadNotes();
  renderNotes();
}

async function saveEditNote(id) {
  const title   = document.getElementById("n_title")?.value.trim();
  const content = document.getElementById("n_content")?.value.trim();
  const color   = document.getElementById("n_color")?.value || "#111b31";
  const pinned  = document.getElementById("n_pinned")?.checked || false;

  if (!title) { alert("El título no puede estar vacío."); return; }

  const { error } = await supabaseClient
    .from("notes").update({ title, content: content || "", color, pinned }).eq("id", id);

  if (error) { alert("Error al editar."); return; }
  closeNoteModal();
  await loadNotes();
  renderNotes();
}

async function deleteNote(id) {
  if (!confirm("¿Eliminar este apunte?")) return;
  const { error } = await supabaseClient.from("notes").delete().eq("id", id);
  if (error) { alert("Error al eliminar."); return; }
  closeNoteModal();
  await loadNotes();
  renderNotes();
}
