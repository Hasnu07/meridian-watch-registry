// 05-reports.js — PDF report kit + shop PDF report
// Part of the dashboard script: scripts/build.js concatenates src/dashboard/*.js
// in filename order into public/js/dashboard.js (one classic script, so
// functions and top-level variables stay shared exactly as before).

// ── PDF report kit (shared by the client and shop reports) ───────────────
// Both reports are printable HTML in the Meridian client-feed theme; the
// browser's "Save as PDF" keeps the internal anchor links clickable.
function pdfReportKit() {
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const money = (v, cur) => {
    const c = cur || 'CHF';
    try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(Math.round(v || 0)); }
    catch { return c + ' ' + Math.round(v || 0).toLocaleString('en-US'); }
  };
  const dt  = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
  const e   = (s) => esc(s == null ? '' : String(s));
  // Per-currency line, dropping zero entries; returns '' if nothing to show
  const curLine = (map) => Object.entries(map || {}).filter(([, v]) => Math.round(v) !== 0).map(([c, v]) => money(v, c)).join('&nbsp;&nbsp;·&nbsp;&nbsp;');
  // Same, one currency per line — for tiles, where a long line would overflow
  const curStack = (map) => Object.entries(map || {}).filter(([, v]) => Math.round(v) !== 0).map(([c, v]) => money(v, c)).join('<br>');
  const sumByCur = (arr, pick) => { const m = {}; for (const w of arr) { const c = w.currency || 'CHF'; const v = pick(w); if (v) m[c] = (m[c] || 0) + v; } return m; };
  const mergeInto = (dst, src) => { for (const [c, v] of Object.entries(src || {})) dst[c] = (dst[c] || 0) + v; return dst; };
  // signed money: leading + on positives so P&L reads clearly
  const smoney = (v, cur) => (v > 0 ? '+' : '') + money(v, cur);
  // a labelled value cell — returns '' when the value is missing (no empties)
  const kv = (label, valHtml) => valHtml ? `<div class="kv"><div class="kv-l">${label}</div><div class="kv-v">${valHtml}</div></div>` : '';
  const col = (v) => v > 0 ? '#2CFFA8' : v < 0 ? '#FF4D6D' : '#E6EDF7';

  const statusPill = (s) => {
    const map = { wishlist: ['#FFC233', 'Wishlist'], purchased: ['#B18CFF', 'Purchased'], sold: ['#2CFFA8', 'Sold'] };
    const [c, label] = map[s] || ['#8392A8', e(s || '—')];
    return `<span class="pill" style="color:${c};border-color:${c}66;background:${c}1a">${label}</span>`;
  };
  const ruleChip = (m) => (m.trading_rule || 'split') === 'discount'
    ? `<span class="pill" style="color:#22D3FF;border-color:#22D3FF66;background:#22D3FF1a">Discount ${((m.discount_split ?? 0.08) * 100).toFixed(2)}%</span>`
    : `<span class="pill" style="color:#B18CFF;border-color:#c9a3ff66;background:#c9a3ff1a">P/L split ${m.profit_split_me ?? 100}/${100 - (m.profit_split_me ?? 100)}</span>`;

  // Detailed per-watch card — mirrors the Meridian expanded row.
  // opts.id → anchor id; opts.back → [href, label] link back up the report.
  const watchCard = (w, m, opts = {}) => {
    const cur = w.currency || 'CHF';
    const sold = w.status === 'sold';
    const isDiscount = watchRule(w, m) === 'discount';
    const dcw = (isDiscount && sold && w.list_price != null) ? discountCalc(w, m) : null;
    const handover = !!dcw?.isProfit;
    const plHandover = !isDiscount && sold && w.market_price != null && w.sale_price != null;
    const gross = handover ? null
      : (sold && w.list_price != null && w.sale_price != null) ? (w.sale_price - w.list_price) : null;
    const income = handover ? dcw.discAmt : null;
    const ww = { ...w, profile: m };
    const mb = watchPayoutBalance(ww, 'my');
    const cb = watchPayoutBalance(ww, 'client');

    // Header right-side headline: discount income, else gross P&L
    let headline = '';
    if (income != null) headline = `<div class="wc-income" style="color:#22D3FF">${smoney(income, cur)}<span class="wc-income-sub">${(dcw.discPct * 100).toFixed(2)}% disc.</span></div>`;
    else if (gross != null) headline = `<div class="wc-income" style="color:${col(gross)}">${smoney(gross, cur)}</div>`;

    // Transaction detail row (only non-empty fields)
    const detail = [
      kv('List',      w.list_price != null ? money(w.list_price, cur) : ''),
      kv('Market Price', handover ? money(dcw.P, cur) : plHandover ? money(w.market_price, cur) : ''),
      kv('Client Price', handover ? `<span class="gold">${money(dcw.clientPrice, cur)}</span>` : plHandover ? `<span class="gold">${money(w.sale_price, cur)}</span>` : ''),
      kv('My Discount', plHandover ? `<span style="color:#22D3FF">+${money(splitHandoverDisc(w), cur)}</span>` : ''),
      kv('Sold For',  !handover && !plHandover && sold && w.sale_price != null ? `<span class="gold">${money(w.sale_price, cur)}</span>` : ''),
      kv('Gross P&L', gross != null ? `<span style="color:${col(gross)}">${smoney(gross, cur)}</span>` : ''),
      kv('Offset',    handover && dcw.offset ? money(dcw.offset, cur) : ''),
      kv('Client Owes', dcw?.isLoss && dcw.clientOwesMe > 0 ? `<span style="color:#FF4D6D">${money(dcw.outstanding, cur)}</span>` : ''),
      kv('Sold To',   sold ? e(w.sold_to) : ''),
      kv('Date',      dt(w.purchase_date)),
      kv('Reference', e(w.reference_number)),
    ].filter(Boolean).join('');

    // Money split (My / Client) — only cells with data
    const finance = [
      kv('My Cost',        w.my_cost != null ? money(w.my_cost, cur) : ''),
      kv('Paid to Me',     mb.paid ? `<span style="color:#2CFFA8">${money(mb.paid, cur)}</span>` : ''),
      kv('My P&L',         sold ? `<span style="color:${col(mb.share)}">${smoney(mb.share, cur)}</span>` : ''),
      kv('Client Cost',    w.client_cost != null ? money(w.client_cost, cur) : ''),
      kv('Paid to Client', cb.paid ? `<span style="color:#B18CFF">${money(cb.paid, cur)}</span>` : ''),
      kv('Client P&L',     sold ? `<span style="color:${col(cb.share)}">${smoney(cb.share, cur)}</span>` : ''),
    ].filter(Boolean).join('');

    // Settlement line — show a side only if it owes or was paid something
    const settleBits = [];
    if (cb.debt > 0) settleBits.push(`<span style="color:#FF4D6D">Client owes ${money(cb.debt, cur)} (loss shortfall)</span>`);
    else if (cb.owed > 0 || cb.paid > 0) settleBits.push(`Client: paid ${money(cb.paid, cur)} · remaining ${money(Math.max(0, cb.remaining), cur)}`);
    if (mb.owed > 0 || mb.paid > 0) settleBits.push(`Me: paid ${money(mb.paid, cur)} · remaining ${money(Math.max(0, mb.remaining), cur)}`);
    const settleHtml = settleBits.length ? `<div class="wc-settle">${settleBits.join('&nbsp;&nbsp;·&nbsp;&nbsp;')}</div>` : '';

    // Loss recoveries (transfers / offsets) — only if any
    const recs = (w.loss_payments || []).filter(x => !x.reversed);
    const recHtml = recs.length ? `
        <div class="wc-exp">
          <div class="wc-exp-title">Loss recoveries · ${money(recs.reduce((s, x) => s + x.amount, 0), cur)}</div>
          ${recs.map(x => `<div class="wc-exp-row"><span>${dt(x.date) || ''} · ${e(recoveryMethodLabel(x))}</span><span class="mono">${money(x.amount, cur)}</span></div>`).join('')}
        </div>` : '';

    // Expenses (active) — only if any
    const exps = (w.expenses || []).filter(x => !x.reversed);
    const expTot = exps.reduce((s, x) => s + x.amount, 0);
    const expHtml = exps.length ? `
        <div class="wc-exp">
          <div class="wc-exp-title">Expenses · ${money(expTot, cur)}</div>
          ${exps.map(x => `<div class="wc-exp-row"><span>${dt(x.date) || ''} · ${e(expenseCategoryLabel(x.category))}${x.description ? ' · ' + e(x.description) : ''}</span><span class="mono">${money(x.amount, x.currency || cur)}</span></div>`).join('')}
        </div>` : '';

    const statusColor = { wishlist: '#FFC233', purchased: '#B18CFF', sold: '#2CFFA8' }[w.status] || '#8392A8';
    const meta = [w.reference_number && opts.showRef ? e(w.reference_number) : '', w.stock_number ? 'Stock ' + e(w.stock_number) : '', w.serial_number ? e(w.serial_number) : '']
      .filter(Boolean).join('&nbsp;&nbsp;·&nbsp;&nbsp;');
    return `
      <div class="wcard" ${opts.id ? `id="${opts.id}"` : ''} style="border-left:3px solid ${statusColor}">
        <div class="wc-head">
          <div class="wc-title">
            <div class="wc-model">${e(w.model)}</div>
            ${meta ? `<div class="wc-meta">${meta}</div>` : ''}
          </div>
          <div class="wc-headright">${statusPill(w.status)}${headline}</div>
        </div>
        ${detail ? `<div class="kv-grid">${detail}</div>` : ''}
        ${finance ? `<div class="kv-grid finance">${finance}</div>` : ''}
        ${settleHtml}
        ${recHtml}
        ${expHtml}
        ${opts.back ? `<div class="backlink"><a href="${opts.back[0]}">↑ ${opts.back[1]}</a></div>` : ''}
      </div>`;
  };

  // Stats grid for one membership — rule-aware, each tile only when it has a value
  const statsGrid = (m, title) => {
    const p = computePnl(m);
    const cur = dominantCurrency(m.watches || []);
    const sumMap = (map) => Object.values(map || {}).reduce((a, b) => a + b, 0);
    const val = (map, mode) => {
      const s = curStack(map); if (!s) return '';
      let c = '#E6EDF7';
      if (mode === 'profit') c = '#2CFFA8';
      else if (mode === 'loss') c = '#FF4D6D';
      else if (mode === 'gold') c = '#22D3FF';
      else if (mode === 'pl') { const t = sumMap(map); c = t > 0 ? '#2CFFA8' : t < 0 ? '#FF4D6D' : '#E6EDF7'; }
      return `<span style="color:${c}">${s}</span>`;
    };
    const one = (v, c = '#E6EDF7') => Math.round(v || 0) ? `<span style="color:${c}">${money(v, cur)}</span>` : '';
    const defs = (p.isDiscount || p.hasDiscountWatches) ? [
      ['Discount Earned',    val(p.discountIncomeByCur, 'gold')],
      ['My P&L',             p.hasSplitWatches ? val(p.myPnlByCur, 'pl') : ''],
      ['Avg Discount',       p.totalMarketValue ? `<span style="color:#22D3FF">${(p.avgDiscountPct * 100).toFixed(2)}%</span>` : ''],
      ['Owed to Me',         one(p.lossOutstanding, '#FF4D6D')],
      ['Losses Recovered',   one(p.totalLossPaid, '#2CFFA8')],
      ['Wired to Client',    one(p.totalWire, '#B18CFF')],
      ['Client P&L',         val(p.clientPnlByCur, 'pl')],
      ['My Total Cost',      val(p.myTotalCostByCur)],
      ['Client Total Cost',  val(p.clientTotalCostByCur)],
      ['Total Expenses',     val(p.totalExpensesByCur, 'loss')],
      ['Client Outstanding', val(p.clientRemainingByCur)],
      ['My Outstanding',     val(p.myRemainingByCur)],
    ] : [
      ['My Total Cost',      val(p.myTotalCostByCur)],
      ['Client Total Cost',  val(p.clientTotalCostByCur)],
      ['Total in Watches',   val(p.totalCostByCur)],
      ['Total Profit',       val(p.totalProfitByCur, 'profit')],
      ['Total Loss',         val(p.totalLossByCur, 'loss')],
      ['My P&L',             val(p.myPnlByCur, 'pl')],
      ['Client P&L',         val(p.clientPnlByCur, 'pl')],
      ['Sale Proceeds',      val(p.totalSaleValueByCur)],
      ['Total Expenses',     val(p.totalExpensesByCur, 'loss')],
      ['Adj. Net P&L',       val(p.adjustedNetPnlByCur, 'pl')],
      ['Client Outstanding', val(p.clientRemainingByCur)],
      ['My Outstanding',     val(p.myRemainingByCur)],
    ];
    const tiles = defs.filter(([, v]) => v);
    if (!tiles.length) return '';
    return `
        <div class="shop-stats-title">${title || 'Summary'} · ${p.hasDiscountWatches && p.hasSplitWatches ? 'Discount + P/L split' : (p.isDiscount || p.hasDiscountWatches) ? 'Discount split' : 'P/L split'}</div>
        <div class="stats">
          ${tiles.map(([l, v]) => `<div class="stat"><div class="stat-l">${l}</div><div class="stat-v">${v}</div></div>`).join('')}
        </div>`;
  };

  const css = `
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; background: #0A0E14; color: #E6EDF7; font-family: 'IBM Plex Sans', -apple-system, 'Segoe UI', sans-serif; }
  a { color: inherit; }
  .toolbar { position: sticky; top: 0; display: flex; justify-content: space-between; align-items: center; gap: 12px;
             background: rgba(12,10,5,0.9); backdrop-filter: blur(6px); padding: 12px 20px; border-bottom: 1px solid rgba(255,255,255,0.08); z-index: 5; }
  .toolbar .t { font-size: 12px; color: #8392A8; }
  .btn { background: #22D3FF; color: #04101F; border: none; border-radius: 9px; padding: 9px 16px; font-size: 13px; font-weight: 700; cursor: pointer; }
  .wrap { max-width: 840px; margin: 0 auto; padding: 30px 34px 60px; }
  .brand { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 8px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 16px; margin-bottom: 22px; }
  .brand .logo { font-family: 'IBM Plex Sans', sans-serif; font-size: 26px; font-weight: 700; color: #22D3FF; letter-spacing: .02em; }
  .brand .tag { font-size: 9px; text-transform: uppercase; letter-spacing: .3em; color: #8392A8; margin-top: 2px; }
  .brand .meta { text-align: right; font-size: 11px; color: #8392A8; line-height: 1.6; }
  .client-name { font-family: 'IBM Plex Sans', sans-serif; font-size: 38px; font-weight: 600; line-height: 1.05; margin: 0 0 4px; }
  .client-id { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 13px; color: #22D3FF; }
  .subtitle { font-size: 12px; color: #8392A8; margin-top: 6px; white-space: pre-line; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 24px 0; }
  .card { background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.08); border-left: 3px solid #22D3FF; border-radius: 12px; padding: 14px 16px; }
  .card-label { font-size: 9.5px; text-transform: uppercase; letter-spacing: .09em; color: #8392A8; font-weight: 600; }
  .card-val { font-family: 'IBM Plex Sans', sans-serif; font-size: 20px; color: #E6EDF7; margin-top: 6px; }
  .section { margin: 26px 0; }
  .section-title { font-size: 10px; text-transform: uppercase; letter-spacing: .2em; color: #22D3FF; font-weight: 700; margin-bottom: 12px; }
  .pos-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
  .pos-item { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; padding: 12px 14px; }
  .pos-label { font-size: 9.5px; text-transform: uppercase; letter-spacing: .08em; color: #8392A8; }
  .pos-val { font-family: 'IBM Plex Sans', sans-serif; font-size: 18px; margin-top: 5px; color: #E6EDF7; }
  .nav { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 20px; }
  .nav a { font-size: 11px; text-decoration: none; color: #AEBBCD; border: 1px solid rgba(255,255,255,0.12); border-radius: 999px; padding: 5px 12px; }
  .pill { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: 9.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; border: 1px solid; white-space: nowrap; }
  .shop { break-inside: avoid; }
  .shop-head { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 4px 12px; border-bottom: 1px solid rgba(34, 211, 255,0.25); padding-bottom: 8px; margin-bottom: 4px; }
  .shop-name { font-family: 'IBM Plex Sans', sans-serif; font-size: 20px; color: #E6EDF7; }
  .shop-sub { font-size: 11px; color: #8392A8; }
  .wcards { display: flex; flex-direction: column; gap: 10px; margin-top: 10px; }
  .wcard { background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; padding: 13px 15px; break-inside: avoid; }
  .wc-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .wc-model { font-weight: 700; font-size: 14px; color: #E6EDF7; }
  .wc-meta { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 10.5px; color: #8392A8; margin-top: 2px; }
  .wc-headright { display: flex; align-items: center; gap: 12px; }
  .wc-income { font-family: 'IBM Plex Sans', sans-serif; font-size: 17px; text-align: right; }
  .wc-income-sub { display: block; font-family: 'IBM Plex Sans', sans-serif; font-size: 9px; color: #8392A8; margin-top: 1px; }
  .kv-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px 14px; margin-top: 12px; padding-top: 11px; border-top: 1px solid rgba(255,255,255,0.06); }
  .kv-grid.finance { margin-top: 10px; }
  .kv-l { font-size: 8.5px; text-transform: uppercase; letter-spacing: .07em; color: #8392A8; font-weight: 600; }
  .kv-v { font-size: 13px; color: #E6EDF7; margin-top: 2px; font-variant-numeric: tabular-nums; }
  .wc-settle { margin-top: 11px; padding-top: 9px; border-top: 1px solid rgba(255,255,255,0.06); font-size: 10.5px; color: #8392A8; }
  .wc-exp { margin-top: 11px; padding-top: 9px; border-top: 1px solid rgba(93,202,165,0.14); }
  .wc-exp-title { font-size: 9px; text-transform: uppercase; letter-spacing: .1em; color: #8CFFD0; font-weight: 700; margin-bottom: 5px; }
  .wc-exp-row { display: flex; justify-content: space-between; gap: 12px; font-size: 11px; color: #AEBBCD; padding: 2px 0; }
  .backlink { margin-top: 9px; text-align: right; font-size: 9.5px; }
  .backlink a, .uplink { color: #8392A8; text-decoration: none; letter-spacing: .04em; }
  .shop-stats-title { font-size: 9px; text-transform: uppercase; letter-spacing: .18em; color: #22D3FF; font-weight: 700; margin: 16px 0 8px; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; break-inside: avoid; }
  .stat { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 9px; padding: 9px 11px; break-inside: avoid; }
  .stat-l { font-size: 8.5px; text-transform: uppercase; letter-spacing: .07em; color: #8392A8; font-weight: 600; }
  .stat-v { font-family: 'IBM Plex Sans', sans-serif; font-size: 15px; color: #E6EDF7; margin-top: 3px; }
  /* Shop report: contents + portfolio/client sections */
  .toc { background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 16px 18px; }
  .toc-group { padding: 10px 0; border-top: 1px solid rgba(255,255,255,0.06); }
  .toc-group:first-of-type { border-top: none; padding-top: 2px; }
  .toc-group-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
  .toc-group-head a { font-family: 'IBM Plex Sans', sans-serif; font-size: 15px; color: #22D3FF; text-decoration: none; }
  .toc-group-head span { font-size: 10.5px; color: #8392A8; }
  .toc-client { display: grid; grid-template-columns: 1fr auto; gap: 2px 12px; padding: 7px 0 7px 14px; border-left: 1px solid rgba(34, 211, 255,0.25); margin: 6px 0 0 4px; }
  .toc-client > a { font-size: 13px; font-weight: 600; color: #E6EDF7; text-decoration: none; }
  .toc-client .tc-right { font-size: 10.5px; color: #8392A8; text-align: right; white-space: nowrap; }
  .toc-watches { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 5px; margin-top: 4px; }
  .toc-watches a { font-size: 10px; color: #AEBBCD; text-decoration: none; border: 1px solid rgba(255,255,255,0.1); border-radius: 999px; padding: 2px 9px; }
  .toc-empty { font-size: 11px; color: #56637A; padding: 4px 0 0 18px; }
  .group-head { display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 6px 14px; margin: 34px 0 6px; padding-bottom: 10px; border-bottom: 2px solid rgba(34, 211, 255,0.35); }
  .group-kind { font-size: 9px; text-transform: uppercase; letter-spacing: .25em; color: #22D3FF; font-weight: 700; }
  .group-name { font-family: 'IBM Plex Sans', sans-serif; font-size: 26px; color: #E6EDF7; margin-top: 2px; }
  .group-sub { font-size: 11px; color: #8392A8; text-align: right; }
  .client-block { margin: 22px 0 30px; }
  .client-head { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 6px 12px; border-bottom: 1px solid rgba(34, 211, 255,0.2); padding-bottom: 8px; }
  .client-head .cn { font-family: 'IBM Plex Sans', sans-serif; font-size: 21px; color: #E6EDF7; }
  .client-head .cid { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 11px; color: #22D3FF; margin-left: 6px; }
  .client-head .cs { font-size: 11px; color: #8392A8; margin-top: 3px; }
  .client-head .ch-right { display: flex; align-items: center; gap: 10px; }
  table.wtbl { width: 100%; border-collapse: collapse; margin-top: 6px; }
  table.wtbl th { text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: .1em; color: #8392A8; font-weight: 600; padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,0.08); }
  table.wtbl td { padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 12.5px; vertical-align: top; }
  table.wtbl th.num, table.wtbl td.num { text-align: right; }
  .model { font-weight: 600; color: #E6EDF7; }
  .sub { font-size: 10px; color: #8392A8; margin-top: 2px; }
  .mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; }
  .gold { color: #22D3FF; font-weight: 600; }
  .dim { color: #56637A; }
  .empty { text-align: center; color: #8392A8; padding: 60px 0; font-size: 14px; }
  .foot { margin-top: 40px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.08); font-size: 10px; color: #56637A; text-align: center; letter-spacing: .04em; }
  @media print {
    .no-print, .no-print-block { display: none !important; }
    html, body { background: #0A0E14 !important; margin: 0 !important; padding: 0 !important; }
    /* Size the content to the EXACT A4 printable width (210mm − 2×14mm page
       margin = 182mm) in physical units, so it can never be wider than the
       page — that overflow is what made the browser scale/zoom and clip the
       right edge. Millimetres avoid px↔dpi ambiguity. */
    .wrap { width: 182mm !important; max-width: 182mm !important; padding: 0 !important; margin: 0 auto !important; }
    .cards { grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); }
    table.wtbl { width: 100%; table-layout: auto; }
    .shop { break-inside: avoid; }
    .card, .pos-item, .stat, .stats, .toc-client { break-inside: avoid; }
    .stats { grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); }
    .group.page { break-before: page; }
    .group-head, .client-head { break-after: avoid; }
  }`;

  // Write the finished report into `win` (opened up-front by the caller so
  // pop-up blockers don't stop it after an await).
  const render = (win, { title, metaLabel, heading, body }) => {
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${css}</style></head>
<body>
  <div class="toolbar no-print">
    <span class="t">Use “Save as PDF” in the print dialog to export or share this report. Links inside the PDF stay clickable.</span>
    <button class="btn" onclick="window.print()">Save as PDF</button>
  </div>
  <div class="wrap" id="top">
    <div class="brand">
      <div>
        <div class="logo">Meridian</div>
        <div class="tag">Elite Horology</div>
      </div>
      <div class="meta">${metaLabel}<br>${today}</div>
    </div>
    ${heading}
    ${body}
    <div class="foot">Confidential · Prepared by Meridian Watch Registry · ${today}</div>
  </div>
  <scr` + `ipt>window.addEventListener('load', function(){ setTimeout(function(){ try { window.print(); } catch(e){} }, 500); });<\/scr` + `ipt>
</body></html>`;
    win.document.open();
    win.document.write(html);
    win.document.close();
  };

  const openWindow = () => {
    const w = window.open('', '_blank');
    if (!w) { alert('Please allow pop-ups to generate the PDF report.'); return null; }
    return w;
  };

  return { today, money, dt, e, curLine, curStack, sumByCur, mergeInto, smoney, kv, col, statusPill, ruleChip, watchCard, statsGrid, render, openWindow };
}

function downloadClientPdf() {
  const client = _currentClientData;
  if (!client) { alert('Open a client first.'); return; }
  const K = pdfReportKit();
  const { money, e, curLine, sumByCur } = K;

  const allMemberships = client.memberships || [];
  const shops = allMemberships.filter(m => (m.watches || []).length > 0);   // skip empty shops
  const allWatches = shops.flatMap(m => m.watches || []);

  const counts = {
    total:     allWatches.length,
    wishlist:  allWatches.filter(w => w.status === 'wishlist').length,
    purchased: allWatches.filter(w => w.status === 'purchased').length,
    sold:      allWatches.filter(w => w.status === 'sold').length,
  };
  const listByCur = sumByCur(allWatches, w => w.list_price || 0);
  const soldByCur = sumByCur(allWatches.filter(w => w.status === 'sold'), w => w.sale_price || 0);

  // Client-side position aggregated across memberships (their money only)
  const agg = { clientTotalCostByCur: {}, clientPnlByCur: {}, clientPaidByCur: {}, clientRemainingByCur: {} };
  for (const m of allMemberships) {
    const p = computePnl(m);
    for (const k of Object.keys(agg)) K.mergeInto(agg[k], p[k]);
  }

  // ── Overview cards (only non-empty) ──
  const cards = [];
  if (counts.total)          cards.push(['Total Watches', String(counts.total)]);
  const partsBits = [];
  if (counts.wishlist)  partsBits.push(`${counts.wishlist} wishlist`);
  if (counts.purchased) partsBits.push(`${counts.purchased} purchased`);
  if (counts.sold)      partsBits.push(`${counts.sold} sold`);
  if (partsBits.length)      cards.push(['Breakdown', partsBits.join(' · ')]);
  if (curLine(listByCur))    cards.push(['Total List Value', K.curStack(listByCur)]);
  if (curLine(soldByCur))    cards.push(['Total Sold Value', K.curStack(soldByCur)]);
  const cardsHtml = cards.map(([label, val]) => `
    <div class="card">
      <div class="card-label">${label}</div>
      <div class="card-val">${val}</div>
    </div>`).join('');

  // ── Your Position (only rows with data; whole block hidden if all empty) ──
  const posRows = [
    ['Your Contribution',   K.curStack(agg.clientTotalCostByCur)],
    ['Your P&L',            K.curStack(agg.clientPnlByCur)],
    ['Paid to You',         K.curStack(agg.clientPaidByCur)],
    ['Outstanding to You',  K.curStack(agg.clientRemainingByCur)],
  ].filter(([, v]) => v);
  const positionHtml = posRows.length ? `
    <div class="section">
      <div class="section-title">Your Position</div>
      <div class="pos-grid">
        ${posRows.map(([l, v]) => `<div class="pos-item"><div class="pos-label">${l}</div><div class="pos-val">${v}</div></div>`).join('')}
      </div>
    </div>` : '';

  // ── Per-shop sections ──
  const shopHtml = shops.map((m, idx) => {
    const ws = m.watches || [];
    const shopListByCur = sumByCur(ws, w => w.list_price || 0);
    const shopSoldByCur = sumByCur(ws.filter(w => w.status === 'sold'), w => w.sale_price || 0);
    const subtotalBits = [`${ws.length} piece${ws.length !== 1 ? 's' : ''}`];
    if (curLine(shopListByCur)) subtotalBits.push(`list ${curLine(shopListByCur)}`);
    if (curLine(shopSoldByCur)) subtotalBits.push(`sold ${curLine(shopSoldByCur)}`);
    return `
      <div class="section shop" id="shop-${idx}">
        <div class="shop-head">
          <div class="shop-name">${e(m.shop_name || 'Shop')}</div>
          <div class="shop-sub">${subtotalBits.join('&nbsp;&nbsp;·&nbsp;&nbsp;')}</div>
        </div>
        <div class="wcards">${ws.map(w => K.watchCard(w, m)).join('')}</div>
        ${K.statsGrid(m)}
      </div>`;
  }).join('');

  // Interactive shop quick-nav (anchors) — only when >1 shop
  const nav = shops.length > 1 ? `
    <div class="nav no-print-block">
      ${shops.map((m, idx) => `<a href="#shop-${idx}">${e(m.shop_name || 'Shop')}</a>`).join('')}
    </div>` : '';

  const body = shops.length === 0
    ? `<div class="empty">No watches on record for this client yet.</div>`
    : `
      ${cardsHtml ? `<div class="cards">${cardsHtml}</div>` : ''}
      ${positionHtml}
      ${nav}
      ${shopHtml}`;

  const win = K.openWindow();
  if (!win) return;
  K.render(win, {
    title: `Meridian — ${e(client.name || 'Client')} Report`,
    metaLabel: 'Client Statement',
    heading: `<h1 class="client-name">${e(client.name || 'Client')}</h1>
              ${client.master_id ? `<div class="client-id">#${e(client.master_id)}</div>` : ''}`,
    body,
  });
}

// ── Shop PDF report ──────────────────────────────────────────────────────
// Every portfolio and client in the shop with all their watches. A linked
// contents page jumps to any portfolio, client or watch; every watch links
// back to its client and every client back to the contents.
async function downloadShopPdf(shopId) {
  const K = pdfReportKit();
  const { money, e, curLine, sumByCur } = K;
  const win = K.openWindow();
  if (!win) return;
  win.document.write('<body style="margin:0;background:#0A0E14;color:#8392A8;font:14px IBM Plex Sans,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh">Preparing shop report…</body>');

  let data;
  try {
    data = await api('GET', `/api/shops/${shopId}/report`);
  } catch (err) {
    win.document.body.textContent = 'Could not build the report: ' + (err.message || 'request failed');
    return;
  }
  const { shop, portfolios = [], profiles = [] } = data;

  // Group clients under their portfolio; direct (no portfolio) clients last.
  const groups = portfolios.map(pt => ({
    anchor: `pf-${pt.id}`, kind: 'Portfolio', name: pt.name,
    profiles: profiles.filter(p => p.portfolio_id === pt.id),
  }));
  const known = new Set(portfolios.map(pt => pt.id));
  const direct = profiles.filter(p => !p.portfolio_id || !known.has(p.portfolio_id));
  if (direct.length) groups.push({ anchor: 'pf-direct', kind: 'Direct', name: 'Individual Clients', profiles: direct });
  const shownGroups = groups.filter(g => g.profiles.length);   // no empty blocks

  const allWatches = profiles.flatMap(p => p.watches || []);
  const byStatus = s => allWatches.filter(w => w.status === s).length;
  const withWatches = p => (p.watches || []).length > 0;

  // ── Overview cards ──
  const cards = [
    ['Clients', String(profiles.length)],
    portfolios.length ? ['Portfolios', String(portfolios.length)] : null,
    allWatches.length ? ['Watches', `${allWatches.length}<div class="sub" style="font-family:Inter,sans-serif">${[
      byStatus('wishlist') ? `${byStatus('wishlist')} wishlist` : '',
      byStatus('purchased') ? `${byStatus('purchased')} open` : '',
      byStatus('sold') ? `${byStatus('sold')} sold` : '',
    ].filter(Boolean).join(' · ')}</div>`] : null,
    K.curStack(sumByCur(allWatches, w => w.list_price || 0)) ? ['Total List Value', K.curStack(sumByCur(allWatches, w => w.list_price || 0))] : null,
    K.curStack(sumByCur(allWatches.filter(w => w.status === 'sold'), w => w.sale_price || 0)) ? ['Total Sold Value', K.curStack(sumByCur(allWatches.filter(w => w.status === 'sold'), w => w.sale_price || 0))] : null,
  ].filter(Boolean);
  const cardsHtml = `<div class="cards">${cards.map(([l, v]) => `<div class="card"><div class="card-label">${l}</div><div class="card-val">${v}</div></div>`).join('')}</div>`;

  // ── Shop position: every client's figures added up ──
  const agg = { myTotalCostByCur: {}, clientTotalCostByCur: {}, myPnlByCur: {}, clientPnlByCur: {},
                clientRemainingByCur: {}, myRemainingByCur: {}, totalExpensesByCur: {} };
  let owedToMe = 0, discount = 0, hasDiscount = false;
  for (const p of profiles) {
    const pnl = computePnl(p);
    for (const k of Object.keys(agg)) K.mergeInto(agg[k], pnl[k]);
    if (pnl.isDiscount || pnl.hasDiscountWatches) { hasDiscount = true; owedToMe += pnl.lossOutstanding || 0; discount += pnl.discountIncome || 0; }
  }
  const shopCur = dominantCurrency(allWatches);
  const tone = (map) => { const t = Object.values(map).reduce((a, b) => a + b, 0); return t > 0 ? '#2CFFA8' : t < 0 ? '#FF4D6D' : '#E6EDF7'; };
  const posRows = [
    ['My Capital',             K.curStack(agg.myTotalCostByCur)],
    ['Client Capital',         K.curStack(agg.clientTotalCostByCur)],
    ['My P&L',                 K.curStack(agg.myPnlByCur) && `<span style="color:${tone(agg.myPnlByCur)}">${K.curStack(agg.myPnlByCur)}</span>`],
    ['Clients’ P&L',      K.curStack(agg.clientPnlByCur) && `<span style="color:${tone(agg.clientPnlByCur)}">${K.curStack(agg.clientPnlByCur)}</span>`],
    hasDiscount && Math.round(discount) ? ['Discount Earned', `<span style="color:#22D3FF">${money(discount, shopCur)}</span>`] : null,
    hasDiscount && Math.round(owedToMe) ? ['Losses Owed to Me', `<span style="color:#FF4D6D">${money(owedToMe, shopCur)}</span>`] : null,
    ['Still to Pay Clients',   K.curStack(agg.clientRemainingByCur)],
    ['Still to Take Myself',   K.curStack(agg.myRemainingByCur)],
    ['Expenses',               K.curStack(agg.totalExpensesByCur)],
  ].filter(r => r && r[1]);
  const positionHtml = posRows.length ? `
    <div class="section">
      <div class="section-title">Shop Position</div>
      <div class="pos-grid">
        ${posRows.map(([l, v]) => `<div class="pos-item"><div class="pos-label">${l}</div><div class="pos-val">${v}</div></div>`).join('')}
      </div>
    </div>` : '';

  const clientSubline = (p) => {
    const ws = p.watches || [];
    const bits = [`${ws.length} piece${ws.length !== 1 ? 's' : ''}`];
    const list = curLine(sumByCur(ws, w => w.list_price || 0));
    const sold = curLine(sumByCur(ws.filter(w => w.status === 'sold'), w => w.sale_price || 0));
    if (list) bits.push(`list ${list}`);
    if (sold) bits.push(`sold ${sold}`);
    return bits.join('&nbsp;&nbsp;·&nbsp;&nbsp;');
  };

  // ── Linked contents ──
  const tocHtml = shownGroups.length ? `
    <div class="section">
      <div class="section-title">Contents</div>
      <div class="toc">
        ${shownGroups.map(g => {
          const pieces = g.profiles.reduce((s, p) => s + (p.watches || []).length, 0);
          return `
          <div class="toc-group">
            <div class="toc-group-head">
              ${g.profiles.some(withWatches) ? `<a href="#${g.anchor}">${e(g.name)}</a>` : `<span style="font-family:'IBM Plex Sans', sans-serif;font-size:15px;color:#22D3FF">${e(g.name)}</span>`}
              <span>${g.kind === 'Portfolio' ? 'Portfolio · ' : ''}${g.profiles.length} client${g.profiles.length !== 1 ? 's' : ''} · ${pieces} piece${pieces !== 1 ? 's' : ''}</span>
            </div>
            ${g.profiles.map(p => withWatches(p) ? `
              <div class="toc-client">
                <a href="#c-${p.id}">${e(p.name)}${p.client_master_id ? ` <span class="mono" style="color:#22D3FF;font-size:10.5px;font-weight:400">#${e(p.client_master_id)}</span>` : ''}</a>
                <div class="tc-right">${clientSubline(p)}</div>
                <div class="toc-watches">
                  ${(p.watches || []).map(w => `<a href="#w-${w.id}">${e(w.model)}${w.stock_number ? ' · ' + e(w.stock_number) : ''}</a>`).join('')}
                </div>
              </div>` : `
              <div class="toc-empty">${e(p.name)} — no watches yet</div>`).join('')}
          </div>`;
        }).join('')}
      </div>
    </div>` : '';

  // ── Portfolio → client → watch sections ──
  let first = true;
  const sectionsHtml = shownGroups.map(g => {
    const clients = g.profiles.filter(withWatches);
    if (!clients.length) return '';
    const pieces = clients.reduce((s, p) => s + p.watches.length, 0);
    const groupList = curLine(sumByCur(clients.flatMap(p => p.watches), w => w.list_price || 0));
    const html = `
      <div class="group ${first ? '' : 'page'}" id="${g.anchor}">
        <div class="group-head">
          <div>
            <div class="group-kind">${g.kind === 'Portfolio' ? 'Portfolio' : 'Direct clients'}</div>
            <div class="group-name">${e(g.name)}</div>
          </div>
          <div class="group-sub">${clients.length} client${clients.length !== 1 ? 's' : ''} · ${pieces} piece${pieces !== 1 ? 's' : ''}${groupList ? `<br>list ${groupList}` : ''}<br><a class="uplink" href="#contents">↑ Contents</a></div>
        </div>
        ${clients.map(p => `
          <div class="client-block" id="c-${p.id}">
            <div class="client-head">
              <div>
                <div><span class="cn">${e(p.name)}</span>${p.client_master_id ? `<span class="cid">#${e(p.client_master_id)}</span>` : ''}</div>
                <div class="cs">${clientSubline(p)}</div>
              </div>
              <div class="ch-right">${K.ruleChip(p)}<a class="uplink" href="#contents" style="font-size:10px">↑ Contents</a></div>
            </div>
            <div class="wcards">${p.watches.map(w => K.watchCard(w, p, { id: `w-${w.id}`, showRef: false, back: [`#c-${p.id}`, e(p.name)] })).join('')}</div>
            ${K.statsGrid(p, `${e(p.name)} summary`)}
          </div>`).join('')}
      </div>`;
    first = false;
    return html;
  }).join('');

  const body = allWatches.length === 0
    ? `${cardsHtml}<div class="empty">No watches on record in this shop yet.</div>`
    : `${cardsHtml}${positionHtml}<div id="contents">${tocHtml}</div>${sectionsHtml}`;

  K.render(win, {
    title: `Meridian — ${e(shop.name)} Shop Report`,
    metaLabel: 'Shop Statement',
    heading: `<h1 class="client-name">${e(shop.name)}</h1>
              ${shop.address ? `<div class="subtitle">${e(shop.address)}</div>` : ''}`,
    body,
  });
}

async function openClientDetail(id) {
  currentClientId = id;
  showPage('client-detail');
  document.getElementById('clientDetailHeader').innerHTML = `<div class="animate-pulse h-20 bg-surface-container rounded-lg"></div>`;

  const client = await api('GET', `/api/clients/${id}`);
  _currentClientData = client;   // stashed so the Excel report handler can read it
  const totalWatches = client.memberships.reduce((s, m) => s + m.watches.length, 0);

  document.getElementById('clientDetailHeader').innerHTML = `
    <div class="flex items-start justify-between gap-6 flex-wrap">
      <div class="flex items-start gap-5">
        ${avatarHtml(client.name, client.photo_path, 'lg')}
        <div>
          <div class="flex items-center gap-3 mb-1">
            <p class="text-[11px] uppercase tracking-[0.06em] text-primary font-semibold">Master Identity</p>
            ${client.master_id ? `<span class="font-mono text-xs text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-md">#${esc(client.master_id)}</span>` : ''}
          </div>
          <h2 class="font-playfair text-3xl font-semibold text-on-surface leading-tight">${esc(client.name)}</h2>
          <div class="flex items-center gap-6 mt-3 pt-3 border-t border-outline-variant/15">
            <div class="flex items-center gap-1.5 text-on-surface-variant text-sm">
              <span class="material-symbols-outlined text-[16px] text-primary">store</span>
              ${client.memberships.length} shop presence${client.memberships.length !== 1 ? 's' : ''}
            </div>
            <div class="flex items-center gap-1.5 text-on-surface-variant text-sm">
              <span class="material-symbols-outlined text-[16px] text-primary">watch</span>
              ${totalWatches} total watch${totalWatches !== 1 ? 'es' : ''}
            </div>
          </div>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button onclick="downloadClientPdf()" class="text-[11px] font-semibold uppercase tracking-wider text-primary bg-primary/10 px-4 py-2 border border-primary/40 rounded-lg hover:bg-primary/20 transition-all flex items-center gap-1.5">
          <span class="material-symbols-outlined text-[14px]">picture_as_pdf</span> PDF Report
        </button>
        <button onclick="downloadClientReport()" class="text-[11px] font-semibold uppercase tracking-wider text-emerald-400 px-4 py-2 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/10 transition-all flex items-center gap-1.5">
          <span class="material-symbols-outlined text-[14px]">table_view</span> Excel Report
        </button>
        <button id="clientShareBtn-${id}" onclick="generateClientShareLink(${id})" class="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant px-4 py-2 border border-outline-variant/30 rounded-lg hover:text-primary hover:border-primary/30 transition-all flex items-center gap-1.5">
          <span class="material-symbols-outlined text-[14px]">link</span> Share Link
        </button>
        <button onclick="openEditClient(${id})" class="text-[11px] font-semibold uppercase tracking-wider text-primary px-4 py-2 border border-primary/30 rounded-lg hover:bg-primary/10 transition-all flex items-center gap-1.5">
          <span class="material-symbols-outlined text-[14px]">edit</span> Edit Identity
        </button>
        <button onclick="confirmDeleteClient(${id},'${esc(client.name).replace(/'/g,"\\'")}')" class="text-[11px] font-semibold uppercase tracking-wider text-error px-4 py-2 border border-error/20 rounded-lg hover:bg-error/10 transition-all">Delete Client</button>
      </div>
    </div>
  `;

  document.getElementById('clientMasterSummary').innerHTML = client.memberships.length
    ? renderClientMasterSummary(client)
    : '';

  document.getElementById('clientMemberships').innerHTML = client.memberships.length
    ? client.memberships.map(m => renderMembershipCard(client, m, client.master_id)).join('')
    : `<div class="glass-surface rounded-lg p-10 text-center text-on-surface-variant text-sm border border-dashed border-outline-variant/20">
         No shop memberships yet.
       </div>`;
}

// Pick the most common currency across a set of watches (falls back to CHF)
function dominantCurrency(watches) {
  const counts = {};
  for (const w of watches || []) {
    const c = w.currency || 'CHF';
    counts[c] = (counts[c] || 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] || 'CHF';
}
