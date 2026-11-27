/**
 * Admin → Messages
 * Website contact-form inbox (public.contact_messages), newest first.
 * Staff read/update is enforced by RLS; this UI is only a convenience layer.
 *
 * Depends on: supabaseClient, currentUserProfile, showError (admin.js),
 *             roleCanAccessPage (roles.js)
 */

let contactMessagesCache = [];

/** Escapes text AND attribute context (admin.js escapeHtml leaves quotes untouched). */
function msgEsc(v) {
    return String(v == null ? '' : v)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function messagesFormatDateTime(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-KE', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

async function loadMessagesPage() {
    const content = document.getElementById('contentArea');

    if (typeof roleCanAccessPage === 'function' && !roleCanAccessPage('messages')) {
        content.innerHTML = '<div class="empty-state"><h3>Access Denied</h3></div>';
        return;
    }

    content.innerHTML = `
        <div class="stats-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); margin-bottom: 24px;">
            <div class="stat-card">
                <div class="stat-value" id="msgNewCount">-</div>
                <div class="stat-label">New Messages</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="msgTotalCount">-</div>
                <div class="stat-label">Total Received</div>
            </div>
        </div>

        <div class="search-filter-bar">
            <div class="search-box">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                </svg>
                <input type="text" placeholder="Search name, email, phone, message..." id="messageSearch">
            </div>
            <select class="filter-select" id="messageStatusFilter">
                <option value="new">New only</option>
                <option value="">All messages</option>
                <option value="handled">Handled</option>
            </select>
        </div>

        <div class="table-container">
            <div class="table-header">
                <h3>Website Messages</h3>
                <button class="action-btn action-btn-secondary" id="messagesRefreshBtn" type="button">Refresh</button>
            </div>
            <div id="messagesTable">
                <div style="padding: 40px; text-align: center;">
                    <div class="loading-spinner"></div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('messageSearch').addEventListener('input', renderMessagesTable);
    document.getElementById('messageStatusFilter').addEventListener('change', renderMessagesTable);
    document.getElementById('messagesRefreshBtn').addEventListener('click', refreshMessages);

    await refreshMessages();
}

async function refreshMessages() {
    const container = document.getElementById('messagesTable');
    try {
        const { data, error } = await supabaseClient
            .from('contact_messages')
            .select('id, created_at, name, email, phone, topic, vehicle, message, source, status, handled_at, handled_by')
            .order('created_at', { ascending: false })
            .limit(500);

        if (error) throw error;
        contactMessagesCache = data || [];
        renderMessagesTable();
    } catch (error) {
        console.error('Load messages error:', error);
        if (container) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>Messages not available</h3>
                    <p>The contact_messages table may not be set up yet, or your role cannot read it.</p>
                </div>`;
        }
    }
}

function renderMessagesTable() {
    const container = document.getElementById('messagesTable');
    if (!container) return;

    const statusFilter = document.getElementById('messageStatusFilter')?.value || '';
    const q = (document.getElementById('messageSearch')?.value || '').trim().toLowerCase();

    const newCount = contactMessagesCache.filter((m) => m.status === 'new').length;
    const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setText('msgNewCount', newCount);
    setText('msgTotalCount', contactMessagesCache.length);

    const rows = contactMessagesCache.filter((m) => {
        if (statusFilter && m.status !== statusFilter) return false;
        if (!q) return true;
        return [m.name, m.email, m.phone, m.message, m.topic, m.vehicle]
            .some((v) => String(v || '').toLowerCase().includes(q));
    });

    if (rows.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No messages</h3></div>';
        return;
    }

    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Received</th>
                    <th>From</th>
                    <th>Message</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map(renderMessageRow).join('')}
            </tbody>
        </table>
    `;
}

function renderMessageRow(m) {
    const isNew = m.status === 'new';
    const contactBits = [];
    if (m.email) contactBits.push(`<a href="mailto:${msgEsc(m.email)}">${msgEsc(m.email)}</a>`);
    if (m.phone) contactBits.push(`<a href="tel:${msgEsc(String(m.phone).replace(/[^+\d]/g, ''))}">${msgEsc(m.phone)}</a>`);

    const meta = [m.topic, m.vehicle].filter(Boolean).map((v) => msgEsc(v)).join(' · ');

    let replyBtn = '';
    if (m.email) {
        const subject = `Re: your message to Knight Watts Auto Parts`;
        const href = `mailto:${encodeURIComponent(m.email).replace(/%40/g, '@')}?subject=${encodeURIComponent(subject)}`;
        replyBtn = `<a class="action-btn action-btn-primary" href="${msgEsc(href)}">Reply</a>`;
    }

    const toggleBtn = isNew
        ? `<button class="action-btn action-btn-secondary" type="button" onclick="setMessageStatus('${msgEsc(m.id)}', 'handled')">Mark handled</button>`
        : `<button class="action-btn action-btn-secondary" type="button" onclick="setMessageStatus('${msgEsc(m.id)}', 'new')">Reopen</button>`;

    return `
        <tr>
            <td>${msgEsc(messagesFormatDateTime(m.created_at))}</td>
            <td>
                <strong>${msgEsc(m.name)}</strong><br>
                <small>${contactBits.join('<br>') || '—'}</small>
            </td>
            <td style="max-width: 420px; white-space: pre-wrap; word-break: break-word;">${meta ? `<small style="color: var(--text-muted);">${meta}</small>\n` : ''}${msgEsc(m.message)}</td>
            <td>
                <span class="status-badge ${isNew ? 'new' : 'handled'}">${isNew ? 'new' : 'handled'}</span>
                ${!isNew && m.handled_at ? `<br><small>${msgEsc(messagesFormatDateTime(m.handled_at))}</small>` : ''}
            </td>
            <td style="white-space: nowrap;">${replyBtn} ${toggleBtn}</td>
        </tr>
    `;
}

async function setMessageStatus(id, status) {
    if (!['new', 'handled'].includes(status)) return;
    try {
        // handled_by / handled_at are stamped server-side by a trigger
        const { error } = await supabaseClient
            .from('contact_messages')
            .update({ status })
            .eq('id', id);
        if (error) throw error;
        await refreshMessages();
    } catch (error) {
        console.error('Update message status error:', error);
        showError('Could not update the message. Your role may not have permission.');
    }
}

window.loadMessagesPage = loadMessagesPage;
window.setMessageStatus = setMessageStatus;
