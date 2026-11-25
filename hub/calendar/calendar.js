// Event calendar: filters, month grid, and list. Data lives in events.js.
// Filters are kept in the page address (?show=larp&larp=carps,archon ...) so a link keeps them.
import { CON_STYLES, EVENTS, LARPS, STATES, TBD, UPDATED } from './events.js';

const $ = (id) => document.getElementById(id);
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const larpById = new Map(LARPS.map((l) => [l.id, l]));
const styleById = new Map(CON_STYLES.map((s) => [s.id, s]));

/** Local midnight for a YYYY-MM-DD string. */
function day(text) {
  const [y, m, d] = text.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const today = new Date();
today.setHours(0, 0, 0, 0);

const events = EVENTS.map((e, i) => ({
  ...e,
  i,
  s: day(e.start),
  e: day(e.end || e.start),
  color: e.kind === 'larp' ? e.larp : e.styles[0],
})).sort((a, b) => a.s - b.s || a.name.localeCompare(b.name));

// ---------- state ----------

const narrow = window.matchMedia('(max-width: 40rem)').matches;
const state = {
  show: 'all', // all | larp | con
  larps: new Set(LARPS.map((l) => l.id)),
  styles: new Set(CON_STYLES.map((s) => s.id)),
  states: new Set(STATES),
  view: narrow ? 'list' : 'month',
  month: new Date(today.getFullYear(), today.getMonth(), 1),
  past: false,
};

function readUrl() {
  const q = new URLSearchParams(location.search);
  const pick = (key, all, set) => {
    if (!q.has(key)) return;
    const wanted = q
      .get(key)
      .split(',')
      .filter((v) => all.includes(v));
    set.clear();
    wanted.forEach((v) => set.add(v));
  };
  if (['all', 'larp', 'con'].includes(q.get('show'))) state.show = q.get('show');
  pick(
    'larp',
    LARPS.map((l) => l.id),
    state.larps,
  );
  pick(
    'type',
    CON_STYLES.map((s) => s.id),
    state.styles,
  );
  pick('state', STATES, state.states);
  if (['month', 'list'].includes(q.get('view'))) state.view = q.get('view');
  const m = /^(\d{4})-(\d{2})$/.exec(q.get('month') || '');
  if (m) state.month = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  state.past = q.get('past') === '1';
}

function writeUrl() {
  const q = new URLSearchParams();
  if (state.show !== 'all') q.set('show', state.show);
  if (state.larps.size !== LARPS.length) q.set('larp', [...state.larps].join(','));
  if (state.styles.size !== CON_STYLES.length) q.set('type', [...state.styles].join(','));
  if (state.states.size !== STATES.length) q.set('state', [...state.states].join(','));
  q.set('view', state.view);
  if (state.view === 'month')
    q.set(
      'month',
      `${state.month.getFullYear()}-${String(state.month.getMonth() + 1).padStart(2, '0')}`,
    );
  if (state.past) q.set('past', '1');
  history.replaceState(null, '', `${location.pathname}?${q}`);
}

function visible(e) {
  if (e.kind === 'larp') return state.show !== 'con' && state.larps.has(e.larp);
  return (
    state.show !== 'larp' && state.states.has(e.state) && e.styles.some((s) => state.styles.has(s))
  );
}

// ---------- text helpers ----------

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children) if (c != null) node.append(c);
  return node;
}

function range(e) {
  const short = { month: 'short', day: 'numeric' };
  const long = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
  if (sameDay(e.s, e.e)) return e.s.toLocaleDateString('en-US', long);
  const sameYear = e.s.getFullYear() === e.e.getFullYear();
  const start = e.s.toLocaleDateString('en-US', sameYear ? { weekday: 'short', ...short } : long);
  return `${start} – ${e.e.toLocaleDateString('en-US', long)}`;
}

function tagText(e) {
  if (e.kind === 'larp') return larpById.get(e.larp).name;
  return e.styles.map((s) => styleById.get(s).name).join(' · ');
}

function where(e) {
  if (e.kind === 'larp') return [e.venue, e.city].filter(Boolean).join(', ');
  return [e.venue, `${e.city}, ${e.state}`].filter(Boolean).join(', ');
}

// ---------- details dialog ----------

const dialog = $('details');

function openDetails(e) {
  dialog.className = `c-${e.color}`;
  $('d-tag').replaceChildren(el('span', { class: 'tag', text: tagText(e) }));
  $('d-name').textContent = e.name;
  $('d-when').textContent = range(e);
  $('d-where').textContent = where(e);
  const notes = [];
  if (e.note) notes.push(e.note);
  if (e.unconfirmed) notes.push('Dates are from a listing site, not the event’s own site yet.');
  $('d-note').textContent = notes.join(' ');
  $('d-note').hidden = notes.length === 0;
  const link = $('d-link');
  link.href = e.url;
  link.textContent =
    e.kind === 'larp' ? `Open the ${larpById.get(e.larp).name} site` : 'Open the convention site';
  if (!dialog.open) dialog.showModal();
}

function openDay(date, list) {
  if (list.length === 1) return openDetails(list[0]);
  dialog.className = '';
  $('d-tag').replaceChildren();
  $('d-name').textContent = date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  $('d-when').replaceChildren(
    el(
      'ul',
      { class: 'rows' },
      ...list.map((e) =>
        el(
          'li',
          { class: `row c-${e.color}` },
          el('span', { class: 'tag', text: tagText(e) }),
          el(
            'h4',
            {},
            el('button', { type: 'button', text: e.name, onclick: () => openDetails(e) }),
          ),
        ),
      ),
    ),
  );
  $('d-where').textContent = '';
  $('d-note').hidden = true;
  $('d-link').parentElement.hidden = true;
  if (!dialog.open) dialog.showModal();
}

dialog.addEventListener('close', () => {
  $('d-link').parentElement.hidden = false;
});
$('d-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (ev) => {
  if (ev.target === dialog) dialog.close();
});

// ---------- filters ----------

function segmented(container, options, current, onPick) {
  container.replaceChildren(
    ...options.map(([value, label]) =>
      el('button', {
        type: 'button',
        'aria-pressed': String(value === current),
        text: label,
        onclick: () => onPick(value),
      }),
    ),
  );
}

function chips(container, items, set) {
  container.replaceChildren(
    ...items.map(({ id, name, color }) =>
      el('button', {
        type: 'button',
        class: `chip${color ? ` c-${color}` : ''}`,
        'aria-pressed': String(set.has(id)),
        text: name,
        onclick: () => {
          if (set.has(id)) set.delete(id);
          else set.add(id);
          render();
        },
      }),
    ),
  );
}

function renderFilters() {
  segmented(
    $('kind'),
    [
      ['all', 'Everything'],
      ['larp', 'LARPs'],
      ['con', 'Conventions'],
    ],
    state.show,
    (v) => {
      state.show = v;
      render();
    },
  );
  $('larp-group').hidden = state.show === 'con';
  $('style-group').hidden = state.show === 'larp';
  $('state-group').hidden = state.show === 'larp';
  chips(
    $('larp-chips'),
    LARPS.map((l) => ({ ...l, color: l.id })),
    state.larps,
  );
  chips(
    $('style-chips'),
    CON_STYLES.map((s) => ({ ...s, color: s.id })),
    state.styles,
  );
  chips(
    $('state-chips'),
    STATES.map((s) => ({ id: s, name: s })),
    state.states,
  );
  segmented(
    $('view'),
    [
      ['month', 'Month'],
      ['list', 'List'],
    ],
    state.view,
    (v) => {
      state.view = v;
      render();
    },
  );
}

$('reset').addEventListener('click', () => {
  state.show = 'all';
  LARPS.forEach((l) => state.larps.add(l.id));
  CON_STYLES.forEach((s) => state.styles.add(s.id));
  STATES.forEach((s) => state.states.add(s));
  render();
});

// ---------- month view ----------

function renderMonth(shown) {
  const first = state.month;
  $('month-title').textContent = `${MONTHS[first.getMonth()]} ${first.getFullYear()}`;
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const cells = Math.ceil((first.getDay() + last.getDate()) / 7) * 7;

  const grid = el('div', { class: 'grid', 'aria-label': $('month-title').textContent });
  DOW.forEach((d) => grid.append(el('div', { class: 'dow', text: d })));
  for (let i = 0; i < cells; i++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const todays = shown.filter((e) => e.s <= date && date <= e.e);
    const cell = el('div', {
      class: `day${date.getMonth() !== first.getMonth() ? ' other' : ''}${sameDay(date, today) ? ' today' : ''}`,
    });
    cell.append(el('span', { class: 'num', text: String(date.getDate()) }));
    for (const e of todays) {
      const cont = !sameDay(e.s, date) && date.getDay() !== 0;
      cell.append(
        el('button', {
          type: 'button',
          class: `pill c-${e.color}${cont ? ' cont' : ''}${e.e < today ? ' past' : ''}`,
          title: `${e.name} (${range(e)})`,
          'aria-label': `${e.name}, ${range(e)}`,
          text: `${cont ? '↳ ' : ''}${e.kind === 'larp' ? larpById.get(e.larp).name : e.name}`,
          onclick: (ev) => {
            ev.stopPropagation();
            openDetails(e);
          },
        }),
      );
    }
    if (todays.length) cell.addEventListener('click', () => openDay(date, todays));
    grid.append(cell);
  }
  $('calendar').replaceChildren(grid);
  return shown.filter((e) => e.s <= last && e.e >= first).length;
}

// ---------- list view ----------

function renderList(shown) {
  const list = shown.filter((e) => state.past || e.e >= today);
  const wrap = el('div', { class: 'list' });
  if (list.length === 0) {
    const text = state.past
      ? 'No events match these filters.'
      : 'No upcoming events match these filters. Tick “Show past events” to see earlier ones.';
    wrap.append(el('p', { class: 'empty card', text }));
  }
  let key = '';
  let rows;
  for (const e of list) {
    const k = `${e.s.getFullYear()}-${e.s.getMonth()}`;
    if (k !== key) {
      key = k;
      wrap.append(el('h3', { text: `${MONTHS[e.s.getMonth()]} ${e.s.getFullYear()}` }));
      rows = el('ul', { class: 'rows' });
      wrap.append(rows);
    }
    const days = sameDay(e.s, e.e) ? String(e.s.getDate()) : `${e.s.getDate()}–${e.e.getDate()}`;
    rows.append(
      el(
        'li',
        { class: `row c-${e.color}${e.e < today ? ' past' : ''}` },
        el(
          'div',
          { class: 'when' },
          el('span', { class: 'm', text: MONTHS[e.s.getMonth()].slice(0, 3) }),
          el('span', { class: 'd', text: days }),
        ),
        el(
          'div',
          {},
          el(
            'h4',
            {},
            el('button', { type: 'button', text: e.name, onclick: () => openDetails(e) }),
          ),
          el(
            'p',
            { class: 'meta' },
            el('span', { class: 'tag', text: tagText(e) }),
            where(e),
            e.unconfirmed ? ' · dates not yet on their site' : '',
          ),
        ),
        el('a', {
          class: 'button',
          href: e.url,
          rel: 'noreferrer',
          target: '_blank',
          text: 'Website',
          'aria-label': `${e.name} website`,
        }),
      ),
    );
  }
  $('calendar').replaceChildren(wrap);
  return list.length;
}

// ---------- not-yet-dated and website list ----------

function renderTbd() {
  const items = TBD.filter((t) =>
    t.kind === 'larp'
      ? state.show !== 'con' && state.larps.has(t.larp)
      : state.show !== 'larp' &&
        state.states.has(t.state) &&
        t.styles.some((s) => state.styles.has(s)),
  );
  $('tbd').hidden = items.length === 0;
  $('tbd-list').replaceChildren(
    ...items.map((t) =>
      el(
        'li',
        {},
        el('a', { href: t.url, rel: 'noreferrer', target: '_blank', text: t.name }),
        ` — ${t.when}${t.kind === 'con' ? ` · ${t.city}, ${t.state}` : ''}`,
      ),
    ),
  );
}

function renderSources() {
  const cons = new Map();
  for (const e of [...EVENTS, ...TBD])
    if (e.kind === 'con' && !cons.has(e.name)) cons.set(e.name, e);
  const link = (name, url, extra) =>
    el(
      'div',
      {},
      el('a', { href: url, rel: 'noreferrer', target: '_blank', text: name }),
      extra ? ` — ${extra}` : '',
    );
  $('source-list').replaceChildren(
    el('h3', { text: 'LARPs' }),
    ...LARPS.map((l) => link(l.name, l.site, `${l.where}. ${l.blurb}`)),
    el('h3', { text: 'Conventions' }),
    ...[...cons.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => link(c.name, c.site || c.url, `${c.city}, ${c.state}`)),
  );
}

// ---------- main ----------

function render() {
  renderFilters();
  const shown = events.filter(visible);
  $('month-nav').hidden = state.view !== 'month';
  $('past-label').hidden = state.view !== 'list';
  const n = state.view === 'month' ? renderMonth(shown) : renderList(shown);
  $('count').textContent =
    state.view === 'month'
      ? `${n} event${n === 1 ? '' : 's'} this month`
      : `${n} event${n === 1 ? '' : 's'} listed`;
  renderTbd();
  writeUrl();
}

function moveMonth(by) {
  state.month = new Date(state.month.getFullYear(), state.month.getMonth() + by, 1);
  render();
}

$('prev').addEventListener('click', () => moveMonth(-1));
$('next').addEventListener('click', () => moveMonth(1));
$('today').addEventListener('click', () => {
  state.month = new Date(today.getFullYear(), today.getMonth(), 1);
  render();
});
$('past').addEventListener('change', (ev) => {
  state.past = ev.target.checked;
  render();
});

readUrl();
$('past').checked = state.past;
$('updated').textContent = `Dates last checked ${day(UPDATED).toLocaleDateString('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
})}. They are copied by hand from each game’s and convention’s own website, so check their site before you make plans.`;
renderSources();
render();
