// 27-close-deals.js — closing a deal, and the closed / about-to-close figures
// Part of the dashboard script: scripts/build.js concatenates src/dashboard/*.js
// in filename order into public/js/dashboard.js (one classic script, so
// functions and top-level variables stay shared exactly as before).
//
// A deal is CLOSED when a person closes it (Close on a client's membership
// card → pick the watches → Close). Only sold watches close. ABOUT TO CLOSE is
// derived, never stored: a sold watch not yet closed with nothing outstanding
// on either side — no loss still owed, nothing left to pay the client, nothing
// left to withdraw for me — so the only thing missing is the click.

const isClosedDeal = w => w.status === 'sold' && !!w.closed_at;

// What the deal was worth: the sale price, or the client price of a handover.
function dealAmount(w) {
  if (w.sale_price != null) return w.sale_price;
  if (w.market_price != null && watchRule(w, w.profile) === 'discount') return discountCalc(w, w.profile || w).clientPrice || 0;
  return 0;
}

// Sold, not closed, nothing outstanding either way. `w.profile` must be set.
function isReadyToClose(w) {
  if (w.status !== 'sold' || w.closed_at) return false;
  if (w.list_price == null) return false;
  if (Math.max(0, watchPayoutBalance(w, 'client').remaining) > 0.5) return false;
  if (Math.max(0, watchPayoutBalance(w, 'my').remaining) > 0.5) return false;
  if (watchRule(w, w.profile) === 'discount') {
    const d = discountCalc(w, w.profile || w);
    if (d.isLoss && d.outstanding > 0.5) return false;
  }
  return true;
}

// { closed: { n, money }, ready: { n, money } } over watches with `profile` set
function closeDealStats(watches) {
  const out = { closed: { n: 0, money: {} }, ready: { n: 0, money: {} } };
  const add = (b, w) => { b.n++; const c = w.currency || 'CHF'; b.money[c] = (b.money[c] || 0) + dealAmount(w); };
  for (const w of watches) {
    if (isClosedDeal(w)) add(out.closed, w);
    else if (isReadyToClose(w)) add(out.ready, w);
  }
  return out;
}

const closedChip = w => isClosedDeal(w)
  ? `<span class="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-white/[0.04] text-on-surface-variant border border-outline-variant/30" title="Closed ${w.closed_at ? fmt.date(String(w.closed_at).slice(0, 10)) : ''}${w.closed_by ? ' by ' + esc(w.closed_by) : ''}"><span class="material-symbols-outlined text-[12px]">lock</span>Closed</span>`
  : '';

// ── Close mode on a membership card ────────────────────────────────────────
// One card at a time: the Close button turns the card's watch list into a
// pick list (sold, open watches only), with the action bar on top.
let _closeMode = { profileId: null, ids: new Set() };

function closeModeFor(profileId) { return _closeMode.profileId === profileId; }

function enterCloseMode(profileId) {
  _closeMode = { profileId, ids: new Set() };
  rerenderMembershipCard(profileId);
}
function exitCloseMode() {
  const id = _closeMode.profileId;
  _closeMode = { profileId: null, ids: new Set() };
  if (id != null) rerenderMembershipCard(id);
}
function toggleCloseSelect(watchId) {
  if (_closeMode.ids.has(watchId)) _closeMode.ids.delete(watchId); else _closeMode.ids.add(watchId);
  updateCloseBar();
}
function selectAllClosable(profileId) {
  const m = (_currentClientData?.memberships || []).find(x => x.id === profileId);
  const all = (m?.watches || []).filter(w => w.status === 'sold' && !w.closed_at).map(w => w.id);
  const every = all.length && all.every(id => _closeMode.ids.has(id));
  _closeMode.ids = new Set(every ? [] : all);
  rerenderMembershipCard(profileId);
}
function updateCloseBar() {
  const n = _closeMode.ids.size;
  const cnt = document.getElementById('closeBarCount'); if (cnt) cnt.textContent = n ? `${n} selected` : 'Nothing selected yet';
  const btn = document.getElementById('closeBarBtn');   if (btn) { btn.disabled = !n; btn.textContent = n ? `Close ${n} watch${n !== 1 ? 'es' : ''}` : 'Close'; }
  document.querySelectorAll('[data-close-row]').forEach(tr => tr.classList.toggle('bg-primary/5', _closeMode.ids.has(Number(tr.dataset.closeRow))));
}
async function closeSelectedWatches() {
  const ids = [..._closeMode.ids];
  if (!ids.length) return;
  const btn = document.getElementById('closeBarBtn'); if (btn) btn.disabled = true;
  try {
    for (const id of ids) await api('PUT', `/api/watches/${id}/close`, { closed: true });
    _closeMode = { profileId: null, ids: new Set() };
    if (currentPage === 'client-detail') await openClientDetail(currentClientId);
  } catch (e) { alert(e.message); if (btn) btn.disabled = false; }
}
async function reopenWatch(id) {
  try {
    await api('PUT', `/api/watches/${id}/close`, { closed: false });
    if (currentPage === 'client-detail') await openClientDetail(currentClientId);
    else if (currentPage === 'profile-detail') openProfileDetail(currentProfileId);
    else if (currentPage === 'watches') loadWatches();
  } catch (e) { alert(e.message); }
}

// Redraw one membership card in place (the client page keeps the rest)
function rerenderMembershipCard(profileId) {
  const client = _currentClientData;
  const m = (client?.memberships || []).find(x => x.id === profileId);
  const el = document.getElementById(`membershipCard-${profileId}`);
  if (!client || !m || !el) return;
  el.outerHTML = renderMembershipCard(client, m, client.master_id);
}

// The action bar shown above the watch list while picking
function closeBarHtml(profileId, watches) {
  const closable = watches.filter(w => w.status === 'sold' && !w.closed_at).length;
  const n = _closeMode.ids.size;
  return `
    <div class="px-8 py-3 border-b border-primary/20 bg-primary/5 flex items-center gap-3 flex-wrap">
      <span class="material-symbols-outlined text-primary text-[18px]">checklist</span>
      <p class="text-sm text-on-surface">Pick the deals to close <span class="text-on-surface-variant">· ${closable ? `${closable} sold watch${closable !== 1 ? 'es' : ''} can be closed` : 'no sold, open watches here'}</span></p>
      <span id="closeBarCount" class="text-xs font-mono text-on-surface-variant">${n ? `${n} selected` : 'Nothing selected yet'}</span>
      <span class="flex-1"></span>
      ${closable ? `<button type="button" onclick="selectAllClosable(${profileId})" class="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant px-3 py-2 border border-outline-variant/30 rounded-lg hover:bg-surface-variant/30 transition-all">${n && n === closable ? 'Clear' : 'Select all'}</button>` : ''}
      <button type="button" onclick="exitCloseMode()" class="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant px-3 py-2 border border-outline-variant/30 rounded-lg hover:bg-surface-variant/30 transition-all">Cancel</button>
      <button type="button" id="closeBarBtn" onclick="closeSelectedWatches()" ${n ? '' : 'disabled'} class="text-[11px] font-semibold uppercase tracking-wider bg-primary text-on-primary px-4 py-2 rounded-lg hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all">${n ? `Close ${n} watch${n !== 1 ? 'es' : ''}` : 'Close'}</button>
    </div>`;
}

// The pick cell at the start of each row while picking
function closePickCell(w) {
  const can = w.status === 'sold' && !w.closed_at;
  return `<td class="pl-8 pr-0 py-4 w-10 align-middle">${can
    ? `<input type="checkbox" aria-label="Close ${esc(w.model)}" ${_closeMode.ids.has(w.id) ? 'checked' : ''} onchange="toggleCloseSelect(${w.id})" class="w-4 h-4 accent-[var(--md-sys-color-primary,#22d3ee)] cursor-pointer">`
    : `<span class="material-symbols-outlined text-outline/40 text-[16px]" title="${w.closed_at ? 'Already closed' : 'Only a sold watch can be closed'}">${w.closed_at ? 'lock' : 'block'}</span>`}</td>`;
}

// Tile pair for the Vault and Main KPI
function closeDealTiles(stats, tile) {
  return [
    tile('Closed deals', stats.closed.n ? fmt.byCurrency(stats.closed.money) : '—', stats.closed.n ? `${stats.closed.n} deal${stats.closed.n !== 1 ? 's' : ''} closed` : 'none closed yet', 'closed'),
    tile('About to close', stats.ready.n ? fmt.byCurrency(stats.ready.money) : '—', stats.ready.n ? `${stats.ready.n} settled, waiting to be closed` : 'nothing waiting', 'ready'),
  ];
}
