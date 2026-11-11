/**
 * Comprehensive Mobile Admin Test
 * Tests all functionality with real authentication and screenshots
 */

const { webkit, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:8080';
const SCREENSHOTS_DIR = './test-screenshots';

// Test credentials - update these if needed
const TEST_EMAIL = 'test@example.com';
const TEST_PASSWORD = 'testpassword';

if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

const testResults = [];

function logTest(feature, section, status, notes = '') {
    testResults.push({ feature, section, status, notes });
    const emoji = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
    console.log(`${emoji} ${feature} (${section}): ${status} ${notes ? '- ' + notes : ''}`);
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
    console.log('🧪 Comprehensive Mobile Admin Test (iPhone 13 WebKit)\n');
    console.log('=' .repeat(70));
    
    const browser = await webkit.launch({ 
        headless: false,
        slowMo: 50 
    });
    
    const iPhone13 = devices['iPhone 13'];
    const context = await browser.newContext({
        ...iPhone13,
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        userAgent: iPhone13.userAgent
    });
    
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    
    // Log console messages
    page.on('console', msg => {
        const text = msg.text();
        if (text.includes('[Admin]') || msg.type() === 'error') {
            console.log(`  Browser: ${text}`);
        }
    });
    
    try {
        // ========== LOGIN ==========
        console.log('\n1️⃣ AUTHENTICATION\n' + '-'.repeat(70));
        await page.goto(BASE_URL + '/admin/');
        await sleep(1500);
        
        // Check if already logged in
        const adminPanel = await page.$('#adminPanel[style*="display: block"], #adminPanel:not([style*="display: none"])');
        
        if (!adminPanel) {
            console.log('  Attempting login...');
            const emailInput = await page.$('#loginEmail');
            const passwordInput = await page.$('#loginPassword');
            const loginBtn = await page.$('#loginBtn');
            
            if (emailInput && passwordInput && loginBtn) {
                await emailInput.fill(TEST_EMAIL);
                await passwordInput.fill(TEST_PASSWORD);
                await loginBtn.tap();
                await sleep(2000);
                
                // Check if login succeeded
                const nowLoggedIn = await page.$('#adminPanel[style*="display: block"], #adminPanel:not([style*="display: none"])');
                if (nowLoggedIn) {
                    logTest('Login', 'Auth', 'PASS');
                } else {
                    logTest('Login', 'Auth', 'FAIL', 'Could not log in - check credentials');
                    console.log('  ⚠️  Update TEST_EMAIL and TEST_PASSWORD in the script');
                    await browser.close();
                    return;
                }
            } else {
                logTest('Login', 'Auth', 'SKIP', 'Already logged in or login form not found');
            }
        } else {
            logTest('Login', 'Auth', 'SKIP', 'Already logged in');
        }
        
        await sleep(1000);
        
        // ========== PRODUCTS SECTION ==========
        console.log('\n2️⃣ PRODUCTS SECTION\n' + '-'.repeat(70));
        
        // Navigate to Products
        const productsNav = await page.$('[data-page="products"]');
        if (productsNav) {
            await productsNav.tap();
            await sleep(1500);
            logTest('Navigate to Products', 'Products', 'PASS');
        } else {
            logTest('Navigate to Products', 'Products', 'FAIL', 'Nav item not found');
        }
        
        // Test: Scrolling
        console.log('\n  Testing scrolling...');
        const initialScroll = await page.evaluate(() => window.scrollY);
        await page.evaluate(() => window.scrollBy(0, 500));
        await sleep(500);
        const afterScroll = await page.evaluate(() => window.scrollY);
        
        if (afterScroll > initialScroll) {
            logTest('Page scrolling', 'Products', 'PASS', `Scrolled from ${initialScroll} to ${afterScroll}`);
        } else {
            logTest('Page scrolling', 'Products', 'FAIL', 'Could not scroll');
        }
        
        // Scroll to bottom
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await sleep(1000);
        await page.screenshot({ 
            path: path.join(SCREENSHOTS_DIR, '01-products-scrolled-bottom.png'),
            fullPage: false 
        });
        console.log('  📸 Screenshot: 01-products-scrolled-bottom.png');
        
        // Check for white band
        const viewportHeight = await page.evaluate(() => window.innerHeight);
        const scrollY = await page.evaluate(() => window.scrollY);
        const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
        const hasWhiteBand = (scrollY + viewportHeight < scrollHeight - 50);
        
        if (!hasWhiteBand) {
            logTest('No white band at bottom', 'Products', 'PASS');
        } else {
            logTest('No white band at bottom', 'Products', 'FAIL', `Gap: ${scrollHeight - (scrollY + viewportHeight)}px`);
        }
        
        // Scroll back to top
        await page.evaluate(() => window.scrollTo(0, 0));
        await sleep(500);
        
        // Test: Hamburger overlap
        console.log('\n  Checking hamburger button placement...');
        const hamburger = await page.$('#mobileMenuToggle');
        const searchBar = await page.$('#productSearch');
        
        if (hamburger && searchBar) {
            const hamburgerBox = await hamburger.boundingBox();
            const searchBox = await searchBar.boundingBox();
            
            const overlaps = hamburgerBox && searchBox && (
                hamburgerBox.x < searchBox.x + searchBox.width &&
                hamburgerBox.x + hamburgerBox.width > searchBox.x &&
                hamburgerBox.y < searchBox.y + searchBox.height &&
                hamburgerBox.y + hamburgerBox.height > searchBox.y
            );
            
            if (!overlaps) {
                logTest('Hamburger placement', 'Products', 'PASS', 'No overlap with search');
            } else {
                logTest('Hamburger placement', 'Products', 'FAIL', 'Overlaps search bar');
            }
        }
        
        // Test: Add Product button
        console.log('\n  Testing Add Product button...');
        const addBtn = await page.$('#addProductBtn');
        if (addBtn) {
            const addBtnBox = await addBtn.boundingBox();
            console.log(`  Add button at: x=${addBtnBox.x}, y=${addBtnBox.y}, w=${addBtnBox.width}, h=${addBtnBox.height}`);
            
            // Check what's at the button
            const elementAt = await page.evaluate(({ x, y }) => {
                const el = document.elementFromPoint(x, y);
                return {
                    id: el?.id,
                    className: el?.className,
                    tagName: el?.tagName
                };
            }, { x: addBtnBox.x + addBtnBox.width / 2, y: addBtnBox.y + addBtnBox.height / 2 });
            
            console.log(`  Element at button center:`, elementAt);
            
            await addBtn.tap();
            await sleep(1500);
            
            const modal = await page.$('.modal.active');
            if (modal) {
                logTest('Add Product button opens modal', 'Products', 'PASS');
                
                await page.screenshot({ 
                    path: path.join(SCREENSHOTS_DIR, '02-add-product-modal.png'),
                    fullPage: false 
                });
                console.log('  📸 Screenshot: 02-add-product-modal.png');
                
                // Close modal
                const cancelBtn = await page.$('.btn-secondary');
                if (cancelBtn) {
                    await cancelBtn.tap();
                    await sleep(500);
                }
            } else {
                logTest('Add Product button opens modal', 'Products', 'FAIL', 'Modal did not open');
            }
        } else {
            logTest('Add Product button opens modal', 'Products', 'FAIL', 'Button not found');
        }
        
        // Test: Search functionality
        console.log('\n  Testing product search...');
        const searchInput = await page.$('#productSearch');
        if (searchInput) {
            const cardsBeforeSearch = await page.$$('.product-card');
            const countBefore = cardsBeforeSearch.length;
            console.log(`  Products before search: ${countBefore}`);
            
            await searchInput.tap();
            await sleep(300);
            await searchInput.fill('filter');
            await sleep(800);
            
            const cardsAfterSearch = await page.$$('.product-card');
            const countAfter = cardsAfterSearch.length;
            console.log(`  Products after search: ${countAfter}`);
            
            await page.screenshot({ 
                path: path.join(SCREENSHOTS_DIR, '03-search-filtered.png'),
                fullPage: false 
            });
            console.log('  📸 Screenshot: 03-search-filtered.png');
            
            // Search should either reduce count or show 0 results
            if (countAfter < countBefore || countAfter === 0) {
                logTest('Product search filters', 'Products', 'PASS', `${countBefore} → ${countAfter} products`);
            } else {
                logTest('Product search filters', 'Products', 'WARN', 'Count did not change - may not match any product');
            }
            
            // Clear search
            await searchInput.fill('');
            await sleep(500);
        } else {
            logTest('Product search filters', 'Products', 'FAIL', 'Search input not found');
        }
        
        // Test: Edit Product
        console.log('\n  Testing Edit Product...');
        const firstCard = await page.$('.product-card');
        if (firstCard) {
            await firstCard.tap();
            await sleep(1500);
            
            const editModal = await page.$('.modal.active');
            if (editModal) {
                logTest('Edit Product opens modal', 'Products', 'PASS');
                
                await page.screenshot({ 
                    path: path.join(SCREENSHOTS_DIR, '04-edit-product-modal.png'),
                    fullPage: false 
                });
                console.log('  📸 Screenshot: 04-edit-product-modal.png');
                
                // Close modal
                const cancelBtn = await page.$('.btn-secondary');
                if (cancelBtn) {
                    await cancelBtn.tap();
                    await sleep(500);
                }
            } else {
                logTest('Edit Product opens modal', 'Products', 'FAIL', 'Modal did not open');
            }
        } else {
            logTest('Edit Product opens modal', 'Products', 'SKIP', 'No products to edit');
        }
        
        // ========== CREATE TEST PRODUCT ==========
        console.log('\n3️⃣ CREATE TEST PRODUCT WITH 3D MODEL\n' + '-'.repeat(70));
        
        // Open Add Product modal
        const addBtn2 = await page.$('#addProductBtn');
        if (addBtn2) {
            await addBtn2.tap();
            await sleep(1000);
            
            const modal = await page.$('.modal.active');
            if (modal) {
                console.log('  Filling product form...');
                
                // Fill basic fields
                await page.fill('input[placeholder="Product name"]', 'Test Mobile Product');
                await page.fill('input[placeholder="SKU"]', 'TEST-MOBILE-001');
                await page.fill('input[placeholder="Price"]', '1999.99');
                await page.fill('input[placeholder="Stock quantity"]', '15');
                
                // Try to select category if dropdown exists
                const categorySelect = await page.$('select[name="category"]');
                if (categorySelect) {
                    await categorySelect.selectOption({ index: 1 });
                }
                
                // Check for 3D file input
                console.log('  Checking for 3D file input...');
                const fileInput = await page.$('input[type="file"][accept*=".glb"]');
                if (fileInput) {
                    // Note: In real testing, we'd upload an actual .glb file
                    // For this test, we'll just verify the input exists
                    logTest('3D file input present', 'Products', 'PASS', 'File input found');
                    console.log('  ⚠️  Cannot upload actual file in automated test');
                    console.log('  📸 Screenshot showing form: 05-create-product-form.png');
                } else {
                    logTest('3D file input present', 'Products', 'WARN', 'File input not found');
                }
                
                await page.screenshot({ 
                    path: path.join(SCREENSHOTS_DIR, '05-create-product-form.png'),
                    fullPage: false 
                });
                
                // Note: We won't actually save the test product in automated test
                // to avoid polluting the database
                console.log('  ⚠️  Not saving test product to avoid polluting live database');
                logTest('Create test product', 'Products', 'SKIP', 'Would require manual verification');
                
                // Close modal
                const cancelBtn = await page.$('.btn-secondary');
                if (cancelBtn) {
                    await cancelBtn.tap();
                    await sleep(500);
                }
            }
        }
        
        // ========== OTHER ADMIN SECTIONS ==========
        console.log('\n4️⃣ OTHER ADMIN SECTIONS\n' + '-'.repeat(70));
        
        const sections = [
            { page: 'dashboard', name: 'Dashboard', selector: '.stat-card' },
            { page: 'orders', name: 'Orders', selector: '#ordersTable' },
            { page: 'custom-requests', name: 'Custom Requests', selector: '#requestsTable' },
            { page: 'print-queue', name: 'Print Queue', selector: '#printJobsGrid' },
            { page: 'live-telemetry', name: 'Live Telemetry', selector: '.telemetry-panel' },
            { page: 'deliveries', name: 'Deliveries', selector: '#deliveriesTable' },
            { page: 'analytics', name: 'Analytics', selector: '.chart-container' },
            { page: 'reports', name: 'Reports', selector: '.reports-container' }
        ];
        
        for (const section of sections) {
            console.log(`\n  Testing ${section.name}...`);
            const navItem = await page.$(`[data-page="${section.page}"]`);
            if (navItem) {
                await navItem.tap();
                await sleep(1000);
                
                const content = await page.$(section.selector);
                if (content) {
                    logTest(`${section.name} page loads`, section.name, 'PASS');
                } else {
                    logTest(`${section.name} page loads`, section.name, 'WARN', 'Expected content not found');
                }
            } else {
                logTest(`${section.name} page loads`, section.name, 'SKIP', 'Nav item not found');
            }
        }
        
        // ========== MOBILE MENU ==========
        console.log('\n5️⃣ MOBILE MENU\n' + '-'.repeat(70));
        
        const menuToggle = await page.$('#mobileMenuToggle');
        if (menuToggle) {
            console.log('  Opening mobile menu...');
            await menuToggle.tap();
            await sleep(500);
            
            const sidebarOpen = await page.$('#adminSidebar.mobile-open');
            const overlayActive = await page.$('#mobileOverlay.active');
            
            if (sidebarOpen && overlayActive) {
                logTest('Mobile menu opens', 'Navigation', 'PASS');
                
                await page.screenshot({ 
                    path: path.join(SCREENSHOTS_DIR, '06-mobile-menu-open.png'),
                    fullPage: false 
                });
                console.log('  📸 Screenshot: 06-mobile-menu-open.png');
                
                // Close via overlay
                if (overlayActive) {
                    await overlayActive.tap();
                    await sleep(500);
                    
                    const sidebarClosed = await page.$('#adminSidebar:not(.mobile-open)');
                    if (sidebarClosed) {
                        logTest('Mobile menu closes via overlay', 'Navigation', 'PASS');
                    } else {
                        logTest('Mobile menu closes via overlay', 'Navigation', 'FAIL');
                    }
                }
            } else {
                logTest('Mobile menu opens', 'Navigation', 'FAIL');
            }
        }
        
        // ========== STOREFRONT ==========
        console.log('\n6️⃣ STOREFRONT\n' + '-'.repeat(70));
        
        const storePage = await context.newPage();
        await storePage.goto(BASE_URL + '/');
        await sleep(2000);
        
        // Test product modal
        const productCard = await storePage.$('.product-card');
        if (productCard) {
            console.log('  Opening product modal...');
            await productCard.tap();
            await sleep(1500);
            
            const modal = await storePage.$('.modal.active');
            if (modal) {
                logTest('Storefront product modal', 'Storefront', 'PASS');
                
                // Check for 3D viewer
                const modelViewer = await storePage.$('model-viewer');
                if (modelViewer) {
                    logTest('3D model viewer present', 'Storefront', 'PASS');
                } else {
                    logTest('3D model viewer present', 'Storefront', 'WARN', 'Product may not have 3D model');
                }
                
                await storePage.screenshot({ 
                    path: path.join(SCREENSHOTS_DIR, '07-storefront-modal.png'),
                    fullPage: false 
                });
                console.log('  📸 Screenshot: 07-storefront-modal.png');
            } else {
                logTest('Storefront product modal', 'Storefront', 'FAIL');
            }
        } else {
            logTest('Storefront product modal', 'Storefront', 'SKIP', 'No products found');
        }
        
        await storePage.close();
        
        // ========== SUMMARY ==========
        console.log('\n' + '='.repeat(70));
        console.log('TEST RESULTS SUMMARY');
        console.log('='.repeat(70));
        
        const passed = testResults.filter(r => r.status === 'PASS').length;
        const failed = testResults.filter(r => r.status === 'FAIL').length;
        const warned = testResults.filter(r => r.status === 'WARN').length;
        const skipped = testResults.filter(r => r.status === 'SKIP').length;
        
        console.log(`\n✅ Passed: ${passed}`);
        console.log(`❌ Failed: ${failed}`);
        console.log(`⚠️  Warnings: ${warned}`);
        console.log(`⏭️  Skipped: ${skipped}`);
        console.log(`📊 Total: ${testResults.length} tests\n`);
        
        console.log('Feature | Section | Status | Notes');
        console.log('--------|---------|--------|------');
        testResults.forEach(r => {
            console.log(`${r.feature} | ${r.section} | ${r.status} | ${r.notes}`);
        });
        
        console.log(`\n📸 Screenshots saved to: ${SCREENSHOTS_DIR}/`);
        
        // Save results to JSON
        fs.writeFileSync(
            path.join(SCREENSHOTS_DIR, 'test-results.json'),
            JSON.stringify({ 
                summary: { passed, failed, warned, skipped, total: testResults.length },
                results: testResults,
                timestamp: new Date().toISOString()
            }, null, 2)
        );
        
    } catch (error) {
        console.error('\n❌ Test failed with error:', error);
        await page.screenshot({ 
            path: path.join(SCREENSHOTS_DIR, 'error.png'),
            fullPage: true 
        });
        throw error;
    } finally {
        await browser.close();
    }
}

if (require.main === module) {
    runTests().catch(error => {
        console.error('Test suite failed:', error);
        process.exit(1);
    });
}

module.exports = { runTests };
