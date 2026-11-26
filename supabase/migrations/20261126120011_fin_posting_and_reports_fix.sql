-- Finance — posting map corrections, report/insight hardening (idempotent REPLACE)

-- ---------------------------------------------------------------------------
-- Journal line account resolution (unambiguous lookup)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._fin_post_entry_internal(
  p_entity_id uuid,
  p_date date,
  p_memo text,
  p_source jsonb,
  p_lines jsonb,
  p_status public.fin_entry_status,
  p_is_system boolean DEFAULT false,
  p_ic_link_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing uuid;
  v_src_id uuid;
  v_entry_id uuid;
  v_entry_no bigint;
  v_period_id uuid;
  v_line jsonb;
  v_line_no integer := 0;
  v_acct uuid;
  v_acct_entity uuid;
BEGIN
  PERFORM public.fin_assert_open_date(p_entity_id, p_date);

  IF p_source IS NOT NULL AND p_source ? 'source_table' AND p_source ? 'source_id' AND p_source ? 'source_type' THEN
    SELECT je.id INTO v_existing
    FROM public.fin_journal_entries je
    JOIN public.fin_source_documents sd ON sd.id = je.source_document_id
    WHERE sd.source_table = p_source->>'source_table'
      AND sd.source_id = (p_source->>'source_id')::uuid
      AND sd.source_type = (p_source->>'source_type')::public.fin_source_type
      AND je.status = 'posted'
    LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;

    INSERT INTO public.fin_source_documents (
      entity_id, source_type, source_table, source_id, doc_number, doc_date,
      counterparty, amount, currency, etims_invoice_no, kra_pin, attachment_path
    )
    VALUES (
      p_entity_id,
      (p_source->>'source_type')::public.fin_source_type,
      p_source->>'source_table',
      (p_source->>'source_id')::uuid,
      p_source->>'doc_number',
      (p_source->>'doc_date')::date,
      p_source->>'counterparty',
      NULLIF(p_source->>'amount','')::numeric(14,2),
      COALESCE(p_source->>'currency','KES'),
      p_source->>'etims_invoice_no',
      p_source->>'kra_pin',
      p_source->>'attachment_path'
    )
    ON CONFLICT (source_table, source_id, source_type)
    DO UPDATE SET doc_date = COALESCE(EXCLUDED.doc_date, fin_source_documents.doc_date)
    RETURNING id INTO v_src_id;
  END IF;

  v_entry_no := public.fin_next_entry_no(p_entity_id);
  v_period_id := public.fin_resolve_period_id(p_entity_id, p_date);

  INSERT INTO public.fin_journal_entries (
    entity_id, entry_no, entry_date, period_id, memo, status,
    source_document_id, is_system, ic_link_id, posted_by, posted_at
  )
  VALUES (
    p_entity_id, v_entry_no, p_date, v_period_id, p_memo, p_status,
    v_src_id, p_is_system, p_ic_link_id,
    CASE WHEN p_status = 'posted' THEN auth.uid() ELSE NULL END,
    CASE WHEN p_status = 'posted' THEN now() ELSE NULL END
  )
  RETURNING id INTO v_entry_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_line_no := v_line_no + 1;
    SELECT a.id, a.entity_id INTO v_acct, v_acct_entity
    FROM public.fin_accounts a
    WHERE (
      (v_line ? 'account_id' AND a.id = (v_line->>'account_id')::uuid)
      OR (v_line ? 'account_code' AND a.entity_id = p_entity_id AND a.code = v_line->>'account_code')
    )
    ORDER BY CASE WHEN v_line ? 'account_code' AND a.entity_id = p_entity_id AND a.code = v_line->>'account_code' THEN 0 ELSE 1 END
    LIMIT 1;
    IF v_acct IS NULL THEN
      RAISE EXCEPTION 'Account not found for line %', v_line_no;
    END IF;
    IF v_acct_entity <> p_entity_id THEN
      RAISE EXCEPTION 'Account entity mismatch on line %', v_line_no;
    END IF;
    INSERT INTO public.fin_journal_lines (
      entry_id, entity_id, line_no, account_id, debit, credit, segment,
      customer_id, vendor_id, employee_id, asset_id, product_id,
      tax_code, etims_backed, currency, fx_rate, amount_fcy, description,
      is_intercompany, counter_entity_id
    )
    VALUES (
      v_entry_id, p_entity_id, v_line_no, v_acct,
      COALESCE((v_line->>'debit')::numeric(14,2), 0),
      COALESCE((v_line->>'credit')::numeric(14,2), 0),
      NULLIF(v_line->>'segment','')::public.fin_segment,
      NULLIF(v_line->>'customer_id','')::uuid,
      NULLIF(v_line->>'vendor_id','')::uuid,
      NULLIF(v_line->>'employee_id','')::uuid,
      NULLIF(v_line->>'asset_id','')::uuid,
      NULLIF(v_line->>'product_id','')::uuid,
      v_line->>'tax_code',
      COALESCE((v_line->>'etims_backed')::boolean, false),
      COALESCE(v_line->>'currency','KES'),
      COALESCE((v_line->>'fx_rate')::numeric(18,8), 1),
      NULLIF(v_line->>'amount_fcy','')::numeric(14,2),
      v_line->>'description',
      COALESCE((v_line->>'is_intercompany')::boolean, false),
      NULLIF(v_line->>'counter_entity_id','')::uuid
    );
  END LOOP;

  RETURN v_entry_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Auto-post: order AR
-- ---------------------------------------------------------------------------
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
  v_ship numeric(14,2);
  v_sales numeric(14,2);
  v_sales_code text := '4100';
  v_item jsonb;
  v_name text;
  v_consumable boolean := false;
  v_lines jsonb := '[]'::jsonb;
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

    v_ship := COALESCE(NEW.shipping_kes, 0);
    v_sales := GREATEST(v_total - v_ship, 0);

    IF NEW.attributed_rep_id IS NOT NULL THEN
      v_sales_code := '4110';
    END IF;

    IF NEW.items IS NOT NULL AND jsonb_typeof(NEW.items) = 'array' THEN
      FOR v_item IN SELECT * FROM jsonb_array_elements(NEW.items)
      LOOP
        v_name := lower(COALESCE(v_item->>'product_name', v_item->>'name', ''));
        IF v_name ~ '(filament|consumable|spool|resin)' THEN
          v_consumable := true;
          EXIT;
        END IF;
      END LOOP;
      IF v_consumable THEN
        v_sales_code := '4120';
      END IF;
    END IF;

    v_lines := jsonb_build_array(jsonb_build_object('account_code', '1100', 'debit', v_total));
    IF v_sales > 0 THEN
      v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_code', v_sales_code, 'credit', v_sales));
    END IF;
    IF v_ship > 0 THEN
      v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_code', '4140', 'credit', v_ship));
    ELSIF v_sales <= 0 THEN
      v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_code', v_sales_code, 'credit', v_total));
    END IF;

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
      v_lines,
      'posted'
    );
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Auto-post: order receipt (cash clearing)
-- ---------------------------------------------------------------------------
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
        jsonb_build_object('account_code', '1040', 'debit', v_total),
        jsonb_build_object('account_code', '1100', 'credit', v_total)
      ),
      'posted'
    );
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Auto-post: COGS (5100 / 1340; skip zero-cost journal)
-- ---------------------------------------------------------------------------
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
  v_item jsonb;
  v_pid uuid;
  v_line_cost numeric(14,2);
  v_qty numeric(14,4);
  v_src_id uuid;
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

  IF NEW.items IS NOT NULL AND jsonb_typeof(NEW.items) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(NEW.items)
    LOOP
      v_pid := NULLIF(v_item->>'product_id','')::uuid;
      v_qty := COALESCE((v_item->>'quantity')::numeric(14,4), 1);
      v_line_cost := 0;
      IF v_pid IS NOT NULL THEN
        SELECT COALESCE(pc.unit_cost, 0) * v_qty INTO v_line_cost
        FROM public.fin_product_costs pc
        WHERE pc.entity_id = v_shop AND pc.product_id = v_pid
        LIMIT 1;
      END IF;
      v_cost := v_cost + COALESCE(v_line_cost, 0);
    END LOOP;
  END IF;

  INSERT INTO public.fin_source_documents (
    entity_id, source_type, source_table, source_id, doc_number, amount
  )
  VALUES (
    v_shop, 'stock_movement'::public.fin_source_type, 'orders', NEW.id, NEW.order_number || '-cogs', v_cost
  )
  ON CONFLICT (source_table, source_id, source_type)
  DO UPDATE SET amount = EXCLUDED.amount
  RETURNING id INTO v_src_id;

  IF v_cost <= 0 THEN
    INSERT INTO public.fin_audit_log (entity_id, action, object_table, object_id, detail)
    VALUES (
      v_shop,
      'COGS_MISSING_COST',
      'orders',
      NEW.id,
      jsonb_build_object('flag', 'MISSING_COST', 'order_number', NEW.order_number)
    );
    INSERT INTO public.fin_insight_log (entity_id, rule_key, severity, message, payload)
    VALUES (
      v_shop,
      'missing_cogs_cost',
      'warning',
      'Order COGS not posted — missing unit cost',
      jsonb_build_object('order_id', NEW.id, 'order_number', NEW.order_number)
    );
    RETURN NEW;
  END IF;

  PERFORM public.fin_post_entry(
    v_shop,
    CURRENT_DATE,
    'COGS order ' || NEW.order_number,
    jsonb_build_object(
      'source_type', 'stock_movement',
      'source_table', 'orders',
      'source_id', NEW.id,
      'doc_number', NEW.order_number || '-cogs',
      'amount', v_cost
    ),
    jsonb_build_array(
      jsonb_build_object('account_code', '5100', 'debit', v_cost, 'description', 'COGS merchandise'),
      jsonb_build_object('account_code', '1340', 'credit', v_cost, 'description', 'Inventory resale')
    ),
    'posted'
  );
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Depreciation run — expense 6400, credit accum dep account code
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fin_run_depreciation(p_entity_id uuid, p_period_end date)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id uuid;
  v_rate numeric(8,4);
  v_lines jsonb := '[]'::jsonb;
  a public.fin_fixed_assets%ROWTYPE;
  v_dep numeric(14,2);
  v_accum_code text;
BEGIN
  INSERT INTO public.fin_depreciation_runs (entity_id, period_end, status)
  VALUES (p_entity_id, p_period_end, 'draft')
  ON CONFLICT (entity_id, period_end) DO UPDATE SET status = 'draft'
  RETURNING id INTO v_run_id;

  FOR a IN SELECT * FROM public.fin_fixed_assets WHERE entity_id = p_entity_id AND status = 'active'
  LOOP
    SELECT book_rate_pct INTO v_rate FROM public.fin_depreciation_rates WHERE category = a.category;
    IF v_rate IS NULL THEN CONTINUE; END IF;
    v_dep := round(a.cost * (v_rate / 100) / 12, 2);
    IF v_dep <= 0 THEN CONTINUE; END IF;
    SELECT code INTO v_accum_code FROM public.fin_accounts WHERE id = a.accum_dep_account_id;
    IF v_accum_code IS NULL THEN CONTINUE; END IF;
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code', '6400', 'debit', v_dep, 'description', 'Depreciation ' || a.asset_code),
      jsonb_build_object('account_code', v_accum_code, 'credit', v_dep, 'description', 'Accum dep ' || a.asset_code)
    );
  END LOOP;

  IF jsonb_array_length(v_lines) = 0 THEN
    RETURN v_run_id;
  END IF;

  PERFORM public.fin_post_entry(
    p_entity_id, p_period_end, 'Depreciation run ' || p_period_end::text,
    jsonb_build_object('source_type','depreciation','source_table','fin_depreciation_runs','source_id',v_run_id::text),
    v_lines,
    'draft'
  );
  RETURN v_run_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Statement line helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._fin_aggregate_fs_lines(
  p_entity_ids uuid[],
  p_from date,
  p_to date,
  p_statement text,
  p_fs_lines text[] DEFAULT NULL,
  p_segment public.fin_segment DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.ord), '[]'::jsonb)
  FROM (
    SELECT
      fl AS fs_line,
      fl AS line_label,
      COALESCE(SUM(
        CASE
          WHEN a.account_type = 'income'::public.fin_account_type THEN jl.credit - jl.debit
          WHEN a.account_type IN ('expense'::public.fin_account_type, 'cogs'::public.fin_account_type) THEN jl.debit - jl.credit
          WHEN a.normal_balance = 'credit' THEN jl.credit - jl.debit
          ELSE jl.debit - jl.credit
        END
      ), 0) AS amount,
      CASE fl
        WHEN 'turnover' THEN 1 WHEN 'cogs' THEN 2 WHEN 'staff' THEN 3 WHEN 'opex' THEN 4
        WHEN 'depreciation' THEN 5 WHEN 'finance' THEN 6 WHEN 'tax_expense' THEN 7
        WHEN 'ic_income' THEN 8 WHEN 'ic_purchases' THEN 9 WHEN 'other_income' THEN 10
        ELSE 99
      END AS ord
    FROM unnest(COALESCE(
      p_fs_lines,
      ARRAY['turnover','cogs','staff','opex','depreciation','finance','tax_expense','ic_income','ic_purchases','other_income']
    )) AS fl
    LEFT JOIN public.fin_accounts a ON a.fs_line = fl AND a.fs_statement = p_statement AND a.entity_id = ANY (p_entity_ids)
    LEFT JOIN public.fin_journal_lines jl ON jl.account_id = a.id AND jl.entity_id = a.entity_id
    LEFT JOIN public.fin_journal_entries je ON je.id = jl.entry_id AND je.status = 'posted'
      AND je.entry_date BETWEEN COALESCE(p_from, '1900-01-01') AND COALESCE(p_to, CURRENT_DATE)
    WHERE (p_segment IS NULL OR jl.segment IS NULL OR jl.segment = p_segment OR jl.id IS NULL)
    GROUP BY fl
  ) x;
$$;

REVOKE ALL ON FUNCTION public._fin_aggregate_fs_lines(uuid[], date, date, text, text[], public.fin_segment) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fin_report_sci(
  p_scope text,
  p_entity_id uuid DEFAULT NULL,
  p_group_id uuid DEFAULT NULL,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_segment public.fin_segment DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  PERFORM public._fin_report_guard();
  v_ids := public._fin_resolve_entity_scope(p_scope, p_entity_id, p_group_id);
  RETURN jsonb_build_object(
    'report', 'sci',
    'from', p_from,
    'to', p_to,
    'lines', public._fin_aggregate_fs_lines(
      v_ids, p_from, p_to, 'income_statement', NULL, p_segment
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fin_report_sofp(
  p_scope text,
  p_entity_id uuid DEFAULT NULL,
  p_group_id uuid DEFAULT NULL,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_segment public.fin_segment DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
  v_lines jsonb;
BEGIN
  PERFORM public._fin_report_guard();
  v_ids := public._fin_resolve_entity_scope(p_scope, p_entity_id, p_group_id);
  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.fs_line), '[]'::jsonb)
  INTO v_lines
  FROM (
    SELECT a.fs_line AS fs_line, a.fs_line AS line_label,
      COALESCE(SUM(
        CASE WHEN a.normal_balance = 'credit' THEN jl.credit - jl.debit ELSE jl.debit - jl.credit END
      ), 0) AS amount
    FROM public.fin_accounts a
    LEFT JOIN public.fin_journal_lines jl ON jl.account_id = a.id AND jl.entity_id = a.entity_id
    LEFT JOIN public.fin_journal_entries je ON je.id = jl.entry_id AND je.status = 'posted'
      AND je.entry_date <= COALESCE(p_to, CURRENT_DATE)
    WHERE a.entity_id = ANY (v_ids) AND a.fs_statement = 'balance_sheet'
      AND (p_segment IS NULL OR jl.segment IS NULL OR jl.segment = p_segment OR jl.id IS NULL)
    GROUP BY a.fs_line
  ) x;
  RETURN jsonb_build_object('report','sofp','lines', v_lines);
END;
$$;

CREATE OR REPLACE FUNCTION public.fin_report_cf(
  p_scope text,
  p_entity_id uuid DEFAULT NULL,
  p_group_id uuid DEFAULT NULL,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_segment public.fin_segment DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
  v_sci jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_pbt numeric(14,2) := 0;
  v_dep numeric(14,2) := 0;
  r jsonb;
BEGIN
  PERFORM public._fin_report_guard();
  v_ids := public._fin_resolve_entity_scope(p_scope, p_entity_id, p_group_id);
  v_sci := public._fin_aggregate_fs_lines(v_ids, p_from, p_to, 'income_statement', NULL, p_segment);
  FOR r IN SELECT * FROM jsonb_array_elements(v_sci)
  LOOP
    IF r->>'fs_line' IN ('turnover','other_income','ic_income') THEN
      v_pbt := v_pbt + COALESCE((r->>'amount')::numeric, 0);
    ELSIF r->>'fs_line' IN ('cogs','staff','opex','finance','tax_expense','ic_purchases') THEN
      v_pbt := v_pbt - ABS(COALESCE((r->>'amount')::numeric, 0));
    ELSIF r->>'fs_line' = 'depreciation' THEN
      v_dep := COALESCE((r->>'amount')::numeric, 0);
    END IF;
  END LOOP;
  IF v_pbt <> 0 OR v_dep <> 0 THEN
    v_lines := jsonb_build_array(
      jsonb_build_object('line_label', 'Profit before tax (indirect)', 'amount', v_pbt),
      jsonb_build_object('line_label', 'Add: depreciation', 'amount', v_dep),
      jsonb_build_object('line_label', 'Working capital change', 'amount', 0, 'note', 'Extend when WC bridge enabled')
    );
  ELSE
    v_lines := jsonb_build_array(jsonb_build_object('line_label', 'No operating cash flow data', 'amount', 0, 'note', 'Post journals to populate'));
  END IF;
  RETURN jsonb_build_object('report','cashflow','lines', v_lines);
END;
$$;

CREATE OR REPLACE FUNCTION public.fin_report_equity(
  p_scope text,
  p_entity_id uuid DEFAULT NULL,
  p_group_id uuid DEFAULT NULL,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_segment public.fin_segment DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
  v_lines jsonb;
BEGIN
  PERFORM public._fin_report_guard();
  v_ids := public._fin_resolve_entity_scope(p_scope, p_entity_id, p_group_id);
  SELECT COALESCE(jsonb_agg(row_to_json(x)), '[]'::jsonb)
  INTO v_lines
  FROM (
    SELECT CASE a.fs_line
      WHEN 'share_capital' THEN 'Share capital'
      WHEN 'retained_earnings' THEN 'Retained earnings'
      WHEN 'drawings' THEN 'Drawings'
      WHEN 'current_year_profit' THEN 'Current year profit'
      ELSE initcap(replace(a.fs_line, '_', ' '))
    END AS component,
    COALESCE(SUM(jl.credit - jl.debit), 0) AS amount
    FROM public.fin_accounts a
    LEFT JOIN public.fin_journal_lines jl ON jl.account_id = a.id
    LEFT JOIN public.fin_journal_entries je ON je.id = jl.entry_id AND je.status = 'posted'
      AND je.entry_date BETWEEN COALESCE(p_from,'1900-01-01') AND COALESCE(p_to, CURRENT_DATE)
    WHERE a.entity_id = ANY (v_ids)
      AND a.fs_line IN ('share_capital','retained_earnings','drawings','current_year_profit')
    GROUP BY a.fs_line
  ) x;
  RETURN jsonb_build_object('report','equity','lines', v_lines);
END;
$$;

CREATE OR REPLACE FUNCTION public.fin_report_worksheet(
  p_scope text,
  p_entity_id uuid DEFAULT NULL,
  p_group_id uuid DEFAULT NULL,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_segment public.fin_segment DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group uuid;
  v_rows jsonb;
BEGIN
  PERFORM public._fin_report_guard();
  v_group := p_group_id;
  IF v_group IS NULL THEN
    SELECT default_group_id INTO v_group FROM public.fin_settings WHERE id = 1;
  END IF;
  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.account_code), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT a.code AS account_code,
      COALESCE(SUM(jl.debit - jl.credit) FILTER (WHERE e.code <> 'ELIM'), 0) AS entity_amount,
      COALESCE(SUM(jl.debit - jl.credit) FILTER (WHERE e.code = 'ELIM'), 0) AS elim_amount,
      COALESCE(SUM(jl.debit - jl.credit), 0) AS group_amount
    FROM public.fin_accounts a
    JOIN public.fin_entities e ON e.id = a.entity_id
    JOIN public.fin_consolidation_members m ON m.entity_id = a.entity_id AND m.group_id = v_group
    LEFT JOIN public.fin_journal_lines jl ON jl.account_id = a.id
    LEFT JOIN public.fin_journal_entries je ON je.id = jl.entry_id AND je.status = 'posted'
      AND je.entry_date BETWEEN COALESCE(p_from,'1900-01-01') AND COALESCE(p_to, CURRENT_DATE)
    GROUP BY a.code
  ) x;
  RETURN jsonb_build_object('report','worksheet','rows', COALESCE(v_rows, '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.fin_report_aged_ar(
  p_scope text,
  p_entity_id uuid DEFAULT NULL,
  p_group_id uuid DEFAULT NULL,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_segment public.fin_segment DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
  v_buckets jsonb;
BEGIN
  PERFORM public._fin_report_guard();
  v_ids := public._fin_resolve_entity_scope(p_scope, p_entity_id, p_group_id);
  SELECT COALESCE(jsonb_agg(row_to_json(b)), '[]'::jsonb)
  INTO v_buckets
  FROM (
    SELECT
      CASE
        WHEN i.due_date IS NULL OR i.due_date >= CURRENT_DATE THEN 'current'
        WHEN CURRENT_DATE - i.due_date <= 30 THEN '1-30'
        WHEN CURRENT_DATE - i.due_date <= 60 THEN '31-60'
        WHEN CURRENT_DATE - i.due_date <= 90 THEN '61-90'
        ELSE '90+'
      END AS bucket,
      jsonb_agg(jsonb_build_object(
        'invoice_no', i.invoice_no,
        'due_date', i.due_date,
        'status', i.status,
        'total', i.total,
        'balance', i.total
      )) AS items
    FROM public.fin_invoices i
    WHERE i.entity_id = ANY (v_ids)
      AND i.status IN ('draft', 'approved')
    GROUP BY 1
  ) b;
  RETURN jsonb_build_object('report','aged_ar','buckets', COALESCE(v_buckets, '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.fin_report_aged_ap(
  p_scope text,
  p_entity_id uuid DEFAULT NULL,
  p_group_id uuid DEFAULT NULL,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_segment public.fin_segment DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
  v_buckets jsonb;
BEGIN
  PERFORM public._fin_report_guard();
  v_ids := public._fin_resolve_entity_scope(p_scope, p_entity_id, p_group_id);
  SELECT COALESCE(jsonb_agg(row_to_json(b)), '[]'::jsonb)
  INTO v_buckets
  FROM (
    SELECT
      CASE
        WHEN b.due_date IS NULL OR b.due_date >= CURRENT_DATE THEN 'current'
        WHEN CURRENT_DATE - b.due_date <= 30 THEN '1-30'
        WHEN CURRENT_DATE - b.due_date <= 60 THEN '31-60'
        WHEN CURRENT_DATE - b.due_date <= 90 THEN '61-90'
        ELSE '90+'
      END AS bucket,
      jsonb_agg(jsonb_build_object(
        'bill_no', b.bill_no,
        'due_date', b.due_date,
        'status', b.status,
        'total', b.total,
        'balance', b.total
      )) AS items
    FROM public.fin_bills b
    WHERE b.entity_id = ANY (v_ids)
      AND b.status IN ('draft', 'approved')
    GROUP BY 1
  ) b;
  RETURN jsonb_build_object('report','aged_ap','buckets', COALESCE(v_buckets, '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.fin_report_ratios(
  p_scope text,
  p_entity_id uuid DEFAULT NULL,
  p_group_id uuid DEFAULT NULL,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_segment public.fin_segment DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
  v_tb jsonb;
  v_assets numeric(14,2) := 0;
  v_liab numeric(14,2) := 0;
  v_ca numeric(14,2) := 0;
  v_cl numeric(14,2) := 0;
  v_turnover numeric(14,2) := 0;
  v_profit numeric(14,2) := 0;
  r jsonb;
  v_metrics jsonb := '[]'::jsonb;
BEGIN
  PERFORM public._fin_report_guard();
  v_ids := public._fin_resolve_entity_scope(p_scope, p_entity_id, p_group_id);
  v_tb := public._fin_tb_lines(v_ids, COALESCE(p_from,'1900-01-01'), COALESCE(p_to, CURRENT_DATE), p_segment);
  FOR r IN SELECT * FROM jsonb_array_elements(v_tb)
  LOOP
    IF (r->>'code') LIKE '1%' THEN v_ca := v_ca + COALESCE((r->>'balance')::numeric, 0); END IF;
    IF (r->>'code') LIKE '2%' THEN v_cl := v_cl + ABS(COALESCE((r->>'balance')::numeric, 0)); END IF;
    IF (r->>'fs_line') = 'turnover' THEN v_turnover := v_turnover + ABS(COALESCE((r->>'credit')::numeric, 0) - COALESCE((r->>'debit')::numeric, 0)); END IF;
  END LOOP;
  v_assets := v_ca;
  v_liab := v_cl;
  IF v_cl > 0 THEN
    v_metrics := v_metrics || jsonb_build_array(jsonb_build_object('code','current_ratio','name','Current ratio','value', round(v_ca / NULLIF(v_cl,0), 4)));
  END IF;
  IF v_assets > 0 AND v_turnover > 0 THEN
    v_profit := v_turnover;
    v_metrics := v_metrics || jsonb_build_array(jsonb_build_object('code','asset_turnover','name','Revenue / current assets (proxy)','value', round(v_turnover / NULLIF(v_ca,0), 4)));
  END IF;
  RETURN jsonb_build_object('report','ratios','metrics', v_metrics);
END;
$$;

CREATE OR REPLACE FUNCTION public.fin_trace(p_ref text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uuid uuid;
  v_entry public.fin_journal_entries%ROWTYPE;
  v_lines jsonb;
  v_src jsonb;
BEGIN
  PERFORM public._fin_report_guard();
  BEGIN
    v_uuid := p_ref::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_uuid := NULL;
  END;

  IF v_uuid IS NOT NULL AND EXISTS (SELECT 1 FROM public.fin_journal_entries WHERE id = v_uuid) THEN
    SELECT * INTO v_entry FROM public.fin_journal_entries WHERE id = v_uuid;
    SELECT COALESCE(jsonb_agg(row_to_json(jl)), '[]'::jsonb) INTO v_lines
    FROM (
      SELECT jl.line_no, a.code AS account_code, jl.debit, jl.credit, jl.description
      FROM public.fin_journal_lines jl
      JOIN public.fin_accounts a ON a.id = jl.account_id
      WHERE jl.entry_id = v_uuid
      ORDER BY jl.line_no
    ) jl;
    SELECT to_jsonb(sd) INTO v_src FROM public.fin_source_documents sd WHERE id = v_entry.source_document_id;
    RETURN jsonb_build_object('type','journal_entry','entry', to_jsonb(v_entry), 'lines', v_lines, 'source_document', v_src);
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(x)), '[]'::jsonb)
  INTO v_lines
  FROM (
    SELECT je.entry_date, je.entry_no, jl.debit, jl.credit, jl.description
    FROM public.fin_journal_lines jl
    JOIN public.fin_accounts a ON a.id = jl.account_id AND a.code = p_ref
    JOIN public.fin_journal_entries je ON je.id = jl.entry_id AND je.status = 'posted'
    ORDER BY je.entry_date DESC
    LIMIT 25
  ) x;
  RETURN jsonb_build_object('type','account_code','code', p_ref, 'recent_lines', COALESCE(v_lines, '[]'::jsonb));
END;
$$;

-- ---------------------------------------------------------------------------
-- Insights & eliminations
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fin_insights(
  p_scope text DEFAULT 'entity',
  p_entity_id uuid DEFAULT NULL,
  p_group_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_out jsonb := '[]'::jsonb;
  v_ids uuid[];
  v_imbalance numeric;
  v_suspense numeric;
  v_unrecon bigint;
  v_unpaired bigint;
  v_parent uuid;
  v_shop uuid;
  v_inv_parent numeric;
  v_shop_activity bigint;
  v_layer numeric;
  v_inv_gl numeric;
  r jsonb;
BEGIN
  PERFORM public._fin_report_guard();
  v_ids := CASE WHEN p_scope = 'consolidated'
    THEN public._fin_resolve_entity_scope('consolidated', NULL, p_group_id)
    ELSE public._fin_resolve_entity_scope('entity', p_entity_id, NULL)
  END;

  SELECT COALESCE(SUM(jl.debit - jl.credit),0) INTO v_imbalance
  FROM public.fin_journal_lines jl
  JOIN public.fin_journal_entries je ON je.id = jl.entry_id AND je.status = 'posted'
  WHERE jl.entity_id = ANY (v_ids);

  IF v_imbalance <> 0 THEN
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'code','tb_imbalance','severity','critical','title','Trial balance imbalance',
      'detail','Posted debits and credits do not net to zero','amount',v_imbalance,
      'action_route','reports/tb','evidence',jsonb_build_object('delta',v_imbalance)
    ));
  END IF;

  SELECT COALESCE(SUM(
    CASE WHEN a.normal_balance = 'credit' THEN jl.credit - jl.debit ELSE jl.debit - jl.credit END
  ),0) INTO v_suspense
  FROM public.fin_journal_lines jl
  JOIN public.fin_accounts a ON a.id = jl.account_id AND a.code IN ('3900','1900')
  JOIN public.fin_journal_entries je ON je.id = jl.entry_id AND je.status = 'posted'
  WHERE jl.entity_id = ANY (v_ids);

  IF v_suspense <> 0 THEN
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'code','suspense_balance','severity','warning','title','Suspense accounts non-zero',
      'detail','Clear 1900/3900 before close','amount',v_suspense,'action_route','journals'
    ));
  END IF;

  SELECT COUNT(*) INTO v_unrecon FROM public.fin_bank_lines bl
  WHERE bl.entity_id = ANY (v_ids) AND bl.status = 'unmatched';
  IF v_unrecon > 0 THEN
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'code','unreconciled_bank','severity','warning','title','Unreconciled bank lines',
      'detail', v_unrecon || ' unmatched statement lines','amount',v_unrecon,'action_route','banking'
    ));
  END IF;

  SELECT COUNT(*) INTO v_unpaired
  FROM public.fin_journal_lines jl
  JOIN public.fin_journal_entries je ON je.id = jl.entry_id AND je.status = 'posted'
  WHERE jl.entity_id = ANY (v_ids) AND jl.is_intercompany AND je.ic_link_id IS NULL;
  IF v_unpaired > 0 THEN
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'code','unpaired_ic','severity','warning','title','Intercompany lines without pair',
      'detail','IC lines missing ic_link_id','amount',v_unpaired,'action_route','settings'
    ));
  END IF;

  SELECT parent_entity_id, shop_entity_id INTO v_parent, v_shop FROM public.fin_settings WHERE id = 1;
  IF v_shop IS NOT NULL AND v_parent IS NOT NULL AND v_shop = ANY (v_ids) THEN
    SELECT COALESCE(SUM(jl.debit - jl.credit), 0) INTO v_inv_parent
    FROM public.fin_journal_lines jl
    JOIN public.fin_accounts a ON a.id = jl.account_id AND a.code = '1710'
    JOIN public.fin_journal_entries je ON je.id = jl.entry_id AND je.status = 'posted'
    WHERE jl.entity_id = v_parent;
    SELECT COUNT(*) INTO v_shop_activity
    FROM public.fin_journal_entries WHERE entity_id = v_shop AND status = 'posted';
    IF v_shop_activity > 0 AND COALESCE(v_inv_parent, 0) = 0 THEN
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'code','parent_investment_nil','severity','info','title','Shop activity with nil parent 1710',
        'detail','Consider capitalization / IC investment entry','action_route','settings'
      ));
    END IF;
  END IF;

  SELECT COALESCE(SUM(sl.qty_remaining * sl.unit_cost), 0) INTO v_layer
  FROM public.fin_stock_layers sl
  WHERE sl.entity_id = ANY (v_ids);

  SELECT COALESCE(SUM(
    CASE WHEN a.normal_balance = 'debit' THEN jl.debit - jl.credit ELSE jl.credit - jl.debit END
  ), 0) INTO v_inv_gl
  FROM public.fin_journal_lines jl
  JOIN public.fin_accounts a ON a.id = jl.account_id AND a.code LIKE '13%'
  JOIN public.fin_journal_entries je ON je.id = jl.entry_id AND je.status = 'posted'
  WHERE jl.entity_id = ANY (v_ids);

  IF v_layer > 0 AND abs(v_layer - v_inv_gl) > 1 THEN
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'code','fifo_vs_gl','severity','warning','title','FIFO layers diverge from 13xx GL',
      'detail','Reconcile inventory subledger','amount', v_layer - v_inv_gl,'action_route','reports/tb'
    ));
  END IF;

  RETURN jsonb_build_object('insights', v_out);
END;
$$;

CREATE OR REPLACE FUNCTION public.fin_data_health(p_scope text DEFAULT 'entity', p_entity_id uuid DEFAULT NULL, p_group_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._fin_report_guard();
  RETURN jsonb_build_object('checks', public.fin_insights(p_scope,p_entity_id,p_group_id)->'insights');
END;
$$;

CREATE OR REPLACE FUNCTION public.fin_propose_eliminations(p_group_id uuid, p_period_end date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_drafts jsonb := '[]'::jsonb;
  v_parent uuid;
  v_shop uuid;
  v_bal numeric;
  v_code text;
  v_amt numeric;
BEGIN
  PERFORM public._fin_report_guard();
  IF NOT public.fin_can_write() THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  SELECT parent_entity_id, shop_entity_id INTO v_parent, v_shop FROM public.fin_settings WHERE id = 1;

  IF v_parent IS NOT NULL THEN
    SELECT COALESCE(SUM(jl.debit - jl.credit),0) INTO v_bal
    FROM public.fin_journal_lines jl
    JOIN public.fin_accounts a ON a.id = jl.account_id AND a.code = '1710'
    JOIN public.fin_journal_entries je ON je.id = jl.entry_id AND je.status = 'posted'
    WHERE jl.entity_id = v_parent;
    IF v_bal <> 0 THEN
      v_drafts := v_drafts || jsonb_build_array(jsonb_build_object(
        'rule','1710_vs_shop_equity','memo','Draft eliminate investment vs subsidiary equity',
        'amount', v_bal, 'period_end', p_period_end
      ));
    END IF;
  END IF;

  FOREACH v_code IN ARRAY ARRAY['1700','2700','4500','5500']
  LOOP
    SELECT COALESCE(SUM(jl.debit - jl.credit),0) INTO v_amt
    FROM public.fin_journal_lines jl
    JOIN public.fin_accounts a ON a.id = jl.account_id AND a.code = v_code
    JOIN public.fin_journal_entries je ON je.id = jl.entry_id AND je.status = 'posted'
      AND je.entry_date <= p_period_end
    JOIN public.fin_consolidation_members m ON m.entity_id = jl.entity_id AND m.group_id = p_group_id;
    IF COALESCE(v_amt, 0) <> 0 THEN
      v_drafts := v_drafts || jsonb_build_array(jsonb_build_object(
        'rule', v_code || '_elim','memo','Draft IC elimination','amount',v_amt,'period_end',p_period_end
      ));
    END IF;
  END LOOP;

  RETURN jsonb_build_object('drafts', v_drafts, 'note', 'Proposals only — never auto-posted');
END;
$$;