// 02-admin.js — Admin page (master only)
// Part of the dashboard script: scripts/build.js concatenates src/dashboard/*.js
// in filename order into public/js/dashboard.js (one classic script, so
// functions and top-level variables stay shared exactly as before).

// ── Dashboard ──────────────────────────────────────────────────────────────
// ── Admin page (master only) ──────────────────────────────────────────────

let _adminAuditFilters = { actor_id: '', target_type: '', action: '' };

async function loadAdmin() {
  // Default tab → users
  showAdminTab('users');
  await Promise.all([loadAdminUsers(), loadAdminAuditFilters()]);
}

function showAdminTab(tab) {
  document.querySelectorAll('.admin-tab').forEach(b => {
    const active = b.dataset.adminTab === tab;
    b.className = 'admin-tab text-xs font-semibold uppercase tracking-wider px-4 py-3 border-b-2 ' +
      (active ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface');
  });
  document.querySelectorAll('.admin-tab-panel').forEach(p => p.classList.add('hidden'));
  document.getElementById(`adminTab-${tab}`).classList.remove('hidden');
  if (tab === 'audit') loadAdminAudit();
  if (tab === 'users') loadAdminUsers();
}

document.querySelectorAll('.admin-tab').forEach(b => {
  b.addEventListener('click', () => showAdminTab(b.dataset.adminTab));
});

async function loadAdminUsers() {
  const users = await api('GET', '/api/admin/users');
  const me    = currentUser?.id;
  const body  = document.getElementById('adminUsersBody');
  body.innerHTML = users.map(u => {
    const isMe = u.id === me;
    const created = (u.created_at || '').split(' ')[0] || '—';
    return `
      <tr class="hover:bg-white/[0.02]">
        <td class="px-5 py-3">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center text-[12px] font-semibold text-primary uppercase">${u.username[0]}</div>
            <div>
              <p class="text-sm font-medium text-on-surface">${esc(u.username)}${isMe ? ' <span class="text-[11px] text-primary uppercase ml-1">(you)</span>' : ''}</p>
              <p class="text-[11px] text-on-surface-variant">ID #${u.id}</p>
            </div>
          </div>
        </td>
        <td class="px-5 py-3">
          <span class="text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-lg border ${u.role === 'master' ? 'text-primary border-primary/40 bg-primary/5' : 'text-purple-300 border-purple-300/30 bg-purple-300/5'}">${u.role}</span>
        </td>
        <td class="px-5 py-3 text-sm text-on-surface-variant">${u.clients_count || 0}</td>
        <td class="px-5 py-3 text-sm text-on-surface-variant">${u.watches_count || 0}</td>
        <td class="px-5 py-3 text-sm text-on-surface-variant">${u.sold_count || 0}</td>
        <td class="px-5 py-3 text-xs text-outline">${created}</td>
        <td class="px-5 py-3">
          <div class="flex items-center justify-end gap-1.5">
            ${!isMe ? `
            <button onclick="adminViewAs(${u.id})" title="View their workspace" class="p-1.5 rounded-lg hover:bg-amber-500/10 text-amber-400 transition-colors">
              <span class="material-symbols-outlined text-[16px]">visibility</span>
            </button>` : ''}
            <button onclick="adminResetPassword(${u.id}, '${esc(u.username).replace(/'/g,"\\\\'")}' )" title="Reset password" class="p-1.5 rounded-lg hover:bg-primary/10 text-primary transition-colors">
              <span class="material-symbols-outlined text-[16px]">key</span>
            </button>
            ${u.role === 'master' || isMe ? '' : `
            <button onclick="adminPromote(${u.id})" title="Promote to master" class="p-1.5 rounded-lg hover:bg-primary/10 text-on-surface-variant hover:text-primary transition-colors">
              <span class="material-symbols-outlined text-[16px]">workspace_premium</span>
            </button>`}
            ${!isMe ? `
            <button onclick="adminDeleteUser(${u.id}, '${esc(u.username).replace(/'/g,"\\\\'")}' )" title="Delete user" class="p-1.5 rounded-lg hover:bg-error/10 text-on-surface-variant hover:text-error transition-colors">
              <span class="material-symbols-outlined text-[16px]">delete</span>
            </button>` : ''}
          </div>
        </td>
      </tr>`;
  }).join('');
}

async function adminViewAs(userId) {
  try {
    await api('POST', '/api/admin/view-as', { user_id: userId });
    await refreshCurrentUser();
    showPage('dashboard');
  } catch (e) { alert(e.message); }
}

async function adminResetPassword(userId, username) {
  const pw = prompt(`Set a new password for ${username}\n(at least 6 characters)`);
  if (!pw) return;
  if (pw.length < 6) { alert('Password must be at least 6 characters'); return; }
  try {
    await api('PUT', `/api/admin/users/${userId}/password`, { new_password: pw });
    alert(`Password for ${username} has been reset.`);
  } catch (e) { alert(e.message); }
}

async function adminPromote(userId) {
  if (!confirm('Promote this user to master? They will gain full access to all workspaces.')) return;
  try {
    await api('PUT', `/api/admin/users/${userId}`, { role: 'master' });
    await loadAdminUsers();
  } catch (e) { alert(e.message); }
}

async function adminDeleteUser(userId, username) {
  if (!confirm(`Delete user "${username}" and ALL their data (clients, watches, settings)? This cannot be undone.`)) return;
  try {
    await api('DELETE', `/api/admin/users/${userId}`);
    await loadAdminUsers();
  } catch (e) { alert(e.message); }
}

async function loadAdminAuditFilters() {
  const users = await api('GET', '/api/admin/users');
  const sel   = document.getElementById('auditFilterActor');
  sel.innerHTML = `<option value="">All users</option>` + users.map(u => `<option value="${u.id}">${esc(u.username)}</option>`).join('');
}

async function loadAdminAudit() {
  const qs = new URLSearchParams();
  if (_adminAuditFilters.actor_id)    qs.set('actor_id',    _adminAuditFilters.actor_id);
  if (_adminAuditFilters.target_type) qs.set('target_type', _adminAuditFilters.target_type);
  if (_adminAuditFilters.action)      qs.set('action',      _adminAuditFilters.action);
  qs.set('limit', 200);
  const { rows, total } = await api('GET', `/api/admin/audit-log?${qs}`);
  document.getElementById('auditTotalLabel').textContent = `Showing ${rows.length} of ${total} events`;
  const body = document.getElementById('adminAuditBody');
  body.innerHTML = rows.length ? rows.map(r => {
    const colour = r.action === 'delete' ? 'text-error' : r.action === 'create' ? 'text-emerald-400' : r.action === 'view_as_start' || r.action === 'view_as_end' ? 'text-amber-400' : 'text-on-surface-variant';
    const viewedAs = r.viewing_as ? ` <span class="text-[11px] text-amber-400/80 uppercase ml-1">[as #${r.viewing_as}]</span>` : '';
    let details = r.details || '';
    if (details) {
      try { details = '<code class="text-[11px] text-outline/90 font-mono">' + esc(JSON.stringify(JSON.parse(details))) + '</code>'; }
      catch { details = '<code class="text-[11px] text-outline/90 font-mono">' + esc(details) + '</code>'; }
    }
    return `
      <tr class="hover:bg-white/[0.02]">
        <td class="px-5 py-2 text-[11px] text-outline whitespace-nowrap">${r.ts}</td>
        <td class="px-5 py-2 text-on-surface">${esc(r.actor_user || '—')}${viewedAs}</td>
        <td class="px-5 py-2 ${colour} font-semibold uppercase text-[11px] tracking-wider">${r.action}</td>
        <td class="px-5 py-2 text-on-surface-variant">${r.target_type}${r.target_id ? ' #' + r.target_id : ''}</td>
        <td class="px-5 py-2 max-w-[420px] truncate">${details}</td>
      </tr>`;
  }).join('') : `<tr><td colspan="5" class="px-5 py-10 text-center text-on-surface-variant text-xs">No audit entries match this filter.</td></tr>`;
}

document.getElementById('auditFilterActor')?.addEventListener('change',  e => { _adminAuditFilters.actor_id    = e.target.value; loadAdminAudit(); });
document.getElementById('auditFilterType')?.addEventListener('change',   e => { _adminAuditFilters.target_type = e.target.value; loadAdminAudit(); });
document.getElementById('auditFilterAction')?.addEventListener('change', e => { _adminAuditFilters.action      = e.target.value; loadAdminAudit(); });
document.getElementById('auditRefresh')?.addEventListener('click', loadAdminAudit);

document.getElementById('newUserSubmit')?.addEventListener('click', async () => {
  const username = document.getElementById('newUserUsername').value.trim();
  const password = document.getElementById('newUserPassword').value;
  const role     = document.getElementById('newUserRole').value;
  const err      = document.getElementById('newUserError');
  err.classList.add('hidden');
  if (!username || !password) { err.textContent = 'Username and password are required.'; err.classList.remove('hidden'); return; }
  try {
    await api('POST', '/api/admin/users', { username, password, role });
    document.getElementById('newUserUsername').value = '';
    document.getElementById('newUserPassword').value = '';
    showAdminTab('users');
  } catch (e) {
    err.textContent = e.message; err.classList.remove('hidden');
  }
});

async function loadDashboard() {
  // Attention strip, KPI trends, waiting + recent sales load alongside the tables
  loadVaultInsights().catch(err => console.error('Vault insights failed', err));
  // Pull shops + clients in parallel; portfolio counts then per-shop
  const [shops, clients] = await Promise.all([
    api('GET', '/api/shops'),
    api('GET', '/api/clients'),
  ]);
  document.getElementById('s-shops').textContent   = shops.length.toLocaleString();
  document.getElementById('s-clients').textContent = clients.length.toLocaleString();

  const totalWatchesAcrossClients = clients.reduce((s, c) => s + (c.watch_count || 0), 0);
  document.getElementById('s-clients-sub').textContent = `${totalWatchesAcrossClients.toLocaleString()} watch${totalWatchesAcrossClients !== 1 ? 'es' : ''} across all memberships`;

  // Shops table
  const portfoliosPerShop = await Promise.all(shops.map(s => api('GET', `/api/portfolios?shop_id=${s.id}`)));
  const portfolioMap = {};
  shops.forEach((s, i) => { portfolioMap[s.id] = portfoliosPerShop[i].length; });
  document.getElementById('recentShops').innerHTML = shops.length ? shops.map(s => `
    <tr class="tbl-row cursor-pointer" onclick="openShopDetail(${s.id})">
      <td class="px-5 py-3">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span class="material-symbols-outlined text-primary text-[18px]">store</span>
          </div>
          <span class="text-on-surface font-medium text-sm">${esc(s.name)}</span>
        </div>
      </td>
      <td class="px-5 py-3 text-on-surface-variant text-xs whitespace-pre-line leading-relaxed">${esc(s.address || '—')}</td>
      <td class="px-5 py-3 text-on-surface-variant text-sm">${portfolioMap[s.id] || 0} portfolio${(portfolioMap[s.id] || 0) !== 1 ? 's' : ''}</td>
      <td class="px-5 py-3 text-right">
        <button onclick="event.stopPropagation(); openShopDetail(${s.id})" class="text-[11px] font-semibold uppercase tracking-wider text-primary hover:underline px-3 py-1 border border-transparent hover:border-primary/20 rounded transition-all">View</button>
      </td>
    </tr>
  `).join('') : `<tr><td colspan="4" class="px-6 py-16 text-center text-on-surface-variant text-sm">No shops yet.</td></tr>`;

  // Clients table — sorted most watches first so the busiest stand out
  const sortedClients = [...clients].sort((a, b) => (b.watch_count || 0) - (a.watch_count || 0));
  document.getElementById('recentClients').innerHTML = sortedClients.length ? sortedClients.map(c => `
    <tr class="tbl-row cursor-pointer" onclick="openClientDetail(${c.id})">
      <td class="px-5 py-3">
        <div class="flex items-center gap-3">
          ${avatarHtml(c.name, c.photo_path, 'sm')}
          <span class="text-on-surface font-medium text-sm">${esc(c.name)}</span>
        </div>
      </td>
      <td class="px-5 py-3 text-on-surface-variant text-xs font-mono">${c.master_id ? '#' + esc(c.master_id) : '—'}</td>
      <td class="px-5 py-3 text-on-surface-variant text-sm">${c.membership_count || 0} shop${(c.membership_count || 0) !== 1 ? 's' : ''}</td>
      <td class="px-5 py-3 text-on-surface-variant text-sm">${c.watch_count || 0} watch${(c.watch_count || 0) !== 1 ? 'es' : ''}</td>
      <td class="px-5 py-3 text-right">
        <button onclick="event.stopPropagation(); openClientDetail(${c.id})" class="text-[11px] font-semibold uppercase tracking-wider text-primary hover:underline px-3 py-1 border border-transparent hover:border-primary/20 rounded transition-all">View</button>
      </td>
    </tr>
  `).join('') : `<tr><td colspan="5" class="px-6 py-16 text-center text-on-surface-variant text-sm">No clients yet — add one from the Clients page.</td></tr>`;
  reapplyDomSort(document.getElementById('recentShops').closest('table'));
  reapplyDomSort(document.getElementById('recentClients').closest('table'));
}
