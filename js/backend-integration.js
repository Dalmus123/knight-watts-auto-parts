/**
 * Backend Integration for Public Site
 * Provides graceful fallback if Supabase is not configured
 */

let backendEnabled = false;
let backendClient = null;
let sessionId = null;

// Initialize backend connection
async function initBackend() {
    try {
        // Check if config exists and is set up
        if (typeof isConfigured === 'function' && isConfigured()) {
            backendClient = initSupabase();
            backendEnabled = true;
            
            // Generate or retrieve session ID
            sessionId = getOrCreateSessionId();
            
            console.log('[Backend Integration] Backend enabled, Supabase client initialized');
            
            // Track page view (async, don't wait)
            trackPageView();
            
            return true;
        } else {
            console.warn('[Backend Integration] Backend not configured - running in offline mode');
            backendEnabled = false;
            return false;
        }
    } catch (error) {
        console.error('[Backend Integration] Initialization error:', error);
        backendEnabled = false;
        return false;
    }
}

// Session Management
function getOrCreateSessionId() {
    let sid = sessionStorage.getItem('knight_watts_session_id');
    
    if (!sid) {
        sid = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);
        sessionStorage.setItem('knight_watts_session_id', sid);
    }
    
    return sid;
}

// Analytics Tracking
async function trackPageView() {
    if (!backendEnabled || !backendClient) return;
    
    try {
        await backendClient
            .from('site_events')
            .insert({
                event_type: 'page_view',
                session_id: sessionId,
                page_url: window.location.pathname,
                referrer: document.referrer,
                user_agent: navigator.userAgent,
                event_data: {
                    title: document.title,
                    viewport_width: window.innerWidth,
                    viewport_height: window.innerHeight
                }
            });
    } catch (error) {
        console.error('Track page view error:', error);
    }
}

async function trackProductView(productId, productName) {
    if (!backendEnabled || !backendClient) return;
    
    try {
        await backendClient
            .from('site_events')
            .insert({
                event_type: 'product_view',
                session_id: sessionId,
                product_id: productId,
                page_url: window.location.pathname,
                event_data: {
                    product_name: productName
                }
            });
    } catch (error) {
        console.error('Track product view error:', error);
    }
}

async function trackAddToCart(productId, productName, quantity) {
    if (!backendEnabled || !backendClient) return;
    
    try {
        await backendClient
            .from('site_events')
            .insert({
                event_type: 'add_to_cart',
                session_id: sessionId,
                product_id: productId,
                event_data: {
                    product_name: productName,
                    quantity: quantity
                }
            });
    } catch (error) {
        console.error('Track add to cart error:', error);
    }
}

async function trackCheckoutStart() {
    if (!backendEnabled || !backendClient) return;
    
    try {
        await backendClient
            .from('site_events')
            .insert({
                event_type: 'checkout_start',
                session_id: sessionId,
                page_url: window.location.pathname,
                event_data: {
                    cart_items: localStorage.getItem('cart') ? JSON.parse(localStorage.getItem('cart')).length : 0
                }
            });
    } catch (error) {
        console.error('Track checkout start error:', error);
    }
}

// Custom Part Request Submission
function normalizePaymentMethod(method) {
    const normalized = String(method || 'cash').toLowerCase().replace(/[^a-z]/g, '');
    if (normalized === 'mpesa' || normalized === 'cash' || normalized === 'bank') {
        return normalized;
    }
    return 'cash';
}

async function submitCustomPartRequest(requestData) {
    if (!backendEnabled || !backendClient) {
        // Fallback: show message to user
        console.log('Backend not available. Request data:', requestData);
        alert('Backend not configured. Please contact us directly at the phone numbers on our site.');
        return { success: false, offline: true };
    }
    
    try {
        // Direct anon inserts are denied — use SECURITY DEFINER RPC (POST, never { get: true })
        const { data, error } = await backendClient.rpc('create_custom_part_request', {
            p_customer_name: requestData.name,
            p_customer_email: requestData.email,
            p_customer_phone: requestData.phone,
            p_part_name: requestData.partName,
            p_description: requestData.description,
            p_customer_location: requestData.location || null,
            p_vehicle_make: requestData.vehicleMake || null,
            p_vehicle_model: requestData.vehicleModel || null,
            p_vehicle_year: requestData.vehicleYear ? parseInt(requestData.vehicleYear, 10) : null,
            p_is_3d_print: Boolean(requestData.is3DPrint),
            p_print_material: requestData.printMaterial || null,
            p_preferred_color: requestData.preferredColor || null,
            p_quantity: requestData.quantity || 1,
            p_dimensions: requestData.dimensions || null
        });
        
        if (error) throw error;
        
        const row = Array.isArray(data) ? data[0] : data;
        if (!row) throw new Error('No request was created');
        
        // Track the request submission
        await backendClient
            .from('site_events')
            .insert({
                event_type: 'custom_request_submitted',
                session_id: sessionId,
                event_data: {
                    request_number: row.request_number,
                    request_type: requestData.is3DPrint ? '3d_print' : 'custom_part'
                }
            });
        
        return { success: true, data: row };
    } catch (error) {
        console.error('Submit request error:', error);
        return { success: false, error: error.message };
    }
}

// Order Submission
async function submitOrder(orderData) {
    if (!backendEnabled || !backendClient) {
        console.log('Backend not available. Order data:', orderData);
        alert('Backend not configured. Please contact us directly to place your order.');
        return { success: false, offline: true };
    }
    
    try {
        const referralCode = orderData.referralCode
            || (typeof window !== 'undefined' && window.kwReferral && window.kwReferral.getCode())
            || null;

        // Direct anon inserts are denied — use SECURITY DEFINER RPC (POST, never { get: true })
        const { data, error } = await backendClient.rpc('create_order', {
            p_customer_name: orderData.name,
            p_customer_email: orderData.email,
            p_customer_phone: orderData.phone,
            p_customer_location: orderData.location,
            p_items: orderData.items,
            p_shipping_address: orderData.shippingAddress || null,
            p_delivery_notes: orderData.notes || null,
            p_payment_method: normalizePaymentMethod(orderData.paymentMethod),
            p_referral_code: referralCode || null
        });
        
        if (error) throw error;
        
        const row = Array.isArray(data) ? data[0] : data;
        if (!row) throw new Error('No order was created');
        
        // Track the order
        await backendClient
            .from('site_events')
            .insert({
                event_type: 'order_placed',
                session_id: sessionId,
                event_data: {
                    order_number: row.order_number,
                    total_kes: row.total_kes
                }
            });
        
        return { success: true, data: row };
    } catch (error) {
        console.error('Submit order error:', error);
        return { success: false, error: error.message };
    }
}

// File Upload Helper (for custom requests with photos)
async function uploadRequestAttachment(file, requestId) {
    if (!backendEnabled || !backendClient) {
        return { success: false, offline: true };
    }
    
    try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `custom_requests/${requestId}/${fileName}`;
        
        const { data, error } = await backendClient.storage
            .from('custom_requests')
            .upload(filePath, file);
        
        if (error) throw error;
        
        return { success: true, path: filePath };
    } catch (error) {
        console.error('Upload error:', error);
        return { success: false, error: error.message };
    }
}

// Get Products (optional - for dynamic product loading)
async function getProducts(filters = {}) {
    if (!backendEnabled || !backendClient) {
        console.warn('[Backend Integration] getProducts() called but backend not enabled');
        return { success: false, offline: true, products: [] };
    }
    
    try {
        console.log('[Backend Integration] Fetching products from Supabase...', filters);
        
        let query = backendClient
            .from('products')
            .select('*')
            .eq('is_active', true);
        
        if (filters.product_kind) {
            query = query.eq('product_kind', filters.product_kind);
        } else if (filters.exclude_product_kind) {
            query = query.neq('product_kind', filters.exclude_product_kind);
        }
        
        if (filters.category) {
            query = query.eq('category', filters.category);
        }
        
        if (filters.location) {
            query = query.eq('location', filters.location);
        }
        
        if (filters.filament_material) {
            query = query.eq('filament_material', filters.filament_material);
        }
        
        const { data, error } = await query.order('featured', { ascending: false });
        
        if (error) throw error;
        
        console.log(`[Backend Integration] Fetched ${data?.length || 0} products from database`);
        
        return { success: true, products: data };
    } catch (error) {
        console.error('[Backend Integration] Get products error:', error);
        return { success: false, error: error.message, products: [] };
    }
}

// Initialize immediately and expose promise for other scripts to wait on
let backendInitPromise = null;

if (document.readyState === 'loading') {
    backendInitPromise = new Promise((resolve) => {
        document.addEventListener('DOMContentLoaded', async () => {
            await initBackend();
            resolve();
        });
    });
} else {
    backendInitPromise = initBackend();
}

// Export functions for use in other scripts
window.backendIntegration = {
    trackPageView,
    trackProductView,
    trackAddToCart,
    trackCheckoutStart,
    submitCustomPartRequest,
    submitOrder,
    uploadRequestAttachment,
    getProducts,
    isEnabled: () => backendEnabled,
    waitForInit: () => backendInitPromise
};
