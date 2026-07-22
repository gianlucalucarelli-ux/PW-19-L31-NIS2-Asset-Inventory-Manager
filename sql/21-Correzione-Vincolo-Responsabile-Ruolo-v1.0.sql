-- ============================================================================
-- FILE: sql/21-Correzione-Vincolo-Responsabile-Ruolo-v1.0.sql
-- TIPO: MIGRAZIONE PRODUTTIVA CORRETTIVA
-- VERSIONE: 1.0
--
-- PROGETTO:
--   NIS2 Asset Inventory Manager
--
-- SCOPO:
--   Eliminare l'ultimo vincolo ON DELETE CASCADE rilevato dalla verifica
--   finale X17 sulla tabella public.responsabile_ruolo.
--
-- ANOMALIA RILEVATA:
--   Vincolo:
--     responsabile_ruolo_ruolo_id_fkey
--
--   Definizione precedente:
--     FOREIGN KEY (ruolo_id)
--     REFERENCES public.ruolo(id)
--     ON DELETE CASCADE
--
-- CORREZIONE:
--   Sostituire ON DELETE CASCADE con ON DELETE RESTRICT, impedendo che la
--   cancellazione di un ruolo elimini fisicamente le associazioni presenti
--   nella tabella responsabile_ruolo.
--
-- PREREQUISITI:
--   - pipeline produttiva eseguita fino allo script 20;
--   - X17 versione 1.1 eseguito con un solo vincolo CASCADE residuo.
--
-- RISULTATO ATTESO:
--   - numero tabelle public invariato: 30;
--   - vincolo responsabile_ruolo_ruolo_id_fkey configurato come RESTRICT;
--   - nessun vincolo ON DELETE CASCADE nello schema public.
-- ============================================================================

BEGIN;


-- ============================================================================
-- 1. VERIFICA PRELIMINARE DEGLI OGGETTI
-- ============================================================================

DO $$
BEGIN
    IF to_regclass('public.responsabile_ruolo') IS NULL THEN
        RAISE EXCEPTION
            'Tabella public.responsabile_ruolo mancante.';
    END IF;

    IF to_regclass('public.ruolo') IS NULL THEN
        RAISE EXCEPTION
            'Tabella public.ruolo mancante.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'responsabile_ruolo'
          AND column_name = 'ruolo_id'
    ) THEN
        RAISE EXCEPTION
            'Colonna public.responsabile_ruolo.ruolo_id mancante.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'ruolo'
          AND column_name = 'id'
    ) THEN
        RAISE EXCEPTION
            'Colonna public.ruolo.id mancante.';
    END IF;
END;
$$;


-- ============================================================================
-- 2. SOSTITUZIONE DEL VINCOLO CASCADE CON RESTRICT
-- ============================================================================

ALTER TABLE public.responsabile_ruolo
    DROP CONSTRAINT IF EXISTS
        responsabile_ruolo_ruolo_id_fkey;


ALTER TABLE public.responsabile_ruolo
    ADD CONSTRAINT responsabile_ruolo_ruolo_id_fkey
    FOREIGN KEY (ruolo_id)
    REFERENCES public.ruolo(id)
    ON DELETE RESTRICT;


-- ============================================================================
-- 3. VERIFICA BLOCCANTE
-- ============================================================================

DO $$
DECLARE
    v_numero_tabelle integer;
    v_tipo_delete "char";
    v_fk_cascade_public integer;
BEGIN
    SELECT count(*)
    INTO v_numero_tabelle
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE';

    SELECT c.confdeltype
    INTO v_tipo_delete
    FROM pg_constraint AS c
    JOIN pg_class AS tabella
        ON tabella.oid = c.conrelid
    JOIN pg_namespace AS n
        ON n.oid = tabella.relnamespace
    WHERE n.nspname = 'public'
      AND tabella.relname = 'responsabile_ruolo'
      AND c.conname = 'responsabile_ruolo_ruolo_id_fkey'
      AND c.contype = 'f';

    SELECT count(*)
    INTO v_fk_cascade_public
    FROM pg_constraint AS c
    JOIN pg_class AS origine
        ON origine.oid = c.conrelid
    JOIN pg_namespace AS n_origine
        ON n_origine.oid = origine.relnamespace
    JOIN pg_class AS destinazione
        ON destinazione.oid = c.confrelid
    JOIN pg_namespace AS n_destinazione
        ON n_destinazione.oid = destinazione.relnamespace
    WHERE c.contype = 'f'
      AND c.confdeltype = 'c'
      AND n_origine.nspname = 'public'
      AND n_destinazione.nspname = 'public';

    IF v_numero_tabelle <> 30 THEN
        RAISE EXCEPTION
            'Numero tabelle public inatteso: % invece di 30.',
            v_numero_tabelle;
    END IF;

    IF v_tipo_delete IS NULL THEN
        RAISE EXCEPTION
            'Vincolo responsabile_ruolo_ruolo_id_fkey non trovato.';
    END IF;

    IF v_tipo_delete <> 'r' THEN
        RAISE EXCEPTION
            'Il vincolo responsabile_ruolo_ruolo_id_fkey non e RESTRICT.';
    END IF;

    IF v_fk_cascade_public <> 0 THEN
        RAISE EXCEPTION
            'Restano % vincoli ON DELETE CASCADE nello schema public.',
            v_fk_cascade_public;
    END IF;
END;
$$;


COMMIT;


-- ============================================================================
-- 4. RISULTATO FINALE
-- ============================================================================

SELECT
    'SCRIPT_21_COMPLETATO' AS esito,

    (
        SELECT count(*)
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
    ) AS numero_tabelle_public,

    (
        SELECT CASE c.confdeltype
            WHEN 'a' THEN 'NO ACTION'
            WHEN 'r' THEN 'RESTRICT'
            WHEN 'c' THEN 'CASCADE'
            WHEN 'n' THEN 'SET NULL'
            WHEN 'd' THEN 'SET DEFAULT'
            ELSE 'SCONOSCIUTO'
        END
        FROM pg_constraint AS c
        JOIN pg_class AS tabella
            ON tabella.oid = c.conrelid
        JOIN pg_namespace AS n
            ON n.oid = tabella.relnamespace
        WHERE n.nspname = 'public'
          AND tabella.relname = 'responsabile_ruolo'
          AND c.conname = 'responsabile_ruolo_ruolo_id_fkey'
          AND c.contype = 'f'
    ) AS responsabile_ruolo_on_delete,

    (
        SELECT count(*)
        FROM pg_constraint AS c
        JOIN pg_class AS origine
            ON origine.oid = c.conrelid
        JOIN pg_namespace AS n_origine
            ON n_origine.oid = origine.relnamespace
        JOIN pg_class AS destinazione
            ON destinazione.oid = c.confrelid
        JOIN pg_namespace AS n_destinazione
            ON n_destinazione.oid = destinazione.relnamespace
        WHERE c.contype = 'f'
          AND c.confdeltype = 'c'
          AND n_origine.nspname = 'public'
          AND n_destinazione.nspname = 'public'
    ) AS vincoli_delete_cascade_public;