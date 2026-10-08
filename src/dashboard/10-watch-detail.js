// 10-watch-detail.js — Watch detail page
// Part of the dashboard script: scripts/build.js concatenates src/dashboard/*.js
// in filename order into public/js/dashboard.js (one classic script, so
// functions and top-level variables stay shared exactly as before).

// ── Watch Detail page ─────────────────────────────────────────────────────
let currentWatchId    = null;
let _watchDetailFrom  = null; // { page, id }

document.getElementById('backFromWatchDetail').addEventListener('click', () => {
  const f = _watchDetailFrom;
  if (!f) { showPage('watches'); return; }
  if      (f.page === 'profile-detail' && f.id) openProfileDetail(f.id);
  else if (f.page === 'client-detail'  && f.id) openClientDetail(f.id);
  else if (f.page === 'shop-detail'    && f.id) openShopDetail(f.id);
  else showPage(f.page || 'watches');
});

async function openWatchDetail(id) {
  _watchDetailFrom = {
    page: currentPage,
    id:   currentPage === 'profile-detail' ? currentProfileId
        : currentPage === 'client-detail'  ? currentClientId
        : currentPage === 'shop-detail'    ? currentShopId
        : null,
  };
  const backLabels = {
    'profile-detail': 'Back to Membership',
    'client-detail':  'Back to Client',
    'shop-detail':    'Back to Shop',
    'watches':        'Back to Watches',
  };
  document.getElementById('backFromWatchDetailLabel').textContent =
    backLabels[_watchDetailFrom.page] || 'Back to Watches';

  currentWatchId = Number(id);
  showPage('watch-detail');
  document.getElementById('watchDetailContent').innerHTML = `
    <div class="flex items-center justify-center py-20">
      <span class="material-symbols-outlined text-outline text-4xl animate-spin">progress_activity</span>
    </div>`;

  try {
    const w = await api('GET', `/api/watches/${id}`);
    watchCache[w.id] = w;
    renderWatchDetailPage(w);
  } catch (e) {
    document.getElementById('watchDetailContent').innerHTML =
      `<p class="text-error text-sm">${esc(e.message || 'Failed to load watch')}</p>`;
  }
}

function renderWatchDetailPage(w) {
  const cur    = w.currency || 'CHF';
  const pr     = w.profile  || {};
  const cl     = w.client   || null;
  const mc     = v => v == null ? '<span class="text-outline">—</span>' : fmt.price(v, cur);
  const sgn    = v => v > 0 ? '+' : '';
  const cls    = v => v == null ? 'text-outline' : v >= 0 ? 'text-emerald-400' : 'text-error';
  const field  = (label, val, mono) =>
    val != null && val !== '' ? `<div>
      <p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-0.5">${label}</p>
      <p class="text-sm text-on-surface ${mono ? 'font-mono' : ''}">${esc(String(val))}</p>
    </div>` : '';

  // ── Status badge colour ──────────────────────────────────────────────────
  const stCls = { wishlist: 'text-amber-400 border-amber-400/30 bg-amber-400/5',
                  purchased:'text-purple-300 border-purple-400/30 bg-purple-400/10',
                  sold:      'text-emerald-400 border-emerald-400/30 bg-emerald-400/5' };
  const stLabel = { wishlist:'Wishlist', purchased:'Purchased', sold:'Sold' };

  // ── Financial split calc (mirrors computePnl single-watch) ───────────────
  // This watch's rule: chosen on Mark Sold, else the client's rule
  const isDiscount   = watchRule(w, pr) === 'discount';
  const ruleIsOwn    = !!w.rule_applied && w.rule_applied !== (pr.trading_rule || 'split');
  const profitSplit  = pr.profit_split_me ?? 100;
  const lossSplit    = pr.loss_split_me   ?? 100;
  const discountRate = w.discount_rate_applied ?? pr.discount_split ?? 0.08;
  const list         = w.list_price, sale = w.sale_price;
  const dcw          = (isDiscount && w.status === 'sold' && list != null && (sale != null || w.market_price != null)) ? discountCalc(w, pr) : null;
  const handover     = !!dcw?.isProfit;
  // Handover under either rule (P/L Split handovers: sale_price = client price)
  const plHandover   = !isDiscount && w.status === 'sold' && w.market_price != null && sale != null;
  const hv = handover ? { P: dcw.P, cp: dcw.clientPrice, manual: dcw.manual, disc: dcw.discAmt, pct: dcw.discPct, rate: dcw.rate }
           : plHandover ? { P: w.market_price, cp: sale, manual: w.discount_mode === 'manual', disc: splitHandoverDisc(w),
                            pct: w.market_price ? (w.market_price - sale) / w.market_price : 0, rate: w.discount_rate_applied ?? pr.discount_split ?? 0.08 }
           : null;
  const gross        = handover ? dcw.rawDiff : (list != null && sale != null) ? (sale - list) : null;
  let myPnl = null, clientPnl = null, myPnlNote = '', clientPnlNote = '';
  if (w.status === 'sold' && gross != null) {
    if (dcw) {
      myPnl     = dcw.myIncome;
      clientPnl = dcw.clientPnl;
      if (handover) {
        myPnlNote     = `market − client price · ${(dcw.discPct * 100).toFixed(2)}% ${dcw.manual ? '(manual)' : '(standard)'}`;
        clientPnlNote = `client price − list`;
      } else {
        myPnlNote     = `loss is 100% the client's`;
        clientPnlNote = `sold − list`;
      }
    } else {
      const sp  = gross >= 0 ? profitSplit : lossSplit;
      const hd  = splitHandoverDisc(w);
      myPnl       = (sp / 100) * gross + hd;
      clientPnl   = ((100 - sp) / 100) * gross;
      myPnlNote     = hd ? `${sp}% of profit + handover discount ${fmt.price(hd, cur)}` : `${sp}% of gross`;
      clientPnlNote = `${100 - sp}% of ${hd ? 'profit vs list' : 'gross'}`;
    }
  }

  // ── Expenses ──────────────────────────────────────────────────────────────
  const activeExp   = (w.expenses || []).filter(ex => !ex.reversed);
  const totalExp    = activeExp.reduce((s, ex) => s + ex.amount, 0);
  const expRows     = activeExp.length === 0
    ? `<p class="text-sm text-on-surface-variant/50 italic py-2">No expenses recorded</p>`
    : activeExp.map(ex => `
      <div class="flex items-center gap-3 py-2.5 border-b border-outline-variant/10 last:border-0">
        <span class="text-xs font-mono text-on-surface-variant w-24 flex-shrink-0">${fmt.date(ex.date)}</span>
        <span class="text-[11px] font-semibold px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 flex-shrink-0">${expenseCategoryLabel(ex.category)}</span>
        <span class="flex-1 text-sm text-on-surface-variant truncate">${esc(ex.description || '')}</span>
        <span class="font-mono text-sm text-sky-300 flex-shrink-0">${fmt.price(ex.amount, ex.currency || cur)}</span>
        <button onclick="reverseExpense(${ex.id}, ${w.id})" title="Void" class="p-1 hover:text-error transition-colors flex-shrink-0">
          <span class="material-symbols-outlined text-[16px] text-on-surface-variant">close</span>
        </button>
      </div>`).join('');

  // ── Loss payments (if applicable) ────────────────────────────────────────
  // Discount v2: the receivable is the shortfall vs my contribution, not L − S
  const lossAmt     = dcw ? (dcw.isLoss ? dcw.clientOwesMe : 0)
                          : (list != null && sale != null) ? Math.max(0, list - sale) : 0;
  const activePay   = (w.loss_payments || []).filter(p => !p.reversed);
  const totalPaid   = activePay.reduce((s, p) => s + p.amount, 0);
  const lossRemain  = Math.max(0, lossAmt - totalPaid);
  const lossStatus  = w.loss_status || (lossAmt > 0 ? 'open' : 'not_applicable');
  const showLoss    = w.status === 'sold' && isDiscount && lossAmt > 0;
  const lsMap = { open:'text-error border-error/30 bg-error/5', partially_paid:'text-amber-400 border-amber-400/30 bg-amber-400/5', settled:'text-emerald-400 border-emerald-400/30 bg-emerald-400/5', not_applicable:'text-outline border-outline/20 bg-white/[0.02]' };
  const lsLabel = { open:'Open', partially_paid:'Partially settled', settled:'Settled', not_applicable:'No debt' };

  const payRows = activePay.length === 0
    ? `<p class="text-sm text-on-surface-variant/50 italic py-2">No payments recorded</p>`
    : activePay.map(px => `
      <div class="flex items-center gap-3 py-2.5 border-b border-outline-variant/10 last:border-0">
        <span class="text-xs font-mono text-on-surface-variant w-24 flex-shrink-0">${fmt.date(px.date)}</span>
        <span class="text-[11px] font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 flex-shrink-0">${esc(px.method === 'OFFSET' ? 'Offset' : recoveryMethodLabel(px))}</span>
        <span class="flex-1 text-sm text-on-surface-variant truncate">${esc(px.notes || '')}</span>
        <span class="font-mono text-sm text-amber-300 flex-shrink-0">${fmt.price(px.amount, cur)}</span>
        <button onclick="reversePayment(${px.id}, ${w.id})" title="Void" class="p-1 hover:text-error transition-colors flex-shrink-0">
          <span class="material-symbols-outlined text-[16px] text-on-surface-variant">close</span>
        </button>
      </div>`).join('');

  // ── Funding & Payouts (both sides) ───────────────────────────────────────
  const clientBal = watchPayoutBalance(w, 'client');
  const myBal     = watchPayoutBalance(w, 'my');

  const renderLedgerRow = (px, side) => {
    const isAuto = (px.method || '').toUpperCase() === 'AUTO_ON_SALE';
    const accent = side === 'client' ? 'purple-300' : 'amber-300';
    const accentBg = side === 'client' ? 'bg-purple-500/10' : 'bg-amber-500/10';
    return `
      <div class="flex items-center gap-3 py-2 border-b border-outline-variant/10 last:border-0">
        <span class="text-xs font-mono text-on-surface-variant w-24 flex-shrink-0">${fmt.date(px.date)}</span>
        <span class="text-[11px] font-semibold px-2 py-0.5 rounded ${accentBg} text-${accent} flex-shrink-0">${isAuto ? 'AUTO' : esc(px.method || 'Transfer')}</span>
        <span class="flex-1 text-sm text-on-surface-variant truncate">${esc(px.notes || '')}</span>
        <span class="font-mono text-sm text-${accent} flex-shrink-0">${fmt.price(px.amount, px.currency || cur)}</span>
        <button onclick="${side === 'client' ? 'reverseClientPayout' : 'reverseMyPayout'}(${px.id}, ${w.id})" title="Void" class="p-1 hover:text-error transition-colors flex-shrink-0">
          <span class="material-symbols-outlined text-[16px] text-on-surface-variant">close</span>
        </button>
      </div>`;
  };

  const activeClientPayouts = (w.client_payouts || []).filter(p => !p.reversed);
  const activeMyPayouts     = (w.my_payouts     || []).filter(p => !p.reversed);

  // ── Helper: info card ─────────────────────────────────────────────────────
  const infoCard = (title, items, accent) => `
    <div class="glass-surface rounded-xl p-6 border ${accent || 'border-outline-variant/10'}">
      <p class="text-[11px] uppercase tracking-[0.06em] font-semibold text-on-surface-variant mb-4">${title}</p>
      <div class="grid grid-cols-2 gap-x-6 gap-y-4">${items}</div>
    </div>`;

  document.getElementById('watchDetailContent').innerHTML = `
    <!-- ── Hero ─────────────────────────────────────────────────────────── -->
    <div class="glass-surface rounded-xl overflow-hidden">
      <div class="flex items-start gap-6 p-6">
        <!-- Photo -->
        <div class="w-32 h-32 rounded-lg bg-surface-container border border-outline-variant/15 flex items-center justify-center flex-shrink-0 overflow-hidden cursor-zoom-in"
             onclick="${w.image_path ? `openLightbox('${w.image_path}')` : ''}">
          ${w.image_path
            ? `<img src="${w.image_path}" class="w-full h-full object-cover" alt="${esc(w.model)}">`
            : `<span class="material-symbols-outlined text-outline text-4xl">watch</span>`}
        </div>
        <!-- Title block -->
        <div class="flex-1 min-w-0">
          <div class="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <span class="text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-lg border ${stCls[w.status] || stCls.purchased} inline-block mb-2">${stLabel[w.status] || w.status}</span>
              <h1 class="font-playfair text-3xl font-semibold text-on-surface leading-tight">${esc(w.model)}</h1>
              <p class="text-on-surface-variant text-sm mt-1.5">
                ${pr.shop_name ? `<span class="text-on-surface-variant">${esc(pr.shop_name)}</span> · ` : ''}
                ${pr.name ? `<button onclick="openProfileDetail(${w.profile_id})" class="hover:text-primary transition-colors">${esc(pr.name)}</button>` : ''}
                ${cur ? ` · <span class="font-mono text-on-surface-variant">${cur}</span>` : ''}
                ${w.stock_number ? ` · <span class="text-outline">Stock</span> <span class="font-mono text-on-surface">${esc(w.stock_number)}</span>` : ''}
              </p>
            </div>
            <!-- Actions -->
            <div class="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
              ${w.status !== 'sold' ? `<button onclick="openMarkSoldModal(${w.id})" class="text-[11px] font-semibold uppercase tracking-wider px-3 py-2 rounded-lg border border-emerald-500/30 text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/15 transition-all flex items-center gap-1.5">
                <span class="material-symbols-outlined text-[13px]">sell</span> Mark Sold
              </button>` : ''}
              ${w.status === 'sold' ? `<button onclick="openMarkSoldModal(${w.id})" class="text-[11px] font-semibold uppercase tracking-wider px-3 py-2 rounded-lg border border-emerald-500/30 text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/15 transition-all flex items-center gap-1.5">
                <span class="material-symbols-outlined text-[13px]">handshake</span> ${hv ? 'Edit Handover' : 'Edit Sale'}
              </button>` : ''}
              ${w.status !== 'sold' && isDiscount ? `<button onclick="openRecordPaymentModal(${w.id})" class="text-[11px] font-semibold uppercase tracking-wider px-3 py-2 rounded-lg border border-amber-400/30 text-amber-400 bg-amber-400/5 hover:bg-amber-400/10 transition-all flex items-center gap-1.5">
                <span class="material-symbols-outlined text-[13px]">payments</span> Loss Payment
              </button>` : ''}
              ${w.status !== 'wishlist' ? `<button onclick="openRecordPayoutModal(${w.id}, 'client')" class="text-[11px] font-semibold uppercase tracking-wider px-3 py-2 rounded-lg border border-purple-400/30 text-purple-300 bg-purple-500/5 hover:bg-purple-500/15 transition-all flex items-center gap-1.5">
                <span class="material-symbols-outlined text-[13px]">payments</span> Pay Client
              </button>` : ''}
              ${w.status !== 'wishlist' ? `<button onclick="openRecordPayoutModal(${w.id}, 'my')" class="text-[11px] font-semibold uppercase tracking-wider px-3 py-2 rounded-lg border border-amber-400/30 text-amber-300 bg-amber-500/5 hover:bg-amber-500/15 transition-all flex items-center gap-1.5">
                <span class="material-symbols-outlined text-[13px]">account_balance_wallet</span> Withdraw
              </button>` : ''}
              <button onclick="openAddExpenseModal(${w.id})" class="text-[11px] font-semibold uppercase tracking-wider px-3 py-2 rounded-lg border border-sky-500/30 text-sky-400 bg-sky-500/5 hover:bg-sky-500/10 transition-all flex items-center gap-1.5">
                <span class="material-symbols-outlined text-[13px]">receipt_long</span> Expense
              </button>
              <button onclick="openEditWatch(${w.id})" class="text-[11px] font-semibold uppercase tracking-wider px-3 py-2 rounded-lg border border-outline-variant/30 text-on-surface-variant hover:text-primary hover:border-primary/30 transition-all flex items-center gap-1.5">
                <span class="material-symbols-outlined text-[13px]">edit</span> Edit
              </button>
              <button onclick="confirmDeleteWatch(${w.id},'${esc(w.model).replace(/'/g,"\\'")}',true)" class="text-[11px] font-semibold uppercase tracking-wider px-3 py-2 rounded-lg border border-error/20 text-error hover:bg-error/10 transition-all flex items-center gap-1.5">
                <span class="material-symbols-outlined text-[13px]">delete</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Main grid ─────────────────────────────────────────────────────── -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

      <!-- LEFT: Financial + Expenses + Loss payments ─────────────────────── -->
      <div class="lg:col-span-2 space-y-6">

        <!-- Financial summary -->
        <div class="glass-surface rounded-xl p-6">
          <p class="text-[11px] uppercase tracking-[0.06em] font-semibold text-on-surface-variant mb-4">Financial Summary</p>
          <div class="grid grid-cols-3 gap-4 text-sm mb-4">
            <div class="bg-white/[0.02] rounded-lg p-3.5">
              <p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-1">List Price</p>
              <p class="font-playfair text-lg text-on-surface font-mono">${mc(w.list_price)}</p>
            </div>
            <div class="bg-white/[0.02] rounded-lg p-3.5">
              ${hv ? `
              <p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-1">Market Price</p>
              <p class="font-playfair text-lg text-primary font-mono">${mc(hv.P)}</p>
              <p class="text-[11px] text-on-surface-variant mt-1">Handover · client price ${fmt.price(hv.cp, cur)} · ${hv.manual ? 'manual' : 'standard'}${w.market_price_date ? ' · ' + fmt.date(w.market_price_date) : ''}${w.market_price_agreed_by ? ' · agreed by ' + esc(w.market_price_agreed_by) : ''}</p>
              ${(w.market_prices || []).length > 1 ? `<p class="text-[11px] text-outline mt-1" title="${esc(w.market_prices.map(mp => `${mp.date || ''} ${fmt.price(mp.price, cur)}${mp.agreed_by ? ' (' + mp.agreed_by + ')' : ''}`).join(' → '))}">${w.market_prices.length} agreed prices on record</p>` : ''}` : `
              <p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-1">${w.status === 'sold' ? 'Sold For' : 'Purchase Price'}</p>
              <p class="font-playfair text-lg ${w.status === 'sold' ? 'text-primary' : 'text-on-surface'} font-mono">${w.status === 'sold' ? mc(w.sale_price) : mc(w.price ?? w.list_price)}</p>`}
            </div>
            ${hv ? `
            <div class="bg-amber-500/[0.05] border border-amber-500/15 rounded-lg p-3.5">
              <p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-1">My Discount</p>
              <p class="font-playfair text-lg text-amber-400 font-mono">+${fmt.price(hv.disc, cur)}</p>
              <p class="text-[11px] text-on-surface-variant mt-1">${(hv.pct * 100).toFixed(2)}% effective · standard ${(hv.rate * 100).toFixed(2)}%${plHandover ? ` · profit vs list ${sgn(gross)}${fmt.price(gross, cur)} split ${gross >= 0 ? profitSplit : lossSplit}/${100 - (gross >= 0 ? profitSplit : lossSplit)}` : ''}</p>
            </div>` : `
            <div class="bg-white/[0.02] rounded-lg p-3.5">
              <p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-1">Gross P&amp;L</p>
              <p class="font-playfair text-lg ${cls(gross)} font-mono">${gross != null ? sgn(gross)+fmt.price(gross,cur) : '—'}</p>
            </div>`}
          </div>
          <div class="grid grid-cols-2 gap-4 text-sm pt-4 border-t border-outline-variant/10">
            <!-- My side -->
            <div class="space-y-2.5">
              <p class="text-[11px] uppercase tracking-wider text-on-surface-variant/70 font-semibold">My Side</p>
              <div class="flex justify-between text-sm"><span class="text-on-surface-variant">My Cost</span><span class="font-mono text-emerald-400">${mc(w.my_cost)}</span></div>
              <div class="flex justify-between text-sm"><span class="text-on-surface-variant">Paid to me</span><span class="font-mono text-emerald-400">${fmt.price(myBal.paid, cur)}</span></div>
              ${w.status === 'sold' ? `<div class="flex justify-between text-sm border-t border-outline-variant/10 pt-2">
                <span class="text-on-surface font-semibold">My P&amp;L</span>
                <div class="text-right">
                  <span class="font-mono font-semibold ${cls(myPnl)}">${myPnl != null ? sgn(myPnl)+fmt.price(myPnl,cur) : '—'}</span>
                  ${myPnlNote ? `<p class="text-[11px] text-on-surface-variant mt-0.5">${myPnlNote}</p>` : ''}
                </div>
              </div>` : ''}
            </div>
            <!-- Client side -->
            <div class="space-y-2.5">
              <p class="text-[11px] uppercase tracking-wider text-on-surface-variant/70 font-semibold">Client Side</p>
              <div class="flex justify-between text-sm"><span class="text-on-surface-variant">Client Cost</span><span class="font-mono text-purple-300">${mc(w.client_cost)}</span></div>
              <div class="flex justify-between text-sm"><span class="text-on-surface-variant">Paid to client</span><span class="font-mono text-purple-300">${fmt.price(clientBal.paid, cur)}</span></div>
              ${w.status === 'sold' ? `<div class="flex justify-between text-sm border-t border-outline-variant/10 pt-2">
                <span class="text-on-surface font-semibold">Client P&amp;L</span>
                <div class="text-right">
                  <span class="font-mono font-semibold ${cls(clientPnl)}">${clientPnl != null ? sgn(clientPnl)+fmt.price(clientPnl,cur) : '—'}</span>
                  ${clientPnlNote ? `<p class="text-[11px] text-on-surface-variant mt-0.5">${clientPnlNote}</p>` : ''}
                </div>
              </div>` : ''}
            </div>
          </div>
          ${w.status === 'purchased' ? `
          <div class="mt-4 pt-4 border-t border-outline-variant/10 flex justify-between text-sm">
            <span class="text-on-surface-variant">Total Invested</span>
            <span class="font-mono text-primary font-semibold">${fmt.price((w.my_cost||0)+(w.client_cost||0), cur)}</span>
          </div>` : ''}
          ${activeExp.length > 0 ? `
          <div class="mt-2 flex justify-between text-sm">
            <span class="text-on-surface-variant">Total Expenses</span>
            <span class="font-mono text-sky-300 font-semibold">− ${fmt.price(totalExp, cur)}</span>
          </div>
          ${w.status === 'sold' && gross != null ? `
          <div class="flex justify-between text-sm pt-2 border-t border-sky-500/10">
            <span class="text-on-surface font-semibold">Adj. Gross P&amp;L</span>
            <span class="font-mono font-semibold ${cls(gross - totalExp)}">${sgn(gross-totalExp)}${fmt.price(gross-totalExp,cur)}</span>
          </div>` : ''}` : ''}
        </div>

        <!-- Funding & Payouts ─────────────────────────────────────────────── -->
        <div class="glass-surface rounded-xl p-6">
          <div class="flex items-center justify-between mb-5">
            <p class="text-[11px] uppercase tracking-[0.06em] font-semibold text-on-surface-variant">Funding &amp; Payouts</p>
            <div class="has-tip cursor-help text-[11px] uppercase tracking-wider text-outline flex items-center gap-1">
              ${isDiscount ? 'Discount Mode' : 'P/L Split'}
              <span class="material-symbols-outlined text-[12px]">info</span>
              <div class="tip-html hidden">
                <div class="px-4 py-3 text-xs">
                  <p class="text-[11px] uppercase tracking-wider text-primary font-semibold mb-2">How shares are computed</p>
                  ${isDiscount
                    ? `<div class="space-y-1">
                        <div class="flex justify-between gap-4"><span class="text-on-surface-variant">Handover</span><span class="font-mono text-on-surface">client price = market × ${((1 - discountRate)*100).toFixed(2)}% · me = M + discount · client wire = client price − M − offset</span></div>
                        <div class="flex justify-between gap-4"><span class="text-on-surface-variant">Loss</span><span class="font-mono text-on-surface">me = min(S, M) · client = max(S − M, 0) · client owes max(M − S, 0)</span></div>
                      </div>`
                    : `<div class="space-y-1">
                        <div class="flex justify-between gap-4"><span class="text-on-surface-variant">Profit</span><span class="font-mono text-on-surface">my = ${profitSplit}% · client = ${100 - profitSplit}%</span></div>
                        <div class="flex justify-between gap-4"><span class="text-on-surface-variant">Loss</span><span class="font-mono text-on-surface">my = ${lossSplit}% · client = ${100 - lossSplit}%</span></div>
                      </div>`}
                  <p class="text-[11px] text-outline/70 mt-2">${isDiscount ? 'Funding decides who receives which cash; the discount and the loss rule decide who earns or loses.' : 'Total owed per side = contribution + share. Sum across sides = sale price.'}</p>
                </div>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <!-- ── My Side ── -->
            <div class="bg-amber-500/[0.03] border border-amber-500/15 rounded-lg p-4 space-y-2.5">
              <div class="flex items-center justify-between mb-2">
                <p class="text-[11px] uppercase tracking-wider text-amber-300/80 font-semibold">My Side</p>
                ${payoutStatusBadge(myBal.status, w.status === 'sold' ? 'post_sale' : 'pre_sale')}
              </div>
              <div class="flex justify-between text-sm"><span class="text-on-surface-variant">Contribution</span><span class="font-mono text-on-surface">${mc(myBal.contribution)}</span></div>
              ${w.status === 'sold' ? `<div class="flex justify-between text-sm">
                <span class="text-on-surface-variant">P&amp;L share</span>
                <span class="font-mono ${cls(myBal.share)}">${sgn(myBal.share)}${fmt.price(myBal.share, cur)}</span>
              </div>` : ''}
              <div class="flex justify-between text-sm pt-2 border-t border-amber-500/10">
                <span class="text-on-surface font-semibold">Total Owed</span>
                <span class="font-mono text-amber-300 font-semibold">${fmt.price(Math.max(0, myBal.owed), cur)}</span>
              </div>
              ${myBal.owed < 0 ? `<p class="text-[11px] text-error/80 italic">Loss exceeds my contribution by ${fmt.price(-myBal.owed, cur)} — may need separate settlement.</p>` : ''}
              <div class="flex justify-between text-sm"><span class="text-on-surface-variant">Paid to date</span><span class="font-mono text-emerald-400">${mc(myBal.paid)}</span></div>
              <div class="flex justify-between text-sm">
                <span class="text-on-surface font-semibold">Remaining</span>
                <span class="font-mono font-semibold ${myBal.remaining > 0 ? 'text-amber-300' : myBal.remaining < 0 ? 'text-error' : 'text-emerald-400'}">${myBal.remaining < 0 ? 'overpaid by ' + fmt.price(-myBal.remaining, cur) : fmt.price(myBal.remaining, cur)}</span>
              </div>
              <button onclick="openRecordPayoutModal(${w.id}, 'my')" class="w-full mt-2 text-[11px] font-semibold uppercase tracking-wider px-3 py-2 rounded-lg border border-amber-400/30 text-amber-300 bg-amber-500/5 hover:bg-amber-500/15 transition-all flex items-center justify-center gap-1.5">
                <span class="material-symbols-outlined text-[14px]">account_balance_wallet</span> Record My Withdrawal
              </button>
            </div>

            <!-- ── Client Side ── -->
            <div class="bg-purple-500/[0.03] border border-purple-500/15 rounded-lg p-4 space-y-2.5">
              <div class="flex items-center justify-between mb-2">
                <p class="text-[11px] uppercase tracking-wider text-purple-300/80 font-semibold">Client Side</p>
                ${payoutStatusBadge(clientBal.status, w.status === 'sold' ? 'post_sale' : 'pre_sale')}
              </div>
              <div class="flex justify-between text-sm"><span class="text-on-surface-variant">Contribution</span><span class="font-mono text-on-surface">${mc(clientBal.contribution)}</span></div>
              ${w.status === 'sold' ? `<div class="flex justify-between text-sm">
                <span class="text-on-surface-variant">P&amp;L share</span>
                <span class="font-mono ${cls(clientBal.share)}">${sgn(clientBal.share)}${fmt.price(clientBal.share, cur)}</span>
              </div>` : ''}
              ${handover ? `
              <div class="flex justify-between text-sm"><span class="text-on-surface-variant">Client price</span><span class="font-mono text-on-surface">${fmt.price(dcw.clientPrice, cur)}</span></div>
              <div class="flex justify-between text-sm"><span class="text-on-surface-variant">Entitlement (− my contrib.)</span><span class="font-mono text-on-surface">${fmt.price(dcw.entitlement, cur)}</span></div>
              ${dcw.offset ? `<div class="flex justify-between text-sm"><span class="text-on-surface-variant">Losses offset</span><span class="font-mono text-amber-300">−${fmt.price(dcw.offset, cur)}</span></div>` : ''}` : ''}
              <div class="flex justify-between text-sm pt-2 border-t border-purple-500/10">
                <span class="text-on-surface font-semibold">${handover ? 'Cash to Wire' : 'Total Owed'}</span>
                ${dcw?.isLoss
                  ? `<span class="font-mono font-semibold ${dcw.payoutClient - dcw.clientOwesMe < 0 ? 'text-error' : 'text-purple-300'}">${dcw.payoutClient - dcw.clientOwesMe < 0 ? '−' : ''}${fmt.price(Math.abs(dcw.payoutClient - dcw.clientOwesMe), cur)}</span>`
                  : `<span class="font-mono text-purple-300 font-semibold">${fmt.price(Math.max(0, clientBal.owed), cur)}</span>`}
              </div>
              ${!dcw && clientBal.owed < 0 ? `<p class="text-[11px] text-error/80 italic">Loss exceeds client contribution by ${fmt.price(-clientBal.owed, cur)} — may need separate settlement.</p>` : ''}
              <div class="flex justify-between text-sm"><span class="text-on-surface-variant">Paid to date</span><span class="font-mono text-emerald-400">${mc(clientBal.paid)}</span></div>
              ${dcw?.isLoss && dcw.clientOwesMe > 0 ? (lossRemain > 0 ? `
              <button onclick="openProfileDetail(${w.profile_id})" class="w-full text-left rounded-lg border border-error/30 bg-error/[0.06] px-3 py-2.5 hover:bg-error/10 transition-all">
                <span class="flex items-center justify-between gap-2">
                  <span class="text-sm font-semibold text-error">Client owes ${fmt.price(lossRemain, cur)}</span>
                  <span class="text-[11px] uppercase tracking-wider text-error/80 flex items-center gap-1 whitespace-nowrap">Open in Panel B <span class="material-symbols-outlined text-[14px]">arrow_forward</span></span>
                </span>
                ${totalPaid > 0 ? `<span class="block text-[11px] text-on-surface-variant mt-0.5">${fmt.price(totalPaid, cur)} of ${fmt.price(lossAmt, cur)} recovered</span>` : ''}
              </button>` : `
              <div class="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.05] px-3 py-2.5 text-sm font-semibold text-emerald-400">Loss recovered in full</div>`) : `
              <div class="flex justify-between text-sm">
                <span class="text-on-surface font-semibold">Remaining</span>
                <span class="font-mono font-semibold ${clientBal.remaining > 0 ? 'text-purple-300' : clientBal.remaining < 0 ? 'text-error' : 'text-emerald-400'}">${clientBal.remaining < 0 ? 'overpaid by ' + fmt.price(-clientBal.remaining, cur) : fmt.price(clientBal.remaining, cur)}</span>
              </div>`}
              <button onclick="openRecordPayoutModal(${w.id}, 'client')" class="w-full mt-2 text-[11px] font-semibold uppercase tracking-wider px-3 py-2 rounded-lg border border-purple-400/30 text-purple-300 bg-purple-500/5 hover:bg-purple-500/15 transition-all flex items-center justify-center gap-1.5">
                <span class="material-symbols-outlined text-[14px]">payments</span> Record Client Payout
              </button>
            </div>
          </div>

          <!-- Ledger rows -->
          <div class="mt-5 pt-5 border-t border-outline-variant/10">
            <p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-3">Payout Ledger</p>
            <div class="grid grid-cols-2 gap-6">
              <div>
                <p class="text-[11px] uppercase tracking-wider text-amber-300/60 mb-2">My Withdrawals</p>
                ${activeMyPayouts.length === 0
                  ? `<p class="text-xs text-on-surface-variant/40 italic">No withdrawals yet</p>`
                  : activeMyPayouts.map(px => renderLedgerRow(px, 'my')).join('')}
              </div>
              <div>
                <p class="text-[11px] uppercase tracking-wider text-purple-300/60 mb-2">Client Payouts</p>
                ${activeClientPayouts.length === 0
                  ? `<p class="text-xs text-on-surface-variant/40 italic">No payouts yet</p>`
                  : activeClientPayouts.map(px => renderLedgerRow(px, 'client')).join('')}
              </div>
            </div>
          </div>
        </div>

        <!-- Expenses -->
        <div class="glass-surface rounded-xl p-6">
          <div class="flex items-center justify-between mb-4">
            <p class="text-[11px] uppercase tracking-[0.06em] font-semibold text-on-surface-variant">
              Expenses${activeExp.length > 0 ? ` · <span class="text-sky-300">${fmt.price(totalExp, cur)}</span>` : ''}
            </p>
            ${w.status !== 'wishlist' ? `<button onclick="openAddExpenseModal(${w.id})" class="text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg border border-sky-500/30 text-sky-400 bg-sky-500/5 hover:bg-sky-500/10 transition-all flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[13px]">add</span> Add
            </button>` : ''}
          </div>
          ${expRows}
        </div>

        <!-- Loss payments (discount + sold + loss) -->
        ${showLoss ? `
        <div class="glass-surface rounded-xl p-6">
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-3">
              <p class="text-[11px] uppercase tracking-[0.06em] font-semibold text-on-surface-variant">Loss Settlement</p>
              <span class="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${lsMap[lossStatus] || lsMap.open}">${lsLabel[lossStatus] || lossStatus}</span>
            </div>
            ${lossStatus !== 'settled' ? `<button onclick="openRecordPaymentModal(${w.id})" class="text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg border border-amber-400/30 text-amber-400 bg-amber-400/5 hover:bg-amber-400/10 transition-all flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[13px]">payments</span> Record
            </button>` : ''}
          </div>
          <div class="grid grid-cols-3 gap-4 mb-4 text-sm">
            <div><p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-1">Client Owes Me</p><p class="font-mono text-error">${fmt.price(lossAmt, cur)}</p>${dcw ? `<p class="text-[11px] text-outline mt-0.5">loss ${fmt.price(dcw.loss, cur)} · my contrib. ${fmt.price(dcw.M, cur)} − sold ${fmt.price(dcw.S, cur)}</p>` : ''}</div>
            <div><p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-1">Recovered</p><p class="font-mono text-emerald-400">${fmt.price(totalPaid, cur)}</p></div>
            <div><p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-1">Remaining</p><p class="font-mono ${lossRemain > 0 ? 'text-error' : 'text-emerald-400'}">${fmt.price(lossRemain, cur)}</p></div>
          </div>
          ${payRows}
        </div>` : ''}

      </div><!-- /left -->

      <!-- RIGHT: Watch identity + Client + Shop + Rules ──────────────────── -->
      <div class="space-y-6">

        <!-- Watch identity -->
        ${infoCard('Watch Identity', [
          field('Stock No.',     w.stock_number,     true),
          field('Reference No.', w.reference_number, true),
          field('Serial No.',    w.serial_number,    true),
          field('Movement No.',  w.movement_number,  true),
          field('Case No.',      w.case_number,      true),
          field('Source',        w.source),
          field('Currency',      w.currency),
          field('Purchase Date', fmt.date(w.purchase_date)),
          w.status === 'sold' ? field('Sold Date', fmt.date(w.sold_date)) : '',
          w.status === 'sold' ? field('Sold To', w.sold_to) : '',
          w.notes ? `<div class="col-span-2"><p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-0.5">Notes</p><p class="text-sm text-on-surface leading-relaxed">${esc(w.notes)}</p></div>` : '',
        ].filter(Boolean).join(''))}

        <!-- Client card -->
        ${pr.name ? `
        <div class="glass-surface rounded-xl p-5 border border-outline-variant/10">
          <p class="text-[11px] uppercase tracking-[0.06em] font-semibold text-on-surface-variant mb-4">Client / Membership</p>
          <div class="flex items-center gap-4 mb-4">
            ${avatarHtml(pr.name, pr.photo_path || (cl?.photo_path), 'md')}
            <div class="min-w-0">
              <p class="font-semibold text-on-surface truncate">${esc(pr.name)}</p>
              ${pr.email ? `<p class="text-xs text-on-surface-variant mt-0.5 truncate">${esc(pr.email)}</p>` : ''}
              ${pr.pp_urn ? `<p class="text-xs font-mono text-on-surface-variant mt-0.5">${esc(pr.pp_urn)}</p>` : ''}
            </div>
          </div>
          <div class="flex flex-wrap gap-2">
            <button onclick="openProfileDetail(${w.profile_id})" class="text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg border border-primary/30 text-primary hover:bg-primary/10 transition-all flex items-center gap-1">
              <span class="material-symbols-outlined text-[13px]">open_in_new</span> Membership
            </button>
            ${pr.client_id ? `<button onclick="openClientDetail(${pr.client_id})" class="text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg border border-outline-variant/30 text-on-surface-variant hover:text-primary hover:border-primary/30 transition-all flex items-center gap-1">
              <span class="material-symbols-outlined text-[13px]">person</span> Full Profile
            </button>` : ''}
          </div>
        </div>` : ''}

        <!-- Shop card -->
        ${pr.shop_name ? `
        <div class="glass-surface rounded-xl p-5 border border-outline-variant/10">
          <p class="text-[11px] uppercase tracking-[0.06em] font-semibold text-on-surface-variant mb-3">Shop</p>
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span class="material-symbols-outlined text-primary text-[18px]">store</span>
              </div>
              <p class="font-semibold text-on-surface">${esc(pr.shop_name)}</p>
            </div>
            ${pr.shop_id ? `<button onclick="openShopDetail(${pr.shop_id})" class="text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg border border-outline-variant/30 text-on-surface-variant hover:text-primary hover:border-primary/30 transition-all flex items-center gap-1">
              <span class="material-symbols-outlined text-[13px]">open_in_new</span>
            </button>` : ''}
          </div>
        </div>` : ''}

        <!-- Trading rule card -->
        <div class="glass-surface rounded-xl p-5 border border-outline-variant/10">
          <p class="text-[11px] uppercase tracking-[0.06em] font-semibold text-on-surface-variant mb-4">Trading Rules</p>
          <div class="space-y-2.5 text-sm">
            <div class="flex justify-between"><span class="text-on-surface-variant">${w.status === 'sold' ? 'Rule (this watch)' : 'Rule'}</span><span class="font-semibold ${isDiscount ? 'text-amber-400' : 'text-purple-400'}">${isDiscount ? 'Discount Split' : 'P/L Split'}</span></div>
            ${ruleIsOwn ? `<p class="text-[11px] text-on-surface-variant/70 -mt-1">Chosen for this sale · client default is ${(pr.trading_rule || 'split') === 'discount' ? 'Discount Split' : 'P/L Split'}</p>` : ''}
            ${isDiscount
              ? `<div class="flex justify-between"><span class="text-on-surface-variant">Discount Rate</span><span class="font-mono text-amber-300">${((discountRate)*100).toFixed(2)}%</span></div>`
              : `<div class="flex justify-between"><span class="text-on-surface-variant">Profit Split (me)</span><span class="font-mono text-emerald-400">${profitSplit}%</span></div>
                 <div class="flex justify-between"><span class="text-on-surface-variant">Loss Split (me)</span><span class="font-mono text-error">${lossSplit}%</span></div>`}
          </div>
        </div>

      </div><!-- /right -->
    </div><!-- /main grid -->
  `;
}
