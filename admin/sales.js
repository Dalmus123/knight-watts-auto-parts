/**
 * Sales Team CRM — rep dashboard, chief of sales, commission rules, tasks
 * Depends on: supabaseClient, currentUser, currentUserProfile (admin.js)
 */

let salesPeriod = 'month';
let salesRealtimeChannel = null;
let salesDashboardCache = null;

const SALES_LEADERSHIP = ['owner', 'admin', 'chief_of_sales'];
const SALES_STAFF = ['owner', 'admin', 'chief_of_sales', 'sales_rep'];

function isSalesLeadership() {
    return SALES_LEADERSHIP.includes(currentUserProfile?.role);
}

function isSalesRepOnly() {
    return currentUserProfile?.role === 'sales_rep';
}

function formatKes(n) {
    const v = Number(n) || 0;
    return 'KES ' + v.toLocaleString('en-KE', { maximumFractionDigits: 0 });
}

function escapeSalesHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Deliberate tap vs scroll — same pattern as admin product cards */
const SALES_TAP_MOVE_PX = 10;

function salesAttachDeliberateActivate(el, callback) {
    if (!el) return;
    let startX = 0;
    let startY = 0;
    let startScrollY = 0;
    let tracking = false;
    let movedOrScrolled = false;
    let touchActivated = false;

    const getScrollY = () =>
        window.scrollY ||
        document.documentElement.scrollTop ||
        document.body.scrollTop ||
        0;

    el.addEventListener('touchstart', (e) => {
        const t = e.touches[0];
        if (!t) return;
        tracking = true;
        movedOrScrolled = false;
        startX = t.clientX;
        startY = t.clientY;
        startScrollY = getScrollY();
    }, { passive: true });

    el.addEventListener('touchmove', (e) => {
        if (!tracking) return;
        const t = e.touches[0];
        if (!t) return;
        if (
            Math.abs(t.clientX - startX) > SALES_TAP_MOVE_PX ||
            Math.abs(t.clientY - startY) > SALES_TAP_MOVE_PX
        ) {
            movedOrScrolled = true;
        }
    }, { passive: true });

    el.addEventListener('touchend', (e) => {
        if (!tracking) return;
        tracking = false;
        const t = e.changedTouches[0];
        if (t) {
            if (
                Math.abs(t.clientX - startX) > SALES_TAP_MOVE_PX ||
                Math.abs(t.clientY - startY) > SALES_TAP_MOVE_PX
            ) {
                movedOrScrolled = true;
            }
        }
        if (Math.abs(getScrollY() - startScrollY) > SALES_TAP_MOVE_PX) {
            movedOrScrolled = true;
        }
        if (movedOrScrolled) return;
        e.preventDefault();
        e.stopPropagation();
        touchActivated = true;
        callback(e);
        setTimeout(() => { touchActivated = false; }, 500);
    }, { passive: false });

    el.addEventListener('touchcancel', () => {
        tracking = false;
        movedOrScrolled = true;
    }, { passive: true });

    el.addEventListener('click', (e) => {
        if (touchActivated) return;
        callback(e);
    });
}

function updateSalesNavVisibility() {
    const role = currentUserProfile?.role;
    document.querySelectorAll('[data-sales-roles]').forEach((el) => {
        const allowed = (el.dataset.salesRoles || '').split(',').map((s) => s.trim());
        const show = allowed.includes(role);
        el.style.display = show ? 'flex' : 'none';
        el.classList.toggle('sales-nav-hidden', !show);
    });
}

function unsubscribeSalesRealtime() {
    if (salesRealtimeChannel && supabaseClient) {
        supabaseClient.removeChannel(salesRealtimeChannel);
        salesRealtimeChannel = null;
    }
}

function subscribeSalesRealtime(onChange) {
    unsubscribeSalesRealtime();
    if (!supabaseClient) return;
    salesRealtimeChannel = supabaseClient
        .channel('sales-crm-' + Date.now())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'commission_entries' }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_tasks' }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_customers' }, onChange)
        .subscribe();
}

async function fetchSalesDashboard(period, repId = null) {
    const { data, error } = await supabaseClient.rpc('sales_dashboard_stats', {
        p_period: period,
        p_rep_id: repId
    });
    if (error) throw error;
    salesDashboardCache = data;
    return data;
}

function renderPeriodToggle(active, onSelectAttr) {
    return `
        <div class="sales-period-toggle" role="group" aria-label="Period">
            ${['today', 'week', 'month'].map((p) => `
                <button type="button" class="${p === active ? 'active' : ''}" data-period="${p}" ${onSelectAttr}>
                    ${p}
                </button>
            `).join('')}
        </div>
    `;
}

function renderStatsGrid(totals) {
    const t = totals || {};
    return `
        <div class="stats-grid" style="grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));">
            <div class="stat-card">
                <div class="stat-value">${Number(t.orders || 0)}</div>
                <div class="stat-label">Orders</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${Number(t.customers || 0)}</div>
                <div class="stat-label">Customers</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${Number(t.units || 0)}</div>
                <div class="stat-label">Units sold</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${formatKes(t.revenue_kes)}</div>
                <div class="stat-label">Revenue</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${formatKes(t.commission_kes)}</div>
                <div class="stat-label">Commission total</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${formatKes(t.commission_pending_kes)}</div>
                <div class="stat-label">Pending</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${formatKes(t.commission_approved_kes)}</div>
                <div class="stat-label">Approved</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${formatKes(t.commission_paid_kes)}</div>
                <div class="stat-label">Paid</div>
            </div>
        </div>
    `;
}

function renderBreakdownTables(data) {
    const byCat = data?.by_category || [];
    const byProd = data?.by_product || [];
    return `
        <div class="sales-two-col">
            <div class="table-container">
                <div class="table-header"><h3>By category</h3></div>
                <div style="overflow-x:auto;">
                    <table class="data-table">
                        <thead><tr><th>Category</th><th>Units</th><th>Revenue</th><th>Commission</th></tr></thead>
                        <tbody>
                            ${byCat.length ? byCat.map((r) => `
                                <tr>
                                    <td>${escapeSalesHtml(r.category)}</td>
                                    <td>${Number(r.units || 0)}</td>
                                    <td>${formatKes(r.revenue_kes)}</td>
                                    <td>${formatKes(r.commission_kes)}</td>
                                </tr>
                            `).join('') : '<tr><td colspan="4">No sales in this period</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
            <div class="table-container">
                <div class="table-header"><h3>By product</h3></div>
                <div style="overflow-x:auto;">
                    <table class="data-table">
                        <thead><tr><th>Product</th><th>Units</th><th>Commission</th></tr></thead>
                        <tbody>
                            ${byProd.length ? byProd.map((r) => `
                                <tr>
                                    <td>${escapeSalesHtml(r.product_name)}<br><small>${escapeSalesHtml(r.category || '')}</small></td>
                                    <td>${Number(r.units || 0)}</td>
                                    <td>${formatKes(r.commission_kes)}</td>
                                </tr>
                            `).join('') : '<tr><td colspan="3">No product sales yet</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

function renderLeaderboard(rows) {
    const list = rows || [];
    return `
        <div class="table-container" style="margin-top:20px;">
            <div class="table-header"><h3>Leaderboard</h3></div>
            <ol class="sales-leaderboard" style="padding:16px 20px;">
                ${list.length ? list.map((r, i) => `
                    <li>
                        <span class="rank">#${i + 1}</span>
                        <span class="name">${escapeSalesHtml(r.display_name)} <small style="color:#808080;">${escapeSalesHtml(r.referral_code)}</small></span>
                        <span class="meta">${formatKes(r.revenue_kes)} · ${Number(r.units || 0)} units<br>${formatKes(r.commission_kes)} commission</span>
                    </li>
                `).join('') : '<li><span class="name">No ranked reps yet</span></li>'}
            </ol>
        </div>
    `;
}

async function loadMySalesPage() {
    const content = document.getElementById('contentArea');
    if (!SALES_STAFF.includes(currentUserProfile.role)) {
        content.innerHTML = '<div class="empty-state"><h3>Access Denied</h3></div>';
        return;
    }

    content.innerHTML = `
        <div id="salesMyRoot">
            <p style="color:var(--text-muted);margin-bottom:16px;">Live sales performance. Updates in real time.</p>
            ${renderPeriodToggle(salesPeriod, '')}
            <div id="salesReferralSlot"></div>
            <div id="salesStatsSlot"><div class="loading-spinner"></div></div>
            <div id="salesBreakdownSlot"></div>
            <div id="salesLeaderboardSlot"></div>
        </div>
    `;

    document.querySelectorAll('#salesMyRoot .sales-period-toggle button').forEach((btn) => {
        salesAttachDeliberateActivate(btn, () => {
            salesPeriod = btn.dataset.period;
            refreshMySalesView();
        });
    });

    await refreshMySalesView();
    subscribeSalesRealtime(() => refreshMySalesView());
}

async function refreshMySalesView() {
    const statsSlot = document.getElementById('salesStatsSlot');
    const breakdownSlot = document.getElementById('salesBreakdownSlot');
    const boardSlot = document.getElementById('salesLeaderboardSlot');
    const referralSlot = document.getElementById('salesReferralSlot');
    if (!statsSlot) return;

    try {
        const repId = isSalesRepOnly() ? currentUser.id : null;
        const data = await fetchSalesDashboard(salesPeriod, repId);

        if (referralSlot && (isSalesRepOnly() || currentUserProfile.role === 'chief_of_sales')) {
            const { data: rep } = await supabaseClient
                .from('sales_reps')
                .select('referral_code, display_name')
                .eq('id', currentUser.id)
                .maybeSingle();
            if (rep) {
                const origin = window.location.origin + window.location.pathname.replace(/\/admin\/?$/, '/');
                const link = `${origin}?ref=${encodeURIComponent(rep.referral_code)}`;
                referralSlot.innerHTML = `
                    <div class="sales-referral-box">
                        <label>Your referral code / link</label>
                        <div class="sales-referral-row">
                            <code id="salesReferralCode">${escapeSalesHtml(rep.referral_code)}</code>
                            <code id="salesReferralLink">${escapeSalesHtml(link)}</code>
                            <button type="button" class="btn btn-outline" id="copyReferralBtn">Copy link</button>
                        </div>
                    </div>
                `;
                const copyBtn = document.getElementById('copyReferralBtn');
                salesAttachDeliberateActivate(copyBtn, async () => {
                    try {
                        await navigator.clipboard.writeText(link);
                        copyBtn.textContent = 'Copied';
                        setTimeout(() => { copyBtn.textContent = 'Copy link'; }, 1500);
                    } catch (_) {
                        showError('Could not copy — select the link manually');
                    }
                });
            } else if (isSalesRepOnly()) {
                referralSlot.innerHTML = `
                    <div class="sales-referral-box">
                        <p style="margin:0;color:#a0a0a0;">No sales_reps profile yet. Ask an admin to run ensure_sales_rep_profile for your account.</p>
                    </div>
                `;
            }
        }

        document.querySelectorAll('#salesMyRoot .sales-period-toggle button').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.period === salesPeriod);
        });

        statsSlot.innerHTML = renderStatsGrid(data?.totals);
        breakdownSlot.innerHTML = renderBreakdownTables(data);
        boardSlot.innerHTML = renderLeaderboard(data?.leaderboard);
    } catch (err) {
        console.error(err);
        statsSlot.innerHTML = `<div class="empty-state"><h3>Failed to load sales stats</h3><p>${escapeSalesHtml(err.message)}</p></div>`;
    }
}

async function loadSalesTeamPage() {
    const content = document.getElementById('contentArea');
    if (!isSalesLeadership()) {
        content.innerHTML = '<div class="empty-state"><h3>Access Denied</h3><p>Chief of Sales / Admin only.</p></div>';
        return;
    }

    content.innerHTML = `
        <div id="salesTeamRoot">
            <p style="color:var(--text-muted);margin-bottom:16px;">All reps · approve commissions · assign orders.</p>
            ${renderPeriodToggle(salesPeriod, '')}
            <div id="salesTeamStats"></div>
            <div id="salesTeamLeaderboard"></div>

            <div class="table-container" style="margin-top:24px;">
                <div class="table-header">
                    <h3>Pending commissions</h3>
                    <div class="sales-table-actions">
                        <button type="button" class="btn btn-primary" id="approveSelectedBtn">Approve selected</button>
                        <button type="button" class="btn btn-outline" id="markPaidSelectedBtn">Mark paid</button>
                    </div>
                </div>
                <div id="pendingCommissionsTable" style="overflow-x:auto;"></div>
            </div>

            <div class="table-container" style="margin-top:24px;">
                <div class="table-header"><h3>Manual order attribution</h3></div>
                <div class="sales-inline-form" id="assignOrderForm">
                    <div class="form-row">
                        <div class="form-group">
                            <label>Order number</label>
                            <input type="text" id="assignOrderNumber" placeholder="ORD-…">
                        </div>
                        <div class="form-group">
                            <label>Sales rep</label>
                            <select id="assignRepSelect"><option value="">Loading…</option></select>
                        </div>
                    </div>
                    <button type="button" class="btn btn-primary" id="assignOrderBtn">Assign to rep</button>
                </div>
            </div>
        </div>
    `;

    document.querySelectorAll('#salesTeamRoot .sales-period-toggle button').forEach((btn) => {
        salesAttachDeliberateActivate(btn, () => {
            salesPeriod = btn.dataset.period;
            refreshSalesTeamView();
        });
    });

    salesAttachDeliberateActivate(document.getElementById('approveSelectedBtn'), () => setSelectedCommissions('approved'));
    salesAttachDeliberateActivate(document.getElementById('markPaidSelectedBtn'), () => setSelectedCommissions('paid'));
    salesAttachDeliberateActivate(document.getElementById('assignOrderBtn'), assignOrderFromForm);

    await populateRepSelect(document.getElementById('assignRepSelect'));
    await refreshSalesTeamView();
    subscribeSalesRealtime(() => refreshSalesTeamView());
}

async function populateRepSelect(selectEl) {
    if (!selectEl) return;
    const { data, error } = await supabaseClient
        .from('sales_reps')
        .select('id, display_name, referral_code, is_active')
        .eq('is_active', true)
        .order('display_name');
    if (error) {
        selectEl.innerHTML = '<option value="">Failed to load reps</option>';
        return;
    }
    if (!data?.length) {
        selectEl.innerHTML = '<option value="">No active reps</option>';
        return;
    }
    selectEl.innerHTML = data.map((r) =>
        `<option value="${r.id}">${escapeSalesHtml(r.display_name)} (${escapeSalesHtml(r.referral_code)})</option>`
    ).join('');
}

async function refreshSalesTeamView() {
    const stats = document.getElementById('salesTeamStats');
    const board = document.getElementById('salesTeamLeaderboard');
    const pending = document.getElementById('pendingCommissionsTable');
    if (!stats) return;

    try {
        const data = await fetchSalesDashboard(salesPeriod, null);
        document.querySelectorAll('#salesTeamRoot .sales-period-toggle button').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.period === salesPeriod);
        });
        stats.innerHTML = renderStatsGrid(data?.totals);
        board.innerHTML = renderLeaderboard(data?.leaderboard) + renderBreakdownTables(data);

        const { data: entries, error } = await supabaseClient
            .from('commission_entries')
            .select('id, product_name, category, quantity, commission_amount_kes, commission_rate_percent, status, sales_rep_id, order_id, created_at, sales_reps(display_name)')
            .in('status', ['pending', 'approved'])
            .order('created_at', { ascending: false })
            .limit(100);
        if (error) throw error;

        pending.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th></th><th>Rep</th><th>Product</th><th>Qty</th><th>Rate</th><th>Amount</th><th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${(entries || []).length ? entries.map((e) => `
                        <tr>
                            <td><input type="checkbox" class="comm-check" value="${e.id}" style="width:20px;height:20px;"></td>
                            <td>${escapeSalesHtml(e.sales_reps?.display_name || e.sales_rep_id)}</td>
                            <td>${escapeSalesHtml(e.product_name)}<br><small>${escapeSalesHtml(e.category || '')}</small></td>
                            <td>${e.quantity}</td>
                            <td>${Number(e.commission_rate_percent)}%</td>
                            <td>${formatKes(e.commission_amount_kes)}</td>
                            <td><span class="sales-badge ${e.status}">${e.status}</span></td>
                        </tr>
                    `).join('') : '<tr><td colspan="7">No pending/approved commissions</td></tr>'}
                </tbody>
            </table>
        `;
    } catch (err) {
        console.error(err);
        stats.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${escapeSalesHtml(err.message)}</p></div>`;
    }
}

async function setSelectedCommissions(status) {
    const ids = Array.from(document.querySelectorAll('.comm-check:checked')).map((el) => el.value);
    if (!ids.length) {
        showError('Select at least one commission row');
        return;
    }
    try {
        const { error } = await supabaseClient.rpc('set_commission_status', {
            p_entry_ids: ids,
            p_status: status
        });
        if (error) throw error;
        await refreshSalesTeamView();
    } catch (err) {
        showError(err.message || 'Failed to update commissions');
    }
}

async function assignOrderFromForm() {
    const orderNumber = document.getElementById('assignOrderNumber')?.value.trim();
    const repId = document.getElementById('assignRepSelect')?.value;
    if (!orderNumber || !repId) {
        showError('Enter an order number and choose a rep');
        return;
    }
    try {
        const { data: order, error: findErr } = await supabaseClient
            .from('orders')
            .select('id, order_number')
            .eq('order_number', orderNumber)
            .maybeSingle();
        if (findErr) throw findErr;
        if (!order) throw new Error('Order not found: ' + orderNumber);

        const { error } = await supabaseClient.rpc('assign_order_to_sales_rep', {
            p_order_id: order.id,
            p_rep_id: repId
        });
        if (error) throw error;
        document.getElementById('assignOrderNumber').value = '';
        await refreshSalesTeamView();
        alert('Order ' + orderNumber + ' assigned. Commissions recalculated.');
    } catch (err) {
        showError(err.message || 'Assignment failed');
    }
}

async function loadSalesTasksPage() {
    const content = document.getElementById('contentArea');
    if (!SALES_STAFF.includes(currentUserProfile.role)) {
        content.innerHTML = '<div class="empty-state"><h3>Access Denied</h3></div>';
        return;
    }

    const canAssign = isSalesLeadership();
    content.innerHTML = `
        <div id="salesTasksRoot">
            <p style="color:var(--text-muted);margin-bottom:16px;">Task board — chief assigns, reps update status.</p>
            ${canAssign ? `
                <div class="sales-inline-form">
                    <div class="form-group">
                        <label>Title</label>
                        <input type="text" id="taskTitle" maxlength="200" placeholder="Follow up Garissa garage leads">
                    </div>
                    <div class="form-group">
                        <label>Description</label>
                        <textarea id="taskDescription" rows="2" placeholder="Details…"></textarea>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Assignee</label>
                            <select id="taskAssignee"></select>
                        </div>
                        <div class="form-group">
                            <label>Due date</label>
                            <input type="date" id="taskDue">
                        </div>
                    </div>
                    <button type="button" class="btn btn-primary" id="createTaskBtn">Assign task</button>
                </div>
            ` : ''}
            <div class="sales-task-board" id="salesTaskBoard">
                <div class="loading-spinner"></div>
            </div>
        </div>
    `;

    if (canAssign) {
        await populateRepSelect(document.getElementById('taskAssignee'));
        salesAttachDeliberateActivate(document.getElementById('createTaskBtn'), createSalesTask);
    }

    await refreshSalesTasks();
    subscribeSalesRealtime(() => refreshSalesTasks());
}

async function createSalesTask() {
    const title = document.getElementById('taskTitle')?.value.trim();
    const description = document.getElementById('taskDescription')?.value.trim();
    const assignee_id = document.getElementById('taskAssignee')?.value;
    const due_date = document.getElementById('taskDue')?.value || null;
    if (!title || !assignee_id) {
        showError('Title and assignee are required');
        return;
    }
    try {
        const { error } = await supabaseClient.from('sales_tasks').insert({
            title,
            description: description || null,
            assignee_id,
            due_date,
            assigned_by: currentUser.id,
            status: 'todo'
        });
        if (error) throw error;
        document.getElementById('taskTitle').value = '';
        document.getElementById('taskDescription').value = '';
        await refreshSalesTasks();
    } catch (err) {
        showError(err.message || 'Could not create task');
    }
}

async function refreshSalesTasks() {
    const board = document.getElementById('salesTaskBoard');
    if (!board) return;

    try {
        let query = supabaseClient
            .from('sales_tasks')
            .select('*, sales_reps(display_name)')
            .neq('status', 'cancelled')
            .order('due_date', { ascending: true, nullsFirst: false });

        if (isSalesRepOnly()) {
            query = query.eq('assignee_id', currentUser.id);
        }

        const { data, error } = await query;
        if (error) throw error;

        const columns = [
            { key: 'todo', label: 'To do' },
            { key: 'in_progress', label: 'In progress' },
            { key: 'done', label: 'Done' }
        ];

        board.innerHTML = columns.map((col) => {
            const items = (data || []).filter((t) => t.status === col.key);
            return `
                <div class="sales-task-column" data-status="${col.key}">
                    <h4>${col.label} (${items.length})</h4>
                    <div class="sales-task-list">
                        ${items.length ? items.map((t) => `
                            <div class="sales-task-item" data-task-id="${t.id}">
                                <h5>${escapeSalesHtml(t.title)}</h5>
                                <p>${escapeSalesHtml(t.description || '')}</p>
                                <div class="task-meta">
                                    <span>${escapeSalesHtml(t.sales_reps?.display_name || '')}</span>
                                    <span>${t.due_date ? 'Due ' + escapeSalesHtml(t.due_date) : 'No due date'}</span>
                                </div>
                                <div class="sales-task-actions">
                                    <select data-task-status="${t.id}" aria-label="Update status">
                                        <option value="todo" ${t.status === 'todo' ? 'selected' : ''}>To do</option>
                                        <option value="in_progress" ${t.status === 'in_progress' ? 'selected' : ''}>In progress</option>
                                        <option value="done" ${t.status === 'done' ? 'selected' : ''}>Done</option>
                                        ${isSalesLeadership() ? `<option value="cancelled" ${t.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>` : ''}
                                    </select>
                                </div>
                            </div>
                        `).join('') : '<p style="color:#707070;font-size:13px;padding:8px;">Empty</p>'}
                    </div>
                </div>
            `;
        }).join('');

        board.querySelectorAll('select[data-task-status]').forEach((sel) => {
            sel.addEventListener('change', async () => {
                try {
                    const { error } = await supabaseClient
                        .from('sales_tasks')
                        .update({ status: sel.value })
                        .eq('id', sel.dataset.taskStatus);
                    if (error) throw error;
                    await refreshSalesTasks();
                } catch (err) {
                    showError(err.message || 'Status update failed');
                    await refreshSalesTasks();
                }
            });
        });
    } catch (err) {
        console.error(err);
        board.innerHTML = `<div class="empty-state"><h3>Tasks unavailable</h3><p>${escapeSalesHtml(err.message)}</p></div>`;
    }
}

async function loadCommissionRulesPage() {
    const content = document.getElementById('contentArea');
    if (!['owner', 'admin'].includes(currentUserProfile.role)) {
        content.innerHTML = '<div class="empty-state"><h3>Access Denied</h3><p>Owner/Admin only.</p></div>';
        return;
    }

    content.innerHTML = `
        <div id="commissionRulesRoot">
            <p style="color:var(--text-muted);margin-bottom:12px;">
                Priority: <strong>product</strong> overrides <strong>category</strong> overrides <strong>default</strong>.
                Rows labelled EXAMPLE SEED came from the example migration.
            </p>
            <div class="sales-inline-form">
                <div class="form-row">
                    <div class="form-group">
                        <label>Scope</label>
                        <select id="ruleScope">
                            <option value="default">Default</option>
                            <option value="category">Category</option>
                            <option value="product">Product</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Rate %</label>
                        <input type="number" id="ruleRate" min="0" max="100" step="0.01" value="5">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Category (if scope=category)</label>
                        <input type="text" id="ruleCategory" placeholder="Filters">
                    </div>
                    <div class="form-group">
                        <label>Product (if scope=product)</label>
                        <select id="ruleProduct"><option value="">Select product…</option></select>
                    </div>
                </div>
                <div class="form-group">
                    <label>Label</label>
                    <input type="text" id="ruleLabel" placeholder="Optional label">
                </div>
                <button type="button" class="btn btn-primary" id="saveRuleBtn">Save rule</button>
            </div>
            <div class="table-container">
                <div class="table-header"><h3>Active rules</h3></div>
                <div id="rulesTable" style="overflow-x:auto;"></div>
            </div>
        </div>
    `;

    const { data: products } = await supabaseClient
        .from('products')
        .select('id, name, category')
        .eq('is_active', true)
        .order('name');
    const prodSelect = document.getElementById('ruleProduct');
    prodSelect.innerHTML = '<option value="">Select product…</option>' +
        (products || []).map((p) =>
            `<option value="${p.id}">${escapeSalesHtml(p.name)} (${escapeSalesHtml(p.category)})</option>`
        ).join('');

    salesAttachDeliberateActivate(document.getElementById('saveRuleBtn'), saveCommissionRule);
    await refreshCommissionRules();
}

async function refreshCommissionRules() {
    const table = document.getElementById('rulesTable');
    if (!table) return;
    const { data, error } = await supabaseClient
        .from('commission_rules')
        .select('*, products(name)')
        .eq('is_active', true)
        .order('scope');
    if (error) {
        table.innerHTML = `<p>${escapeSalesHtml(error.message)}</p>`;
        return;
    }
    table.innerHTML = `
        <table class="data-table">
            <thead><tr><th>Scope</th><th>Target</th><th>Rate</th><th>Label</th><th></th></tr></thead>
            <tbody>
                ${(data || []).map((r) => `
                    <tr>
                        <td>${escapeSalesHtml(r.scope)}</td>
                        <td>${escapeSalesHtml(
                            r.scope === 'default' ? '—' :
                            r.scope === 'category' ? r.category :
                            (r.products?.name || r.product_id)
                        )}</td>
                        <td>${Number(r.rate_percent)}%</td>
                        <td>${escapeSalesHtml(r.label || '')}</td>
                        <td><button type="button" class="action-btn action-btn-secondary" data-deactivate-rule="${r.id}">Deactivate</button></td>
                    </tr>
                `).join('') || '<tr><td colspan="5">No rules</td></tr>'}
            </tbody>
        </table>
    `;
    table.querySelectorAll('[data-deactivate-rule]').forEach((btn) => {
        salesAttachDeliberateActivate(btn, async () => {
            const { error: upErr } = await supabaseClient
                .from('commission_rules')
                .update({ is_active: false })
                .eq('id', btn.dataset.deactivateRule);
            if (upErr) showError(upErr.message);
            else await refreshCommissionRules();
        });
    });
}

async function saveCommissionRule() {
    const scope = document.getElementById('ruleScope').value;
    const rate = Number(document.getElementById('ruleRate').value);
    const category = document.getElementById('ruleCategory').value.trim();
    const product_id = document.getElementById('ruleProduct').value || null;
    const label = document.getElementById('ruleLabel').value.trim() || null;

    if (Number.isNaN(rate) || rate < 0 || rate > 100) {
        showError('Rate must be 0–100');
        return;
    }
    if (scope === 'category' && !category) {
        showError('Category required');
        return;
    }
    if (scope === 'product' && !product_id) {
        showError('Product required');
        return;
    }

    try {
        // Deactivate prior active rule for same target
        if (scope === 'default') {
            await supabaseClient.from('commission_rules').update({ is_active: false }).eq('scope', 'default').eq('is_active', true);
        } else if (scope === 'category') {
            await supabaseClient.from('commission_rules').update({ is_active: false }).eq('scope', 'category').ilike('category', category).eq('is_active', true);
        } else {
            await supabaseClient.from('commission_rules').update({ is_active: false }).eq('scope', 'product').eq('product_id', product_id).eq('is_active', true);
        }

        const row = {
            scope,
            category: scope === 'category' ? category : null,
            product_id: scope === 'product' ? product_id : null,
            rate_percent: rate,
            is_active: true,
            label,
            created_by: currentUser.id
        };
        const { error } = await supabaseClient.from('commission_rules').insert(row);
        if (error) throw error;
        await refreshCommissionRules();
    } catch (err) {
        showError(err.message || 'Failed to save rule');
    }
}

async function loadSalesRepsPage() {
    const content = document.getElementById('contentArea');
    if (!['owner', 'admin'].includes(currentUserProfile.role)) {
        content.innerHTML = '<div class="empty-state"><h3>Access Denied</h3></div>';
        return;
    }

    content.innerHTML = `
        <div id="salesRepsRoot">
            <p style="color:var(--text-muted);margin-bottom:12px;">
                Invite the user in Supabase Auth first, ensure a <code>user_profiles</code> row exists,
                then set role and create their sales profile / referral code here.
            </p>
            <div class="sales-inline-form">
                <div class="form-group">
                    <label>User (staff profiles)</label>
                    <select id="repUserSelect"></select>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Role</label>
                        <select id="repRoleSelect">
                            <option value="sales_rep">sales_rep</option>
                            <option value="chief_of_sales">chief_of_sales</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Referral code</label>
                        <input type="text" id="repReferralCode" placeholder="e.g. MWANGI01" maxlength="16">
                    </div>
                </div>
                <div class="form-group">
                    <label>Display name</label>
                    <input type="text" id="repDisplayName" placeholder="Optional">
                </div>
                <button type="button" class="btn btn-primary" id="saveRepBtn">Set role + create sales profile</button>
            </div>
            <div class="table-container">
                <div class="table-header"><h3>Sales team</h3></div>
                <div id="repsTable" style="overflow-x:auto;"></div>
            </div>
        </div>
    `;

    const { data: profiles } = await supabaseClient
        .from('user_profiles')
        .select('id, email, full_name, role')
        .order('email');
    const sel = document.getElementById('repUserSelect');
    sel.innerHTML = (profiles || []).map((p) =>
        `<option value="${p.id}">${escapeSalesHtml(p.full_name || p.email)} — ${escapeSalesHtml(p.role)} (${escapeSalesHtml(p.email)})</option>`
    ).join('') || '<option value="">No profiles</option>';

    salesAttachDeliberateActivate(document.getElementById('saveRepBtn'), saveSalesRepAdmin);
    await refreshSalesRepsTable();
}

async function saveSalesRepAdmin() {
    const userId = document.getElementById('repUserSelect')?.value;
    const role = document.getElementById('repRoleSelect')?.value;
    const code = document.getElementById('repReferralCode')?.value.trim().toUpperCase() || null;
    const display = document.getElementById('repDisplayName')?.value.trim() || null;
    if (!userId) {
        showError('Select a user');
        return;
    }
    try {
        const { error: roleErr } = await supabaseClient
            .from('user_profiles')
            .update({ role })
            .eq('id', userId);
        if (roleErr) throw roleErr;

        const { error } = await supabaseClient.rpc('ensure_sales_rep_profile', {
            p_user_id: userId,
            p_display_name: display,
            p_referral_code: code,
            p_phone: null
        });
        if (error) throw error;
        await refreshSalesRepsTable();
        alert('Sales profile saved. Referral code is active.');
    } catch (err) {
        showError(err.message || 'Failed to save sales rep');
    }
}

async function refreshSalesRepsTable() {
    const table = document.getElementById('repsTable');
    if (!table) return;
    const { data, error } = await supabaseClient
        .from('sales_reps')
        .select('*, user_profiles(email, role, full_name)')
        .order('display_name');
    if (error) {
        table.innerHTML = `<p>${escapeSalesHtml(error.message)}</p>`;
        return;
    }
    table.innerHTML = `
        <table class="data-table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Code</th><th>Active</th><th>Link</th></tr></thead>
            <tbody>
                ${(data || []).map((r) => {
                    const origin = window.location.origin + window.location.pathname.replace(/\/admin\/?$/, '/');
                    const link = `${origin}?ref=${encodeURIComponent(r.referral_code)}`;
                    return `
                        <tr>
                            <td>${escapeSalesHtml(r.display_name)}</td>
                            <td>${escapeSalesHtml(r.user_profiles?.email || '')}</td>
                            <td>${escapeSalesHtml(r.user_profiles?.role || '')}</td>
                            <td><code>${escapeSalesHtml(r.referral_code)}</code></td>
                            <td>${r.is_active ? 'Yes' : 'No'}</td>
                            <td><small>${escapeSalesHtml(link)}</small></td>
                        </tr>
                    `;
                }).join('') || '<tr><td colspan="6">No sales reps yet</td></tr>'}
            </tbody>
        </table>
    `;
}

// Page entry points used by admin.js router
async function loadSalesPage() {
    // Role-aware default: reps → my sales; leadership → team overview shortcut via my-sales still useful
    if (isSalesRepOnly()) {
        await loadMySalesPage();
    } else if (isSalesLeadership()) {
        await loadMySalesPage();
    } else {
        document.getElementById('contentArea').innerHTML = '<div class="empty-state"><h3>Access Denied</h3></div>';
    }
}

window.loadSalesPage = loadSalesPage;
window.loadMySalesPage = loadMySalesPage;
window.loadSalesTeamPage = loadSalesTeamPage;
window.loadSalesTasksPage = loadSalesTasksPage;
window.loadCommissionRulesPage = loadCommissionRulesPage;
window.loadSalesRepsPage = loadSalesRepsPage;
window.updateSalesNavVisibility = updateSalesNavVisibility;
window.unsubscribeSalesRealtime = unsubscribeSalesRealtime;
