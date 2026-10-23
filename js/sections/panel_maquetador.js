// ======================================
// MAQUETADOR
// ======================================

function initMaquetador() {
  renderMaquetador();
}

// ======================================
// RENDER
// ======================================

function renderMaquetador() {
  const wrap = document.getElementById("maquetadorWrap");
  if (!wrap) return;

  wrap.innerHTML = `

    <div class="card">

      <h2>🎨 Maquetador</h2>

      <p class="muted-text">
        Centro de generación de contenido.
      </p>

    </div>

    <div style="
      display:grid;
      grid-template-columns:repeat(auto-fit,minmax(240px,1fr));
      gap:16px;
      margin-top:16px;
    ">

      <div class="card">
        <h3>📥 Fuentes</h3>

        <p class="muted-text">
          Sube documentos, PDFs, imágenes,
          hojas Excel o presentaciones.
        </p>

        <button class="btn primary"
                onclick="alert('Próximamente')">
          Abrir fuentes
        </button>
      </div>

      <div class="card">
        <h3>🤖 IA</h3>

        <p class="muted-text">
          Analiza tus documentos y genera
          conocimiento automáticamente.
        </p>

        <button class="btn secondary"
                onclick="alert('Próximamente')">
          Abrir IA
        </button>
      </div>

      <div class="card">
        <h3>📄 Generación</h3>

        <p class="muted-text">
          Genera resúmenes, apuntes,
          informes y presentaciones.
        </p>

        <button class="btn secondary"
                onclick="alert('Próximamente')">
          Abrir generación
        </button>
      </div>

      <div class="card">
        <h3>📚 Biblioteca</h3>

        <p class="muted-text">
          Accede rápidamente a todos los
          archivos almacenados.
        </p>

        <button class="btn secondary"
                onclick="abrirBibliotecaDesdeMaquetador()">
          Abrir biblioteca
        </button>
      </div>

    </div>

  `;
}

// ======================================
// ATAJO A BIBLIOTECA
// ======================================

function abrirBibliotecaDesdeMaquetador() {

  const btn =
    document.querySelector(
      '.tab[data-tab="biblioteca"]'
    );

  if (btn) btn.click();
}