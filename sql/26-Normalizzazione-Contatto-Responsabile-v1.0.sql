-- =============================================================================
-- 26 - Normalizzazione del contatto del responsabile
-- Versione: 1.0
--
-- Obiettivo:
--   rimuovere dai dati applicativi attivi l'ultimo riferimento settoriale
--   rilevato nell'indirizzo e-mail del responsabile.
--
-- Garanzie:
--   - nessun DELETE fisico;
--   - nessuna modifica dell'Audit Log storico;
--   - conservazione dell'identificativo e delle relazioni;
--   - verifica preventiva e finale;
--   - rollback automatico in caso di anomalia.
-- =============================================================================

BEGIN;

DO $$
DECLARE
    v_count integer;
BEGIN
    SELECT COUNT(*)
    INTO v_count
    FROM public.responsabile
    WHERE id = 1
      AND email = 'g.lucarelli@sanita.it'
      AND attiva IS TRUE;

    IF v_count <> 1 THEN
        RAISE EXCEPTION
            'Migrazione interrotta: responsabile attivo atteso non trovato.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.responsabile
        WHERE lower(email) = lower('g.lucarelli@organizzazione-alpha.example')
          AND id <> 1
    ) THEN
        RAISE EXCEPTION
            'Migrazione interrotta: il nuovo indirizzo e-mail è già utilizzato.';
    END IF;
END;
$$;

UPDATE public.responsabile
SET email = 'g.lucarelli@organizzazione-alpha.example'
WHERE id = 1
  AND email = 'g.lucarelli@sanita.it'
  AND attiva IS TRUE;

DO $$
DECLARE
    v_count integer;
BEGIN
    SELECT COUNT(*)
    INTO v_count
    FROM public.responsabile
    WHERE id = 1
      AND email = 'g.lucarelli@organizzazione-alpha.example'
      AND attiva IS TRUE;

    IF v_count <> 1 THEN
        RAISE EXCEPTION
            'Verifica finale fallita: contatto del responsabile non normalizzato.';
    END IF;

    SELECT COUNT(*)
    INTO v_count
    FROM public.responsabile
    WHERE attiva IS TRUE
      AND concat_ws(' ', nome, cognome, email, telefono) ~*
          '(ospedal|sanitari|sanita|clinico|clinica|paziente|reparto|medical|hospital|healthcare)';

    IF v_count <> 0 THEN
        RAISE EXCEPTION
            'Verifica finale fallita: restano % riferimenti settoriali nei responsabili attivi.',
            v_count;
    END IF;
END;
$$;

COMMIT;

SELECT
    id,
    nome,
    cognome,
    email,
    attiva
FROM public.responsabile
WHERE id = 1;
