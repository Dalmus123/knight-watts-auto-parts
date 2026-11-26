/**
 * CFO finance — statements & management reports (SCI, SoFP, CF, TB, GL, aged AR/AP, etc.)
 * Depends: finance.js helpers, supabaseClient, formatCurrency, formatDate
 */

const FIN_REPORT_TYPES = [
  { id: 'tb', label: 'Trial balance' },
  { id: 'gl', label: 'General ledger' },
  { id: 'sci', label: 'Income (SCI)' },
  { id: 'sofp', label: 'Financial position' },
  { id: 'cf', label: 'Cash flow' },
  { id: 'equity', label: 'Equity' },
  { id: 'notes', label: 'Notes' },
  { id: 'ar-aged', label: 'Aged AR' },
  { id: 'ap-aged', label: 'Aged AP' },
  { id: 'worksheet', label: 'Consol. worksheet', consolidatedOnly: true }
];

function finReportsEscape(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function loadFinanceReportsSection(container, ctx) {
  const entity = ctx.entity;
  const canConsolidated = entity === 'consolidated';
  const activeReport = ctx.recordId || 'tb';

  container.innerHTML = `
    <div class="fin-report-tabs" id="finReportTabs">
      ${FIN_REPORT_TYPES.filter((r) => !r.consolidatedOnly || canConsolidated)
        .map(
          (r) => `
        <button type="button" class="${r.id === activeReport ? 'active' : ''}"
          data-report="${r.id}"
          onclick="finReportsSelect('${r.id}')">${finReportsEscape(r.label)}</button>`
        )
        .join('')}
    </div>
  <div class="fin-filters">
    <select id="finReportPeriod" class="filter-select" onchange="finReportsRefresh()">
      <option value="">Current period</option>
    </select>
    <select id="finReportSegment" class="filter-select" onchange="finReportsRefresh()">
      <option value="">All segments</option>
      <option value="ops">Operations</option>
      <option value="admin">Admin</option>
    </select>
    <button type="button" class="btn btn-outline" onclick="finReportsExportCsv()">Export CSV</button>
    <button type="button" class="btn btn-outline" onclick="finReportsExportPdfStub()">Export PDF</button>
  </div>
  <div class="fin-panel">
    <div class="fin-panel-header">
      <h3 id="finReportTitle">Report</h3>
      <span class="fin-badge posted">${finReportsEscape(entity)}</span>
    </div>
    <div class="fin-panel-body fin-table-wrap" id="finReportBody">
      <div class="fin-empty"><p>Loading report…</p></div>
    </div>
  </div>
  <div id="finReportDrill" class="fin-drill-panel" style="display:none;"></div>`;

  await finReportsLoadPeriods();
  window.__finReportCtx = { ...ctx, activeReport };
  await finReportsRefresh();
}

function finReportsSelect(reportId) {
  window.finNavigate('reports', reportId);
}

async function finReportsLoadPeriods() {
  const sel = document.getElementById('finReportPeriod');
  if (!sel) return;
  const { data, error } = await supabaseClient
    .from('fin_periods')
    .select('id, code, label, status')
    .order('code', { ascending: false })
    .limit(24);
  if (error || !data?.length) return;
  data.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.code || p.label || 'Period'} (${p.status || 'open'})`;
    sel.appendChild(opt);
  });
}

async function finReportsRefresh() {
  const ctx = window.__finReportCtx;
  if (!ctx) return;
  const body = document.getElementById('finReportBody');
  const title = document.getElementById('finReportTitle');
  if (!body) return;

  const reportId = ctx.activeReport || 'tb';
  const typeMeta = FIN_REPORT_TYPES.find((r) => r.id === reportId);
  if (title && typeMeta) title.textContent = typeMeta.label;

  const periodId = document.getElementById('finReportPeriod')?.value || null;
  const segment = document.getElementById('finReportSegment')?.value || null;

  body.innerHTML = '<div class="fin-empty"><p>Loading…</p></div>';

  const rows = await finReportsFetch(reportId, {
    entity: ctx.entity,
    periodId,
    segment
  });

  if (!rows.length) {
    body.innerHTML =
      '<div class="fin-empty"><p>No data for this report yet. Post journals or run period close when the ledger is live.</p></div>';
    window.__finReportRows = [];
    return;
  }

  window.__finReportRows = rows;
  body.innerHTML = finReportsRenderTable(reportId, rows);
}

async function finReportsFetch(reportId, opts) {
  const rpcMap = {
    tb: 'fin_report_tb',
    sci: 'fin_report_sci',
    sofp: 'fin_report_sofp',
    cf: 'fin_report_cf'
  };

  const rpc = rpcMap[reportId];
  if (rpc) {
    try {
      const { data, error } = await supabaseClient.rpc(rpc, {
        p_entity: opts.entity,
        p_period_id: opts.periodId,
        p_segment: opts.segment
      });
      if (!error && Array.isArray(data)) return data;
    } catch (_) {
      /* schema may not be deployed */
    }
  }

  if (reportId === 'gl') {
    const { data, error } = await supabaseClient
      .from('fin_journal_lines')
      .select('id, account_code, description, debit, credit, posted_at, entry_id')
      .order('posted_at', { ascending: false })
      .limit(200);
    if (!error && data?.length) {
      return data.map((r) => ({
        account_code: r.account_code,
        description: r.description,
        debit: r.debit,
        credit: r.credit,
        date: r.posted_at,
        entry_id: r.entry_id
      }));
    }
  }

  if (reportId === 'ar-aged' || reportId === 'ap-aged') {
    const table = reportId === 'ar-aged' ? 'fin_ar_invoices' : 'fin_ap_bills';
    const { data, error } = await supabaseClient
      .from(table)
      .select('id, doc_no, due_date, status, balance')
      .order('due_date', { ascending: true })
      .limit(100);
    if (!error && data?.length) return data;
  }

  return [];
}

function finReportsRenderTable(reportId, rows) {
  const headers = finReportsHeaders(reportId);
  const head = headers.map((h) => `<th class="${h.num ? 'num' : ''}">${finReportsEscape(h.label)}</th>`).join('');
  const body = rows
    .map((row) => {
      const cells = headers
        .map((h) => {
          let val = row[h.key];
          if (h.fmt === 'currency') val = formatCurrency(val);
          else if (h.fmt === 'date') val = formatDate(val);
          else val = val ?? '—';
          const trace = h.key === 'account_code' || h.key === 'entry_id';
          if (trace && row[h.key]) {
            return `<td class="${h.num ? 'num' : ''}"><button type="button" class="btn btn-outline" style="padding:4px 8px;font-size:12px;" onclick="finReportsTrace('${finReportsEscape(String(row[h.key]))}')">${finReportsEscape(String(val))}</button></td>`;
          }
          return `<td class="${h.num ? 'num' : ''}">${finReportsEscape(String(val))}</td>`;
        })
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  return `<table class="fin-statement-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function finReportsHeaders(reportId) {
  const tb = [
    { key: 'account_code', label: 'Account' },
    { key: 'account_name', label: 'Name' },
    { key: 'debit', label: 'Debit', num: true, fmt: 'currency' },
    { key: 'credit', label: 'Credit', num: true, fmt: 'currency' }
  ];
  const map = {
    tb,
    gl: [
      { key: 'date', label: 'Date', fmt: 'date' },
      { key: 'account_code', label: 'Account' },
      { key: 'description', label: 'Memo' },
      { key: 'debit', label: 'Debit', num: true, fmt: 'currency' },
      { key: 'credit', label: 'Credit', num: true, fmt: 'currency' },
      { key: 'entry_id', label: 'Entry' }
    ],
    sci: [
      { key: 'line_label', label: 'Line' },
      { key: 'amount', label: 'Amount', num: true, fmt: 'currency' }
    ],
    sofp: [
      { key: 'line_label', label: 'Line' },
      { key: 'amount', label: 'Amount', num: true, fmt: 'currency' }
    ],
    cf: [
      { key: 'line_label', label: 'Line' },
      { key: 'amount', label: 'Amount', num: true, fmt: 'currency' }
    ],
    equity: [
      { key: 'component', label: 'Component' },
      { key: 'amount', label: 'Amount', num: true, fmt: 'currency' }
    ],
    notes: [
      { key: 'note_ref', label: 'Ref' },
      { key: 'title', label: 'Title' },
      { key: 'body', label: 'Summary' }
    ],
    'ar-aged': [
      { key: 'doc_no', label: 'Doc' },
      { key: 'due_date', label: 'Due', fmt: 'date' },
      { key: 'status', label: 'Status' },
      { key: 'balance', label: 'Balance', num: true, fmt: 'currency' }
    ],
    'ap-aged': [
      { key: 'doc_no', label: 'Doc' },
      { key: 'due_date', label: 'Due', fmt: 'date' },
      { key: 'status', label: 'Status' },
      { key: 'balance', label: 'Balance', num: true, fmt: 'currency' }
    ],
    worksheet: [
      { key: 'account_code', label: 'Account' },
      { key: 'entity_amount', label: 'Entity', num: true, fmt: 'currency' },
      { key: 'elim_amount', label: 'Elimination', num: true, fmt: 'currency' },
      { key: 'group_amount', label: 'Group', num: true, fmt: 'currency' }
    ]
  };
  return map[reportId] || tb;
}

async function finReportsTrace(ref) {
  const panel = document.getElementById('finReportDrill');
  if (!panel) return;
  panel.style.display = 'block';
  panel.innerHTML = '<p>Tracing…</p>';

  try {
    const { data, error } = await supabaseClient.rpc('fin_trace', { p_ref: ref });
    if (error) throw error;
    panel.innerHTML = `<strong>Trace</strong><pre style="white-space:pre-wrap;margin:8px 0 0;font-size:12px;">${finReportsEscape(JSON.stringify(data, null, 2))}</pre>`;
  } catch (_) {
    panel.innerHTML = `<p>No trace available for <code>${finReportsEscape(ref)}</code>. Deploy <code>fin_trace</code> when ledger linking is live.</p>`;
  }
}

function finReportsExportCsv() {
  const rows = window.__finReportRows || [];
  const ctx = window.__finReportCtx;
  if (!rows.length) {
    alert('Nothing to export.');
    return;
  }
  const headers = finReportsHeaders(ctx?.activeReport || 'tb');
  if (typeof finExportCsv === 'function') {
    finExportCsv(`report-${ctx?.activeReport || 'tb'}.csv`, rows, headers);
  }
}

function finReportsExportPdfStub() {
  alert('PDF export will use the print stylesheet in a later release. Use CSV for now.');
}

async function loadFinanceStatementsSection(container, ctx) {
  container.innerHTML = `
    <div class="fin-banner">
      Primary financial statements open here. Use <strong>Reports</strong> for TB, GL, and aged listings.
    </div>
    <div class="fin-actions fin-can-write">
      <button type="button" class="btn btn-primary" onclick="finNavigate('reports','sci')">Income statement</button>
      <button type="button" class="btn btn-outline" onclick="finNavigate('reports','sofp')">Statement of position</button>
      <button type="button" class="btn btn-outline" onclick="finNavigate('reports','cf')">Cash flow</button>
      <button type="button" class="btn btn-outline" onclick="finNavigate('reports','equity')">Changes in equity</button>
    </div>
    <div id="finStatementsEmbed"></div>`;

  const embed = document.getElementById('finStatementsEmbed');
  if (embed && typeof loadFinanceReportsSection === 'function') {
    await loadFinanceReportsSection(embed, { ...ctx, recordId: 'sci' });
  }
}

window.loadFinanceReportsSection = loadFinanceReportsSection;
window.loadFinanceStatementsSection = loadFinanceStatementsSection;
window.finReportsSelect = finReportsSelect;
window.finReportsRefresh = finReportsRefresh;
window.finReportsTrace = finReportsTrace;
window.finReportsExportCsv = finReportsExportCsv;
window.finReportsExportPdfStub = finReportsExportPdfStub;