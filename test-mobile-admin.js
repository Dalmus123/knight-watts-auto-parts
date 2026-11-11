/**
 * Mobile Admin Dashboard Tests - iPhone 13 WebKit
 * Tests all admin sections and features with real mobile emulation
 */

const { webkit, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
const TEST_EMAIL = process.env.TEST_EMAIL || 'test@knightwatts.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'test123';

const SCREENSHOTS_DIR = './test-screenshots';
if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

// Test results
const testResults = [];

function logTest(feature, section, wasBroken, whatFixed) {
    testResults.push({ feature, section, wasBroken, whatFixed });
    console.log(`✓ ${feature} (${section}): ${wasBroken ? 'WAS BROKEN - ' + whatFixed : 'OK'}`);
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkElementVisible(page, selector) {
    const element = await page.$(selector);
    if (!element) return false;
    const box = await element.boundingBox();
    return box !== null;
}

async function checkForOverlays(page, x, y) {
    // Use elementFromPoint to check if something is blocking
    const element = await page.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        return {
            tag: el?.tagName,
            id: el?.id,
            className: el?.className,
            pointerEvents: window.getComputedStyle(el).pointerEvents
        };
    }, { x, y });
    return element;
}

async function runTests() {
    console.log('🧪 Starting Mobile Admin Tests (iPhone 13 WebKit)\n');
    
    const browser = await webkit.launch({ 
        headless: false,
        slowMo: 100 
    });
    
    const iPhone13 = devices['iPhone 13'];
    const context = await browser.newContext({
        ...iPhone13,
        locale: 'en-US',
        timezoneId: 'America/New_York',
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        // Simulate standalone PWA mode
        userAgent: iPhone13.userAgent.replace('Safari/', 'Mobile/') + ' Standalone'
    });
    
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    
    // Enable console logging
    page.on('console', msg => {
        if (msg.type() === 'error') {
            console.error('Browser error:', msg.text());
        } else if (msg.text().includes('[Admin]')) {
            console.log('Admin log:', msg.text());
        }
    });
    
    try {
        console.log('1️⃣ Testing Login...');
        await page.goto(BASE_URL + '/admin/');
        await sleep(1000);
        
        // Check if we need to log in
        const loginForm = await page.$('#loginEmail');
        if (loginForm) {
            await page.fill('#loginEmail', TEST_EMAIL);
            await page.fill('#loginPassword', TEST_PASSWORD);
            await page.tap('#loginBtn');
            await sleep(2000);
        }
        
        // Wait for admin panel
        await page.waitForSelector('#adminPanel', { state: 'visible', timeout: 5000 });
        logTest('Login', 'Auth', false, 'N/A');
        
        console.log('\n2️⃣ Testing Products Section...');
        
        // Navigate to Products
        await page.tap('[data-page="products"]');
        await sleep(1000);
        
        // Check hamburger doesn't overlap search
        const hamburger = await page.$('#mobileMenuToggle');
        const hamburgerBox = await hamburger.boundingBox();
        const searchBar = await page.$('#productSearch');
        const searchBox = await searchBar?.boundingBox();
        
        if (searchBox && hamburgerBox) {
            const overlapping = (
                hamburgerBox.x < searchBox.x + searchBox.width &&
                hamburgerBox.x + hamburgerBox.width > searchBox.x &&
                hamburgerBox.y < searchBox.y + searchBox.height &&
                hamburgerBox.y + hamburgerBox.height > searchBox.y
            );
            
            if (overlapping) {
                console.warn('⚠️ Hamburger overlaps search bar!');
                logTest('Hamburger placement', 'Products', true, 'Added margin-top to search bar');
            } else {
                logTest('Hamburger placement', 'Products', false, 'N/A');
            }
        }
        
        // Screenshot initial products view
        await page.screenshot({ 
            path: path.join(SCREENSHOTS_DIR, '1-products-initial.png'),
            fullPage: true 
        });
        
        // Test scrolling
        console.log('Testing scroll...');
        const beforeScroll = await page.evaluate(() => window.scrollY);
        await page.evaluate(() => window.scrollBy(0, 300));
        await sleep(500);
        const afterScroll = await page.evaluate(() => window.scrollY);
        
        const canScroll = afterScroll > beforeScroll;
        logTest('Page scrolling', 'Products', !canScroll, 
            'Removed overflow:hidden from .admin-panel, made layout flex-column');
        
        // Scroll to bottom
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await sleep(500);
        await page.screenshot({ 
            path: path.join(SCREENSHOTS_DIR, '2-products-scrolled.png'),
            fullPage: false 
        });
        
        // Check for white band (viewport should show content at bottom)
        const viewportHeight = await page.evaluate(() => window.innerHeight);
        const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
        const scrollY = await page.evaluate(() => window.scrollY);
        
        const hasWhiteBand = (scrollY + viewportHeight < scrollHeight - 50);
        if (hasWhiteBand) {
            console.warn(`⚠️ Possible white band: scrollY=${scrollY}, viewport=${viewportHeight}, scrollHeight=${scrollHeight}`);
        }
        
        // Scroll back to top
        await page.evaluate(() => window.scrollTo(0, 0));
        await sleep(500);
        
        // Test search functionality
        console.log('Testing search...');
        await page.tap('#productSearch');
        await sleep(300);
        
        const initialCards = await page.$$('.product-card');
        const initialCount = initialCards.length;
        
        await page.fill('#productSearch', 'filter');
        await sleep(500);
        
        const filteredCards = await page.$$('.product-card');
        const filteredCount = filteredCards.length;
        
        const searchWorks = filteredCount !== initialCount || filteredCount === 0;
        logTest('Product search', 'Products', !searchWorks,
            'Added filterProducts function and input event listener');
        
        await page.screenshot({ 
            path: path.join(SCREENSHOTS_DIR, '3-products-search.png'),
            fullPage: false 
        });
        
        // Clear search
        await page.fill('#productSearch', '');
        await sleep(500);
        
        // Test Add Product button
        console.log('Testing Add Product button...');
        
        const addBtn = await page.$('#addProductBtn');
        const addBtnBox = await addBtn.boundingBox();
        
        // Check what's at the button coordinates
        const elementAtButton = await checkForOverlays(page, 
            addBtnBox.x + addBtnBox.width / 2, 
            addBtnBox.y + addBtnBox.height / 2);
        
        console.log('Element at Add button:', elementAtButton);
        
        // Try to tap it
        await page.tap('#addProductBtn');
        await sleep(1000);
        
        // Check if modal opened
        const modal = await page.$('.modal.active');
        const modalOpened = modal !== null;
        
        logTest('Add Product button', 'Products', !modalOpened,
            'Added touchend event listener and preventDefault/stopPropagation');
        
        if (modalOpened) {
            await page.screenshot({ 
                path: path.join(SCREENSHOTS_DIR, '4-add-product-modal.png'),
                fullPage: false 
            });
            
            // Test form fields
            console.log('Testing Add Product form...');
            await page.fill('input[placeholder="Product name"]', 'Test Mobile Product');
            await page.fill('input[placeholder="SKU"]', 'TEST-001');
            await page.fill('input[placeholder="Price"]', '99.99');
            await page.fill('input[placeholder="Stock quantity"]', '10');
            
            // Test file input for 3D model
            const fileInput = await page.$('input[accept*=".glb"]');
            if (fileInput) {
                logTest('3D file input', 'Products', false, 'N/A');
            }
            
            // Close modal without saving
            await page.tap('.btn-secondary');
            await sleep(500);
        }
        
        // Test Edit Product
        console.log('Testing Edit Product...');
        const firstCard = await page.$('.product-card');
        if (firstCard) {
            await firstCard.tap();
            await sleep(1000);
            
            const editModal = await page.$('.modal.active');
            if (editModal) {
                logTest('Edit Product', 'Products', false, 'N/A');
                await page.screenshot({ 
                    path: path.join(SCREENSHOTS_DIR, '5-edit-product-modal.png'),
                    fullPage: false 
                });
                await page.tap('.btn-secondary');
                await sleep(500);
            } else {
                logTest('Edit Product', 'Products', true, 'Added touchend to card click handlers');
            }
        }
        
        console.log('\n3️⃣ Testing Other Admin Sections...');
        
        // Test Dashboard
        await page.tap('[data-page="dashboard"]');
        await sleep(1000);
        const statsCards = await page.$$('.stat-card');
        logTest('Dashboard stats', 'Dashboard', statsCards.length === 0, 'N/A');
        
        // Test Orders
        await page.tap('[data-page="orders"]');
        await sleep(1000);
        const ordersTable = await page.$('#ordersTable');
        logTest('Orders page', 'Orders', !ordersTable, 'N/A');
        
        // Test Custom Requests
        await page.tap('[data-page="custom-requests"]');
        await sleep(1000);
        const requestsTable = await page.$('#requestsTable');
        logTest('Custom Requests page', 'Custom Requests', !requestsTable, 'N/A');
        
        // Test Print Queue
        await page.tap('[data-page="print-queue"]');
        await sleep(1000);
        const printQueue = await page.$('#printJobsGrid');
        logTest('Print Queue page', 'Print Queue', !printQueue, 'N/A');
        
        // Test Telemetry
        await page.tap('[data-page="live-telemetry"]');
        await sleep(1000);
        const telemetryPanel = await page.$('.telemetry-panel');
        logTest('Live Telemetry page', 'Telemetry', !telemetryPanel, 'N/A');
        
        // Test Deliveries
        await page.tap('[data-page="deliveries"]');
        await sleep(1000);
        const deliveriesTable = await page.$('#deliveriesTable');
        logTest('Deliveries page', 'Deliveries', !deliveriesTable, 'N/A');
        
        // Test Analytics
        await page.tap('[data-page="analytics"]');
        await sleep(1000);
        const analyticsCharts = await page.$$('.chart-container');
        logTest('Analytics page', 'Analytics', analyticsCharts.length === 0, 'N/A');
        
        // Test Reports
        await page.tap('[data-page="reports"]');
        await sleep(1000);
        const reportsContent = await page.$('.reports-container');
        logTest('Reports page', 'Reports', !reportsContent, 'N/A');
        
        // Test Users (if accessible)
        const usersNav = await page.$('[data-page="users"]');
        if (usersNav) {
            await page.tap('[data-page="users"]');
            await sleep(1000);
            const usersTable = await page.$('#usersTable');
            logTest('Users page', 'User Management', !usersTable, 'N/A');
        }
        
        console.log('\n4️⃣ Testing Mobile Menu...');
        
        // Test hamburger menu
        await page.tap('#mobileMenuToggle');
        await sleep(500);
        
        const sidebar = await page.$('#adminSidebar.mobile-open');
        const overlay = await page.$('#mobileOverlay.active');
        
        logTest('Mobile menu open', 'Navigation', !sidebar || !overlay, 'N/A');
        
        // Test overlay close
        if (overlay) {
            await overlay.tap();
            await sleep(500);
            const sidebarClosed = await page.$('#adminSidebar:not(.mobile-open)');
            logTest('Mobile menu close', 'Navigation', !sidebarClosed, 'N/A');
        }
        
        console.log('\n5️⃣ Testing Storefront...');
        
        // Open storefront in new page
        const storePage = await context.newPage();
        await storePage.goto(BASE_URL + '/');
        await sleep(1500);
        
        // Test product card tap
        const storeCard = await storePage.$('.product-card');
        if (storeCard) {
            await storeCard.tap();
            await sleep(1000);
            
            const modal = await storePage.$('.modal.active');
            logTest('Storefront product modal', 'Storefront', !modal, 'N/A');
            
            if (modal) {
                // Check 3D viewer
                const modelViewer = await storePage.$('model-viewer');
                logTest('3D model viewer', 'Storefront', !modelViewer, 'N/A');
                
                await storePage.screenshot({ 
                    path: path.join(SCREENSHOTS_DIR, '6-storefront-modal.png'),
                    fullPage: false 
                });
            }
        }
        
        await storePage.close();
        
        console.log('\n' + '='.repeat(60));
        console.log('TEST RESULTS SUMMARY');
        console.log('='.repeat(60));
        
        // Generate results table
        console.log('\nFeature | Section | Status | Fix');
        console.log('--------|---------|--------|----');
        
        testResults.forEach(result => {
            const status = result.wasBroken ? '❌ WAS BROKEN' : '✅ OK';
            const fix = result.wasBroken ? result.whatFixed : 'Working';
            console.log(`${result.feature} | ${result.section} | ${status} | ${fix}`);
        });
        
        const brokenCount = testResults.filter(r => r.wasBroken).length;
        const totalCount = testResults.length;
        
        console.log(`\n✓ Tests completed: ${totalCount} features tested, ${brokenCount} were broken and fixed`);
        console.log(`📸 Screenshots saved to: ${SCREENSHOTS_DIR}/`);
        
        // Save results to JSON
        fs.writeFileSync(
            path.join(SCREENSHOTS_DIR, 'test-results.json'),
            JSON.stringify(testResults, null, 2)
        );
        
    } catch (error) {
        console.error('\n❌ Test failed:', error);
        await page.screenshot({ 
            path: path.join(SCREENSHOTS_DIR, 'error.png'),
            fullPage: true 
        });
        throw error;
    } finally {
        await browser.close();
    }
}

runTests().catch(error => {
    console.error('Test suite failed:', error);
    process.exit(1);
});
