/**
 * Filaments catalog — storefront listing + filters + detail modal.
 * Deliberate tap vs scroll: movement threshold before treating touchend as a tap.
 */

(function () {
    'use strict';

    const TAP_MOVE_THRESHOLD_PX = 12;
    let allFilaments = [];
    let filteredFilaments = [];
    let selectedFilament = null;
    let supabaseClient = null;

    function formatKes(amount) {
        const n = Number(amount) || 0;
        return 'KES ' + n.toLocaleString('en-KE', { maximumFractionDigits: 0 });
    }

    function formatSpoolWeight(grams) {
        if (!grams) return '—';
        if (grams >= 1000 && grams % 1000 === 0) {
            return (grams / 1000) + ' kg';
        }
        return grams + ' g';
    }

    function colourToSwatch(colour) {
        if (!colour) return '#6C757D';
        const map = {
            black: '#1a1a1a',
            white: '#f5f5f5',
            red: '#b91c1c',
            blue: '#1e3a8a',
            green: '#166534',
            yellow: '#ca8a04',
            orange: '#c2410c',
            grey: '#6b7280',
            gray: '#6b7280',
            silver: '#9ca3af',
            gold: '#a16207',
            natural: '#e7e5e4',
            clear: '#e5e7eb',
            transparent: '#e5e7eb',
            purple: '#5b21b6',
            pink: '#be185d',
            brown: '#78350f'
        };
        const key = String(colour).toLowerCase().split(/[\s/,-]+/)[0];
        return map[key] || '#ADB5BD';
    }

    function getImageUrl(path) {
        if (!path || !supabaseClient) return null;
        try {
            const { data } = supabaseClient.storage.from('products').getPublicUrl(path);
            return data?.publicUrl || null;
        } catch (_) {
            return null;
        }
    }

    /**
     * Bind click + deliberate tap (ignores scroll gestures).
     * Never preventDefault on touchmove — keeps iOS scroll / edge swipe-back.
     */
    function bindDeliberateTap(el, handler) {
        let startX = 0;
        let startY = 0;
        let moved = false;
        let touchHandled = false;

        el.addEventListener('touchstart', (e) => {
            const t = e.touches[0];
            if (!t) return;
            if (typeof window.kwIsLeftEdgeGesture === 'function' && window.kwIsLeftEdgeGesture(t.clientX)) {
                moved = true;
                return;
            }
            startX = t.clientX;
            startY = t.clientY;
            moved = false;
        }, { passive: true });

        el.addEventListener('touchmove', (e) => {
            const t = e.touches[0];
            if (!t) return;
            if (
                Math.abs(t.clientX - startX) > TAP_MOVE_THRESHOLD_PX ||
                Math.abs(t.clientY - startY) > TAP_MOVE_THRESHOLD_PX
            ) {
                moved = true;
            }
        }, { passive: true });

        el.addEventListener('touchend', (e) => {
            if (moved) return;
            touchHandled = true;
            if (e.cancelable) e.preventDefault();
            handler(e);
            setTimeout(() => { touchHandled = false; }, 400);
        }, { passive: false });

        el.addEventListener('click', (e) => {
            if (touchHandled) return;
            handler(e);
        });
    }

    function updateCartCount() {
        try {
            const cart = JSON.parse(localStorage.getItem('cart') || '[]');
            const count = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
            document.querySelectorAll('.cart-count').forEach((el) => {
                el.textContent = String(count);
            });
        } catch (_) {
            /* ignore */
        }
    }

    function populateDynamicFilters(products) {
        const colourSelect = document.getElementById('filterColour');
        const brandSelect = document.getElementById('filterBrand');
        const spoolSelect = document.getElementById('filterSpool');

        const colours = [...new Set(products.map((p) => p.filament_colour).filter(Boolean))].sort();
        const brands = [...new Set(products.map((p) => p.manufacturer).filter(Boolean))].sort();
        const spools = [...new Set(products.map((p) => p.filament_spool_weight_g).filter(Boolean))].sort((a, b) => a - b);

        const keepColour = colourSelect.value;
        colourSelect.innerHTML = '<option value="">All colours</option>' +
            colours.map((c) => `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join('');
        if (keepColour) colourSelect.value = keepColour;

        const keepBrand = brandSelect.value;
        brandSelect.innerHTML = '<option value="">All brands</option>' +
            brands.map((b) => `<option value="${escapeAttr(b)}">${escapeHtml(b)}</option>`).join('');
        if (keepBrand) brandSelect.value = keepBrand;

        // Merge known spool options with whatever is in stock
        const spoolOptions = new Map([
            [500, '500 g'],
            [750, '750 g'],
            [1000, '1 kg'],
            [2000, '2 kg'],
            [3000, '3 kg']
        ]);
        spools.forEach((g) => {
            if (!spoolOptions.has(g)) spoolOptions.set(g, formatSpoolWeight(g));
        });
        const keepSpool = spoolSelect.value;
        spoolSelect.innerHTML = '<option value="">All weights</option>' +
            [...spoolOptions.entries()]
                .sort((a, b) => a[0] - b[0])
                .map(([g, label]) => `<option value="${g}">${label}</option>`)
                .join('');
        if (keepSpool) spoolSelect.value = keepSpool;
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function escapeAttr(str) {
        return escapeHtml(str).replace(/'/g, '&#39;');
    }

    function applyFilters() {
        const material = document.getElementById('filterMaterial').value;
        const diameter = document.getElementById('filterDiameter').value;
        const colour = document.getElementById('filterColour').value;
        const spool = document.getElementById('filterSpool').value;
        const brand = document.getElementById('filterBrand').value;
        const priceMin = parseFloat(document.getElementById('filterPriceMin').value);
        const priceMax = parseFloat(document.getElementById('filterPriceMax').value);

        filteredFilaments = allFilaments.filter((p) => {
            if (material && p.filament_material !== material) return false;
            if (diameter && String(p.filament_diameter_mm) !== diameter) return false;
            if (colour && p.filament_colour !== colour) return false;
            if (spool && String(p.filament_spool_weight_g) !== spool) return false;
            if (brand && p.manufacturer !== brand) return false;
            if (!Number.isNaN(priceMin) && p.price_kes < priceMin) return false;
            if (!Number.isNaN(priceMax) && p.price_kes > priceMax) return false;
            return true;
        });

        renderGrid();
    }

    function clearFilters() {
        document.getElementById('filterMaterial').value = '';
        document.getElementById('filterDiameter').value = '';
        document.getElementById('filterColour').value = '';
        document.getElementById('filterSpool').value = '';
        document.getElementById('filterBrand').value = '';
        document.getElementById('filterPriceMin').value = '';
        document.getElementById('filterPriceMax').value = '';
        applyFilters();
    }

    function renderGrid() {
        const grid = document.getElementById('filamentsGrid');
        const countEl = document.getElementById('filamentResultCount');

        if (!allFilaments.length) {
            countEl.textContent = 'No filaments listed yet';
            grid.innerHTML = `
                <div class="filament-empty" style="grid-column: 1 / -1;">
                    <h3>Filaments coming soon</h3>
                    <p>Stock is managed by the shop — no sample prices or inventory are shown here. Check back once Dalmus adds filament products in admin, or request a custom print meanwhile.</p>
                    <a href="3d-printing.html" class="btn btn-primary" style="text-decoration: none; display: inline-block;">Request a 3D Print</a>
                </div>
            `;
            return;
        }

        countEl.textContent = filteredFilaments.length === allFilaments.length
            ? `${allFilaments.length} filament${allFilaments.length === 1 ? '' : 's'}`
            : `${filteredFilaments.length} of ${allFilaments.length} filaments`;

        if (!filteredFilaments.length) {
            grid.innerHTML = `
                <div class="filament-empty" style="grid-column: 1 / -1;">
                    <h3>No matches</h3>
                    <p>Try clearing a filter or widening the price range.</p>
                    <button type="button" class="btn btn-secondary" id="emptyClearFilters">Clear filters</button>
                </div>
            `;
            const btn = document.getElementById('emptyClearFilters');
            if (btn) bindDeliberateTap(btn, clearFilters);
            return;
        }

        grid.innerHTML = filteredFilaments.map((p) => {
            const img = getImageUrl(p.primary_image_path);
            const swatch = colourToSwatch(p.filament_colour);
            return `
                <article class="filament-card" data-id="${p.id}" tabindex="0" role="button" aria-label="${escapeAttr(p.name)}">
                    <div class="filament-card-image">
                        ${img
                            ? `<img src="${escapeAttr(img)}" alt="" loading="lazy">`
                            : `<div class="filament-card-swatch" style="background:${swatch}" aria-hidden="true"></div>`
                        }
                        <span class="filament-card-badge">${escapeHtml(p.filament_material || 'Filament')}</span>
                    </div>
                    <div class="filament-card-body">
                        <div class="filament-card-brand">${escapeHtml(p.manufacturer || 'Unbranded')}</div>
                        <h3 class="filament-card-name">${escapeHtml(p.name)}</h3>
                        <div class="filament-card-specs">
                            <span class="filament-spec-chip">${escapeHtml(String(p.filament_diameter_mm || '—'))} mm</span>
                            <span class="filament-spec-chip">${escapeHtml(p.filament_colour || '—')}</span>
                            <span class="filament-spec-chip">${escapeHtml(formatSpoolWeight(p.filament_spool_weight_g))}</span>
                        </div>
                        <div class="filament-card-footer">
                            <span class="filament-card-price">${formatKes(p.price_kes)}</span>
                            <span class="stock-badge ${p.stock_quantity > 0 ? 'in-stock' : 'out-of-stock'}">
                                ${p.stock_quantity > 0 ? 'In Stock' : 'Out of Stock'}
                            </span>
                        </div>
                    </div>
                </article>
            `;
        }).join('');

        grid.querySelectorAll('.filament-card').forEach((card) => {
            const id = card.dataset.id;
            const open = () => openDetail(id);
            bindDeliberateTap(card, open);
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    open();
                }
            });
        });
    }

    function openDetail(id) {
        const product = allFilaments.find((p) => p.id === id);
        if (!product) return;
        selectedFilament = product;

        document.getElementById('filamentDetailName').textContent = product.name;
        document.getElementById('filamentDetailPrice').textContent = formatKes(product.price_kes);
        document.getElementById('filamentDetailDescription').textContent =
            product.description || '3D printer filament spool.';

        const rows = [
            ['Material', product.filament_material],
            ['Diameter', product.filament_diameter_mm ? product.filament_diameter_mm + ' mm' : null],
            ['Colour', product.filament_colour],
            ['Spool weight', formatSpoolWeight(product.filament_spool_weight_g)],
            ['Brand', product.manufacturer],
            ['SKU', product.sku],
            ['Location', product.location],
            ['Stock', product.stock_quantity]
        ].filter(([, v]) => v !== null && v !== undefined && v !== '');

        const tbody = document.querySelector('#filamentDetailSpecs tbody');
        tbody.innerHTML = rows.map(([label, value]) => `
            <tr>
                <th scope="row">${escapeHtml(label)}</th>
                <td>${escapeHtml(String(value))}</td>
            </tr>
        `).join('');

        const modal = document.getElementById('filamentDetailModal');
        modal.hidden = false;
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';

        if (window.backendIntegration && typeof window.backendIntegration.trackProductView === 'function') {
            window.backendIntegration.trackProductView(product.id, product.name);
        }
    }

    function closeDetail() {
        const modal = document.getElementById('filamentDetailModal');
        modal.classList.remove('active');
        modal.hidden = true;
        document.body.style.overflow = '';
        selectedFilament = null;
    }

    function addSelectedToCart() {
        if (!selectedFilament) return;
        if (!selectedFilament.stock_quantity || selectedFilament.stock_quantity < 1) {
            alert('This filament is currently out of stock.');
            return;
        }

        let cart = [];
        try {
            cart = JSON.parse(localStorage.getItem('cart') || '[]');
        } catch (_) {
            cart = [];
        }

        const existing = cart.find((item) => item.id === selectedFilament.id);
        if (existing) {
            existing.quantity = (existing.quantity || 1) + 1;
        } else {
            cart.push({
                id: selectedFilament.id,
                name: selectedFilament.name,
                price: Number(selectedFilament.price_kes),
                quantity: 1,
                image: getImageUrl(selectedFilament.primary_image_path),
                product_kind: 'filament',
                filament_material: selectedFilament.filament_material,
                filament_colour: selectedFilament.filament_colour
            });
        }

        localStorage.setItem('cart', JSON.stringify(cart));
        updateCartCount();

        if (window.backendIntegration && typeof window.backendIntegration.trackAddToCart === 'function') {
            window.backendIntegration.trackAddToCart(selectedFilament.id, selectedFilament.name, 1);
        }

        alert('Added to cart: ' + selectedFilament.name);
        closeDetail();
    }

    async function loadFilaments() {
        const countEl = document.getElementById('filamentResultCount');

        try {
            if (window.backendIntegration && typeof window.backendIntegration.waitForInit === 'function') {
                await window.backendIntegration.waitForInit();
            }

            if (typeof initSupabase === 'function' && typeof isConfigured === 'function' && isConfigured()) {
                supabaseClient = initSupabase();
            }

            if (!window.backendIntegration || !window.backendIntegration.isEnabled()) {
                allFilaments = [];
                filteredFilaments = [];
                renderGrid();
                return;
            }

            const result = await window.backendIntegration.getProducts({ product_kind: 'filament' });
            if (!result.success) {
                console.warn('[Filaments] Fetch failed:', result.error);
                allFilaments = [];
            } else {
                allFilaments = (result.products || []).filter(
                    (p) => p.product_kind === 'filament' || (p.category || '').toLowerCase() === 'filament'
                );
            }

            filteredFilaments = allFilaments.slice();
            populateDynamicFilters(allFilaments);
            renderGrid();
        } catch (err) {
            console.error('[Filaments] Load error:', err);
            countEl.textContent = 'Could not load filaments';
            allFilaments = [];
            filteredFilaments = [];
            renderGrid();
        }
    }

    function initFilters() {
        [
            'filterMaterial',
            'filterDiameter',
            'filterColour',
            'filterSpool',
            'filterBrand'
        ].forEach((id) => {
            document.getElementById(id).addEventListener('change', applyFilters);
        });
        document.getElementById('filterPriceMin').addEventListener('input', applyFilters);
        document.getElementById('filterPriceMax').addEventListener('input', applyFilters);

        const clearBtn = document.getElementById('clearFilamentFilters');
        bindDeliberateTap(clearBtn, clearFilters);

        const closeBtn = document.getElementById('closeFilamentModal');
        bindDeliberateTap(closeBtn, closeDetail);

        const addBtn = document.getElementById('filamentAddToCart');
        bindDeliberateTap(addBtn, addSelectedToCart);

        const modal = document.getElementById('filamentDetailModal');
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeDetail();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('active')) {
                closeDetail();
            }
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        updateCartCount();
        initFilters();
        loadFilaments();
    });
})();
