/**
 * CFO Finance workspace — entity switcher, section nav, ledger shells
 * Depends: admin.js globals, roles.js, finance-reports.js, finance-payroll.js
 */

const FIN_ENTITY_STORAGE_KEY = 'kw_fin_entity';
const FIN_DEFAULT_ENTITY = 'SHOP';

const FIN_SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'statements', label: 'Statements' },
  { id: 'reports', label: 'Reports' },
  { id: 'banking', label: 'Banking' },
  { id: 'petty-cash', label: 'Petty cash' },
  { id: 'sales-ar', label: 'Sales & AR' },
  { id: 'purchases-ap', label: 'Purchases & AP' },
  { id: 'subscriptions', label: 'Subscriptions' },
  { id: 'payroll', label: 'Payroll' },
  { id: 'fixed-assets', label: 'Fixed assets' },
  { id: 'tax', label: 'Tax' },
  { id: 'journals', label: 'Journals' },
  { id: 'ratios', label: 'Ratios' },
  { id: 'settings', label: 'Settings' }
];

const FIN_ENTITY_OPTIONS = [
  { value: 'SHOP', label: 'Subsidiary (shop)' },
  { value: 'PARENT', label: 'Parent' },
  { value: 'consolidated', label: 'Consolidated' }
];

let finJournalRealtime = null;

function finEscapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function finCanWrite() {
  const role = typeof getCurrentRole === 'function' ? getCurrentRole() : currentUserProfile?.role;
  return role === 'cfo' || role === 'owner';
}

function finShowReadOnlyBadge() {
  const role = typeof getCurrentRole === 'function' ? getCurrentRole() : currentUserProfile?.role;
  return role === 'ceo';
}

function parseFinanceRoute(page) {
  const raw = String(page || 'finance');
  const [pathPart, queryPart] = raw.split('?');
  const path = pathPart.replace(/^finance\/?/, '') || '';
  const parts = path.split('/').filter(Boolean);
  const section = parts[0] || 'overview';
  const recordId = parts[1] || null;

  let entity = localStorage.getItem(FIN_ENTITY_STORAGE_KEY) || FIN_DEFAULT_ENTITY;
  if (queryPart) {
    const params = new URLSearchParams(queryPart);
    if (params.get('entity')) entity = params.get('entity');
  }

  return { section, recordId, entity, fullRoute: raw };
}

function getFinEntity() {
  return localStorage.getItem(FIN_ENTITY_STORAGE_KEY) || FIN_DEFAULT_ENTITY;
}

function setFinEntity(entity) {
  localStorage.setItem(FIN_ENTITY_STORAGE_KEY, entity);
}

function finNavigate(section, recordId, options = {}) {
  const entity = options.entity || getFinEntity();
  setFinEntity(entity);
  let route = `finance/${section}`;
  if (recordId) route += `/${recordId}`;
  route += `?entity=${encodeURIComponent(entity)}`;
  navigateToRoute(route);
}

window.finNavigate = finNavigate;

function finApplyWriteVisibility(root) {
  const canWrite = finCanWrite();
  root.querySelectorAll('.fin-can-write').forEach((el) => {
    el.style.display = canWrite ? '' : 'none';
  });
}

function finExportCsv(filename, rows, columns) {
  if (!rows?.length) return;
  const header = columns.map((c) => c.label).join(',');
  const lines = rows.map((row) =>
    columns
      .map((c) => {
        const v = row[c.key];
        const s = v == null ? '' : String(v).replace(/"/g, '""');
        return s.includes(',') ? `"${s}"` : s;
      })
      .join(',')
  );
  const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

window.finExportCsv = finExportCsv;

function finWorkspaceShell(ctx) {
  const readOnly = finShowReadOnlyBadge();
  const entityOpts = FIN_ENTITY_OPTIONS.map(
    (o) => `<option value="${finEscapeHtml(o.value)}" ${o.value === ctx.entity ? 'selected' : ''}>${finEscapeHtml(o.label)}</option>`
  ).join('');

  const tabs = FIN_SECTIONS.map(
    (s) => `
    <button type="button" class="fin-section-tab ${s.id === ctx.section ? 'active' : ''}"
      onclick="finNavigate('${s.id}')">${finEscapeHtml(s.label)}</button>`
  ).join('');

  return `
    <div class="fin-workspace" id="finWorkspace">
      <div class="fin-toolbar">
        <div class="fin-toolbar-left">
          <div class="fin-entity-switcher">
            <label for="finEntitySelect">Entity</label>
            <select id="finEntitySelect" onchange="finOnEntityChange(this.value)">${entityOpts}</select>
          </div>
          ${readOnly ? '<span class="fin-readonly-badge" title="CEO view is read-only">Read-only</span>' : ''}
        </div>
        <div class="fin-toolbar-right fin-can-write">
          <button type="button" class="btn btn-outline" onclick="finRefreshSection()">Refresh</button>
        </div>
      </div>
      <nav class="fin-section-nav" aria-label="Finance sections">${tabs}</nav>
      <div class="fin-body" id="finSectionRoot"></div>
    </div>`;
}

function finOnEntityChange(entity) {
  setFinEntity(entity);
  const ctx = window.__finCtx;
  if (ctx) finNavigate(ctx.section, ctx.recordId, { entity });
}

window.finOnEntityChange = finOnEntityChange;

function finRefreshSection() {
  const ctx = window.__finCtx;
  if (ctx) loadFinancePage(ctx.fullRoute);
}

window.finRefreshSection = finRefreshSection;

async function loadFinancePage(page) {
  const content = document.getElementById('contentArea');
  if (!content) return;

  const ctx = parseFinanceRoute(page || 'finance');
  setFinEntity(ctx.entity);
  window.__finCtx = ctx;

  content.innerHTML = finWorkspaceShell(ctx);
  finApplyWriteVisibility(content);

  const root = document.getElementById('finSectionRoot');
  if (!root) return;

  finUnsubscribeJournalRealtime();

  switch (ctx.section) {
    case 'overview':
      await finSectionOverview(root, ctx);
      break;
    case 'statements':
      if (typeof loadFinanceStatementsSection === 'function') {
        await loadFinanceStatementsSection(root, ctx);
      }
      break;
    case 'reports':
      if (typeof loadFinanceReportsSection === 'function') {
        await loadFinanceReportsSection(root, ctx);
      }
      break;
    case 'payroll':
      if (typeof loadFinancePayrollSection === 'function') {
        await loadFinancePayrollSection(root, ctx);
      }
      break;
    case 'settings':
      await finSectionSettings(root, ctx);
      break;
    case 'banking':
      await finSectionTableShell(root, ctx, {
        title: 'Bank accounts',
        table: 'fin_bank_accounts',
        columns: [
          { key: 'name', label: 'Name' },
          { key: 'kind', label: 'Kind' },
          { key: 'currency_code', label: 'CCY' },
          { key: 'balance', label: 'Balance', num: true, fmt: 'currency' }
        ],
        newLabel: 'Add account'
      });
      break;
    case 'petty-cash':
      await finSectionTableShell(root, ctx, {
        title: 'Petty cash floats',
        table: 'fin_petty_cash_floats',
        columns: [
          { key: 'code', label: 'Code' },
          { key: 'custodian', label: 'Custodian' },
          { key: 'balance', label: 'Balance', num: true, fmt: 'currency' }
        ]
      });
      break;
    case 'sales-ar':
      await finSectionTableShell(root, ctx, {
        title: 'Accounts receivable',
        table: 'fin_ar_invoices',
        columns: [
          { key: 'doc_no', label: 'Invoice' },
          { key: 'due_date', label: 'Due', fmt: 'date' },
          { key: 'status', label: 'Status', badge: true },
          { key: 'balance', label: 'Balance', num: true, fmt: 'currency' }
        ]
      });
      break;
    case 'purchases-ap':
      await finSectionTableShell(root, ctx, {
        title: 'Accounts payable',
        table: 'fin_ap_bills',
        columns: [
          { key: 'doc_no', label: 'Bill' },
          { key: 'due_date', label: 'Due', fmt: 'date' },
          { key: 'status', label: 'Status', badge: true },
          { key: 'balance', label: 'Balance', num: true, fmt: 'currency' }
        ]
      });
      break;
    case 'subscriptions':
      await finSectionTableShell(root, ctx, {
        title: 'Subscriptions',
        table: 'fin_subscriptions',
        columns: [
          { key: 'service_name', label: 'Service' },
          { key: 'renewal_date', label: 'Renewal', fmt: 'date' },
          { key: 'amount', label: 'Amount', num: true, fmt: 'currency' }
        ]
      });
      break;
    case 'fixed-assets':
      await finSectionTableShell(root, ctx, {
        title: 'Fixed assets register',
        table: 'fin_fixed_assets',
        columns: [
          { key: 'asset_code', label: 'Code' },
          { key: 'description', label: 'Description' },
          { key: 'status', label: 'Status', badge: true },
          { key: 'nbv', label: 'NBV', num: true, fmt: 'currency' }
        ]
      });
      break;
    case 'tax':
      await finSectionTableShell(root, ctx, {
        title: 'Tax returns & filings',
        table: 'fin_tax_filings',
        columns: [
          { key: 'period_code', label: 'Period' },
          { key: 'tax_type', label: 'Type' },
          { key: 'status', label: 'Status', badge: true },
          { key: 'amount', label: 'Amount', num: true, fmt: 'currency' }
        ]
      });
      break;
    case 'journals':
      await finSectionJournals(root, ctx);
      break;
    case 'ratios':
      await finSectionRatios(root, ctx);
      break;
    default:
      root.innerHTML = '<div class="fin-empty"><p>Section not found.</p></div>';
  }

  finApplyWriteVisibility(content);
}

window.loadFinancePage = loadFinancePage;

async function finSectionOverview(root, ctx) {
  root.innerHTML = `
    <div class="fin-tiles" id="finOverviewTiles">
      <div class="fin-tile"><div class="fin-tile-value" id="finTileRevenue">—</div><div class="fin-tile-label">Revenue MTD</div></div>
      <div class="fin-tile"><div class="fin-tile-value" id="finTileExpenses">—</div><div class="fin-tile-label">Expenses MTD</div></div>
      <div class="fin-tile"><div class="fin-tile-value" id="finTileCash">—</div><div class="fin-tile-label">Cash position</div></div>
      <div class="fin-tile"><div class="fin-tile-value" id="finTileDraftJournals">—</div><div class="fin-tile-label">Draft journals</div></div>
    </div>
    <div class="fin-panel">
      <div class="fin-panel-header"><h3>Advisory (rule-based)</h3></div>
      <div class="fin-panel-body" id="finAdvisoryBody"><p class="fin-empty">Evaluating…</p></div>
    </div>
    <div class="fin-panel">
      <div class="fin-panel-header"><h3>Data health</h3></div>
      <div class="fin-panel-body" id="finHealthBody"><p class="fin-empty">Checking…</p></div>
    </div>
    <div class="fin-panel">
      <div class="fin-panel-header"><h3>Recent journal activity</h3></div>
      <div class="fin-panel-body fin-table-wrap" id="finRecentJournals"><p class="fin-empty">Loading…</p></div>
    </div>`;

  await finOverviewLoadTiles(ctx);
  await finOverviewAdvisory(ctx);
  await finOverviewHealth(ctx);
  await finOverviewRecentJournals(ctx);
  finSubscribeJournalRealtime(ctx);
}

async function finOverviewLoadTiles(ctx) {
  try {
    const { data, error } = await supabaseClient.rpc('fin_insights', { p_entity: ctx.entity });
    if (!error && data && typeof data === 'object') {
      if (data.revenue_mtd != null) document.getElementById('finTileRevenue').textContent = formatCurrency(data.revenue_mtd);
      if (data.expenses_mtd != null) document.getElementById('finTileExpenses').textContent = formatCurrency(data.expenses_mtd);
      if (data.cash_position != null) document.getElementById('finTileCash').textContent = formatCurrency(data.cash_position);
    }
  } catch (_) {
    /* RPC optional */
  }

  const { count } = await supabaseClient
    .from('fin_journal_entries')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'draft');
  if (count != null) document.getElementById('finTileDraftJournals').textContent = String(count);
}

async function finOverviewAdvisory(ctx) {
  const body = document.getElementById('finAdvisoryBody');
  const rules = [];

  const draftEl = document.getElementById('finTileDraftJournals');
  const drafts = parseInt(draftEl?.textContent || '0', 10);
  if (drafts > 0) {
    rules.push({
      severity: 'warn',
      text: `${drafts} draft journal(s) await review before period close.`
    });
  }

  try {
    const { data } = await supabaseClient.rpc('fin_insights', { p_entity: ctx.entity });
    if (Array.isArray(data)) {
      data.forEach((row) => {
        rules.push({
          severity: row.severity || 'info',
          text: row.message || row.title || 'Insight'
        });
      });
    }
  } catch (_) {
    /* optional */
  }

  if (!rules.length) {
    rules.push({
      severity: 'info',
      text: 'No rule triggers fired. Connect ledgers and bank feeds to enable deeper checks.'
    });
  }

  body.innerHTML = rules
    .map(
      (r) => `
    <div class="fin-insight-card">
      <span class="fin-insight-severity ${finEscapeHtml(r.severity)}">${finEscapeHtml(r.severity)}</span>
      <p style="margin:0;">${finEscapeHtml(r.text)}</p>
    </div>`
    )
    .join('');
}

async function finOverviewHealth(ctx) {
  const body = document.getElementById('finHealthBody');
  let health = null;
  try {
    const { data, error } = await supabaseClient.rpc('fin_data_health', { p_entity: ctx.entity });
    if (!error) health = data;
  } catch (_) {
    /* optional */
  }

  if (!health) {
    const counts = await finOverviewHealthCounts();
    body.innerHTML = `
      <ul style="margin:0;padding-left:18px;line-height:1.6;">
        <li>Unposted journals: <strong>${counts.drafts}</strong></li>
        <li>Entities configured: <strong>${counts.entities}</strong></li>
        <li>Open periods: <strong>${counts.periods}</strong></li>
      </ul>`;
    return;
  }

  body.innerHTML = `<pre style="margin:0;font-size:13px;white-space:pre-wrap;">${finEscapeHtml(JSON.stringify(health, null, 2))}</pre>`;
}

async function finOverviewHealthCounts() {
  const out = { drafts: 0, entities: 0, periods: 0 };
  const d = await supabaseClient.from('fin_journal_entries').select('id', { count: 'exact', head: true }).eq('status', 'draft');
  if (d.count != null) out.drafts = d.count;
  const e = await supabaseClient.from('fin_entities').select('id', { count: 'exact', head: true });
  if (e.count != null) out.entities = e.count;
  const p = await supabaseClient.from('fin_periods').select('id', { count: 'exact', head: true }).eq('status', 'open');
  if (p.count != null) out.periods = p.count;
  return out;
}

async function finOverviewRecentJournals(ctx) {
  const host = document.getElementById('finRecentJournals');
  const { data, error } = await supabaseClient
    .from('fin_journal_entries')
    .select('id, entry_no, status, description, posted_at, created_at')
    .order('created_at', { ascending: false })
    .limit(15);

  if (error || !data?.length) {
    host.innerHTML = '<p class="fin-empty">No journal entries yet.</p>';
    return;
  }

  host.innerHTML = `
    <table class="fin-statement-table">
      <thead><tr><th>Entry</th><th>Status</th><th>Memo</th><th>Date</th></tr></thead>
      <tbody>
        ${data
          .map(
            (j) => `
          <tr>
            <td><button type="button" class="btn btn-outline" style="padding:2px 8px;font-size:12px;" onclick="finNavigate('journals','${j.id}')">${finEscapeHtml(j.entry_no || j.id.slice(0, 8))}</button></td>
            <td><span class="fin-badge ${j.status === 'posted' ? 'posted' : 'draft'}">${finEscapeHtml(j.status)}</span></td>
            <td>${finEscapeHtml(j.description || '—')}</td>
            <td>${formatDate(j.posted_at || j.created_at)}</td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>`;
}

function finSubscribeJournalRealtime(ctx) {
  if (!supabaseClient?.channel) return;
  finJournalRealtime = supabaseClient
    .channel(`fin-journal-${ctx.entity}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'fin_journal_entries' },
      () => {
        finOverviewRecentJournals(ctx);
        finOverviewLoadTiles(ctx);
      }
    )
    .subscribe();
}

function finUnsubscribeJournalRealtime() {
  if (finJournalRealtime) {
    supabaseClient.removeChannel(finJournalRealtime);
    finJournalRealtime = null;
  }
}

async function finSectionJournals(root, ctx) {
  await finSectionTableShell(root, ctx, {
    title: 'Journal entries',
    table: 'fin_journal_entries',
    columns: [
      { key: 'entry_no', label: 'Entry' },
      { key: 'status', label: 'Status', badge: true },
      { key: 'description', label: 'Memo' },
      { key: 'posted_at', label: 'Posted', fmt: 'date' }
    ],
    newLabel: 'New journal',
    detailId: ctx.recordId
  });
}

async function finSectionRatios(root, ctx) {
  root.innerHTML = `
    <div class="fin-panel">
      <div class="fin-panel-header"><h3>Key ratios</h3></div>
      <div class="fin-panel-body" id="finRatiosBody"><p class="fin-empty">Loading…</p></div>
    </div>`;

  let ratios = null;
  try {
    const { data, error } = await supabaseClient.rpc('fin_ratios', { p_entity: ctx.entity });
    if (!error) ratios = data;
  } catch (_) {
    /* optional */
  }

  const body = document.getElementById('finRatiosBody');
  if (!ratios || (Array.isArray(ratios) && !ratios.length)) {
    body.innerHTML =
      '<p class="fin-empty">Ratios will populate once trial balance and balance sheet reports have data.</p>';
    return;
  }

  const rows = Array.isArray(ratios) ? ratios : Object.entries(ratios).map(([k, v]) => ({ name: k, value: v }));
  body.innerHTML = `
    <table class="fin-statement-table">
      <thead><tr><th>Ratio</th><th class="num">Value</th></tr></thead>
      <tbody>
        ${rows
          .map(
            (r) => `
          <tr>
            <td>${finEscapeHtml(r.name || r.label)}</td>
            <td class="num">${finEscapeHtml(String(r.value ?? r.amount ?? '—'))}</td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>`;
}

async function finSectionSettings(root, ctx) {
  root.innerHTML = `
    <div class="fin-panel">
      <div class="fin-panel-header">
        <h3>Chart of accounts</h3>
        <button type="button" class="btn btn-outline" onclick="finSettingsExportCoa()">Export CSV</button>
      </div>
      <div class="fin-panel-body fin-table-wrap" id="finCoaBody"><p class="fin-empty">Loading…</p></div>
    </div>
    <div class="fin-panel">
      <div class="fin-panel-header"><h3>Accounting periods</h3></div>
      <div class="fin-panel-body fin-table-wrap" id="finPeriodsBody"><p class="fin-empty">Loading…</p></div>
    </div>
    <div class="fin-panel">
      <div class="fin-panel-header"><h3>Entities</h3></div>
      <div class="fin-panel-body fin-table-wrap" id="finEntitiesBody"><p class="fin-empty">Loading…</p></div>
    </div>
    <div class="fin-panel">
      <div class="fin-panel-header">
        <h3>Intercompany queue</h3>
        <button type="button" class="btn btn-primary fin-can-write" onclick="finProposeEliminations()">Propose eliminations</button>
      </div>
      <div class="fin-panel-body" id="finIcBody"><p class="fin-empty">Loading…</p></div>
    </div>
    <div class="fin-panel">
      <div class="fin-panel-header"><h3>Capital injection wizard</h3></div>
      <div class="fin-panel-body">
        <p style="margin-top:0;">Shell for parent → subsidiary equity injections. Journals will post when capitalization policy is confirmed.</p>
        <button type="button" class="btn btn-outline fin-can-write" disabled>Start wizard (coming soon)</button>
      </div>
    </div>
    <div class="fin-panel">
      <div class="fin-panel-header"><h3>Onboarding checklist</h3></div>
      <div class="fin-panel-body">
        <ul class="fin-checklist">
          <li><input type="checkbox" disabled> Entities & consolidation group</li>
          <li><input type="checkbox" disabled> CoA imported</li>
          <li><input type="checkbox" disabled> Opening balances posted</li>
          <li><input type="checkbox" disabled> Bank feeds connected</li>
          <li><input type="checkbox" disabled> VAT settings verified</li>
        </ul>
      </div>
    </div>`;

  await finSettingsLoadCoa();
  await finSettingsLoadPeriods();
  await finSettingsLoadEntities();
  await finSettingsLoadIc();
}

async function finSettingsLoadCoa() {
  const host = document.getElementById('finCoaBody');
  const { data, error } = await supabaseClient
    .from('fin_accounts')
    .select('code, name, account_type, is_active')
    .order('code')
    .limit(500);

  if (error || !data?.length) {
    host.innerHTML = '<p class="fin-empty">No accounts configured.</p>';
    window.__finCoaRows = [];
    return;
  }
  window.__finCoaRows = data;
  host.innerHTML = `
    <table class="fin-statement-table">
      <thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Active</th></tr></thead>
      <tbody>
        ${data
          .map(
            (a) => `
          <tr>
            <td>${finEscapeHtml(a.code)}</td>
            <td>${finEscapeHtml(a.name)}</td>
            <td>${finEscapeHtml(a.account_type)}</td>
            <td>${a.is_active ? 'Yes' : 'No'}</td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>`;
}

async function finSettingsLoadPeriods() {
  const host = document.getElementById('finPeriodsBody');
  const { data, error } = await supabaseClient
    .from('fin_periods')
    .select('code, label, status, starts_on, ends_on')
    .order('starts_on', { ascending: false })
    .limit(36);

  if (error || !data?.length) {
    host.innerHTML = '<p class="fin-empty">No periods defined.</p>';
    return;
  }

  host.innerHTML = `
    <table class="fin-statement-table">
      <thead><tr><th>Code</th><th>Label</th><th>Status</th><th>Range</th></tr></thead>
      <tbody>
        ${data
          .map(
            (p) => `
          <tr>
            <td>${finEscapeHtml(p.code)}</td>
            <td>${finEscapeHtml(p.label || '—')}</td>
            <td><span class="fin-badge ${p.status === 'open' ? 'posted' : 'draft'}">${finEscapeHtml(p.status)}</span></td>
            <td>${formatDate(p.starts_on)} – ${formatDate(p.ends_on)}</td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>`;
}

async function finSettingsLoadEntities() {
  const host = document.getElementById('finEntitiesBody');
  const { data, error } = await supabaseClient
    .from('fin_entities')
    .select('code, trading_name, entity_type, is_reporting_entity')
    .order('code');

  if (error || !data?.length) {
    host.innerHTML = '<p class="fin-empty">No entities found.</p>';
    return;
  }

  host.innerHTML = `
    <table class="fin-statement-table">
      <thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Reporting</th></tr></thead>
      <tbody>
        ${data
          .map(
            (e) => `
          <tr>
            <td>${finEscapeHtml(e.code)}</td>
            <td>${finEscapeHtml(e.trading_name || '—')}</td>
            <td>${finEscapeHtml(e.entity_type)}</td>
            <td>${e.is_reporting_entity ? 'Yes' : 'No'}</td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>`;
}

async function finSettingsLoadIc() {
  const host = document.getElementById('finIcBody');
  const { data, error } = await supabaseClient
    .from('fin_intercompany_queue')
    .select('id, from_entity, to_entity, amount, status, memo')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error || !data?.length) {
    host.innerHTML = '<p class="fin-empty">Intercompany queue is empty.</p>';
    return;
  }

  host.innerHTML = `
    <table class="fin-statement-table">
      <thead><tr><th>From</th><th>To</th><th class="num">Amount</th><th>Status</th><th>Memo</th></tr></thead>
      <tbody>
        ${data
          .map(
            (r) => `
          <tr>
            <td>${finEscapeHtml(r.from_entity)}</td>
            <td>${finEscapeHtml(r.to_entity)}</td>
            <td class="num">${formatCurrency(r.amount)}</td>
            <td><span class="fin-badge draft">${finEscapeHtml(r.status)}</span></td>
            <td>${finEscapeHtml(r.memo || '—')}</td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>`;
}

async function finProposeEliminations() {
  if (!finCanWrite()) return;
  try {
    const { data, error } = await supabaseClient.rpc('fin_propose_eliminations', {
      p_entity: getFinEntity()
    });
    if (error) throw error;
    alert(data?.message || 'Elimination proposals generated. Review in intercompany queue.');
    finSettingsLoadIc();
  } catch (e) {
    alert('Could not propose eliminations: ' + (e.message || 'RPC not deployed yet.'));
  }
}

window.finProposeEliminations = finProposeEliminations;

function finSettingsExportCoa() {
  const rows = window.__finCoaRows || [];
  finExportCsv('chart-of-accounts.csv', rows, [
    { key: 'code', label: 'Code' },
    { key: 'name', label: 'Name' },
    { key: 'account_type', label: 'Type' },
    { key: 'is_active', label: 'Active' }
  ]);
}

window.finSettingsExportCoa = finSettingsExportCoa;

async function finSectionTableShell(root, ctx, spec) {
  const tableId = `finTbl_${spec.table}`;
  const write = finCanWrite();

  root.innerHTML = `
    <div class="fin-panel">
      <div class="fin-panel-header">
        <h3>${finEscapeHtml(spec.title)}</h3>
        <div class="fin-actions">
          ${write && spec.newLabel ? `<button type="button" class="btn btn-primary fin-can-write" onclick="finTableNew('${finEscapeHtml(spec.table)}')">${finEscapeHtml(spec.newLabel)}</button>` : ''}
          <button type="button" class="btn btn-outline" onclick="finTableExport('${finEscapeHtml(spec.table)}')">Export CSV</button>
        </div>
      </div>
      <div class="fin-filters">
        <input type="search" class="fin-search" id="${tableId}_search" placeholder="Filter rows…" oninput="finTableFilter('${tableId}')">
        <select id="${tableId}_status" onchange="finTableReload('${finEscapeHtml(spec.table)}','${tableId}')">
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="posted">Posted</option>
          <option value="approved">Approved</option>
        </select>
      </div>
      <div class="fin-panel-body fin-table-wrap">
        <table class="fin-statement-table">
          <thead><tr>
            ${spec.columns.map((c) => `<th class="${c.num ? 'num' : ''}">${finEscapeHtml(c.label)}</th>`).join('')}
          </tr></thead>
          <tbody id="${tableId}"><tr><td colspan="${spec.columns.length}">Loading…</td></tr></tbody>
        </table>
      </div>
    </div>
    ${spec.detailId ? `<div class="fin-drill-panel" id="finDetailPanel">Detail: ${finEscapeHtml(spec.detailId)}</div>` : ''}`;

  window.__finTableSpec = window.__finTableSpec || {};
  window.__finTableSpec[spec.table] = spec;
  await finTableReload(spec.table, tableId);
}

async function finTableReload(table, tableId) {
  const spec = window.__finTableSpec?.[table];
  const tbody = document.getElementById(tableId);
  if (!spec || !tbody) return;

  let query = supabaseClient.from(table).select('*').limit(200);
  const status = document.getElementById(`${tableId}_status`)?.value;
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error || !data?.length) {
    tbody.innerHTML = `<tr><td colspan="${spec.columns.length}" class="fin-empty">No records yet.</td></tr>`;
    window.__finTableRows = window.__finTableRows || {};
    window.__finTableRows[table] = [];
    return;
  }

  window.__finTableRows = window.__finTableRows || {};
  window.__finTableRows[table] = data;

  tbody.innerHTML = data
    .map((row) => {
      const search = spec.columns.map((c) => row[c.key]).join(' ').toLowerCase();
      const cells = spec.columns
        .map((c) => {
          let val = row[c.key];
          if (c.fmt === 'currency') val = formatCurrency(val);
          else if (c.fmt === 'date') val = formatDate(val);
          else if (c.badge) {
            const cls = val === 'posted' || val === 'paid' ? 'posted' : 'draft';
            return `<td><span class="fin-badge ${cls}">${finEscapeHtml(String(val ?? '—'))}</span></td>`;
          } else val = val ?? '—';
          return `<td class="${c.num ? 'num' : ''}">${finEscapeHtml(String(val))}</td>`;
        })
        .join('');
      return `<tr data-search="${finEscapeHtml(search)}">${cells}</tr>`;
    })
    .join('');
}

function finTableFilter(tableId) {
  const q = (document.getElementById(`${tableId}_search`)?.value || '').toLowerCase();
  document.querySelectorAll(`#${tableId} tr`).forEach((tr) => {
    const hay = tr.dataset.search || '';
    tr.style.display = !q || hay.includes(q) ? '' : 'none';
  });
}

window.finTableFilter = finTableFilter;
window.finTableReload = finTableReload;

function finTableExport(table) {
  const spec = window.__finTableSpec?.[table];
  const rows = window.__finTableRows?.[table] || [];
  if (!spec || !rows.length) {
    alert('Nothing to export.');
    return;
  }
  finExportCsv(`${table}.csv`, rows, spec.columns.map((c) => ({ key: c.key, label: c.label })));
}

window.finTableExport = finTableExport;

function finTableNew(table) {
  if (!finCanWrite()) return;
  alert(`Create flow for ${table} will open here.`);
}

window.finTableNew = finTableNew;