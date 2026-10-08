// 13-profile-modal.js — Profile modal, trading rule, client picker
// Part of the dashboard script: scripts/build.js concatenates src/dashboard/*.js
// in filename order into public/js/dashboard.js (one classic script, so
// functions and top-level variables stay shared exactly as before).

// ── Profile modal ──────────────────────────────────────────────────────────

function resetPhotoPreview(src) {
  const el = document.getElementById('photoPreview');
  if (src) {
    el.innerHTML = `<img src="${src}" class="w-full h-full object-cover">`;
  } else {
    el.innerHTML = `<span class="material-symbols-outlined text-outline text-2xl">person</span>`;
  }
}

const REG_FIELDS = ['pTitle','pFirstName','pLastName','pGender','pDob','pPostalCode','pCity','pCountry'];

function clearRegFields() {
  REG_FIELDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

async function populateShopDropdown(selectedShopId, selectedPortfolioId) {
  const shops = await api('GET', '/api/shops');
  const shopSel = document.getElementById('pShopId');
  shopSel.innerHTML = '<option value="">— No shop assigned —</option>' +
    shops.map(s => `<option value="${s.id}"${s.id == selectedShopId ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
  await populatePortfolioDropdown(selectedShopId, selectedPortfolioId);
}

async function populatePortfolioDropdown(shopId, selectedPortfolioId) {
  const sel = document.getElementById('pPortfolioId');
  if (!shopId) {
    sel.innerHTML = '<option value="">— Individual Client —</option>';
    return;
  }
  const portfolios = await api('GET', `/api/portfolios?shop_id=${shopId}`);
  sel.innerHTML = '<option value="">— Individual Client —</option>' +
    portfolios.map(pt => `<option value="${pt.id}"${pt.id == selectedPortfolioId ? ' selected' : ''}>${esc(pt.name)}</option>`).join('');
}

document.getElementById('pShopId').addEventListener('change', function() {
  populatePortfolioDropdown(this.value, null);
});

function setProfileModalClientMode(clientId, clientData) {
  const hasClient = !!clientId;
  document.getElementById('pClientId').value = clientId || '';
  document.getElementById('selectedClientIdentity').classList.toggle('hidden', !hasClient);
  document.getElementById('clientResolutionWrap').classList.toggle('hidden', hasClient);
  document.getElementById('nameFieldWrap').classList.toggle('hidden', hasClient);
  document.getElementById('photoUploadWrap').classList.toggle('hidden', hasClient);
  if (!hasClient) {
    document.getElementById('pMasterIdLookup').value = '';
    document.getElementById('masterIdStatus').classList.add('hidden');
  }
  if (hasClient && clientData) {
    const av = document.getElementById('selectedClientAvatar');
    av.innerHTML = clientData.photo_path
      ? `<img src="${clientData.photo_path}" class="w-full h-full object-cover">`
      : `<span class="text-sm font-semibold">${esc(fmt.initials(clientData.name))}</span>`;
    document.getElementById('selectedClientName').textContent = clientData.name;
    document.getElementById('selectedClientMasterId').textContent = clientData.master_id ? '#' + clientData.master_id : '';
  }
}

function openAddProfile(presetShopId, presetPortfolioId, presetClientId, presetClientData) {
  ['profileId','pName','pEmail','pAddress','pPpUrn','pMyCapital','pMyRemaining','pClientCapital','pClientRemaining'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('pProfitSplitMe').value = 100;
  document.getElementById('pLossSplitMe').value   = 100;
  updateSplitBars();
  setProfileTradingRule('split');
  document.getElementById('pDiscountSplit').value = 8;
  updateDiscountBar();
  clearRegFields();
  document.getElementById('pPhoto').value            = '';
  document.getElementById('pIdCard').value           = '';
  document.getElementById('currentIdCard').innerHTML = '';
  document.getElementById('fileChosen').classList.add('hidden');
  document.getElementById('photoChosen').classList.add('hidden');
  resetPhotoPreview(null);
  document.getElementById('profileModalTitle').textContent = presetClientId ? 'Add Shop Membership' : 'Add Client';
  document.getElementById('profileFormError').classList.add('hidden');
  setProfileModalClientMode(presetClientId, presetClientData);
  populateShopDropdown(presetShopId || null, presetPortfolioId || null);
  document.getElementById('profileModal').classList.remove('hidden');
}

async function openEditProfile(id) {
  const p = await api('GET', `/api/profiles/${id}`);
  document.getElementById('profileId').value         = p.id;
  document.getElementById('pEmail').value            = p.email;
  document.getElementById('pAddress').value          = p.address || '';
  document.getElementById('pPpUrn').value            = p.pp_urn || '';
  document.getElementById('pProfitSplitMe').value    = p.profit_split_me  ?? 100;
  document.getElementById('pLossSplitMe').value      = p.loss_split_me    ?? 100;
  const tradingRule = p.trading_rule || 'split';
  setProfileTradingRule(tradingRule);
  document.getElementById('pDiscountSplit').value = p.discount_split != null ? (p.discount_split * 100) : 8;
  updateDiscountBar();
  setMoneyValue('pMyCapital',       p.my_capital);
  setMoneyValue('pMyRemaining',     p.my_remaining);
  setMoneyValue('pClientCapital',   p.client_capital);
  setMoneyValue('pClientRemaining', p.client_remaining);
  updateSplitBars();
  document.getElementById('pTitle').value      = p.title      || '';
  document.getElementById('pFirstName').value  = p.first_name || '';
  document.getElementById('pLastName').value   = p.last_name  || '';
  document.getElementById('pGender').value     = p.gender     || '';
  document.getElementById('pDob').value        = p.dob        || '';
  document.getElementById('pPostalCode').value = p.postal_code|| '';
  document.getElementById('pCity').value       = p.city       || '';
  document.getElementById('pCountry').value    = p.country    || '';
  document.getElementById('pPhoto').value      = '';
  document.getElementById('pIdCard').value     = '';
  document.getElementById('fileChosen').classList.add('hidden');
  document.getElementById('photoChosen').classList.add('hidden');
  document.getElementById('profileFormError').classList.add('hidden');

  if (p.client_id) {
    // Linked to master client — name/photo managed via Edit Identity
    const clientData = { name: p.name, photo_path: p.photo_path };
    setProfileModalClientMode(p.client_id, clientData);
    document.getElementById('profileModalTitle').textContent = 'Edit Shop Membership';
  } else {
    setProfileModalClientMode(null, null);
    document.getElementById('pName').value = p.name;
    resetPhotoPreview(p.photo_path || null);
    document.getElementById('profileModalTitle').textContent = 'Edit Client';
  }

  populateShopDropdown(p.shop_id || null, p.portfolio_id || null);
  document.getElementById('currentIdCard').innerHTML = p.id_card_path
    ? `<p class="text-xs text-on-surface-variant">Current: <a href="${p.id_card_path}" target="_blank" class="text-primary underline">${p.id_card_path.split('/').pop()}</a> — upload new to replace</p>`
    : '';
  document.getElementById('profileModal').classList.remove('hidden');
}

// Live preview for profile photo
document.getElementById('pPhoto').addEventListener('change', e => {
  const file = e.target.files[0];
  const pc   = document.getElementById('photoChosen');
  if (file) {
    pc.textContent = '✓ ' + file.name; pc.classList.remove('hidden');
    const reader = new FileReader();
    reader.onload = ev => resetPhotoPreview(ev.target.result);
    reader.readAsDataURL(file);
  } else { pc.classList.add('hidden'); resetPhotoPreview(null); }
});

// Show selected ID card filename
document.getElementById('pIdCard').addEventListener('change', e => {
  const fc = document.getElementById('fileChosen');
  if (e.target.files[0]) { fc.textContent = '✓ ' + e.target.files[0].name; fc.classList.remove('hidden'); }
  else fc.classList.add('hidden');
});

function closeProfileModal() { document.getElementById('profileModal').classList.add('hidden'); }
document.getElementById('closeProfileModal').addEventListener('click', closeProfileModal);
document.getElementById('cancelProfileModal').addEventListener('click', closeProfileModal);
document.getElementById('clearSelectedClient').addEventListener('click', () => setProfileModalClientMode(null, null));

// ── Trading rule toggle (profile modal) ──────────────────────────────────
function setProfileTradingRule(rule) {
  document.getElementById('pTradingRule').value = rule;
  const isDiscount = rule === 'discount';
  document.getElementById('pSplitRuleFields').classList.toggle('hidden', isDiscount);
  document.getElementById('pDiscountRuleFields').classList.toggle('hidden', !isDiscount);
  ['split','discount'].forEach(r => {
    const btn = document.getElementById('ruleBtn_' + r);
    if (!btn) return;
    btn.className = 'flex-1 py-2.5 rounded-lg text-xs font-semibold uppercase tracking-wider border transition-all ' +
      (r === rule ? 'bg-primary/15 border-primary/40 text-primary' : 'border-outline-variant/30 text-on-surface-variant hover:bg-surface-variant/30');
  });
}

function updateDiscountBar() {
  const val = parseFloat(document.getElementById('pDiscountSplit').value);
  document.getElementById('discountSplitLabel').textContent = val.toFixed(2) + '%';
  // Map 5–20 range to 0–100%
  document.getElementById('discountBar').style.width = ((val - 5) / 15 * 100) + '%';
}

// ── Quick-switch trading rule from profile header ─────────────────────────
async function switchTradingRule(profileId, currentRule) {
  const newRule = currentRule === 'discount' ? 'split' : 'discount';
  const fd = new FormData();
  fd.append('trading_rule', newRule);
  await api('PUT', `/api/profiles/${profileId}`, fd);
  openProfileDetail(profileId);
}

// ── Split bar live update ──────────────────────────────────────────────────
function updateSplitBars() {
  const p = Number(document.getElementById('pProfitSplitMe').value);
  const l = Number(document.getElementById('pLossSplitMe').value);
  document.getElementById('profitMeLabel').textContent    = p + '%';
  document.getElementById('profitClientLabel').textContent= (100-p) + '%';
  document.getElementById('lossMeLabel').textContent      = l + '%';
  document.getElementById('lossClientLabel').textContent  = (100-l) + '%';
  document.getElementById('profitMeBar').style.width      = p + '%';
  document.getElementById('profitClientBar').style.width  = (100-p) + '%';
  document.getElementById('lossMeBar').style.width        = l + '%';
  document.getElementById('lossClientBar').style.width    = (100-l) + '%';
}

// ── Master ID lookup in profile modal ─────────────────────────────────────

async function doMasterIdLookup() {
  const val    = document.getElementById('pMasterIdLookup').value.trim();
  const status = document.getElementById('masterIdStatus');
  if (!val) return;
  status.textContent = 'Looking up…';
  status.className   = 'text-xs mt-1 text-outline';
  status.classList.remove('hidden');
  try {
    const client = await api('GET', `/api/clients/lookup?master_id=${encodeURIComponent(val)}`);
    // Auto-fill membership fields from most recent existing membership
    if (client.memberships && client.memberships.length > 0) {
      const last = client.memberships[client.memberships.length - 1];
      document.getElementById('pEmail').value      = last.email      || '';
      document.getElementById('pPpUrn').value      = last.pp_urn     || '';
      document.getElementById('pTitle').value      = last.title      || '';
      document.getElementById('pFirstName').value  = last.first_name || '';
      document.getElementById('pLastName').value   = last.last_name  || '';
      document.getElementById('pGender').value     = last.gender     || '';
      document.getElementById('pDob').value        = last.dob        || '';
      document.getElementById('pAddress').value    = last.address    || '';
      document.getElementById('pPostalCode').value = last.postal_code|| '';
      document.getElementById('pCity').value       = last.city       || '';
      document.getElementById('pCountry').value    = last.country    || '';
    }
    setProfileModalClientMode(client.id, client);
    document.getElementById('profileModalTitle').textContent = 'Add Shop Membership';
  } catch (e) {
    status.textContent = 'No client found with that Master ID';
    status.className   = 'text-xs mt-1 text-error';
  }
}

document.getElementById('pMasterIdLookup').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); doMasterIdLookup(); }
});
document.getElementById('pMasterIdLookup').addEventListener('blur', doMasterIdLookup);

document.getElementById('browseClientsBtnInModal').addEventListener('click', () => {
  openClientPicker(c => {
    // When a client is picked, also pre-fill from their most recent membership
    if (c.memberships && c.memberships.length > 0) {
      const last = c.memberships[c.memberships.length - 1];
      document.getElementById('pEmail').value      = last.email      || '';
      document.getElementById('pPpUrn').value      = last.pp_urn     || '';
      document.getElementById('pTitle').value      = last.title      || '';
      document.getElementById('pFirstName').value  = last.first_name || '';
      document.getElementById('pLastName').value   = last.last_name  || '';
      document.getElementById('pGender').value     = last.gender     || '';
      document.getElementById('pDob').value        = last.dob        || '';
      document.getElementById('pAddress').value    = last.address    || '';
      document.getElementById('pPostalCode').value = last.postal_code|| '';
      document.getElementById('pCity').value       = last.city       || '';
      document.getElementById('pCountry').value    = last.country    || '';
    }
    setProfileModalClientMode(c.id, c);
    document.getElementById('profileModalTitle').textContent = 'Add Shop Membership';
  });
});

// ── Client Picker Modal ────────────────────────────────────────────────────
let _clientPickerCallback = null; // fn(clientId, clientData)
let _clientPickerAll = [];

async function openClientPicker(onSelect) {
  _clientPickerCallback = onSelect;
  _clientPickerAll = await api('GET', '/api/clients');
  document.getElementById('clientPickerSearch').value = '';
  renderClientPickerList(_clientPickerAll);
  document.getElementById('clientPickerModal').classList.remove('hidden');
  document.getElementById('clientPickerSearch').focus();
}

function renderClientPickerList(list) {
  document.getElementById('clientPickerList').innerHTML = list.length
    ? list.map(c => `
      <button onclick="selectPickedClient(${c.id})"
              class="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-surface-container-high transition-colors text-left group">
        ${avatarHtml(c.name, c.photo_path)}
        <div class="flex-1">
          <div class="flex items-center gap-2">
            <p class="text-on-surface text-sm font-medium">${esc(c.name)}</p>
            ${c.master_id ? `<span class="font-mono text-[11px] text-primary/80 bg-primary/10 px-1.5 py-0.5 rounded">#${esc(c.master_id)}</span>` : ''}
          </div>
          <p class="text-on-surface-variant text-xs">${c.membership_count} shop${c.membership_count !== 1 ? 's' : ''} · ${c.watch_count} watch${c.watch_count !== 1 ? 'es' : ''}</p>
        </div>
        <span class="material-symbols-outlined text-outline group-hover:text-primary text-[18px] transition-colors">chevron_right</span>
      </button>`).join('')
    : `<p class="text-center text-on-surface-variant text-sm py-8">No clients found.</p>`;
}

function selectPickedClient(clientId) {
  const c = _clientPickerAll.find(x => x.id === clientId);
  if (!c) return;
  closeClientPickerModal();
  // Fetch full client (with memberships) so callbacks can pre-fill fields
  api('GET', `/api/clients/${clientId}`).then(full => {
    if (_clientPickerCallback) _clientPickerCallback(full);
  });
}

function closeClientPickerModal() { document.getElementById('clientPickerModal').classList.add('hidden'); }
document.getElementById('closeClientPickerModal').addEventListener('click', closeClientPickerModal);
document.getElementById('clientPickerModal').addEventListener('click', e => { if (e.target === e.currentTarget) closeClientPickerModal(); });

document.getElementById('clientPickerSearch').addEventListener('input', e => {
  const q = e.target.value.trim().toLowerCase();
  renderClientPickerList(q ? _clientPickerAll.filter(c => c.name.toLowerCase().includes(q)) : _clientPickerAll);
});

document.getElementById('saveProfileBtn').addEventListener('click', async () => {
  const id    = document.getElementById('profileId').value;
  const errEl = document.getElementById('profileFormError');
  errEl.classList.add('hidden');

  const clientId = document.getElementById('pClientId').value;
  const fd = new FormData();
  if (!clientId) fd.append('name', document.getElementById('pName').value.trim());
  if (clientId)  fd.append('client_id', clientId);
  fd.append('email',            document.getElementById('pEmail').value.trim());
  fd.append('address',          document.getElementById('pAddress').value.trim());
  fd.append('pp_urn',           document.getElementById('pPpUrn').value.trim());
  fd.append('profit_split_me',  document.getElementById('pProfitSplitMe').value);
  fd.append('loss_split_me',    document.getElementById('pLossSplitMe').value);
  fd.append('trading_rule',  document.getElementById('pTradingRule').value);
  const dsPct = parseFloat(document.getElementById('pDiscountSplit').value || '8');
  fd.append('discount_split', (dsPct / 100).toFixed(4));
  fd.append('my_capital',       readMoneyInput('pMyCapital'));
  fd.append('my_remaining',     readMoneyInput('pMyRemaining'));
  fd.append('client_capital',   readMoneyInput('pClientCapital'));
  fd.append('client_remaining', readMoneyInput('pClientRemaining'));
  fd.append('title',         document.getElementById('pTitle').value.trim());
  fd.append('first_name',    document.getElementById('pFirstName').value.trim());
  fd.append('last_name',     document.getElementById('pLastName').value.trim());
  fd.append('gender',        document.getElementById('pGender').value.trim());
  fd.append('dob',           document.getElementById('pDob').value.trim());
  fd.append('postal_code',   document.getElementById('pPostalCode').value.trim());
  fd.append('city',          document.getElementById('pCity').value.trim());
  fd.append('country',       document.getElementById('pCountry').value.trim());
  fd.append('shop_id',       document.getElementById('pShopId').value);
  fd.append('portfolio_id',  document.getElementById('pPortfolioId').value);
  const photoFile  = document.getElementById('pPhoto').files[0];
  const idCardFile = document.getElementById('pIdCard').files[0];
  if (photoFile)  fd.append('photo',   photoFile);
  if (idCardFile) fd.append('id_card', idCardFile);

  if (!clientId && !fd.get('name')) {
    errEl.textContent = 'Name is required'; errEl.classList.remove('hidden'); return;
  }
  try {
    id ? await api('PUT', `/api/profiles/${id}`, fd) : await api('POST', '/api/profiles', fd);
    closeProfileModal();
    if (currentPage === 'profiles')                                       loadClients();
    else if (currentPage === 'dashboard')                                 loadDashboard();
    else if (currentPage === 'shop-detail')                               openShopDetail(currentShopId);
    else if (currentPage === 'portfolio-detail')                          openPortfolioDetail(currentPortfolioId);
    else if (currentPage === 'client-detail')                             openClientDetail(currentClientId);
    else if (currentPage === 'profile-detail' && currentProfileId == id)  openProfileDetail(id);
  } catch (e) {
    errEl.textContent = e.message; errEl.classList.remove('hidden');
  }
});
