-- =========================================================================
-- FILE: sql/28-Popolamento-Cataloghi-Dipendenze-e-Impatti-v1.0.sql
-- TARGET ARCHITETTURALE: ER V5.2 (30 TABELLE, 3FN PRESERVATA)
-- DESCRIZIONE: Popolamento controllato dei cataloghi normalizzati usati
--              dalla gerarchia servizio-sottoservizio e dalla valutazione
--              dell'impatto sul servizio superiore.
-- =========================================================================
-- TIPO: MIGRAZIONE PRODUTTIVA - SOLI DATI DI CATALOGO
-- VERSIONE: 1.0
--
-- PROGETTO:
--   NIS2 Asset Inventory Manager
--
-- SCOPO:
--   1. popolare public.tipo_dipendenza con valori applicativi stabili;
--   2. popolare public.esito_impatto con livelli di impatto controllati;
--   3. rendere operativi i menu del costruttore Servizio -> Sottoservizio;
--   4. mantenere invariati schema, tabelle, viste, RLS e privilegi;
--   5. preservare la terza forma normale mediante cataloghi separati.
--
-- PREREQUISITI:
--   - pipeline produttiva eseguita fino allo script 27;
--   - 30 tabelle e 7 viste nello schema public;
--   - public.tipo_dipendenza esistente e leggibile da authenticated;
--   - public.esito_impatto esistente e leggibile da authenticated;
--   - nessun privilegio DELETE per authenticated;
--   - nessun privilegio applicativo per anon.
--
-- RISULTATO ATTESO:
--   - numero tabelle public invariato: 30;
--   - numero viste public invariato: 7;
--   - 5 tipi di dipendenza gerarchica disponibili;
--   - 5 esiti di impatto disponibili;
--   - nessuna nuova tabella, vista, funzione, policy o trigger;
--   - nessuna cancellazione o modifica dei dati operativi esistenti.
-- =========================================================================

BEGIN;


-- =========================================================================
-- 1. VERIFICHE PRELIMINARI BLOCCANTI
-- =========================================================================

DO $$
DECLARE
    v_numero_tabelle integer;
    v_numero_viste integer;
BEGIN
    IF to_regclass('public.tipo_dipendenza') IS NULL THEN
        RAISE EXCEPTION
            'Prerequisito mancante: public.tipo_dipendenza non esiste.';
    END IF;

    IF to_regclass('public.esito_impatto') IS NULL THEN
        RAISE EXCEPTION
            'Prerequisito mancante: public.esito_impatto non esiste.';
    END IF;

    IF to_regclass('public.servizio_componente') IS NULL THEN
        RAISE EXCEPTION
            'Prerequisito mancante: public.servizio_componente non esiste.';
    END IF;

    SELECT count(*)
    INTO v_numero_tabelle
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE';

    SELECT count(*)
    INTO v_numero_viste
    FROM information_schema.views
    WHERE table_schema = 'public';

    IF v_numero_tabelle <> 30 THEN
        RAISE EXCEPTION
            'Numero tabelle public inatteso: % invece di 30.',
            v_numero_tabelle;
    END IF;

    IF v_numero_viste <> 7 THEN
        RAISE EXCEPTION
            'Numero viste public inatteso: % invece di 7.',
            v_numero_viste;
    END IF;

    IF NOT has_table_privilege(
        'authenticated',
        'public.tipo_dipendenza',
        'SELECT'
    ) THEN
        RAISE EXCEPTION
            'authenticated non dispone di SELECT su public.tipo_dipendenza.';
    END IF;

    IF NOT has_table_privilege(
        'authenticated',
        'public.esito_impatto',
        'SELECT'
    ) THEN
        RAISE EXCEPTION
            'authenticated non dispone di SELECT su public.esito_impatto.';
    END IF;
END;
$$;


-- =========================================================================
-- 2. CATALOGO DEI TIPI DI DIPENDENZA SERVIZIO-SOTTOSERVIZIO
--
-- Il catalogo descrive la natura del collegamento. Non esprime la gravita
-- dell'effetto, che rimane normalizzata in public.esito_impatto.
--
-- L'operazione e idempotente: una riesecuzione aggiorna soltanto le
-- descrizioni dei codici stabili gia presenti.
-- =========================================================================

INSERT INTO public.tipo_dipendenza (
    codice,
    descrizione
)
VALUES
    (
        'COMPONENTE_FUNZIONALE',
        'Il sottoservizio realizza una funzione specifica del servizio superiore.'
    ),
    (
        'DIPENDENZA_TECNICA',
        'Il servizio superiore dipende tecnicamente dal sottoservizio o dalla relativa piattaforma.'
    ),
    (
        'INTEGRAZIONE',
        'Il collegamento abilita scambio dati, interoperabilita o cooperazione applicativa.'
    ),
    (
        'SUPPORTO',
        'Il sottoservizio fornisce supporto operativo senza costituire la funzione principale.'
    ),
    (
        'RIDONDANZA',
        'Il sottoservizio rappresenta un percorso alternativo, una replica o una capacita di continuita.'
    )
ON CONFLICT (codice)
DO UPDATE SET
    descrizione = EXCLUDED.descrizione;


-- =========================================================================
-- 3. CATALOGO DEGLI ESITI DI IMPATTO SUL SERVIZIO SUPERIORE
--
-- Il catalogo descrive l'effetto previsto sul nodo superiore quando il nodo
-- dipendente diventa indisponibile. Il peso percentuale resta memorizzato
-- separatamente nella relazione servizio_componente.
-- =========================================================================

INSERT INTO public.esito_impatto (
    codice,
    descrizione
)
VALUES
    (
        'TOTALE',
        'Il servizio superiore non puo erogare le proprie funzioni essenziali.'
    ),
    (
        'GRAVE',
        'Il servizio superiore conserva soltanto funzioni residue molto limitate.'
    ),
    (
        'PARZIALE',
        'Una parte significativa del servizio non funziona, ma rimangono disponibili altre funzioni.'
    ),
    (
        'LIEVE',
        'Il servizio continua a funzionare con una riduzione limitata delle prestazioni o delle funzioni.'
    ),
    (
        'NESSUN_IMPATTO_IMMEDIATO',
        'Ridondanza, alternativa o procedura di continuita evitano un impatto operativo immediato.'
    )
ON CONFLICT (codice)
DO UPDATE SET
    descrizione = EXCLUDED.descrizione;


-- =========================================================================
-- 4. VERIFICHE FINALI BLOCCANTI
-- =========================================================================

DO $$
DECLARE
    v_tipi_presenti integer;
    v_esiti_presenti integer;
BEGIN
    SELECT count(*)
    INTO v_tipi_presenti
    FROM public.tipo_dipendenza
    WHERE codice IN (
        'COMPONENTE_FUNZIONALE',
        'DIPENDENZA_TECNICA',
        'INTEGRAZIONE',
        'SUPPORTO',
        'RIDONDANZA'
    );

    SELECT count(*)
    INTO v_esiti_presenti
    FROM public.esito_impatto
    WHERE codice IN (
        'TOTALE',
        'GRAVE',
        'PARZIALE',
        'LIEVE',
        'NESSUN_IMPATTO_IMMEDIATO'
    );

    IF v_tipi_presenti <> 5 THEN
        RAISE EXCEPTION
            'Catalogo tipo_dipendenza incompleto: % valori attesi su 5.',
            v_tipi_presenti;
    END IF;

    IF v_esiti_presenti <> 5 THEN
        RAISE EXCEPTION
            'Catalogo esito_impatto incompleto: % valori attesi su 5.',
            v_esiti_presenti;
    END IF;
END;
$$;


COMMIT;


-- =========================================================================
-- 5. REPORT FINALE
-- =========================================================================

SELECT
    'SCRIPT_28_COMPLETATO' AS esito,
    (
        SELECT count(*)
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
    ) AS numero_tabelle_public,
    (
        SELECT count(*)
        FROM information_schema.views
        WHERE table_schema = 'public'
    ) AS numero_viste_public,
    (
        SELECT count(*)
        FROM public.tipo_dipendenza
        WHERE codice IN (
            'COMPONENTE_FUNZIONALE',
            'DIPENDENZA_TECNICA',
            'INTEGRAZIONE',
            'SUPPORTO',
            'RIDONDANZA'
        )
    ) AS tipi_dipendenza_disponibili,
    (
        SELECT count(*)
        FROM public.esito_impatto
        WHERE codice IN (
            'TOTALE',
            'GRAVE',
            'PARZIALE',
            'LIEVE',
            'NESSUN_IMPATTO_IMMEDIATO'
        )
    ) AS esiti_impatto_disponibili,
    (
        SELECT count(*)
        FROM information_schema.role_table_grants
        WHERE table_schema = 'public'
          AND grantee = 'anon'
    ) AS privilegi_anon_public,
    (
        SELECT count(*)
        FROM information_schema.role_table_grants
        WHERE table_schema = 'public'
          AND grantee = 'authenticated'
          AND privilege_type = 'DELETE'
    ) AS privilegi_delete_authenticated;
