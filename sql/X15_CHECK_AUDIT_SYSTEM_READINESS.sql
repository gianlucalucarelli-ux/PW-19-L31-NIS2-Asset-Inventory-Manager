-- ============================================================================
-- FILE: sql/X15_CHECK_AUDIT_SYSTEM_READINESS.sql
-- TIPO: SCRIPT DIAGNOSTICO PERMANENTE - SOLA LETTURA
-- VERSIONE: 1.0
--
-- PROGETTO:
--   NIS2 Asset Inventory Manager
--
-- SCOPO:
--   Analizzare il sistema di audit esistente prima della sua estensione alle
--   principali entità e relazioni operative del database.
--
-- OBIETTIVI:
--   1. verificare struttura, vincoli e sicurezza di audit_log;
--   2. individuare funzioni e trigger di audit esistenti;
--   3. verificare quali tabelle operative risultano realmente coperte;
--   4. analizzare operazioni, utenti e payload registrati;
--   5. rilevare la presenza del valore generico SYSTEM_CORE;
--   6. verificare la disponibilità di valori precedenti e successivi;
--   7. verificare la possibilità di risolvere codici e nomi delle entità;
--   8. verificare la possibilità di associare gli asset ai servizi;
--   9. controllare RLS e privilegi applicativi;
--  10. produrre un unico result set compatibile con Supabase SQL Editor.
--
-- SICUREZZA:
--   Lo script esegue esclusivamente interrogazioni SELECT.
--   Non modifica schema, dati, trigger, funzioni, policy o privilegi.
-- ============================================================================

WITH

-- ============================================================================
-- 1. TABELLE OPERATIVE CANDIDATE PER L'AUDIT
--
-- Sono escluse le tabelle puramente tassonomiche o di configurazione.
-- ============================================================================

tabelle_candidate (
    ordine,
    nome_tabella,
    categoria
) AS (
    VALUES
        (1,  'organizzazione',                  'ENTITA'),
        (2,  'responsabile',                    'ENTITA'),
        (3,  'asset',                           'ENTITA'),
        (4,  'asset_vulnerabilita',             'RELAZIONE'),
        (5,  'servizio',                        'ENTITA'),
        (6,  'servizio_componente',             'GERARCHIA'),
        (7,  'servizio_dipendenza_asset',       'RELAZIONE'),
        (8,  'servizio_dipendenza_fornitore',   'RELAZIONE'),
        (9,  'fornitore',                       'ENTITA'),
        (10, 'fornitore_relazione',             'GERARCHIA'),
        (11, 'asset_componente',                'GERARCHIA'),
        (12, 'asset_fornitore',                 'RELAZIONE'),
        (13, 'evento_servizio',                 'ENTITA'),
        (14, 'evento_tassonomia_acn',           'RELAZIONE')
),

-- ============================================================================
-- 2. LETTURA TOLLERANTE DELLE RIGHE DI AUDIT_LOG
--
-- La conversione in JSONB evita di dipendere anticipatamente dai nomi esatti
-- delle colonne presenti nella versione attuale della tabella.
-- ============================================================================

audit_rows AS (
    SELECT
        to_jsonb(al) AS dati
    FROM public.audit_log AS al
),

-- ============================================================================
-- 3. NORMALIZZAZIONE DEI CAMPI PRINCIPALI DELL'AUDIT
-- ============================================================================

audit_normalizzato AS (
    SELECT
        dati,

        coalesce(
            nullif(dati ->> 'id', ''),
            nullif(dati ->> 'audit_id', '')
        ) AS audit_id,

        lower(
            coalesce(
                nullif(dati ->> 'tabella', ''),
                nullif(dati ->> 'table_name', ''),
                nullif(dati ->> 'nome_tabella', ''),
                nullif(dati ->> 'entita', ''),
                'NON_IDENTIFICATA'
            )
        ) AS nome_tabella,

        coalesce(
            nullif(dati ->> 'record_id', ''),
            nullif(dati ->> 'riga_id', ''),
            nullif(dati ->> 'entity_id', ''),
            nullif(dati ->> 'asset_id', '')
        ) AS record_id,

        upper(
            coalesce(
                nullif(dati ->> 'operazione', ''),
                nullif(dati ->> 'operation', ''),
                nullif(dati ->> 'azione', ''),
                nullif(dati ->> 'action', ''),
                'NON_IDENTIFICATA'
            )
        ) AS operazione,

        coalesce(
            nullif(dati ->> 'utente_email', ''),
            nullif(dati ->> 'user_email', ''),
            nullif(dati ->> 'email_utente', ''),
            nullif(dati ->> 'utente', ''),
            nullif(dati ->> 'actor', ''),
            nullif(dati ->> 'eseguito_da', ''),
            'NON_IDENTIFICATO'
        ) AS utente,

        coalesce(
            nullif(dati ->> 'utente_id', ''),
            nullif(dati ->> 'user_id', ''),
            nullif(dati ->> 'actor_id', ''),
            nullif(dati ->> 'auth_uid', '')
        ) AS utente_id,

        coalesce(
            nullif(dati ->> 'livello_autenticazione', ''),
            nullif(dati ->> 'aal', ''),
            nullif(dati ->> 'auth_aal', '')
        ) AS livello_autenticazione,

        coalesce(
            dati -> 'valore_precedente',
            dati -> 'valori_precedenti',
            dati -> 'old_values',
            dati -> 'old_data',
            dati -> 'dati_precedenti'
        ) AS valore_precedente,

        coalesce(
            dati -> 'valore_nuovo',
            dati -> 'valori_nuovi',
            dati -> 'new_values',
            dati -> 'new_data',
            dati -> 'dati_successivi'
        ) AS valore_nuovo,

        coalesce(
            nullif(dati ->> 'data_operazione', ''),
            nullif(dati ->> 'timestamp', ''),
            nullif(dati ->> 'created_at', ''),
            nullif(dati ->> 'creato_il', '')
        ) AS data_operazione

    FROM audit_rows
),

-- ============================================================================
-- 4. FUNZIONI DI AUDIT PRESENTI NEL DATABASE
--
-- pg_proc contiene anche procedure, aggregati e window function.
-- pg_get_functiondef può essere utilizzata soltanto sulle normali funzioni.
-- L'istruzione CASE impedisce quindi che venga invocata sugli aggregati.
-- ============================================================================

funzioni_audit AS (
    SELECT
        n.nspname AS schema_funzione,
        p.proname AS nome_funzione,

        pg_get_function_identity_arguments(
            p.oid
        ) AS argomenti,

        pg_get_userbyid(
            p.proowner
        ) AS proprietario,

        p.prosecdef AS security_definer,

        p.proconfig AS configurazione,

        CASE
            WHEN p.prokind = 'f'
            THEN pg_get_functiondef(p.oid)
            ELSE NULL
        END AS definizione

    FROM pg_proc AS p

    JOIN pg_namespace AS n
        ON n.oid = p.pronamespace

    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND (
          p.proname ILIKE '%audit%'

          OR CASE
              WHEN p.prokind = 'f'
              THEN pg_get_functiondef(p.oid) ILIKE '%audit_log%'
              ELSE false
          END
      )
),

-- ============================================================================
-- 5. TRIGGER DI AUDIT PRESENTI
-- ============================================================================

trigger_audit AS (
    SELECT
        ns.nspname AS schema_tabella,
        tabella.relname AS nome_tabella,
        trigger.tgname AS nome_trigger,
        funzione.proname AS nome_funzione,
        trigger.tgenabled AS stato_trigger,

        pg_get_triggerdef(
            trigger.oid,
            true
        ) AS definizione

    FROM pg_trigger AS trigger

    JOIN pg_class AS tabella
        ON tabella.oid = trigger.tgrelid

    JOIN pg_namespace AS ns
        ON ns.oid = tabella.relnamespace

    JOIN pg_proc AS funzione
        ON funzione.oid = trigger.tgfoid

    WHERE trigger.tgisinternal = false
      AND ns.nspname = 'public'
      AND (
          trigger.tgname ILIKE '%audit%'
          OR funzione.proname ILIKE '%audit%'
          OR pg_get_functiondef(funzione.oid) ILIKE '%audit_log%'
      )
),

-- ============================================================================
-- 6. COPERTURA DELLE TABELLE OPERATIVE
-- ============================================================================

copertura_audit AS (
    SELECT
        tc.ordine,
        tc.nome_tabella,
        tc.categoria,

        to_regclass(
            format(
                'public.%I',
                tc.nome_tabella
            )
        ) IS NOT NULL AS tabella_esistente,

        count(ta.nome_trigger) AS numero_trigger_audit,

        coalesce(
            jsonb_agg(
                jsonb_build_object(
                    'trigger',
                    ta.nome_trigger,
                    'funzione',
                    ta.nome_funzione,
                    'stato',
                    ta.stato_trigger
                )
                ORDER BY ta.nome_trigger
            ) FILTER (
                WHERE ta.nome_trigger IS NOT NULL
            ),
            '[]'::jsonb
        ) AS trigger

    FROM tabelle_candidate AS tc

    LEFT JOIN trigger_audit AS ta
        ON ta.nome_tabella = tc.nome_tabella

    GROUP BY
        tc.ordine,
        tc.nome_tabella,
        tc.categoria
),

-- ============================================================================
-- 7. DISTRIBUZIONE DELLE RIGHE DI AUDIT
-- ============================================================================

distribuzione_audit AS (
    SELECT
        nome_tabella,
        operazione,
        count(*) AS numero_eventi

    FROM audit_normalizzato

    GROUP BY
        nome_tabella,
        operazione
),

-- ============================================================================
-- 8. DISTRIBUZIONE DEGLI UTENTI
-- ============================================================================

distribuzione_utenti AS (
    SELECT
        utente,
        utente_id,
        livello_autenticazione,
        count(*) AS numero_eventi

    FROM audit_normalizzato

    GROUP BY
        utente,
        utente_id,
        livello_autenticazione
),

-- ============================================================================
-- 9. VERIFICA DEI PAYLOAD PRECEDENTI E SUCCESSIVI
-- ============================================================================

qualita_payload AS (
    SELECT
        count(*) AS eventi_totali,

        count(*) FILTER (
            WHERE valore_precedente IS NOT NULL
              AND valore_precedente <> 'null'::jsonb
              AND valore_precedente <> '{}'::jsonb
        ) AS eventi_con_valore_precedente,

        count(*) FILTER (
            WHERE valore_nuovo IS NOT NULL
              AND valore_nuovo <> 'null'::jsonb
              AND valore_nuovo <> '{}'::jsonb
        ) AS eventi_con_valore_nuovo,

        count(*) FILTER (
            WHERE operazione = 'UPDATE'
              AND (
                  valore_precedente IS NULL
                  OR valore_precedente = 'null'::jsonb
                  OR valore_precedente = '{}'::jsonb
              )
        ) AS aggiornamenti_senza_valore_precedente,

        count(*) FILTER (
            WHERE operazione IN (
                'INSERT',
                'UPDATE'
            )
              AND (
                  valore_nuovo IS NULL
                  OR valore_nuovo = 'null'::jsonb
                  OR valore_nuovo = '{}'::jsonb
              )
        ) AS inserimenti_o_aggiornamenti_senza_valore_nuovo

    FROM audit_normalizzato
),

-- ============================================================================
-- 10. COLONNE UTILI PER LA RISOLUZIONE DELLE ENTITA'
-- ============================================================================

colonne_identificative AS (
    SELECT
        c.table_name,
        c.column_name,
        c.data_type,
        c.is_nullable

    FROM information_schema.columns AS c

    WHERE c.table_schema = 'public'
      AND c.table_name IN (
          SELECT nome_tabella
          FROM tabelle_candidate
      )
      AND c.column_name IN (
          'id',
          'nome',
          'codice_asset',
          'codice_servizio',
          'codice_fornitore',
          'asset_id',
          'servizio_id',
          'fornitore_id',
          'servizio_padre_id',
          'servizio_figlio_id',
          'asset_padre_id',
          'asset_figlio_id',
          'fornitore_padre_id',
          'fornitore_figlio_id'
      )
),

-- ============================================================================
-- 11. AUDIT ASSET RISOLVIBILE E CONTESTO SERVIZI
--
-- Vengono considerati soltanto identificativi numerici, senza forzare cast
-- su eventuali valori non numerici.
-- ============================================================================

audit_asset AS (
    SELECT
        an.audit_id,
        an.record_id,
        an.operazione,
        an.utente,

        CASE
            WHEN an.record_id ~ '^[0-9]+$'
            THEN an.record_id::integer
            ELSE NULL
        END AS asset_id

    FROM audit_normalizzato AS an

    WHERE an.nome_tabella = 'asset'
),

contesto_asset_audit AS (
    SELECT
        aa.audit_id,
        aa.record_id,
        aa.operazione,
        aa.utente,
        aa.asset_id,

        a.codice_asset,
        a.nome AS nome_asset,

        (
            SELECT count(DISTINCT sda.servizio_id)
            FROM public.servizio_dipendenza_asset AS sda
            WHERE sda.asset_id = aa.asset_id
        ) AS servizi_diretti,

        (
            SELECT string_agg(
                DISTINCT s.nome,
                ', '
                ORDER BY s.nome
            )
            FROM public.servizio_dipendenza_asset AS sda
            JOIN public.servizio AS s
                ON s.id = sda.servizio_id
            WHERE sda.asset_id = aa.asset_id
        ) AS nomi_servizi_diretti

    FROM audit_asset AS aa

    LEFT JOIN public.asset AS a
        ON a.id = aa.asset_id
),

-- ============================================================================
-- 12. STATO RLS DELLA TABELLA AUDIT_LOG
-- ============================================================================

stato_rls AS (
    SELECT
        c.relrowsecurity AS rls_attiva,
        c.relforcerowsecurity AS force_rls

    FROM pg_class AS c

    JOIN pg_namespace AS n
        ON n.oid = c.relnamespace

    WHERE n.nspname = 'public'
      AND c.relname = 'audit_log'
      AND c.relkind = 'r'
),

-- ============================================================================
-- 13. COSTRUZIONE DEL RISULTATO CONSOLIDATO
-- ============================================================================

risultato AS (

    -- ------------------------------------------------------------------------
    -- 01. Esistenza degli oggetti principali
    -- ------------------------------------------------------------------------

    SELECT
        1 AS ordine,
        '01_ESISTENZA_OGGETTI' AS sezione,

        CASE
            WHEN to_regclass(
                'public.audit_log'
            ) IS NOT NULL
            THEN 'OK'
            ELSE 'ERRORE'
        END AS esito,

        jsonb_build_object(
            'audit_log',
            to_regclass(
                'public.audit_log'
            ) IS NOT NULL,

            'fn_audit_asset_changes',
            to_regprocedure(
                'public.fn_audit_asset_changes()'
            ) IS NOT NULL,

            'vista_supply_chain_multilivello',
            to_regclass(
                'public.vista_supply_chain_multilivello'
            ) IS NOT NULL,

            'vista_reporting_servizi_critici',
            to_regclass(
                'public.vista_reporting_servizi_critici'
            ) IS NOT NULL
        ) AS dettaglio

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 02. Struttura di audit_log
    -- ------------------------------------------------------------------------

    SELECT
        2,
        '02_STRUTTURA_AUDIT_LOG',
        'INFORMATIVO',

        coalesce(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'posizione',
                        c.ordinal_position,

                        'colonna',
                        c.column_name,

                        'tipo',
                        c.data_type,

                        'tipo_postgresql',
                        c.udt_name,

                        'nullable',
                        c.is_nullable,

                        'default',
                        c.column_default
                    )
                    ORDER BY c.ordinal_position
                )

                FROM information_schema.columns AS c

                WHERE c.table_schema = 'public'
                  AND c.table_name = 'audit_log'
            ),
            '[]'::jsonb
        )

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 03. Vincoli e indici di audit_log
    -- ------------------------------------------------------------------------

    SELECT
        3,
        '03_VINCOLI_E_INDICI',
        'INFORMATIVO',

        jsonb_build_object(
            'vincoli',
            coalesce(
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'nome',
                            con.conname,

                            'tipo',
                            con.contype,

                            'definizione',
                            pg_get_constraintdef(
                                con.oid,
                                true
                            )
                        )
                        ORDER BY con.conname
                    )

                    FROM pg_constraint AS con

                    WHERE con.conrelid =
                        'public.audit_log'::regclass
                ),
                '[]'::jsonb
            ),

            'indici',
            coalesce(
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'nome',
                            i.indexname,

                            'definizione',
                            i.indexdef
                        )
                        ORDER BY i.indexname
                    )

                    FROM pg_indexes AS i

                    WHERE i.schemaname = 'public'
                      AND i.tablename = 'audit_log'
                ),
                '[]'::jsonb
            )
        )

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 04. Funzioni di audit
    -- ------------------------------------------------------------------------

    SELECT
        4,
        '04_FUNZIONI_AUDIT',
        'INFORMATIVO',

        coalesce(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'schema',
                        schema_funzione,

                        'funzione',
                        nome_funzione,

                        'argomenti',
                        argomenti,

                        'proprietario',
                        proprietario,

                        'security_definer',
                        security_definer,

                        'configurazione',
                        configurazione,

                        'definizione',
                        definizione
                    )
                    ORDER BY
                        schema_funzione,
                        nome_funzione
                )

                FROM funzioni_audit
            ),
            '[]'::jsonb
        )

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 05. Trigger di audit
    -- ------------------------------------------------------------------------

    SELECT
        5,
        '05_TRIGGER_AUDIT',
        'INFORMATIVO',

        coalesce(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'tabella',
                        nome_tabella,

                        'trigger',
                        nome_trigger,

                        'funzione',
                        nome_funzione,

                        'stato',
                        stato_trigger,

                        'definizione',
                        definizione
                    )
                    ORDER BY
                        nome_tabella,
                        nome_trigger
                )

                FROM trigger_audit
            ),
            '[]'::jsonb
        )

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 06. Copertura delle tabelle operative
    -- ------------------------------------------------------------------------

    SELECT
        6,
        '06_COPERTURA_TABELLE_OPERATIVE',

        CASE
            WHEN count(*) FILTER (
                WHERE tabella_esistente = true
                  AND numero_trigger_audit = 0
            ) = 0
            THEN 'OK'
            ELSE 'DA_ESTENDERE'
        END,

        jsonb_build_object(
            'tabelle_candidate_esistenti',
            count(*) FILTER (
                WHERE tabella_esistente = true
            ),

            'tabelle_con_audit',
            count(*) FILTER (
                WHERE tabella_esistente = true
                  AND numero_trigger_audit > 0
            ),

            'tabelle_senza_audit',
            count(*) FILTER (
                WHERE tabella_esistente = true
                  AND numero_trigger_audit = 0
            ),

            'dettaglio',
            coalesce(
                jsonb_agg(
                    jsonb_build_object(
                        'tabella',
                        nome_tabella,

                        'categoria',
                        categoria,

                        'esistente',
                        tabella_esistente,

                        'numero_trigger_audit',
                        numero_trigger_audit,

                        'trigger',
                        trigger
                    )
                    ORDER BY ordine
                ),
                '[]'::jsonb
            )
        )

    FROM copertura_audit

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 07. Riepilogo delle righe di audit
    -- ------------------------------------------------------------------------

    SELECT
        7,
        '07_RIEPILOGO_AUDIT',

        CASE
            WHEN count(*) > 0
            THEN 'OK'
            ELSE 'ATTENZIONE'
        END,

        jsonb_build_object(
            'eventi_totali',
            count(*),

            'tabelle_distinte',
            count(
                DISTINCT nome_tabella
            ),

            'operazioni_distinte',
            count(
                DISTINCT operazione
            ),

            'utenti_distinti',
            count(
                DISTINCT utente
            ),

            'eventi_system_core',
            count(*) FILTER (
                WHERE upper(utente) = 'SYSTEM_CORE'
            ),

            'eventi_utente_non_identificato',
            count(*) FILTER (
                WHERE utente = 'NON_IDENTIFICATO'
            ),

            'eventi_con_utente_id',
            count(*) FILTER (
                WHERE utente_id IS NOT NULL
            ),

            'eventi_con_livello_autenticazione',
            count(*) FILTER (
                WHERE livello_autenticazione IS NOT NULL
            )
        )

    FROM audit_normalizzato

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 08. Distribuzione per tabella e operazione
    -- ------------------------------------------------------------------------

    SELECT
        8,
        '08_DISTRIBUZIONE_EVENTI',
        'INFORMATIVO',

        coalesce(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'tabella',
                        nome_tabella,

                        'operazione',
                        operazione,

                        'numero_eventi',
                        numero_eventi
                    )
                    ORDER BY
                        nome_tabella,
                        operazione
                )

                FROM distribuzione_audit
            ),
            '[]'::jsonb
        )

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 09. Utenti registrati
    -- ------------------------------------------------------------------------

    SELECT
        9,
        '09_UTENTI_REGISTRATI',

        CASE
            WHEN EXISTS (
                SELECT 1
                FROM distribuzione_utenti
                WHERE upper(utente) = 'SYSTEM_CORE'
                   OR utente = 'NON_IDENTIFICATO'
            )
            THEN 'DA_CORREGGERE'
            ELSE 'OK'
        END,

        coalesce(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'utente',
                        utente,

                        'utente_id',
                        utente_id,

                        'livello_autenticazione',
                        livello_autenticazione,

                        'numero_eventi',
                        numero_eventi
                    )
                    ORDER BY
                        numero_eventi DESC,
                        utente
                )

                FROM distribuzione_utenti
            ),
            '[]'::jsonb
        )

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 10. Qualità dei payload
    -- ------------------------------------------------------------------------

    SELECT
        10,
        '10_QUALITA_PAYLOAD',

        CASE
            WHEN aggiornamenti_senza_valore_precedente = 0
             AND inserimenti_o_aggiornamenti_senza_valore_nuovo = 0
            THEN 'OK'
            ELSE 'DA_CORREGGERE'
        END,

        jsonb_build_object(
            'eventi_totali',
            eventi_totali,

            'eventi_con_valore_precedente',
            eventi_con_valore_precedente,

            'eventi_con_valore_nuovo',
            eventi_con_valore_nuovo,

            'aggiornamenti_senza_valore_precedente',
            aggiornamenti_senza_valore_precedente,

            'inserimenti_o_aggiornamenti_senza_valore_nuovo',
            inserimenti_o_aggiornamenti_senza_valore_nuovo
        )

    FROM qualita_payload

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 11. Risoluzione delle entità e contesto dei servizi
    -- ------------------------------------------------------------------------

    SELECT
        11,
        '11_CONTESTO_ASSET_E_SERVIZI',
        'INFORMATIVO',

        jsonb_build_object(
            'eventi_asset',
            (
                SELECT count(*)
                FROM contesto_asset_audit
            ),

            'eventi_asset_con_record_risolto',
            (
                SELECT count(*)
                FROM contesto_asset_audit
                WHERE codice_asset IS NOT NULL
            ),

            'eventi_asset_con_servizi_diretti',
            (
                SELECT count(*)
                FROM contesto_asset_audit
                WHERE servizi_diretti > 0
            ),

            'colonne_identificative_disponibili',
            coalesce(
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'tabella',
                            table_name,

                            'colonna',
                            column_name,

                            'tipo',
                            data_type,

                            'nullable',
                            is_nullable
                        )
                        ORDER BY
                            table_name,
                            column_name
                    )

                    FROM colonne_identificative
                ),
                '[]'::jsonb
            ),

            'campione_contesto_asset',
            coalesce(
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'audit_id',
                            audit_id,

                            'record_id',
                            record_id,

                            'operazione',
                            operazione,

                            'utente',
                            utente,

                            'asset_id',
                            asset_id,

                            'codice_asset',
                            codice_asset,

                            'nome_asset',
                            nome_asset,

                            'servizi_diretti',
                            servizi_diretti,

                            'nomi_servizi_diretti',
                            nomi_servizi_diretti
                        )
                        ORDER BY audit_id DESC
                    )

                    FROM (
                        SELECT *
                        FROM contesto_asset_audit
                        ORDER BY audit_id DESC
                        LIMIT 20
                    ) AS campione
                ),
                '[]'::jsonb
            )
        )

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 12. Sicurezza e privilegi
    -- ------------------------------------------------------------------------

    SELECT
        12,
        '12_SICUREZZA_E_PRIVILEGI',

        CASE
            WHEN coalesce(
                    (
                        SELECT rls_attiva
                        FROM stato_rls
                    ),
                    false
                 ) = true

             AND has_table_privilege(
                    'anon',
                    'public.audit_log',
                    'SELECT'
                 ) = false

             AND has_table_privilege(
                    'anon',
                    'public.audit_log',
                    'INSERT'
                 ) = false

             AND has_table_privilege(
                    'authenticated',
                    'public.audit_log',
                    'SELECT'
                 ) = true

             AND has_table_privilege(
                    'authenticated',
                    'public.audit_log',
                    'INSERT'
                 ) = false

             AND has_table_privilege(
                    'authenticated',
                    'public.audit_log',
                    'UPDATE'
                 ) = false

             AND has_table_privilege(
                    'authenticated',
                    'public.audit_log',
                    'DELETE'
                 ) = false
            THEN 'OK'
            ELSE 'DA_CORREGGERE'
        END,

        jsonb_build_object(
            'rls_attiva',
            coalesce(
                (
                    SELECT rls_attiva
                    FROM stato_rls
                ),
                false
            ),

            'force_rls',
            coalesce(
                (
                    SELECT force_rls
                    FROM stato_rls
                ),
                false
            ),

            'anon_select',
            has_table_privilege(
                'anon',
                'public.audit_log',
                'SELECT'
            ),

            'anon_insert',
            has_table_privilege(
                'anon',
                'public.audit_log',
                'INSERT'
            ),

            'anon_update',
            has_table_privilege(
                'anon',
                'public.audit_log',
                'UPDATE'
            ),

            'anon_delete',
            has_table_privilege(
                'anon',
                'public.audit_log',
                'DELETE'
            ),

            'authenticated_select',
            has_table_privilege(
                'authenticated',
                'public.audit_log',
                'SELECT'
            ),

            'authenticated_insert',
            has_table_privilege(
                'authenticated',
                'public.audit_log',
                'INSERT'
            ),

            'authenticated_update',
            has_table_privilege(
                'authenticated',
                'public.audit_log',
                'UPDATE'
            ),

            'authenticated_delete',
            has_table_privilege(
                'authenticated',
                'public.audit_log',
                'DELETE'
            ),

            'policy',
            coalesce(
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'policy',
                            p.policyname,

                            'ruoli',
                            p.roles,

                            'comando',
                            p.cmd,

                            'using',
                            p.qual,

                            'with_check',
                            p.with_check
                        )
                        ORDER BY p.policyname
                    )

                    FROM pg_policies AS p

                    WHERE p.schemaname = 'public'
                      AND p.tablename = 'audit_log'
                ),
                '[]'::jsonb
            )
        )

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 13. Esito diagnostico complessivo
    -- ------------------------------------------------------------------------

    SELECT
        13,
        '13_ESITO_DIAGNOSTICO',

        CASE
            WHEN to_regclass(
                'public.audit_log'
            ) IS NULL
            THEN 'ERRORE'

            WHEN (
                SELECT count(*)
                FROM copertura_audit
                WHERE tabella_esistente = true
                  AND numero_trigger_audit = 0
            ) > 0
            THEN 'PRONTO_PER_ESTENSIONE'

            WHEN EXISTS (
                SELECT 1
                FROM audit_normalizzato
                WHERE upper(utente) = 'SYSTEM_CORE'
                   OR utente = 'NON_IDENTIFICATO'
            )
            THEN 'PRONTO_PER_ESTENSIONE'

            WHEN (
                SELECT
                    aggiornamenti_senza_valore_precedente
                    +
                    inserimenti_o_aggiornamenti_senza_valore_nuovo
                FROM qualita_payload
            ) > 0
            THEN 'PRONTO_PER_ESTENSIONE'

            ELSE 'NESSUNA_ANOMALIA_BLOCCANTE_RILEVATA'
        END,

        jsonb_build_object(
            'tabelle_candidate_esistenti',
            (
                SELECT count(*)
                FROM copertura_audit
                WHERE tabella_esistente = true
            ),

            'tabelle_con_trigger_audit',
            (
                SELECT count(*)
                FROM copertura_audit
                WHERE tabella_esistente = true
                  AND numero_trigger_audit > 0
            ),

            'tabelle_senza_trigger_audit',
            (
                SELECT count(*)
                FROM copertura_audit
                WHERE tabella_esistente = true
                  AND numero_trigger_audit = 0
            ),

            'eventi_totali',
            (
                SELECT count(*)
                FROM audit_normalizzato
            ),

            'eventi_system_core',
            (
                SELECT count(*)
                FROM audit_normalizzato
                WHERE upper(utente) = 'SYSTEM_CORE'
            ),

            'eventi_utente_non_identificato',
            (
                SELECT count(*)
                FROM audit_normalizzato
                WHERE utente = 'NON_IDENTIFICATO'
            ),

            'aggiornamenti_senza_valore_precedente',
            (
                SELECT aggiornamenti_senza_valore_precedente
                FROM qualita_payload
            ),

            'inserimenti_o_aggiornamenti_senza_valore_nuovo',
            (
                SELECT
                    inserimenti_o_aggiornamenti_senza_valore_nuovo
                FROM qualita_payload
            ),

            'prossimo_obiettivo',
            'Progettare un audit generalizzato con utente JWT, payload JSONB e vista di reporting ricercabile.'
        )
)

-- ============================================================================
-- RISULTATO FINALE UNICO
-- ============================================================================

SELECT
    sezione,
    esito,
    dettaglio
FROM risultato
ORDER BY ordine;