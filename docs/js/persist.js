/* Persistence of the evaluation file: save / open / autosave / continue, behind a small adapter interface
 * so the logic can be tested without a browser. No student data is ever handed to the adapter except the file bytes.
 *
 * Draft (optional, opts.draft = {save(bytes, meta), clear()}): while there is no writable file bound to the work
 * (no autosave: phones, Brave without the flag, or before choosing a file) the current evaluation is kept as a
 * draft in the browser so a closed tab can be recovered. It is deleted as soon as the work is saved or downloaded.
 * Adapter (all async except the flag):
 *   supportsWrite            boolean
 *   pickSave(name)           -> {handle,name} | null
 *   pickOpen()               -> {handle,name} | null          (when supportsWrite)
 *   pickOpenCopy()           -> {name,bytes} | null           (when not supportsWrite)
 *   read(handle)             -> {bytes,lastModified}
 *   write(handle,bytes)      -> {lastModified}
 *   getLastModified(handle)  -> number
 *   remember(handle,name)    only the file identifier and its name
 *   recall()                 -> {handle,name} | null
 *   requestPermission(handle)-> boolean
 *   download(name,bytes)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ZE = root.ZE || {};
    Object.assign(root.ZE, factory());
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Turns a technical error into a sentence a non-technical user can act on. */
  function explain(e) {
    const n = e && e.name ? e.name : '';
    const msg = String(e && e.message ? e.message : e || '');
    if (n === 'NotAllowedError' || /permission|denied|not allowed/i.test(msg)) return 'El navegador perdió el permiso para escribir en el archivo. Presiona "Guardar" para elegirlo de nuevo.';
    if (n === 'NotFoundError' || /not found|no such/i.test(msg)) return 'No encuentro el archivo; puede haberse movido o borrado. Presiona "Guardar como…" para elegir dónde guardarlo.';
    if (/lock|busy|in use|being used/i.test(msg)) return 'El archivo está abierto en otro programa (por ejemplo Excel). Ciérralo y vuelve a guardar.';
    return 'No se pudo guardar: ' + msg;
  }

  function createPersistence(opts) {
    const adapter = opts.adapter;
    const delay = opts.delayMs === undefined ? 2500 : opts.delayMs;
    const schedule = opts.schedule || function (fn, ms) { return setTimeout(fn, ms); };
    const cancel = opts.cancel || function (id) { clearTimeout(id); };
    const now = opts.now || function () { return Date.now(); };
    const onState = opts.onState || function () {};
    const onConflict = opts.onConflict || function () { return Promise.resolve('cancel'); };
    const draft = opts.draft || null;
    const draftDelay = opts.draftDelayMs === undefined ? 1500 : opts.draftDelayMs;
    const draftMeta = opts.draftMeta || function () { return {}; };
    let draftTimer = null;

    const st = {
      state: 'sin-archivo', mode: adapter.supportsWrite ? 'archivo' : 'descarga', handle: null, name: '',
      lastKnown: null, lastSavedAt: null, error: '', dirty: false, blocked: false, rev: 0, draftAt: null
    };
    let timer = null;
    let saving = null;

    function emit() { onState(getState()); }
    function getState() {
      return {
        state: st.state, mode: st.mode, name: st.name, lastSavedAt: st.lastSavedAt, error: st.error,
        dirty: st.dirty, canWrite: adapter.supportsWrite, hasFile: !!st.handle, blocked: st.blocked, draftAt: st.draftAt
      };
    }
    function hasUnsaved() { return st.dirty || st.state === 'guardando' || st.state === 'error'; }

    function draftNeeded() { return !!draft && (!st.handle || !adapter.supportsWrite); }
    function scheduleDraft() {
      if (!draftNeeded()) return;
      if (draftTimer !== null) cancel(draftTimer);
      draftTimer = schedule(function () { draftTimer = null; flushDraft(); }, draftDelay);
    }
    /** Writes the draft now (also called when the page is hidden: phones can kill the tab right after). */
    async function flushDraft() {
      if (draftTimer !== null) { cancel(draftTimer); draftTimer = null; }
      if (!draftNeeded() || !st.dirty) return { ok: false, skipped: true };
      try {
        const meta = Object.assign({}, draftMeta(), { savedAt: now() });
        await draft.save(opts.serialize(), meta);
        st.draftAt = meta.savedAt;
        emit();
        return { ok: true };
      } catch (e) { return { ok: false, error: String(e && e.message ? e.message : e) }; }
    }
    /** Deletes the draft, but only when this session wrote or adopted it (never another course's draft). */
    async function clearDraft() {
      if (draftTimer !== null) { cancel(draftTimer); draftTimer = null; }
      if (!draft || st.draftAt === null) return;
      st.draftAt = null;
      try { await draft.clear(); } catch (e) { /* the draft is optional */ }
      emit();
    }
    /** The user recovered a draft: it now belongs to this session and must be re-saved with the work. */
    function adoptDraft() { if (draft) { st.draftAt = now(); markDirty(); } }

    function markDirty() {
      st.dirty = true;
      st.rev++;
      if (st.state !== 'guardando') st.state = 'sin-guardar';
      emit();
      if (st.handle && adapter.supportsWrite && !st.blocked) {
        if (timer !== null) cancel(timer);
        timer = schedule(function () { timer = null; flush(); }, delay);
      }
      scheduleDraft();
    }

    async function writeNow() {
      const revAtStart = st.rev;
      st.state = 'guardando';
      emit();
      try {
        const bytes = opts.serialize();
        const res = await adapter.write(st.handle, bytes);
        st.lastKnown = res.lastModified;
        st.lastSavedAt = now();
        st.error = '';
        if (st.rev !== revAtStart) { st.dirty = true; st.state = 'sin-guardar'; emit(); if (!st.blocked) timer = schedule(function () { timer = null; flush(); }, delay); }
        else { st.dirty = false; st.state = 'guardado'; emit(); clearDraft(); }
        return { ok: true };
      } catch (e) {
        st.state = 'error';
        st.error = explain(e);
        emit();
        return { ok: false, error: st.error };
      }
    }

    async function flush() {
      if (!st.handle || !adapter.supportsWrite) return { ok: false, reason: 'sin-archivo' };
      if (saving) { await saving; if (!st.dirty) return { ok: true }; }
      saving = (async function () {
        // detect external changes before overwriting
        if (st.lastKnown !== null) {
          let cur;
          try { cur = await adapter.getLastModified(st.handle); } catch (e) { st.state = 'error'; st.error = explain(e); emit(); return { ok: false, error: st.error }; }
          if (cur !== st.lastKnown) {
            st.blocked = true;
            st.state = 'sin-guardar';
            emit();
            const choice = await onConflict();
            if (choice === 'overwrite') { st.blocked = false; }
            else if (choice === 'copy') { st.blocked = false; return saveAsInner(); }
            else if (choice === 'reload') { return { ok: false, reload: true }; }
            else { return { ok: false, conflict: true }; }
          }
        }
        return writeNow();
      })();
      try { return await saving; } finally { saving = null; }
    }

    async function saveAsInner(suggested) {
      if (!adapter.supportsWrite) return downloadCopy(suggested);
      const pick = await adapter.pickSave(suggested || st.name || 'evaluacion.xlsx');
      if (!pick) return { ok: false, cancelled: true };
      st.handle = pick.handle;
      st.name = pick.name;
      st.lastKnown = null;
      st.blocked = false;
      st.mode = 'archivo';
      try { await adapter.remember(pick.handle, pick.name); } catch (e) { /* remembering is optional */ }
      return writeNow();
    }

    function saveAs(suggested) { return saveAsInner(suggested); }

    async function downloadCopy(suggested) {
      const name = suggested || st.name || 'evaluacion.xlsx';
      try {
        await adapter.download(name, opts.serialize());
        st.mode = 'descarga';
        st.name = name;
        st.dirty = false;
        st.lastSavedAt = now();
        st.state = 'guardado';
        st.error = '';
        emit();
        clearDraft();
        return { ok: true, mode: 'descarga' };
      } catch (e) {
        st.state = 'error';
        st.error = explain(e);
        emit();
        return { ok: false, error: st.error };
      }
    }

    function save(suggested) {
      if (st.handle && adapter.supportsWrite) return flush();
      return saveAsInner(suggested);
    }

    /** accept(bytes) -> false means "read it but do not bind it": a Plantilla de Ingreso must never be autosaved over. */
    async function loadFrom(handle, name, accept) {
      const f = await adapter.read(handle);
      if (accept && !accept(f.bytes)) return { ok: true, bytes: f.bytes, name: name, sinAutoguardado: true };
      st.handle = handle;
      st.name = name;
      st.lastKnown = f.lastModified;
      st.dirty = false;
      st.blocked = false;
      st.error = '';
      st.state = 'guardado';
      st.mode = 'archivo';
      try { await adapter.remember(handle, name); } catch (e) { /* optional */ }
      emit();
      return { ok: true, bytes: f.bytes, name: name };
    }

    async function open(o) {
      try {
        if (!adapter.supportsWrite) {
          const c = await adapter.pickOpenCopy();
          if (!c) return { ok: false, cancelled: true };
          st.handle = null; st.name = c.name; st.dirty = false; st.state = 'sin-archivo'; st.mode = 'descarga';
          emit();
          return { ok: true, bytes: c.bytes, name: c.name, sinAutoguardado: true };
        }
        const pick = await adapter.pickOpen();
        if (!pick) return { ok: false, cancelled: true };
        return await loadFrom(pick.handle, pick.name, o && o.accept);
      } catch (e) {
        return { ok: false, error: explain(e) };
      }
    }

    async function reopenLast() {
      try {
        const rec = await adapter.recall();
        if (!rec) return { ok: false, reason: 'sin-recordado' };
        const granted = await adapter.requestPermission(rec.handle);
        if (!granted) return { ok: false, reason: 'permiso', name: rec.name };
        return await loadFrom(rec.handle, rec.name);
      } catch (e) {
        return { ok: false, reason: 'error', error: explain(e) };
      }
    }

    /** Forget the current file (a new evaluation starts: nothing to autosave until the user chooses where). */
    function reset() {
      if (timer !== null) cancel(timer);
      timer = null;
      if (draftTimer !== null) cancel(draftTimer);
      draftTimer = null;
      st.draftAt = null;
      st.handle = null; st.name = ''; st.lastKnown = null; st.lastSavedAt = null; st.error = ''; st.dirty = false; st.blocked = false;
      st.state = 'sin-archivo'; st.mode = adapter.supportsWrite ? 'archivo' : 'descarga';
      emit();
    }

    /** The user chose to discard the pending conflict state and keep editing. */
    function resume() { st.blocked = false; if (st.dirty) markDirty(); }
    function dispose() { if (timer !== null) cancel(timer); timer = null; }

    return { markDirty: markDirty, flush: flush, save: save, saveAs: saveAs, open: open, reopenLast: reopenLast, downloadCopy: downloadCopy, getState: getState, hasUnsaved: hasUnsaved, resume: resume, reset: reset, dispose: dispose, flushDraft: flushDraft, clearDraft: clearDraft, adoptDraft: adoptDraft };
  }

  return { createPersistence: createPersistence, explainSaveError: explain };
}));
