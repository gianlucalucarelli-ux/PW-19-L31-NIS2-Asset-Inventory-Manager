-- =========================================================================
-- FILE: sql/X21-Diagnostica-Profili-Assessment-FNCSDP-v1.0.sql
-- TARGET: ER V5.3 (36 TABELLE, 11 VISTE, 3FN RIGOROSA)
-- DESCRIZIONE: Diagnostica permanente e ripetibile del modulo Profili Target
--              e Attuale FNCSDP. Lo script e esclusivamente in lettura.
-- =========================================================================

-- =========================================================================
-- 1. VERIFICA BLOCCANTE COMPLETA
-- =========================================================================

DO $$
DECLARE
    v_tabelle integer;
    v_viste integer;
    v_oggetti_mancanti integer;
    v_colonne_ridondanti integer;
    v_catalogo integer;
    v_rls integer;
    v_security_invoker integer;
    v_privilegi_anon integer;
    v_privilegi_delete integer;
    v_policy_delete integer;
    v_trigger_audit integer;
    v_trigger_blocco integer;
    v_trigger_archiviazione integer;
    v_trigger_validazione integer;
    v_controlli_senza_mapping integer;
    v_mapping_orfani integer;
    v_misure_fuori_target integer;
    v_assessor_fuori_organizzazione integer;
    v_assessment_completi_incoerenti integer;
    v_copertura_maturita_incoerenti integer;
    v_metriche_fuori_intervallo integer;
BEGIN
    SELECT count(*) INTO v_tabelle
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE';

    SELECT count(*) INTO v_viste
    FROM information_schema.views
    WHERE table_schema = 'public';

    IF v_tabelle <> 36 THEN
        RAISE EXCEPTION 'Tabelle public: % invece di 36.', v_tabelle;
    END IF;

    IF v_viste <> 11 THEN
        RAISE EXCEPTION 'Viste public: % invece di 11.', v_viste;
    END IF;

    SELECT count(*) INTO v_oggetti_mancanti
    FROM (VALUES
        ('fncsdp_subcategory', 'TABLE'),
        ('profilo_target_fncsdp', 'TABLE'),
        ('controllo_target_fncsdp', 'TABLE'),
        ('controllo_target_subcategory_fncsdp', 'TABLE'),
        ('assessment_fncsdp', 'TABLE'),
        ('misura_controllo_fncsdp', 'TABLE'),
        ('vista_profili_target_fncsdp', 'VIEW'),
        ('vista_controlli_target_fncsdp', 'VIEW'),
        ('vista_profili_attuali_fncsdp', 'VIEW'),
        ('vista_valutazione_fncsdp', 'VIEW')
    ) AS attesi(nome, tipo)
    WHERE (
        tipo = 'TABLE'
        AND to_regclass('public.' || nome) IS NULL
    ) OR (
        tipo = 'VIEW'
        AND NOT EXISTS (
            SELECT 1
            FROM information_schema.views
            WHERE table_schema = 'public'
              AND table_name = nome
        )
    );

    IF v_oggetti_mancanti <> 0 THEN
        RAISE EXCEPTION 'Oggetti FNCSDP mancanti: %.', v_oggetti_mancanti;
    END IF;

    -- 3FN: l'organizzazione deve essere determinata dal Profilo Target e non
    -- duplicata nell'assessment. Score, gap e maturita aggregata sono viste.
    SELECT count(*) INTO v_colonne_ridondanti
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
          (table_name = 'assessment_fncsdp' AND column_name = 'organizzazione_id')
          OR
          (table_name IN ('assessment_fncsdp', 'misura_controllo_fncsdp')
           AND column_name IN ('score', 'gap', 'maturita_media'))
      );

    IF v_colonne_ridondanti <> 0 THEN
        RAISE EXCEPTION 'Rilevate colonne ridondanti incompatibili con la 3FN: %.', v_colonne_ridondanti;
    END IF;

    SELECT count(*) INTO v_catalogo
    FROM public.fncsdp_subcategory
    WHERE versione_framework = '2.0'
      AND codice IN ('ID.AM-1', 'ID.AM-2', 'ID.AM-3', 'ID.AM-4', 'ID.AM-5', 'ID.AM-6')
      AND attiva IS TRUE;

    IF v_catalogo <> 6 THEN
        RAISE EXCEPTION 'Catalogo ID.AM incompleto: % elementi invece di 6.', v_catalogo;
    END IF;

    SELECT count(*) INTO v_rls
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN (
          'fncsdp_subcategory',
          'profilo_target_fncsdp',
          'controllo_target_fncsdp',
          'controllo_target_subcategory_fncsdp',
          'assessment_fncsdp',
          'misura_controllo_fncsdp'
      )
      AND c.relrowsecurity IS TRUE;

    IF v_rls <> 6 THEN
        RAISE EXCEPTION 'RLS attiva su % tabelle FNCSDP invece di 6.', v_rls;
    END IF;

    SELECT count(*) INTO v_security_invoker
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN (
          'vista_profili_target_fncsdp',
          'vista_controlli_target_fncsdp',
          'vista_profili_attuali_fncsdp',
          'vista_valutazione_fncsdp'
      )
      AND 'security_invoker=true' = ANY(coalesce(c.reloptions, ARRAY[]::text[]));

    IF v_security_invoker <> 4 THEN
        RAISE EXCEPTION 'Viste FNCSDP security_invoker: % invece di 4.', v_security_invoker;
    END IF;

    SELECT count(*) INTO v_privilegi_anon
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND grantee = 'anon'
      AND table_name IN (
          'fncsdp_subcategory',
          'profilo_target_fncsdp',
          'controllo_target_fncsdp',
          'controllo_target_subcategory_fncsdp',
          'assessment_fncsdp',
          'misura_controllo_fncsdp',
          'vista_profili_target_fncsdp',
          'vista_controlli_target_fncsdp',
          'vista_profili_attuali_fncsdp',
          'vista_valutazione_fncsdp'
      );

    IF v_privilegi_anon <> 0 THEN
        RAISE EXCEPTION 'Privilegi anon rilevati sugli oggetti FNCSDP: %.', v_privilegi_anon;
    END IF;

    SELECT count(*) INTO v_privilegi_delete
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND grantee = 'authenticated'
      AND privilege_type IN ('DELETE', 'TRUNCATE')
      AND table_name IN (
          'fncsdp_subcategory',
          'profilo_target_fncsdp',
          'controllo_target_fncsdp',
          'controllo_target_subcategory_fncsdp',
          'assessment_fncsdp',
          'misura_controllo_fncsdp'
      );

    IF v_privilegi_delete <> 0 THEN
        RAISE EXCEPTION 'Privilegi DELETE/TRUNCATE rilevati: %.', v_privilegi_delete;
    END IF;

    SELECT count(*) INTO v_policy_delete
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND cmd = 'DELETE'
      AND tablename IN (
          'fncsdp_subcategory',
          'profilo_target_fncsdp',
          'controllo_target_fncsdp',
          'controllo_target_subcategory_fncsdp',
          'assessment_fncsdp',
          'misura_controllo_fncsdp'
      );

    IF v_policy_delete <> 0 THEN
        RAISE EXCEPTION 'Policy DELETE rilevate: %.', v_policy_delete;
    END IF;

    SELECT count(*) INTO v_trigger_audit
    FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN (
          'fncsdp_subcategory',
          'profilo_target_fncsdp',
          'controllo_target_fncsdp',
          'controllo_target_subcategory_fncsdp',
          'assessment_fncsdp',
          'misura_controllo_fncsdp'
      )
      AND t.tgname = 'trg_audit_' || c.relname
      AND NOT t.tgisinternal;

    SELECT count(*) INTO v_trigger_blocco
    FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN (
          'fncsdp_subcategory',
          'profilo_target_fncsdp',
          'controllo_target_fncsdp',
          'controllo_target_subcategory_fncsdp',
          'assessment_fncsdp',
          'misura_controllo_fncsdp'
      )
      AND t.tgname = 'trg_blocca_delete_' || c.relname
      AND NOT t.tgisinternal;

    SELECT count(*) INTO v_trigger_archiviazione
    FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN (
          'fncsdp_subcategory',
          'profilo_target_fncsdp',
          'controllo_target_fncsdp',
          'controllo_target_subcategory_fncsdp',
          'assessment_fncsdp',
          'misura_controllo_fncsdp'
      )
      AND t.tgname = 'trg_archiviazione_' || c.relname
      AND NOT t.tgisinternal;


    SELECT count(*) INTO v_trigger_validazione
    FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND t.tgname IN (
          'trg_valida_profilo_target_fncsdp',
          'trg_valida_controllo_target_fncsdp',
          'trg_valida_mapping_fncsdp',
          'trg_valida_assessment_fncsdp',
          'trg_valida_misura_controllo_fncsdp'
      )
      AND NOT t.tgisinternal;

    IF v_trigger_audit <> 6 OR v_trigger_blocco <> 6 OR v_trigger_archiviazione <> 6 OR v_trigger_validazione <> 5 THEN
        RAISE EXCEPTION 'Trigger incompleti: audit %, blocco %, archiviazione %, validazione %.',
            v_trigger_audit, v_trigger_blocco, v_trigger_archiviazione, v_trigger_validazione;
    END IF;

    SELECT count(*) INTO v_controlli_senza_mapping
    FROM public.controllo_target_fncsdp c
    WHERE c.attiva IS TRUE
      AND NOT EXISTS (
          SELECT 1
          FROM public.controllo_target_subcategory_fncsdp m
          WHERE m.controllo_target_id = c.id
            AND m.attiva IS TRUE
      );

    IF v_controlli_senza_mapping <> 0 THEN
        RAISE EXCEPTION 'Controlli attivi senza mapping: %.', v_controlli_senza_mapping;
    END IF;

    SELECT count(*) INTO v_mapping_orfani
    FROM public.controllo_target_subcategory_fncsdp m
    LEFT JOIN public.controllo_target_fncsdp c ON c.id = m.controllo_target_id
    LEFT JOIN public.fncsdp_subcategory s ON s.id = m.subcategory_id
    WHERE c.id IS NULL OR s.id IS NULL;

    IF v_mapping_orfani <> 0 THEN
        RAISE EXCEPTION 'Mapping orfani: %.', v_mapping_orfani;
    END IF;

    SELECT count(*) INTO v_misure_fuori_target
    FROM public.misura_controllo_fncsdp mc
    JOIN public.assessment_fncsdp a ON a.id = mc.assessment_id
    JOIN public.controllo_target_fncsdp c ON c.id = mc.controllo_target_id
    WHERE a.profilo_target_id <> c.profilo_target_id;

    IF v_misure_fuori_target <> 0 THEN
        RAISE EXCEPTION 'Misure associate a controlli di un diverso Target: %.', v_misure_fuori_target;
    END IF;

    SELECT count(*) INTO v_assessor_fuori_organizzazione
    FROM public.assessment_fncsdp a
    JOIN public.profilo_target_fncsdp pt ON pt.id = a.profilo_target_id
    JOIN public.responsabile r ON r.id = a.responsabile_assessor_id
    WHERE a.responsabile_assessor_id IS NOT NULL
      AND r.organizzazione_id <> pt.organizzazione_id;

    IF v_assessor_fuori_organizzazione <> 0 THEN
        RAISE EXCEPTION 'Assessment con assessor appartenente a un altro soggetto NIS2: %.', v_assessor_fuori_organizzazione;
    END IF;

    SELECT count(*) INTO v_assessment_completi_incoerenti
    FROM public.assessment_fncsdp a
    WHERE a.stato = 'COMPLETATO'
      AND (
          EXISTS (
              SELECT 1
              FROM public.controllo_target_fncsdp c
              WHERE c.profilo_target_id = a.profilo_target_id
                AND c.attiva IS TRUE
                AND NOT EXISTS (
                    SELECT 1
                    FROM public.misura_controllo_fncsdp mc
                    WHERE mc.assessment_id = a.id
                      AND mc.controllo_target_id = c.id
                      AND mc.attiva IS TRUE
                )
          )
          OR EXISTS (
              SELECT 1
              FROM public.misura_controllo_fncsdp mc
              WHERE mc.assessment_id = a.id
                AND mc.attiva IS TRUE
                AND (
                    mc.copertura_attuale IS NULL
                    OR (mc.copertura_attuale > 0 AND mc.livello_maturita IS NULL)
                    OR (mc.copertura_attuale = 0 AND mc.livello_maturita IS NOT NULL)
                )
          )
      );

    IF v_assessment_completi_incoerenti <> 0 THEN
        RAISE EXCEPTION 'Assessment completati incoerenti: %.', v_assessment_completi_incoerenti;
    END IF;

    SELECT count(*) INTO v_copertura_maturita_incoerenti
    FROM public.misura_controllo_fncsdp
    WHERE (copertura_attuale = 0 AND livello_maturita IS NOT NULL)
       OR (livello_maturita IS NOT NULL AND livello_maturita NOT BETWEEN 1 AND 5)
       OR (copertura_attuale IS NOT NULL AND copertura_attuale NOT IN (0.00, 0.20, 0.40, 0.60, 0.80, 1.00));

    IF v_copertura_maturita_incoerenti <> 0 THEN
        RAISE EXCEPTION 'Misure copertura/maturita incoerenti: %.', v_copertura_maturita_incoerenti;
    END IF;

    SELECT count(*) INTO v_metriche_fuori_intervallo
    FROM public.vista_profili_attuali_fncsdp
    WHERE score < 0 OR score > 1
       OR gap < 0 OR gap > 1
       OR maturita_media_indicativa < 1
       OR maturita_media_indicativa > 5;

    IF v_metriche_fuori_intervallo <> 0 THEN
        RAISE EXCEPTION 'Metriche fuori intervallo: %.', v_metriche_fuori_intervallo;
    END IF;
END;
$$;

-- =========================================================================
-- 2. RIEPILOGO LEGGIBILE
-- =========================================================================

SELECT
    (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE') AS tabelle_public,
    (SELECT count(*) FROM information_schema.views WHERE table_schema = 'public') AS viste_public,
    (SELECT count(*) FROM public.fncsdp_subcategory WHERE attiva IS TRUE) AS subcategory_attive,
    (SELECT count(*) FROM public.profilo_target_fncsdp WHERE attiva IS TRUE) AS profili_target_attivi,
    (SELECT count(*) FROM public.assessment_fncsdp WHERE attiva IS TRUE) AS assessment_attivi,
    (SELECT count(*) FROM public.assessment_fncsdp WHERE stato = 'COMPLETATO' AND attiva IS TRUE) AS assessment_completati;

SELECT
    'VERIFICA_ASSESSMENT_FNCSDP_SUPERATA' AS esito,
    clock_timestamp() AS verificato_il;
