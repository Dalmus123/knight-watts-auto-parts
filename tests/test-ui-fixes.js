/**
 * UI Verification Test - Check mobile layout fixes
 * Tests the admin panel UI fixes without requiring authentication
 */

const { webkit, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:8080';
const SCREENSHOTS_DIR = './test-screenshots';

if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function runTests() {
    console.log('🧪 UI Layout Verification Test (iPhone 13 WebKit)\n');
    
    const browser = await webkit.launch({ 
        headless: false 
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
        // Test 1: Check admin login page on mobile
        console.log('1️⃣ Testing mobile viewport and safe areas...');
        await page.goto(BASE_URL + '/admin/');
        await page.waitForLoadState('networkidle');
        await page.screenshot({ 
            path: path.join(SCREENSHOTS_DIR, 'admin-login-mobile.png'),
            fullPage: true 
        });
        
        // Check viewport meta tag
        const viewport = await page.$('meta[name="viewport"]');
        console.log('✓ Viewport meta tag present:', viewport !== null);
        
        // Test 2: Check storefront
        console.log('\n2️⃣ Testing storefront on mobile...');
        await page.goto(BASE_URL + '/');
        await page.waitForLoadState('networkidle');
        
        // Check page can scroll
        const initialScroll = await page.evaluate(() => window.scrollY);
        await page.evaluate(() => window.scrollBy(0, 300));
        await page.waitForTimeout(500);
        const afterScroll = await page.evaluate(() => window.scrollY);
        console.log('✓ Storefront scrolling works:', afterScroll > initialScroll);
        
        await page.screenshot({ 
            path: path.join(SCREENSHOTS_DIR, 'storefront-mobile.png'),
            fullPage: true 
        });
        
        // Test 3: Check product modal
        const productCard = await page.$('.product-card');
        if (productCard) {
            console.log('\n3️⃣ Testing product modal...');
            await productCard.tap();
            await page.waitForTimeout(1000);
            
            const modal = await page.$('.modal.active');
            console.log('✓ Product modal opens:', modal !== null);
            
            if (modal) {
                // Check z-index
                const zIndex = await page.evaluate(() => {
                    const modal = document.querySelector('.modal.active');
                    return window.getComputedStyle(modal).zIndex;
                });
                console.log('✓ Modal z-index:', zIndex);
                
                await page.screenshot({ 
                    path: path.join(SCREENSHOTS_DIR, 'product-modal-mobile.png'),
                    fullPage: false 
                });
                
                // Close modal
                const closeBtn = await page.$('.modal-close, .btn-secondary');
                if (closeBtn) await closeBtn.tap();
            }
        }
        
        // Test 4: Check CSS specifics
        console.log('\n4️⃣ Verifying CSS fixes...');
        await page.goto(BASE_URL + '/admin/admin.css');
        const css = await page.textContent('body');
        
        const checks = {
            'Mobile overflow fix': css.includes('overflow: visible'),
            'Mobile flex-column': css.includes('flex-direction: column'),
            'Pointer events none': css.includes('pointer-events: none'),
            'Search bar margin': css.includes('margin-top: 72px'),
            'Safe area insets': css.includes('env(safe-area-inset')
        };
        
        Object.entries(checks).forEach(([name, passed]) => {
            console.log(passed ? `✓ ${name}` : `✗ ${name}`);
        });
        
        // Test 5: Check service worker cache version
        console.log('\n5️⃣ Checking service worker cache version...');
        await page.goto(BASE_URL + '/service-worker.js');
        const swContent = await page.textContent('body');
        const cacheMatch = swContent.match(/CACHE_NAME\s*=\s*['"]([^'"]+)['"]/);
        if (cacheMatch) {
            console.log('✓ Cache version:', cacheMatch[1]);
            console.log('✓ Version >= 1.1.0:', cacheMatch[1] >= 'knight-watts-v1.1.0');
        }
        
        // Test 6: Check admin.js cache busting
        console.log('\n6️⃣ Checking cache busting...');
        await page.goto(BASE_URL + '/admin/');
        const scripts = await page.$$eval('script[src]', scripts => 
            scripts.map(s => s.src)
        );
        const hasCacheBusting = scripts.some(src => src.includes('?v='));
        console.log('✓ Cache-busting query strings:', hasCacheBusting);
        
        console.log('\n' + '='.repeat(60));
        console.log('✓ UI verification complete!');
        console.log(`📸 Screenshots saved to: ${SCREENSHOTS_DIR}/`);
        console.log('\n⚠️  Note: Full functional testing requires manual verification');
        console.log('   with valid credentials on a deployed instance.');
        console.log('='.repeat(60));
        
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
