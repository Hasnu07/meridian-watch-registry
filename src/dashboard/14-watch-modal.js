// 14-watch-modal.js — Watch modal, delete confirm
// Part of the dashboard script: scripts/build.js concatenates src/dashboard/*.js
// in filename order into public/js/dashboard.js (one classic script, so
// functions and top-level variables stay shared exactly as before).

// ── Watch modal ────────────────────────────────────────────────────────────
function resetWatchImgPreview(src) {
  const el = document.getElementById('watchImgPreview');
  if (src) {
    el.innerHTML = `<img src="${src}" class="w-full h-full object-cover">`;
  } else {
    el.innerHTML = `<span class="material-symbols-outlined text-outline text-2xl">watch</span>`;
  }
}

// ── Watch status toggle ────────────────────────────────────────
function setWatchStatus(status) {
  document.getElementById('wStatus').value = status;
  // Use classList instead of reassigning className so the 'hidden' class
  // that openAddWatch/openEditWatch puts on the Sold button is preserved.
  const ACTIVE   = ['bg-primary/15','border-primary/40','text-primary'];
  const INACTIVE = ['border-outline-variant/30','text-on-surface-variant','hover:bg-surface-variant/30'];
  ['wishlist','purchased','sold'].forEach(s => {
    const idMap = {wishlist:'wStatusWishlistBtn',purchased:'wStatusPurchasedBtn',sold:'wStatusSoldBtn'};
    const btn = document.getElementById(idMap[s]);
    if (!btn) return;
    btn.classList.remove(...ACTIVE, ...INACTIVE);
    btn.classList.add(...(s === status ? ACTIVE : INACTIVE));
  });
  document.getElementById('wSalePriceWrap').classList.toggle('hidden', status !== 'sold');
  document.getElementById('wCostWrap').classList.toggle('hidden', status === 'wishlist');
  const cur = document.getElementById('wCurrency')?.value || 'CHF';
  const curLabel = document.getElementById('wCurrencyLabel');
  if (curLabel) curLabel.textContent = cur;
  const costMe     = document.getElementById('wCostCurrencyMe');
  const costClient = document.getElementById('wCostCurrencyClient');
  if (costMe)     costMe.textContent     = `(${cur})`;
  if (costClient) costClient.textContent = `(${cur})`;
  // Capital Contributions = what each party paid upfront. Always.
  // Sale proceeds (my_received / client_received) live on the Mark-Sold modal.
  const sectionTitle = document.getElementById('wCostSectionTitle');
  const labelMe      = document.getElementById('wCostLabelMe');
  const labelClient  = document.getElementById('wCostLabelClient');
  if (sectionTitle) sectionTitle.textContent = 'Capital Contributions';
  if (labelMe)      labelMe.textContent      = 'I Paid';
  if (labelClient)  labelClient.textContent  = 'Client Paid';
  const dateLabels = { wishlist: 'Wishlist Date', purchased: 'Purchase Date', sold: 'Sold Date' };
  const wDateLabel = document.getElementById('wDateLabel');
  if (wDateLabel) wDateLabel.textContent = dateLabels[status] || 'Date';
}

// ── Watch "from system" search ─────────────────────────────────────────────
let _watchSearchTimer = null;
document.getElementById('wSystemSearch').addEventListener('input', function() {
  clearTimeout(_watchSearchTimer);
  const q = this.value.trim();
  const res = document.getElementById('wSystemResults');
  if (!q) { res.classList.add('hidden'); return; }
  _watchSearchTimer = setTimeout(async () => {
    const watches = await api('GET', `/api/watches?q=${encodeURIComponent(q)}`);
    if (!watches.length) { res.innerHTML = '<p class="px-4 py-3 text-xs text-outline">No matches found.</p>'; res.classList.remove('hidden'); return; }
    res.innerHTML = watches.slice(0,8).map(w => `
      <button type="button" onclick="prefillWatchFromSystem(${JSON.stringify(w).replace(/"/g,'&quot;')})"
              class="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 text-left transition-colors border-b border-outline-variant/10 last:border-0">
        ${w.image_path ? `<img src="${w.image_path}" class="w-8 h-8 rounded object-cover flex-shrink-0">` : `<div class="w-8 h-8 rounded bg-surface-variant flex items-center justify-center flex-shrink-0"><span class="material-symbols-outlined text-outline text-[14px]">watch</span></div>`}
        <div class="flex-1 min-w-0">
          <p class="text-on-surface text-xs font-medium truncate">${esc(w.model)}</p>
          <p class="text-outline text-[11px] font-mono">${[w.stock_number ? 'Stock ' + w.stock_number : '', w.serial_number, w.reference_number].filter(Boolean).map(esc).join(' · ') || '—'}</p>
        </div>
        ${w.list_price ? `<span class="text-primary text-xs font-semibold flex-shrink-0">${fmt.money(w.list_price)}</span>` : ''}
      </button>`).join('');
    res.classList.remove('hidden');
  }, 250);
});

function prefillWatchFromSystem(w) {
  document.getElementById('wModel').value    = w.model        || '';
  document.getElementById('wStock').value    = w.stock_number || '';
  document.getElementById('wSerial').value   = w.serial_number|| '';
  document.getElementById('wRef').value      = w.reference_number || '';
  const pfCur = document.getElementById('wCurrency');
  if (pfCur && w.currency) pfCur.value = w.currency;
  const pfLbl = document.getElementById('wCurrencyLabel');
  if (pfLbl) pfLbl.textContent = (pfCur && pfCur.value) || 'CHF';
  setMoneyValue('wListPrice', w.list_price);
  document.getElementById('wSystemSearch').value = '';
  document.getElementById('wSystemResults').classList.add('hidden');
}

async function openAddWatch(profileId) {
  ['watchId','wModel','wStock','wSerial','wDate','wRef','wNotes','wListPrice','wSalePrice','wMyCost','wClientCost','wSystemSearch'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const curSel = document.getElementById('wCurrency');
  if (curSel) curSel.value = 'CHF';
  const curLbl = document.getElementById('wCurrencyLabel');
  if (curLbl) curLbl.textContent = 'CHF';
  document.getElementById('watchProfileId').value = profileId || '';
  document.getElementById('wImage').value  = '';
  document.getElementById('watchImgChosen').classList.add('hidden');
  document.getElementById('wSystemResults').classList.add('hidden');
  resetWatchImgPreview(null);
  // Add Watch: hide the Sold status button — sold is reached via Mark-Sold flow only
  document.getElementById('wStatusSoldBtn').classList.add('hidden');
  document.getElementById('wStatusHint').classList.remove('hidden');
  setWatchStatus('wishlist');
  _editWatchRuleCtx = null;
  document.getElementById('wRuleWrap').classList.add('hidden');
  document.getElementById('wRule').value = '';
  document.getElementById('watchModalTitle').textContent = 'Add Watch';
  document.getElementById('watchFormError').classList.add('hidden');

  // Show profile picker when opened without a profile context
  const profileWrap = document.getElementById('wProfileWrap');
  const profileSel  = document.getElementById('wProfileSelect');
  if (!profileId) {
    profileWrap.classList.remove('hidden');
    profileSel.innerHTML = '<option value="">Select client…</option>';
    try {
      const profs = await api('GET', '/api/profiles');
      profs.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        profileSel.appendChild(opt);
      });
    } catch (e) { /* silently ignore */ }
  } else {
    profileWrap.classList.add('hidden');
  }

  document.getElementById('watchModal').classList.remove('hidden');
}

// Edit Watch · rule picker. '' = follow the client's rule.
let _editWatchRuleCtx = null;   // { watch, profile }
function setEditWatchRule(rule) {
  document.getElementById('wRule').value = rule;
  const off = 'border-outline-variant/30 text-on-surface-variant hover:bg-surface-variant/30';
  const sel = {
    '':         'bg-primary/15 border-primary/40 text-primary',
    'discount': 'bg-amber-400/10 border-amber-400/40 text-amber-400',
    'split':    'bg-purple-500/10 border-purple-400/40 text-purple-300',
  };
  const base = 'flex-1 py-2.5 px-2 rounded-lg text-[11px] font-semibold uppercase tracking-wider border transition-all ';
  document.getElementById('wRuleDefaultBtn').className = base + (rule === ''         ? sel[''] : off);
  document.getElementById('wRuleDiscBtn').className    = base + (rule === 'discount' ? sel.discount : off);
  document.getElementById('wRuleSplitBtn').className   = base + (rule === 'split'    ? sel.split : off);

  const ctx = _editWatchRuleCtx;
  if (!ctx) return;
  const w = ctx.watch, pr = ctx.profile || {};
  const clientRule = pr.trading_rule || 'split';
  const eff  = rule || clientRule;
  const was  = w.rule_applied || clientRule;
  const name = r => r === 'discount' ? 'Discount Split' : 'P/L Split';
  let hint;
  if (w.status !== 'sold') {
    hint = `Mark Sold will start on ${name(eff)}${rule ? '' : ' (the client’s rule)'} — you can still change it there.`;
  } else if (eff === was) {
    hint = `This sale is settled under ${name(eff)}. To change the market price, discount or offset, use Edit ${w.market_price != null ? 'Handover' : 'Sale'} on the watch page.`;
  } else if (eff === 'split') {
    hint = w.market_price != null
      ? `Switching to P/L Split: the client price − list will be split ${pr.profit_split_me ?? 100}/${100 - (pr.profit_split_me ?? 100)}; the discount vs market stays mine.${(w.offset_amount || 0) > 0 ? ' Its Panel B offsets will be undone.' : ''}`
      : `Switching to P/L Split: sale − list will be split ${pr.profit_split_me ?? 100}/${100 - (pr.profit_split_me ?? 100)} (losses ${pr.loss_split_me ?? 100}/${100 - (pr.loss_split_me ?? 100)}).`;
  } else {
    hint = w.market_price != null
      ? `Switching to Discount Split: the discount vs market is my income and the client keeps client price − list.`
      : (w.list_price != null && w.sale_price != null && w.sale_price < w.list_price
          ? `Switching to Discount Split: the loss becomes 100% the client’s — proceeds repay my contribution first (Panel B).`
          : `Switching to Discount Split: without a market price this sale earns no discount. Use Edit Sale → Handover to me to enter one.`);
  }
  document.getElementById('wRuleHint').textContent = hint;
}

async function openEditWatch(id) {
  // Always pull the authoritative current record from the server so the form
  // reflects the latest DB state. Relying on watchCache/allWatches could load a
  // stale snapshot (e.g. after a Mark-Sold, payout, or edit made elsewhere),
  // and saving would then overwrite newer data with the stale form values —
  // which looked like "the previous data disappeared".
  let wt = null;
  try { wt = await api('GET', `/api/watches/${id}`); } catch {}
  if (!wt) wt = watchCache[id] || allWatches.find(x => x.id === id);   // offline/error fallback
  if (!wt) { alert('Could not load this watch — please refresh and try again.'); return; }
  // Refresh the cache with fresh data (keep any split fields already cached)
  watchCache[wt.id] = { ...(watchCache[wt.id] || {}), ...wt };
  document.getElementById('watchId').value        = wt.id;
  document.getElementById('watchProfileId').value = wt.profile_id;
  document.getElementById('wModel').value     = wt.model;
  document.getElementById('wStock').value     = wt.stock_number     || '';
  document.getElementById('wSerial').value    = wt.serial_number    || '';
  document.getElementById('wDate').value      = wt.purchase_date    || '';
  setMoneyValue('wListPrice',  wt.list_price);
  setMoneyValue('wSalePrice',  wt.sale_price);
  setMoneyValue('wMyCost',     wt.my_cost);
  setMoneyValue('wClientCost', wt.client_cost);
  document.getElementById('wRef').value        = wt.reference_number || '';
  document.getElementById('wNotes').value      = wt.notes            || '';
  const ewCur = document.getElementById('wCurrency');
  if (ewCur) ewCur.value = wt.currency || 'CHF';
  const ewCurLbl = document.getElementById('wCurrencyLabel');
  if (ewCurLbl) ewCurLbl.textContent = wt.currency || 'CHF';
  const costMe     = document.getElementById('wCostCurrencyMe');
  const costClient = document.getElementById('wCostCurrencyClient');
  const cur = wt.currency || 'CHF';
  if (costMe)     costMe.textContent     = `(${cur})`;
  if (costClient) costClient.textContent = `(${cur})`;
  document.getElementById('wImage').value     = '';
  document.getElementById('watchImgChosen').classList.add('hidden');
  document.getElementById('wSystemResults').classList.add('hidden');
  resetWatchImgPreview(wt.image_path || null);
  // Edit Watch: reveal the Sold status button ONLY when the watch is already sold
  // (so user can stay on Sold or toggle off). Hidden for wishlist/purchased edits.
  if (wt.status === 'sold') {
    document.getElementById('wStatusSoldBtn').classList.remove('hidden');
    document.getElementById('wStatusHint').classList.add('hidden');
  } else {
    document.getElementById('wStatusSoldBtn').classList.add('hidden');
    document.getElementById('wStatusHint').classList.remove('hidden');
  }
  setWatchStatus(wt.status || 'wishlist');
  // Rule picker: needs the client's terms (GET /api/watches/:id includes the profile)
  const pr = wt.profile || null;
  _editWatchRuleCtx = { watch: wt, profile: pr };
  if (pr) {
    const clientRule = pr.trading_rule || 'split';
    document.getElementById('wRuleDefaultSub').textContent = clientRule === 'discount' ? 'Discount Split' : 'P/L Split';
    document.getElementById('wRuleDiscSub').textContent    = `${((wt.discount_rate_applied ?? pr.discount_split ?? 0.08) * 100).toFixed(2)}% of market`;
    document.getElementById('wRuleSplitSub').textContent   = `profit ${pr.profit_split_me ?? 100}/${100 - (pr.profit_split_me ?? 100)}`;
    document.getElementById('wRuleWrap').classList.remove('hidden');
    // An explicit choice equal to the client's rule shows as that rule, not "default"
    setEditWatchRule(wt.rule_applied || '');
  } else {
    document.getElementById('wRuleWrap').classList.add('hidden');
  }
  document.getElementById('watchModalTitle').textContent = 'Edit Watch';
  document.getElementById('watchFormError').classList.add('hidden');
  document.getElementById('watchModal').classList.remove('hidden');
}

// Live preview for watch image
document.getElementById('wImage').addEventListener('change', e => {
  const file = e.target.files[0];
  const ic   = document.getElementById('watchImgChosen');
  if (file) {
    ic.textContent = '✓ ' + file.name; ic.classList.remove('hidden');
    const reader = new FileReader();
    reader.onload = ev => resetWatchImgPreview(ev.target.result);
    reader.readAsDataURL(file);
  } else { ic.classList.add('hidden'); resetWatchImgPreview(null); }
});

function closeWatchModal() { document.getElementById('watchModal').classList.add('hidden'); }
document.getElementById('closeWatchModal').addEventListener('click', closeWatchModal);
document.getElementById('cancelWatchModal').addEventListener('click', closeWatchModal);

document.getElementById('wCurrency')?.addEventListener('change', function() {
  const lbl = document.getElementById('wCurrencyLabel');
  if (lbl) lbl.textContent = this.value;
  const costMe     = document.getElementById('wCostCurrencyMe');
  const costClient = document.getElementById('wCostCurrencyClient');
  if (costMe)     costMe.textContent     = `(${this.value})`;
  if (costClient) costClient.textContent = `(${this.value})`;
});

document.getElementById('saveWatchBtn').addEventListener('click', async () => {
  const id        = document.getElementById('watchId').value;
  const profileId = document.getElementById('watchProfileId').value
                  || document.getElementById('wProfileSelect').value;
  const errEl     = document.getElementById('watchFormError');
  errEl.classList.add('hidden');

  const model = document.getElementById('wModel').value.trim();
  if (!model)  { errEl.textContent = 'Model is required';  errEl.classList.remove('hidden'); return; }

  const fd = new FormData();
  fd.append('model',            model);
  fd.append('source',           'Company');
  fd.append('status',           document.getElementById('wStatus').value);
  fd.append('stock_number',     document.getElementById('wStock').value.trim());
  fd.append('serial_number',    document.getElementById('wSerial').value.trim());
  fd.append('purchase_date',    document.getElementById('wDate').value);
  fd.append('list_price',       readMoneyInput('wListPrice'));
  fd.append('sale_price',       readMoneyInput('wSalePrice'));
  fd.append('my_cost',          readMoneyInput('wMyCost'));
  fd.append('client_cost',      readMoneyInput('wClientCost'));
  fd.append('reference_number', document.getElementById('wRef').value.trim());
  fd.append('currency', document.getElementById('wCurrency')?.value || 'CHF');
  fd.append('notes',            document.getElementById('wNotes').value.trim());
  const imgFile = document.getElementById('wImage').files[0];
  if (imgFile) fd.append('image', imgFile);
  if (id && !document.getElementById('wRuleWrap').classList.contains('hidden')) {
    fd.append('rule_applied', document.getElementById('wRule').value);
  }

  try {
    if (id) {
      await api('PUT', `/api/watches/${id}`, fd);
    } else {
      if (!profileId) { errEl.textContent = 'No client selected'; errEl.classList.remove('hidden'); return; }
      await api('POST', `/api/profiles/${profileId}/watches`, fd);
    }
    closeWatchModal();
    if (currentPage === 'profile-detail')   openProfileDetail(currentProfileId);
    else if (currentPage === 'client-detail')   openClientDetail(currentClientId);
    else if (currentPage === 'portfolio-detail') openPortfolioDetail(currentPortfolioId);
    else if (currentPage === 'shop-detail')      openShopDetail(currentShopId);
    else if (currentPage === 'watches')   loadWatches(document.getElementById('watchSearch').value, '');
    else if (currentPage === 'dashboard') loadDashboard();
  } catch (e) { errEl.textContent = e.message; errEl.classList.remove('hidden'); }
});

// ── Delete confirm ─────────────────────────────────────────────────────────
let pendingDelete = null;

function showConfirm(msg, onOk) {
  document.getElementById('confirmMsg').textContent = msg;
  document.getElementById('confirmModal').classList.remove('hidden');
  pendingDelete = onOk;
}
function closeConfirm() {
  document.getElementById('confirmModal').classList.add('hidden');
  pendingDelete = null;
}

document.getElementById('closeConfirm').addEventListener('click', closeConfirm);
document.getElementById('cancelConfirm').addEventListener('click', closeConfirm);
document.getElementById('okConfirm').addEventListener('click', async () => {
  const btn = document.getElementById('okConfirm');
  btn.disabled = true;
  try {
    if (pendingDelete) await pendingDelete();
    closeConfirm();
  } catch (e) {
    // Never fail silently — a swallowed error looked like "the delete didn't stick"
    alert(e.message || 'Delete failed — please try again.');
  } finally {
    btn.disabled = false;
  }
});

function confirmDeleteProfile(id, name, goBack) {
  showConfirm(`Delete this membership and all its watches? This cannot be undone.`, async () => {
    await api('DELETE', `/api/profiles/${id}`);
    if (goBack) {
      if (currentClientId) openClientDetail(currentClientId);
      else showPage('profiles');
    }
    if (currentPage === 'profiles')      loadClients();
    if (currentPage === 'dashboard')     loadDashboard();
    if (currentPage === 'client-detail') openClientDetail(currentClientId);
  });
}
function confirmDeleteWatch(id, model) {
  showConfirm(`Delete watch "${model}"? This cannot be undone.`, async () => {
    await api('DELETE', `/api/watches/${id}`);
    delete watchCache[id];
    allWatches = allWatches.filter(w => w.id !== id);
    // Deleted from its own page: go back to where it was opened from
    if (currentPage === 'watch-detail') { document.getElementById('backFromWatchDetail').click(); return; }
    if (currentPage === 'profile-detail')    openProfileDetail(currentProfileId);
    else if (currentPage === 'client-detail')    openClientDetail(currentClientId);
    else if (currentPage === 'portfolio-detail') openPortfolioDetail(currentPortfolioId);
    else if (currentPage === 'shop-detail')      openShopDetail(currentShopId);
    else if (currentPage === 'watches')   loadWatches(document.getElementById('watchSearch').value, '');
    else if (currentPage === 'dashboard') loadDashboard();
  });
}
