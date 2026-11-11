/**
 * Knight Watts Auto Parts - Admin Dashboard
 * Main admin interface controller
 */

let supabaseClient = null;
let currentUser = null;
let currentUserProfile = null;
let currentRoute = 'dashboard';
let allProducts = []; // Store all products for filtering

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Hide both screens initially while checking auth
    const loginScreen = document.getElementById('loginScreen');
    const adminPanel = document.getElementById('adminPanel');
    
    loginScreen.style.display = 'none';
    adminPanel.style.display = 'none';
    
    // Check if Supabase is configured
    if (!isConfigured()) {
        loginScreen.style.display = 'flex';
        showError('Supabase not configured. Please update supabase/config.js with your project credentials.');
        return;
    }
    
    // Initialize Supabase client
    supabaseClient = initSupabase();
    
    if (!supabaseClient) {
        loginScreen.style.display = 'flex';
        showError('Failed to initialize Supabase client. Please check the console for errors.');
        return;
    }
    
    // Check for existing session
    try {
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        
        if (error) throw error;
        
        if (session && session.user) {
            // User has active session - load profile and show admin panel
            await loadUserProfile(session.user);
        } else {
            // No session - show login screen
            loginScreen.style.display = 'flex';
        }
    } catch (error) {
        console.error('Auth initialization error:', error);
        loginScreen.style.display = 'flex';
    }
    
    // Set up auth listeners
    setupAuthListeners();
    
    // Set up event handlers
    setupEventHandlers();
    
    // Set up mobile menu
    setupMobileMenu();
    
    // Set up routing
    setupRouting();
    
    // Set up service worker update handling
    setupServiceWorkerUpdate();
});

// Service Worker Update Handling
function setupServiceWorkerUpdate() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('../service-worker.js').then(registration => {
            // Check for updates every 60 seconds
            setInterval(() => {
                registration.update();
            }, 60000);
            
            // Listen for updates
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        // New service worker available
                        showUpdateNotification();
                    }
                });
            });
        });
        
        // Handle controller change (when new SW takes over)
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            window.location.reload();
        });
    }
}

function showUpdateNotification() {
    const notification = document.getElementById('updateNotification');
    const updateBtn = document.getElementById('updateBtn');
    const dismissBtn = document.getElementById('dismissUpdateBtn');
    
    if (!notification) return;
    
    notification.style.display = 'block';
    
    updateBtn.onclick = () => {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistration().then(registration => {
                if (registration && registration.waiting) {
                    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                }
            });
        }
    };
    
    dismissBtn.onclick = () => {
        notification.style.display = 'none';
    };
}

// Auth Functions
function setupAuthListeners() {
    // Login form
    document.getElementById('loginForm')?.addEventListener('submit', handleLogin);
    
    // Logout button
    document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);
    
    // Listen for auth state changes
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN') {
            await loadUserProfile(session.user);
        } else if (event === 'SIGNED_OUT') {
            showLoginScreen();
        }
    });
}

async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');
    
    errorDiv.style.display = 'none';
    
    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email,
            password
        });
        
        if (error) throw error;
        
        // Success - loadUserProfile will be called by auth state change listener
    } catch (error) {
        errorDiv.textContent = error.message;
        errorDiv.style.display = 'block';
    }
}

async function handleLogout() {
    try {
        await supabaseClient.auth.signOut();
    } catch (error) {
        console.error('Logout error:', error);
    }
}

async function loadUserProfile(user) {
    try {
        const { data: profile, error } = await supabaseClient
            .from('user_profiles')
            .select('*')
            .eq('id', user.id)
            .single();
        
        if (error) {
            if (error.code === 'PGRST116') {
                // Profile doesn't exist
                showError('Your account has not been set up yet. Please contact the system administrator.');
                await supabaseClient.auth.signOut();
                return;
            }
            throw error;
        }
        
        currentUser = user;
        currentUserProfile = profile;
        
        showAdminPanel();
    } catch (error) {
        console.error('Profile load error:', error);
        showError('Failed to load user profile: ' + error.message);
    }
}

function showLoginScreen() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('adminPanel').style.display = 'none';
    currentUser = null;
    currentUserProfile = null;
}

function showAdminPanel() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'flex';
    
    // Update user info
    document.getElementById('userName').textContent = currentUserProfile.full_name || 'User';
    document.getElementById('userEmail').textContent = currentUserProfile.email;
    document.getElementById('userRole').textContent = currentUserProfile.role.toUpperCase();
    
    // Show/hide owner-only features
    const ownerOnly = document.querySelectorAll('.owner-only');
    ownerOnly.forEach(el => {
        el.style.display = currentUserProfile.role === 'owner' ? 'flex' : 'none';
    });
    
    // Don't call loadPage directly - routing will handle it
}

// Mobile Menu Setup
function setupMobileMenu() {
    const menuToggle = document.getElementById('mobileMenuToggle');
    const sidebar = document.getElementById('adminSidebar');
    const overlay = document.getElementById('mobileOverlay');
    
    if (!menuToggle || !sidebar || !overlay) return;
    
    const closeMobileMenu = () => {
        menuToggle.classList.remove('active');
        sidebar.classList.remove('mobile-open');
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    };
    
    const openMobileMenu = () => {
        menuToggle.classList.add('active');
        sidebar.classList.add('mobile-open');
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    };
    
    menuToggle.addEventListener('click', () => {
        if (sidebar.classList.contains('mobile-open')) {
            closeMobileMenu();
        } else {
            openMobileMenu();
        }
    });
    
    overlay.addEventListener('click', closeMobileMenu);
    
    // Close menu when nav item is clicked
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            if (window.innerWidth <= 968) {
                closeMobileMenu();
            }
        });
    });
    
    // Close menu on window resize if switching to desktop
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (window.innerWidth > 968) {
                closeMobileMenu();
            }
        }, 250);
    });
    
    // Store for global access
    window.closeMobileMenu = closeMobileMenu;
}

// Routing Setup - Hash-based navigation
function setupRouting() {
    // Handle back button / popstate
    window.addEventListener('popstate', (e) => {
        const route = window.location.hash.slice(2) || 'dashboard'; // Remove #/ prefix
        navigateToRoute(route, false); // false = don't push history again
    });
    
    // Initial route on load
    const initialRoute = window.location.hash.slice(2) || 'dashboard';
    navigateToRoute(initialRoute, false);
}

// Navigate to a route
function navigateToRoute(route, pushHistory = true) {
    currentRoute = route;
    
    // Update URL hash
    if (pushHistory) {
        window.location.hash = '#/' + route;
    }
    
    // Update active nav item
    document.querySelectorAll('.nav-item').forEach(item => {
        if (item.dataset.page === route) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    
    // Update mobile back button visibility
    updateMobileBackButton(route);
    
    // Load the page
    loadPage(route);
    
    // Close mobile menu if open
    if (window.closeMobileMenu) {
        window.closeMobileMenu();
    }
}

// Update mobile back button
function updateMobileBackButton(route) {
    const header = document.querySelector('.admin-header');
    if (!header) return;
    
    // Remove existing back button
    const existingBack = header.querySelector('.mobile-back-btn');
    if (existingBack) existingBack.remove();
    
    // Add back button on mobile if not on dashboard
    if (window.innerWidth <= 968 && route !== 'dashboard') {
        const backBtn = document.createElement('button');
        backBtn.className = 'mobile-back-btn';
        backBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
        `;
        backBtn.onclick = () => navigateToRoute('dashboard');
        header.insertBefore(backBtn, header.firstChild);
    }
}

// Navigation
function setupEventHandlers() {
    // Navigation - use routing instead of direct page load
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            navigateToRoute(page);
        });
    });
}

async function loadPage(page) {
    const contentArea = document.getElementById('contentArea');
    
    // Update page title
    const titles = {
        dashboard: 'Dashboard',
        products: 'Products',
        orders: 'Orders',
        requests: 'Custom Requests',
        printqueue: 'Print Queue',
        telemetry: 'Live Telemetry',
        deliveries: 'Delivery Schedule',
        analytics: 'Analytics & Evaluations',
        reports: 'Reports',
        users: 'User Management'
    };
    
    document.getElementById('pageTitle').textContent = titles[page] || 'Dashboard';
    
    // Load page content
    switch (page) {
        case 'dashboard':
            await loadDashboard();
            break;
        case 'products':
            await loadProducts();
            break;
        case 'orders':
            await loadOrders();
            break;
        case 'requests':
            await loadRequests();
            break;
        case 'printqueue':
            await loadPrintQueue();
            break;
        case 'telemetry':
            await loadTelemetryPage();
            break;
        case 'deliveries':
            await loadDeliveriesPage();
            break;
        case 'analytics':
            await loadAnalytics();
            break;
        case 'reports':
            await loadReports();
            break;
        case 'users':
            if (currentUserProfile.role === 'owner') {
                await loadUsers();
            }
            break;
    }
}

// Dashboard
async function loadDashboard() {
    const content = document.getElementById('contentArea');
    
    content.innerHTML = `
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="9" cy="21" r="1"></circle>
                        <circle cx="20" cy="21" r="1"></circle>
                        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                    </svg>
                </div>
                <div class="stat-value" id="totalOrders">-</div>
                <div class="stat-label">Total Orders</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="1" x2="12" y2="23"></line>
                        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                    </svg>
                </div>
                <div class="stat-value" id="totalRevenue">-</div>
                <div class="stat-label">Total Revenue (KES)</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                </div>
                <div class="stat-value" id="pendingRequests">-</div>
                <div class="stat-label">Pending Requests</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="6 9 6 2 18 2 18 9"></polyline>
                        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                        <rect x="6" y="14" width="12" height="8"></rect>
                    </svg>
                </div>
                <div class="stat-value" id="activePrintJobs">-</div>
                <div class="stat-label">Active Print Jobs</div>
            </div>
        </div>
        
        <div class="table-container">
            <div class="table-header">
                <h3>Recent Orders</h3>
                <button class="action-btn action-btn-primary" onclick="loadPage('orders')">View All</button>
            </div>
            <div id="recentOrdersTable"></div>
        </div>
        
        <div class="table-container">
            <div class="table-header">
                <h3>Recent Custom Requests</h3>
                <button class="action-btn action-btn-primary" onclick="loadPage('requests')">View All</button>
            </div>
            <div id="recentRequestsTable"></div>
        </div>
    `;
    
    // Load dashboard data
    await loadDashboardStats();
}

async function loadDashboardStats() {
    try {
        // Get total orders
        const { count: ordersCount } = await supabaseClient
            .from('orders')
            .select('*', { count: 'exact', head: true });
        
        document.getElementById('totalOrders').textContent = ordersCount || 0;
        
        // Get total revenue
        const { data: revenueData } = await supabaseClient
            .from('orders')
            .select('total_kes')
            .not('status', 'eq', 'cancelled');
        
        const totalRevenue = revenueData?.reduce((sum, order) => sum + parseFloat(order.total_kes || 0), 0) || 0;
        document.getElementById('totalRevenue').textContent = formatCurrency(totalRevenue);
        
        // Get pending requests
        const { count: requestsCount } = await supabaseClient
            .from('custom_part_requests')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');
        
        document.getElementById('pendingRequests').textContent = requestsCount || 0;
        
        // Get active print jobs
        const { count: printJobsCount } = await supabaseClient
            .from('print_jobs')
            .select('*', { count: 'exact', head: true })
            .in('status', ['queued', 'printing']);
        
        document.getElementById('activePrintJobs').textContent = printJobsCount || 0;
        
        // Load recent orders
        const { data: recentOrders } = await supabaseClient
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(5);
        
        renderRecentOrders(recentOrders);
        
        // Load recent requests
        const { data: recentRequests } = await supabaseClient
            .from('custom_part_requests')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(5);
        
        renderRecentRequests(recentRequests);
        
    } catch (error) {
        console.error('Dashboard stats error:', error);
    }
}

function renderRecentOrders(orders) {
    const container = document.getElementById('recentOrdersTable');
    
    if (!orders || orders.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No orders yet</p></div>';
        return;
    }
    
    const html = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Order #</th>
                    <th>Customer</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Date</th>
                </tr>
            </thead>
            <tbody>
                ${orders.map(order => `
                    <tr>
                        <td><strong>${order.order_number}</strong></td>
                        <td>${order.customer_name}</td>
                        <td>KES ${formatCurrency(order.total_kes)}</td>
                        <td><span class="status-badge ${order.status}">${order.status}</span></td>
                        <td>${formatDate(order.created_at)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    container.innerHTML = html;
}

function renderRecentRequests(requests) {
    const container = document.getElementById('recentRequestsTable');
    
    if (!requests || requests.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No requests yet</p></div>';
        return;
    }
    
    const html = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Request #</th>
                    <th>Customer</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Date</th>
                </tr>
            </thead>
            <tbody>
                ${requests.map(req => `
                    <tr>
                        <td><strong>${req.request_number}</strong></td>
                        <td>${req.customer_name}</td>
                        <td>${req.request_type}</td>
                        <td><span class="status-badge ${req.status}">${req.status}</span></td>
                        <td>${formatDate(req.created_at)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    container.innerHTML = html;
}

// Products Page
async function loadProducts() {
    const content = document.getElementById('contentArea');
    
    if (!['owner', 'admin'].includes(currentUserProfile.role)) {
        content.innerHTML = '<div class="empty-state"><h3>Access Denied</h3><p>You do not have permission to view this page.</p></div>';
        return;
    }
    
    content.innerHTML = `
        <div class="search-filter-bar">
            <div class="search-box">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                </svg>
                <input type="text" placeholder="Search products..." id="productSearch">
            </div>
            <button class="btn btn-primary" id="addProductBtn">Add Product</button>
        </div>
        
        <div class="table-container">
            <div class="table-header">
                <h3>All Products</h3>
            </div>
            <div id="productsTable">
                <div style="padding: 40px; text-align: center;">
                    <div class="loading-spinner"></div>
                    <p style="margin-top: 16px; color: var(--text-muted);">Loading products...</p>
                </div>
            </div>
        </div>
    `;
    
    // Load products first
    await refreshProductsTable();
    
    // Attach event listener for Add Product button (after products are loaded)
    const addBtn = document.getElementById('addProductBtn');
    if (addBtn) {
        // Use both click and touchend for better mobile support
        const handleAdd = (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('[Admin] Add Product button clicked');
            openAddProductModal();
        };
        addBtn.addEventListener('click', handleAdd);
        addBtn.addEventListener('touchend', handleAdd, { passive: false });
    }
    
    // Attach search functionality
    const searchInput = document.getElementById('productSearch');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            filterProducts(e.target.value);
        });
    }
}

async function refreshProductsTable() {
    try {
        const { data: products, error } = await supabaseClient
            .from('products')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        allProducts = products || [];
        renderProductsTable(allProducts);
    } catch (error) {
        console.error('Load products error:', error);
        showError('Failed to load products');
    }
}

function filterProducts(searchTerm) {
    if (!searchTerm || searchTerm.trim() === '') {
        renderProductsTable(allProducts);
        return;
    }
    
    const term = searchTerm.toLowerCase().trim();
    const filtered = allProducts.filter(product => {
        return (
            product.name?.toLowerCase().includes(term) ||
            product.category?.toLowerCase().includes(term) ||
            product.location?.toLowerCase().includes(term) ||
            product.sku?.toLowerCase().includes(term) ||
            product.manufacturer?.toLowerCase().includes(term)
        );
    });
    
    renderProductsTable(filtered);
}

function renderProductsTable(products) {
    const container = document.getElementById('productsTable');
    
    if (!products || products.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No Products</h3><p>Add your first product to get started.</p></div>';
        return;
    }
    
    // Check if mobile
    const isMobile = window.innerWidth <= 968;
    
    if (isMobile) {
        // Render as mobile cards
        const html = `
            <div class="products-mobile-grid">
                ${products.map(product => {
                    const imageUrl = product.primary_image_path ? 
                        getProductImageUrl(product.primary_image_path) : null;
                    return `
                    <div class="product-card" data-product-id="${product.id}">
                        <div class="product-card-image">
                            ${imageUrl ? 
                                `<img src="${imageUrl}" alt="${product.name}">` : 
                                '<div class="product-card-placeholder">📦</div>'
                            }
                        </div>
                        <div class="product-card-content">
                            <h4>${product.name}</h4>
                            <div class="product-card-meta">
                                <span class="product-card-category">${product.category}</span>
                                <span class="product-card-location">📍 ${product.location}</span>
                            </div>
                            <div class="product-card-price">KES ${formatCurrency(product.price_kes)}</div>
                            <div class="product-card-stock">
                                Stock: <strong>${product.stock_quantity}</strong>
                                ${product.stock_quantity <= (product.low_stock_threshold || 5) ? '<span style="color: var(--warning);">⚠️ Low</span>' : ''}
                            </div>
                            <div class="product-card-status">
                                <span class="status-badge ${product.is_active ? 'completed' : 'cancelled'}">${product.is_active ? 'Active' : 'Inactive'}</span>
                            </div>
                        </div>
                    </div>
                `;
                }).join('')}
            </div>
        `;
        container.innerHTML = html;
        
        // Attach click handlers to cards
        document.querySelectorAll('.product-card').forEach(card => {
            card.addEventListener('click', () => {
                const productId = card.dataset.productId;
                editProduct(productId);
            });
        });
    } else {
        // Render as desktop table
        const html = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Image</th>
                        <th>Name</th>
                        <th>Category</th>
                        <th>Price (KES)</th>
                        <th>Stock</th>
                        <th>Location</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${products.map(product => {
                        const imageUrl = product.primary_image_path ? 
                            getProductImageUrl(product.primary_image_path) : null;
                        return `
                        <tr>
                            <td>
                                ${imageUrl ? 
                                    `<img src="${imageUrl}" alt="${product.name}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 4px; border: 1px solid var(--border-color);">` : 
                                    '<div style="width: 60px; height: 60px; background: var(--surface-color); border-radius: 4px; display: flex; align-items: center; justify-content: center; border: 1px solid var(--border-color); font-size: 24px;">📦</div>'
                                }
                            </td>
                            <td><strong>${product.name}</strong></td>
                            <td>${product.category}</td>
                            <td>KES ${formatCurrency(product.price_kes)}</td>
                            <td>
                                ${product.stock_quantity}
                                ${product.stock_quantity <= (product.low_stock_threshold || 5) ? '<span style="color: var(--warning);">⚠️</span>' : ''}
                            </td>
                            <td>${product.location}</td>
                            <td><span class="status-badge ${product.is_active ? 'completed' : 'cancelled'}">${product.is_active ? 'Active' : 'Inactive'}</span></td>
                            <td>
                                <button class="action-btn action-btn-secondary" data-edit-id="${product.id}">Edit</button>
                            </td>
                        </tr>
                    `;
                    }).join('')}
                </tbody>
            </table>
        `;
        container.innerHTML = html;
        
        // Attach click handlers to edit buttons
        document.querySelectorAll('[data-edit-id]').forEach(btn => {
            btn.addEventListener('click', () => {
                const productId = btn.dataset.editId;
                editProduct(productId);
            });
        });
    }
}

function getProductImageUrl(imagePath) {
    if (!imagePath) return null;
    const { url } = supabaseClient.storage
        .from('products')
        .getPublicUrl(imagePath);
    return url;
}

// Orders Page
async function loadOrders() {
    const content = document.getElementById('contentArea');
    
    if (!['owner', 'admin'].includes(currentUserProfile.role)) {
        content.innerHTML = '<div class="empty-state"><h3>Access Denied</h3></div>';
        return;
    }
    
    content.innerHTML = `
        <div class="search-filter-bar">
            <div class="search-box">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                </svg>
                <input type="text" placeholder="Search orders..." id="orderSearch">
            </div>
            <select class="filter-select" id="orderStatusFilter">
                <option value="">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="processing">Processing</option>
                <option value="confirmed">Confirmed</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
            </select>
        </div>
        
        <div class="table-container">
            <div class="table-header">
                <h3>All Orders</h3>
            </div>
            <div id="ordersTable">
                <div style="padding: 40px; text-align: center;">
                    <div class="loading-spinner"></div>
                </div>
            </div>
        </div>
    `;
    
    await refreshOrdersTable();
}

async function refreshOrdersTable() {
    try {
        const { data: orders, error } = await supabaseClient
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        renderOrdersTable(orders);
    } catch (error) {
        console.error('Load orders error:', error);
    }
}

function renderOrdersTable(orders) {
    const container = document.getElementById('ordersTable');
    
    if (!orders || orders.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No Orders</h3></div>';
        return;
    }
    
    const html = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Order #</th>
                    <th>Customer</th>
                    <th>Contact</th>
                    <th>Total (KES)</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${orders.map(order => `
                    <tr>
                        <td><strong>${order.order_number}</strong></td>
                        <td>${order.customer_name}</td>
                        <td>${order.customer_phone}<br><small>${order.customer_email}</small></td>
                        <td>KES ${formatCurrency(order.total_kes)}</td>
                        <td><span class="status-badge ${order.status}">${order.status}</span></td>
                        <td>${formatDate(order.created_at)}</td>
                        <td>
                            <button class="action-btn action-btn-secondary" onclick="viewOrder('${order.id}')">View</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    container.innerHTML = html;
}

// Custom Requests Page
async function loadRequests() {
    const content = document.getElementById('contentArea');
    
    if (!['owner', 'admin'].includes(currentUserProfile.role)) {
        content.innerHTML = '<div class="empty-state"><h3>Access Denied</h3></div>';
        return;
    }
    
    content.innerHTML = `
        <div class="search-filter-bar">
            <div class="search-box">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                </svg>
                <input type="text" placeholder="Search requests..." id="requestSearch">
            </div>
            <select class="filter-select" id="requestStatusFilter">
                <option value="">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="reviewing">Reviewing</option>
                <option value="quoted">Quoted</option>
                <option value="approved">Approved</option>
                <option value="completed">Completed</option>
            </select>
        </div>
        
        <div class="table-container">
            <div class="table-header">
                <h3>Custom Part Requests</h3>
            </div>
            <div id="requestsTable">
                <div style="padding: 40px; text-align: center;">
                    <div class="loading-spinner"></div>
                </div>
            </div>
        </div>
    `;
    
    await refreshRequestsTable();
}

async function refreshRequestsTable() {
    try {
        const { data: requests, error } = await supabaseClient
            .from('custom_part_requests')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        renderRequestsTable(requests);
    } catch (error) {
        console.error('Load requests error:', error);
    }
}

function renderRequestsTable(requests) {
    const container = document.getElementById('requestsTable');
    
    if (!requests || requests.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No Requests</h3></div>';
        return;
    }
    
    const html = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Request #</th>
                    <th>Customer</th>
                    <th>Part</th>
                    <th>Type</th>
                    <th>3D Print</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${requests.map(req => `
                    <tr>
                        <td><strong>${req.request_number}</strong></td>
                        <td>${req.customer_name}<br><small>${req.customer_phone}</small></td>
                        <td>${req.part_name}</td>
                        <td>${req.request_type}</td>
                        <td>${req.is_3d_print ? '✓ Yes' : '- No'}</td>
                        <td><span class="status-badge ${req.status}">${req.status}</span></td>
                        <td>${formatDate(req.created_at)}</td>
                        <td>
                            <button class="action-btn action-btn-secondary" onclick="viewRequest('${req.id}')">View</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    container.innerHTML = html;
}

// Print Queue Page
async function loadPrintQueue() {
    const content = document.getElementById('contentArea');
    
    if (!['owner', 'admin', 'print_operator'].includes(currentUserProfile.role)) {
        content.innerHTML = '<div class="empty-state"><h3>Access Denied</h3></div>';
        return;
    }
    
    content.innerHTML = `
        <div class="stats-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); margin-bottom: 32px;">
            <div class="stat-card">
                <div class="stat-value" id="queuedJobs">-</div>
                <div class="stat-label">Queued Jobs</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="printingJobs">-</div>
                <div class="stat-label">Currently Printing</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="idlePrinters">-</div>
                <div class="stat-label">Idle Printers</div>
            </div>
        </div>
        
        <div id="printJobsList">
            <div style="padding: 40px; text-align: center;">
                <div class="loading-spinner"></div>
            </div>
        </div>
    `;
    
    await refreshPrintQueue();
}

async function refreshPrintQueue() {
    try {
        // Get print jobs
        const { data: printJobs, error: jobsError } = await supabaseClient
            .from('print_jobs')
            .select('*, assigned_printer:printers(*)')
            .in('status', ['pending_approval', 'approved', 'queued', 'printing'])
            .order('priority', { ascending: false })
            .order('created_at', { ascending: true });
        
        if (jobsError) throw jobsError;
        
        // Get printer stats
        const { data: printers } = await supabaseClient
            .from('printers')
            .select('status')
            .eq('is_active', true);
        
        // Update stats
        const queued = printJobs.filter(j => j.status === 'queued').length;
        const printing = printJobs.filter(j => j.status === 'printing').length;
        const idle = printers?.filter(p => p.status === 'idle').length || 0;
        
        document.getElementById('queuedJobs').textContent = queued;
        document.getElementById('printingJobs').textContent = printing;
        document.getElementById('idlePrinters').textContent = idle;
        
        renderPrintJobs(printJobs);
    } catch (error) {
        console.error('Load print queue error:', error);
    }
}

function renderPrintJobs(jobs) {
    const container = document.getElementById('printJobsList');
    
    if (!jobs || jobs.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No Active Print Jobs</h3><p>The print queue is empty.</p></div>';
        return;
    }
    
    const html = jobs.map(job => `
        <div class="print-job-card">
            <div class="print-job-header">
                <div class="print-job-info">
                    <div class="print-job-title">${job.part_name}</div>
                    <div style="color: var(--text-muted); font-size: 14px;">${job.job_number}</div>
                    <div class="print-job-meta">
                        <span>Material: <strong>${job.required_material}</strong></span>
                        <span>Quantity: <strong>${job.quantity}</strong></span>
                        ${job.estimated_print_time_minutes ? `<span>Est. Time: <strong>${Math.round(job.estimated_print_time_minutes / 60)}h ${job.estimated_print_time_minutes % 60}m</strong></span>` : ''}
                        ${job.assigned_printer ? `<span>Printer: <strong>${job.assigned_printer.name}</strong></span>` : '<span style="color: var(--warning);">No printer assigned</span>'}
                    </div>
                </div>
                <div>
                    <span class="status-badge ${job.status}">${job.status.replace('_', ' ')}</span>
                    <div style="margin-top: 8px; font-size: 13px; color: var(--text-muted);">
                        Priority: ${job.priority}
                    </div>
                </div>
            </div>
            
            <div class="print-job-actions">
                ${job.status === 'pending_approval' && ['owner', 'admin'].includes(currentUserProfile.role) ? `
                    <button class="action-btn action-btn-primary" onclick="approvePrintJob('${job.id}')">Approve</button>
                ` : ''}
                ${job.status === 'queued' && !job.bed_clear_confirmed ? `
                    <button class="action-btn action-btn-primary" onclick="confirmBedClear('${job.id}')">✓ Confirm Bed Clear & Start</button>
                ` : ''}
                ${job.status === 'printing' ? `
                    <button class="action-btn action-btn-primary" onclick="markJobComplete('${job.id}')">Mark Complete</button>
                    <button class="action-btn action-btn-danger" onclick="markJobFailed('${job.id}')">Mark Failed</button>
                ` : ''}
            </div>
        </div>
    `).join('');
    
    container.innerHTML = html;
}

// Analytics Page
async function loadAnalytics() {
    const content = document.getElementById('contentArea');
    
    content.innerHTML = `
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-value" id="totalViews">-</div>
                <div class="stat-label">Total Page Views</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="uniqueVisitors">-</div>
                <div class="stat-label">Unique Visitors</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="totalSales">-</div>
                <div class="stat-label">Total Sales (KES)</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="conversionRate">-</div>
                <div class="stat-label">Conversion Rate</div>
            </div>
        </div>
        
        <div class="table-container">
            <div class="table-header">
                <h3>Top Viewed Products</h3>
            </div>
            <div id="topProductsTable">
                <div style="padding: 40px; text-align: center;">
                    <div class="loading-spinner"></div>
                </div>
            </div>
        </div>
        
        <div class="table-container" style="margin-top: 24px;">
            <div class="table-header">
                <h3>Recent Site Events</h3>
            </div>
            <div id="recentEventsTable">
                <div style="padding: 40px; text-align: center;">
                    <div class="loading-spinner"></div>
                </div>
            </div>
        </div>
    `;
    
    await loadAnalyticsData();
}

async function loadAnalyticsData() {
    try {
        // Get total views
        const { count: viewsCount } = await supabaseClient
            .from('site_events')
            .select('*', { count: 'exact', head: true })
            .eq('event_type', 'page_view');
        
        document.getElementById('totalViews').textContent = viewsCount || 0;
        
        // Get unique visitors
        const { data: sessionsData } = await supabaseClient
            .from('site_events')
            .select('session_id')
            .eq('event_type', 'page_view');
        
        const uniqueSessions = new Set(sessionsData?.map(e => e.session_id) || []);
        document.getElementById('uniqueVisitors').textContent = uniqueSessions.size;
        
        // Get total sales
        const { data: salesData } = await supabaseClient
            .from('orders')
            .select('total_kes')
            .in('status', ['confirmed', 'completed']);
        
        const totalSales = salesData?.reduce((sum, o) => sum + parseFloat(o.total_kes || 0), 0) || 0;
        document.getElementById('totalSales').textContent = formatCurrency(totalSales);
        
        // Calculate conversion rate (orders / unique visitors)
        const { count: ordersCount } = await supabaseClient
            .from('orders')
            .select('*', { count: 'exact', head: true });
        
        const conversionRate = uniqueSessions.size > 0 ? ((ordersCount / uniqueSessions.size) * 100).toFixed(2) : 0;
        document.getElementById('conversionRate').textContent = conversionRate + '%';
        
        // Get top products
        const { data: productViews } = await supabaseClient
            .from('site_events')
            .select('product_id')
            .eq('event_type', 'product_view')
            .not('product_id', 'is', null);
        
        // Count views per product
        const viewCounts = {};
        productViews?.forEach(event => {
            viewCounts[event.product_id] = (viewCounts[event.product_id] || 0) + 1;
        });
        
        // Get product details
        const topProductIds = Object.entries(viewCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .map(([id]) => id);
        
        if (topProductIds.length > 0) {
            const { data: products } = await supabaseClient
                .from('products')
                .select('id, name, category, price_kes')
                .in('id', topProductIds);
            
            const topProducts = products?.map(p => ({
                ...p,
                views: viewCounts[p.id]
            })).sort((a, b) => b.views - a.views);
            
            renderTopProducts(topProducts);
        } else {
            document.getElementById('topProductsTable').innerHTML = '<div class="empty-state"><p>No product views yet</p></div>';
        }
        
        // Get recent events
        const { data: recentEvents } = await supabaseClient
            .from('site_events')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20);
        
        renderRecentEvents(recentEvents);
        
    } catch (error) {
        console.error('Analytics error:', error);
    }
}

function renderTopProducts(products) {
    const container = document.getElementById('topProductsTable');
    
    const html = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Rank</th>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Price (KES)</th>
                    <th>Views</th>
                </tr>
            </thead>
            <tbody>
                ${products.map((product, i) => `
                    <tr>
                        <td><strong>#${i + 1}</strong></td>
                        <td>${product.name}</td>
                        <td>${product.category}</td>
                        <td>KES ${formatCurrency(product.price_kes)}</td>
                        <td><strong>${product.views}</strong></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    container.innerHTML = html;
}

function renderRecentEvents(events) {
    const container = document.getElementById('recentEventsTable');
    
    if (!events || events.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No events yet</p></div>';
        return;
    }
    
    const html = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Event Type</th>
                    <th>Page URL</th>
                    <th>Session ID</th>
                    <th>Timestamp</th>
                </tr>
            </thead>
            <tbody>
                ${events.map(event => `
                    <tr>
                        <td><span class="status-badge">${event.event_type}</span></td>
                        <td><small>${event.page_url || '-'}</small></td>
                        <td><small>${event.session_id?.substring(0, 8) || '-'}</small></td>
                        <td>${formatDate(event.created_at)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    container.innerHTML = html;
}

// Reports Page
async function loadReports() {
    const content = document.getElementById('contentArea');
    
    content.innerHTML = `
        <div class="table-container">
            <div class="table-header">
                <h3>Daily Summary Reports</h3>
                <button class="btn btn-primary" onclick="generateDailyReport()">Generate Today's Report</button>
            </div>
            <div id="reportsTable">
                <div style="padding: 40px; text-align: center;">
                    <div class="loading-spinner"></div>
                </div>
            </div>
        </div>
    `;
    
    await refreshReports();
}

async function refreshReports() {
    try {
        const { data: reports, error } = await supabaseClient
            .from('reports')
            .select('*')
            .eq('report_type', 'daily_summary')
            .order('report_date', { ascending: false })
            .limit(30);
        
        if (error) throw error;
        
        renderReportsTable(reports);
    } catch (error) {
        console.error('Load reports error:', error);
    }
}

function renderReportsTable(reports) {
    const container = document.getElementById('reportsTable');
    
    if (!reports || reports.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No Reports</h3><p>Generate your first daily report.</p></div>';
        return;
    }
    
    const html = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Orders</th>
                    <th>Revenue (KES)</th>
                    <th>Requests</th>
                    <th>Generated</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${reports.map(report => `
                    <tr>
                        <td><strong>${formatDate(report.report_date)}</strong></td>
                        <td>${report.data.total_orders || 0}</td>
                        <td>KES ${formatCurrency(report.data.total_revenue || 0)}</td>
                        <td>${report.data.total_requests || 0}</td>
                        <td>${formatDate(report.created_at)}</td>
                        <td>
                            <button class="action-btn action-btn-secondary" onclick="viewReport('${report.id}')">View Details</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    container.innerHTML = html;
}

// User Management Page (Owner only)
async function loadUsers() {
    const content = document.getElementById('contentArea');
    
    content.innerHTML = `
        <div class="table-container">
            <div class="table-header">
                <h3>User Management</h3>
                <button class="btn btn-primary" onclick="openAddUserModal()">Add User</button>
            </div>
            <div id="usersTable">
                <div style="padding: 40px; text-align: center;">
                    <div class="loading-spinner"></div>
                </div>
            </div>
        </div>
    `;
    
    await refreshUsersTable();
}

async function refreshUsersTable() {
    try {
        const { data: users, error } = await supabaseClient
            .from('user_profiles')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        renderUsersTable(users);
    } catch (error) {
        console.error('Load users error:', error);
    }
}

function renderUsersTable(users) {
    const container = document.getElementById('usersTable');
    
    if (!users || users.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No Users</h3></div>';
        return;
    }
    
    const html = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Location</th>
                    <th>Created</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${users.map(user => `
                    <tr>
                        <td><strong>${user.full_name || 'N/A'}</strong></td>
                        <td>${user.email}</td>
                        <td><span class="status-badge">${user.role}</span></td>
                        <td>${user.location || '-'}</td>
                        <td>${formatDate(user.created_at)}</td>
                        <td>
                            ${user.id !== currentUser.id ? `<button class="action-btn action-btn-secondary" onclick="editUser('${user.id}')">Edit Role</button>` : '<em>Current User</em>'}
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    container.innerHTML = html;
}

// Helper Functions
function formatCurrency(amount) {
    return parseFloat(amount || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-KE', { year: 'numeric', month: 'short', day: 'numeric' });
}

function showError(message) {
    // Simple error display - could be improved with toast notifications
    alert('Error: ' + message);
}

function showSuccess(message) {
    // Simple success display - could be improved with toast notifications
    alert('Success: ' + message);
}

// Product Management Functions
let currentEditingProductId = null;
let selectedImageFile = null;
let selected3DModelFile = null;
let selectedIOSModelFile = null;

function openAddProductModal() {
    currentEditingProductId = null;
    selectedImageFile = null;
    selected3DModelFile = null;
    selectedIOSModelFile = null;
    
    const modalHTML = `
        <div id="productModal" class="modal-overlay" onclick="closeModalOnOutsideClick(event)">
            <div class="modal-content" style="max-width: 700px;">
                <div class="modal-header">
                    <h2>Add New Product</h2>
                    <button onclick="closeProductModal()" class="modal-close">&times;</button>
                </div>
                <form id="productForm" onsubmit="saveProduct(event)">
                    <div class="modal-body">
                        <div class="form-group">
                            <label>Product Name *</label>
                            <input type="text" id="productName" required>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label>Category *</label>
                                <input type="text" id="productCategory" placeholder="e.g., Brake Pads, Filters" required>
                            </div>
                            <div class="form-group">
                                <label>Location *</label>
                                <input type="text" id="productLocation" placeholder="e.g., Embu, Garissa" required>
                            </div>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label>Price (KES) *</label>
                                <input type="number" id="productPrice" step="0.01" min="0" required>
                            </div>
                            <div class="form-group">
                                <label>Stock Quantity *</label>
                                <input type="number" id="productStock" min="0" required>
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label>Description</label>
                            <textarea id="productDescription" rows="3" placeholder="Product description..."></textarea>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label>SKU</label>
                                <input type="text" id="productSKU" placeholder="e.g., BP-001">
                            </div>
                            <div class="form-group">
                                <label>Low Stock Threshold</label>
                                <input type="number" id="productLowStock" min="0" value="5">
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label>Product Image</label>
                            <input type="file" id="productImage" accept="image/*" onchange="handleImageSelect(event)">
                            <small style="color: var(--text-muted);">Uploaded to Supabase Storage (products bucket)</small>
                            <div id="imagePreview" style="margin-top: 8px;"></div>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label>Manufacturer</label>
                                <input type="text" id="productManufacturer" placeholder="e.g., Bosch, Denso">
                            </div>
                            <div class="form-group">
                                <label>Part Number</label>
                                <input type="text" id="productPartNumber">
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label style="display: flex; align-items: center; cursor: pointer;">
                                <input type="checkbox" id="productActive" checked style="margin-right: 8px;">
                                <span>Product is Active (visible to customers)</span>
                            </label>
                        </div>
                        
                        <div class="form-group">
                            <label style="display: flex; align-items: center; cursor: pointer;">
                                <input type="checkbox" id="productFeatured" style="margin-right: 8px;">
                                <span>Featured Product</span>
                            </label>
                        </div>
                        
                        <div class="form-group">
                            <label style="display: flex; align-items: center; cursor: pointer;">
                                <input type="checkbox" id="productHas3DModel" style="margin-right: 8px;" onchange="toggle3DModelSection()">
                                <span>Has 3D Model (enable interactive 3D viewer)</span>
                            </label>
                        </div>
                        
                        <div id="3dModelSection" style="display: none; border-left: 3px solid var(--primary-color); padding-left: 16px; margin-top: 12px;">
                            <div class="form-group">
                                <label>3D Model (.glb / .gltf) *</label>
                                <input type="file" id="product3DModelFile" accept=".glb,.gltf,model/gltf-binary,model/gltf+json,application/octet-stream" onchange="handle3DModelSelect(event)">
                                <small style="color: var(--text-muted); display: block; margin-top: 4px;">
                                    📦 Required for 3D viewer. Max 10 MB. Upload from Files app.
                                </small>
                                <div id="modelPreview" style="margin-top: 8px; color: var(--text-muted); font-size: 14px;"></div>
                                <div id="modelViewer" style="margin-top: 12px; display: none;"></div>
                                <div id="uploadProgress" style="margin-top: 8px; display: none;">
                                    <div style="background: var(--dark-bg); border-radius: 4px; height: 6px; overflow: hidden;">
                                        <div id="progressBar" style="background: var(--primary-color); height: 100%; width: 0%; transition: width 0.3s;"></div>
                                    </div>
                                    <div id="progressText" style="font-size: 12px; margin-top: 4px; color: var(--text-muted);"></div>
                                </div>
                            </div>
                            
                            <div class="form-group">
                                <label>iOS AR Model (.usdz) <em style="color: var(--text-muted); font-weight: normal;">(Optional)</em></label>
                                <input type="file" id="productIOSModelFile" accept=".usdz,model/vnd.usdz+zip" onchange="handleIOSModelSelect(event)">
                                <small style="color: var(--text-muted); display: block; margin-top: 4px;">
                                    📱 Enables "View in Your Space" AR on iPhone/iPad. Upload USDZ from Files app.
                                </small>
                                <div id="iosModelPreview" style="margin-top: 8px; color: var(--text-muted); font-size: 14px;"></div>
                            </div>
                            
                            <div style="background: rgba(0, 217, 255, 0.08); border: 2px solid rgba(0, 217, 255, 0.3); border-radius: 8px; padding: 16px; margin-top: 16px;">
                                <strong style="color: var(--primary-color); font-size: 15px;">📱 How to make a 3D model with your iPhone:</strong>
                                <ol style="margin: 12px 0 0 20px; font-size: 13px; color: var(--text-muted); line-height: 1.7;">
                                    <li><strong>Download a 3D scanning app:</strong>
                                        <ul style="margin: 4px 0 8px 20px;">
                                            <li><strong>Polycam</strong> (free, recommended) - App Store</li>
                                            <li><strong>KIRI Engine</strong> (free) - App Store</li>
                                            <li><strong>3D Scanner App</strong> (paid, high quality)</li>
                                        </ul>
                                    </li>
                                    <li><strong>Scan your auto part:</strong> Walk around the part slowly, capturing it from all angles (takes 1-2 minutes)</li>
                                    <li><strong>Process:</strong> The app will convert your photos into a 3D model</li>
                                    <li><strong>Export:</strong> Save as GLB or USDZ to your Files app</li>
                                    <li><strong>Upload here:</strong> Tap the file picker above and select your model from Files</li>
                                </ol>
                                <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(0, 217, 255, 0.2);">
                                    <strong style="color: var(--primary-color);">💡 Other options:</strong>
                                    <ul style="margin: 6px 0 0 20px; font-size: 12px; color: var(--text-muted);">
                                        <li><strong>AI generation:</strong> Meshy.ai, Luma Genie (photo → 3D)</li>
                                        <li><strong>Desktop software:</strong> Blender (free), TinkerCAD</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="modal-footer">
                        <button type="button" onclick="closeProductModal()" class="btn btn-outline">Cancel</button>
                        <button type="submit" class="btn btn-primary" id="saveProductBtn">
                            <span id="saveProductBtnText">Save Product</span>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

async function editProduct(id) {
    try {
        const { data: product, error } = await supabaseClient
            .from('products')
            .select('*')
            .eq('id', id)
            .single();
        
        if (error) throw error;
        
        currentEditingProductId = id;
        selectedImageFile = null;
        selected3DModelFile = null;
        selectedIOSModelFile = null;
        
        const modalHTML = `
            <div id="productModal" class="modal-overlay" onclick="closeModalOnOutsideClick(event)">
                <div class="modal-content" style="max-width: 700px;">
                    <div class="modal-header">
                        <h2>Edit Product</h2>
                        <button onclick="closeProductModal()" class="modal-close">&times;</button>
                    </div>
                    <form id="productForm" onsubmit="saveProduct(event)">
                        <div class="modal-body">
                            <div class="form-group">
                                <label>Product Name *</label>
                                <input type="text" id="productName" value="${escapeHtml(product.name)}" required>
                            </div>
                            
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Category *</label>
                                    <input type="text" id="productCategory" value="${escapeHtml(product.category)}" required>
                                </div>
                                <div class="form-group">
                                    <label>Location *</label>
                                    <input type="text" id="productLocation" value="${escapeHtml(product.location)}" required>
                                </div>
                            </div>
                            
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Price (KES) *</label>
                                    <input type="number" id="productPrice" step="0.01" min="0" value="${product.price_kes}" required>
                                </div>
                                <div class="form-group">
                                    <label>Stock Quantity *</label>
                                    <input type="number" id="productStock" min="0" value="${product.stock_quantity}" required>
                                </div>
                            </div>
                            
                            <div class="form-group">
                                <label>Description</label>
                                <textarea id="productDescription" rows="3">${escapeHtml(product.description || '')}</textarea>
                            </div>
                            
                            <div class="form-row">
                                <div class="form-group">
                                    <label>SKU</label>
                                    <input type="text" id="productSKU" value="${escapeHtml(product.sku || '')}">
                                </div>
                                <div class="form-group">
                                    <label>Low Stock Threshold</label>
                                    <input type="number" id="productLowStock" min="0" value="${product.low_stock_threshold || 5}">
                                </div>
                            </div>
                            
                            <div class="form-group">
                                <label>Product Image</label>
                                ${product.primary_image_path ? `
                                    <div style="margin-bottom: 8px;">
                                        <div style="color: var(--text-muted); font-size: 14px; margin-bottom: 4px;">Current image:</div>
                                        <img src="${getProductImageUrl(product.primary_image_path)}" 
                                             alt="Current product image" 
                                             style="max-width: 200px; max-height: 200px; border-radius: 4px; border: 1px solid var(--border-color);">
                                    </div>
                                ` : ''}
                                <input type="file" id="productImage" accept="image/*" onchange="handleImageSelect(event)">
                                <small style="color: var(--text-muted);">Upload new image to replace current (or leave empty to keep existing)</small>
                                <div id="imagePreview" style="margin-top: 8px;"></div>
                            </div>
                            
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Manufacturer</label>
                                    <input type="text" id="productManufacturer" value="${escapeHtml(product.manufacturer || '')}">
                                </div>
                                <div class="form-group">
                                    <label>Part Number</label>
                                    <input type="text" id="productPartNumber" value="${escapeHtml(product.part_number || '')}">
                                </div>
                            </div>
                            
                            <div class="form-group">
                                <label style="display: flex; align-items: center; cursor: pointer;">
                                    <input type="checkbox" id="productActive" ${product.is_active ? 'checked' : ''} style="margin-right: 8px;">
                                    <span>Product is Active (visible to customers)</span>
                                </label>
                            </div>
                            
                            <div class="form-group">
                                <label style="display: flex; align-items: center; cursor: pointer;">
                                    <input type="checkbox" id="productFeatured" ${product.featured ? 'checked' : ''} style="margin-right: 8px;">
                                    <span>Featured Product</span>
                                </label>
                            </div>
                            
                            <div class="form-group">
                                <label style="display: flex; align-items: center; cursor: pointer;">
                                    <input type="checkbox" id="productHas3DModel" ${product.has_3d_model ? 'checked' : ''} style="margin-right: 8px;" onchange="toggle3DModelSection()">
                                    <span>Has 3D Model (enable interactive 3D viewer)</span>
                                </label>
                            </div>
                            
                            <div id="3dModelSection" style="display: ${product.has_3d_model ? 'block' : 'none'}; border-left: 3px solid var(--primary-color); padding-left: 16px; margin-top: 12px;">
                                ${product.model_path ? `
                                    <div style="margin-bottom: 12px; padding: 8px; background: var(--surface-color); border-radius: 4px;">
                                        <div style="color: var(--text-muted); font-size: 14px; margin-bottom: 4px;">Current 3D model:</div>
                                        <div style="font-family: monospace; font-size: 13px; color: var(--text-color);">📦 ${escapeHtml(product.model_path)}</div>
                                    </div>
                                ` : ''}
                                
                                <div class="form-group">
                                    <label>3D Model (.glb / .gltf)</label>
                                    <input type="file" id="product3DModelFile" accept=".glb,.gltf" onchange="handle3DModelSelect(event)">
                                    <small style="color: var(--text-muted); display: block; margin-top: 4px;">
                                        Upload new model to replace current (or leave empty to keep existing). Max 10 MB.
                                    </small>
                                    <div id="modelPreview" style="margin-top: 8px; color: var(--text-muted); font-size: 14px;"></div>
                                </div>
                                
                                ${product.model_ios_path ? `
                                    <div style="margin-bottom: 12px; padding: 8px; background: var(--surface-color); border-radius: 4px;">
                                        <div style="color: var(--text-muted); font-size: 14px; margin-bottom: 4px;">Current iOS AR model:</div>
                                        <div style="font-family: monospace; font-size: 13px; color: var(--text-color);">📱 ${escapeHtml(product.model_ios_path)}</div>
                                    </div>
                                ` : ''}
                                
                                <div class="form-group">
                                    <label>iOS AR Model (.usdz) <em style="color: var(--text-muted); font-weight: normal;">(Optional)</em></label>
                                    <input type="file" id="productIOSModelFile" accept=".usdz" onchange="handleIOSModelSelect(event)">
                                    <small style="color: var(--text-muted); display: block; margin-top: 4px;">
                                        📱 Enables "View in Your Space" AR on iPhone/iPad.
                                    </small>
                                    <div id="iosModelPreview" style="margin-top: 8px; color: var(--text-muted); font-size: 14px;"></div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="modal-footer">
                            <button type="button" onclick="confirmDeleteProduct('${id}')" class="btn btn-danger">Delete Product</button>
                            <div style="flex: 1;"></div>
                            <button type="button" onclick="closeProductModal()" class="btn btn-outline">Cancel</button>
                            <button type="submit" class="btn btn-primary" id="saveProductBtn">
                                <span id="saveProductBtnText">Update Product</span>
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
    } catch (error) {
        console.error('Edit product error:', error);
        showError('Failed to load product: ' + error.message);
    }
}

function handleImageSelect(event) {
    const file = event.target.files[0];
    if (!file) {
        selectedImageFile = null;
        document.getElementById('imagePreview').innerHTML = '';
        return;
    }
    
    if (!file.type.startsWith('image/')) {
        showError('Please select an image file');
        event.target.value = '';
        return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
        showError('Image size must be less than 5MB');
        event.target.value = '';
        return;
    }
    
    selectedImageFile = file;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('imagePreview').innerHTML = `
            <img src="${e.target.result}" style="max-width: 200px; max-height: 200px; border-radius: 4px; border: 1px solid var(--border-color);">
        `;
    };
    reader.readAsDataURL(file);
}

function handle3DModelSelect(event) {
    const file = event.target.files[0];
    const previewEl = document.getElementById('modelPreview');
    const viewerEl = document.getElementById('modelViewer');
    
    if (!file) {
        selected3DModelFile = null;
        previewEl.innerHTML = '';
        if (viewerEl) viewerEl.style.display = 'none';
        return;
    }
    
    // Validate file extension (works even if accept attribute is permissive for iOS)
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['glb', 'gltf'].includes(ext)) {
        showError('Please select a GLB or GLTF file (.glb or .gltf extension required)');
        event.target.value = '';
        previewEl.innerHTML = '';
        if (viewerEl) viewerEl.style.display = 'none';
        return;
    }
    
    if (file.size > 10 * 1024 * 1024) {
        showError('3D model size must be less than 10MB. Consider optimizing the model or using a compression tool like gltf-pipeline.');
        event.target.value = '';
        previewEl.innerHTML = '';
        if (viewerEl) viewerEl.style.display = 'none';
        return;
    }
    
    selected3DModelFile = file;
    
    const sizeMB = (file.size / 1024 / 1024).toFixed(2);
    const sizeWarning = file.size > 5 * 1024 * 1024 ? 
        ' ⚠️ <span style="color: var(--warning);">Large file - may be slow to load</span>' : 
        ' ✓ <span style="color: var(--success);">Good size</span>';
    
    previewEl.innerHTML = `
        <div style="padding: 8px; background: var(--surface-color); border-radius: 4px;">
            📦 <strong>${file.name}</strong> (${sizeMB} MB)${sizeWarning}
        </div>
    `;
    
    // Show 3D preview
    if (viewerEl) {
        const objectURL = URL.createObjectURL(file);
        viewerEl.innerHTML = `
            <div style="margin-top: 8px; padding: 8px; background: rgba(0, 217, 255, 0.05); border: 1px solid rgba(0, 217, 255, 0.2); border-radius: 8px;">
                <div style="font-size: 12px; color: var(--primary-color); margin-bottom: 8px; font-weight: 600;">3D Preview:</div>
                <model-viewer 
                    src="${objectURL}"
                    alt="3D Model Preview"
                    auto-rotate
                    camera-controls
                    style="width: 100%; height: 300px; background-color: #1a1a1a; border-radius: 6px;"
                    loading="eager"
                    reveal="auto">
                </model-viewer>
            </div>
        `;
        viewerEl.style.display = 'block';
    }
}

function handleIOSModelSelect(event) {
    const file = event.target.files[0];
    const previewEl = document.getElementById('iosModelPreview');
    
    if (!file) {
        selectedIOSModelFile = null;
        previewEl.innerHTML = '';
        return;
    }
    
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'usdz') {
        showError('Please select a USDZ file for iOS AR');
        event.target.value = '';
        previewEl.innerHTML = '';
        return;
    }
    
    if (file.size > 10 * 1024 * 1024) {
        showError('iOS model size must be less than 10MB');
        event.target.value = '';
        previewEl.innerHTML = '';
        return;
    }
    
    selectedIOSModelFile = file;
    
    const sizeMB = (file.size / 1024 / 1024).toFixed(2);
    previewEl.innerHTML = `
        <div style="padding: 8px; background: var(--surface-color); border-radius: 4px;">
            📱 <strong>${file.name}</strong> (${sizeMB} MB) ✓ <span style="color: var(--success);">Ready for iOS AR</span>
        </div>
    `;
}

async function saveProduct(event) {
    event.preventDefault();
    
    const saveBtn = document.getElementById('saveProductBtn');
    const saveBtnText = document.getElementById('saveProductBtnText');
    const originalText = saveBtnText.textContent;
    
    saveBtn.disabled = true;
    saveBtnText.textContent = 'Saving...';
    
    try {
        const has3DModel = document.getElementById('productHas3DModel').checked;
        
        // Validate 3D model if enabled
        if (has3DModel && !currentEditingProductId && !selected3DModelFile) {
            showError('Please upload a 3D model file (.glb or .gltf) when enabling 3D model support');
            saveBtn.disabled = false;
            saveBtnText.textContent = originalText;
            return;
        }
        
        const productData = {
            name: document.getElementById('productName').value.trim(),
            category: document.getElementById('productCategory').value.trim(),
            location: document.getElementById('productLocation').value.trim(),
            price_kes: parseFloat(document.getElementById('productPrice').value),
            stock_quantity: parseInt(document.getElementById('productStock').value),
            description: document.getElementById('productDescription').value.trim() || null,
            sku: document.getElementById('productSKU').value.trim() || null,
            low_stock_threshold: parseInt(document.getElementById('productLowStock').value) || 5,
            manufacturer: document.getElementById('productManufacturer').value.trim() || null,
            part_number: document.getElementById('productPartNumber').value.trim() || null,
            is_active: document.getElementById('productActive').checked,
            featured: document.getElementById('productFeatured').checked,
            has_3d_model: has3DModel,
            created_by: currentUser.id
        };
        
        let productId = currentEditingProductId;
        
        if (currentEditingProductId) {
            saveBtnText.textContent = 'Updating...';
            const { error } = await supabaseClient
                .from('products')
                .update(productData)
                .eq('id', currentEditingProductId);
            
            if (error) throw error;
        } else {
            saveBtnText.textContent = 'Creating product...';
            const { data: newProduct, error } = await supabaseClient
                .from('products')
                .insert(productData)
                .select()
                .single();
            
            if (error) throw error;
            productId = newProduct.id;
        }
        
        if (selectedImageFile && productId) {
            saveBtnText.textContent = 'Uploading image...';
            
            const fileExt = selectedImageFile.name.split('.').pop();
            const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
            const filePath = `${productId}/${fileName}`;
            
            const { error: uploadError } = await supabaseClient.storage
                .from('products')
                .upload(filePath, selectedImageFile, {
                    cacheControl: '3600',
                    upsert: false
                });
            
            if (uploadError) throw uploadError;
            
            const { error: updateError } = await supabaseClient
                .from('products')
                .update({ primary_image_path: filePath })
                .eq('id', productId);
            
            if (updateError) throw updateError;
        }
        
        // Upload 3D model if provided
        if (selected3DModelFile && productId) {
            saveBtnText.textContent = 'Uploading 3D model...';
            
            const fileExt = selected3DModelFile.name.split('.').pop();
            const fileName = `model-${Date.now()}.${fileExt}`;
            const filePath = `${productId}/${fileName}`;
            
            const { error: uploadError } = await supabaseClient.storage
                .from('products-3d')
                .upload(filePath, selected3DModelFile, {
                    cacheControl: '3600',
                    upsert: false
                });
            
            if (uploadError) {
                // If bucket doesn't exist, provide helpful error
                if (uploadError.message?.includes('not found') || uploadError.message?.includes('bucket')) {
                    throw new Error('Storage bucket "products-3d" not found. Please create it in Supabase Dashboard (see 3D_MODEL_SETUP.md)');
                }
                throw uploadError;
            }
            
            const { error: updateError } = await supabaseClient
                .from('products')
                .update({ model_path: filePath })
                .eq('id', productId);
            
            if (updateError) throw updateError;
        }
        
        // Upload iOS model if provided
        if (selectedIOSModelFile && productId) {
            saveBtnText.textContent = 'Uploading iOS AR model...';
            
            const fileName = `model-ios-${Date.now()}.usdz`;
            const filePath = `${productId}/${fileName}`;
            
            const { error: uploadError } = await supabaseClient.storage
                .from('products-3d')
                .upload(filePath, selectedIOSModelFile, {
                    cacheControl: '3600',
                    upsert: false
                });
            
            if (uploadError) {
                if (uploadError.message?.includes('not found') || uploadError.message?.includes('bucket')) {
                    throw new Error('Storage bucket "products-3d" not found. Please create it in Supabase Dashboard (see 3D_MODEL_SETUP.md)');
                }
                throw uploadError;
            }
            
            const { error: updateError } = await supabaseClient
                .from('products')
                .update({ model_ios_path: filePath })
                .eq('id', productId);
            
            if (updateError) throw updateError;
        }
        
        showSuccess(currentEditingProductId ? 'Product updated successfully' : 'Product created successfully');
        closeProductModal();
        await refreshProductsTable();
        
    } catch (error) {
        console.error('Save product error:', error);
        showError('Failed to save product: ' + error.message);
        saveBtn.disabled = false;
        saveBtnText.textContent = originalText;
    }
}

async function confirmDeleteProduct(id) {
    if (!confirm('Are you sure you want to delete this product? This action cannot be undone.')) {
        return;
    }
    
    try {
        const { data: product } = await supabaseClient
            .from('products')
            .select('primary_image_path')
            .eq('id', id)
            .single();
        
        if (product?.primary_image_path) {
            await supabaseClient.storage
                .from('products')
                .remove([product.primary_image_path]);
        }
        
        const { error } = await supabaseClient
            .from('products')
            .delete()
            .eq('id', id);
        
        if (error) throw error;
        
        showSuccess('Product deleted successfully');
        closeProductModal();
        await refreshProductsTable();
        
    } catch (error) {
        console.error('Delete product error:', error);
        showError('Failed to delete product: ' + error.message);
    }
}

function closeProductModal() {
    const modal = document.getElementById('productModal');
    if (modal) {
        modal.remove();
    }
    currentEditingProductId = null;
    selectedImageFile = null;
    selected3DModelFile = null;
    selectedIOSModelFile = null;
}

// Toggle 3D model section visibility
function toggle3DModelSection() {
    const checkbox = document.getElementById('productHas3DModel');
    const section = document.getElementById('3dModelSection');
    if (checkbox && section) {
        section.style.display = checkbox.checked ? 'block' : 'none';
    }
}

function closeModalOnOutsideClick(event) {
    if (event.target.classList.contains('modal-overlay')) {
        closeProductModal();
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function viewOrder(id) {
    showError('Order details view coming soon.');
}

function viewRequest(id) {
    showError('Request details view coming soon.');
}

async function approvePrintJob(id) {
    if (!confirm('Approve this print job?')) return;
    
    try {
        const { error } = await supabaseClient
            .from('print_jobs')
            .update({ 
                status: 'approved',
                approved_by: currentUser.id,
                approved_at: new Date().toISOString()
            })
            .eq('id', id);
        
        if (error) throw error;
        
        showSuccess('Print job approved');
        await refreshPrintQueue();
    } catch (error) {
        showError('Failed to approve job: ' + error.message);
    }
}

async function confirmBedClear(id) {
    if (!confirm('Confirm that the print bed is clear and ready?')) return;
    
    try {
        const { error } = await supabaseClient
            .from('print_jobs')
            .update({
                bed_clear_confirmed: true,
                bed_clear_confirmed_by: currentUser.id,
                bed_clear_confirmed_at: new Date().toISOString(),
                status: 'printing',
                started_at: new Date().toISOString()
            })
            .eq('id', id);
        
        if (error) throw error;
        
        showSuccess('Print job started');
        await refreshPrintQueue();
    } catch (error) {
        showError('Failed to start job: ' + error.message);
    }
}

async function markJobComplete(id) {
    if (!confirm('Mark this print job as complete?')) return;
    
    try {
        const { error } = await supabaseClient
            .from('print_jobs')
            .update({
                status: 'done',
                completed_at: new Date().toISOString()
            })
            .eq('id', id);
        
        if (error) throw error;
        
        showSuccess('Print job marked as complete');
        await refreshPrintQueue();
    } catch (error) {
        showError('Failed to complete job: ' + error.message);
    }
}

async function markJobFailed(id) {
    const reason = prompt('Enter failure reason:');
    if (!reason) return;
    
    try {
        const { error } = await supabaseClient
            .from('print_jobs')
            .update({
                status: 'failed',
                failed_at: new Date().toISOString(),
                failure_reason: reason
            })
            .eq('id', id);
        
        if (error) throw error;
        
        showSuccess('Print job marked as failed');
        await refreshPrintQueue();
    } catch (error) {
        showError('Failed to mark job as failed: ' + error.message);
    }
}

async function generateDailyReport() {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        // Get today's data
        const { data: orders } = await supabaseClient
            .from('orders')
            .select('*')
            .gte('created_at', today);
        
        const { data: requests } = await supabaseClient
            .from('custom_part_requests')
            .select('*')
            .gte('created_at', today);
        
        const totalRevenue = orders?.reduce((sum, o) => sum + parseFloat(o.total_kes || 0), 0) || 0;
        
        const reportData = {
            total_orders: orders?.length || 0,
            total_revenue: totalRevenue,
            total_requests: requests?.length || 0,
            orders_by_status: {},
            requests_by_type: {}
        };
        
        // Save report
        const { error } = await supabaseClient
            .from('reports')
            .insert({
                report_type: 'daily_summary',
                report_date: today,
                data: reportData,
                generated_by: currentUser.id
            });
        
        if (error) throw error;
        
        showSuccess('Daily report generated');
        await refreshReports();
    } catch (error) {
        showError('Failed to generate report: ' + error.message);
    }
}

function viewReport(id) {
    showError('Report details view coming soon.');
}

function openAddUserModal() {
    showError('User creation must be done through Supabase Auth. Use the Dashboard to invite users, then assign roles here.');
}

function editUser(id) {
    showError('User role editing coming soon. Use Supabase Dashboard for now.');
}

// Make functions globally available
window.loadPage = loadPage;
window.openAddProductModal = openAddProductModal;
window.editProduct = editProduct;
window.viewOrder = viewOrder;
window.viewRequest = viewRequest;
window.approvePrintJob = approvePrintJob;
window.confirmBedClear = confirmBedClear;
window.markJobComplete = markJobComplete;
window.markJobFailed = markJobFailed;
window.generateDailyReport = generateDailyReport;
window.viewReport = viewReport;
window.openAddUserModal = openAddUserModal;
window.editUser = editUser;
window.handleImageSelect = handleImageSelect;
window.handle3DModelSelect = handle3DModelSelect;
window.handleIOSModelSelect = handleIOSModelSelect;
window.saveProduct = saveProduct;
window.closeProductModal = closeProductModal;
window.closeModalOnOutsideClick = closeModalOnOutsideClick;
window.confirmDeleteProduct = confirmDeleteProduct;
window.toggle3DModelSection = toggle3DModelSection;
