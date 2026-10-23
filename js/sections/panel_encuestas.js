// ================================================
// PANEL_ENCUESTAS.JS
// ================================================

let pollsData = [];

async function initEncuestas() {
  await loadPolls();
  renderPolls();
}

async function loadPolls() {
  const groupId = getState().selected.groupId;
  if (!groupId) { pollsData = []; return; }

  const { data, error } = await supabaseClient
    .from("polls")
    .select(`
      id, question, created_at,
      poll_options(id, text, position),
      poll_votes(id, option_id, student_id)
    `)
    .eq("group_id", groupId)
    .order("created_at", { ascending: false });

  if (error) { console.error(error.message); return; }
  pollsData = data || [];
}

function renderPolls() {
  const wrap = document.getElementById("pollsWrap");
  if (!wrap) return;

  if (!pollsData.length) {
    wrap.innerHTML = `<p class="muted-text">No hay encuestas aún.</p>`;
    return;
  }

  const studentId = JSON.parse(localStorage.getItem("active_student"))?.id;

  wrap.innerHTML = pollsData.map(poll => {
    const options   = (poll.poll_options || []).sort((a,b) => a.position - b.position);
    const votes     = poll.poll_votes || [];
    const totalVotes = votes.length;
    const myVote    = votes.find(v => v.student_id === studentId);

    const optionsHtml = options.map(opt => {
      const optVotes = votes.filter(v => v.option_id === opt.id).length;
      const pct      = totalVotes > 0 ? Math.round((optVotes / totalVotes) * 100) : 0;
      const isMyVote = myVote?.option_id === opt.id;

      return `
        <div class="poll-option ${isMyVote ? "poll-option-voted" : ""}"
             onclick="votePoll('${poll.id}', '${opt.id}')">
          <div style="display:flex;justify-content:space-between;margin-bottom:5px">
            <span style="font-size:13px">${opt.text}</span>
            <span style="font-size:12px;color:#6b7a99">${pct}% · ${optVotes} voto${optVotes!==1?"s":""}</span>
          </div>
          <div class="resumen-barra-bg">
            <div class="resumen-barra-fill" style="width:${pct}%;background:${isMyVote ? "#38bdf8" : "#7f77dd"}"></div>
          </div>
        </div>`;
    }).join("");

    return `
      <article class="card" style="margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
          <h3 style="margin:0;font-size:15px">${poll.question}</h3>
          <button class="btn-icon-danger" onclick="deletePoll('${poll.id}')">✕</button>
        </div>
        <div>${optionsHtml}</div>
        <p class="muted-text" style="font-size:12px;margin:10px 0 0">${totalVotes} voto${totalVotes!==1?"s":""} en total</p>
      </article>`;
  }).join("");
}

// ================================================
// CREAR ENCUESTA
// ================================================

async function createPoll() {
  const question = document.getElementById("pollQuestion")?.value.trim();
  const rawOpts  = document.getElementById("pollOptions")?.value.trim();

  if (!question) { alert("Escribí una pregunta."); return; }
  if (!rawOpts)  { alert("Agregá al menos dos opciones."); return; }

  const options = rawOpts.split(/[\n,]+/).map(o => o.trim()).filter(Boolean);
  if (options.length < 2) { alert("Necesitás al menos 2 opciones."); return; }

  const state   = getState();
  const student = JSON.parse(localStorage.getItem("active_student"));
  const pollId  = uid("poll");

  const { error } = await supabaseClient.from("polls").insert([{
    id:       pollId,
    group_id: state.selected.groupId,
    owner_id: student?._dev_mode ? null : student?.id,
    question,
  }]);

  if (error) { alert("Error al crear encuesta."); return; }

  const optRows = options.map((text, i) => ({
    id: uid("opt"), poll_id: pollId, text, position: i
  }));

  await supabaseClient.from("poll_options").insert(optRows);

  document.getElementById("pollQuestion").value = "";
  document.getElementById("pollOptions").value  = "";

  await loadPolls();
  renderPolls();
}

// ================================================
// VOTAR
// ================================================

async function votePoll(pollId, optionId) {
  const student = JSON.parse(localStorage.getItem("active_student"));
  if (!student || student._dev_mode) {
    showToast("Necesitás estar registrado para votar.");
    return;
  }

  // Si ya votó, no hace nada
  const poll   = pollsData.find(p => p.id === pollId);
  const myVote = poll?.poll_votes?.find(v => v.student_id === student.id);
  if (myVote) { showToast("Ya votaste en esta encuesta."); return; }

  const { error } = await supabaseClient.from("poll_votes").insert([{
    id:         uid("vote"),
    poll_id:    pollId,
    option_id:  optionId,
    student_id: student.id,
  }]);

  if (error) { showToast("Error al votar."); return; }
  await loadPolls();
  renderPolls();
}

// ================================================
// ELIMINAR ENCUESTA
// ================================================

async function deletePoll(id) {
  if (!confirm("¿Eliminar esta encuesta y todos sus votos?")) return;
  await supabaseClient.from("polls").delete().eq("id", id);
  await loadPolls();
  renderPolls();
}
