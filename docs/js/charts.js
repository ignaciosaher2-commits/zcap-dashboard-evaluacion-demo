/* Charts drawn as HTML/SVG strings: crisp on screen, in captures and in PDF. No library. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./format.js'));
  } else {
    root.ZE = root.ZE || {};
    Object.assign(root.ZE, factory(root.ZE));
  }
}(typeof self !== 'undefined' ? self : this, function (F) {
  'use strict';

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /** Horizontal bar rows. items: [{label, value|null, marker|null, extra, tag}] value and marker in 0..100. */
  function barRows(items) {
    return '<div class="bars">' + items.map(function (it) {
      if (it.value === null || it.value === undefined) {
        return '<div class="bar-row"><div class="bar-label">' + esc(it.label) + (it.extra ? '<small>' + esc(it.extra) + '</small>' : '') + '</div>' +
          '<div class="bar-track"><span class="bar-empty">sin datos</span></div><div class="bar-value">—</div></div>';
      }
      const w = clamp(it.value, 0, 100);
      const hasMarker = it.marker !== null && it.marker !== undefined;
      const cls = hasMarker && it.value < it.marker ? 'low' : 'ok';
      return '<div class="bar-row"><div class="bar-label">' + esc(it.label) + (it.tag ? ' <span class="tag tag-' + esc(it.tagClass || 'info') + '">' + esc(it.tag) + '</span>' : '') +
        (it.extra ? '<small>' + esc(it.extra) + '</small>' : '') + '</div>' +
        '<div class="bar-track" role="img" aria-label="' + esc(it.label + ': ' + F.fmtNum(it.value)) + ' de 100">' +
        '<span class="bar-fill ' + cls + '" style="width:' + w.toFixed(1) + '%"></span>' +
        (hasMarker ? '<span class="bar-threshold" style="left:' + clamp(it.marker, 0, 100).toFixed(1) + '%" title="Mínimo de la métrica: ' + F.fmtNum(it.marker) + ' sobre 100"></span>' : '') + '</div>' +
        '<div class="bar-value">' + F.fmtNum(it.value) + '</div></div>';
    }).join('') + '</div>';
  }

  /** Histogram of ten bins; the threshold line is drawn only when `umbral` is a number. bins: [{desde,hasta,n}] */
  function histogram(bins, umbral) {
    const hasThr = typeof umbral === 'number';
    const W = 560, H = 230, L = 28, R = 10, T = 34, B = 34;
    const pw = W - L - R, ph = H - T - B;
    const max = Math.max(1, Math.max.apply(null, bins.map(function (b) { return b.n; })));
    const bw = pw / bins.length;
    let svg = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Distribución de puntajes ponderados en tramos de 10 puntos">';
    [0, 0.5, 1].forEach(function (f) {
      const y = T + ph - f * ph;
      svg += '<line class="grid" x1="' + L + '" y1="' + y + '" x2="' + (W - R) + '" y2="' + y + '"/>' +
        '<text class="axis" x="' + (L - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + Math.round(f * max) + '</text>';
    });
    bins.forEach(function (b, i) {
      const h = b.n / max * ph;
      const x = L + i * bw + 3;
      const y = T + ph - h;
      const cls = 'ok';
      svg += '<rect class="bin ' + cls + '" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + (bw - 6).toFixed(1) + '" height="' + Math.max(h, 0).toFixed(1) + '" rx="4"/>';
      if (b.n > 0) svg += '<text class="val" x="' + (x + (bw - 6) / 2).toFixed(1) + '" y="' + (y - 4).toFixed(1) + '" text-anchor="middle">' + b.n + '</text>';
      svg += '<text class="axis" x="' + (L + i * bw + bw / 2).toFixed(1) + '" y="' + (H - 12) + '" text-anchor="middle">' + b.desde + '</text>';
    });
    if (hasThr) {
      const tx = L + clamp(umbral, 0, 100) / 100 * pw;
      svg += '<line class="thr" x1="' + tx + '" y1="' + T + '" x2="' + tx + '" y2="' + (T + ph) + '"/>' +
        '<text class="thr-label" x="' + tx + '" y="12" text-anchor="middle">umbral ' + umbral + '</text>';
    }
    return svg + '</svg>';
  }

  /** Line chart on a fixed 0-100 axis. points: [{label, value}] */
  function lineChart(points, umbral, ariaLabel) {
    const W = 560, H = 220, L = 34, R = 22, T = 18, B = 40;
    const pw = W - L - R, ph = H - T - B;
    const n = points.length;
    const pad = 34;
    const xs = function (i) { return n === 1 ? L + pw / 2 : L + pad + i * (pw - 2 * pad) / (n - 1); };
    const ys = function (v) { return T + ph - clamp(v, 0, 100) / 100 * ph; };
    let svg = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(ariaLabel || 'Evolución del puntaje') + '">';
    [0, 25, 50, 75, 100].forEach(function (g) {
      svg += '<line class="grid" x1="' + L + '" y1="' + ys(g) + '" x2="' + (W - R) + '" y2="' + ys(g) + '"/>' +
        '<text class="axis" x="' + (L - 6) + '" y="' + (ys(g) + 4) + '" text-anchor="end">' + g + '</text>';
    });
    if (typeof umbral === 'number') svg += '<line class="thr" x1="' + L + '" y1="' + ys(umbral) + '" x2="' + (W - R) + '" y2="' + ys(umbral) + '"/>';
    svg += '<polyline class="line" points="' + points.map(function (p, i) { return xs(i).toFixed(1) + ',' + ys(p.value).toFixed(1); }).join(' ') + '"/>';
    points.forEach(function (p, i) {
      svg += '<circle class="dot" cx="' + xs(i).toFixed(1) + '" cy="' + ys(p.value).toFixed(1) + '" r="5"/>' +
        '<text class="val" x="' + xs(i).toFixed(1) + '" y="' + (ys(p.value) - 10).toFixed(1) + '" text-anchor="middle">' + F.fmtNum(p.value) + '</text>' +
        '<text class="axis" x="' + xs(i).toFixed(1) + '" y="' + (H - 14) + '" text-anchor="middle">' + esc(p.label) + '</text>';
    });
    return svg + '</svg>';
  }

  return { esc: esc, barRows: barRows, histogram: histogram, lineChart: lineChart };
}));
