-- =========================================================================
-- FILE: sql/12-Hardening-Vincoli-Dominio-Organizzazione-v1.0.sql
-- TARGET ARCHITETTURALE: ER V3.7 - 24 TABELLE IN TERZA FORMA NORMALE
-- DESCRIZIONE: Bonifica dei servizi privi di organizzazione e hardening
--              dei vincoli UNIQUE e NOT NULL del modello relazionale
-- TIPO SCRIPT: Produttivo - modifica dati e struttura del database
-- =========================================================================

/*
    OBIETTIVI DELLO SCRIPT

    1. Associare all'organizzazione principale i servizi che risultano
       privi di organizzazione.

    2. Impedire la creazione di duplicati nelle tabelle di dominio:
       - tipo_servizio;
       - tipo_fornitore;
       - ruolo_organigramma.

    3. Rendere obbligatoria l'associazione di asset e servizi a
       un'organizzazione.

    CONTROLLI PRELIMINARI ESEGUITI

    - Nessun duplicato rilevato nelle tre tabelle di dominio.
    - Nessun asset privo di organizzazione.
    - Tre servizi privi di organizzazione.
    - Organizzazione di riferimento disponibile con ID = 1.

    Lo script viene eseguito all'interno di una transazione atomica:
    in caso di errore nessuna modifica viene confermata.
*/

BEGIN;

-- =========================================================================
-- 1. VERIFICA DELL'ORGANIZZAZIONE DI RIFERIMENTO
-- =========================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.organizzazione
        WHERE id = 1
    ) THEN
        RAISE EXCEPTION
            'Organizzazione con ID 1 non presente. Operazione annullata.';
    END IF;
END
$$;

-- =========================================================================
-- 2. BONIFICA DEI SERVIZI PRIVI DI ORGANIZZAZIONE
-- =========================================================================

UPDATE public.servizio
SET organizzazione_id = 1
WHERE organizzazione_id IS NULL;

-- =========================================================================
-- 3. CONTROLLO SUCCESSIVO ALLA BONIFICA
-- =========================================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.servizio
        WHERE organizzazione_id IS NULL
    ) THEN
        RAISE EXCEPTION
            'Sono ancora presenti servizi privi di organizzazione.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.asset
        WHERE organizzazione_id IS NULL
    ) THEN
        RAISE EXCEPTION
            'Sono presenti asset privi di organizzazione.';
    END IF;
END
$$;

-- =========================================================================
-- 4. VINCOLI UNIQUE SULLE TABELLE DI DOMINIO
-- =========================================================================

ALTER TABLE public.tipo_servizio
    ADD CONSTRAINT tipo_servizio_nome_key
    UNIQUE (nome);

ALTER TABLE public.tipo_fornitore
    ADD CONSTRAINT tipo_fornitore_nome_key
    UNIQUE (nome);

ALTER TABLE public.ruolo_organigramma
    ADD CONSTRAINT ruolo_organigramma_nome_key
    UNIQUE (nome);

-- =========================================================================
-- 5. ORGANIZZAZIONE OBBLIGATORIA PER ASSET E SERVIZI
-- =========================================================================

ALTER TABLE public.asset
    ALTER COLUMN organizzazione_id SET NOT NULL;

ALTER TABLE public.servizio
    ALTER COLUMN organizzazione_id SET NOT NULL;

COMMIT;