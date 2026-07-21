-- =========================================================================
-- FILE: sql/X8_CHECK_DUPLICATES_AND_NULL_ORGANIZATIONS.sql
-- TARGET ARCHITETTURALE: DATABASE POSTGRESQL IN PRODUZIONE SU SUPABASE
-- DESCRIZIONE: Verifica preventiva di duplicati nelle tabelle di dominio
--              e di asset o servizi privi di organizzazione
-- TIPO SCRIPT: Diagnostico, sola lettura, nessuna modifica al database
-- =========================================================================

/*
    SCOPO DELLA QUERY

    La query verifica:

    1. eventuali nomi duplicati nella tabella tipo_servizio;
    2. eventuali nomi duplicati nella tabella tipo_fornitore;
    3. eventuali nomi duplicati nella tabella ruolo_organigramma;
    4. eventuali asset privi di organizzazione;
    5. eventuali servizi privi di organizzazione.

    Il risultato sarà utilizzato per valutare l'introduzione di:

    - vincoli UNIQUE sui nomi delle tabelle di dominio;
    - vincoli NOT NULL su organizzazione_id nelle tabelle asset e servizio.

    La query non modifica il database.
*/

-- =========================================================================
-- 1. DUPLICATI NELLA TABELLA tipo_servizio
-- =========================================================================

SELECT
    'tipo_servizio' AS controllo,
    LOWER(TRIM(nome)) AS valore_normalizzato,
    COUNT(*) AS numero_occorrenze
FROM tipo_servizio
GROUP BY LOWER(TRIM(nome))
HAVING COUNT(*) > 1;

-- =========================================================================
-- 2. DUPLICATI NELLA TABELLA tipo_fornitore
-- =========================================================================

SELECT
    'tipo_fornitore' AS controllo,
    LOWER(TRIM(nome)) AS valore_normalizzato,
    COUNT(*) AS numero_occorrenze
FROM tipo_fornitore
GROUP BY LOWER(TRIM(nome))
HAVING COUNT(*) > 1;

-- =========================================================================
-- 3. DUPLICATI NELLA TABELLA ruolo_organigramma
-- =========================================================================

SELECT
    'ruolo_organigramma' AS controllo,
    LOWER(TRIM(nome)) AS valore_normalizzato,
    COUNT(*) AS numero_occorrenze
FROM ruolo_organigramma
GROUP BY LOWER(TRIM(nome))
HAVING COUNT(*) > 1;

-- =========================================================================
-- 4. ASSET PRIVI DI ORGANIZZAZIONE
-- =========================================================================

SELECT
    id,
    nome,
    organizzazione_id
FROM asset
WHERE organizzazione_id IS NULL;

-- =========================================================================
-- 5. SERVIZI PRIVI DI ORGANIZZAZIONE
-- =========================================================================

SELECT
    id,
    nome,
    organizzazione_id
FROM servizio
WHERE organizzazione_id IS NULL;