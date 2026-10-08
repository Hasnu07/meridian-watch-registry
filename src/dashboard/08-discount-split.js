// 08-discount-split.js — Discount Split v2 maths, portfolio summary, layout
// Part of the dashboard script: scripts/build.js concatenates src/dashboard/*.js
// in filename order into public/js/dashboard.js (one classic script, so
// functions and top-level variables stay shared exactly as before).

// ── Discount Split v2 (Purosangue spec) — single source of truth ─────────────
// Mirrors _discountCalc() in db.js.
// Profitable watch (handover): market price P agreed per watch; client price =
//   P × (1 − rate) (Standard) or typed (Manual); my income = P − client price;
//   client entitlement = client price − M; cash to wire = entitlement − offset.
// Loss watch (sold at S below list, no market price): proceeds repay my
//   contribution M first; client owes me max(M − S, 0) (Panel B); any surplus
//   max(S − M, 0) is paid out to the client. The loss is 100% the client's.
function discountCalc(w, profile) {
  const L    = w.list_price ?? 0;
  const S    = w.sale_price;
  const M    = w.my_cost != null ? w.my_cost : Math.max(L - (w.client_cost || 0), 0);
  const C    = w.client_cost != null ? w.client_cost : Math.max(L - M, 0);
  const rate = w.discount_rate_applied ?? profile?.discount_split ?? profile?.discountSplit ?? 0.08;
  const recoveries = (w.loss_payments || []).filter(p => !p.reversed);
  const recovered  = recoveries.reduce((s, p) => s + (p.amount || 0), 0);
  if (w.market_price != null) {
    const P           = w.market_price;
    const manual      = w.discount_mode === 'manual' && w.client_price_manual != null;
    const clientPrice = manual ? w.client_price_manual : P * (1 - rate);
    const discAmt     = P - clientPrice;
    const entitlement = clientPrice - M;
    const offset      = w.offset_amount || 0;
    return {
      isProfit: true, isLoss: false, L, M, C, S, P, rate, manual, clientPrice, discAmt,
      discPct: P ? discAmt / P : 0, entitlement, offset,
      wire: Math.max(entitlement - offset, 0),
      loss: 0, clientOwesMe: 0, recovered: 0, outstanding: 0, recoveries: [],
      myIncome: discAmt, clientPnl: clientPrice - L, rawDiff: P - L,
      myOwed: M + discAmt, clientOwed: Math.max(entitlement - offset, 0),
    };
  }
  const s = S ?? 0;
  const clientOwesMe = Math.max(M - s, 0);
  return {
    isProfit: false, isLoss: S != null && S < L, L, M, C, S, P: null, rate, manual: false,
    clientPrice: null, discAmt: 0, discPct: 0, entitlement: 0, offset: 0, wire: 0,
    loss: Math.max(L - s, 0), cashBackMe: Math.min(s, M), payoutClient: Math.max(s - M, 0),
    clientOwesMe, recovered, outstanding: Math.max(clientOwesMe - recovered, 0), recoveries,
    myIncome: 0, clientPnl: S != null ? s - L : 0, rawDiff: S != null ? s - L : 0,
    myOwed: Math.min(s, M), clientOwed: Math.max(s - M, 0),
  };
}

// Human label for a loss-recovery entry (Panel B)
function recoveryMethodLabel(px) {
  if (px.method === 'OFFSET') return px.notes || 'Offset';
  return ({ BANK_TRANSFER: 'Bank transfer', CASH: 'Cash', OTHER: 'Other' })[px.method] || (px.method || '').replace(/_/g, ' ').toLowerCase();
}

// Which rule a watch is settled under: its own (chosen on Mark Sold) or,
// when none was chosen, its client's rule.
function watchRule(w, profile) {
  return w.rule_applied || profile?.trading_rule || w.profile?.trading_rule || w.trading_rule || 'split';
}

// P/L Split handover: the watch came to me at the client price (sale_price)
// below the agreed market price — that discount is mine on top of my P/L %.
function splitHandoverDisc(w) {
  return (w.market_price != null && w.sale_price != null) ? Math.max(w.market_price - w.sale_price, 0) : 0;
}

function computePnl(profile) {
  const watches      = profile.watches || [];
  const profitSplit  = profile.profit_split_me ?? 100;
  const lossSplit    = profile.loss_split_me   ?? 100;
  // Client's default rule — drives the page layout; each sold watch may still
  // be settled under the other rule (watch.rule_applied).
  const isDiscount   = (profile.trading_rule || 'split') === 'discount';
  const discountSplit= profile.discount_split  ?? 0.08;

  const activeWatches   = watches.filter(w => w.status === 'purchased');
  const soldWatches     = watches.filter(w => w.status === 'sold');
  const wishlistWatches = watches.filter(w => w.status === 'wishlist');

  const isDiscW = w => watchRule(w, profile) === 'discount';
  const dcOf = w => discountCalc(w, profile);
  // Raw gain/loss per sold watch. Discount handovers use market − list (my
  // resale price is never part of this portal).
  const rawDiff = w => {
    if (w.list_price == null) return null;
    if (isDiscW(w)) { const d = dcOf(w); return (d.isProfit || w.sale_price != null) ? d.rawDiff : null; }
    return w.sale_price == null ? null : w.sale_price - w.list_price + splitHandoverDisc(w);
  };
  // Part of a P/L watch's result that is split by the % (handover discount excluded)
  const splitDiff = w => (w.sale_price == null || w.list_price == null) ? 0 : w.sale_price - w.list_price;

  const discSoldWatches  = soldWatches.filter(isDiscW);
  const splitSoldWatches = soldWatches.filter(w => !isDiscW(w));
  // Panel A / Panel B — watches settled under the Discount rule
  const profitWatches = discSoldWatches.filter(w => w.list_price != null && dcOf(w).isProfit);
  const lossWatches   = discSoldWatches.filter(w => w.list_price != null && dcOf(w).isLoss);
  // Watches settled under the P/L split rule
  const splitProfitWatches = splitSoldWatches.filter(w => w.sale_price != null && w.list_price != null && w.sale_price > w.list_price);
  const splitLossWatches   = splitSoldWatches.filter(w => w.sale_price != null && w.list_price != null && w.sale_price < w.list_price);

  let grossProfit = 0, grossLoss = 0, discountIncome = 0, totalMarketValue = 0;
  let totalLossAmount = 0, totalLossOwed = 0, totalLossPaid = 0, lossOutstanding = 0;
  let totalOffsetsGiven = 0, totalWire = 0, clientDiscountPnl = 0;

  let splitNet = 0, splitHandoverDiscount = 0;
  for (const w of soldWatches) {
    const diff = rawDiff(w);
    if (diff == null) continue;
    // Raw gain/loss is tracked for BOTH rules (used by Portfolio Summary tiles)
    if (diff > 0) grossProfit += diff;
    else          grossLoss  += diff;
    if (!isDiscW(w)) { splitNet += splitDiff(w); splitHandoverDiscount += splitHandoverDisc(w); }
    if (isDiscW(w)) {
      const d = dcOf(w);
      clientDiscountPnl += d.clientPnl;
      if (d.isProfit) {
        // Panel A: effective discount £ = market price − client price
        discountIncome    += d.discAmt;
        totalMarketValue  += d.P;
        totalOffsetsGiven += d.offset;
        totalWire         += d.wire;
      } else if (d.isLoss) {
        // Panel B: loss is the client's; debt = shortfall vs my contribution
        totalLossAmount += d.loss;
        totalLossOwed   += d.clientOwesMe;
        totalLossPaid   += d.recovered;
        lossOutstanding += d.outstanding;
      }
    }
  }

  const avgDiscountPct = totalMarketValue ? discountIncome / totalMarketValue : 0;
  const netPnl = grossProfit + grossLoss;

  // My / client share = P/L split of the split-rule watches' net result
  // + Discount-rule results (my discount; client price − list or the loss)
  const splitMeNet  = splitNet >= 0 ? profitSplit : lossSplit;
  const myShare     = (splitMeNet / 100) * splitNet + splitHandoverDiscount + discountIncome;
  const clientShare = ((100 - splitMeNet) / 100) * splitNet + clientDiscountPnl;

  const myCapital       = profile.my_capital       || 0;
  const clientCapital   = profile.client_capital   || 0;
  const myRemaining     = profile.my_remaining     || 0;
  const clientRemaining = profile.client_remaining || 0;

  // ── Per-currency aggregation helper ───────────────────────────────────
  // Watches may be in different currencies; we never blend them together.
  // Each *_byCur field is { CHF: amount, EUR: amount, ... } with only
  // non-zero entries kept.
  const byCur = (rows, getValue) => {
    const m = {};
    for (const w of rows) {
      const v = getValue(w);
      if (v == null || v === 0) continue;
      const c = w.currency || 'CHF';
      m[c] = (m[c] || 0) + v;
    }
    return m;
  };

  const paidWatches = watches.filter(w => w.status === 'purchased' || w.status === 'sold');

  // Active-only (still tied up in inventory) — single-currency legacy fields kept
  const myCostInWatches      = activeWatches.reduce((s, w) => s + (w.my_cost     || 0), 0);
  const clientCostInWatches  = activeWatches.reduce((s, w) => s + (w.client_cost || 0), 0);
  const totalCostInWatches   = myCostInWatches + clientCostInWatches;
  const totalListValueActive = activeWatches.reduce((s, w) => s + (w.list_price || 0), 0);
  const totalSaleValue       = soldWatches.reduce((s, w)  => s + (w.sale_price  || 0), 0);

  // Per-currency views — what the new tiles actually render
  const myTotalCostByCur      = byCur(paidWatches, w => w.my_cost     || 0);
  const clientTotalCostByCur  = byCur(paidWatches, w => w.client_cost || 0);
  const totalCostByCur        = {};
  for (const c of new Set([...Object.keys(myTotalCostByCur), ...Object.keys(clientTotalCostByCur)])) {
    totalCostByCur[c] = (myTotalCostByCur[c] || 0) + (clientTotalCostByCur[c] || 0);
  }
  const totalListValueActiveByCur = byCur(activeWatches, w => w.list_price || 0);
  const totalSaleValueByCur       = byCur(soldWatches,   w => w.sale_price || 0);
  const totalProfitByCur          = byCur(soldWatches, w => {
    const d = rawDiff(w);
    return d != null && d > 0 ? d : 0;
  });
  const totalLossByCur            = byCur(soldWatches, w => {
    const d = rawDiff(w);
    return d != null && d < 0 ? d : 0;
  });
  const netPnlByCur = {};
  for (const c of new Set([...Object.keys(totalProfitByCur), ...Object.keys(totalLossByCur)])) {
    netPnlByCur[c] = (totalProfitByCur[c] || 0) + (totalLossByCur[c] || 0);
  }

  // My P&L / Client P&L per currency — always use the trading-rule split so
  // the tiles are consistent with the "Rules Applied to P&L" section and the
  // hover tooltip.  Per-watch received/cost data is still shown in the watch
  // expansion banner; it is not used here to avoid tile/tooltip divergence when
  // the user has partially or incorrectly filled in those fields.
  const myPnlByCur     = {};
  const clientPnlByCur = {};
  const addTo = (m, c, v) => { if (v) m[c] = (m[c] || 0) + v; };
  // Discount-rule watches: my P&L = effective discount on handovers only; the
  // client carries 100% of every loss and keeps client price − list.
  const discountIncomeByCur = {};
  for (const w of discSoldWatches) {
    if (rawDiff(w) == null) continue;
    const c = w.currency || 'CHF';
    const d = dcOf(w);
    addTo(myPnlByCur, c, d.myIncome);
    addTo(discountIncomeByCur, c, d.myIncome);
    addTo(clientPnlByCur, c, d.clientPnl);
  }
  // P/L-split watches: apply profit/loss split to their net P&L per currency
  const splitNetByCur = byCur(splitSoldWatches, w => splitDiff(w));
  for (const w of splitSoldWatches) addTo(myPnlByCur, w.currency || 'CHF', splitHandoverDisc(w));
  for (const [c, net] of Object.entries(splitNetByCur)) {
    if (!net) continue;
    const splitMe = net >= 0 ? profitSplit : lossSplit;
    addTo(myPnlByCur, c, (splitMe / 100) * net);
    addTo(clientPnlByCur, c, ((100 - splitMe) / 100) * net);
  }

  // Legacy single-currency totals (used by older code paths / displays)
  const myTotalCost     = Object.values(myTotalCostByCur).reduce((s, v) => s + v, 0);
  const clientTotalCost = Object.values(clientTotalCostByCur).reduce((s, v) => s + v, 0);
  const totalCost       = myTotalCost + clientTotalCost;
  const myPnl     = myShare;
  const clientPnl = clientShare;
  const totalProfit = Math.max(grossProfit, 0);
  const totalLoss   = Math.min(grossLoss, 0);

  // ── Expenses ──────────────────────────────────────────────────────────────
  // Sum non-reversed expenses across all paid watches, grouped by expense currency
  const totalExpensesByCur = {};
  for (const w of paidWatches) {
    for (const ex of (w.expenses || [])) {
      if (ex.reversed) continue;
      const c = ex.currency || w.currency || 'CHF';
      totalExpensesByCur[c] = (totalExpensesByCur[c] || 0) + ex.amount;
    }
  }
  const totalExpenses = Object.values(totalExpensesByCur).reduce((s, v) => s + v, 0);
  // Adj. Net P&L = Net P&L minus total expenses (informational; does not affect split tiles)
  const adjustedNetPnlByCur = { ...netPnlByCur };
  for (const [c, v] of Object.entries(totalExpensesByCur)) {
    adjustedNetPnlByCur[c] = (adjustedNetPnlByCur[c] || 0) - v;
  }

  // ── Funding & Payouts (per-side balances) ─────────────────────────────────
  // For each watch, compute contribution + share (sold only) = owed; ledger
  // sum = paid; remaining = max(0, owed - paid). Grouped by currency for tiles.
  const clientPaidByCur      = {};
  const clientOwedByCur      = {};
  const clientRemainingByCur = {};
  const myPaidByCur          = {};
  const myOwedByCur          = {};
  const myRemainingByCur     = {};

  for (const w of paidWatches) {
    const c    = w.currency || 'CHF';
    const cCon = w.client_cost || 0;
    const mCon = w.my_cost     || 0;

    let cOwed = cCon, mOwed = mCon;
    if (w.status === 'sold' && w.list_price != null && isDiscW(w) && (w.sale_price != null || w.market_price != null)) {
      // v2: handover → me: M + discount, client: wire; loss → me: min(S, M), client: max(S − M, 0)
      const d = dcOf(w);
      mOwed = d.myOwed;
      cOwed = d.clientOwed;
    } else if (w.status === 'sold' && w.list_price != null && w.sale_price != null) {
      const gross = w.sale_price - w.list_price;
      const sp = gross >= 0 ? profitSplit : lossSplit;
      mOwed = mCon + (sp / 100) * gross + splitHandoverDisc(w);
      cOwed = cCon + ((100 - sp) / 100) * gross;
    }
    const cPaid = (w.client_payouts || []).filter(p => !p.reversed).reduce((s, p) => s + p.amount, 0);
    const mPaid = (w.my_payouts     || []).filter(p => !p.reversed).reduce((s, p) => s + p.amount, 0);

    clientOwedByCur[c]      = (clientOwedByCur[c]      || 0) + cOwed;
    clientPaidByCur[c]      = (clientPaidByCur[c]      || 0) + cPaid;
    clientRemainingByCur[c] = (clientRemainingByCur[c] || 0) + Math.max(0, cOwed - cPaid);
    myOwedByCur[c]          = (myOwedByCur[c]          || 0) + mOwed;
    myPaidByCur[c]          = (myPaidByCur[c]          || 0) + mPaid;
    myRemainingByCur[c]     = (myRemainingByCur[c]     || 0) + Math.max(0, mOwed - mPaid);
  }

  return {
    isDiscount, profitSplit, lossSplit, discountSplit,
    grossProfit, grossLoss, discountIncome, netPnl, splitNet, splitHandoverDiscount,
    profitWatches, lossWatches, soldWatches, activeWatches, wishlistWatches,
    discSoldWatches, splitSoldWatches, splitProfitWatches, splitLossWatches,
    hasDiscountWatches: discSoldWatches.length > 0,
    hasSplitWatches:    splitSoldWatches.length > 0,
    totalLossAmount, totalLossPaid, lossOutstanding,
    totalLossOwed, totalMarketValue, avgDiscountPct, totalOffsetsGiven, totalWire,
    clientContribOpen: activeWatches.reduce((s, w) => s + (w.client_cost || 0), 0),
    myShare, clientShare, myPnl, clientPnl,
    totalProfit, totalLoss,
    soldCount:      soldWatches.length,
    purchasedCount: activeWatches.length,
    wishlistCount:  wishlistWatches.length,
    totalWatches:   watches.length,
    myCapital, clientCapital, myRemaining, clientRemaining,
    capitalDeployed: myCapital + clientCapital,
    available:       myRemaining + clientRemaining,
    // Cost views — active-only (legacy) and full (purchased + sold)
    myCostInWatches, clientCostInWatches, totalCostInWatches,
    myTotalCost, clientTotalCost, totalCost,
    totalListValueActive, totalSaleValue,
    // Per-currency aggregates — drive the multi-currency tiles
    myTotalCostByCur, clientTotalCostByCur, totalCostByCur,
    totalListValueActiveByCur, totalSaleValueByCur,
    totalProfitByCur, totalLossByCur, netPnlByCur,
    myPnlByCur, clientPnlByCur, discountIncomeByCur,
    profitWatchCount: profitWatches.length + splitProfitWatches.length,
    lossWatchCount:   lossWatches.length + splitLossWatches.length,
    // Expenses
    totalExpenses, totalExpensesByCur, adjustedNetPnlByCur,
    // Funding & Payouts
    clientPaidByCur, clientOwedByCur, clientRemainingByCur,
    myPaidByCur,     myOwedByCur,     myRemainingByCur,
  };
}

// ── Unified 9-tile Portfolio Summary ──────────────────────────────────────
// Used on profile detail, master identity overview, and any other dashboard
// that needs the same financial roll-up. Layout is mode-aware:
//
//   Row 1 (capital):    My Total Cost      | Client Total Cost   | Total Cost
//   Row 2 (P&L raw):    Total Profit       | Total Loss          | My P&L
//   Row 3 (settlement): Client P&L         | Sale Proceeds       | Total Watches
//
// For discount mode:
//   "My P&L"     = Panel A (discount income)
//   "Client P&L" = -Total Loss Exposure (client liability via Panel B)
function renderPortfolioSummary9(p, mc, sgn, cls) {
  const activeSplit   = (p.netPnl || 0) >= 0 ? p.profitSplit : p.lossSplit;
  const myPnlNote     = p.isDiscount ? `Panel A · ${p.profitWatchCount} sale${p.profitWatchCount !== 1 ? 's' : ''}` : (activeSplit != null ? `${activeSplit}% of net${p.splitHandoverDiscount || p.discountIncome ? ' + discounts' : ''}` : 'split rule');
  const clientPnlNote = p.isDiscount ? `Panel B liability` : (activeSplit != null ? `${100 - activeSplit}% of net` : 'split rule');

  // ── Build per-tile tooltip HTML ────────────────────────────────────────
  const paidWatches = [...(p.activeWatches || []), ...(p.soldWatches || [])];

  const tipMyCost = buildWatchListTip(
    'My Cost — per watch',
    paidWatches.filter(w => (w.my_cost || 0) > 0),
    w => `<div class="flex justify-between gap-3"><span class="text-on-surface-variant truncate">${esc(w.model)} <span class="text-outline/60 text-[11px] uppercase">· ${w.status}</span></span><span class="font-mono text-emerald-400">${mc(w.my_cost)}</span></div>`,
    'Total', mc(p.myTotalCost || 0)
  );
  const tipClientCost = buildWatchListTip(
    'Client Cost — per watch',
    paidWatches.filter(w => (w.client_cost || 0) > 0),
    w => `<div class="flex justify-between gap-3"><span class="text-on-surface-variant truncate">${esc(w.model)} <span class="text-outline/60 text-[11px] uppercase">· ${w.status}</span></span><span class="font-mono text-purple-300">${mc(w.client_cost)}</span></div>`,
    'Total', mc(p.clientTotalCost || 0)
  );
  const tipTotalCost = buildWatchListTip(
    'Total Investment — per watch',
    paidWatches.filter(w => (w.my_cost || 0) + (w.client_cost || 0) > 0),
    w => {
      const t = (w.my_cost || 0) + (w.client_cost || 0);
      return `<div class="py-0.5"><div class="flex justify-between"><span class="text-on-surface truncate">${esc(w.model)}</span><span class="font-mono text-primary">${mc(t)}</span></div><div class="text-[11px] text-outline/70 flex gap-2"><span>me ${mc(w.my_cost || 0)}</span><span>client ${mc(w.client_cost || 0)}</span></div></div>`;
    },
    'Total', mc(p.totalCost || 0)
  );

  const profitList = [...(p.splitProfitWatches || []), ...(p.profitWatches || [])].filter(w => w.list_price != null && (w.sale_price != null || w.market_price != null));
  const lossList   = [...(p.splitLossWatches   || []), ...(p.lossWatches   || [])].filter(w => w.list_price != null && w.sale_price != null);

  const tipProfit = buildWatchListTip(
    'Profit — per watch',
    profitList,
    w => {
      const hv   = w.market_price != null;
      const diff = hv ? w.market_price - w.list_price : w.sale_price - w.list_price;
      return `<div class="py-0.5"><div class="flex justify-between"><span class="text-on-surface truncate">${esc(w.model)}</span><span class="font-mono text-emerald-400">+${mc(diff)}</span></div><div class="text-[11px] text-outline/70">List ${mc(w.list_price)} → ${hv ? 'Market' : 'Sold'} ${mc(hv ? w.market_price : w.sale_price)}</div></div>`;
    },
    'Gross profit', `+${mc(p.totalProfit || 0)}`
  );
  const tipLoss = buildWatchListTip(
    'Loss — per watch',
    lossList,
    w => {
      const diff = w.sale_price - w.list_price;
      return `<div class="py-0.5"><div class="flex justify-between"><span class="text-on-surface truncate">${esc(w.model)}</span><span class="font-mono text-error">${mc(diff)}</span></div><div class="text-[11px] text-outline/70">List ${mc(w.list_price)} → Sold ${mc(w.sale_price)}</div></div>`;
    },
    'Gross loss', mc(p.totalLoss || 0)
  );

  const tipMyPnl = p.isDiscount
    ? buildWatchListTip(
        'My P&L · Discount Income',
        profitList,
        w => {
          const d = discountCalc(w, p);
          return `<div class="py-0.5"><div class="flex justify-between"><span class="text-on-surface truncate">${esc(w.model)}</span><span class="font-mono text-amber-400">+${mc(d.discAmt)}</span></div><div class="text-[11px] text-outline/70">Market ${mc(d.P)} − client price ${mc(d.clientPrice)} · ${(d.discPct * 100).toFixed(2)}%</div></div>`;
        },
        'My income', `+${mc(p.myPnl || 0)}`
      )
    : `<div class="px-4 py-3">
        <p class="text-[11px] uppercase tracking-wider text-primary font-semibold mb-2">My Share Calculation</p>
        <div class="space-y-1.5 text-xs">
          <div class="flex justify-between"><span class="text-on-surface-variant">Gross profit</span><span class="font-mono text-emerald-400">+${mc(p.totalProfit || 0)}</span></div>
          <div class="flex justify-between"><span class="text-on-surface-variant">Gross loss</span><span class="font-mono ${(p.totalLoss || 0) < 0 ? 'text-error' : 'text-on-surface-variant'}">${mc(p.totalLoss || 0)}</span></div>
          <div class="flex justify-between border-t border-outline-variant/15 pt-1.5"><span class="text-on-surface font-semibold">Net P&amp;L</span><span class="font-mono ${cls(p.netPnl || 0)}">${sgn(p.netPnl || 0)}${mc(p.netPnl || 0)}</span></div>
          ${activeSplit != null ? `<div class="flex justify-between"><span class="text-on-surface-variant">Split applied</span><span class="font-mono text-on-surface">${activeSplit}%</span></div>` : ''}
          <div class="flex justify-between border-t border-outline-variant/15 pt-1.5"><span class="text-on-surface font-semibold">My share</span><span class="font-mono ${cls(p.myPnl || 0)}">${sgn(p.myPnl || 0)}${mc(p.myPnl || 0)}</span></div>
        </div>
      </div>`;

  const tipClientPnl = p.isDiscount
    ? buildWatchListTip(
        'Client P&L · per watch',
        [...profitList, ...lossList],
        w => {
          const d = discountCalc(w, p);
          const sub = d.isProfit
            ? `Client price ${mc(d.clientPrice)} − list ${mc(d.L)}`
            : `Loss ${mc(d.loss)} · owes me ${mc(d.clientOwesMe)} · recovered ${mc(d.recovered)}`;
          return `<div class="py-0.5"><div class="flex justify-between"><span class="text-on-surface truncate">${esc(w.model)}</span><span class="font-mono ${cls(d.clientPnl)}">${sgn(d.clientPnl)}${mc(d.clientPnl)}</span></div><div class="text-[11px] text-outline/70">${sub}</div></div>`;
        },
        'Client P&L', `${sgn(p.clientPnl || 0)}${mc(p.clientPnl || 0)}`
      )
    : `<div class="px-4 py-3">
        <p class="text-[11px] uppercase tracking-wider text-primary font-semibold mb-2">Client Share Calculation</p>
        <div class="space-y-1.5 text-xs">
          <div class="flex justify-between"><span class="text-on-surface-variant">Net P&amp;L</span><span class="font-mono ${cls(p.netPnl || 0)}">${sgn(p.netPnl || 0)}${mc(p.netPnl || 0)}</span></div>
          ${activeSplit != null ? `<div class="flex justify-between"><span class="text-on-surface-variant">Split applied</span><span class="font-mono text-on-surface">${100 - activeSplit}%</span></div>` : ''}
          <div class="flex justify-between border-t border-outline-variant/15 pt-1.5"><span class="text-on-surface font-semibold">Client share</span><span class="font-mono ${cls(p.clientPnl || 0)}">${sgn(p.clientPnl || 0)}${mc(p.clientPnl || 0)}</span></div>
        </div>
      </div>`;

  const tipProceeds = buildWatchListTip(
    'Sale Proceeds — per watch',
    (p.soldWatches || []).filter(w => w.sale_price != null),
    w => `<div class="flex justify-between gap-3"><span class="text-on-surface-variant truncate">${esc(w.model)}</span><span class="font-mono text-on-surface">${mc(w.sale_price)}</span></div>`,
    'Total received', mc(p.totalSaleValue || 0)
  );

  const tipTotalWatches = `
    <div class="px-4 py-3">
      <p class="text-[11px] uppercase tracking-wider text-primary font-semibold mb-2">Watch Breakdown</p>
      <div class="space-y-1.5 text-xs">
        <div class="flex justify-between"><span class="text-amber-400">🔖 Wishlist</span><span class="font-mono text-on-surface">${p.wishlistCount}</span></div>
        <div class="flex justify-between"><span class="text-purple-400">📦 Purchased</span><span class="font-mono text-on-surface">${p.purchasedCount}</span></div>
        <div class="flex justify-between"><span class="text-emerald-400">✅ Sold</span><span class="font-mono text-on-surface">${p.soldCount}</span></div>
        <div class="flex justify-between border-t border-outline-variant/15 pt-1.5"><span class="text-on-surface font-semibold">Total</span><span class="font-mono text-primary">${p.totalWatches}</span></div>
        ${p.soldCount ? `<div class="text-[11px] text-outline/70 mt-1">${p.profitWatchCount} profitable · ${p.lossWatchCount} loss</div>` : ''}
      </div>
    </div>`;

  return `
    <div class="glass-surface rounded-xl p-6">
      <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
        <p class="text-[11px] uppercase tracking-[0.06em] font-semibold text-on-surface-variant">Portfolio Summary</p>
        <span class="text-[11px] uppercase tracking-wider text-outline">Across ${p.purchasedCount + p.soldCount} paid · ${p.wishlistCount} wishlist</span>
      </div>

      <!-- Row 1: Costs (per currency when mixed) -->
      <div class="grid grid-cols-3 gap-3 mb-3">
        <div class="has-tip cursor-help bg-white/[0.03] rounded-lg p-3.5 transition-all hover:bg-white/[0.05] hover:ring-1 hover:ring-emerald-500/20">
          <p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-1">My Total Cost</p>
          <div class="font-playfair text-lg text-emerald-400">${fmt.byCurrency(p.myTotalCostByCur || {})}</div>
          <p class="text-[11px] text-on-surface-variant mt-0.5">${p.purchasedCount + p.soldCount} watch${(p.purchasedCount + p.soldCount) !== 1 ? 'es' : ''} paid</p>
          <div class="tip-html hidden">${tipMyCost}</div>
        </div>
        <div class="has-tip cursor-help bg-white/[0.03] rounded-lg p-3.5 transition-all hover:bg-white/[0.05] hover:ring-1 hover:ring-purple-500/20">
          <p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-1">Client Total Cost</p>
          <div class="font-playfair text-lg text-purple-300">${fmt.byCurrency(p.clientTotalCostByCur || {})}</div>
          <p class="text-[11px] text-on-surface-variant mt-0.5">${p.clientTotalCost > 0 ? `${p.purchasedCount + p.soldCount} watch${(p.purchasedCount + p.soldCount) !== 1 ? 'es' : ''} paid` : 'no client capital'}</p>
          <div class="tip-html hidden">${tipClientCost}</div>
        </div>
        <div class="has-tip cursor-help bg-white/[0.03] rounded-lg p-3.5 border border-primary/15 transition-all hover:bg-white/[0.05] hover:ring-1 hover:ring-primary/30">
          <p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-1">Total in Watches</p>
          <div class="font-playfair text-lg text-primary">${fmt.byCurrency(p.totalCostByCur || {})}</div>
          <p class="text-[11px] text-on-surface-variant mt-0.5">active list ${mc(p.totalListValueActive || 0)}</p>
          <div class="tip-html hidden">${tipTotalCost}</div>
        </div>
      </div>

      <!-- Row 2: Raw P&L (per currency) -->
      <div class="grid grid-cols-3 gap-3 mb-3">
        <div class="has-tip cursor-help bg-emerald-500/5 border border-emerald-500/15 rounded-lg p-3.5 transition-all hover:bg-emerald-500/10">
          <p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-1">Total Profit</p>
          <div class="font-playfair text-lg text-emerald-400">${fmt.byCurrency(p.totalProfitByCur || {}, { signed: true })}</div>
          <p class="text-[11px] text-on-surface-variant mt-0.5">${p.profitWatchCount} profitable sale${p.profitWatchCount !== 1 ? 's' : ''}</p>
          <div class="tip-html hidden">${tipProfit}</div>
        </div>
        <div class="has-tip cursor-help bg-error/5 border border-error/15 rounded-lg p-3.5 transition-all hover:bg-error/10">
          <p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-1">Total Loss</p>
          <div class="font-playfair text-lg text-error">${fmt.byCurrency(p.totalLossByCur || {}, { signed: true })}</div>
          <p class="text-[11px] text-on-surface-variant mt-0.5">${p.lossWatchCount} loss sale${p.lossWatchCount !== 1 ? 's' : ''}</p>
          <div class="tip-html hidden">${tipLoss}</div>
        </div>
        <div class="has-tip cursor-help bg-white/[0.03] rounded-lg p-3.5 border border-outline-variant/15 transition-all hover:bg-white/[0.05]">
          <p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-1">My P&amp;L</p>
          <div class="font-playfair text-lg">${fmt.byCurrency(p.myPnlByCur || {}, { signed: true, colour: true })}</div>
          <p class="text-[11px] text-on-surface-variant mt-0.5">${myPnlNote}</p>
          <div class="tip-html hidden">${tipMyPnl}</div>
        </div>
      </div>

      <!-- Row 3: Client side + proceeds + count -->
      <div class="grid grid-cols-3 gap-3 mb-3">
        <div class="has-tip cursor-help bg-white/[0.03] rounded-lg p-3.5 border border-outline-variant/15 transition-all hover:bg-white/[0.05]">
          <p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-1">Client P&amp;L</p>
          <div class="font-playfair text-lg">${fmt.byCurrency(p.clientPnlByCur || {}, { signed: true, colour: true })}</div>
          <p class="text-[11px] text-on-surface-variant mt-0.5">${clientPnlNote}</p>
          <div class="tip-html hidden">${tipClientPnl}</div>
        </div>
        <div class="has-tip cursor-help bg-white/[0.03] rounded-lg p-3.5 transition-all hover:bg-white/[0.05]">
          <p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-1">Sale Proceeds</p>
          <div class="font-playfair text-lg text-on-surface">${fmt.byCurrency(p.totalSaleValueByCur || {})}</div>
          <p class="text-[11px] text-on-surface-variant mt-0.5">${p.soldCount} sold total</p>
          <div class="tip-html hidden">${tipProceeds}</div>
        </div>
        <div class="has-tip cursor-help bg-white/[0.03] rounded-lg p-3.5 transition-all hover:bg-white/[0.05]">
          <p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-1">Total Watches</p>
          <p class="font-playfair text-lg text-on-surface">${p.totalWatches}</p>
          <p class="text-[11px] text-on-surface-variant mt-0.5">${p.wishlistCount} 🔖 · ${p.purchasedCount} 📦 · ${p.soldCount} ✅</p>
          <div class="tip-html hidden">${tipTotalWatches}</div>
        </div>
      </div>

      <!-- Row 4: Expenses + Adj. Net P&L -->
      ${(() => {
        const hasExpenses = p.totalExpensesByCur && Object.keys(p.totalExpensesByCur).length > 0;
        const expWatches = [...(p.activeWatches || []), ...(p.soldWatches || [])].filter(w => (w.expenses || []).some(ex => !ex.reversed));
        const tipExpenses = expWatches.length === 0
          ? `<div class="px-4 py-3 text-xs text-on-surface-variant italic">No expenses recorded</div>`
          : buildWatchListTip(
              'Expenses — per watch',
              expWatches,
              w => {
                const active = (w.expenses || []).filter(ex => !ex.reversed);
                const wtot   = active.reduce((s, ex) => s + ex.amount, 0);
                const wCur   = active[0]?.currency || w.currency || 'CHF';
                return `<div class="py-0.5"><div class="flex justify-between"><span class="text-on-surface truncate">${esc(w.model)}</span><span class="font-mono text-sky-300">${mc(wtot)}</span></div><div class="text-[11px] text-outline/70">${active.map(ex => expenseCategoryLabel(ex.category)).join(', ')}</div></div>`;
              },
              'Total expenses', fmt.byCurrency(p.totalExpensesByCur || {})
            );
        const tipAdjPnl = `<div class="px-4 py-3">
          <p class="text-[11px] uppercase tracking-wider text-sky-400 font-semibold mb-2">Adj. Net P&amp;L</p>
          <div class="space-y-1.5 text-xs">
            <div class="flex justify-between"><span class="text-on-surface-variant">Net P&amp;L</span><span class="font-mono ${cls(p.netPnl || 0)}">${sgn(p.netPnl || 0)}${mc(p.netPnl || 0)}</span></div>
            <div class="flex justify-between"><span class="text-on-surface-variant">Total Expenses</span><span class="font-mono text-sky-300">−${mc(p.totalExpenses || 0)}</span></div>
            <div class="flex justify-between border-t border-outline-variant/15 pt-1.5"><span class="text-on-surface font-semibold">Adj. Net P&amp;L</span><span class="font-mono ${cls(p.totalExpenses ? (p.netPnl || 0) - (p.totalExpenses || 0) : p.netPnl || 0)}">${fmt.byCurrency(p.adjustedNetPnlByCur || {}, { signed: true, colour: true })}</span></div>
            <div class="text-[11px] text-outline/60 mt-1 italic">Informational only · does not affect split tiles</div>
          </div>
        </div>`;
        return `
        <div class="grid grid-cols-2 gap-3 pt-3 border-t border-outline-variant/10">
          <div class="has-tip cursor-help bg-sky-500/[0.04] border border-sky-500/15 rounded-lg p-3.5 transition-all hover:bg-sky-500/[0.07]">
            <p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-1">Total Expenses</p>
            ${hasExpenses
              ? `<div class="font-playfair text-lg text-sky-300">${fmt.byCurrency(p.totalExpensesByCur || {})}</div>
                 <p class="text-[11px] text-on-surface-variant mt-0.5">${expWatches.length} watch${expWatches.length !== 1 ? 'es' : ''} with expenses</p>`
              : `<p class="font-playfair text-lg text-on-surface-variant/40">—</p>
                 <p class="text-[11px] text-on-surface-variant/40 mt-0.5 italic">no expenses recorded</p>`}
            <div class="tip-html hidden">${tipExpenses}</div>
          </div>
          <div class="has-tip cursor-help bg-sky-500/[0.04] border border-sky-500/15 rounded-lg p-3.5 transition-all hover:bg-sky-500/[0.07]">
            <p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-1">Adj. Net P&amp;L</p>
            <div class="font-playfair text-lg">${fmt.byCurrency(p.adjustedNetPnlByCur || {}, { signed: true, colour: true })}</div>
            <p class="text-[11px] text-on-surface-variant mt-0.5">net P&amp;L − expenses</p>
            <div class="tip-html hidden">${tipAdjPnl}</div>
          </div>
        </div>`;
      })()}

      <!-- Row 5: Client Outstanding + My Outstanding -->
      ${(() => {
        const cRemAny = p.clientRemainingByCur && Object.values(p.clientRemainingByCur).some(v => v > 0);
        const mRemAny = p.myRemainingByCur     && Object.values(p.myRemainingByCur    ).some(v => v > 0);
        const sumByCur = (a, b) => {
          const out = { ...(a || {}) };
          for (const [k, v] of Object.entries(b || {})) out[k] = (out[k] || 0) + v;
          return out;
        };

        const clientWatches = paidWatches.filter(w => (w.client_cost || 0) > 0 || (w.client_payouts || []).some(px => !px.reversed));
        const myWatches     = paidWatches.filter(w => (w.my_cost     || 0) > 0 || (w.my_payouts     || []).some(px => !px.reversed));

        const tipClientOut = buildWatchListTip(
          'Client Outstanding — per watch',
          clientWatches,
          w => {
            const bal = watchPayoutBalance(w, 'client');
            return `<div class="py-0.5"><div class="flex justify-between"><span class="text-on-surface truncate">${esc(w.model)}</span><span class="font-mono ${bal.remaining > 0 ? 'text-purple-300' : 'text-emerald-400'}">${mc(Math.max(0, bal.remaining))}</span></div><div class="text-[11px] text-outline/70">Owed ${mc(bal.owed)} · Paid ${mc(bal.paid)}</div></div>`;
          },
          'Total remaining', fmt.byCurrency(p.clientRemainingByCur || {})
        );
        const tipMyOut = buildWatchListTip(
          'My Outstanding — per watch',
          myWatches,
          w => {
            const bal = watchPayoutBalance(w, 'my');
            return `<div class="py-0.5"><div class="flex justify-between"><span class="text-on-surface truncate">${esc(w.model)}</span><span class="font-mono ${bal.remaining > 0 ? 'text-amber-300' : 'text-emerald-400'}">${mc(Math.max(0, bal.remaining))}</span></div><div class="text-[11px] text-outline/70">Owed ${mc(bal.owed)} · Paid ${mc(bal.paid)}</div></div>`;
          },
          'Total remaining', fmt.byCurrency(p.myRemainingByCur || {})
        );

        return `
        <div class="grid grid-cols-2 gap-3 pt-3 mt-3 border-t border-outline-variant/10">
          <div class="has-tip cursor-help bg-purple-500/[0.04] border border-purple-500/15 rounded-lg p-3.5 transition-all hover:bg-purple-500/[0.08]">
            <p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-1">Client Outstanding</p>
            ${cRemAny
              ? `<div class="font-playfair text-lg text-purple-300">${fmt.byCurrency(p.clientRemainingByCur || {})}</div>
                 <p class="text-[11px] text-on-surface-variant mt-0.5">owed ${fmt.byCurrency(p.clientOwedByCur || {})} · paid ${fmt.byCurrency(p.clientPaidByCur || {})}</p>`
              : `<p class="font-playfair text-lg text-on-surface-variant/40">—</p>
                 <p class="text-[11px] text-on-surface-variant/40 mt-0.5 italic">fully settled</p>`}
            <div class="tip-html hidden">${tipClientOut}</div>
          </div>
          <div class="has-tip cursor-help bg-amber-500/[0.04] border border-amber-500/15 rounded-lg p-3.5 transition-all hover:bg-amber-500/[0.08]">
            <p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-1">My Outstanding</p>
            ${mRemAny
              ? `<div class="font-playfair text-lg text-amber-300">${fmt.byCurrency(p.myRemainingByCur || {})}</div>
                 <p class="text-[11px] text-on-surface-variant mt-0.5">owed ${fmt.byCurrency(p.myOwedByCur || {})} · paid ${fmt.byCurrency(p.myPaidByCur || {})}</p>`
              : `<p class="font-playfair text-lg text-on-surface-variant/40">—</p>
                 <p class="text-[11px] text-on-surface-variant/40 mt-0.5 italic">fully settled</p>`}
            <div class="tip-html hidden">${tipMyOut}</div>
          </div>
        </div>`;
      })()}
    </div>
  `;
}

// ── Discount Split v2 layout ─────────────────────────────────────────────
// One consistent card language for discount profiles: KPI tiles on top, then
// Panel A and Panel B as real tables, then funding. Split profiles keep the
// P/L split layout below.
const DS_TONE = {
  gold:    'text-amber-400',
  debt:    'text-error',
  good:    'text-emerald-400',
  client:  'text-purple-300',
  neutral: 'text-on-surface',
};

function dsKpi(label, value, sub, tone = 'neutral', hint = '') {
  return `
    <div class="bg-white/[0.03] border border-outline-variant/15 rounded-lg px-4 py-3.5 min-w-0" ${hint ? `title="${esc(hint)}"` : ''}>
      <p class="text-[11px] uppercase tracking-wider leading-snug text-on-surface-variant min-h-[2.2em]">${label}</p>
      <p class="font-playfair text-2xl mt-1 leading-tight ${DS_TONE[tone] || tone} truncate">${value}</p>
      ${sub ? `<p class="text-[11px] leading-snug text-on-surface-variant/70 mt-1">${sub}</p>` : ''}
    </div>`;
}

function dsCard(eyebrow, title, right, body, accent = 'border-outline-variant/10') {
  return `
    <div class="glass-surface rounded-xl border ${accent} overflow-hidden">
      <div class="px-6 pt-5 pb-4 flex items-start justify-between gap-4 flex-wrap">
        <div>
          ${eyebrow ? `<p class="text-[11px] uppercase tracking-[0.06em] font-semibold text-on-surface-variant/70">${eyebrow}</p>` : ''}
          <p class="text-base font-semibold text-on-surface mt-0.5">${title}</p>
        </div>
        ${right ? `<div class="text-right">${right}</div>` : ''}
      </div>
      ${body}
    </div>`;
}

const dsTh = (label, right) => `<th class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap ${right ? 'text-right' : ''}">${label}</th>`;
const dsTd = (html, extra = '') => `<td class="px-3 py-3 align-top ${extra}">${html}</td>`;
const dsNum = (html, extra = '') => dsTd(html, `text-right font-mono text-sm whitespace-nowrap ${extra}`);

// Split recovered loss money into bank transfers vs offsets
function dsRecoveredBreakdown(lossWatches) {
  let transfers = 0, offsets = 0;
  for (const w of lossWatches) for (const px of (w.loss_payments || [])) {
    if (px.reversed) continue;
    if (px.method === 'OFFSET') offsets += px.amount; else transfers += px.amount;
  }
  return { transfers, offsets };
}

function renderDiscountKpis(p, mc, opts = {}) {
  const rec = dsRecoveredBreakdown(p.lossWatches || []);
  const tiles = [
    dsKpi('Discount earned', `+${mc(p.discountIncome)}`,
          p.totalMarketValue ? `avg ${(p.avgDiscountPct * 100).toFixed(2)}% · standard ${(p.discountSplit * 100).toFixed(2)}%` : `standard ${(p.discountSplit * 100).toFixed(2)}% of market`,
          'gold', 'Sum of effective discounts (market price − client price) on handovers'),
    dsKpi('Owed to me', mc(p.lossOutstanding), 'Panel B outstanding', p.lossOutstanding > 0 ? 'debt' : 'good',
          'Loss shortfalls the client still owes me'),
    dsKpi('Recovered', mc(p.totalLossPaid),
          p.totalLossPaid ? `${mc(rec.transfers)} transfers · ${mc(rec.offsets)} offsets` : 'transfers + offsets', 'good'),
    dsKpi('Wired to client', mc(p.totalWire), p.totalOffsetsGiven ? `after ${mc(p.totalOffsetsGiven)} offsets` : 'cash to client on handovers', 'client'),
    dsKpi('Client P&L', `${p.clientPnl > 0 ? '+' : ''}${mc(p.clientPnl)}`, 'client price − list, net of losses', p.clientPnl >= 0 ? 'good' : 'debt',
          "The client's result — never counted as mine"),
  ];
  if (opts.clientContrib) tiles.push(dsKpi('Client contributions', mc(p.clientContribOpen), 'on open watches', 'client'));
  // Watches sold under both rules: show my combined result instead of the count
  else if (p.hasSplitWatches) tiles.push(dsKpi('My P&L · all rules', `${p.myPnl > 0 ? '+' : ''}${mc(p.myPnl)}`,
          `discount ${mc(p.discountIncome)} + P/L sales ${mc(p.myPnl - p.discountIncome)}`, p.myPnl >= 0 ? 'good' : 'debt'));
  else tiles.push(dsKpi('Watches', String(p.totalWatches),
          `${p.wishlistCount} wishlist · ${p.purchasedCount} open · ${p.soldCount} sold`, 'neutral'));
  return `<div class="grid grid-cols-2 md:grid-cols-3 min-[1500px]:grid-cols-6 gap-3">${tiles.join('')}</div>`;
}

function renderDiscountTerms(p) {
  const std = (p.discountSplit * 100).toFixed(2);
  return `
    <div class="flex items-center gap-x-4 gap-y-2 flex-wrap text-xs text-on-surface-variant">
      <span class="text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md border text-amber-400 border-amber-400/30 bg-amber-400/5">Discount Split</span>
      <span><span class="text-amber-400 font-semibold">${std}%</span> of market price on handover</span>
      <span class="text-outline">·</span>
      <span>Losses are 100% the client's</span>
      <span class="text-outline">·</span>
      <span>Proceeds repay my contribution first</span>
      <span class="has-tip cursor-help inline-flex items-center gap-1 text-outline hover:text-on-surface-variant">
        <span class="material-symbols-outlined text-[14px]">info</span> How it works
        <div class="tip-html hidden"><div class="px-4 py-3 text-xs space-y-1.5 max-w-sm">
          <p><span class="text-amber-400 font-semibold">Handover (profitable):</span> client price = market × ${(100 - p.discountSplit * 100).toFixed(2)}% (or agreed manually). My income is the discount. I take my contribution back; the rest is wired to the client, minus any offset.</p>
          <p><span class="text-error font-semibold">Loss:</span> sale proceeds repay my contribution first. Any shortfall is a client debt, recovered by transfer or offset against the next handover.</p>
          <p class="text-outline">Offsets are not income — they repay losses already recorded.</p>
        </div></div>
      </span>
    </div>`;
}

function renderDiscountPanelA(profile, p, cur) {
  const mc = (v, c) => fmt.price(v, c || cur);
  const rows = (p.profitWatches || []).map(w => {
    const d = discountCalc(w, profile), wc = w.currency || cur;
    const off = Math.abs(d.discPct - d.rate) > 0.0001;
    return `
      <tr class="border-t border-outline-variant/10 hover:bg-white/[0.02] cursor-pointer" onclick="openWatchDetail(${w.id})">
        ${dsTd(`<p class="text-sm font-medium text-on-surface min-w-[150px]">${esc(w.model)}</p>
               <p class="text-[11px] font-mono text-outline mt-0.5">${esc(w.reference_number || '')}${w.stock_number ? ' · ' + esc(w.stock_number) : ''}</p>`)}
        ${dsTd(`<p class="text-sm text-on-surface whitespace-nowrap">${w.market_price_date ? fmt.date(w.market_price_date) : '—'}</p>
               <p class="text-[11px] mt-0.5 whitespace-nowrap"><span class="${d.manual ? 'text-purple-300' : 'text-amber-400/80'}">${d.manual ? 'Manual' : 'Standard'}</span>${w.market_price_agreed_by ? `<span class="text-outline"> · ${esc(w.market_price_agreed_by)}</span>` : ''}</p>`)}
        ${dsNum(mc(d.P, wc), 'text-on-surface')}
        ${dsNum(mc(d.clientPrice, wc), 'text-on-surface')}
        ${dsNum(`<span class="text-amber-400 font-semibold">+${mc(d.discAmt, wc)}</span><p class="text-[11px] mt-0.5 ${off ? 'text-purple-300' : 'text-on-surface-variant'}">${(d.discPct * 100).toFixed(2)}%</p>`)}
        ${dsNum(`${mc(d.M, wc)}<p class="text-[11px] mt-0.5 text-purple-300/80">${mc(d.C, wc)}</p>`, 'text-on-surface')}
        ${dsNum(d.offset ? `−${mc(d.offset, wc)}` : '<span class="text-outline">—</span>', 'text-amber-300')}
        ${dsNum(mc(d.wire, wc), 'text-purple-300 font-semibold')}
      </tr>`;
  }).join('');
  const body = rows ? `
    <div class="overflow-x-auto">
      <table class="w-full text-left">
        <thead class="bg-surface-container/60"><tr>
          ${dsTh('Watch')}${dsTh('Handover')}${dsTh('Market', 1)}${dsTh('Client price', 1)}${dsTh('Discount', 1)}${dsTh('Me / Client', 1)}${dsTh('Offset', 1)}${dsTh('Cash to wire', 1)}
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr class="border-t border-outline-variant/20 bg-white/[0.02]">
          ${dsTd('<span class="text-[11px] uppercase tracking-wider text-on-surface-variant font-semibold">Total</span>')}${dsTd('')}
          ${dsNum(mc(p.totalMarketValue), 'text-on-surface')}${dsTd('')}
          ${dsNum(`<span class="text-amber-400 font-semibold">+${mc(p.discountIncome)}</span><p class="text-[11px] mt-0.5 text-on-surface-variant">avg ${(p.avgDiscountPct * 100).toFixed(2)}%</p>`)}
          ${dsTd('')}
          ${dsNum(p.totalOffsetsGiven ? `−${mc(p.totalOffsetsGiven)}` : '—', 'text-amber-300')}
          ${dsNum(mc(p.totalWire), 'text-purple-300 font-semibold')}
        </tr></tfoot>
      </table>
    </div>` : `<p class="px-6 pb-6 text-sm text-on-surface-variant/60 italic">No handovers yet — use <span class="text-emerald-400 not-italic">Mark Sold → Handover to me</span> on a watch.</p>`;
  return dsCard('Panel A', 'My Discount Income',
    `<p class="font-playfair text-2xl text-amber-400">+${mc(p.discountIncome)}</p>
     <p class="text-[11px] text-on-surface-variant">${p.profitWatches.length} handover${p.profitWatches.length !== 1 ? 's' : ''}${p.totalMarketValue ? ` · avg ${(p.avgDiscountPct * 100).toFixed(2)}%` : ''}</p>`,
    body, 'border-amber-500/15');
}

function renderDiscountPanelB(profile, p, cur) {
  const mc = (v, c) => fmt.price(v, c || cur);
  const statusChip = st => {
    const map = { open: ['Open', 'text-error border-error/30 bg-error/5'], partially_paid: ['Partially settled', 'text-amber-400 border-amber-400/30 bg-amber-400/5'],
                  settled: ['Settled', 'text-emerald-400 border-emerald-400/30 bg-emerald-400/5'], not_applicable: ['No debt', 'text-on-surface-variant border-outline-variant/30 bg-white/[0.02]'] };
    const [l, c] = map[st] || map.open;
    return `<span class="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md border whitespace-nowrap ${c}">${l}</span>`;
  };
  const rows = (p.lossWatches || []).map(w => {
    const d = discountCalc(w, profile), wc = w.currency || cur;
    const pays = (w.loss_payments || []).filter(px => !px.reversed);
    const canPay = d.outstanding > 0.005;
    const subRows = pays.map(px => `
      <tr class="text-xs text-on-surface-variant">
        <td></td>
        <td colspan="4" class="px-3 pb-1.5 pt-0">
          <span class="inline-flex items-center gap-2 pl-3 border-l ${px.method === 'OFFSET' ? 'border-amber-400/50' : 'border-emerald-400/40'}">
            <span class="font-mono text-outline">${fmt.date(px.date)}</span>
            <span class="${px.method === 'OFFSET' ? 'text-amber-300' : 'text-emerald-300'}">${esc(recoveryMethodLabel(px))}</span>
          </span>
        </td>
        <td class="px-3 pb-1.5 pt-0 text-right font-mono text-emerald-400/90 whitespace-nowrap">${mc(px.amount, wc)}</td>
        <td></td>
        <td class="px-3 pb-1.5 pt-0 text-right"><button onclick="event.stopPropagation(); reversePayment(${px.id}, ${w.id})" title="Void this recovery" class="text-outline hover:text-error transition-colors"><span class="material-symbols-outlined text-[14px]">cancel</span></button></td>
      </tr>`).join('');
    return `
      <tr class="border-t border-outline-variant/10 hover:bg-white/[0.02] cursor-pointer" onclick="openWatchDetail(${w.id})">
        ${dsTd(`<p class="text-sm font-medium text-on-surface min-w-[150px]">${esc(w.model)}</p>
               <p class="text-[11px] font-mono text-outline mt-0.5">${esc(w.reference_number || '')}${w.stock_number ? ' · ' + esc(w.stock_number) : ''}</p>`)}
        ${dsNum(`${mc(d.S, wc)}<p class="text-[11px] mt-0.5 text-on-surface-variant">list ${mc(d.L, wc)}</p>`, 'text-on-surface')}
        ${dsNum(mc(d.loss, wc), 'text-error')}
        ${dsNum(`${mc(d.cashBackMe, wc)}<p class="text-[11px] mt-0.5 ${d.payoutClient ? 'text-purple-300' : 'text-on-surface-variant'}">${d.payoutClient ? `client ${mc(d.payoutClient, wc)}` : `client —`}</p>`, 'text-on-surface')}
        ${dsNum(d.clientOwesMe ? mc(d.clientOwesMe, wc) : '<span class="text-outline">—</span>', 'text-error')}
        ${dsNum(d.recovered ? mc(d.recovered, wc) : '<span class="text-outline">—</span>', 'text-emerald-400')}
        ${dsNum(d.outstanding ? mc(d.outstanding, wc) : '<span class="text-outline">—</span>', d.outstanding ? 'text-amber-400 font-semibold' : '')}
        ${dsTd(`<div class="flex flex-col items-end gap-1.5">${statusChip(w.loss_status)}
               ${canPay ? `<button onclick="event.stopPropagation(); openRecordPaymentModal(${w.id})" class="text-[11px] font-semibold uppercase tracking-wider px-2 py-1 rounded-md border border-amber-400/30 text-amber-400 bg-amber-400/5 hover:bg-amber-400/10 transition-all whitespace-nowrap">Record</button>` : ''}</div>`, 'text-right')}
      </tr>${subRows}`;
  }).join('');
  const body = rows ? `
    <div class="overflow-x-auto">
      <table class="w-full text-left">
        <thead class="bg-surface-container/60"><tr>
          ${dsTh('Watch')}${dsTh('Sold at', 1)}${dsTh('Loss', 1)}${dsTh('Proceeds: me / client', 1)}${dsTh('Client owes', 1)}${dsTh('Recovered', 1)}${dsTh('Outstanding', 1)}${dsTh('Status', 1)}
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr class="border-t border-outline-variant/20 bg-white/[0.02]">
          ${dsTd('<span class="text-[11px] uppercase tracking-wider text-on-surface-variant font-semibold">Total</span>')}${dsTd('')}
          ${dsNum(mc(p.totalLossAmount), 'text-error')}${dsTd('')}
          ${dsNum(mc(p.totalLossOwed), 'text-error')}
          ${dsNum(mc(p.totalLossPaid), 'text-emerald-400')}
          ${dsNum(mc(p.lossOutstanding), p.lossOutstanding > 0 ? 'text-amber-400 font-semibold' : 'text-emerald-400')}
          ${dsTd('')}
        </tr></tfoot>
      </table>
    </div>` : `<p class="px-6 pb-6 text-sm text-on-surface-variant/60 italic">No loss watches.</p>`;
  return dsCard('Panel B', 'Losses Receivable from Client',
    `<p class="font-playfair text-2xl ${p.lossOutstanding > 0 ? 'text-amber-400' : 'text-emerald-400'}">${mc(p.lossOutstanding)}</p>
     <p class="text-[11px] text-on-surface-variant">outstanding · available to offset</p>`,
    body, 'border-error/15');
}

// Funding & cash position — replaces the P/L-split summary for discount profiles
function renderDiscountFunding(p) {
  const bc = m => fmt.byCurrency(m);
  const tile = (l, v, sub, tone = 'neutral') => dsKpi(l, v, sub, tone);
  const tiles = [
    tile('My capital', bc(p.myTotalCostByCur), 'my contributions · open + sold'),
    tile('Client capital', bc(p.clientTotalCostByCur), 'client contributions · open + sold', 'client'),
    tile('Open inventory', bc(p.totalListValueActiveByCur), `${p.purchasedCount} watch${p.purchasedCount !== 1 ? 'es' : ''} at list`),
    tile('Still to wire client', bc(p.clientRemainingByCur), 'payouts not yet recorded', 'client'),
    tile('Still to take myself', bc(p.myRemainingByCur), 'withdrawals not yet recorded', 'gold'),
    tile('Expenses', bc(p.totalExpensesByCur), 'across all watches'),
  ];
  return dsCard('', 'Funding &amp; Cash Position', '', `<div class="px-6 pb-6 grid grid-cols-2 md:grid-cols-3 min-[1500px]:grid-cols-6 gap-3">${tiles.join('')}</div>`);
}

// "Rules Applied to P&L" for watches settled under the P/L split rule.
// Shown on split clients, and on discount clients that sold some watches
// under the P/L rule.
function renderSplitRulesCard(p, mc, sgn, cls, opts = {}) {
  const ws    = (p.splitSoldWatches || []).filter(w => w.list_price != null && w.sale_price != null);
  const gp    = ws.reduce((s, w) => s + Math.max(w.sale_price - w.list_price, 0), 0);
  const gl    = ws.reduce((s, w) => s + Math.min(w.sale_price - w.list_price, 0), 0);
  const nP    = ws.filter(w => w.sale_price > w.list_price).length;
  const nL    = ws.filter(w => w.sale_price < w.list_price).length;
  const net   = gp + gl;
  const sp    = net >= 0 ? p.profitSplit : p.lossSplit;
  const hDisc = ws.reduce((t, w) => t + splitHandoverDisc(w), 0);   // P/L handover discounts (mine)
  const mine  = (sp / 100) * net + hDisc, theirs = ((100 - sp) / 100) * net;
  return `
      <div class="glass-surface rounded-xl p-6 ${opts.accent || ''}">
        <div class="flex items-center justify-between mb-5 gap-3 flex-wrap">
          <p class="text-[11px] uppercase tracking-[0.06em] font-semibold text-on-surface-variant">${opts.title || 'Rules Applied to P&amp;L'}</p>
          <span class="text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md border text-purple-400 border-purple-400/30 bg-purple-400/5">P/L split ${p.profitSplit}/${100 - p.profitSplit} · losses ${p.lossSplit}/${100 - p.lossSplit}</span>
        </div>

        ${ws.length > 0 ? `
        <div class="mb-5 space-y-0">
          <div class="grid grid-cols-12 gap-2 text-[11px] uppercase tracking-wider text-outline pb-2 border-b border-outline-variant/10 mb-1">
            <div class="col-span-4">Timepiece</div>
            <div class="col-span-2 text-right">List</div>
            <div class="col-span-2 text-right">Sold</div>
            <div class="col-span-4 text-right">P&amp;L</div>
          </div>
          ${ws.map(w => {
            const diff = w.sale_price - w.list_price;
            return `
            <div class="grid grid-cols-12 gap-2 text-xs py-1.5 border-b border-outline-variant/[0.04] last:border-0 cursor-pointer hover:bg-white/[0.02]" onclick="openWatchDetail(${w.id})">
              <div class="col-span-4 truncate text-on-surface">${esc(w.model)}${w.market_price != null ? `<span class="block text-[11px] text-amber-400/80">Handover · market ${mc(w.market_price)} · my discount +${mc(splitHandoverDisc(w))}</span>` : ''}</div>
              <div class="col-span-2 text-right text-on-surface-variant font-mono">${mc(w.list_price)}</div>
              <div class="col-span-2 text-right text-on-surface-variant font-mono">${mc(w.sale_price)}</div>
              <div class="col-span-4 text-right font-mono ${cls(diff)} font-medium">${sgn(diff)}${mc(diff)}</div>
            </div>`;
          }).join('')}
        </div>
        ` : '<p class="text-xs text-on-surface-variant/60 italic mb-5">No sold watches yet — P&L will populate as you mark sales.</p>'}

        <div class="space-y-3 text-sm border-t border-outline-variant/10 pt-4">
          <div class="flex justify-between">
            <span class="text-on-surface-variant">Gross profit (${nP} watch${nP !== 1 ? 'es' : ''})</span>
            <span class="${cls(gp)} font-medium">${sgn(gp)}${mc(gp)}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-on-surface-variant">Gross loss (${nL} watch${nL !== 1 ? 'es' : ''})</span>
            <span class="${cls(gl)} font-medium">${gl !== 0 ? sgn(gl) : ''}${mc(gl)}</span>
          </div>
          <div class="flex justify-between border-t border-outline-variant/10 pt-3 mt-1">
            <span class="text-on-surface font-semibold">Net P&amp;L</span>
            <span class="${cls(net)} font-bold font-playfair text-lg">${sgn(net)}${mc(net)}</span>
          </div>
          <div class="border-t border-outline-variant/15 pt-4 space-y-4">
            <div class="flex justify-between items-baseline gap-4">
              <div>
                <span class="text-on-surface font-medium">My share</span>
                <span class="block text-xs text-on-surface-variant mt-0.5">${sp}% × net ${mc(net)}${hDisc ? ` + handover discounts ${mc(hDisc)}` : ''}</span>
              </div>
              <span class="${cls(mine)} font-semibold font-playfair text-xl whitespace-nowrap">${sgn(mine)}${mc(mine)}</span>
            </div>
            <div class="flex justify-between items-baseline gap-4">
              <div>
                <span class="text-on-surface font-medium">Client share</span>
                <span class="block text-xs text-on-surface-variant mt-0.5">${100 - sp}% × net ${mc(net)}</span>
              </div>
              <span class="${cls(theirs)} font-semibold font-playfair text-xl whitespace-nowrap">${sgn(theirs)}${mc(theirs)}</span>
            </div>
          </div>
        </div>
      </div>`;
}

function renderDiscountPnlSection(profile, p, cur) {
  const mc = v => fmt.price(v || 0, cur);
  return `
    <div class="space-y-5">
      <div class="glass-surface rounded-xl border border-outline-variant/10 p-5 space-y-4">
        ${renderDiscountTerms(p)}
        ${renderDiscountKpis(p, mc)}
      </div>
      ${renderDiscountPanelA(profile, p, cur)}
      ${renderDiscountPanelB(profile, p, cur)}
      ${p.hasSplitWatches ? renderSplitRulesCard(p, mc, v => v > 0 ? '+' : '', v => v >= 0 ? 'text-emerald-400' : 'text-error', { title: 'P/L Split Sales' }) : ''}
      ${renderDiscountFunding(p)}
    </div>`;
}

function renderProfilePnl(profile) {
  const p   = computePnl(profile);
  const cur = (profile.watches || []).find(w => w.currency)?.currency || 'CHF';
  const m   = v => v == null ? '—' : fmt.money(v);
  const mc  = (v, c) => v == null ? '—' : fmt.price(v, c || cur);
  const sgn = v => v > 0 ? '+' : '';
  const cls = v => v >= 0 ? 'text-emerald-400' : 'text-error';

  if (p.isDiscount) {
    document.getElementById('profilePnlSection').innerHTML = renderDiscountPnlSection(profile, p, cur);
    return;
  }

  document.getElementById('profilePnlSection').innerHTML = `
    <div class="space-y-4">

      <!-- Split Rules -->
      <div class="glass-surface rounded-xl p-6">
        <div class="flex items-center justify-between mb-5">
          <p class="text-[11px] uppercase tracking-[0.06em] font-semibold text-on-surface-variant">Split Rules</p>
          <span class="text-[11px] font-semibold uppercase tracking-wider px-3 py-1 rounded-lg border ${p.isDiscount ? 'text-amber-400 border-amber-400/30 bg-amber-400/5' : 'text-purple-400 border-purple-400/30 bg-purple-400/5'}">
            ${p.isDiscount ? '🏷 Discount Split' : '% P/L Split'}
          </span>
        </div>

        ${p.isDiscount ? `
        <div>
          <div class="flex justify-between items-baseline mb-2">
            <span class="text-sm text-on-surface">Discount Rate</span>
            <span class="text-xs text-on-surface-variant"><span class="text-amber-400 font-semibold">${(p.discountSplit * 100).toFixed(2)}%</span> of Market Price → my discount on handover (overridable per watch)</span>
          </div>
          <div class="h-2.5 rounded-full overflow-hidden bg-surface-container-highest flex">
            <div class="bg-amber-500 h-full transition-all duration-500" style="width:${Math.min(100, Math.max(0, ((p.discountSplit - 0.05) / 0.15) * 100))}%"></div>
          </div>
          <div class="flex justify-between text-[11px] text-outline mt-1"><span>5%</span><span>20%</span></div>
          <p class="text-[11px] text-on-surface-variant/60 mt-3 leading-relaxed">Profitable watches are handed over to me at market price minus the discount; I take my contribution back and the rest is wired to the client, minus any offset. Losses are 100% the client's: sale proceeds repay my contribution first and any shortfall is recovered by transfer or offset — see Panel B.</p>
        </div>
        ` : `
        <div class="mb-5">
          <div class="flex justify-between items-baseline mb-2">
            <span class="text-sm text-on-surface">Profits</span>
            <span class="text-xs text-on-surface-variant">
              <span class="text-emerald-400">●</span> Me ${p.profitSplit}%
              &nbsp;
              <span class="text-purple-400">●</span> Client ${100 - p.profitSplit}%
            </span>
          </div>
          <div class="h-2.5 rounded-full overflow-hidden bg-surface-container-highest flex">
            <div class="bg-emerald-500 h-full transition-all duration-500" style="width:${p.profitSplit}%"></div>
            <div class="bg-purple-500 h-full transition-all duration-500" style="width:${100 - p.profitSplit}%"></div>
          </div>
        </div>
        <div>
          <div class="flex justify-between items-baseline mb-2">
            <span class="text-sm text-on-surface">Losses</span>
            <span class="text-xs text-on-surface-variant">
              <span class="text-emerald-400">●</span> Me ${p.lossSplit}%
              &nbsp;
              <span class="text-purple-400">●</span> Client ${100 - p.lossSplit}%
            </span>
          </div>
          <div class="h-2.5 rounded-full overflow-hidden bg-surface-container-highest flex">
            <div class="bg-emerald-500 h-full transition-all duration-500" style="width:${p.lossSplit}%"></div>
            <div class="bg-purple-500 h-full transition-all duration-500" style="width:${100 - p.lossSplit}%"></div>
          </div>
        </div>
        `}
      </div>

      ${!p.isDiscount && (p.myCapital || p.clientCapital || p.myRemaining || p.clientRemaining) ? `
      <!-- Capital Card (split mode only — hidden when all zero) -->
      <div class="glass-surface rounded-xl p-5">
        <p class="text-[11px] uppercase tracking-[0.06em] font-semibold text-on-surface-variant mb-4">Capital</p>
        <div class="grid grid-cols-3 gap-3 mb-1">
          <div class="bg-white/[0.03] rounded-lg p-3.5">
            <p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-1">My Capital</p>
            <p class="font-playfair text-xl text-on-surface">${m(p.myCapital)}</p>
          </div>
          <div class="bg-white/[0.03] rounded-lg p-3.5">
            <p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-1">Client Capital</p>
            <p class="font-playfair text-xl text-purple-300">${m(p.clientCapital)}</p>
          </div>
          <div class="bg-white/[0.03] rounded-lg p-3.5 border border-primary/15">
            <p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-1">Total Deployed</p>
            <p class="font-playfair text-xl text-primary">${m(p.capitalDeployed)}</p>
          </div>
        </div>
        <div class="border-t border-outline-variant/10 my-3"></div>
        <div class="grid grid-cols-3 gap-3">
          <div class="bg-white/[0.03] rounded-lg p-3.5">
            <p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-1">My Remaining</p>
            <p class="font-playfair text-xl text-on-surface">${m(p.myRemaining)}</p>
          </div>
          <div class="bg-white/[0.03] rounded-lg p-3.5">
            <p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-1">Client Remaining</p>
            <p class="font-playfair text-xl text-purple-300">${m(p.clientRemaining)}</p>
          </div>
          <div class="bg-white/[0.03] rounded-lg p-3.5 border border-emerald-500/15">
            <p class="text-[11px] uppercase tracking-wider text-on-surface-variant mb-1">Available Total</p>
            <p class="font-playfair text-xl text-emerald-400">${m(p.available)}</p>
          </div>
        </div>
      </div>
      ` : ''}

      <!-- Watch Status Counts (with hover details) -->
      <div class="grid grid-cols-3 gap-3">
        <div class="has-tip cursor-help glass-surface rounded-lg p-4 flex items-center gap-4 transition-all hover:ring-1 hover:ring-amber-400/30">
          <div class="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
            <span class="material-symbols-outlined text-amber-400 text-[18px]">bookmark</span>
          </div>
          <div>
            <p class="text-[11px] uppercase tracking-wider text-on-surface-variant">Wishlist</p>
            <p class="font-playfair text-2xl text-on-surface">${p.wishlistCount}</p>
          </div>
          <div class="tip-html hidden">${
            buildWatchListTip(
              'Wishlist',
              p.wishlistWatches || [],
              w => `<div class="flex justify-between gap-3"><span class="text-on-surface truncate">${esc(w.model)}</span><span class="text-[11px] text-outline">${(w.created_at || '').split(' ')[0] || ''}</span></div>`,
              '', ''
            )
          }</div>
        </div>
        <div class="has-tip cursor-help glass-surface rounded-lg p-4 flex items-center gap-4 transition-all hover:ring-1 hover:ring-blue-400/30">
          <div class="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
            <span class="material-symbols-outlined text-blue-400 text-[18px]">inventory_2</span>
          </div>
          <div>
            <p class="text-[11px] uppercase tracking-wider text-on-surface-variant">Purchased</p>
            <p class="font-playfair text-2xl text-on-surface">${p.purchasedCount}</p>
          </div>
          <div class="tip-html hidden">${
            buildWatchListTip(
              'Purchased (active inventory)',
              p.activeWatches || [],
              w => {
                const total = (w.my_cost || 0) + (w.client_cost || 0);
                return `<div class="py-0.5"><div class="flex justify-between"><span class="text-on-surface truncate">${esc(w.model)}</span><span class="font-mono text-primary">${mc(total)}</span></div><div class="text-[11px] text-outline/70 flex gap-2">${w.list_price != null ? `<span>list ${mc(w.list_price)}</span>` : ''}<span>me ${mc(w.my_cost || 0)}</span><span>client ${mc(w.client_cost || 0)}</span></div></div>`;
              },
              'Active capital', mc(p.totalCostInWatches || 0)
            )
          }</div>
        </div>
        <div class="has-tip cursor-help glass-surface rounded-lg p-4 flex items-center gap-4 transition-all hover:ring-1 hover:ring-emerald-400/30">
          <div class="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
            <span class="material-symbols-outlined text-emerald-400 text-[18px]">sell</span>
          </div>
          <div>
            <p class="text-[11px] uppercase tracking-wider text-on-surface-variant">Sold</p>
            <p class="font-playfair text-2xl text-on-surface">${p.soldCount}</p>
          </div>
          <div class="tip-html hidden">${
            buildWatchListTip(
              'Sold — with P&L',
              p.soldWatches || [],
              w => {
                if (w.list_price == null || w.sale_price == null) return `<div class="flex justify-between"><span class="text-on-surface truncate">${esc(w.model)}</span><span class="text-[11px] text-outline italic">prices missing</span></div>`;
                const diff = w.sale_price - w.list_price;
                return `<div class="py-0.5"><div class="flex justify-between"><span class="text-on-surface truncate">${esc(w.model)}</span><span class="font-mono ${cls(diff)}">${sgn(diff)}${mc(diff)}</span></div><div class="text-[11px] text-outline/70">List ${mc(w.list_price)} → Sold ${mc(w.sale_price)}</div></div>`;
              },
              'Net P&L', `${sgn(p.netPnl || 0)}${mc(p.netPnl || 0)}`
            )
          }</div>
        </div>
      </div>

      ${renderSplitRulesCard(p, mc, sgn, cls)}
      ${p.hasDiscountWatches ? renderDiscountPanelA(profile, p, cur) + renderDiscountPanelB(profile, p, cur) : ''}

      <!-- Portfolio Summary — unified 9-tile layout -->
      ${renderPortfolioSummary9(p, mc, sgn, cls)}

    </div>
  `;
}

let profileWatchStatusFilter = '';
let _profileAllWatches = [];
let _profileForFilter   = null;

function renderProfileWatches(watches, profile) {
  // Cache watches with the profile's split data so openMarkSoldModal works from any page
  if (profile) {
    watches.forEach(w => {
      watchCache[w.id] = {
        ...w,
        profit_split_me: profile.profit_split_me,
        loss_split_me:   profile.loss_split_me,
        trading_rule:    profile.trading_rule,
        discount_split:  profile.discount_split,
      };
    });
  }
  // Snapshot the full list so the status tabs can re-filter without a server round-trip
  _profileAllWatches = watches;
  _profileForFilter  = profile;

  const isDiscount = (profile?.trading_rule || 'split') === 'discount';
  // Update P&L column header to reflect discount mode
  const headRow = document.querySelector('#profileWatchesBody')?.parentElement?.querySelector('thead tr');
  if (headRow) {
    const pnlTh = headRow.children[6]; // 0:Timepiece, 1:Status, 2:Stock, 3:Serial, 4:List, 5:Sale, 6:P&L
    if (pnlTh) pnlTh.textContent = isDiscount ? 'Income / Settlement' : 'P&L';
  }
  const opts = { isDiscount, discountSplit: profile?.discount_split ?? 0.08 };
  const filtered = profileWatchStatusFilter
    ? watches.filter(w => w.status === profileWatchStatusFilter)
    : watches;
  document.getElementById('profileWatchesBody').innerHTML = filtered.length
    ? filtered.map(w => watchRow(w, true, opts)).join('')
    : `<tr><td colspan="8" class="px-6 py-16 text-center text-on-surface-variant text-sm">${profileWatchStatusFilter ? `No ${profileWatchStatusFilter} watches.` : 'No watches recorded yet.'}</td></tr>`;
}

// Status filter tab clicks
document.getElementById('profileWatchStatusTabs')?.addEventListener('click', e => {
  const btn = e.target.closest('.profile-status-tab');
  if (!btn) return;
  profileWatchStatusFilter = btn.dataset.status;
  document.querySelectorAll('.profile-status-tab').forEach(b => {
    const active = b.dataset.status === profileWatchStatusFilter;
    b.className = 'profile-status-tab text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg border transition-all ' +
      (active
        ? 'bg-primary/15 border-primary/40 text-primary'
        : 'border-outline-variant/30 text-on-surface-variant hover:bg-surface-variant/30');
  });
  if (_profileAllWatches.length || _profileForFilter) {
    renderProfileWatches(_profileAllWatches, _profileForFilter);
  }
});
