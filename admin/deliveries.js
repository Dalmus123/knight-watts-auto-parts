/**
 * Delivery Schedule and Coordination Dashboard
 */

let deliverySubscription = null;

async function loadDeliveriesPage() {
    const content = document.getElementById('contentArea');
    
    if (!['owner', 'admin'].includes(currentUserProfile.role)) {
        content.innerHTML = '<div class="empty-state"><h3>Access Denied</h3></div>';
        return;
    }
    
    content.innerHTML = `
        <div class="stats-grid" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));">
            <div class="stat-card">
                <div class="stat-value" id="todayDeliveries">0</div>
                <div class="stat-label">Today's Deliveries</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="inTransit">0</div>
                <div class="stat-label">In Transit</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="scheduled">0</div>
                <div class="stat-label">Scheduled</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="completed">0</div>
                <div class="stat-label">Completed Today</div>
            </div>
        </div>

        <div style="display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap;">
            <button class="btn btn-primary" onclick="openCreateDeliveryModal()">
                Schedule Delivery
            </button>
            <div style="flex: 1;"></div>
            <select id="areaFilter" class="filter-select" onchange="filterDeliveries()">
                <option value="">All Areas</option>
                <option value="Embu">Embu</option>
                <option value="Garissa">Garissa</option>
            </select>
            <select id="statusFilter" class="filter-select" onchange="filterDeliveries()">
                <option value="">All Statuses</option>
                <option value="scheduled">Scheduled</option>
                <option value="in_transit">In Transit</option>
                <option value="out_for_delivery">Out for Delivery</option>
                <option value="delivered">Delivered</option>
            </select>
            <input type="date" id="dateFilter" class="filter-select" onchange="filterDeliveries()">
        </div>

        <div class="table-container">
            <div class="table-header">
                <h3>Delivery Schedule</h3>
                <button class="action-btn action-btn-secondary" onclick="refreshDeliveriesView()">Refresh</button>
            </div>
            <div id="deliveriesCalendar">
                <div style="padding: 40px; text-align: center;">
                    <div class="loading-spinner"></div>
                </div>
            </div>
        </div>

        <div id="deliveryDetailsModal" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Delivery Details</h3>
                    <button class="modal-close" onclick="closeDeliveryModal()">×</button>
                </div>
                <div class="modal-body" id="deliveryDetailsContent">
                    <!-- Details populated dynamically -->
                </div>
            </div>
        </div>
    `;

    // Set today's date as default filter
    document.getElementById('dateFilter').valueAsDate = new Date();
    
    // Load deliveries
    await refreshDeliveriesView();
    
    // Subscribe to real-time updates
    subscribeToDeliveries();
}

async function refreshDeliveriesView() {
    try {
        const { data: deliveries, error } = await supabaseClient
            .from('deliveries')
            .select(`
                *,
                order:orders(order_number, customer_name, customer_phone, total_kes)
            `)
            .order('scheduled_date', { ascending: true })
            .order('priority', { ascending: false });

        if (error) throw error;

        // Update stats
        updateDeliveryStats(deliveries || []);
        
        // Render calendar
        renderDeliveriesCalendar(deliveries || []);

    } catch (error) {
        console.error('Load deliveries error:', error);
        showError('Failed to load deliveries');
    }
}

function updateDeliveryStats(deliveries) {
    const today = new Date().toISOString().split('T')[0];
    
    const todayDeliveries = deliveries.filter(d => 
        d.scheduled_date?.startsWith(today)
    ).length;
    
    const inTransit = deliveries.filter(d => 
        d.status === 'in_transit' || d.status === 'out_for_delivery'
    ).length;
    
    const scheduled = deliveries.filter(d => 
        d.status === 'scheduled' || d.status === 'assigned'
    ).length;
    
    const completed = deliveries.filter(d => 
        d.status === 'delivered' && d.delivered_at?.startsWith(today)
    ).length;
    
    document.getElementById('todayDeliveries').textContent = todayDeliveries;
    document.getElementById('inTransit').textContent = inTransit;
    document.getElementById('scheduled').textContent = scheduled;
    document.getElementById('completed').textContent = completed;
}

function renderDeliveriesCalendar(deliveries) {
    const container = document.getElementById('deliveriesCalendar');
    
    if (!deliveries || deliveries.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No Deliveries Scheduled</h3></div>';
        return;
    }
    
    // Group by date
    const grouped = {};
    deliveries.forEach(delivery => {
        const date = delivery.scheduled_date || 'unscheduled';
        if (!grouped[date]) grouped[date] = [];
        grouped[date].push(delivery);
    });
    
    // Sort dates
    const sortedDates = Object.keys(grouped).sort();
    
    let html = '';
    sortedDates.forEach(date => {
        const dateDeliveries = grouped[date];
        const dateObj = date !== 'unscheduled' ? new Date(date) : null;
        const isToday = dateObj && dateObj.toISOString().split('T')[0] === new Date().toISOString().split('T')[0];
        
        html += `
            <div style="margin-bottom: 32px;">
                <h3 style="font-size: 18px; padding: 12px 24px; background: var(--dark-bg); border-radius: 8px; margin-bottom: 16px;">
                    ${date === 'unscheduled' ? 'Unscheduled' : formatDate(dateObj)}
                    ${isToday ? '<span style="color: var(--primary-color); margin-left: 8px;">• Today</span>' : ''}
                    <span style="color: var(--text-muted); font-size: 14px; margin-left: 12px;">${dateDeliveries.length} deliveries</span>
                </h3>
                
                <div style="display: grid; gap: 16px;">
                    ${dateDeliveries.map(delivery => renderDeliveryCard(delivery)).join('')}
                </div>
            </div>
        `;
    });
    
    container.innerHTML = `<div style="padding: 24px;">${html}</div>`;
}

function renderDeliveryCard(delivery) {
    const statusColors = {
        scheduled: 'var(--warning)',
        assigned: 'var(--primary-color)',
        in_transit: '#3B82F6',
        out_for_delivery: '#10B981',
        delivered: 'var(--success)',
        failed: 'var(--danger)',
        cancelled: 'var(--text-muted)'
    };
    
    return `
        <div class="print-job-card" style="border-left: 4px solid ${statusColors[delivery.status] || 'var(--dark-border)'};">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 16px;">
                <div style="flex: 1;">
                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                        <strong style="font-size: 16px;">${delivery.delivery_number}</strong>
                        ${delivery.is_express ? '<span style="background: var(--danger); color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">EXPRESS</span>' : ''}
                    </div>
                    <div style="color: var(--text-muted); font-size: 14px;">
                        ${delivery.order?.order_number || 'No order'} • ${delivery.customer_name}
                    </div>
                </div>
                <div>
                    <span class="status-badge ${delivery.status}">${formatStatus(delivery.status)}</span>
                    ${delivery.priority > 7 ? '<div style="margin-top: 4px; font-size: 12px; color: var(--danger);">High Priority</div>' : ''}
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 16px; font-size: 14px;">
                <div>
                    <div style="color: var(--text-muted);">Area</div>
                    <strong>${delivery.delivery_area}</strong>
                </div>
                <div>
                    <div style="color: var(--text-muted);">Time Slot</div>
                    <strong>${delivery.scheduled_time_slot || 'Not set'}</strong>
                </div>
                <div>
                    <div style="color: var(--text-muted);">Rider</div>
                    <strong>${delivery.rider_name || 'Unassigned'}</strong>
                </div>
                <div>
                    <div style="color: var(--text-muted);">Contact</div>
                    <strong>${delivery.customer_phone}</strong>
                </div>
            </div>
            
            ${delivery.current_location ? `
                <div style="padding: 12px; background: rgba(0, 168, 107, 0.1); border-radius: 8px; margin-bottom: 16px; font-size: 14px;">
                    <strong style="color: var(--primary-color);">📍 ${delivery.current_location}</strong>
                </div>
            ` : ''}
            
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                <button class="action-btn action-btn-secondary" onclick="viewDeliveryDetails('${delivery.id}')">View Details</button>
                ${delivery.status === 'scheduled' ? `
                    <button class="action-btn action-btn-primary" onclick="updateDeliveryStatus('${delivery.id}', 'in_transit')">Start Delivery</button>
                ` : ''}
                ${delivery.status === 'in_transit' ? `
                    <button class="action-btn action-btn-primary" onclick="updateDeliveryStatus('${delivery.id}', 'out_for_delivery')">Out for Delivery</button>
                ` : ''}
                ${delivery.status === 'out_for_delivery' ? `
                    <button class="action-btn action-btn-primary" onclick="markDelivered('${delivery.id}')">Mark Delivered</button>
                ` : ''}
                ${['scheduled', 'assigned', 'in_transit'].includes(delivery.status) ? `
                    <button class="action-btn action-btn-secondary" onclick="updateDeliveryLocation('${delivery.id}')">Update Location</button>
                ` : ''}
            </div>
        </div>
    `;
}

async function viewDeliveryDetails(id) {
    try {
        const { data: delivery, error } = await supabaseClient
            .from('deliveries')
            .select(`
                *,
                order:orders(*)
            `)
            .eq('id', id)
            .single();

        if (error) throw error;

        const modalContent = document.getElementById('deliveryDetailsContent');
        modalContent.innerHTML = `
            <div style="display: grid; gap: 24px;">
                <div>
                    <h4 style="margin-bottom: 12px;">Delivery Information</h4>
                    <div class="detail-row">
                        <span class="detail-label">Delivery Number</span>
                        <span class="detail-value">${delivery.delivery_number}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Status</span>
                        <span class="status-badge ${delivery.status}">${formatStatus(delivery.status)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Scheduled Date</span>
                        <span class="detail-value">${formatDate(new Date(delivery.scheduled_date))}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Time Slot</span>
                        <span class="detail-value">${delivery.scheduled_time_slot || 'Not set'}</span>
                    </div>
                </div>

                <div>
                    <h4 style="margin-bottom: 12px;">Customer Details</h4>
                    <div class="detail-row">
                        <span class="detail-label">Name</span>
                        <span class="detail-value">${delivery.customer_name}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Phone</span>
                        <span class="detail-value">${delivery.customer_phone}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Address</span>
                        <span class="detail-value">${delivery.delivery_address}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Area</span>
                        <span class="detail-value">${delivery.delivery_area}</span>
                    </div>
                </div>

                ${delivery.rider_name ? `
                    <div>
                        <h4 style="margin-bottom: 12px;">Rider Information</h4>
                        <div class="detail-row">
                            <span class="detail-label">Name</span>
                            <span class="detail-value">${delivery.rider_name}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Phone</span>
                            <span class="detail-value">${delivery.rider_phone || '-'}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Vehicle</span>
                            <span class="detail-value">${delivery.vehicle_details || '-'}</span>
                        </div>
                    </div>
                ` : ''}

                ${delivery.tracking_updates && delivery.tracking_updates.length > 0 ? `
                    <div>
                        <h4 style="margin-bottom: 12px;">Tracking History</h4>
                        <div style="display: flex; flex-direction: column; gap: 8px;">
                            ${delivery.tracking_updates.map(update => `
                                <div style="padding: 12px; background: var(--dark-bg); border-radius: 8px;">
                                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                                        <strong>${update.status}</strong>
                                        <small style="color: var(--text-muted);">${formatTime(update.timestamp)}</small>
                                    </div>
                                    ${update.location ? `<div style="color: var(--text-secondary); font-size: 14px;">📍 ${update.location}</div>` : ''}
                                    ${update.notes ? `<div style="color: var(--text-muted); font-size: 13px; margin-top: 4px;">${update.notes}</div>` : ''}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;

        document.getElementById('deliveryDetailsModal').classList.add('active');

    } catch (error) {
        console.error('View delivery error:', error);
        showError('Failed to load delivery details');
    }
}

async function updateDeliveryStatus(id, newStatus) {
    try {
        const { error } = await supabaseClient
            .from('deliveries')
            .update({ status: newStatus })
            .eq('id', id);

        if (error) throw error;

        showSuccess('Delivery status updated');
        await refreshDeliveriesView();
    } catch (error) {
        showError('Failed to update delivery status');
    }
}

async function updateDeliveryLocation(id) {
    const location = prompt('Enter current location:');
    if (!location) return;

    try {
        // Call the function to add tracking update
        const { error } = await supabaseClient.rpc('add_delivery_tracking_update', {
            delivery_id: id,
            update_status: 'location_update',
            update_location: location,
            update_notes: null
        });

        if (error) throw error;

        showSuccess('Location updated');
        await refreshDeliveriesView();
    } catch (error) {
        showError('Failed to update location');
    }
}

async function markDelivered(id) {
    const deliveredTo = prompt('Who received the delivery?');
    if (!deliveredTo) return;

    try {
        const { error } = await supabaseClient
            .from('deliveries')
            .update({
                status: 'delivered',
                delivered_at: new Date().toISOString(),
                delivered_to: deliveredTo
            })
            .eq('id', id);

        if (error) throw error;

        showSuccess('Delivery marked as complete');
        await refreshDeliveriesView();
    } catch (error) {
        showError('Failed to mark delivery as complete');
    }
}

function subscribeToDeliveries() {
    if (deliverySubscription) {
        supabaseClient.removeChannel(deliverySubscription);
    }

    deliverySubscription = supabaseClient
        .channel('deliveries_realtime')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'deliveries'
            },
            (payload) => {
                console.log('Delivery update:', payload);
                refreshDeliveriesView();
            }
        )
        .subscribe();
}

function filterDeliveries() {
    // Implement filtering logic
    refreshDeliveriesView();
}

function openCreateDeliveryModal() {
    showError('Delivery creation form coming soon. Use Supabase Dashboard for now.');
}

function closeDeliveryModal() {
    document.getElementById('deliveryDetailsModal').classList.remove('active');
}

function formatStatus(status) {
    return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function formatDate(date) {
    return date.toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString('en-KE', { 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
    });
}

// Cleanup
window.addEventListener('beforeunload', () => {
    if (deliverySubscription) {
        supabaseClient.removeChannel(deliverySubscription);
    }
});

// Export functions
window.loadDeliveriesPage = loadDeliveriesPage;
window.refreshDeliveriesView = refreshDeliveriesView;
window.viewDeliveryDetails = viewDeliveryDetails;
window.updateDeliveryStatus = updateDeliveryStatus;
window.updateDeliveryLocation = updateDeliveryLocation;
window.markDelivered = markDelivered;
window.filterDeliveries = filterDeliveries;
window.openCreateDeliveryModal = openCreateDeliveryModal;
window.closeDeliveryModal = closeDeliveryModal;
