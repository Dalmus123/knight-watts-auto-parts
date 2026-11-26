/**
 * Role-based access matrix + dashboards for Knight Watts admin portal.
 * UI filtering is secondary — RLS enforces jurisdiction in Postgres.
 *
 * Depends on: currentUserProfile, supabaseClient, formatCurrency, formatDate (admin.js)
 * Sales helpers: updateSalesNavVisibility, fetchSalesDashboard (sales.js)
 */

const STAFF_ROLES = [
  'owner', 'admin', 'ceo', 'cfo', 'coo', 'cos',
  'chief_of_sales', 'sales_rep', 'print_operator', 'hq_readonly'
];

/** Page → roles that may open it in the sidebar / router */
const PAGE_ROLES = {
  dashboard: STAFF_ROLES,
  products: ['owner', 'admin', 'ceo', 'cfo', 'coo', 'sales_rep', 'chief_of_sales'],
  orders: ['owner', 'admin', 'ceo', 'cfo', 'coo', 'cos', 'chief_of_sales', 'sales_rep'],
  requests: ['owner', 'admin', 'ceo', 'coo'],
  printqueue: ['owner', 'admin', 'ceo', 'coo', 'print_operator'],
  telemetry: ['owner', 'admin', 'ceo', 'coo', 'cos', 'hq_readonly', 'print_operator'],
  deliveries: ['owner', 'admin', 'ceo', 'coo', 'hq_readonly'],
  analytics: ['owner', 'admin', 'ceo', 'cfo', 'cos', 'hq_readonly'],
  reports: ['owner', 'admin', 'ceo', 'cfo', 'hq_readonly'],
  finance: ['cfo', 'ceo', 'owner'],
  users: ['owner', 'admin', 'ceo', 'cos'],
  security: STAFF_ROLES,
  'my-sales': ['owner', 'admin', 'ceo', 'cfo', 'cos', 'chief_of_sales', 'sales_rep'],
  'sales-team': ['owner', 'admin', 'ceo', 'cfo', 'cos', 'chief_of_sales'],
  'sales-tasks': ['owner', 'admin', 'ceo', 'coo', 'cos', 'chief_of_sales', 'sales_rep'],
  'commission-rules': ['owner', 'admin', 'ceo', 'cfo', 'cos'],
  'sales-reps': ['owner', 'admin', 'ceo', 'cos']
};

/** First landing route after sign-in */
const ROLE_HOME = {
  owner: 'dashboard',
  admin: 'dashboard',
  ceo: 'dashboard',
  cfo: 'finance',
  coo: 'dashboard',
  cos: 'sales-team',
  chief_of_sales: 'sales-team',
  sales_rep: 'my-sales',
  print_operator: 'printqueue',
  hq_readonly: 'analytics'
};

const ROLE_LABELS = {
  owner: 'Owner',
  admin: 'Admin',
  ceo: 'CEO',
  cfo: 'CFO',
  coo: 'COO',
  cos: 'Chief of Staff',
  chief_of_sales: 'Head of Sales',
  sales_rep: 'Sales Rep',
  print_operator: 'Print Operator',
  hq_readonly: 'HQ Read-only'
};

function getCurrentRole() {
  return currentUserProfile?.role || null;
}

function roleCanAccessPage(page, role = getCurrentRole()) {
  if (!role) return false;
  const allowed = PAGE_ROLES[page];
  if (!allowed) return false;
  return allowed.includes(role);
}

function getRoleHome(role = getCurrentRole()) {
  return ROLE_HOME[role] || 'dashboard';
}

function formatRoleLabel(role) {
  return ROLE_LABELS[role] || String(role || '').toUpperCase();
}

/**
 * Show/hide sidebar items from data-roles (comma list) or PAGE_ROLES via data-page.
 * Owner-only and sales-roles attributes remain for backwards compatibility.
 */
function updateRoleNavVisibility() {
  const role = getCurrentRole();
  if (!role) return;

  document.querySelectorAll('.admin-nav .nav-item').forEach((el) => {
    const page = el.dataset.page;
    let show = roleCanAccessPage(page, role);

    if (el.classList.contains('owner-only') && !['owner', 'ceo'].includes(role)) {
      show = false;
    }

    if (el.dataset.salesRoles) {
      const salesAllowed = el.dataset.salesRoles.split(',').map((s) => s.trim());
      if (!salesAllowed.includes(role) && !roleCanAccessPage(page, role)) {
        show = false;
      } else if (salesAllowed.includes(role) || roleCanAccessPage(page, role)) {
        show = roleCanAccessPage(page, role);
      }
    }

    if (el.dataset.roles) {
      const allowed = el.dataset.roles.split(',').map((s) => s.trim());
      show = allowed.includes(role);
    }

    el.style.display = show ? 'flex' : 'none';
    el.classList.toggle('role-nav-hidden', !show);
  });

  if (typeof updateSalesNavVisibility === 'function') {
    // Re-apply sales overrides after role filter (sales.js widens/narrows sales pages)
    updateSalesNavVisibility();
    // Ensure PAGE_ROLES still wins for C-suite extras (cfo/cos on sales pages)
    document.querySelectorAll('[data-sales-roles]').forEach((el) => {
      const page = el.dataset.page;
      if (roleCanAccessPage(page, role)) {
        el.style.display = 'flex';
        el.classList.remove('sales-nav-hidden');
      }
    });
  }
}

function guardPageAccess(page) {
  if (!roleCanAccessPage(page)) {
    const content = document.getElementById('contentArea');
    if (content) {
      content.innerHTML = `
        <div class="empty-state">
          <h3>Access Denied</h3>
          <p>Your role (${formatRoleLabel(getCurrentRole())}) cannot open this page.
          Jurisdiction is also enforced by database RLS.</p>
        </div>`;
    }
    return false;
  }
  return true;
}

function roleDashIntro(title, subtitle) {
  return `
    <div class="role-dash-intro">
      <p class="role-dash-eyebrow">${escapeRolesHtml(formatRoleLabel(getCurrentRole()))} desk</p>
      <h2 class="role-dash-title">${escapeRolesHtml(title)}</h2>
      <p class="role-dash-sub">${escapeRolesHtml(subtitle)}</p>
    </div>`;
}

function escapeRolesHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function roleStatCard(label, valueId, iconSvg) {
  return `
    <div class="stat-card">
      <div class="stat-icon">${iconSvg || ''}</div>
      <div class="stat-value" id="${valueId}">—</div>
      <div class="stat-label">${escapeRolesHtml(label)}</div>
    </div>`;
}

async function loadRoleDashboard() {
  const role = getCurrentRole();
  const content = document.getElementById('contentArea');
  if (!content) return;

  switch (role) {
    case 'cfo':
      await loadCfoDashboard(content);
      break;
    case 'coo':
      await loadCooDashboard(content);
      break;
    case 'cos':
      await loadCosDashboard(content);
      break;
    case 'chief_of_sales':
      await loadChiefOfSalesDashboard(content);
      break;
    case 'sales_rep':
      await loadSalesRepDashboard(content);
      break;
    case 'print_operator':
      await loadPrintOperatorDashboard(content);
      break;
    case 'hq_readonly':
      await loadHqReadonlyDashboard(content);
      break;
    case 'ceo':
    case 'owner':
    case 'admin':
    default:
      await loadCeoDashboard(content);
      break;
  }
}

async function loadCeoDashboard(content) {
  content.innerHTML = `
    ${roleDashIntro('Company command', 'All departments · company-wide telemetry and revenue.')}
    <div class="stats-grid" id="roleStatsGrid">
      ${roleStatCard('Total Orders', 'totalOrders')}
      ${roleStatCard('Revenue (KES)', 'totalRevenue')}
      ${roleStatCard('Pending Requests', 'pendingRequests')}
      ${roleStatCard('Active Print Jobs', 'activePrintJobs')}
      ${roleStatCard('Inventory value', 'invValuation')}
      ${roleStatCard('Commissions payable', 'commPayable')}
    </div>
    <div class="role-quick-links">
      <button type="button" class="btn btn-outline" onclick="navigateToRoute('telemetry')">Live Telemetry</button>
      <button type="button" class="btn btn-outline" onclick="navigateToRoute('sales-team')">Sales Team</button>
      <button type="button" class="btn btn-outline" onclick="navigateToRoute('reports')">Reports</button>
      <button type="button" class="btn btn-outline" onclick="navigateToRoute('security')">Passkeys</button>
    </div>
    <div class="table-container">
      <div class="table-header"><h3>Recent Orders</h3>
        <button class="action-btn action-btn-primary" type="button" onclick="navigateToRoute('orders')">View All</button>
      </div>
      <div id="recentOrdersTable"></div>
    </div>
    <div class="table-container">
      <div class="table-header"><h3>Recent Custom Requests</h3>
        <button class="action-btn action-btn-primary" type="button" onclick="navigateToRoute('requests')">View All</button>
      </div>
      <div id="recentRequestsTable"></div>
    </div>
  `;
  await loadDashboardStats();
  await fillFinanceExtras();
}

async function loadCfoDashboard(content) {
  if (typeof navigateToRoute === 'function') {
    navigateToRoute('finance');
    return;
  }
  if (typeof loadFinancePage === 'function') {
    await loadFinancePage('finance');
  }
}

async function loadCooDashboard(content) {
  content.innerHTML = `
    ${roleDashIntro('Operations desk', 'Orders, fulfilment, catalogue, 3D models, stock, and team tasks.')}
    <div class="stats-grid">
      ${roleStatCard('Orders pending', 'opsPending')}
      ${roleStatCard('In fulfilment', 'opsShipped')}
      ${roleStatCard('Custom requests', 'opsRequests')}
      ${roleStatCard('Print jobs active', 'opsPrint')}
      ${roleStatCard('Active products', 'opsProducts')}
      ${roleStatCard('Low-stock SKUs', 'opsLowStock')}
      ${roleStatCard('Open sales tasks', 'opsTasks')}
    </div>
    <div class="role-quick-links">
      <button type="button" class="btn btn-primary" onclick="navigateToRoute('orders')">Orders</button>
      <button type="button" class="btn btn-outline" onclick="navigateToRoute('products')">Catalogue / 3D</button>
      <button type="button" class="btn btn-outline" onclick="navigateToRoute('printqueue')">Print queue</button>
      <button type="button" class="btn btn-outline" onclick="navigateToRoute('sales-tasks')">Tasks</button>
      <button type="button" class="btn btn-outline" onclick="navigateToRoute('deliveries')">Deliveries</button>
    </div>
    <div class="table-container">
      <div class="table-header"><h3>Recent Orders</h3>
        <button class="action-btn action-btn-primary" type="button" onclick="navigateToRoute('orders')">View All</button>
      </div>
      <div id="recentOrdersTable"></div>
    </div>
  `;
  await fillOperationsDashboard();
}

async function loadCosDashboard(content) {
  content.innerHTML = `
    ${roleDashIntro('Chief of Staff — sales leadership', 'Sales telemetry, heads of sales, team tasks, reps, commission statements.')}
    <div class="stats-grid" id="cosStats">
      ${roleStatCard('Team revenue', 'cosRevenue')}
      ${roleStatCard('Team orders', 'cosOrders')}
      ${roleStatCard('Commission total', 'cosCommission')}
      ${roleStatCard('Pending commission', 'cosPending')}
      ${roleStatCard('Customers', 'cosCustomers')}
      ${roleStatCard('Units sold', 'cosUnits')}
    </div>
    <div class="role-quick-links">
      <button type="button" class="btn btn-primary" onclick="navigateToRoute('sales-team')">Sales Team</button>
      <button type="button" class="btn btn-outline" onclick="navigateToRoute('sales-reps')">Sales Reps</button>
      <button type="button" class="btn btn-outline" onclick="navigateToRoute('sales-tasks')">Team tasks</button>
      <button type="button" class="btn btn-outline" onclick="navigateToRoute('commission-rules')">Commission rules</button>
      <button type="button" class="btn btn-outline" onclick="navigateToRoute('telemetry')">Telemetry</button>
    </div>
    <div id="cosLeaderboard" class="table-container"><div class="empty-state"><p>Loading leaderboard…</p></div></div>
  `;
  await fillSalesOverviewDashboard('cos');
}

async function loadChiefOfSalesDashboard(content) {
  content.innerHTML = `
    ${roleDashIntro('Head of Sales', 'Your sales team performance, commissions, and assigned tasks.')}
    <div class="stats-grid">
      ${roleStatCard('Team revenue', 'cosRevenue')}
      ${roleStatCard('Team orders', 'cosOrders')}
      ${roleStatCard('Commission total', 'cosCommission')}
      ${roleStatCard('Pending commission', 'cosPending')}
      ${roleStatCard('Customers', 'cosCustomers')}
      ${roleStatCard('Units sold', 'cosUnits')}
    </div>
    <div class="role-quick-links">
      <button type="button" class="btn btn-primary" onclick="navigateToRoute('sales-team')">Sales Team</button>
      <button type="button" class="btn btn-outline" onclick="navigateToRoute('my-sales')">My Sales</button>
      <button type="button" class="btn btn-outline" onclick="navigateToRoute('sales-tasks')">Sales Tasks</button>
    </div>
    <div id="cosLeaderboard" class="table-container"><div class="empty-state"><p>Loading…</p></div></div>
  `;
  await fillSalesOverviewDashboard('chief');
}

async function loadSalesRepDashboard(content) {
  content.innerHTML = `
    ${roleDashIntro('My sales desk', 'Your telemetry, scores, customers, commission, and assigned tasks.')}
    <div class="stats-grid">
      ${roleStatCard('My revenue', 'cosRevenue')}
      ${roleStatCard('My orders', 'cosOrders')}
      ${roleStatCard('My commission', 'cosCommission')}
      ${roleStatCard('Pending', 'cosPending')}
      ${roleStatCard('Customers', 'cosCustomers')}
      ${roleStatCard('Units', 'cosUnits')}
    </div>
    <div class="role-quick-links">
      <button type="button" class="btn btn-primary" onclick="navigateToRoute('my-sales')">Full My Sales</button>
      <button type="button" class="btn btn-outline" onclick="navigateToRoute('sales-tasks')">My tasks</button>
      <button type="button" class="btn btn-outline" onclick="navigateToRoute('products')">Catalogue (sell / 3D)</button>
    </div>
    <p class="role-dash-hint">Tasks may include adding 3D images or selling products across the site catalogue.</p>
  `;
  await fillSalesOverviewDashboard('rep');
}

async function loadPrintOperatorDashboard(content) {
  content.innerHTML = `
    ${roleDashIntro('Print floor', 'Active print jobs and queue.')}
    <div class="stats-grid">
      ${roleStatCard('Active print jobs', 'activePrintJobs')}
    </div>
    <div class="role-quick-links">
      <button type="button" class="btn btn-primary" onclick="navigateToRoute('printqueue')">Open print queue</button>
    </div>
  `;
  try {
    const { count } = await supabaseClient
      .from('print_jobs')
      .select('*', { count: 'exact', head: true })
      .in('status', ['queued', 'printing']);
    const el = document.getElementById('activePrintJobs');
    if (el) el.textContent = count || 0;
  } catch (e) {
    console.error(e);
  }
}

async function loadHqReadonlyDashboard(content) {
  content.innerHTML = `
    ${roleDashIntro('HQ overview', 'Read-only analytics and reports.')}
    <div class="role-quick-links">
      <button type="button" class="btn btn-primary" onclick="navigateToRoute('analytics')">Analytics</button>
      <button type="button" class="btn btn-outline" onclick="navigateToRoute('reports')">Reports</button>
      <button type="button" class="btn btn-outline" onclick="navigateToRoute('telemetry')">Telemetry</button>
    </div>
  `;
}

async function fillFinanceExtras() {
  try {
    const { data, error } = await supabaseClient.rpc('finance_dashboard_stats');
    if (error) throw error;
    const inv = document.getElementById('invValuation');
    const pay = document.getElementById('commPayable');
    if (inv) inv.textContent = formatCurrency(data?.inventory_valuation_kes || 0);
    if (pay) {
      const payable = Number(data?.commissions_pending_kes || 0) + Number(data?.commissions_approved_kes || 0);
      pay.textContent = formatCurrency(payable);
    }
  } catch (e) {
    // RPC may be unavailable until migration is applied
    console.warn('finance_dashboard_stats unavailable', e.message);
  }
}

async function fillFinanceDashboard() {
  try {
    const { data, error } = await supabaseClient.rpc('finance_dashboard_stats');
    if (error) throw error;
    setText('finRevenue', formatCurrency(data.revenue_kes));
    setText('finOrders', data.orders_count);
    setText('finInvValue', formatCurrency(data.inventory_valuation_kes));
    setText('finInvUnits', data.inventory_units);
    setText('finLowStock', data.low_stock_skus);
    setText('finCommPending', formatCurrency(data.commissions_pending_kes));
    setText('finCommApproved', formatCurrency(data.commissions_approved_kes));
    setText('finCommPaid', formatCurrency(data.commissions_paid_kes));
  } catch (e) {
    console.warn('finance dashboard', e.message);
  }

  try {
    const { data: products } = await supabaseClient
      .from('products')
      .select('name, category, stock_quantity, low_stock_threshold, price_kes')
      .eq('is_active', true)
      .order('stock_quantity', { ascending: true })
      .limit(40);
    const low = (products || []).filter(
      (p) => p.stock_quantity <= (p.low_stock_threshold || 5)
    );
    const box = document.getElementById('finLowStockTable');
    if (!box) return;
    if (!low.length) {
      box.innerHTML = '<div class="empty-state"><p>No low-stock SKUs</p></div>';
      return;
    }
    box.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Product</th><th>Category</th><th>Stock</th><th>Unit value</th><th>Line value</th></tr></thead>
        <tbody>
          ${low.map((p) => `
            <tr>
              <td>${escapeRolesHtml(p.name)}</td>
              <td>${escapeRolesHtml(p.category || '—')}</td>
              <td>${p.stock_quantity}</td>
              <td>KES ${formatCurrency(p.price_kes)}</td>
              <td>KES ${formatCurrency(p.stock_quantity * p.price_kes)}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (e) {
    console.warn(e);
  }
}

async function fillOperationsDashboard() {
  try {
    const { data, error } = await supabaseClient.rpc('operations_dashboard_stats');
    if (error) throw error;
    setText('opsPending', data.orders_pending);
    setText('opsShipped', data.orders_shipped);
    setText('opsRequests', data.requests_pending);
    setText('opsPrint', data.print_jobs_active);
    setText('opsProducts', data.products_active);
    setText('opsLowStock', data.low_stock_skus);
    setText('opsTasks', data.open_sales_tasks);
  } catch (e) {
    console.warn('ops dashboard', e.message);
  }

  try {
    const { data: recentOrders } = await supabaseClient
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);
    if (typeof renderRecentOrders === 'function') renderRecentOrders(recentOrders);
  } catch (e) {
    console.warn(e);
  }
}

async function fillSalesOverviewDashboard(mode) {
  if (typeof fetchSalesDashboard !== 'function') {
    console.warn('sales.js not loaded');
    return;
  }
  try {
    const repId = mode === 'rep' ? currentUser.id : null;
    const data = await fetchSalesDashboard('month', repId);
    const t = data?.totals || {};
    setText('cosRevenue', typeof formatKes === 'function' ? formatKes(t.revenue_kes) : formatCurrency(t.revenue_kes));
    setText('cosOrders', t.orders);
    setText('cosCommission', typeof formatKes === 'function' ? formatKes(t.commission_kes) : formatCurrency(t.commission_kes));
    setText('cosPending', typeof formatKes === 'function' ? formatKes(t.commission_pending_kes) : formatCurrency(t.commission_pending_kes));
    setText('cosCustomers', t.customers);
    setText('cosUnits', t.units);

    const board = document.getElementById('cosLeaderboard');
    if (board && Array.isArray(data?.leaderboard)) {
      board.innerHTML = `
        <div class="table-header"><h3>Leaderboard</h3></div>
        <ol class="sales-leaderboard" style="padding:16px 20px;">
          ${data.leaderboard.slice(0, 8).map((row, i) => `
            <li>
              <span class="rank">#${i + 1}</span>
              <span class="name">${escapeRolesHtml(row.display_name)}
                <small>${escapeRolesHtml(row.referral_code || '')}</small></span>
              <span class="meta">${typeof formatKes === 'function' ? formatKes(row.revenue_kes) : formatCurrency(row.revenue_kes)} · ${row.units || 0} units</span>
            </li>`).join('') || '<li>No data yet</li>'}
        </ol>`;
    }
  } catch (e) {
    console.warn('sales overview', e.message);
  }
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value ?? '—';
}

window.PAGE_ROLES = PAGE_ROLES;
window.STAFF_ROLES = STAFF_ROLES;
window.roleCanAccessPage = roleCanAccessPage;
window.getRoleHome = getRoleHome;
window.formatRoleLabel = formatRoleLabel;
window.updateRoleNavVisibility = updateRoleNavVisibility;
window.guardPageAccess = guardPageAccess;
window.loadRoleDashboard = loadRoleDashboard;
