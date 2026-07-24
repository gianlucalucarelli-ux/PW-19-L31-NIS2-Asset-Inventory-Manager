-- =============================================================================
-- 25 - Normalizzazione terminologica dei dati applicativi attivi
-- Versione: 1.0
--
-- Obiettivo:
--   eliminare dai dati applicativi attivi i riferimenti ospedalieri, sanitari
--   e clinici, sostituendoli con terminologia neutrale e coerente con un
--   generico soggetto NIS2.
--
-- Ambito:
--   - 2 asset;
--   - 1 organizzazione;
--   - 2 servizi;
--   - 1 tipo di servizio.
--
-- Garanzie:
--   - nessun DELETE fisico;
--   - nessuna modifica dell'Audit Log storico;
--   - conservazione di chiavi primarie e relazioni;
--   - verifica preventiva dei valori attesi;
--   - verifica di unicità dei nuovi codici;
--   - rollback automatico in caso di anomalia.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Verifiche preventive
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_count integer;
BEGIN
    -- Asset da rinominare.
    SELECT COUNT(*)
    INTO v_count
    FROM public.asset
    WHERE (id = 4 AND codice_asset = 'EMR-DATABASE-01' AND nome = 'EMR-Database-01')
       OR (id = 5 AND codice_asset = 'PACS-STORAGE-NODE' AND nome = 'PACS-Storage-Node');

    IF v_count <> 2 THEN
        RAISE EXCEPTION
            'Migrazione interrotta: trovati % asset attesi su 2.',
            v_count;
    END IF;

    -- I nuovi codici non devono essere già utilizzati da altri asset.
    IF EXISTS (
        SELECT 1
        FROM public.asset
        WHERE codice_asset IN (
            'DATA-PLATFORM-01',
            'DOCUMENT-STORAGE-NODE'
        )
          AND id NOT IN (4, 5)
    ) THEN
        RAISE EXCEPTION
            'Migrazione interrotta: uno dei nuovi codici asset è già utilizzato.';
    END IF;

    -- Organizzazione da normalizzare.
    SELECT COUNT(*)
    INTO v_count
    FROM public.organizzazione
    WHERE id = 1
      AND nome = 'Azienda Sanitaria Territoriale Alpha'
      AND descrizione = 'Presidio Ospedaliero Critico';

    IF v_count <> 1 THEN
        RAISE EXCEPTION
            'Migrazione interrotta: organizzazione attesa non trovata.';
    END IF;

    -- Servizi da normalizzare.
    SELECT COUNT(*)
    INTO v_count
    FROM public.servizio
    WHERE (
        id = 2
        AND codice_servizio = 'SRV-IAM-ACTIVE-DIRECTORY'
        AND nome = 'Gestione Identità (Active Directory)'
    )
    OR (
        id = 4
        AND codice_servizio = 'SRV-EMR-DATABASE'
        AND nome = 'Database Cartelle Cliniche (EMR)'
    );

    IF v_count <> 2 THEN
        RAISE EXCEPTION
            'Migrazione interrotta: trovati % servizi attesi su 2.',
            v_count;
    END IF;

    -- Il nuovo codice servizio deve essere libero.
    IF EXISTS (
        SELECT 1
        FROM public.servizio
        WHERE codice_servizio = 'SRV-DATA-PLATFORM'
          AND id <> 4
    ) THEN
        RAISE EXCEPTION
            'Migrazione interrotta: il nuovo codice servizio è già utilizzato.';
    END IF;

    -- Tipo di servizio da normalizzare.
    SELECT COUNT(*)
    INTO v_count
    FROM public.tipo_servizio
    WHERE id = 2
      AND nome = 'Core Business'
      AND descrizione = 'Servizi vitali per l''operatività ospedaliera';

    IF v_count <> 1 THEN
        RAISE EXCEPTION
            'Migrazione interrotta: tipo di servizio atteso non trovato.';
    END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Normalizzazione degli asset
-- -----------------------------------------------------------------------------
UPDATE public.asset
SET
    codice_asset = 'DATA-PLATFORM-01',
    nome = 'Data-Platform-01',
    descrizione = COALESCE(
        descrizione,
        'Piattaforma dati per servizi e processi operativi critici.'
    )
WHERE id = 4
  AND codice_asset = 'EMR-DATABASE-01'
  AND nome = 'EMR-Database-01';

UPDATE public.asset
SET
    codice_asset = 'DOCUMENT-STORAGE-NODE',
    nome = 'Document-Storage-Node',
    descrizione = COALESCE(
        descrizione,
        'Nodo di archiviazione documentale per dati e contenuti operativi.'
    ),
    versione = CASE
        WHEN versione = 'DICOM Server v4.1'
            THEN 'Storage Service v4.1'
        ELSE versione
    END
WHERE id = 5
  AND codice_asset = 'PACS-STORAGE-NODE'
  AND nome = 'PACS-Storage-Node';

-- -----------------------------------------------------------------------------
-- 3. Normalizzazione dell'organizzazione
-- -----------------------------------------------------------------------------
UPDATE public.organizzazione
SET
    nome = 'Organizzazione Territoriale Alpha',
    descrizione = 'Soggetto NIS2 con infrastrutture e servizi operativi critici.'
WHERE id = 1
  AND nome = 'Azienda Sanitaria Territoriale Alpha'
  AND descrizione = 'Presidio Ospedaliero Critico';

-- -----------------------------------------------------------------------------
-- 4. Normalizzazione dei servizi
-- -----------------------------------------------------------------------------
UPDATE public.servizio
SET
    descrizione = 'Autenticazione centralizzata per il personale autorizzato.'
WHERE id = 2
  AND codice_servizio = 'SRV-IAM-ACTIVE-DIRECTORY'
  AND nome = 'Gestione Identità (Active Directory)';

UPDATE public.servizio
SET
    codice_servizio = 'SRV-DATA-PLATFORM',
    nome = 'Piattaforma Dati Operativi',
    descrizione = 'Archiviazione e gestione di dati operativi critici.'
WHERE id = 4
  AND codice_servizio = 'SRV-EMR-DATABASE'
  AND nome = 'Database Cartelle Cliniche (EMR)';

-- -----------------------------------------------------------------------------
-- 5. Normalizzazione del tipo di servizio
-- -----------------------------------------------------------------------------
UPDATE public.tipo_servizio
SET
    descrizione = 'Servizi essenziali per la continuità operativa.'
WHERE id = 2
  AND nome = 'Core Business'
  AND descrizione = 'Servizi vitali per l''operatività ospedaliera';

-- -----------------------------------------------------------------------------
-- 6. Verifiche bloccanti finali sui dati attivi
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_count integer;
BEGIN
    SELECT COUNT(*)
    INTO v_count
    FROM public.asset
    WHERE id IN (4, 5)
      AND (
          codice_asset IN ('DATA-PLATFORM-01', 'DOCUMENT-STORAGE-NODE')
          AND nome IN ('Data-Platform-01', 'Document-Storage-Node')
      );

    IF v_count <> 2 THEN
        RAISE EXCEPTION
            'Verifica finale fallita: asset normalizzati %, attesi 2.',
            v_count;
    END IF;

    SELECT COUNT(*)
    INTO v_count
    FROM public.organizzazione
    WHERE id = 1
      AND nome = 'Organizzazione Territoriale Alpha'
      AND descrizione = 'Soggetto NIS2 con infrastrutture e servizi operativi critici.';

    IF v_count <> 1 THEN
        RAISE EXCEPTION
            'Verifica finale fallita: organizzazione non normalizzata.';
    END IF;

    SELECT COUNT(*)
    INTO v_count
    FROM public.servizio
    WHERE (
        id = 2
        AND descrizione = 'Autenticazione centralizzata per il personale autorizzato.'
    )
    OR (
        id = 4
        AND codice_servizio = 'SRV-DATA-PLATFORM'
        AND nome = 'Piattaforma Dati Operativi'
        AND descrizione = 'Archiviazione e gestione di dati operativi critici.'
    );

    IF v_count <> 2 THEN
        RAISE EXCEPTION
            'Verifica finale fallita: servizi normalizzati %, attesi 2.',
            v_count;
    END IF;

    SELECT COUNT(*)
    INTO v_count
    FROM public.tipo_servizio
    WHERE id = 2
      AND nome = 'Core Business'
      AND descrizione = 'Servizi essenziali per la continuità operativa.';

    IF v_count <> 1 THEN
        RAISE EXCEPTION
            'Verifica finale fallita: tipo di servizio non normalizzato.';
    END IF;

    -- Controllo dei riferimenti settoriali nei dati applicativi attivi.
    SELECT COUNT(*)
    INTO v_count
    FROM (
        SELECT concat_ws(' ', codice_asset, nome, descrizione, versione) AS testo
        FROM public.asset
        WHERE attiva IS TRUE

        UNION ALL

        SELECT concat_ws(' ', nome, descrizione)
        FROM public.organizzazione
        WHERE attiva IS TRUE

        UNION ALL

        SELECT concat_ws(' ', codice_servizio, nome, descrizione)
        FROM public.servizio
        WHERE attiva IS TRUE

        UNION ALL

        SELECT concat_ws(' ', nome, descrizione)
        FROM public.tipo_servizio
    ) AS dati_attivi
    WHERE dati_attivi.testo ~*
        '(ospedal|sanitari|clinico|clinica|paziente|reparto|medical|hospital|healthcare|(^|[^[:alnum:]])emr([^[:alnum:]]|$)|(^|[^[:alnum:]])pacs([^[:alnum:]]|$)|dicom)';

    IF v_count <> 0 THEN
        RAISE EXCEPTION
            'Verifica finale fallita: restano % riferimenti settoriali nei dati attivi.',
            v_count;
    END IF;
END;
$$;

COMMIT;

-- =============================================================================
-- RISULTATO FINALE DI VERIFICA
-- =============================================================================

SELECT
    'asset' AS tabella,
    id,
    codice_asset AS codice,
    nome,
    descrizione,
    versione
FROM public.asset
WHERE id IN (4, 5)

UNION ALL

SELECT
    'organizzazione',
    id,
    NULL::text,
    nome,
    descrizione,
    NULL::text
FROM public.organizzazione
WHERE id = 1

UNION ALL

SELECT
    'servizio',
    id,
    codice_servizio,
    nome,
    descrizione,
    NULL::text
FROM public.servizio
WHERE id IN (2, 4)

UNION ALL

SELECT
    'tipo_servizio',
    id,
    NULL::text,
    nome,
    descrizione,
    NULL::text
FROM public.tipo_servizio
WHERE id = 2

ORDER BY tabella, id;
