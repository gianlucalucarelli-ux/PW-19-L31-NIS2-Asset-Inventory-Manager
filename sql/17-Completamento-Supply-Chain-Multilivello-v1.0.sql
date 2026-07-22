-- ============================================================================
-- FILE: sql/17-Completamento-Supply-Chain-Multilivello-v1.0.sql
-- TIPO: MIGRAZIONE PRODUTTIVA
-- VERSIONE: 1.0
--
-- PROGETTO:
--   NIS2 Asset Inventory Manager
--
-- SCOPO:
--   1. creare la chiusura transitiva della gerarchia dei servizi;
--   2. creare la chiusura transitiva della gerarchia degli asset;
--   3. creare la chiusura transitiva della gerarchia dei fornitori;
--   4. costruire una vista unificata della Supply Chain multilivello;
--   5. distinguere collegamenti diretti e collegamenti ereditati;
--   6. distinguere fornitori diretti del servizio e fornitori degli asset;
--   7. mantenere la provenienza semantica di ciascun percorso;
--   8. applicare privilegi di sola lettura alle viste.
--
-- RISULTATO ATTESO:
--   - tabelle public: 30, senza variazioni;
--   - nuove viste: 4;
--   - relazioni dirette servizio-fornitore preservate;
--   - percorsi tramite asset visibili quando asset_fornitore viene popolata;
--   - RLS applicata attraverso le tabelle sottostanti.
--
-- PREREQUISITI:
--   - pipeline produttiva eseguita fino allo script 16;
--   - diagnostica X13 eseguita con esito PRONTO.
--
-- NOTA:
--   Le viste utilizzano security_invoker = true. Le query vengono quindi
--   eseguite con i privilegi dell'utente chiamante e rispettano le policy
--   RLS delle tabelle sottostanti.
-- ============================================================================

BEGIN;


-- ============================================================================
-- 1. CHIUSURA TRANSITIVA DELLA GERARCHIA DEI SERVIZI
--
-- La vista contiene:
--   - ogni servizio rispetto a sé stesso, con profondità 0;
--   - tutti i sottoservizi attivi raggiungibili;
--   - la profondità minima del collegamento.
-- ============================================================================

CREATE OR REPLACE VIEW public.vista_gerarchia_servizi_espansa
WITH (
    security_invoker = true
)
AS
WITH RECURSIVE cammini AS (
    SELECT
        s.id AS servizio_radice_id,
        s.id AS servizio_nodo_id,
        0::integer AS profondita,
        ARRAY[s.id]::integer[] AS percorso
    FROM public.servizio AS s

    UNION ALL

    SELECT
        c.servizio_radice_id,
        sc.servizio_figlio_id,
        c.profondita + 1,
        c.percorso || sc.servizio_figlio_id
    FROM cammini AS c
    JOIN public.servizio_componente AS sc
        ON sc.servizio_padre_id = c.servizio_nodo_id
       AND sc.attiva = true
    WHERE NOT sc.servizio_figlio_id = ANY(c.percorso)
)
SELECT
    servizio_radice_id,
    servizio_nodo_id,
    min(profondita)::integer AS profondita
FROM cammini
GROUP BY
    servizio_radice_id,
    servizio_nodo_id;


COMMENT ON VIEW public.vista_gerarchia_servizi_espansa IS
    'Chiusura transitiva delle relazioni attive servizio-sottoservizio.';


-- ============================================================================
-- 2. CHIUSURA TRANSITIVA DELLA GERARCHIA DEGLI ASSET
-- ============================================================================

CREATE OR REPLACE VIEW public.vista_gerarchia_asset_espansa
WITH (
    security_invoker = true
)
AS
WITH RECURSIVE cammini AS (
    SELECT
        a.id AS asset_radice_id,
        a.id AS asset_nodo_id,
        0::integer AS profondita,
        ARRAY[a.id]::integer[] AS percorso
    FROM public.asset AS a

    UNION ALL

    SELECT
        c.asset_radice_id,
        ac.asset_figlio_id,
        c.profondita + 1,
        c.percorso || ac.asset_figlio_id
    FROM cammini AS c
    JOIN public.asset_componente AS ac
        ON ac.asset_padre_id = c.asset_nodo_id
       AND ac.attiva = true
    WHERE NOT ac.asset_figlio_id = ANY(c.percorso)
)
SELECT
    asset_radice_id,
    asset_nodo_id,
    min(profondita)::integer AS profondita
FROM cammini
GROUP BY
    asset_radice_id,
    asset_nodo_id;


COMMENT ON VIEW public.vista_gerarchia_asset_espansa IS
    'Chiusura transitiva delle relazioni attive asset-sottoasset.';


-- ============================================================================
-- 3. CHIUSURA TRANSITIVA DELLA GERARCHIA DEI FORNITORI
-- ============================================================================

CREATE OR REPLACE VIEW public.vista_gerarchia_fornitori_espansa
WITH (
    security_invoker = true
)
AS
WITH RECURSIVE cammini AS (
    SELECT
        f.id AS fornitore_radice_id,
        f.id AS fornitore_nodo_id,
        0::integer AS profondita,
        ARRAY[f.id]::integer[] AS percorso
    FROM public.fornitore AS f

    UNION ALL

    SELECT
        c.fornitore_radice_id,
        fr.fornitore_figlio_id,
        c.profondita + 1,
        c.percorso || fr.fornitore_figlio_id
    FROM cammini AS c
    JOIN public.fornitore_relazione AS fr
        ON fr.fornitore_padre_id = c.fornitore_nodo_id
       AND fr.attiva = true
    WHERE NOT fr.fornitore_figlio_id = ANY(c.percorso)
)
SELECT
    fornitore_radice_id,
    fornitore_nodo_id,
    min(profondita)::integer AS profondita
FROM cammini
GROUP BY
    fornitore_radice_id,
    fornitore_nodo_id;


COMMENT ON VIEW public.vista_gerarchia_fornitori_espansa IS
    'Chiusura transitiva delle relazioni attive fornitore-subfornitore.';


-- ============================================================================
-- 4. VISTA UNIFICATA DELLA SUPPLY CHAIN MULTILIVELLO
--
-- La vista espone due categorie di percorsi:
--
--   SERVIZIO_FORNITORE_DIRETTO
--     Il fornitore è collegato direttamente al servizio tramite
--     servizio_dipendenza_fornitore.
--
--   SERVIZIO_ASSET_FORNITORE
--     Il percorso passa attraverso:
--       servizio -> asset -> fornitore.
--
-- Le gerarchie vengono espanse soltanto attraverso relazioni attive.
-- ============================================================================

CREATE OR REPLACE VIEW public.vista_supply_chain_multilivello
WITH (
    security_invoker = true
)
AS
WITH

-- ---------------------------------------------------------------------------
-- Percorsi servizio-fornitore diretti.
-- ---------------------------------------------------------------------------

percorsi_fornitore_diretto AS (
    SELECT
        gs.servizio_radice_id,

        gs.servizio_nodo_id
            AS servizio_origine_id,

        gs.profondita
            AS profondita_servizio,

        NULL::integer
            AS asset_origine_id,

        NULL::integer
            AS asset_effettivo_id,

        NULL::integer
            AS profondita_asset,

        sdf.fornitore_id
            AS fornitore_origine_id,

        gf.fornitore_nodo_id
            AS fornitore_effettivo_id,

        gf.profondita
            AS profondita_fornitore,

        'SERVIZIO_FORNITORE_DIRETTO'::varchar(40)
            AS origine_collegamento,

        sdf.tipo_dipendenza_servizio_id,

        NULL::bigint
            AS tipo_relazione_asset_fornitore_id,

        sdf.descrizione
            AS descrizione_dipendenza_servizio,

        NULL::text
            AS descrizione_relazione_asset_fornitore

    FROM public.vista_gerarchia_servizi_espansa AS gs

    JOIN public.servizio_dipendenza_fornitore AS sdf
        ON sdf.servizio_id = gs.servizio_nodo_id

    JOIN public.vista_gerarchia_fornitori_espansa AS gf
        ON gf.fornitore_radice_id = sdf.fornitore_id
),

-- ---------------------------------------------------------------------------
-- Percorsi servizio-asset-fornitore.
-- ---------------------------------------------------------------------------

percorsi_tramite_asset AS (
    SELECT
        gs.servizio_radice_id,

        gs.servizio_nodo_id
            AS servizio_origine_id,

        gs.profondita
            AS profondita_servizio,

        sda.asset_id
            AS asset_origine_id,

        ga.asset_nodo_id
            AS asset_effettivo_id,

        ga.profondita
            AS profondita_asset,

        af.fornitore_id
            AS fornitore_origine_id,

        gf.fornitore_nodo_id
            AS fornitore_effettivo_id,

        gf.profondita
            AS profondita_fornitore,

        'SERVIZIO_ASSET_FORNITORE'::varchar(40)
            AS origine_collegamento,

        sda.tipo_dipendenza_servizio_id,

        af.tipo_relazione_asset_fornitore_id,

        sda.descrizione
            AS descrizione_dipendenza_servizio,

        af.descrizione
            AS descrizione_relazione_asset_fornitore

    FROM public.vista_gerarchia_servizi_espansa AS gs

    JOIN public.servizio_dipendenza_asset AS sda
        ON sda.servizio_id = gs.servizio_nodo_id

    JOIN public.vista_gerarchia_asset_espansa AS ga
        ON ga.asset_radice_id = sda.asset_id

    JOIN public.asset_fornitore AS af
        ON af.asset_id = ga.asset_nodo_id
       AND af.attiva = true

    JOIN public.vista_gerarchia_fornitori_espansa AS gf
        ON gf.fornitore_radice_id = af.fornitore_id
),

-- ---------------------------------------------------------------------------
-- Unione dei due tipi di percorso.
-- ---------------------------------------------------------------------------

percorsi AS (
    SELECT
        *
    FROM percorsi_fornitore_diretto

    UNION ALL

    SELECT
        *
    FROM percorsi_tramite_asset
)

SELECT
    p.origine_collegamento,

    p.servizio_radice_id,

    servizio_radice.codice_servizio
        AS codice_servizio_radice,

    servizio_radice.nome
        AS nome_servizio_radice,

    p.servizio_origine_id,

    servizio_origine.codice_servizio
        AS codice_servizio_origine,

    servizio_origine.nome
        AS nome_servizio_origine,

    p.profondita_servizio,

    p.asset_origine_id,

    asset_origine.codice_asset
        AS codice_asset_origine,

    asset_origine.nome
        AS nome_asset_origine,

    p.asset_effettivo_id,

    asset_effettivo.codice_asset
        AS codice_asset_effettivo,

    asset_effettivo.nome
        AS nome_asset_effettivo,

    p.profondita_asset,

    p.fornitore_origine_id,

    fornitore_origine.codice_fornitore
        AS codice_fornitore_origine,

    fornitore_origine.nome
        AS nome_fornitore_origine,

    p.fornitore_effettivo_id,

    fornitore_effettivo.codice_fornitore
        AS codice_fornitore_effettivo,

    fornitore_effettivo.nome
        AS nome_fornitore_effettivo,

    p.profondita_fornitore,

    p.tipo_dipendenza_servizio_id,

    coalesce(
        to_jsonb(tipo_dipendenza) ->> 'codice',
        to_jsonb(tipo_dipendenza) ->> 'nome'
    ) AS tipo_dipendenza_servizio,

    p.tipo_relazione_asset_fornitore_id,

    tipo_relazione_asset_fornitore.codice
        AS tipo_relazione_asset_fornitore,

    p.descrizione_dipendenza_servizio,

    p.descrizione_relazione_asset_fornitore,

    (
        p.servizio_radice_id
        <> p.servizio_origine_id
    ) AS ereditata_da_sottoservizio,

    (
        p.asset_origine_id IS NOT NULL
        AND p.asset_origine_id
            <> p.asset_effettivo_id
    ) AS ereditata_da_sottoasset,

    (
        p.fornitore_origine_id
        <> p.fornitore_effettivo_id
    ) AS ereditata_da_subfornitore

FROM percorsi AS p

JOIN public.servizio AS servizio_radice
    ON servizio_radice.id = p.servizio_radice_id

JOIN public.servizio AS servizio_origine
    ON servizio_origine.id = p.servizio_origine_id

LEFT JOIN public.asset AS asset_origine
    ON asset_origine.id = p.asset_origine_id

LEFT JOIN public.asset AS asset_effettivo
    ON asset_effettivo.id = p.asset_effettivo_id

JOIN public.fornitore AS fornitore_origine
    ON fornitore_origine.id = p.fornitore_origine_id

JOIN public.fornitore AS fornitore_effettivo
    ON fornitore_effettivo.id = p.fornitore_effettivo_id

LEFT JOIN public.tipo_dipendenza_servizio AS tipo_dipendenza
    ON tipo_dipendenza.id
       = p.tipo_dipendenza_servizio_id

LEFT JOIN public.tipo_relazione_asset_fornitore
    AS tipo_relazione_asset_fornitore
    ON tipo_relazione_asset_fornitore.id
       = p.tipo_relazione_asset_fornitore_id;


COMMENT ON VIEW public.vista_supply_chain_multilivello IS
    'Vista unificata dei percorsi diretti e multilivello tra servizi, asset e fornitori.';


-- ============================================================================
-- 5. RIMOZIONE DEI PRIVILEGI IMPLICITI
-- ============================================================================

REVOKE ALL
ON TABLE public.vista_gerarchia_servizi_espansa
FROM PUBLIC;


REVOKE ALL
ON TABLE public.vista_gerarchia_asset_espansa
FROM PUBLIC;


REVOKE ALL
ON TABLE public.vista_gerarchia_fornitori_espansa
FROM PUBLIC;


REVOKE ALL
ON TABLE public.vista_supply_chain_multilivello
FROM PUBLIC;


REVOKE ALL
ON TABLE public.vista_gerarchia_servizi_espansa
FROM anon;


REVOKE ALL
ON TABLE public.vista_gerarchia_asset_espansa
FROM anon;


REVOKE ALL
ON TABLE public.vista_gerarchia_fornitori_espansa
FROM anon;


REVOKE ALL
ON TABLE public.vista_supply_chain_multilivello
FROM anon;


REVOKE ALL
ON TABLE public.vista_gerarchia_servizi_espansa
FROM authenticated;


REVOKE ALL
ON TABLE public.vista_gerarchia_asset_espansa
FROM authenticated;


REVOKE ALL
ON TABLE public.vista_gerarchia_fornitori_espansa
FROM authenticated;


REVOKE ALL
ON TABLE public.vista_supply_chain_multilivello
FROM authenticated;


-- ============================================================================
-- 6. PRIVILEGI DI SOLA LETTURA
-- ============================================================================

GRANT SELECT
ON TABLE public.vista_gerarchia_servizi_espansa
TO authenticated;


GRANT SELECT
ON TABLE public.vista_gerarchia_asset_espansa
TO authenticated;


GRANT SELECT
ON TABLE public.vista_gerarchia_fornitori_espansa
TO authenticated;


GRANT SELECT
ON TABLE public.vista_supply_chain_multilivello
TO authenticated;


-- ============================================================================
-- 7. VERIFICA FINALE BLOCCANTE
-- ============================================================================

DO $$
DECLARE
    v_viste_presenti integer;
    v_viste_security_invoker integer;
    v_relazioni_dirette integer;
    v_copertura_relazioni_dirette integer;
    v_privilegi_anon integer;
    v_privilegi_authenticated integer;
BEGIN
    SELECT count(*)
    INTO v_viste_presenti
    FROM pg_class AS c
    JOIN pg_namespace AS n
        ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'v'
      AND c.relname IN (
          'vista_gerarchia_servizi_espansa',
          'vista_gerarchia_asset_espansa',
          'vista_gerarchia_fornitori_espansa',
          'vista_supply_chain_multilivello'
      );

    SELECT count(*)
    INTO v_viste_security_invoker
    FROM pg_class AS c
    JOIN pg_namespace AS n
        ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'v'
      AND c.relname IN (
          'vista_gerarchia_servizi_espansa',
          'vista_gerarchia_asset_espansa',
          'vista_gerarchia_fornitori_espansa',
          'vista_supply_chain_multilivello'
      )
      AND coalesce(
          c.reloptions,
          ARRAY[]::text[]
      ) @> ARRAY['security_invoker=true'];

    SELECT count(*)
    INTO v_relazioni_dirette
    FROM public.servizio_dipendenza_fornitore;

    SELECT count(*)
    INTO v_copertura_relazioni_dirette
    FROM public.vista_supply_chain_multilivello
    WHERE origine_collegamento
          = 'SERVIZIO_FORNITORE_DIRETTO'
      AND profondita_servizio = 0
      AND profondita_fornitore = 0;

    SELECT count(*)
    INTO v_privilegi_anon
    FROM (
        SELECT has_table_privilege(
            'anon',
            'public.vista_gerarchia_servizi_espansa',
            'SELECT'
        ) AS presente

        UNION ALL

        SELECT has_table_privilege(
            'anon',
            'public.vista_gerarchia_asset_espansa',
            'SELECT'
        )

        UNION ALL

        SELECT has_table_privilege(
            'anon',
            'public.vista_gerarchia_fornitori_espansa',
            'SELECT'
        )

        UNION ALL

        SELECT has_table_privilege(
            'anon',
            'public.vista_supply_chain_multilivello',
            'SELECT'
        )
    ) AS privilegi
    WHERE presente = true;

    SELECT count(*)
    INTO v_privilegi_authenticated
    FROM (
        SELECT has_table_privilege(
            'authenticated',
            'public.vista_gerarchia_servizi_espansa',
            'SELECT'
        ) AS presente

        UNION ALL

        SELECT has_table_privilege(
            'authenticated',
            'public.vista_gerarchia_asset_espansa',
            'SELECT'
        )

        UNION ALL

        SELECT has_table_privilege(
            'authenticated',
            'public.vista_gerarchia_fornitori_espansa',
            'SELECT'
        )

        UNION ALL

        SELECT has_table_privilege(
            'authenticated',
            'public.vista_supply_chain_multilivello',
            'SELECT'
        )
    ) AS privilegi
    WHERE presente = true;

    IF v_viste_presenti <> 4 THEN
        RAISE EXCEPTION
            'Verifica fallita: risultano % viste invece di 4.',
            v_viste_presenti;
    END IF;

    IF v_viste_security_invoker <> 4 THEN
        RAISE EXCEPTION
            'Verifica fallita: soltanto % viste usano security_invoker.',
            v_viste_security_invoker;
    END IF;

    IF v_copertura_relazioni_dirette
       <> v_relazioni_dirette THEN
        RAISE EXCEPTION
            'Copertura non coerente: % relazioni dirette, % percorsi diretti di profondità zero.',
            v_relazioni_dirette,
            v_copertura_relazioni_dirette;
    END IF;

    IF v_privilegi_anon <> 0 THEN
        RAISE EXCEPTION
            'Il ruolo anon possiede SELECT su % nuove viste.',
            v_privilegi_anon;
    END IF;

    IF v_privilegi_authenticated <> 4 THEN
        RAISE EXCEPTION
            'Il ruolo authenticated possiede SELECT soltanto su % viste.',
            v_privilegi_authenticated;
    END IF;
END;
$$;


COMMIT;


-- ============================================================================
-- 8. RISULTATO FINALE
-- ============================================================================

SELECT
    'SCRIPT_17_COMPLETATO' AS esito,

    (
        SELECT count(*)
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
    ) AS numero_tabelle_public,

    (
        SELECT count(*)
        FROM pg_class AS c
        JOIN pg_namespace AS n
            ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind = 'v'
          AND c.relname IN (
              'vista_gerarchia_servizi_espansa',
              'vista_gerarchia_asset_espansa',
              'vista_gerarchia_fornitori_espansa',
              'vista_supply_chain_multilivello'
          )
    ) AS nuove_viste,

    (
        SELECT count(*)
        FROM public.vista_supply_chain_multilivello
        WHERE origine_collegamento
              = 'SERVIZIO_FORNITORE_DIRETTO'
    ) AS percorsi_fornitore_diretto,

    (
        SELECT count(*)
        FROM public.vista_supply_chain_multilivello
        WHERE origine_collegamento
              = 'SERVIZIO_ASSET_FORNITORE'
    ) AS percorsi_tramite_asset,

    (
        SELECT coalesce(
            max(profondita),
            0
        )
        FROM public.vista_gerarchia_servizi_espansa
    ) AS profondita_massima_servizi,

    (
        SELECT coalesce(
            max(profondita),
            0
        )
        FROM public.vista_gerarchia_asset_espansa
    ) AS profondita_massima_asset,

    (
        SELECT coalesce(
            max(profondita),
            0
        )
        FROM public.vista_gerarchia_fornitori_espansa
    ) AS profondita_massima_fornitori;