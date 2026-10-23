// ===============================
// GRUPOS.JS — v2
// Muestra grupos del estudiante
// sin necesitar sección previa
// ===============================

const student = JSON.parse(localStorage.getItem("active_student"));
if (!student) location.href = "../index.html";

let state = getState();

// ===============================
// INICIO
// ===============================

async function init() {
  renderStudentInfo();
  await Promise.all([
    cargarMisGrupos(),
    cargarSecciones(),
  ]);
}

function renderStudentInfo() {
  const el = document.getElementById("studentInfo");
  if (el) el.textContent = student.full_name || student.email || "Invitado";
}

// ===============================
// MIS GRUPOS — grupos donde ya soy miembro
// ===============================

async function cargarMisGrupos() {
  const wrap = document.getElementById("misGrupos");
  if (!wrap) return;

  // Perfil dev temporal — no tiene membresías en Supabase
  if (student._dev_mode) {
    wrap.innerHTML = `
      <div class="p-card soon" style="padding:32px">
        <h3>Estás en modo desarrollo</h3>
        <p>Selecciona una sección abajo para ver sus grupos o únete con un código.</p>
      </div>`;
    return;
  }

  const { data: memberships, error } = await supabaseClient
    .from("student_groups")
    .select(`
      role,
      groups (
        id, name, invite_code, is_open, section_id,
        students:owner_id ( full_name ),
        sections ( name, careers ( name ) )
      )
    `)
    .eq("student_id", student.id);

  if (error) { console.error(error); wrap.innerHTML = `<p class="muted-text">Error cargando grupos.</p>`; return; }

  if (!memberships || !memberships.length) {
    wrap.innerHTML = `
      <div class="p-card soon" style="padding:32px">
        <h3>Todavía no perteneces a ningún grupo</h3>
        <p>Únete con un código o explora los grupos por sección más abajo.</p>
      </div>`;
    return;
  }

  wrap.innerHTML = `
    <h3 style="font-size:16px;margin:0 0 14px">Tus grupos</h3>
    <div class="grid">
      ${memberships.map(m => tarjetaGrupo(m.groups, m.role)).join("")}
    </div>`;
}

// ===============================
// SECCIONES — para el selector
// ===============================

async function cargarSecciones() {
  const select = document.getElementById("sectionFilter");
  if (!select) return;

  const { data, error } = await supabaseClient
    .from("sections")
    .select("id, name, careers(name)")
    .order("name");

  if (error || !data) return;

  data.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = `${s.careers?.name || "?"} · ${s.name}`;
    select.appendChild(opt);
  });
}

// ===============================
// GRUPOS POR SECCIÓN
// ===============================

async function cargarGruposPorSeccion(sectionId) {
  const wrap = document.getElementById("gruposSeccion");
  if (!wrap || !sectionId) { wrap.innerHTML = ""; return; }

  wrap.innerHTML = `<p class="muted-text">Cargando...</p>`;

  const { data, error } = await supabaseClient
    .from("groups")
    .select(`id, name, invite_code, is_open, students:owner_id(full_name)`)
    .eq("section_id", sectionId)
    .order("name");

  if (error || !data) { wrap.innerHTML = `<p class="muted-text">Error cargando grupos.</p>`; return; }

  if (!data.length) {
    wrap.innerHTML = `<p class="muted-text">No hay grupos en esta sección aún.</p>`;
    return;
  }

  // Marcar cuáles ya es miembro
  let memberOf = new Set();
  if (!student._dev_mode) {
    const { data: mem } = await supabaseClient
      .from("student_groups")
      .select("group_id")
      .eq("student_id", student.id);
    memberOf = new Set((mem || []).map(m => m.group_id));
  }

  wrap.innerHTML = `<div class="grid">
    ${data.map(g => tarjetaGrupo(g, memberOf.has(g.id) ? "member" : null)).join("")}
  </div>`;

  // Guardar sección seleccionada
  state.selected.sectionId = sectionId;
  setState(state);
}

// ===============================
// TARJETA DE GRUPO
// ===============================

function tarjetaGrupo(group, memberRole) {
  if (!group) return "";
  const esc = Party.esc;
  const ownerName = group.students?.full_name || "Sin dueño";
  const careerName = group.sections?.careers?.name || "";
  const sectionName = group.sections?.name || "";
  const active = getState().selected.groupId === group.id;
  const badge = memberRole === "owner"
    ? `<span class="pill violet">Dueño</span>`
    : memberRole === "member" ? `<span class="pill ok">Miembro</span>` : "";

  return `
    <article class="p-card" style="display:flex;flex-direction:column;gap:10px;${active ? "border-color:var(--color-accent)" : ""}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
        <h3 style="margin:0;font-size:16px">${esc(group.name)}</h3>
        ${active ? `<span class="pill info">Activo</span>` : badge}
      </div>
      ${careerName ? `<p style="margin:0;font-size:12px;color:var(--color-muted)">${esc(careerName)} · Sección ${esc(sectionName)}</p>` : ""}
      <p style="margin:0;font-size:13px"><b>Dueño:</b> ${esc(ownerName)}</p>
      <p style="margin:0;font-size:12px;color:var(--color-muted)">
        Código: <code style="color:var(--color-accent);letter-spacing:1px">${esc(group.invite_code)}</code>
      </p>
      <button class="btn primary" style="margin:6px 0 0" onclick="enterGroup('${esc(group.id)}')">Entrar al grupo</button>
    </article>`;
}

// ===============================
// ENTRAR A UN GRUPO
// ===============================

async function enterGroup(groupId) {
  if (!student._dev_mode) {
    const { data: existing } = await supabaseClient
      .from("student_groups")
      .select("id")
      .eq("student_id", student.id)
      .eq("group_id", groupId)
      .maybeSingle();

    if (!existing) {
      await supabaseClient.from("student_groups").insert([{
        id:         uid("sg"),
        student_id: student.id,
        group_id:   groupId,
        role:       "member",
      }]);
    }
  }

  state.selected.groupId = groupId;
  setState(state);
  location.href = "panel.html";
}

// ===============================
// UNIRSE CON CÓDIGO
// ===============================

function showJoinModal() {
  const m = document.getElementById("joinModal");
  if (m) { m.style.display = "flex"; document.getElementById("inviteCodeInput")?.focus(); }
}

function closeJoinModal() {
  const m = document.getElementById("joinModal");
  if (m) m.style.display = "none";
}

async function joinByCode() {
  const code = document.getElementById("inviteCodeInput")?.value.trim().toUpperCase();
  if (!code) { showToast("Escribe un código.", "warning"); return; }

  const { data: group, error } = await supabaseClient
    .from("groups")
    .select("id, name, section_id")
    .eq("invite_code", code)
    .maybeSingle();

  if (error || !group) { showToast("Código no encontrado.", "danger"); return; }

  closeJoinModal();
  await enterGroup(group.id);
}

// ===============================
// LOGOUT
// ===============================

function logoutStudent() {
  localStorage.removeItem("active_student");
  localStorage.removeItem("logichive_v1");
  location.href = "../index.html";
}

// ===============================
// ARRANCAR
// ===============================

init();
