# 3D Model Setup Guide

## Database Changes Required

### Run This SQL in Supabase
Execute the following migration to add iOS AR support:

```sql
-- Add iOS AR model path column
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS model_ios_path TEXT;

COMMENT ON COLUMN products.model_path IS 'Path to 3D model file (.glb/.gltf) in Supabase storage (products-3d bucket)';
COMMENT ON COLUMN products.model_ios_path IS 'Optional: Path to iOS USDZ model for AR "View in Your Space" feature';
COMMENT ON COLUMN products.has_3d_model IS 'Set to TRUE when product has a 3D model available for interactive viewing';
```

**Or** run the pre-made migration file:
```bash
# In Supabase SQL Editor, run:
supabase/migrations/20240201000000_3d_model_enhancements.sql
```

### Create Storage Bucket
Create a new Supabase storage bucket for 3D models:

1. Go to **Storage** in Supabase Dashboard
2. Create new bucket: `products-3d`
3. Set it to **Public** (or configure RLS as needed)
4. Allowed file types: `.glb`, `.gltf`, `.usdz`
5. Max file size: **10 MB** (recommended)

**Storage Bucket Policies:**
```sql
-- Allow public read access to 3D models
CREATE POLICY "Public read access for 3D models"
ON storage.objects FOR SELECT
USING (bucket_id = 'products-3d');

-- Allow authenticated users to upload 3D models
CREATE POLICY "Authenticated users can upload 3D models"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'products-3d' AND 
  auth.role() = 'authenticated'
);
```

## Schema Overview

The `products` table now has these 3D-related columns:

| Column | Type | Description |
|--------|------|-------------|
| `has_3d_model` | BOOLEAN | Set to `TRUE` when a 3D model is available |
| `model_path` | TEXT | Path to `.glb` or `.gltf` file in `products-3d` bucket |
| `model_ios_path` | TEXT | Optional: Path to `.usdz` file for iOS AR support |

## How to Add 3D Models

### Option 1: Admin Dashboard (Recommended)
1. Go to **Admin → Products**
2. Click **Edit** on a product (or **Add Product**)
3. Check **"Has 3D Model"** checkbox
4. Upload GLB/GLTF file in the **"3D Model"** field
5. (Optional) Upload USDZ file for iOS AR
6. Save

The admin will:
- Upload files to Supabase Storage `products-3d` bucket
- Set `has_3d_model = TRUE`
- Store paths in `model_path` and `model_ios_path`

### Option 2: Direct SQL (For Bulk Updates)
```sql
UPDATE products 
SET 
  has_3d_model = TRUE,
  model_path = 'product_id/model.glb',
  model_ios_path = 'product_id/model.usdz'
WHERE id = 'your-product-uuid';
```

## Creating 3D Models

### Phone Scanning Apps (Easiest)
- **Polycam** (iOS/Android): Free scans, exports GLB
- **Luma AI**: AI-powered, high quality
- **RealityScan** (iOS): Photogrammetry by Epic Games
- **3D Scanner App** (Android): Multiple export formats

### AI Image-to-3D Tools
- **Luma Labs Genie**: Image → 3D in minutes
- **Meshy.ai**: Fast AI 3D generation
- **CSM.ai**: Text/image to 3D model
- **Rodin**: High-quality AI 3D models

### 3D Modeling Software (Advanced)
- **Blender** (Free): Professional 3D modeling
- **TinkerCAD** (Free): Simple CAD for mechanical parts
- **Fusion 360** (Free for hobbyists): Parametric CAD

### GLB vs USDZ
- **GLB/GLTF**: Universal 3D format, works on all platforms
- **USDZ**: Apple's AR format, required for "View in Your Space" on iOS
- Upload GLB for web viewing, USDZ for iOS AR (optional but recommended)

### File Size Guidelines
- **Target**: 2-5 MB per model
- **Maximum**: 10 MB (admin validates)
- **Optimization**: Use tools like gltf-pipeline or Blender to reduce file size
- **Tip**: Fewer polygons = faster loading, lower poly count for car parts is fine

## Testing 3D Models

### Test on Storefront
1. Products with `has_3d_model = TRUE` will show a 3D icon
2. Click to open the product modal
3. The 3D model will load and be rotatable
4. On iPhone/iPad: "View in Your Space" button appears if USDZ provided

### Test with Sample Models
Free sample GLB files for testing:
- https://github.com/KhronosGroup/glTF-Sample-Models
- Download a simple model like "Box" or "Duck"
- Upload via admin to test the system

## Troubleshooting

### Model Won't Load
- Check file size (< 10 MB)
- Verify file format (.glb or .gltf)
- Check Supabase Storage bucket is public
- Verify `model_path` column has correct path

### AR Not Working on iPhone
- iOS AR requires USDZ format (upload via `model_ios_path`)
- GLB files won't trigger AR mode on iOS
- Convert GLB → USDZ using Reality Converter (macOS app)

### Admin Upload Fails
- Check file picker accepts `.glb`, `.gltf`, `.usdz`
- Verify Supabase storage permissions
- Check file size under 10 MB
- Ensure authenticated user has upload policy

## Examples

### Product with 3D Model
```json
{
  "id": "uuid",
  "name": "Brake Disc",
  "has_3d_model": true,
  "model_path": "uuid/brake-disc.glb",
  "model_ios_path": "uuid/brake-disc.usdz"
}
```

### Product without 3D Model (Falls Back to Image)
```json
{
  "id": "uuid",
  "name": "Engine Oil",
  "has_3d_model": false,
  "model_path": null,
  "model_ios_path": null,
  "primary_image_path": "uuid/engine-oil.jpg"
}
```

## Next Steps
1. Run the SQL migration above
2. Create the `products-3d` storage bucket
3. Test upload with a sample GLB file
4. Scan/create models for key products (brake parts, filters, etc.)
5. Enable AR for iPhone customers with USDZ files (optional but recommended)
