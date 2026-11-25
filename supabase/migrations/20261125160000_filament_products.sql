-- Filament product line for Knight Watts Auto Parts
-- Extends products with filament-specific specs (material, diameter, colour, spool weight).
-- Brand reuses existing manufacturer column. No seed/sample inventory rows.

-- Product kind: auto parts (default) vs filament consumables
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS product_kind TEXT NOT NULL DEFAULT 'auto_part';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_product_kind_check'
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT products_product_kind_check
      CHECK (product_kind IN ('auto_part', 'filament'));
  END IF;
END $$;

-- Filament specs (nullable for auto_part rows; validated in admin UI for filaments)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS filament_material TEXT;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS filament_diameter_mm NUMERIC(4,2);

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS filament_colour TEXT;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS filament_spool_weight_g INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_filament_diameter_check'
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT products_filament_diameter_check
      CHECK (
        filament_diameter_mm IS NULL
        OR filament_diameter_mm IN (1.75, 2.85)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_filament_spool_weight_check'
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT products_filament_spool_weight_check
      CHECK (
        filament_spool_weight_g IS NULL
        OR filament_spool_weight_g > 0
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_filament_material_check'
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT products_filament_material_check
      CHECK (
        filament_material IS NULL
        OR filament_material IN ('PLA', 'PETG', 'ABS', 'TPU', 'ASA', 'Other')
      );
  END IF;
END $$;

-- When kind is filament, require core filament fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_filament_fields_required'
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT products_filament_fields_required
      CHECK (
        product_kind <> 'filament'
        OR (
          filament_material IS NOT NULL
          AND filament_diameter_mm IS NOT NULL
          AND filament_colour IS NOT NULL
          AND filament_spool_weight_g IS NOT NULL
        )
      );
  END IF;
END $$;

COMMENT ON COLUMN products.product_kind IS 'auto_part (default) or filament consumable for 3D printing';
COMMENT ON COLUMN products.filament_material IS 'Filament material: PLA, PETG, ABS, TPU, ASA, Other';
COMMENT ON COLUMN products.filament_diameter_mm IS 'Filament diameter in mm: 1.75 or 2.85';
COMMENT ON COLUMN products.filament_colour IS 'Filament colour / finish name';
COMMENT ON COLUMN products.filament_spool_weight_g IS 'Spool net weight in grams (e.g. 1000 for 1 kg)';

CREATE INDEX IF NOT EXISTS idx_products_product_kind ON products(product_kind);
CREATE INDEX IF NOT EXISTS idx_products_filament_material ON products(filament_material) WHERE product_kind = 'filament';
CREATE INDEX IF NOT EXISTS idx_products_filament_diameter ON products(filament_diameter_mm) WHERE product_kind = 'filament';
CREATE INDEX IF NOT EXISTS idx_products_filament_colour ON products(filament_colour) WHERE product_kind = 'filament';
CREATE INDEX IF NOT EXISTS idx_products_filament_spool ON products(filament_spool_weight_g) WHERE product_kind = 'filament';

-- RLS: products already has public_read (is_active) and owner_admin_manage.
-- No policy changes required — new columns inherit the same row policies.
-- Staff (owner/admin) continue to manage via existing FOR ALL policy.
