import { s, h, noise, reducedMotion, onResize } from './util.js';
import { showTip, hideTip } from './tip.js';

const TAU = Math.PI * 2;

/**
 * A helicorder: one roll of paper, one line per interval, read left to right and
 * top to bottom. Every event rings as a damped wavelet whose amplitude follows
 * its magnitude; big ones spill onto the neighbouring lines, as they do on paper.
 *
 * opts.linesAt(now)   number of lines on the drum
 * opts.locate(t)      { line, frac } for a unix time
 * opts.events         [{ t, M, ev }]
 * opts.rowLabel(i, small) -> { text, strong }
 * opts.ticks          [{ frac, label }] paper divisions
 * opts.labels         Map(ev -> { text, minor })
 * opts.describe(ev)   Node for the tooltip
 * opts.onPick(ev)     click or Enter on an event
 */
export function drum(host, opts) {
  const live = !reducedMotion();
  const state = { now: opts.now, focus: -1, liveFrame: 0, clock: 0, geo: null };

  const svg = s('svg', { 'aria-hidden': 'true', focusable: 'false' });
  const announcer = h('p', { class: 'visually-hidden', 'aria-live': 'polite' });
  host.replaceChildren(svg, announcer);
  host.tabIndex = 0;
  host.setAttribute('role', 'group');
  host.setAttribute('aria-label', `${opts.name}. ${opts.events.length} events. Use the arrow keys to step through them and Enter to open one in the catalog.`);

  function geometry() {
    const W = Math.max(280, host.clientWidth);
    const small = W < 560;
    const gap = small ? opts.gapSmall : opts.gap;
    const gutter = small ? opts.gutterSmall : opts.gutter;
    const plotW = W - gutter - 4;
    const lines = opts.linesAt(state.now);
    const ampOf = (M) => gap * (opts.ampScale ?? 1) * Math.min(2.9, 0.15 + 0.07 * Math.exp(0.5 * (M - 1)));
    const codaScale = opts.coda * Math.min(1.2, Math.max(0.45, plotW / 900));
    const evs = opts.events
      .map((e) => {
        const p = opts.locate(e.t);
        return {
          ...e,
          line: p.line,
          x: p.frac * plotW,
          g: (p.line + p.frac) * plotW,
          a: ampOf(e.M),
          c: (10 + 4 * e.M * e.M) * codaScale,
          phase: (noise(e.t % 100003, 7) + 1) * Math.PI,
        };
      })
      .filter((e) => e.line >= 0 && e.line < lines)
      .sort((a, b) => a.t - b.t);
    const peak = (line) => Math.max(0, ...evs.filter((e) => e.line === line).map((e) => e.a));
    const axisH = 22;
    const clip = gap * (opts.capGaps ?? 3);
    const padTop = axisH + Math.max(gap * 0.75, Math.min(peak(0), clip, gap * 2.6) * 0.9);
    const padBottom = Math.max(gap * 0.8, Math.min(peak(lines - 1), clip, gap * 2.6) * 0.9);
    const H = padTop + (lines - 1) * gap + padBottom;
    return { W, H, small, gap, gutter, plotW, lines, evs, padTop, axisH, clip, base: (i) => padTop + i * gap };
  }

  /** Pen displacement at global paper position g (px along the unrolled paper). */
  function displacement(geo, g, active, jitter = 0) {
    const { gap } = geo;
    let y = gap * (0.03 * noise(g, opts.seed) + 0.018 * Math.sin(g / 17 + opts.seed) + 0.012 * Math.sin(g / 5.3));
    for (const e of active) {
      const tau = g - e.g;
      if (tau < 0 || tau > e.c) continue;
      const env = (1 - Math.exp(-tau / (1.2 + e.M * 0.35))) * Math.exp(-tau / (e.c / 3.4));
      const osc = 0.62 * Math.sin((TAU * tau) / 2.7 + e.phase) + 0.38 * Math.sin((TAU * tau) / 4.9 + e.phase * 1.7) + 0.3 * noise(g * 1.37, 3);
      y += e.a * env * osc;
    }
    y += jitter;
    const cap = gap * (opts.capGaps ?? 3);
    return cap * Math.tanh(y / cap);
  }

  function activeFor(geo, g0, g1) {
    return geo.evs.filter((e) => e.g <= g1 && e.g + e.c >= g0);
  }

  function render() {
    const geo = (state.geo = geometry());
    const { W, H, gap, gutter, plotW, lines, base, padTop, axisH, small, clip } = geo;
    const nowP = opts.locate(state.now);
    const nowLine = Math.min(nowP.line, lines - 1);
    const nowX = nowP.line >= lines ? plotW : nowP.frac * plotW;
    const liveLen = live ? Math.min(28, nowX) : 0;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);

    const paperTop = padTop - gap * 0.6;
    const paperBottom = base(lines - 1) + gap * 0.6;
    const nodes = [
      s('rect', { class: 'drum__paper', x: gutter, y: paperTop, width: plotW, height: paperBottom - paperTop }),
    ];

    for (const tick of opts.ticks) {
      const x = Math.round(gutter + tick.frac * plotW) + 0.5;
      nodes.push(s('line', { class: 'drum__grid', x1: x, x2: x, y1: paperTop, y2: paperBottom }));
      if (tick.label && !(small && tick.minor)) {
        nodes.push(s('text', { class: 'drum__axis', x: x + 4, y: axisH - 8 }, tick.label));
      }
    }
    nodes.push(s('rect', { class: 'drum__frame', x: gutter + 0.5, y: Math.round(paperTop) + 0.5, width: plotW - 1, height: Math.round(paperBottom - paperTop) }));

    for (let i = 0; i < lines; i++) {
      const label = opts.rowLabel(i, small);
      if (label) {
        nodes.push(s('text', { class: `drum__rowlabel${label.strong ? ' drum__rowlabel--day' : ''}`, x: gutter - 8, y: base(i) + 4, 'text-anchor': 'end' }, label.text));
      }
      const end = i < nowLine ? plotW : i === nowLine ? nowX - liveLen : -1;
      if (end <= 0) continue;
      const g0 = i * plotW;
      const active = activeFor(geo, g0, g0 + end);
      let d = '';
      for (let x = 0; x <= end; x += 1) {
        const y = displacement(geo, g0 + x, active);
        d += `${x ? 'L' : 'M'}${(gutter + x).toFixed(1)} ${(base(i) - y).toFixed(1)}`;
      }
      nodes.push(s('path', { class: `drum__trace drum__trace--${(i % 4) + 1}`, d }));
    }

    // Annotations sit just above each event's peak and stay off each other within a line.
    const taken = new Map();
    const place = (line, x0, text, minor, lift) => {
      const width = text.length * (minor ? 6.4 : 6.9) + 6;
      let x = x0 + 7;
      let anchor = 'start';
      if (x + width > gutter + plotW) {
        x = x0 - 7;
        anchor = 'end';
      }
      const box = anchor === 'start' ? [x, x + width] : [x - width, x];
      const row = taken.get(line) || [];
      if (row.some(([a, b]) => box[0] < b + 8 && box[1] > a - 8)) return;
      row.push(box);
      taken.set(line, row);
      const y = base(line) - Math.max(gap * 0.42, Math.min(lift + 5, gap * 0.95));
      nodes.push(s('text', { class: `drum__label${minor ? ' drum__label--minor' : ''}`, x, y, 'text-anchor': anchor }, text));
    };
    for (const e of geo.evs) {
      const conf = opts.labels.get(e.ev);
      if (!conf || (small && (conf.minor || e.M < (opts.smallMinM ?? 0)))) continue;
      place(e.line, gutter + e.x, conf.text, conf.minor, Math.min(e.a * 0.85, clip));
      // A big event keeps ringing onto the next line; say whose energy that is.
      const spill = e.x + e.c * 0.3 - plotW;
      if (conf.cont && spill > 0 && e.line + 1 < lines && e.line + 1 <= nowLine) {
        const x = e.x + e.c * 0.55 - plotW;
        place(e.line + 1, gutter + x, conf.cont, true, Math.min(e.a * Math.exp(-0.55 * 3.4) * 1.1, clip));
      }
    }

    // The pen.
    const penX = gutter + nowX;
    const penY = base(nowLine);
    const livePath = s('path', { class: `drum__live drum__trace--${(nowLine % 4) + 1}` });
    const arm = s('line', { class: 'drum__pen-arm', x1: penX, x2: penX, y1: penY - gap * 0.55, y2: penY });
    const nib = s('circle', { class: 'drum__pen-nib', cx: penX, cy: penY, r: 3.5 });
    const penText = opts.penLabel;
    const penW = penText.length * 6.6 + 4;
    const penRight = penX + 10 + penW < gutter + plotW;
    const penBox = penRight ? [penX + 9, penX + 9 + penW] : [penX - 9 - penW, penX - 9];
    // Drop below the trace if an annotation already sits above the pen.
    const penBelow = (taken.get(nowLine) || []).some(([a, b]) => penBox[0] < b + 6 && penBox[1] > a - 6);
    nodes.push(livePath, arm, nib,
      s('text', { class: 'drum__pen-label', x: penRight ? penX + 9 : penX - 9, y: penBelow ? penY + gap * 0.72 : penY - gap * 0.42, 'text-anchor': penRight ? 'start' : 'end' }, penText));

    const mark = s('rect', { class: 'drum__mark', x: 0, y: 0, width: 0, height: 0, rx: 3, fill: 'rgba(30,79,191,0.08)', stroke: 'rgba(30,79,191,0.55)', 'stroke-width': 1, visibility: 'hidden' });
    nodes.push(mark);
    svg.replaceChildren(...nodes);
    geo.mark = mark;
    geo.pen = { livePath, arm, nib, line: nowLine, x0: nowX - liveLen, len: liveLen, y: penY };
    geo.penX = penX;
    if (state.focus >= 0) highlight(state.focus, false);
  }

  function animatePen(ts) {
    const geo = state.geo;
    if (!geo || !geo.pen.len) return;
    const { pen, plotW, gutter } = geo;
    const g0 = pen.line * plotW;
    const active = activeFor(geo, g0 + pen.x0, g0 + pen.x0 + pen.len);
    const wobble = Math.floor(ts / 90);
    let d = '';
    let y = 0;
    for (let x = 0; x <= pen.len; x += 1) {
      const fade = x / pen.len;
      const jitter = geo.gap * 0.06 * fade * noise(x + wobble * 31, 11);
      y = displacement(geo, g0 + pen.x0 + x, active, jitter);
      d += `${x ? 'L' : 'M'}${(gutter + pen.x0 + x).toFixed(1)} ${(pen.y - y).toFixed(1)}`;
    }
    pen.livePath.setAttribute('d', d);
    pen.nib.setAttribute('cy', (pen.y - y).toFixed(1));
    pen.arm.setAttribute('y2', (pen.y - y).toFixed(1));
    state.liveFrame = requestAnimationFrame(animatePen);
  }

  // Pointer: find the nearest event on the nearest line.
  function pick(clientX, clientY) {
    const geo = state.geo;
    const r = svg.getBoundingClientRect();
    const scale = geo.W / r.width;
    const x = (clientX - r.left) * scale - geo.gutter;
    const y = (clientY - r.top) * scale;
    const line = Math.round((y - geo.padTop) / geo.gap);
    let best = -1;
    let bestScore = Infinity;
    geo.evs.forEach((e, i) => {
      if (Math.abs(e.line - line) > (e.a > geo.gap * 1.2 ? 1 : 0)) return;
      const dx = Math.abs(e.x + 3 - x);
      if (dx > 16) return;
      const score = dx - e.M * 0.9 + Math.abs(e.line - line) * 8;
      if (score < bestScore) { bestScore = score; best = i; }
    });
    return best;
  }

  function highlight(i, announce = true) {
    const geo = state.geo;
    const e = geo.evs[i];
    if (!e) return;
    state.focus = i;
    const hgt = Math.max(geo.gap * 0.9, Math.min(e.a * 1.6, geo.gap * 2.4));
    const x = geo.gutter + e.x - 5;
    const w = Math.max(12, Math.min(e.c * 0.4, 46));
    geo.mark.setAttribute('x', x);
    geo.mark.setAttribute('y', geo.base(e.line) - hgt / 2);
    geo.mark.setAttribute('width', w);
    geo.mark.setAttribute('height', hgt);
    geo.mark.setAttribute('visibility', 'visible');
    const r = svg.getBoundingClientRect();
    const scale = r.width / geo.W;
    showTip(opts.describe(e.ev), r.left + (x + w / 2) * scale, r.top + (geo.base(e.line) - hgt / 2) * scale);
    if (announce) announcer.textContent = opts.describe(e.ev).textContent;
  }

  function clear() {
    state.focus = -1;
    if (state.geo) state.geo.mark.setAttribute('visibility', 'hidden');
    hideTip();
  }

  svg.addEventListener('pointermove', (ev) => {
    if (ev.pointerType === 'touch') return;
    const i = pick(ev.clientX, ev.clientY);
    if (i < 0) clear();
    else if (i !== state.focus) highlight(i, false);
    svg.style.cursor = i < 0 ? '' : 'pointer';
  });
  svg.addEventListener('pointerleave', clear);
  svg.addEventListener('click', (ev) => {
    const i = pick(ev.clientX, ev.clientY);
    if (i < 0) return clear();
    if (ev.pointerType === 'touch' && state.focus !== i) return highlight(i, false);
    opts.onPick(state.geo.evs[i].ev);
  });
  host.addEventListener('keydown', (ev) => {
    const n = state.geo.evs.length;
    if (!n) return;
    let i = state.focus;
    const start = () => (i < 0 ? state.geo.evs.findIndex((e) => e.ev === opts.start) : i);
    switch (ev.key) {
      case 'ArrowRight': case 'ArrowDown': i = i < 0 ? start() : Math.min(n - 1, i + 1); break;
      case 'ArrowLeft': case 'ArrowUp': i = i < 0 ? start() : Math.max(0, i - 1); break;
      case 'Home': i = 0; break;
      case 'End': i = n - 1; break;
      case 'Enter': if (i >= 0) opts.onPick(state.geo.evs[i].ev); return;
      case 'Escape': clear(); return;
      default: return;
    }
    ev.preventDefault();
    highlight(Math.max(0, i));
  });
  host.addEventListener('blur', clear);

  render();
  onResize(host, render);
  if (live) {
    state.liveFrame = requestAnimationFrame(animatePen);
    // The paper advances in real time; redraw once a minute.
    state.clock = setInterval(() => {
      if (document.hidden) return;
      state.now = Date.now() / 1000;
      render();
    }, 60000);
  }
  return { render };
}
