/* Reads the relator's "Plantilla de Ingreso" by labels (not by cell position). Pure functions, no DOM. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./validate.js'), require('./model.js'));
  } else {
    root.ZE = root.ZE || {};
    Object.assign(root.ZE, factory(root.ZE, root.ZE));
  }
}(typeof self !== 'undefined' ? self : this, function (V, M) {
  'use strict';

  const nk = M.nk;
  const INFO_LABELS = {
    'curso': 'curso', 'cliente': 'cliente', 'codigo sence': 'codigo_sence', 'contacto': 'contacto',
    'relator': 'relator', 'fecha': 'fecha', 'ref interna': 'ref_interna', 'especificacion': 'especificacion'
  };
  const NAME_HEADERS = ['nombre alumno', 'nombre completo', 'nombre'];
  const SECRET_HEADERS = ['clave', 'contrasena', 'password', 'pass', 'contrasenas', 'claves', 'clave acceso', 'clave de acceso'];

  function isEmpty(v) { return v === null || v === undefined || v === ''; }

  function findRosterHeader(matrix) {
    for (let r = 0; r < matrix.length; r++) {
      const row = matrix[r] || [];
      const keys = row.map(function (c) { return isEmpty(c) ? '' : nk(c); });
      const nameCol = keys.findIndex(function (k) { return NAME_HEADERS.indexOf(k) >= 0; });
      if (nameCol < 0) continue;
      const others = keys.filter(function (k) { return k === 'rut' || k === 'correo' || k === 'registro' || k === 'email'; });
      if (others.length) return { row: r, keys: keys };
    }
    return null;
  }

  function cellText(v) {
    if (isEmpty(v)) return '';
    return String(v).replace(/\s+/g, ' ').trim();
  }

  function readInfo(matrix, limitRow) {
    const info = {};
    for (let r = 0; r < limitRow; r++) {
      const row = matrix[r] || [];
      for (let c = 0; c < row.length; c++) {
        if (isEmpty(row[c])) continue;
        const key = INFO_LABELS[nk(row[c])];
        if (!key || info[key] !== undefined) continue;
        for (let k = c + 1; k < Math.min(row.length, c + 8); k++) {
          if (!isEmpty(row[k]) && !INFO_LABELS[nk(row[k])]) {
            if (key === 'fecha') {
              const d = V.parseDateValue(row[k]);
              info[key] = d.iso || '';
            } else {
              info[key] = cellText(row[k]);
            }
            break;
          }
        }
        if (info[key] === undefined) info[key] = '';
      }
    }
    return info;
  }

  /**
   * @param {{sheetNames:string[], matrices:Object<string,any[][]>}} src output of readMatrices
   * @returns {{ok:boolean, fatal?:string[], sheet?:string, curso:object, alumnos:object[], warnings:object[], ignoredColumns:string[], leidos:number}}
   */
  function parseIntake(src) {
    let best = null;
    src.sheetNames.forEach(function (name) {
      const h = findRosterHeader(src.matrices[name] || []);
      if (h && (!best || nk(name) === 'informacion')) best = { name: name, header: h };
    });
    if (!best) {
      return { ok: false, fatal: ['No encontré la lista de alumnos. Busco una fila de encabezados con "NOMBRE_ALUMNO" (o "Nombre completo") junto a RUT, CORREO o REGISTRO. Revisa que la hoja Información tenga esos encabezados.'] };
    }
    const matrix = src.matrices[best.name];
    const hdr = best.header;
    const col = function (names) { return hdr.keys.findIndex(function (k) { return names.indexOf(k) >= 0; }); };
    const cNombre = col(NAME_HEADERS);
    const cReg = col(['registro']);
    const cRut = col(['rut']);
    const cMail = col(['correo', 'email']);
    const ignored = [];
    hdr.keys.forEach(function (k, i) {
      if (k && SECRET_HEADERS.indexOf(k) >= 0) ignored.push(cellText(matrix[hdr.row][i]));
    });

    const info = readInfo(matrix, hdr.row);
    if (!info.ref_interna && info.cliente && info.codigo_sence) {
      info.ref_interna = nk(info.cliente).replace(/[^a-z]/g, '').slice(0, 3).toUpperCase() + '-' + info.codigo_sence;
    }
    const curso = {};
    M.CURSO_KEYS.forEach(function (k) { curso[k] = info[k] || ''; });

    const warnings = [];
    const alumnos = [];
    const seenReg = new Map();
    const seenRut = new Map();
    const pending = [];
    for (let r = hdr.row + 1; r < matrix.length; r++) {
      const row = matrix[r] || [];
      const cells = [cNombre, cReg, cRut, cMail].filter(function (c) { return c >= 0; }).map(function (c) { return row[c]; });
      if (cells.every(isEmpty)) break;
      const nombre = cellText(row[cNombre]);
      if (!nombre) { warnings.push({ row: r + 1, column: 'NOMBRE_ALUMNO', message: 'La fila no tiene nombre y se ignoró.' }); continue; }
      let rut = '';
      if (cRut >= 0 && !isEmpty(row[cRut])) {
        const p = V.parseRut(row[cRut]);
        if (!p) { rut = cellText(row[cRut]); warnings.push({ row: r + 1, column: 'RUT', message: 'El RUT de ' + nombre + ' no tiene un formato reconocible.' }); }
        else {
          rut = p.formatted;
          if (!p.valid) warnings.push({ row: r + 1, column: 'RUT', message: 'El dígito verificador del RUT de ' + nombre + ' no corresponde.' });
        }
      }
      const correo = cMail >= 0 ? cellText(row[cMail]).toLowerCase() : '';
      if (!correo) warnings.push({ row: r + 1, column: 'CORREO', message: 'Falta el correo de ' + nombre + '.' });
      const reg = cReg >= 0 ? cellText(row[cReg]) : '';
      if (reg) {
        if (seenReg.has(reg)) warnings.push({ row: r + 1, column: 'REGISTRO', message: 'El registro ' + reg + ' está repetido (también en la fila ' + seenReg.get(reg) + ').' });
        else seenReg.set(reg, r + 1);
      }
      const rk = M.rutKey(rut);
      if (rk) {
        if (seenRut.has(rk)) warnings.push({ row: r + 1, column: 'RUT', message: 'El RUT de ' + nombre + ' está repetido (también en la fila ' + seenRut.get(rk) + ').' });
        else seenRut.set(rk, r + 1);
      }
      pending.push({ id: reg, nombre: nombre, rut: rut, correo: correo, fila: r + 1 });
    }

    // identifiers: REGISTRO when present and unique, otherwise generated with the course convention
    const tmp = M.createModel();
    tmp.curso.cliente = curso.cliente;
    const usedReg = new Set();
    pending.forEach(function (p) { if (p.id && !usedReg.has(p.id)) usedReg.add(p.id); else p.id = ''; });
    pending.forEach(function (p) { if (p.id) tmp.alumnos.push({ id: p.id }); });
    pending.forEach(function (p) {
      if (!p.id) { p.id = M.generateAlumnoId(tmp); tmp.alumnos.push({ id: p.id }); }
      alumnos.push(p);
    });
    if (!alumnos.length) warnings.push({ row: hdr.row + 1, column: 'NOMBRE_ALUMNO', message: 'No hay alumnos debajo de los encabezados.' });
    return { ok: true, sheet: best.name, curso: curso, alumnos: alumnos, warnings: warnings, ignoredColumns: ignored, leidos: alumnos.length };
  }

  return { parseIntake: parseIntake };
}));
