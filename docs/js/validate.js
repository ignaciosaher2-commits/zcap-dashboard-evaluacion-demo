/* Validation of the evaluation workbook (pure functions, no DOM). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ZE = root.ZE || {};
    Object.assign(root.ZE, factory());
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const APP_VERSION = '2.1.0';
  const MIN_TEMPLATE_VERSION = '1.0.0';
  const TEMPLATE_URL = 'plantilla/plantilla-evaluacion-v1.0.0.xlsx';

  const REQUIRED_COLUMNS = {
    Parametros: ['parametro', 'valor'],
    Criterios: ['id_criterio', 'nombre', 'peso', 'escala_min', 'escala_max', 'activo'],
    Evaluaciones: ['fecha', 'id_alumno', 'id_criterio', 'puntaje']
  };

  // ---------- RUT ----------
  function rutDv(body) {
    let total = 0;
    let factor = 2;
    const s = String(body);
    for (let i = s.length - 1; i >= 0; i--) {
      total += Number(s[i]) * factor;
      factor = factor === 7 ? 2 : factor + 1;
    }
    const rest = 11 - (total % 11);
    return rest === 11 ? '0' : rest === 10 ? 'K' : String(rest);
  }

  /** Returns {body, dv, formatted, valid} or null when the text is not shaped like a RUT. */
  function parseRut(value) {
    if (value === null || value === undefined) return null;
    const clean = String(value).replace(/[.\s-]/g, '').toUpperCase();
    if (!/^\d{6,8}[\dK]$/.test(clean)) return null;
    const body = clean.slice(0, -1);
    const dv = clean.slice(-1);
    const bodyFmt = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return { body: body, dv: dv, formatted: bodyFmt + '-' + dv, valid: rutDv(body) === dv };
  }

  // ---------- versions ----------
  function parseVersion(v) {
    const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v === null || v === undefined ? '' : v).trim());
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  }

  function compareVersions(a, b) {
    for (let i = 0; i < 3; i++) {
      if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
    }
    return 0;
  }

  // ---------- dates ----------
  function isoFromParts(y, m, d) {
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    return String(y).padStart(4, '0') + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }

  /** @returns {{iso:string}|{ambiguous:true}|{invalid:true}|{empty:true}} */
  function parseDateValue(v) {
    if (v === null || v === undefined || v === '') return { empty: true };
    if (typeof v === 'number') {
      if (!(v > 1 && v < 80000)) return { invalid: true };
      const ms = Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000;
      const d = new Date(ms);
      return { iso: isoFromParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()) };
    }
    if (v instanceof Date) {
      if (Number.isNaN(v.getTime())) return { invalid: true };
      return { iso: isoFromParts(v.getFullYear(), v.getMonth() + 1, v.getDate()) };
    }
    const s = String(v).trim();
    const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/.exec(s);
    if (iso) {
      const out = isoFromParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));
      return out ? { iso: out } : { invalid: true };
    }
    if (/^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}$/.test(s)) return { ambiguous: true };
    return { invalid: true };
  }

  function toNumber(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'string' && /^-?\d+([.,]\d+)?$/.test(v.trim())) return Number(v.trim().replace(',', '.'));
    return null;
  }

  function isEmpty(v) { return v === null || v === undefined || v === ''; }

  // ---------- main ----------
  /**
   * @param {{sheets:Object}} raw output of readWorkbook
   * @returns {{fatal:string[], errors:object[], warnings:object[], data:object|null, stats:object}}
   */
  function validate(raw) {
    const result = { fatal: [], errors: [], warnings: [], data: null, stats: { totalRows: 0, rowsWithError: 0, rowsInactive: 0, rowsWithoutScore: 0, validRows: 0 } };
    const err = function (sheet, row, column, message) { result.errors.push({ sheet: sheet, row: row, column: column, message: message }); };
    const warn = function (sheet, row, column, message) { result.warnings.push({ sheet: sheet, row: row, column: column, message: message }); };

    // 1) structure
    Object.keys(REQUIRED_COLUMNS).forEach(function (sheet) {
      const s = raw.sheets[sheet];
      if (!s) { result.fatal.push('Falta la hoja ' + sheet + '. Descarga la plantilla vigente y copia tus datos.'); return; }
      REQUIRED_COLUMNS[sheet].forEach(function (col) {
        if (s.headers.indexOf(col) < 0) result.fatal.push('Falta la columna ' + col + ' en la hoja ' + sheet + '.');
      });
    });
    if (result.fatal.length) return result;

    // 2) parameters and template version
    const params = {};
    raw.sheets.Parametros.rows.forEach(function (r) {
      if (!isEmpty(r.parametro)) params[String(r.parametro).trim().toLowerCase()] = r.valor;
    });
    const minV = parseVersion(MIN_TEMPLATE_VERSION);
    const fileV = parseVersion(params.plantilla_version);
    if (!fileV) {
      result.fatal.push('No se reconoce la versión de la plantilla. Descarga la plantilla vigente (versión mínima ' + MIN_TEMPLATE_VERSION + ').');
      return result;
    }
    if (fileV[0] !== minV[0] || compareVersions(fileV, minV) < 0) {
      result.fatal.push('La plantilla es la versión ' + fileV.join('.') + ' y este dashboard necesita desde la ' + MIN_TEMPLATE_VERSION + ' (misma versión mayor). Descarga la plantilla vigente.');
      return result;
    }
    let umbral = toNumber(params.umbral_logro);
    if (umbral === null || umbral < 0 || umbral > 100) {
      if (!isEmpty(params.umbral_logro)) warn('Parametros', null, 'umbral_logro', 'umbral_logro no es un número entre 0 y 100; se usa 70.');
      umbral = 70;
    }
    let minGroup = toNumber(params.tamano_minimo_grupo);
    if (minGroup === null || minGroup < 1) {
      if (!isEmpty(params.tamano_minimo_grupo)) warn('Parametros', null, 'tamano_minimo_grupo', 'tamano_minimo_grupo no es válido; se usa 5.');
      minGroup = 5;
    }
    minGroup = Math.floor(minGroup);
    const parametros = {
      plantilla_version: fileV.join('.'),
      nombre_curso: isEmpty(params.nombre_curso) ? '' : String(params.nombre_curso),
      periodo: isEmpty(params.periodo) ? '' : String(params.periodo),
      umbral_logro: umbral,
      tamano_minimo_grupo: minGroup
    };
    if (!parametros.nombre_curso) warn('Parametros', null, 'nombre_curso', 'Falta el nombre del curso; los informes saldrán sin nombre.');

    // 3) criteria
    const criteriaAll = {};
    const criteria = [];
    raw.sheets.Criterios.rows.forEach(function (r) {
      const id = isEmpty(r.id_criterio) ? '' : String(r.id_criterio).trim();
      if (!id) { err('Criterios', r._row, 'id_criterio', 'Falta el identificador del criterio.'); return; }
      if (criteriaAll[id]) { err('Criterios', r._row, 'id_criterio', 'El identificador ' + id + ' está repetido.'); return; }
      const peso = toNumber(r.peso);
      const min = toNumber(r.escala_min);
      const max = toNumber(r.escala_max);
      let bad = false;
      if (peso === null || peso <= 0) { err('Criterios', r._row, 'peso', 'El peso de ' + id + ' debe ser un número mayor que 0.'); bad = true; }
      if (min === null || max === null || !(min < max)) { err('Criterios', r._row, 'escala_min', 'La escala de ' + id + ' debe tener un mínimo menor que el máximo.'); bad = true; }
      let activo = true;
      if (!isEmpty(r.activo)) {
        const a = String(r.activo).trim().toUpperCase().replace('Í', 'I');
        if (a === 'NO') activo = false;
        else if (a !== 'SI') warn('Criterios', r._row, 'activo', 'El valor de activo en ' + id + ' no es SI ni NO; se considera SI.');
      }
      if (bad) { criteriaAll[id] = { invalid: true }; return; }
      const c = { id_criterio: id, nombre: isEmpty(r.nombre) ? id : String(r.nombre).trim(), peso: peso, escala_min: min, escala_max: max, activo: activo };
      criteriaAll[id] = c;
      criteria.push(c);
    });
    const active = criteria.filter(function (c) { return c.activo; });
    if (!active.length) {
      result.fatal.push('No hay criterios activos en la hoja Criterios.');
      return result;
    }
    const weightSum = active.reduce(function (s, c) { return s + c.peso; }, 0);
    if (Math.abs(weightSum - 100) > 0.001) {
      warn('Criterios', null, 'peso', 'Los pesos de los criterios activos suman ' + String(Math.round(weightSum * 100) / 100).replace('.', ',') + ' y no 100. Los resultados se calculan igualmente sobre esa suma.');
    }

    // 4) evaluations
    const rowsWithError = new Set();
    const valid = [];
    const alumnos = new Map();
    raw.sheets.Evaluaciones.rows.forEach(function (r) {
      result.stats.totalRows++;
      const before = result.errors.length;
      const sid = isEmpty(r.id_alumno) ? '' : String(r.id_alumno).trim();
      if (!sid) err('Evaluaciones', r._row, 'id_alumno', 'Falta el identificador del alumno.');

      const cid = isEmpty(r.id_criterio) ? '' : String(r.id_criterio).trim();
      const crit = cid ? criteriaAll[cid] : null;
      let inactive = false;
      if (!cid) err('Evaluaciones', r._row, 'id_criterio', 'Falta el criterio.');
      else if (!crit || crit.invalid) err('Evaluaciones', r._row, 'id_criterio', 'El criterio ' + cid + ' no existe en la hoja Criterios (¿se borró la fila? usa activo = NO en vez de borrar).');
      else if (!crit.activo) inactive = true;

      const d = parseDateValue(r.fecha);
      let fecha = null;
      if (d.empty) err('Evaluaciones', r._row, 'fecha', 'Falta la fecha.');
      else if (d.invalid) err('Evaluaciones', r._row, 'fecha', 'La fecha no es válida (usa una fecha de Excel o el formato 2026-10-07).');
      else if (d.ambiguous) warn('Evaluaciones', r._row, 'fecha', 'La fecha está escrita como texto ambiguo (día/mes o mes/día); no se usa en la tendencia. Usa el formato 2026-10-07.');
      else fecha = d.iso;

      let puntaje = null;
      let noScore = false;
      if (isEmpty(r.puntaje)) { noScore = true; }
      else {
        puntaje = toNumber(r.puntaje);
        if (puntaje === null) err('Evaluaciones', r._row, 'puntaje', 'El puntaje no es un número.');
        else if (crit && !crit.invalid && (puntaje < crit.escala_min || puntaje > crit.escala_max)) {
          err('Evaluaciones', r._row, 'puntaje', 'El puntaje ' + String(puntaje).replace('.', ',') + ' está fuera de la escala de ' + cid + ' (' + crit.escala_min + ' a ' + crit.escala_max + ').');
        }
      }

      let rut = null;
      if (!isEmpty(r.rut_alumno)) {
        const p = parseRut(r.rut_alumno);
        if (!p) warn('Evaluaciones', r._row, 'rut_alumno', 'El RUT no tiene un formato reconocible.');
        else { rut = p.formatted; if (!p.valid) warn('Evaluaciones', r._row, 'rut_alumno', 'El dígito verificador del RUT no corresponde.'); }
      }
      let correo = null;
      if (!isEmpty(r.correo_alumno)) {
        correo = String(r.correo_alumno).trim().toLowerCase();
        if (correo.indexOf('@') < 0) warn('Evaluaciones', r._row, 'correo_alumno', 'El correo no tiene un formato válido.');
      }

      if (result.errors.length > before) { rowsWithError.add(r._row); return; }
      if (inactive) { result.stats.rowsInactive++; return; }
      if (noScore) { result.stats.rowsWithoutScore++; warn('Evaluaciones', r._row, 'puntaje', 'La fila no tiene puntaje y no entra a los cálculos.'); return; }

      valid.push({
        fila: r._row, fecha: fecha, id_alumno: sid, id_criterio: cid, puntaje: puntaje,
        curso: isEmpty(r.curso) ? '' : String(r.curso).trim(),
        modulo: isEmpty(r.modulo) ? '' : String(r.modulo).trim(),
        comentario: isEmpty(r.comentario) ? '' : String(r.comentario)
      });
      let al = alumnos.get(sid);
      if (!al) { al = { id: sid, nombre: '', rut: '', correo: '' }; alumnos.set(sid, al); }
      if (!al.nombre && !isEmpty(r.nombre_alumno)) al.nombre = String(r.nombre_alumno).trim();
      if (!al.rut && rut) al.rut = rut;
      if (!al.correo && correo) al.correo = correo;
    });

    // 5) duplicates: the last row wins
    const seen = new Map();
    for (let i = valid.length - 1; i >= 0; i--) {
      const v = valid[i];
      const key = v.id_alumno + '|' + v.id_criterio + '|' + (v.fecha || 'sin-fecha');
      if (seen.has(key)) {
        warn('Evaluaciones', v.fila, 'puntaje', 'Fila duplicada (mismo alumno, criterio y fecha); se usó la fila ' + seen.get(key) + '.');
        valid.splice(i, 1);
      } else {
        seen.set(key, v.fila);
      }
    }

    result.stats.rowsWithError = rowsWithError.size;
    result.stats.validRows = valid.length;
    const stillThere = new Set(valid.map(function (v) { return v.id_alumno; }));
    const alumnoList = Array.from(alumnos.values()).filter(function (a) { return stillThere.has(a.id); });
    if (!valid.length) result.fatal.push('El archivo no tiene ninguna evaluación válida para calcular.');
    result.data = { parametros: parametros, criterios: active, criteriosTodos: criteria, evaluaciones: valid, alumnos: alumnoList };
    return result;
  }

  return {
    APP_VERSION: APP_VERSION,
    MIN_TEMPLATE_VERSION: MIN_TEMPLATE_VERSION,
    TEMPLATE_URL: TEMPLATE_URL,
    validate: validate,
    parseRut: parseRut,
    rutDv: rutDv,
    parseDateValue: parseDateValue,
    parseVersion: parseVersion,
    compareVersions: compareVersions
  };
}));
