export const FAULTS = {
  bedrock: {
    name: 'Bedrock', chip: 'Bedrock', form: 'Hacker News itself',
    desc: 'The original site and its source code. Everything else rests on it.',
  },
  'but-for': {
    name: 'But-For Fault', chip: 'But-For', form: 'Hacker News, but for X',
    desc: 'An HN-shaped site for another community: ideas, finance, designers, cars, gamedev, independent blogs.',
  },
  'mentioned-on': {
    name: 'Mentioned-On Fault', chip: 'Mentioned-On', form: 'X, as mentioned on HN',
    desc: 'Mine the comments for books, videos, courses or papers, then rank them. The fault that produced the 2026 mainshock.',
  },
  reskin: {
    name: 'Reskin Fault', chip: 'Reskin', form: 'Hacker News, but as X',
    desc: 'The same stories in a new costume: newsprint, Teletext, Windows XP, The New York Times, TikTok. Also the converse, X but for Hacker News.',
  },
  ouroboros: {
    name: 'Ouroboros Fault', chip: 'Ouroboros', form: 'Hacker X, but for Hacker X',
    desc: 'Aggregators of the aggregators, and Hacker News submitted to Hacker News. This page sits on it.',
  },
};
export const FAULT_ORDER = ['bedrock', 'but-for', 'mentioned-on', 'reskin', 'ouroboros'];

export const DAY = 86400;
export const HOUR = 3600;

/** M_HN = 2.3 log10(points + 1). HackerTube (2,836 points) lands at 7.9. */
export const magnitude = (e) => (e.points == null ? e.m_est ?? null : 2.3 * Math.log10(e.points + 1));
export const pointsAt = (M) => Math.round(10 ** (M / 2.3) - 1);
export const fmtM = (M) => (M == null ? '—' : M.toFixed(1));

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n) => String(n).padStart(2, '0');

export function parts(t) {
  const d = new Date(t * 1000);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes() };
}
export const fmtOrigin = (t) => {
  const p = parts(t);
  return `${p.y}-${pad(p.mo + 1)}-${pad(p.d)} ${pad(p.h)}:${pad(p.mi)}`;
};
export const fmtDayTime = (t) => {
  const p = parts(t);
  return `${MON[p.mo]} ${p.d}, ${pad(p.h)}:${pad(p.mi)} UTC`;
};
export const fmtDay = (t) => {
  const p = parts(t);
  return `${MON[p.mo]} ${p.d}`;
};
export const fmtMonthYear = (t) => {
  const p = parts(t);
  return `${MONTH[p.mo]} ${p.y}`;
};
export const monthShort = (i) => MON[i];

/** "+20 h", "+3.5 d" relative to a reference time. */
export function fmtSince(dt) {
  const h = dt / HOUR;
  if (h < 1) return `+${Math.round(dt / 60)} min`;
  if (h < 48) return `+${h < 10 ? h.toFixed(1).replace(/\.0$/, '') : Math.round(h)} h`;
  return `+${(h / 24).toFixed(1).replace(/\.0$/, '')} d`;
}

/** A plain-language interval: "4.3 months", "1.6 hours". */
export function fmtInterval(seconds) {
  const units = [
    [365.25 * DAY, 'year'], [30.44 * DAY, 'month'], [7 * DAY, 'week'], [DAY, 'day'], [HOUR, 'hour'], [60, 'minute'],
  ];
  for (const [size, name] of units) {
    const v = seconds / size;
    if (v >= 1.5 || size === 60) {
      const n = v < 10 ? Math.round(v * 10) / 10 : Math.round(v);
      return `${n} ${name}${n === 1 ? '' : 's'}`;
    }
  }
  return '';
}

export function fmtAgo(t, now) {
  const s = Math.max(0, now - t);
  if (s < 90) return 'just now';
  if (s < 90 * 60) return `${Math.round(s / 60)} minutes ago`;
  if (s < 36 * HOUR) return `${Math.round(s / HOUR)} hours ago`;
  return `${Math.round(s / DAY)} days ago`;
}

export const fmtInt = (n) => (n == null ? '—' : n.toLocaleString('en-US'));
export const hnItem = (id) => `https://news.ycombinator.com/item?id=${id}`;
export const displayTitle = (title) => title.replace(/^Show HN:\s*/i, '');

/** Tiny DOM builder. Strings become text nodes, so data never reaches innerHTML. */
export function h(tag, attrs, ...children) {
  const node = document.createElement(tag);
  setAttrs(node, attrs);
  for (const c of children.flat()) if (c != null && c !== false) node.append(c instanceof Node ? c : String(c));
  return node;
}
const SVG_NS = 'http://www.w3.org/2000/svg';
export function s(tag, attrs, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  setAttrs(node, attrs);
  for (const c of children.flat()) if (c != null && c !== false) node.append(c instanceof Node ? c : String(c));
  return node;
}
function setAttrs(node, attrs) {
  if (!attrs) return;
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
}

/** Deterministic noise so the paper looks the same on every visit. */
export function noise(n, seed = 1) {
  const x = Math.sin(n * 12.9898 + seed * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function onResize(el, fn) {
  let frame = 0;
  let last = el.clientWidth;
  const ro = new ResizeObserver(() => {
    if (el.clientWidth === last) return;
    last = el.clientWidth;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(fn);
  });
  ro.observe(el);
  return () => ro.disconnect();
}
