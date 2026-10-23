// ================================================
// PANEL_SORTEOS.JS — v2
// Modal de confirmación + animación de sorteo
// ================================================

let rafflesData    = [];
let raffleModal    = null;
let sorteoInterval = null;

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
        <p class="muted-text" style="font-size:12px;margin:4px 0 6px">
          ${participants.length} participante${participants.length!==1?"s":""}
        </p>
        ${r.winner
          ? `<div style="display:flex;align-items:center;gap:8px;margin-top:4px">
               <span style="font-size:18px">🎺</span>
               <p style="margin:0;font-size:14px">
                 Ganador: <strong style="color:var(--color-accent)">${r.winner}</strong>
               </p>
             </div>`
          : `<button class="btn primary" style="font-size:13px"
                     onclick="openRaffleModal('${r.id}')">
               🎲 Sortear
             </button>`}
      </div>`;
  }).join("");
}

// ================================================
// CREAR SORTEO
// ================================================

async function createRaffle() {
  const titleInput = document.getElementById("raffleTitle");
  const textArea   = document.getElementById("raffleParticipants");

  const title        = titleInput?.value.trim() || "Sorteo";
  const rawText      = textArea?.value.trim();
  if (!rawText) { showToast("Ingresá los participantes."); return; }

  const participants = rawText
    .split(/[\n,]+/)
    .map(p => p.trim())
    .filter(Boolean);

  if (participants.length < 2) { showToast("Necesitás al menos 2 participantes."); return; }

  const state   = getState();
  const student = JSON.parse(localStorage.getItem("active_student"));

  const { data, error } = await supabaseClient.from("raffles").insert([{
    id:           uid("raffle"),
    group_id:     state.selected.groupId,
    owner_id:     student?._dev_mode ? null : student?.id,
    title,
    participants: JSON.stringify(participants),
  }]).select().single();

  if (error) { showToast("Error al crear sorteo."); return; }
  if (titleInput) titleInput.value = "";
  if (textArea)   textArea.value   = "";

  await loadRaffles();
  renderRaffles();

  // Abrir modal de sorteo directamente
  openRaffleModal(data.id);
}

// ================================================
// MODAL DE SORTEO
// ================================================

function openRaffleModal(raffleId) {
  const raffle       = rafflesData.find(r => r.id === raffleId);
  if (!raffle) return;
  const participants = JSON.parse(raffle.participants || "[]");

  // Crear overlay
  const overlay = document.createElement("div");
  overlay.id    = "raffleModalOverlay";
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,.75);
    z-index:300;display:flex;align-items:center;justify-content:center`;

  overlay.innerHTML = `
    <div style="background:var(--bg-card);border:1px solid var(--color-border);
                border-radius:20px;padding:28px;width:100%;max-width:440px;
                max-height:85vh;overflow-y:auto;text-align:center">

      <h2 style="margin:0 0 4px;font-size:20px">${raffle.title}</h2>
      <p class="muted-text" style="margin:0 0 20px;font-size:13px">
        ${participants.length} participantes
      </p>

      <!-- Lista de participantes -->
      <div id="raffleParticipantsList" style="
        display:flex;flex-wrap:wrap;gap:8px;
        justify-content:center;margin-bottom:24px">
        ${participants.map((p, i) => `
          <span class="raffle-name-chip" id="rchip_${i}">${p}</span>
        `).join("")}
      </div>

      <!-- Resultado (oculto inicialmente) -->
      <div id="raffleResult" style="display:none;margin-bottom:20px">
        <p style="font-size:14px;color:var(--color-muted);margin:0 0 8px">
          El participante elegido es:
        </p>
        <p id="raffleWinnerName" style="
          font-size:28px;font-weight:800;
          color:var(--color-accent);margin:0 0 6px"></p>
        <p style="font-size:24px;margin:0">🎺🎉🏆</p>
      </div>

      <!-- Botones -->
      <div id="raffleBtns" style="display:flex;gap:10px;justify-content:center">
        ${!raffle.winner
          ? `<button class="btn primary" style="min-width:140px;font-size:15px"
                     onclick="runAnimation('${raffleId}')">
               🎲 Sortear
             </button>`
          : ""}
        <button class="btn secondary" onclick="closeRaffleModal()">Cerrar</button>
      </div>

    </div>`;

  document.body.appendChild(overlay);
  raffleModal = overlay;

  // Si ya tiene ganador, mostrarlo de una
  if (raffle.winner) {
    showWinner(raffle.winner, participants);
  }
}

function closeRaffleModal() {
  if (sorteoInterval) { clearInterval(sorteoInterval); sorteoInterval = null; }
  raffleModal?.remove();
  raffleModal = null;
}

// ================================================
// ANIMACIÓN DE SORTEO
// ================================================

async function runAnimation(raffleId) {
  const raffle       = rafflesData.find(r => r.id === raffleId);
  if (!raffle) return;
  const participants = JSON.parse(raffle.participants || "[]");

  // Deshabilitar botón
  const btn = document.querySelector("#raffleBtns .btn.primary");
  if (btn) { btn.disabled = true; btn.textContent = "Sorteando..."; }

  const chips = document.querySelectorAll(".raffle-name-chip");
  let frame   = 0;
  let speed   = 80;   // ms entre highlights
  const total = 4000; // 4 segundos de animación
  const start = Date.now();

  // Elegir ganador de antemano
  const winnerIdx = Math.floor(Math.random() * participants.length);

  sorteoInterval = setInterval(() => {
    const elapsed  = Date.now() - start;
    const progress = elapsed / total;

    // Velocidad progresivamente más lenta
    speed = 80 + progress * 320;

    // Highlight aleatorio
    chips.forEach(c => c.classList.remove("raffle-highlight"));
    const randomIdx = Math.floor(Math.random() * chips.length);
    chips[randomIdx]?.classList.add("raffle-highlight");

    if (elapsed >= total) {
      clearInterval(sorteoInterval);
      sorteoInterval = null;

      // Highlight al ganador
      chips.forEach(c => c.classList.remove("raffle-highlight", "raffle-loser"));
      chips.forEach((c, i) => {
        if (i !== winnerIdx) c.classList.add("raffle-loser");
      });
      chips[winnerIdx]?.classList.add("raffle-winner-chip");

      // Guardar en Supabase
      const winner = participants[winnerIdx];
      supabaseClient.from("raffles")
        .update({ winner, drawn_at: new Date().toISOString() })
        .eq("id", raffleId)
        .then(() => {
          loadRaffles().then(renderRaffles);
        });

      // Mostrar resultado
      setTimeout(() => showWinner(winner, participants), 600);
    }
  }, speed);
}

function showWinner(winner, participants) {
  const resultEl = document.getElementById("raffleResult");
  const nameEl   = document.getElementById("raffleWinnerName");
  const btnsEl   = document.getElementById("raffleBtns");

  if (resultEl) resultEl.style.display = "block";
  if (nameEl)   nameEl.textContent = winner;
  if (btnsEl)   btnsEl.innerHTML = `<button class="btn secondary" onclick="closeRaffleModal()">Cerrar</button>`;

  // Highlight ganador en los chips si están
  document.querySelectorAll(".raffle-name-chip").forEach(c => {
    if (c.textContent === winner) {
      c.classList.add("raffle-winner-chip");
      c.classList.remove("raffle-loser");
    } else {
      c.classList.add("raffle-loser");
    }
  });
}

// ================================================
// ELIMINAR SORTEO
// ================================================

async function deleteRaffle(id) {
  if (!confirm("¿Eliminar este sorteo?")) return;
  await supabaseClient.from("raffles").delete().eq("id", id);
  await loadRaffles();
  renderRaffles();
}
