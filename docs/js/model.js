/* In-memory evaluation model and its rules (pure functions, no DOM).
 * Operations return {ok:true,...} or {ok:false,error,...}. Destructive operations need {confirm:true}
 * and otherwise return {ok:false,needsConfirm:true,message,...}. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ZE = root.ZE || {};
    Object.assign(root.ZE, factory());
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SCHEMA_VERSION = '2.1.0';
  const CURSO_KEYS = ['curso', 'cliente', 'codigo_sence', 'contacto', 'relator', 'fecha', 'ref_interna', 'especificacion'];

  const ok = function (extra) { return Object.assign({ ok: true }, extra || {}); };
  const fail = function (error, extra) { return Object.assign({ ok: false, error: error }, extra || {}); };
  const k2 = function (a, f) { return a + '|' + f; };
  const k3 = function (a, f, m) { return a + '|' + f + '|' + m; };

  function nk(s) {
    return String(s === null || s === undefined ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[._:]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function isIsoDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
    if (!m) return false;
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
  }

  function createModel() {
    const curso = {};
    CURSO_KEYS.forEach(function (k) { curso[k] = ''; });
    return {
      version: SCHEMA_VERSION, curso: curso, config: { tamano_minimo_grupo: 5, puntos_base: 0 },
      alumnos: [], fechas: [], metricas: [],
      asistencia: {}, puntajes: {}, comentarios: {}
    };
  }

  // ---------------------------------------------------------------- course
  function setCurso(model, fields) {
    Object.keys(fields || {}).forEach(function (k) {
      if (CURSO_KEYS.indexOf(k) >= 0) model.curso[k] = fields[k] === null || fields[k] === undefined ? '' : String(fields[k]).trim();
    });
    return ok();
  }

  // ---------------------------------------------------------------- students
  function rutKey(r) { return String(r || '').replace(/[^0-9kK]/g, '').toUpperCase().replace(/^0+/, ''); }

  function generateAlumnoId(model) {
    const letters = nk(model.curso.cliente).replace(/[^a-z]/g, '').slice(0, 3).toUpperCase();
    const used = new Set(model.alumnos.map(function (a) { return a.id; }));
    for (let n = 1; n < 100000; n++) {
      const id = letters ? letters + '-' + String(n).padStart(3, '0') : 'E' + String(n).padStart(3, '0');
      if (!used.has(id)) return id;
    }
    return 'E' + Date.now();
  }

  function alumnoById(model, id) {
    for (let i = 0; i < model.alumnos.length; i++) if (model.alumnos[i].id === id) return model.alumnos[i];
    return null;
  }

  function addAlumno(model, a) {
    const nombre = String(a && a.nombre !== undefined && a.nombre !== null ? a.nombre : '').trim();
    if (!nombre) return fail('Falta el nombre del alumno.');
    let id = a.id ? String(a.id).trim() : '';
    if (!id || alumnoById(model, id)) id = generateAlumnoId(model);
    const al = { id: id, nombre: nombre, rut: String(a.rut || '').trim(), correo: String(a.correo || '').trim().toLowerCase() };
    model.alumnos.push(al);
    return ok({ alumno: al });
  }

  function updateAlumno(model, id, patch) {
    const al = alumnoById(model, id);
    if (!al) return fail('El alumno no existe.');
    if (patch.nombre !== undefined) {
      const n = String(patch.nombre).trim();
      if (!n) return fail('El nombre no puede quedar vacío.');
      al.nombre = n;
    }
    if (patch.rut !== undefined) al.rut = String(patch.rut).trim();
    if (patch.correo !== undefined) al.correo = String(patch.correo).trim().toLowerCase();
    return ok({ alumno: al });
  }

  function datosDeAlumno(model, id) {
    let asistencias = 0;
    let puntajes = 0;
    Object.keys(model.asistencia).forEach(function (k) { if (model.asistencia[k] && k.indexOf(id + '|') === 0) asistencias++; });
    Object.keys(model.puntajes).forEach(function (k) { if (k.indexOf(id + '|') === 0) puntajes++; });
    return { asistencias: asistencias, puntajes: puntajes };
  }

  function removeAlumno(model, id, opts) {
    const al = alumnoById(model, id);
    if (!al) return fail('El alumno no existe.');
    const d = datosDeAlumno(model, id);
    if ((d.asistencias || d.puntajes) && !(opts && opts.confirm)) {
      return fail('El alumno tiene datos.', { needsConfirm: true, message: 'Se eliminarán también su asistencia (' + d.asistencias + ' días) y sus puntajes (' + d.puntajes + ').', afectados: d });
    }
    model.alumnos = model.alumnos.filter(function (a) { return a.id !== id; });
    [model.asistencia, model.puntajes, model.comentarios].forEach(function (store) {
      Object.keys(store).forEach(function (k) { if (k.indexOf(id + '|') === 0) delete store[k]; });
    });
    return ok();
  }

  /** Merges an incoming list by id or RUT without touching attendance or scores. */
  function mergeAlumnos(model, list) {
    let nuevos = 0;
    let actualizados = 0;
    list.forEach(function (inc) {
      let found = inc.id ? alumnoById(model, inc.id) : null;
      if (!found && inc.rut) {
        const rk = rutKey(inc.rut);
        if (rk) found = model.alumnos.filter(function (a) { return rutKey(a.rut) === rk; })[0] || null;
      }
      if (found) {
        if (inc.nombre) found.nombre = String(inc.nombre).trim();
        if (inc.rut) found.rut = String(inc.rut).trim();
        if (inc.correo) found.correo = String(inc.correo).trim().toLowerCase();
        actualizados++;
      } else {
        const r = addAlumno(model, inc);
        if (r.ok) nuevos++;
      }
    });
    return ok({ nuevos: nuevos, actualizados: actualizados });
  }

  // ---------------------------------------------------------------- dates and attendance
  function fechaObj(model, f) {
    for (let i = 0; i < model.fechas.length; i++) if (model.fechas[i].fecha === f) return model.fechas[i];
    return null;
  }
  /** Active metrics evaluated on a date: the ones chosen for that day, or every active metric when none was chosen. */
  function metricasDelDia(model, fecha) {
    const act = metricasActivas(model);
    const fo = fechaObj(model, fecha);
    if (!fo || !fo.metricas) return act;
    return act.filter(function (m) { return fo.metricas.indexOf(m.id) >= 0; });
  }

  /** ids: array of metric ids, or null for "all active". Deselecting a metric that already has scores that day needs confirmation. */
  function setMetricasDelDia(model, fecha, ids, opts) {
    const fo = fechaObj(model, fecha);
    if (!fo) return fail('La fecha no existe.');
    let nuevo = null;
    if (ids !== null && ids !== undefined) {
      nuevo = ids.filter(function (id, i) { return metricaById(model, id) && ids.indexOf(id) === i; });
      if (!nuevo.length) return fail('Elige al menos una métrica para ese día.');
      if (nuevo.length >= metricasActivas(model).length && metricasActivas(model).every(function (m) { return nuevo.indexOf(m.id) >= 0; })) nuevo = null;
    }
    const antes = metricasDelDia(model, fecha).map(function (m) { return m.id; });
    const despues = (nuevo === null ? metricasActivas(model) : metricasActivas(model).filter(function (m) { return nuevo.indexOf(m.id) >= 0; })).map(function (m) { return m.id; });
    const quitadas = antes.filter(function (id) { return despues.indexOf(id) < 0; });
    const conDatos = Object.keys(model.puntajes).filter(function (k) { const p = k.split('|'); return p[1] === fecha && quitadas.indexOf(p[2]) >= 0; });
    if (conDatos.length && !(opts && opts.confirm)) {
      return fail('Hay puntajes de métricas que se van a quitar.', { needsConfirm: true, message: 'Se eliminarán ' + conDatos.length + ' puntajes de las métricas que dejas de evaluar ese día.', afectados: { puntajes: conDatos.length } });
    }
    conDatos.forEach(function (k) { delete model.puntajes[k]; });
    fo.metricas = nuevo;
    return ok();
  }

  function sortFechas(model) { model.fechas.sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0; }); }

  function addFecha(model, fecha, tema) {
    if (!isIsoDate(fecha)) return fail('La fecha no es válida.');
    if (fechaObj(model, fecha)) return fail('Esa fecha ya está registrada.');
    model.fechas.push({ fecha: fecha, tema: String(tema || '').trim(), metricas: null });
    sortFechas(model);
    return ok();
  }

  function datosDeFecha(model, f) {
    let asistencias = 0;
    let puntajes = 0;
    let comentarios = 0;
    Object.keys(model.asistencia).forEach(function (k) { if (model.asistencia[k] && k.split('|')[1] === f) asistencias++; });
    Object.keys(model.puntajes).forEach(function (k) { if (k.split('|')[1] === f) puntajes++; });
    Object.keys(model.comentarios).forEach(function (k) { if (k.split('|')[1] === f) comentarios++; });
    return { asistencias: asistencias, puntajes: puntajes, comentarios: comentarios };
  }

  function rekey(store, from, to) {
    Object.keys(store).forEach(function (k) {
      const p = k.split('|');
      if (p[1] === from) { p[1] = to; store[p.join('|')] = store[k]; delete store[k]; }
    });
  }

  function updateFecha(model, fecha, patch) {
    const fo = fechaObj(model, fecha);
    if (!fo) return fail('La fecha no existe.');
    if (patch.tema !== undefined) fo.tema = String(patch.tema || '').trim();
    if (patch.fecha !== undefined && patch.fecha !== fecha) {
      if (!isIsoDate(patch.fecha)) return fail('La fecha no es válida.');
      if (fechaObj(model, patch.fecha)) return fail('Esa fecha ya está registrada.');
      rekey(model.asistencia, fecha, patch.fecha);
      rekey(model.puntajes, fecha, patch.fecha);
      rekey(model.comentarios, fecha, patch.fecha);
      fo.fecha = patch.fecha;
      sortFechas(model);
    }
    return ok();
  }

  function removeFecha(model, fecha, opts) {
    if (!fechaObj(model, fecha)) return fail('La fecha no existe.');
    const d = datosDeFecha(model, fecha);
    if ((d.asistencias || d.puntajes || d.comentarios) && !(opts && opts.confirm)) {
      return fail('La fecha tiene datos.', { needsConfirm: true, message: 'Se eliminarán la asistencia (' + d.asistencias + ' presentes) y los puntajes (' + d.puntajes + ') de esa fecha.', afectados: d });
    }
    model.fechas = model.fechas.filter(function (f) { return f.fecha !== fecha; });
    [model.asistencia, model.puntajes, model.comentarios].forEach(function (store) {
      Object.keys(store).forEach(function (k) { if (k.split('|')[1] === fecha) delete store[k]; });
    });
    return ok();
  }

  function estaPresente(model, alumnoId, fecha) { return model.asistencia[k2(alumnoId, fecha)] === true; }

  function puntajesDeAlumnoFecha(model, alumnoId, fecha) {
    const pre = alumnoId + '|' + fecha + '|';
    return Object.keys(model.puntajes).filter(function (k) { return k.indexOf(pre) === 0; });
  }

  function setAsistencia(model, alumnoId, fecha, presente, opts) {
    if (!alumnoById(model, alumnoId)) return fail('El alumno no existe.');
    if (!fechaObj(model, fecha)) return fail('La fecha no existe.');
    if (!presente) {
      const conDatos = puntajesDeAlumnoFecha(model, alumnoId, fecha);
      if (conDatos.length && !(opts && opts.confirm)) {
        return fail('El alumno ya tiene puntajes ese día.', { needsConfirm: true, message: 'Se eliminarán sus ' + conDatos.length + ' puntajes de esa fecha.', afectados: { puntajes: conDatos.length } });
      }
      conDatos.forEach(function (k) { delete model.puntajes[k]; });
      delete model.comentarios[k2(alumnoId, fecha)];
      delete model.asistencia[k2(alumnoId, fecha)];
    } else {
      model.asistencia[k2(alumnoId, fecha)] = true;
    }
    return ok();
  }

  function marcarTodos(model, fecha, presente, opts) {
    if (!fechaObj(model, fecha)) return fail('La fecha no existe.');
    if (presente) {
      model.alumnos.forEach(function (a) { model.asistencia[k2(a.id, fecha)] = true; });
      return ok();
    }
    const d = datosDeFecha(model, fecha);
    if (d.puntajes && !(opts && opts.confirm)) {
      return fail('Hay puntajes ese día.', { needsConfirm: true, message: 'Se eliminarán los ' + d.puntajes + ' puntajes de esa fecha.', afectados: d });
    }
    model.alumnos.forEach(function (a) { setAsistencia(model, a.id, fecha, false, { confirm: true }); });
    return ok();
  }

  function presentes(model, fecha) {
    return model.alumnos.filter(function (a) { return estaPresente(model, a.id, fecha); });
  }

  function asistenciaDeAlumno(model, alumnoId) {
    const total = model.fechas.length;
    let n = 0;
    model.fechas.forEach(function (f) { if (estaPresente(model, alumnoId, f.fecha)) n++; });
    return { presentes: n, total: total, pct: total ? n / total * 100 : null };
  }

  // ---------------------------------------------------------------- metrics
  function metricaById(model, id) {
    for (let i = 0; i < model.metricas.length; i++) if (model.metricas[i].id === id) return model.metricas[i];
    return null;
  }

  function metricasActivas(model) { return model.metricas.filter(function (m) { return m.activa; }); }

  function toNum(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
    const s = String(v).trim().replace(',', '.');
    return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
  }

  /** A checklist metric (Cumple / No cumple) always uses 0-1 with minimum 1; anything else is a numeric scale. */
  /** Expected share of "Cumple" for a checklist (a fraction: 0.8 = 80 %) when the user does not set one. */
  const CHECKLIST_MIN_DEFECTO = 0.8;

  function minEsperadoError(tipo, v) {
    if (tipo !== 'checklist' || v === undefined || v === null || v === '') return null;
    const n = toNum(v);
    return Number.isNaN(n) || n < 0.01 || n > 1 ? 'El mínimo esperado debe estar entre 1 % y 100 %.' : null;
  }

  function normalizarTipo(f) {
    const tipo = f && f.tipo === 'checklist' ? 'checklist' : 'escala';
    if (tipo !== 'checklist') return Object.assign({}, f, { tipo: tipo });
    const ma = toNum(f.minAprob);
    const valido = ma !== null && !Number.isNaN(ma) && ma >= 0.01 && ma <= 1;
    return Object.assign({}, f, { tipo: tipo, min: 0, max: 1, minAprob: valido ? ma : CHECKLIST_MIN_DEFECTO });
  }

  function validateMetrica(model, f, selfId) {
    const nombre = String(f.nombre || '').trim();
    if (!nombre) return 'Falta el nombre de la métrica.';
    const dup = model.metricas.some(function (m) { return m.id !== selfId && nk(m.nombre) === nk(nombre); });
    if (dup) return 'Ya existe una métrica con ese nombre.';
    const min = toNum(f.min);
    const max = toNum(f.max);
    const ma = toNum(f.minAprob);
    if (min === null || max === null || Number.isNaN(min) || Number.isNaN(max)) return 'La escala debe tener un mínimo y un máximo numéricos.';
    if (!(min < max)) return 'El mínimo debe ser menor que el máximo.';
    if (ma === null || Number.isNaN(ma) || ma < min || ma > max) return 'El mínimo de aprobación debe estar dentro de la escala.';
    if (f.peso !== null && f.peso !== undefined && f.peso !== '') {
      const p = toNum(f.peso);
      if (Number.isNaN(p) || p <= 0) return 'El peso debe ser un número mayor que 0.';
    }
    return null;
  }

  function nextMetricaId(model) {
    const used = new Set(model.metricas.map(function (m) { return m.id; }));
    for (let n = 1; n < 100000; n++) { const id = 'M' + String(n).padStart(2, '0'); if (!used.has(id)) return id; }
    return 'M' + Date.now();
  }

  function addMetrica(model, f0) {
    const errMin = minEsperadoError(f0.tipo, f0.minAprob);
    if (errMin) return fail(errMin);
    const f = normalizarTipo(f0);
    const err = validateMetrica(model, f, null);
    if (err) return fail(err);
    const m = {
      id: f.id && !metricaById(model, f.id) ? String(f.id) : nextMetricaId(model),
      nombre: String(f.nombre).trim(), descripcion: String(f.descripcion || '').trim(), grupo: String(f.grupo || '').trim(), tipo: f.tipo,
      min: toNum(f.min), max: toNum(f.max), minAprob: toNum(f.minAprob),
      peso: f.peso === null || f.peso === undefined || f.peso === '' ? null : toNum(f.peso),
      activa: f.activa === undefined ? true : !!f.activa
    };
    model.metricas.push(m);
    return ok({ metrica: m });
  }

  function puntajesDeMetrica(model, id) {
    return Object.keys(model.puntajes).filter(function (k) { return k.split('|')[2] === id; });
  }

  function updateMetrica(model, id, patch) {
    const m = metricaById(model, id);
    if (!m) return fail('La métrica no existe.');
    const cambiaTipo = patch.tipo !== undefined && (patch.tipo === 'checklist' ? 'checklist' : 'escala') !== (m.tipo === 'checklist' ? 'checklist' : 'escala');
    if (cambiaTipo && puntajesDeMetrica(model, id).length) return fail('Esta métrica ya tiene puntajes, así que no se puede cambiar su tipo. Desactívala y crea otra.');
    // leaving a checklist without a new scale: go back to the usual 1 to 7 with minimum 4
    const errMin = minEsperadoError(patch.tipo !== undefined ? patch.tipo : m.tipo, patch.minAprob);
    if (errMin) return fail(errMin);
    let base = m;
    if (cambiaTipo && m.tipo === 'checklist' && patch.min === undefined && patch.max === undefined) base = Object.assign({}, m, { min: 0, max: 100, minAprob: 60 });
    else if (cambiaTipo && patch.tipo === 'checklist' && patch.minAprob === undefined) base = Object.assign({}, m, { minAprob: undefined });
    const merged = normalizarTipo(Object.assign({}, base, patch));
    const err = validateMetrica(model, merged, id);
    if (err) return fail(err);
    const min = toNum(merged.min);
    const max = toNum(merged.max);
    const fuera = puntajesDeMetrica(model, id).some(function (k) { const v = model.puntajes[k]; return v < min || v > max; });
    if (fuera) return fail(merged.tipo === 'checklist' ? 'Hay puntajes que no son Cumple / No cumple; cambia el tipo solo en métricas sin puntajes.' : 'Hay puntajes fuera de la nueva escala.');
    m.nombre = String(merged.nombre).trim();
    m.descripcion = String(merged.descripcion || '').trim();
    m.grupo = String(merged.grupo || '').trim();
    m.tipo = merged.tipo;
    m.min = min; m.max = max; m.minAprob = toNum(merged.minAprob);
    m.peso = merged.peso === null || merged.peso === undefined || merged.peso === '' ? null : toNum(merged.peso);
    m.activa = !!merged.activa;
    return ok({ metrica: m });
  }

  /** A metric with scores is removed only with {confirm:true}, which also deletes those scores. */
  function removeMetrica(model, id, opts) {
    if (!metricaById(model, id)) return fail('La métrica no existe.');
    const keys = puntajesDeMetrica(model, id);
    if (keys.length && !(opts && opts.confirm)) {
      const alumnos = new Set(keys.map(function (k) { return k.split('|')[0]; })).size;
      return fail('Esta métrica ya tiene puntajes.', { needsConfirm: true, sugerirDesactivar: true, afectados: { puntajes: keys.length, alumnos: alumnos }, message: 'Tiene ' + keys.length + (keys.length === 1 ? ' puntaje' : ' puntajes') + ' de ' + alumnos + (alumnos === 1 ? ' alumno' : ' alumnos') + '. Si la quitas se eliminan y no se pueden recuperar. Si solo quieres dejar de usarla, desactívala.' });
    }
    keys.forEach(function (k) { delete model.puntajes[k]; });
    model.metricas = model.metricas.filter(function (m) { return m.id !== id; });
    model.fechas.forEach(function (f) {
      if (!f.metricas) return;
      f.metricas = f.metricas.filter(function (x) { return x !== id; });
      if (!f.metricas.length) f.metricas = null;
    });
    return ok();
  }

  /** items: [{nombre, descripcion, grupo}], escala: {min,max,minAprob}. Skips names that already exist. */
  function addMetricasDesdeCatalogo(model, items, escala) {
    let agregadas = 0;
    let omitidas = 0;
    items.forEach(function (it) {
      const r = addMetrica(model, { nombre: it.nombre, descripcion: it.descripcion, grupo: it.grupo, tipo: it.tipo, min: escala.min, max: escala.max, minAprob: it.tipo === 'checklist' ? it.minAprob : escala.minAprob, peso: null, activa: true });
      if (r.ok) agregadas++; else omitidas++;
    });
    return ok({ agregadas: agregadas, omitidas: omitidas });
  }

  // ---------------------------------------------------------------- scores
  function setPuntaje(model, alumnoId, fecha, metricaId, value) {
    if (!alumnoById(model, alumnoId)) return fail('El alumno no existe.');
    if (!fechaObj(model, fecha)) return fail('La fecha no existe.');
    const m = metricaById(model, metricaId);
    if (!m) return fail('La métrica no existe.');
    if (!m.activa) return fail('La métrica está desactivada.');
    if (metricasDelDia(model, fecha).indexOf(m) < 0) return fail('Esa métrica no se evalúa ese día.');
    if (!estaPresente(model, alumnoId, fecha)) return fail('El alumno no asistió ese día.');
    const n = toNum(value);
    const key = k3(alumnoId, fecha, metricaId);
    if (n === null) { delete model.puntajes[key]; return ok({ value: null }); }
    if (Number.isNaN(n)) return fail('Escribe un número.');
    if (m.tipo === 'checklist' && n !== 0 && n !== 1) return fail('Marca Cumple o No cumple.');
    if (n < m.min || n > m.max) return fail('Debe estar entre ' + String(m.min).replace('.', ',') + ' y ' + String(m.max).replace('.', ',') + '.');
    model.puntajes[key] = n;
    return ok({ value: n });
  }

  function setComentario(model, alumnoId, fecha, texto) {
    const t = String(texto || '').trim();
    if (!estaPresente(model, alumnoId, fecha)) return fail('El alumno no asistió ese día.');
    if (t) model.comentarios[k2(alumnoId, fecha)] = t; else delete model.comentarios[k2(alumnoId, fecha)];
    return ok();
  }

  function getPuntaje(model, alumnoId, fecha, metricaId) {
    const v = model.puntajes[k3(alumnoId, fecha, metricaId)];
    return v === undefined ? null : v;
  }

  function hasAnyScore(model) { return Object.keys(model.puntajes).length > 0; }

  /** Course base points: a number from 0 to 99. */
  function setPuntosBase(model, value) {
    const n = value === '' || value === null || value === undefined ? 0 : toNum(value);
    if (Number.isNaN(n) || n < 0 || n > 99) return fail('Los puntos base deben estar entre 0 y 99.');
    model.config.puntos_base = n;
    return ok({ value: n });
  }

  /** Checklist metrics (Cumple = 1) of the day that are still empty for the students present: they start as Cumple. */
  function inicializarChecklist(model, fecha) {
    if (!fechaObj(model, fecha)) return fail('La fecha no existe.');
    let n = 0;
    const mets = metricasDelDia(model, fecha).filter(function (m) { return m.tipo === 'checklist'; });
    presentes(model, fecha).forEach(function (a) {
      mets.forEach(function (m) {
        if (getPuntaje(model, a.id, fecha, m.id) !== null) return;
        model.puntajes[k3(a.id, fecha, m.id)] = 1;
        n++;
      });
    });
    return ok({ inicializadas: n });
  }

  /** Marks (valor true = Cumple) or unmarks every checklist box of a date for the students present. Asks for confirmation when it overwrites registered boxes. */
  function marcarChecklistDelDia(model, fecha, valor, opts) {
    if (!fechaObj(model, fecha)) return fail('La fecha no existe.');
    const v = valor ? 1 : 0;
    const mets = metricasDelDia(model, fecha).filter(function (m) { return m.tipo === 'checklist'; });
    const tocar = [];
    presentes(model, fecha).forEach(function (a) {
      mets.forEach(function (m) { if (getPuntaje(model, a.id, fecha, m.id) !== v) tocar.push(k3(a.id, fecha, m.id)); });
    });
    if (!tocar.length) return ok({ cambiadas: 0 });
    const pisa = tocar.filter(function (k) { return v === 1 ? model.puntajes[k] === 0 : true; }).length;
    if (pisa && !(opts && opts.confirm)) {
      return fail('Cambia casillas ya registradas.', { needsConfirm: true, afectadas: pisa, message: v === 1 ? 'Se volverán a marcar como Cumple ' + pisa + (pisa === 1 ? ' descuento ya registrado.' : ' descuentos ya registrados.') : 'Se desmarcarán ' + pisa + (pisa === 1 ? ' casilla.' : ' casillas.') });
    }
    tocar.forEach(function (k) { model.puntajes[k] = v; });
    return ok({ cambiadas: tocar.length });
  }

  /** Number of "No cumple" (descuentos) registered on a date. */
  function descuentosDelDia(model, fecha) {
    const ids = metricasDelDia(model, fecha).filter(function (m) { return m.tipo === 'checklist'; }).map(function (m) { return m.id; });
    let n = 0;
    presentes(model, fecha).forEach(function (a) { ids.forEach(function (id) { if (getPuntaje(model, a.id, fecha, id) === 0) n++; }); });
    return n;
  }

  /** Closest earlier date that already has scores (the source for "traer del día anterior"), or null. */
  function fechaAnterior(model, fecha) {
    const withScores = {};
    Object.keys(model.puntajes).forEach(function (k) { withScores[k.split('|')[1]] = true; });
    const prev = model.fechas.map(function (x) { return x.fecha; }).filter(function (f) { return f < fecha && withScores[f]; }).sort();
    return prev.length ? prev[prev.length - 1] : null;
  }

  /** Copies the scores of the previous scored date into the EMPTY cells of this date (present students, metrics of the day). Never overwrites. */
  function traerDelDiaAnterior(model, fecha) {
    if (!fechaObj(model, fecha)) return fail('La fecha no existe.');
    const src = fechaAnterior(model, fecha);
    if (!src) return fail('No hay un día anterior con puntajes para copiar.');
    const keys = [];
    const mets = metricasDelDia(model, fecha);
    presentes(model, fecha).forEach(function (a) {
      mets.forEach(function (m) {
        if (getPuntaje(model, a.id, fecha, m.id) !== null) return;
        const v = getPuntaje(model, a.id, src, m.id);
        if (v === null || v < m.min || v > m.max) return;
        model.puntajes[k3(a.id, fecha, m.id)] = v;
        keys.push(k3(a.id, fecha, m.id));
      });
    });
    return ok({ copiadas: keys.length, desde: src, keys: keys });
  }

  /** Writes one value into every EMPTY cell of a metric's column (present students only). */
  function rellenarVacias(model, fecha, metricaId, value) {
    const n = toNum(value);
    if (n === null) return fail('Escribe el puntaje con que quieres rellenar.');
    const keys = [];
    let first = true;
    const pres = presentes(model, fecha);
    for (let i = 0; i < pres.length; i++) {
      if (getPuntaje(model, pres[i].id, fecha, metricaId) !== null) continue;
      const r = setPuntaje(model, pres[i].id, fecha, metricaId, n);
      if (!r.ok) return first ? r : fail(r.error);
      first = false;
      keys.push(k3(pres[i].id, fecha, metricaId));
    }
    return ok({ llenadas: keys.length, keys: keys });
  }

  // ---------------------------------------------------------------- guided flow conditions
  /** Returns the messages that block leaving each step (empty array = can advance). */
  function stepIssues(model) {
    const issues = { 1: [], 2: [], 3: [], 4: [], 5: [] };
    if (!model.alumnos.length) issues[1].push('Agrega al menos un alumno para continuar.');
    if (!model.fechas.length) issues[2].push('Agrega al menos una fecha de clases.');
    if (!metricasActivas(model).length) issues[3].push('Agrega al menos una métrica para evaluar.');
    if (!hasAnyScore(model)) issues[4].push('Todavía no hay puntajes: evalúa a al menos un alumno para ver resultados.');
    return issues;
  }

  /** First incomplete step among 1-3, otherwise 4. */
  function firstIncompleteStep(model) {
    const i = stepIssues(model);
    if (i[1].length) return 1;
    if (i[2].length) return 2;
    if (i[3].length) return 3;
    return 4;
  }

  return {
    SCHEMA_VERSION: SCHEMA_VERSION, CHECKLIST_MIN_DEFECTO: CHECKLIST_MIN_DEFECTO, CURSO_KEYS: CURSO_KEYS, createModel: createModel, nk: nk, isIsoDate: isIsoDate, rutKey: rutKey, toNum: toNum,
    setCurso: setCurso, generateAlumnoId: generateAlumnoId, alumnoById: alumnoById, addAlumno: addAlumno, updateAlumno: updateAlumno,
    removeAlumno: removeAlumno, mergeAlumnos: mergeAlumnos,
    fechaObj: fechaObj, addFecha: addFecha, updateFecha: updateFecha, removeFecha: removeFecha,
    estaPresente: estaPresente, setAsistencia: setAsistencia, marcarTodos: marcarTodos, presentes: presentes, asistenciaDeAlumno: asistenciaDeAlumno,
    metricaById: metricaById, metricasActivas: metricasActivas, addMetrica: addMetrica, updateMetrica: updateMetrica,
    removeMetrica: removeMetrica, addMetricasDesdeCatalogo: addMetricasDesdeCatalogo,
    metricasDelDia: metricasDelDia, setMetricasDelDia: setMetricasDelDia,
    setPuntaje: setPuntaje, setComentario: setComentario, getPuntaje: getPuntaje, hasAnyScore: hasAnyScore,
    setPuntosBase: setPuntosBase, inicializarChecklist: inicializarChecklist, marcarChecklistDelDia: marcarChecklistDelDia, descuentosDelDia: descuentosDelDia, fechaAnterior: fechaAnterior, traerDelDiaAnterior: traerDelDiaAnterior, rellenarVacias: rellenarVacias,
    stepIssues: stepIssues, firstIncompleteStep: firstIncompleteStep
  };
}));
