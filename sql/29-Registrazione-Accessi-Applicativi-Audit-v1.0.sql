-- =========================================================================
-- FILE: sql/29-Registrazione-Accessi-Applicativi-Audit-v1.0.sql
-- TARGET ARCHITETTURALE: ER V5.1 (30 TABELLE, 7 VISTE, PURA 3NF)
-- DESCRIZIONE: Estensione controllata dell'Audit Log per registrare gli
--              accessi applicativi autenticati a Supabase/PostgreSQL.
--              Lo script NON elimina alcun evento storico.
-- TIPO SCRIPT: Migrazione produttiva idempotente
-- =========================================================================

BEGIN;

-- =========================================================================
-- 1. VERIFICA DEI PREREQUISITI
-- =========================================================================

DO $$
BEGIN
    IF to_regclass('public.audit_log') IS NULL THEN
        RAISE EXCEPTION 'Prerequisito mancante: public.audit_log non esiste.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'audit_log'
          AND column_name = 'tipo_entita'
    ) THEN
        RAISE EXCEPTION 'Prerequisito mancante: audit_log.tipo_entita non esiste.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'audit_log'
          AND column_name = 'valore_nuovo_jsonb'
    ) THEN
        RAISE EXCEPTION 'Prerequisito mancante: audit_log.valore_nuovo_jsonb non esiste.';
    END IF;
END;
$$;

-- =========================================================================
-- 2. ESTENSIONE DEI DOMINI CONTROLLATI DELL'AUDIT LOG
-- =========================================================================

ALTER TABLE public.audit_log
    DROP CONSTRAINT IF EXISTS check_operazione_audit;

ALTER TABLE public.audit_log
    ADD CONSTRAINT check_operazione_audit
    CHECK (
        operazione IN (
            'INSERT',
            'UPDATE',
            'DELETE',
            'LOGIN',
            'LOGOUT',
            'MFA_VERIFICATA'
        )
    );

ALTER TABLE public.audit_log
    DROP CONSTRAINT IF EXISTS check_audit_tipo_entita;

ALTER TABLE public.audit_log
    ADD CONSTRAINT check_audit_tipo_entita
    CHECK (
        tipo_entita IN (
            'ENTITA',
            'RELAZIONE',
            'GERARCHIA',
            'ACCESSO'
        )
    );

-- =========================================================================
-- 3. FUNZIONE DI REGISTRAZIONE DEGLI ACCESSI APPLICATIVI
--
-- La funzione accetta esclusivamente una sessione Supabase autenticata.
-- L'identità deriva dal JWT corrente: un utente non può registrare un evento
-- a nome di un altro account. Non vengono acquisiti password, token, codici
-- OTP, indirizzi IP o altri segreti.
--
-- Gli eventi dimostrano l'esistenza di una sessione autenticata valida che ha
-- raggiunto il database applicativo. Non rappresentano i log nativi del server
-- PostgreSQL e non includono i tentativi di autenticazione falliti.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.fn_registra_accesso_applicativo(
    p_evento text,
    p_dettaglio text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_evento text;
    v_dettaglio text;
    v_utente_id uuid;
    v_utente_email text;
    v_livello_autenticazione text;
    v_ruolo_jwt text;
    v_ruolo_database text;
    v_sessione_id text;
    v_provider text;
    v_nome_evento text;
    v_payload jsonb;
    v_audit_id bigint;
BEGIN
    v_evento := upper(trim(coalesce(p_evento, '')));
    v_dettaglio := nullif(left(trim(coalesce(p_dettaglio, '')), 500), '');

    IF v_evento NOT IN (
        'LOGIN',
        'LOGOUT',
        'MFA_VERIFICATA'
    ) THEN
        RAISE EXCEPTION 'Evento di accesso non ammesso: %.', v_evento;
    END IF;

    v_utente_id := auth.uid();
    v_utente_email := nullif(auth.jwt() ->> 'email', '');
    v_livello_autenticazione := nullif(auth.jwt() ->> 'aal', '');
    v_ruolo_jwt := nullif(auth.jwt() ->> 'role', '');
    v_sessione_id := nullif(auth.jwt() ->> 'session_id', '');
    v_provider := nullif(auth.jwt() -> 'app_metadata' ->> 'provider', '');
    v_ruolo_database := session_user;

    IF v_utente_id IS NULL OR v_utente_email IS NULL THEN
        RAISE EXCEPTION 'La registrazione richiede una sessione autenticata valida.';
    END IF;

    v_nome_evento :=
        CASE v_evento
            WHEN 'LOGIN' THEN 'Accesso autenticato al database applicativo'
            WHEN 'LOGOUT' THEN 'Disconnessione dal database applicativo'
            WHEN 'MFA_VERIFICATA' THEN 'Verifica MFA completata'
        END;

    v_payload := jsonb_strip_nulls(
        jsonb_build_object(
            'evento', v_evento,
            'esito', 'SUCCESSO',
            'canale', 'SUPABASE_AUTH',
            'dettaglio', v_dettaglio,
            'utente_id', v_utente_id,
            'utente_email', lower(v_utente_email),
            'sessione_id', v_sessione_id,
            'provider', v_provider,
            'livello_autenticazione', v_livello_autenticazione,
            'registrato_utc', timezone('UTC', clock_timestamp())
        )
    );

    INSERT INTO public.audit_log (
        asset_id,
        utente,
        operazione,
        data_modifica,
        valore_precedente,
        valore_nuovo,
        tabella,
        tipo_entita,
        record_id,
        chiave_record,
        codice_record,
        nome_record,
        servizio_id,
        fornitore_id,
        utente_id,
        utente_email,
        livello_autenticazione,
        ruolo_jwt,
        ruolo_database,
        origine_utente,
        valore_precedente_jsonb,
        valore_nuovo_jsonb
    )
    VALUES (
        NULL,
        lower(v_utente_email),
        v_evento,
        timezone('UTC', clock_timestamp()),
        NULL,
        v_payload::text,
        'accesso_database',
        'ACCESSO',
        v_utente_id::text,
        jsonb_strip_nulls(
            jsonb_build_object(
                'utente_id', v_utente_id,
                'sessione_id', v_sessione_id,
                'evento', v_evento
            )
        ),
        v_evento,
        v_nome_evento,
        NULL,
        NULL,
        v_utente_id,
        lower(v_utente_email),
        v_livello_autenticazione,
        v_ruolo_jwt,
        v_ruolo_database,
        'JWT',
        NULL,
        v_payload
    )
    RETURNING id INTO v_audit_id;

    RETURN v_audit_id;
END;
$$;

ALTER FUNCTION public.fn_registra_accesso_applicativo(text, text)
    OWNER TO postgres;

COMMENT ON FUNCTION public.fn_registra_accesso_applicativo(text, text) IS
    'Registra LOGIN, LOGOUT e MFA_VERIFICATA della sessione Supabase autenticata corrente senza memorizzare segreti.';

-- =========================================================================
-- 4. HARDENING DELLA FUNZIONE E DELLA TABELLA AUDIT
-- =========================================================================

REVOKE ALL
ON FUNCTION public.fn_registra_accesso_applicativo(text, text)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.fn_registra_accesso_applicativo(text, text)
FROM anon;

GRANT EXECUTE
ON FUNCTION public.fn_registra_accesso_applicativo(text, text)
TO authenticated;

ALTER TABLE public.audit_log
    ENABLE ROW LEVEL SECURITY;

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
-- 5. INDICE PER I NUOVI FILTRI DEL FRONTEND
-- =========================================================================

CREATE INDEX IF NOT EXISTS idx_audit_log_entita_operazione_data
ON public.audit_log (
    tipo_entita,
    operazione,
    data_modifica DESC
);

-- =========================================================================
-- 6. VERIFICHE BLOCCANTI FINALI
-- =========================================================================

DO $$
DECLARE
    v_definizione_operazione text;
    v_definizione_entita text;
BEGIN
    SELECT pg_get_constraintdef(oid)
    INTO v_definizione_operazione
    FROM pg_constraint
    WHERE conrelid = 'public.audit_log'::regclass
      AND conname = 'check_operazione_audit';

    SELECT pg_get_constraintdef(oid)
    INTO v_definizione_entita
    FROM pg_constraint
    WHERE conrelid = 'public.audit_log'::regclass
      AND conname = 'check_audit_tipo_entita';

    IF to_regprocedure(
        'public.fn_registra_accesso_applicativo(text,text)'
    ) IS NULL THEN
        RAISE EXCEPTION 'Funzione di registrazione accessi non creata.';
    END IF;

    IF position('LOGIN' IN coalesce(v_definizione_operazione, '')) = 0
       OR position('LOGOUT' IN coalesce(v_definizione_operazione, '')) = 0
       OR position('MFA_VERIFICATA' IN coalesce(v_definizione_operazione, '')) = 0 THEN
        RAISE EXCEPTION 'Vincolo delle operazioni Audit non aggiornato.';
    END IF;

    IF position('ACCESSO' IN coalesce(v_definizione_entita, '')) = 0 THEN
        RAISE EXCEPTION 'Vincolo dei tipi di entita Audit non aggiornato.';
    END IF;

    IF has_function_privilege(
        'anon',
        'public.fn_registra_accesso_applicativo(text,text)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'Il ruolo anon possiede EXECUTE sulla funzione accessi.';
    END IF;

    IF NOT has_function_privilege(
        'authenticated',
        'public.fn_registra_accesso_applicativo(text,text)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'Il ruolo authenticated non possiede EXECUTE sulla funzione accessi.';
    END IF;

    IF has_table_privilege('authenticated', 'public.audit_log', 'INSERT')
       OR has_table_privilege('authenticated', 'public.audit_log', 'UPDATE')
       OR has_table_privilege('authenticated', 'public.audit_log', 'DELETE')
       OR has_table_privilege('authenticated', 'public.audit_log', 'TRUNCATE') THEN
        RAISE EXCEPTION 'Audit Log modificabile direttamente dal ruolo authenticated.';
    END IF;
END;
$$;

-- =========================================================================
-- 7. ESITO FINALE
-- =========================================================================

SELECT
    'SCRIPT_29_COMPLETATO' AS esito,
    false AS contiene_pulizia_log,
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
        'DELETE'
    ) AS delete_audit_authenticated,
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

COMMIT;
