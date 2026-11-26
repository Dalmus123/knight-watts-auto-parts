/**
 * CFO finance — payroll (employees, runs, payslips, statutory exports)
 */

function finPayrollEscape(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function finPayrollCanWrite() {
  return typeof finCanWrite === 'function' && finCanWrite();
}

function finPayrollCanViewPayslips() {
  const role = typeof getCurrentRole === 'function' ? getCurrentRole() : null;
  if (role === 'cfo' || role === 'owner') return true;
  if (role === 'ceo') return true;
  return finPayrollCanWrite();
}

async function loadFinancePayrollSection(container, ctx) {
  const sub = ctx.recordId || 'runs';
  const tabs = [
    { id: 'employees', label: 'Employees' },
    { id: 'runs', label: 'Pay runs' },
    { id: 'payslips', label: 'Payslips' },
    { id: 'statutory', label: 'Statutory' }
  ];

  container.innerHTML = `
    <div class="fin-banner warn fin-payroll-statutory">
      Statutory rates and thresholds change frequently — <strong>verify rates before the first live run</strong>
      against current authority guidance.
    </div>
    <div class="fin-report-tabs">
      ${tabs
        .map(
          (t) => `
        <button type="button" class="${t.id === sub ? 'active' : ''}" onclick="finNavigate('payroll','${t.id}')">${t.label}</button>`
        )
        .join('')}
    </div>
    <div id="finPayrollPanel"></div>`;

  const panel = document.getElementById('finPayrollPanel');
  if (!panel) return;

  switch (sub) {
    case 'employees':
      await finPayrollEmployees(panel, ctx);
      break;
    case 'payslips':
      await finPayrollPayslips(panel, ctx);
      break;
    case 'statutory':
      await finPayrollStatutory(panel, ctx);
      break;
    case 'runs':
    default:
      await finPayrollRuns(panel, ctx);
      break;
  }
}

async function finPayrollEmployees(panel, ctx) {
  const write = finPayrollCanWrite();
  panel.innerHTML = `
    <div class="fin-panel">
      <div class="fin-panel-header">
        <h3>Employees</h3>
        ${write ? '<button type="button" class="btn btn-primary fin-can-write" onclick="finPayrollNewEmployee()">Add employee</button>' : ''}
      </div>
      <div class="fin-filters">
        <input type="search" class="fin-search" id="finPayrollEmpSearch" placeholder="Search…" oninput="finPayrollFilterTable('finPayrollEmpTbody')">
      </div>
      <div class="fin-panel-body fin-table-wrap">
        <table class="fin-statement-table">
          <thead><tr>
            <th>Code</th><th>Name</th><th>Status</th><th class="num">Base pay</th>
          </tr></thead>
          <tbody id="finPayrollEmpTbody"><tr><td colspan="4">Loading…</td></tr></tbody>
        </table>
      </div>
    </div>`;

  const { data, error } = await supabaseClient
    .from('fin_payroll_employees')
    .select('id, employee_code, display_name, status, base_pay')
    .order('employee_code')
    .limit(200);

  const tbody = document.getElementById('finPayrollEmpTbody');
  if (error || !data?.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="fin-empty">No employees yet.</td></tr>';
    return;
  }

  tbody.innerHTML = data
    .map(
      (e) => `
    <tr data-search="${finPayrollEscape(`${e.employee_code} ${e.display_name}`.toLowerCase())}">
      <td>${finPayrollEscape(e.employee_code)}</td>
      <td>${finPayrollEscape(e.display_name)}</td>
      <td><span class="fin-badge ${e.status === 'active' ? 'posted' : 'draft'}">${finPayrollEscape(e.status)}</span></td>
      <td class="num">${formatCurrency(e.base_pay)}</td>
    </tr>`
    )
    .join('');
}

async function finPayrollRuns(panel, ctx) {
  const write = finPayrollCanWrite();
  panel.innerHTML = `
    <div class="fin-panel">
      <div class="fin-panel-header">
        <h3>Pay runs</h3>
        ${write ? '<button type="button" class="btn btn-primary fin-can-write" onclick="finPayrollNewRun()">New draft run</button>' : ''}
      </div>
      <div class="fin-panel-body fin-table-wrap">
        <table class="fin-statement-table">
          <thead><tr>
            <th>Period</th><th>Status</th><th class="num">Net total</th><th>Updated</th>
          </tr></thead>
          <tbody id="finPayrollRunsTbody"><tr><td colspan="4">Loading…</td></tr></tbody>
        </table>
      </div>
    </div>`;

  const { data, error } = await supabaseClient
    .from('fin_payroll_runs')
    .select('id, period_code, status, net_total, updated_at')
    .order('updated_at', { ascending: false })
    .limit(50);

  const tbody = document.getElementById('finPayrollRunsTbody');
  if (error || !data?.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="fin-empty">No pay runs yet.</td></tr>';
    return;
  }

  tbody.innerHTML = data
    .map(
      (r) => `
    <tr>
      <td>${finPayrollEscape(r.period_code)}</td>
      <td><span class="fin-badge ${r.status === 'posted' ? 'posted' : 'draft'}">${finPayrollEscape(r.status)}</span></td>
      <td class="num">${formatCurrency(r.net_total)}</td>
      <td>${formatDate(r.updated_at)}</td>
    </tr>`
    )
    .join('');
}

async function finPayrollPayslips(panel, ctx) {
  if (!finPayrollCanViewPayslips()) {
    panel.innerHTML = '<div class="fin-empty"><p>Payslip access is restricted for your role.</p></div>';
    return;
  }

  panel.innerHTML = `
    <div class="fin-panel">
      <div class="fin-panel-header"><h3>Payslips</h3></div>
      <div class="fin-panel-body fin-table-wrap">
        <table class="fin-statement-table">
          <thead><tr>
            <th>Run</th><th>Employee</th><th class="num">Net</th><th></th>
          </tr></thead>
          <tbody id="finPayrollSlipTbody"><tr><td colspan="4">Loading…</td></tr></tbody>
        </table>
      </div>
    </div>`;

  const { data, error } = await supabaseClient
    .from('fin_payroll_payslips')
    .select('id, run_id, employee_code, net_pay, period_code')
    .order('period_code', { ascending: false })
    .limit(100);

  const tbody = document.getElementById('finPayrollSlipTbody');
  if (error || !data?.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="fin-empty">No payslips published yet.</td></tr>';
    return;
  }

  tbody.innerHTML = data
    .map(
      (s) => `
    <tr>
      <td>${finPayrollEscape(s.period_code)}</td>
      <td>${finPayrollEscape(s.employee_code)}</td>
      <td class="num">${formatCurrency(s.net_pay)}</td>
      <td><button type="button" class="btn btn-outline" onclick="finPayrollViewSlip('${s.id}')">View</button></td>
    </tr>`
    )
    .join('');
}

async function finPayrollStatutory(panel, ctx) {
  const write = finPayrollCanWrite();
  panel.innerHTML = `
    <div class="fin-panel">
      <div class="fin-panel-header">
        <h3>Statutory returns</h3>
        ${write ? '<button type="button" class="btn btn-outline fin-can-write" onclick="finPayrollExportStatutory()">Export draft file</button>' : ''}
      </div>
      <div class="fin-panel-body">
        <p class="fin-empty" style="text-align:left;padding:0;">Generate NSSF, NHIF, PAYE, and housing levy summaries from posted pay runs. Exports are placeholders until rates are configured in settings.</p>
        <ul class="fin-checklist" style="margin-top:16px;">
          <li><input type="checkbox" disabled> Statutory rate table reviewed</li>
          <li><input type="checkbox" disabled> Previous period filed</li>
          <li><input type="checkbox" disabled> Bank payment batch reconciled</li>
        </ul>
      </div>
    </div>`;
}

function finPayrollFilterTable(tbodyId) {
  const q = (document.getElementById('finPayrollEmpSearch')?.value || '').toLowerCase();
  document.querySelectorAll(`#${tbodyId} tr`).forEach((tr) => {
    const hay = tr.dataset.search || tr.textContent.toLowerCase();
    tr.style.display = !q || hay.includes(q) ? '' : 'none';
  });
}

function finPayrollNewEmployee() {
  if (!finPayrollCanWrite()) return;
  alert('Employee onboarding form will open here when HR master data is wired.');
}

function finPayrollNewRun() {
  if (!finPayrollCanWrite()) return;
  alert('Draft pay run wizard will start here.');
}

function finPayrollViewSlip(id) {
  alert(`Payslip ${id}: PDF viewer stub.`);
}

function finPayrollExportStatutory() {
  if (!finPayrollCanWrite()) return;
  if (typeof finExportCsv === 'function') {
    finExportCsv('statutory-export.csv', [{ line: 'placeholder', amount: 0 }], [
      { key: 'line', label: 'Line' },
      { key: 'amount', label: 'Amount' }
    ]);
  }
}

window.loadFinancePayrollSection = loadFinancePayrollSection;
window.finPayrollFilterTable = finPayrollFilterTable;
window.finPayrollNewEmployee = finPayrollNewEmployee;
window.finPayrollNewRun = finPayrollNewRun;
window.finPayrollViewSlip = finPayrollViewSlip;
window.finPayrollExportStatutory = finPayrollExportStatutory;