import { s, h, DAY, fmtDay, fmtDayTime, onResize } from './util.js';
import { showTip, hideTip } from './tip.js';

/** ∫ from a to b of (t + c)^-p dt */
function integral(a, b, p, c) {
  if (Math.abs(p - 1) < 1e-9) return Math.log((b + c) / (a + c));
  return ((b + c) ** (1 - p) - (a + c) ** (1 - p)) / (1 - p);
}

/**
 * Omori–Utsu maximum likelihood on [0, T] (days). K has a closed form given p and c,
 * so the search is a grid over p (unless fixed) and log-spaced c.
 */
function fit(tau, T, { p: fixedP, pMin = 0.3, pMax = 3, cMin = 0.005, cMax = 5 } = {}) {
  const N = tau.length;
  let best = null;
  const ps = fixedP ? [fixedP] : Array.from({ length: Math.round((pMax - pMin) / 0.02) + 1 }, (_, i) => pMin + i * 0.02);
  for (const p of ps) {
    for (let k = 0; k <= 90; k++) {
      const c = cMin * (cMax / cMin) ** (k / 90);
      const I = integral(0, T, p, c);
      let sum = 0;
      for (const t of tau) sum += Math.log(t + c);
      const logL = N * Math.log(N / I) - p * sum - N;
      if (!best || logL > best.logL) best = { p, c, K: N / I, logL };
    }
  }
  return best;
}

/**
 * The whole forecast: fit, Gutenberg–Richter b-value (Aki 1965), window probabilities,
 * return-to-background date, and Båth's law.
 */
export function forecast({ mainshock, aftershocks, before, now }) {
  const t0 = mainshock.t;
  const T = (now - t0) / DAY;
  const tau = aftershocks.map((a) => (a.t - t0) / DAY);
  const free = fit(tau, T);
  const decaying = free.p >= 0.8;
  const model = decaying ? free : fit(tau, T, { p: 1.1 });

  const mags = aftershocks.map((a) => a.M).filter((M) => M != null);
  const Mc = Math.min(...mags);
  const mean = mags.reduce((x, y) => x + y, 0) / mags.length;
  const b = Math.LOG10E / Math.max(0.05, mean - Mc);

  const expected = (days) => model.K * integral(T, T + days, model.p, model.c);
  const chance = (days, M) => 1 - Math.exp(-expected(days) * 10 ** (-b * (M - Mc)));
  const windows = [['Next 24 hours', 1], ['Next 7 days', 7], ['Next 30 days', 30]].map(([label, days]) => ({
    label, days, n: expected(days), p5: chance(days, 5), p6: chance(days, 6), p7: chance(days, 7),
  }));

  // Background: the year before the mainshock, leaving out the foreshock window.
  const bg = before.length / 365;
  const backDays = bg > 0 ? (model.K / bg) ** (1 / model.p) - model.c : Infinity;
  const largest = aftershocks.reduce((m, a) => (a.M > (m?.M ?? -1) ? a : m), null);

  return {
    t0, T, N: tau.length, free, model, decaying, b, Mc, windows,
    bgEvery: bg > 0 ? 1 / bg : null,
    backAt: t0 + backDays * DAY,
    largest,
    bathGap: largest ? mainshock.M - largest.M : null,
    cumulative: (days) => model.K * integral(0, days, model.p, model.c),
  };
}

const pct = (x) => (x < 0.005 ? '<1%' : x > 0.995 ? '>99%' : `${Math.round(x * 100)}%`);
const count = (n) => (n < 10 ? n.toFixed(1) : Math.round(n).toLocaleString('en-US'));
export { pct, count };

/** Cumulative aftershocks: observed steps, the fit, and the forecast with its 90% band. */
export function chart(host, f, aftershocks) {
  function render() {
    const W = Math.max(280, host.clientWidth);
    const small = W < 520;
    const H = Math.round(Math.min(420, Math.max(260, W * 0.56)));
    const m = { top: 16, right: small ? 64 : 104, bottom: 30, left: 40 };
    const iw = W - m.left - m.right;
    const ih = H - m.top - m.bottom;
    const span = Math.max(f.T * 2, f.T + 3);
    const xs = (d) => m.left + (d / span) * iw;
    const end = f.N + f.model.K * integralFrom(f, f.T, span);
    const spread = (d) => 1.645 * Math.sqrt(Math.max(0, f.model.K * integralFrom(f, f.T, d)));
    const yMax = niceMax(end + spread(span));
    const ys = (n) => m.top + ih - (n / yMax) * ih;

    const nodes = [];
    for (const v of ticks(yMax)) {
      const y = Math.round(ys(v)) + 0.5;
      nodes.push(s('line', { class: 'chart__grid', x1: m.left, x2: m.left + iw, y1: y, y2: y }));
      nodes.push(s('text', { class: 'chart__tick', x: m.left - 8, y: y + 4, 'text-anchor': 'end' }, v.toLocaleString('en-US')));
    }
    // Midnight UTC ticks.
    const first = Math.ceil(f.t0 / DAY) * DAY;
    const step = span > 12 ? Math.ceil(span / (small ? 4 : 7)) : small && span > 5 ? 2 : 1;
    for (let t = first, i = 0; t < f.t0 + span * DAY; t += DAY, i++) {
      if (i % step) continue;
      const x = Math.round(xs((t - f.t0) / DAY)) + 0.5;
      nodes.push(s('line', { class: 'chart__axis', x1: x, x2: x, y1: m.top + ih, y2: m.top + ih + 5 }));
      nodes.push(s('text', { class: 'chart__tick', x, y: m.top + ih + 19, 'text-anchor': 'middle' }, fmtDay(t)));
    }
    nodes.push(s('line', { class: 'chart__axis', x1: m.left, x2: m.left + iw, y1: m.top + ih + 0.5, y2: m.top + ih + 0.5 }));

    // 90% band on the forecast.
    const steps = 60;
    let band = '';
    for (let i = 0; i <= steps; i++) {
      const d = f.T + ((span - f.T) * i) / steps;
      const n = f.N + f.model.K * integralFrom(f, f.T, d);
      band += `${i ? 'L' : 'M'}${xs(d).toFixed(1)} ${ys(n + spread(d)).toFixed(1)}`;
    }
    for (let i = steps; i >= 0; i--) {
      const d = f.T + ((span - f.T) * i) / steps;
      const n = f.N + f.model.K * integralFrom(f, f.T, d);
      band += `L${xs(d).toFixed(1)} ${ys(Math.max(f.N, n - spread(d))).toFixed(1)}`;
    }
    nodes.push(s('path', { class: 'chart__band', d: `${band}Z` }));

    // Fit over the observed window, then the forecast.
    let fitD = '';
    for (let i = 0; i <= 80; i++) {
      const d = (f.T * i) / 80;
      fitD += `${i ? 'L' : 'M'}${xs(d).toFixed(1)} ${ys(f.cumulative(d)).toFixed(1)}`;
    }
    let foreD = '';
    for (let i = 0; i <= 60; i++) {
      const d = f.T + ((span - f.T) * i) / 60;
      foreD += `${i ? 'L' : 'M'}${xs(d).toFixed(1)} ${ys(f.N + f.model.K * integralFrom(f, f.T, d)).toFixed(1)}`;
    }
    nodes.push(s('path', { class: 'chart__model', d: fitD }));
    nodes.push(s('path', { class: 'chart__model chart__model--forecast', d: foreD }));

    // Observed staircase.
    let obs = `M${xs(0).toFixed(1)} ${ys(0).toFixed(1)}`;
    aftershocks.forEach((a, i) => {
      const x = xs((a.t - f.t0) / DAY).toFixed(1);
      obs += `L${x} ${ys(i).toFixed(1)}L${x} ${ys(i + 1).toFixed(1)}`;
    });
    obs += `L${xs(f.T).toFixed(1)} ${ys(f.N).toFixed(1)}`;
    nodes.push(s('path', { class: 'chart__observed', d: obs }));

    const nowX = Math.round(xs(f.T)) + 0.5;
    nodes.push(s('line', { class: 'chart__now', x1: nowX, x2: nowX, y1: m.top, y2: m.top + ih }));
    nodes.push(s('text', { class: 'chart__now-label', x: nowX - 6, y: m.top + 12, 'text-anchor': 'end' }, 'now'));
    nodes.push(s('circle', { class: 'chart__dot chart__dot--observed', cx: xs(f.T), cy: ys(f.N), r: 4.5 }));
    nodes.push(s('circle', { class: 'chart__dot chart__dot--model', cx: xs(span), cy: ys(end), r: 4.5 }));
    nodes.push(s('text', { class: 'chart__direct', x: xs(f.T) + 9, y: ys(f.N) + 16 }, `${f.N} so far`));
    nodes.push(s('text', { class: 'chart__direct', x: xs(span) + 9, y: ys(end) + 4 }, `≈${Math.round(end)}`));
    nodes.push(s('text', { class: 'chart__now-label', x: xs(span) + 9, y: ys(end) + 20 }, small ? fmtDay(f.t0 + span * DAY) : `by ${fmtDay(f.t0 + span * DAY)}`));

    const cross = s('line', { class: 'chart__cross', x1: 0, x2: 0, y1: m.top, y2: m.top + ih, visibility: 'hidden' });
    const hit = s('rect', { class: 'chart__hit', x: m.left, y: m.top, width: iw, height: ih });
    nodes.push(cross, hit);

    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': `Cumulative aftershocks: ${f.N} observed so far; the forecast reaches about ${Math.round(end)} by ${fmtDay(f.t0 + span * DAY)}.` }, ...nodes);
    host.replaceChildren(svg);

    const move = (ev) => {
      const r = svg.getBoundingClientRect();
      const px = ((ev.clientX - r.left) * W) / r.width;
      const d = Math.max(0, Math.min(span, ((px - m.left) / iw) * span));
      const x = xs(d);
      cross.setAttribute('x1', x);
      cross.setAttribute('x2', x);
      cross.setAttribute('visibility', 'visible');
      const t = f.t0 + d * DAY;
      const observed = d <= f.T ? aftershocks.filter((a) => a.t <= t).length : null;
      const modelN = d <= f.T ? f.cumulative(d) : f.N + f.model.K * integralFrom(f, f.T, d);
      const body = h('div', null,
        h('span', { class: 'tip__meta' }, fmtDayTime(t)),
        observed != null && h('span', { class: 'tip__row' }, h('span', { class: 'key key--observed' }), `Observed ${observed}`),
        h('span', { class: 'tip__row' }, h('span', { class: 'key key--model' }), `${d <= f.T ? 'Fit' : 'Forecast'} ${modelN.toFixed(1)}`),
      );
      showTip(body, r.left + (x * r.width) / W, r.top + (m.top * r.width) / W);
    };
    hit.addEventListener('pointermove', move);
    hit.addEventListener('pointerleave', () => { cross.setAttribute('visibility', 'hidden'); hideTip(); });
  }
  render();
  onResize(host, render);
}

function integralFrom(f, a, b) {
  return integral(a, b, f.model.p, f.model.c);
}
function niceMax(v) {
  const mag = 10 ** Math.floor(Math.log10(Math.max(1, v)));
  for (const k of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (k * mag >= v) return k * mag;
  return 10 * mag;
}
function ticks(max) {
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((k) => k >= raw);
  const out = [];
  for (let v = 0; v <= max + 1e-9; v += step) out.push(Math.round(v));
  return out;
}
