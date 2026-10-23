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
      <div class="card" style="text-align:center;padding:32px">
        <p style="font-size:15px;margin:0 0 8px">Estás en modo desarrollo</p>
        <p class="muted-text">Seleccioná una sección abajo para ver sus grupos o unite con un código.</p>
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
      <div class="card" style="text-align:center;padding:32px">
        <p style="font-size:15px;margin:0 0 8px">Todavía no pertenecés a ningún grupo</p>
        <p class="muted-text">Unite con un código o explorá grupos por sección abajo.</p>
      </div>`;
    return;
  }

  wrap.innerHTML = `
    <h2 style="font-size:16px;margin:0 0 14px">Mis grupos</h2>
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
  const ownerName = group.students?.full_name || "Sin dueño";
  const careerName = group.sections?.careers?.name || "";
  const sectionName = group.sections?.name || "";
  const badge = memberRole === "owner"
    ? `<span class="badge" style="background:#1a3060;color:#7eb3e8">Dueño</span>`
    : memberRole === "member"
    ? `<span class="badge" style="background:#0f2a1a;color:#5dcaa5">Miembro</span>`
    : "";

  return `
    <article class="card" style="display:flex;flex-direction:column;gap:10px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <h3 style="margin:0;font-size:15px">${group.name}</h3>
        ${badge}
      </div>
      ${careerName ? `<p class="muted-text" style="margin:0;font-size:12px">${careerName} · Sección ${sectionName}</p>` : ""}
      <p style="margin:0;font-size:13px"><b>Dueño:</b> ${ownerName}</p>
      <p style="margin:0;font-size:12px;color:#4a5a7a">
        Código: <code style="color:#38bdf8;letter-spacing:1px">${group.invite_code}</code>
      </p>
      <button class="btn primary" onclick="enterGroup('${group.id}')">
        Entrar al grupo
      </button>
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
  location.href = "inicio.html";
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
  if (!code) { alert("Ingresá un código."); return; }

  const { data: group, error } = await supabaseClient
    .from("groups")
    .select("id, name, section_id")
    .eq("invite_code", code)
    .maybeSingle();

  if (error || !group) { alert("Código no encontrado."); return; }

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
