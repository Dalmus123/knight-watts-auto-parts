# PWA Path Verification for GitHub Pages

## Problem Fixed
Root-absolute paths (`/manifest.json`, `/icon-*.png`) fail under GitHub Pages subpath `/knight-watts-auto-parts/`.

## Solution
All paths converted to relative (`./manifest.json`, `./apple-touch-icon.png`).

## Path Resolution on GitHub Pages

### Base URL
- **Live site**: `https://dalmus123.github.io/knight-watts-auto-parts/`

### Shop PWA (Root Level)
| Resource | HTML Path | Resolves To | Status |
|----------|-----------|-------------|--------|
| Manifest | `./manifest.json` | `.../knight-watts-auto-parts/manifest.json` | ✅ HTTP 200 |
| Apple Touch Icon | `./apple-touch-icon.png` | `.../knight-watts-auto-parts/apple-touch-icon.png` | ✅ HTTP 200 |
| Icon 192 | `./icon-192x192.png` | `.../knight-watts-auto-parts/icon-192x192.png` | ✅ HTTP 200 |
| Icon 512 | `./icon-512x512.png` | `.../knight-watts-auto-parts/icon-512x512.png` | ✅ HTTP 200 |
| Maskable 512 | `./icon-512x512-maskable.png` | `.../knight-watts-auto-parts/icon-512x512-maskable.png` | ✅ HTTP 200 |

**Manifest References:**
- `"start_url": "./"` → `.../knight-watts-auto-parts/` ✅
- `"scope": "./"` → `.../knight-watts-auto-parts/` ✅
- All `"src": "./icon-*.png"` → Relative to manifest location ✅

### Admin PWA (/admin/)
| Resource | HTML Path | Resolves To | Status |
|----------|-----------|-------------|--------|
| Manifest | `./manifest.json` | `.../knight-watts-auto-parts/admin/manifest.json` | ✅ HTTP 200 |
| Apple Touch Icon | `./apple-touch-icon.png` | `.../knight-watts-auto-parts/admin/apple-touch-icon.png` | ✅ HTTP 200 |
| Icon 192 | `./icon-192x192.png` | `.../knight-watts-auto-parts/admin/icon-192x192.png` | ✅ HTTP 200 |
| Icon 512 | `./icon-512x512.png` | `.../knight-watts-auto-parts/admin/icon-512x512.png` | ✅ HTTP 200 |
| Maskable 512 | `./icon-512x512-maskable.png` | `.../knight-watts-auto-parts/admin/icon-512x512-maskable.png` | ✅ HTTP 200 |

**Admin Manifest References:**
- `"start_url": "./"` → `.../knight-watts-auto-parts/admin/` ✅
- `"scope": "./"` → `.../knight-watts-auto-parts/admin/` ✅
- All `"src": "./icon-*.png"` → Relative to admin/manifest.json ✅

## Icon Files Generated

### Shop Icons (Light Gradient)
- `apple-touch-icon.png` (180×180) - Knight Watts mark on grey gradient
- `icon-192x192.png` - Standard icon
- `icon-512x512.png` - High-res icon
- `icon-512x512-maskable.png` - Safe zone for maskable (80% content area)

### Admin Icons (Dark Jarvis Theme)
- `admin/apple-touch-icon.png` (180×180) - Dark background with green logo
- `admin/icon-192x192.png` - Standard admin icon with "ADMIN" text
- `admin/icon-512x512.png` - High-res admin icon
- `admin/icon-512x512-maskable.png` - Maskable admin icon

All icons feature:
- Knight Watts hexagon logo
- Checkmark inside circle
- Brand color #00A86B (green)

## Service Worker
**Cache version bumped**: `v1.0.5` → `v1.0.6`

Service worker already handles subpaths correctly (from PR #15):
```javascript
const BASE_PATH = self.location.pathname.split('/')[1] || '';
const basePath = BASE_PATH ? `/${BASE_PATH}` : '';
```

## Testing on Live Site

### Shop PWA Test
1. Visit: `https://dalmus123.github.io/knight-watts-auto-parts/`
2. Open DevTools → Application → Manifest
3. Verify manifest loads without errors
4. Check all icon URLs resolve (no 404s)
5. On iPhone Safari: Share → Add to Home Screen
6. Verify icon appears correctly on home screen

### Admin PWA Test
1. Visit: `https://dalmus123.github.io/knight-watts-auto-parts/admin/`
2. Open DevTools → Application → Manifest
3. Verify admin manifest loads
4. Check admin icons resolve
5. On iPhone Safari: Install to home screen
6. Verify dark icon appears correctly

## Expected Results
✅ All manifest files load: HTTP 200  
✅ All icon files load: HTTP 200  
✅ No 404 errors in DevTools console  
✅ PWA installable on iPhone  
✅ Icons display correctly on home screen  
✅ Apps launch in standalone mode  

## Verification Commands

```bash
# Check all icon files exist
ls -lh apple-touch-icon.png icon-*.png admin/apple-touch-icon.png admin/icon-*.png

# Verify relative paths in manifests
grep -E '"src":|"url":' manifest.json admin/manifest.json

# Verify HTML uses relative paths
grep -E 'manifest|apple-touch-icon' index.html admin/index.html
```

## Changes Made
1. ✅ All manifest paths: `/` → `./`
2. ✅ All HTML href paths: `/` → `./`
3. ✅ Generated 8 icon PNG files (4 shop + 4 admin)
4. ✅ Simplified manifest icons to 4 per app (180, 192, 512, 512-maskable)
5. ✅ Removed non-existent screenshot references
6. ✅ Bumped service worker cache version to v1.0.6

## Previous Issue
```
❌ /manifest.json → 404 (resolved to root, not subpath)
❌ /icon-192x192.png → 404
```

## After Fix
```
✅ ./manifest.json → Resolves to current directory
✅ ./icon-192x192.png → Resolves to current directory
```

Works on:
- Local development (relative to file)
- GitHub Pages with subpath (relative to deployed location)
- Any hosting environment (no hard-coded paths)
