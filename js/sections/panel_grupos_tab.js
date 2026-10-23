// ================================================
// PANEL_GRUPOS_TAB.JS
// Vista de grupos dentro del panel (tab)
// Sin cerrar sesión — solo navegar
// ================================================

async function initGruposTab() {
  const student = JSON.parse(localStorage.getItem("active_student"));
  if (!student) return;

  const wrap = document.getElementById("gruposTabWrap");
  if (!wrap) return;

  wrap.innerHTML = `<p class="muted-text">Cargando grupos...</p>`;

  // Mis grupos
  const { data: memberships } = await supabaseClient
    .from("student_groups")
    .select(`
      role,
      groups(
        id, name, invite_code,
        students:owner_id(full_name),
        sections(name, careers(name))
      )
    `)
    .eq("student_id", student.id);

  const misGrupos = memberships || [];
  const activeGroupId = getState().selected.groupId;

  const misGruposHtml = misGrupos.length
    ? misGrupos.map(m => {
        const g = m.groups;
        if (!g) return "";
        const isActive = g.id === activeGroupId;
        return `
          <article class="card" style="display:flex;flex-direction:column;gap:8px;${isActive ? "border-color:#38bdf8" : ""}">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <h3 style="margin:0;font-size:14px">${g.name}</h3>
              ${isActive
                ? `<span class="badge" style="background:#0d1e38;color:#38bdf8">Activo</span>`
                : `<button class="btn primary" style="font-size:12px;padding:4px 12px" onclick="switchGroup('${g.id}')">Cambiar</button>`}
            </div>
            <p class="muted-text" style="margin:0;font-size:12px">
              ${g.sections?.careers?.name || ""} · ${g.sections?.name || ""}
            </p>
            <p style="margin:0;font-size:12px">
              Código: <code style="color:#38bdf8">${g.invite_code}</code>
            </p>
          </article>`;
      }).join("")
    : `<p class="muted-text">Aún no pertenecés a ningún grupo.</p>`;

  wrap.innerHTML = `
    <!-- MIS GRUPOS -->
    <div style="margin-bottom:24px">
      <h2 style="font-size:16px;margin:0 0 14px">Mis grupos</h2>
      <div class="grid">${misGruposHtml}</div>
    </div>

    <!-- UNIRSE CON CÓDIGO -->
    <div class="card" style="margin-bottom:24px">
      <h3 style="font-size:15px;margin:0 0 12px">Unirse con código de invitación</h3>
      <div style="display:flex;gap:8px">
        <input id="tabInviteCode" type="text" placeholder="Ej: INF-G1A"
               style="flex:1;letter-spacing:2px;text-transform:uppercase"
               onkeydown="if(event.key==='Enter')joinByCodeTab()">
        <button class="btn primary" onclick="joinByCodeTab()">Unirse</button>
      </div>
    </div>

    <!-- CREAR NUEVO GRUPO -->
    <div class="card">
      <h3 style="font-size:15px;margin:0 0 12px">Crear nuevo grupo</h3>
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <input id="tabNewGroupName" type="text" placeholder="Nombre del grupo" style="flex:1">
      </div>
      <div style="margin-bottom:12px">
        <select id="tabSectionSelect" style="width:100%">
          <option value="">Sin sección (grupo personal)</option>
        </select>
      </div>
      <button class="btn primary" onclick="createGroupTab()">Crear grupo</button>
    </div>`;

  // Cargar secciones en el select
  loadSectionsForTab();
}

async function loadSectionsForTab() {
  const select = document.getElementById("tabSectionSelect");
  if (!select) return;

  const { data } = await supabaseClient
    .from("sections")
    .select("id, name, careers(name)")
    .order("name");

  (data || []).forEach(s => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = `${s.careers?.name || "?"} · ${s.name}`;
    select.appendChild(opt);
  });
}

// ------------------------------------------------
// CAMBIAR GRUPO ACTIVO
// ------------------------------------------------

function switchGroup(groupId) {
  const state = getState();
  state.selected.groupId = groupId;
  setState(state);

  // Resetear tabs para que recarguen con el nuevo grupo
  Object.keys(_tabsInited).forEach(k => {
    if (k !== "grupos") _tabsInited[k] = false;
  });

  renderContext();
  showToast("Grupo cambiado ✓", "success");

  // Volver al scrum
  document.querySelector('.tab[data-tab="scrum"]')?.click();
}

// ------------------------------------------------
// UNIRSE CON CÓDIGO
// ------------------------------------------------

async function joinByCodeTab() {
  const code = document.getElementById("tabInviteCode")?.value.trim().toUpperCase();
  if (!code) { showToast("Ingresá un código."); return; }

  const { data: group } = await supabaseClient
    .from("groups")
    .select("id, name, section_id")
    .eq("invite_code", code)
    .maybeSingle();

  if (!group) { showToast("Código no encontrado."); return; }

  const student = JSON.parse(localStorage.getItem("active_student"));
  if (!student || student._dev_mode) {
    showToast("Necesitás estar registrado para unirte.");
    return;
  }

  const { data: existing } = await supabaseClient
    .from("student_groups")
    .select("id")
    .eq("student_id", student.id)
    .eq("group_id", group.id)
    .maybeSingle();

  if (!existing) {
    await supabaseClient.from("student_groups").insert([{
      id: uid("sg"), student_id: student.id,
      group_id: group.id, role: "member",
    }]);
  }

  showToast(`¡Te uniste a "${group.name}"!`, "success");
  switchGroup(group.id);
}

// ------------------------------------------------
// CREAR GRUPO
// ------------------------------------------------

async function createGroupTab() {
  const name      = document.getElementById("tabNewGroupName")?.value.trim();
  const sectionId = document.getElementById("tabSectionSelect")?.value || null;

  if (!name) { showToast("Escribí un nombre para el grupo."); return; }

  const student = JSON.parse(localStorage.getItem("active_student"));
  if (!student || student._dev_mode) {
    showToast("Necesitás estar registrado para crear grupos.");
    return;
  }

  const newId = uid("grp");
  const { error } = await supabaseClient.from("groups").insert([{
    id: newId, section_id: sectionId || null,
    owner_id: student.id, name,
  }]);

  if (error) { showToast("Error al crear grupo."); return; }

  await supabaseClient.from("student_groups").insert([{
    id: uid("sg"), student_id: student.id,
    group_id: newId, role: "owner",
  }]);

  showToast(`Grupo "${name}" creado ✓`, "success");
  _tabsInited["grupos"] = false;
  initGruposTab();
}
