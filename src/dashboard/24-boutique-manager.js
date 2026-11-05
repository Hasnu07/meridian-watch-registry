// 24-boutique-manager.js — the Boutique Manager role
// A boutique manager is a user a master creates for ONE shop of a registry.
// They have a workspace of their own — shops, clients, watches, exactly as an
// admin — and, on top, a VIEW-ONLY window onto the shop they manage in their
// owner's registry: opened from the Shops page's "Boutique Manager Shops"
// (the shop page with its clients and pieces, every control hidden) or the
// Commissions tab (the commissions the owner shares with them). While that
// window is open (bmShopView, 01-core.js) every request carries
// X-Boutique-Shop and routes/boutique.js answers it stripped down: no stock
// numbers, resale prices, costs, payouts, split rules; a piece is "wishlist"
// or "handed over". On the Shops page the area is called "Shared profiles"
// for them. public/style.css: `html.is-bm` all session (hides the pages that
// are not theirs: Boutique Commission, Patek Desk, Messages, Main KPI),
// `html.role-bm` while in the window (hides every control). Nothing here
// runs for other roles.
// Part of the dashboard script: scripts/build.js concatenates src/dashboard/*.js
// in filename order into public/js/dashboard.js (one classic script, so
// functions and top-level variables stay shared exactly as before).

function isBoutiqueManager() { return currentUser?.role === 'boutique_manager'; }
function bmShopName() { return currentUser?.shop?.name || 'the shop you manage'; }

// Called from refreshCurrentUser() every time the session user is (re)loaded
function applyRoleUi(user) {
  const bm = user?.role === 'boutique_manager';
  document.documentElement.classList.toggle('is-bm', bm);
  if (!bm) setBmView(false);

  const roleLabel = document.getElementById('currentUserRoleLabel');
  if (roleLabel) roleLabel.textContent = bm ? `Boutique Manager · ${user.shop?.name || 'no shop yet'}` : 'Signed in as';

  // Tools → Commissions: the commissions shared with them on the managed shop
  const nav = document.getElementById('navCommissions');
  if (nav) { nav.classList.toggle('hidden', !bm); nav.classList.toggle('flex', bm); }

  // Not theirs (style.css hides the nav items): the owner-side Boutique
  // Commission page, Patek Desk, Messages and Main KPI — nor their shortcuts
  if (bm && typeof GOTO_KEYS !== 'undefined') for (const k of ['b', 'd', 'm', 'k']) delete GOTO_KEYS[k];
}

// Pages a boutique manager does not have fall back to the Vault
const _bmShowPage = showPage;
showPage = function (name) {
  if (isBoutiqueManager() && BM_HIDDEN_PAGES.includes(name)) name = 'dashboard';
  _bmShowPage(name);
};
const BM_HIDDEN_PAGES = ['boutique-commission', 'desk', 'messages', 'main-kpi'];

// The shop they manage, view-only: the shop page under the boutique view
function openBoutiqueShop() {
  if (!isBoutiqueManager() || !currentUser?.shop) return;
  setBmView(true);
  openShopDetail(currentUser.shop.id);
}

// ── Series helpers ─────────────────────────────────────────────────────────

function bmCommissionThisMonth(watches) {
  const m = {};
  for (const w of watches) for (const e of (w.expenses || [])) {
    if (isThisMonth(e.date)) m[e.currency || 'CHF'] = (m[e.currency || 'CHF'] || 0) + Number(e.amount || 0);
  }
  return m;
}
const bmThumb = w => `<div class="w-9 h-9 rounded-md bg-surface-container border border-outline-variant/15 flex items-center justify-center flex-shrink-0 overflow-hidden">
  ${w.image_path ? `<img src="${w.image_path}" alt="" class="w-full h-full object-cover">` : '<span class="material-symbols-outlined text-outline text-[18px]">watch</span>'}</div>`;
const bmCommissionHtml = (w, cls = 'text-xs') => w.commission != null
  ? `<span class="font-mono ${cls} bm-commission">${fmt.price(w.commission, w.commission_currency || w.currency || 'CHF')}</span>`
  : `<span class="${cls} text-outline">—</span>`;

// ── The Vault: "Your boutique" on top ──────────────────────────────────────
// A boutique manager's own registry is often empty; what matters to them is
// the shop they manage. So their Vault opens with that shop — pieces, handed
// over, the commission they have earned, what is still to come, the wishlist
// — read once with the boutique header (no view context, so their own
// workspace underneath loads as usual) and drawn with a little life.

const _bmLoadDashboard = loadDashboard;
loadDashboard = async function () {
  const section = document.getElementById('bmVault');
  if (!isBoutiqueManager() || !currentUser?.shop) { section?.classList.add('hidden'); return _bmLoadDashboard(); }
  section.classList.remove('hidden');
  await Promise.all([
    renderBoutiqueVault().catch(err => { console.error('Boutique vault failed', err); section.innerHTML = `<p class="text-sm text-error">${esc(err.message || 'Could not load your boutique')}</p>`; }),
    _bmLoadDashboard(),
  ]);
};

const bmHeaders = () => ({ 'X-Boutique-Shop': String(currentUser.shop.id) });
const bmSumBy = (list, amount = e => e.amount, cur = e => e.currency || 'CHF') => {
  const m = {}; for (const e of list) m[cur(e)] = (m[cur(e)] || 0) + Number(amount(e) || 0); return m;
};
const bmMain = m => Object.entries(m).sort((a, b) => b[1] - a[1])[0] || ['CHF', 0];

async function renderBoutiqueVault() {
  const section = document.getElementById('bmVault');
  const shop = currentUser.shop;
  const owner = shop.owner_username || 'the owner';
  const [watches, salaries] = await Promise.all([
    api('GET', '/api/watches', null, bmHeaders()),
    api('GET', `/api/shops/${shop.id}/salaries`, null, bmHeaders()).catch(() => []),
  ]);
  watches.forEach(w => { watchCache[w.id] = w; });
  const salary = salaryTotals(salaries);

  const handed = watches.filter(w => w.status === 'handed_over');
  const wish   = watches.filter(w => w.status === 'wishlist').sort((a, b) => (wishlistDays(b) ?? -1) - (wishlistDays(a) ?? -1));
  const entries = watches.flatMap(w => (w.expenses || []).map(e => ({ ...e, watch: w })))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id - a.id);
  const paid = entries.filter(e => e.paid_at), pending = entries.filter(e => !e.paid_at);
  const total = bmSumBy(entries), monthComm = bmSumBy(entries.filter(e => isThisMonth(e.date)));
  const [mainCur, mainTotal] = bmMain(total);
  const paidMain = bmSumBy(paid)[mainCur] || 0, pendingMain = bmSumBy(pending)[mainCur] || 0;
  const paidPct = mainTotal ? Math.round(paidMain / mainTotal * 100) : 0;
  const handedMonth = handed.filter(w => isThisMonth(w.purchase_date));
  const piecesWithComm = new Set(entries.map(e => e.watch.id)).size;
  const longest = wish.reduce((mx, w) => Math.max(mx, wishlistDays(w) ?? 0), 0);
  const waiting30 = wish.filter(w => (wishlistDays(w) ?? 0) >= 30);

  // Top client by commission shared
  const byClient = {};
  for (const e of entries) { const k = e.watch.client_name || '—'; byClient[k] = (byClient[k] || 0) + (((e.currency || 'CHF') === mainCur) ? Number(e.amount || 0) : 0); }
  const top = Object.entries(byClient).sort((a, b) => b[1] - a[1])[0];

  // Series for the sparklines
  const vs = vaultSeries(watches, 12);
  const commSeries = monthlySeries(entries.filter(e => (e.currency || 'CHF') === mainCur), e => e.date, e => e.amount, 12);
  const bestIdx = commSeries.reduce((bi, v, i) => (v > (commSeries[bi] || 0) ? i : bi), -1);
  const lastHand = handed.map(w => w.purchase_date).filter(Boolean).sort().pop();
  const sinceHand = lastHand ? daysSince(lastHand) : null;

  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const chip = (icon, text, cls = '') => `<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-outline-variant/30 bg-white/[0.03] text-xs font-medium text-on-surface ${cls}"><span class="material-symbols-outlined text-[15px]">${icon}</span>${text}</span>`;

  // ── Needs attention — for the boutique ──
  const items = [
    waiting30.length ? { n: waiting30.length, tone: 'amber', icon: 'hourglass_top', title: 'Waiting 30+ days on the wishlist', cta: 'See who is waiting', go: 'openBoutiqueShop()' } : null,
    pending.length   ? { money: bmSumBy(pending), tone: 'green', icon: 'payments', title: 'Commission still to come', cta: 'See commissions', go: "showPage('commissions')" } : null,
    handedMonth.length ? { n: handedMonth.length, tone: 'cyan', icon: 'handshake', title: 'Handed over this month', cta: 'See pieces', go: 'openBoutiqueShop()' } : null,
  ].filter(Boolean);
  const attention = items.length ? items.map(it => `
      <button type="button" class="attention-card tone-${it.tone}" onclick="${it.go}">
        <span class="attention-icon material-symbols-outlined">${it.icon}</span>
        <span class="min-w-0 flex-1 text-left">
          <span class="attention-title">${esc(it.title)}</span>
          <span class="attention-value">${it.money ? fmt.byCurrency(it.money) : `${it.n}<span class="attention-unit">${it.n === 1 ? 'watch' : 'watches'}</span>`}</span>
          <span class="attention-cta">${esc(it.cta)} →</span>
        </span>
      </button>`).join('')
    : `<div class="attention-card tone-green col-span-full">
        <span class="attention-icon material-symbols-outlined">task_alt</span>
        <span><span class="attention-title">All clear</span><span class="attention-value text-base">Nothing waiting, nothing owed — the shelf is quiet ✨</span></span>
      </div>`;

  const tile = (label, value, sub, spark, go) => `
    <button type="button" onclick="${go}" class="glass-surface rounded-lg p-5 text-left hover:border-amber-400/30 border border-transparent transition-all">
      <p class="text-[11px] uppercase tracking-[0.06em] text-on-surface-variant font-semibold mb-2">${label}</p>
      <div class="font-playfair text-2xl text-on-surface leading-tight">${value}</div>
      <p class="text-xs text-on-surface-variant mt-1">${sub}</p>
      ${spark}
    </button>`;
  const pcs = n => `<span class="text-sm text-on-surface-variant font-sans font-medium ml-1">${n === 1 ? 'piece' : 'pieces'}</span>`;

  section.innerHTML = `
    <div class="glass-surface rounded-xl p-6 mb-6 border border-amber-400/20 relative overflow-hidden">
      <div class="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-amber-400/10 blur-3xl pointer-events-none"></div>
      <div class="flex items-start justify-between gap-6 flex-wrap relative">
        <div class="min-w-0 flex-1 basis-[420px]">
          <p class="text-[11px] uppercase tracking-[0.06em] text-amber-300 font-semibold mb-1"><span class="material-symbols-outlined text-[14px] align-[-2px] mr-1">storefront</span>Your boutique · ${esc(shop.name)} · ${esc(owner)}'s registry</p>
          <h3 class="font-playfair text-3xl font-semibold text-on-surface leading-tight">${hello}, ${esc(currentUser.username)} 👋</h3>
          <p class="text-on-surface-variant text-sm mt-2">
            ${entries.length
              ? `You have earned <strong class="bm-commission font-mono">${fmt.byCurrency(total)}</strong> in commission on ${piecesWithComm} piece${piecesWithComm !== 1 ? 's' : ''} at ${esc(shop.name)}${Object.keys(monthComm).length ? ` — <strong class="text-on-surface font-mono">${fmt.byCurrency(monthComm)}</strong> of it this month` : ''}${salary.months ? `, plus <strong class="bm-commission font-mono">${fmt.byCurrency(salary.total)}</strong> in salary over ${salary.months} month${salary.months !== 1 ? 's' : ''}` : ''}.`
              : salary.months
                ? `You have earned <strong class="bm-commission font-mono">${fmt.byCurrency(salary.total)}</strong> in salary over ${salary.months} month${salary.months !== 1 ? 's' : ''} at ${esc(shop.name)} — no commission shared with you yet.`
                : `No commission shared with you yet — ${esc(owner)} marks a commission as visible to the boutique when recording it on a piece.`}
          </p>
          <div class="flex items-center gap-2 flex-wrap mt-4">
            ${chip('watch', `${watches.length} piece${watches.length !== 1 ? 's' : ''} at the shop`)}
            ${chip('handshake', `${handed.length} handed over`, 'text-primary')}
            ${chip('bookmark', `${wish.length} on the wishlist`, wish.length ? 'text-amber-300' : '')}
            ${salary.months ? chip('account_balance_wallet', `Salary ${fmt.byCurrency(salary.total)}${Object.values(salary.pending).length ? ` · ${fmt.byCurrency(salary.pending)} to come` : ' · all paid'}`, 'text-amber-300') : ''}
            ${top && top[1] ? chip('emoji_events', `Top client: ${esc(top[0])} · ${fmt.price(top[1], mainCur)}`, 'text-amber-300') : ''}
            ${sinceHand != null ? chip('schedule', sinceHand === 0 ? 'A piece handed over today' : `Last handover ${sinceHand} day${sinceHand !== 1 ? 's' : ''} ago`) : ''}
          </div>
        </div>
        <div class="w-full lg:w-[360px] flex-shrink-0">
          <div class="flex items-end justify-between gap-3 mb-2">
            <div><p class="text-[11px] uppercase tracking-[0.06em] text-on-surface-variant font-semibold">Commission balance</p>
              <p class="font-playfair text-3xl bm-commission leading-none mt-1">${fmt.byCurrency(total)}</p></div>
            <p class="text-right text-xs text-on-surface-variant"><span class="block font-mono text-emerald-400 text-sm font-semibold">${fmt.byCurrency(bmSumBy(paid))}</span>paid to you</p>
          </div>
          <div class="h-2.5 rounded-full bg-white/[0.06] overflow-hidden" role="progressbar" aria-valuenow="${paidPct}" aria-valuemin="0" aria-valuemax="100" aria-label="Share of commission paid">
            <div class="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-300 transition-[width] duration-700" style="width:${paidPct}%"></div>
          </div>
          <div class="flex items-center justify-between mt-2 text-xs">
            <span class="text-on-surface-variant">${mainTotal ? `${paidPct}% paid` : 'nothing shared yet'}</span>
            <span class="font-mono ${pendingMain ? 'bm-commission' : 'text-on-surface-variant'}">${pendingMain ? `${fmt.price(pendingMain, mainCur)} still to come` : 'all settled'}</span>
          </div>
          <button type="button" onclick="showPage('commissions')" class="mt-3 w-full text-[11px] font-semibold uppercase tracking-wider px-3 py-2 rounded-lg border border-amber-400/30 text-amber-300 bg-amber-400/5 hover:bg-amber-400/15 transition-all">Open my commissions →</button>
        </div>
      </div>
    </div>

    <h3 class="vault-section-title">Needs attention · ${esc(shop.name)}</h3>
    <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-8">${attention}</div>

    <h3 class="vault-section-title">${esc(shop.name)} at a glance</h3>
    <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
      ${tile('Pieces at the shop', `${watches.length}${pcs(watches.length)}`, `${handed.length} handed over · ${wish.length} on the wishlist`,
             sparkBlock(vs.boughtCount, { color: SPARK.cyan, caption: 'pieces handed over / month', label: 'Pieces handed over per month' }), 'openBoutiqueShop()')}
      ${tile('Handed over', `${handed.length}${pcs(handed.length)}`, handedMonth.length ? `${handedMonth.length} this month 🎉` : `${fmt.byCurrency(bmSumBy(handed, w => w.list_price, w => w.currency || 'CHF'))} at list price`,
             sparkBlock(vs.boughtValue, { color: SPARK.violet, caption: `value handed over / month · ${vs.cur}`, label: 'Value handed over per month' }), 'openBoutiqueShop()')}
      ${tile('Commission earned', `<span class="bm-commission">${fmt.byCurrency(total)}</span>`, bestIdx >= 0 && commSeries[bestIdx] ? `best month ${vs.long[bestIdx]} · ${fmt.price(commSeries[bestIdx], mainCur)}` : `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} shared with you`,
             sparkBlock(commSeries, { color: SPARK.green, caption: `commission / month · ${mainCur}`, label: 'Commission per month' }), "showPage('commissions')")}
      ${tile('Wishlist', `${wish.length}${pcs(wish.length)}`, wish.length ? `longest wait ${longest} day${longest !== 1 ? 's' : ''}${waiting30.length ? ` · ${waiting30.length} over 30` : ''}` : 'nothing waiting',
             sparkBlock(vs.wishAdds, { color: SPARK.amber, caption: 'wishlist adds / month', label: 'Wishlist adds per month' }), 'openBoutiqueShop()')}
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-2">
      <section class="vault-panel">
        <div class="px-5 py-4 border-b border-outline-variant/40 flex items-center justify-between gap-3">
          <h3 class="text-[15px] font-semibold text-on-surface flex items-center gap-2"><span class="material-symbols-outlined text-amber-400 text-[18px]">hourglass_top</span>Longest waiting</h3>
          <button type="button" onclick="showPage('commissions')" class="text-xs font-semibold text-primary hover:underline">All wishlist →</button>
        </div>
        <div class="divide-y divide-white/[0.04]">${wish.length ? wish.slice(0, 6).map(w => {
          const d = wishlistDays(w) ?? 0;
          const urgency = d >= 30 ? 'text-error' : d >= 14 ? 'text-amber-400' : 'text-on-surface-variant';
          return `
          <button type="button" class="tbl-row w-full px-5 py-2.5 flex items-center gap-3 text-left" onclick="setBmView(true); openWatchDetail(${w.id})">
            ${bmThumb(w)}
            <span class="flex-1 min-w-0">
              <span class="block text-sm font-medium text-on-surface truncate">${esc(w.model)}</span>
              <span class="block text-xs text-on-surface-variant truncate">${esc(w.client_name || '—')}${w.reference_number ? ` · <span class="font-mono">${esc(w.reference_number)}</span>` : ''}</span>
            </span>
            <span class="font-mono text-lg font-semibold leading-none ${urgency}">${d}<span class="text-xs font-sans font-medium text-outline ml-1">${d === 1 ? 'day' : 'days'}</span></span>
          </button>`; }).join('')
          : `<p class="px-5 py-10 text-center text-sm text-on-surface-variant">Nothing on the wishlist — the shelf is quiet ✨</p>`}</div>
      </section>
      <section class="vault-panel">
        <div class="px-5 py-4 border-b border-outline-variant/40 flex items-center justify-between gap-3">
          <h3 class="text-[15px] font-semibold text-on-surface flex items-center gap-2"><span class="material-symbols-outlined text-amber-300 text-[18px]">payments</span>Latest commissions</h3>
          <button type="button" onclick="showPage('commissions')" class="text-xs font-semibold text-primary hover:underline">All entries →</button>
        </div>
        <div class="divide-y divide-white/[0.04]">${entries.length ? entries.slice(0, 6).map(e => `
          <button type="button" class="tbl-row w-full px-5 py-2.5 flex items-center gap-3 text-left" onclick="setBmView(true); openWatchDetail(${e.watch.id})">
            ${bmThumb(e.watch)}
            <span class="flex-1 min-w-0">
              <span class="block text-sm font-medium text-on-surface truncate">${esc(e.watch.model)}</span>
              <span class="block text-xs text-on-surface-variant truncate">${esc(e.watch.client_name || '—')} · <span class="font-mono">${fmt.date(e.date)}</span></span>
            </span>
            <span class="text-right flex-shrink-0">
              <span class="block font-mono text-sm font-semibold bm-commission">${fmt.price(e.amount, e.currency || 'CHF')}</span>
              <span class="block mt-0.5">${expensePaidBadge(e)}</span>
            </span>
          </button>`).join('')
          : `<p class="px-5 py-10 text-center text-sm text-on-surface-variant">No commission shared with you yet.</p>`}</div>
      </section>
    </div>

    <h3 class="vault-section-title mt-10">Your own registry</h3>
    <p class="text-xs text-on-surface-variant -mt-2 mb-6">Your shops, clients and watches — separate from ${esc(shop.name)}.</p>`;
}

// ── Commissions page (Tools → Commissions) ─────────────────────────────────
// Every commission the owner chose to share, newest first, grouped by month.
// The data is the same `expenses` list the watches already carry.

async function loadCommissions() {
  const body = document.getElementById('commissionsBody');
  if (!isBoutiqueManager() || !currentUser?.shop) {
    document.getElementById('commissionTiles').innerHTML = '';
    body.innerHTML = `<tr><td colspan="6" class="px-6 py-16 text-center text-on-surface-variant text-sm">${isBoutiqueManager() ? 'You are not linked to a shop yet — ask the registry owner.' : 'This page is for boutique manager accounts.'}</td></tr>`;
    return;
  }
  setBmView(true);   // the managed shop's pieces, as the owner shares them
  document.getElementById('commissionsSubtitle').textContent = `Commission set for you on pieces at ${bmShopName()} (${currentUser.shop.owner_username || 'the owner'}'s registry). The owner chooses which commissions appear here.`;
  const [watches, salaries] = await Promise.all([
    api('GET', '/api/watches'),
    api('GET', `/api/shops/${currentUser.shop.id}/salaries`).catch(() => []),
  ]);
  watches.forEach(w => { watchCache[w.id] = w; });
  const entries = watches.flatMap(w => (w.expenses || []).map(e => ({ ...e, watch: w })))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id - a.id);

  // Salary tab: what the owner pays them a month, paid month by month — read-only
  renderSalaryPane(document.getElementById('cmSalaryPane'), salaries, {
    canEdit: false, shopId: currentUser.shop.id, managerName: 'you', ownerName: currentUser.shop.owner_username || 'the owner',
    commissionTotals: (() => { const m = {}; for (const e of entries) m[e.currency || 'CHF'] = (m[e.currency || 'CHF'] || 0) + Number(e.amount || 0); return m; })(),
  });
  showPaneTab('cm', currentPaneTab('cm'));

  // Tiles: all time, this month, pieces
  const sum = list => { const m = {}; for (const e of list) m[e.currency || 'CHF'] = (m[e.currency || 'CHF'] || 0) + Number(e.amount || 0); return m; };
  const total = sum(entries), month = sum(entries.filter(e => isThisMonth(e.date)));
  const pieces = new Set(entries.map(e => e.watch.id)).size;
  const monthName = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const tile = (label, value, sub) => `
    <div class="glass-surface rounded-lg p-5">
      <p class="text-[11px] uppercase tracking-[0.06em] text-on-surface-variant font-semibold mb-3">${label}</p>
      <p class="font-playfair text-2xl bm-commission">${value}</p>
      <p class="text-[11px] text-on-surface-variant mt-1">${sub}</p>
    </div>`;
  const paid = entries.filter(e => e.paid_at), pending = entries.filter(e => !e.paid_at);
  // Wishlist pending: pieces clients are waiting for — tomorrow's commissions
  const wish = watches.filter(w => w.status === 'wishlist')
    .sort((a, b) => (wishlistDays(b) ?? -1) - (wishlistDays(a) ?? -1));
  const longest = wish.reduce((mx, w) => Math.max(mx, wishlistDays(w) ?? 0), 0);
  const waiting30 = wish.filter(w => (wishlistDays(w) ?? 0) >= 30).length;
  document.getElementById('commissionTiles').innerHTML = [
    tile('Total balance', fmt.byCurrency(total), `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} shared with you · ${pieces} of ${watches.length} piece${watches.length !== 1 ? 's' : ''} at ${bmShopName()}`),
    tile('Paid', `<span class="text-emerald-400">${fmt.byCurrency(sum(paid))}</span>`, `${paid.length} entr${paid.length === 1 ? 'y' : 'ies'} paid out to you`),
    tile('Commission left', pending.length ? fmt.byCurrency(sum(pending)) : `<span class="text-on-surface">${fmt.byCurrency(sum(pending))}</span>`, `${pending.length} entr${pending.length === 1 ? 'y' : 'ies'} still to be paid to you`),
    tile(`This month`, fmt.byCurrency(month), monthName),
    tile('Total · commission + salary', `<span class="text-on-surface">${fmt.byCurrency(sumCurrencyMaps(total, salaryTotals(salaries).total))}</span>`, `${fmt.byCurrency(total)} commission + ${fmt.byCurrency(salaryTotals(salaries).total)} salary · paid ${fmt.byCurrency(sumCurrencyMaps(sum(paid), salaryTotals(salaries).paid))} · left ${fmt.byCurrency(sumCurrencyMaps(sum(pending), salaryTotals(salaries).pending))}`),
    tile('Wishlist pending', `<span class="${wish.length ? 'text-amber-300' : 'text-on-surface'}">${wish.length}<span class="text-sm text-on-surface-variant font-sans font-medium ml-1">${wish.length === 1 ? 'piece' : 'pieces'}</span></span>`,
         wish.length ? `not bought yet · longest wait ${longest} day${longest !== 1 ? 's' : ''}${waiting30 ? ` · ${waiting30} over 30 days` : ''}` : 'nothing waiting at the shop'),
  ].join('');
  renderCommissionWishlist(wish);
  renderCommissionPieces(watches);
  document.getElementById('commissionsCount').textContent = entries.length ? `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}` : '';
  document.getElementById('commissionsUpdated').textContent = 'Updated ' + new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  if (!entries.length) {
    body.innerHTML = `<tr><td colspan="6" class="px-6 py-16 text-center text-on-surface-variant text-sm">
      <span class="material-symbols-outlined text-outline text-3xl block mb-2">payments</span>
      No commissions shared with you yet. Your registry owner marks a commission as visible to the boutique when recording it on a watch.</td></tr>`;
    return;
  }

  // Month group header rows with the month's total, then the entries
  let lastMonth = null, html = '';
  for (const e of entries) {
    const key = (e.date || '').slice(0, 7);
    if (key !== lastMonth) {
      lastMonth = key;
      const inMonth = entries.filter(x => (x.date || '').slice(0, 7) === key);
      const label = key ? new Date(key + '-01T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : 'Undated';
      html += `<tr class="wl-group-row"><td colspan="6" class="!py-2 !px-5"><span class="text-[11px] font-semibold uppercase tracking-[0.06em] text-on-surface-variant">${label}</span>
        <span class="font-mono text-xs bm-commission ml-3">${fmt.byCurrency(sum(inMonth))}</span></td></tr>`;
    }
    const w = e.watch;
    html += `
      <tr class="tbl-row cursor-pointer" onclick="openWatchDetail(${w.id})">
        <td class="px-5 py-3 text-xs font-mono text-on-surface-variant whitespace-nowrap">${fmt.date(e.date)}</td>
        <td class="px-5 py-3">
          <div class="flex items-center gap-3 min-w-0">
            ${bmThumb(w)}
            <div class="min-w-0">
              <p class="text-sm font-medium text-on-surface truncate">${esc(w.model)}</p>
              <p class="text-xs font-mono text-outline truncate">${esc(w.reference_number || '')}${w.serial_number ? ` · ${esc(w.serial_number)}` : ''}</p>
            </div>
          </div>
        </td>
        <td class="px-5 py-3 text-sm text-on-surface-variant">${esc(w.client_name || '—')}</td>
        <td class="px-5 py-3">${statusBadge(w.status)}</td>
        <td class="px-5 py-3 text-sm text-on-surface-variant max-w-[320px] truncate">${esc(e.description || '—')}</td>
        <td class="px-5 py-3 text-right font-mono text-sm font-semibold bm-commission whitespace-nowrap">${fmt.price(e.amount, e.currency || w.currency || 'CHF')}
          <span class="block mt-0.5">${expensePaidBadge(e)}</span></td>
      </tr>`;
  }
  body.innerHTML = html;
}

// The shop's wishlist pieces, longest wait first: the client, since when, how
// long — each a commission to come once the piece is handed over.
function renderCommissionWishlist(wish) {
  const body = document.getElementById('commissionWishlistBody');
  const count = document.getElementById('commissionWishlistCount');
  const sub = document.getElementById('commissionWishlistSub');
  if (!body) return;
  count.textContent = wish.length ? `${wish.length} piece${wish.length !== 1 ? 's' : ''} waiting` : '';
  sub.textContent = `Pieces clients are waiting for at ${bmShopName()} — no commission until they are handed over.`;
  body.innerHTML = wish.length ? wish.map(w => {
    const d = wishlistDays(w) ?? 0;
    const urgency = d >= 30 ? 'text-error' : d >= 14 ? 'text-amber-400' : 'text-on-surface-variant';
    return `
    <button type="button" class="tbl-row w-full px-6 py-3 flex items-center gap-4 text-left" onclick="openWatchDetail(${w.id})">
      ${bmThumb(w)}
      <span class="flex-1 min-w-0">
        <span class="block text-sm font-medium text-on-surface truncate">${esc(w.model)}</span>
        <span class="block text-xs text-on-surface-variant truncate">${esc(w.client_name || '—')}${w.reference_number ? ` · <span class="font-mono">${esc(w.reference_number)}</span>` : ''}</span>
      </span>
      <span class="hidden sm:block text-xs font-mono text-on-surface-variant whitespace-nowrap">since ${fmt.date((w.created_at || '').slice(0, 10))}</span>
      ${w.list_price != null ? `<span class="hidden md:block font-mono text-sm text-on-surface whitespace-nowrap">${fmt.price(w.list_price, w.currency || 'CHF')}</span>` : ''}
      <span class="font-mono text-lg font-semibold leading-none ${urgency} whitespace-nowrap">${d}<span class="text-xs font-sans font-medium text-outline ml-1">${d === 1 ? 'day' : 'days'}</span></span>
    </button>`;
  }).join('') : `<p class="px-6 py-10 text-center text-sm text-on-surface-variant">Nothing on the wishlist at ${esc(bmShopName())}.</p>`;
}

// Every piece the owner shows this manager, grouped by client (as the owner's
// Boutique Commission page groups them), with the commission set on each —
// so a piece shown without a commission yet is still seen here.
function renderCommissionPieces(watches) {
  const body = document.getElementById('commissionPiecesBody');
  const count = document.getElementById('commissionPiecesCount');
  const sub = document.getElementById('commissionPiecesSub');
  if (!body) return;
  const sum = list => { const m = {}; for (const e of list) m[e.currency || 'CHF'] = (m[e.currency || 'CHF'] || 0) + Number(e.amount || 0); return m; };
  const groups = new Map();
  for (const w of watches) {
    const key = w.profile_id ?? `name:${w.client_name || ''}`;
    if (!groups.has(key)) groups.set(key, { name: w.client_name || 'No client', items: [] });
    groups.get(key).items.push(w);
  }
  const clients = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  count.textContent = watches.length ? `${watches.length} piece${watches.length !== 1 ? 's' : ''} · ${clients.length} client${clients.length !== 1 ? 's' : ''}` : '';
  sub.textContent = `Every piece the owner shows you at ${bmShopName()}, by client, with the commission set on it.`;
  if (!watches.length) {
    body.innerHTML = `<tr><td colspan="4" class="px-6 py-10 text-center text-sm text-on-surface-variant">No pieces shared with you yet at ${esc(bmShopName())}.</td></tr>`;
    return;
  }
  let html = '';
  for (const c of clients) {
    const withCommission = c.items.filter(w => (w.expenses || []).length);
    const total = sum(c.items.flatMap(w => w.expenses || []));
    html += `<tr class="wl-group-row"><td colspan="4" class="!py-2 !px-5">
      <span class="inline-flex items-center gap-2">
        <span class="w-6 h-6 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center">${esc((c.name || '?').trim().charAt(0).toUpperCase())}</span>
        <span class="text-sm font-semibold text-on-surface">${esc(c.name)}</span>
        <span class="text-[11px] font-mono text-outline">${c.items.length} piece${c.items.length !== 1 ? 's' : ''}</span>
        ${withCommission.length ? `<span class="font-mono text-xs bm-commission ml-2">${fmt.byCurrency(total)}</span>` : `<span class="text-[11px] text-outline ml-2">no commission yet</span>`}
      </span></td></tr>`;
    for (const w of c.items) {
      const entries = w.expenses || [];
      const pending = entries.filter(e => !e.paid_at);
      html += `
      <tr class="tbl-row cursor-pointer" onclick="openWatchDetail(${w.id})">
        <td class="px-5 py-3">
          <div class="flex items-center gap-3 min-w-0">
            ${bmThumb(w)}
            <div class="min-w-0">
              <p class="text-sm font-medium text-on-surface truncate">${esc(w.model)}</p>
              <p class="text-xs font-mono text-outline truncate">${esc(w.reference_number || '')}${w.serial_number ? ` · ${esc(w.serial_number)}` : ''}</p>
            </div>
          </div>
        </td>
        <td class="px-5 py-3">${statusBadge(w.status)}</td>
        <td class="px-5 py-3 text-right font-mono text-sm text-on-surface whitespace-nowrap">${w.list_price != null ? fmt.price(w.list_price, w.currency || 'CHF') : '<span class="text-outline">—</span>'}</td>
        <td class="px-5 py-3 text-right whitespace-nowrap">${entries.length
          ? `<span class="font-mono text-sm font-semibold bm-commission">${fmt.byCurrency(sum(entries))}</span>
             <span class="block text-[11px] text-on-surface-variant mt-0.5">${pending.length ? `${fmt.byCurrency(sum(pending))} pending` : 'paid out'}</span>`
          : `<span class="text-xs text-outline">${w.status === 'wishlist' ? 'wishlist · once handed over' : 'no commission yet'}</span>`}</td>
      </tr>`;
    }
  }
  body.innerHTML = html;
}

// ── Watch page ─────────────────────────────────────────────────────────────
// A plain page for a piece of the MANAGED shop (bmShopView): the piece, its
// identity, the commission on it and the client. Their own watches use the
// normal page.

const _bmRenderWatchDetailPage = renderWatchDetailPage;
renderWatchDetailPage = function (w) {
  if (!bmShopView) return _bmRenderWatchDetailPage(w);

  const cur = w.currency || 'CHF';
  const pr  = w.profile || {};
  const stCls = { wishlist:    'text-amber-400 border-amber-400/30 bg-amber-400/5',
                  handed_over: 'text-primary border-primary/30 bg-primary/5' };
  const stLabel = { wishlist: 'Wishlist', handed_over: 'Handed over' };
  const field = (label, val, mono) => val != null && val !== '' && val !== '—' ? `<div>
      <p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-0.5">${label}</p>
      <p class="text-sm text-on-surface ${mono ? 'font-mono' : ''}">${esc(String(val))}</p>
    </div>` : '';
  const card = (title, body) => `
    <div class="glass-surface rounded-xl p-6 border border-outline-variant/10">
      <p class="text-[11px] uppercase tracking-[0.06em] font-semibold text-on-surface-variant mb-4">${title}</p>
      ${body}
    </div>`;
  const waiting = w.status === 'wishlist' ? wishlistDays(w) : null;
  const entries = (w.expenses || []);
  const commissionRows = entries.length
    ? entries.map(e => `
      <div class="flex items-center gap-3 py-2.5 border-b border-outline-variant/10 last:border-0">
        <span class="text-xs font-mono text-on-surface-variant w-24 flex-shrink-0">${fmt.date(e.date)}</span>
        <span class="flex-1 text-sm text-on-surface-variant truncate">${esc(e.description || 'Commission')}</span>
        <span class="font-mono text-sm bm-commission flex-shrink-0">${fmt.price(e.amount, e.currency || cur)}</span>
      </div>`).join('')
    : `<p class="text-sm text-on-surface-variant/50 italic py-2">No commission recorded on this piece yet.</p>`;

  document.getElementById('watchDetailContent').innerHTML = `
    <div class="glass-surface rounded-xl overflow-hidden">
      <div class="flex items-start gap-6 p-6">
        <div class="w-32 h-32 rounded-lg bg-surface-container border border-outline-variant/15 flex items-center justify-center flex-shrink-0 overflow-hidden ${w.image_path ? 'cursor-zoom-in' : ''}"
             ${w.image_path ? `onclick="openLightbox('${w.image_path}')"` : ''}>
          ${w.image_path ? `<img src="${w.image_path}" class="w-full h-full object-cover" alt="${esc(w.model)}">`
                         : `<span class="material-symbols-outlined text-outline text-4xl">watch</span>`}
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap mb-2">
            <span class="text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-lg border ${stCls[w.status] || stCls.handed_over} inline-block">${stLabel[w.status] || 'Handed over'}</span>
            ${waiting != null ? `<span class="text-[11px] font-mono ${waiting >= 30 ? 'text-error' : waiting >= 14 ? 'text-amber-400' : 'text-on-surface-variant'}">${waiting} day${waiting !== 1 ? 's' : ''} waiting</span>` : ''}
            <span class="bm-badge ml-auto"><span class="material-symbols-outlined text-[14px]">visibility</span> Boutique view</span>
          </div>
          <h1 class="font-playfair text-3xl font-semibold text-on-surface leading-tight">${esc(w.model)}</h1>
          <p class="text-on-surface-variant text-sm mt-1.5">
            ${w.shop_name ? `${esc(w.shop_name)} · ` : ''}${esc(w.client_name || pr.name || '—')}${w.reference_number ? ` · <span class="font-mono">${esc(w.reference_number)}</span>` : ''}
          </p>
          <div class="grid grid-cols-3 gap-4 text-sm mt-5 max-w-xl">
            <div class="bg-white/[0.02] rounded-lg p-3.5">
              <p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-1">List Price</p>
              <p class="font-playfair text-lg text-on-surface font-mono">${w.list_price != null ? fmt.price(w.list_price, cur) : '<span class="text-outline">—</span>'}</p>
            </div>
            <div class="bg-white/[0.02] rounded-lg p-3.5">
              <p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-1">${w.status === 'wishlist' ? 'On wishlist since' : 'Handed over'}</p>
              <p class="font-playfair text-lg text-on-surface font-mono">${w.status === 'wishlist' ? fmt.date((w.created_at || '').slice(0, 10)) : fmt.date(w.purchase_date)}</p>
            </div>
            <div class="bg-white/[0.02] rounded-lg p-3.5">
              <p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-1">Commission</p>
              <p class="font-playfair text-lg font-mono">${bmCommissionHtml(w, 'text-lg')}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2 space-y-6">
        ${card('Commission on this piece', commissionRows)}
        ${w.notes ? card('Notes', `<p class="text-sm text-on-surface leading-relaxed">${esc(w.notes)}</p>`) : ''}
      </div>
      <div class="space-y-6">
        ${card('Watch Identity', `<div class="grid grid-cols-2 gap-x-6 gap-y-4">${[
          field('Reference No.', w.reference_number, true),
          field('Serial No.',    w.serial_number,    true),
          field('Movement No.',  w.movement_number,  true),
          field('Case No.',      w.case_number,      true),
          field('Source',        w.source),
          field('Currency',      w.currency),
        ].filter(Boolean).join('')}</div>`)}
        ${pr.name ? card('Client', `
          <div class="flex items-center gap-4">
            ${avatarHtml(pr.name, pr.photo_path, 'md')}
            <div class="min-w-0">
              <p class="font-semibold text-on-surface truncate">${esc(pr.name)}</p>
              ${pr.email ? `<p class="text-xs text-on-surface-variant mt-0.5 truncate">${esc(pr.email)}</p>` : ''}
              ${pr.pp_urn ? `<p class="text-xs font-mono text-on-surface-variant mt-0.5">${esc(pr.pp_urn)}</p>` : ''}
              ${pr.portfolio_name ? `<p class="text-xs text-outline mt-0.5">${esc(pr.portfolio_name)}</p>` : ''}
            </div>
          </div>`) : ''}
      </div>
    </div>`;
};
