// ================================================
// PARTY_STORE.JS — guarda en Supabase lo que antes vivía solo en el navegador
//  · set(clave, valor): escribe local (caché, instantáneo) y sube a la tabla party_docs.
//  · pull(clave): si en la nube hay algo más nuevo, lo baja a la caché.
//  · Si no hay red, la operación queda en una cola ("outbox") y se reintenta sola.
//  · Primera vez: lo que ya estaba en este navegador se sube (migración automática).
//  · Para filas por elemento (Biblioteca): push / remove / fetch / register.
// Tabla: party_docs (student_id, kind, id, data, updated_at)  → sql/party_migracion_2.sql
// ================================================
window.PartyStore = (() => {
  const OUT = "party_outbox", TS = "__at", SY = "__sync";
  const state = { pendientes: 0, ultimo: null, error: null, remoto: false, tabla: null };
  const readers = {};                       // kind → (id) => Promise<data>  (para no guardar datos pesados en la cola)
  let flushing = false;

  const me = () => { try { const s = Party.student(); return s && !s._dev_mode ? s : null; } catch { return null; } };
  const online = () => !!me() && typeof supabaseClient !== "undefined";
  const jget = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
  const jset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
  const outbox = () => jget(OUT, []);
  const setOut = (o) => { jset(OUT, o); state.pendientes = o.length; };
  const falla = (e) => { state.error = e?.message || String(e); state.remoto = false; console.warn("PartyStore:", state.error); };
  const emit = () => { try { window.dispatchEvent(new CustomEvent("party:store", { detail: { ...state } })); } catch {} };

  function enqueue(op) {
    const o = outbox().filter((x) => !(x.kind === op.kind && x.id === op.id));
    o.push(op); setOut(o); emit();
  }

  async function run(op) {
    const m = me(); if (!m) throw new Error("sin sesión");
    if (op.op === "del") {
      const { error } = await supabaseClient.from("party_docs").delete().match({ student_id: m.id, kind: op.kind, id: op.id });
      if (error) throw error; return;
    }
    const data = op.data !== undefined ? op.data : readers[op.kind] ? await readers[op.kind](op.id) : undefined;
    if (data === undefined || data === null) return;       // el elemento ya no existe
    const { error } = await supabaseClient.from("party_docs").upsert(
      { student_id: m.id, kind: op.kind, id: op.id, data, updated_at: new Date(op.at || Date.now()).toISOString() },
      { onConflict: "student_id,kind,id" });
    if (error) throw error;
  }

  async function flush() {
    if (flushing || !online()) return;
    flushing = true;
    try {
      let guard = 0;
      while (outbox().length && guard++ < 500) {            // se vuelve a leer la cola: pueden entrar operaciones mientras se sube
        const op = outbox()[0];
        try { await run(op); setOut(outbox().filter((x) => !(x.kind === op.kind && x.id === op.id && x.at === op.at))); state.remoto = true; state.error = null; state.ultimo = Date.now(); }
        catch (e) { falla(e); break; }
      }
    } finally { flushing = false; emit(); }
  }

  // ---------- valores sencillos guardados en localStorage con la misma clave ----------
  function set(key, value) {
    const at = Date.now();
    try { localStorage.setItem(key, JSON.stringify(value)); localStorage.setItem(key + TS, String(at)); localStorage.setItem(key + SY, "0"); } catch {}
    if (me()) { enqueue({ op: "put", kind: key, id: "v", data: value, at }); flush(); }
  }
  async function pull(key) {
    const m = me(); if (!online()) return false;
    await flush();
    const localAt = +localStorage.getItem(key + TS) || 0;
    const hasLocal = localStorage.getItem(key) != null;
    let r;
    try {
      r = await supabaseClient.from("party_docs").select("data,updated_at").match({ student_id: m.id, kind: key, id: "v" }).maybeSingle();
      if (r.error) throw r.error;
    } catch (e) { falla(e); emit(); return false; }
    state.remoto = true; state.error = null; state.ultimo = Date.now();
    const remote = r.data;
    const remoteAt = remote ? Date.parse(remote.updated_at) : 0;
    if (remote && remoteAt > localAt + 1000) {                         // la nube es más nueva
      try { localStorage.setItem(key, JSON.stringify(remote.data)); localStorage.setItem(key + TS, String(remoteAt)); localStorage.setItem(key + SY, "1"); } catch {}
      emit(); return true;
    }
    if (hasLocal && (!remote || localAt > remoteAt + 1000)) {          // este navegador tiene lo más nuevo (o es la primera vez): subirlo
      const at = localAt || Date.now();
      if (!localAt) try { localStorage.setItem(key + TS, String(at)); } catch {}
      enqueue({ op: "put", kind: key, id: "v", data: jget(key, null), at }); await flush();
    }
    emit(); return false;
  }

  // ---------- filas por elemento (Biblioteca) ----------
  function register(kind, reader) { readers[kind] = reader; }
  function push(kind, id) { if (me()) { enqueue({ op: "put", kind, id, at: Date.now() }); flush(); } }
  function remove(kind, id) { if (me()) { enqueue({ op: "del", kind, id, at: Date.now() }); flush(); } }
  async function fetchAll(kind) {
    const m = me(); if (!online()) return null;
    await flush();
    const { data, error } = await supabaseClient.from("party_docs").select("id,data,updated_at").match({ student_id: m.id, kind });
    if (error) { falla(error); emit(); return null; }
    state.remoto = true; state.error = null; state.ultimo = Date.now(); emit();
    return data.map((r) => ({ id: r.id, data: r.data, at: Date.parse(r.updated_at) }));
  }
  const pending = (kind) => new Set(outbox().filter((x) => x.kind === kind).map((x) => x.id));

  // ---------- arranque ----------
  const KEYS = ["party_asignaturas", "party_conversations", "party_ppts", "party_note_events", "party_unit_label"];
  let started = false;
  async function syncAll(keys = KEYS) {
    const changed = [];
    for (const k of keys) { if (await pull(k)) changed.push(k); }
    if (changed.includes("party_asignaturas") && window.PartyData?.invalidate) PartyData.invalidate();
    try { window.dispatchEvent(new CustomEvent("party:synced", { detail: { changed } })); } catch {}
    return changed;
  }
  function start() {
    if (started) return; started = true;
    setOut(outbox());
    syncAll();
    window.addEventListener("online", () => { flush(); syncAll(); });
    setInterval(() => { flush(); }, 30000);
  }
  async function health() {
    const m = me(); if (!m) return { ok: false, motivo: "sin sesión (modo desarrollo)" };
    try { const { error } = await supabaseClient.from("party_docs").select("id", { head: true, count: "exact" }).limit(1); return error ? { ok: false, motivo: error.message } : { ok: true }; }
    catch (e) { return { ok: false, motivo: String(e.message || e) }; }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else setTimeout(start, 0);

  return { set, pull, syncAll, start, flush, register, push, remove, fetchAll, pending, health, status: () => ({ ...state, pendientes: outbox().length }), KEYS };
})();
