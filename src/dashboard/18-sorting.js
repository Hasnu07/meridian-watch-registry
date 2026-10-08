// 18-sorting.js — screener-style sorting (sort menus, clickable headers)
// Part of the dashboard script: scripts/build.js concatenates src/dashboard/*.js
// in filename order into public/js/dashboard.js (one classic script, so
// functions and top-level variables stay shared exactly as before).

// Each scope keeps a "key:dir" sort, remembered per browser like the layout toggle.
const SORT_OPTIONS = {
  watches: [
    ['date:desc',    'Newest first'],
    ['date:asc',     'Oldest first'],
    ['price:desc',   'Price: high → low'],
    ['price:asc',    'Price: low → high'],
    ['pnl:desc',     'P&L: best first'],
    ['pnl:asc',      'P&L: worst first'],
    ['waiting:desc', 'Waiting longest'],
    ['model:asc',    'Model A → Z'],
  ],
  clients: [
    ['name:asc',     'Name A → Z'],
    ['name:desc',    'Name Z → A'],
    ['watches:desc', 'Most watches'],
    ['watches:asc',  'Fewest watches'],
    ['shops:desc',   'Most shops'],
    ['since:desc',   'Newest first'],
    ['since:asc',    'Oldest first'],
  ],
  shops:      [['name:asc', 'Name A → Z'], ['portfolios:desc', 'Most portfolios'], ['clients:desc', 'Most clients']],
  portfolios: [['name:asc', 'Name A → Z'], ['shop:asc', 'Shop A → Z'], ['clients:desc', 'Most clients'], ['watches:desc', 'Most watches']],
};
const SORT_DEFAULTS = { watches: 'date:desc', clients: 'name:asc', shops: 'name:asc', portfolios: 'name:asc' };
// Direction a column starts in when first clicked: text A→Z, numbers/dates biggest first
const SORT_FIRST_DIR = { name: 'asc', model: 'asc', shop: 'asc' };
const SORT_RENDERERS = {
  watches:    () => { watchPage = 1; renderWatches(); },
  clients:    () => { clientPage = 1; renderClients(); },
  shops:      () => renderShops(),
  portfolios: () => renderAllPortfolios(),
};
const _sortMemo = {};

function getSort(scope) {
  if (_sortMemo[scope]) return _sortMemo[scope];
  let v = null;
  try { v = localStorage.getItem('meridian.sort.' + scope); } catch {}
  const valid = v && (/^[a-z]+:(asc|desc)$/.test(v));
  return (_sortMemo[scope] = valid ? v : SORT_DEFAULTS[scope]);
}
function setSort(scope, value, { render = true } = {}) {
  _sortMemo[scope] = value;
  try { localStorage.setItem('meridian.sort.' + scope, value); } catch {}
  syncSortControls(scope);
  if (render) SORT_RENDERERS[scope]?.();
}
function syncSortControls(scope) {
  const cur = getSort(scope);
  const [key, dir] = cur.split(':');
  document.querySelectorAll(`select.sort-select[data-sort-scope="${scope}"]`).forEach(sel => {
    if (!sel.options.length) {
      sel.innerHTML = (SORT_OPTIONS[scope] || []).map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('');
    }
    // A header click can pick a combo that isn't in the menu (e.g. Shops low→high)
    if (![...sel.options].some(o => o.value === cur)) {
      const label = `${key[0].toUpperCase() + key.slice(1)} ${dir === 'asc' ? '↑' : '↓'}`;
      sel.querySelector('option[data-custom]')?.remove();
      sel.insertAdjacentHTML('beforeend', `<option value="${cur}" data-custom>${esc(label)}</option>`);
    }
    sel.value = cur;
  });
  document.querySelectorAll(`.sort-th[data-sort-scope="${scope}"]`).forEach(btn => {
    const on = btn.dataset.sortKey === key;
    btn.classList.toggle('is-sorted', on);
    btn.querySelector('.sort-icon').textContent = on ? (dir === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more';
    btn.closest('th')?.setAttribute('aria-sort', on ? (dir === 'asc' ? 'ascending' : 'descending') : 'none');
  });
}

document.addEventListener('change', e => {
  const sel = e.target.closest('select.sort-select[data-sort-scope]');
  if (sel) setSort(sel.dataset.sortScope, sel.value);
});
document.addEventListener('click', e => {
  const btn = e.target.closest('.sort-th[data-sort-scope]');
  if (!btn) return;
  const scope = btn.dataset.sortScope, key = btn.dataset.sortKey;
  const [curKey, curDir] = getSort(scope).split(':');
  const dir = curKey === key ? (curDir === 'asc' ? 'desc' : 'asc') : (SORT_FIRST_DIR[key] || 'desc');
  setSort(scope, `${key}:${dir}`);
});

// Stable sort by a getter; empty values (null/undefined/NaN) always go last
function sortByKey(list, getter, dir) {
  const m = dir === 'asc' ? 1 : -1;
  return list
    .map((item, i) => ({ item, i, v: getter(item) }))
    .sort((a, b) => {
      const ae = a.v == null || a.v === '' || Number.isNaN(a.v), be = b.v == null || b.v === '' || Number.isNaN(b.v);
      if (ae || be) return ae === be ? a.i - b.i : ae ? 1 : -1;
      const c = typeof a.v === 'string' ? a.v.localeCompare(b.v, undefined, { sensitivity: 'base', numeric: true }) : a.v - b.v;
      return c * m || a.i - b.i;
    })
    .map(x => x.item);
}

const WATCH_SORT_KEYS = {
  date:    w => watchDate(w),
  price:   w => (w.status === 'sold' && w.sale_price != null ? w.sale_price : w.list_price) ?? null,
  pnl:     w => watchPnl(w),
  waiting: w => (w.status === 'wishlist' ? wishlistDays(w) : null),
  model:   w => w.model || '',
};
function sortWatchList(list) {
  const [key, dir] = getSort('watches').split(':');
  return sortByKey(list, WATCH_SORT_KEYS[key] || WATCH_SORT_KEYS.date, dir);
}

const CLIENT_SORT_KEYS = {
  name:    c => c.name || '',
  shops:   c => c.membership_count ?? 0,
  watches: c => c.watch_count ?? 0,
  since:   c => c.created_at || '',
};
function sortClientList(list) {
  const [key, dir] = getSort('clients').split(':');
  return sortByKey(list, CLIENT_SORT_KEYS[key] || CLIENT_SORT_KEYS.name, dir);
}

// ── Generic table sorting (Main KPI breakdown, Vault tables) ──────────────
// Any <table data-dom-sort>: click a header to sort its rows by that column.
function cellSortValue(td) {
  const raw = (td?.innerText || '').trim();
  if (!raw || raw === '—') return null;
  // Leading amount/count: "$-101,650.00", "−CHF 2,350", "+£400", "6 watches", "2 portfolios"
  const m = raw.match(/^([+\-−]?)\s*(?:CHF|EUR|GBP|USD|[$£€])?\s*([+\-−]?)\s*(\d[\d,]*(?:\.\d+)?)/i);
  if (m) {
    const neg = /[-−]/.test(m[1] + m[2]);
    const n = parseFloat(m[3].replace(/,/g, ''));
    if (Number.isFinite(n)) return neg ? -n : n;
  }
  return raw.toLowerCase();
}
function domSortTable(table, col, dir) {
  const tbody = table.tBodies[0];
  if (!tbody) return;
  const rows = [...tbody.rows].filter(r => r.cells.length > col && !r.querySelector('td[colspan]'));
  if (rows.length < 2) return;
  const sorted = sortByKey(rows, r => cellSortValue(r.cells[col]), dir);
  sorted.forEach(r => tbody.appendChild(r));
  table.dataset.sortCol = col;
  table.dataset.sortDir = dir;
  [...table.tHead.rows[0].cells].forEach((th, i) => {
    th.setAttribute('aria-sort', i === col ? (dir === 'asc' ? 'ascending' : 'descending') : 'none');
    th.classList.toggle('dom-sorted', i === col);
    th.dataset.sortArrow = i === col ? (dir === 'asc' ? '↑' : '↓') : '';
  });
}
// Re-apply the last sort after a table is re-rendered
function reapplyDomSort(table) {
  if (table?.dataset.sortCol != null && table.dataset.sortCol !== '') domSortTable(table, Number(table.dataset.sortCol), table.dataset.sortDir || 'asc');
}
document.addEventListener('click', e => {
  const th = e.target.closest('table[data-dom-sort] thead th');
  if (!th || !th.textContent.trim()) return;
  const table = th.closest('table');
  const col = th.cellIndex;
  const firstRow = table.tBodies[0]?.rows[0];
  const numeric = typeof cellSortValue(firstRow?.cells[col]) === 'number';
  const dir = Number(table.dataset.sortCol) === col && table.dataset.sortCol !== undefined
    ? (table.dataset.sortDir === 'asc' ? 'desc' : 'asc')
    : (numeric ? 'desc' : 'asc');
  domSortTable(table, col, dir);
});

Object.keys(SORT_OPTIONS).forEach(syncSortControls);
