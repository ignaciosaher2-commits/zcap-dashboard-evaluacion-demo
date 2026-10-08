/* Presentation mode helpers: pseudonyms and minimum group size (pure functions, no DOM). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ZE = root.ZE || {};
    Object.assign(root.ZE, factory());
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Pseudonyms by order of first appearance: A001, A002... Stable within a loaded file. */
  function pseudonyms(ids) {
    const map = new Map();
    ids.forEach(function (id) {
      if (!map.has(id)) map.set(id, 'A' + String(map.size + 1).padStart(3, '0'));
    });
    return map;
  }

  /**
   * Marks groups smaller than `min` as reserved. If exactly one group is reserved, the
   * smallest visible group is also reserved so the value cannot be deduced by difference.
   * @param {{key:string,n:number}[]} groups
   * @returns {object[]} copies with `reservado` boolean
   */
  function applyMinGroup(groups, min) {
    const out = groups.map(function (g) { return Object.assign({}, g, { reservado: g.n < min }); });
    const hidden = out.filter(function (g) { return g.reservado; });
    if (hidden.length === 1) {
      const visible = out.filter(function (g) { return !g.reservado; }).sort(function (a, b) { return a.n - b.n; });
      if (visible.length) { visible[0].reservado = true; visible[0].complementario = true; }
    }
    return out;
  }

  /** Identity shown for a student depending on the presentation mode. */
  function identity(alumno, presentation, pseudo) {
    const seud = pseudo.get(alumno.id) || alumno.id;
    if (presentation) return { titulo: seud, nombre: '', rut: '', correo: '', seudonimo: seud };
    return { titulo: alumno.nombre || alumno.id, nombre: alumno.nombre, rut: alumno.rut, correo: alumno.correo, seudonimo: seud };
  }

  return { pseudonyms: pseudonyms, applyMinGroup: applyMinGroup, identity: identity };
}));
