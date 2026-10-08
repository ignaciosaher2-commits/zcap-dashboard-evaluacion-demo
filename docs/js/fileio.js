/* Evaluation file: writes the model to an .xlsx (version 2.1.0) and reads it back, plus the legacy 1.x reader.
 * Pure functions: the SheetJS namespace is passed in, so it works in the browser and in Node tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./validate.js'), require('./model.js'));
  } else {
    root.ZE = root.ZE || {};
    Object.assign(root.ZE, factory(root.ZE, root.ZE));
  }
}(typeof self !== 'undefined' ? self : this, function (V, M) {
  'use strict';

  const FILE_VERSION = '2.1.0';
  const isEmpty = function (v) { return v === null || v === undefined || v === ''; };
  const text = function (v) { return isEmpty(v) ? '' : String(v).trim(); };
  const yes = function (v) { return /^(si|sí|s|1|true|x|presente)$/i.test(text(v)); };

  const REQUIRED = {
    Parametros: ['parametro', 'valor'],
    Criterios: ['id_criterio', 'nombre', 'escala_min', 'escala_max', 'minimo_aprobacion', 'activo'],
    Alumnos: ['id_alumno', 'nombre_alumno'],
    Dias: ['fecha'],
    Asistencia: ['id_alumno', 'fecha', 'presente'],
    Evaluaciones: ['fecha', 'id_alumno', 'id_criterio', 'puntaje']
  };

  // ------------------------------------------------------------------ writing
  function buildWorkbook(XLSX, model) {
    const wb = XLSX.utils.book_new();
    const add = function (name, rows, widths) {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      if (widths) ws['!cols'] = widths.map(function (w) { return { wch: w }; });
      XLSX.utils.book_append_sheet(wb, ws, name);
    };
    add('Curso', [['campo', 'valor']].concat(M.CURSO_KEYS.map(function (k) { return [k, model.curso[k] || '']; })), [18, 60]);
    add('Parametros', [
      ['parametro', 'valor', 'descripcion'],
      ['plantilla_version', FILE_VERSION, 'No modificar'],
      ['nombre_curso', model.curso.curso || '', 'Nombre del curso que aparece en los informes'],
      ['tamano_minimo_grupo', model.config.tamano_minimo_grupo, 'Los grupos con menos alumnos se muestran como reservados'],
      ['puntos_base', model.config.puntos_base || 0, '% base: mínimo garantizado del puntaje diario (0 a 99); 0 = sin base']
    ], [22, 40, 60]);
    add('Criterios', [['id_criterio', 'nombre', 'descripcion', 'grupo', 'peso', 'escala_min', 'escala_max', 'minimo_aprobacion', 'activo', 'tipo']].concat(
      model.metricas.map(function (m) { return [m.id, m.nombre, m.descripcion, m.grupo, m.peso === null ? '' : m.peso, m.min, m.max, m.minAprob, m.activa ? 'SI' : 'NO', m.tipo || 'escala']; })), [12, 34, 50, 28, 8, 11, 11, 18, 8, 11]);
    add('Alumnos', [['id_alumno', 'nombre_alumno', 'rut_alumno', 'correo_alumno']].concat(
      model.alumnos.map(function (a) { return [a.id, a.nombre, a.rut, a.correo]; })), [12, 34, 14, 34]);
    add('Dias', [['fecha', 'tema', 'metricas']].concat(model.fechas.map(function (f) { return [f.fecha, f.tema, f.metricas ? f.metricas.join(';') : '']; })), [12, 40, 40]);
    const asis = [['id_alumno', 'fecha', 'presente']];
    model.alumnos.forEach(function (a) {
      model.fechas.forEach(function (f) { asis.push([a.id, f.fecha, M.estaPresente(model, a.id, f.fecha) ? 'SI' : 'NO']); });
    });
    add('Asistencia', asis, [12, 12, 10]);
    const ev = [['fecha', 'id_alumno', 'nombre_alumno', 'rut_alumno', 'correo_alumno', 'curso', 'modulo', 'id_criterio', 'puntaje']];
    model.fechas.forEach(function (f) {
      model.alumnos.forEach(function (a) {
        model.metricas.forEach(function (m) {
          const p = M.getPuntaje(model, a.id, f.fecha, m.id);
          if (p !== null) ev.push([f.fecha, a.id, a.nombre, a.rut, a.correo, model.curso.curso || '', f.tema, m.id, p]);
        });
      });
    });
    add('Evaluaciones', ev, [12, 12, 34, 14, 34, 30, 28, 12, 9]);
    const com = [['id_alumno', 'fecha', 'comentario']];
    Object.keys(model.comentarios).forEach(function (k) { const p = k.split('|'); com.push([p[0], p[1], model.comentarios[k]]); });
    add('Comentarios', com, [12, 12, 80]);
    return wb;
  }

  function toBytes(XLSX, model) {
    return new Uint8Array(XLSX.write(buildWorkbook(XLSX, model), { bookType: 'xlsx', type: 'array' }));
  }

  // ------------------------------------------------------------------ reading
  function paramMap(raw) {
    const p = {};
    ((raw.sheets.Parametros || { rows: [] }).rows).forEach(function (r) { if (!isEmpty(r.parametro)) p[String(r.parametro).trim().toLowerCase()] = r.valor; });
    return p;
  }

  function fileKind(raw) {
    if (!raw.sheets.Criterios || !raw.sheets.Evaluaciones) return null;
    const v = V.parseVersion(paramMap(raw).plantilla_version);
    if (v && v[0] === 2) return 'v2';
    return 'v1';
  }

  function parseV2(raw) {
    const res = { fatal: [], errors: [], warnings: [], notas: [], model: null, kind: 'v2' };
    const err = function (sheet, row, column, message) { res.errors.push({ sheet: sheet, row: row, column: column, message: message }); };
    const warn = function (sheet, row, column, message) { res.warnings.push({ sheet: sheet, row: row, column: column, message: message }); };
    Object.keys(REQUIRED).forEach(function (sheet) {
      const s = raw.sheets[sheet];
      if (!s) { res.fatal.push('Falta la hoja ' + sheet + '. Abre un archivo de evaluación guardado por esta página.'); return; }
      REQUIRED[sheet].forEach(function (col) { if (s.headers.indexOf(col) < 0) res.fatal.push('Falta la columna ' + col + ' en la hoja ' + sheet + '.'); });
    });
    if (res.fatal.length) return res;
    const ver = V.parseVersion(paramMap(raw).plantilla_version);
    if (!ver || ver[0] !== 2) { res.fatal.push('La versión del archivo no es compatible (se necesita 2.x).'); return res; }

    const model = M.createModel();
    const p = paramMap(raw);
    const curso = {};
    ((raw.sheets.Curso || { rows: [] }).rows).forEach(function (r) { if (!isEmpty(r.campo)) curso[String(r.campo).trim()] = text(r.valor); });
    M.CURSO_KEYS.forEach(function (k) { model.curso[k] = curso[k] || ''; });
    if (!model.curso.curso && !isEmpty(p.nombre_curso)) model.curso.curso = text(p.nombre_curso);
    const tmg = M.toNum(p.tamano_minimo_grupo);
    if (tmg !== null && !Number.isNaN(tmg) && tmg >= 1) model.config.tamano_minimo_grupo = Math.floor(tmg);
    if (!isEmpty(p.puntos_base)) {
      const pb = M.setPuntosBase(model, p.puntos_base);
      if (!pb.ok) warn('Parametros', null, 'puntos_base', pb.error + ' Se usó 0.');
    }

    // metrics
    const ids = new Set();
    raw.sheets.Criterios.rows.forEach(function (r) {
      const id = text(r.id_criterio);
      if (!id) { err('Criterios', r._row, 'id_criterio', 'Falta el identificador de la métrica.'); return; }
      if (ids.has(id)) { err('Criterios', r._row, 'id_criterio', 'El identificador ' + id + ' está repetido.'); return; }
      const res1 = M.addMetrica(model, {
        id: id, nombre: r.nombre, descripcion: r.descripcion, grupo: r.grupo, tipo: text(r.tipo).toLowerCase(),
        min: r.escala_min, max: r.escala_max, minAprob: r.minimo_aprobacion, peso: isEmpty(r.peso) ? null : r.peso,
        activa: isEmpty(r.activo) ? true : yes(r.activo)
      });
      if (!res1.ok) { err('Criterios', r._row, 'nombre', res1.error); return; }
      ids.add(id);
    });
    // students
    raw.sheets.Alumnos.rows.forEach(function (r) {
      const id = text(r.id_alumno);
      if (!id) { err('Alumnos', r._row, 'id_alumno', 'Falta el identificador del alumno.'); return; }
      if (M.alumnoById(model, id)) { err('Alumnos', r._row, 'id_alumno', 'El alumno ' + id + ' está repetido.'); return; }
      const rr = M.addAlumno(model, { id: id, nombre: r.nombre_alumno, rut: r.rut_alumno, correo: r.correo_alumno });
      if (!rr.ok) err('Alumnos', r._row, 'nombre_alumno', rr.error);
    });
    // dates
    raw.sheets.Dias.rows.forEach(function (r) {
      const d = V.parseDateValue(r.fecha);
      if (!d.iso) { err('Dias', r._row, 'fecha', 'La fecha no es válida.'); return; }
      const rr = M.addFecha(model, d.iso, text(r.tema));
      if (!rr.ok) { err('Dias', r._row, 'fecha', rr.error); return; }
      const ids = text(r.metricas).split(/[;,]/).map(function (x) { return x.trim(); }).filter(function (x) { return x && M.metricaById(model, x); });
      if (ids.length) M.fechaObj(model, d.iso).metricas = ids;
    });
    // attendance
    raw.sheets.Asistencia.rows.forEach(function (r) {
      const d = V.parseDateValue(r.fecha);
      const id = text(r.id_alumno);
      if (!d.iso || !M.fechaObj(model, d.iso) || !M.alumnoById(model, id)) { warn('Asistencia', r._row, 'id_alumno', 'Fila de asistencia sin alumno o fecha conocidos; se ignoró.'); return; }
      if (yes(r.presente)) model.asistencia[id + '|' + d.iso] = true;
    });
    // scores
    const seen = new Set();
    raw.sheets.Evaluaciones.rows.forEach(function (r) {
      const d = V.parseDateValue(r.fecha);
      const id = text(r.id_alumno);
      const mid = text(r.id_criterio);
      if (!d.iso || !M.fechaObj(model, d.iso)) { err('Evaluaciones', r._row, 'fecha', 'La fecha no corresponde a ninguna fecha de clases.'); return; }
      if (!M.alumnoById(model, id)) { err('Evaluaciones', r._row, 'id_alumno', 'El alumno ' + id + ' no está en la lista de alumnos.'); return; }
      if (!M.metricaById(model, mid)) { err('Evaluaciones', r._row, 'id_criterio', 'La métrica ' + mid + ' no existe en la hoja Criterios.'); return; }
      if (isEmpty(r.puntaje)) { warn('Evaluaciones', r._row, 'puntaje', 'La fila no tiene puntaje y se ignoró.'); return; }
      if (!M.estaPresente(model, id, d.iso)) { warn('Evaluaciones', r._row, 'id_alumno', 'El alumno no figura presente ese día; se ignoró el puntaje.'); return; }
      const m = M.metricaById(model, mid);
      const was = m.activa;
      m.activa = true; // reading must keep scores of inactive metrics
      const rr = M.setPuntaje(model, id, d.iso, mid, r.puntaje);
      m.activa = was;
      if (!rr.ok) { err('Evaluaciones', r._row, 'puntaje', rr.error); return; }
      const key = id + '|' + d.iso + '|' + mid;
      if (seen.has(key)) warn('Evaluaciones', r._row, 'puntaje', 'Fila duplicada (mismo alumno, métrica y fecha); se usó la última.');
      seen.add(key);
    });
    // comments
    ((raw.sheets.Comentarios || { rows: [] }).rows).forEach(function (r) {
      const d = V.parseDateValue(r.fecha);
      const id = text(r.id_alumno);
      if (d.iso && M.alumnoById(model, id) && M.fechaObj(model, d.iso) && text(r.comentario)) model.comentarios[id + '|' + d.iso] = text(r.comentario);
    });
    res.model = model;
    return res;
  }

  /** Converts a validated 1.x file (see validate.js) into a model. The old global threshold becomes each metric's minimum. */
  function modelFromV1(val) {
    const model = M.createModel();
    const data = val.data;
    model.curso.curso = data.parametros.nombre_curso || '';
    model.config.tamano_minimo_grupo = data.parametros.tamano_minimo_grupo;
    const umbral = data.parametros.umbral_logro;
    data.criteriosTodos.forEach(function (c) {
      const ma = Math.round((c.escala_min + umbral / 100 * (c.escala_max - c.escala_min)) * 100) / 100;
      M.addMetrica(model, { id: c.id_criterio, nombre: c.nombre, min: c.escala_min, max: c.escala_max, minAprob: ma, peso: c.peso, activa: c.activo });
    });
    data.alumnos.forEach(function (a) { M.addAlumno(model, { id: a.id, nombre: a.nombre || a.id, rut: a.rut, correo: a.correo }); });
    const temas = {};
    let sinFecha = 0;
    data.evaluaciones.forEach(function (e) {
      if (!e.fecha) { sinFecha++; return; }
      if (!M.alumnoById(model, e.id_alumno)) M.addAlumno(model, { id: e.id_alumno, nombre: e.id_alumno });
      if (!M.fechaObj(model, e.fecha)) M.addFecha(model, e.fecha, '');
      if (e.modulo) { temas[e.fecha] = temas[e.fecha] || {}; temas[e.fecha][e.modulo] = (temas[e.fecha][e.modulo] || 0) + 1; }
    });
    Object.keys(temas).forEach(function (f) {
      const best = Object.keys(temas[f]).sort(function (a, b) { return temas[f][b] - temas[f][a]; })[0];
      M.updateFecha(model, f, { tema: best });
    });
    const coment = {};
    data.evaluaciones.forEach(function (e) {
      if (!e.fecha) return;
      model.asistencia[e.id_alumno + '|' + e.fecha] = true;
      const m = M.metricaById(model, e.id_criterio);
      if (!m) return;
      const was = m.activa;
      m.activa = true;
      M.setPuntaje(model, e.id_alumno, e.fecha, e.id_criterio, e.puntaje);
      m.activa = was;
      if (e.comentario) { const k = e.id_alumno + '|' + e.fecha; coment[k] = coment[k] || []; if (coment[k].indexOf(e.comentario) < 0) coment[k].push(e.comentario); }
    });
    Object.keys(coment).forEach(function (k) { model.comentarios[k] = coment[k].join(' · '); });
    return { model: model, sinFecha: sinFecha };
  }

  function parseV1(raw) {
    const val = V.validate(raw);
    const res = { fatal: val.fatal.slice(), errors: val.errors.slice(), warnings: val.warnings.slice(), notas: [], model: null, kind: 'v1', stats: val.stats };
    if (res.fatal.length) return res;
    const c = modelFromV1(val);
    res.model = c.model;
    res.notas.push('Archivo de versión 1.x: se abrió como evaluación. La asistencia se dedujo de los puntajes y el mínimo de cada métrica se calculó con el umbral del archivo. Al guardar se creará un archivo nuevo versión ' + FILE_VERSION + '.');
    if (c.sinFecha) res.warnings.push({ sheet: 'Evaluaciones', row: null, column: 'fecha', message: c.sinFecha + ' filas con fecha ambigua no se incluyeron (no se sabe a qué día pertenecen).' });
    return res;
  }

  /** @param {object} raw output of readWorkbook */
  function readEvaluationFile(raw) {
    const kind = fileKind(raw);
    if (!kind) return { fatal: ['Este archivo no es una evaluación: faltan las hojas Criterios y Evaluaciones.'], errors: [], warnings: [], notas: [], model: null, kind: null };
    return kind === 'v2' ? parseV2(raw) : parseV1(raw);
  }

  return { FILE_VERSION: FILE_VERSION, buildWorkbook: buildWorkbook, toBytes: toBytes, readEvaluationFile: readEvaluationFile, fileKind: fileKind, modelFromV1: modelFromV1 };
}));
