-- =============================================================================
-- 24 - Archiviazione logica degli asset dimostrativi
-- Versione: 1.0
--
-- Obiettivo:
--   rimuovere dall'inventario operativo sei asset dimostrativi, senza DELETE
--   fisico e senza alterare la tracciabilità storica.
--
-- Asset interessati:
--   CICCIO, FIREWALL12, FW12, FW-CICCIO, FW-ROMEO, SERVER12
--
-- Garanzie:
--   - verifica che i sei record esistano e siano ancora attivi;
--   - blocco della migrazione se uno degli asset risulta referenziato da
--     qualunque foreign key verso public.asset;
--   - archiviazione logica tramite UPDATE;
--   - nessuna modifica all'Audit Log storico;
--   - i trigger di audit esistenti continuano a registrare l'operazione.
-- =============================================================================

BEGIN;

DO $$
DECLARE
    v_codici constant text[] := ARRAY[
        'CICCIO',
        'FIREWALL12',
        'FW12',
        'FW-CICCIO',
        'FW-ROMEO',
        'SERVER12'
    ];
    v_attivi integer;
    v_totali integer;
    v_aggiornati integer;
    v_fk record;
    v_riferimenti bigint;
BEGIN
    SELECT COUNT(*)
    INTO v_totali
    FROM public.asset
    WHERE codice_asset = ANY (v_codici);

    IF v_totali <> 6 THEN
        RAISE EXCEPTION
            'Migrazione interrotta: trovati % asset su 6 attesi.',
            v_totali;
    END IF;

    SELECT COUNT(*)
    INTO v_attivi
    FROM public.asset
    WHERE codice_asset = ANY (v_codici)
      AND attiva IS TRUE
      AND archiviato_il IS NULL;

    IF v_attivi <> 6 THEN
        RAISE EXCEPTION
            'Migrazione interrotta: solo % asset su 6 risultano attivi e non archiviati.',
            v_attivi;
    END IF;

    -- Verifica dinamica di tutte le foreign key semplici che puntano a public.asset.
    FOR v_fk IN
        SELECT
            child_ns.nspname AS schema_figlia,
            child.relname AS tabella_figlia,
            child_col.attname AS colonna_figlia
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
    LOOP
        EXECUTE format(
            'SELECT COUNT(*)
             FROM %I.%I
             WHERE %I IN (
                 SELECT id
                 FROM public.asset
                 WHERE codice_asset = ANY ($1)
             )',
            v_fk.schema_figlia,
            v_fk.tabella_figlia,
            v_fk.colonna_figlia
        )
        INTO v_riferimenti
        USING v_codici;

        IF v_riferimenti > 0 THEN
            RAISE EXCEPTION
                'Migrazione interrotta: trovati % riferimenti in %.%.',
                v_riferimenti,
                v_fk.schema_figlia,
                v_fk.tabella_figlia;
        END IF;
    END LOOP;

    UPDATE public.asset
    SET
        attiva = FALSE,
        archiviato_il = clock_timestamp(),
        archiviato_da = NULL,
        motivo_archiviazione =
            'Record dimostrativo archiviato durante la normalizzazione controllata dei dati (migrazione 24).'
    WHERE codice_asset = ANY (v_codici)
      AND attiva IS TRUE
      AND archiviato_il IS NULL;

    GET DIAGNOSTICS v_aggiornati = ROW_COUNT;

    IF v_aggiornati <> 6 THEN
        RAISE EXCEPTION
            'Migrazione interrotta: aggiornati % asset invece di 6.',
            v_aggiornati;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.asset
        WHERE codice_asset = ANY (v_codici)
          AND (
              attiva IS TRUE
              OR archiviato_il IS NULL
              OR motivo_archiviazione IS NULL
          )
    ) THEN
        RAISE EXCEPTION
            'Verifica finale fallita: archiviazione logica incompleta.';
    END IF;
END;
$$;

COMMIT;

-- Risultato finale di verifica.
SELECT
    id,
    codice_asset,
    nome,
    attiva,
    archiviato_il,
    archiviato_da,
    motivo_archiviazione
FROM public.asset
WHERE codice_asset IN (
    'CICCIO',
    'FIREWALL12',
    'FW12',
    'FW-CICCIO',
    'FW-ROMEO',
    'SERVER12'
)
ORDER BY id;
