// 12-sales-payments.js — Mark sold, loss payments, tooltip, expenses, payouts
// Part of the dashboard script: scripts/build.js concatenates src/dashboard/*.js
// in filename order into public/js/dashboard.js (one classic script, so
// functions and top-level variables stay shared exactly as before).

// ── Mark Sold · Discount Split v2 (handover vs loss) ──────────────────────
let _soldIsDiscount = false, _soldProfile = null, _soldAvailOffset = 0;
let _soldOutcome = 'handover', _soldDiscMode = 'standard';
let _soldRule = null, _soldDiscPrefilled = false;

async function loadSoldModalProfile(w) {
  let prof;
  try { prof = await api('GET', `/api/profiles/${w.profile_id}`); } catch { return; }
  if (_soldWatchData?.id !== w.id) return; // modal closed / reopened meanwhile
  const fresh = (prof.watches || []).find(x => x.id === w.id) || w;
  // Carry the trading terms onto the watch so the split helpers see them
  _soldWatchData = { ...w, ...fresh, trading_rule: prof.trading_rule, discount_split: prof.discount_split,
                     profit_split_me: prof.profit_split_me, loss_split_me: prof.loss_split_me };
  _soldProfile   = prof;

  // Rule toggle: this watch's earlier choice, else the client's rule
  const clientRule = prof.trading_rule || 'split';
  const rate0 = _soldWatchData.discount_rate_applied ?? prof.discount_split ?? 0.08;
  document.getElementById('soldRuleDiscSub').textContent  = `${(rate0 * 100).toFixed(2)}% of market price`;
  document.getElementById('soldRuleSplitSub').textContent = `profit ${prof.profit_split_me ?? 100}/${100 - (prof.profit_split_me ?? 100)} · loss ${prof.loss_split_me ?? 100}/${100 - (prof.loss_split_me ?? 100)}`;
  document.getElementById('soldRuleHint').textContent = `Client default: ${clientRule === 'discount' ? 'Discount Split' : 'P/L Split'} · this choice applies to this watch only`;
  document.getElementById('soldRuleWrap').classList.remove('hidden');
  setSoldRule(_soldWatchData.rule_applied || clientRule);
}

// Switch the modal between the Discount Split and P/L Split rule. Both rules
// offer "Handover to me"; the alternative is "Sold below list" (Discount) or
// "Sold to buyer" (P/L Split).
function setSoldRule(rule) {
  const prev = _soldRule;
  _soldRule = rule;
  _soldIsDiscount = rule === 'discount';
  const off = 'border-outline-variant/30 text-on-surface-variant hover:bg-surface-variant/30';
  document.getElementById('soldRuleDiscBtn').className  = `text-[11px] font-semibold uppercase tracking-wider px-3 py-2.5 rounded-lg border transition-all ${rule === 'discount' ? 'bg-amber-400/10 border-amber-400/40 text-amber-400' : off}`;
  document.getElementById('soldRuleSplitBtn').className = `text-[11px] font-semibold uppercase tracking-wider px-3 py-2.5 rounded-lg border transition-all ${rule === 'split' ? 'bg-purple-500/10 border-purple-400/40 text-purple-300' : off}`;
  const prof = _soldProfile;
  document.getElementById('soldModeHandoverSub').textContent = rule === 'discount'
    ? 'market price − discount · discount is mine'
    : `market price − discount · profit split ${prof?.profit_split_me ?? 100}/${100 - (prof?.profit_split_me ?? 100)}`;
  document.getElementById('soldModeAltTitle').textContent = rule === 'discount' ? 'Sold below list' : 'Sold to buyer';
  document.getElementById('soldModeAltSub').textContent   = rule === 'discount' ? "loss · 100% the client's" : 'sale price · split by P/L %';
  prefillHandoverFields();
  document.getElementById('soldDiscountModeWrap').classList.remove('hidden');

  // First time: pick the outcome that matches this watch; later keep the user's choice
  let outcome;
  if (!prev) {
    const sw = _soldWatchData;
    if (sw.market_price != null) outcome = 'handover';
    else if (sw.status === 'sold' && sw.sale_price != null) outcome = (rule === 'discount' && !(sw.list_price != null && sw.sale_price < sw.list_price)) ? 'handover' : 'alt';
    else outcome = rule === 'discount' ? 'handover' : 'alt';
  } else {
    outcome = _soldOutcome === 'handover' ? 'handover' : 'alt';
  }
  setSoldOutcome(outcome);
}

// Fill the handover fields once per opening (switching rules keeps what was typed)
function prefillHandoverFields() {
  if (_soldDiscPrefilled) return;
  _soldDiscPrefilled = true;
  const prof = _soldProfile;
  const sw   = _soldWatchData;
  const cur  = sw.currency || 'CHF';
  // Panel B outstanding available to offset (plus whatever this watch already offsets)
  _soldAvailOffset = computePnl(prof).lossOutstanding + (sw.offset_amount || 0);
  const rate = sw.discount_rate_applied ?? prof.discount_split ?? 0.08;
  document.getElementById('soldStdRateLabel').textContent = `${(rate * 100).toFixed(2)}%`;
  document.getElementById('soldOffsetHint').innerHTML = _soldAvailOffset > 0
    ? `Client's outstanding losses (Panel B): <span class="text-amber-400 font-mono">${fmt.price(_soldAvailOffset, cur)}</span> · enter ${fmt.price(0, cur)} up to this`
    : `No outstanding losses in Panel B — nothing to offset.`;
  setMoneyValue('soldMarketPrice', sw.market_price);
  document.getElementById('soldAgreedBy').value = sw.market_price_agreed_by || prof.name || '';
  setMoneyValue('soldClientPrice', sw.discount_mode === 'manual' ? sw.client_price_manual : null);
  setMoneyValue('soldDiscAmount', null);
  setMoneyValue('soldOffset', sw.offset_amount || null);
  if (sw.market_price_date) document.getElementById('soldSaleDate').value = sw.market_price_date;
  _soldDiscMode = sw.discount_mode === 'manual' ? 'manual' : 'standard';
  setSoldDiscountMode(_soldDiscMode, true);
}

// mode: 'handover' | 'alt' → 'loss' (Discount rule) or 'sale' (P/L Split rule)
function setSoldOutcome(mode) {
  if (mode === 'alt' || mode === 'loss' || mode === 'sale') mode = _soldRule === 'discount' ? 'loss' : 'sale';
  _soldOutcome = mode;
  const handover = mode === 'handover';
  const on  = 'bg-primary/15 border-primary/40 text-primary';
  const off = 'border-outline-variant/30 text-on-surface-variant hover:bg-surface-variant/30';
  const altOn = _soldRule === 'discount' ? 'bg-error/10 border-error/40 text-error' : 'bg-purple-500/10 border-purple-400/40 text-purple-300';
  document.getElementById('soldModeHandoverBtn').className = `text-[11px] font-semibold uppercase tracking-wider px-3 py-2.5 rounded-lg border transition-all ${handover ? on : off}`;
  document.getElementById('soldModeLossBtn').className     = `text-[11px] font-semibold uppercase tracking-wider px-3 py-2.5 rounded-lg border transition-all ${!handover ? altOn : off}`;
  document.getElementById('soldHandoverFields').classList.toggle('hidden', !handover);
  // Offsets repay Panel B, which only exists for the Discount rule
  document.getElementById('soldOffsetWrap').classList.toggle('hidden', _soldRule !== 'discount');
  document.getElementById('soldSalePriceWrap').classList.toggle('hidden', handover);
  document.getElementById('soldToWrap').classList.toggle('hidden', handover);
  document.getElementById('soldPnlPreview').classList.toggle('hidden', handover);
  // P/L sale keeps the editable proceeds split; Discount figures are automatic
  document.getElementById('soldSplitWrap').classList.toggle('hidden', mode !== 'sale');
  document.getElementById('soldSaleDateLabel').textContent = handover ? 'Handover Date' : 'Sale Date';
  document.getElementById('soldConfirmLabel').textContent  = handover ? 'Confirm Handover' : 'Confirm Sale';
  document.getElementById('soldModalTitle').textContent    = handover ? 'Record Handover' : 'Record Sale';
  if (handover) updateHandoverPreview();
  else { updateSoldPnl(); updateSoldSplitFooter(); }
}

function setSoldDiscountMode(mode, silent) {
  _soldDiscMode = mode;
  const on  = 'bg-amber-400/10 border-amber-400/40 text-amber-400';
  const off = 'border-outline-variant/30 text-on-surface-variant hover:bg-surface-variant/30';
  document.getElementById('soldDiscStdBtn').className = `text-[11px] font-semibold uppercase tracking-wider px-3 py-2 rounded-lg border transition-all ${mode === 'standard' ? on : off}`;
  document.getElementById('soldDiscManBtn').className = `text-[11px] font-semibold uppercase tracking-wider px-3 py-2 rounded-lg border transition-all ${mode === 'manual' ? 'bg-purple-500/10 border-purple-400/40 text-purple-300' : off}`;
  document.getElementById('soldManualFields').classList.toggle('hidden', mode !== 'manual');
  if (!silent) updateHandoverPreview(mode === 'manual' ? 'market' : undefined);
}

function useMaxOffset() {
  const h = handoverFigures();
  setMoneyValue('soldOffset', Math.round(Math.min(_soldAvailOffset, Math.max(h?.entitlement ?? _soldAvailOffset, 0)) * 100) / 100);
  updateHandoverPreview();
}

// Current handover numbers from the modal inputs (null when market price is missing)
function handoverFigures() {
  const w = _soldWatchData;
  if (!w) return null;
  const P = parseFloat(readMoneyInput('soldMarketPrice'));
  if (isNaN(P) || P <= 0) return null;
  const rate = w.discount_rate_applied ?? _soldProfile?.discount_split ?? 0.065;
  let clientPrice;
  if (_soldDiscMode === 'manual') {
    const cp = parseFloat(readMoneyInput('soldClientPrice'));
    clientPrice = isNaN(cp) ? P * (1 - rate) : cp;
  } else {
    clientPrice = P * (1 - rate);
  }
  if (_soldRule === 'split') {
    // P/L Split handover: the watch comes to me at the client price; the
    // discount vs market is mine and (client price − list) is split by P/L %.
    const prof = _soldProfile || {};
    const L = w.list_price ?? 0;
    const M = w.my_cost != null ? w.my_cost : Math.max(L - (w.client_cost || 0), 0);
    const C = w.client_cost != null ? w.client_cost : Math.max(L - M, 0);
    const gross = clientPrice - L;
    const sp = gross >= 0 ? (prof.profit_split_me ?? 100) : (prof.loss_split_me ?? 100);
    const mine = (sp / 100) * gross, theirs = ((100 - sp) / 100) * gross;
    const discAmt = P - clientPrice;
    return { split: true, P, rate, clientPrice, discAmt, discPct: P ? discAmt / P : 0, L, M, C, gross, sp, mine, theirs,
             clientCash: C + theirs, myResult: discAmt + mine };
  }
  const d = discountCalc({ ...w, market_price: P, discount_mode: _soldDiscMode,
                           client_price_manual: _soldDiscMode === 'manual' ? clientPrice : null, offset_amount: 0 }, _soldProfile);
  const want   = parseFloat(readMoneyInput('soldOffset'));
  const cap    = Math.max(Math.min(_soldAvailOffset, d.entitlement), 0);
  const offset = isNaN(want) ? 0 : Math.min(Math.max(want, 0), cap);
  return { ...d, rate, offset, wantOffset: isNaN(want) ? 0 : want, cap,
           wire: Math.max(d.entitlement - offset, 0), stillOutstanding: Math.max(_soldAvailOffset - offset, 0) };
}

function updateHandoverPreview(src) {
  const w = _soldWatchData;
  if (!w || !_soldRule) return;
  const cur = w.currency || 'CHF';
  // Manual mode: typing the client price fills the discount, and vice versa
  if (_soldDiscMode === 'manual') {
    const P    = parseFloat(readMoneyInput('soldMarketPrice'));
    const cp   = parseFloat(readMoneyInput('soldClientPrice'));
    const disc = parseFloat(readMoneyInput('soldDiscAmount'));
    if (!isNaN(P)) {
      if (src === 'disc' && !isNaN(disc))           setMoneyValue('soldClientPrice', Math.round((P - disc) * 100) / 100);
      else if ((src === 'client' || src === 'market') && !isNaN(cp)) setMoneyValue('soldDiscAmount', Math.round((P - cp) * 100) / 100);
      else if (src === 'market' && isNaN(cp)) {
        const rate = w.discount_rate_applied ?? _soldProfile?.discount_split ?? 0.065;
        setMoneyValue('soldClientPrice', Math.round(P * (1 - rate) * 100) / 100);
        setMoneyValue('soldDiscAmount',  Math.round(P * rate * 100) / 100);
      }
    }
  }
  const box = document.getElementById('soldHandoverPreview');
  const h = handoverFigures();
  if (!h) { box.innerHTML = `<p class="text-xs text-on-surface-variant/70">Enter the market price agreed with the client.</p>`; return; }
  const row = (l, v, c = 'text-on-surface', b = '') => `<div class="flex justify-between ${b}"><span class="text-on-surface-variant">${l}</span><span class="font-mono ${c}">${v}</span></div>`;
  if (h.split) {
    const sg = v => (v > 0 ? '+' : '') + fmt.price(v, cur);
    box.innerHTML = `
      ${h.gross < 0 ? `<p class="text-xs text-amber-400/90 bg-amber-400/[0.06] border border-amber-400/20 rounded-lg px-3 py-2">Client price is below list — this handover is a loss, shared ${h.sp}/${100 - h.sp} under the P/L rule.</p>` : ''}
      <p class="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">Handover Preview · P/L Split</p>
      ${row('Client price (I take the watch at)', fmt.price(h.clientPrice, cur), 'text-primary')}
      ${row('Discount vs market (mine)', '+' + fmt.price(h.discAmt, cur), 'text-amber-400 font-semibold')}
      ${row('Discount %', (h.discPct * 100).toFixed(2) + '%', Math.abs(h.discPct - h.rate) > 0.0001 ? 'text-purple-300' : 'text-on-surface')}
      ${row('Profit vs list (client price − list)', sg(h.gross), h.gross >= 0 ? 'text-emerald-400' : 'text-error', 'pt-2 border-t border-white/[0.06]')}
      ${row(`→ me ${h.sp}%`, sg(h.mine), h.mine >= 0 ? 'text-emerald-400' : 'text-error')}
      ${row(`→ client ${100 - h.sp}%`, sg(h.theirs), h.theirs >= 0 ? 'text-emerald-400' : 'text-error')}
      ${row('Client receives (contribution + share)', fmt.price(h.clientCash, cur), 'text-purple-300 font-semibold', 'pt-2 border-t border-white/[0.06]')}
      ${row('My result (discount + my share)', sg(h.myResult), 'text-amber-400 font-semibold')}`;
    return;
  }
  const offWarn = h.wantOffset > h.cap + 0.005
    ? `<p class="text-[11px] text-amber-400/90">Offset capped at ${fmt.price(h.cap, cur)} (Panel B outstanding${h.entitlement < _soldAvailOffset ? ' / entitlement' : ''}).</p>` : '';
  const belowList = w.list_price != null && h.P < w.list_price
    ? `<p class="text-xs text-amber-400/90 bg-amber-400/[0.06] border border-amber-400/20 rounded-lg px-3 py-2">Market price is below list — the client makes a loss on this handover. If the watch was sold to a buyer below list, choose <b>Sold below list</b> instead.</p>` : '';
  box.innerHTML = `
    ${belowList}
    <p class="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">Handover Preview</p>
    ${row('Client price', fmt.price(h.clientPrice, cur), 'text-primary')}
    ${row('Effective discount (my income)', '+' + fmt.price(h.discAmt, cur), 'text-amber-400 font-semibold')}
    ${row('Effective discount %', (h.discPct * 100).toFixed(2) + '%', Math.abs(h.discPct - h.rate) > 0.0001 ? 'text-purple-300' : 'text-on-surface')}
    ${row('My contribution back', fmt.price(h.M, cur), 'text-on-surface', 'pt-2 border-t border-white/[0.06]')}
    ${row('Client gross entitlement', fmt.price(h.entitlement, cur), h.entitlement < 0 ? 'text-error' : 'text-on-surface')}
    ${row('Losses offset', h.offset ? '−' + fmt.price(h.offset, cur) : fmt.price(0, cur), 'text-amber-300')}
    ${row('Cash to wire to client', fmt.price(h.wire, cur), 'text-purple-300 font-semibold', 'pt-2 border-t border-white/[0.06]')}
    ${row('Losses still outstanding', fmt.price(h.stillOutstanding, cur), h.stillOutstanding > 0 ? 'text-error' : 'text-emerald-400')}
    ${offWarn}
    <p class="text-[11px] text-on-surface-variant/60">The offset is not income — it repays losses already recorded in Panel B.</p>`;
}

// Auto-split: use the trading rule to suggest a fair proceeds split.
// - Split mode: applies profit_split_me / loss_split_me to (sale - list), then
//   adds each party's original cost contribution → ends at totals summing to sale.
// - Discount mode: I take discount% × sale (commission); client gets the rest.
//   For loss watches in discount mode, client is fully liable → my_received = sale,
//   client_received = 0 (the loss-receivable mechanism handles the recovery).
function autoFillSoldSplit() {
  const w = _soldWatchData;
  if (!w) return;
  const cur       = w.currency || 'CHF';
  const sale      = parseFloat(readMoneyInput('soldSalePrice'));
  const list      = w.list_price ?? 0;
  const myCost    = w.my_cost     || 0;
  const clientCost = w.client_cost || 0;
  if (isNaN(sale)) { alert('Enter a sale price first.'); return; }

  const isDiscount  = (_soldRule || w.trading_rule || 'split') === 'discount';
  const profitSplit = w.profit_split_me ?? 100;
  const lossSplit   = w.loss_split_me   ?? 100;
  // Unified formula across both rules: side_receives = side_cost + side_pnl_share.
  // Conservation: my_share + client_share = my_cost + client_cost + gross = sale.
  const gross = sale - list;
  let myPnl, clientPnl;
  if (isDiscount) {
    // Discount Split v2 loss sale: proceeds repay my contribution first
    const d = discountCalc({ ...w, sale_price: sale, market_price: null }, w);
    setMoneyValue('soldMyReceived',     Math.round(d.cashBackMe));
    setMoneyValue('soldClientReceived', Math.round(d.payoutClient));
    updateSoldSplitFooter();
    return;
  } else {
    const splitMe = gross >= 0 ? profitSplit : lossSplit;
    myPnl     = (splitMe / 100) * gross;
    clientPnl = ((100 - splitMe) / 100) * gross;
  }
  const myShare     = myCost     + myPnl;
  const clientShare = clientCost + clientPnl;
  // Signed values preserved — Math.max(0, ...) was historically used here but
  // hid loss-recovery scenarios. The new ledger handles deficits explicitly.
  setMoneyValue('soldMyReceived',     Math.round(myShare));
  setMoneyValue('soldClientReceived', Math.round(clientShare));
  updateSoldSplitFooter();
}

function updateSoldSplitFooter() {
  const w = _soldWatchData;
  if (!w) return;
  const cur    = w.currency || 'CHF';
  const sale   = parseFloat(readMoneyInput('soldSalePrice'));
  const mine   = parseFloat(readMoneyInput('soldMyReceived'));
  const client = parseFloat(readMoneyInput('soldClientReceived'));
  const footer = document.getElementById('soldSplitFooter');
  if (isNaN(sale) || (isNaN(mine) && isNaN(client))) {
    footer.innerHTML = `Leave blank to keep capital contributions as proceeds. Click <em>Auto-split</em> to apply the configured rule.`;
    footer.className = 'text-[11px] text-on-surface-variant/70';
    return;
  }
  const total = (isNaN(mine) ? 0 : mine) + (isNaN(client) ? 0 : client);
  const diff  = total - sale;
  if (Math.abs(diff) < 0.5) {
    footer.innerHTML = `✓ Splits to <span class="text-emerald-400 font-mono">${fmt.price(total, cur)}</span> · matches sale price.`;
    footer.className = 'text-[11px] text-on-surface-variant';
  } else {
    footer.innerHTML = `⚠ Total <span class="font-mono">${fmt.price(total, cur)}</span> is ${diff > 0 ? 'over' : 'under'} sale price by <span class="text-amber-400 font-mono">${fmt.price(Math.abs(diff), cur)}</span>.`;
    footer.className = 'text-[11px] text-amber-400/80';
  }
}

function closeMarkSoldModal() {
  document.getElementById('markSoldModal').classList.add('hidden');
  _soldWatchData = null;
}

// ── Record Loss Payment Modal ──────────────────────────────────────────────

let _rpWatchId = null;

function openRecordPaymentModal(watchId) {
  // Find watch from profile detail cache or allWatches
  const w = watchCache[watchId] || allWatches.find(x => x.id === watchId);
  _rpWatchId = watchId;

  const cur       = w?.currency || 'CHF';
  const lossAmt   = w ? (w.list_price - w.sale_price) : 0;
  const paid      = w ? ((w.loss_payments || []).filter(p => !p.reversed).reduce((s, p) => s + p.amount, 0)) : 0;
  const remaining = lossAmt - paid;

  document.getElementById('rpWatchModel').textContent = w?.model || `Watch #${watchId}`;
  document.getElementById('rpLossInfo').textContent   = `Loss: ${fmt.price(lossAmt, cur)} · Paid: ${fmt.price(paid, cur)} · Remaining: ${fmt.price(remaining, cur)}`;
  document.getElementById('rpCurrencyBadge').textContent = cur;

  const st = w?.loss_status || 'open';
  const badgeMap = {
    open:           'text-error border-error/30 bg-error/5',
    partially_paid: 'text-amber-400 border-amber-400/30 bg-amber-400/5',
    settled:        'text-emerald-400 border-emerald-400/30 bg-emerald-400/5',
  };
  const labelMap = { open: 'Open', partially_paid: 'Partial', settled: 'Settled' };
  const badge = document.getElementById('rpStatusBadge');
  badge.textContent = labelMap[st] || st;
  badge.className = `text-[11px] font-semibold uppercase tracking-wider px-3 py-1 rounded-lg border ${badgeMap[st] || badgeMap.open}`;

  // Pre-fill today's date
  document.getElementById('rpDate').value   = new Date().toISOString().split('T')[0];
  document.getElementById('rpAmount').value = '';
  document.getElementById('rpMethod').value = 'BANK_TRANSFER';
  document.getElementById('rpNotes').value  = '';
  document.getElementById('rpError').classList.add('hidden');

  document.getElementById('recordPaymentModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('rpAmount').focus(), 50);
}

function closeRecordPaymentModal() {
  document.getElementById('recordPaymentModal').classList.add('hidden');
  _rpWatchId = null;
}

// Live thousand-separator formatting for any money input
function formatMoneyInput(el) {
  const cursor   = el.selectionStart;
  const oldLen   = el.value.length;
  let raw = el.value.replace(/[^\d.]/g, '');
  const parts = raw.split('.');
  if (parts.length > 2) raw = parts[0] + '.' + parts.slice(1).join('');
  const [intPart, decPart] = raw.split('.');
  const formatted = (intPart ? Number(intPart).toLocaleString('en-US') : '') + (raw.includes('.') ? '.' + (decPart || '') : '');
  el.value = formatted;
  const newLen = formatted.length;
  el.setSelectionRange(cursor + (newLen - oldLen), cursor + (newLen - oldLen));
}

// Set value with comma formatting (preserves empty string for null/undefined)
function setMoneyValue(elOrId, value) {
  const el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
  if (!el) return;
  if (value == null || value === '') { el.value = ''; return; }
  el.value = Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

// Read value, strip commas — returns cleaned string ('' if blank/invalid)
function readMoneyInput(elOrId) {
  const el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
  if (!el) return '';
  const cleaned = (el.value || '').replace(/,/g, '').trim();
  return cleaned;
}

// Legacy alias (older inline handlers still call this name)
const formatRpAmount = formatMoneyInput;

// ── Global hover tooltip ──────────────────────────────────────────────────
// Any element with class `has-tip` and a `.tip-html` child will reveal its
// child's HTML in the global tooltip while hovered. The tooltip auto-flips
// above/below to stay on screen and follows the cursor target.
(() => {
  const tt = document.getElementById('globalTooltip');
  if (!tt) return;

  function position(target) {
    const r  = target.getBoundingClientRect();
    const tr = tt.getBoundingClientRect();
    const margin = 10;
    let top  = r.top - tr.height - 8;            // prefer above
    if (top < margin) top = r.bottom + 8;        // flip below if no room
    let left = r.left + r.width / 2 - tr.width / 2;
    if (left < margin) left = margin;
    if (left + tr.width > window.innerWidth - margin) left = window.innerWidth - tr.width - margin;
    tt.style.top  = `${top}px`;
    tt.style.left = `${left}px`;
  }

  document.addEventListener('mouseover', (e) => {
    const t = e.target.closest('.has-tip');
    if (!t) return;
    const tip = t.querySelector(':scope > .tip-html');
    if (!tip || !tip.innerHTML.trim()) return;
    tt.innerHTML = tip.innerHTML;
    tt.classList.remove('hidden');
    // Position after content settles
    requestAnimationFrame(() => position(t));
  });

  document.addEventListener('mouseout', (e) => {
    const t = e.target.closest('.has-tip');
    if (!t) return;
    // Only hide if leaving the tile entirely (not a child re-entry)
    if (e.relatedTarget && t.contains(e.relatedTarget)) return;
    tt.classList.add('hidden');
  });

  // Hide on scroll so the tooltip doesn't float away from its target
  window.addEventListener('scroll', () => tt.classList.add('hidden'), true);
})();

// Build tooltip body for a list of watches with custom row content
function buildWatchListTip(title, watches, rowFn, totalLabel, totalValue, cur) {
  if (!watches.length) return `<div class="px-4 py-3"><p class="text-on-surface-variant/70 italic">No watches in this bucket.</p></div>`;
  const rows = watches.map(rowFn).join('');
  return `
    <div class="px-4 py-3">
      <p class="text-[11px] uppercase tracking-wider text-primary font-semibold mb-2">${title}</p>
      <div class="space-y-1.5 max-h-60 overflow-y-auto">${rows}</div>
      ${totalLabel ? `<div class="border-t border-outline-variant/15 mt-2 pt-2 flex justify-between text-xs"><span class="text-on-surface-variant">${totalLabel}</span><span class="font-semibold text-on-surface">${totalValue}</span></div>` : ''}
    </div>`;
}

async function submitRecordPayment() {
  if (!_rpWatchId) return;
  const date      = document.getElementById('rpDate').value;
  const rawAmount = document.getElementById('rpAmount').value.replace(/,/g, '');
  const amount    = parseFloat(rawAmount);
  const method    = document.getElementById('rpMethod').value;
  const notes     = document.getElementById('rpNotes').value.trim();
  const errEl     = document.getElementById('rpError');
  errEl.classList.add('hidden');

  if (!date)                         { errEl.textContent = 'Date is required';            errEl.classList.remove('hidden'); return; }
  if (isNaN(amount) || amount <= 0)  { errEl.textContent = 'Enter a positive amount';     errEl.classList.remove('hidden'); return; }

  try {
    await api('POST', `/api/watches/${_rpWatchId}/loss-payments`, { date, amount, method, notes });
    closeRecordPaymentModal();
    // Refresh current page to reflect updated loss_status and payments
    if (currentPage === 'watch-detail'   && currentWatchId)   openWatchDetail(currentWatchId);
    else if (currentPage === 'profile-detail' && currentProfileId) openProfileDetail(currentProfileId);
  } catch (e) {
    errEl.textContent = e.message || 'Failed to record payment';
    errEl.classList.remove('hidden');
  }
}

async function reversePayment(paymentId, watchId) {
  if (!confirm('Void this payment? This cannot be undone.')) return;
  try {
    await api('POST', `/api/loss-payments/${paymentId}/reverse`);
    if (currentPage === 'watch-detail'   && currentWatchId)   openWatchDetail(currentWatchId);
    else if (currentPage === 'profile-detail' && currentProfileId) openProfileDetail(currentProfileId);
  } catch (e) {
    alert(e.message || 'Failed to void payment');
  }
}

// ── Expenses ──────────────────────────────────────────────────────────────────

let _expWatchId = null;

function expenseCategoryLabel(cat) {
  return {
    shipping:             'Shipping',
    travel:               'Travel',
    pickup_meeting:       'Pickup / Meeting',
    insurance:            'Insurance',
    restoration_service:  'Restoration / Service',
    storage:              'Storage',
    commission:           'Commission',
    other:                'Other',
  }[cat] || 'Other';
}

function openAddExpenseModal(watchId) {
  const w = watchCache[watchId] || allWatches.find(x => x.id === watchId);
  _expWatchId = watchId;

  const cur = w?.currency || 'CHF';
  document.getElementById('expWatchModel').textContent   = w?.model || `Watch #${watchId}`;
  document.getElementById('expWatchInfo').textContent    = `${w?.status || ''} · ${cur}`;
  document.getElementById('expCurrencyBadge').textContent = cur;

  document.getElementById('expCategory').value    = 'other';
  document.getElementById('expDate').value        = new Date().toISOString().split('T')[0];
  document.getElementById('expAmount').value      = '';
  document.getElementById('expDescription').value = '';
  document.getElementById('expError').classList.add('hidden');

  document.getElementById('addExpenseModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('expAmount').focus(), 50);
}

function closeAddExpenseModal() {
  document.getElementById('addExpenseModal').classList.add('hidden');
  _expWatchId = null;
}

async function submitExpense() {
  const errEl = document.getElementById('expError');
  errEl.classList.add('hidden');

  const category    = document.getElementById('expCategory').value;
  const date        = document.getElementById('expDate').value;
  const rawAmount   = readMoneyInput('expAmount');
  const description = document.getElementById('expDescription').value.trim();
  const currency    = document.getElementById('expCurrencyBadge').textContent.trim() || 'CHF';

  if (!date)      { errEl.textContent = 'Date is required.';            errEl.classList.remove('hidden'); return; }
  if (!rawAmount) { errEl.textContent = 'Amount is required.';          errEl.classList.remove('hidden'); return; }
  const amount = Number(rawAmount);
  if (isNaN(amount) || amount <= 0) { errEl.textContent = 'Enter a valid positive amount.'; errEl.classList.remove('hidden'); return; }

  try {
    await api('POST', `/api/watches/${_expWatchId}/expenses`, { category, date, amount, currency, description: description || undefined });
    closeAddExpenseModal();
    if (currentPage === 'watch-detail'   && currentWatchId)   openWatchDetail(currentWatchId);
    else if (currentPage === 'profile-detail' && currentProfileId) openProfileDetail(currentProfileId);
    else if (currentPage === 'client-detail' && currentClientId) openClientDetail(currentClientId);
  } catch (e) {
    errEl.textContent = e.message || 'Failed to save expense.';
    errEl.classList.remove('hidden');
  }
}

async function reverseExpense(expenseId, watchId) {
  if (!confirm('Void this expense? This cannot be undone.')) return;
  try {
    await api('POST', `/api/expenses/${expenseId}/reverse`);
    if (currentPage === 'watch-detail'   && currentWatchId)   openWatchDetail(currentWatchId);
    else if (currentPage === 'profile-detail' && currentProfileId) openProfileDetail(currentProfileId);
    else if (currentPage === 'client-detail' && currentClientId) openClientDetail(currentClientId);
  } catch (e) {
    alert(e.message || 'Failed to void expense');
  }
}

// ── Payouts (client + me) ─────────────────────────────────────────────────────

let _payoutSide    = 'client';   // 'client' | 'my'
let _payoutWatchId = null;

// Compute owed/paid/remaining for a single watch (mirrors db.js _computeOwed)
function watchPayoutBalance(w, side /* 'client' | 'my' */) {
  const con = side === 'client' ? (w.client_cost || 0) : (w.my_cost || 0);
  const ledger = side === 'client' ? (w.client_payouts || []) : (w.my_payouts || []);
  const paid = ledger.filter(p => !p.reversed).reduce((s, p) => s + p.amount, 0);

  let share = 0, owed = con, dc = null, debt = 0;
  const isDiscount = watchRule(w, w.profile) === 'discount';
  if (isDiscount && w.status === 'sold' && w.list_price != null && (w.sale_price != null || w.market_price != null)) {
    // Discount Split v2 — handover: me = M + discount, client = cash to wire;
    // loss: me = min(S, M), client = max(S − M, 0) and the shortfall is a
    // client debt tracked in Panel B (never an "overpayment").
    dc = discountCalc(w, w.profile || w);
    share = side === 'my' ? dc.myIncome : dc.clientPnl;
    owed  = side === 'my' ? dc.myOwed   : dc.clientOwed;
    if (side === 'client' && dc.isLoss) debt = w.loss_payments ? dc.outstanding : dc.clientOwesMe;
  } else if (w.status === 'sold' && w.list_price != null && w.sale_price != null) {
    const profitSplit  = w.profile?.profit_split_me ?? w.profit_split_me ?? 100;
    const lossSplit    = w.profile?.loss_split_me   ?? w.loss_split_me   ?? 100;
    const gross        = w.sale_price - w.list_price;
    const sp = gross >= 0 ? profitSplit : lossSplit;
    share = side === 'my' ? (sp / 100) * gross + splitHandoverDisc(w) : ((100 - sp) / 100) * gross;
    owed  = con + share;
  }
  const remaining = owed - paid;
  let status;
  if (owed <= 0 && paid <= 0) status = 'not_due';
  else if (owed <= 0)         status = 'not_applicable';
  else if (paid <= 0)         status = 'open';
  else if (paid >= owed)      status = 'settled';
  else                        status = 'partially_paid';
  return { contribution: con, share, owed, paid, remaining, status, dc, debt };
}

// Status badge for payout balance. `phase` is 'pre_sale' | 'post_sale' — labels
// "Partial" / "Settled" stay accurate post-sale, but pre-sale they refer only
// to principal return, which makes more sense when called out explicitly.
function payoutStatusBadge(status, phase /* 'pre_sale' | 'post_sale' */) {
  const map = {
    open:           'text-error border-error/30 bg-error/5',
    partially_paid: 'text-amber-400 border-amber-400/30 bg-amber-400/5',
    settled:        'text-emerald-400 border-emerald-400/30 bg-emerald-400/5',
    not_due:        'text-on-surface-variant/60 border-outline-variant/20 bg-white/[0.02]',
    not_applicable: 'text-on-surface-variant/40 border-outline-variant/20 bg-white/[0.02]',
  };
  const postLabel = { open:'Open', partially_paid:'Partial', settled:'Settled', not_due:'Not Due', not_applicable:'N/A' };
  const preLabel  = { open:'Principal Open', partially_paid:'Principal Partial', settled:'Principal Returned', not_due:'Not Due', not_applicable:'N/A' };
  const label = phase === 'pre_sale' ? preLabel : postLabel;
  return `<span class="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md border ${map[status] || map.open}">${label[status] || status}</span>`;
}

// Imperative variant for modal — sets className+text on a stable element so
// repeated opens never re-attach by string replace (audit #8).
function applyPayoutStatusBadge(el, status, phase) {
  const map = {
    open:           'text-error border-error/30 bg-error/5',
    partially_paid: 'text-amber-400 border-amber-400/30 bg-amber-400/5',
    settled:        'text-emerald-400 border-emerald-400/30 bg-emerald-400/5',
    not_due:        'text-on-surface-variant/60 border-outline-variant/20 bg-white/[0.02]',
    not_applicable: 'text-on-surface-variant/40 border-outline-variant/20 bg-white/[0.02]',
  };
  const postLabel = { open:'Open', partially_paid:'Partial', settled:'Settled', not_due:'Not Due', not_applicable:'N/A' };
  const preLabel  = { open:'Principal Open', partially_paid:'Principal Partial', settled:'Principal Returned', not_due:'Not Due', not_applicable:'N/A' };
  const label = phase === 'pre_sale' ? preLabel : postLabel;
  el.className   = `text-[11px] font-semibold uppercase tracking-wider px-3 py-1 rounded-lg border ${map[status] || map.open}`;
  el.textContent = label[status] || status;
}

function openRecordPayoutModal(watchId, side /* 'client' | 'my' */) {
  const w = watchCache[watchId] || allWatches.find(x => x.id === watchId);
  if (!w) { alert('Watch not loaded'); return; }
  _payoutSide    = side === 'my' ? 'my' : 'client';
  _payoutWatchId = watchId;

  const isClient = _payoutSide === 'client';
  const cur      = w.currency || 'CHF';
  const bal      = watchPayoutBalance(w, _payoutSide);

  // Themed accents
  document.getElementById('poTitle').textContent       = isClient ? 'Payout to Client' : 'My Withdrawal';
  document.getElementById('poTitle').className         = `font-playfair text-2xl ${isClient ? 'text-sky-400' : 'text-amber-400'}`;
  document.getElementById('poIconBox').className       = `w-10 h-10 rounded-lg ${isClient ? 'bg-sky-500/10' : 'bg-amber-500/10'} flex items-center justify-center flex-shrink-0`;
  document.getElementById('poIcon').className          = `material-symbols-outlined ${isClient ? 'text-sky-400' : 'text-amber-400'} text-xl`;
  document.getElementById('poIcon').textContent        = isClient ? 'payments' : 'account_balance_wallet';
  document.getElementById('poSaveBtn').className       = `${isClient ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30 hover:bg-sky-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30'} font-semibold px-6 py-2.5 rounded-lg text-sm transition-all flex items-center gap-2`;

  document.getElementById('poWatchModel').textContent  = w.model || `Watch #${watchId}`;
  document.getElementById('poOwingInfo').textContent   =
    `Owed ${fmt.price(Math.max(0, bal.owed), cur)} · Paid ${fmt.price(bal.paid, cur)} · Remaining ${fmt.price(Math.max(0, bal.remaining), cur)}`;
  // Imperative update keeps element identity stable across reopens.
  applyPayoutStatusBadge(
    document.getElementById('poStatusBadge'),
    bal.status,
    w.status === 'sold' ? 'post_sale' : 'pre_sale'
  );
  document.getElementById('poCurrencyBadge').textContent = cur;

  document.getElementById('poDate').value      = new Date().toISOString().split('T')[0];
  document.getElementById('poAmount').value    = '';
  document.getElementById('poMethod').value    = 'BANK_TRANSFER';
  document.getElementById('poNotes').value     = '';
  document.getElementById('poError').classList.add('hidden');
  document.getElementById('poRemainingHint').textContent =
    bal.remaining > 0 ? `Remaining to settle: ${fmt.price(bal.remaining, cur)}` :
    bal.remaining < 0 ? `Already overpaid by ${fmt.price(-bal.remaining, cur)} — recording will increase overpayment` :
                         `Fully settled.`;

  document.getElementById('recordPayoutModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('poAmount').focus(), 50);
}

function closeRecordPayoutModal() {
  document.getElementById('recordPayoutModal').classList.add('hidden');
  _payoutWatchId = null;
}

async function submitRecordPayout() {
  const errEl = document.getElementById('poError');
  errEl.classList.add('hidden');

  const date     = document.getElementById('poDate').value;
  const rawAmt   = readMoneyInput('poAmount');
  const method   = document.getElementById('poMethod').value;
  const notes    = document.getElementById('poNotes').value.trim();
  const currency = document.getElementById('poCurrencyBadge').textContent.trim() || 'CHF';

  if (!date)   { errEl.textContent = 'Date is required.';   errEl.classList.remove('hidden'); return; }
  if (!rawAmt) { errEl.textContent = 'Amount is required.'; errEl.classList.remove('hidden'); return; }
  const amount = Number(rawAmt);
  if (isNaN(amount) || amount <= 0) { errEl.textContent = 'Enter a positive amount.'; errEl.classList.remove('hidden'); return; }

  const endpoint = _payoutSide === 'client'
    ? `/api/watches/${_payoutWatchId}/client-payouts`
    : `/api/watches/${_payoutWatchId}/my-payouts`;
  try {
    await api('POST', endpoint, { date, amount, currency, method, notes });
    closeRecordPayoutModal();
    refreshAfterPayoutChange();
  } catch (e) {
    errEl.textContent = e.message || 'Failed to save payout.';
    errEl.classList.remove('hidden');
  }
}

async function reverseClientPayout(payoutId, watchId) {
  if (!confirm('Void this payout? This cannot be undone.')) return;
  try {
    await api('POST', `/api/client-payouts/${payoutId}/reverse`);
    refreshAfterPayoutChange();
  } catch (e) {
    alert(e.message || 'Failed to void payout');
  }
}

async function reverseMyPayout(payoutId, watchId) {
  if (!confirm('Void this payout? This cannot be undone.')) return;
  try {
    await api('POST', `/api/my-payouts/${payoutId}/reverse`);
    refreshAfterPayoutChange();
  } catch (e) {
    alert(e.message || 'Failed to void payout');
  }
}

function refreshAfterPayoutChange() {
  if      (currentPage === 'watch-detail'    && currentWatchId)   openWatchDetail(currentWatchId);
  else if (currentPage === 'profile-detail'  && currentProfileId) openProfileDetail(currentProfileId);
  else if (currentPage === 'client-detail'   && currentClientId)  openClientDetail(currentClientId);
  else if (currentPage === 'main-kpi')                            loadMainKpi();
  else if (currentPage === 'watches')                             loadWatches(document.getElementById('watchSearch').value, '');
}

function updateSoldPnl() {
  const w = _soldWatchData;
  if (!w) return;
  const cur = w.currency || 'CHF';
  const listPrice = w.list_price;
  const salePrice = parseFloat(readMoneyInput('soldSalePrice'));

  document.getElementById('pnlListPrice').textContent = listPrice != null ? fmt.price(listPrice, cur) : '—';
  document.getElementById('pnlSalePrice').textContent = !isNaN(salePrice) ? fmt.price(salePrice, cur) : '—';

  if (listPrice == null || isNaN(salePrice)) {
    document.getElementById('pnlGross').textContent = '—';
    document.getElementById('pnlGross').className = 'font-mono';
    document.getElementById('pnlMyShare').textContent = '—';
    document.getElementById('pnlClientShare').textContent = '—';
    document.getElementById('pnlSplitHint').textContent = '';
    document.getElementById('pnlClientHint').textContent = '';
    return;
  }

  const gross          = salePrice - listPrice;
  const isDiscount     = (_soldRule || w.trading_rule || 'split') === 'discount';
  const discountSplit  = w.discount_split ?? 0.08;
  const lossSplitMe    = w.loss_split_me   ?? 100;
  const profitSplitMe  = w.profit_split_me ?? 100;
  const colorClass = g => g >= 0 ? 'font-mono text-emerald-400' : 'font-mono text-red-400';
  const sign = g => g >= 0 ? '+' : '';

  if (isDiscount) {
    // Discount Split v2 loss sale: proceeds repay me first; shortfall = client debt
    const d = discountCalc({ ...w, sale_price: salePrice, market_price: null }, w);
    const setRow = (id, v, c) => { const el = document.getElementById(id); el.textContent = fmt.price(v, cur); el.className = `font-mono font-semibold ${c}`; };
    document.getElementById('pnlGross').textContent = `${sign(gross)}${fmt.price(gross, cur)}`;
    document.getElementById('pnlGross').className   = colorClass(gross);
    document.getElementById('pnlMyLabel').textContent     = 'Cash back to me';
    document.getElementById('pnlSplitHint').textContent   = `min(sold, my ${fmt.price(d.M, cur)})`;
    setRow('pnlMyShare', d.cashBackMe, 'text-on-surface');
    if (d.clientOwesMe > 0) {
      document.getElementById('pnlClientLabel').textContent = 'Client owes me';
      document.getElementById('pnlClientHint').textContent  = '(Panel B)';
      setRow('pnlClientShare', d.clientOwesMe, 'text-red-400');
    } else {
      document.getElementById('pnlClientLabel').textContent = 'Payout to client';
      document.getElementById('pnlClientHint').textContent  = gross > 0 ? '(above list — use Handover for profitable watches)' : '';
      setRow('pnlClientShare', d.payoutClient, 'text-purple-300');
    }
    return;
  }

  // Unified P&L preview that conserves: myShare + clientShare = gross.
  let myShare, clientShare, splitHint, clientHint;
  {
    const splitMe = gross >= 0 ? profitSplitMe : lossSplitMe;
    myShare     = gross * splitMe / 100;
    clientShare = gross * (100 - splitMe) / 100;
    splitHint   = `(${splitMe}% of net)`;
    clientHint  = `(${100 - splitMe}% of net)`;
  }

  document.getElementById('pnlGross').textContent = `${sign(gross)}${fmt.price(gross, cur)}`;
  document.getElementById('pnlGross').className   = colorClass(gross);
  document.getElementById('pnlMyShare').textContent = `${sign(myShare)}${fmt.price(myShare, cur)}`;
  document.getElementById('pnlMyShare').className   = colorClass(myShare) + ' font-semibold';
  document.getElementById('pnlClientShare').textContent = `${sign(clientShare)}${fmt.price(clientShare, cur)}`;
  document.getElementById('pnlClientShare').className   = colorClass(clientShare) + ' font-semibold';
  document.getElementById('pnlMyLabel').textContent     = 'My P&L share';
  document.getElementById('pnlClientLabel').textContent = 'Client P&L share';
  document.getElementById('pnlSplitHint').textContent   = splitHint;
  document.getElementById('pnlClientHint').textContent  = clientHint;
}

async function submitMarkSold() {
  if (!_soldWatchData) return;
  const id = _soldWatchData.id;
  const salePrice      = readMoneyInput('soldSalePrice');
  const myReceived     = readMoneyInput('soldMyReceived');
  const clientReceived = readMoneyInput('soldClientReceived');
  const soldTo         = document.getElementById('soldTo').value.trim();
  const saleDate       = document.getElementById('soldSaleDate').value;

  const fd = new FormData();
  fd.append('status', 'sold');
  const showErr = msg => { const el = document.getElementById('soldError'); el.textContent = msg; el.classList.remove('hidden'); };

  if (_soldIsDiscount) {
    // Discount Split v2 — the cash split always follows the rules
    const r2 = v => String(Math.round(v * 100) / 100);
    fd.append('rule_applied', 'discount');
    if (saleDate) fd.append('sale_date', saleDate);
    if (_soldOutcome === 'handover') {
      const h = handoverFigures();
      if (!h) return showErr('Enter the agreed market price.');
      if (h.clientPrice <= 0 || h.clientPrice > h.P) return showErr('Client price must be between 0 and the market price.');
      fd.append('sale_price',             r2(h.clientPrice));
      fd.append('market_price',           r2(h.P));
      fd.append('market_price_date',      saleDate || new Date().toISOString().split('T')[0]);
      fd.append('market_price_agreed_by', document.getElementById('soldAgreedBy').value.trim());
      fd.append('discount_mode',          _soldDiscMode);
      fd.append('client_price_manual',    _soldDiscMode === 'manual' ? r2(h.clientPrice) : '');
      fd.append('offset_amount',          r2(h.offset));
      fd.append('my_received',            r2(h.M + h.discAmt));
      fd.append('client_received',        r2(h.wire));
    } else {
      if (salePrice === '' || isNaN(parseFloat(salePrice))) return showErr('Enter the sale price.');
      const d = discountCalc({ ..._soldWatchData, sale_price: parseFloat(salePrice), market_price: null }, _soldProfile);
      fd.append('sale_price',          salePrice);
      fd.append('market_price',        '');
      fd.append('discount_mode',       'standard');
      fd.append('client_price_manual', '');
      fd.append('offset_amount',       '0');
      fd.append('my_received',         r2(d.cashBackMe));
      fd.append('client_received',     r2(d.payoutClient));
      if (soldTo) fd.append('sold_to', soldTo);
    }
  } else if (_soldRule === 'split' && _soldOutcome === 'handover') {
    // P/L Split handover: sale price = client price; discount mine; profit split by P/L %
    const r2 = v => String(Math.round(v * 100) / 100);
    const h = handoverFigures();
    if (!h) return showErr('Enter the agreed market price.');
    if (h.clientPrice <= 0 || h.clientPrice > h.P) return showErr('Client price must be between 0 and the market price.');
    fd.append('rule_applied',           'split');
    fd.append('sale_price',             r2(h.clientPrice));
    fd.append('market_price',           r2(h.P));
    fd.append('market_price_date',      saleDate || new Date().toISOString().split('T')[0]);
    fd.append('market_price_agreed_by', document.getElementById('soldAgreedBy').value.trim());
    fd.append('discount_mode',          _soldDiscMode);
    fd.append('client_price_manual',    _soldDiscMode === 'manual' ? r2(h.clientPrice) : '');
    fd.append('offset_amount',          '0');
    fd.append('my_received',            r2(h.M + h.mine + h.discAmt));
    fd.append('client_received',        r2(h.clientCash));
    if (saleDate) fd.append('sale_date', saleDate);
  } else {
  if (_soldRule) {
    if (salePrice === '' || isNaN(parseFloat(salePrice))) return showErr('Enter the sale price.');
    // P/L Split sale: record the rule and drop any earlier handover figures
    fd.append('rule_applied',        'split');
    fd.append('market_price',        '');
    fd.append('discount_mode',       'standard');
    fd.append('client_price_manual', '');
    fd.append('offset_amount',       '0');
  }
  if (salePrice      !== '') fd.append('sale_price',      salePrice);
  if (myReceived     !== '') fd.append('my_received',     myReceived);
  if (clientReceived !== '') fd.append('client_received', clientReceived);
  if (soldTo)                fd.append('sold_to',         soldTo);
  if (saleDate)              fd.append('sale_date',       saleDate);
  }

  try {
    const result = await api('PUT', `/api/watches/${id}`, fd);
    closeMarkSoldModal();
    refreshCurrentWatchView();
  } catch (e) {
    alert(e.message || 'Failed to mark as sold');
  }
}

function refreshCurrentWatchView() {
  if      (currentPage === 'watch-detail')    openWatchDetail(currentWatchId);
  else if (currentPage === 'profile-detail')  openProfileDetail(currentProfileId);
  else if (currentPage === 'watches')         loadWatches(document.getElementById('watchSearch').value, '');
  else if (currentPage === 'shop-detail')     openShopDetail(currentShopId);
  else if (currentPage === 'portfolio-detail')openPortfolioDetail(currentPortfolioId);
  else if (currentPage === 'client-detail')   openClientDetail(currentClientId);
}

let watchSearchTimer;
document.getElementById('watchSearch').addEventListener('input', e => {
  clearTimeout(watchSearchTimer);
  watchSearchTimer = setTimeout(() => { watchPage = 1; loadWatches(e.target.value.trim(), ''); }, 300);
});
document.getElementById('watchStatusTabs').addEventListener('click', e => {
  const btn = e.target.closest('.watch-status-tab');
  if (!btn) return;
  activeQuickFilter = null;          // picking a status tab replaces any quick filter
  setWatchStatusTab(btn.dataset.status);
  watchPage = 1;
  renderWatches();
});

// Highlight one status tab and make it the active status filter
function setWatchStatusTab(status) {
  watchStatusFilter = status || '';
  document.querySelectorAll('.watch-status-tab').forEach(b => {
    b.className = 'watch-status-tab text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg border transition-all ' +
      (b.dataset.status === watchStatusFilter ? 'bg-primary/15 border-primary/40 text-primary' : 'border-outline-variant/30 text-on-surface-variant hover:bg-surface-variant/30');
  });
}
document.getElementById('addWatchTopBtn').addEventListener('click', () => openAddWatch(null));

// Search boxes only react to what the user actually typed. Password managers
// can autofill the signed-in username into them (the Settings/Admin pages have
// password fields), which used to fire the global search and jump the user to
// Watches — e.g. right after clicking Clients. Autofill happens without focus,
// so any change to an unfocused search box is reverted before other listeners
// see it, and showPage() scrubs values that were injected without an event.
var GUARDED_SEARCH_IDS = ['globalSearch', 'profileSearch', 'watchSearch'];
document.addEventListener('input', e => {
  const el = e.target;
  if (!GUARDED_SEARCH_IDS.includes(el.id)) return;
  if (document.activeElement === el) { el.dataset.typed = el.value; return; }
  el.value = el.dataset.typed || '';
  e.stopImmediatePropagation();
}, true);
function scrubAutofilledSearches() {
  (GUARDED_SEARCH_IDS || []).forEach(id => {
    const el = document.getElementById(id);
    if (el && document.activeElement !== el && el.value !== (el.dataset.typed || '')) el.value = el.dataset.typed || '';
  });
}

// Global search
let globalTimer;
document.getElementById('globalSearch').addEventListener('input', e => {
  clearTimeout(globalTimer);
  globalTimer = setTimeout(() => {
    const q = e.target.value.trim();
    if (!q) return;
    showPage('watches');
    document.getElementById('watchSearch').value = q;
    document.getElementById('watchSearch').dataset.typed = q;
    watchPage = 1;
    loadWatches(q, '');
  }, 300);
});

// "/" jumps to search from anywhere (unless already typing); Esc leaves it
document.addEventListener('keydown', e => {
  const search = document.getElementById('globalSearch');
  if (e.key === '/' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {   // Shift+/ is "?" (shortcuts help)
    const t = e.target;
    if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    if (search.closest('.hidden')) return;
    e.preventDefault();
    search.focus();
    search.select();
  } else if (e.key === 'Escape' && document.activeElement === search) {
    search.blur();
  }
});

// Top-bar clock (trading-desk style local time)
(function tickClock() {
  const el = document.getElementById('liveClock');
  if (el) el.textContent = new Date().toLocaleString(undefined, { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  setTimeout(tickClock, 60000 - (Date.now() % 60000));
})();
