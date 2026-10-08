/* Daily weighted scoring, day average and per-metric minimum (pure functions, no DOM).
 * Rule: a student's total for a day is the weighted mean (0-100) of the metrics scored that day; the final
 * performance is the plain mean of the daily totals of the days the student attended and was scored.
 * Coverage is relative to the metrics chosen for that day, or the ones scored when none were chosen
 * (each day may cover a different topic).
 * The minimum of each metric is a reference for that metric; nobody is classified as passed or failed. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./model.js'));
  } else {
    root.ZE = root.ZE || {};
    Object.assign(root.ZE, factory(root.ZE));
  }
}(typeof self !== 'undefined' ? self : this, function (M) {
  'use strict';

  /** Course base points (0-99): the guaranteed floor of a daily total. */
  function baseOf(model) { const b = Number(model.config && model.config.puntos_base); return Number.isFinite(b) && b > 0 ? b : 0; }
  /** total = base + (100 - base) * raw / 100; null stays null (nobody gets the floor without a score). */
  function withBase(raw, base) { return raw === null ? null : base + (100 - base) * raw / 100; }

  /** (puntaje - min) / (max - min) * 100 */
  function normalizeScore(p, min, max) { return (p - min) / (max - min) * 100; }

  function mean(arr) {
    if (!arr.length) return null;
    let s = 0;
    for (let i = 0; i < arr.length; i++) s += arr[i];
    return s / arr.length;
  }

  function median(arr) {
    if (!arr.length) return null;
    const s = arr.slice().sort(function (x, y) { return x - y; });
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  /** Weight of each active metric: its own weight; blanks take the mean of the given weights (1 if none was given). */
  function effectiveWeights(metricas) {
    const given = metricas.map(function (m) { return m.peso; }).filter(function (p) { return p !== null && p !== undefined && p > 0; });
    const blank = given.length ? mean(given) : 1;
    const w = {};
    metricas.forEach(function (m) { w[m.id] = m.peso !== null && m.peso !== undefined && m.peso > 0 ? m.peso : blank; });
    return w;
  }

  function bins(values) {
    const out = [];
    for (let i = 0; i < 10; i++) out.push({ desde: i * 10, hasta: i === 9 ? 100 : (i + 1) * 10, n: 0 });
    values.forEach(function (v) { out[Math.min(9, Math.max(0, Math.floor(v / 10)))].n++; });
    return out;
  }

  /** @param {object} model evaluation model (see model.js) */
  function compute(model) {
    const fechas = model.fechas.slice().sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0; });
    const act = M.metricasActivas(model);
    const w = effectiveWeights(act);
    const base = baseOf(model);
    const totalW = act.reduce(function (s, m) { return s + w[m.id]; }, 0);

    // Each day can evaluate different topics: coverage is measured against the metrics that were scored
    // for at least one student that day (the metrics "in play"), not against every active metric.
    const inPlay = {};
    const activeIds = {};
    act.forEach(function (m) { activeIds[m.id] = true; });
    Object.keys(model.puntajes).forEach(function (k) {
      const p = k.split('|');
      if (!activeIds[p[2]] || !M.estaPresente(model, p[0], p[1])) return;
      (inPlay[p[1]] = inPlay[p[1]] || {})[p[2]] = true;
    });
    const playWeight = {};
    fechas.forEach(function (f) {
      const chosen = f.metricas ? M.metricasDelDia(model, f.fecha) : null;
      playWeight[f.fecha] = act.reduce(function (s2, m) {
        const on = chosen ? chosen.indexOf(m) >= 0 : !!(inPlay[f.fecha] && inPlay[f.fecha][m.id]);
        return s2 + (on ? w[m.id] : 0);
      }, 0);
    });

    // A checklist metric that was in play on a date counts as "No cumple" for a student who was absent that date
    // (shown as "—", never as a score of its own): an absence cannot raise the average of a metric.
    const onDay = {};
    fechas.forEach(function (f) {
      const chosen = f.metricas ? M.metricasDelDia(model, f.fecha) : null;
      onDay[f.fecha] = {};
      act.forEach(function (m) { onDay[f.fecha][m.id] = chosen ? chosen.indexOf(m) >= 0 : !!(inPlay[f.fecha] && inPlay[f.fecha][m.id]); });
    });

    // A metric that no date evaluates (unchecked on every day, or never scored) stays out of the results.
    const usada = {};
    act.forEach(function (m) { usada[m.id] = fechas.some(function (f) { return onDay[f.fecha][m.id]; }); });

    const alumnos = model.alumnos.map(function (al) {
      const dias = fechas.map(function (f) {
        const presente = M.estaPresente(model, al.id, f.fecha);
        const scores = [];
        let num = 0;
        let den = 0;
        if (presente) {
          act.forEach(function (m) {
            const p = M.getPuntaje(model, al.id, f.fecha, m.id);
            if (p === null) return;
            const norm = normalizeScore(p, m.min, m.max);
            scores.push({ metricaId: m.id, puntaje: p, norm: norm });
            num += w[m.id] * norm;
            den += w[m.id];
          });
        }
        return {
          fecha: f.fecha, tema: f.tema, presente: presente, scores: scores,
          total: withBase(den > 0 ? num / den : null, base),
          cobertura: presente ? (playWeight[f.fecha] > 0 ? den / playWeight[f.fecha] * 100 : 0) : null,
          comentario: model.comentarios[al.id + '|' + f.fecha] || ''
        };
      });
      const presentDias = dias.filter(function (d) { return d.presente; });
      const totals = presentDias.map(function (d) { return d.total; }).filter(function (t) { return t !== null; });
      const cobertura = presentDias.length ? mean(presentDias.map(function (d) { return d.cobertura; })) : null;
      const metricas = act.map(function (m) {
        const raws = [];
        presentDias.forEach(function (d) {
          const s = d.scores.filter(function (x) { return x.metricaId === m.id; })[0];
          if (s) raws.push(s.puntaje);
        });
        let aus = 0;
        if (m.tipo === 'checklist') dias.forEach(function (d) { if (!d.presente && onDay[d.fecha][m.id]) { raws.push(0); aus++; } });
        const avg = mean(raws);
        return {
          id: m.id, nombre: m.nombre, tipo: m.tipo || 'escala', usada: usada[m.id], min: m.min, max: m.max, minAprob: m.minAprob, n: raws.length, ausencias: aus,
          promedio: avg, promedioNorm: avg === null ? null : normalizeScore(avg, m.min, m.max),
          alcanza: avg === null ? null : avg >= m.minAprob
        };
      });
      const evaluadas = metricas.filter(function (x) { return x.n > 0; });
      const asist = M.asistenciaDeAlumno(model, al.id);
      return {
        id: al.id, nombre: al.nombre, rut: al.rut, correo: al.correo,
        asistencia: asist, dias: dias, final: mean(totals), cobertura: cobertura,
        parcial: cobertura !== null && cobertura < 99.999,
        metricas: metricas, metricasEvaluadas: evaluadas.length,
        metricasAlcanzadas: evaluadas.filter(function (x) { return x.alcanza; }).length,
        comentarios: dias.filter(function (d) { return d.comentario; }).map(function (d) { return { fecha: d.fecha, texto: d.comentario }; })
      };
    });

    const metricas = act.map(function (m) {
      const norms = [];
      const raws = [];
      alumnos.forEach(function (a) {
        a.dias.forEach(function (d) {
          d.scores.forEach(function (s) { if (s.metricaId === m.id) { norms.push(s.norm); raws.push(s.puntaje); } });
        });
      });
      if (m.tipo === 'checklist') {
        alumnos.forEach(function (a) { a.dias.forEach(function (d) { if (!d.presente && onDay[d.fecha][m.id]) { norms.push(0); raws.push(0); } }); });
      }
      const conDatos = alumnos.filter(function (a) { return a.metricas.some(function (x) { return x.id === m.id && x.n > 0; }); });
      const alcanzan = conDatos.filter(function (a) { return a.metricas.some(function (x) { return x.id === m.id && x.alcanza; }); });
      return {
        id: m.id, nombre: m.nombre, grupo: m.grupo, tipo: m.tipo || 'escala', usada: usada[m.id], min: m.min, max: m.max, minAprob: m.minAprob,
        minAprobNorm: normalizeScore(m.minAprob, m.min, m.max), peso: m.peso,
        n: norms.length, promedio: mean(raws), promedioNorm: mean(norms),
        conDatos: conDatos.length, alcanzan: alcanzan.length,
        pctAlcanzan: conDatos.length ? alcanzan.length / conDatos.length * 100 : null
      };
    });

    const dias = fechas.map(function (f) {
      const filas = alumnos.map(function (a) { return a.dias.filter(function (d) { return d.fecha === f.fecha; })[0]; });
      const pres = filas.filter(function (d) { return d.presente; });
      const totals = pres.map(function (d) { return d.total; }).filter(function (t) { return t !== null; });
      return { fecha: f.fecha, tema: f.tema, presentes: pres.length, total: alumnos.length, evaluados: totals.length, pendientes: pres.length - totals.length, promedio: mean(totals) };
    });

    const finals = alumnos.map(function (a) { return a.final; }).filter(function (v) { return v !== null; });
    const asistPct = alumnos.map(function (a) { return a.asistencia.pct; }).filter(function (v) { return v !== null; });
    const cohorte = {
      total: alumnos.length, n: finals.length, promedio: mean(finals), mediana: median(finals), distribucion: bins(finals),
      asistenciaPromedio: mean(asistPct), incompletos: alumnos.filter(function (a) { return a.parcial; }).length
    };

    const temas = new Map();
    dias.forEach(function (d, i) {
      if (!d.tema) return;
      if (!temas.has(d.tema)) temas.set(d.tema, { key: d.tema, ids: new Set(), totals: [] });
      const g = temas.get(d.tema);
      alumnos.forEach(function (a) {
        const x = a.dias[i];
        if (x.presente && x.total !== null) { g.ids.add(a.id); g.totals.push(x.total); }
      });
    });
    const grupos = Array.from(temas.values()).map(function (g) { return { key: g.key, n: g.ids.size, promedio: mean(g.totals) }; });

    return {
      alumnos: alumnos, metricas: metricas, dias: dias, cohorte: cohorte, grupos: grupos, puntosBase: base,
      periodo: { desde: fechas.length ? fechas[0].fecha : null, hasta: fechas.length ? fechas[fechas.length - 1].fecha : null }
    };
  }

  /** Total and coverage of one student on one date, without computing the whole course (used by the entry grid). */
  function dailyTotalFor(model, alumnoId, fecha) {
    const act = M.metricasActivas(model);
    const w = effectiveWeights(act);
    let totalW = 0;
    let num = 0;
    let den = 0;
    let scored = 0;
    act.forEach(function (m) {
      totalW += w[m.id];
      const p = M.getPuntaje(model, alumnoId, fecha, m.id);
      if (p === null) return;
      num += w[m.id] * normalizeScore(p, m.min, m.max);
      den += w[m.id];
      scored++;
    });
    return { total: withBase(den > 0 ? num / den : null, baseOf(model)), cobertura: totalW > 0 ? den / totalW * 100 : 0, scored: scored };
  }

  return { baseOf: baseOf, normalizeScore: normalizeScore, effectiveWeights: effectiveWeights, compute: compute, dailyTotalFor: dailyTotalFor, mean: mean, median: median };
}));
