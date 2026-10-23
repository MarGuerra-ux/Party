// ===============================
// APP.JS — Login (modo desarrollo)
// Entrada libre — sin autenticación
// Se reactivará en fase final
// ===============================

initLogin();
checkActiveStudent();

// ===============================
// AUTO LOGIN — si ya hay sesión activa
// ===============================

function checkActiveStudent() {
  const student = JSON.parse(localStorage.getItem("active_student"));
  if (!student) return;

  saveSession(student);

  const state = getState();
  if (state.selected.groupId) {
    location.href = "pages/inicio.html";
  } else {
    location.href = "pages/inicio.html";
  }
}

// ===============================
// LOGIN — entrada libre
// Crea un perfil temporal en memoria
// sin validar contra Supabase
// ===============================

function initLogin() {
  const btn = document.getElementById("loginBtn");
  if (!btn) return;
  btn.addEventListener("click", handleLogin);

  document.getElementById("userInput")
    ?.addEventListener("keydown", e => {
      if (e.key === "Enter") handleLogin();
    });
}

async function handleLogin() {
  const input = document.getElementById("userInput")?.value.trim();

  // Modo desarrollo: si el campo está vacío entramos como Marco directamente
  const identifier = input || "marco.antonsat@gmail.com";

  // Primero intentar buscar en Supabase por email o teléfono
  let student = null;

  const { data: byEmail } = await supabaseClient
    .from("students")
    .select("id, full_name, phone, email, role, active_role")
    .eq("email", identifier)
    .maybeSingle();

  if (byEmail) {
    student = byEmail;
  } else {
    const { data: byPhone } = await supabaseClient
      .from("students")
      .select("id, full_name, phone, email, role, active_role")
      .eq("phone", identifier)
      .maybeSingle();

    if (byPhone) student = byPhone;
  }

  // Si no existe en Supabase, crear perfil temporal local
  // (útil mientras se construye el registro real)
  if (!student) {
    student = {
      id:          "dev_" + Date.now(),
      full_name:   identifier.includes("@") ? identifier.split("@")[0] : identifier,
      email:       identifier.includes("@") ? identifier : null,
      phone:       identifier.includes("@") ? null : identifier,
      role:        "student",
      active_role: "student",
      _dev_mode:   true,   // marcador para saber que es temporal
    };
    console.warn("⚠️ Modo desarrollo: perfil temporal creado localmente.");
  }

  localStorage.setItem("active_student", JSON.stringify(student));
  saveSession(student);

  // Verificar membresías en Supabase (solo si no es perfil temporal)
  if (!student._dev_mode) {
    const { data: memberships } = await supabaseClient
      .from("student_groups")
      .select("group_id")
      .eq("student_id", student.id)
      .limit(1);

    if (memberships && memberships.length > 0) {
      const state = getState();
      state.selected.groupId = memberships[0].group_id;
      setState(state);
    }
  }

  location.href = "pages/inicio.html";
}

// ===============================
// SESIÓN
// ===============================

function saveSession(student) {
  const state = getState();

  state.session = {
    role:        student.role        || "student",
    active_role: student.active_role || student.role || "student",
    user:        student.full_name,
    studentId:   student.id,
  };

  setState(state);
}
