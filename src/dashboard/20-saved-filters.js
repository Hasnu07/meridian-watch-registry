// 20-saved-filters.js — quick filters + saved views on the Watches page
// Part of the dashboard script: scripts/build.js concatenates src/dashboard/*.js
// in filename order into public/js/dashboard.js (one classic script, so
// functions and top-level variables stay shared exactly as before).

// Built-in quick filters (one click, shows how many match)
const QUICK_FILTERS = [
  { id: 'waiting30', label: 'Waiting 30+ days',   icon: 'hourglass_top', test: w => w.status === 'wishlist' && (wishlistDays(w) ?? 0) >= 30 },
  { id: 'soldMonth', label: 'Sold this month',    icon: 'sell',          test: w => w.status === 'sold' && isThisMonth(watchDate(w)) },
  { id: 'held60',    label: 'Unsold 60+ days',    icon: 'inventory_2',   test: w => w.status === 'purchased' && (daysSince(watchDate(w)) ?? 0) >= 60 },
  { id: 'noPrice',   label: 'No price',           icon: 'money_off',     test: w => w.status !== 'sold' && w.list_price == null },
  { id: 'noPhoto',   label: 'No photo',           icon: 'hide_image',    test: w => !w.image_path },
];

// { id } of a quick filter or a saved view; null = none
let activeQuickFilter = null;
let _savingView = false;

function loadSavedViews() {
  try {
    const v = JSON.parse(localStorage.getItem('meridian.savedViews') || '[]');
    return Array.isArray(v) ? v.filter(x => x && x.id && x.label) : [];
  } catch { return []; }
}
function storeSavedViews(list) {
  try { localStorage.setItem('meridian.savedViews', JSON.stringify(list)); } catch {}
}

function applyQuickFilter(list) {
  const f = activeQuickFilter && QUICK_FILTERS.find(q => q.id === activeQuickFilter.id);
  return f ? list.filter(f.test) : list;     // saved views filter via status + search
}

function renderQuickFilterBar() {
  const bar = document.getElementById('quickFilterBar');
  if (!bar) return;
  const views = loadSavedViews();
  const activeId = activeQuickFilter?.id;
  const chip = (id, label, icon, count) => `
    <button type="button" class="qf-chip${activeId === id ? ' is-on' : ''}" data-qf="${esc(id)}" aria-pressed="${activeId === id}">
      <span class="material-symbols-outlined">${icon}</span>${esc(label)}${count != null ? `<span class="qf-count">${count}</span>` : ''}
    </button>`;
  bar.innerHTML = `
    <span class="text-[11px] font-semibold uppercase tracking-[0.06em] text-outline mr-1">Quick filters</span>
    ${QUICK_FILTERS.map(f => chip(f.id, f.label, f.icon, allWatches.filter(f.test).length)).join('')}
    ${views.length ? '<span class="qf-divider" aria-hidden="true"></span>' : ''}
    ${views.map(v => `<span class="qf-chip-group">${chip(v.id, v.label, 'bookmark', null)}<button type="button" class="qf-remove" data-qf-remove="${esc(v.id)}" aria-label="Delete saved view ${esc(v.label)}" title="Delete view"><span class="material-symbols-outlined">close</span></button></span>`).join('')}
    ${_savingView
      ? `<form class="qf-save-form" data-qf-save-form>
           <input type="text" maxlength="40" required placeholder="Name this view…" aria-label="Name for the saved view" autocomplete="off" data-lpignore="true" data-1p-ignore data-bwignore>
           <button type="submit" class="qf-chip is-on">Save</button>
           <button type="button" class="qf-chip" data-qf-cancel>Cancel</button>
         </form>`
      : `<button type="button" class="qf-chip qf-add" data-qf-add title="Save the current tab, search and sort as a view"><span class="material-symbols-outlined">bookmark_add</span>Save view</button>`}
    ${activeId ? '<button type="button" class="qf-clear" data-qf-clear>Clear filter</button>' : ''}`;
  if (_savingView) bar.querySelector('[data-qf-save-form] input')?.focus();
}

function applySavedView(v) {
  activeQuickFilter = { id: v.id };
  setWatchStatusTab(v.status || '');
  if (v.sort) setSort('watches', v.sort, { render: false });
  const search = document.getElementById('watchSearch');
  search.value = v.q || ''; search.dataset.typed = v.q || '';
  watchPage = 1;
  loadWatches(v.q || '', '');
}

document.getElementById('quickFilterBar').addEventListener('click', e => {
  const remove = e.target.closest('[data-qf-remove]');
  if (remove) {
    e.stopPropagation();
    storeSavedViews(loadSavedViews().filter(v => v.id !== remove.dataset.qfRemove));
    if (activeQuickFilter?.id === remove.dataset.qfRemove) activeQuickFilter = null;
    renderWatches();
    return;
  }
  if (e.target.closest('[data-qf-add]'))    { _savingView = true;  renderQuickFilterBar(); return; }
  if (e.target.closest('[data-qf-cancel]')) { _savingView = false; renderQuickFilterBar(); return; }
  if (e.target.closest('[data-qf-clear]'))  { activeQuickFilter = null; watchPage = 1; renderWatches(); return; }
  const chip = e.target.closest('[data-qf]');
  if (!chip) return;
  const id = chip.dataset.qf;
  if (activeQuickFilter?.id === id) { activeQuickFilter = null; watchPage = 1; renderWatches(); return; }   // click again = off
  const saved = loadSavedViews().find(v => v.id === id);
  if (saved) { applySavedView(saved); return; }
  activeQuickFilter = { id };
  setWatchStatusTab('');            // quick filters look across every status
  watchPage = 1;
  renderWatches();
});
document.getElementById('quickFilterBar').addEventListener('submit', e => {
  const form = e.target.closest('[data-qf-save-form]');
  if (!form) return;
  e.preventDefault();
  const label = form.querySelector('input').value.trim();
  if (!label) return;
  const view = {
    id: 'view-' + Date.now().toString(36),
    label,
    status: watchStatusFilter || '',
    q: (document.getElementById('watchSearch').value || '').trim(),
    sort: getSort('watches'),
  };
  storeSavedViews([...loadSavedViews(), view]);
  _savingView = false;
  activeQuickFilter = { id: view.id };
  renderWatches();
});
