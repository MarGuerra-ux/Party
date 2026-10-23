// ===============================
// SORTEO.JS
// ===============================

let rafflesData = [];

async function initSorteo() {
  await loadRaffles();
  renderRaffles();
}

async function loadRaffles() {
  const groupId = getState().selected.groupId;
  if (!groupId) { rafflesData = []; return; }

  const { data, error } = await supabaseClient
    .from("raffles")
    .select("id, title, participants, winner, drawn_at, created_at")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false });

  if (error) { console.error(error.message); return; }
  rafflesData = data || [];
}

function renderRaffles() {
  const historial = document.getElementById("raffleHistorial");
  if (!historial) return;

  if (!rafflesData.length) {
    historial.innerHTML = `<p class="muted-text">No hay sorteos aún.</p>`;
    return;
  }

  historial.innerHTML = rafflesData.map(r => {
    const participants = JSON.parse(r.participants || "[]");
    return `
      <div class="raffle-item">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <strong style="font-size:14px">${r.title}</strong>
          <button class="btn-icon-danger" onclick="deleteRaffle('${r.id}')">✕</button>
        </div>
        <p class="muted-text" style="font-size:12px;margin:4px 0">
          ${participants.length} participantes
        </p>
        ${r.winner
          ? `<p style="font-size:14px;margin:6px 0 0">
               🎉 Ganador: <strong style="color:#38bdf8">${r.winner}</strong>
             </p>`
          : `<button class="btn warning" onclick="drawWinner('${r.id}')">Sortear</button>`
        }
      </div>`;
  }).join("");
}

// ===============================
// CREAR SORTEO
// ===============================

async function createRaffle() {
  const titleInput = document.getElementById("raffleTitle");
  const textArea   = document.getElementById("raffleParticipants");

  const title        = titleInput?.value.trim() || "Sorteo";
  const rawText      = textArea?.value.trim();
  if (!rawText) { alert("Ingresá los participantes."); return; }

  const participants = rawText
    .split(/[\n,]+/)
    .map(p => p.trim())
    .filter(Boolean);

  if (participants.length < 2) { alert("Necesitás al menos 2 participantes."); return; }

  const state   = getState();
  const student = JSON.parse(localStorage.getItem("active_student"));

  const { error } = await supabaseClient.from("raffles").insert([{
    id:           uid("raffle"),
    group_id:     state.selected.groupId,
    owner_id:     student?._dev_mode ? null : student?.id,
    title,
    participants: JSON.stringify(participants),
  }]);

  if (error) { alert("Error al crear sorteo."); return; }
  if (titleInput) titleInput.value = "";
  if (textArea)   textArea.value   = "";
  await loadRaffles();
  renderRaffles();
}

// ===============================
// SORTEAR GANADOR
// ===============================

async function drawWinner(id) {
  const raffle       = rafflesData.find(r => r.id === id);
  if (!raffle) return;

  const participants = JSON.parse(raffle.participants || "[]");
  if (!participants.length) return;

  const winner = participants[Math.floor(Math.random() * participants.length)];

  const { error } = await supabaseClient
    .from("raffles")
    .update({ winner, drawn_at: new Date().toISOString() })
    .eq("id", id);

  if (error) { alert("Error al sortear."); return; }

  // Animación rápida antes de recargar
  const btn = document.querySelector(`[onclick="drawWinner('${id}')"]`);
  if (btn) {
    btn.textContent = `🎉 ${winner}`;
    btn.disabled    = true;
  }

  setTimeout(async () => {
    await loadRaffles();
    renderRaffles();
  }, 800);
}

// ===============================
// ELIMINAR SORTEO
// ===============================

async function deleteRaffle(id) {
  if (!confirm("¿Eliminar este sorteo?")) return;
  await supabaseClient.from("raffles").delete().eq("id", id);
  await loadRaffles();
  renderRaffles();
}
