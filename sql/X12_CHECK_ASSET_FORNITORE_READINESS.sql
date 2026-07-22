-- ============================================================================
-- FILE: sql/X12_CHECK_ASSET_FORNITORE_READINESS.sql
-- TIPO: SCRIPT DIAGNOSTICO PERMANENTE - SOLA LETTURA
-- VERSIONE: 1.0
--
-- PROGETTO:
--   NIS2 Asset Inventory Manager
--
-- SCOPO:
--   Verificare lo stato del dominio asset-fornitori prima della creazione
--   di una relazione diretta e storicizzabile tra le due entità.
--
-- OBIETTIVI:
--   1. verificare l'esistenza e la struttura delle tabelle coinvolte;
--   2. controllare codici stabili e qualità dei dati;
--   3. verificare le dipendenze servizio-asset e servizio-fornitore;
--   4. individuare eventuali riferimenti orfani;
--   5. calcolare le coppie asset-fornitore desumibili dai servizi comuni;
--   6. evitare che tali coppie siano considerate automaticamente relazioni
--      dirette senza una verifica semantica;
--   7. verificare vincoli, RLS e privilegi applicativi.
--
-- RISULTATO:
--   Lo script restituisce un unico result set, compatibile con il
--   comportamento del Supabase SQL Editor.
--
-- SICUREZZA:
--   Lo script contiene esclusivamente interrogazioni SELECT.
--   Non modifica schema, dati, policy o privilegi.
-- ============================================================================

WITH

-- ============================================================================
-- 1. LETTURA TOLLERANTE DELLE TABELLE COINVOLTE
--
-- La conversione in JSONB permette di analizzare le colonne senza dipendere
-- dalla presenza di attributi opzionali.
-- ============================================================================

asset_rows AS (
    SELECT to_jsonb(a) AS dati
    FROM public.asset AS a
),

fornitore_rows AS (
    SELECT to_jsonb(f) AS dati
    FROM public.fornitore AS f
),

servizio_rows AS (
    SELECT to_jsonb(s) AS dati
    FROM public.servizio AS s
),

dipendenza_asset_rows AS (
    SELECT to_jsonb(sda) AS dati
    FROM public.servizio_dipendenza_asset AS sda
),

dipendenza_fornitore_rows AS (
    SELECT to_jsonb(sdf) AS dati
    FROM public.servizio_dipendenza_fornitore AS sdf
),

-- ============================================================================
-- 2. NORMALIZZAZIONE DEGLI ASSET
-- ============================================================================

asset_normalizzati AS (
    SELECT
        dati ->> 'id' AS asset_id,

        coalesce(
            nullif(dati ->> 'codice_asset', ''),
            'ASSET_SENZA_CODICE'
        ) AS codice_asset,

        coalesce(
            nullif(dati ->> 'nome', ''),
            'Asset senza nome'
        ) AS nome_asset

    FROM asset_rows
),

-- ============================================================================
-- 3. NORMALIZZAZIONE DEI FORNITORI
-- ============================================================================

fornitori_normalizzati AS (
    SELECT
        dati ->> 'id' AS fornitore_id,

        coalesce(
            nullif(dati ->> 'codice_fornitore', ''),
            'FORNITORE_SENZA_CODICE'
        ) AS codice_fornitore,

        coalesce(
            nullif(dati ->> 'nome', ''),
            'Fornitore senza nome'
        ) AS nome_fornitore

    FROM fornitore_rows
),

-- ============================================================================
-- 4. RELAZIONI SERVIZIO-ASSET NORMALIZZATE
-- ============================================================================

dipendenze_asset_normalizzate AS (
    SELECT
        dati ->> 'servizio_id' AS servizio_id,
        dati ->> 'asset_id' AS asset_id,
        dati
    FROM dipendenza_asset_rows
),

-- ============================================================================
-- 5. RELAZIONI SERVIZIO-FORNITORE NORMALIZZATE
-- ============================================================================

dipendenze_fornitore_normalizzate AS (
    SELECT
        dati ->> 'servizio_id' AS servizio_id,
        dati ->> 'fornitore_id' AS fornitore_id,
        dati
    FROM dipendenza_fornitore_rows
),

-- ============================================================================
-- 6. DIPENDENZE ORFANE SERVIZIO-ASSET
-- ============================================================================

dipendenze_asset_orfane AS (
    SELECT
        da.dati,

        CASE
            WHEN NOT EXISTS (
                SELECT 1
                FROM servizio_rows AS s
                WHERE s.dati ->> 'id' = da.servizio_id
            )
            THEN 'SERVIZIO_NON_ESISTENTE'

            WHEN NOT EXISTS (
                SELECT 1
                FROM asset_rows AS a
                WHERE a.dati ->> 'id' = da.asset_id
            )
            THEN 'ASSET_NON_ESISTENTE'

            ELSE NULL
        END AS anomalia

    FROM dipendenze_asset_normalizzate AS da
),

-- ============================================================================
-- 7. DIPENDENZE ORFANE SERVIZIO-FORNITORE
-- ============================================================================

dipendenze_fornitore_orfane AS (
    SELECT
        df.dati,

        CASE
            WHEN NOT EXISTS (
                SELECT 1
                FROM servizio_rows AS s
                WHERE s.dati ->> 'id' = df.servizio_id
            )
            THEN 'SERVIZIO_NON_ESISTENTE'

            WHEN NOT EXISTS (
                SELECT 1
                FROM fornitore_rows AS f
                WHERE f.dati ->> 'id' = df.fornitore_id
            )
            THEN 'FORNITORE_NON_ESISTENTE'

            ELSE NULL
        END AS anomalia

    FROM dipendenze_fornitore_normalizzate AS df
),

-- ============================================================================
-- 8. COPPIE ASSET-FORNITORE DERIVATE DAI SERVIZI COMUNI
--
-- Queste coppie rappresentano soltanto una correlazione indiretta:
-- l'asset e il fornitore risultano associati allo stesso servizio.
--
-- Non costituiscono ancora una prova di:
--   - proprietà;
--   - fornitura;
--   - manutenzione;
--   - licenza;
--   - hosting;
--   - supporto.
-- ============================================================================

coppie_per_servizio AS (
    SELECT DISTINCT
        da.servizio_id,
        da.asset_id,
        df.fornitore_id

    FROM dipendenze_asset_normalizzate AS da

    JOIN dipendenze_fornitore_normalizzate AS df
        ON df.servizio_id = da.servizio_id

    WHERE nullif(da.servizio_id, '') IS NOT NULL
      AND nullif(da.asset_id, '') IS NOT NULL
      AND nullif(df.fornitore_id, '') IS NOT NULL
),

-- ============================================================================
-- 9. AGGREGAZIONE DELLE COPPIE ASSET-FORNITORE
-- ============================================================================

coppie_asset_fornitore AS (
    SELECT
        cps.asset_id,
        cps.fornitore_id,
        count(DISTINCT cps.servizio_id) AS servizi_comuni,

        array_agg(
            DISTINCT cps.servizio_id
            ORDER BY cps.servizio_id
        ) AS servizi_id

    FROM coppie_per_servizio AS cps

    GROUP BY
        cps.asset_id,
        cps.fornitore_id
),

-- ============================================================================
-- 10. DETTAGLIO LEGGIBILE DELLE COPPIE CANDIDATE
-- ============================================================================

dettaglio_coppie AS (
    SELECT
        caf.asset_id,
        a.codice_asset,
        a.nome_asset,

        caf.fornitore_id,
        f.codice_fornitore,
        f.nome_fornitore,

        caf.servizi_comuni,
        caf.servizi_id

    FROM coppie_asset_fornitore AS caf

    LEFT JOIN asset_normalizzati AS a
        ON a.asset_id = caf.asset_id

    LEFT JOIN fornitori_normalizzati AS f
        ON f.fornitore_id = caf.fornitore_id
),

-- ============================================================================
-- 11. ASSET SENZA ALCUN FORNITORE INDIRETTAMENTE ASSOCIATO
-- ============================================================================

asset_senza_fornitore_candidato AS (
    SELECT
        a.asset_id,
        a.codice_asset,
        a.nome_asset

    FROM asset_normalizzati AS a

    WHERE NOT EXISTS (
        SELECT 1
        FROM coppie_asset_fornitore AS caf
        WHERE caf.asset_id = a.asset_id
    )
),

-- ============================================================================
-- 12. FORNITORI SENZA ALCUN ASSET INDIRETTAMENTE ASSOCIATO
-- ============================================================================

fornitori_senza_asset_candidato AS (
    SELECT
        f.fornitore_id,
        f.codice_fornitore,
        f.nome_fornitore

    FROM fornitori_normalizzati AS f

    WHERE NOT EXISTS (
        SELECT 1
        FROM coppie_asset_fornitore AS caf
        WHERE caf.fornitore_id = f.fornitore_id
    )
),

-- ============================================================================
-- 13. STATO RLS DELLE TABELLE COINVOLTE
-- ============================================================================

stato_rls AS (
    SELECT
        c.relname AS tabella,
        c.relrowsecurity AS rls_attiva,
        c.relforcerowsecurity AS force_rls

    FROM pg_class AS c

    JOIN pg_namespace AS n
        ON n.oid = c.relnamespace

    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname IN (
          'asset',
          'fornitore',
          'servizio_dipendenza_asset',
          'servizio_dipendenza_fornitore'
      )
),

-- ============================================================================
-- 14. PRIVILEGI APPLICATIVI
-- ============================================================================

privilegi AS (
    SELECT
        c.relname AS tabella,

        has_table_privilege(
            'anon',
            c.oid,
            'SELECT'
        ) AS anon_select,

        has_table_privilege(
            'anon',
            c.oid,
            'INSERT'
        ) AS anon_insert,

        has_table_privilege(
            'anon',
            c.oid,
            'UPDATE'
        ) AS anon_update,

        has_table_privilege(
            'anon',
            c.oid,
            'DELETE'
        ) AS anon_delete,

        has_table_privilege(
            'authenticated',
            c.oid,
            'SELECT'
        ) AS authenticated_select,

        has_table_privilege(
            'authenticated',
            c.oid,
            'INSERT'
        ) AS authenticated_insert,

        has_table_privilege(
            'authenticated',
            c.oid,
            'UPDATE'
        ) AS authenticated_update,

        has_table_privilege(
            'authenticated',
            c.oid,
            'DELETE'
        ) AS authenticated_delete

    FROM pg_class AS c

    JOIN pg_namespace AS n
        ON n.oid = c.relnamespace

    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname IN (
          'asset',
          'fornitore',
          'servizio_dipendenza_asset',
          'servizio_dipendenza_fornitore'
      )
),

-- ============================================================================
-- 15. COSTRUZIONE DEL RISULTATO CONSOLIDATO
-- ============================================================================

risultato AS (

    -- ------------------------------------------------------------------------
    -- 01. Esistenza delle tabelle
    -- ------------------------------------------------------------------------

    SELECT
        1 AS ordine,
        '01_ESISTENZA_TABELLE' AS sezione,
        'INFORMATIVO' AS esito,

        jsonb_build_object(
            'asset',
            to_regclass('public.asset') IS NOT NULL,

            'fornitore',
            to_regclass('public.fornitore') IS NOT NULL,

            'servizio_dipendenza_asset',
            to_regclass(
                'public.servizio_dipendenza_asset'
            ) IS NOT NULL,

            'servizio_dipendenza_fornitore',
            to_regclass(
                'public.servizio_dipendenza_fornitore'
            ) IS NOT NULL,

            'tipo_relazione_asset_fornitore_gia_esistente',
            to_regclass(
                'public.tipo_relazione_asset_fornitore'
            ) IS NOT NULL,

            'asset_fornitore_gia_esistente',
            to_regclass(
                'public.asset_fornitore'
            ) IS NOT NULL
        ) AS dettaglio

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 02. Struttura della tabella asset
    -- ------------------------------------------------------------------------

    SELECT
        2,
        '02_STRUTTURA_ASSET',
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
                  AND c.table_name = 'asset'
            ),
            '[]'::jsonb
        )

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 03. Struttura della tabella fornitore
    -- ------------------------------------------------------------------------

    SELECT
        3,
        '03_STRUTTURA_FORNITORE',
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
                  AND c.table_name = 'fornitore'
            ),
            '[]'::jsonb
        )

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 04. Riepilogo delle entità
    -- ------------------------------------------------------------------------

    SELECT
        4,
        '04_RIEPILOGO_ENTITA',

        CASE
            WHEN
                (SELECT count(*) FROM asset_rows) > 0
                AND
                (SELECT count(*) FROM fornitore_rows) > 0
            THEN 'OK'
            ELSE 'ATTENZIONE'
        END,

        jsonb_build_object(
            'numero_asset',
            (
                SELECT count(*)
                FROM asset_rows
            ),

            'numero_fornitori',
            (
                SELECT count(*)
                FROM fornitore_rows
            ),

            'asset_senza_codice',
            (
                SELECT count(*)
                FROM asset_rows
                WHERE nullif(
                    btrim(dati ->> 'codice_asset'),
                    ''
                ) IS NULL
            ),

            'fornitori_senza_codice',
            (
                SELECT count(*)
                FROM fornitore_rows
                WHERE nullif(
                    btrim(dati ->> 'codice_fornitore'),
                    ''
                ) IS NULL
            )
        )

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 05. Riepilogo delle dipendenze esistenti
    -- ------------------------------------------------------------------------

    SELECT
        5,
        '05_RIEPILOGO_DIPENDENZE',
        'INFORMATIVO',

        jsonb_build_object(
            'relazioni_servizio_asset',
            (
                SELECT count(*)
                FROM dipendenza_asset_rows
            ),

            'servizi_con_asset',
            (
                SELECT count(
                    DISTINCT dati ->> 'servizio_id'
                )
                FROM dipendenza_asset_rows
            ),

            'asset_collegati_ai_servizi',
            (
                SELECT count(
                    DISTINCT dati ->> 'asset_id'
                )
                FROM dipendenza_asset_rows
            ),

            'relazioni_servizio_fornitore',
            (
                SELECT count(*)
                FROM dipendenza_fornitore_rows
            ),

            'servizi_con_fornitori',
            (
                SELECT count(
                    DISTINCT dati ->> 'servizio_id'
                )
                FROM dipendenza_fornitore_rows
            ),

            'fornitori_collegati_ai_servizi',
            (
                SELECT count(
                    DISTINCT dati ->> 'fornitore_id'
                )
                FROM dipendenza_fornitore_rows
            )
        )

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 06. Dipendenze servizio-asset orfane
    -- ------------------------------------------------------------------------

    SELECT
        6,
        '06_DIPENDENZE_ASSET_ORFANE',

        CASE
            WHEN count(*) FILTER (
                WHERE anomalia IS NOT NULL
            ) = 0
            THEN 'OK'
            ELSE 'ERRORE'
        END,

        coalesce(
            jsonb_agg(
                jsonb_build_object(
                    'anomalia',
                    anomalia,

                    'relazione',
                    dati
                )
            ) FILTER (
                WHERE anomalia IS NOT NULL
            ),
            '[]'::jsonb
        )

    FROM dipendenze_asset_orfane

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 07. Dipendenze servizio-fornitore orfane
    -- ------------------------------------------------------------------------

    SELECT
        7,
        '07_DIPENDENZE_FORNITORE_ORFANE',

        CASE
            WHEN count(*) FILTER (
                WHERE anomalia IS NOT NULL
            ) = 0
            THEN 'OK'
            ELSE 'ERRORE'
        END,

        coalesce(
            jsonb_agg(
                jsonb_build_object(
                    'anomalia',
                    anomalia,

                    'relazione',
                    dati
                )
            ) FILTER (
                WHERE anomalia IS NOT NULL
            ),
            '[]'::jsonb
        )

    FROM dipendenze_fornitore_orfane

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 08. Numero di coppie asset-fornitore candidate
    -- ------------------------------------------------------------------------

    SELECT
        8,
        '08_COPPIE_ASSET_FORNITORE_CANDIDATE',
        'INFORMATIVO',

        jsonb_build_object(
            'numero_coppie_distinte',
            count(*),

            'coppie_con_un_servizio_comune',
            count(*) FILTER (
                WHERE servizi_comuni = 1
            ),

            'coppie_con_piu_servizi_comuni',
            count(*) FILTER (
                WHERE servizi_comuni > 1
            )
        )

    FROM coppie_asset_fornitore

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 09. Dettaglio delle coppie candidate
    -- ------------------------------------------------------------------------

    SELECT
        9,
        '09_DETTAGLIO_COPPIE_CANDIDATE',
        'DA_VALIDARE',

        coalesce(
            jsonb_agg(
                jsonb_build_object(
                    'asset_id',
                    asset_id,

                    'codice_asset',
                    codice_asset,

                    'nome_asset',
                    nome_asset,

                    'fornitore_id',
                    fornitore_id,

                    'codice_fornitore',
                    codice_fornitore,

                    'nome_fornitore',
                    nome_fornitore,

                    'servizi_comuni',
                    servizi_comuni,

                    'servizi_id',
                    servizi_id
                )
                ORDER BY
                    codice_asset,
                    codice_fornitore
            ),
            '[]'::jsonb
        )

    FROM dettaglio_coppie

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 10. Asset senza fornitore candidato
    -- ------------------------------------------------------------------------

    SELECT
        10,
        '10_ASSET_SENZA_FORNITORE_CANDIDATO',
        'INFORMATIVO',

        coalesce(
            jsonb_agg(
                jsonb_build_object(
                    'asset_id',
                    asset_id,

                    'codice_asset',
                    codice_asset,

                    'nome_asset',
                    nome_asset
                )
                ORDER BY codice_asset
            ),
            '[]'::jsonb
        )

    FROM asset_senza_fornitore_candidato

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 11. Fornitori senza asset candidato
    -- ------------------------------------------------------------------------

    SELECT
        11,
        '11_FORNITORI_SENZA_ASSET_CANDIDATO',
        'INFORMATIVO',

        coalesce(
            jsonb_agg(
                jsonb_build_object(
                    'fornitore_id',
                    fornitore_id,

                    'codice_fornitore',
                    codice_fornitore,

                    'nome_fornitore',
                    nome_fornitore
                )
                ORDER BY codice_fornitore
            ),
            '[]'::jsonb
        )

    FROM fornitori_senza_asset_candidato

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 12. Vincoli delle tabelle coinvolte
    -- ------------------------------------------------------------------------

    SELECT
        12,
        '12_VINCOLI_DATABASE',
        'INFORMATIVO',

        coalesce(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'tabella',
                        rel.relname,

                        'vincolo',
                        pc.conname,

                        'tipo',
                        pc.contype,

                        'definizione',
                        pg_get_constraintdef(
                            pc.oid,
                            true
                        )
                    )
                    ORDER BY
                        rel.relname,
                        pc.conname
                )

                FROM pg_constraint AS pc

                JOIN pg_class AS rel
                    ON rel.oid = pc.conrelid

                JOIN pg_namespace AS ns
                    ON ns.oid = rel.relnamespace

                WHERE ns.nspname = 'public'
                  AND rel.relname IN (
                      'asset',
                      'fornitore',
                      'servizio_dipendenza_asset',
                      'servizio_dipendenza_fornitore'
                  )
            ),
            '[]'::jsonb
        )

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 13. Stato RLS
    -- ------------------------------------------------------------------------

    SELECT
        13,
        '13_STATO_RLS',

        CASE
            WHEN bool_and(rls_attiva)
            THEN 'OK'
            ELSE 'ERRORE'
        END,

        coalesce(
            jsonb_agg(
                jsonb_build_object(
                    'tabella',
                    tabella,

                    'rls_attiva',
                    rls_attiva,

                    'force_rls',
                    force_rls
                )
                ORDER BY tabella
            ),
            '[]'::jsonb
        )

    FROM stato_rls

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 14. Policy RLS
    -- ------------------------------------------------------------------------

    SELECT
        14,
        '14_POLICY_RLS',
        'INFORMATIVO',

        coalesce(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'tabella',
                        p.tablename,

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
                    ORDER BY
                        p.tablename,
                        p.policyname
                )

                FROM pg_policies AS p

                WHERE p.schemaname = 'public'
                  AND p.tablename IN (
                      'asset',
                      'fornitore',
                      'servizio_dipendenza_asset',
                      'servizio_dipendenza_fornitore'
                  )
            ),
            '[]'::jsonb
        )

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 15. Privilegi applicativi
    -- ------------------------------------------------------------------------

    SELECT
        15,
        '15_PRIVILEGI_APPLICATIVI',

        CASE
            WHEN bool_and(
                anon_select = false
                AND anon_insert = false
                AND anon_update = false
                AND anon_delete = false
                AND authenticated_delete = false
            )
            THEN 'OK'
            ELSE 'ATTENZIONE'
        END,

        coalesce(
            jsonb_agg(
                jsonb_build_object(
                    'tabella',
                    tabella,

                    'anon_select',
                    anon_select,

                    'anon_insert',
                    anon_insert,

                    'anon_update',
                    anon_update,

                    'anon_delete',
                    anon_delete,

                    'authenticated_select',
                    authenticated_select,

                    'authenticated_insert',
                    authenticated_insert,

                    'authenticated_update',
                    authenticated_update,

                    'authenticated_delete',
                    authenticated_delete
                )
                ORDER BY tabella
            ),
            '[]'::jsonb
        )

    FROM privilegi
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