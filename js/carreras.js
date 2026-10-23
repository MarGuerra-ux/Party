// ===============================
// ESTADO GLOBAL
// ===============================

let state = getState();

// 🔐 BLOQUEO PARA ALUMNOS
const activeStudent = JSON.parse(localStorage.getItem("active_student"));

if (activeStudent) {
  if (activeStudent.group_id) {
    location.href = "panel.html";
  } else {
    location.href = "grupos.html";
  }
}

// ===============================
// RENDER PRINCIPAL
// ===============================

function renderCareers() {
  applyRoleVisibility();

  const grid = document.getElementById("careerGrid");

  if (!grid) return;

  grid.innerHTML = "";

  if (!state.careers || state.careers.length === 0) {
    grid.innerHTML = "<p>No hay carreras registradas.</p>";
    return;
  }

  state.careers.forEach((career) => {
    const card = createCareerCard(career);
    grid.appendChild(card);
  });
}

function createCareerCard(career) {
  const card = document.createElement("article");
  card.className = "card";

  const sections = career.sections || [];

  const sectionButtons = sections
    .map((section) => {
      return `
        <button 
          class="section-btn" 
          onclick="enterSection('${career.id}', '${section.id}')"
        >
          ${section.name}
        </button>
      `;
    })
    .join("");

  card.innerHTML = `
    <h2>${career.name}</h2>

    <p>Código carrera: ${career.code}</p>

    <div>
      ${
        sectionButtons ||
        "<p>Esta carrera todavía no tiene secciones registradas.</p>"
      }
    </div>

    <p>
      Clave de sección: libre en esta maqueta. 
      Presiona la sección para entrar.
    </p>
  `;

  return card;
}

// ===============================
// NAVEGACIÓN
// ===============================

function enterSection(careerId, sectionId) {
  state.selected.careerId = careerId;
  state.selected.sectionId = sectionId;

  setState(state);

  location.href = "grupos.html";
}

// ===============================
// ADMINISTRADOR DE CARRERAS
// ===============================

function createCareer() {
  const name = prompt("Nombre de la carrera");

  if (!name || !name.trim()) return;

  const code = prompt("Código de carrera", "NUE") || "NUE";

  const exists = findCareerByCode(code);

  if (exists) {
    alert("Ya existe una carrera con ese código.");
    return;
  }

  state.careers.push({
    id: uid("career"),
    name: name.trim(),
    code: code.trim(),
    sections: [],
  });

  setState(state);
  renderCareers();
}

function renameCareer() {
  const code = prompt("Código de carrera a renombrar");

  if (!code || !code.trim()) return;

  const career = findCareerByCode(code);

  if (!career) {
    alert("Carrera no encontrada");
    return;
  }

  const name = prompt("Nuevo nombre", career.name);

  if (!name || !name.trim()) return;

  career.name = name.trim();

  setState(state);
  renderCareers();
}

function deleteCareer() {
  const code = prompt("Código de carrera a eliminar");

  if (!code || !code.trim()) return;

  const career = findCareerByCode(code);

  if (!career) {
    alert("Carrera no encontrada");
    return;
  }

  const confirmDelete = confirm(
    `¿Seguro que deseas eliminar la carrera "${career.name}"?`
  );

  if (!confirmDelete) return;

  career.sections.forEach((section) => {
    delete state.groups[section.id];
  });

  state.careers = state.careers.filter(
    (career) => career.code.toLowerCase() !== code.trim().toLowerCase()
  );

  if (state.selected.careerId === career.id) {
    state.selected.careerId = null;
    state.selected.sectionId = null;
    state.selected.groupId = null;
  }

  setState(state);
  renderCareers();
}

function findCareerByCode(code) {
  return state.careers.find(
    (career) => career.code.toLowerCase() === code.trim().toLowerCase()
  );
}

// ===============================
// ADMINISTRADOR DE SECCIONES
// ===============================

function createSection() {
  const code = prompt("Código de carrera donde agregar sección");

  if (!code || !code.trim()) return;

  const career = findCareerByCode(code);

  if (!career) {
    alert("Carrera no encontrada");
    return;
  }

  const name = prompt("Nombre sección. Ej: 003-V");

  if (!name || !name.trim()) return;

  const id = generateSectionId(name);

  const exists = career.sections.some((section) => section.id === id);

  if (exists) {
    alert("Ya existe una sección con ese nombre en esta carrera.");
    return;
  }

  career.sections.push({
    id,
    name: name.trim(),
    key: "",
  });

  if (!state.groups[id]) {
    state.groups[id] = [];
  }

  setState(state);
  renderCareers();
}

function renameSection() {
  const name = prompt("Nombre actual de sección");

  if (!name || !name.trim()) return;

  const found = findSectionByName(name);

  if (!found) {
    alert("Sección no encontrada");
    return;
  }

  const newName = prompt("Nuevo nombre", found.section.name);

  if (!newName || !newName.trim()) return;

  const oldId = found.section.id;
  const newId = generateSectionId(newName);

  found.section.name = newName.trim();
  found.section.id = newId;

  state.groups[newId] = state.groups[oldId] || [];
  delete state.groups[oldId];

  if (state.selected.sectionId === oldId) {
    state.selected.sectionId = newId;
  }

  setState(state);
  renderCareers();
}

function deleteSection() {
  const name = prompt("Nombre de sección a eliminar. Ej: 003-V");

  if (!name || !name.trim()) return;

  const found = findSectionByName(name);

  if (!found) {
    alert("Sección no encontrada");
    return;
  }

  const confirmDelete = confirm(
    `¿Seguro que deseas eliminar la sección "${found.section.name}"?`
  );

  if (!confirmDelete) return;

  const sectionId = found.section.id;

  found.career.sections = found.career.sections.filter(
    (section) => section.id !== sectionId
  );

  delete state.groups[sectionId];

  if (state.selected.sectionId === sectionId) {
    state.selected.sectionId = null;
    state.selected.groupId = null;
  }

  setState(state);
  renderCareers();
}

function findSectionByName(name) {
  for (const career of state.careers) {
    const section = career.sections.find(
      (section) =>
        section.name.toLowerCase() === name.trim().toLowerCase()
    );

    if (section) {
      return {
        career,
        section,
      };
    }
  }

  return null;
}

function generateSectionId(name) {
  return name.trim().toLowerCase().replaceAll(" ", "-");
}

// ===============================
// INICIO
// ===============================

renderCareers();