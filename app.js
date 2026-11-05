// Verify Three.js is loaded
if (typeof THREE === 'undefined') {
    console.error('Three.js library failed to load! Products will not display correctly.');
}

// Global State
let currentLocation = localStorage.getItem('selectedLocation') || null;
let cart = JSON.parse(localStorage.getItem('cart')) || [];
let scene, camera, renderer, currentMesh;
let selectedProduct = null;
let supabaseClient = null;

// Product Database - Sample car spare parts (fallback)
const products = [
    {
        id: 1,
        name: 'Brake Pads Set',
        category: 'brakes',
        make: 'toyota',
        price: 3500,
        description: 'High-quality ceramic brake pads for Toyota vehicles. Long-lasting and quiet operation.',
        locations: {
            embu: { stock: 15, available: true },
            garissa: { stock: 8, available: true }
        },
        specs: {
            'Brand': 'Premium Auto',
            'Material': 'Ceramic',
            'Compatibility': 'Toyota Corolla, Fielder, Axio',
            'Warranty': '12 months'
        }
    },
    {
        id: 2,
        name: 'Engine Oil Filter',
        category: 'filters',
        make: 'nissan',
        price: 800,
        description: 'OEM quality oil filter for Nissan vehicles. Ensures clean engine oil circulation.',
        locations: {
            embu: { stock: 25, available: true },
            garissa: { stock: 12, available: true }
        },
        specs: {
            'Brand': 'FilterPro',
            'Type': 'Spin-on',
            'Compatibility': 'Nissan X-Trail, Note, Tiida',
            'Warranty': '6 months'
        }
    },
    {
        id: 3,
        name: 'Alternator',
        category: 'electrical',
        make: 'toyota',
        price: 12500,
        description: 'Rebuilt alternator with 90A output. Perfect replacement for worn units.',
        locations: {
            embu: { stock: 5, available: true },
            garissa: { stock: 2, available: true }
        },
        specs: {
            'Brand': 'PowerGen',
            'Output': '90 Amperes',
            'Compatibility': 'Toyota Vitz, Passo, Ractis',
            'Warranty': '18 months',
            'Condition': 'Remanufactured'
        }
    },
    {
        id: 4,
        name: 'Shock Absorber (Pair)',
        category: 'brakes',
        make: 'mitsubishi',
        price: 8900,
        description: 'Heavy-duty shock absorbers for smooth ride and better handling.',
        locations: {
            embu: { stock: 8, available: true },
            garissa: { stock: 6, available: true }
        },
        specs: {
            'Brand': 'RideComfort',
            'Type': 'Gas-filled',
            'Compatibility': 'Mitsubishi Lancer, Outlander',
            'Warranty': '24 months'
        }
    },
    {
        id: 5,
        name: 'Air Filter',
        category: 'filters',
        make: 'mazda',
        price: 1200,
        description: 'High-flow air filter for better engine performance and fuel efficiency.',
        locations: {
            embu: { stock: 20, available: true },
            garissa: { stock: 15, available: true }
        },
        specs: {
            'Brand': 'AirFlow',
            'Type': 'Panel filter',
            'Compatibility': 'Mazda Demio, Axela, Atenza',
            'Warranty': '12 months'
        }
    },
    {
        id: 6,
        name: 'Radiator Assembly',
        category: 'engine',
        make: 'nissan',
        price: 15000,
        description: 'Complete radiator assembly with optimal cooling performance.',
        locations: {
            embu: { stock: 4, available: true },
            garissa: { stock: 1, available: true }
        },
        specs: {
            'Brand': 'CoolMaster',
            'Material': 'Aluminum',
            'Compatibility': 'Nissan Wingroad, AD',
            'Warranty': '12 months'
        }
    },
    {
        id: 7,
        name: 'Battery 12V 70Ah',
        category: 'electrical',
        make: 'toyota',
        price: 9500,
        description: 'Maintenance-free car battery with excellent cold cranking performance.',
        locations: {
            embu: { stock: 12, available: true },
            garissa: { stock: 8, available: true }
        },
        specs: {
            'Brand': 'PowerCell',
            'Voltage': '12V',
            'Capacity': '70Ah',
            'Compatibility': 'Universal fit',
            'Warranty': '18 months'
        }
    },
    {
        id: 8,
        name: 'Front Bumper',
        category: 'body',
        make: 'suzuki',
        price: 7800,
        description: 'OEM-style front bumper replacement. Unpainted, ready for color matching.',
        locations: {
            embu: { stock: 3, available: true },
            garissa: { stock: 0, available: false }
        },
        specs: {
            'Brand': 'BodyParts Pro',
            'Material': 'ABS Plastic',
            'Compatibility': 'Suzuki Swift, Ignis',
            'Warranty': '6 months',
            'Finish': 'Primer (unpainted)'
        }
    },
    {
        id: 9,
        name: 'Spark Plugs Set (4)',
        category: 'engine',
        make: 'honda',
        price: 2400,
        description: 'Platinum-tipped spark plugs for reliable ignition and fuel efficiency.',
        locations: {
            embu: { stock: 18, available: true },
            garissa: { stock: 10, available: true }
        },
        specs: {
            'Brand': 'IgnitePro',
            'Type': 'Platinum',
            'Compatibility': 'Honda Fit, Civic',
            'Warranty': '24 months',
            'Gap': '1.1mm'
        }
    },
    {
        id: 10,
        name: 'Timing Belt Kit',
        category: 'engine',
        make: 'toyota',
        price: 4500,
        description: 'Complete timing belt kit with tensioner and water pump.',
        locations: {
            embu: { stock: 10, available: true },
            garissa: { stock: 5, available: true }
        },
        specs: {
            'Brand': 'TimingMaster',
            'Contents': 'Belt, tensioner, water pump',
            'Compatibility': 'Toyota Corolla, Runx',
            'Warranty': '12 months'
        }
    },
    {
        id: 11,
        name: 'Fuel Pump Assembly',
        category: 'engine',
        make: 'nissan',
        price: 11000,
        description: 'Electric fuel pump with high flow rate for consistent fuel delivery.',
        locations: {
            embu: { stock: 6, available: true },
            garissa: { stock: 3, available: true }
        },
        specs: {
            'Brand': 'FuelFlow',
            'Type': 'Electric',
            'Compatibility': 'Nissan March, Cube',
            'Warranty': '12 months'
        }
    },
    {
        id: 12,
        name: 'Side Mirror (Right)',
        category: 'body',
        make: 'mazda',
        price: 3200,
        description: 'Replacement side mirror with built-in turn signal indicator.',
        locations: {
            embu: { stock: 7, available: true },
            garissa: { stock: 4, available: true }
        },
        specs: {
            'Brand': 'MirrorView',
            'Side': 'Right (Passenger)',
            'Compatibility': 'Mazda Demio',
            'Features': 'Turn signal, power adjustment',
            'Warranty': '6 months'
        }
    }
];

// Initialize Supabase client for image URL generation
async function initializeSupabase() {
    if (typeof initSupabase === 'function' && typeof isConfigured === 'function' && isConfigured()) {
        supabaseClient = initSupabase();
        console.log('Supabase client initialized for image URLs');
    }
}

// Helper function to get Storage public URL for images
function getProductImageUrl(imagePath) {
    if (!imagePath || !supabaseClient) return null;
    try {
        const { data } = supabaseClient.storage
            .from('products')
            .getPublicUrl(imagePath);
        return data?.publicUrl || null;
    } catch (error) {
        console.error('Error generating image URL:', error);
        return null;
    }
}

// Load products from backend (PR #9's approach, enhanced with image URL generation)
async function loadProductsFromBackend() {
    try {
        // Check if backend integration is available
        if (typeof window.backendIntegration === 'undefined' || !window.backendIntegration.isEnabled()) {
            console.log('Backend not available - using hardcoded products');
            return;
        }
        
        // Fetch active products from Supabase
        const result = await window.backendIntegration.getProducts();
        
        if (!result.success || !result.products || result.products.length === 0) {
            console.log('No products from backend - using hardcoded products');
            return;
        }
        
        console.log(`Loaded ${result.products.length} products from Supabase`);
        
        // Map Supabase products to expected format
        const mappedProducts = result.products.map(dbProduct => {
            // Create locations object based on single location field
            const locations = {
                embu: { 
                    stock: dbProduct.location.toLowerCase() === 'embu' ? dbProduct.stock_quantity : 0, 
                    available: dbProduct.location.toLowerCase() === 'embu' && dbProduct.stock_quantity > 0 
                },
                garissa: { 
                    stock: dbProduct.location.toLowerCase() === 'garissa' ? dbProduct.stock_quantity : 0, 
                    available: dbProduct.location.toLowerCase() === 'garissa' && dbProduct.stock_quantity > 0 
                }
            };
            
            // If location is "both" or similar, distribute stock
            if (!['embu', 'garissa'].includes(dbProduct.location.toLowerCase())) {
                const halfStock = Math.floor(dbProduct.stock_quantity / 2);
                locations.embu = { stock: halfStock, available: halfStock > 0 };
                locations.garissa = { stock: halfStock, available: halfStock > 0 };
            }
            
            // Build specs object from available fields
            const specs = {};
            if (dbProduct.manufacturer) specs['Manufacturer'] = dbProduct.manufacturer;
            if (dbProduct.part_number) specs['Part Number'] = dbProduct.part_number;
            if (dbProduct.sku) specs['SKU'] = dbProduct.sku;
            specs['Category'] = dbProduct.category || 'General';
            
            // Generate proper image URL from primary_image_path using Storage
            let imageUrl = null;
            if (dbProduct.primary_image_path) {
                imageUrl = getProductImageUrl(dbProduct.primary_image_path);
            }
            
            return {
                id: dbProduct.id,
                name: dbProduct.name,
                category: normalizeCategoryForFilter(dbProduct.category),
                make: extractMakeFromName(dbProduct.name) || 'universal',
                price: dbProduct.price_kes,
                description: dbProduct.description || 'Quality auto part for your vehicle.',
                locations: locations,
                specs: specs,
                imageUrl: imageUrl,
                featured: dbProduct.featured || false
            };
        });
        
        // Replace products array with mapped products
        products.length = 0;
        products.push(...mappedProducts);
        
        console.log('Products loaded and mapped successfully');
    } catch (error) {
        console.error('Error loading products from backend:', error);
        console.log('Falling back to hardcoded products');
    }
}

// Helper function to normalize category for filtering
function normalizeCategoryForFilter(category) {
    if (!category) return 'engine';
    
    const normalized = category.toLowerCase();
    
    // Map common category names to filter values
    if (normalized.includes('brake') || normalized.includes('suspension')) return 'brakes';
    if (normalized.includes('filter') || normalized.includes('fluid') || normalized.includes('oil')) return 'filters';
    if (normalized.includes('electric') || normalized.includes('battery') || normalized.includes('alternator')) return 'electrical';
    if (normalized.includes('body') || normalized.includes('bumper') || normalized.includes('mirror')) return 'body';
    if (normalized.includes('engine') || normalized.includes('timing') || normalized.includes('spark')) return 'engine';
    
    return 'engine'; // Default
}

// Helper function to extract vehicle make from product name
function extractMakeFromName(name) {
    if (!name) return null;
    
    const nameLower = name.toLowerCase();
    const makes = ['toyota', 'nissan', 'mitsubishi', 'mazda', 'suzuki', 'honda'];
    
    for (const make of makes) {
        if (nameLower.includes(make)) {
            return make;
        }
    }
    
    return null;
}

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
    await initializeSupabase(); // Initialize Supabase for image URLs
    initializeLocation();
    await loadProductsFromBackend(); // Load products using PR #9's approach
    renderProducts();
    attachEventListeners();
    updateCartDisplay();
    initNavigation();
});

// Location Management
function initializeLocation() {
    if (currentLocation) {
        document.getElementById('currentLocation').textContent = 
            currentLocation.charAt(0).toUpperCase() + currentLocation.slice(1);
    }
}

function openLocationModal() {
    document.getElementById('locationModal').classList.add('active');
}

function closeLocationModal() {
    document.getElementById('locationModal').classList.remove('active');
}

function selectLocation(location) {
    currentLocation = location;
    localStorage.setItem('selectedLocation', location);
    document.getElementById('currentLocation').textContent = 
        location.charAt(0).toUpperCase() + location.slice(1);
    closeLocationModal();
    renderProducts();
}

// Product Rendering
function renderProducts(filteredProducts = null) {
    console.log('renderProducts called', filteredProducts ? `with ${filteredProducts.length} filtered products` : `with all ${products.length} products`);
    const grid = document.getElementById('productsGrid');
    if (!grid) {
        console.error('Products grid element not found!');
        return;
    }
    const productsToRender = filteredProducts || products;
    
    grid.innerHTML = productsToRender.map(product => {
        const locationStock = currentLocation ? 
            product.locations[currentLocation] : 
            { stock: Math.max(product.locations.embu.stock, product.locations.garissa.stock), available: true };
        
        const stockStatus = !locationStock.available ? 'out-of-stock' : 
                           locationStock.stock < 5 ? 'low-stock' : 'in-stock';
        const stockText = !locationStock.available ? 'Out of Stock' : 
                         locationStock.stock < 5 ? `Low Stock (${locationStock.stock})` : 'In Stock';
        
        const description = product.description || 'Quality auto part';
        
        // Determine if we have an image or should use 3D preview
        const hasImage = product.imageUrl && product.imageUrl.trim() !== '';
        
        return `
            <div class="product-card" onclick="openProductViewer('${product.id}')" ${hasImage ? 'data-product-id="' + product.id + '"' : ''}>
                <div class="product-image ${hasImage ? 'product-image-3d' : ''}" ${hasImage ? 'data-image-id="' + product.id + '"' : ''}>
                    ${hasImage ? 
                        `<div class="product-3d-wrapper">
                            <img src="${product.imageUrl}" alt="${product.name}" class="product-2d-image" onerror="this.style.display='none'; this.parentElement.parentElement.querySelector('canvas').style.display='block';" />
                            <div class="product-3d-overlay"></div>
                        </div>
                        <canvas id="preview-${product.id}" width="280" height="220" style="display: none;"></canvas>` :
                        `<canvas id="preview-${product.id}" width="280" height="220"></canvas>`
                    }
                    <div class="view-3d-badge">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                            <path d="M2 17l10 5 10-5"></path>
                            <path d="M2 12l10 5 10-5"></path>
                        </svg>
                        ${hasImage ? 'Interactive View' : 'View in 3D'}
                    </div>
                </div>
                <div class="product-info">
                    <div class="product-category">${getCategoryName(product.category)}</div>
                    <h3 class="product-name">${product.name}</h3>
                    <p class="product-description">${description.substring(0, 80)}...</p>
                    <div class="product-meta">
                        <div class="product-price">KSh ${parseFloat(product.price).toLocaleString()}</div>
                        <div class="product-location">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                                <circle cx="12" cy="10" r="3"></circle>
                            </svg>
                            ${currentLocation ? currentLocation.charAt(0).toUpperCase() + currentLocation.slice(1) : 'Both'}
                        </div>
                    </div>
                    <span class="stock-badge ${stockStatus}">${stockText}</span>
                </div>
            </div>
        `;
    }).join('');
    
    // Initialize 3D effects for each product
    productsToRender.forEach(product => {
        const hasImage = product.imageUrl && product.imageUrl.trim() !== '';
        
        if (hasImage) {
            // Add 3D tilt effect to images
            setTimeout(() => init3DTiltEffect(product.id), 100);
        } else {
            // Render Three.js preview for products without images
            setTimeout(() => renderProductPreview(product.id), 100);
        }
    });
}

// 3D Tilt Effect for 2D Images (new feature)
function init3DTiltEffect(productId) {
    const productCard = document.querySelector(`[data-image-id="${productId}"]`);
    if (!productCard) return;
    
    const wrapper = productCard.querySelector('.product-3d-wrapper');
    if (!wrapper) return;
    
    // Add mouse move listener for tilt effect
    productCard.addEventListener('mousemove', (e) => {
        const rect = productCard.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        
        const percentX = (x - centerX) / centerX;
        const percentY = (y - centerY) / centerY;
        
        const rotateY = percentX * 15; // Max 15 degrees
        const rotateX = -percentY * 15; // Max 15 degrees (negative for natural tilt)
        
        wrapper.style.transform = `
            perspective(1000px) 
            rotateX(${rotateX}deg) 
            rotateY(${rotateY}deg) 
            scale3d(1.05, 1.05, 1.05)
        `;
    });
    
    productCard.addEventListener('mouseleave', () => {
        wrapper.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
    });
    
    // Add touch support for mobile
    productCard.addEventListener('touchmove', (e) => {
        const touch = e.touches[0];
        const rect = productCard.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        
        const percentX = (x - centerX) / centerX;
        const percentY = (y - centerY) / centerY;
        
        const rotateY = percentX * 10;
        const rotateX = -percentY * 10;
        
        wrapper.style.transform = `
            perspective(1000px) 
            rotateX(${rotateX}deg) 
            rotateY(${rotateY}deg) 
            scale3d(1.03, 1.03, 1.03)
        `;
    });
    
    productCard.addEventListener('touchend', () => {
        wrapper.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
    });
}

// 3D Preview Rendering
function renderProductPreview(productId) {
    const canvas = document.getElementById(`preview-${productId}`);
    if (!canvas) {
        console.warn(`Canvas not found for product ${productId}`);
        return;
    }
    
    if (typeof THREE === 'undefined') {
        console.error('Three.js not available - cannot render 3D preview');
        return;
    }
    
    try {
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(50, canvas.width / canvas.height, 0.1, 1000);
        const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
        renderer.setSize(canvas.width, canvas.height);
        
        // Create a simple 3D representation (box with details)
        const geometry = new THREE.BoxGeometry(1.5, 1, 0.8);
        const material = new THREE.MeshPhongMaterial({ 
            color: 0x00A86B,
            shininess: 80,
            specular: 0x111111
        });
        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);
        
        // Add edges for better definition
        const edges = new THREE.EdgesGeometry(geometry);
        const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x00D084 });
        const edgeLines = new THREE.LineSegments(edges, edgeMaterial);
        mesh.add(edgeLines);
        
        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 5, 5);
        scene.add(directionalLight);
        
        camera.position.z = 3;
        
        // Simple rotation animation
        let rotation = 0;
        function animate() {
            rotation += 0.01;
            mesh.rotation.y = rotation;
            mesh.rotation.x = Math.sin(rotation * 0.5) * 0.2;
            renderer.render(scene, camera);
            requestAnimationFrame(animate);
        }
        animate();
    } catch (error) {
        console.error(`Error rendering 3D preview for product ${productId}:`, error);
    }
}

// Full 3D Viewer
function openProductViewer(productId) {
    selectedProduct = products.find(p => p.id == productId);
    if (!selectedProduct) return;
    
    const modal = document.getElementById('viewerModal');
    document.getElementById('modalProductName').textContent = selectedProduct.name;
    document.getElementById('modalProductPrice').textContent = `KSh ${selectedProduct.price.toLocaleString()}`;
    document.getElementById('modalCategory').textContent = getCategoryName(selectedProduct.category);
    
    const locationStock = currentLocation ? 
        selectedProduct.locations[currentLocation] : 
        { stock: Math.max(selectedProduct.locations.embu.stock, selectedProduct.locations.garissa.stock), available: true };
    
    document.getElementById('modalLocation').textContent = currentLocation ? 
        currentLocation.charAt(0).toUpperCase() + currentLocation.slice(1) : 'Embu & Garissa';
    
    const stockStatus = !locationStock.available ? 'out-of-stock' : 
                       locationStock.stock < 5 ? 'low-stock' : 'in-stock';
    const stockText = !locationStock.available ? 'Out of Stock' : 
                     locationStock.stock < 5 ? `Low Stock (${locationStock.stock})` : 'In Stock';
    
    const stockBadge = document.getElementById('modalStock');
    stockBadge.textContent = stockText;
    stockBadge.className = `stock-badge ${stockStatus}`;
    
    document.getElementById('modalDescription').textContent = selectedProduct.description;
    
    // Render specifications
    const specsHtml = `
        <h4>Specifications</h4>
        ${Object.entries(selectedProduct.specs).map(([key, value]) => `
            <div class="spec-row">
                <span class="spec-label">${key}</span>
                <span class="spec-value">${value}</span>
            </div>
        `).join('')}
    `;
    document.getElementById('modalSpecs').innerHTML = specsHtml;
    
    modal.classList.add('active');
    
    // Initialize 3D viewer
    setTimeout(() => init3DViewer(), 100);
}

function init3DViewer() {
    const canvas = document.getElementById('canvas3D');
    const container = document.getElementById('viewer3D');
    
    // Clean up previous scene
    if (renderer) {
        renderer.dispose();
    }
    
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1E293B);
    
    camera = new THREE.PerspectiveCamera(
        60,
        container.clientWidth / container.clientHeight,
        0.1,
        1000
    );
    
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    
    // Create more detailed 3D model
    const geometry = new THREE.BoxGeometry(2, 1.5, 1);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0x00A86B,
        metalness: 0.6,
        roughness: 0.4
    });
    currentMesh = new THREE.Mesh(geometry, material);
    scene.add(currentMesh);
    
    // Add edges
    const edges = new THREE.EdgesGeometry(geometry);
    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x00D084, linewidth: 2 });
    const edgeLines = new THREE.LineSegments(edges, edgeMaterial);
    currentMesh.add(edgeLines);
    
    // Add smaller detail boxes
    const detailGeometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const detailMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xFF6B35,
        metalness: 0.7,
        roughness: 0.3
    });
    const detail = new THREE.Mesh(detailGeometry, detailMaterial);
    detail.position.set(0.8, 0.5, 0);
    currentMesh.add(detail);
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight1.position.set(5, 5, 5);
    scene.add(directionalLight1);
    
    const directionalLight2 = new THREE.DirectionalLight(0x00A86B, 0.4);
    directionalLight2.position.set(-5, -5, -5);
    scene.add(directionalLight2);
    
    camera.position.z = 4;
    
    // Mouse controls
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    
    canvas.addEventListener('mousedown', (e) => {
        isDragging = true;
        previousMousePosition = { x: e.clientX, y: e.clientY };
    });
    
    canvas.addEventListener('mousemove', (e) => {
        if (isDragging) {
            const deltaX = e.clientX - previousMousePosition.x;
            const deltaY = e.clientY - previousMousePosition.y;
            
            currentMesh.rotation.y += deltaX * 0.01;
            currentMesh.rotation.x += deltaY * 0.01;
            
            previousMousePosition = { x: e.clientX, y: e.clientY };
        }
    });
    
    canvas.addEventListener('mouseup', () => {
        isDragging = false;
    });
    
    // Touch controls
    canvas.addEventListener('touchstart', (e) => {
        isDragging = true;
        previousMousePosition = { 
            x: e.touches[0].clientX, 
            y: e.touches[0].clientY 
        };
    });
    
    canvas.addEventListener('touchmove', (e) => {
        if (isDragging) {
            const deltaX = e.touches[0].clientX - previousMousePosition.x;
            const deltaY = e.touches[0].clientY - previousMousePosition.y;
            
            currentMesh.rotation.y += deltaX * 0.01;
            currentMesh.rotation.x += deltaY * 0.01;
            
            previousMousePosition = { 
                x: e.touches[0].clientX, 
                y: e.touches[0].clientY 
            };
        }
    });
    
    canvas.addEventListener('touchend', () => {
        isDragging = false;
    });
    
    // Zoom with mouse wheel
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        camera.position.z += e.deltaY * 0.01;
        camera.position.z = Math.max(2, Math.min(8, camera.position.z));
    });
    
    // Animation loop
    function animate() {
        requestAnimationFrame(animate);
        
        // Gentle auto-rotation when not dragging
        if (!isDragging) {
            currentMesh.rotation.y += 0.003;
        }
        
        renderer.render(scene, camera);
    }
    animate();
}

function resetCamera() {
    if (camera && currentMesh) {
        camera.position.set(0, 0, 4);
        currentMesh.rotation.set(0, 0, 0);
    }
}

function closeViewer() {
    document.getElementById('viewerModal').classList.remove('active');
    selectedProduct = null;
}

// Cart Functions
function addToCart() {
    if (!selectedProduct) return;
    
    if (!currentLocation) {
        alert('Please select a location first (Embu or Garissa)');
        closeViewer();
        openLocationModal();
        return;
    }
    
    const locationStock = selectedProduct.locations[currentLocation];
    if (!locationStock.available || locationStock.stock === 0) {
        alert('This item is out of stock in your selected location.');
        return;
    }
    
    const existingItem = cart.find(item => item.id === selectedProduct.id);
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({
            id: selectedProduct.id,
            name: selectedProduct.name,
            price: selectedProduct.price,
            quantity: 1,
            location: currentLocation
        });
    }
    
    localStorage.setItem('cart', JSON.stringify(cart));
    updateCartDisplay();
    
    // Track add to cart if backend available
    if (typeof trackAddToCart === 'function') {
        trackAddToCart(selectedProduct.id, selectedProduct.name, 1);
    }
    
    // Show success feedback
    alert(`${selectedProduct.name} added to cart!`);
}

function updateCartDisplay() {
    const cartCount = cart.reduce((total, item) => total + item.quantity, 0);
    document.querySelector('.cart-count').textContent = cartCount;
}

// Search and Filter
function attachEventListeners() {
    const searchInput = document.getElementById('searchInput');
    const categoryFilter = document.getElementById('categoryFilter');
    const makeFilter = document.getElementById('makeFilter');
    const locationFilter = document.getElementById('locationFilter');
    
    const filterProducts = () => {
        const searchTerm = searchInput.value.toLowerCase();
        const category = categoryFilter.value;
        const make = makeFilter.value;
        const location = locationFilter.value;
        
        let filtered = products.filter(product => {
            const matchesSearch = product.name.toLowerCase().includes(searchTerm) || 
                                 product.description.toLowerCase().includes(searchTerm);
            const matchesCategory = !category || product.category === category;
            const matchesMake = !make || product.make === make;
            const matchesLocation = !location || product.locations[location].available;
            
            return matchesSearch && matchesCategory && matchesMake && matchesLocation;
        });
        
        renderProducts(filtered);
    };
    
    searchInput.addEventListener('input', filterProducts);
    categoryFilter.addEventListener('change', filterProducts);
    makeFilter.addEventListener('change', filterProducts);
    locationFilter.addEventListener('change', filterProducts);
    
    // Contact form
    document.getElementById('contactForm').addEventListener('submit', (e) => {
        e.preventDefault();
        alert('Thank you for your inquiry! We will contact you shortly.');
        e.target.reset();
    });
}

// Helper Functions
function getCategoryName(category) {
    const categories = {
        'engine': 'Engine Parts',
        'brakes': 'Brakes & Suspension',
        'electrical': 'Electrical',
        'body': 'Body Parts',
        'filters': 'Filters & Fluids'
    };
    return categories[category] || category;
}

function scrollToProducts() {
    document.getElementById('products').scrollIntoView({ behavior: 'smooth' });
}

function contactAboutProduct() {
    closeViewer();
    document.getElementById('contact').scrollIntoView({ behavior: 'smooth' });
}

// Navigation
function initNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            const target = link.getAttribute('href');
            document.querySelector(target).scrollIntoView({ behavior: 'smooth' });
        });
    });
    
    // Update active nav on scroll
    window.addEventListener('scroll', () => {
        const sections = document.querySelectorAll('section[id]');
        let current = '';
        
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.clientHeight;
            if (window.pageYOffset >= sectionTop - 100) {
                current = section.getAttribute('id');
            }
        });
        
        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${current}`) {
                link.classList.add('active');
            }
        });
    });
}

// Handle window resize for 3D canvas
window.addEventListener('resize', () => {
    if (renderer && camera) {
        const container = document.getElementById('viewer3D');
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    }
});

// Close modals on outside click
window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('active');
    }
});
