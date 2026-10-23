init();

async function init() {
  await loadCareers();
}

// ===============================
// CARGAR CARRERAS
// ===============================

async function loadCareers() {
  const select = document.getElementById("careerSelect");

  const { data, error } = await supabaseClient
    .from("careers")
    .select("*")
    .order("name");

  if (error) {
    alert("Error cargando carreras");
    console.error(error.message);
    return;
  }

  select.innerHTML = "";

  data.forEach((career) => {
    const option = document.createElement("option");
    option.value = career.id;
    option.textContent = career.name;
    select.appendChild(option);
  });

  // cargar secciones de la primera carrera
  if (data.length) {
    loadSections(data[0].id);
  }

  select.addEventListener("change", (e) => {
    loadSections(e.target.value);
  });
}

// ===============================
// CARGAR SECCIONES
// ===============================

async function loadSections(careerId) {
  const select = document.getElementById("sectionSelect");

  const { data, error } = await supabaseClient
    .from("sections")
    .select("*")
    .eq("career_id", careerId)
    .order("name");

  if (error) {
    alert("Error cargando secciones");
    console.error(error.message);
    return;
  }

  select.innerHTML = "";

  data.forEach((section) => {
    const option = document.createElement("option");
    option.value = section.id;
    option.textContent = section.name;
    select.appendChild(option);
  });
}

// ===============================
// REGISTRO
// ===============================

async function registerStudent() {
  const fullName = document.getElementById("fullNameInput").value.trim();
  const phone = document.getElementById("phoneInput").value.trim();
  const email = document.getElementById("emailInput").value.trim();

  const careerId = document.getElementById("careerSelect").value;
  const sectionId = document.getElementById("sectionSelect").value;

  if (!fullName) return alert("Ingresa tu nombre");
  if (!phone) return alert("Ingresa tu teléfono");

  // verificar si ya existe
  const { data: existing } = await supabaseClient
    .from("students")
    .select("*")
    .eq("phone", phone)
    .maybeSingle();

  if (existing) {
    saveSession(existing);
    location.href = "grupos.html";
    return;
  }

  const student = {
    id: uid("student"),
    full_name: fullName,
    phone,
    email: email || null,
    career_id: careerId,
    section_id: sectionId,
    role: "student",
  };

  const { data, error } = await supabaseClient
    .from("students")
    .insert([student])
    .select()
    .single();

  if (error) {
    console.error(error.message);
    alert("Error registrando alumno");
    return;
  }

  saveSession(data);
  location.href = "grupos.html";
}

// ===============================
// SESIÓN
// ===============================

function saveSession(student) {
  localStorage.setItem("active_student", JSON.stringify(student));

  const state = getState();

  state.session = {
    role: "student",
    user: student.full_name,
    phone: student.phone,
    studentId: student.id,
    careerId: student.career_id,
    sectionId: student.section_id,
  };

  state.selected.careerId = student.career_id;
  state.selected.sectionId = student.section_id;
  state.selected.groupId = student.group_id || null;

  setState(state);
}