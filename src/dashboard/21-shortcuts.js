// 21-shortcuts.js — keyboard shortcuts (g-then-letter navigation, n, v, ?)
// Part of the dashboard script: scripts/build.js concatenates src/dashboard/*.js
// in filename order into public/js/dashboard.js (one classic script, so
// functions and top-level variables stay shared exactly as before).

const GOTO_KEYS = {
  v: ['dashboard',  'Vault'],
  s: ['shops',      'Shops'],
  p: ['portfolios', 'Portfolios'],
  k: ['main-kpi',   'Main KPI'],
  c: ['profiles',   'Clients'],
  w: ['watches',    'Watches'],
  d: ['desk',       'Patek Desk'],
  m: ['messages',   'Messages'],
  ',': ['settings', 'Settings'],
};
// Which layout toggle "v" flips on each page
const PAGE_VIEW_KEY = { profiles: 'clients', watches: 'watches', shops: 'shops', portfolios: 'portfolios', 'shop-detail': 'shopDetail', 'portfolio-detail': 'portfolioDetail' };

let _gPending = false, _gTimer = null;

function isTypingTarget(el) {
  return el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}
function anyModalOpen() {
  return !!document.querySelector('.modal-backdrop:not(.hidden)') || !document.getElementById('lightbox')?.classList.contains('hidden');
}

// "n" = the page's main "new" action
function newItemForPage() {
  const btn = { profiles: 'addProfileBtn', shops: 'addShopBtn', 'shop-detail': 'addPortfolioBtn' }[currentPage];
  if (btn && !document.getElementById(btn).classList.contains('hidden')) document.getElementById(btn).click();
  else openAddWatch(null);
}

function showGoHint(on) {
  let hint = document.getElementById('goHint');
  if (!hint) {
    hint = document.createElement('div');
    hint.id = 'goHint';
    hint.className = 'go-hint';
    hint.setAttribute('role', 'status');
    hint.innerHTML = `<span class="kbd">g</span> then ${Object.entries(GOTO_KEYS).map(([k, [, label]]) => `<span class="kbd">${k}</span> ${label}`).join(' · ')}`;
    document.body.appendChild(hint);
  }
  hint.classList.toggle('is-on', on);
}

function openShortcutsHelp() {
  let modal = document.getElementById('shortcutsModal');
  if (!modal) {
    const row = (keys, label) => `<div class="flex items-center justify-between gap-4 py-2 border-b border-outline-variant/30 last:border-0">
        <span class="text-sm text-on-surface">${label}</span><span class="flex items-center gap-1 flex-shrink-0">${keys}</span></div>`;
    const k = s => `<span class="kbd kbd-lg">${s}</span>`;
    modal = document.createElement('div');
    modal.id = 'shortcutsModal';
    modal.className = 'fixed inset-0 z-[120] hidden flex items-center justify-center modal-backdrop p-4';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'shortcutsTitle');
    modal.innerHTML = `
      <div class="w-full max-w-2xl bg-surface-container border border-outline-variant rounded-lg shadow-2xl overflow-hidden">
        <div class="px-6 py-4 border-b border-outline-variant/40 flex items-center justify-between">
          <h2 id="shortcutsTitle" class="text-lg font-semibold text-on-surface flex items-center gap-2"><span class="material-symbols-outlined text-primary">keyboard</span>Keyboard shortcuts</h2>
          <button type="button" data-close-shortcuts class="p-2 rounded-lg text-outline hover:text-on-surface hover:bg-white/5" aria-label="Close"><span class="material-symbols-outlined">close</span></button>
        </div>
        <div class="grid sm:grid-cols-2 gap-x-8 px-6 py-4">
          <div>
            <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-outline mb-1">Go to</p>
            ${Object.entries(GOTO_KEYS).map(([key, [, label]]) => row(k('g') + k(key), label)).join('')}
          </div>
          <div>
            <p class="text-[11px] font-semibold uppercase tracking-[0.06em] text-outline mb-1">Actions</p>
            ${row(k('/'), 'Search')}
            ${row(k('n'), 'New (watch, client, shop or portfolio for this page)')}
            ${row(k('v'), 'Switch list / cards')}
            ${row(k('?'), 'Show this list')}
            ${row(k('Esc'), 'Close a dialog or leave search')}
          </div>
        </div>
        <p class="px-6 pb-4 text-xs text-outline">Shortcuts pause while you are typing in a box.</p>
      </div>`;
    modal.addEventListener('click', e => { if (e.target === modal || e.target.closest('[data-close-shortcuts]')) closeShortcutsHelp(); });
    document.body.appendChild(modal);
  }
  modal.classList.remove('hidden');
  modal.querySelector('[data-close-shortcuts]').focus();
}
function closeShortcutsHelp() {
  document.getElementById('shortcutsModal')?.classList.add('hidden');
}

document.getElementById('shortcutsBtn')?.addEventListener('click', openShortcutsHelp);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeShortcutsHelp(); _gPending = false; showGoHint(false); return; }
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
  if (isTypingTarget(e.target)) return;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

  if (key === '?' || (key === '/' && e.shiftKey)) { e.preventDefault(); openShortcutsHelp(); return; }
  if (anyModalOpen()) return;          // don't navigate away from an open dialog

  if (_gPending) {
    _gPending = false; clearTimeout(_gTimer); showGoHint(false);
    const target = GOTO_KEYS[key];
    if (target) { e.preventDefault(); showPage(target[0]); }
    return;
  }
  if (key === 'g') {
    _gPending = true; showGoHint(true);
    clearTimeout(_gTimer);
    _gTimer = setTimeout(() => { _gPending = false; showGoHint(false); }, 1500);
    return;
  }
  if (key === 'n') { e.preventDefault(); newItemForPage(); return; }
  if (key === 'v') {
    const viewKey = PAGE_VIEW_KEY[currentPage];
    if (viewKey) { e.preventDefault(); setView(viewKey, getView(viewKey) === 'list' ? 'cards' : 'list'); }
  }
});
