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
  ? `<span class="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-white/[0.04] text-on-surface-variant border border-outline-variant/30 ${w.package_id ? 'cursor-pointer hover:border-primary/40' : ''}" ${w.package_id ? `onclick="event.stopPropagation(); openPackageReport(${w.package_id})"` : ''} title="Closed ${w.closed_at ? fmt.date(String(w.closed_at).slice(0, 10)) : ''}${w.closed_by ? ' by ' + esc(w.closed_by) : ''}${w.package_id ? ' · in a package — click for the report' : ''}"><span class="material-symbols-outlined text-[12px]">lock</span>Closed</span>`
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
  const name = (document.getElementById('closeBarName')?.value || '').trim();
  try {
    // The watches closed together become one package
    await api('POST', `/api/profiles/${_closeMode.profileId}/packages`, { watch_ids: ids, name });
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
      <label class="flex items-center gap-2 text-[11px] uppercase tracking-wider text-on-surface-variant"><span>Package</span>
        <input id="closeBarName" type="text" placeholder="name, e.g. Hettich · Nov 2026" value="${esc(_closeMode.name || '')}" oninput="_closeMode.name = this.value" class="bg-surface-container-lowest border border-outline-variant/30 rounded-lg px-3 py-2 text-on-surface text-sm w-56 max-w-full focus:outline-none focus:ring-1 focus:ring-primary normal-case tracking-normal"></label>
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


// ── Packages: the report the business reads ────────────────────────────────
// Mirrors the wallet sheet: per shop, each package as a block of lines —
// date · stock | reference · list · sale · profit or loss — then the
// repayments the client made, the loss held by my side, and the package's
// total. Open sold watches sit above the packages as "Pending to receive".

// One watch's raw profit or loss: sale − list (a handover: market − list)
function pkgLinePnl(w, profile) {
  if (w.status !== 'sold' || w.list_price == null) return null;
  if (watchRule(w, profile) === 'discount') {
    const d = discountCalc(w, profile || w);
    return (d.isProfit || w.sale_price != null) ? d.rawDiff : null;
  }
  return w.sale_price == null ? null : w.sale_price - w.list_price + splitHandoverDisc(w);
}
const pkgSalePrice = (w, profile) => (w.status === 'sold' && w.market_price != null && watchRule(w, profile) === 'discount')
  ? discountCalc(w, profile || w).clientPrice : w.sale_price;
const pkgRef = w => [w.stock_number, w.reference_number || w.model].filter(Boolean).join(' | ');

// The lines and totals of one package
function packageReport(pkg, profile) {
  const cur = dominantCurrency(pkg.watches || []);
  const lines = [];
  let made = 0, lost = 0, repaid = 0;
  for (const w of pkg.watches || []) {
    const pnl = pkgLinePnl(w, profile) ?? 0;
    if (pnl > 0) made += pnl; else lost += pnl;
    lines.push({ kind: 'watch', w, date: w.purchase_date, label: pkgRef(w), list: w.list_price, sale: pkgSalePrice(w, profile), pnl });
    for (const lp of (w.loss_payments || []).filter(x => !x.reversed)) {
      repaid += lp.amount || 0;
      lines.push({ kind: 'repay', date: lp.date, label: lp.method === 'OFFSET' ? `Recovered by offset${lp.notes ? ' · ' + lp.notes : ''}` : 'He paid his part of the loss', pnl: lp.amount || 0, sub: pkgRef(w) });
    }
  }
  const held = Number(pkg.loss_held_by_me || 0);
  if (held) lines.push({ kind: 'held', label: 'Loss held by my side', pnl: -held });
  const total = made + lost + repaid - held;
  return { cur, lines, made, lost, repaid, held, total };
}

// Every package of a membership, summed
function membershipPackageTotals(m) {
  const t = { n: 0, made: 0, lost: 0, total: 0, cur: dominantCurrency(m.watches || []) };
  for (const pkg of m.packages || []) { const r = packageReport(pkg, m); t.n++; t.made += r.made; t.lost += r.lost; t.total += r.total; }
  return t;
}

const pnlCell = (v, cur, cls = 'text-sm') => v == null ? `<span class="text-outline">—</span>`
  : `<span class="font-mono ${cls} font-semibold ${v > 0 ? 'text-emerald-400' : v < 0 ? 'text-error' : 'text-on-surface-variant'}">${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt.price(Math.abs(v), cur)}</span>`;

// The Packages section of a membership card (client page)
function renderPackagesSection(m) {
  const pkgs = m.packages || [];
  if (!pkgs.length) return '';
  const t = membershipPackageTotals(m);
  return `
    <div class="px-8 py-5 border-b border-outline-variant/10" style="background:rgba(255,255,255,0.012)">
      <div class="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <p class="text-[11px] uppercase tracking-[0.06em] text-outline font-semibold flex items-center gap-2"><span class="material-symbols-outlined text-[15px]">inventory_2</span>Packages · ${t.n}</p>
        <div class="flex items-center gap-4 text-xs flex-wrap">
          <span class="text-on-surface-variant">Made ${pnlCell(t.made, t.cur, 'text-xs')}</span>
          <span class="text-on-surface-variant">Lost ${pnlCell(t.lost, t.cur, 'text-xs')}</span>
          <span class="text-on-surface-variant">Net ${pnlCell(t.total, t.cur, 'text-xs')}</span>
          <button type="button" onclick="openWalletStatement(${m.client_id || 'null'}, ${m.id})" class="text-[11px] font-semibold uppercase tracking-wider text-primary px-3 py-1.5 border border-primary/30 rounded-lg hover:bg-primary/10 transition-all">Statement</button>
        </div>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
        ${pkgs.map(pkg => { const r = packageReport(pkg, m); return `
        <button type="button" onclick="openPackageReport(${pkg.id})" class="text-left rounded-lg border border-outline-variant/15 bg-white/[0.02] hover:border-primary/40 transition-colors px-4 py-3 flex items-center gap-4">
          <span class="material-symbols-outlined text-on-surface-variant text-[20px]">lock</span>
          <span class="flex-1 min-w-0">
            <span class="block text-sm font-medium text-on-surface truncate">${esc(pkg.name || 'Package closed')}</span>
            <span class="block text-[11px] text-on-surface-variant truncate">${fmt.date(String(pkg.closed_at).slice(0, 10))}${pkg.closed_by ? ` · by ${esc(pkg.closed_by)}` : ''} · ${pkg.watches.length} watch${pkg.watches.length !== 1 ? 'es' : ''}: ${esc(pkg.watches.map(w => w.stock_number || w.reference_number || w.model).join(', '))}</span>
          </span>
          <span class="text-right whitespace-nowrap">
            <span class="block">${pnlCell(r.total, r.cur)}</span>
            <span class="block text-[11px] text-on-surface-variant">${pnlCell(r.made, r.cur, 'text-[11px]')} · ${pnlCell(r.lost, r.cur, 'text-[11px]')}</span>
          </span>
        </button>`; }).join('')}
      </div>
    </div>`;
}

// ── The report modal ─────────────────────────────────────────────────────
function _pkgModalOpen(title, sub, body, actions = '') {
  document.getElementById('packageModalTitle').textContent = title;
  document.getElementById('packageModalSub').textContent = sub;
  document.getElementById('packageModalBody').innerHTML = body;
  document.getElementById('packageModalActions').innerHTML = actions;
  document.getElementById('packageModal').classList.remove('hidden');
}
function closePackageModal() { document.getElementById('packageModal')?.classList.add('hidden'); }

const _stLine = (l, cur) => `
  <tr class="border-b border-outline-variant/10 ${l.kind !== 'watch' ? 'text-on-surface-variant' : ''}">
    <td class="px-3 py-2 text-xs font-mono text-on-surface-variant whitespace-nowrap">${l.date ? fmt.date(String(l.date).slice(0, 10)) : ''}</td>
    <td class="px-3 py-2 text-sm ${l.kind === 'watch' ? 'text-on-surface' : 'italic'}">${esc(l.label)}${l.sub ? `<span class="block text-[11px] font-mono text-outline not-italic">${esc(l.sub)}</span>` : ''}${l.status ? `<span class="block text-[11px] ${l.status === 'Pending to receive' ? 'text-amber-400' : 'text-on-surface-variant'}">${l.status}</span>` : ''}</td>
    <td class="px-3 py-2 text-sm font-mono text-right whitespace-nowrap">${l.list != null ? fmt.price(l.list, cur) : ''}</td>
    <td class="px-3 py-2 text-sm font-mono text-right whitespace-nowrap">${l.sale != null ? fmt.price(l.sale, cur) : ''}</td>
    <td class="px-3 py-2 text-right whitespace-nowrap">${pnlCell(l.pnl, cur)}</td>
  </tr>`;
const _stHead = `
  <thead><tr class="bg-surface-container-low border-b border-outline-variant/10">
    <th class="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-on-surface-variant text-left">Date</th>
    <th class="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-on-surface-variant text-left">Reference</th>
    <th class="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-on-surface-variant text-right">Retail / list</th>
    <th class="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-on-surface-variant text-right">Sale price</th>
    <th class="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-on-surface-variant text-right">Profit / loss</th>
  </tr></thead>`;

function packageBlockHtml(pkg, profile, { editable = false } = {}) {
  const r = packageReport(pkg, profile);
  return `
    <div class="rounded-lg border border-outline-variant/15 overflow-hidden mb-4">
      <div class="px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap" style="background:rgba(245,196,81,0.08)">
        <p class="text-sm font-semibold text-on-surface flex items-center gap-2"><span class="material-symbols-outlined text-[16px] text-amber-300">lock</span>Package closed${pkg.name ? ` · ${esc(pkg.name)}` : ''}</p>
        <p class="text-[11px] text-on-surface-variant">${fmt.date(String(pkg.closed_at).slice(0, 10))}${pkg.closed_by ? ` · by ${esc(pkg.closed_by)}` : ''}</p>
      </div>
      <div class="overflow-x-auto"><table class="w-full text-left min-w-[560px]">${_stHead}<tbody>
        ${r.lines.map(l => _stLine(l, r.cur)).join('')}
        <tr><td colspan="4" class="px-3 py-2.5 text-sm font-semibold text-on-surface text-right">Total profit of package</td><td class="px-3 py-2.5 text-right">${pnlCell(r.total, r.cur, 'text-base')}</td></tr>
      </tbody></table></div>
      ${editable ? `
      <div class="px-4 py-3 border-t border-outline-variant/10 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <label class="block"><span class="block text-[11px] uppercase tracking-wider text-outline mb-1">Package name</span><input id="pkgName-${pkg.id}" type="text" value="${esc(pkg.name || '')}" class="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-lg px-3 py-2 text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-primary"></label>
        <label class="block"><span class="block text-[11px] uppercase tracking-wider text-outline mb-1">Loss held by my side</span><input id="pkgHeld-${pkg.id}" type="number" min="0" step="0.01" value="${pkg.loss_held_by_me || 0}" class="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-lg px-3 py-2 text-on-surface text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"></label>
        <div class="flex items-center gap-2 justify-end">
          <button type="button" onclick="reopenPackage(${pkg.id})" class="text-[11px] font-semibold uppercase tracking-wider text-amber-400 px-3 py-2 border border-amber-400/30 rounded-lg hover:bg-amber-400/10 transition-all">Reopen package</button>
          <button type="button" onclick="savePackage(${pkg.id})" class="text-[11px] font-semibold uppercase tracking-wider bg-primary text-on-primary px-4 py-2 rounded-lg hover:brightness-110 transition-all">Save</button>
        </div>
      </div>` : ''}
    </div>`;
}

// One package, with its name and the loss held by my side editable
async function openPackageReport(pkgId) {
  let pkg;
  try { pkg = await api('GET', `/api/packages/${pkgId}`); } catch (e) { alert(e.message); return; }
  const profile = (_currentClientData?.memberships || []).find(m => m.id === pkg.profile_id)
    || await api('GET', `/api/profiles/${pkg.profile_id}`).catch(() => null);
  const r = packageReport(pkg, profile);
  _pkgModalOpen(pkg.name || 'Package closed', `${profile?.shop_name ? profile.shop_name + ' · ' : ''}${profile?.name || ''} · ${pkg.watches.length} watch${pkg.watches.length !== 1 ? 'es' : ''} · made ${fmt.price(r.made, r.cur)} · lost ${fmt.price(Math.abs(r.lost), r.cur)}`,
    packageBlockHtml(pkg, profile, { editable: true }));
}
async function savePackage(pkgId) {
  const name = document.getElementById(`pkgName-${pkgId}`)?.value.trim();
  const held = Number(document.getElementById(`pkgHeld-${pkgId}`)?.value || 0);
  try {
    await api('PUT', `/api/packages/${pkgId}`, { name, loss_held_by_me: held });
    closePackageModal();
    if (currentPage === 'client-detail') await openClientDetail(currentClientId);
  } catch (e) { alert(e.message); }
}
async function reopenPackage(pkgId) {
  showConfirm('Reopen this package? Its watches go back to open deals; nothing else changes.', async () => {
    await api('DELETE', `/api/packages/${pkgId}`);
    closePackageModal();
    if (currentPage === 'client-detail') await openClientDetail(currentClientId);
  });
}

// The whole wallet, as the sheet: Remaining on top, then every shop with its
// pending lines and its packages. `onlyProfileId` narrows it to one shop.
function openWalletStatement(clientId, onlyProfileId) {
  const client = _currentClientData;
  if (!client) return;
  const memberships = (client.memberships || []).filter(m => !onlyProfileId || m.id === onlyProfileId);
  let remaining = {}, made = {}, lost = {};
  const addTo = (map, cur, v) => { map[cur] = (map[cur] || 0) + v; };
  const blocks = memberships.map(m => {
    const cur = dominantCurrency(m.watches || []);
    const p = computePnl(m);
    addTo(remaining, cur, p.lossOutstanding);
    const t = membershipPackageTotals(m);
    addTo(made, cur, t.made); addTo(lost, cur, t.lost);
    const pending = (m.watches || []).filter(w => w.status === 'sold' && !w.closed_at).map(w => {
      const d = watchRule(w, m) === 'discount' ? discountCalc(w, m) : null;
      const open = d?.isLoss ? d.outstanding : 0;
      return { kind: 'watch', w, date: w.purchase_date, label: pkgRef(w), list: w.list_price, sale: pkgSalePrice(w, m), pnl: pkgLinePnl(w, m),
               status: open > 0.5 ? 'Pending to receive' : (isReadyToClose({ ...w, profile: m }) ? 'Settled · about to close' : 'Open') };
    });
    return `
      <div class="mb-6">
        <div class="px-4 py-2 rounded-lg mb-3 flex items-center justify-between gap-3 flex-wrap" style="background:rgba(245,196,81,0.14)">
          <p class="text-sm font-semibold text-on-surface">${esc(m.shop_name || 'Unassigned')}</p>
          <p class="text-[11px] text-on-surface-variant">${t.n} package${t.n !== 1 ? 's' : ''} · made ${fmt.price(t.made, cur)} · lost ${fmt.price(Math.abs(t.lost), cur)} · open losses ${fmt.price(p.lossOutstanding, cur)}</p>
        </div>
        ${pending.length ? `<div class="rounded-lg border border-outline-variant/15 overflow-hidden mb-4"><div class="overflow-x-auto"><table class="w-full text-left min-w-[560px]">${_stHead}<tbody>${pending.map(l => _stLine(l, cur)).join('')}</tbody></table></div></div>` : ''}
        ${(m.packages || []).map(pkg => packageBlockHtml(pkg, m)).join('')}
        ${!pending.length && !(m.packages || []).length ? '<p class="text-sm text-on-surface-variant px-2">No sold watches at this shop yet.</p>' : ''}
      </div>`;
  }).join('');
  const head = `
    <div class="flex items-start justify-between gap-4 flex-wrap mb-5 px-1">
      <div class="text-xs text-on-surface-variant">
        <p>Made on packages <span class="font-mono text-emerald-400">${fmt.byCurrency(made)}</span> · lost <span class="font-mono text-error">${fmt.byCurrency(lost)}</span></p>
        <p class="mt-1">A loss stays "pending to receive" until the client pays it back or it is taken off a good watch.</p>
      </div>
      <div class="text-right">
        <p class="text-[11px] uppercase tracking-[0.06em] text-on-surface-variant font-semibold">Remaining · losses still open</p>
        <p class="font-playfair text-2xl ${Object.values(remaining).some(v => v > 0) ? 'text-amber-300' : 'text-emerald-400'}">${fmt.byCurrency(remaining)}</p>
      </div>
    </div>`;
  _pkgModalOpen(`${client.name} · Wallet`, onlyProfileId ? (memberships[0]?.shop_name || '') : `${memberships.length} shop${memberships.length !== 1 ? 's' : ''}`, head + blocks);
}

document.getElementById('closePackageModal')?.addEventListener('click', closePackageModal);
document.getElementById('packageModal')?.addEventListener('click', e => { if (e.target === e.currentTarget) closePackageModal(); });
