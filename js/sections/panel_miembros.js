// ================================================
// PANEL_MIEMBROS.JS — Miembros del grupo activo
// ================================================

async function initMiembros() {
  const wrap = document.getElementById("miembrosWrap");
  if (!wrap) return;
  const P = Party, esc = P.esc;
  const groupId = getState().selected.groupId;

  if (!groupId) {
    wrap.innerHTML = `<div class="p-card soon"><span class="file-ico">${P.icon("users")}</span>
      <h3>Aún no hay un grupo activo</h3>
      <p>Entra a un grupo desde la sección Grupos para ver a sus miembros.</p>
      <button class="btn primary" style="margin-top:16px" onclick="Party.go('grupos')">Ir a Grupos</button></div>`;
    return;
  }

  wrap.innerHTML = `<p class="muted-text">Cargando miembros...</p>`;
  const [mem, grp] = await Promise.all([
    supabaseClient.from("student_groups").select("role, joined_at, students(id, full_name)").eq("group_id", groupId).order("joined_at", { ascending: true }),
    supabaseClient.from("groups").select("invite_code, is_open").eq("id", groupId).maybeSingle(),
  ]);

  const list = (mem.data || []).filter((m) => m.students);
  const me = P.student()?.id;
  const code = grp.data?.invite_code || "—";

  const rows = list.map((m, i) => `
    <div class="row member-row">
      <span class="member-av" style="--c:${MEMBER_COLORS[i % MEMBER_COLORS.length]}">${esc(P.initial(m.students.full_name))}</span>
      <div class="grow">
        <div class="t">${esc(m.students.full_name)}${m.students.id === me ? " (Tú)" : ""}</div>
        <div class="s">${m.joined_at ? "Se unió " + PartyData.ago(m.joined_at).replace(/^Hace /, "hace ") : ""}</div>
      </div>
      <span class="pill ${m.role === "owner" ? "violet" : ""}">${m.role === "owner" ? "Administrador" : "Miembro"}</span>
    </div>`).join("");

  wrap.innerHTML = `
    <div class="dash-grid" style="margin-top:0">
      <section class="p-card span-8">
        <div class="card-head"><h3>${P.icon("users")}Miembros (${list.length})</h3></div>
        <div class="row-list">${rows || `<div class="empty">Este grupo todavía no tiene miembros.</div>`}</div>
      </section>
      <section class="p-card span-4">
        <div class="card-head"><h3>${P.icon("plug")}Invitar al grupo</h3></div>
        <p style="margin:0 0 12px;font-size:13px">Comparte este código para que tus compañeros se unan:</p>
        <div style="text-align:center;font-size:26px;font-weight:800;letter-spacing:.14em;padding:16px;border-radius:14px;background:var(--bg-secondary);border:1px dashed var(--color-accent);color:var(--color-accent)">${esc(code)}</div>
        <button class="btn primary full" id="copyCodeBtn">Copiar código</button>
        <p style="margin:6px 0 0;font-size:12px;color:var(--color-muted)">${grp.data?.is_open === false ? "El dueño aprueba cada ingreso." : "Cualquiera con el código puede unirse."}</p>
      </section>
    </div>`;

  wrap.querySelector("#copyCodeBtn")?.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(code); showToast("Código copiado ✓", "success"); }
    catch { showToast("Copia el código manualmente: " + code); }
  });
}
