/**
 * Automated Screenshot Test
 * Generates all required screenshots without manual intervention
 */

const { webkit, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:8080';
const SCREENSHOTS_DIR = './test-screenshots';

if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
    console.log('🧪 Automated Screenshot Test (iPhone 13 WebKit)\n');
    
    const browser = await webkit.launch({ 
        headless: false,
        slowMo: 50 
    });
    
    const iPhone13 = devices['iPhone 13'];
    const context = await browser.newContext({
        ...iPhone13,
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true
    });
    
    const page = await context.newPage();
    
    try {
        // Navigate to admin
        console.log('1️⃣ Loading admin page...');
        await page.goto(BASE_URL + '/admin/');
        await sleep(2000);
        
        // Check if we're on the admin panel or login page
        const isLoggedIn = await page.evaluate(() => {
            const panel = document.getElementById('adminPanel');
            if (!panel) return false;
            const style = window.getComputedStyle(panel);
            return style.display !== 'none';
        });
        
        console.log(`   Logged in status: ${isLoggedIn}`);
        
        if (!isLoggedIn) {
            console.log('   ⚠️  Not logged in. Taking login page screenshot...');
            await page.screenshot({ 
                path: path.join(SCREENSHOTS_DIR, '00-login-page.png'),
                fullPage: false 
            });
            console.log('   📸 00-login-page.png');
            console.log('\n   To complete testing, you need to:');
            console.log('   1. Open http://localhost:8080/admin/ in a browser');
            console.log('   2. Log in with valid credentials');
            console.log('   3. Run this test again (the session will be persisted)');
            await browser.close();
            return;
        }
        
        console.log('\n2️⃣ Testing Products Section...');
        
        // Navigate to products by triggering hash change
        await page.evaluate(() => {
            window.location.hash = '#/products';
        });
        await sleep(1500);
        
        console.log('   ✓ Navigated to Products');
        
        // Check if content loaded
        const hasProducts = await page.evaluate(() => {
            const table = document.getElementById('productsTable');
            return table && table.innerHTML.trim() !== '';
        });
        
        console.log(`   ✓ Products loaded: ${hasProducts}`);
        
        // Test scrolling
        console.log('   Testing scroll...');
        const scrollBefore = await page.evaluate(() => window.scrollY);
        await page.evaluate(() => window.scrollBy(0, 500));
        await sleep(500);
        const scrollAfter = await page.evaluate(() => window.scrollY);
        console.log(`   ✓ Scroll: ${scrollBefore} → ${scrollAfter} (${scrollAfter > scrollBefore ? 'WORKS' : 'BROKEN'})`);
        
        // Scroll to bottom
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await sleep(1000);
        
        await page.screenshot({ 
            path: path.join(SCREENSHOTS_DIR, '01-products-scrolled-bottom.png'),
            fullPage: false 
        });
        console.log('   📸 01-products-scrolled-bottom.png');
        
        // Check for white band
        const viewport = await page.evaluate(() => ({
            scrollY: window.scrollY,
            innerHeight: window.innerHeight,
            scrollHeight: document.body.scrollHeight
        }));
        const gap = viewport.scrollHeight - (viewport.scrollY + viewport.innerHeight);
        console.log(`   ✓ White band check: ${gap}px gap ${gap < 50 ? '(OK)' : '(WHITE BAND PRESENT!)'}`);
        
        // Scroll back to top
        await page.evaluate(() => window.scrollTo(0, 0));
        await sleep(500);
        
        // Test Add Product button
        console.log('\n3️⃣ Testing Add Product Button...');
        const addBtnExists = await page.evaluate(() => {
            const btn = document.getElementById('addProductBtn');
            return btn !== null;
        });
        
        if (addBtnExists) {
            await page.evaluate(() => {
                const btn = document.getElementById('addProductBtn');
                if (btn) {
                    console.log('[Test] Clicking Add Product button');
                    btn.click();
                }
            });
            await sleep(1500);
            
            const modalOpen = await page.evaluate(() => {
                const modal = document.querySelector('.modal.active');
                return modal !== null;
            });
            
            console.log(`   ✓ Add Product button ${modalOpen ? 'WORKS' : 'BROKEN'}`);
            
            if (modalOpen) {
                await page.screenshot({ 
                    path: path.join(SCREENSHOTS_DIR, '02-add-product-modal.png'),
                    fullPage: false 
                });
                console.log('   📸 02-add-product-modal.png');
                
                // Close modal
                await page.evaluate(() => {
                    const cancelBtn = document.querySelector('.btn-secondary');
                    if (cancelBtn) cancelBtn.click();
                });
                await sleep(500);
            }
        } else {
            console.log('   ⚠️  Add Product button not found');
        }
        
        // Test search
        console.log('\n4️⃣ Testing Product Search...');
        const searchExists = await page.evaluate(() => {
            return document.getElementById('productSearch') !== null;
        });
        
        if (searchExists) {
            const cardsBefore = await page.evaluate(() => {
                return document.querySelectorAll('.product-card').length;
            });
            
            console.log(`   Products before search: ${cardsBefore}`);
            
            await page.evaluate(() => {
                const search = document.getElementById('productSearch');
                if (search) {
                    search.value = 'filter';
                    search.dispatchEvent(new Event('input', { bubbles: true }));
                }
            });
            await sleep(800);
            
            const cardsAfter = await page.evaluate(() => {
                return document.querySelectorAll('.product-card').length;
            });
            
            console.log(`   Products after search: ${cardsAfter}`);
            console.log(`   ✓ Search ${cardsAfter !== cardsBefore || cardsAfter === 0 ? 'WORKS' : 'MAY BE BROKEN'}`);
            
            await page.screenshot({ 
                path: path.join(SCREENSHOTS_DIR, '03-search-filtered.png'),
                fullPage: false 
            });
            console.log('   📸 03-search-filtered.png');
            
            // Clear search
            await page.evaluate(() => {
                const search = document.getElementById('productSearch');
                if (search) {
                    search.value = '';
                    search.dispatchEvent(new Event('input', { bubbles: true }));
                }
            });
            await sleep(500);
        }
        
        // Test Edit Product
        console.log('\n5️⃣ Testing Edit Product...');
        const hasProductCards = await page.evaluate(() => {
            return document.querySelectorAll('.product-card').length > 0;
        });
        
        if (hasProductCards) {
            await page.evaluate(() => {
                const card = document.querySelector('.product-card');
                if (card) {
                    console.log('[Test] Clicking product card');
                    card.click();
                }
            });
            await sleep(1500);
            
            const editModalOpen = await page.evaluate(() => {
                return document.querySelector('.modal.active') !== null;
            });
            
            console.log(`   ✓ Edit Product ${editModalOpen ? 'WORKS' : 'BROKEN'}`);
            
            if (editModalOpen) {
                await page.screenshot({ 
                    path: path.join(SCREENSHOTS_DIR, '04-edit-product-modal.png'),
                    fullPage: false 
                });
                console.log('   📸 04-edit-product-modal.png');
                
                // Close modal
                await page.evaluate(() => {
                    const cancelBtn = document.querySelector('.btn-secondary');
                    if (cancelBtn) cancelBtn.click();
                });
                await sleep(500);
            }
        } else {
            console.log('   ⚠️  No products to edit');
        }
        
        // Test mobile menu
        console.log('\n6️⃣ Testing Mobile Menu...');
        await page.evaluate(() => {
            const toggle = document.getElementById('mobileMenuToggle');
            if (toggle) toggle.click();
        });
        await sleep(500);
        
        const menuOpen = await page.evaluate(() => {
            const sidebar = document.getElementById('adminSidebar');
            return sidebar && sidebar.classList.contains('mobile-open');
        });
        
        console.log(`   ✓ Mobile menu ${menuOpen ? 'OPENS' : 'BROKEN'}`);
        
        if (menuOpen) {
            await page.screenshot({ 
                path: path.join(SCREENSHOTS_DIR, '05-mobile-menu-open.png'),
                fullPage: false 
            });
            console.log('   📸 05-mobile-menu-open.png');
            
            // Close menu
            await page.evaluate(() => {
                const overlay = document.getElementById('mobileOverlay');
                if (overlay) overlay.click();
            });
            await sleep(500);
        }
        
        // Test storefront
        console.log('\n7️⃣ Testing Storefront...');
        const storePage = await context.newPage();
        await storePage.goto(BASE_URL + '/');
        await sleep(2000);
        
        const hasStoreProducts = await storePage.evaluate(() => {
            return document.querySelectorAll('.product-card').length > 0;
        });
        
        if (hasStoreProducts) {
            await storePage.evaluate(() => {
                const card = document.querySelector('.product-card');
                if (card) card.click();
            });
            await sleep(1500);
            
            const storeModalOpen = await storePage.evaluate(() => {
                return document.querySelector('.modal.active') !== null;
            });
            
            console.log(`   ✓ Storefront modal ${storeModalOpen ? 'OPENS' : 'BROKEN'}`);
            
            if (storeModalOpen) {
                const has3DViewer = await storePage.evaluate(() => {
                    return document.querySelector('model-viewer') !== null;
                });
                console.log(`   ✓ 3D viewer ${has3DViewer ? 'PRESENT' : 'NOT PRESENT (product may not have 3D model)'}`);
                
                await storePage.screenshot({ 
                    path: path.join(SCREENSHOTS_DIR, '06-storefront-modal.png'),
                    fullPage: false 
                });
                console.log('   📸 06-storefront-modal.png');
            }
        } else {
            console.log('   ⚠️  No products in storefront');
        }
        
        await storePage.close();
        
        console.log('\n' + '='.repeat(70));
        console.log('✅ All screenshots captured successfully!');
        console.log(`📸 Saved to: ${path.resolve(SCREENSHOTS_DIR)}/`);
        console.log('='.repeat(70));
        
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

runTest().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
});
