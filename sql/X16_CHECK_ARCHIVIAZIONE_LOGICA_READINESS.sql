-- ============================================================================
-- FILE: sql/X16_CHECK_ARCHIVIAZIONE_LOGICA_READINESS.sql
-- TIPO: SCRIPT DIAGNOSTICO PERMANENTE - SOLA LETTURA
-- VERSIONE: 1.1
--
-- PROGETTO:
--   NIS2 Asset Inventory Manager
--
-- SCOPO:
--   Analizzare la gestione attuale dell'archiviazione logica prima della sua
--   uniformazione sulle principali entità e relazioni operative.
--
-- OBIETTIVI:
--   1. verificare l'esistenza delle tabelle operative candidate;
--   2. individuare colonne di attivazione, archiviazione e validità temporale;
--   3. verificare policy e privilegi DELETE;
--   4. individuare trigger che intercettano cancellazioni fisiche;
--   5. controllare il comportamento ON DELETE delle chiavi esterne;
--   6. individuare eventuali cancellazioni CASCADE;
--   7. verificare la copertura del sistema di audit generalizzato;
--   8. produrre un unico result set compatibile con Supabase SQL Editor.
--
-- SICUREZZA:
--   Lo script esegue esclusivamente interrogazioni SELECT.
--   Non modifica schema, dati, trigger, policy o privilegi.
-- ============================================================================

WITH

tabelle_candidate (
    ordine,
    nome_tabella,
    categoria
) AS (
    VALUES
        (1,  'organizzazione',                'ENTITA'),
        (2,  'responsabile',                  'ENTITA'),
        (3,  'asset',                         'ENTITA'),
        (4,  'asset_vulnerabilita',           'RELAZIONE'),
        (5,  'servizio',                      'ENTITA'),
        (6,  'servizio_componente',           'GERARCHIA'),
        (7,  'servizio_dipendenza_asset',     'RELAZIONE'),
        (8,  'servizio_dipendenza_fornitore', 'RELAZIONE'),
        (9,  'fornitore',                     'ENTITA'),
        (10, 'fornitore_relazione',           'GERARCHIA'),
        (11, 'asset_componente',              'GERARCHIA'),
        (12, 'asset_fornitore',               'RELAZIONE'),
        (13, 'evento_servizio',               'ENTITA'),
        (14, 'evento_tassonomia_acn',         'RELAZIONE')
),

colonne_archiviazione AS (
    SELECT
        c.table_name,
        c.ordinal_position,
        c.column_name,
        c.data_type,
        c.udt_name,
        c.is_nullable,
        c.column_default,

        CASE
            WHEN lower(c.column_name) IN (
                'attivo',
                'attiva',
                'is_active',
                'archiviato',
                'is_archived',
                'eliminato',
                'is_deleted'
            )
            THEN 'FLAG_LOGICO'

            WHEN lower(c.column_name) IN (
                'data_archiviazione',
                'archiviato_il',
                'archived_at',
                'deleted_at',
                'data_disattivazione',
                'disattivato_il'
            )
            THEN 'DATA_ARCHIVIAZIONE'

            WHEN lower(c.column_name) IN (
                'data_inizio',
                'data_fine',
                'valido_dal',
                'valido_al',
                'valid_from',
                'valid_to'
            )
            THEN 'VALIDITA_TEMPORALE'

            WHEN lower(c.column_name) = 'stato'
            THEN 'STATO_GENERICO'

            ELSE 'ALTRO_INDICATORE'
        END AS categoria_colonna

    FROM information_schema.columns AS c

    WHERE c.table_schema = 'public'
      AND c.table_name IN (
          SELECT nome_tabella
          FROM tabelle_candidate
      )
      AND (
          lower(c.column_name) IN (
              'attivo',
              'attiva',
              'is_active',
              'archiviato',
              'is_archived',
              'eliminato',
              'is_deleted',
              'data_archiviazione',
              'archiviato_il',
              'archived_at',
              'deleted_at',
              'data_disattivazione',
              'disattivato_il',
              'data_inizio',
              'data_fine',
              'valido_dal',
              'valido_al',
              'valid_from',
              'valid_to',
              'stato'
          )
          OR lower(c.column_name) LIKE '%archiv%'
          OR lower(c.column_name) LIKE '%elimin%'
          OR lower(c.column_name) LIKE '%deleted%'
          OR lower(c.column_name) LIKE '%disattiv%'
      )
),

stato_tabelle AS (
    SELECT
        tc.ordine,
        tc.nome_tabella,
        tc.categoria,
        c.oid IS NOT NULL AS tabella_esistente,
        coalesce(c.relrowsecurity, false) AS rls_attiva,
        coalesce(c.relforcerowsecurity, false) AS force_rls,
        coalesce(stat.n_live_tup, 0) AS righe_stimate
    FROM tabelle_candidate AS tc
    LEFT JOIN pg_namespace AS ns
        ON ns.nspname = 'public'
    LEFT JOIN pg_class AS c
        ON c.relnamespace = ns.oid
       AND c.relname = tc.nome_tabella
       AND c.relkind = 'r'
    LEFT JOIN pg_stat_user_tables AS stat
        ON stat.schemaname = 'public'
       AND stat.relname = tc.nome_tabella
),

policy_delete AS (
    SELECT
        p.tablename AS nome_tabella,
        p.policyname AS nome_policy,
        p.roles,
        p.cmd,
        p.qual,
        p.with_check
    FROM pg_policies AS p
    WHERE p.schemaname = 'public'
      AND p.cmd = 'DELETE'
      AND p.tablename IN (
          SELECT nome_tabella
          FROM tabelle_candidate
      )
),

trigger_delete AS (
    SELECT
        tabella.relname AS nome_tabella,
        trigger.tgname AS nome_trigger,
        funzione.proname AS nome_funzione,
        trigger.tgenabled AS stato_trigger,
        pg_get_triggerdef(trigger.oid, true) AS definizione
    FROM pg_trigger AS trigger
    JOIN pg_class AS tabella
        ON tabella.oid = trigger.tgrelid
    JOIN pg_namespace AS ns
        ON ns.oid = tabella.relnamespace
    JOIN pg_proc AS funzione
        ON funzione.oid = trigger.tgfoid
    WHERE trigger.tgisinternal = false
      AND ns.nspname = 'public'
      AND tabella.relname IN (
          SELECT nome_tabella
          FROM tabelle_candidate
      )
      AND pg_get_triggerdef(trigger.oid, true) ILIKE '%DELETE%'
),

trigger_audit AS (
    SELECT
        tabella.relname AS nome_tabella,
        trigger.tgname AS nome_trigger,
        funzione.proname AS nome_funzione,
        trigger.tgenabled AS stato_trigger
    FROM pg_trigger AS trigger
    JOIN pg_class AS tabella
        ON tabella.oid = trigger.tgrelid
    JOIN pg_namespace AS ns
        ON ns.oid = tabella.relnamespace
    JOIN pg_proc AS funzione
        ON funzione.oid = trigger.tgfoid
    WHERE trigger.tgisinternal = false
      AND ns.nspname = 'public'
      AND tabella.relname IN (
          SELECT nome_tabella
          FROM tabelle_candidate
      )
      AND funzione.proname = 'fn_audit_generico'
),

chiavi_esterne AS (
    SELECT
        tabella_origine.relname AS tabella_origine,
        vincolo.conname AS nome_vincolo,
        tabella_destinazione.relname AS tabella_destinazione,
        CASE vincolo.confdeltype
            WHEN 'a' THEN 'NO ACTION'
            WHEN 'r' THEN 'RESTRICT'
            WHEN 'c' THEN 'CASCADE'
            WHEN 'n' THEN 'SET NULL'
            WHEN 'd' THEN 'SET DEFAULT'
            ELSE 'SCONOSCIUTO'
        END AS comportamento_delete,
        pg_get_constraintdef(vincolo.oid, true) AS definizione
    FROM pg_constraint AS vincolo
    JOIN pg_class AS tabella_origine
        ON tabella_origine.oid = vincolo.conrelid
    JOIN pg_namespace AS schema_origine
        ON schema_origine.oid = tabella_origine.relnamespace
    JOIN pg_class AS tabella_destinazione
        ON tabella_destinazione.oid = vincolo.confrelid
    JOIN pg_namespace AS schema_destinazione
        ON schema_destinazione.oid = tabella_destinazione.relnamespace
    WHERE vincolo.contype = 'f'
      AND schema_origine.nspname = 'public'
      AND schema_destinazione.nspname = 'public'
      AND (
          tabella_origine.relname IN (
              SELECT nome_tabella
              FROM tabelle_candidate
          )
          OR tabella_destinazione.relname IN (
              SELECT nome_tabella
              FROM tabelle_candidate
          )
      )
),

vincoli_archiviazione AS (
    SELECT
        tabella.relname AS nome_tabella,
        vincolo.conname AS nome_vincolo,
        vincolo.contype AS tipo_vincolo,
        pg_get_constraintdef(vincolo.oid, true) AS definizione
    FROM pg_constraint AS vincolo
    JOIN pg_class AS tabella
        ON tabella.oid = vincolo.conrelid
    JOIN pg_namespace AS ns
        ON ns.oid = tabella.relnamespace
    WHERE ns.nspname = 'public'
      AND tabella.relname IN (
          SELECT nome_tabella
          FROM tabelle_candidate
      )
      AND EXISTS (
          SELECT 1
          FROM colonne_archiviazione AS ca
          WHERE ca.table_name = tabella.relname
            AND pg_get_constraintdef(vincolo.oid, true)
                ILIKE '%' || ca.column_name || '%'
      )
),

indici_archiviazione AS (
    SELECT
        i.tablename AS nome_tabella,
        i.indexname AS nome_indice,
        i.indexdef AS definizione
    FROM pg_indexes AS i
    WHERE i.schemaname = 'public'
      AND i.tablename IN (
          SELECT nome_tabella
          FROM tabelle_candidate
      )
      AND EXISTS (
          SELECT 1
          FROM colonne_archiviazione AS ca
          WHERE ca.table_name = i.tablename
            AND i.indexdef ILIKE '%' || ca.column_name || '%'
      )
),

riepilogo_tabelle AS (
    SELECT
        st.ordine,
        st.nome_tabella,
        st.categoria,
        st.tabella_esistente,
        st.rls_attiva,
        st.force_rls,
        st.righe_stimate,

        (
            SELECT count(*)
            FROM colonne_archiviazione AS ca
            WHERE ca.table_name = st.nome_tabella
        ) AS numero_colonne_archiviazione,

        coalesce(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'colonna', ca.column_name,
                        'categoria', ca.categoria_colonna,
                        'tipo', ca.data_type,
                        'nullable', ca.is_nullable,
                        'default', ca.column_default
                    )
                    ORDER BY ca.ordinal_position
                )
                FROM colonne_archiviazione AS ca
                WHERE ca.table_name = st.nome_tabella
            ),
            '[]'::jsonb
        ) AS colonne_archiviazione,

        (
            SELECT count(*)
            FROM policy_delete AS pd
            WHERE pd.nome_tabella = st.nome_tabella
        ) AS numero_policy_delete,

        has_table_privilege(
            'anon',
            format('public.%I', st.nome_tabella),
            'DELETE'
        ) AS anon_delete,

        has_table_privilege(
            'authenticated',
            format('public.%I', st.nome_tabella),
            'DELETE'
        ) AS authenticated_delete,

        (
            SELECT count(*)
            FROM trigger_delete AS td
            WHERE td.nome_tabella = st.nome_tabella
        ) AS numero_trigger_delete,

        (
            SELECT count(*)
            FROM trigger_audit AS ta
            WHERE ta.nome_tabella = st.nome_tabella
        ) AS numero_trigger_audit

    FROM stato_tabelle AS st
),

risultato AS (
    SELECT
        1 AS ordine,
        '01_ESISTENZA_TABELLE' AS sezione,
        CASE
            WHEN count(*) FILTER (WHERE tabella_esistente = false) = 0
            THEN 'OK'
            ELSE 'ERRORE'
        END AS esito,
        jsonb_build_object(
            'tabelle_candidate', count(*),
            'tabelle_esistenti',
                count(*) FILTER (WHERE tabella_esistente = true),
            'tabelle_mancanti',
                count(*) FILTER (WHERE tabella_esistente = false),
            'dettaglio_mancanti',
                coalesce(
                    jsonb_agg(nome_tabella ORDER BY ordine)
                        FILTER (WHERE tabella_esistente = false),
                    '[]'::jsonb
                )
        ) AS dettaglio
    FROM stato_tabelle

    UNION ALL

    SELECT
        2,
        '02_COLONNE_ARCHIVIAZIONE',
        'INFORMATIVO',
        coalesce(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'tabella', table_name,
                        'colonna', column_name,
                        'categoria', categoria_colonna,
                        'tipo', data_type,
                        'tipo_postgresql', udt_name,
                        'nullable', is_nullable,
                        'default', column_default
                    )
                    ORDER BY table_name, ordinal_position
                )
                FROM colonne_archiviazione
            ),
            '[]'::jsonb
        )

    UNION ALL

    SELECT
        3,
        '03_COPERTURA_PER_TABELLA',
        'INFORMATIVO',
        coalesce(
            jsonb_agg(
                jsonb_build_object(
                    'tabella', nome_tabella,
                    'categoria', categoria,
                    'esistente', tabella_esistente,
                    'righe_stimate', righe_stimate,
                    'rls_attiva', rls_attiva,
                    'force_rls', force_rls,
                    'numero_colonne_archiviazione',
                        numero_colonne_archiviazione,
                    'colonne_archiviazione',
                        colonne_archiviazione,
                    'numero_policy_delete',
                        numero_policy_delete,
                    'anon_delete', anon_delete,
                    'authenticated_delete',
                        authenticated_delete,
                    'numero_trigger_delete',
                        numero_trigger_delete,
                    'numero_trigger_audit',
                        numero_trigger_audit
                )
                ORDER BY ordine
            ),
            '[]'::jsonb
        )
    FROM riepilogo_tabelle

    UNION ALL

    SELECT
        4,
        '04_POLICY_E_PRIVILEGI_DELETE',
        CASE
            WHEN (
                SELECT count(*)
                FROM riepilogo_tabelle
                WHERE numero_policy_delete > 0
                   OR anon_delete = true
                   OR authenticated_delete = true
            ) = 0
            THEN 'OK'
            ELSE 'DA_CORREGGERE'
        END,
        jsonb_build_object(
            'policy_delete',
            coalesce(
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'tabella', nome_tabella,
                            'policy', nome_policy,
                            'ruoli', roles,
                            'comando', cmd,
                            'using', qual,
                            'with_check', with_check
                        )
                        ORDER BY nome_tabella, nome_policy
                    )
                    FROM policy_delete
                ),
                '[]'::jsonb
            ),
            'tabelle_con_privilegi_o_policy_delete',
            coalesce(
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'tabella', nome_tabella,
                            'policy_delete', numero_policy_delete,
                            'anon_delete', anon_delete,
                            'authenticated_delete', authenticated_delete
                        )
                        ORDER BY ordine
                    )
                    FROM riepilogo_tabelle
                    WHERE numero_policy_delete > 0
                       OR anon_delete = true
                       OR authenticated_delete = true
                ),
                '[]'::jsonb
            )
        )

    UNION ALL

    SELECT
        5,
        '05_TRIGGER_DELETE',
        'INFORMATIVO',
        coalesce(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'tabella', nome_tabella,
                        'trigger', nome_trigger,
                        'funzione', nome_funzione,
                        'stato', stato_trigger,
                        'definizione', definizione
                    )
                    ORDER BY nome_tabella, nome_trigger
                )
                FROM trigger_delete
            ),
            '[]'::jsonb
        )

    UNION ALL

    SELECT
        6,
        '06_CHIAVI_ESTERNE_ON_DELETE',
        'INFORMATIVO',
        coalesce(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'tabella_origine', tabella_origine,
                        'vincolo', nome_vincolo,
                        'tabella_destinazione', tabella_destinazione,
                        'on_delete', comportamento_delete,
                        'definizione', definizione
                    )
                    ORDER BY tabella_origine, nome_vincolo
                )
                FROM chiavi_esterne
            ),
            '[]'::jsonb
        )

    UNION ALL

    SELECT
        7,
        '07_RISCHI_DELETE_CASCADE',
        CASE
            WHEN count(*) = 0
            THEN 'OK'
            ELSE 'DA_VALUTARE'
        END,
        coalesce(
            jsonb_agg(
                jsonb_build_object(
                    'tabella_origine', tabella_origine,
                    'vincolo', nome_vincolo,
                    'tabella_destinazione', tabella_destinazione,
                    'definizione', definizione
                )
                ORDER BY tabella_origine, nome_vincolo
            ),
            '[]'::jsonb
        )
    FROM chiavi_esterne
    WHERE comportamento_delete = 'CASCADE'

    UNION ALL

    SELECT
        8,
        '08_COPERTURA_AUDIT',
        CASE
            WHEN count(*) FILTER (
                WHERE numero_trigger_audit = 1
            ) = count(*)
            THEN 'OK'
            ELSE 'DA_CORREGGERE'
        END,
        jsonb_build_object(
            'tabelle_candidate', count(*),
            'tabelle_con_audit',
                count(*) FILTER (WHERE numero_trigger_audit = 1),
            'tabelle_senza_audit',
                count(*) FILTER (WHERE numero_trigger_audit = 0),
            'dettaglio_senza_audit',
                coalesce(
                    jsonb_agg(nome_tabella ORDER BY ordine)
                        FILTER (WHERE numero_trigger_audit = 0),
                    '[]'::jsonb
                )
        )
    FROM riepilogo_tabelle

    UNION ALL

    SELECT
        9,
        '09_VINCOLI_E_INDICI_ARCHIVIAZIONE',
        'INFORMATIVO',
        jsonb_build_object(
            'vincoli',
            coalesce(
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'tabella', nome_tabella,
                            'vincolo', nome_vincolo,
                            'tipo', tipo_vincolo,
                            'definizione', definizione
                        )
                        ORDER BY nome_tabella, nome_vincolo
                    )
                    FROM vincoli_archiviazione
                ),
                '[]'::jsonb
            ),
            'indici',
            coalesce(
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'tabella', nome_tabella,
                            'indice', nome_indice,
                            'definizione', definizione
                        )
                        ORDER BY nome_tabella, nome_indice
                    )
                    FROM indici_archiviazione
                ),
                '[]'::jsonb
            )
        )

    UNION ALL

    SELECT
        10,
        '10_RIEPILOGO_GENERALE',
        'INFORMATIVO',
        jsonb_build_object(
            'tabelle_candidate', count(*),
            'tabelle_con_marker_archiviazione',
                count(*) FILTER (
                    WHERE numero_colonne_archiviazione > 0
                ),
            'tabelle_senza_marker_archiviazione',
                count(*) FILTER (
                    WHERE numero_colonne_archiviazione = 0
                ),
            'tabelle_con_trigger_delete',
                count(*) FILTER (
                    WHERE numero_trigger_delete > 0
                ),
            'tabelle_con_trigger_audit',
                count(*) FILTER (
                    WHERE numero_trigger_audit > 0
                ),
            'tabelle_con_delete_applicativo',
                count(*) FILTER (
                    WHERE numero_policy_delete > 0
                       OR anon_delete = true
                       OR authenticated_delete = true
                ),
            'vincoli_delete_cascade',
                (
                    SELECT count(*)
                    FROM chiavi_esterne
                    WHERE comportamento_delete = 'CASCADE'
                )
        )
    FROM riepilogo_tabelle

    UNION ALL

    SELECT
        11,
        '11_ESITO_DIAGNOSTICO',
        CASE
            WHEN EXISTS (
                SELECT 1
                FROM riepilogo_tabelle
                WHERE tabella_esistente = false
            )
            THEN 'ERRORE'

            WHEN EXISTS (
                SELECT 1
                FROM riepilogo_tabelle
                WHERE numero_colonne_archiviazione = 0
            )
            THEN 'PRONTO_PER_UNIFORMAZIONE'

            WHEN EXISTS (
                SELECT 1
                FROM chiavi_esterne
                WHERE comportamento_delete = 'CASCADE'
            )
            THEN 'PRONTO_PER_UNIFORMAZIONE'

            WHEN EXISTS (
                SELECT 1
                FROM riepilogo_tabelle
                WHERE numero_policy_delete > 0
                   OR anon_delete = true
                   OR authenticated_delete = true
            )
            THEN 'PRONTO_PER_UNIFORMAZIONE'

            ELSE 'NESSUNA_ANOMALIA_BLOCCANTE_RILEVATA'
        END,
        jsonb_build_object(
            'tabelle_senza_marker_archiviazione',
                (
                    SELECT count(*)
                    FROM riepilogo_tabelle
                    WHERE numero_colonne_archiviazione = 0
                ),
            'vincoli_delete_cascade',
                (
                    SELECT count(*)
                    FROM chiavi_esterne
                    WHERE comportamento_delete = 'CASCADE'
                ),
            'tabelle_con_delete_applicativo',
                (
                    SELECT count(*)
                    FROM riepilogo_tabelle
                    WHERE numero_policy_delete > 0
                       OR anon_delete = true
                       OR authenticated_delete = true
                ),
            'tabelle_senza_audit',
                (
                    SELECT count(*)
                    FROM riepilogo_tabelle
                    WHERE numero_trigger_audit = 0
                ),
            'prossimo_obiettivo',
                'Definire un modello uniforme di archiviazione logica e impedire la cancellazione fisica delle entita operative.'
        )
)

SELECT
    sezione,
    esito,
    dettaglio
FROM risultato
ORDER BY ordine;