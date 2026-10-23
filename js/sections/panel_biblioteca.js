// ================================================
// BIBLIOTECA — carpetas por asignatura y unidad
//  · Cada asignatura tiene su carpeta, dividida en unidades
//    ("Experiencia 1", "Experiencia 2"… en Duoc UC).
//  · El número al inicio del nombre del archivo (1.1.2, 2.1.4, 3.1…)
//    decide en qué unidad se guarda. El nombre NO se modifica.
//  · También carpetas propias y archivos sueltos.
//  · Un chat guía va preguntando qué crear y dónde subir material.
// Almacenamiento: Supabase (tabla party_docs + bucket party-library); IndexedDB queda como caché local.
// ================================================

const Lib = (() => {
  const esc = (s) => Party.esc(s);
  const LBL_KEY = "party_unit_label";
  const LABELS = ["Experiencia", "Unidad", "Módulo", "Semana"];

  let nodes = [], cwd = null, query = "", S = null, dbOk = true, uploadTarget = null;

  // ---------- IndexedDB ----------
  let _db;
  const open = () => _db || (_db = new Promise((ok, no) => {
    if (!window.indexedDB) return no(new Error("sin indexedDB"));
    const r = indexedDB.open("party_library", 1);
    r.onupgradeneeded = () => { r.result.createObjectStore("nodes", { keyPath: "id" }); r.result.createObjectStore("blobs"); };
    r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
  }));
  const R = (r) => new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  const st = async (name, mode = "readonly") => (await open()).transaction(name, mode).objectStore(name);
  // Capa local (IndexedDB = caché rápida)
  const rawAll = async () => R((await st("nodes")).getAll());
  const rawGet = async (id) => R((await st("nodes")).get(id));
  const rawPut = async (n) => R((await st("nodes", "readwrite")).put(n));
  const rawDel = async (id) => { await R((await st("nodes", "readwrite")).delete(id)); await R((await st("blobs", "readwrite")).delete(id)); };
  const rawPutBlob = async (id, b) => R((await st("blobs", "readwrite")).put(b, id));
  const rawGetBlob = async (id) => R((await st("blobs")).get(id));

  // Capa en la nube (Supabase: tabla party_docs + bucket party-library). Si no hay sesión o red, queda solo local y se reintenta.
  const BUCKET = "party-library";
  const cloud = () => { try { const m = Party.student(); return m && !m._dev_mode && typeof supabaseClient !== "undefined" && typeof PartyStore !== "undefined" ? m : null; } catch { return null; } };
  const strip = ({ synced, ...n }) => n;
  if (typeof PartyStore !== "undefined") PartyStore.register("library_node", async (id) => { const n = await rawGet(id); return n ? strip(n) : null; });
  async function upload(n) {
    const m = cloud(); if (!m || n.type !== "file") return;
    const b = await rawGetBlob(n.id); if (!b) return;
    const { error } = await supabaseClient.storage.from(BUCKET).upload(`${m.id}/${n.id}`, b, { upsert: true, contentType: n.mime || b.type || "application/octet-stream" });
    if (error) throw error;
    if (!n.remote) { n.remote = true; await rawPut(n); PartyStore.push("library_node", n.id); }
  }
  const dbAll = async () => rawAll();
  const dbPut = async (n) => {
    n.mod = Date.now(); await rawPut(n);
    if (cloud()) { PartyStore.push("library_node", n.id); if (n.type === "file" && !n.remote) upload(n).catch((e) => console.warn("Storage:", e.message || e)); }
  };
  const dbDel = async (id) => {
    const n = await rawGet(id); await rawDel(id);
    const m = cloud(); if (!m) return;
    PartyStore.remove("library_node", id);
    if (n?.type === "file") supabaseClient.storage.from(BUCKET).remove([`${m.id}/${id}`]).catch(() => {});
  };
  const putBlob = async (id, b) => rawPutBlob(id, b);         // la subida a la nube ocurre en dbPut (cuando el nodo ya existe)
  const getBlob = async (id) => {
    const b = await rawGetBlob(id); if (b) return b;
    const m = cloud(); if (!m) return b;
    const { data, error } = await supabaseClient.storage.from(BUCKET).download(`${m.id}/${id}`);
    if (error || !data) return undefined;
    await rawPutBlob(id, data); return data;
  };
  // Mezcla lo local con lo de la nube (la primera vez sube todo lo que ya tenías en este navegador).
  let syncing = false;
  async function syncCloud() {
    if (syncing || !cloud()) return false;
    syncing = true; let changed = false;
    try {
      const remote = await PartyStore.fetchAll("library_node"); if (!remote) return false;
      const pend = PartyStore.pending("library_node");
      const local = new Map((await rawAll()).map((n) => [n.id, n]));
      const seen = new Set();
      for (const r of remote) {
        seen.add(r.id); const l = local.get(r.id);
        if (pend.has(r.id)) continue;
        if (!l || (r.at > (l.mod || l.created || 0) + 1000)) { await rawPut({ ...r.data, synced: true }); changed = true; }
        else if (!l.synced) { l.synced = true; await rawPut(l); }
      }
      for (const [id, l] of local) {
        if (!seen.has(id) && !pend.has(id)) {
          if (l.synced) { await rawDel(id); changed = true; continue; }          // otro dispositivo lo eliminó
          PartyStore.push("library_node", id); l.synced = true; await rawPut(l);   // primera vez: subir lo que ya tenías aquí
        }
        if (l.type === "file" && !l.remote) upload(l).catch((e) => console.warn("Storage:", e.message || e));
      }
    } catch (e) { console.warn("Biblioteca/nube:", e.message || e); }
    finally { syncing = false; }
    return changed;
  }

  // ---------- helpers ----------
  const unitLabel = () => localStorage.getItem(LBL_KEY) || "Experiencia";
  const hasLabel = () => !!localStorage.getItem(LBL_KEY);
  const subjects = () => PartyData.getSubjects().list;
  const subjColor = (s) => PartyData.subjectColors[s?.color] || PartyData.subjectColors.violet;
  const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const byId = (id) => nodes.find((n) => n.id === id);
  const kids = (id) => nodes.filter((n) => (n.parent || null) === (id || null));
  const subjFolder = (sid) => nodes.find((n) => n.role === "subject" && n.subjectId === sid);
  const newId = () => "lib_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const parseCode = (name) => { const m = String(name).match(/^\s*(\d{1,2}(?:\.\d{1,3})+)/); return m ? m[1] : null; };
  const unitOf = (code) => (code ? parseInt(code.split(".")[0], 10) : null);
  const cmpCode = (a, b) => {
    if (!a || !b) return a ? -1 : b ? 1 : 0;
    const x = a.split(".").map(Number), y = b.split(".").map(Number);
    for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] ?? -1) - (y[i] ?? -1); if (d) return d; }
    return 0;
  };
  const fmtSize = (n) => (n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(0) + " KB" : (n / 1048576).toFixed(1) + " MB");
  const fmtDate = (t) => new Date(t).toLocaleDateString("es-CL", { day: "numeric", month: "short" });
  const countType = (id, t) => kids(id).reduce((a, k) => a + (k.type === "folder" ? countType(k.id, t) : k.type === t ? 1 : 0), 0);
  const countFiles = (id) => countType(id, "file");
  // "3 archivos · 2 cuadernos" (los cuadernos borrador también cuentan)
  const itemsLabel = (id) => {
    const f = countType(id, "file"), d = countType(id, "draft");
    const a = `${f} archivo${f === 1 ? "" : "s"}`;
    return d ? `${a} · ${d} cuaderno${d === 1 ? "" : "s"}` : a;
  };
  const pathOf = (id) => { const out = []; for (let n = byId(id); n; n = byId(n.parent)) out.unshift(n); return out; };
  const pathLabel = (id) => pathOf(id).map((n) => n.name).join(" / ");

  async function mk(props) {
    const n = { id: newId(), type: "folder", parent: null, created: Date.now(), ...props };
    nodes.push(n); await dbPut(n); return n;
  }
  const existing = () => subjects().filter((s) => subjFolder(s.id));
  const sig = () => subjects().map((s) => s.id + ":" + (subjFolder(s.id) ? 1 : 0)).join("|");
  // Carpetas creadas a mano con el nombre de una asignatura: se ligan a ella
  async function adoptFolders() {
    const done = [];
    for (const s of subjects()) {
      if (subjFolder(s.id)) continue;
      const f = nodes.find((n) => n.type === "folder" && !n.parent && n.role !== "subject" && norm(n.name) === norm(s.name));
      if (f) { f.role = "subject"; f.subjectId = s.id; await dbPut(f); done.push(s); }
    }
    return done;
  }
  const ensureSubject = async (s) => subjFolder(s.id) || mk({ name: s.name, role: "subject", subjectId: s.id });
  const ensureUnit = async (s, n) => {
    const sf = await ensureSubject(s);
    return nodes.find((k) => k.parent === sf.id && k.role === "unit" && k.unit === n) || mk({ parent: sf.id, name: `${unitLabel()} ${n}`, role: "unit", subjectId: s.id, unit: n });
  };
  const ensureInbox = async (s) => {
    const sf = await ensureSubject(s);
    return nodes.find((k) => k.parent === sf.id && k.role === "inbox") || mk({ parent: sf.id, name: "Sin clasificar", role: "inbox", subjectId: s.id });
  };
  function uniqueName(parent, name) {
    const taken = new Set(kids(parent).map((k) => k.name));
    if (!taken.has(name)) return name;
    const dot = name.lastIndexOf("."), base = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : "";
    for (let i = 2; ; i++) if (!taken.has(`${base} (${i})${ext}`)) return `${base} (${i})${ext}`;
  }
  async function addFile(file, parent, extra = {}) {
    const n = { id: newId(), type: "file", parent: parent || null, name: uniqueName(parent, file.name), size: file.size, mime: file.type, code: parseCode(file.name), created: Date.now(), ...extra };
    await putBlob(n.id, file); nodes.push(n); await dbPut(n); return n;
  }

  // ================================================
  // INIT + RENDER
  // ================================================
  async function init() {
    const wrap = document.getElementById("bibliotecaWrap");
    if (!wrap) return;
    try { nodes = await dbAll(); dbOk = true; } catch (e) { dbOk = false; console.error(e); }
    if (dbOk && cloud()) syncCloud().then(async (ch) => { if (ch && document.querySelector("#bibliotecaWrap .lib")) { nodes = await dbAll(); render(); } });
    let adopted = [];
    if (dbOk) { try { adopted = await adoptFolders(); } catch (e) { console.error(e); } }
    if (cwd && !byId(cwd)) cwd = null;
    wrap.innerHTML = `
      <div class="lib">
        <div class="lib-main">
          <div class="lib-head">
            <div id="libCrumbs" class="lib-crumbs"></div>
            <div class="lib-actions">
              <button class="btn-ghost" onclick="Lib.newFolder()">${Party.icon("folder")} Nueva carpeta</button>
              <button class="btn primary" style="margin:0" onclick="Lib.pickFiles()">${Party.icon("upload")} Subir archivos</button>
            </div>
          </div>
          <input id="libSearch" class="lib-search" placeholder="Buscar por nombre, número (2.1) o palabra dentro del material…" oninput="Lib.search(this.value)" value="${esc(query)}">
          <div id="libBody" class="lib-body"></div>
          <p id="libStorage" class="lib-foot"></p>
        </div>
        <aside class="lib-chat">
          <div class="g-wrap">
            <div class="lib-chat-title">${Party.icon("library")} Asistente de biblioteca</div>
            <div id="libLog" class="g-log" aria-live="polite"></div>
            <form class="g-form" onsubmit="Lib.send(event)">
              <input id="libInput" autocomplete="off" placeholder="Ej: carpeta Proyectos…" aria-label="Mensaje">
              <button class="btn primary g-send" type="submit" aria-label="Enviar">➤</button>
            </form>
          </div>
        </aside>
        <input id="libFile" type="file" multiple hidden onchange="Lib.onFiles(this)">
      </div>`;
    const body = document.getElementById("libBody");
    ["dragover", "dragenter"].forEach((ev) => body.addEventListener(ev, (e) => { e.preventDefault(); body.classList.add("drop"); }));
    ["dragleave", "drop"].forEach((ev) => body.addEventListener(ev, () => body.classList.remove("drop")));
    body.addEventListener("drop", (e) => { e.preventDefault(); if (e.dataTransfer.files.length) handleFiles([...e.dataTransfer.files]); });
    render();
    if (!dbOk) { document.getElementById("libLog").innerHTML = `<div class="g-bubble">Tu navegador no permite guardar archivos aquí (¿modo privado?). Prueba en una ventana normal.</div>`; return; }
    if (!S) {
      S = { msgs: [], pending: [] }; S.sig = sig();
      if (adopted.length) adoptedMsg(adopted); else next();
    } else {
      if (adopted.length || S.sig !== sig()) { // cambió lo que existe: las preguntas viejas ya no valen
        S.msgs.forEach((m) => (m.used = true)); S.sig = sig();
        if (adopted.length) adoptedMsg(adopted); else next();
      }
      renderChat();
    }
    estimate();
  }

  async function estimate() {
    try {
      const e = await navigator.storage.estimate();
      const el = document.getElementById("libStorage");
      if (el) el.textContent = `Los archivos se guardan en este navegador (${fmtSize(e.usage || 0)} usados). Aún no se sincronizan entre dispositivos.`;
    } catch {}
  }

  function render() {
    const P = Party;
    const crumbs = [`<button onclick="Lib.go(null)">${P.icon("library")} Biblioteca</button>`, ...pathOf(cwd).map((n) => `<span>/</span><button onclick="Lib.go('${n.id}')">${esc(n.name)}</button>`)];
    const cr = document.getElementById("libCrumbs"); if (cr) cr.innerHTML = crumbs.join("");

    const body = document.getElementById("libBody"); if (!body) return;
    if (query.trim()) {
      const q = query.trim().toLowerCase(), qn = norm(query);
      // por nombre o por el CONTENIDO del archivo (si se leyó su texto)
      const hits = nodes.filter((n) => n.type === "file").map((n) => {
        if (n.name.toLowerCase().includes(q)) return { ...n, snippet: "" };
        const t = n.text ? norm(n.text) : "";
        const i = qn.length >= 3 ? t.indexOf(qn) : -1;
        return i < 0 ? null : { ...n, snippet: t.slice(Math.max(0, i - 50), i + qn.length + 70) };
      }).filter(Boolean);
      body.innerHTML = hits.length ? `<div class="lib-files">${hits.sort((a, b) => cmpCode(a.code, b.code)).map((f) => fileRow(f, true)).join("")}</div>` : `<div class="empty">Sin resultados para “${esc(query)}” (busco en los nombres y dentro del texto de los archivos leídos).</div>`;
      return;
    }
    const here = kids(cwd);
    const folders = here.filter((n) => n.type === "folder").sort((a, b) => {
      const w = (n) => (n.role === "subject" ? 0 : n.role === "unit" ? 1 : n.role === "custom" ? 2 : 3);
      return w(a) - w(b) || (a.unit || 0) - (b.unit || 0) || a.name.localeCompare(b.name, "es");
    });
    const files = here.filter((n) => n.type !== "folder").sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || cmpCode(a.code, b.code) || a.name.localeCompare(b.name, "es"));

    let html = pinnedBar();
    if (folders.length) html += `<div class="lib-folders">${folders.map(folderCard).join("")}</div>`;
    if (files.length) html += `<div class="lib-files">${files.map((f) => fileRow(f)).join("")}</div>`;
    if (!folders.length && !files.length) {
      const cur = byId(cwd);
      html = `<div class="empty">${!cwd
        ? "Tu biblioteca está vacía. Crea las carpetas de tus asignaturas con el asistente, o sube un archivo."
        : cur?.role === "subject" ? `Esta asignatura aún no tiene material. Sube archivos como <b>1.1.1 Introducción.pdf</b> y se ordenan solos por ${esc(unitLabel().toLowerCase())}.`
        : "Carpeta vacía. Arrastra archivos aquí o usa “Subir archivos”."}</div>`;
    }
    body.innerHTML = html;
  }

  function folderCard(f) {
    const P = Party;
    const s = f.subjectId ? subjects().find((x) => x.id === f.subjectId) : null;
    const col = f.role === "subject" || f.role === "unit" ? subjColor(s) : "var(--color-accent-2)";
    const sub = kids(f.id).filter((k) => k.type === "folder").length;
    const meta = f.role === "subject" ? `${sub} ${sub === 1 ? "carpeta" : "carpetas"} · ${itemsLabel(f.id)}` : itemsLabel(f.id);
    const ico = f.role === "subject" ? (s?.icon || "book") : "folder";
    return `<div class="lib-folder" style="--c:${col}">
      <button class="lib-folder-main" onclick="Lib.go('${f.id}')"><span class="file-ico">${P.icon(ico)}</span>
        <span class="lib-name">${esc(f.name)}<small>${meta}</small></span></button>
      <span class="lib-row-acts"><button title="Subir aquí" onclick="Lib.uploadTo('${f.id}')">${P.icon("upload")}</button>
        <button title="Renombrar" onclick="Lib.rename('${f.id}')">${P.icon("pencil")}</button>
        <button title="Eliminar" onclick="Lib.remove('${f.id}')">${P.icon("trash")}</button></span></div>`;
  }

  // ---------- fijados (acceso rápido) ----------
  const pinBtn = (f) => `<button class="lib-pin${f.pinned ? " on" : ""}" title="${f.pinned ? "Quitar de fijados" : "Fijar arriba para acceso rápido"}" aria-pressed="${!!f.pinned}" onclick="Lib.pin('${f.id}')">📌</button>`;
  async function pin(id) {
    const n = byId(id); if (!n) return;
    n.pinned = !n.pinned; n.pinnedAt = n.pinned ? Date.now() : null;
    await dbPut(n); render();
    showToast(n.pinned ? "Fijado arriba ✓" : "Quitado de fijados", "success");
  }
  // Barra "📌 Fijados": aparece en toda la Biblioteca, venga de la carpeta que venga el archivo.
  function pinnedBar() {
    const list = nodes.filter((n) => n.pinned && (n.type === "file" || n.type === "draft")).sort((a, b) => (b.pinnedAt || 0) - (a.pinnedAt || 0));
    if (!list.length) return "";
    const P = Party;
    const card = (f) => {
      const draft = f.type === "draft", m = draft ? { c: "var(--color-accent-2)", icon: "pencil" } : PartyData.fileMeta(f.name);
      const open = draft ? `Lib.openDraft('${f.id}')` : `Lib.openFile('${f.id}')`;
      return `<div class="lib-pincard"><button class="lib-pincard-main" onclick="${open}" title="${draft ? "Abrir el cuaderno para escribir la clase" : "Abrir el archivo"}">
          <span class="file-ico" style="--c:${m.c}">${P.icon(m.icon)}</span>
          <span class="lib-name">${esc(draft ? "Cuaderno: " + f.name.replace(/\s*\(borrador\)\s*$/, "").replace(/_\s*\d{3}[A-Za-z]?/, "") : f.name)}<small>${esc(prettyPath(f.parent))}</small></span></button>
        <button class="lib-pincard-x" title="Quitar de fijados" aria-label="Quitar de fijados" onclick="Lib.pin('${f.id}')">✕</button></div>`;
    };
    return `<div class="lib-pins"><div class="lib-pins-title">📌 Fijados <small>acceso rápido</small></div><div class="lib-pins-list">${list.map(card).join("")}</div></div>`;
  }

  function fileRow(f, showPath) {
    const P = Party;
    if (f.type === "draft") {
      return `<div class="lib-file${f.pinned ? " pinned" : ""}"><span class="file-ico" style="--c:var(--color-accent-2)">${P.icon("pencil")}</span>
        <button class="lib-fname" onclick="Lib.openDraft('${f.id}')"><b>Cuaderno borrador</b><small>${esc(f.name)}</small></button>
        ${pinBtn(f)}<span class="lib-row-acts"><button title="Quitar" onclick="Lib.remove('${f.id}')">${P.icon("trash")}</button></span></div>`;
    }
    const m = PartyData.fileMeta(f.name);
    const ext = (f.name.split(".").pop() || "").toUpperCase().slice(0, 5);
    return `<div class="lib-file${f.pinned ? " pinned" : ""}"><span class="file-ico" style="--c:${m.c}">${P.icon(m.icon)}</span>
      <button class="lib-fname" onclick="Lib.openFile('${f.id}')"><b>${esc(f.name)}</b>
        <small>${f.code ? `<span class="pill violet">${esc(f.code)}</span> ` : ""}${esc(ext)} · ${fmtSize(f.size)} · ${fmtDate(f.created)}${f.pages ? ` · ${f.pages} pág.` : ""}${f.indexed ? " · 📖 texto leído" : ""}${showPath ? " · " + esc(pathLabel(f.parent)) : ""}${f.snippet ? `<br><em class="lib-snip">…${esc(f.snippet)}…</em>` : ""}</small></button>
      ${pinBtn(f)}<span class="lib-row-acts"><button title="Descargar" onclick="Lib.download('${f.id}')">⬇</button>
        <button title="Mover" onclick="Lib.move('${f.id}')">↦</button>
        <button title="Renombrar" onclick="Lib.rename('${f.id}')">${P.icon("pencil")}</button>
        <button title="Eliminar" onclick="Lib.remove('${f.id}')">${P.icon("trash")}</button></span></div>`;
  }

  const go = (id) => { cwd = id; query = ""; const s = document.getElementById("libSearch"); if (s) s.value = ""; render(); };
  const search = (q) => { query = q; render(); };

  // ================================================
  // ACCIONES
  // ================================================
  function newFolder() {
    Party.modal({
      title: "Nueva carpeta", html: `<label>Nombre</label><input id="lfName" maxlength="80" placeholder="Ej: Proyecto final">`, confirm: "Crear",
      onConfirm: async (ov) => {
        const name = ov.querySelector("#lfName").value.trim();
        if (!name) { showToast("Escribe un nombre.", "warning"); return false; }
        const cur = byId(cwd);
        await mk({ parent: cwd, name: uniqueName(cwd, name), role: "custom", subjectId: cur?.subjectId || null });
        const ad = !cwd ? await adoptFolders() : [];
        render();
        if (ad.length) { showToast(`Ligada a la asignatura ${ad[0].name} ✓`, "success"); if (S) { S.sig = sig(); adoptedMsg(ad); } }
        else showToast("Carpeta creada ✓", "success");
      },
    });
  }
  function rename(id) {
    const n = byId(id); if (!n) return;
    Party.modal({
      title: "Renombrar", html: `<label>Nombre</label><input id="lrName" maxlength="120" value="${esc(n.name)}">`, confirm: "Guardar",
      onConfirm: async (ov) => {
        const v = ov.querySelector("#lrName").value.trim();
        if (!v) return false;
        n.name = v; if (n.type === "file") n.code = parseCode(v);
        await dbPut(n); render();
      },
    });
  }
  function remove(id) {
    const n = byId(id); if (!n) return;
    const all = []; const walk = (x) => { all.push(x); kids(x.id).forEach(walk); }; walk(n);
    Party.modal({
      title: `¿Eliminar “${n.name}”?`, text: all.length > 1 ? `Se eliminarán también ${all.length - 1} elementos que contiene.` : "Esta acción no se puede deshacer.", confirm: "Eliminar",
      onConfirm: async () => {
        for (const x of all) await dbDel(x.id);
        const was = cwd; nodes = nodes.filter((k) => !all.includes(k));
        if (all.some((x) => x.id === was)) cwd = n.parent;
        render(); estimate();
      },
    });
  }
  function move(id) {
    const n = byId(id); if (!n) return;
    const opts = [`<option value="">Biblioteca (raíz)</option>`, ...nodes.filter((f) => f.type === "folder").sort((a, b) => pathLabel(a.id).localeCompare(pathLabel(b.id), "es")).map((f) => `<option value="${f.id}" ${f.id === n.parent ? "selected" : ""}>${esc(pathLabel(f.id))}</option>`)];
    Party.modal({
      title: "Mover a…", html: `<select id="lmDest">${opts.join("")}</select>`, confirm: "Mover",
      onConfirm: async (ov) => { n.parent = ov.querySelector("#lmDest").value || null; await dbPut(n); render(); },
    });
  }
  async function openFile(id) {
    const n = byId(id), b = await getBlob(id);
    if (!n || !b) return showToast("No encontré el archivo.", "warning");
    const type = n.mime || b.type || "";
    if (/^(application\/pdf|image\/|text\/)/.test(type)) window.open(URL.createObjectURL(new Blob([b], { type })), "_blank");
    else download(id);
  }
  async function download(id) {
    const n = byId(id), b = await getBlob(id); if (!n || !b) return;
    const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = n.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  async function openDraft(id) {
    const n = byId(id); if (!n) return;
    try {
      await loadNotes();
      if (!notesData.find((x) => x.id === n.noteId)) return showToast("Ese cuaderno ya no existe en tus apuntes.", "warning");
      document.querySelector('.tab[data-tab="apuntes"]')?.click();
      openNoteModal(n.noteId);
    } catch (e) { console.error(e); }
  }

  // ---------- subir ----------
  function pickFiles() { uploadTarget = null; document.getElementById("libFile")?.click(); }
  function uploadTo(folderId) { uploadTarget = folderId; document.getElementById("libFile")?.click(); }
  function onFiles(inp) { const f = [...inp.files]; inp.value = ""; if (f.length) handleFiles(f); }

  function handleFiles(files) {
    const target = byId(uploadTarget || cwd);
    uploadTarget = null;
    ingest(files, { folder: target });
  }

  // ================================================
  // SUBIDA GUIADA: asignatura → experiencia → confirmación → guardar
  //  · Si entraste a la carpeta de una asignatura, no pregunta la asignatura.
  //  · Propone la experiencia según el número de los archivos (2.1.1 → Experiencia 2),
  //    deja elegir una existente, crear una o todas, o dejarlos en la carpeta principal.
  //  · Siempre muestra un resumen del destino y pide confirmar antes de guardar.
  //  · Sirve desde la Biblioteca y desde el chat (ui = { say(html, chips[{label, fn}]) }).
  // ================================================
  const subjName = (s) => {
    const x = String(s?.name || "").replace(/_\s*\d{3}[A-Za-z]?\s*$/, "").replace(/\s+/g, " ").trim();
    return window.ScheduleParser?.title ? ScheduleParser.title(x) : x;
  };
  const unitNodes = (s) => { const f = subjFolder(s.id); return f ? kids(f.id).filter((k) => k.role === "unit").sort((a, b) => a.unit - b.unit) : []; };
  const libUI = () => ({ say: (html, chips = []) => { if (!S) return; S.msgs.forEach((m) => (m.used = true)); say(html, chips); } });
  const prettyPath = (id) => pathOf(id).map((n) => (n.role === "subject" ? subjName({ name: n.name }) : n.name)).join(" / ");
  const byCode = (a, b) => cmpCode(parseCode(a.name), parseCode(b.name)) || a.name.localeCompare(b.name, "es");

  async function ingest(files, { ui, folder } = {}) {
    files = [...files].sort(byCode);
    if (!files.length) return;
    ui = ui || libUI();
    try { await prepare(); } catch { return ui.say("No pude abrir la biblioteca de este navegador (¿modo privado?). Prueba en una ventana normal."); }

    const L = unitLabel(), Ll = L.toLowerCase(), n = files.length;
    const st = { step: 0 };
    // cada pregunta invalida los botones de la anterior (evita guardar dos veces)
    const ask = (html, chips) => { st.step++; const my = st.step; ui.say(html, chips.map((c) => ({ label: c.label, fn: () => { if (my === st.step) c.fn(); } }))); };
    const cancel = () => { st.step++; ui.say("Ok, no guardé nada. Cuando quieras, vuelve a subir los archivos."); };
    const names = files.slice(0, 8).map((f) => `• ${esc(f.name)}`).join("<br>") + (n > 8 ? `<br>… y ${n - 8} más` : "");
    const nums = files.map((f) => unitOf(parseCode(f.name)));
    const detected = [...new Set(nums.filter(Boolean))].sort((a, b) => a - b);
    const sinNum = nums.filter((u) => !u).length;
    const suggest = detected.length === 1 && !sinNum ? detected[0] : null;
    const word = n === 1 ? "archivo" : "archivos";

    // ---- 3) confirmación con el destino exacto ----
    function confirmDest(dest, back) {
      const sname = dest.subject ? `<b>${esc(subjName(dest.subject))}</b>` : "";
      let where, extra = "";
      if (dest.kind === "unit") {
        const have = unitNodes(dest.subject), exists = have.some((u) => u.unit === dest.unit);
        where = `${sname} / <b>${esc(L)} ${dest.unit}</b>`;
        const make = [];
        if (!subjFolder(dest.subject.id)) make.push(`la carpeta de la asignatura`);
        if (dest.all) { const miss = []; for (let i = 1; i <= dest.all; i++) if (!have.some((u) => u.unit === i)) miss.push(i); if (miss.length) make.push(`${Ll}s ${miss.join(", ")}`); }
        else if (!exists) make.push(`la carpeta ${L} ${dest.unit}`);
        extra = make.length ? ` Voy a crear: ${make.join(" y ")}.` : ` La carpeta ya existe.`;
      } else if (dest.kind === "root") {
        where = `la carpeta principal de ${sname}, <b>sin ${esc(Ll)}</b>`;
      } else if (dest.kind === "loose") {
        where = `<b>la raíz de la Biblioteca</b> (archivos sueltos)`;
      } else {
        where = `<b>${esc(prettyPath(dest.node.id))}</b>`;
      }
      ask(`Voy a guardar <b>${n}</b> ${word} en ${where}.${extra} <b>¿Confirmas?</b>`, [
        { label: "✓ Sí, guardar", fn: () => commit(dest) },
        ...(back ? [{ label: "← Cambiar", fn: back }] : []),
        { label: "Cancelar", fn: cancel },
      ]);
    }

    async function commit(dest) {
      st.step++;
      let target = null;
      const subject = dest.subject || null;
      if (dest.kind === "unit") {
        if (dest.all) for (let i = 1; i <= dest.all; i++) await ensureUnit(subject, i);
        target = await ensureUnit(subject, dest.unit);
      } else if (dest.kind === "root") target = await ensureSubject(subject);
      else if (dest.kind === "node") target = dest.node;
      const saved = [];
      for (const f of files) saved.push([await addFile(f, target ? target.id : null, { subjectId: subject?.id || target?.subjectId || null }), f]);
      if (target) cwd = target.id;
      if (S) S.sig = sig();
      refreshView(); estimate();
      const path = target ? prettyPath(target.id) : "Biblioteca";
      ui.say(`Listo ✓ Guardé <b>${n}</b> ${word} en <b>${esc(path)}</b>. Los ordené por su número y no cambié los nombres. Si quieres cambiarlos de lugar, usa el botón ↦ de cada archivo.`, [
        { label: "Abrir la carpeta", fn: () => { cwd = target ? target.id : null; document.querySelector('.tab[data-tab="biblioteca"]')?.click(); setTimeout(() => { if (document.querySelector("#bibliotecaWrap .lib")) go(cwd); }, 250); } },
      ]);
      indexFiles(saved);   // lee el texto en segundo plano (para buscar dentro del material)
    }

    // ---- 2) experiencia ----
    function askNewUnit(subject, back) {
      const have = unitNodes(subject).map((u) => u.unit);
      const opts = [1, 2, 3, 4, 5, 6].filter((i) => !have.includes(i));
      ask(`¿Qué número de ${esc(Ll)} creo?`, [...opts.map((i) => ({ label: `${L} ${i}`, fn: () => confirmDest({ kind: "unit", subject, unit: i }, () => askExperience(subject, back)) })), { label: "← Volver", fn: () => askExperience(subject, back) }]);
    }

    function askExperience(subject, back) {
      const have = unitNodes(subject), exists = (u) => have.some((x) => x.unit === u);
      const here = () => askExperience(subject, back);
      const chips = [];
      if (detected.length > 1 || sinNum) chips.push({ label: "Ordenar según el número de cada archivo", fn: () => { st.step++; confirmPlan(files, subject, ui); } });
      if (have.length) {
        if (suggest) chips.push({ label: `${L} ${suggest} ★${exists(suggest) ? "" : " (se crea)"}`, fn: () => confirmDest({ kind: "unit", subject, unit: suggest }, here) });
        have.filter((u) => u.unit !== suggest).forEach((u) => chips.push({ label: `${L} ${u.unit}`, fn: () => confirmDest({ kind: "unit", subject, unit: u.unit }, here) }));
        chips.push({ label: `＋ Otra ${Ll}…`, fn: () => askNewUnit(subject, back) });
      } else if (suggest) {
        chips.push({ label: `Crear solo ${L} ${suggest}`, fn: () => confirmDest({ kind: "unit", subject, unit: suggest }, here) });
        chips.push({ label: `Crear las ${Ll}s 1 a ${Math.max(3, suggest)}`, fn: () => confirmDest({ kind: "unit", subject, unit: suggest, all: Math.max(3, suggest) }, here) });
      } else chips.push({ label: `Crear una ${Ll}…`, fn: () => askNewUnit(subject, back) });
      chips.push({ label: `Carpeta principal (sin ${Ll})`, fn: () => confirmDest({ kind: "root", subject }, here) });
      if (back) chips.push({ label: "← Otra asignatura", fn: back });
      chips.push({ label: "Cancelar", fn: cancel });
      const has = have.length ? `Ya tiene: ${have.map((u) => `${esc(L)} ${u.unit}`).join(", ")}.` : `Todavía no tiene carpetas de ${esc(Ll)}s.`;
      const hint = suggest ? ` Por el número de los archivos (${esc(parseCode(files[0].name))}…) parece la <b>${esc(L)} ${suggest}</b> ★.` : detected.length > 1 ? ` Los archivos traen números de ${detected.length} ${esc(Ll)}s distintas.` : ` Los nombres no traen el número de ${esc(Ll)}.`;
      ask(`<b>${esc(subjName(subject))}</b> ✓ ${has}${hint}<br><b>¿A qué ${esc(Ll)} corresponde?</b>`, chips);
    }

    // ---- 1) asignatura ----
    function askSubject() {
      const subs = subjects();
      const chips = subs.map((s) => ({ label: esc(subjName(s)), fn: () => askExperience(s, askSubject) }));
      chips.push({ label: "Ninguna (archivos sueltos)", fn: () => confirmDest({ kind: "loose" }, askSubject) }, { label: "Cancelar", fn: cancel });
      ask(`Recibí <b>${n}</b> ${word}:<br>${names}<br><br><b>¿A qué asignatura corresponde?</b>${subs.length ? "" : " (Aún no tienes asignaturas: créalas en Mis Asignaturas o súbelos sueltos.)"}`, chips);
    }

    // ---- punto de partida según dónde estás ----
    const subj = (f) => subjects().find((s) => s.id === f.subjectId) || { id: f.subjectId, name: f.name };
    if (!folder) return askSubject();
    if (folder.role === "subject") { ui.say(`Estás en la carpeta de <b>${esc(subjName(subj(folder)))}</b>: no te pregunto la asignatura. Recibí <b>${n}</b> ${word}:<br>${names}`); return askExperience(subj(folder), null); }
    const dest = folder.role === "unit" ? { kind: "unit", subject: subj(folder), unit: folder.unit } : { kind: "node", node: folder };
    ui.say(`Recibí <b>${n}</b> ${word}:<br>${names}`);
    confirmDest(dest, askSubject);
  }

  // Ordena por el número de cada archivo (puede crear varias experiencias); se confirma en una tabla.
  function confirmPlan(files, subject, ui) {
    ui = ui || libUI();
    const plan = files.map((f) => { const code = parseCode(f.name); return { f, code, unit: unitOf(code) }; });
    const rows = plan.slice().sort((a, b) => cmpCode(a.code, b.code)).map((p) => `<tr><td>${esc(p.f.name)}</td><td>${p.unit ? `${esc(unitLabel())} ${p.unit}` : `<i>Sin clasificar</i>`}</td></tr>`).join("");
    const sin = plan.filter((p) => !p.unit).length;
    Party.modal({
      title: `Material de ${subjName(subject)}`, html: `<p style="margin:0 0 8px;font-size:13px;color:var(--color-muted)">Así quedará ordenado (los nombres no cambian):</p>
        <div class="lib-plan"><table><thead><tr><th>Archivo</th><th>Carpeta</th></tr></thead><tbody>${rows}</tbody></table></div>
        ${sin ? `<p style="font-size:12.5px;color:var(--color-warning);margin:8px 0 0">${sin} archivo(s) no empiezan con un número tipo 1.1.1; irán a “Sin clasificar” y puedes moverlos después.</p>` : ""}`,
      confirm: "Guardar archivos",
      onConfirm: async () => {
        const saved = [];
        for (const p of plan) { const dest = p.unit ? await ensureUnit(subject, p.unit) : await ensureInbox(subject); saved.push([await addFile(p.f, dest.id, { subjectId: subject.id }), p.f]); }
        const sf = subjFolder(subject.id); if (sf) cwd = sf.id;
        if (S) S.sig = sig();
        refreshView(); estimate(); showToast(`${plan.length} archivo(s) ordenados ✓`, "success");
        ui.say(`Listo ✓ Guardé ${plan.length} archivo(s) en <b>${esc(subjName(subject))}</b>, cada uno en su ${esc(unitLabel().toLowerCase())}.`);
        indexFiles(saved);
      },
    });
  }

  // Lee el texto de cada archivo guardado (PDF, Word, texto) para poder buscar dentro del material.
  async function indexFiles(pairs) {
    if (!window.DocReader?.fullText) return;
    for (const [node, file] of pairs) {
      try {
        const r = await DocReader.fullText(file);
        if (r?.text) { node.text = r.text.slice(0, 250000); node.pages = r.pages || null; node.indexed = true; await dbPut(node); }
      } catch (e) { console.warn("Biblioteca: no pude leer el texto de", node.name, e); }
    }
    if (document.querySelector("#bibliotecaWrap .lib")) render();
  }

  // ---------- cuaderno borrador (usa la tabla notes) ----------
  async function makeDraft(subject, unitNode) {
    const gid = getState().selected.groupId;
    if (!gid || typeof supabaseClient === "undefined") return false;
    const student = JSON.parse(localStorage.getItem("active_student") || "null");
    const id = uid("note"), title = `${subject.name} · ${unitNode.name} (borrador)`;
    const content = `<h2 data-note-subject="${esc(subject.id)}" data-note-subject-name="${esc(subject.name)}">${esc(subject.name)}</h2><p class="note-date">${esc(unitNode.name)} · borrador</p><p><br></p>`;
    const { error } = await supabaseClient.from("notes").insert([{ id, group_id: gid, owner_id: student?._dev_mode ? null : student?.id, title, content, color: "#111b31", bg_pattern: "solid", pinned: false }]);
    if (error) { console.error(error); return false; }
    await mk({ type: "draft", parent: unitNode.id, name: title, noteId: id, role: "draft" });
    return true;
  }

  // ---------- estructura de una asignatura ----------
  async function setupSubject(s, { units = 3, drafts = false, label } = {}) {
    if (label) PartyStore.set(LBL_KEY, label);
    await ensureSubject(s);
    let made = 0;
    for (let i = 1; i <= units; i++) {
      const u = await ensureUnit(s, i);
      if (drafts && !kids(u.id).some((k) => k.type === "draft") && (await makeDraft(s, u))) made++;
    }
    return { drafts: made };
  }

  // ================================================
  // CHAT GUÍA
  // ================================================
  function say(html, chips = [], who = "bot") { S.msgs.push({ who, html, chips, used: false }); renderChat(); }
  function renderChat() {
    const log = document.getElementById("libLog"); if (!log || !S) return;
    log.innerHTML = S.msgs.map((m, i) => `<div class="g-msg ${m.who}"><div class="g-bubble">${m.html}</div>
      ${m.chips.length && !m.used ? `<div class="g-chips">${m.chips.map((c, j) => `<button type="button" class="g-chip" onclick="Lib.pick(${i},${j})">${c.label}</button>`).join("")}</div>` : ""}</div>`).join("");
    log.scrollTop = log.scrollHeight;
  }
  function pick(i, j) {
    const m = S.msgs[i], c = m.chips[j]; if (!c) return;
    m.used = true; S.msgs.push({ who: "user", html: esc(c.say || c.label.replace(/<[^>]+>/g, "")), chips: [], used: true });
    if (c.fn) { renderChat(); return c.fn(); }
    act(c.act, c.arg);
  }
  const subjChips = () => existing().map((s) => ({ label: esc(s.name), act: "uploadFor", arg: s.id })).concat([{ label: "Ahora no", act: "idle" }]);
  function adoptedMsg(list) {
    S.msgs.forEach((m) => (m.used = true));
    say(`Vi que ya habías creado la carpeta de <b>${list.map((s) => esc(s.name)).join(", ")}</b>: la dejé ligada a la asignatura ✓ No la duplico.`);
    S.pending = list.map((s) => s.id);
    askUnits(`¿Quieres que le cree sus <b>${esc(unitLabel().toLowerCase())}s</b> (las subcarpetas donde se ordena el material)?`);
  }

  function next() {
    if (!hasLabel()) {
      return say(`¡Hola! Te ayudo a ordenar tu material. Primero: <b>¿cómo se llaman las unidades de tus asignaturas?</b> En Duoc UC se llaman <i>Experiencias</i>.`,
        LABELS.map((l, i) => ({ label: i === 0 ? "Experiencia (Duoc UC)" : l, act: "label", arg: l })).concat([{ label: "Otro nombre", act: "labelOther" }]));
    }
    const missing = subjects().filter((s) => !subjFolder(s.id));
    if (missing.length) {
      return say(`Tienes <b>${missing.length}</b> asignatura(s) sin carpeta: ${missing.map((s) => esc(s.name)).join(", ")}. Es recomendable crear una carpeta para cada una. ¿Las creo?`,
        [{ label: "Sí, crear todas", act: "createAll" }, { label: "Elegir cuáles", act: "choose" }, { label: "Ahora no", act: "idle" }]);
    }
    if (!existing().length) return say("Aún no hay carpetas de asignaturas. Crea la primera desde “Mis Asignaturas” o con el botón de abajo.", [{ label: "Nueva carpeta", act: "newFolder" }]);
    say(`Tus carpetas: ${existing().map((s) => `<b>${esc(s.name)}</b>`).join(", ")}. ¿Subimos material a alguna?`, subjChips());
  }

  function act(name, arg) {
    switch (name) {
      case "label": PartyStore.set(LBL_KEY, arg); say(`Perfecto: usaré “${esc(arg)} 1, ${esc(arg)} 2…”.`); next(); break;
      case "labelOther": S.wait = "label"; say("Escribe cómo se llaman (ej. “Bloque”)."); break;
      case "createAll": S.pending = subjects().filter((s) => !subjFolder(s.id)).map((s) => s.id); return askUnits();
      case "choose": say("Elige una:", subjects().filter((s) => !subjFolder(s.id)).map((s) => ({ label: esc(s.name), act: "createOne", arg: s.id }))); break;
      case "createOne": S.pending = [arg]; return askUnits();
      case "units": return createStructures(+arg);
      case "unitsDemand": return createStructures(0);
      case "drafts": return doDrafts(arg === "yes");
      case "uploadFor": {
        const s = subjects().find((x) => x.id === arg); if (!s) return;
        if (!subjFolder(s.id)) { S.pending = [s.id]; say(`<b>${esc(s.name)}</b> aún no tiene carpeta.`, [{ label: "Crear su carpeta", act: "createOne", arg: s.id }, { label: "Ahora no", act: "idle" }]); return; }
        Promise.resolve(subjFolder(s.id)).then((f) => {
          uploadTarget = f.id; render();
          say(`Elige los archivos de <b>${esc(s.name)}</b>. Si empiezan con el número (1.1.1, 2.1…) los ordeno por ${esc(unitLabel().toLowerCase())}.`, [{ label: "Elegir archivos", act: "browse", arg: f.id }]);
        });
        break;
      }
      case "newFolder": newFolder(); break;
      case "browse": uploadTarget = arg; document.getElementById("libFile")?.click(); break;
      case "idle": say("Ok. Aquí estaré si me necesitas; también puedes arrastrar archivos a la lista."); break;
    }
  }
  function askUnits(text) {
    const L = unitLabel().toLowerCase();
    say(text ? `${text} ¿Cuántas tiene? Después puedes agregar más: se crean solas cuando subas material con ese número.` : `¿Cuántas <b>${esc(L)}s</b> tiene cada asignatura? Después puedes agregar más: se crean solas cuando subas material con ese número.`,
      [2, 3, 4, 5].map((n) => ({ label: String(n), act: "units", arg: n })).concat([{ label: "Que se creen según el material", act: "unitsDemand" }]));
  }
  async function createStructures(units) {
    const subs = S.pending.map((id) => subjects().find((s) => s.id === id)).filter(Boolean);
    for (const s of subs) await setupSubject(s, { units });
    S.lastSubs = subs.map((s) => s.id); S.lastUnits = units; S.sig = sig();
    render();
    say(`Listo ✓ Creé ${subs.length} carpeta(s)${units ? ` con ${units} ${esc(unitLabel().toLowerCase())}s cada una` : ""}.`);
    if (units && getState().selected.groupId) say(`¿Quieres un <b>cuaderno borrador</b> para cada ${esc(unitLabel().toLowerCase())}? Se crea como apunte ya ligado a la asignatura.`, [{ label: "Sí, crearlos", act: "drafts", arg: "yes" }, { label: "No por ahora", act: "drafts", arg: "no" }]);
    else say("¿Quieres subir material de alguna asignatura ahora?", subjChips());
  }
  async function doDrafts(yes) {
    if (yes) {
      let n = 0;
      for (const id of S.lastSubs || []) {
        const s = subjects().find((x) => x.id === id);
        for (let i = 1; i <= S.lastUnits; i++) { const u = await ensureUnit(s, i); if (!kids(u.id).some((k) => k.type === "draft") && (await makeDraft(s, u))) n++; }
      }
      render(); say(`Creé ${n} cuaderno(s) borrador ✓ Los encuentras dentro de cada carpeta y también en <b>Apuntes</b>.`);
    }
    say("¿Quieres subir material (PPT, documentos) de alguna asignatura?", subjChips());
  }

  function send(e) {
    e.preventDefault();
    const inp = document.getElementById("libInput"), text = inp.value.trim(); if (!text || !S) return;
    inp.value = ""; S.msgs.push({ who: "user", html: esc(text), chips: [], used: true });
    if (S.wait === "label") { S.wait = null; return act("label", text.slice(0, 20)); }
    const m = text.match(/^(?:crear\s+)?carpeta\s+(.+)/i);
    if (m) { const cur = byId(cwd); mk({ parent: cwd, name: uniqueName(cwd, m[1].trim().slice(0, 80)), role: "custom", subjectId: cur?.subjectId || null }).then(() => { render(); say(`Carpeta “${esc(m[1].trim())}” creada ✓`); }); return; }
    if (/subir|archivo|material/i.test(text)) return say("¿De qué asignatura?", subjChips());
    say("Puedo crear carpetas (escribe <i>carpeta Nombre</i>), ordenar material por número o crear cuadernos borrador.", subjChips());
  }

  // ================================================
  // Al crear una asignatura (desde Mis Asignaturas)
  // ================================================
  function afterSubjectCreated(s) {
    const lblOpts = LABELS.map((l) => `<option ${l === unitLabel() ? "selected" : ""}>${l}</option>`).join("");
    const canDraft = !!getState().selected.groupId;
    Party.modal({
      title: "Crear carpeta en la Biblioteca", text: `Creaste “${s.name}”. Es recomendable tener una carpeta para su material.`,
      html: `<label style="display:flex;gap:8px;align-items:center;margin:8px 0"><input type="checkbox" id="asFolder" checked style="width:auto;margin:0"> Crear carpeta de la asignatura</label>
        <label>Las unidades se llaman</label><select id="asLbl">${lblOpts}</select>
        <label>¿Cuántas tiene?</label><select id="asUnits"><option value="0">Que se creen según el material</option><option>2</option><option selected>3</option><option>4</option><option>5</option></select>
        <label style="display:flex;gap:8px;align-items:center;margin:8px 0;${canDraft ? "" : "opacity:.5"}"><input type="checkbox" id="asDrafts" ${canDraft ? "" : "disabled"} style="width:auto;margin:0"> Crear un cuaderno borrador por unidad${canDraft ? "" : " (entra a un grupo para usarlo)"}</label>`,
      confirm: "Crear", cancel: "Ahora no",
      onConfirm: async (ov) => {
        if (!ov.querySelector("#asFolder").checked) return;
        try { nodes = await dbAll(); } catch { return showToast("No se pudo abrir la biblioteca.", "warning"); }
        await setupSubject(s, { units: +ov.querySelector("#asUnits").value, drafts: ov.querySelector("#asDrafts").checked, label: ov.querySelector("#asLbl").value });
        showToast("Carpeta creada en la Biblioteca ✓", "success");
        if (S) S.sig = sig();
        if (S) S.msgs.push({ who: "bot", html: `Creé la carpeta de <b>${esc(s.name)}</b>. ¿Subes material ahora?`, chips: [{ label: "Subir material", act: "uploadFor", arg: s.id }, { label: "Ahora no", act: "idle" }], used: false });
      },
    });
  }

  // ---- API para otros módulos (horario, chat) ----
  async function prepare() { nodes = await dbAll(); await adoptFolders(); }
  async function setupSubjects(list, opts) {
    await prepare();
    for (const s of list) await setupSubject(s, opts);
    refreshView();
  }
  // si la Biblioteca ya estaba abierta (o cargada), se redibuja con lo nuevo
  function refreshView() {
    if (document.querySelector("#bibliotecaWrap .lib")) { if (S) S.sig = sig(); return init(); }
  }
  async function saveInFolder(file, folderName) {
    await prepare();
    const f = nodes.find((n) => n.type === "folder" && !n.parent && n.role !== "subject" && norm(n.name) === norm(folderName)) || (await mk({ parent: null, name: folderName, role: "custom" }));
    await addFile(file, f.id);
    refreshView();
  }

  // Texto indexado de los archivos (PDF/Word/…) para que el agente lo consulte con buscar_material / leer_material.
  async function materialForAgent(perFile = 12000, total = 120000) {
    let all; try { all = await dbAll(); } catch { return []; }
    const get = (id) => all.find((n) => n.id === id);
    const route = (id) => { const r = []; let c = get(id); while (c) { r.unshift(c); c = get(c.parent); } return r; };
    const out = []; let used = 0;
    for (const n of all.filter((x) => x.type === "file" && x.text).sort((a, b) => (a.name || "").localeCompare(b.name || "", "es", { numeric: true }))) {
      const ruta = route(n.parent), subj = ruta.find((r) => r.role === "subject");
      const texto = n.text.slice(0, Math.min(perFile, Math.max(0, total - used)));
      if (!texto) break;
      used += texto.length;
      out.push({ id: n.id, nombre: n.name, asignatura: subj ? subjName({ name: subj.name }) : "", ruta: ruta.map((r) => (r.role === "subject" ? subjName({ name: r.name }) : r.name)).join(" / "), paginas: n.pages || null, texto });
    }
    return out;
  }

  return { materialForAgent, pin, ingest, setupSubjects, saveInFolder, init, go, search, newFolder, rename, remove, move, openFile, download, openDraft, pickFiles, uploadTo, onFiles, pick, send, afterSubjectCreated };
})();

function initBiblioteca() { Lib.init(); }
