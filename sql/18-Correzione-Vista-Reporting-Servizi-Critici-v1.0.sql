-- ============================================================================
-- FILE: sql/18-Correzione-Vista-Reporting-Servizi-Critici-v1.0.sql
-- TIPO: MIGRAZIONE PRODUTTIVA
-- VERSIONE: 1.0
--
-- PROGETTO:
--   NIS2 Asset Inventory Manager
--
-- SCOPO:
--   1. correggere la moltiplicazione cartesiana tra asset e fornitori;
--   2. produrre una sola riga di reporting per ciascun servizio;
--   3. aggregare separatamente asset e fornitori;
--   4. includere le gerarchie multilivello introdotte dallo script 17;
--   5. preservare le cinque colonne storiche della vista;
--   6. aggiungere identificativi, codici, conteggi e dettagli JSONB;
--   7. mantenere security_invoker e privilegi di sola lettura.
--
-- PROBLEMA CORRETTO:
--   La precedente definizione utilizzava due LEFT JOIN indipendenti:
--
--       servizio -> servizio_dipendenza_asset
--       servizio -> servizio_dipendenza_fornitore
--
--   Un servizio con 2 asset e 2 fornitori produceva quindi 4 righe,
--   suggerendo relazioni asset-fornitore non realmente registrate.
--
-- RISULTATO ATTESO:
--   - numero di tabelle public invariato: 30;
--   - una riga per ogni servizio;
--   - nessuna moltiplicazione asset x fornitore;
--   - 2 asset e 2 fornitori per il servizio Rete Perimetrale;
--   - sicurezza della vista invariata e allineata.
--
-- PREREQUISITI:
--   - pipeline produttiva eseguita fino allo script 17;
--   - diagnostica X14 con esito PRONTO_PER_CORREZIONE.
-- ============================================================================

BEGIN;


-- ============================================================================
-- 1. RIDEFINIZIONE DELLA VISTA
--
-- Le prime cinque colonne mantengono nomi e tipi compatibili con la versione
-- precedente:
--
--   Service_Name
--   Service_Type
--   Dependent_Asset
--   Vendor_Partner
--   Vendor_Contact
--
-- Le nuove colonne vengono aggiunte in coda.
-- ============================================================================

CREATE OR REPLACE VIEW public.vista_reporting_servizi_critici
WITH (
    security_invoker = true
)
AS
WITH

-- ============================================================================
-- 1.1 ASSET RAGGIUNGIBILI DA CIASCUN SERVIZIO
--
-- Sono inclusi:
--   - asset direttamente associati al servizio;
--   - asset associati ai sottoservizi;
--   - sotto-asset raggiungibili tramite la gerarchia attiva.
-- ============================================================================

asset_per_servizio AS (
    SELECT
        gs.servizio_radice_id AS servizio_id,

        ga.asset_nodo_id AS asset_id,

        max(a.codice_asset) AS codice_asset,

        max(a.nome) AS nome_asset,

        bool_or(
            gs.profondita > 0
        ) AS ereditato_da_sottoservizio,

        bool_or(
            ga.profondita > 0
        ) AS sottoasset

    FROM public.vista_gerarchia_servizi_espansa AS gs

    JOIN public.servizio_dipendenza_asset AS sda
        ON sda.servizio_id = gs.servizio_nodo_id

    JOIN public.vista_gerarchia_asset_espansa AS ga
        ON ga.asset_radice_id = sda.asset_id

    JOIN public.asset AS a
        ON a.id = ga.asset_nodo_id

    GROUP BY
        gs.servizio_radice_id,
        ga.asset_nodo_id
),

-- ============================================================================
-- 1.2 AGGREGAZIONE DEGLI ASSET
-- ============================================================================

asset_aggregati AS (
    SELECT
        aps.servizio_id,

        count(*)::bigint AS numero_asset,

        string_agg(
            aps.nome_asset,
            ', '
            ORDER BY
                aps.codice_asset,
                aps.nome_asset
        )::varchar AS elenco_asset,

        jsonb_agg(
            jsonb_build_object(
                'asset_id',
                aps.asset_id,

                'codice_asset',
                aps.codice_asset,

                'nome_asset',
                aps.nome_asset,

                'ereditato_da_sottoservizio',
                aps.ereditato_da_sottoservizio,

                'sottoasset',
                aps.sottoasset
            )
            ORDER BY
                aps.codice_asset,
                aps.nome_asset
        ) AS dettaglio_asset

    FROM asset_per_servizio AS aps

    GROUP BY aps.servizio_id
),

-- ============================================================================
-- 1.3 FORNITORI RAGGIUNGIBILI DA CIASCUN SERVIZIO
--
-- La vista Supply Chain distingue già:
--   - fornitori collegati direttamente al servizio;
--   - fornitori raggiunti attraverso un asset;
--   - subfornitori ereditati.
--
-- Lo stesso fornitore viene rappresentato una sola volta per servizio.
-- ============================================================================

fornitori_per_servizio AS (
    SELECT
        vsc.servizio_radice_id AS servizio_id,

        vsc.fornitore_effettivo_id AS fornitore_id,

        max(
            vsc.codice_fornitore_effettivo
        ) AS codice_fornitore,

        max(
            vsc.nome_fornitore_effettivo
        ) AS nome_fornitore,

        max(
            f.contatto_email
        ) AS contatto_email,

        bool_or(
            vsc.origine_collegamento
            = 'SERVIZIO_FORNITORE_DIRETTO'
        ) AS collegamento_diretto_servizio,

        bool_or(
            vsc.origine_collegamento
            = 'SERVIZIO_ASSET_FORNITORE'
        ) AS collegamento_tramite_asset,

        bool_or(
            vsc.ereditata_da_sottoservizio
        ) AS ereditato_da_sottoservizio,

        bool_or(
            vsc.ereditata_da_subfornitore
        ) AS subfornitore

    FROM public.vista_supply_chain_multilivello AS vsc

    JOIN public.fornitore AS f
        ON f.id = vsc.fornitore_effettivo_id

    GROUP BY
        vsc.servizio_radice_id,
        vsc.fornitore_effettivo_id
),

-- ============================================================================
-- 1.4 AGGREGAZIONE DEI FORNITORI
-- ============================================================================

fornitori_aggregati AS (
    SELECT
        fps.servizio_id,

        count(*)::bigint AS numero_fornitori,

        string_agg(
            fps.nome_fornitore,
            ', '
            ORDER BY
                fps.codice_fornitore,
                fps.nome_fornitore
        )::varchar AS elenco_fornitori,

        string_agg(
            fps.contatto_email,
            ', '
            ORDER BY
                fps.codice_fornitore,
                fps.nome_fornitore
        ) FILTER (
            WHERE fps.contatto_email IS NOT NULL
              AND btrim(fps.contatto_email) <> ''
        )::varchar AS elenco_contatti,

        jsonb_agg(
            jsonb_build_object(
                'fornitore_id',
                fps.fornitore_id,

                'codice_fornitore',
                fps.codice_fornitore,

                'nome_fornitore',
                fps.nome_fornitore,

                'contatto_email',
                fps.contatto_email,

                'collegamento_diretto_servizio',
                fps.collegamento_diretto_servizio,

                'collegamento_tramite_asset',
                fps.collegamento_tramite_asset,

                'ereditato_da_sottoservizio',
                fps.ereditato_da_sottoservizio,

                'subfornitore',
                fps.subfornitore
            )
            ORDER BY
                fps.codice_fornitore,
                fps.nome_fornitore
        ) AS dettaglio_fornitori

    FROM fornitori_per_servizio AS fps

    GROUP BY fps.servizio_id
)

-- ============================================================================
-- 1.5 RISULTATO FINALE: UNA RIGA PER SERVIZIO
-- ============================================================================

SELECT
    s.nome::varchar
        AS "Service_Name",

    ts.nome::varchar
        AS "Service_Type",

    coalesce(
        aa.elenco_asset,
        ''
    )::varchar
        AS "Dependent_Asset",

    coalesce(
        fa.elenco_fornitori,
        ''
    )::varchar
        AS "Vendor_Partner",

    coalesce(
        fa.elenco_contatti,
        ''
    )::varchar
        AS "Vendor_Contact",

    s.id
        AS servizio_id,

    s.codice_servizio
        AS codice_servizio,

    coalesce(
        aa.numero_asset,
        0
    )::bigint
        AS numero_asset,

    coalesce(
        fa.numero_fornitori,
        0
    )::bigint
        AS numero_fornitori,

    coalesce(
        aa.dettaglio_asset,
        '[]'::jsonb
    )
        AS dettaglio_asset,

    coalesce(
        fa.dettaglio_fornitori,
        '[]'::jsonb
    )
        AS dettaglio_fornitori

FROM public.servizio AS s

LEFT JOIN public.tipo_servizio AS ts
    ON ts.id = s.tipo_servizio_id

LEFT JOIN asset_aggregati AS aa
    ON aa.servizio_id = s.id

LEFT JOIN fornitori_aggregati AS fa
    ON fa.servizio_id = s.id;


-- ============================================================================
-- 2. COMMENTI DOCUMENTALI
-- ============================================================================

COMMENT ON VIEW public.vista_reporting_servizi_critici IS
    'Vista di reporting con una riga per servizio e aggregazione separata di asset e fornitori, inclusi i collegamenti multilivello attivi.';


COMMENT ON COLUMN
    public.vista_reporting_servizi_critici."Dependent_Asset"
IS
    'Elenco aggregato degli asset associati al servizio, inclusi sottoasset e asset dei sottoservizi.';


COMMENT ON COLUMN
    public.vista_reporting_servizi_critici."Vendor_Partner"
IS
    'Elenco aggregato dei fornitori associati al servizio, senza prodotto cartesiano con gli asset.';


COMMENT ON COLUMN
    public.vista_reporting_servizi_critici.dettaglio_asset
IS
    'Dettaglio JSONB degli asset raggiungibili dal servizio.';


COMMENT ON COLUMN
    public.vista_reporting_servizi_critici.dettaglio_fornitori
IS
    'Dettaglio JSONB dei fornitori raggiungibili dal servizio.';


-- ============================================================================
-- 3. PRIVILEGI
--
-- La vista resta disponibile esclusivamente in lettura per authenticated.
-- ============================================================================

REVOKE ALL
ON TABLE public.vista_reporting_servizi_critici
FROM PUBLIC;


REVOKE ALL
ON TABLE public.vista_reporting_servizi_critici
FROM anon;


REVOKE ALL
ON TABLE public.vista_reporting_servizi_critici
FROM authenticated;


GRANT SELECT
ON TABLE public.vista_reporting_servizi_critici
TO authenticated;


-- ============================================================================
-- 4. VERIFICA FINALE BLOCCANTE
-- ============================================================================

DO $$
DECLARE
    v_numero_servizi integer;
    v_numero_righe_vista integer;
    v_servizi_distinti integer;
    v_servizi_duplicati integer;

    v_asset_rete_perimetrale bigint;
    v_fornitori_rete_perimetrale bigint;

    v_security_invoker boolean;
    v_anon_select boolean;
    v_authenticated_select boolean;
    v_authenticated_insert boolean;
    v_authenticated_update boolean;
    v_authenticated_delete boolean;
BEGIN
    SELECT count(*)
    INTO v_numero_servizi
    FROM public.servizio;

    SELECT
        count(*),
        count(DISTINCT servizio_id)
    INTO
        v_numero_righe_vista,
        v_servizi_distinti
    FROM public.vista_reporting_servizi_critici;

    SELECT count(*)
    INTO v_servizi_duplicati
    FROM (
        SELECT servizio_id
        FROM public.vista_reporting_servizi_critici
        GROUP BY servizio_id
        HAVING count(*) > 1
    ) AS duplicati;

    SELECT
        numero_asset,
        numero_fornitori
    INTO
        v_asset_rete_perimetrale,
        v_fornitori_rete_perimetrale
    FROM public.vista_reporting_servizi_critici
    WHERE codice_servizio = 'SRV-RETE-PERIMETRALE';

    SELECT
        coalesce(
            c.reloptions,
            ARRAY[]::text[]
        ) @> ARRAY['security_invoker=true']
    INTO v_security_invoker
    FROM pg_class AS c
    WHERE c.oid =
        'public.vista_reporting_servizi_critici'::regclass;

    SELECT has_table_privilege(
        'anon',
        'public.vista_reporting_servizi_critici',
        'SELECT'
    )
    INTO v_anon_select;

    SELECT has_table_privilege(
        'authenticated',
        'public.vista_reporting_servizi_critici',
        'SELECT'
    )
    INTO v_authenticated_select;

    SELECT has_table_privilege(
        'authenticated',
        'public.vista_reporting_servizi_critici',
        'INSERT'
    )
    INTO v_authenticated_insert;

    SELECT has_table_privilege(
        'authenticated',
        'public.vista_reporting_servizi_critici',
        'UPDATE'
    )
    INTO v_authenticated_update;

    SELECT has_table_privilege(
        'authenticated',
        'public.vista_reporting_servizi_critici',
        'DELETE'
    )
    INTO v_authenticated_delete;

    IF v_numero_righe_vista <> v_numero_servizi THEN
        RAISE EXCEPTION
            'Cardinalità non valida: % servizi e % righe nella vista.',
            v_numero_servizi,
            v_numero_righe_vista;
    END IF;

    IF v_servizi_distinti <> v_numero_servizi THEN
        RAISE EXCEPTION
            'Servizi distinti non coerenti: % su %.',
            v_servizi_distinti,
            v_numero_servizi;
    END IF;

    IF v_servizi_duplicati <> 0 THEN
        RAISE EXCEPTION
            'Sono presenti % servizi duplicati nella vista.',
            v_servizi_duplicati;
    END IF;

    IF v_asset_rete_perimetrale <> 2 THEN
        RAISE EXCEPTION
            'Il servizio Rete Perimetrale espone % asset invece di 2.',
            v_asset_rete_perimetrale;
    END IF;

    IF v_fornitori_rete_perimetrale <> 2 THEN
        RAISE EXCEPTION
            'Il servizio Rete Perimetrale espone % fornitori invece di 2.',
            v_fornitori_rete_perimetrale;
    END IF;

    IF coalesce(v_security_invoker, false) = false THEN
        RAISE EXCEPTION
            'La vista non utilizza security_invoker.';
    END IF;

    IF v_anon_select = true THEN
        RAISE EXCEPTION
            'Il ruolo anon possiede SELECT sulla vista.';
    END IF;

    IF v_authenticated_select = false THEN
        RAISE EXCEPTION
            'Il ruolo authenticated non possiede SELECT sulla vista.';
    END IF;

    IF v_authenticated_insert = true
       OR v_authenticated_update = true
       OR v_authenticated_delete = true THEN
        RAISE EXCEPTION
            'Il ruolo authenticated possiede privilegi di modifica sulla vista.';
    END IF;
END;
$$;


COMMIT;


-- ============================================================================
-- 5. RISULTATO FINALE
-- ============================================================================

SELECT
    'SCRIPT_18_COMPLETATO' AS esito,

    (
        SELECT count(*)
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
    ) AS numero_tabelle_public,

    (
        SELECT count(*)
        FROM public.vista_reporting_servizi_critici
    ) AS righe_vista,

    (
        SELECT count(DISTINCT servizio_id)
        FROM public.vista_reporting_servizi_critici
    ) AS servizi_distinti,

    (
        SELECT count(*)
        FROM (
            SELECT servizio_id
            FROM public.vista_reporting_servizi_critici
            GROUP BY servizio_id
            HAVING count(*) > 1
        ) AS duplicati
    ) AS servizi_duplicati,

    (
        SELECT numero_asset
        FROM public.vista_reporting_servizi_critici
        WHERE codice_servizio = 'SRV-RETE-PERIMETRALE'
    ) AS asset_rete_perimetrale,

    (
        SELECT numero_fornitori
        FROM public.vista_reporting_servizi_critici
        WHERE codice_servizio = 'SRV-RETE-PERIMETRALE'
    ) AS fornitori_rete_perimetrale,

    (
        SELECT
            coalesce(
                c.reloptions,
                ARRAY[]::text[]
            ) @> ARRAY['security_invoker=true']
        FROM pg_class AS c
        WHERE c.oid =
            'public.vista_reporting_servizi_critici'::regclass
    ) AS security_invoker,

    has_table_privilege(
        'anon',
        'public.vista_reporting_servizi_critici',
        'SELECT'
    ) AS anon_select,

    has_table_privilege(
        'authenticated',
        'public.vista_reporting_servizi_critici',
        'SELECT'
    ) AS authenticated_select;