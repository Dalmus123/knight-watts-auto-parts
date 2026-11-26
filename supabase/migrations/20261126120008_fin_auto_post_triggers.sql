-- Finance — auto-post from storefront/ops sources (idempotent; historical back-fill OFF)

CREATE OR REPLACE FUNCTION public._fin_shop_entity_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT shop_entity_id FROM public.fin_settings WHERE id = 1;
$$;

REVOKE ALL ON FUNCTION public._fin_shop_entity_id() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._fin_account_id(p_entity_id uuid, p_code text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.fin_accounts WHERE entity_id = p_entity_id AND code = p_code AND is_active LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public._fin_account_id(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fin_internal_stock_flag()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(current_setting('kw.fin_internal_stock', true), '') = '1';
$$;

CREATE OR REPLACE FUNCTION public._fin_auto_post_order_ar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shop uuid;
  v_entity_settings public.fin_entity_settings%ROWTYPE;
  v_total numeric(14,2);
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('confirmed', 'completed') THEN
    v_shop := public._fin_shop_entity_id();
    IF v_shop IS NULL THEN RETURN NEW; END IF;
    SELECT * INTO v_entity_settings FROM public.fin_entity_settings WHERE entity_id = v_shop;
    IF NOT COALESCE(v_entity_settings.auto_post_orders, true) THEN RETURN NEW; END IF;
    v_total := COALESCE(NEW.total_kes, 0);
    IF v_total <= 0 THEN RETURN NEW; END IF;
    PERFORM public.fin_post_entry(
      v_shop,
      CURRENT_DATE,
      'Order ' || NEW.order_number,
      jsonb_build_object(
        'source_type', 'order',
        'source_table', 'orders',
        'source_id', NEW.id,
        'doc_number', NEW.order_number,
        'doc_date', CURRENT_DATE::text,
        'counterparty', 'storefront customer',
        'amount', v_total
      ),
      jsonb_build_array(
        jsonb_build_object('account_code', '1100', 'debit', v_total),
        jsonb_build_object('account_code', '4010', 'credit', v_total)
      ),
      'posted'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fin_auto_post_order_ar ON public.orders;
CREATE TRIGGER fin_auto_post_order_ar
  AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public._fin_auto_post_order_ar();

CREATE OR REPLACE FUNCTION public._fin_auto_post_order_receipt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shop uuid;
  v_total numeric(14,2);
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;
  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status AND NEW.payment_status = 'paid' THEN
    v_shop := public._fin_shop_entity_id();
    v_total := COALESCE(NEW.total_kes, 0);
    IF v_shop IS NULL OR v_total <= 0 THEN RETURN NEW; END IF;
    PERFORM public.fin_post_entry(
      v_shop,
      CURRENT_DATE,
      'Receipt for order ' || NEW.order_number,
      jsonb_build_object(
        'source_type', 'receipt',
        'source_table', 'orders',
        'source_id', NEW.id,
        'doc_number', COALESCE(NEW.payment_reference, NEW.order_number),
        'amount', v_total
      ),
      jsonb_build_array(
        jsonb_build_object('account_code', '1010', 'debit', v_total),
        jsonb_build_object('account_code', '1100', 'credit', v_total)
      ),
      'posted'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fin_auto_post_order_receipt ON public.orders;
CREATE TRIGGER fin_auto_post_order_receipt
  AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public._fin_auto_post_order_receipt();

CREATE OR REPLACE FUNCTION public._fin_auto_post_cogs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shop uuid;
  v_settings public.fin_entity_settings%ROWTYPE;
  v_cost numeric(14,2) := 0;
  v_flag text := 'MISSING_COST';
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;
  v_shop := public._fin_shop_entity_id();
  IF v_shop IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO v_settings FROM public.fin_entity_settings WHERE entity_id = v_shop;
  IF COALESCE(v_settings.stock_decrement_on, 'completed') = 'confirmed' AND NEW.status = 'confirmed' AND OLD.status IS DISTINCT FROM 'confirmed' THEN
    NULL;
  ELSIF COALESCE(v_settings.stock_decrement_on, 'completed') = 'completed' AND NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    NULL;
  ELSE
    RETURN NEW;
  END IF;

  SELECT COALESCE(pc.unit_cost, 0) INTO v_cost
  FROM public.fin_product_costs pc
  JOIN public.products p ON p.id = pc.product_id
  WHERE pc.entity_id = v_shop
  LIMIT 1;

  PERFORM public.fin_post_entry(
    v_shop,
    CURRENT_DATE,
    'COGS order ' || NEW.order_number,
    jsonb_build_object(
      'source_type', 'stock_movement',
      'source_table', 'orders',
      'source_id', NEW.id,
      'doc_number', NEW.order_number || '-cogs'
    ),
    jsonb_build_array(
      jsonb_build_object('account_code', '5010', 'debit', v_cost, 'description', v_flag),
      jsonb_build_object('account_code', '1330', 'credit', v_cost, 'description', v_flag)
    ),
    'posted'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fin_auto_post_cogs ON public.orders;
CREATE TRIGGER fin_auto_post_cogs
  AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public._fin_auto_post_cogs();

CREATE OR REPLACE FUNCTION public._fin_auto_post_inventory_adj()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shop uuid;
  v_delta numeric;
BEGIN
  IF public.fin_internal_stock_flag() THEN RETURN NEW; END IF;
  IF TG_OP <> 'UPDATE' OR NEW.stock_quantity IS NOT DISTINCT FROM OLD.stock_quantity THEN
    RETURN NEW;
  END IF;
  v_shop := public._fin_shop_entity_id();
  IF v_shop IS NULL THEN RETURN NEW; END IF;
  v_delta := COALESCE(NEW.stock_quantity,0) - COALESCE(OLD.stock_quantity,0);
  IF v_delta = 0 THEN RETURN NEW; END IF;
  PERFORM public.fin_post_entry(
    v_shop,
    CURRENT_DATE,
    'Inventory adj product ' || NEW.id::text,
    jsonb_build_object(
      'source_type', 'stock_movement',
      'source_table', 'products',
      'source_id', NEW.id
    ),
    jsonb_build_array(
      jsonb_build_object('account_code', CASE WHEN v_delta > 0 THEN '1330' ELSE '5110' END, 'debit', abs(v_delta)),
      jsonb_build_object('account_code', CASE WHEN v_delta > 0 THEN '5110' ELSE '1330' END, 'credit', abs(v_delta))
    ),
    'posted'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fin_auto_post_inventory_adj ON public.products;
CREATE TRIGGER fin_auto_post_inventory_adj
  AFTER UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public._fin_auto_post_inventory_adj();

CREATE OR REPLACE FUNCTION public._fin_auto_post_print_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shop uuid;
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('printing','completed') THEN
    v_shop := public._fin_shop_entity_id();
    IF v_shop IS NULL THEN RETURN NEW; END IF;
    PERFORM public.fin_post_entry(
      v_shop,
      CURRENT_DATE,
      'Print job ' || NEW.job_number,
      jsonb_build_object(
        'source_type', 'print_job',
        'source_table', 'print_jobs',
        'source_id', NEW.id,
        'doc_number', NEW.job_number
      ),
      jsonb_build_array(
        jsonb_build_object('account_code', '1320', 'debit', 0),
        jsonb_build_object('account_code', '1330', 'credit', 0)
      ),
      'posted'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fin_auto_post_print_job ON public.print_jobs;
CREATE TRIGGER fin_auto_post_print_job
  AFTER UPDATE ON public.print_jobs
  FOR EACH ROW EXECUTE FUNCTION public._fin_auto_post_print_job();

CREATE OR REPLACE FUNCTION public._fin_auto_post_commission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shop uuid;
  v_amt numeric(14,2);
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved', 'paid') THEN
    v_shop := public._fin_shop_entity_id();
    v_amt := COALESCE(NEW.commission_amount_kes, 0);
    IF v_shop IS NULL OR v_amt <= 0 THEN RETURN NEW; END IF;
    PERFORM public.fin_post_entry(
      v_shop,
      CURRENT_DATE,
      'Commission ' || NEW.id::text,
      jsonb_build_object(
        'source_type', 'commission',
        'source_table', 'commission_entries',
        'source_id', NEW.id
      ),
      jsonb_build_array(
        jsonb_build_object('account_code', '6010', 'debit', v_amt),
        jsonb_build_object('account_code', '2030', 'credit', v_amt)
      ),
      'posted'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fin_auto_post_commission ON public.commission_entries;
CREATE TRIGGER fin_auto_post_commission
  AFTER UPDATE ON public.commission_entries
  FOR EACH ROW EXECUTE FUNCTION public._fin_auto_post_commission();

COMMENT ON FUNCTION public._fin_auto_post_order_ar() IS 'Historical back-fill OFF — fires on status transitions only after deploy';