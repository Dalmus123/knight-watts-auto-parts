-- Finance module — entities, consolidation groups, settings
-- Seeds codes/types only: PARENT, SHOP, ELIM, GROUP. No legal names, PINs, or money.

CREATE TABLE IF NOT EXISTS public.fin_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  legal_name text NOT NULL DEFAULT 'Legal name (enter in Settings)',
  trading_name text,
  kra_pin text,
  entity_type public.fin_entity_type NOT NULL,
  parent_entity_id uuid REFERENCES public.fin_entities(id),
  ownership_pct numeric(7,4) NOT NULL DEFAULT 100,
  base_currency text NOT NULL DEFAULT 'KES',
  fy_start_month smallint NOT NULL DEFAULT 1
    CHECK (fy_start_month BETWEEN 1 AND 12),
  is_active boolean NOT NULL DEFAULT true,
  is_reporting_entity boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fin_entities_code_unique UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS public.fin_consolidation_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  parent_entity_id uuid REFERENCES public.fin_entities(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fin_consolidation_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.fin_consolidation_groups(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES public.fin_entities(id),
  method public.fin_consol_method NOT NULL DEFAULT 'cost',
  ownership_pct numeric(7,4) NOT NULL DEFAULT 100,
  UNIQUE (group_id, entity_id)
);

CREATE TABLE IF NOT EXISTS public.fin_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  parent_entity_id uuid REFERENCES public.fin_entities(id),
  shop_entity_id uuid REFERENCES public.fin_entities(id),
  default_group_id uuid REFERENCES public.fin_consolidation_groups(id),
  advisor_enabled boolean NOT NULL DEFAULT false,
  ceo_can_view_payslips boolean NOT NULL DEFAULT true,
  inventory_method text NOT NULL DEFAULT 'FIFO',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fin_entity_settings (
  entity_id uuid PRIMARY KEY REFERENCES public.fin_entities(id) ON DELETE CASCADE,
  vat_registered boolean NOT NULL DEFAULT false,
  vat_number text,
  lock_date date,
  stock_decrement_on text DEFAULT 'completed',
  auto_post_orders boolean NOT NULL DEFAULT true,
  machine_rate_per_hour numeric(14,2),
  ratio_thresholds jsonb NOT NULL DEFAULT '{}'::jsonb,
  letterhead_path text,
  legal_name_override text,
  kra_pin text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed entities (codes and types only; placeholder legal names)
INSERT INTO public.fin_entities (code, legal_name, trading_name, entity_type, ownership_pct, is_reporting_entity)
VALUES
  ('PARENT', 'Legal name (enter in Settings)', 'Parent', 'parent', 100, true),
  ('SHOP', 'Legal name (enter in Settings)', 'Shop', 'subsidiary', 100, true),
  ('ELIM', 'Elimination book (not a legal entity)', 'Eliminations', 'elimination', 100, false)
ON CONFLICT (code) DO NOTHING;

UPDATE public.fin_entities e
SET parent_entity_id = p.id,
    ownership_pct = 100
FROM public.fin_entities p
WHERE e.code = 'SHOP' AND p.code = 'PARENT' AND e.parent_entity_id IS NULL;

INSERT INTO public.fin_consolidation_groups (code, name, parent_entity_id)
SELECT 'GROUP', 'Group', e.id
FROM public.fin_entities e
WHERE e.code = 'PARENT'
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.fin_consolidation_members (group_id, entity_id, method, ownership_pct)
SELECT g.id, e.id, 'cost', 100
FROM public.fin_consolidation_groups g
CROSS JOIN public.fin_entities e
WHERE g.code = 'GROUP' AND e.code IN ('PARENT', 'SHOP')
ON CONFLICT (group_id, entity_id) DO NOTHING;

INSERT INTO public.fin_settings (id, parent_entity_id, shop_entity_id, default_group_id, advisor_enabled, ceo_can_view_payslips, inventory_method)
SELECT
  1,
  (SELECT id FROM public.fin_entities WHERE code = 'PARENT'),
  (SELECT id FROM public.fin_entities WHERE code = 'SHOP'),
  (SELECT id FROM public.fin_consolidation_groups WHERE code = 'GROUP'),
  false,
  true,
  'FIFO'
ON CONFLICT (id) DO UPDATE SET
  parent_entity_id = EXCLUDED.parent_entity_id,
  shop_entity_id = EXCLUDED.shop_entity_id,
  default_group_id = EXCLUDED.default_group_id;

INSERT INTO public.fin_entity_settings (entity_id, vat_registered, stock_decrement_on, auto_post_orders)
SELECT e.id, false, 'completed', true
FROM public.fin_entities e
WHERE e.code IN ('PARENT', 'SHOP', 'ELIM')
ON CONFLICT (entity_id) DO NOTHING;
