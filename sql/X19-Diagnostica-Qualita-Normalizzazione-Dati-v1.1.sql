-- =============================================================================
-- X19 - Diagnostica qualità e normalizzazione dei dati applicativi
-- Versione: 1.1
-- Classificazione: diagnostica da conservare nella cartella /sql
--
-- Obiettivi:
--   1. profilare la qualità dei dati asset senza modificare record;
--   2. distinguere campi facoltativi mancanti da anomalie reali;
--   3. individuare record dimostrativi o con denominazioni non professionali;
--   4. rilevare riferimenti ospedalieri, sanitari o clinici in tutte le colonne
--      testuali dello schema public;
--   5. rilevare automaticamente tutte le relazioni che puntano ad asset;
--   6. riepilogare gli eventi aperti privi di classificazione ACN;
--   7. preparare una successiva migrazione di bonifica senza DELETE fisico.
--
-- Lo script usa solo tabelle temporanee e termina con ROLLBACK.
-- =============================================================================

BEGIN;

CREATE TEMP TABLE x19_risultati (
    sezione        text NOT NULL,
    gravita        text NOT NULL,
    oggetto        text,
    identificatore text,
    dettaglio      jsonb
) ON COMMIT DROP;

CREATE TEMP TABLE x19_relazioni_asset (
    asset_id integer NOT NULL,
    tabella  text NOT NULL,
    righe    bigint NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE x19_riferimenti_settoriali (
    tabella     text NOT NULL,
    colonna     text NOT NULL,
    occorrenze  bigint NOT NULL,
    esempi      jsonb
) ON COMMIT DROP;

-- -----------------------------------------------------------------------------
-- 1. Riepilogo generale degli asset
-- -----------------------------------------------------------------------------
INSERT INTO x19_risultati (
    sezione, gravita, oggetto, identificatore, dettaglio
)
SELECT
    'RIEPILOGO_ASSET',
    'INFO',
    'asset',
    NULL,
    jsonb_build_object(
        'totali', COUNT(*),
        'attivi', COUNT(*) FILTER (WHERE a.attiva IS TRUE),
        'archiviati', COUNT(*) FILTER (WHERE a.attiva IS FALSE),
        'senza_responsabile', COUNT(*) FILTER (WHERE a.responsabile_id IS NULL),
        'senza_descrizione', COUNT(*) FILTER (
            WHERE NULLIF(BTRIM(COALESCE(a.descrizione, '')), '') IS NULL
        ),
        'senza_ubicazione', COUNT(*) FILTER (
            WHERE NULLIF(BTRIM(COALESCE(a.ubicazione, '')), '') IS NULL
        ),
        'senza_versione', COUNT(*) FILTER (
            WHERE NULLIF(BTRIM(COALESCE(a.versione, '')), '') IS NULL
        )
    )
FROM public.asset AS a;

-- -----------------------------------------------------------------------------
-- 2. Verifiche difensive sui vincoli principali
-- -----------------------------------------------------------------------------
INSERT INTO x19_risultati (
    sezione, gravita, oggetto, identificatore, dettaglio
)
SELECT
    'FORMATO_CODICE',
    'ERRORE',
    a.nome,
    a.codice_asset,
    jsonb_build_object(
        'asset_id', a.id,
        'codice_asset', a.codice_asset,
        'motivo', 'Formato non conforme al vincolo applicativo'
    )
FROM public.asset AS a
WHERE a.codice_asset IS NULL
   OR a.codice_asset !~ '^[A-Z0-9][A-Z0-9_-]{2,79}$';

INSERT INTO x19_risultati (
    sezione, gravita, oggetto, identificatore, dettaglio
)
SELECT
    'ARCHIVIAZIONE_INCOERENTE',
    'ERRORE',
    a.nome,
    a.codice_asset,
    jsonb_build_object(
        'asset_id', a.id,
        'attiva', a.attiva,
        'archiviato_il', a.archiviato_il,
        'archiviato_da', a.archiviato_da,
        'motivo_archiviazione', a.motivo_archiviazione
    )
FROM public.asset AS a
WHERE (a.attiva IS TRUE AND a.archiviato_il IS NOT NULL)
   OR (a.attiva IS FALSE AND a.archiviato_il IS NULL);

-- -----------------------------------------------------------------------------
-- 3. Possibili record dimostrativi o denominazioni non professionali
-- -----------------------------------------------------------------------------
INSERT INTO x19_risultati (
    sezione, gravita, oggetto, identificatore, dettaglio
)
SELECT
    'POSSIBILE_RECORD_DIMOSTRATIVO',
    'ALTA',
    a.nome,
    a.codice_asset,
    jsonb_build_object(
        'asset_id', a.id,
        'categoria_asset_id', a.categoria_asset_id,
        'organizzazione_id', a.organizzazione_id,
        'responsabile_id', a.responsabile_id,
        'descrizione', a.descrizione,
        'ubicazione', a.ubicazione,
        'versione', a.versione,
        'attiva', a.attiva,
        'motivo',
            'Termine dimostrativo, temporaneo o non professionale'
    )
FROM public.asset AS a
WHERE concat_ws(
          ' ',
          a.codice_asset,
          a.nome,
          a.descrizione,
          a.ubicazione,
          a.versione
      ) ~* '(^|[^[:alnum:]])(test|prova|demo|temp|tmp|esempio|sample|placeholder|ciccio|romeo)([^[:alnum:]]|$)';

-- -----------------------------------------------------------------------------
-- 4. Riferimenti settoriali da eliminare in tutto lo schema public
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    r record;
    v_pattern constant text :=
        '(ospedal|sanitari|clinico|clinica|paziente|reparto|medical|hospital|healthcare|(^|[^[:alnum:]])emr([^[:alnum:]]|$)|(^|[^[:alnum:]])pacs([^[:alnum:]]|$))';
BEGIN
    FOR r IN
        SELECT
            c.table_name,
            c.column_name
        FROM information_schema.columns AS c
        JOIN information_schema.tables AS t
          ON t.table_schema = c.table_schema
         AND t.table_name = c.table_name
        WHERE c.table_schema = 'public'
          AND t.table_type = 'BASE TABLE'
          AND c.data_type IN (
              'character varying',
              'character',
              'text'
          )
        ORDER BY c.table_name, c.ordinal_position
    LOOP
        EXECUTE format(
            $sql$
            INSERT INTO x19_riferimenti_settoriali (
                tabella, colonna, occorrenze, esempi
            )
            SELECT
                %L,
                %L,
                COUNT(*),
                (
                    SELECT jsonb_agg(s.valore)
                    FROM (
                        SELECT DISTINCT LEFT(%I::text, 200) AS valore
                        FROM public.%I
                        WHERE %I ~* %L
                        ORDER BY valore
                        LIMIT 5
                    ) AS s
                )
            FROM public.%I
            WHERE %I ~* %L
            HAVING COUNT(*) > 0
            $sql$,
            r.table_name,
            r.column_name,
            r.column_name,
            r.table_name,
            r.column_name,
            v_pattern,
            r.table_name,
            r.column_name,
            v_pattern
        );
    END LOOP;
END;
$$;

INSERT INTO x19_risultati (
    sezione, gravita, oggetto, identificatore, dettaglio
)
SELECT
    'RIFERIMENTO_SETTORIALE',
    'ALTA',
    rs.tabella,
    rs.colonna,
    jsonb_build_object(
        'occorrenze', rs.occorrenze,
        'esempi', rs.esempi
    )
FROM x19_riferimenti_settoriali AS rs;

-- -----------------------------------------------------------------------------
-- 5. Rilevazione automatica delle relazioni che puntano a public.asset
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT
            child_ns.nspname AS child_schema,
            child.relname AS child_table,
            child_col.attname AS child_column
        FROM pg_constraint AS con
        JOIN pg_class AS parent
          ON parent.oid = con.confrelid
        JOIN pg_namespace AS parent_ns
          ON parent_ns.oid = parent.relnamespace
        JOIN pg_class AS child
          ON child.oid = con.conrelid
        JOIN pg_namespace AS child_ns
          ON child_ns.oid = child.relnamespace
        JOIN pg_attribute AS child_col
          ON child_col.attrelid = child.oid
         AND child_col.attnum = con.conkey[1]
        WHERE con.contype = 'f'
          AND parent_ns.nspname = 'public'
          AND parent.relname = 'asset'
          AND array_length(con.conkey, 1) = 1
          AND array_length(con.confkey, 1) = 1
        ORDER BY child_ns.nspname, child.relname
    LOOP
        EXECUTE format(
            'INSERT INTO x19_relazioni_asset (asset_id, tabella, righe)
             SELECT %I::integer, %L, COUNT(*)
             FROM %I.%I
             WHERE %I IS NOT NULL
             GROUP BY %I',
            r.child_column,
            r.child_schema || '.' || r.child_table,
            r.child_schema,
            r.child_table,
            r.child_column,
            r.child_column
        );
    END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. Elenco completo degli asset con relazioni e indicatori di revisione
-- -----------------------------------------------------------------------------
INSERT INTO x19_risultati (
    sezione, gravita, oggetto, identificatore, dettaglio
)
SELECT
    'ELENCO_ASSET',
    CASE
        WHEN concat_ws(
                 ' ',
                 a.codice_asset,
                 a.nome,
                 a.descrizione,
                 a.ubicazione,
                 a.versione
             ) ~* '(^|[^[:alnum:]])(test|prova|demo|temp|tmp|esempio|sample|placeholder|ciccio|romeo)([^[:alnum:]]|$)'
          OR concat_ws(
                 ' ',
                 a.codice_asset,
                 a.nome,
                 a.descrizione,
                 a.ubicazione,
                 a.versione
             ) ~* '(ospedal|sanitari|clinico|clinica|paziente|reparto|medical|hospital|healthcare|(^|[^[:alnum:]])emr([^[:alnum:]]|$)|(^|[^[:alnum:]])pacs([^[:alnum:]]|$))'
        THEN 'ALTA'
        WHEN NULLIF(BTRIM(COALESCE(a.descrizione, '')), '') IS NULL
          OR NULLIF(BTRIM(COALESCE(a.ubicazione, '')), '') IS NULL
        THEN 'REVISIONE'
        ELSE 'INFO'
    END,
    a.nome,
    a.codice_asset,
    jsonb_build_object(
        'asset_id', a.id,
        'categoria_asset_id', a.categoria_asset_id,
        'organizzazione_id', a.organizzazione_id,
        'responsabile_id', a.responsabile_id,
        'criticita', a.classificazione_criticita,
        'descrizione', a.descrizione,
        'ubicazione', a.ubicazione,
        'versione', a.versione,
        'data_inserimento', a.data_inserimento,
        'attiva', a.attiva,
        'relazioni',
            COALESCE(
                (
                    SELECT jsonb_object_agg(x.tabella, x.righe)
                    FROM x19_relazioni_asset AS x
                    WHERE x.asset_id = a.id
                ),
                '{}'::jsonb
            )
    )
FROM public.asset AS a;

-- -----------------------------------------------------------------------------
-- 7. Possibili duplicati per nome e organizzazione
-- -----------------------------------------------------------------------------
WITH duplicati AS (
    SELECT
        a.organizzazione_id,
        regexp_replace(lower(btrim(a.nome)), '\s+', ' ', 'g')
            AS nome_normalizzato,
        COUNT(*) AS quantita,
        array_agg(a.id ORDER BY a.id) AS asset_ids,
        array_agg(a.codice_asset ORDER BY a.id) AS codici_asset
    FROM public.asset AS a
    GROUP BY
        a.organizzazione_id,
        regexp_replace(lower(btrim(a.nome)), '\s+', ' ', 'g')
    HAVING COUNT(*) > 1
)
INSERT INTO x19_risultati (
    sezione, gravita, oggetto, identificatore, dettaglio
)
SELECT
    'DUPLICATO_NOME_ORGANIZZAZIONE',
    'ALTA',
    d.nome_normalizzato,
    d.organizzazione_id::text,
    jsonb_build_object(
        'organizzazione_id', d.organizzazione_id,
        'quantita', d.quantita,
        'asset_ids', d.asset_ids,
        'codici_asset', d.codici_asset
    )
FROM duplicati AS d;

-- -----------------------------------------------------------------------------
-- 8. Campi facoltativi da completare, senza considerarli errori
-- -----------------------------------------------------------------------------
INSERT INTO x19_risultati (
    sezione, gravita, oggetto, identificatore, dettaglio
)
SELECT
    'CAMPI_FACOLTATIVI_DA_COMPLETARE',
    'REVISIONE',
    a.nome,
    a.codice_asset,
    jsonb_strip_nulls(
        jsonb_build_object(
            'asset_id', a.id,
            'responsabile_mancante',
                CASE WHEN a.responsabile_id IS NULL THEN true END,
            'descrizione_mancante',
                CASE
                    WHEN NULLIF(BTRIM(COALESCE(a.descrizione, '')), '') IS NULL
                    THEN true
                END,
            'ubicazione_mancante',
                CASE
                    WHEN NULLIF(BTRIM(COALESCE(a.ubicazione, '')), '') IS NULL
                    THEN true
                END,
            'versione_mancante',
                CASE
                    WHEN NULLIF(BTRIM(COALESCE(a.versione, '')), '') IS NULL
                    THEN true
                END
        )
    )
FROM public.asset AS a
WHERE a.attiva IS TRUE
  AND (
      a.responsabile_id IS NULL
      OR NULLIF(BTRIM(COALESCE(a.descrizione, '')), '') IS NULL
      OR NULLIF(BTRIM(COALESCE(a.ubicazione, '')), '') IS NULL
      OR NULLIF(BTRIM(COALESCE(a.versione, '')), '') IS NULL
  );

-- -----------------------------------------------------------------------------
-- 9. Riferimenti anagrafici non utilizzati
-- -----------------------------------------------------------------------------
INSERT INTO x19_risultati (
    sezione, gravita, oggetto, identificatore, dettaglio
)
SELECT
    'RIFERIMENTO_NON_USATO',
    'REVISIONE',
    'categoria_asset',
    c.id::text,
    to_jsonb(c)
FROM public.categoria_asset AS c
WHERE NOT EXISTS (
    SELECT 1
    FROM public.asset AS a
    WHERE a.categoria_asset_id = c.id
);

INSERT INTO x19_risultati (
    sezione, gravita, oggetto, identificatore, dettaglio
)
SELECT
    'RIFERIMENTO_NON_USATO',
    'REVISIONE',
    'organizzazione',
    o.id::text,
    to_jsonb(o)
FROM public.organizzazione AS o
WHERE NOT EXISTS (
    SELECT 1
    FROM public.asset AS a
    WHERE a.organizzazione_id = o.id
);

INSERT INTO x19_risultati (
    sezione, gravita, oggetto, identificatore, dettaglio
)
SELECT
    'RIFERIMENTO_NON_USATO',
    'REVISIONE',
    'responsabile',
    r.id::text,
    to_jsonb(r)
FROM public.responsabile AS r
WHERE NOT EXISTS (
    SELECT 1
    FROM public.asset AS a
    WHERE a.responsabile_id = r.id
);

-- -----------------------------------------------------------------------------
-- 10. Eventi aperti incompleti
-- -----------------------------------------------------------------------------
INSERT INTO x19_risultati (
    sezione, gravita, oggetto, identificatore, dettaglio
)
SELECT
    'EVENTI_INCOMPLETI',
    'ALTA',
    'evento_servizio',
    NULL,
    jsonb_build_object(
        'aperti_totali', COUNT(*) FILTER (
            WHERE e.attiva IS TRUE
              AND e.fine IS NULL
        ),
        'aperti_senza_classificazioni', COUNT(*) FILTER (
            WHERE e.attiva IS TRUE
              AND e.fine IS NULL
              AND NOT EXISTS (
                  SELECT 1
                  FROM public.evento_tassonomia_acn AS et
                  WHERE et.evento_id = e.id
                    AND et.attiva IS TRUE
              )
        ),
        'aperti_senza_tipologia', COUNT(*) FILTER (
            WHERE e.attiva IS TRUE
              AND e.fine IS NULL
              AND e.tipologia IS NULL
        ),
        'interrotti_dopo_primo_passo', COUNT(*) FILTER (
            WHERE e.attiva IS TRUE
              AND e.fine IS NULL
              AND e.tipologia IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1
                  FROM public.evento_tassonomia_acn AS et
                  WHERE et.evento_id = e.id
                    AND et.attiva IS TRUE
              )
        ),
        'aperti_classificati', COUNT(*) FILTER (
            WHERE e.attiva IS TRUE
              AND e.fine IS NULL
              AND EXISTS (
                  SELECT 1
                  FROM public.evento_tassonomia_acn AS et
                  WHERE et.evento_id = e.id
                    AND et.attiva IS TRUE
              )
        )
    )
FROM public.evento_servizio AS e;

-- -----------------------------------------------------------------------------
-- 11. Riepilogo delle segnalazioni
-- -----------------------------------------------------------------------------
INSERT INTO x19_risultati (
    sezione, gravita, oggetto, identificatore, dettaglio
)
SELECT
    'RIEPILOGO_SEGNALAZIONI',
    'INFO',
    r.sezione,
    NULL,
    jsonb_build_object(
        'righe', SUM(r.quantita),
        'gravita', jsonb_object_agg(r.gravita, r.quantita)
    )
FROM (
    SELECT
        sezione,
        gravita,
        COUNT(*) AS quantita
    FROM x19_risultati
    GROUP BY sezione, gravita
) AS r
GROUP BY r.sezione;

-- -----------------------------------------------------------------------------
-- Risultato unico ordinato
-- -----------------------------------------------------------------------------
SELECT
    sezione,
    gravita,
    oggetto,
    identificatore,
    dettaglio
FROM x19_risultati
ORDER BY
    CASE gravita
        WHEN 'ERRORE' THEN 1
        WHEN 'ALTA' THEN 2
        WHEN 'REVISIONE' THEN 3
        WHEN 'INFO' THEN 4
        ELSE 9
    END,
    sezione,
    oggetto,
    identificatore;

ROLLBACK;
