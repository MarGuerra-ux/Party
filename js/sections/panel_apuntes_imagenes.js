// ================================================
// PANEL_APUNTES_IMAGENES.JS — imágenes y capturas dentro de los apuntes
//  · Pegar (Ctrl+V), arrastrar un archivo, botón 🖼 o botón 📸 (portapapeles)
//  · Detecta capturas: tecla Impr Pant y Win+Shift+S (Recortes de Windows)
//  · Ajuste como en Word: en línea · texto alrededor (izq./der.) · delante · detrás del texto
//  · Mover (delante/detrás), cambiar tamaño y eliminar
// La imagen se guarda dentro del propio HTML del apunte (reducida a ≤1400 px y en WebP).
// ================================================

const NoteImages = (() => {
  const MAX_W = 1400, MAX_BYTES = 1.5e6;
  const ed = () => document.getElementById("n_editor");
  const col = () => ed()?.parentElement;
  const active = () => document.getElementById("noteModalOverlay")?.style.display === "flex" && !!ed();
  const toast = (m, t = "info") => { if (typeof showToast === "function") showToast(m, t); };

  let sel = null, ui = null, direct = false, armedUntil = 0, lastSig = "", busy = false, drag = null, offerEl = null;

  // ---------- imagen → data URL reducida ----------
  async function shrink(blob) {
    const bmp = await createImageBitmap(blob);
    const k = Math.min(1, MAX_W / bmp.width);
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    let out = await new Promise((r) => c.toBlob(r, "image/webp", 0.9));
    if (!out || out.type !== "image/webp") out = await new Promise((r) => c.toBlob(r, "image/png"));
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res({ url: fr.result, w: c.width, h: c.height, bytes: out.size });
      fr.onerror = rej; fr.readAsDataURL(out);
    });
  }

  // ---------- insertar ----------
  async function insert(blob, wrap = "inline") {
    const e = ed();
    if (!e || !blob?.type?.startsWith("image/")) return;
    let r;
    try { r = await shrink(blob); } catch { return toast("No pude leer esa imagen.", "warning"); }
    if (r.bytes > MAX_BYTES) toast("La imagen pesa bastante; si puedes, recórtala para que el apunte cargue rápido.", "warning");
    const img = new Image();
    img.className = "pimg"; img.dataset.wrap = wrap; img.alt = "Captura"; img.src = r.url;
    img.style.width = Math.min(r.w, Math.max(240, Math.round(e.clientWidth * 0.55))) + "px";   // entra a ~la mitad del ancho; se agranda con el tirador
    e.focus();
    if (typeof _restoreRange === "function") _restoreRange();
    const s = window.getSelection();
    let range = s.rangeCount && e.contains(s.getRangeAt(0).startContainer) ? s.getRangeAt(0) : null;
    if (!range) { range = document.createRange(); range.selectNodeContents(e); range.collapse(false); }
    range.deleteContents(); range.insertNode(img);
    range.setStartAfter(img); range.collapse(true); s.removeAllRanges(); s.addRange(range);
    select(img, true);
    if (typeof NoteGuide !== "undefined") NoteGuide.updateCount();
  }

  // ---------- selección y barra flotante ----------
  const WRAPS = [
    ["inline", "En línea", "Se comporta como una letra más del texto"],
    ["left",   "◧ Izq.",   "A la izquierda; el texto la rodea"],
    ["right",  "Der. ◨",   "A la derecha; el texto la rodea"],
    ["front",  "Delante",  "Delante del texto, se mueve libremente"],
    ["behind", "Detrás",   "Detrás del texto, se mueve libremente"],
  ];

  function select(img, isDirect) {
    sel = img; direct = !!isDirect;
    if (!ui) {
      ui = document.createElement("div");
      ui.className = "pimg-ui";
      ui.innerHTML = `<div class="pimg-frame"><span class="pimg-resize" title="Cambiar tamaño"></span></div>
        <div class="pimg-bar" role="toolbar" aria-label="Imagen">
          ${WRAPS.map(([w, l, t]) => `<button type="button" data-w="${w}" title="${t}">${l}</button>`).join("")}
          <button type="button" class="pimg-crop-btn" title="Recortar: elige qué parte de la imagen conservar">✂ Recortar</button>
          <button type="button" class="pimg-move" title="Arrastra para mover">✥ Mover</button>
          <button type="button" class="pimg-del" title="Eliminar imagen">🗑</button>
        </div>`;
      col().appendChild(ui);
      ui.addEventListener("mousedown", (ev) => {
        if (ev.target.closest(".pimg-resize")) return startResize(ev);
        if (ev.target.closest(".pimg-move")) return startMove(ev);
        ev.preventDefault();                       // los botones no deben quitarle el foco al editor
      });
      ui.addEventListener("click", (ev) => {
        const b = ev.target.closest("button"); if (!b || !sel) return;
        if (b.dataset.w) setWrap(b.dataset.w);
        else if (b.classList.contains("pimg-crop-btn")) startCrop();
        else if (b.classList.contains("pimg-del")) removeSel();
      });
    }
    place();
  }

  function deselect() { endCrop(); sel = null; direct = false; if (ui) { ui.remove(); ui = null; } }
  function removeSel() { if (sel) { sel.remove(); deselect(); if (typeof NoteGuide !== "undefined") NoteGuide.updateCount(); } }

  function place() {
    if (!sel || !ui) return;
    if (!sel.isConnected) return deselect();
    const c = col(), e = ed(); if (!c || !e) return;
    const cr = c.getBoundingClientRect(), er = e.getBoundingClientRect(), ir = sel.getBoundingClientRect();
    const visible = ir.bottom > er.top + 4 && ir.top < er.bottom - 4;
    ui.style.display = visible ? "" : "none";
    const w = sel.dataset.wrap || "inline";
    ui.querySelectorAll("[data-w]").forEach((b) => b.classList.toggle("on", b.dataset.w === w));
    ui.querySelector(".pimg-move").style.display = (w === "front" || w === "behind") ? "" : "none";
    const fr = ui.querySelector(".pimg-frame");
    Object.assign(fr.style, { left: ir.left - cr.left + "px", top: ir.top - cr.top + "px", width: ir.width + "px", height: ir.height + "px" });
    if (crop) drawCrop();
    const bar = ui.querySelector(".pimg-bar");
    let top = ir.top - cr.top - bar.offsetHeight - 6;
    if (top < er.top - cr.top + 2) top = ir.bottom - cr.top + 6;
    if (top + bar.offsetHeight > cr.height) top = Math.max(er.top - cr.top + 4, ir.top - cr.top + 6);
    bar.style.top = top + "px";
    bar.style.left = Math.max(4, Math.min(ir.left - cr.left, cr.width - bar.offsetWidth - 4)) + "px";
  }

  // sube la imagen al inicio de su línea/párrafo (antes del texto que la acompaña)
  const BLOCK = /^(BR|P|DIV|H[1-6]|UL|OL|LI|TABLE|BLOCKQUOTE|PRE|HR)$/;
  function anchorToLineStart(img) {
    let n = img;
    while (n.previousSibling && !BLOCK.test(n.previousSibling.nodeName)) n = n.previousSibling;
    if (n !== img) n.parentNode.insertBefore(img, n);
  }

  function setWrap(w) {
    if (!sel) return;
    const e = ed(), er = e.getBoundingClientRect(), ir = sel.getBoundingClientRect();
    const x = ir.left - er.left - e.clientLeft + e.scrollLeft, y = ir.top - er.top - e.clientTop + e.scrollTop;
    sel.dataset.wrap = w;
    sel.style.left = sel.style.top = "";
    if (w === "left" || w === "right") anchorToLineStart(sel);   // para que el texto de la línea fluya a su lado
    if (w === "front" || w === "behind") {
      sel.style.left = Math.max(0, x) + "px"; sel.style.top = Math.max(0, y) + "px";
    }
    place();
  }

  // ---------- recortar ----------
  // Se marca un recuadro sobre la imagen; al aplicar, se corta la imagen real (no solo se oculta).
  let crop = null;
  const MIN_CROP = 24;
  const clamp = (v, a, b) => Math.max(a, Math.min(v, b));

  function startCrop() {
    if (!sel || crop) return;
    const ir = sel.getBoundingClientRect();
    ui.classList.add("cropping");
    const box = document.createElement("div");
    box.className = "pimg-crop";
    box.innerHTML = `<span class="pc-h" data-h="nw"></span><span class="pc-h" data-h="ne"></span><span class="pc-h" data-h="sw"></span><span class="pc-h" data-h="se"></span>
      <div class="pc-act"><button type="button" data-c="ok">✓ Aplicar</button><button type="button" data-c="no">Cancelar</button></div>`;
    ui.appendChild(box);
    crop = { box, w: ir.width, h: ir.height, r: { x: ir.width * 0.1, y: ir.height * 0.1, w: ir.width * 0.8, h: ir.height * 0.8 } };
    box.addEventListener("mousedown", onCropDown);
    box.addEventListener("click", (ev) => {
      const b = ev.target.closest("button[data-c]"); if (!b) return;
      if (b.dataset.c === "ok") applyCrop(); else endCrop();
    });
    document.addEventListener("keydown", onCropKey, true);
    drawCrop();
  }
  function drawCrop() {
    if (!crop || !sel) return;
    const cr = col().getBoundingClientRect(), ir = sel.getBoundingClientRect();
    crop.w = ir.width; crop.h = ir.height;
    const { x, y, w, h } = crop.r;
    Object.assign(crop.box.style, { left: ir.left - cr.left + x + "px", top: ir.top - cr.top + y + "px", width: w + "px", height: h + "px" });
  }
  function onCropDown(ev) {
    if (ev.target.closest("button")) return;
    ev.preventDefault(); ev.stopPropagation();
    const h = ev.target.dataset?.h, st = { ...crop.r }, x0 = ev.clientX, y0 = ev.clientY;
    const move = (m) => {
      const dx = m.clientX - x0, dy = m.clientY - y0, r = { ...st };
      if (!h) { r.x = clamp(st.x + dx, 0, crop.w - st.w); r.y = clamp(st.y + dy, 0, crop.h - st.h); }
      else {
        if (h.includes("w")) { const nx = clamp(st.x + dx, 0, st.x + st.w - MIN_CROP); r.w = st.w - (nx - st.x); r.x = nx; }
        else r.w = clamp(st.w + dx, MIN_CROP, crop.w - st.x);
        if (h.includes("n")) { const ny = clamp(st.y + dy, 0, st.y + st.h - MIN_CROP); r.h = st.h - (ny - st.y); r.y = ny; }
        else r.h = clamp(st.h + dy, MIN_CROP, crop.h - st.y);
      }
      crop.r = r; drawCrop();
    };
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  }
  function onCropKey(ev) {
    if (!crop) return;
    if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); endCrop(); }
    else if (ev.key === "Enter") { ev.preventDefault(); ev.stopPropagation(); applyCrop(); }
  }
  function endCrop() {
    if (!crop) return;
    crop.box.remove(); crop = null;
    document.removeEventListener("keydown", onCropKey, true);
    ui?.classList.remove("cropping");
  }
  async function applyCrop() {
    if (!crop || !sel) return;
    const ir = sel.getBoundingClientRect(), k = sel.naturalWidth / ir.width, { x, y, w, h } = crop.r;
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    c.getContext("2d").drawImage(sel, x * k, y * k, w * k, h * k, 0, 0, c.width, c.height);
    let out = await new Promise((r) => c.toBlob(r, "image/webp", 0.92));
    if (!out || out.type !== "image/webp") out = await new Promise((r) => c.toBlob(r, "image/png"));
    const url = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(out); });
    const wr = sel.dataset.wrap;
    if (wr === "front" || wr === "behind") {            // el recorte queda justo donde estaba esa parte
      sel.style.left = (parseFloat(sel.style.left) || 0) + x + "px";
      sel.style.top = (parseFloat(sel.style.top) || 0) + y + "px";
    }
    const done = () => { sel.removeEventListener("load", done); endCrop(); place(); };
    sel.addEventListener("load", done);
    sel.style.width = w + "px"; sel.style.height = "auto"; sel.src = url;
  }

  // ---------- mover y cambiar tamaño ----------
  function startMove(ev) {
    if (!sel) return;
    ev.preventDefault();
    drag = { kind: "move", x: ev.clientX, y: ev.clientY, l: parseFloat(sel.style.left) || 0, t: parseFloat(sel.style.top) || 0 };
    window.addEventListener("mousemove", onDrag); window.addEventListener("mouseup", endDrag, { once: true });
  }
  function startResize(ev) {
    if (!sel) return;
    ev.preventDefault();
    drag = { kind: "size", x: ev.clientX, w: sel.getBoundingClientRect().width };
    window.addEventListener("mousemove", onDrag); window.addEventListener("mouseup", endDrag, { once: true });
  }
  function onDrag(ev) {
    if (!drag || !sel) return;
    const e = ed();
    if (drag.kind === "move") {
      let l = drag.l + ev.clientX - drag.x, t = drag.t + ev.clientY - drag.y;
      l = Math.max(0, Math.min(l, e.scrollWidth - sel.offsetWidth)); t = Math.max(0, t);
      sel.style.left = l + "px"; sel.style.top = t + "px";
    } else {
      sel.style.width = Math.max(40, drag.w + ev.clientX - drag.x) + "px"; sel.style.height = "auto";
    }
    place();
  }
  function endDrag() { drag = null; window.removeEventListener("mousemove", onDrag); }

  // ---------- eventos del editor ----------
  function onDown(ev) {
    const t = ev.target;
    if (t?.matches?.("img.pimg")) {
      select(t, true);
      if (t.dataset.wrap === "front") startMove(ev);   // delante: se arrastra directo
      return;
    }
    // detrás del texto: el texto la tapa, así que se detecta por la posición del clic
    const hit = [...ed().querySelectorAll('img.pimg[data-wrap="behind"]')].find((i) => {
      const r = i.getBoundingClientRect();
      return ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
    });
    if (hit) select(hit, false); else deselect();
  }
  function onKey(ev) {
    if (!sel) return;
    if ((ev.key === "Delete" || ev.key === "Backspace") && direct) { ev.preventDefault(); removeSel(); return; }
    if (ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey) direct = false;
    if (ev.key === "Escape") deselect();
  }
  function onPaste(ev) {
    const files = [...(ev.clipboardData?.files || [])].filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    ev.preventDefault(); files.forEach((f) => insert(f));
  }
  function onDropFiles(ev) {
    const files = [...(ev.dataTransfer?.files || [])].filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    ev.preventDefault();
    const r = document.caretRangeFromPoint?.(ev.clientX, ev.clientY);
    if (r) { const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }
    files.forEach((f) => insert(f));
  }

  // ---------- capturas de pantalla ----------
  async function readClipboard() {
    const items = await navigator.clipboard.read();
    for (const it of items) { const ty = it.types.find((x) => x.startsWith("image/")); if (ty) return it.getType(ty); }
    return null;
  }
  const sigOf = (b) => b.type + ":" + b.size;

  async function detect({ manual = false } = {}) {
    if (!active() || busy) return;
    busy = true;
    try {
      const b = await readClipboard();
      if (!b) { if (manual) toast("No hay ninguna imagen en el portapapeles. Haz la captura y vuelve a intentarlo.", "warning"); return; }
      if (!manual && sigOf(b) === lastSig) return;
      lastSig = sigOf(b);
      if (manual) await insert(b); else offer(b);
    } catch (err) {
      if (manual) toast(err?.name === "NotAllowedError" ? "El navegador no dejó leer el portapapeles. Pega con Ctrl+V." : "No pude leer el portapapeles. Pega con Ctrl+V.", "warning");
    } finally { busy = false; }
  }

  // aviso "Captura detectada" con botón para insertarla (nunca inserta sola)
  function offer(blob) {
    offerEl?.remove();
    offerEl = document.createElement("div");
    offerEl.className = "pimg-offer";
    offerEl.innerHTML = `<span>📸 Captura detectada</span><button type="button" class="pimg-offer-ok">Insertar</button><button type="button" class="pimg-offer-x" aria-label="Ignorar">✕</button>`;
    col().appendChild(offerEl);
    const done = () => { offerEl?.remove(); offerEl = null; };
    offerEl.querySelector(".pimg-offer-ok").onclick = async () => { done(); await insert(blob); };
    offerEl.querySelector(".pimg-offer-x").onclick = done;
    setTimeout(() => { if (offerEl && offerEl.isConnected) done(); }, 15000);
  }

  // El navegador NO recibe la combinación Win+Shift+S (la atiende Windows), pero sí ve Shift+Win al
  // pulsarse y la tecla Impr Pant. Con eso "armamos" la detección y miramos el portapapeles al volver.
  const arm = () => { armedUntil = Date.now() + 90000; };
  document.addEventListener("keyup", (ev) => { if (active() && ev.key === "PrintScreen") { arm(); setTimeout(() => detect(), 450); } });
  document.addEventListener("keydown", (ev) => { if (active() && ev.metaKey && ev.shiftKey) arm(); });
  const onBack = () => { if (active() && Date.now() < armedUntil) { setTimeout(() => detect(), 600); setTimeout(() => detect(), 1800); } };
  window.addEventListener("focus", onBack);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") onBack(); });
  document.addEventListener("mousedown", (ev) => {
    if (sel && !ev.target.closest?.("#n_editor, .pimg-ui")) deselect();
  });
  window.addEventListener("resize", () => place());

  // ---------- API ----------
  function attach() {
    const e = ed(); if (!e || e.dataset.pimg) return;
    e.dataset.pimg = "1";
    e.addEventListener("mousedown", onDown);
    e.addEventListener("keydown", onKey);
    e.addEventListener("paste", onPaste);
    e.addEventListener("drop", onDropFiles);
    e.addEventListener("scroll", place);
    e.addEventListener("input", () => place());
    e.querySelectorAll("img").forEach((i) => { if (!i.classList.contains("pimg")) { i.classList.add("pimg"); i.dataset.wrap ||= "inline"; } });
  }
  function detach() { deselect(); offerEl?.remove(); offerEl = null; }
  function pick() {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = "image/*"; inp.multiple = true;
    inp.onchange = () => [...inp.files].forEach((f) => insert(f));
    inp.click();
  }

  return { attach, detach, pick, shot: () => detect({ manual: true }), insert };
})();
