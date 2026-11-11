# Mobile Admin Testing Checklist
**iPhone 13 WebKit Testing - PR #[TBD]**

## Critical Fixes Applied

### 1. **Scrolling Issue** ✅ FIXED
- **Problem**: Page couldn't scroll on mobile, white band at bottom
- **Root Cause**: `.admin-panel` had `overflow: hidden` and `height: 100vh` preventing scroll
- **Fix Applied**: 
  - Removed `overflow: hidden` on mobile (changed to `overflow: visible`)
  - Changed layout to `flex-direction: column`
  - Removed fixed height constraints
  - Made `.content-area` scrollable with proper viewport handling
- **Test**: 
  - [ ] Can scroll through product list smoothly
  - [ ] No white band at bottom when scrolled to end
  - [ ] Page responds to touch scroll gestures
  - [ ] Content doesn't get clipped

### 2. **Hamburger Menu Overlap** ✅ FIXED
- **Problem**: Hamburger button overlapped search bar
- **Root Cause**: No spacing between fixed hamburger and search bar
- **Fix Applied**: Added `margin-top: 72px` to `.search-filter-bar` on mobile
- **Test**: 
  - [ ] Hamburger button doesn't overlap search input
  - [ ] Search bar is fully accessible and tappable
  - [ ] Both elements remain visible and usable

### 3. **Add Product Button** ✅ FIXED
- **Problem**: Tapping "ADD PRODUCT" did nothing on real device
- **Root Cause**: Click event not firing reliably on mobile, possible overlay blocking
- **Fixes Applied**: 
  - Added both `click` and `touchend` event listeners
  - Added `preventDefault()` and `stopPropagation()`
  - Fixed mobile overlay to use `pointer-events: none` when inactive
  - Ensured event listeners attach after DOM is ready
- **Test**: 
  - [ ] Tap "ADD PRODUCT" button opens the modal
  - [ ] Modal appears with all form fields visible
  - [ ] Form is scrollable if needed
  - [ ] Can close modal with Cancel button

### 4. **Product Search** ✅ FIXED
- **Problem**: Search input was inactive, couldn't type or filter
- **Root Cause**: No event listener attached to search input
- **Fix Applied**: 
  - Added `filterProducts()` function
  - Attached `input` event listener to `#productSearch`
  - Filters by name, category, location, SKU, manufacturer
- **Test**: 
  - [ ] Can type in search box
  - [ ] Product cards filter as you type
  - [ ] Clear search shows all products again
  - [ ] Search is case-insensitive

### 5. **Mobile Overlay Blocking** ✅ FIXED
- **Problem**: Overlay might be blocking touch events even when hidden
- **Fix Applied**: Set `pointer-events: none` by default, `pointer-events: all` only when `.active`
- **Test**: 
  - [ ] Can tap buttons and cards when menu is closed
  - [ ] Overlay blocks taps when menu is open
  - [ ] Closing menu via overlay tap works
  - [ ] No invisible barriers blocking interaction

### 6. **Service Worker Cache** ✅ UPDATED
- **Problem**: Browser might serve stale JS/CSS
- **Fix Applied**: 
  - Bumped cache version from `v1.0.9` to `v1.1.0`
  - Added cache-busting query strings to admin.js, admin.css, etc. (`?v=1.1.0`)
- **Test**: 
  - [ ] Hard refresh loads new code (Cmd+Shift+R or Settings > Clear Cache)
  - [ ] Update notification appears if needed
  - [ ] After reload, all fixes are active

---

## Full Functional Audit

### A. Dashboard Section
- [ ] Navigate to Dashboard
- [ ] Stats cards display correctly
- [ ] All numbers load and update
- [ ] Cards are touch-scrollable if many
- [ ] Refresh button works

### B. Products Section
- [ ] Navigate to Products  
- [ ] **Search**: Type "filter" - products filter in real-time
- [ ] **Add Product**: 
  - [ ] Tap "ADD PRODUCT" button - modal opens
  - [ ] Fill in: Name, SKU, Price, Stock
  - [ ] Select Category dropdown works
  - [ ] Select Manufacturer dropdown works
  - [ ] **3D File Upload**:
    - [ ] Tap "Choose 3D Model" file input
    - [ ] Select a `.glb` or `.usdz` file from phone
    - [ ] File name appears
    - [ ] Save button enabled
  - [ ] Tap Save - product created
  - [ ] New product appears in list
- [ ] **Edit Product**:
  - [ ] Tap a product card - edit modal opens
  - [ ] Form pre-filled with current values
  - [ ] Change name or price
  - [ ] **3D File Preview**: If product has 3D model, verify preview loads
  - [ ] Save changes - product updates
- [ ] **Delete Product**:
  - [ ] Edit a test product
  - [ ] Tap Delete button
  - [ ] Confirm deletion
  - [ ] Product removed from list
- [ ] **Scrolling**: Scroll through full product list - smooth, no stuck areas

### C. Orders Section
- [ ] Navigate to Orders
- [ ] Orders table/cards display
- [ ] Can view order details
- [ ] Status badges visible
- [ ] Actions (approve/reject) work if applicable

### D. Custom Requests Section
- [ ] Navigate to Custom Requests
- [ ] Requests display
- [ ] Can view request details
- [ ] Can update status if permitted
- [ ] 3D file links work if any

### E. Print Queue Section
- [ ] Navigate to Print Queue
- [ ] Print jobs display
- [ ] Can view job details
- [ ] Can update job status
- [ ] Download links work

### F. Live Telemetry Section
- [ ] Navigate to Live Telemetry
- [ ] Telemetry panel loads
- [ ] Data streams or refreshes
- [ ] Charts/graphs render
- [ ] Mobile-friendly layout

### G. Deliveries Section
- [ ] Navigate to Deliveries
- [ ] Deliveries list displays
- [ ] Can filter by status
- [ ] Details modal/page works
- [ ] Status updates work

### H. Analytics Section
- [ ] Navigate to Analytics
- [ ] Charts render correctly
- [ ] Date range picker works
- [ ] Touch-friendly controls
- [ ] Scrollable if multiple charts

### I. Reports Section
- [ ] Navigate to Reports
- [ ] Report types listed
- [ ] Can generate a report
- [ ] Download/export works
- [ ] Mobile-optimized display

### J. User Management Section (if accessible)
- [ ] Navigate to Users
- [ ] Users list displays
- [ ] Can view user details
- [ ] Can edit roles if permitted
- [ ] Actions work

---

## Storefront Testing

### Product Browsing
- [ ] Open storefront (main site)
- [ ] Page scrolls smoothly
- [ ] Product cards display correctly
- [ ] Images load

### Product Modal
- [ ] Tap a product card
- [ ] Modal opens without overlap
- [ ] **3D Viewer**: 
  - [ ] 3D model loads and displays
  - [ ] Can pinch to zoom
  - [ ] Can rotate with touch
  - [ ] "View in AR" button works (opens in AR Quick Look)
- [ ] Product details visible (price, description)
- [ ] "Add to Cart" button works
- [ ] Close modal - returns to list
- [ ] Modal doesn't block navigation

---

## Mobile-Specific Checks

### Layout & Viewport
- [ ] No horizontal scrolling (except intended carousels)
- [ ] Content respects safe areas (notch, home indicator)
- [ ] Text is readable without zooming
- [ ] Touch targets are ≥44px (easy to tap)

### Navigation
- [ ] Hamburger menu opens smoothly
- [ ] Sidebar slides in from left
- [ ] Overlay darkens background
- [ ] Tapping overlay closes menu
- [ ] Navigation items all work

### Interactions
- [ ] All buttons respond to tap (no double-tap needed)
- [ ] Forms accept keyboard input
- [ ] Dropdowns open and allow selection
- [ ] Modals can be dismissed
- [ ] No stuck scroll areas

### Performance
- [ ] Page loads in <3 seconds
- [ ] Transitions are smooth (60fps feel)
- [ ] No visible layout shifts
- [ ] Images lazy-load properly

---

## Test Environment
- **Device**: iPhone 13
- **OS**: iOS [version]
- **Browser**: Chrome iOS / Safari (installed PWA)
- **Network**: WiFi / LTE
- **Display Mode**: Standalone PWA / Browser

---

## Issues Found

| Feature | Issue | Severity |
|---------|-------|----------|
| _(example: Search)_ | _(description)_ | _(High/Med/Low)_ |

---

## Screenshots Required

Please capture and attach:
1. **Products page scrolled to bottom** (showing no white band)
2. **Add Product form open** (showing all fields)
3. **Search with filter applied** (showing filtered results)
4. **Edit Product form** (pre-filled)
5. **3D file preview or file input** (showing file selected)
6. **Storefront product modal with 3D viewer**

---

## Sign-Off

- [ ] All critical fixes verified working
- [ ] All sections audited
- [ ] No new issues introduced
- [ ] Screenshots attached to PR
- [ ] Ready for merge

**Tested by**: _________________  
**Date**: _________________  
**Notes**: 

