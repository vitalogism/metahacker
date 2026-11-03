import { h, FAULTS, FAULT_ORDER, fmtM, fmtOrigin, fmtInt, hnItem, displayTitle } from './util.js';

/** The catalog table: fault filter, search, sort. Returns reveal(ev) for the drums. */
export function catalog({ events, self }) {
  const tbody = document.querySelector('[data-bind="catalog-rows"]');
  const countEl = document.querySelector('[data-bind="catalog-count"]');
  const filterEl = document.querySelector('[data-bind="fault-filter"]');
  const search = document.getElementById('catalog-search');
  const sort = document.getElementById('catalog-sort');
  const all = self ? [...events, self] : events;
  const state = { fault: 'all', q: '', sort: 'newest' };

  const rowId = (e) => (e === self ? 'ev-self' : `ev-${e.id ?? 'origin'}`);
  const rows = new Map(all.map((e) => [e, row(e)]));

  function row(e) {
    const strong = e.M != null && e.M >= 5;
    const flags = [];
    if (e.role === 'mainshock') flags.push(h('span', { class: 'ev-flag ev-flag--main' }, 'mainshock'));
    if (e.role === 'foreshock') flags.push(h('span', { class: 'ev-flag' }, 'foreshock'));
    if (e.role === 'self') flags.push(h('span', { class: 'ev-flag ev-flag--here' }, 'you are here'));
    if (e.reviewed === false) flags.push(h('span', { class: 'ev-flag' }, 'unreviewed'));
    const title = displayTitle(e.title);
    const link = e.url ? h('a', { class: 'ev-title', href: e.url }, title) : h('span', { class: 'ev-title' }, title);
    const hn = e.id
      ? [h('a', { href: hnItem(e.id), 'aria-label': `${fmtInt(e.points)} points and ${fmtInt(e.comments)} comments on Hacker News` }, `${fmtInt(e.points)} ${e.points === 1 ? 'pt' : 'pts'}`), h('br'), `${fmtInt(e.comments)} ${e.comments === 1 ? 'comment' : 'comments'}`]
      : e === self ? ['not yet posted'] : ['pre-', h('br'), 'instrumental'];
    return h('tr', { id: rowId(e), class: e.role === 'self' ? 'is-self' : null },
      h('td', { class: 'num' }, h('span', { class: `ev-m${strong ? ' ev-m--strong' : ''}${e.M >= 6.5 ? ' ev-m--big' : ''}` }, e === self ? '…' : fmtM(e.M))),
      h('td', { class: 'ev-time-cell' }, h('span', { class: 'ev-time' }, e === self ? 'now' : fmtOrigin(e.t))),
      h('td', null, link, ...flags, h('p', { class: 'ev-felt' }, e.felt)),
      h('td', { class: 'ev-fault' }, FAULTS[e.fault].chip),
      h('td', { class: 'num ev-hn' }, ...hn),
    );
  }

  // Fault filter as a radio group with roving focus.
  const options = [['all', 'All'], ...FAULT_ORDER.map((f) => [f, FAULTS[f].chip])];
  const buttons = options.map(([value, label]) => {
    const n = value === 'all' ? all.length : all.filter((e) => e.fault === value).length;
    const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(value === 'all'), tabindex: value === 'all' ? '0' : '-1', 'data-value': value },
      label, h('span', { class: 'count' }, n));
    b.addEventListener('click', () => choose(value, true));
    return b;
  });
  filterEl.replaceChildren(...buttons);
  filterEl.addEventListener('keydown', (ev) => {
    const i = options.findIndex(([v]) => v === state.fault);
    const step = ev.key === 'ArrowRight' || ev.key === 'ArrowDown' ? 1 : ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    ev.preventDefault();
    choose(options[(i + step + options.length) % options.length][0], true);
  });
  function choose(value, focus) {
    state.fault = value;
    buttons.forEach((b) => {
      const on = b.dataset.value === value;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    });
    render();
  }

  search.addEventListener('input', () => { state.q = search.value.trim().toLowerCase(); render(); });
  sort.addEventListener('change', () => { state.sort = sort.value; render(); });

  function render() {
    const q = state.q;
    const shown = all.filter((e) => {
      if (state.fault !== 'all' && e.fault !== state.fault) return false;
      if (!q) return true;
      return [e.title, e.short, e.felt, e.url, FAULTS[e.fault].name].some((v) => v && v.toLowerCase().includes(q));
    });
    const order = {
      newest: (a, b) => (a === self ? -1 : b === self ? 1 : b.t - a.t),
      oldest: (a, b) => (a === self ? 1 : b === self ? -1 : a.t - b.t),
      largest: (a, b) => (a === self ? 1 : b === self ? -1 : (b.M ?? -1) - (a.M ?? -1)),
    }[state.sort];
    shown.sort(order);
    tbody.replaceChildren(...shown.map((e) => rows.get(e)));
    if (!shown.length) {
      tbody.append(h('tr', null, h('td', { colspan: 5, class: 'empty' }, 'No events match. The fault is quiet here, for once.')));
    }
    countEl.textContent = shown.length === all.length
      ? `${all.length} events, including this one.`
      : `${shown.length} of ${all.length} events.`;
  }
  render();

  /** Bring an event's row into view, clearing filters that would hide it. */
  return function reveal(e) {
    if (state.fault !== 'all' && state.fault !== e.fault) choose('all', false);
    if (state.q) { search.value = ''; state.q = ''; render(); }
    const tr = rows.get(e);
    if (!tr) return;
    history.replaceState(null, '', `#${tr.id}`);
    tr.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    tr.classList.add('is-flash');
    setTimeout(() => tr.classList.remove('is-flash'), 900);
    const a = tr.querySelector('a');
    if (a) a.focus({ preventScroll: true });
  };
}
