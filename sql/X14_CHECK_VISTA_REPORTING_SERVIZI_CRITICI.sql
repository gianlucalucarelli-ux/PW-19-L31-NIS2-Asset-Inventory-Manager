-- ============================================================================
-- FILE: sql/X14_CHECK_VISTA_REPORTING_SERVIZI_CRITICI.sql
-- TIPO: SCRIPT DIAGNOSTICO PERMANENTE - SOLA LETTURA
-- VERSIONE: 1.0
--
-- PROGETTO:
--   NIS2 Asset Inventory Manager
--
-- SCOPO:
--   Analizzare la vista vista_reporting_servizi_critici prima della sua
--   correzione definitiva prevista nella migrazione produttiva 18.
--
-- OBIETTIVI:
--   1. verificare esistenza, proprietà e definizione SQL della vista;
--   2. elencare le colonne attualmente esposte;
--   3. individuare le tabelle e le viste sottostanti;
--   4. controllare security_invoker e privilegi applicativi;
--   5. confrontare la cardinalità degli asset e dei fornitori per servizio;
--   6. individuare la moltiplicazione cartesiana asset x fornitori;
--   7. individuare eventuali righe perfettamente duplicate;
--   8. confrontare il risultato con la nuova vista Supply Chain multilivello;
--   9. produrre un unico result set compatibile con Supabase SQL Editor.
--
-- SICUREZZA:
--   Lo script contiene esclusivamente interrogazioni SELECT.
--   Non modifica schema, dati, viste, policy o privilegi.
--
-- CLASSIFICAZIONE:
--   Diagnostica permanente da conservare nella cartella /sql.
-- ============================================================================

WITH

-- ============================================================================
-- 1. METADATI DELLA VISTA
-- ============================================================================

metadati_vista AS (
    SELECT
        c.oid AS vista_oid,
        n.nspname AS schema_vista,
        c.relname AS nome_vista,
        pg_get_userbyid(c.relowner) AS proprietario,
        c.reloptions,

        coalesce(
            c.reloptions,
            ARRAY[]::text[]
        ) @> ARRAY['security_invoker=true']
            AS security_invoker_attivo

    FROM pg_class AS c

    JOIN pg_namespace AS n
        ON n.oid = c.relnamespace

    WHERE n.nspname = 'public'
      AND c.relname = 'vista_reporting_servizi_critici'
      AND c.relkind = 'v'
),

-- ============================================================================
-- 2. COLONNE DELLA VISTA
-- ============================================================================

colonne_vista AS (
    SELECT
        c.ordinal_position,
        c.column_name,
        c.data_type,
        c.udt_name,
        c.is_nullable

    FROM information_schema.columns AS c

    WHERE c.table_schema = 'public'
      AND c.table_name = 'vista_reporting_servizi_critici'
),

-- ============================================================================
-- 3. DIPENDENZE DELLA VISTA
-- ============================================================================

dipendenze_vista AS (
    SELECT DISTINCT
        schema_riferito.nspname AS schema_oggetto,
        oggetto_riferito.relname AS oggetto,
        oggetto_riferito.relkind AS tipo_oggetto

    FROM pg_rewrite AS riscrittura

    JOIN pg_class AS vista
        ON vista.oid = riscrittura.ev_class

    JOIN pg_namespace AS schema_vista
        ON schema_vista.oid = vista.relnamespace

    JOIN pg_depend AS dipendenza
        ON dipendenza.objid = riscrittura.oid

    JOIN pg_class AS oggetto_riferito
        ON oggetto_riferito.oid = dipendenza.refobjid

    JOIN pg_namespace AS schema_riferito
        ON schema_riferito.oid = oggetto_riferito.relnamespace

    WHERE schema_vista.nspname = 'public'
      AND vista.relname = 'vista_reporting_servizi_critici'
      AND oggetto_riferito.oid <> vista.oid
      AND oggetto_riferito.relkind IN (
          'r',
          'v',
          'm',
          'p'
      )
),

-- ============================================================================
-- 4. LETTURA DELLA VISTA IN FORMATO JSONB
--
-- La conversione in JSONB rende la diagnostica tollerante rispetto ai nomi
-- delle colonne attualmente utilizzati dalla vista.
-- ============================================================================

righe_vista AS (
    SELECT
        to_jsonb(v) AS dati

    FROM public.vista_reporting_servizi_critici AS v
),

-- ============================================================================
-- 5. ESTRAZIONE TOLLERANTE DELLE COLONNE DELLA VISTA
-- ============================================================================

vista_estratta AS (
    SELECT
        dati,

        coalesce(
            nullif(dati ->> 'servizio_id', ''),
            nullif(dati ->> 'id_servizio', '')
        ) AS servizio_id,

        coalesce(
            nullif(dati ->> 'codice_servizio', ''),
            nullif(dati ->> 'servizio_codice', '')
        ) AS codice_servizio,

        coalesce(
            nullif(dati ->> 'nome_servizio', ''),
            nullif(dati ->> 'servizio_nome', ''),
            nullif(dati ->> 'servizio', ''),
            nullif(dati ->> 'Service_Name', '')
        ) AS nome_servizio,

        coalesce(
            nullif(dati ->> 'asset_id', ''),
            nullif(dati ->> 'id_asset', '')
        ) AS asset_id,

        coalesce(
            nullif(dati ->> 'codice_asset', ''),
            nullif(dati ->> 'asset_codice', '')
        ) AS codice_asset,

        coalesce(
            nullif(dati ->> 'nome_asset', ''),
            nullif(dati ->> 'asset_nome', ''),
            nullif(dati ->> 'asset', ''),
            nullif(dati ->> 'Dependent_Asset', '')
        ) AS nome_asset,

        coalesce(
            nullif(dati ->> 'fornitore_id', ''),
            nullif(dati ->> 'id_fornitore', '')
        ) AS fornitore_id,

        coalesce(
            nullif(dati ->> 'codice_fornitore', ''),
            nullif(dati ->> 'fornitore_codice', '')
        ) AS codice_fornitore,

        coalesce(
            nullif(dati ->> 'nome_fornitore', ''),
            nullif(dati ->> 'fornitore_nome', ''),
            nullif(dati ->> 'fornitore', ''),
            nullif(dati ->> 'Vendor_Partner', '')
        ) AS nome_fornitore

    FROM righe_vista
),

-- ============================================================================
-- 5.1 RISOLUZIONE DEGLI IDENTIFICATIVI
--
-- La vista attuale espone soltanto le denominazioni. Gli identificativi
-- vengono quindi ricavati dalle tabelle principali mediante codice stabile
-- oppure, come ultima alternativa, tramite il nome.
-- ============================================================================

vista_normalizzata AS (
    SELECT
        ve.dati,

        coalesce(
            ve.servizio_id,
            servizio_risolto.id::text
        ) AS servizio_id,

        coalesce(
            ve.codice_servizio,
            servizio_risolto.codice_servizio
        ) AS codice_servizio,

        coalesce(
            ve.nome_servizio,
            servizio_risolto.nome
        ) AS nome_servizio,

        coalesce(
            ve.asset_id,
            asset_risolto.id::text
        ) AS asset_id,

        coalesce(
            ve.codice_asset,
            asset_risolto.codice_asset
        ) AS codice_asset,

        coalesce(
            ve.nome_asset,
            asset_risolto.nome
        ) AS nome_asset,

        coalesce(
            ve.fornitore_id,
            fornitore_risolto.id::text
        ) AS fornitore_id,

        coalesce(
            ve.codice_fornitore,
            fornitore_risolto.codice_fornitore
        ) AS codice_fornitore,

        coalesce(
            ve.nome_fornitore,
            fornitore_risolto.nome
        ) AS nome_fornitore

    FROM vista_estratta AS ve

    LEFT JOIN LATERAL (
        SELECT
            s.id,
            s.codice_servizio,
            s.nome
        FROM public.servizio AS s
        WHERE
            (
                ve.servizio_id IS NOT NULL
                AND s.id::text = ve.servizio_id
            )
            OR
            (
                ve.servizio_id IS NULL
                AND ve.codice_servizio IS NOT NULL
                AND s.codice_servizio = ve.codice_servizio
            )
            OR
            (
                ve.servizio_id IS NULL
                AND ve.codice_servizio IS NULL
                AND ve.nome_servizio IS NOT NULL
                AND lower(btrim(s.nome))
                    = lower(btrim(ve.nome_servizio))
            )
        ORDER BY s.id
        LIMIT 1
    ) AS servizio_risolto
        ON true

    LEFT JOIN LATERAL (
        SELECT
            a.id,
            a.codice_asset,
            a.nome
        FROM public.asset AS a
        WHERE
            (
                ve.asset_id IS NOT NULL
                AND a.id::text = ve.asset_id
            )
            OR
            (
                ve.asset_id IS NULL
                AND ve.codice_asset IS NOT NULL
                AND a.codice_asset = ve.codice_asset
            )
            OR
            (
                ve.asset_id IS NULL
                AND ve.codice_asset IS NULL
                AND ve.nome_asset IS NOT NULL
                AND lower(btrim(a.nome))
                    = lower(btrim(ve.nome_asset))
            )
        ORDER BY a.id
        LIMIT 1
    ) AS asset_risolto
        ON true

    LEFT JOIN LATERAL (
        SELECT
            f.id,
            f.codice_fornitore,
            f.nome
        FROM public.fornitore AS f
        WHERE
            (
                ve.fornitore_id IS NOT NULL
                AND f.id::text = ve.fornitore_id
            )
            OR
            (
                ve.fornitore_id IS NULL
                AND ve.codice_fornitore IS NOT NULL
                AND f.codice_fornitore = ve.codice_fornitore
            )
            OR
            (
                ve.fornitore_id IS NULL
                AND ve.codice_fornitore IS NULL
                AND ve.nome_fornitore IS NOT NULL
                AND lower(btrim(f.nome))
                    = lower(btrim(ve.nome_fornitore))
            )
        ORDER BY f.id
        LIMIT 1
    ) AS fornitore_risolto
        ON true
),

-- ============================================================================
-- 6. CARDINALITA' REALE DELLE DIPENDENZE PER SERVIZIO
--
-- I conteggi vengono calcolati separatamente, evitando di produrre a loro
-- volta una moltiplicazione cartesiana.
-- ============================================================================

cardinalita_base AS (
    SELECT
        s.id::text AS servizio_id,

        coalesce(
            nullif(to_jsonb(s) ->> 'codice_servizio', ''),
            nullif(to_jsonb(s) ->> 'codice', '')
        ) AS codice_servizio,

        s.nome AS nome_servizio,

        (
            SELECT count(DISTINCT sda.asset_id)
            FROM public.servizio_dipendenza_asset AS sda
            WHERE sda.servizio_id = s.id
        ) AS numero_asset,

        (
            SELECT count(DISTINCT sdf.fornitore_id)
            FROM public.servizio_dipendenza_fornitore AS sdf
            WHERE sdf.servizio_id = s.id
        ) AS numero_fornitori

    FROM public.servizio AS s
),

-- ============================================================================
-- 7. CARDINALITA' RISCONTRATA NELLA VISTA
-- ============================================================================

cardinalita_vista AS (
    SELECT
        servizio_id,

        max(codice_servizio) AS codice_servizio,

        max(nome_servizio) AS nome_servizio,

        count(*) AS numero_righe_vista,

        count(DISTINCT asset_id)
            FILTER (
                WHERE asset_id IS NOT NULL
            ) AS asset_distinti_vista,

        count(DISTINCT fornitore_id)
            FILTER (
                WHERE fornitore_id IS NOT NULL
            ) AS fornitori_distinti_vista,

        count(
            DISTINCT (
                asset_id,
                fornitore_id
            )
        ) FILTER (
            WHERE asset_id IS NOT NULL
               OR fornitore_id IS NOT NULL
        ) AS coppie_asset_fornitore_distinte

    FROM vista_normalizzata

    GROUP BY servizio_id
),

-- ============================================================================
-- 8. DIAGNOSI DELLA MOLTIPLICAZIONE CARTESIANA
--
-- Quando un servizio possiede più asset e più fornitori, una vista costruita
-- con due LEFT JOIN indipendenti può generare:
--
--   numero_asset x numero_fornitori
--
-- righe, pur non esistendo una relazione diretta fra ciascuna coppia.
-- ============================================================================

diagnosi_cardinalita AS (
    SELECT
        cb.servizio_id,

        cb.codice_servizio,

        cb.nome_servizio,

        cb.numero_asset,

        cb.numero_fornitori,

        coalesce(
            cv.numero_righe_vista,
            0
        ) AS numero_righe_vista,

        coalesce(
            cv.asset_distinti_vista,
            0
        ) AS asset_distinti_vista,

        coalesce(
            cv.fornitori_distinti_vista,
            0
        ) AS fornitori_distinti_vista,

        coalesce(
            cv.coppie_asset_fornitore_distinte,
            0
        ) AS coppie_asset_fornitore_distinte,

        (
            greatest(
                cb.numero_asset,
                1
            )
            *
            greatest(
                cb.numero_fornitori,
                1
            )
        ) AS righe_cartesiane_teoriche,

        CASE
            WHEN cb.numero_asset > 1
             AND cb.numero_fornitori > 1
             AND coalesce(
                    cv.numero_righe_vista,
                    0
                 ) >= (
                    cb.numero_asset
                    *
                    cb.numero_fornitori
                 )
            THEN 'MOLTIPLICAZIONE_CARTESIANA_PROBABILE'

            WHEN coalesce(
                    cv.numero_righe_vista,
                    0
                 ) > greatest(
                    cb.numero_asset,
                    cb.numero_fornitori,
                    1
                 )
            THEN 'CARDINALITA_DA_VERIFICARE'

            ELSE 'NESSUNA_MOLTIPLICAZIONE_EVIDENTE'
        END AS diagnosi

    FROM cardinalita_base AS cb

    LEFT JOIN cardinalita_vista AS cv
        ON cv.servizio_id = cb.servizio_id
),

-- ============================================================================
-- 9. RIGHE PERFETTAMENTE DUPLICATE
--
-- Questa verifica è distinta dalla moltiplicazione cartesiana:
-- una combinazione asset-fornitore può essere semanticamente impropria anche
-- quando le righe risultano formalmente differenti.
-- ============================================================================

duplicati_esatti AS (
    SELECT
        dati,
        count(*) AS occorrenze

    FROM righe_vista

    GROUP BY dati

    HAVING count(*) > 1
),

-- ============================================================================
-- 10. STATISTICHE DELLA SUPPLY CHAIN MULTILIVELLO
-- ============================================================================

statistiche_supply_chain AS (
    SELECT
        count(*) AS righe_totali,

        count(*) FILTER (
            WHERE origine_collegamento
                  = 'SERVIZIO_FORNITORE_DIRETTO'
        ) AS percorsi_fornitore_diretto,

        count(*) FILTER (
            WHERE origine_collegamento
                  = 'SERVIZIO_ASSET_FORNITORE'
        ) AS percorsi_tramite_asset,

        count(DISTINCT servizio_radice_id)
            AS servizi_radice_distinti,

        count(DISTINCT asset_effettivo_id)
            FILTER (
                WHERE asset_effettivo_id IS NOT NULL
            ) AS asset_distinti,

        count(DISTINCT fornitore_effettivo_id)
            AS fornitori_distinti

    FROM public.vista_supply_chain_multilivello
),

-- ============================================================================
-- 11. COSTRUZIONE DEL RISULTATO CONSOLIDATO
-- ============================================================================

risultato AS (

    -- ------------------------------------------------------------------------
    -- 01. Esistenza della vista
    -- ------------------------------------------------------------------------

    SELECT
        1 AS ordine,
        '01_ESISTENZA_VISTA' AS sezione,

        CASE
            WHEN to_regclass(
                'public.vista_reporting_servizi_critici'
            ) IS NOT NULL
            THEN 'OK'
            ELSE 'ERRORE'
        END AS esito,

        jsonb_build_object(
            'vista_reporting_servizi_critici',
            to_regclass(
                'public.vista_reporting_servizi_critici'
            ) IS NOT NULL,

            'vista_supply_chain_multilivello',
            to_regclass(
                'public.vista_supply_chain_multilivello'
            ) IS NOT NULL
        ) AS dettaglio

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 02. Definizione SQL
    -- ------------------------------------------------------------------------

    SELECT
        2,
        '02_DEFINIZIONE_SQL',
        'INFORMATIVO',

        jsonb_build_object(
            'definizione',
            pg_get_viewdef(
                to_regclass(
                    'public.vista_reporting_servizi_critici'
                ),
                true
            )
        )

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 03. Colonne esposte
    -- ------------------------------------------------------------------------

    SELECT
        3,
        '03_COLONNE_VISTA',
        'INFORMATIVO',

        coalesce(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'posizione',
                        ordinal_position,

                        'colonna',
                        column_name,

                        'tipo',
                        data_type,

                        'tipo_postgresql',
                        udt_name,

                        'nullable',
                        is_nullable
                    )
                    ORDER BY ordinal_position
                )

                FROM colonne_vista
            ),
            '[]'::jsonb
        )

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 04. Dipendenze della vista
    -- ------------------------------------------------------------------------

    SELECT
        4,
        '04_DIPENDENZE_VISTA',
        'INFORMATIVO',

        coalesce(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'schema',
                        schema_oggetto,

                        'oggetto',
                        oggetto,

                        'tipo',
                        tipo_oggetto
                    )
                    ORDER BY
                        schema_oggetto,
                        oggetto
                )

                FROM dipendenze_vista
            ),
            '[]'::jsonb
        )

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 05. Sicurezza e privilegi
    -- ------------------------------------------------------------------------

    SELECT
        5,
        '05_SICUREZZA_E_PRIVILEGI',

        CASE
            WHEN
                coalesce(
                    (
                        SELECT security_invoker_attivo
                        FROM metadati_vista
                    ),
                    false
                ) = true

                AND has_table_privilege(
                    'anon',
                    'public.vista_reporting_servizi_critici',
                    'SELECT'
                ) = false

                AND has_table_privilege(
                    'authenticated',
                    'public.vista_reporting_servizi_critici',
                    'SELECT'
                ) = true
            THEN 'OK'
            ELSE 'DA_CORREGGERE'
        END,

        jsonb_build_object(
            'proprietario',
            (
                SELECT proprietario
                FROM metadati_vista
            ),

            'reloptions',
            (
                SELECT reloptions
                FROM metadati_vista
            ),

            'security_invoker',
            coalesce(
                (
                    SELECT security_invoker_attivo
                    FROM metadati_vista
                ),
                false
            ),

            'anon_select',
            has_table_privilege(
                'anon',
                'public.vista_reporting_servizi_critici',
                'SELECT'
            ),

            'authenticated_select',
            has_table_privilege(
                'authenticated',
                'public.vista_reporting_servizi_critici',
                'SELECT'
            ),

            'authenticated_insert',
            has_table_privilege(
                'authenticated',
                'public.vista_reporting_servizi_critici',
                'INSERT'
            ),

            'authenticated_update',
            has_table_privilege(
                'authenticated',
                'public.vista_reporting_servizi_critici',
                'UPDATE'
            ),

            'authenticated_delete',
            has_table_privilege(
                'authenticated',
                'public.vista_reporting_servizi_critici',
                'DELETE'
            )
        )

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 06. Riepilogo delle righe
    -- ------------------------------------------------------------------------

    SELECT
        6,
        '06_RIEPILOGO_RIGHE',
        'INFORMATIVO',

        jsonb_build_object(
            'righe_totali',
            count(*),

            'servizi_distinti',
            count(DISTINCT servizio_id)
                FILTER (
                    WHERE servizio_id IS NOT NULL
                ),

            'asset_distinti',
            count(DISTINCT asset_id)
                FILTER (
                    WHERE asset_id IS NOT NULL
                ),

            'fornitori_distinti',
            count(DISTINCT fornitore_id)
                FILTER (
                    WHERE fornitore_id IS NOT NULL
                ),

            'righe_senza_servizio_id',
            count(*) FILTER (
                WHERE servizio_id IS NULL
            ),

            'righe_senza_asset_id',
            count(*) FILTER (
                WHERE asset_id IS NULL
            ),

            'righe_senza_fornitore_id',
            count(*) FILTER (
                WHERE fornitore_id IS NULL
            )
        )

    FROM vista_normalizzata

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 07. Cardinalità per servizio
    -- ------------------------------------------------------------------------

    SELECT
        7,
        '07_CARDINALITA_PER_SERVIZIO',
        'INFORMATIVO',

        coalesce(
            jsonb_agg(
                jsonb_build_object(
                    'servizio_id',
                    servizio_id,

                    'codice_servizio',
                    codice_servizio,

                    'nome_servizio',
                    nome_servizio,

                    'asset_reali',
                    numero_asset,

                    'fornitori_reali',
                    numero_fornitori,

                    'righe_vista',
                    numero_righe_vista,

                    'asset_distinti_vista',
                    asset_distinti_vista,

                    'fornitori_distinti_vista',
                    fornitori_distinti_vista,

                    'coppie_distinte_vista',
                    coppie_asset_fornitore_distinte,

                    'righe_cartesiane_teoriche',
                    righe_cartesiane_teoriche,

                    'diagnosi',
                    diagnosi
                )
                ORDER BY servizio_id
            ),
            '[]'::jsonb
        )

    FROM diagnosi_cardinalita

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 08. Servizi con moltiplicazione cartesiana probabile
    -- ------------------------------------------------------------------------

    SELECT
        8,
        '08_MOLTIPLICAZIONE_CARTESIANA',

        CASE
            WHEN count(*) FILTER (
                WHERE diagnosi
                      = 'MOLTIPLICAZIONE_CARTESIANA_PROBABILE'
            ) > 0
            THEN 'DA_CORREGGERE'
            ELSE 'OK'
        END,

        coalesce(
            jsonb_agg(
                jsonb_build_object(
                    'servizio_id',
                    servizio_id,

                    'codice_servizio',
                    codice_servizio,

                    'nome_servizio',
                    nome_servizio,

                    'asset',
                    numero_asset,

                    'fornitori',
                    numero_fornitori,

                    'righe_vista',
                    numero_righe_vista,

                    'righe_cartesiane_teoriche',
                    righe_cartesiane_teoriche
                )
                ORDER BY servizio_id
            ) FILTER (
                WHERE diagnosi
                      = 'MOLTIPLICAZIONE_CARTESIANA_PROBABILE'
            ),
            '[]'::jsonb
        )

    FROM diagnosi_cardinalita

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 09. Duplicati esatti
    -- ------------------------------------------------------------------------

    SELECT
        9,
        '09_DUPLICATI_ESATTI',

        CASE
            WHEN count(*) = 0
            THEN 'OK'
            ELSE 'DA_CORREGGERE'
        END,

        coalesce(
            jsonb_agg(
                jsonb_build_object(
                    'occorrenze',
                    occorrenze,

                    'riga',
                    dati
                )
            ),
            '[]'::jsonb
        )

    FROM duplicati_esatti

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 10. Confronto con la Supply Chain multilivello
    -- ------------------------------------------------------------------------

    SELECT
        10,
        '10_CONFRONTO_SUPPLY_CHAIN',
        'INFORMATIVO',

        jsonb_build_object(
            'righe_vista_reporting',
            (
                SELECT count(*)
                FROM righe_vista
            ),

            'righe_supply_chain',
            righe_totali,

            'percorsi_fornitore_diretto',
            percorsi_fornitore_diretto,

            'percorsi_tramite_asset',
            percorsi_tramite_asset,

            'servizi_radice_distinti',
            servizi_radice_distinti,

            'asset_distinti_supply_chain',
            asset_distinti,

            'fornitori_distinti_supply_chain',
            fornitori_distinti
        )

    FROM statistiche_supply_chain

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 11. Diagnosi complessiva
    -- ------------------------------------------------------------------------

    SELECT
        11,
        '11_ESITO_DIAGNOSTICO',

        CASE
            WHEN to_regclass(
                'public.vista_reporting_servizi_critici'
            ) IS NULL
            THEN 'ERRORE'

            WHEN coalesce(
                (
                    SELECT security_invoker_attivo
                    FROM metadati_vista
                ),
                false
            ) = false
            THEN 'PRONTO_PER_CORREZIONE'

            WHEN EXISTS (
                SELECT 1
                FROM diagnosi_cardinalita
                WHERE diagnosi
                      = 'MOLTIPLICAZIONE_CARTESIANA_PROBABILE'
            )
            THEN 'PRONTO_PER_CORREZIONE'

            WHEN EXISTS (
                SELECT 1
                FROM duplicati_esatti
            )
            THEN 'PRONTO_PER_CORREZIONE'

            ELSE 'NESSUNA_ANOMALIA_BLOCCANTE_RILEVATA'
        END,

        jsonb_build_object(
            'moltiplicazioni_cartesiane_probabili',
            (
                SELECT count(*)
                FROM diagnosi_cardinalita
                WHERE diagnosi
                      = 'MOLTIPLICAZIONE_CARTESIANA_PROBABILE'
            ),

            'gruppi_di_duplicati_esatti',
            (
                SELECT count(*)
                FROM duplicati_esatti
            ),

            'security_invoker',
            coalesce(
                (
                    SELECT security_invoker_attivo
                    FROM metadati_vista
                ),
                false
            ),

            'anon_select',
            has_table_privilege(
                'anon',
                'public.vista_reporting_servizi_critici',
                'SELECT'
            ),

            'authenticated_select',
            has_table_privilege(
                'authenticated',
                'public.vista_reporting_servizi_critici',
                'SELECT'
            )
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