-- ============================================================================
-- FILE: sql/X13_CHECK_SUPPLY_CHAIN_MULTILIVELLO.sql
-- TIPO: SCRIPT DIAGNOSTICO PERMANENTE - SOLA LETTURA
-- VERSIONE: 1.0
--
-- PROGETTO:
--   NIS2 Asset Inventory Manager
--
-- SCOPO:
--   Verificare la completezza strutturale e informativa del modello
--   Supply Chain multilivello prima della migrazione produttiva 17.
--
-- DOMINI ANALIZZATI:
--   - gerarchia servizio-sottoservizio;
--   - gerarchia asset-sotto-asset;
--   - gerarchia fornitore-subfornitore;
--   - dipendenze servizio-asset;
--   - dipendenze servizio-fornitore;
--   - relazioni dirette asset-fornitore.
--
-- OBIETTIVI:
--   1. verificare l'esistenza di tutti gli oggetti necessari;
--   2. verificare relazioni attive e storiche;
--   3. controllare l'integrità referenziale logica;
--   4. calcolare la profondità delle gerarchie;
--   5. individuare percorsi servizio-asset-fornitore;
--   6. individuare collegamenti diretti non coperti da un asset;
--   7. individuare relazioni asset-fornitore non utilizzate da servizi;
--   8. verificare RLS e privilegi applicativi.
--
-- RISULTATO:
--   Un unico result set compatibile con Supabase SQL Editor.
--
-- SICUREZZA:
--   Lo script esegue esclusivamente interrogazioni SELECT.
--   Non modifica schema, dati, policy o privilegi.
-- ============================================================================

WITH RECURSIVE

-- ============================================================================
-- 1. ENTITA' PRINCIPALI
-- ============================================================================

servizi AS (
    SELECT
        s.id::text AS id,
        to_jsonb(s) AS dati
    FROM public.servizio AS s
),

asset AS (
    SELECT
        a.id::text AS id,
        to_jsonb(a) AS dati
    FROM public.asset AS a
),

fornitori AS (
    SELECT
        f.id::text AS id,
        to_jsonb(f) AS dati
    FROM public.fornitore AS f
),

-- ============================================================================
-- 2. RELAZIONI LETTE IN FORMATO JSONB
-- ============================================================================

servizio_componente_rows AS (
    SELECT to_jsonb(sc) AS dati
    FROM public.servizio_componente AS sc
),

asset_componente_rows AS (
    SELECT to_jsonb(ac) AS dati
    FROM public.asset_componente AS ac
),

fornitore_relazione_rows AS (
    SELECT to_jsonb(fr) AS dati
    FROM public.fornitore_relazione AS fr
),

servizio_asset_rows AS (
    SELECT to_jsonb(sda) AS dati
    FROM public.servizio_dipendenza_asset AS sda
),

servizio_fornitore_rows AS (
    SELECT to_jsonb(sdf) AS dati
    FROM public.servizio_dipendenza_fornitore AS sdf
),

asset_fornitore_rows AS (
    SELECT to_jsonb(af) AS dati
    FROM public.asset_fornitore AS af
),

-- ============================================================================
-- 3. ARCHI ATTIVI DELLE TRE GERARCHIE
-- ============================================================================

archi_servizio AS (
    SELECT
        dati ->> 'servizio_padre_id' AS padre_id,
        dati ->> 'servizio_figlio_id' AS figlio_id
    FROM servizio_componente_rows
    WHERE coalesce(
        nullif(dati ->> 'attiva', '')::boolean,
        true
    ) = true
),

archi_asset AS (
    SELECT
        dati ->> 'asset_padre_id' AS padre_id,
        dati ->> 'asset_figlio_id' AS figlio_id
    FROM asset_componente_rows
    WHERE coalesce(
        nullif(dati ->> 'attiva', '')::boolean,
        true
    ) = true
),

archi_fornitore AS (
    SELECT
        dati ->> 'fornitore_padre_id' AS padre_id,
        dati ->> 'fornitore_figlio_id' AS figlio_id
    FROM fornitore_relazione_rows
    WHERE coalesce(
        nullif(dati ->> 'attiva', '')::boolean,
        true
    ) = true
),

-- ============================================================================
-- 4. CHIUSURA TRANSITIVA DELLA GERARCHIA SERVIZI
--
-- Ogni servizio viene considerato discendente di sé stesso con profondità 0.
-- ============================================================================

cammini_servizio AS (
    SELECT
        s.id AS radice_id,
        s.id AS nodo_id,
        0 AS profondita,
        ARRAY[s.id]::text[] AS percorso
    FROM servizi AS s

    UNION ALL

    SELECT
        cs.radice_id,
        ar.figlio_id,
        cs.profondita + 1,
        cs.percorso || ar.figlio_id
    FROM cammini_servizio AS cs
    JOIN archi_servizio AS ar
        ON ar.padre_id = cs.nodo_id
    WHERE ar.figlio_id IS NOT NULL
      AND NOT ar.figlio_id = ANY(cs.percorso)
),

chiusura_servizio AS (
    SELECT
        radice_id,
        nodo_id,
        min(profondita) AS profondita
    FROM cammini_servizio
    GROUP BY
        radice_id,
        nodo_id
),

-- ============================================================================
-- 5. CHIUSURA TRANSITIVA DELLA GERARCHIA ASSET
-- ============================================================================

cammini_asset AS (
    SELECT
        a.id AS radice_id,
        a.id AS nodo_id,
        0 AS profondita,
        ARRAY[a.id]::text[] AS percorso
    FROM asset AS a

    UNION ALL

    SELECT
        ca.radice_id,
        ar.figlio_id,
        ca.profondita + 1,
        ca.percorso || ar.figlio_id
    FROM cammini_asset AS ca
    JOIN archi_asset AS ar
        ON ar.padre_id = ca.nodo_id
    WHERE ar.figlio_id IS NOT NULL
      AND NOT ar.figlio_id = ANY(ca.percorso)
),

chiusura_asset AS (
    SELECT
        radice_id,
        nodo_id,
        min(profondita) AS profondita
    FROM cammini_asset
    GROUP BY
        radice_id,
        nodo_id
),

-- ============================================================================
-- 6. CHIUSURA TRANSITIVA DELLA GERARCHIA FORNITORI
-- ============================================================================

cammini_fornitore AS (
    SELECT
        f.id AS radice_id,
        f.id AS nodo_id,
        0 AS profondita,
        ARRAY[f.id]::text[] AS percorso
    FROM fornitori AS f

    UNION ALL

    SELECT
        cf.radice_id,
        ar.figlio_id,
        cf.profondita + 1,
        cf.percorso || ar.figlio_id
    FROM cammini_fornitore AS cf
    JOIN archi_fornitore AS ar
        ON ar.padre_id = cf.nodo_id
    WHERE ar.figlio_id IS NOT NULL
      AND NOT ar.figlio_id = ANY(cf.percorso)
),

chiusura_fornitore AS (
    SELECT
        radice_id,
        nodo_id,
        min(profondita) AS profondita
    FROM cammini_fornitore
    GROUP BY
        radice_id,
        nodo_id
),

-- ============================================================================
-- 7. DIPENDENZE NORMALIZZATE
-- ============================================================================

dipendenze_servizio_asset AS (
    SELECT
        dati ->> 'servizio_id' AS servizio_id,
        dati ->> 'asset_id' AS asset_id,
        dati
    FROM servizio_asset_rows
),

dipendenze_servizio_fornitore AS (
    SELECT
        dati ->> 'servizio_id' AS servizio_id,
        dati ->> 'fornitore_id' AS fornitore_id,
        dati
    FROM servizio_fornitore_rows
),

relazioni_asset_fornitore AS (
    SELECT
        dati ->> 'asset_id' AS asset_id,
        dati ->> 'fornitore_id' AS fornitore_id,
        dati ->> 'tipo_relazione_asset_fornitore_id'
            AS tipo_relazione_id,
        dati
    FROM asset_fornitore_rows
    WHERE coalesce(
        nullif(dati ->> 'attiva', '')::boolean,
        true
    ) = true
),

-- ============================================================================
-- 8. CONTROLLO LOGICO DELLE RELAZIONI ORFANE
-- ============================================================================

anomalie AS (

    SELECT
        'servizio_componente_padre' AS origine,
        sc.dati AS relazione
    FROM servizio_componente_rows AS sc
    WHERE nullif(
        sc.dati ->> 'servizio_padre_id',
        ''
    ) IS NOT NULL
      AND NOT EXISTS (
          SELECT 1
          FROM servizi AS s
          WHERE s.id = sc.dati ->> 'servizio_padre_id'
      )

    UNION ALL

    SELECT
        'servizio_componente_figlio',
        sc.dati
    FROM servizio_componente_rows AS sc
    WHERE nullif(
        sc.dati ->> 'servizio_figlio_id',
        ''
    ) IS NOT NULL
      AND NOT EXISTS (
          SELECT 1
          FROM servizi AS s
          WHERE s.id = sc.dati ->> 'servizio_figlio_id'
      )

    UNION ALL

    SELECT
        'asset_componente_padre',
        ac.dati
    FROM asset_componente_rows AS ac
    WHERE nullif(
        ac.dati ->> 'asset_padre_id',
        ''
    ) IS NOT NULL
      AND NOT EXISTS (
          SELECT 1
          FROM asset AS a
          WHERE a.id = ac.dati ->> 'asset_padre_id'
      )

    UNION ALL

    SELECT
        'asset_componente_figlio',
        ac.dati
    FROM asset_componente_rows AS ac
    WHERE nullif(
        ac.dati ->> 'asset_figlio_id',
        ''
    ) IS NOT NULL
      AND NOT EXISTS (
          SELECT 1
          FROM asset AS a
          WHERE a.id = ac.dati ->> 'asset_figlio_id'
      )

    UNION ALL

    SELECT
        'fornitore_relazione_padre',
        fr.dati
    FROM fornitore_relazione_rows AS fr
    WHERE nullif(
        fr.dati ->> 'fornitore_padre_id',
        ''
    ) IS NOT NULL
      AND NOT EXISTS (
          SELECT 1
          FROM fornitori AS f
          WHERE f.id = fr.dati ->> 'fornitore_padre_id'
      )

    UNION ALL

    SELECT
        'fornitore_relazione_figlio',
        fr.dati
    FROM fornitore_relazione_rows AS fr
    WHERE nullif(
        fr.dati ->> 'fornitore_figlio_id',
        ''
    ) IS NOT NULL
      AND NOT EXISTS (
          SELECT 1
          FROM fornitori AS f
          WHERE f.id = fr.dati ->> 'fornitore_figlio_id'
      )

    UNION ALL

    SELECT
        'servizio_dipendenza_asset',
        dsa.dati
    FROM dipendenze_servizio_asset AS dsa
    WHERE NOT EXISTS (
        SELECT 1
        FROM servizi AS s
        WHERE s.id = dsa.servizio_id
    )
       OR NOT EXISTS (
        SELECT 1
        FROM asset AS a
        WHERE a.id = dsa.asset_id
    )

    UNION ALL

    SELECT
        'servizio_dipendenza_fornitore',
        dsf.dati
    FROM dipendenze_servizio_fornitore AS dsf
    WHERE NOT EXISTS (
        SELECT 1
        FROM servizi AS s
        WHERE s.id = dsf.servizio_id
    )
       OR NOT EXISTS (
        SELECT 1
        FROM fornitori AS f
        WHERE f.id = dsf.fornitore_id
    )

    UNION ALL

    SELECT
        'asset_fornitore',
        raf.dati
    FROM relazioni_asset_fornitore AS raf
    WHERE NOT EXISTS (
        SELECT 1
        FROM asset AS a
        WHERE a.id = raf.asset_id
    )
       OR NOT EXISTS (
        SELECT 1
        FROM fornitori AS f
        WHERE f.id = raf.fornitore_id
    )
),

-- ============================================================================
-- 9. PERCORSI DIRETTI SERVIZIO-ASSET-FORNITORE
--
-- Vengono considerate soltanto relazioni asset-fornitore esplicite e attive.
-- ============================================================================

percorsi_servizio_asset_fornitore AS (
    SELECT DISTINCT
        dsa.servizio_id,
        dsa.asset_id,
        raf.fornitore_id,
        raf.tipo_relazione_id
    FROM dipendenze_servizio_asset AS dsa
    JOIN relazioni_asset_fornitore AS raf
        ON raf.asset_id = dsa.asset_id
),

-- ============================================================================
-- 10. FORNITORI COLLEGATI DIRETTAMENTE AI SERVIZI MA NON ATTRAVERSO ASSET
-- ============================================================================

fornitori_servizio_senza_asset AS (
    SELECT
        dsf.servizio_id,
        dsf.fornitore_id
    FROM dipendenze_servizio_fornitore AS dsf
    WHERE NOT EXISTS (
        SELECT 1
        FROM percorsi_servizio_asset_fornitore AS psaf
        WHERE psaf.servizio_id = dsf.servizio_id
          AND psaf.fornitore_id = dsf.fornitore_id
    )
),

-- ============================================================================
-- 11. RELAZIONI ASSET-FORNITORE NON UTILIZZATE DA ALCUN SERVIZIO
-- ============================================================================

asset_fornitore_senza_servizio AS (
    SELECT
        raf.asset_id,
        raf.fornitore_id,
        raf.tipo_relazione_id
    FROM relazioni_asset_fornitore AS raf
    WHERE NOT EXISTS (
        SELECT 1
        FROM dipendenze_servizio_asset AS dsa
        WHERE dsa.asset_id = raf.asset_id
    )
),

-- ============================================================================
-- 12. PROFONDITA' DELLE GERARCHIE
-- ============================================================================

statistiche_gerarchie AS (
    SELECT
        'SERVIZI' AS dominio,
        coalesce(max(profondita), 0) AS profondita_massima,
        count(DISTINCT radice_id) FILTER (
            WHERE profondita > 0
        ) AS radici_con_discendenti,
        count(*) FILTER (
            WHERE profondita > 0
        ) AS collegamenti_transitivi
    FROM chiusura_servizio

    UNION ALL

    SELECT
        'ASSET',
        coalesce(max(profondita), 0),
        count(DISTINCT radice_id) FILTER (
            WHERE profondita > 0
        ),
        count(*) FILTER (
            WHERE profondita > 0
        )
    FROM chiusura_asset

    UNION ALL

    SELECT
        'FORNITORI',
        coalesce(max(profondita), 0),
        count(DISTINCT radice_id) FILTER (
            WHERE profondita > 0
        ),
        count(*) FILTER (
            WHERE profondita > 0
        )
    FROM chiusura_fornitore
),

-- ============================================================================
-- 13. STATO RLS
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
          'servizio_componente',
          'asset_componente',
          'fornitore_relazione',
          'servizio_dipendenza_asset',
          'servizio_dipendenza_fornitore',
          'asset_fornitore'
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
          'servizio_componente',
          'asset_componente',
          'fornitore_relazione',
          'servizio_dipendenza_asset',
          'servizio_dipendenza_fornitore',
          'asset_fornitore'
      )
),

-- ============================================================================
-- 15. COSTRUZIONE DEL RISULTATO CONSOLIDATO
-- ============================================================================

risultato AS (

    SELECT
        1 AS ordine,
        '01_ESISTENZA_OGGETTI' AS sezione,
        'INFORMATIVO' AS esito,

        jsonb_build_object(
            'servizio',
            to_regclass('public.servizio') IS NOT NULL,

            'asset',
            to_regclass('public.asset') IS NOT NULL,

            'fornitore',
            to_regclass('public.fornitore') IS NOT NULL,

            'servizio_componente',
            to_regclass('public.servizio_componente') IS NOT NULL,

            'asset_componente',
            to_regclass('public.asset_componente') IS NOT NULL,

            'fornitore_relazione',
            to_regclass('public.fornitore_relazione') IS NOT NULL,

            'servizio_dipendenza_asset',
            to_regclass(
                'public.servizio_dipendenza_asset'
            ) IS NOT NULL,

            'servizio_dipendenza_fornitore',
            to_regclass(
                'public.servizio_dipendenza_fornitore'
            ) IS NOT NULL,

            'asset_fornitore',
            to_regclass('public.asset_fornitore') IS NOT NULL
        ) AS dettaglio

    UNION ALL

    SELECT
        2,
        '02_CONTEGGIO_ENTITA',
        'INFORMATIVO',

        jsonb_build_object(
            'servizi',
            (SELECT count(*) FROM servizi),

            'asset',
            (SELECT count(*) FROM asset),

            'fornitori',
            (SELECT count(*) FROM fornitori)
        )

    UNION ALL

    SELECT
        3,
        '03_CONTEGGIO_RELAZIONI',
        'INFORMATIVO',

        jsonb_build_object(
            'servizio_componente_totali',
            (SELECT count(*) FROM servizio_componente_rows),

            'servizio_componente_attive',
            (SELECT count(*) FROM archi_servizio),

            'asset_componente_totali',
            (SELECT count(*) FROM asset_componente_rows),

            'asset_componente_attive',
            (SELECT count(*) FROM archi_asset),

            'fornitore_relazione_totali',
            (SELECT count(*) FROM fornitore_relazione_rows),

            'fornitore_relazione_attive',
            (SELECT count(*) FROM archi_fornitore),

            'servizio_asset',
            (SELECT count(*) FROM dipendenze_servizio_asset),

            'servizio_fornitore',
            (SELECT count(*) FROM dipendenze_servizio_fornitore),

            'asset_fornitore_attive',
            (SELECT count(*) FROM relazioni_asset_fornitore)
        )

    UNION ALL

    SELECT
        4,
        '04_INTEGRITA_LOGICA',

        CASE
            WHEN count(*) = 0
            THEN 'OK'
            ELSE 'ERRORE'
        END,

        coalesce(
            jsonb_agg(
                jsonb_build_object(
                    'origine',
                    origine,

                    'relazione',
                    relazione
                )
                ORDER BY origine
            ),
            '[]'::jsonb
        )

    FROM anomalie

    UNION ALL

    SELECT
        5,
        '05_PROFONDITA_GERARCHIE',
        'INFORMATIVO',

        coalesce(
            jsonb_agg(
                jsonb_build_object(
                    'dominio',
                    dominio,

                    'profondita_massima',
                    profondita_massima,

                    'radici_con_discendenti',
                    radici_con_discendenti,

                    'collegamenti_transitivi',
                    collegamenti_transitivi
                )
                ORDER BY dominio
            ),
            '[]'::jsonb
        )

    FROM statistiche_gerarchie

    UNION ALL

    SELECT
        6,
        '06_PERCORSI_SERVIZIO_ASSET_FORNITORE',
        'INFORMATIVO',

        jsonb_build_object(
            'numero_percorsi',
            count(*),

            'servizi_coinvolti',
            count(DISTINCT servizio_id),

            'asset_coinvolti',
            count(DISTINCT asset_id),

            'fornitori_coinvolti',
            count(DISTINCT fornitore_id)
        )

    FROM percorsi_servizio_asset_fornitore

    UNION ALL

    SELECT
        7,
        '07_DETTAGLIO_PERCORSI',
        'INFORMATIVO',

        coalesce(
            jsonb_agg(
                jsonb_build_object(
                    'servizio_id',
                    psaf.servizio_id,

                    'servizio',
                    coalesce(
                        s.dati ->> 'nome',
                        s.dati ->> 'codice_servizio'
                    ),

                    'asset_id',
                    psaf.asset_id,

                    'codice_asset',
                    a.dati ->> 'codice_asset',

                    'fornitore_id',
                    psaf.fornitore_id,

                    'codice_fornitore',
                    f.dati ->> 'codice_fornitore',

                    'tipo_relazione_id',
                    psaf.tipo_relazione_id
                )
                ORDER BY
                    psaf.servizio_id,
                    psaf.asset_id,
                    psaf.fornitore_id
            ),
            '[]'::jsonb
        )

    FROM percorsi_servizio_asset_fornitore AS psaf

    LEFT JOIN servizi AS s
        ON s.id = psaf.servizio_id

    LEFT JOIN asset AS a
        ON a.id = psaf.asset_id

    LEFT JOIN fornitori AS f
        ON f.id = psaf.fornitore_id

    UNION ALL

    SELECT
        8,
        '08_FORNITORI_SERVIZIO_SENZA_ASSET',
        'DA_VALUTARE',

        coalesce(
            jsonb_agg(
                jsonb_build_object(
                    'servizio_id',
                    fssa.servizio_id,

                    'servizio',
                    coalesce(
                        s.dati ->> 'nome',
                        s.dati ->> 'codice_servizio'
                    ),

                    'fornitore_id',
                    fssa.fornitore_id,

                    'codice_fornitore',
                    f.dati ->> 'codice_fornitore'
                )
                ORDER BY
                    fssa.servizio_id,
                    fssa.fornitore_id
            ),
            '[]'::jsonb
        )

    FROM fornitori_servizio_senza_asset AS fssa

    LEFT JOIN servizi AS s
        ON s.id = fssa.servizio_id

    LEFT JOIN fornitori AS f
        ON f.id = fssa.fornitore_id

    UNION ALL

    SELECT
        9,
        '09_ASSET_FORNITORE_SENZA_SERVIZIO',
        'DA_VALUTARE',

        coalesce(
            jsonb_agg(
                jsonb_build_object(
                    'asset_id',
                    afss.asset_id,

                    'codice_asset',
                    a.dati ->> 'codice_asset',

                    'fornitore_id',
                    afss.fornitore_id,

                    'codice_fornitore',
                    f.dati ->> 'codice_fornitore',

                    'tipo_relazione_id',
                    afss.tipo_relazione_id
                )
                ORDER BY
                    afss.asset_id,
                    afss.fornitore_id
            ),
            '[]'::jsonb
        )

    FROM asset_fornitore_senza_servizio AS afss

    LEFT JOIN asset AS a
        ON a.id = afss.asset_id

    LEFT JOIN fornitori AS f
        ON f.id = afss.fornitore_id

    UNION ALL

    SELECT
        10,
        '10_STATO_RLS',

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

    SELECT
        11,
        '11_PRIVILEGI_APPLICATIVI',

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

    UNION ALL

    SELECT
        12,
        '12_ESITO_DIAGNOSTICO',

        CASE
            WHEN
                (SELECT count(*) FROM anomalie) = 0
                AND
                (
                    SELECT bool_and(rls_attiva)
                    FROM stato_rls
                ) = true
                AND
                (
                    SELECT bool_and(
                        anon_select = false
                        AND anon_insert = false
                        AND anon_update = false
                        AND anon_delete = false
                        AND authenticated_delete = false
                    )
                    FROM privilegi
                ) = true
            THEN 'PRONTO'
            ELSE 'DA_CORREGGERE'
        END,

        jsonb_build_object(
            'anomalie_integrita',
            (SELECT count(*) FROM anomalie),

            'percorsi_servizio_asset_fornitore',
            (
                SELECT count(*)
                FROM percorsi_servizio_asset_fornitore
            ),

            'fornitori_servizio_senza_asset',
            (
                SELECT count(*)
                FROM fornitori_servizio_senza_asset
            ),

            'asset_fornitore_senza_servizio',
            (
                SELECT count(*)
                FROM asset_fornitore_senza_servizio
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