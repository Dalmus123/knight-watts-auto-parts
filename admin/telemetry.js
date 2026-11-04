/**
 * Live Telemetry Dashboard with Supabase Realtime
 */

let telemetrySubscription = null;
let telemetryEvents = [];

async function loadTelemetryPage() {
    const content = document.getElementById('contentArea');
    
    content.innerHTML = `
        <div class="stats-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">
            <div class="stat-card">
                <div class="stat-value" id="criticalAlerts">0</div>
                <div class="stat-label">Critical Alerts</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="lowStockItems">0</div>
                <div class="stat-label">Low Stock Items</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="printJobsProgress">0</div>
                <div class="stat-label">Print Jobs in Progress</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="recentUpdates">0</div>
                <div class="stat-label">Updates (Last Hour)</div>
            </div>
        </div>

        <div style="display: flex; gap: 16px; margin-bottom: 24px;">
            <button class="btn btn-primary" onclick="refreshTelemetryView()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="23 4 23 10 17 10"></polyline>
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                </svg>
                Refresh
            </button>
            <div style="flex: 1;"></div>
            <select id="severityFilter" class="filter-select" onchange="filterTelemetry()">
                <option value="">All Severities</option>
                <option value="critical">Critical</option>
                <option value="warning">Warning</option>
                <option value="info">Info</option>
            </select>
            <select id="eventTypeFilter" class="filter-select" onchange="filterTelemetry()">
                <option value="">All Event Types</option>
                <option value="stock_update">Stock Update</option>
                <option value="low_stock_alert">Low Stock Alert</option>
                <option value="location_change">Location Change</option>
                <option value="print_progress">Print Progress</option>
            </select>
        </div>

        <div class="table-container">
            <div class="table-header">
                <h3>Live Telemetry Feed</h3>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span id="realtimeStatus" style="display: flex; align-items: center; gap: 8px; color: var(--text-muted); font-size: 14px;">
                        <span style="width: 8px; height: 8px; border-radius: 50%; background: var(--success);"></span>
                        Live
                    </span>
                </div>
            </div>
            <div id="telemetryTable">
                <div style="padding: 40px; text-align: center;">
                    <div class="loading-spinner"></div>
                    <p style="margin-top: 16px; color: var(--text-muted);">Loading telemetry data...</p>
                </div>
            </div>
        </div>

        <div id="alertsSection" style="margin-top: 32px;">
            <div class="table-container">
                <div class="table-header">
                    <h3>Active Alerts</h3>
                    <button class="action-btn action-btn-secondary" onclick="clearAcknowledgedAlerts()">Clear Acknowledged</button>
                </div>
                <div id="alertsTable">
                    <div style="padding: 40px; text-align: center;">
                        <div class="loading-spinner"></div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Load telemetry data
    await refreshTelemetryView();
    
    // Subscribe to real-time updates
    subscribeToTelemetry();
}

async function refreshTelemetryView() {
    try {
        // Get recent telemetry events (last 24 hours)
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        
        const { data: events, error } = await supabase
            .from('telemetry_events')
            .select(`
                *,
                product:products(name, category, location),
                print_job:print_jobs(job_number, part_name)
            `)
            .gte('event_timestamp', oneDayAgo)
            .order('event_timestamp', { ascending: false })
            .limit(100);

        if (error) throw error;

        telemetryEvents = events || [];
        
        // Update stats
        updateTelemetryStats(telemetryEvents);
        
        // Render events
        renderTelemetryEvents(telemetryEvents);
        
        // Load and render alerts
        await loadActiveAlerts();

    } catch (error) {
        console.error('Load telemetry error:', error);
        showError('Failed to load telemetry data');
    }
}

function updateTelemetryStats(events) {
    // Critical alerts
    const critical = events.filter(e => e.severity === 'critical').length;
    document.getElementById('criticalAlerts').textContent = critical;
    
    // Low stock items
    const lowStock = events.filter(e => e.event_type === 'low_stock_alert').length;
    document.getElementById('lowStockItems').textContent = lowStock;
    
    // Print jobs in progress
    const printProgress = events.filter(e => e.event_type === 'print_progress').length;
    document.getElementById('printJobsProgress').textContent = printProgress;
    
    // Recent updates (last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recent = events.filter(e => new Date(e.event_timestamp) > oneHourAgo).length;
    document.getElementById('recentUpdates').textContent = recent;
}

function renderTelemetryEvents(events) {
    const container = document.getElementById('telemetryTable');
    
    if (!events || events.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No Telemetry Events</h3><p>No events recorded in the last 24 hours.</p></div>';
        return;
    }
    
    const html = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Time</th>
                    <th>Type</th>
                    <th>Severity</th>
                    <th>Entity</th>
                    <th>Details</th>
                    <th>Location</th>
                    <th>Source</th>
                </tr>
            </thead>
            <tbody>
                ${events.map(event => `
                    <tr onclick="viewTelemetryDetails('${event.id}')" style="cursor: pointer;">
                        <td>${formatTime(event.event_timestamp)}</td>
                        <td><span class="status-badge">${formatEventType(event.event_type)}</span></td>
                        <td>
                            <span class="status-badge ${event.severity === 'critical' ? 'failed' : event.severity === 'warning' ? 'pending' : ''}">
                                ${event.severity}
                            </span>
                        </td>
                        <td>
                            ${event.product ? event.product.name : event.print_job ? event.print_job.part_name : '-'}
                        </td>
                        <td><small>${formatEventData(event.event_data)}</small></td>
                        <td>${event.location || '-'}</td>
                        <td><small>${event.source}</small></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    container.innerHTML = html;
}

async function loadActiveAlerts() {
    try {
        const { data: alerts, error } = await supabase
            .from('telemetry_events')
            .select(`
                *,
                product:products(name, category, stock_quantity, low_stock_threshold)
            `)
            .in('event_type', ['low_stock_alert', 'restock_needed'])
            .eq('severity', 'critical')
            .order('event_timestamp', { ascending: false })
            .limit(20);

        if (error) throw error;

        renderAlerts(alerts || []);
    } catch (error) {
        console.error('Load alerts error:', error);
    }
}

function renderAlerts(alerts) {
    const container = document.getElementById('alertsTable');
    
    if (!alerts || alerts.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No active critical alerts</p></div>';
        return;
    }
    
    const html = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Time</th>
                    <th>Product</th>
                    <th>Alert</th>
                    <th>Current Stock</th>
                    <th>Threshold</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${alerts.map(alert => `
                    <tr>
                        <td>${formatTime(alert.event_timestamp)}</td>
                        <td><strong>${alert.product?.name || 'Unknown'}</strong></td>
                        <td><span class="status-badge failed">${alert.event_type === 'low_stock_alert' ? 'Low Stock' : 'Restock Needed'}</span></td>
                        <td>${alert.product?.stock_quantity || 0}</td>
                        <td>${alert.product?.low_stock_threshold || 5}</td>
                        <td>
                            <button class="action-btn action-btn-primary" onclick="acknowledgeAlert('${alert.id}')">Acknowledge</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    container.innerHTML = html;
}

function subscribeToTelemetry() {
    // Unsubscribe from previous subscription if exists
    if (telemetrySubscription) {
        supabase.removeChannel(telemetrySubscription);
    }
    
    // Subscribe to new telemetry events
    telemetrySubscription = supabase
        .channel('telemetry_realtime')
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'telemetry_events'
            },
            (payload) => {
                console.log('New telemetry event:', payload.new);
                
                // Add new event to the list
                telemetryEvents.unshift(payload.new);
                
                // Keep only last 100 events
                if (telemetryEvents.length > 100) {
                    telemetryEvents.pop();
                }
                
                // Update UI
                updateTelemetryStats(telemetryEvents);
                renderTelemetryEvents(telemetryEvents);
                
                // Show notification for critical events
                if (payload.new.severity === 'critical') {
                    showNotification('Critical Alert', formatEventData(payload.new.event_data));
                    loadActiveAlerts(); // Refresh alerts
                }
            }
        )
        .subscribe();
    
    // Update status indicator
    document.getElementById('realtimeStatus').innerHTML = `
        <span style="width: 8px; height: 8px; border-radius: 50%; background: var(--success); animation: pulse 2s infinite;"></span>
        Live
    `;
}

function filterTelemetry() {
    const severityFilter = document.getElementById('severityFilter').value;
    const eventTypeFilter = document.getElementById('eventTypeFilter').value;
    
    let filtered = [...telemetryEvents];
    
    if (severityFilter) {
        filtered = filtered.filter(e => e.severity === severityFilter);
    }
    
    if (eventTypeFilter) {
        filtered = filtered.filter(e => e.event_type === eventTypeFilter);
    }
    
    renderTelemetryEvents(filtered);
}

function formatEventType(type) {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function formatEventData(data) {
    if (!data) return '';
    
    // Create a concise summary
    const keys = Object.keys(data).slice(0, 3);
    const summary = keys.map(key => `${key}: ${data[key]}`).join(', ');
    
    return summary.length > 50 ? summary.substring(0, 47) + '...' : summary;
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    
    return date.toLocaleString('en-KE', { 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
    });
}

function viewTelemetryDetails(id) {
    const event = telemetryEvents.find(e => e.id === id);
    if (!event) return;
    
    const details = JSON.stringify(event.event_data, null, 2);
    alert(`Event Details:\n\n${details}\n\nSource: ${event.source}\nTimestamp: ${new Date(event.event_timestamp).toLocaleString()}`);
}

async function acknowledgeAlert(id) {
    // Mark alert as acknowledged (you could add an 'acknowledged' field to the table)
    showSuccess('Alert acknowledged');
    await loadActiveAlerts();
}

function clearAcknowledgedAlerts() {
    showSuccess('Acknowledged alerts cleared');
    loadActiveAlerts();
}

function showNotification(title, message) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body: message });
    } else {
        // Fallback to browser alert
        console.log(`NOTIFICATION: ${title} - ${message}`);
    }
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (telemetrySubscription) {
        supabase.removeChannel(telemetrySubscription);
    }
});

// Add CSS animation for pulse
const style = document.createElement('style');
style.textContent = `
    @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
    }
`;
document.head.appendChild(style);

// Export functions
window.loadTelemetryPage = loadTelemetryPage;
window.refreshTelemetryView = refreshTelemetryView;
window.filterTelemetry = filterTelemetry;
window.viewTelemetryDetails = viewTelemetryDetails;
window.acknowledgeAlert = acknowledgeAlert;
window.clearAcknowledgedAlerts = clearAcknowledgedAlerts;
