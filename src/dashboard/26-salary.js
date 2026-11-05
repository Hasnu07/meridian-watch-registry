// 26-salary.js — the boutique manager's salary (the Salary tab)
// Besides commissions, an owner may pay the shop's boutique manager a fixed
// monthly salary. The owner (and a collaborator of the shop) sets it on the
// Boutique Commission page's Salary tab — an amount a month from a start
// month, still running or until an end month — and marks each month paid; the
// manager's Commissions page has the same tab read-only, with what they earn
// with the owner in all: commission + salary. One renderer for both sides
// (renderSalaryPane), the data from /api/shops/:id/salaries.
// Part of the dashboard script: scripts/build.js concatenates src/dashboard/*.js
// in filename order into public/js/dashboard.js (one classic script, so
// functions and top-level variables stay shared exactly as before).

const SALARY_CURRENCIES = ['EUR', 'CHF', 'USD', 'GBP'];

function salaryMonthLabel(m) {
  return m ? new Date(m + '-01T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : '—';
}
function salaryMonthShort(m) {
  return m ? new Date(m + '-01T00:00:00').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '—';
}
// Per-currency sums over every month of every salary: all, paid, pending
function salaryTotals(salaries) {
  const add = (map, e) => { map[e.currency || 'EUR'] = (map[e.currency || 'EUR'] || 0) + Number(e.amount || 0); return map; };
  const total = {}, paid = {}, pending = {};
  let months = 0;
  for (const sl of salaries || []) for (const mo of sl.months || []) { months++; add(total, mo); add(mo.paid_at ? paid : pending, mo); }
  return { total, paid, pending, months };
}
// Add two per-currency maps (commission + salary = earned in all)
function sumCurrencyMaps(a, b) {
  const out = { ...(a || {}) };
  for (const [cur, v] of Object.entries(b || {})) out[cur] = (out[cur] || 0) + v;
  return out;
}
const salaryTile = (label, value, sub, cls = 'bm-commission') => `
  <div class="glass-surface rounded-lg p-5">
    <p class="text-[11px] uppercase tracking-[0.06em] text-on-surface-variant font-semibold mb-3">${label}</p>
    <p class="font-playfair text-2xl ${cls}">${value}</p>
    <p class="text-[11px] text-on-surface-variant mt-1">${sub}</p>
  </div>`;

// opts: { canEdit, shopId, managerName, ownerName, commissionTotals (per-currency map, for "earned in all"), reload }
function renderSalaryPane(container, salaries, opts) {
  const { canEdit, shopId, managerName, ownerName, commissionTotals, reload } = opts;
  const t = salaryTotals(salaries);
  const who = managerName || 'the boutique manager';
  const first = (salaries || []).map(s => s.start_month).sort()[0];
  const allIn = sumCurrencyMaps(commissionTotals, t.total);
  const running = (salaries || []).filter(s => !s.end_month);

  const tiles = `
    <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
      ${salaryTile('Salary', fmt.byCurrency(t.total), first ? `${t.months} month${t.months !== 1 ? 's' : ''} since ${salaryMonthLabel(first)}${running.length ? ` · ${running.map(s => fmt.price(s.amount, s.currency)).join(' + ')} a month` : ''}` : `no salary set for ${esc(who)} yet`)}
      ${salaryTile('Paid', fmt.byCurrency(t.paid), `${Object.values(t.paid).length ? 'paid out to' : 'nothing paid out to'} ${esc(who)}`, 'text-emerald-400')}
      ${salaryTile('Left to pay', fmt.byCurrency(t.pending), `${(salaries || []).reduce((n, s) => n + s.months.filter(m => !m.paid_at).length, 0)} month${(salaries || []).reduce((n, s) => n + s.months.filter(m => !m.paid_at).length, 0) !== 1 ? 's' : ''} still to pay`, Object.values(t.pending).length ? 'bm-commission' : 'text-on-surface')}
      ${salaryTile(canEdit ? `${esc(who)} earns with ${esc(ownerName || 'you')} in all` : `Earned with ${esc(ownerName || 'the owner')} in all`, `<span class="text-on-surface">${fmt.byCurrency(allIn)}</span>`, `commission ${fmt.byCurrency(commissionTotals || {})} + salary ${fmt.byCurrency(t.total)}`)}
    </div>`;

  const cards = (salaries || []).length ? salaries.map(sl => `
    <div class="glass-surface rounded-lg overflow-hidden mb-4">
      <div class="px-6 py-4 border-b border-outline-variant/10 flex items-center justify-between gap-4 flex-wrap">
        <div class="min-w-0">
          <h3 class="font-playfair text-xl text-on-surface"><span class="bm-commission font-mono">${fmt.price(sl.amount, sl.currency)}</span> a month</h3>
          <p class="text-xs text-on-surface-variant mt-0.5">since ${salaryMonthLabel(sl.start_month)}${sl.end_month ? ` until ${salaryMonthLabel(sl.end_month)}` : ' · still running'}${sl.description ? ` · ${esc(sl.description)}` : ''}</p>
        </div>
        ${canEdit ? `
        <div class="flex items-center gap-1">
          <button onclick="editSalary(${sl.id})" title="Change this salary" aria-label="Change this salary" class="p-2 rounded-lg hover:bg-surface-variant/30 text-on-surface-variant hover:text-primary transition-colors"><span class="material-symbols-outlined text-[18px]">edit</span></button>
          <button onclick="endSalary(${sl.id})" title="${sl.end_month ? 'Already ended' : 'End this salary this month'}" aria-label="End this salary" class="p-2 rounded-lg hover:bg-surface-variant/30 text-on-surface-variant hover:text-amber-300 transition-colors ${sl.end_month ? 'opacity-40 pointer-events-none' : ''}"><span class="material-symbols-outlined text-[18px]">event_busy</span></button>
          <button onclick="deleteSalary(${sl.id})" title="Remove this salary" aria-label="Remove this salary" class="p-2 rounded-lg hover:bg-error/10 text-on-surface-variant hover:text-error transition-colors"><span class="material-symbols-outlined text-[18px]">delete</span></button>
        </div>` : ''}
      </div>
      <div class="divide-y divide-white/[0.04]">
        ${sl.months.length ? sl.months.map(mo => `
        <div class="px-6 py-3 flex items-center gap-4 flex-wrap">
          <span class="text-sm font-medium text-on-surface w-40">${salaryMonthLabel(mo.month)}</span>
          <span class="font-mono text-sm ${mo.paid_at ? 'text-on-surface-variant' : 'bm-commission'}">${fmt.price(mo.amount, mo.currency)}</span>
          ${mo.paid_at
            ? `<span class="text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400" title="Paid ${fmt.date(mo.paid_at)}">Paid</span>`
            : `<span class="text-[11px] font-semibold px-2 py-0.5 rounded bg-white/[0.04] text-on-surface-variant">Pending</span>`}
          ${canEdit ? `<button onclick="toggleSalaryMonthPaid(${sl.id}, '${mo.month}', ${mo.paid_at ? 'false' : 'true'})" class="ml-auto text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded border transition-all ${mo.paid_at ? 'border-outline-variant/30 text-on-surface-variant hover:text-on-surface' : 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10'}">${mo.paid_at ? 'Unpaid' : 'Mark paid'}</button>` : ''}
        </div>`).join('')
        : `<p class="px-6 py-6 text-sm text-on-surface-variant">Starts ${salaryMonthLabel(sl.start_month)} — no month due yet.</p>`}
      </div>
    </div>`).join('')
    : `<div class="glass-surface rounded-lg p-10 text-center text-on-surface-variant text-sm mb-4">
        <span class="material-symbols-outlined text-outline text-3xl block mb-2">payments</span>
        ${canEdit ? `No salary set for ${esc(who)} yet. Add one below — every month from the start month shows up here, to mark paid as you pay it, and ${esc(who)} sees it on their Salary tab.` : `No salary recorded for you yet. ${esc(ownerName || 'The owner')} sets it on their side.`}
      </div>`;

  const thisMonth = new Date().toISOString().slice(0, 7);
  const form = canEdit ? `
    <div class="glass-surface rounded-lg px-6 py-5">
      <p class="text-[11px] uppercase tracking-[0.06em] text-on-surface-variant font-semibold mb-1">Add a salary</p>
      <p class="text-xs text-on-surface-variant mb-4">A fixed amount a month for ${esc(who)}, from the month it started. Leave "until" empty while it is still running.</p>
      <form onsubmit="submitSalary(event, ${shopId})" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
        <label class="block"><span class="block text-[11px] uppercase tracking-wider text-on-surface-variant mb-1">Amount a month</span>
          <input name="amount" type="number" min="1" step="1" required placeholder="5000" class="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-on-surface text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"></label>
        <label class="block"><span class="block text-[11px] uppercase tracking-wider text-on-surface-variant mb-1">Currency</span>
          <select name="currency" class="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-primary">${SALARY_CURRENCIES.map(c => `<option value="${c}" style="background:#131A24;color:#E6EDF7">${c}</option>`).join('')}</select></label>
        <label class="block"><span class="block text-[11px] uppercase tracking-wider text-on-surface-variant mb-1">From</span>
          <input name="start_month" type="month" required value="${thisMonth}" class="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-primary"></label>
        <label class="block"><span class="block text-[11px] uppercase tracking-wider text-on-surface-variant mb-1">Until <span class="normal-case tracking-normal text-outline">(optional)</span></span>
          <input name="end_month" type="month" class="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-primary"></label>
        <button type="submit" class="bg-primary text-on-primary text-xs font-semibold px-4 py-2.5 rounded-lg hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 h-[38px]"><span class="material-symbols-outlined text-[16px]">add_circle</span> Add salary</button>
        <label class="block sm:col-span-2 lg:col-span-5"><span class="block text-[11px] uppercase tracking-wider text-on-surface-variant mb-1">Note <span class="normal-case tracking-normal text-outline">(optional)</span></span>
          <input name="description" type="text" placeholder="e.g. Fixed monthly salary" class="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-primary"></label>
      </form>
      <p id="salaryFormError" class="hidden text-xs text-error mt-2"></p>
    </div>` : '';

  container.innerHTML = tiles + cards + form;
  container.dataset.shopId = String(shopId);
  _salaryReload = reload;
}

let _salaryReload = null;
async function salaryCall(method, url, body) {
  try { await api(method, url, body); if (_salaryReload) await _salaryReload(); }
  catch (e) { alert(e.message || 'Could not update the salary'); }
}
async function submitSalary(ev, shopId) {
  ev.preventDefault();
  const f = ev.target, err = document.getElementById('salaryFormError');
  const body = { amount: Number(f.amount.value), currency: f.currency.value, start_month: f.start_month.value, end_month: f.end_month.value || null, description: f.description.value.trim() || undefined };
  err?.classList.add('hidden');
  try { await api('POST', `/api/shops/${shopId}/salaries`, body); if (_salaryReload) await _salaryReload(); }
  catch (e) { if (err) { err.textContent = e.message; err.classList.remove('hidden'); } else alert(e.message); }
}
function toggleSalaryMonthPaid(id, month, paid) { return salaryCall('PUT', `/api/salaries/${id}/months/${month}/paid`, { paid }); }
async function editSalary(id) {
  const amount = prompt('Amount a month:');
  if (amount == null) return;
  if (!(Number(amount) > 0)) { alert('Enter a positive amount.'); return; }
  return salaryCall('PUT', `/api/salaries/${id}`, { amount: Number(amount) });
}
function endSalary(id) {
  const month = new Date().toISOString().slice(0, 7);
  if (!confirm(`End this salary with ${salaryMonthLabel(month)}? Months up to now stay; nothing is due after.`)) return;
  return salaryCall('PUT', `/api/salaries/${id}`, { end_month: month });
}
function deleteSalary(id) {
  if (!confirm('Remove this salary and its paid months? This cannot be undone.')) return;
  return salaryCall('DELETE', `/api/salaries/${id}`);
}

// Tab rows on both pages: Commissions | Salary
function salaryTabClass(active) {
  return 'text-xs font-semibold uppercase tracking-wider px-4 py-3 border-b-2 transition-colors ' + (active ? 'border-amber-400 text-amber-300' : 'border-transparent text-on-surface-variant hover:text-on-surface');
}
function showPaneTab(prefix, tab) {
  document.querySelectorAll(`[data-${prefix}-tab]`).forEach(b => { b.className = salaryTabClass(b.dataset[`${prefix}Tab`] === tab); b.setAttribute('aria-selected', String(b.dataset[`${prefix}Tab`] === tab)); });
  document.getElementById(`${prefix}CommissionsPane`)?.classList.toggle('hidden', tab !== 'commissions');
  document.getElementById(`${prefix}SalaryPane`)?.classList.toggle('hidden', tab !== 'salary');
  try { localStorage.setItem(`meridian.${prefix}Tab`, tab); } catch {}
}
function currentPaneTab(prefix) { try { return localStorage.getItem(`meridian.${prefix}Tab`) === 'salary' ? 'salary' : 'commissions'; } catch { return 'commissions'; } }
document.querySelectorAll('[data-bc-tab]').forEach(b => b.addEventListener('click', () => showPaneTab('bc', b.dataset.bcTab)));
document.querySelectorAll('[data-cm-tab]').forEach(b => b.addEventListener('click', () => showPaneTab('cm', b.dataset.cmTab)));
