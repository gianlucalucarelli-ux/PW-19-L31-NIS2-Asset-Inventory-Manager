-- =========================================================================
-- FILE: sql/X20-Diagnostica-Audit-Accessi-v1.0.sql
-- TARGET ARCHITETTURALE: ER V5.1 (30 TABELLE, 7 VISTE, PURA 3NF)
-- DESCRIZIONE: Verifica in sola lettura della migrazione 29 senza pulizia, dei domini
--              Audit, della funzione RPC e dei privilegi applicativi.
-- TIPO SCRIPT: Diagnostica ufficiale read-only
-- =========================================================================

BEGIN;

SET TRANSACTION READ ONLY;

-- =========================================================================
-- 1. VERIFICHE BLOCCANTI
-- =========================================================================

DO $$
DECLARE
    v_operazioni text;
    v_entita text;
    v_trigger_audit integer;
BEGIN
    IF to_regprocedure(
        'public.fn_registra_accesso_applicativo(text,text)'
    ) IS NULL THEN
        RAISE EXCEPTION 'X20: funzione di registrazione accessi assente.';
    END IF;

    SELECT pg_get_constraintdef(oid)
    INTO v_operazioni
    FROM pg_constraint
    WHERE conrelid = 'public.audit_log'::regclass
      AND conname = 'check_operazione_audit';

    SELECT pg_get_constraintdef(oid)
    INTO v_entita
    FROM pg_constraint
    WHERE conrelid = 'public.audit_log'::regclass
      AND conname = 'check_audit_tipo_entita';

    IF position('LOGIN' IN coalesce(v_operazioni, '')) = 0
       OR position('LOGOUT' IN coalesce(v_operazioni, '')) = 0
       OR position('MFA_VERIFICATA' IN coalesce(v_operazioni, '')) = 0 THEN
        RAISE EXCEPTION 'X20: operazioni di accesso non presenti nel vincolo Audit.';
    END IF;

    IF position('ACCESSO' IN coalesce(v_entita, '')) = 0 THEN
        RAISE EXCEPTION 'X20: tipo entità ACCESSO non presente nel vincolo Audit.';
    END IF;

    IF NOT has_function_privilege(
        'authenticated',
        'public.fn_registra_accesso_applicativo(text,text)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'X20: authenticated privo di EXECUTE sulla funzione accessi.';
    END IF;

    IF has_function_privilege(
        'anon',
        'public.fn_registra_accesso_applicativo(text,text)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'X20: anon possiede EXECUTE sulla funzione accessi.';
    END IF;

    IF has_table_privilege('authenticated', 'public.audit_log', 'INSERT')
       OR has_table_privilege('authenticated', 'public.audit_log', 'UPDATE')
       OR has_table_privilege('authenticated', 'public.audit_log', 'DELETE')
       OR has_table_privilege('authenticated', 'public.audit_log', 'TRUNCATE') THEN
        RAISE EXCEPTION 'X20: authenticated possiede privilegi di modifica diretta su audit_log.';
    END IF;

    SELECT count(*)
    INTO v_trigger_audit
    FROM pg_trigger
    WHERE NOT tgisinternal
      AND tgname LIKE 'trg_audit_%';

    IF v_trigger_audit <> 15 THEN
        RAISE EXCEPTION 'X20: trigger Audit attesi 15, rilevati %.', v_trigger_audit;
    END IF;
END;
$$;

-- =========================================================================
-- 2. ESITO DIAGNOSTICO
-- =========================================================================

SELECT
    'X20_AUDIT_ACCESSI_OK' AS esito,
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
        FROM pg_trigger
        WHERE NOT tgisinternal
          AND tgname LIKE 'trg_audit_%'
    ) AS trigger_audit,
    (
        SELECT count(*)
        FROM public.audit_log
        WHERE tipo_entita = 'ACCESSO'
    ) AS eventi_accesso_registrati,
    (
        SELECT max(data_modifica)
        FROM public.audit_log
        WHERE tipo_entita = 'ACCESSO'
    ) AS ultimo_evento_accesso,
    has_function_privilege(
        'authenticated',
        'public.fn_registra_accesso_applicativo(text,text)',
        'EXECUTE'
    ) AS authenticated_execute_accessi,
    has_function_privilege(
        'anon',
        'public.fn_registra_accesso_applicativo(text,text)',
        'EXECUTE'
    ) AS anon_execute_accessi,
    has_table_privilege(
        'authenticated',
        'public.audit_log',
        'SELECT'
    ) AS authenticated_select_audit,
    has_table_privilege(
        'authenticated',
        'public.audit_log',
        'DELETE'
    ) AS authenticated_delete_audit,
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

ROLLBACK;
