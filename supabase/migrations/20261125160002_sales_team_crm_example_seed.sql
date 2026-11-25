-- ============================================================
-- EXAMPLE SEED ONLY — clearly labelled, safe for production
-- ============================================================
-- This migration inserts configurable default commission rules only.
-- It does NOT create fake salespeople, customers, or orders.
--
-- To create a real sales rep after Auth invite:
--   1) Set user_profiles.role = 'sales_rep' (or 'chief_of_sales')
--   2) SELECT ensure_sales_rep_profile('<user_uuid>', 'Display Name', 'DALMUS01');
--
-- Referral links look like: /?ref=DALMUS01  or  /checkout.html?ref=DALMUS01
-- ============================================================

-- Default commission (used when no category/product override matches)
INSERT INTO public.commission_rules (scope, category, product_id, rate_percent, is_active, label)
SELECT 'default', NULL, NULL, 5.00, TRUE, 'EXAMPLE SEED: default 5%'
WHERE NOT EXISTS (
  SELECT 1 FROM public.commission_rules WHERE scope = 'default' AND is_active
);

-- Category overrides (EXAMPLE SEED — adjust in Admin → Commission Rules)
INSERT INTO public.commission_rules (scope, category, product_id, rate_percent, is_active, label)
SELECT 'category', 'Filters', NULL, 7.00, TRUE, 'EXAMPLE SEED: Filters 7%'
WHERE NOT EXISTS (
  SELECT 1 FROM public.commission_rules
  WHERE scope = 'category' AND lower(category) = 'filters' AND is_active
);

INSERT INTO public.commission_rules (scope, category, product_id, rate_percent, is_active, label)
SELECT 'category', 'Engine', NULL, 6.00, TRUE, 'EXAMPLE SEED: Engine 6%'
WHERE NOT EXISTS (
  SELECT 1 FROM public.commission_rules
  WHERE scope = 'category' AND lower(category) = 'engine' AND is_active
);

INSERT INTO public.commission_rules (scope, category, product_id, rate_percent, is_active, label)
SELECT 'category', 'Body', NULL, 4.00, TRUE, 'EXAMPLE SEED: Body 4%'
WHERE NOT EXISTS (
  SELECT 1 FROM public.commission_rules
  WHERE scope = 'category' AND lower(category) = 'body' AND is_active
);

-- Product override EXAMPLE: Spark-plug set → 8% (if product exists)
INSERT INTO public.commission_rules (scope, category, product_id, rate_percent, is_active, label)
SELECT 'product', NULL, p.id, 8.00, TRUE, 'EXAMPLE SEED: Spark-plug set 8%'
FROM public.products p
WHERE lower(p.name) LIKE '%spark-plug%'
  AND NOT EXISTS (
    SELECT 1 FROM public.commission_rules r
    WHERE r.scope = 'product' AND r.product_id = p.id AND r.is_active
  )
LIMIT 1;

COMMENT ON TABLE public.commission_rules IS
  'Configurable commission %: product overrides category overrides default. Rows labelled EXAMPLE SEED were inserted by 20261125160100_sales_team_crm_example_seed.sql';
