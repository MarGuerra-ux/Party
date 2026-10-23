// ================================================
// PARTY_READER.JS — lector de documentos
// Imagen (foto del celular) → OCR en el navegador (Tesseract.js)
// PDF  → texto con posiciones (pdf.js); si es escaneado, OCR
// Word → tablas y párrafos (.docx)
// TXT/CSV → líneas
//
// Devuelve siempre { words: [{text,x0,y0,x1,y1,conf}], text, source }
// para que los analizadores (p. ej. el de horario) trabajen con
// posiciones, no solo con texto suelto.
// Todo ocurre en el navegador del usuario: el archivo no sale de ahí.
// ================================================

window.DocReader = (() => {
  const LIBS = {
    tesseract: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js",
    pdfjs: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
    pdfworker: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",
    jszip: "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js",
  };
  const loaded = {};
  const loadScript = (key) => loaded[key] || (loaded[key] = new Promise((ok, no) => {
    const s = document.createElement("script");
    s.src = LIBS[key]; s.onload = ok; s.onerror = () => no(new Error("No se pudo cargar " + key + " (¿sin internet?)"));
    document.head.appendChild(s);
  }));

  const extOf = (f) => (f.name.split(".").pop() || "").toLowerCase();
  const kindOf = (f) => {
    const e = extOf(f), t = f.type || "";
    if (t.startsWith("image/") || /^(jpe?g|png|webp|bmp|heic|gif)$/.test(e)) return "image";
    if (t === "application/pdf" || e === "pdf") return "pdf";
    if (e === "docx") return "docx";
    if (/^(txt|csv|md)$/.test(e) || t.startsWith("text/")) return "text";
    return "other";
  };

  // ---------- imagen ----------
  async function toCanvas(blob, maxSide = 2200) {
    const bmp = await createImageBitmap(blob); // respeta la orientación EXIF del celular
    const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return c;
  }
  function enhance(c) { // gris + estirar contraste: ayuda con fotos oscuras o con sombra
    const ctx = c.getContext("2d"), img = ctx.getImageData(0, 0, c.width, c.height), d = img.data;
    const hist = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) { const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0; d[i] = d[i + 1] = d[i + 2] = g; hist[g]++; }
    const total = d.length / 4; let lo = 0, hi = 255, acc = 0;
    for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc > total * 0.02) { lo = i; break; } }
    acc = 0; for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc > total * 0.02) { hi = i; break; } }
    const span = Math.max(40, hi - lo);
    for (let i = 0; i < d.length; i += 4) { const v = Math.max(0, Math.min(255, ((d[i] - lo) * 255) / span)); d[i] = d[i + 1] = d[i + 2] = v; }
    ctx.putImageData(img, 0, 0);
    return c;
  }
  function rotate(c, deg) {
    const r = document.createElement("canvas"), swap = deg % 180 !== 0;
    r.width = swap ? c.height : c.width; r.height = swap ? c.width : c.height;
    const x = r.getContext("2d"); x.translate(r.width / 2, r.height / 2); x.rotate((deg * Math.PI) / 180);
    x.drawImage(c, -c.width / 2, -c.height / 2);
    return r;
  }
  async function ocr(canvas, onProgress) {
    await loadScript("tesseract");
    const worker = await Tesseract.createWorker("spa", 1, {
      logger: (m) => { if (m.status === "recognizing text" && onProgress) onProgress(Math.round(m.progress * 100)); },
    });
    try {
      await worker.setParameters({ tessedit_pageseg_mode: "11" });
      const { data } = await worker.recognize(canvas);
      return (data.words || []).filter((w) => w.text && w.text.trim()).map((w) => ({
        text: w.text.trim(), x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1, conf: w.confidence,
      }));
    } finally { await worker.terminate(); }
  }

  // ---------- PDF ----------
  async function readPdf(file, onProgress) {
    await loadScript("pdfjs");
    pdfjsLib.GlobalWorkerOptions.workerSrc = LIBS.pdfworker;
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const words = []; let yOff = 0;
    for (let p = 1; p <= Math.min(pdf.numPages, 6); p++) {
      const page = await pdf.getPage(p), vp = page.getViewport({ scale: 1 });
      const tc = await page.getTextContent();
      for (const it of tc.items) {
        if (!it.str || !it.str.trim()) continue;
        const h = Math.abs(it.transform[3]) || 10, x = it.transform[4], y = vp.height - it.transform[5] - h + yOff;
        const parts = it.str.split(/(\s+)/); let cx = x; const per = it.width / Math.max(1, it.str.length);
        for (const part of parts) {
          if (part.trim()) words.push({ text: part, x0: cx, y0: y, x1: cx + per * part.length, y1: y + h, conf: 99 });
          cx += per * part.length;
        }
      }
      yOff += vp.height + 100;
    }
    if (words.length >= 20) return { words, source: "pdf" };
    // PDF escaneado: dibujar la página 1 y aplicar OCR
    const page = await pdf.getPage(1), vp = page.getViewport({ scale: 2.2 });
    const c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
    await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
    return { words: await ocr(enhance(c), onProgress), source: "ocr", canvas: c };
  }

  // ---------- Word (.docx) ----------
  async function readDocx(file) {
    await loadScript("jszip");
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const xml = await zip.file("word/document.xml").async("string");
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    const textOf = (el) => [...el.getElementsByTagNameNS(W, "t")].map((t) => t.textContent).join("");
    const words = []; let y = 0;
    const put = (str, x, yy) => { let cx = x; str.split(/\s+/).filter(Boolean).forEach((w) => { words.push({ text: w, x0: cx, y0: yy, x1: cx + w.length * 8, y1: yy + 14, conf: 99 }); cx += w.length * 8 + 8; }); };
    const body = doc.getElementsByTagNameNS(W, "body")[0];
    for (const node of body.children) {
      if (node.localName === "p") { const t = textOf(node); if (t.trim()) { put(t, 0, y); y += 24; } }
      if (node.localName === "tbl") {
        [...node.children].filter((r) => r.localName === "tr").forEach((tr) => {
          [...tr.children].filter((c) => c.localName === "tc").forEach((tc, ci) => put([...tc.getElementsByTagNameNS(W, "p")].map(textOf).join(" "), ci * 190, y));
          y += 44;
        });
        y += 160;
      }
    }
    return { words, source: "docx" };
  }

  // ---------- texto plano ----------
  async function readText(file) {
    const lines = (await file.text()).split(/\r?\n/), words = [];
    lines.forEach((l, i) => { let x = 0; l.split(/\s+/).filter(Boolean).forEach((w) => { words.push({ text: w, x0: x, y0: i * 20, x1: x + w.length * 8, y1: i * 20 + 14, conf: 99 }); x += w.length * 8 + 8; }); });
    return { words, source: "text" };
  }

  // texto corrido a partir de palabras con posición
  function wordsToText(words) {
    const ws = [...words].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0), lines = [];
    for (const w of ws) {
      const l = lines.find((L) => Math.abs(L.y - (w.y0 + w.y1) / 2) < (w.y1 - w.y0) * 0.6);
      if (l) l.w.push(w); else lines.push({ y: (w.y0 + w.y1) / 2, w: [w] });
    }
    return lines.map((l) => l.w.sort((a, b) => a.x0 - b.x0).map((w) => w.text).join(" ")).join("\n");
  }

  /**
   * read(file, {onProgress, tryRotations, accept})
   *  accept(words) → true cuando el análisis posterior reconoce el contenido.
   *  Si es una foto y accept devuelve false, se prueba girarla 90° / 270°.
   */
  async function read(file, opts = {}) {
    const kind = kindOf(file), say = opts.onProgress || (() => {});
    if (kind === "image") {
      let c = enhance(await toCanvas(file));
      let words = await ocr(c, (p) => say(`Leyendo la imagen… ${p}%`));
      if (opts.accept && !opts.accept(words) && opts.tryRotations !== false) {
        for (const deg of [90, 270]) {
          say(`No lo reconocí; pruebo girando la foto ${deg}°…`);
          const r = rotate(c, deg), w2 = await ocr(r, (p) => say(`Leyendo la imagen girada… ${p}%`));
          if (opts.accept(w2)) { words = w2; c = r; break; }
        }
      }
      return { words, text: wordsToText(words), source: "ocr", kind };
    }
    if (kind === "pdf") { const r = await readPdf(file, (p) => say(`Leyendo el PDF… ${p}%`)); return { ...r, text: wordsToText(r.words), kind }; }
    if (kind === "docx") { const r = await readDocx(file); return { ...r, text: wordsToText(r.words), kind }; }
    if (kind === "text") { const r = await readText(file); return { ...r, text: wordsToText(r.words), kind }; }
    return { words: [], text: "", source: "none", kind };
  }

  // Texto COMPLETO de un documento (para buscar dentro del material y, luego, resumir).
  // PDF: todas las páginas (hasta maxPages). Word y texto: el contenido. Otros formatos: null.
  async function fullText(file, maxPages = 120) {
    const kind = kindOf(file);
    if (kind === "pdf") {
      await loadScript("pdfjs");
      pdfjsLib.GlobalWorkerOptions.workerSrc = LIBS.pdfworker;
      const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
      const out = [];
      for (let p = 1; p <= Math.min(pdf.numPages, maxPages); p++) {
        const tc = await (await pdf.getPage(p)).getTextContent();
        out.push(tc.items.map((i) => i.str).join(" ").replace(/\s+/g, " ").trim());
      }
      return { text: out.filter(Boolean).join("\n\n"), pages: pdf.numPages };
    }
    if (kind === "docx") { const r = await readDocx(file); return { text: wordsToText(r.words), pages: null }; }
    if (kind === "text") { const r = await readText(file); return { text: wordsToText(r.words), pages: null }; }
    return null;
  }

  return { read, kindOf, wordsToText, fullText };
})();
