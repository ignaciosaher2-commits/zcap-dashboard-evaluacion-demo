/* Browser adapter for persist.js: File System Access API (Chrome / Edge) with a download fallback.
 * Remembered in the browser (IndexedDB): the file handle and its name, and, only while the work is not saved to a file,
 * ONE draft of the evaluation (it includes student names, RUT and e-mails; decided by the course owner on 2026-10-08).
 * The draft is deleted when the work is saved or downloaded, when the user discards it, or after DRAFT_DAYS days. */
(function (root) {
  'use strict';
  root.ZE = root.ZE || {};

  const XLSX_TYPES = [{ description: 'Evaluación (Excel)', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }];
  const DB = 'ze-ultimo-archivo';
  const DRAFT_DAYS = 7;

  function isAbort(e) { return e && (e.name === 'AbortError'); }

  function idb(win) {
    return new Promise(function (resolve, reject) {
      const req = win.indexedDB.open(DB, 2);
      req.onupgradeneeded = function () {
        const names = req.result.objectStoreNames;
        if (!names.contains('archivo')) req.result.createObjectStore('archivo');
        if (!names.contains('borrador')) req.result.createObjectStore('borrador');
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function idbGet(win) {
    return idb(win).then(function (db) {
      return new Promise(function (resolve, reject) {
        const r = db.transaction('archivo').objectStore('archivo').get('ultimo');
        r.onsuccess = function () { resolve(r.result || null); };
        r.onerror = function () { reject(r.error); };
      });
    });
  }
  function idbPut(win, value) {
    return idb(win).then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction('archivo', 'readwrite');
        tx.objectStore('archivo').put(value, 'ultimo');
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function store(win, name, mode, fn) {
    return idb(win).then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(name, mode);
        const r = fn(tx.objectStore(name));
        tx.oncomplete = function () { resolve(r && r.result !== undefined ? r.result : undefined); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error); };
      });
    });
  }

  root.ZE.createBrowserAdapter = function (win) {
    const w = win || window;
    const draft = {
      save: function (bytes, meta) { return store(w, 'borrador', 'readwrite', function (s) { return s.put({ bytes: bytes, meta: meta }, 'actual'); }); },
      clear: function () { return store(w, 'borrador', 'readwrite', function (s) { return s.delete('actual'); }); },
      /** Returns {bytes, meta} or null; a draft older than DRAFT_DAYS is deleted instead of offered. */
      load: function () {
        return store(w, 'borrador', 'readonly', function (s) { return s.get('actual'); }).then(function (d) {
          if (!d || !d.bytes || !d.meta) return null;
          if (Date.now() - d.meta.savedAt > DRAFT_DAYS * 86400000) { draft.clear().catch(function () {}); return null; }
          return d;
        }).catch(function () { return null; });
      },
      days: DRAFT_DAYS
    };
    const supportsWrite = !!(w.isSecureContext !== false && typeof w.showSaveFilePicker === 'function' && typeof w.showOpenFilePicker === 'function');
    return {
      supportsWrite: supportsWrite,
      draft: draft,
      pickSave: async function (name) {
        try {
          const handle = await w.showSaveFilePicker({ suggestedName: name, types: XLSX_TYPES });
          return { handle: handle, name: handle.name };
        } catch (e) { if (isAbort(e)) return null; throw e; }
      },
      pickOpen: async function () {
        try {
          const hs = await w.showOpenFilePicker({ types: XLSX_TYPES, multiple: false });
          return { handle: hs[0], name: hs[0].name };
        } catch (e) { if (isAbort(e)) return null; throw e; }
      },
      pickOpenCopy: function () {
        return new Promise(function (resolve) {
          const input = w.document.createElement('input');
          input.type = 'file';
          input.accept = '.xlsx';
          input.onchange = async function () {
            const f = input.files && input.files[0];
            if (!f) { resolve(null); return; }
            resolve({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
          };
          input.addEventListener('cancel', function () { resolve(null); });
          input.click();
        });
      },
      read: async function (handle) {
        const f = await handle.getFile();
        return { bytes: new Uint8Array(await f.arrayBuffer()), lastModified: f.lastModified };
      },
      write: async function (handle, bytes) {
        const writable = await handle.createWritable();
        await writable.write(bytes);
        await writable.close();
        const f = await handle.getFile();
        return { lastModified: f.lastModified };
      },
      getLastModified: async function (handle) { return (await handle.getFile()).lastModified; },
      remember: function (handle, name) { return idbPut(w, { handle: handle, name: name }); },
      recall: function () { return idbGet(w).catch(function () { return null; }); },
      requestPermission: async function (handle) {
        const opts = { mode: 'readwrite' };
        if (typeof handle.queryPermission === 'function' && (await handle.queryPermission(opts)) === 'granted') return true;
        if (typeof handle.requestPermission === 'function') return (await handle.requestPermission(opts)) === 'granted';
        return false;
      },
      download: async function (name, bytes) {
        const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = w.URL.createObjectURL(blob);
        const a = w.document.createElement('a');
        a.href = url;
        a.download = name;
        w.document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { w.URL.revokeObjectURL(url); }, 4000);
      }
    };
  };
})(typeof self !== 'undefined' ? self : this);
