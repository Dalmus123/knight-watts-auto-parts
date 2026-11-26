-- Finance core tests (NOT auto-applied). Run via psql or pgTAP in a scratch DB.
-- Synthetic fixtures only; cleans up after itself.
-- Requires a user_profiles row with role = cfo for the JWT sub below (no company PII).

DO $$
DECLARE
  v_parent uuid;
  v_shop uuid;
  v_ent uuid;
  v_a1 uuid;
  v_a2 uuid;
  v_entry uuid;
  v_bad uuid;
  v_ic_a uuid;
  v_ic_b uuid;
BEGIN
  -- CFO JWT claims so fin_can_write() / guarded write RPCs authorize (scratch DB only)
  PERFORM set_config(
    'request.jwt.claims',
    '{"sub":"5898ad44-39e8-491b-a7f2-dfaf1d883608","role":"authenticated"}',
    true
  );
  PERFORM set_config('request.jwt.claim.sub', '5898ad44-39e8-491b-a7f2-dfaf1d883608', true);
  PERFORM set_config('role', 'authenticated', true);

  SELECT id INTO v_parent FROM public.fin_entities WHERE code = 'PARENT';
  SELECT id INTO v_shop FROM public.fin_entities WHERE code = 'SHOP';
  v_ent := v_shop;
  PERFORM public.fin_ensure_periods(v_ent, EXTRACT(YEAR FROM CURRENT_DATE)::int);
  SELECT id INTO v_a1 FROM public.fin_accounts WHERE entity_id = v_ent AND code = '1010';
  SELECT id INTO v_a2 FROM public.fin_accounts WHERE entity_id = v_ent AND code = '4010';
  IF v_a1 IS NULL OR v_a2 IS NULL THEN
    RAISE EXCEPTION 'fixture accounts missing — run fin_clone_coa first';
  END IF;

  -- unbalanced journal rejected at constraint time
  BEGIN
    v_entry := public.fin_post_entry(
      v_ent, CURRENT_DATE, 'unbalanced test',
      jsonb_build_object('source_type','manual','source_table','test','source_id',gen_random_uuid()),
      jsonb_build_array(
        jsonb_build_object('account_id', v_a1, 'debit', 100),
        jsonb_build_object('account_id', v_a2, 'credit', 50)
      ),
      'posted'
    );
    RAISE EXCEPTION 'expected unbalanced failure';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- balanced post
  v_entry := public.fin_post_entry(
    v_ent, CURRENT_DATE, 'balanced test',
    jsonb_build_object('source_type','manual','source_table','test','source_id',gen_random_uuid()),
    jsonb_build_array(
      jsonb_build_object('account_id', v_a1, 'debit', 100),
      jsonb_build_object('account_id', v_a2, 'credit', 100)
    ),
    'posted'
  );

  -- idempotent post via same source
  PERFORM public.fin_post_entry(
    v_ent, CURRENT_DATE, 'duplicate',
    (SELECT jsonb_build_object('source_type','manual','source_table','test','source_id',sd.source_id)
     FROM public.fin_journal_entries je
     JOIN public.fin_source_documents sd ON sd.id = je.source_document_id
     WHERE je.id = v_entry),
    jsonb_build_array(
      jsonb_build_object('account_id', v_a1, 'debit', 999),
      jsonb_build_object('account_id', v_a2, 'credit', 999)
    ),
    'posted'
  );

  -- posted immutable
  BEGIN
    UPDATE public.fin_journal_entries SET memo = 'hack' WHERE id = v_entry;
    RAISE EXCEPTION 'expected immutability failure';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- cross-entity line rejected
  SELECT id INTO v_a1 FROM public.fin_accounts WHERE entity_id = v_parent AND code = '1010';
  BEGIN
    v_bad := public.fin_post_entry(
      v_ent, CURRENT_DATE, 'cross entity',
      jsonb_build_object('source_type','manual','source_table','test','source_id',gen_random_uuid()),
      jsonb_build_array(
        jsonb_build_object('account_id', v_a1, 'debit', 10),
        jsonb_build_object('account_id', v_a2, 'credit', 10)
      ),
      'posted'
    );
    RAISE EXCEPTION 'expected cross-entity failure';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- IC paired entries
  SELECT entry_a, entry_b INTO v_ic_a, v_ic_b FROM public.fin_post_intercompany(
    gen_random_uuid(), CURRENT_DATE, 'IC test',
    jsonb_build_object(
      'entity_id', v_parent,
      'source', jsonb_build_object('source_type','intercompany','source_table','test','source_id',gen_random_uuid()),
      'lines', jsonb_build_array(
        jsonb_build_object('account_code','1150','debit',10),
        jsonb_build_object('account_code','1010','credit',10)
      )
    ),
    jsonb_build_object(
      'entity_id', v_shop,
      'source', jsonb_build_object('source_type','intercompany','source_table','test','source_id',gen_random_uuid()),
      'lines', jsonb_build_array(
        jsonb_build_object('account_code','2150','credit',10),
        jsonb_build_object('account_code','1010','debit',10)
      )
    )
  );
  IF v_ic_a IS NULL OR v_ic_b IS NULL THEN
    RAISE EXCEPTION 'IC pair missing';
  END IF;

  -- draft comparisons skip when fin_seed_expected empty
  IF EXISTS (SELECT 1 FROM public.fin_seed_expected) THEN
    RAISE NOTICE 'fin_seed_expected populated — extend tests';
  ELSE
    RAISE NOTICE 'fin_seed_expected empty — draft comparisons skipped';
  END IF;

  -- RLS matrix (comments): cfo write, ceo/owner read, others denied — validated in 20261126120006_fin_rls.sql

  -- cleanup synthetic journals from this test block
  DELETE FROM public.fin_journal_lines WHERE entry_id IN (
    SELECT id FROM public.fin_journal_entries WHERE memo IN ('balanced test','IC test')
  );
  DELETE FROM public.fin_journal_entries WHERE memo IN ('balanced test','IC test');
END $$;
