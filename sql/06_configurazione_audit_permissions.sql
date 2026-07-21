-- =========================================================================
-- FILE: sql/06_configurazione_audit_permissions.sql
-- TARGET ARCHITETTURALE: BASELINE ER V3.7 - AUDIT ASSET
-- DESCRIZIONE: Configurazione della funzione e del trigger di audit sulla
--              tabella asset, con scrittura riservata al motore di audit
--              e senza alterare le policy MFA definite dallo script 03
-- TIPO SCRIPT: Produttivo - funzione, trigger e hardening RLS
-- =========================================================================

/*
    OBIETTIVI

    1. Registrare automaticamente nella tabella audit_log le operazioni:
       - INSERT;
       - UPDATE;
       - DELETE.

    2. Memorizzare:
       - tipo di operazione;
       - utente autenticato;
       - identificativo dell'asset;
       - data e ora dell'operazione.

    3. Impedire la scrittura diretta in audit_log da parte del frontend.

    4. Preservare le policy MFA già configurate dallo script 03 sulla
       tabella asset.

    5. Eliminare le vecchie policy troppo permissive:
       - Allow insert for authenticated users;
       - Allow all for authenticated.

    NOTA

    Il DELETE resta incluso nel trigger per tracciare eventuali operazioni
    amministrative o di sistema. L'applicazione non dispone tuttavia né
    del privilegio DCL né della policy RLS necessari alla cancellazione
    fisica degli asset.
*/

BEGIN;

-- =========================================================================
-- 1. FUNZIONE DI AUDIT
-- =========================================================================

CREATE OR REPLACE FUNCTION public.fn_audit_asset_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_asset_id integer;
    v_utente text;
BEGIN
    /*
        Per DELETE viene utilizzato OLD.id.
        Per INSERT e UPDATE viene utilizzato NEW.id.
    */

    v_asset_id :=
        CASE
            WHEN TG_OP = 'DELETE' THEN OLD.id
            ELSE NEW.id
        END;

    /*
        auth.email() restituisce l'indirizzo associato al JWT Supabase.
        Le operazioni amministrative eseguite senza JWT vengono registrate
        come SYSTEM_CORE.
    */

    v_utente := COALESCE(
        auth.email(),
        'SYSTEM_CORE'
    );

    INSERT INTO public.audit_log (
        operazione,
        utente,
        asset_id,
        data_modifica
    )
    VALUES (
        TG_OP,
        v_utente,
        v_asset_id,
        now()
    );

    /*
        Il valore restituito da un trigger AFTER viene ignorato.
    */

    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.fn_audit_asset_changes() IS
    'Registra INSERT, UPDATE e DELETE eseguiti sulla tabella asset.';

-- =========================================================================
-- 2. PROTEZIONE DELLA FUNZIONE
-- =========================================================================

/*
    La funzione viene utilizzata esclusivamente dal trigger.
    Non deve essere esposta come funzione richiamabile liberamente.
*/

REVOKE ALL
ON FUNCTION public.fn_audit_asset_changes()
FROM PUBLIC;

-- =========================================================================
-- 3. CONFIGURAZIONE DEL TRIGGER
-- =========================================================================

DROP TRIGGER IF EXISTS trg_asset_audit
ON public.asset;

CREATE TRIGGER trg_asset_audit
AFTER INSERT OR UPDATE OR DELETE
ON public.asset
FOR EACH ROW
EXECUTE FUNCTION public.fn_audit_asset_changes();

COMMENT ON TRIGGER trg_asset_audit
ON public.asset IS
    'Genera automaticamente un evento di audit per ogni modifica all asset.';

-- =========================================================================
-- 4. ABILITAZIONE RLS
-- =========================================================================

/*
    L'abilitazione è idempotente e preserva le policy già definite
    dallo script 03.
*/

ALTER TABLE public.asset
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.audit_log
    ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- 5. RIMOZIONE DELLE POLICY OBSOLETE E TROPPO PERMISSIVE
-- =========================================================================

/*
    Questa policy consentiva agli utenti autenticati di scrivere
    direttamente nel registro di audit.
*/

DROP POLICY IF EXISTS "Allow insert for authenticated users"
ON public.audit_log;

/*
    Questa policy FOR ALL permetteva anche il DELETE e aggirava
    le policy MFA configurate dallo script 03.
*/

DROP POLICY IF EXISTS "Allow all for authenticated"
ON public.asset;

-- =========================================================================
-- 6. HARDENING DEI PRIVILEGI SU AUDIT_LOG
-- =========================================================================

/*
    Il ruolo authenticated conserva esclusivamente SELECT.

    La funzione SECURITY DEFINER viene eseguita con i privilegi del
    proprietario e può quindi inserire il record di audit senza concedere
    INSERT direttamente al frontend.
*/

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
ON TABLE public.audit_log
FROM authenticated;

GRANT SELECT
ON TABLE public.audit_log
TO authenticated;

REVOKE ALL PRIVILEGES
ON TABLE public.audit_log
FROM anon;

-- =========================================================================
-- 7. DIVIETO DI CANCELLAZIONE FISICA DEGLI ASSET
-- =========================================================================

/*
    La cancellazione resta tecnicamente rilevabile dal trigger, ma non è
    concessa ai ruoli applicativi.
*/

REVOKE DELETE
ON TABLE public.asset
FROM authenticated;

REVOKE ALL PRIVILEGES
ON TABLE public.asset
FROM anon;

COMMIT;