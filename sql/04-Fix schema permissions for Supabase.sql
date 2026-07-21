-- =========================================================================
-- FILE: sql/04-Fix schema permissions for Supabase.sql
-- TARGET ARCHITETTURALE: BASELINE ER V3.7 - 24 TABELLE
-- DESCRIZIONE: Configurazione dei privilegi PostgreSQL per i ruoli
--              Supabase secondo il principio del minimo privilegio
-- TIPO SCRIPT: Produttivo - configurazione DCL
-- =========================================================================

/*
    SCOPO

    Lo script configura i privilegi PostgreSQL necessari al gateway
    PostgREST, mantenendo separate:

    - autorizzazioni DCL;
    - policy Row Level Security definite nello script 03.

    PRINCIPI APPLICATI

    1. Il ruolo anon non riceve privilegi su tabelle e sequenze.

    2. Il ruolo authenticated riceve SELECT su tutte le tabelle e viste
       applicative dello schema public.

    3. INSERT e UPDATE vengono concessi soltanto sulle tabelle operative
       previste dallo script 03.

    4. Non viene concesso DELETE su alcuna tabella.

    5. Le tabelle di dominio, tassonomia e audit restano in sola lettura
       per i client autenticati.

    6. I privilegi predefiniti sulle future tabelle saranno limitati
       al solo SELECT. Ogni nuova migrazione dovrà concedere esplicitamente
       gli eventuali privilegi di scrittura necessari.

    NOTA

    La presenza del privilegio PostgreSQL non sostituisce la RLS.
    Per completare un'operazione devono risultare validi sia il privilegio
    DCL sia la relativa policy RLS.
*/

BEGIN;

-- =========================================================================
-- 1. ACCESSO ALLO SCHEMA
-- =========================================================================

GRANT USAGE ON SCHEMA public
TO authenticated, service_role;

REVOKE USAGE ON SCHEMA public
FROM anon;

-- =========================================================================
-- 2. REVOCA DEI PRIVILEGI PRECEDENTI
-- =========================================================================

/*
    Vengono rimossi i privilegi troppo estesi assegnati dalla precedente
    versione dello script, compreso DELETE.
*/

REVOKE ALL PRIVILEGES
ON ALL TABLES IN SCHEMA public
FROM anon;

REVOKE ALL PRIVILEGES
ON ALL SEQUENCES IN SCHEMA public
FROM anon;

REVOKE ALL PRIVILEGES
ON ALL TABLES IN SCHEMA public
FROM authenticated;

REVOKE ALL PRIVILEGES
ON ALL SEQUENCES IN SCHEMA public
FROM authenticated;

-- =========================================================================
-- 3. LETTURA DELLE TABELLE E DELLE VISTE
-- =========================================================================

/*
    In PostgreSQL il comando ON ALL TABLES comprende anche le viste.
    La visibilità effettiva delle righe resta subordinata alle policy RLS.
*/

GRANT SELECT
ON ALL TABLES IN SCHEMA public
TO authenticated;

-- =========================================================================
-- 4. SCRITTURA SULLE SOLE TABELLE OPERATIVE
-- =========================================================================

DO $$
DECLARE
    v_tabella text;

    v_tabelle_scrivibili constant text[] := ARRAY[
        'asset',
        'asset_vulnerabilita',
        'evento_servizio',
        'evento_tassonomia_acn',
        'fornitore',
        'responsabile',
        'responsabile_ruolo',
        'servizio',
        'servizio_componente',
        'servizio_dipendenza_asset',
        'servizio_dipendenza_fornitore'
    ];
BEGIN
    FOREACH v_tabella IN ARRAY v_tabelle_scrivibili
    LOOP
        IF to_regclass(
            format('public.%I', v_tabella)
        ) IS NULL THEN
            RAISE NOTICE
                'Tabella public.% non presente: privilegi DML rinviati.',
                v_tabella;

            CONTINUE;
        END IF;

        EXECUTE format(
            'GRANT INSERT, UPDATE ON TABLE public.%I TO authenticated',
            v_tabella
        );
    END LOOP;
END
$$;

-- =========================================================================
-- 5. PRIVILEGI SULLE SEQUENZE ESISTENTI
-- =========================================================================

/*
    Le tabelle operative con colonne serial o identity richiedono
    l'utilizzo delle relative sequenze durante gli inserimenti.
*/

GRANT USAGE, SELECT
ON ALL SEQUENCES IN SCHEMA public
TO authenticated;

-- =========================================================================
-- 6. PRIVILEGI PREDEFINITI PER LE FUTURE TABELLE
-- =========================================================================

/*
    Le future tabelle non devono ereditare automaticamente privilegi
    INSERT, UPDATE o DELETE.

    Per impostazione predefinita gli utenti autenticati ricevono soltanto
    SELECT. Le migrazioni che introducono nuove tabelle operative dovranno
    concedere esplicitamente gli ulteriori privilegi.
*/

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE ALL ON TABLES FROM anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE ALL ON TABLES FROM authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE ALL ON SEQUENCES FROM anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE ALL ON SEQUENCES FROM authenticated;

COMMIT;