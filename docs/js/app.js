/* User interface: guided flow in five steps (Curso, Fechas y asistencia, Métricas, Evaluar, Resultados).
 * Classic script (no ES modules) so it also works when index.html is opened from disk.
 * All data lives in memory (S.model); the only thing written outside is the evaluation file the user chooses. */
(function () {
  'use strict';
  var ZE = window.ZE;
  var esc = ZE.esc;
  var fmt = ZE.fmtNum;
  var fd = ZE.fmtDate;
  function $(id) { return document.getElementById(id); }
  function q(sel, root) { return (root || document).querySelector(sel); }
  function qa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  var STEPS = [
    { n: 1, t: 'Curso' }, { n: 2, t: 'Fechas y asistencia' }, { n: 3, t: 'Métricas' }, { n: 4, t: 'Evaluar' }, { n: 5, t: 'Resultados' }
  ];
  var CURSO_LABELS = [
    ['curso', 'Curso'], ['cliente', 'Cliente'], ['codigo_sence', 'Código SENCE'], ['contacto', 'Contacto'],
    ['relator', 'Relator'], ['fecha', 'Fecha (primera clase)'], ['ref_interna', 'Ref. interna'], ['especificacion', 'Especificación']
  ];

  var S = {
    model: null, step: 1, confirmed: false, loadInfo: null, loadError: null,
    results: null, save: null, recalled: null, notice: '',
    presentation: true, view: 'curso', selected: null, search: '', filter: 'todos', sort: 'desc',
    fecha: null, metricErrors: {}, cellMsg: '', dayPanelOpen: false, copied: {}
  };

  var adapter = ZE.createBrowserAdapter(window);
  var P = ZE.createPersistence({
    adapter: adapter,
    serialize: function () { return ZE.toBytes(XLSX, S.model); },
    draft: adapter.draft || null,
    draftMeta: function () { return { name: suggestedName(), curso: S.model ? S.model.curso.curso : '', alumnos: S.model ? S.model.alumnos.length : 0 }; },
    onState: function (st) { S.save = st; renderSaveStatus(); },
    onConflict: askConflict
  });
  S.save = P.getState();

  $('foot-text').textContent = 'Dashboard v' + ZE.APP_VERSION + ' · Los datos se procesan en este navegador y no se envían a ningún servidor. El archivo de evaluación queda donde tú lo guardes; si el navegador no puede guardarlo solo, deja un borrador con los nombres en este equipo hasta que descargues el avance (se borra solo a los 7 días).';

  // ------------------------------------------------------------------ small helpers
  function todayIso() { return ZE.todayIso(); }
  function addDays(iso, n) {
    var d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function numStr(v) { return v === null || v === undefined ? '' : String(v).replace('.', ','); }
  function suggestedName() {
    var c = S.model ? S.model.curso : {};
    var base = 'Evaluación - ' + (c.curso || 'curso') + ' - ' + (c.fecha || todayIso()) + '.xlsx';
    return base.replace(/[\\/:*?"<>|]/g, '-');
  }
  function toast(msg) {
    var t = $('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast no-print'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('show'); }, 4500);
  }

  function modal(o) {
    return new Promise(function (resolve) {
      var root = $('modal-root');
      root.innerHTML = '<div class="modal-back"><div class="modal" role="dialog" aria-modal="true" aria-label="' + esc(o.title) + '"><h3>' + esc(o.title) + '</h3><p>' + esc(o.message) + '</p><div class="modal-actions">' +
        o.buttons.map(function (b) { return '<button type="button" class="btn ' + (b.primary ? '' : 'ghost') + '" data-modal="' + esc(b.id) + '">' + esc(b.label) + '</button>'; }).join('') + '</div></div></div>';
      function done(v) { root.innerHTML = ''; document.removeEventListener('keydown', onKey, true); resolve(v); }
      function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); done('cancel'); } }
      document.addEventListener('keydown', onKey, true);
      root.onclick = function (e) { var b = e.target.closest('button[data-modal]'); if (b) done(b.getAttribute('data-modal')); };
      var first = q('button', root);
      if (first) first.focus();
    });
  }
  function confirmBox(title, message, confirmLabel) {
    return modal({ title: title, message: message, buttons: [{ id: 'ok', label: confirmLabel || 'Confirmar', primary: true }, { id: 'cancel', label: 'Cancelar' }] }).then(function (v) { return v === 'ok'; });
  }
  function askConflict() {
    return modal({
      title: 'El archivo cambió desde que lo abriste',
      message: 'Otra persona o programa modificó el archivo (por ejemplo desde otro equipo o una carpeta sincronizada). Si sobrescribes, esos cambios se perderán.',
      buttons: [{ id: 'overwrite', label: 'Sobrescribir', primary: true }, { id: 'copy', label: 'Guardar una copia' }, { id: 'reload', label: 'Volver a cargar el archivo' }, { id: 'cancel', label: 'Ahora no' }]
    }).then(function (v) { if (v === 'reload') setTimeout(openSaved, 0); return v; });
  }

  /** Re-renders the current screen keeping keyboard focus on the same control (data-key). */
  function rerender() {
    var ae = document.activeElement;
    var key = ae && ae.getAttribute ? ae.getAttribute('data-key') : null;
    var sel = ae && ae.selectionStart !== undefined ? [ae.selectionStart, ae.selectionEnd] : null;
    render();
    if (key) {
      var el = q('[data-key="' + key.replace(/"/g, '\\"') + '"]');
      if (el) { el.focus(); if (sel && el.setSelectionRange) { try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* not a text input */ } } }
    }
  }

  function results() { if (!S.results) S.results = ZE.compute(S.model); return S.results; }
  function pseudo() { return ZE.pseudonyms(S.model.alumnos.map(function (a) { return a.id; })); }
  function idOf(a) { return ZE.identity(a, S.presentation, pseudo()); }

  /** Called after every change to the model. */
  function changed() { S.results = null; P.markDirty(); renderChrome(); }

  // ------------------------------------------------------------------ chrome (top bar, stepper, save status)
  function reachable(n) {
    if (!S.model) return false;
    if (n <= 3) return true;
    var iss = ZE.stepIssues(S.model);
    if (n === 4) return !iss[1].length && !iss[2].length && !iss[3].length;
    return !iss[1].length && !iss[2].length && !iss[3].length && !iss[4].length;
  }
  function go(n) {
    if (!S.model) return;
    if (n > S.step) {
      for (var i = S.step; i < n; i++) {
        var iss = ZE.stepIssues(S.model)[i];
        if (iss && iss.length) { toast(iss[0]); return; }
      }
      if (!S.confirmed && n > 1) { toast('Primero confirma los datos del curso.'); return; }
    }
    S.step = n;
    S.cellMsg = '';
    render();
    window.scrollTo(0, 0);
  }

  function renderSaveStatus() {
    var el = $('save-status');
    var btn = $('btn-save');
    if (!el || !S.model) return;
    var s = S.save || P.getState();
    var t = '';
    var cls = '';
    var hora = s.lastSavedAt ? new Date(s.lastSavedAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : '';
    if (s.state === 'error') { t = s.error; cls = 'bad'; }
    else if (s.state === 'guardando') { t = 'Guardando…'; cls = 'wait'; }
    else if (s.state === 'guardado') { t = s.mode === 'descarga' ? 'Descargado a las ' + hora + ' (es una copia)' : 'Guardado a las ' + hora; cls = 'ok'; }
    else if (s.state === 'sin-guardar') { t = s.blocked ? 'Sin guardar: el archivo cambió' : 'Sin guardar'; cls = 'warn'; }
    else { t = s.canWrite ? 'Sin archivo: elige dónde guardar' : 'Este navegador no guarda automáticamente'; cls = 'warn'; }
    // a browser that cannot autosave says so in the page footer instead of a chip in the toolbar
    // the draft kept in the browser is silent: the unsaved work is shown by the highlighted save button, not by a chip
    var noAuto = (!s.canWrite && s.state === 'sin-archivo') || (s.state === 'sin-guardar' && !!s.draftAt && !s.blocked);
    el.hidden = noAuto;
    var fsv = $('foot-save');
    if (fsv) fsv.textContent = s.canWrite ? '' : 'Este navegador no guarda automáticamente: descarga el avance para no perder lo que llevas.';
    el.textContent = t;
    el.className = 'save-status ' + cls;
    btn.textContent = s.canWrite ? (s.hasFile ? 'Guardar' : 'Guardar como…') : 'Descargar avance';
    btn.className = 'btn ' + (s.state === 'guardado' || s.state === 'guardando' ? 'ghost' : '');
    $('btn-open').hidden = false;
  }

  function renderChrome() {
    var m = S.model;
    var has = !!m;
    $('stepper').hidden = !has;
    $('topbar-right').hidden = !has;
    $('course-title').textContent = has ? (m.curso.curso || 'Curso sin nombre') : 'Dashboard de evaluación';
    $('course-sub').textContent = has ? (m.alumnos.length + ' alumnos · ' + m.fechas.length + (m.fechas.length === 1 ? ' fecha' : ' fechas') + (m.curso.cliente ? ' · ' + m.curso.cliente : '')) : 'Carga un curso para comenzar';
    if (has) {
      $('stepper').innerHTML = STEPS.map(function (s) {
        var locked = !reachable(s.n) && s.n > S.step;
        return '<button type="button" class="step ' + (s.n === S.step ? 'active ' : '') + (locked ? 'locked' : '') + '" data-step="' + s.n + '"' + (s.n === S.step ? ' aria-current="step"' : '') + '><span class="dot">' + (s.n < S.step ? '✓' : s.n) + '</span>' + esc(s.t) + '</button>';
      }).join('');
      $('presentation-switch').hidden = S.step !== 5;
      $('print').hidden = S.step !== 5;
      $('presentation').checked = S.presentation;
      renderSaveStatus();
    }
    $('privacy-ribbon').hidden = !(has && S.step === 5 && !S.presentation);
  }

  // ------------------------------------------------------------------ loading files
  function showLoadError(list) {
    S.loadError = list;
    S.model = null;
    render();
  }

  function startWithModel(model, o) {
    S.model = model;
    S.confirmed = !!o.confirmed;
    S.loadInfo = o;
    S.loadError = null;
    S.results = null;
    S.metricErrors = {}; S.copied = {};
    S.selected = null; S.search = ''; S.filter = 'todos'; S.view = 'curso';
    S.fecha = model.fechas.length ? model.fechas[0].fecha : null;
    S.step = o.confirmed ? ZE.firstIncompleteStep(model) : 1;
    if (!o.keepHandle) P.reset();
    renderChrome();
    render();
  }

  function loadBytes(bytes, name, keepHandle) {
    var wb;
    try { wb = XLSX.read(bytes, { type: 'array' }); } catch (e) { showLoadError(['No se pudo leer el archivo. ¿Está dañado o protegido con contraseña?']); return; }
    var raw = ZE.readWorkbook(XLSX, wb);
    if (ZE.fileKind(raw)) {
      var r = ZE.readEvaluationFile(raw);
      if (r.fatal.length) { showLoadError(r.fatal); return; }
      startWithModel(r.model, { confirmed: true, notas: r.notas, warnings: r.warnings, errors: r.errors, name: name, keepHandle: keepHandle });
      if (r.errors.length) toast(r.errors.length + ' filas del archivo tenían errores y no se cargaron.');
      return;
    }
    var it = ZE.parseIntake(ZE.readMatrices(XLSX, wb));
    if (!it.ok) { showLoadError(it.fatal); return; }
    var m = ZE.createModel();
    ZE.setCurso(m, it.curso);
    ZE.mergeAlumnos(m, it.alumnos);
    if (m.curso.fecha && ZE.isIsoDate(m.curso.fecha)) ZE.addFecha(m, m.curso.fecha, '');
    ZE.setPuntosBase(m, ZE.PORCENTAJE_BASE_NUEVO);
    startWithModel(m, { confirmed: false, intake: it, name: name, keepHandle: false });
  }

  async function handleFile(file) {
    if (!file) return;
    if (!(await okToReplaceDraft())) return;
    if (!/\.xlsx$/i.test(file.name)) { showLoadError(['El archivo debe estar en formato .xlsx. Ábrelo en Excel y usa Guardar como → Libro de Excel (.xlsx).']); return; }
    var fr = new FileReader();
    fr.onload = function () { loadBytes(new Uint8Array(fr.result), file.name, false); };
    fr.readAsArrayBuffer(file);
  }

  /** A single draft is kept: ask before starting something that will replace one that was never recovered. */
  async function okToReplaceDraft() {
    if (!S.draftInfo) return true;
    var m = S.draftInfo.meta;
    var ok = await confirmBox('Hay un borrador sin recuperar', 'Hay un borrador de «' + (m.curso || 'un curso') + '» que no recuperaste. Si sigues y empiezas a trabajar, se reemplaza.', 'Seguir y reemplazarlo');
    if (ok) S.draftInfo = null;
    return ok;
  }

  async function recoverDraft() {
    if (!S.draftInfo) return;
    var d = S.draftInfo;
    loadBytes(d.bytes, d.meta.name || suggestedName(), false);
    if (!S.model) return;
    S.draftInfo = null;
    P.adoptDraft();
    toast('Borrador recuperado. Guarda o descarga el archivo para no perderlo.');
  }
  async function discardDraft() {
    if (!S.draftInfo) return;
    if (!(await confirmBox('Descartar el borrador', 'Se borra de este navegador y no se puede recuperar.', 'Descartar'))) return;
    try { await adapter.draft.clear(); } catch (e) { /* optional */ }
    S.draftInfo = null;
    render();
  }

  function isEvaluationBytes(bytes) {
    try { return !!ZE.fileKind(ZE.readWorkbook(XLSX, XLSX.read(bytes, { type: 'array' }))); } catch (e) { return false; }
  }

  /** "Archivo nuevo": an empty course to fill in by hand (name, dates and students are typed in step 1). */
  async function newBlank() {
    if (S.model && P.hasUnsaved()) {
      if (!(await confirmBox('Empezar un archivo nuevo', 'Hay cambios sin guardar. Si sigues, se pierden.', 'Empezar de cero'))) return;
      await P.clearDraft();
    }
    if (!(await okToReplaceDraft())) return;
    var nb = ZE.createModel();
    ZE.setPuntosBase(nb, ZE.PORCENTAJE_BASE_NUEVO);
    startWithModel(nb, { confirmed: false, blank: true, name: '', keepHandle: false });
  }

  async function openSaved() {
    if (!(await okToReplaceDraft())) return;
    if (S.model && P.hasUnsaved() && !(await confirmBox('Abrir otro archivo', 'Hay cambios sin guardar. Si sigues, se pierden.', 'Abrir de todos modos'))) return;
    var r = await P.open({ accept: isEvaluationBytes });
    if (r.ok) loadBytes(r.bytes, r.name, !r.sinAutoguardado);
    else if (r.error) toast(r.error);
  }
  async function continueLast() {
    if (!(await okToReplaceDraft())) return;
    var r = await P.reopenLast();
    if (r.ok) { loadBytes(r.bytes, r.name, true); return; }
    if (r.reason === 'permiso') toast('El navegador no dio permiso para abrir "' + r.name + '". Elige el archivo con "Abrir evaluación guardada".');
    else if (r.reason === 'sin-recordado') toast('No hay un archivo recordado en este equipo. Usa "Abrir evaluación guardada".');
    else toast(r.error || 'No se pudo abrir el último archivo.');
    if (r.reason !== 'error') openSaved();
  }

  // ------------------------------------------------------------------ screens
  function render() {
    renderChrome();
    var box = $('screen');
    if (!S.model) { box.innerHTML = viewStart(); return; }
    if (S.step === 1) box.innerHTML = viewStep1();
    else if (S.step === 2) box.innerHTML = viewStep2();
    else if (S.step === 3) box.innerHTML = viewStep3();
    else if (S.step === 4) box.innerHTML = viewStep4();
    else box.innerHTML = viewResults();
    document.title = S.model ? (S.model.curso.curso || 'Evaluación') + ' · Dashboard de evaluación' : 'Dashboard de evaluación';
  }

  function nav(prev, next, nextLabel) {
    return '<div class="nav-row">' + (prev ? '<button type="button" class="btn ghost" data-go="' + prev + '">← Atrás</button>' : '<span></span>') +
      (next ? '<button type="button" class="btn" data-go="' + next + '" data-key="next">' + esc(nextLabel || 'Siguiente →') + '</button>' : '') + '</div>';
  }

  // ---- start
  function viewStart() {
    var err = S.loadError ? '<section class="card"><h2>No se pudo cargar el archivo</h2><div class="banner error"><ul class="issues">' + S.loadError.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul></div></section>' : '';
    var dr = S.draftInfo ? S.draftInfo.meta : null;
    var draftCard = dr ? '<section class="card draft-card"><h2>Hay un trabajo sin guardar</h2>' +
      '<p>Quedó un borrador de <b>' + esc(dr.curso || 'un curso') + '</b>' + (dr.alumnos ? ' (' + dr.alumnos + ' alumnos)' : '') + ' del ' + esc(new Date(dr.savedAt).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })) + ', guardado en este navegador.</p>' +
      '<div class="actions"><button type="button" class="btn" data-action="recover-draft">Recuperar borrador</button><button type="button" class="link-btn" data-action="discard-draft">Descartar</button></div>' +
      '<p><small>El borrador incluye nombres, RUT y correos de los alumnos y solo está en este navegador. Se borra al guardar o descargar el archivo, al descartarlo o a los 7 días.</small></p></section>' : '';
    return err + draftCard +
      '<section class="card"><h2>Abrir un curso</h2>' +
      '<p>Elige la <b>Plantilla de Ingreso</b> o una <b>evaluación guardada</b>: la página detecta cuál es y sigue desde donde corresponde.</p>' +
      '<label class="drop" id="drop" tabindex="0"><strong>Arrastra el archivo aquí</strong><span>o haz clic para elegirlo (formato .xlsx)</span><input type="file" id="file" accept=".xlsx" hidden></label>' +
      '<div class="actions">' + (S.recalled ? '<button type="button" class="btn" data-action="continue-last">Continuar con el último archivo (' + esc(S.recalled.name) + ')</button>' : '') +
      '<button type="button" class="btn ' + (S.recalled ? 'ghost' : '') + '" data-action="new-blank">Archivo nuevo en blanco</button></div>' +
      '<p><small><a href="plantilla/plantilla-ingreso-FICTICIA.xlsx" download>Plantilla de Ingreso</a></small></p></section>';
  }

  // ---- step 1: course and students
  function viewStep1() {
    var m = S.model;
    var info = S.loadInfo || {};
    var it = info.intake;
    var warns = ((it && it.warnings) || []).concat(info.warnings || []);
    var ign = it && it.ignoredColumns && it.ignoredColumns.length ? '<div class="banner warn">Se ignoró la columna ' + it.ignoredColumns.map(function (c) { return '«' + esc(c) + '»'; }).join(', ') + ' por seguridad: las claves no se leen ni se guardan.</div>' : '';
    var notas = (info.notas || []).map(function (n) { return '<div class="banner warn">' + esc(n) + '</div>'; }).join('');
    var inputs = '<div class="form-grid">' + CURSO_LABELS.map(function (f) {
      return '<label class="field"><span>' + f[1] + '</span><input type="text" data-curso="' + f[0] + '" data-key="curso-' + f[0] + '" value="' + esc(m.curso[f[0]]) + '"' + (f[0] === 'fecha' ? ' placeholder="AAAA-MM-DD"' : '') + '></label>';
    }).join('') + '</div>';
    var rows = m.alumnos.map(function (a, i) {
      return '<tr><td class="num-col">' + (i + 1) + '</td><td><code>' + esc(a.id) + '</code></td>' +
        '<td><input type="text" data-al="' + esc(a.id) + '" data-field="nombre" data-key="al-n-' + esc(a.id) + '" value="' + esc(a.nombre) + '" aria-label="Nombre"></td>' +
        '<td><input type="text" data-al="' + esc(a.id) + '" data-field="rut" data-key="al-r-' + esc(a.id) + '" value="' + esc(a.rut) + '" aria-label="RUT"></td>' +
        '<td><input type="text" data-al="' + esc(a.id) + '" data-field="correo" data-key="al-c-' + esc(a.id) + '" value="' + esc(a.correo) + '" aria-label="Correo"></td>' +
        '<td><button type="button" class="link-btn" data-action="rm-al" data-id="' + esc(a.id) + '">Quitar</button></td></tr>';
    }).join('');
    return '<section class="card"><h2>' + (S.confirmed ? 'Datos del curso' : 'Revisa los datos del curso') + '</h2>' +
      (S.confirmed ? '' : '<p>' + (info.blank ? 'Escribe los datos del curso y agrega a los alumnos; después confirma para continuar.' : 'Estos datos salieron de tu planilla. Corrige lo que haga falta y confirma para continuar.') + '</p>') + inputs + '</section>' +
      ign + notas +
      (warns.length ? '<section class="card compact"><details><summary>' + warns.length + ' advertencias de la carga</summary><ul class="issues">' + warns.slice(0, 80).map(function (w) { return '<li>' + (w.row ? 'Fila ' + w.row + ': ' : '') + esc(w.message) + '</li>'; }).join('') + '</ul></details></section>' : '') +
      '<section class="card"><h2>Alumnos (' + m.alumnos.length + ')</h2><div class="table-wrap"><table class="tbl"><thead><tr><th></th><th>Registro</th><th>Nombre</th><th>RUT</th><th>Correo</th><th></th></tr></thead><tbody>' + rows +
      '<tr class="add-row"><td></td><td></td><td><input type="text" id="new-al-nombre" placeholder="Nombre del alumno nuevo" data-key="new-n"></td><td><input type="text" id="new-al-rut" placeholder="RUT" data-key="new-r"></td><td><input type="text" id="new-al-correo" placeholder="Correo" data-key="new-c"></td><td><button type="button" class="btn ghost" data-action="add-al">Agregar</button></td></tr>' +
      '</tbody></table></div></section>' +
      (S.confirmed ? nav(null, 2) : '<div class="nav-row"><span></span><button type="button" class="btn" data-action="confirm-course" data-key="confirm">Confirmar y continuar →</button></div>');
  }

  // ---- step 2: dates and attendance
  function viewStep2() {
    var m = S.model;
    var fechas = m.fechas.map(function (f) {
      return '<div class="date-row"><input type="date" data-fecha="' + esc(f.fecha) + '" data-field="fecha" data-key="f-' + esc(f.fecha) + '" value="' + esc(f.fecha) + '" aria-label="Fecha">' +
        '<input type="text" data-fecha="' + esc(f.fecha) + '" data-field="tema" data-key="t-' + esc(f.fecha) + '" value="' + esc(f.tema) + '" placeholder="Tema del día (opcional)" aria-label="Tema">' +
        '<button type="button" class="link-btn" data-action="rm-fecha" data-fecha="' + esc(f.fecha) + '">Quitar</button></div>';
    }).join('');
    var head = m.fechas.map(function (f) {
      var pres = ZE.presentes(m, f.fecha).length;
      return '<th class="day-col"><div>' + esc(fd(f.fecha).slice(0, 5)) + '</div><small>' + esc(f.tema || '') + '</small><div class="day-count">' + pres + '/' + m.alumnos.length + '</div>' +
        '<button type="button" class="link-btn" data-action="all-on" data-fecha="' + esc(f.fecha) + '">Marcar todos</button></th>';
    }).join('');
    var rows = m.alumnos.map(function (a) {
      var as = ZE.asistenciaDeAlumno(m, a.id);
      return '<tr><td class="code-col">' + esc(a.id) + '</td><td class="name-col">' + esc(a.nombre) + '</td>' + m.fechas.map(function (f) {
        return '<td class="chk"><input type="checkbox" data-asis-a="' + esc(a.id) + '" data-asis-f="' + esc(f.fecha) + '" data-key="as-' + esc(a.id) + '-' + esc(f.fecha) + '"' + (ZE.estaPresente(m, a.id, f.fecha) ? ' checked' : '') + ' aria-label="' + esc(a.nombre) + ' presente el ' + esc(fd(f.fecha)) + '"></td>';
      }).join('') + '<td class="att">' + as.presentes + ' de ' + as.total + (as.total ? ' (' + fmt(as.pct, 0) + ' %)' : '') + '</td></tr>';
    }).join('');
    var matrix = m.fechas.length ? '<div class="table-wrap"><table class="tbl matrix"><thead><tr><th class="code-col">Código</th><th class="name-col">Alumno</th>' + head + '<th>Asistencia</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<p><small>La asistencia solo se registra: no hay mínimo exigido. Los alumnos sin marcar no aparecen en la grilla de evaluación de ese día.</small></p>' : '<p>Agrega al menos una fecha de clases para registrar la asistencia.</p>';
    return '<section class="card"><h2>Fechas de las clases presenciales</h2><p>Agrega las fechas en que hubo clases, las que sean. El tema es opcional y permite comparar temas en los resultados.</p>' + fechas +
      '<div class="actions"><button type="button" class="btn ghost" data-action="add-fecha">+ Agregar fecha</button></div></section>' +
      '<section class="card"><h2>Asistencia</h2>' + matrix + '</section>' + nav(1, 3);
  }

  // ---- step 3: metrics
  function viewStep3() {
    var m = S.model;
    var cat = ZE.catalogo || { grupos: [], escala: { min: 0, max: 100, minAprob: 60 } };
    var have = {};
    m.metricas.forEach(function (x) { have[ZE.nk(x.nombre)] = true; });
    var catalog = cat.grupos.map(function (g, gi) {
      var rest = g.metricas.filter(function (x) { return !have[ZE.nk(x.nombre)]; }).length;
      return '<details' + (gi === 0 ? ' open' : '') + '><summary>' + esc(g.nombre) + ' <small>(' + g.metricas.length + ')</small></summary>' +
        '<div class="cat-list">' +
        g.metricas.map(function (x, xi) {
          var added = have[ZE.nk(x.nombre)];
          return '<div class="cat-item"><div><b>' + esc(x.nombre) + '</b><small>' + esc(x.descripcion || '') + '</small></div><button type="button" class="link-btn" data-action="add-cat" data-g="' + gi + '" data-x="' + xi + '"' + (added ? ' disabled' : '') + '>' + (added ? 'Agregada' : 'Agregar') + '</button></div>';
        }).join('') + '</div>' +
        '<div class="cat-actions"><button type="button" class="btn' + (rest ? '' : ' ghost') + '" data-action="add-grupo" data-g="' + gi + '"' + (rest ? '' : ' disabled') + '>' + (rest ? '+ Agregar el grupo completo (' + rest + ')' : 'Grupo ya agregado') + '</button></div>' + '</details>';
    }).join('');
    var rows = m.metricas.map(function (x) {
      var err = S.metricErrors[x.id];
      var ck = x.tipo === 'checklist';
      var scale = ck ? '<td colspan="2" class="muted-cell">—</td><td class="pct-cell" data-label="Mín. esperado"><input type="text" inputmode="decimal" class="narrow" data-met="' + esc(x.id) + '" data-field="minAprob" data-pct="1" data-key="m-pct-' + esc(x.id) + '" value="' + esc(numStr(Math.round(x.minAprob * 1000) / 10)) + '" aria-label="Mínimo esperado de cumplimiento, en porcentaje"> %</td>' : ['min', 'max', 'minAprob'].map(function (k) { return '<td data-label="' + (k === 'min' ? 'Mínimo' : k === 'max' ? 'Máximo' : 'Mín. aprobación') + '"><input type="text" inputmode="decimal" class="narrow" data-met="' + esc(x.id) + '" data-field="' + k + '" data-key="m-' + k + '-' + esc(x.id) + '" value="' + esc(numStr(x[k])) + '" aria-label="' + k + '"></td>'; }).join('');
      return '<tr class="' + (x.activa ? '' : 'off') + '"><td class="chk" data-label="Activa"><input type="checkbox" data-met="' + esc(x.id) + '" data-field="activa" data-key="m-a-' + esc(x.id) + '"' + (x.activa ? ' checked' : '') + ' aria-label="Activa"></td>' +
        '<td><input type="text" data-met="' + esc(x.id) + '" data-field="nombre" data-key="m-n-' + esc(x.id) + '" value="' + esc(x.nombre) + '" aria-label="Nombre de la métrica"><input type="text" class="sub" data-met="' + esc(x.id) + '" data-field="descripcion" data-key="m-d-' + esc(x.id) + '" value="' + esc(x.descripcion) + '" placeholder="Qué se observa (opcional)" aria-label="Descripción"></td>' +
        '<td data-label="Tipo"><select data-met="' + esc(x.id) + '" data-field="tipo" data-key="m-t-' + esc(x.id) + '" aria-label="Tipo de métrica"><option value="checklist"' + (ck ? ' selected' : '') + '>Checklist</option><option value="escala"' + (ck ? '' : ' selected') + '>Escala</option></select></td>' + scale +
        '<td data-label="Peso"><input type="text" inputmode="decimal" class="narrow" data-met="' + esc(x.id) + '" data-field="peso" data-key="m-peso-' + esc(x.id) + '" value="' + esc(numStr(x.peso)) + '" placeholder="igual" aria-label="Peso"></td>' +
        '<td><button type="button" class="link-btn" data-action="rm-met" data-id="' + esc(x.id) + '">Quitar</button></td></tr>' +
        (err ? '<tr class="err-row"><td></td><td colspan="7"><span class="field-error">' + esc(err) + '</span></td></tr>' : '');
    }).join('');
    var table = m.metricas.length ? '<div class="table-wrap"><table class="tbl metrics"><thead><tr><th>Activa</th><th>Métrica</th><th>Tipo</th><th>Mínimo</th><th>Máximo</th><th>Mín. aprobación</th><th>Peso</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<p class="muted">Aún no hay métricas.</p>';
    var e = cat.escala;
    var baseBox = '<div class="base-box"><label for="puntos-base"><b>% base</b></label><input type="text" id="puntos-base" class="narrow" inputmode="decimal" data-key="puntos-base" value="' + esc(numStr(m.config.puntos_base || 0)) + '" aria-label="Porcentaje base"> <span class="pct-sign">%</span> ' +
      '<small>Mínimo garantizado del puntaje de cada día. 0 = sin base.</small>' +
      (S.baseErr ? '<div class="field-error">' + esc(S.baseErr) + '</div>' : '') + '</div>';
    var ot = S.ownTipo === 'escala' ? 'escala' : 'checklist';
    var typeCards = '<div class="type-cards" role="radiogroup" aria-label="Tipo de métrica">' +
      '<label class="type-card' + (ot === 'checklist' ? ' sel' : '') + '"><input type="radio" name="own-tipo" value="checklist" data-key="own-tipo-c"' + (ot === 'checklist' ? ' checked' : '') + '><span class="tc-ico" aria-hidden="true">&#10003;</span><span class="tc-t">Checklist</span></label>' +
      '<label class="type-card' + (ot === 'escala' ? ' sel' : '') + '"><input type="radio" name="own-tipo" value="escala" data-key="own-tipo-e"' + (ot === 'escala' ? ' checked' : '') + '><span class="tc-ico" aria-hidden="true">1-7</span><span class="tc-t">Escala</span></label></div>';
    var scaleInputs = ot === 'escala' ? '<label class="mini">Mínimo<input type="text" id="own-min" class="narrow" inputmode="decimal" value="' + e.min + '"></label><label class="mini">Máximo<input type="text" id="own-max" class="narrow" inputmode="decimal" value="' + e.max + '"></label><label class="mini">Mín. aprobación<input type="text" id="own-ma" class="narrow" inputmode="decimal" value="' + e.minAprob + '"></label>' : '';
    return '<section class="card"><h2>Métricas del curso</h2>' + baseBox + table + '</section>' +
      '<section class="card"><h2>Agregar métrica</h2>' + typeCards +
      '<div class="own-row"><input type="text" id="own-name" placeholder="Nombre de la métrica" data-key="own-name" value="' + esc(S.ownName || '') + '">' + scaleInputs + '<button type="button" class="btn" data-action="add-own">Agregar</button></div></section>' +
      '<section class="card"><h2>Catálogo de métricas</h2>' + catalog + '</section>' + nav(2, 4);
  }

  // ---- step 4: grid
  function activeFecha() {
    var m = S.model;
    if (!S.fecha || !ZE.fechaObj(m, S.fecha)) S.fecha = m.fechas.length ? m.fechas[0].fecha : null;
    return S.fecha;
  }
  function copiedCount(f) { return Object.keys(S.copied).filter(function (k) { return k.split('|')[1] === f && ZE.getPuntaje(S.model, k.split('|')[0], f, k.split('|')[2]) !== null; }).length; }
  function copiedNote(f) { var n = copiedCount(f); return n ? '<b>' + n + '</b> ' + (n === 1 ? 'puntaje copiado sin revisar' : 'puntajes copiados sin revisar') : ''; }
  function descNote(f) {
    var has = ZE.metricasDelDia(S.model, f).some(function (x) { return x.tipo === 'checklist'; });
    if (!has) return '';
    var n = ZE.descuentosDelDia(S.model, f);
    return 'No cumple: <b>' + n + '</b>';
  }
  function viewStep4() {
    var m = S.model;
    var f = activeFecha();
    if (f) { var ini = ZE.inicializarChecklist(m, f); if (ini.ok && ini.inicializadas) changed(); }
    var act = ZE.metricasDelDia(m, f);
    var hasEsc = act.some(function (x) { return x.tipo !== 'checklist'; });
    var hasCk = act.some(function (x) { return x.tipo === 'checklist'; }) && ZE.presentes(m, f).length > 0;
    var allAct = ZE.metricasActivas(m);
    var tabs = m.fechas.map(function (x) {
      return '<button type="button" class="tab ' + (x.fecha === f ? 'active' : '') + '" data-action="pick-fecha" data-fecha="' + esc(x.fecha) + '">' + esc(fd(x.fecha).slice(0, 5)) + (x.tema ? ' · ' + esc(x.tema) : '') + ' <small>' + ZE.presentes(m, x.fecha).length + '/' + m.alumnos.length + '</small></button>';
    }).join('');
    var pres = ZE.presentes(m, f);
    var evald = pres.filter(function (a) { return ZE.dailyTotalFor(m, a.id, f).scored > 0; }).length;
    var head = act.map(function (x) {
      return '<th class="met-col" title="' + esc(x.descripcion || '') + '"><div>' + esc(x.nombre) + '</div>' + (x.tipo === 'checklist' ? '' : '<small>' + numStr(x.min) + ' a ' + numStr(x.max) + ' · mín. ' + numStr(x.minAprob) + '</small>') + '</th>';
    }).join('');
    var rows = pres.map(function (a) {
      var tot = ZE.dailyTotalFor(m, a.id, f);
      return '<tr data-row="' + esc(a.id) + '"><td class="code-col">' + esc(a.id) + '</td><td class="name-col">' + esc(a.nombre) + '</td>' + act.map(function (x) {
        var v = ZE.getPuntaje(m, a.id, f, x.id);
        if (x.tipo === 'checklist') return '<td class="ck-td"><label class="ck"><input type="checkbox" class="cell-ck" data-a="' + esc(a.id) + '" data-f="' + esc(f) + '" data-m="' + esc(x.id) + '" data-key="c-' + esc(a.id) + '-' + esc(x.id) + '"' + (v === 0 ? '' : ' checked') + ' aria-label="' + esc(a.nombre + ', ' + x.nombre + ': cumple') + '"></label></td>';
        return '<td><input type="text" inputmode="decimal" class="cell' + (v !== null && v < x.minAprob ? ' below' : '') + (S.copied[a.id + '|' + f + '|' + x.id] ? ' copied' : '') + '" data-a="' + esc(a.id) + '" data-f="' + esc(f) + '" data-m="' + esc(x.id) + '" data-key="c-' + esc(a.id) + '-' + esc(x.id) + '" value="' + esc(numStr(v)) + '" aria-label="' + esc(a.nombre + ', ' + x.nombre) + '"></td>';
      }).join('') + '<td class="tot" data-tot="' + esc(a.id) + '">' + (tot.total === null ? '<span class="pend">pendiente</span>' : fmt(tot.total)) + '</td>' +
        '<td><input type="text" class="com" data-com="' + esc(a.id) + '" data-f="' + esc(f) + '" data-key="com-' + esc(a.id) + '" value="' + esc(m.comentarios[a.id + '|' + f] || '') + '" placeholder="Comentario" aria-label="Comentario de ' + esc(a.nombre) + '"></td></tr>';
    }).join('');
    var body = !pres.length ? '<p>Nadie está marcado como presente en esta fecha. Vuelve a <b>Fechas y asistencia</b> para registrar quién asistió.</p>' :
      '<div class="table-wrap grid-wrap"><table class="tbl grid" id="grid"><thead><tr><th class="code-col">Código</th><th class="name-col">Alumno</th>' + head + '<th>Total del día</th><th>Comentario</th></tr>' +
        (hasEsc ? '<tr class="fill-row"><th class="code-col"></th><th class="name-col"><small>Rellenar las vacías con…</small></th>' + act.map(function (x) { if (x.tipo === 'checklist') return '<th></th>'; return '<th><input type="text" inputmode="decimal" class="fill" data-fill="' + esc(x.id) + '" data-key="fill-' + esc(x.id) + '" placeholder="ej. ' + numStr(x.max) + ' + Enter" aria-label="Rellenar con un puntaje las celdas vacías de ' + esc(x.nombre) + '"></th>'; }).join('') + '<th></th><th></th></tr>' : '') + '</thead><tbody>' + rows + '</tbody></table></div>';
    var groups = {};
    allAct.forEach(function (x) { if (x.grupo) (groups[x.grupo] = groups[x.grupo] || []).push(x); });
    var fo = ZE.fechaObj(m, f);
    var panel = '<section class="day-metrics" id="day-metrics"><h3 class="dm-title">Métricas de este día: ' + act.length + ' de ' + allAct.length + '</h3>' +
      '<div class="chips-row"><button type="button" class="link-btn" data-action="day-all">Todas</button>' + Object.keys(groups).map(function (g) { return '<button type="button" class="link-btn" data-action="day-group" data-grupo="' + esc(g) + '">Solo ' + esc(g) + ' (' + groups[g].length + ')</button>'; }).join('') + '</div>' +
      '<div class="day-met-list">' + allAct.map(function (x) { return '<label class="chk-inline"><input type="checkbox" data-daymet="' + esc(x.id) + '" data-key="dm-' + esc(x.id) + '"' + (act.indexOf(x) >= 0 ? ' checked' : '') + '> ' + esc(x.nombre) + '</label>'; }).join('') + '</div></section>';
    var prev = ZE.fechaAnterior(m, f);
    var copyBar = prev && pres.length && hasEsc ? '<div class="copy-bar"><button type="button" class="btn ghost" data-action="copy-prev">Traer los puntajes del ' + esc(fd(prev).slice(0, 5)) + '</button>' +
      '<small>Copia a las celdas vacías; lo copiado queda punteado hasta que lo revises (Enter).</small></div>' : '';
    return '<section class="card"><h2>Evaluar</h2><div class="tabs">' + tabs + '</div>' + panel + copyBar +
      '<div class="grid-meta"><span id="progress"><b>' + evald + '</b> de ' + pres.length + ' presentes evaluados</span><span id="copied-note">' + copiedNote(f) + '</span><span class="ck-right">' + (hasCk ? '<button type="button" class="link-btn" data-action="ck-all">Marcar todos</button><button type="button" class="link-btn" data-action="ck-none">Desmarcar todos</button>' : '') + '<span id="desc-note">' + descNote(f) + '</span></span>' + (hasEsc ? '<span><small><span class="legend-below"></span> resaltado = bajo el mínimo de la métrica (es solo una referencia) · usa Enter para bajar a la celda siguiente</small></span>' : '') + '</div>' +
      '<div class="cell-msg" id="cell-msg" role="alert">' + esc(S.cellMsg) + '</div>' + body + '</section>' +
      nav(3, 5, 'Ver resultados →');
  }

  // ---- step 5: results
  function reportHead(kicker, title, onlyPrint) {
    var c = S.model.curso;
    var r = results();
    var periodo = r.periodo.desde ? fd(r.periodo.desde) + (r.periodo.hasta !== r.periodo.desde ? ' a ' + fd(r.periodo.hasta) : '') : 'sin fechas';
    var op = onlyPrint ? ' only-print' : '';
    function item(k, v) { return '<div><dt>' + k + '</dt><dd>' + v + '</dd></div>'; }
    return '<div class="card head-card' + op + '"><div class="report-head"><div class="report-id"><div class="report-logo" aria-hidden="true"></div><div><div class="kicker">' + esc(kicker) + '</div><h1>' + esc(title) + '</h1></div></div></div></div>' +
      '<div class="card info-card' + op + '"><h2>Información del curso</h2><dl class="meta wide">' + item('Curso', esc(c.curso || 'Sin nombre') + (c.cliente ? ' · ' + esc(c.cliente) : '')) +
      (c.relator ? item('Relator', esc(c.relator)) : '') + (c.codigo_sence ? item('Código SENCE', esc(c.codigo_sence)) : '') +
      item('Período evaluado', periodo) + item('Generado', fd(todayIso())) + '</dl></div>';
  }
  function statCard(label, num, sub, dark) {
    return '<div class="card stat' + (dark ? ' dark' : '') + '"><div class="lbl">' + esc(label) + '</div><div class="num">' + num + '</div><small>' + sub + '</small></div>';
  }
  function sd(iso) { return iso ? iso.slice(8, 10) + '-' + iso.slice(5, 7) : ''; }

  function viewResults() {
    var tabs = '<div class="seg no-print" id="view-switch" role="group" aria-label="Vista"><button type="button" data-view="curso" aria-pressed="' + (S.view === 'curso') + '">Curso</button><button type="button" data-view="alumnos" aria-pressed="' + (S.view === 'alumnos') + '">Alumnos</button></div>';
    return tabs + (S.view === 'curso' ? viewCurso() : viewAlumnos()) + '<div class="no-print">' + nav(4, null) + '</div>';
  }

  function viewCurso() {
    var r = results();
    var c = r.cohorte;
    var k = S.model.config.tamano_minimo_grupo;
    var html = '<div class="stack">' + reportHead('Resumen del curso', S.model.curso.curso || 'Curso sin nombre');
    if (S.presentation && c.n < k) {
      return html + '<div class="card"><h2>Grupo reservado</h2><p>El curso tiene ' + c.n + (c.n === 1 ? ' alumno evaluado' : ' alumnos evaluados') + ' y el mínimo para mostrar resultados agregados en modo presentación es ' + k + '. Para verlos, desactiva el modo presentación.</p></div></div>';
    }
    html += '<div class="grid-4">' +
      statCard('Alumnos evaluados', c.n, 'de ' + c.total + ' en la lista') +
      statCard('Rendimiento promedio', fmt(c.promedio), c.mediana === null ? '' : 'mediana ' + fmt(c.mediana) + ' · de 100', true) +
      statCard('Asistencia promedio', c.asistenciaPromedio === null ? '—' : fmt(c.asistenciaPromedio, 0) + ' %', 'de los días de clases') +
      statCard('Evaluación incompleta', c.incompletos, c.incompletos === 1 ? 'alumno con métricas por evaluar' : 'alumnos con métricas por evaluar') + '</div>';

    var conPts = r.dias.filter(function (d) { return d.promedio !== null; });
    var hasTema = r.dias.some(function (d) { return d.tema; });
    var dayRows = r.dias.map(function (d) {
      return '<tr><td>' + esc(fd(d.fecha)) + '</td>' + (hasTema ? '<td>' + esc(d.tema || '—') + '</td>' : '') + '<td>' + d.presentes + ' de ' + d.total + '</td><td>' + d.evaluados + (d.pendientes ? ' <small>(' + d.pendientes + ' pend.)</small>' : '') + '</td><td><b>' + (d.promedio === null ? '—' : fmt(d.promedio)) + '</b></td></tr>';
    }).join('');
    // with a single evaluated date there is no trend to draw and the figures above already say it all
    if (r.dias.length > 1 && conPts.length > 1) {
      var evol = ZE.lineChart(conPts.map(function (d) { return { label: sd(d.fecha), value: d.promedio }; }), null, 'Rendimiento promedio por fecha');
      html += '<div class="card"><h2>Resultados por fecha</h2><div class="grid-2 inner"><div>' + evol + '</div><div class="table-wrap"><table class="tbl small"><thead><tr><th>Fecha</th>' + (hasTema ? '<th>Tema</th>' : '') + '<th>Presentes</th><th>Evaluados</th><th>Promedio</th></tr></thead><tbody>' + dayRows + '</tbody></table></div></div></div>';
    }

    var mets = r.metricas.filter(function (x) { return x.usada; }).sort(function (a, b) { return (b.pctAlcanzan === null ? -1 : b.pctAlcanzan) - (a.pctAlcanzan === null ? -1 : a.pctAlcanzan); });
    html += '<div class="card"><h2>Cumplimiento del mínimo por métrica</h2>' + ZE.barRows(mets.map(function (x) {
      return x.promedioNorm === null ? { label: x.nombre, value: null } : {
        label: x.nombre, value: x.promedioNorm, marker: x.minAprobNorm,
        extra: x.alcanzan + ' de ' + x.conDatos + ' alumnos · ' + (x.tipo === 'checklist' ? 'mínimo esperado ' + fmt(x.minAprob * 100, 0) + ' %' : 'mínimo ' + numStr(x.minAprob) + ' de ' + numStr(x.max))
      };
    })) + '</div>';

    var grupos = ZE.applyMinGroup(r.grupos, k);
    var insights = '<div class="card"><h2>Qué significa esto</h2><ul class="insights">' + ZE.cursoInsights(r).map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul></div>';
    html += '<div class="grid-2"><div class="card"><h2>Distribución del rendimiento final</h2>' + ZE.histogram(c.distribucion, null) + '<small>Cantidad de alumnos por tramo de 10 puntos.</small></div>';
    if (grupos.length >= 2) {
      html += '<div class="card"><h2>Por tema</h2>' + ZE.barRows(grupos.map(function (g) {
        return g.reservado ? { label: g.key, value: null, extra: g.complementario ? 'oculto para proteger al grupo más pequeño' : '' } : { label: g.key, value: g.promedio, extra: g.n + ' alumnos' };
      })).replace(/sin datos/g, 'grupo reservado') + '<small>Los temas con menos de ' + k + ' alumnos evaluados se muestran como reservados.</small></div></div>' + insights;
    } else {
      html += insights + '</div>';
    }
    return html + '</div>';
  }

  function visibleList() {
    var r = results();
    var qv = S.search.trim().toLowerCase();
    var qd = qv.replace(/[.\-\s]/g, '');
    var list = r.alumnos.filter(function (a) {
      if (S.filter === 'parcial' && !a.parcial) return false;
      if (S.filter === 'ausencias' && a.asistencia.presentes >= a.asistencia.total) return false;
      if (!qv) return true;
      var idn = idOf(a);
      var hay = [idn.seudonimo];
      if (!S.presentation) hay.push(a.nombre, a.correo, a.id, a.rut);
      return hay.some(function (h) { h = String(h || '').toLowerCase(); return h.indexOf(qv) >= 0 || (qd && h.replace(/[.\-\s]/g, '').indexOf(qd) >= 0); });
    });
    list.sort(function (a, b) {
      if (S.sort === 'nombre') return idOf(a).titulo.localeCompare(idOf(b).titulo, 'es');
      var pa = a.final === null ? -1 : a.final;
      var pb = b.final === null ? -1 : b.final;
      return S.sort === 'asc' ? pa - pb : pb - pa;
    });
    return list;
  }

  function fichaCard(a) {
    var idn = idOf(a);
    var av = S.presentation ? idn.seudonimo.replace(/^A0*/, 'A') : String(idn.titulo).trim().split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0); }).join('').toUpperCase();
    var data = [];
    if (!S.presentation) { if (a.rut) data.push('RUT ' + esc(a.rut)); if (a.correo) data.push(esc(a.correo)); }
    var asist = a.asistencia;
    var tags = '<span class="tag tag-info">Alcanza el mínimo en ' + a.metricasAlcanzadas + ' de ' + a.metricasEvaluadas + ' métricas</span>' +
      '<span class="tag tag-info">Asistencia ' + asist.presentes + ' de ' + asist.total + ' días' + (asist.total ? ' (' + fmt(asist.pct, 0) + ' %)' : '') + '</span>' +
      (a.parcial ? '<span class="tag tag-low">Evaluación parcial · cobertura ' + fmt(a.cobertura, 0) + ' %</span>' : '');
    var dayRows = a.dias.map(function (d) {
      return '<tr><td>' + esc(fd(d.fecha)) + '</td><td>' + esc(d.tema || '—') + '</td><td>' + (d.presente ? 'Presente' : '<span class="ausente">ausente</span>') + '</td><td>' + (d.total === null ? '—' : '<b>' + fmt(d.total) + '</b>') + '</td><td>' + (d.cobertura === null ? '—' : fmt(d.cobertura, 0) + ' %') + '</td></tr>';
    }).join('');
    var metHead = a.dias.map(function (d) { return '<th>' + esc(sd(d.fecha)) + '</th>'; }).join('');
    var usadas = a.metricas.filter(function (x) { return x.usada; });
    var showRef = usadas.some(function (x) { return x.tipo !== 'checklist'; });
    var metRows = usadas.map(function (x) {
      var cells = a.dias.map(function (d) {
        if (!d.presente) return '<td class="ausente">—</td>';
        var s = d.scores.filter(function (z) { return z.metricaId === x.id; })[0];
        if (x.tipo === 'checklist') return '<td>' + (s ? (s.puntaje === 1 ? '<span class="yes">✓</span>' : '<span class="nop">✗</span>') : '·') + '</td>';
        return '<td>' + (s ? numStr(s.puntaje) : '·') + '</td>';
      }).join('');
      if (x.tipo === 'checklist') return '<tr><td><b>' + esc(x.nombre) + '</b></td>' + cells + '<td>' + (x.promedioNorm === null ? '—' : fmt(x.promedioNorm, 0) + ' %') + '</td><td>≥ ' + fmt(x.minAprob * 100, 0) + ' %</td>' + (showRef ? '<td></td>' : '') + '</tr>';
      return '<tr><td><b>' + esc(x.nombre) + '</b></td>' + cells + '<td>' + (x.promedio === null ? '—' : fmt(x.promedio)) + '</td><td>' + numStr(x.minAprob) + ' de ' + numStr(x.max) + '</td><td class="check ' + (x.alcanza === null ? '' : x.alcanza ? 'ok' : 'low') + '">' + (x.alcanza === null ? '—' : x.alcanza ? '✓ alcanza' : 'bajo el mínimo') + '</td></tr>';
    }).join('');
    var pts = a.dias.filter(function (d) { return d.total !== null; });
    var evol = pts.length >= 2 ? '<div class="card"><h2>Evolución del total diario</h2>' + ZE.lineChart(pts.map(function (d) { return { label: sd(d.fecha), value: d.total }; }), null, 'Total diario del alumno') + '</div>' : '';
    var comments = !S.presentation && a.comentarios.length ? '<div class="card"><h2>Comentarios del relator</h2><ul class="comments">' + a.comentarios.map(function (c) { return '<li><b>' + esc(fd(c.fecha)) + ':</b> ' + esc(c.texto) + '</li>'; }).join('') + '</ul></div>' : '';
    return '<div class="card"><div class="ficha-top"><div class="avatar" aria-hidden="true">' + esc(av) + '</div><div><div class="ficha-name">' + esc(idn.titulo) + '</div>' +
      '<div class="ficha-data">' + data.map(function (x) { return '<span>' + x + '</span>'; }).join('') + '</div><div class="tags">' + tags + '</div></div>' +
      '<div class="ficha-score"><div class="num">' + fmt(a.final) + '</div><small>rendimiento final de 100</small></div></div></div>' +
      '<div class="card"><h2>Resultados por día</h2><table class="crit"><thead><tr><th>Fecha</th><th>Tema</th><th>Asistencia</th><th>Total del día</th><th>Cobertura</th></tr></thead><tbody>' + dayRows + '</tbody></table></div>' +
      '<div class="card"><h2>Detalle por métrica</h2><table class="crit"><thead><tr><th>Métrica</th>' + metHead + '<th>Promedio</th><th>Mínimo</th>' + (showRef ? '<th>Referencia</th>' : '') + '</tr></thead><tbody>' + metRows + '</tbody></table></div>' +
      '<div class="ficha-pair">' + evol +
      '<div class="card"><h2>Qué significa esto</h2><ul class="insights">' + ZE.alumnoInsights(a, results()).map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul></div></div>' + comments;
  }

  function viewAlumnos() {
    var list = visibleList();
    if (!list.some(function (a) { return a.id === S.selected; })) S.selected = list[0] ? list[0].id : null;
    var sel = list.filter(function (a) { return a.id === S.selected; })[0];
    var rows = list.map(function (a) {
      var idn = idOf(a);
      return '<button type="button" class="row" data-id="' + esc(a.id) + '" aria-selected="' + (a.id === S.selected) + '"><span>' + esc(idn.titulo) + (a.parcial ? ' <small>parcial</small>' : '') + (a.asistencia.presentes < a.asistencia.total ? ' <small>ausencias</small>' : '') + '</span><span class="score">' + fmt(a.final) + '</span></button>';
    }).join('') || '<p><small>Ningún alumno coincide con la búsqueda o el filtro.</small></p>';
    return '<div class="students"><div class="card list-col no-print"><div class="list-tools">' +
      '<input class="search" id="search" type="search" placeholder="Buscar alumno" aria-label="Buscar alumno" value="' + esc(S.search) + '" data-key="search">' +
      '<select id="filter" aria-label="Filtrar">' + [['todos', 'Todos'], ['parcial', 'Evaluación parcial'], ['ausencias', 'Con ausencias']].map(function (o) { return '<option value="' + o[0] + '"' + (S.filter === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
      '<select id="sort" aria-label="Ordenar">' + [['desc', 'Mayor rendimiento'], ['asc', 'Menor rendimiento'], ['nombre', 'Nombre']].map(function (o) { return '<option value="' + o[0] + '"' + (S.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
      '<button type="button" class="btn ghost" data-action="print-all">Imprimir todas las fichas (' + list.length + ')</button></div><div class="list">' + rows + '</div></div>' +
      '<div class="stack" id="ficha-view"><div class="only-mobile no-print"><button type="button" class="btn ghost" data-action="to-list">← Lista de alumnos</button></div>' + (sel ? reportHead('Ficha de rendimiento', S.model.curso.curso || 'Curso sin nombre', true) : '') +
      (sel ? fichaCard(sel) : '<div class="card"><p>Selecciona un alumno de la lista.</p></div>') + '</div></div>';
  }

  function buildPrintAll() {
    var list = visibleList();
    $('print-all').innerHTML = list.map(function (a) {
      return '<section class="print-page"><div class="stack">' + reportHead('Ficha de rendimiento', S.model.curso.curso || 'Curso sin nombre') + fichaCard(a) + '</div></section>';
    }).join('');
    document.body.classList.add('printing-all');
  }

  // ------------------------------------------------------------------ actions on the model
  function mutate(res, onFail) {
    if (res.ok) { changed(); return true; }
    if (onFail) onFail(res); else toast(res.error);
    return false;
  }

  async function confirmCourse() {
    if (!S.model.alumnos.length) { toast('Agrega al menos un alumno para continuar.'); return; }
    S.confirmed = true;
    S.step = 2;
    if (adapter.supportsWrite && !P.getState().hasFile) {
      var r = await P.save(suggestedName());
      if (r && r.cancelled) toast('Seguiremos sin guardar. Puedes elegir dónde guardar con "Guardar como…".');
    }
    render();
    window.scrollTo(0, 0);
  }

  function obj(k, v) { var o = {}; o[k] = v; return o; }

  async function onScreenChange(e) {
    var t = e.target;
    var m = S.model;
    if (!m) return;
    if (t.id === 'filter') { S.filter = t.value; rerender(); return; }
    if (t.id === 'sort') { S.sort = t.value; rerender(); return; }
    if (t.hasAttribute('data-curso')) { ZE.setCurso(m, obj(t.getAttribute('data-curso'), t.value)); changed(); return; }
    if (t.hasAttribute('data-al')) { mutate(ZE.updateAlumno(m, t.getAttribute('data-al'), obj(t.getAttribute('data-field'), t.value)), function (r) { toast(r.error); rerender(); }); return; }
    if (t.hasAttribute('data-fecha')) {
      var old = t.getAttribute('data-fecha');
      var patch = obj(t.getAttribute('data-field'), t.value);
      if (mutate(ZE.updateFecha(m, old, patch), function (r) { toast(r.error); rerender(); })) { if (S.fecha === old && patch.fecha) S.fecha = patch.fecha; rerender(); }
      return;
    }
    if (t.hasAttribute('data-asis-a')) {
      var a = t.getAttribute('data-asis-a');
      var f = t.getAttribute('data-asis-f');
      var r1 = ZE.setAsistencia(m, a, f, t.checked);
      if (r1.needsConfirm) {
        t.checked = true;
        if (await confirmBox('El alumno ya tiene puntajes ese día', r1.message, 'Quitar asistencia y eliminar puntajes')) { ZE.setAsistencia(m, a, f, false, { confirm: true }); changed(); }
      } else if (r1.ok) changed(); else toast(r1.error);
      rerender();
      return;
    }
    if (t.hasAttribute('data-daymet')) {
      var fday = activeFecha();
      var ids = qa('[data-daymet]').filter(function (c) { return c.checked; }).map(function (c) { return c.getAttribute('data-daymet'); });
      S.dayPanelOpen = true;
      var rd = ZE.setMetricasDelDia(m, fday, ids);
      if (rd.needsConfirm) {
        if (await confirmBox('Dejar de evaluar métricas ese día', rd.message, 'Quitar métricas y eliminar puntajes')) { ZE.setMetricasDelDia(m, fday, ids, { confirm: true }); changed(); }
      } else if (rd.ok) changed(); else toast(rd.error);
      rerender();
      return;
    }
    if (t.id === 'own-min' || t.id === 'own-max') {
      var lo = ZE.toNum(($('own-min') || {}).value), hi = ZE.toNum(($('own-max') || {}).value), ma = $('own-ma');
      if (ma && lo !== null && hi !== null && !Number.isNaN(lo) && !Number.isNaN(hi) && hi > lo) ma.value = String(Math.round((lo + 0.6 * (hi - lo)) * 100) / 100).replace('.', ',');
      return;
    }
    if (t.name === 'own-tipo') { var nm = $('own-name'); S.ownName = nm ? nm.value : ''; S.ownTipo = t.value; rerender(); return; }
    if (t.id === 'puntos-base') {
      var rb = ZE.setPuntosBase(m, t.value);
      S.baseErr = rb.ok ? '' : rb.error;
      if (rb.ok) changed();
      rerender();
      return;
    }
    if (t.hasAttribute('data-met')) {
      var id = t.getAttribute('data-met');
      var field = t.getAttribute('data-field');
      var val = field === 'activa' ? t.checked : (field === 'peso' ? (t.value.trim() === '' ? null : t.value.trim()) : t.value);
      if (t.hasAttribute('data-pct')) { var pn = Number(String(t.value).replace('%', '').replace(',', '.').trim()); val = t.value.trim() === '' ? '' : (Number.isNaN(pn) ? 'x' : String(pn / 100)); }
      var rm = ZE.updateMetrica(m, id, obj(field, val));
      if (rm.ok) { delete S.metricErrors[id]; changed(); } else S.metricErrors[id] = rm.error;
      rerender();
      return;
    }
    if (t.classList && t.classList.contains('cell')) { commitCell(t); return; }
    if (t.classList && t.classList.contains('cell-ck')) { commitCheck(t); return; }
    if (t.hasAttribute('data-com')) { var rc = ZE.setComentario(m, t.getAttribute('data-com'), t.getAttribute('data-f'), t.value); if (rc.ok) changed(); return; }
  }

  function commitCell(input) {
    var m = S.model;
    var a = input.getAttribute('data-a');
    var f = input.getAttribute('data-f');
    var mid = input.getAttribute('data-m');
    var met = ZE.metricaById(m, mid);
    var r = ZE.setPuntaje(m, a, f, mid, input.value);
    var box = $('cell-msg');
    if (!r.ok) {
      input.classList.add('invalid');
      input.title = r.error;
      S.cellMsg = (ZE.alumnoById(m, a) ? ZE.alumnoById(m, a).nombre : '') + ' · ' + (met ? met.nombre : '') + ': ' + r.error;
      if (box) box.textContent = S.cellMsg;
      return false;
    }
    input.classList.remove('invalid');
    input.classList.remove('copied');
    delete S.copied[a + '|' + f + '|' + mid];
    var cn = $('copied-note'); if (cn) cn.innerHTML = copiedNote(f);
    input.title = '';
    S.cellMsg = '';
    if (box) box.textContent = '';
    if (r.value !== null) input.value = numStr(r.value);
    input.classList.toggle('below', r.value !== null && !!met && r.value < met.minAprob);
    var tot = ZE.dailyTotalFor(m, a, f);
    var cell = q('[data-tot="' + a.replace(/"/g, '\\"') + '"]');
    if (cell) cell.innerHTML = tot.total === null ? '<span class="pend">pendiente</span>' : fmt(tot.total);
    var pres = ZE.presentes(m, f);
    var evald = pres.filter(function (x) { return ZE.dailyTotalFor(m, x.id, f).scored > 0; }).length;
    var pr = $('progress');
    if (pr) pr.innerHTML = '<b>' + evald + '</b> de ' + pres.length + ' presentes evaluados';
    changed();
    return true;
  }

  function commitCheck(input) {
    var m = S.model;
    var a = input.getAttribute('data-a');
    var f = input.getAttribute('data-f');
    var mid = input.getAttribute('data-m');
    var r = ZE.setPuntaje(m, a, f, mid, input.checked ? 1 : 0);
    if (!r.ok) { input.checked = !input.checked; toast(r.error); return false; }
    var lab = input.closest('label');
    if (lab) { lab.classList.toggle('no', !input.checked); lab.classList.toggle('si', input.checked); var tx = lab.querySelector('.ck-txt'); if (tx) tx.textContent = input.checked ? 'Cumple' : 'No cumple'; }
    var tot = ZE.dailyTotalFor(m, a, f);
    var cell = q('[data-tot="' + a.replace(/"/g, '\\"') + '"]');
    if (cell) cell.innerHTML = tot.total === null ? '<span class="pend">pendiente</span>' : fmt(tot.total);
    var dn = $('desc-note'); if (dn) dn.innerHTML = descNote(f);
    changed();
    return true;
  }

  function focusCell(input, dRow) {
    var col = qa('input.cell[data-m="' + input.getAttribute('data-m') + '"]');
    var i = col.indexOf(input) + dRow;
    if (i >= 0 && i < col.length) { col[i].focus(); col[i].select(); }
  }

  async function onScreenClick(e) {
    var m = S.model;
    var t = e.target.closest('[data-go],[data-action],.row,[data-view]');
    if (!t) return;
    if (t.hasAttribute('data-go')) { go(Number(t.getAttribute('data-go'))); return; }
    if (t.classList.contains('row')) {
      S.selected = t.getAttribute('data-id');
      rerender();
      if (window.innerWidth <= 960) { var fv = $('ficha-view'); if (fv) fv.scrollIntoView({ block: 'start' }); }
      return;
    }
    if (t.hasAttribute('data-view')) { S.view = t.getAttribute('data-view'); render(); return; }
    var act = t.getAttribute('data-action');
    if (act === 'to-list') { var lc = q('.list-col'); if (lc) lc.scrollIntoView({ block: 'start' }); return; }
    if (act === 'recover-draft') { recoverDraft(); return; }
    if (act === 'discard-draft') { discardDraft(); return; }
    if (act === 'open-saved') { openSaved(); return; }
    if (act === 'new-blank') { newBlank(); return; }
    if (act === 'continue-last') { continueLast(); return; }
    if (!m) return;
    if (act === 'confirm-course') { confirmCourse(); return; }
    if (act === 'add-al') {
      if (mutate(ZE.addAlumno(m, { nombre: $('new-al-nombre').value, rut: $('new-al-rut').value, correo: $('new-al-correo').value }))) { render(); var nn = $('new-al-nombre'); if (nn) nn.focus(); }
      return;
    }
    if (act === 'rm-al') {
      var id = t.getAttribute('data-id');
      var r = ZE.removeAlumno(m, id);
      if (r.needsConfirm) { if (await confirmBox('Quitar alumno', r.message, 'Quitar alumno')) { ZE.removeAlumno(m, id, { confirm: true }); changed(); render(); } }
      else if (r.ok) { changed(); render(); } else toast(r.error);
      return;
    }
    if (act === 'add-fecha') {
      var last = m.fechas.length ? m.fechas[m.fechas.length - 1].fecha : (ZE.isIsoDate(m.curso.fecha) ? m.curso.fecha : null);
      var cand = last ? (m.fechas.length ? addDays(last, 1) : last) : todayIso();
      while (ZE.fechaObj(m, cand)) cand = addDays(cand, 1);
      if (mutate(ZE.addFecha(m, cand, ''))) { if (!S.fecha) S.fecha = cand; render(); }
      return;
    }
    if (act === 'rm-fecha') {
      var f = t.getAttribute('data-fecha');
      var rf = ZE.removeFecha(m, f);
      if (rf.needsConfirm) { if (await confirmBox('Quitar la fecha ' + fd(f), rf.message, 'Quitar fecha')) { ZE.removeFecha(m, f, { confirm: true }); changed(); render(); } }
      else if (rf.ok) { changed(); render(); } else toast(rf.error);
      return;
    }
    if (act === 'all-on') { if (mutate(ZE.marcarTodos(m, t.getAttribute('data-fecha'), true))) render(); return; }
    if (act === 'add-grupo' || act === 'add-cat') {
      var cat = ZE.catalogo;
      var g = cat.grupos[Number(t.getAttribute('data-g'))];
      var items = act === 'add-grupo' ? g.metricas : [g.metricas[Number(t.getAttribute('data-x'))]];
      var res = ZE.addMetricasDesdeCatalogo(m, items.map(function (x) { return { nombre: x.nombre, descripcion: x.descripcion, grupo: g.nombre, tipo: x.tipo || cat.tipo }; }), cat.escala);
      changed();
      render();
      toast(res.agregadas + (res.agregadas === 1 ? ' métrica agregada' : ' métricas agregadas') + (res.omitidas ? ' (' + res.omitidas + ' ya estaban)' : '') + '.');
      return;
    }
    if (act === 'add-own') {
      var tp = S.ownTipo === 'escala' ? 'escala' : 'checklist';
      var r2 = ZE.addMetrica(m, { nombre: $('own-name').value, tipo: tp, min: tp === 'escala' ? $('own-min').value : 0, max: tp === 'escala' ? $('own-max').value : 1, minAprob: tp === 'escala' ? $('own-ma').value : '', peso: null, activa: true });
      if (r2.ok) { S.ownName = ''; changed(); render(); } else toast(r2.error);
      return;
    }
    if (act === 'rm-met') {
      var mid = t.getAttribute('data-id');
      var rr = ZE.removeMetrica(m, mid);
      if (rr.needsConfirm) {
        var mn = ZE.metricaById(m, mid);
        if (await confirmBox('Quitar la métrica «' + (mn ? mn.nombre : '') + '»', rr.message, 'Quitar y eliminar puntajes')) { ZE.removeMetrica(m, mid, { confirm: true }); delete S.metricErrors[mid]; changed(); render(); }
        return;
      }
      if (rr.ok) { changed(); render(); } else { S.metricErrors[mid] = rr.error; render(); }
      return;
    }
    if (act === 'day-all' || act === 'day-group') {
      var fd2 = activeFecha();
      var want = act === 'day-all' ? null : ZE.metricasActivas(m).filter(function (x) { return x.grupo === t.getAttribute('data-grupo'); }).map(function (x) { return x.id; });
      S.dayPanelOpen = true;
      var rg = ZE.setMetricasDelDia(m, fd2, want);
      if (rg.needsConfirm) { if (await confirmBox('Dejar de evaluar métricas ese día', rg.message, 'Quitar métricas y eliminar puntajes')) { ZE.setMetricasDelDia(m, fd2, want, { confirm: true }); changed(); } }
      else if (rg.ok) changed(); else toast(rg.error);
      render();
      return;
    }
    if (act === 'ck-all' || act === 'ck-none') {
      var f4 = activeFecha();
      var val = act === 'ck-all';
      var rk = ZE.marcarChecklistDelDia(m, f4, val);
      if (rk.needsConfirm) {
        if (await confirmBox(val ? 'Marcar todos como Cumple' : 'Desmarcar todos', rk.message, val ? 'Marcar todos' : 'Desmarcar todos')) rk = ZE.marcarChecklistDelDia(m, f4, val, { confirm: true }); else return;
      }
      if (rk.ok && rk.cambiadas) changed();
      rerender();
      return;
    }
    if (act === 'copy-prev') {
      var f3 = activeFecha();
      var rc = ZE.traerDelDiaAnterior(m, f3);
      if (!rc.ok) { toast(rc.error); return; }
      rc.keys.forEach(function (k) { S.copied[k] = true; });
      if (rc.copiadas) changed();
      rerender();
      toast(rc.copiadas ? 'Se copiaron ' + rc.copiadas + ' puntajes del ' + fd(rc.desde).slice(0, 5) + '. Revísalos y corrige lo que cambió.' : 'No había nada que copiar: las celdas ya tenían puntaje o el día anterior no evaluó estas métricas.');
      return;
    }
    if (act === 'pick-fecha') { S.fecha = t.getAttribute('data-fecha'); S.cellMsg = ''; render(); return; }
    if (act === 'print-all') { buildPrintAll(); window.print(); return; }
  }

  function onGridKey(e) {
    var t = e.target;
    if (t.classList && t.classList.contains('fill')) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      var rf = ZE.rellenarVacias(S.model, activeFecha(), t.getAttribute('data-fill'), t.value);
      if (!rf.ok) { t.classList.add('invalid'); S.cellMsg = rf.error; var bx = $('cell-msg'); if (bx) bx.textContent = rf.error; return; }
      S.cellMsg = '';
      if (rf.llenadas) changed();
      rerender();
      toast(rf.llenadas ? 'Se rellenaron ' + rf.llenadas + ' celdas vacías.' : 'No había celdas vacías en esa columna.');
      return;
    }
    if (t.classList && t.classList.contains('cell-ck')) {
      var dr = e.key === 'ArrowDown' || (e.key === 'Enter' && !e.shiftKey) ? 1 : (e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey)) ? -1 : 0;
      if (dr) {
        e.preventDefault();
        var colk = qa('input.cell-ck[data-m="' + t.getAttribute('data-m') + '"]');
        var ik = colk.indexOf(t) + dr;
        if (ik >= 0 && ik < colk.length) colk[ik].focus();
      }
      return;
    }
    if (!t.classList || !t.classList.contains('cell')) return;
    if (e.key === 'Enter') { e.preventDefault(); commitCell(t); focusCell(t, e.shiftKey ? -1 : 1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); commitCell(t); focusCell(t, 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); commitCell(t); focusCell(t, -1); }
  }

  // ------------------------------------------------------------------ events
  var screen = $('screen');
  screen.addEventListener('change', onScreenChange);
  screen.addEventListener('click', onScreenClick);
  screen.addEventListener('keydown', onGridKey);
  screen.addEventListener('toggle', function (e) { if (e.target.id === 'day-metrics') S.dayPanelOpen = e.target.open; }, true);
  screen.addEventListener('input', function (e) { if (e.target.id === 'search') { S.search = e.target.value; rerender(); } });
  $('stepper').addEventListener('click', function (e) { var b = e.target.closest('[data-step]'); if (b) go(Number(b.getAttribute('data-step'))); });
  $('btn-save').addEventListener('click', async function () {
    if (!S.model) return;
    var r = await P.save(suggestedName());
    if (r && r.ok === false && r.error) toast(r.error);
    if (r && r.cancelled) toast('No se guardó: no elegiste un archivo.');
  });
  $('btn-open').addEventListener('click', openSaved);
  $('btn-new').addEventListener('click', newBlank);
  $('presentation').addEventListener('change', function (e) { S.presentation = e.target.checked; render(); });
  $('print').addEventListener('click', function () { window.print(); });
  window.addEventListener('afterprint', function () { document.body.classList.remove('printing-all'); $('print-all').innerHTML = ''; });
  window.addEventListener('beforeunload', function (e) { if (P.hasUnsaved()) { e.preventDefault(); e.returnValue = ''; } });

  // drop zone and file input (delegated: the start screen is re-rendered)
  document.addEventListener('dragover', function (e) { e.preventDefault(); var d = $('drop'); if (d) d.classList.add('over'); });
  document.addEventListener('dragleave', function () { var d = $('drop'); if (d) d.classList.remove('over'); });
  document.addEventListener('drop', function (e) { e.preventDefault(); var d = $('drop'); if (d) d.classList.remove('over'); if (e.dataTransfer && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); });
  document.addEventListener('change', function (e) { if (e.target.id === 'file') { handleFile(e.target.files[0]); e.target.value = ''; } });
  document.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target.id === 'drop') { e.preventDefault(); if (adapter.supportsWrite) openSaved(); else $('file').click(); } });
  document.addEventListener('click', function (e) { var d = e.target.closest ? e.target.closest('#drop') : null; if (d && adapter.supportsWrite) { e.preventDefault(); openSaved(); } });

  // layout-check shortcuts for the hosted site: ?demo=evaluacion|ingreso|prt (loads the fictitious example)
  (function demo() {
    var mm = /[?&]demo=(evaluacion|ingreso|prt)/.exec(location.search);
    if (!mm) return;
    var url = mm[1] === 'ingreso' ? 'plantilla/plantilla-ingreso-FICTICIA.xlsx' : mm[1] === 'prt' ? 'ejemplos/evaluacion-prt-ejemplo-FICTICIA.xlsx' : 'ejemplos/evaluacion-ejemplo-FICTICIA.xlsx';
    fetch(url).then(function (r) { return r.arrayBuffer(); }).then(function (buf) {
      loadBytes(new Uint8Array(buf), url, false);
      var st = /[?&]step=([1-5])/.exec(location.search);
      if (st && S.model) { S.confirmed = true; S.step = Number(st[1]); }
      if (/[?&]pii=1/.test(location.search)) S.presentation = false;
      if (/[?&]view=alumnos/.test(location.search)) S.view = 'alumnos';
      render();
      if (/[?&]print=todas/.test(location.search) && S.model) { S.step = 5; S.view = 'alumnos'; render(); buildPrintAll(); }
    }).catch(function () { /* from disk (file://) the example cannot be fetched: use the download links */ });
  })();

  // a draft left by a closed tab or phone browser
  Promise.resolve(adapter.draft ? adapter.draft.load() : null).then(function (d) { if (d) { S.draftInfo = d; if (!S.model) render(); } }).catch(function () { /* optional */ });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') P.flushDraft(); });
  window.addEventListener('pagehide', function () { P.flushDraft(); });

  // remembered file (name only) for the "Continuar" button
  Promise.resolve(adapter.recall ? adapter.recall() : null).then(function (r) { if (r && r.name) { S.recalled = r; if (!S.model) render(); } }).catch(function () { /* optional */ });

  render();

  // expose for manual checks in the browser console
  ZE._S = S;
  ZE._P = P;
})();
