import {
  h, s, FAULTS, FAULT_ORDER, DAY, HOUR, magnitude, pointsAt, fmtM, fmtOrigin, fmtDayTime, fmtSince,
  fmtInterval, fmtAgo, fmtMonthYear, fmtInt, monthShort, parts, displayTitle, onResize,
} from './util.js';
import { drum } from './drum.js';
import { forecast, chart, pct, count } from './forecast.js';
import { catalog } from './catalog.js';
import { showTip, hideTip } from './tip.js';

const bind = (key) => document.querySelectorAll(`[data-bind="${key}"]`);
const setText = (key, text) => bind(key).forEach((n) => { n.textContent = text; });

const SELF = {
  id: null, t: null, fault: 'ouroboros', M: null, short: 'metahacker',
  title: 'Metahacker: the Hacker-X Seismological Survey',
  felt: 'This page. A seismological survey of the Hacker-X fault, published on the fault. Recursion depth 3. Magnitude pending; you are part of the measurement.',
};

const MINOR_LABELS = {
  50313508: 'foreshock',
  50336496: 'first felt report',
  50339309: 'recursion depth 2',
  50327900: 'HN, for HN',
};

async function main() {
  const res = await fetch('data/events.json');
  const data = await res.json();
  const now = Date.now() / 1000;
  const events = data.events.map((e) => ({ ...e, M: magnitude(e) }));
  const main = events.find((e) => e.id === data.mainshock);
  const aftershocks = events.filter((e) => e.t > main.t).sort((a, b) => a.t - b.t);
  // Once this page is on HN, its own post takes over the "you are here" row.
  const posted = events.find((e) => e.role === 'self' || /metahacker/i.test(`${e.title} ${e.url ?? ''}`));
  if (posted) posted.role = 'self';
  const self = posted ? null : { ...SELF, t: now, role: 'self' };

  const findEvent = (id) => (id === 'self' ? self ?? posted : events.find((e) => e.id === id));
  const reveal = catalog({ events, self });

  bindSummary(data, events, main, aftershocks, now);

  const describe = (e) => h('div', null,
    h('span', { class: 'tip__meta' }, `M ${fmtM(e.M)} · ${fmtDayTime(e.t)} · ${FAULTS[e.fault].chip}`),
    h('strong', { class: 'tip__title' }, displayTitle(e.title)),
    h('span', { class: 'tip__felt' }, e.felt),
  );

  // Sequence drum: from the midnight before the foreshock, in lines short enough to fit ~22 rows.
  const seqStart = Math.floor((main.t - 16 * HOUR) / DAY) * DAY;
  const hours = (now - seqStart) / HOUR;
  const lineH = [1, 2, 3, 4, 6, 8, 12, 24, 48].find((x) => hours / x <= 22) ?? 48;
  const lineS = lineH * HOUR;
  setText('line-hours', lineH === 1 ? 'one hour' : `${['', '', 'two', 'three', 'four', 'six', 'eight'][lineH] ?? lineH} hours`);
  const seqLabels = new Map();
  for (const e of events) {
    if (e.t < seqStart) continue;
    if (e === main) seqLabels.set(e, { text: `${e.short}, M ${fmtM(e.M)} mainshock`, cont: `${e.short}, still ringing` });
    else if (MINOR_LABELS[e.id]) seqLabels.set(e, { text: MINOR_LABELS[e.id], minor: true });
    else if (e.M >= 5) seqLabels.set(e, { text: e.short ?? displayTitle(e.title), cont: e.M >= 7 ? `${e.short}, still ringing` : null });
  }
  const perHour = lineH <= 4 ? 1 : lineH <= 12 ? 3 : 6;
  drum(document.getElementById('sequence-drum'), {
    name: 'Sequence drum, since the mainshock',
    now,
    linesAt: (t) => Math.max(1, Math.ceil((t - seqStart) / lineS)),
    locate: (t) => {
      const v = (t - seqStart) / lineS;
      return { line: Math.floor(v), frac: v - Math.floor(v) };
    },
    events: events.filter((e) => e.t >= seqStart).map((e) => ({ t: e.t, M: e.M, ev: e })),
    rowLabel: (i, small) => {
      const t = seqStart + i * lineS;
      const p = parts(t);
      const hh = String(p.h).padStart(2, '0');
      const dayStart = p.h < lineH;
      if (small) return { text: dayStart ? `${p.d} ${monthShort(p.mo)}` : `${hh}h`, strong: dayStart };
      return { text: `${dayStart ? `${monthShort(p.mo)} ${p.d} ` : ''}${hh}:00`, strong: dayStart };
    },
    ticks: Array.from({ length: lineH / perHour }, (_, k) => ({ frac: (k * perHour) / lineH, label: `+${k * perHour}h`, minor: k % 2 === 1 })),
    labels: seqLabels,
    gap: 27, gapSmall: 21, gutter: 96, gutterSmall: 48, coda: 1, seed: 3,
    penLabel: 'now',
    describe,
    onPick: reveal,
    start: main,
  });

  // Long-period drum: one line per calendar year.
  const y0 = 2007;
  const yNow = parts(now).y;
  const yearStart = (y) => Date.UTC(y, 0, 1) / 1000;
  const recLabels = new Map();
  for (let y = y0; y <= yNow; y++) {
    const inYear = events.filter((e) => parts(e.t).y === y && e.M != null).sort((a, b) => b.M - a.M);
    const top = y === parts(main.t).y ? main : inYear[0];
    if (top && top.M >= 4) recLabels.set(top, { text: top === main ? `${top.short}, M ${fmtM(top.M)}, clipped` : top.short, minor: top.M < 5.5 });
    // The very largest get a label even when they are not their year's top event.
    for (const e of inYear) if (e !== top && e !== main && e.M >= 6.5) recLabels.set(e, { text: e.short ?? displayTitle(e.title) });
  }
  drum(document.getElementById('record-drum'), {
    name: 'Long-period drum, 2007 to today',
    now,
    linesAt: (t) => parts(t).y - y0 + 1,
    locate: (t) => {
      const y = parts(t).y;
      return { line: y - y0, frac: (t - yearStart(y)) / (yearStart(y + 1) - yearStart(y)) };
    },
    events: events.map((e) => ({ t: e.t, M: e.M, ev: e })),
    rowLabel: (i) => ({ text: String(y0 + i), strong: false }),
    ticks: Array.from({ length: 12 }, (_, m) => ({ frac: (Date.UTC(2001, m, 1) / 1000 - yearStart(2001)) / (365 * DAY), label: monthShort(m)[0], minor: false })),
    labels: recLabels,
    gap: 26, gapSmall: 20, gutter: 46, gutterSmall: 38, coda: 0.55, seed: 5,
    ampScale: 0.55, capGaps: 1.3, smallMinM: 6.5,
    penLabel: 'you are here',
    describe,
    onPick: reveal,
    start: main,
  });

  renderForecast(main, aftershocks, events, now);
  renderMMI(findEvent, reveal);
  renderFaults(events, now, describe, reveal);

  if (location.hash.startsWith('#ev-')) {
    const target = document.getElementById(location.hash.slice(1));
    if (target) target.scrollIntoView({ block: 'center' });
  }
}

function bindSummary(data, events, main, aftershocks, now) {
  const largest = aftershocks.reduce((m, a) => (a.M > (m?.M ?? -1) ? a : m), null);
  setText('aftershocks', String(aftershocks.length));
  setText('mainshock-time', fmtDayTime(main.t));
  setText('mainshock-m', fmtM(main.M));
  setText('mainshock-origin', `${fmtOrigin(main.t)} UTC`);
  setText('mainshock-depth', fmtInt(main.comments));
  setText('largest-aftershock', largest ? `${fmtM(largest.M)}, ${largest.short ?? displayTitle(largest.title)}, ${fmtSince(largest.t - main.t)}` : 'none yet');
  setText('events-total', String(events.length + 1));
  setText('events-instrumental', String(events.filter((e) => e.points != null).length));
  const updated = Date.parse(data.updated) / 1000;
  bind('updated').forEach((n) => {
    n.textContent = fmtAgo(updated, now);
    n.setAttribute('datetime', data.updated);
  });
}

function renderForecast(main, aftershocks, events, now) {
  const before = events.filter((e) => e.t > main.t - 367 * DAY && e.t < main.t - 2 * DAY);
  const f = forecast({ mainshock: main, aftershocks, before, now });
  const status = document.querySelector('[data-bind="fit-status"]');
  const delay = f.model.c * 24;
  const delayLine = delay < 36
    ? ` The fitted delay c is ${delay < 10 ? delay.toFixed(1) : Math.round(delay)} hours: about the time it takes to read the post, open an editor and buy a domain.`
    : '';
  if (f.decaying) {
    status.replaceChildren(h('strong', null, 'Fit status: decaying. '),
      `The best-fit decay exponent is p = ${f.model.p.toFixed(2)}; real earthquakes average about 1.1.${delayLine}`);
  } else {
    const floor = f.free.p <= 0.301;
    status.replaceChildren(h('strong', null, 'Fit status: not decaying yet. '),
      `Left free, the best-fit decay exponent is p ${floor ? '≤ 0.3' : `= ${f.free.p.toFixed(2)}`}: new clones were still arriving faster than Omori allows. The forecast fixes p at 1.1, the average for real earthquakes, on the assumption that people eventually go outside.${delayLine}`);
  }

  const rows = f.windows.map((w) => h('tr', null,
    h('td', null, w.label), h('td', null, count(w.n)), h('td', null, pct(w.p5)), h('td', null, pct(w.p6)), h('td', null, pct(w.p7))));
  document.querySelector('[data-bind="forecast-rows"]').replaceChildren(...rows);
  // Header hints follow the magnitude formula, not hard-coded numbers.
  document.querySelectorAll('.forecast-table thead th span').forEach((n, i) => {
    n.textContent = `≈${fmtInt(Math.round(pointsAt(5 + i) / 50) * 50)} points`;
  });

  const bgDays = f.bgEvery ? Math.round(f.bgEvery) : null;
  const back = document.querySelector('[data-bind="background"]');
  if (!bgDays) back.textContent = 'Before the mainshock there was no background to return to.';
  else {
    const years = (f.backAt - now) / (365.25 * DAY);
    const when = years > 10
      ? `sometime after ${parts(now).y + 10}, which is outside this survey’s funding period`
      : `around ${fmtMonthYear(f.backAt)}`;
    back.textContent = `In the year before the mainshock, the fault produced one Hacker-X post every ${bgDays} days. At the fitted rate, Hacker News returns to that background ${when}.`;
  }

  const bath = document.querySelector('[data-bind="bath"]');
  if (!f.largest) bath.textContent = 'No aftershocks yet. Enjoy it.';
  else {
    const name = f.largest.short ?? displayTitle(f.largest.title);
    const gap = f.bathGap;
    bath.textContent = gap < 0
      ? `${name} is larger than the mainshock, so HackerTube has been reclassified as a foreshock.`
      : `The largest aftershock is usually about 1.2 magnitudes below the mainshock. ${name} came in ${gap.toFixed(1)} below${gap < 0.9 ? ', so this sequence is unusually productive.' : gap <= 1.5 ? ', right on schedule.' : '. Quiet, so far.'}`;
  }

  chart(document.getElementById('omori-chart'), f, aftershocks);
}

function renderMMI(findEvent, reveal) {
  const list = document.querySelector('[data-bind="mmi-list"]');
  const receipt = document.getElementById('mmi-receipt');
  const KEY = 'metahacker:mmi';
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch { /* storage blocked */ }
  for (const li of list.querySelectorAll('[data-observed]')) {
    const ev = findEvent(li.dataset.observed);
    const text = li.querySelector('.mmi__text');
    if (li.dataset.observed === 'self' && !ev?.id) {
      text.append(h('span', { class: 'mmi__observed' }, 'Observed: now.'));
    } else if (ev) {
      text.append(h('span', { class: 'mmi__observed' }, 'Observed in this sequence: ',
        h('a', { href: `#ev-${ev.id}`, onclick: (e) => { e.preventDefault(); reveal(ev); } }, ev.short ?? displayTitle(ev.title)),
        `, ${fmtDayTime(ev.t)}.`));
    }
  }
  if (saved) {
    const input = list.querySelector(`input[value="${saved}"]`);
    if (input) input.checked = true;
  }
  const say = (roman, fresh) => {
    if (!roman) return;
    const extra = roman === 'XII' ? ' That is the maximum. Please step away from the keyboard.'
      : roman === 'I' ? ' We envy you.' : '';
    receipt.textContent = fresh
      ? `Report filed: intensity ${roman}. This survey’s database now holds one report, and it is yours.${extra}`
      : `Your report on file: intensity ${roman}.`;
  };
  say(saved, false);
  list.addEventListener('change', (ev) => {
    const roman = ev.target.value;
    try { localStorage.setItem(KEY, roman); } catch { /* private mode: the report stays in memory */ }
    say(roman, true);
  });
}

function renderFaults(events, now, describe, reveal) {
  const t0 = Date.UTC(2007, 0, 1) / 1000;
  for (const key of FAULT_ORDER) {
    const row = document.querySelector(`.fault[data-fault="${key}"] .fault__data`);
    if (!row) continue;
    const evs = events.filter((e) => e.fault === key).sort((a, b) => a.t - b.t);
    const largest = evs.filter((e) => e.M != null).sort((a, b) => b.M - a.M)[0];
    const week = evs.filter((e) => e.t > now - 7 * DAY).length;
    const stats = [
      ['First rupture', String(parts(evs[0].t).y)],
      ['Events', String(evs.length)],
      ['Largest', largest ? `M ${fmtM(largest.M)}, ${largest.short ?? displayTitle(largest.title)}` : '—'],
    ];
    if (evs.length > 1) stats.push(['Long-term interval', fmtInterval((evs.at(-1).t - evs[0].t) / (evs.length - 1))]);
    if (week > 1) stats.push(['This week', `every ${fmtInterval((7 * DAY) / week)}`]);
    const strip = h('div', { class: 'strip' });
    row.replaceChildren(h('dl', { class: 'fault__stats' }, ...stats.map(([k, v]) => h('div', null, h('dt', null, k), h('dd', null, v)))), strip);
    const draw = () => drawStrip(strip, evs, t0, now, describe, reveal);
    requestAnimationFrame(draw);
    onResize(strip, draw);
  }
}

function drawStrip(host, evs, t0, now, describe, reveal) {
  const W = Math.max(240, host.clientWidth);
  const H = 54;
  const base = 32;
  const x = (t) => 1 + ((t - t0) / (now - t0)) * (W - 2);
  const nodes = [s('line', { class: 'strip__base', x1: 0, x2: W, y1: base + 0.5, y2: base + 0.5 })];
  const years = W < 420 ? [2007, 2016, parts(now).y] : [2007, 2010, 2013, 2016, 2019, 2022, parts(now).y];
  for (const y of years) {
    const xx = x(Date.UTC(y, 0, 1) / 1000);
    nodes.push(s('text', { class: 'strip__year', x: Math.min(xx, W - 30), y: base + 17 }, String(y)));
  }
  const placed = evs.map((e) => ({ e, x: x(e.t), hgt: Math.max(3, ((e.M ?? 3) / 8) * 28) }));
  for (const p of placed) {
    nodes.push(s('line', { class: 'strip__tick', x1: p.x, x2: p.x, y1: base, y2: base - p.hgt }));
  }
  const hit = s('rect', { x: 0, y: 0, width: W, height: base + 4, fill: 'transparent' });
  nodes.push(hit);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, 'aria-hidden': 'true' }, ...nodes);
  host.replaceChildren(svg);
  const nearest = (clientX) => {
    const r = svg.getBoundingClientRect();
    const px = ((clientX - r.left) * W) / r.width;
    let best = null;
    for (const p of placed) {
      const d = Math.abs(p.x - px) - (p.e.M ?? 0) * 0.4;
      if (Math.abs(p.x - px) < 12 && (!best || d < best.d)) best = { ...p, d };
    }
    return { best, r };
  };
  hit.addEventListener('pointermove', (ev) => {
    const { best, r } = nearest(ev.clientX);
    if (!best) return hideTip();
    hit.style.cursor = 'pointer';
    showTip(describe(best.e), r.left + (best.x * r.width) / W, r.top + ((base - best.hgt) * r.width) / W);
  });
  hit.addEventListener('pointerleave', hideTip);
  hit.addEventListener('click', (ev) => {
    const { best } = nearest(ev.clientX);
    if (best) reveal(best.e);
  });
}

main().catch((err) => {
  console.error(err);
  setText('fit-status', 'The instruments failed to load. Try again in a moment.');
});
