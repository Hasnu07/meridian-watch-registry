// 15-settings-misc.js — Settings, WhatsApp, messages, lightbox, pagination, modal helpers
// Part of the dashboard script: scripts/build.js concatenates src/dashboard/*.js
// in filename order into public/js/dashboard.js (one classic script, so
// functions and top-level variables stay shared exactly as before).

// ── Settings ───────────────────────────────────────────────────────────────
function resetPasswordForm() {
  ['currPass','newPass','confPass'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('passMsg').innerHTML = '';
  loadWaSettings();
}

// ── WhatsApp / GreenAPI settings ───────────────────────────────────────────

async function loadWaSettings() {
  try {
    const s = await api('GET', '/api/settings');
    if (s.greenapi_api_url)     document.getElementById('waApiUrl').value      = s.greenapi_api_url;
    if (s.greenapi_instance_id) document.getElementById('waInstanceId').value  = s.greenapi_instance_id;
    if (s.greenapi_group_id)    document.getElementById('waGroupId').value     = s.greenapi_group_id;
    if (s.greenapi_notify_hour) document.getElementById('waNotifyHour').value  = s.greenapi_notify_hour;
    // API token is masked — leave input blank (placeholder explains)
  } catch (e) { /* settings may not exist yet */ }
}

function waMsg(text, isError) {
  const el = document.getElementById('waMsg');
  el.className = `text-sm px-4 py-3 rounded-lg ${isError ? 'bg-error/10 text-error' : 'bg-emerald-500/10 text-emerald-400'}`;
  el.textContent = text;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 5000);
}

async function saveWaSettings() {
  const body = {};
  const apiUrl = document.getElementById('waApiUrl').value.trim();
  const inst   = document.getElementById('waInstanceId').value.trim();
  const token  = document.getElementById('waApiToken').value.trim();
  const group  = document.getElementById('waGroupId').value.trim();
  const hour   = document.getElementById('waNotifyHour').value.trim();
  if (apiUrl) body.greenapi_api_url      = apiUrl;
  if (inst)   body.greenapi_instance_id  = inst;
  if (token)  body.greenapi_api_token    = token;
  if (group)  body.greenapi_group_id     = group;
  if (hour !== '') body.greenapi_notify_hour = hour;
  if (!Object.keys(body).length) { waMsg('Nothing to save.', true); return; }
  try {
    await api('POST', '/api/settings', body);
    document.getElementById('waApiToken').value = '';
    waMsg('Settings saved.', false);
  } catch (e) { waMsg(e.message, true); }
}

async function testWaMessage() {
  try {
    const r = await api('POST', '/api/settings/whatsapp/test');
    if (r.error) waMsg('Error: ' + r.error, true);
    else waMsg('Test message sent! Check your WhatsApp group.', false);
  } catch (e) { waMsg(e.message, true); }
}

async function triggerWaReminder() {
  try {
    const r = await api('POST', '/api/settings/whatsapp/trigger');
    if (r.error) waMsg('Error: ' + r.error, true);
    else if (r.sent) waMsg(`Sent! ${r.count} milestone watch(es) notified.`, false);
    else waMsg('No milestone watches today (no 10/20/30/40-day watches). Use Test to force-send.', false);
  } catch (e) { waMsg(e.message, true); }
}

document.getElementById('passwordForm').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = document.getElementById('passMsg');
  const np = document.getElementById('newPass').value;
  const cp = document.getElementById('confPass').value;
  if (np !== cp) {
    msg.innerHTML = `<p class="text-error text-sm mt-2">Passwords do not match</p>`; return;
  }
  try {
    await api('POST', '/api/settings/password', { current_password: document.getElementById('currPass').value, new_password: np });
    msg.innerHTML = `<p class="text-green-400 text-sm mt-2">Password updated successfully.</p>`;
    ['currPass','newPass','confPass'].forEach(id => document.getElementById(id).value = '');
  } catch (err) {
    msg.innerHTML = `<p class="text-error text-sm mt-2">${esc(err.message)}</p>`;
  }
});

// ── Message Generator ──────────────────────────────────────────────────────

async function loadMsgClients() {
  const profiles = await api('GET', '/api/profiles');
  const sel = document.getElementById('msgClientSelect');
  sel.innerHTML = '<option value="">— Select client —</option>' +
    profiles.map(p => `<option value="${p.id}">${esc(p.name)}${p.pp_urn ? ' · ' + p.pp_urn : ''}</option>`).join('');
}

function buildMessage(profile, watches) {
  const line = (label, val) => val ? `${label}: ${val}\n` : '';
  let msg = '';
  msg += `Email ${profile.email}\n\n`;

  if (profile.pp_urn) msg += `PP URN: ${profile.pp_urn} | Patek Identification\n`;

  msg += line('Título',            profile.title);
  msg += line('Apellido',          profile.last_name);
  msg += line('Nombre',            profile.first_name);
  msg += line('Género',            profile.gender);
  msg += line('Fecha de nacimiento', profile.dob);
  msg += line('Dirección',         profile.address);
  msg += line('Código postal',     profile.postal_code);
  msg += line('Ciudad',            profile.city);
  msg += line('País',              profile.country);

  if (watches.length) {
    msg += '\nWatches Received\n\n';
    watches.forEach(w => {
      let parts = [];
      if (w.reference_number) parts.push(`Reference: ${w.reference_number}`);
      else if (w.model)       parts.push(`Model: ${w.model}`);
      if (w.serial_number)    parts.push(`Serial: ${w.serial_number}`);
      if (w.movement_number || w.case_number) {
        const mc = [w.movement_number, w.case_number].filter(Boolean).join('/');
        parts.push(`Movement/case: ${mc}`);
      }
      msg += parts.join('; ') + '\n';
    });
  }

  return msg.trim();
}

document.getElementById('generateMsgBtn').addEventListener('click', async () => {
  const profileId = document.getElementById('msgClientSelect').value;
  if (!profileId) return;
  try {
    const profile = await api('GET', `/api/profiles/${profileId}`);
    const msg = buildMessage(profile, profile.watches || []);
    document.getElementById('msgText').value = msg;
    document.getElementById('msgOutput').classList.remove('hidden');
    document.getElementById('copyMsgLabel').textContent = 'Copy';
  } catch (e) { alert(e.message); }
});

document.getElementById('copyMsgBtn').addEventListener('click', () => {
  const text = document.getElementById('msgText').value;
  navigator.clipboard.writeText(text).then(() => {
    document.getElementById('copyMsgLabel').textContent = 'Copied!';
    setTimeout(() => document.getElementById('copyMsgLabel').textContent = 'Copy', 2000);
  });
});

// ── Lightbox ───────────────────────────────────────────────────────────────
function openLightbox(src) {
  document.getElementById('lightboxImg').src = src;
  document.getElementById('lightbox').classList.remove('hidden');
}
document.getElementById('lightbox').addEventListener('click', () => document.getElementById('lightbox').classList.add('hidden'));

// ── Pagination ─────────────────────────────────────────────────────────────
function renderPagination(containerId, current, total, perPage, onChange) {
  const pages = Math.ceil(total / perPage);
  const el    = document.getElementById(containerId);
  if (pages <= 1) { el.innerHTML = `<p class="text-xs text-on-surface-variant">${total} total</p>`; return; }

  let html = `<p class="text-xs text-on-surface-variant">${total} total</p><div class="flex gap-1.5">`;
  html += `<button class="px-3 py-1.5 border border-outline-variant/20 rounded-lg text-xs text-on-surface-variant hover:bg-surface-variant/30 disabled:opacity-30 transition-colors" ${current===1?'disabled':''} onclick="(${onChange.toString()})(${current-1})">‹</button>`;
  for (let i = 1; i <= pages; i++) {
    if (pages > 7 && Math.abs(i - current) > 2 && i > 2 && i < pages - 1) {
      if (i === 3 || i === pages - 2) html += `<span class="px-2 py-1.5 text-xs text-on-surface-variant">…</span>`;
      continue;
    }
    html += `<button class="px-3 py-1.5 border rounded-lg text-xs transition-colors ${i===current ? 'bg-primary text-on-primary border-primary' : 'border-outline-variant/20 text-on-surface-variant hover:bg-surface-variant/30'}" onclick="(${onChange.toString()})(${i})">${i}</button>`;
  }
  html += `<button class="px-3 py-1.5 border border-outline-variant/20 rounded-lg text-xs text-on-surface-variant hover:bg-surface-variant/30 disabled:opacity-30 transition-colors" ${current===pages?'disabled':''} onclick="(${onChange.toString()})(${current+1})">›</button>`;
  el.innerHTML = html + '</div>';
}

// ── Close on backdrop click ────────────────────────────────────────────────
['profileModal','watchModal','confirmModal','companyDocModal','markSoldModal','portfolioModal','recordPaymentModal','addExpenseModal','recordPayoutModal','shareLinkModal'].forEach(id => {
  document.getElementById(id).addEventListener('click', e => {
    if (e.target === e.currentTarget) {
      if (id === 'profileModal') closeProfileModal();
      else if (id === 'watchModal') closeWatchModal();
      else if (id === 'companyDocModal') closeCompanyDocModal();
      else if (id === 'markSoldModal') closeMarkSoldModal();
      else if (id === 'portfolioModal') closePortfolioModal();
      else if (id === 'recordPaymentModal') closeRecordPaymentModal();
      else if (id === 'addExpenseModal') closeAddExpenseModal();
      else if (id === 'recordPayoutModal') closeRecordPayoutModal();
      else if (id === 'shareLinkModal') closeShareLinkModal();
      else closeConfirm();
    }
  });
});

// ── Escape key ─────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  closeProfileModal(); closeWatchModal(); closeConfirm(); closeCompanyDocModal(); closeShopModal(); closeMarkSoldModal();
  closePortfolioModal(); closeClientPickerModal(); closeClientEditModal(); closeRecordPaymentModal(); closeAddExpenseModal(); closeRecordPayoutModal(); closeShareLinkModal();
  document.getElementById('lightbox').classList.add('hidden');
});

// ── Escape helper ──────────────────────────────────────────────────────────
function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Display: neon cursor switch (cursor.js owns the behaviour) ────────────
(function () {
  const btn = document.getElementById('neonCursorToggle');
  if (!btn) return;
  const supported = typeof window.setNeonCursor === 'function';
  const sync = () => btn.setAttribute('aria-checked', String(supported && window.neonCursorEnabled()));
  if (!supported) {            // touch screen / no fine pointer: nothing to toggle
    btn.disabled = true;
    btn.title = 'Not available on touch screens';
  }
  btn.addEventListener('click', () => {
    if (!supported) return;
    const on = !window.neonCursorEnabled();
    window.setNeonCursor(on);
    // Patek Desk runs in an iframe with its own copy of the cursor
    try { document.getElementById('patekDeskFrame')?.contentWindow?.setNeonCursor?.(on); } catch {}
    sync();
  });
  sync();
})();
