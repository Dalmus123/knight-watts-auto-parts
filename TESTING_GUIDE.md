# Testing Guide - 3D Models & PWA Features

## Prerequisites

### 1. Run Database Migration
Execute the SQL migration in Supabase Dashboard:
```bash
# Copy contents of:
supabase/migrations/20240201000000_3d_model_enhancements.sql

# Paste into Supabase SQL Editor and run
```

### 2. Create Storage Bucket
1. Go to **Storage** in Supabase Dashboard
2. Create new bucket: `products-3d`
3. Set to **Public**
4. Configure policies (see `3D_MODEL_SETUP.md`)

### 3. Get a Sample 3D Model
Download a test GLB file:
- **Option 1**: [glTF Sample Models](https://github.com/KhronosGroup/glTF-Sample-Models/tree/master/2.0)
  - Try: `Box/glTF-Binary/Box.glb` (simple, small)
  - Or: `DamagedHelmet/glTF-Binary/DamagedHelmet.glb` (more complex)
- **Option 2**: Use a 3D scanning app on your phone (Polycam, Luma AI)
- **Option 3**: Create with Blender, export as GLB

---

## Test 1: Admin - Upload 3D Model

### Steps
1. **Login to Admin**
   - Go to `/admin/`
   - Login with admin credentials

2. **Edit a Product**
   - Navigate to **Products** page
   - Click **Edit** on "Engine oil filter" (or any product)
   
3. **Enable 3D Model**
   - Check ✓ **"Has 3D Model"** checkbox
   - Notice the 3D model upload section appears
   
4. **Upload GLB File**
   - Click **"3D Model (.glb / .gltf)"** file picker
   - Select your test GLB file
   - Verify:
     - ✓ File name appears with size
     - ✓ Shows green checkmark if < 5 MB
     - ⚠️ Shows warning if 5-10 MB
     - ❌ Shows error if > 10 MB
   
5. **Save Product**
   - Click **"Update Product"**
   - Watch progress: "Saving..." → "Uploading 3D model..." → Success
   
6. **Verify Upload**
   - Check Supabase Storage → `products-3d` bucket
   - Should see: `{product-id}/model-{timestamp}.glb`

### Expected Results
- ✅ File uploads successfully
- ✅ Product shows `has_3d_model = TRUE` in database
- ✅ `model_path` column contains storage path
- ✅ No errors in console

### Troubleshooting
- **"Bucket not found"**: Create `products-3d` bucket (see Prerequisites)
- **Upload fails**: Check storage policies (public upload for authenticated users)
- **Size error**: Use smaller model (< 10 MB)

---

## Test 2: Storefront - View 3D Model

### Steps
1. **Open Storefront**
   - Go to `/` (main page)
   - No login required

2. **Find the Product**
   - Locate the product you uploaded a 3D model to
   - Should still show 3D icon badge

3. **Open Product Modal**
   - Click on the product card
   - Modal opens

4. **Interact with 3D Model**
   - Model should load automatically
   - Try these interactions:
     - **Drag**: Rotate the model
     - **Pinch/Scroll**: Zoom in/out
     - **Wait**: Model auto-rotates
   
5. **Check AR Button (iOS only)**
   - On iPhone/iPad with iOS 12+
   - If USDZ file uploaded, "View in Your Space" button appears
   - Click to launch AR mode

### Expected Results
- ✅ Model loads and renders correctly
- ✅ Drag to rotate works
- ✅ Zoom works
- ✅ Auto-rotate is smooth
- ✅ AR button appears (if USDZ provided, iOS only)

### Fallback Tests
**If product has no 3D model:**
- ✅ Falls back to image display (if image exists)
- ✅ Falls back to Three.js placeholder (if no image)

**If 3D model fails to load:**
- ✅ Gracefully falls back to image/placeholder
- ✅ Error logged to console (for debugging)

---

## Test 3: PWA Installation (iPhone)

### Steps - Shop App
1. **Open in Safari on iPhone**
   - Visit: `https://dalmus123.github.io/knight-watts-auto-parts/`
   
2. **Install to Home Screen**
   - Tap Share button (bottom center)
   - Scroll down, tap **"Add to Home Screen"**
   - Tap **"Add"**

3. **Launch Installed App**
   - Find "Knight Watts" icon on home screen
   - Tap to open
   - Should open **without Safari UI** (no address bar)

4. **Test Features**
   - Browse products
   - Open 3D viewer (should work)
   - Add to cart
   - Navigate sections

### Steps - Admin App
1. **Open Admin in Safari**
   - Visit: `/admin/`
   - Login

2. **Install to Home Screen**
   - Tap Share → **"Add to Home Screen"**
   - Shows "KW Admin" with dark theme
   - Tap **"Add"**

3. **Launch Admin App**
   - Open from home screen
   - Standalone mode (no browser UI)
   - Dark JARVIS theme visible

4. **Test Admin Features**
   - Upload product images (Files/Photos picker should work)
   - Upload 3D models (should work)
   - Navigate pages
   - Everything should work as normal web app

### Expected Results
- ✅ Apps install to home screen
- ✅ Launch without browser UI
- ✅ Correct theme colors (light for shop, dark for admin)
- ✅ File uploads work from iPhone
- ✅ Can return to app seamlessly

---

## Test 4: Service Worker & Offline

### Steps
1. **Load Page Online**
   - Visit storefront or admin
   - Let it fully load

2. **Go Offline**
   - Enable Airplane Mode on iPhone
   - Or disable network in DevTools (desktop)

3. **Reload Page**
   - Refresh the page
   - Should load from cache (offline)

4. **Test API Calls**
   - Try to load products
   - Should NOT show stale cached data
   - Shows loading or error (correct behavior)

5. **Go Back Online**
   - Re-enable network
   - Refresh page
   - Fresh data loads

### Expected Results
- ✅ Static UI loads offline (HTML/CSS/JS)
- ✅ Products do NOT load from stale cache
- ✅ Fresh API calls made when online
- ✅ No corrupted data from cache
- ⚠️ Supabase storage never cached (fresh 3D models)

---

## Test 5: Stock/Location Display Bug

### Test Scenario
From the reported issue: "Engine oil filter shows 'Out of Stock' in 'Embu' but data says stock 5, Garissa"

### Steps
1. **Check Product Data**
   ```sql
   SELECT name, location, stock_quantity, low_stock_threshold 
   FROM products 
   WHERE name LIKE '%Engine oil filter%';
   ```
   Expected: `location = 'Garissa'`, `stock_quantity = 5`

2. **View with No Filter**
   - Go to storefront
   - Don't select a location filter
   - Open product modal
   - Should show: "Embu & Garissa" or "Garissa" location

3. **View with Embu Filter**
   - Click location selector
   - Choose **"Embu"**
   - Open same product
   - Should show: "Out of Stock" (correct - product is in Garissa!)

4. **View with Garissa Filter**
   - Select **"Garissa"** location
   - Open product
   - Should show: "In Stock (5)" (correct!)

### Expected Results
- ✅ No location filter: Shows actual product location(s)
- ✅ Embu filter + Garissa product: Correctly shows "Out of Stock"
- ✅ Garissa filter + Garissa product: Shows "In Stock (5)"
- ✅ This is **NOT a bug** - it's working correctly!

See `STOCK_LOCATION_INVESTIGATION.md` for full explanation.

---

## Test 6: File Upload from iPhone (Critical)

### Admin Upload Test
1. **Install Admin PWA** (see Test 3)
2. **Login**
3. **Edit Product**
4. **Upload Image**
   - Click image file picker
   - Should show **Files** and **Photos** options
   - Select image
   - ✅ Should upload successfully

5. **Upload 3D Model**
   - Check "Has 3D Model"
   - Click 3D model file picker
   - Should show **Files** option
   - If you have GLB in Files, select it
   - ✅ Should upload successfully

### Expected Results
- ✅ File picker opens correctly on iPhone
- ✅ Can select from Photos (images)
- ✅ Can select from Files (GLB, images)
- ✅ Uploads work via PWA (not blocked)
- ✅ No "File not supported" errors

---

## Quick Verification Checklist

Before approving PR, verify:

### 3D Model Features
- [ ] Admin form shows 3D model upload section
- [ ] GLB/GLTF files upload to `products-3d` bucket
- [ ] USDZ files upload (optional iOS AR)
- [ ] Storefront loads and displays GLB models
- [ ] model-viewer renders correctly
- [ ] Drag, zoom, auto-rotate work
- [ ] AR button appears on iOS with USDZ
- [ ] Fallback to image/placeholder if no model

### PWA Features
- [ ] Shop manifest at `/manifest.json`
- [ ] Admin manifest at `/admin/manifest.json`
- [ ] Both have correct theme colors
- [ ] iPhone can install both apps
- [ ] Apps launch standalone (no Safari UI)
- [ ] File uploads work in PWA mode
- [ ] Service worker caches static files
- [ ] Service worker NEVER caches Supabase API

### Location Display
- [ ] Understand it's NOT a bug
- [ ] Location filter working correctly
- [ ] Stock shows for correct location

---

## Sample 3D Models for Testing

### Free GLB Files
1. **Simple Box** (7 KB)
   - https://github.com/KhronosGroup/glTF-Sample-Models/tree/master/2.0/Box/glTF-Binary

2. **Damaged Helmet** (3.5 MB)
   - https://github.com/KhronosGroup/glTF-Sample-Models/tree/master/2.0/DamagedHelmet/glTF-Binary

3. **Duck** (200 KB)
   - https://github.com/KhronosGroup/glTF-Sample-Models/tree/master/2.0/Duck/glTF-Binary

### Car Parts (if you can find)
Search "free car parts 3D models GLB" or scan real parts with phone apps.

---

## Troubleshooting

### 3D Model Won't Load
- Check file is GLB or GLTF (not OBJ, FBX, etc.)
- Check file size < 10 MB
- Check `products-3d` bucket exists and is public
- Check browser console for errors
- Try a different sample model

### PWA Won't Install (iPhone)
- Must use **Safari** (not Chrome/Firefox on iOS)
- iOS 11.3+ required
- Check manifest URL is correct
- Check all icons exist
- Try clearing Safari cache

### File Upload Fails
- Check Supabase storage policies
- Check user is authenticated
- Check file type is allowed
- Check network connection
- Try smaller file

### Service Worker Issues
- Clear site data in browser settings
- Hard refresh (Cmd/Ctrl + Shift + R)
- Check DevTools → Application → Service Workers
- Unregister old service worker
- Re-register by refreshing page

---

## Success Criteria

All features working:
- ✅ 3D models upload via admin
- ✅ 3D models display on storefront with model-viewer
- ✅ AR works on iOS (with USDZ)
- ✅ PWA installs on iPhone home screen
- ✅ File uploads work in PWA mode
- ✅ Service worker caches safely (no stale data)
- ✅ Location filter display explained (not a bug)

If all tests pass → **Ready to deploy!** 🚀
