-- ============================================================================
-- FILE: X11_CHECK_FORNITORE_HIERARCHY_READINESS.sql
-- TIPO: SCRIPT DIAGNOSTICO PERMANENTE - SOLA LETTURA
-- VERSIONE: 1.1
--
-- SCOPO:
--   Verificare lo stato del dominio fornitori prima dell'introduzione della
--   gerarchia fornitore-subfornitore prevista nella migrazione produttiva 15.
--
-- CARATTERISTICHE:
--   - restituisce un unico result set compatibile con Supabase SQL Editor;
--   - non modifica schema o dati;
--   - non crea tabelle, funzioni o oggetti permanenti;
--   - raccoglie struttura, qualità dati, relazioni, sicurezza e privilegi.
--
-- CLASSIFICAZIONE:
--   Diagnostica permanente da conservare nella cartella /sql.
-- ============================================================================

WITH

-- ============================================================================
-- 1. DATI DELLA TABELLA FORNITORE CONVERTITI IN JSONB
--
-- L'uso di JSONB consente alla diagnostica di leggere i campi in modo
-- tollerante, evitando errori nel caso in cui alcuni attributi opzionali
-- abbiano nomi o strutture differenti.
-- ============================================================================

fornitore_rows AS (
    SELECT to_jsonb(f) AS dati
    FROM public.fornitore AS f
),

tipo_fornitore_rows AS (
    SELECT to_jsonb(tf) AS dati
    FROM public.tipo_fornitore AS tf
),

servizio_rows AS (
    SELECT to_jsonb(s) AS dati
    FROM public.servizio AS s
),

dipendenza_fornitore_rows AS (
    SELECT to_jsonb(sdf) AS dati
    FROM public.servizio_dipendenza_fornitore AS sdf
),

tipo_dipendenza_rows AS (
    SELECT to_jsonb(tds) AS dati
    FROM public.tipo_dipendenza_servizio AS tds
),

-- ============================================================================
-- 2. NORMALIZZAZIONE DEI NOMI E SIMULAZIONE DEI CODICI STABILI
-- ============================================================================

codici_proposti AS (
    SELECT
        dati ->> 'id' AS fornitore_id,
        dati ->> 'nome' AS nome_fornitore,

        upper(
            trim(
                both '_'
                FROM regexp_replace(
                    regexp_replace(
                        coalesce(btrim(dati ->> 'nome'), ''),
                        '[^a-zA-Z0-9]+',
                        '_',
                        'g'
                    ),
                    '_+',
                    '_',
                    'g'
                )
            )
        ) AS codice_proposto

    FROM fornitore_rows
),

-- ============================================================================
-- 3. DUPLICATI NEI NOMI DEI FORNITORI
-- ============================================================================

duplicati_nome AS (
    SELECT
        lower(btrim(dati ->> 'nome')) AS nome_normalizzato,
        count(*) AS occorrenze,

        jsonb_agg(
            jsonb_build_object(
                'id', dati ->> 'id',
                'nome', dati ->> 'nome'
            )
            ORDER BY dati ->> 'id'
        ) AS fornitori

    FROM fornitore_rows

    WHERE nullif(btrim(dati ->> 'nome'), '') IS NOT NULL

    GROUP BY lower(btrim(dati ->> 'nome'))

    HAVING count(*) > 1
),

-- ============================================================================
-- 4. COLLISIONI TRA I CODICI STABILI PROPOSTI
-- ============================================================================

collisioni_codice AS (
    SELECT
        codice_proposto,
        count(*) AS occorrenze,

        jsonb_agg(
            jsonb_build_object(
                'id', fornitore_id,
                'nome', nome_fornitore
            )
            ORDER BY fornitore_id
        ) AS fornitori

    FROM codici_proposti

    GROUP BY codice_proposto

    HAVING count(*) > 1
),

-- ============================================================================
-- 5. DISTRIBUZIONE DEI FORNITORI PER TIPOLOGIA
-- ============================================================================

distribuzione_tipi AS (
    SELECT
        tf.dati ->> 'id' AS tipo_fornitore_id,

        coalesce(
            nullif(tf.dati ->> 'nome', ''),
            nullif(tf.dati ->> 'codice', ''),
            nullif(tf.dati ->> 'descrizione', ''),
            'TIPO NON DENOMINATO'
        ) AS tipo_fornitore,

        count(f.dati) AS numero_fornitori

    FROM tipo_fornitore_rows AS tf

    LEFT JOIN fornitore_rows AS f
        ON f.dati ->> 'tipo_fornitore_id' = tf.dati ->> 'id'

    GROUP BY
        tf.dati ->> 'id',
        coalesce(
            nullif(tf.dati ->> 'nome', ''),
            nullif(tf.dati ->> 'codice', ''),
            nullif(tf.dati ->> 'descrizione', ''),
            'TIPO NON DENOMINATO'
        )
),

-- ============================================================================
-- 6. DIPENDENZE ORFANE TRA SERVIZI E FORNITORI
-- ============================================================================

dipendenze_orfane AS (
    SELECT
        d.dati,

        CASE
            WHEN NOT EXISTS (
                SELECT 1
                FROM servizio_rows AS s
                WHERE s.dati ->> 'id' = d.dati ->> 'servizio_id'
            )
            THEN 'SERVIZIO_NON_ESISTENTE'

            WHEN NOT EXISTS (
                SELECT 1
                FROM fornitore_rows AS f
                WHERE f.dati ->> 'id' = d.dati ->> 'fornitore_id'
            )
            THEN 'FORNITORE_NON_ESISTENTE'

            WHEN nullif(d.dati ->> 'tipo_dipendenza_servizio_id', '') IS NOT NULL
             AND NOT EXISTS (
                SELECT 1
                FROM tipo_dipendenza_rows AS td
                WHERE td.dati ->> 'id'
                    = d.dati ->> 'tipo_dipendenza_servizio_id'
            )
            THEN 'TIPO_DIPENDENZA_NON_ESISTENTE'

            ELSE NULL
        END AS anomalia

    FROM dipendenza_fornitore_rows AS d
),

-- ============================================================================
-- 7. STATO DELLE TABELLE E DELLA ROW LEVEL SECURITY
-- ============================================================================

stato_tabelle AS (
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
          'fornitore',
          'tipo_fornitore',
          'servizio_dipendenza_fornitore'
      )
),

-- ============================================================================
-- 8. PRIVILEGI APPLICATIVI
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
          'fornitore',
          'tipo_fornitore',
          'servizio_dipendenza_fornitore'
      )
),

-- ============================================================================
-- 9. CREAZIONE DEL RISULTATO CONSOLIDATO
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
            'fornitore',
            to_regclass('public.fornitore') IS NOT NULL,

            'tipo_fornitore',
            to_regclass('public.tipo_fornitore') IS NOT NULL,

            'servizio_dipendenza_fornitore',
            to_regclass(
                'public.servizio_dipendenza_fornitore'
            ) IS NOT NULL,

            'tipo_relazione_fornitore_gia_esistente',
            to_regclass(
                'public.tipo_relazione_fornitore'
            ) IS NOT NULL,

            'fornitore_relazione_gia_esistente',
            to_regclass(
                'public.fornitore_relazione'
            ) IS NOT NULL
        ) AS dettaglio

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 02. Struttura della tabella fornitore
    -- ------------------------------------------------------------------------

    SELECT
        2,
        '02_STRUTTURA_FORNITORE',
        'INFORMATIVO',

        coalesce(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'posizione', c.ordinal_position,
                        'colonna', c.column_name,
                        'tipo', c.data_type,
                        'tipo_postgresql', c.udt_name,
                        'lunghezza_massima',
                            c.character_maximum_length,
                        'nullable', c.is_nullable,
                        'default', c.column_default
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
    -- 03. Riepilogo dei dati presenti
    -- ------------------------------------------------------------------------

    SELECT
        3,
        '03_RIEPILOGO_FORNITORI',

        CASE
            WHEN count(*) = 0
                THEN 'ATTENZIONE'
            ELSE 'OK'
        END,

        jsonb_build_object(
            'numero_fornitori',
            count(*),

            'fornitori_senza_nome',
            count(*) FILTER (
                WHERE nullif(
                    btrim(dati ->> 'nome'),
                    ''
                ) IS NULL
            ),

            'fornitori_senza_tipo',
            count(*) FILTER (
                WHERE nullif(
                    dati ->> 'tipo_fornitore_id',
                    ''
                ) IS NULL
            ),

            'fornitori_con_codice_gia_presente',
            count(*) FILTER (
                WHERE nullif(
                    btrim(dati ->> 'codice_fornitore'),
                    ''
                ) IS NOT NULL
            )
        )

    FROM fornitore_rows

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 04. Duplicati nei nomi
    -- ------------------------------------------------------------------------

    SELECT
        4,
        '04_DUPLICATI_NOME',

        CASE
            WHEN count(*) = 0
                THEN 'OK'
            ELSE 'ATTENZIONE'
        END,

        coalesce(
            jsonb_agg(
                jsonb_build_object(
                    'nome_normalizzato',
                    nome_normalizzato,

                    'occorrenze',
                    occorrenze,

                    'fornitori',
                    fornitori
                )
                ORDER BY nome_normalizzato
            ),
            '[]'::jsonb
        )

    FROM duplicati_nome

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 05. Codici applicativi proposti
    -- ------------------------------------------------------------------------

    SELECT
        5,
        '05_CODICI_FORNITORE_PROPOSTI',

        CASE
            WHEN count(*) FILTER (
                WHERE nullif(codice_proposto, '') IS NULL
            ) > 0
                THEN 'ATTENZIONE'
            ELSE 'OK'
        END,

        coalesce(
            jsonb_agg(
                jsonb_build_object(
                    'id',
                    fornitore_id,

                    'nome',
                    nome_fornitore,

                    'codice_proposto',
                    codice_proposto,

                    'lunghezza_codice',
                    char_length(codice_proposto)
                )
                ORDER BY fornitore_id
            ),
            '[]'::jsonb
        )

    FROM codici_proposti

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 06. Collisioni tra i codici proposti
    -- ------------------------------------------------------------------------

    SELECT
        6,
        '06_COLLISIONI_CODICI',

        CASE
            WHEN count(*) = 0
                THEN 'OK'
            ELSE 'ATTENZIONE'
        END,

        coalesce(
            jsonb_agg(
                jsonb_build_object(
                    'codice',
                    codice_proposto,

                    'occorrenze',
                    occorrenze,

                    'fornitori',
                    fornitori
                )
                ORDER BY codice_proposto
            ),
            '[]'::jsonb
        )

    FROM collisioni_codice

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 07. Distribuzione per tipologia
    -- ------------------------------------------------------------------------

    SELECT
        7,
        '07_DISTRIBUZIONE_TIPI_FORNITORE',
        'INFORMATIVO',

        coalesce(
            jsonb_agg(
                jsonb_build_object(
                    'tipo_fornitore_id',
                    tipo_fornitore_id,

                    'tipo_fornitore',
                    tipo_fornitore,

                    'numero_fornitori',
                    numero_fornitori
                )
                ORDER BY tipo_fornitore
            ),
            '[]'::jsonb
        )

    FROM distribuzione_tipi

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 08. Riepilogo delle dipendenze servizio-fornitore
    -- ------------------------------------------------------------------------

    SELECT
        8,
        '08_DIPENDENZE_SERVIZIO_FORNITORE',
        'INFORMATIVO',

        jsonb_build_object(
            'numero_relazioni',
            count(*),

            'servizi_distinti',
            count(
                DISTINCT dati ->> 'servizio_id'
            ),

            'fornitori_distinti',
            count(
                DISTINCT dati ->> 'fornitore_id'
            )
        )

    FROM dipendenza_fornitore_rows

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 09. Relazioni orfane
    -- ------------------------------------------------------------------------

    SELECT
        9,
        '09_DIPENDENZE_ORFANE',

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

    FROM dipendenze_orfane

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 10. Vincoli delle tabelle esistenti
    -- ------------------------------------------------------------------------

    SELECT
        10,
        '10_VINCOLI_DATABASE',
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
                      'fornitore',
                      'tipo_fornitore',
                      'servizio_dipendenza_fornitore'
                  )
            ),
            '[]'::jsonb
        )

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 11. Stato RLS
    -- ------------------------------------------------------------------------

    SELECT
        11,
        '11_STATO_RLS',

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

    FROM stato_tabelle

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 12. Policy RLS
    -- ------------------------------------------------------------------------

    SELECT
        12,
        '12_POLICY_RLS',
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
                      'fornitore',
                      'tipo_fornitore',
                      'servizio_dipendenza_fornitore'
                  )
            ),
            '[]'::jsonb
        )

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 13. Privilegi dei ruoli applicativi
    -- ------------------------------------------------------------------------

    SELECT
        13,
        '13_PRIVILEGI_APPLICATIVI',

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