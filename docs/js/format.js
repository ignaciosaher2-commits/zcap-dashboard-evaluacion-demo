/* Number and date formatting (es-CL style). Classic script: works from file:// and in Node tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ZE = root.ZE || {};
    Object.assign(root.ZE, factory());
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** 83.333 -> "83,3" */
  function fmtNum(n, decimals) {
    if (n === null || n === undefined || Number.isNaN(n)) return '—';
    const d = decimals === undefined ? 1 : decimals;
    return n.toFixed(d).replace('.', ',');
  }

  /** "2026-10-07" -> "07-10-2026" */
  function fmtDate(iso) {
    if (!iso) return '—';
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    return m ? m[3] + '-' + m[2] + '-' + m[1] : String(iso);
  }

  function todayIso() {
    const d = new Date();
    const p = function (x) { return String(x).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  return { fmtNum: fmtNum, fmtDate: fmtDate, todayIso: todayIso };
}));
