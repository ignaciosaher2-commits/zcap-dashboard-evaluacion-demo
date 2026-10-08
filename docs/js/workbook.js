/* Converts a SheetJS workbook into plain objects the validator understands. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ZE = root.ZE || {};
    Object.assign(root.ZE, factory());
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * @param {object} XLSX SheetJS namespace
   * @param {object} wb   workbook returned by XLSX.read(...) (dates must stay as serial numbers)
   * @returns {{sheetNames:string[], sheets:Object<string,{headers:string[],rows:object[]}>}}
   */
  function readWorkbook(XLSX, wb) {
    const sheets = {};
    wb.SheetNames.forEach(function (name) {
      const matrix = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: true });
      const headerRow = matrix.length ? matrix[0] : [];
      const headers = headerRow.map(function (h) { return h === null || h === undefined ? '' : String(h).trim(); });
      const rows = [];
      for (let i = 1; i < matrix.length; i++) {
        const row = { _row: i + 1 };
        let any = false;
        headers.forEach(function (h, c) {
          if (!h) return;
          let v = matrix[i][c];
          if (typeof v === 'string') v = v.trim();
          if (v === '') v = null;
          if (v !== null && v !== undefined) any = true;
          row[h] = v === undefined ? null : v;
        });
        if (any) rows.push(row);
      }
      sheets[name] = { headers: headers, rows: rows };
    });
    return { sheetNames: wb.SheetNames.slice(), sheets: sheets };
  }

  /** Raw cell matrices per sheet (arrays of arrays, cached formula values, dates as serial numbers). */
  function readMatrices(XLSX, wb) {
    const matrices = {};
    wb.SheetNames.forEach(function (name) {
      matrices[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: true });
    });
    return { sheetNames: wb.SheetNames.slice(), matrices: matrices };
  }

  return { readWorkbook: readWorkbook, readMatrices: readMatrices };
}));
