-- 3D Model Enhancements for AR Support
-- Adds iOS-specific USDZ model path for AR "View in Your Space" feature

-- Add iOS AR model path column
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS model_ios_path TEXT;

COMMENT ON COLUMN products.model_path IS 'Path to 3D model file (.glb/.gltf) in Supabase storage (products-3d bucket)';
COMMENT ON COLUMN products.model_ios_path IS 'Optional: Path to iOS USDZ model for AR "View in Your Space" feature';
COMMENT ON COLUMN products.has_3d_model IS 'Set to TRUE when product has a 3D model available for interactive viewing';

-- Note: The products table already has:
-- - has_3d_model BOOLEAN DEFAULT FALSE
-- - model_path TEXT (for GLB/GLTF files)
-- 
-- This migration adds:
-- - model_ios_path TEXT (for USDZ files for iOS AR)
