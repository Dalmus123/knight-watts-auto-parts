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
async function submitCustomPartRequest(requestData) {
    if (!backendEnabled || !backendClient) {
        // Fallback: show message to user
        console.log('Backend not available. Request data:', requestData);
        alert('Backend not configured. Please contact us directly at the phone numbers on our site.');
        return { success: false, offline: true };
    }
    
    try {
        const { data, error } = await backendClient
            .from('custom_part_requests')
            .insert({
                customer_name: requestData.name,
                customer_email: requestData.email,
                customer_phone: requestData.phone,
                customer_location: requestData.location || 'Not specified',
                part_name: requestData.partName,
                description: requestData.description,
                vehicle_make: requestData.vehicleMake || null,
                vehicle_model: requestData.vehicleModel || null,
                vehicle_year: requestData.vehicleYear ? parseInt(requestData.vehicleYear) : null,
                is_3d_print: requestData.is3DPrint || false,
                print_material: requestData.printMaterial || null,
                preferred_color: requestData.preferredColor || null,
                quantity: requestData.quantity || 1,
                dimensions: requestData.dimensions || null,
                request_type: requestData.is3DPrint ? '3d_print' : 'custom_part',
                status: 'pending'
            })
            .select()
            .single();
        
        if (error) throw error;
        
        // Track the request submission
        await backendClient
            .from('site_events')
            .insert({
                event_type: 'custom_request_submitted',
                session_id: sessionId,
                event_data: {
                    request_number: data.request_number,
                    request_type: data.request_type
                }
            });
        
        return { success: true, data };
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
        const { data, error } = await backendClient
            .from('orders')
            .insert({
                customer_name: orderData.name,
                customer_email: orderData.email,
                customer_phone: orderData.phone,
                customer_location: orderData.location,
                items: orderData.items,
                subtotal_kes: orderData.subtotal,
                shipping_kes: orderData.shipping || 0,
                total_kes: orderData.total,
                shipping_address: orderData.shippingAddress,
                delivery_notes: orderData.notes || null,
                payment_method: orderData.paymentMethod || 'M-Pesa',
                status: 'pending'
            })
            .select()
            .single();
        
        if (error) throw error;
        
        // Track the order
        await backendClient
            .from('site_events')
            .insert({
                event_type: 'order_placed',
                session_id: sessionId,
                event_data: {
                    order_number: data.order_number,
                    total_kes: data.total_kes
                }
            });
        
        return { success: true, data };
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
        
        if (filters.category) {
            query = query.eq('category', filters.category);
        }
        
        if (filters.location) {
            query = query.eq('location', filters.location);
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
