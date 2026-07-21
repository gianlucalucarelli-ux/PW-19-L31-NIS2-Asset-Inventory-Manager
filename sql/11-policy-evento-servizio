-- =========================================================================
-- FILE: sql/11-policy-evento-servizio.sql
-- TARGET ARCHITETTURALE: BASELINE ER V3.7 - EVENTI DI SERVIZIO
-- DESCRIZIONE: Riallineamento delle policy RLS e dei privilegi della
--              tabella evento_servizio al modello MFA/docente adottato
--              dal progetto
-- TIPO SCRIPT: Produttivo - hardening RLS e DCL
-- =========================================================================

/*
    OBIETTIVI

    1. Eliminare le precedenti policy permissive:
       - auth_insert_evento_servizio;
       - auth_select_evento_servizio.

    2. Consentire la lettura:
       - agli utenti con sessione MFA aal2;
       - all'utenza docentepegaso@gmail.com.

    3. Consentire INSERT e UPDATE esclusivamente agli utenti con
       sessione MFA aal2.

    4. Non consentire DELETE.

    5. Allineare i privilegi PostgreSQL allo script 04:
       - SELECT;
       - INSERT;
       - UPDATE;
       - nessun DELETE.

    NOTA

    Le policy utilizzano gli stessi nomi canonici dello script 03.
    Non vengono quindi create policy aggiuntive o sovrapposte:
    quelle esistenti vengono sostituite in modo deterministico.
*/

BEGIN;

-- =========================================================================
-- 1. CONTROLLO DI PRECONDIZIONE
-- =========================================================================

DO $$
BEGIN
    IF to_regclass('public.evento_servizio') IS NULL THEN
        RAISE EXCEPTION
            'La tabella public.evento_servizio non esiste.';
    END IF;
END
$$;

-- =========================================================================
-- 2. ABILITAZIONE DELLA ROW LEVEL SECURITY
-- =========================================================================

ALTER TABLE public.evento_servizio
    ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- 3. RIMOZIONE DELLE POLICY LEGACY
-- =========================================================================

/*
    Le precedenti policy consentivano l'accesso a qualsiasi utente
    autenticato mediante USING (true) e WITH CHECK (true).
*/

DROP POLICY IF EXISTS "auth_insert_evento_servizio"
ON public.evento_servizio;

DROP POLICY IF EXISTS "auth_select_evento_servizio"
ON public.evento_servizio;

-- =========================================================================
-- 4. SOSTITUZIONE DELLE POLICY CANONICHE
-- =========================================================================

DROP POLICY IF EXISTS "Read_All_Policy"
ON public.evento_servizio;

DROP POLICY IF EXISTS "Insert_MFA_Policy"
ON public.evento_servizio;

DROP POLICY IF EXISTS "Update_MFA_Policy"
ON public.evento_servizio;

-- =========================================================================
-- 5. POLICY DI LETTURA
-- =========================================================================

CREATE POLICY "Read_All_Policy"
ON public.evento_servizio
FOR SELECT
TO authenticated
USING (
    (auth.jwt() ->> 'aal') = 'aal2'
    OR lower(
        COALESCE(
            auth.jwt() ->> 'email',
            ''
        )
    ) = lower('docentepegaso@gmail.com')
);

-- =========================================================================
-- 6. POLICY DI INSERIMENTO
-- =========================================================================

CREATE POLICY "Insert_MFA_Policy"
ON public.evento_servizio
FOR INSERT
TO authenticated
WITH CHECK (
    (auth.jwt() ->> 'aal') = 'aal2'
);

-- =========================================================================
-- 7. POLICY DI AGGIORNAMENTO
-- =========================================================================

CREATE POLICY "Update_MFA_Policy"
ON public.evento_servizio
FOR UPDATE
TO authenticated
USING (
    (auth.jwt() ->> 'aal') = 'aal2'
)
WITH CHECK (
    (auth.jwt() ->> 'aal') = 'aal2'
);

-- =========================================================================
-- 8. ALLINEAMENTO DEI PRIVILEGI DCL
-- =========================================================================

/*
    L'accesso anonimo viene completamente rimosso.

    Per authenticated vengono revocati eventuali privilegi pregressi
    e concessi esclusivamente SELECT, INSERT e UPDATE.
*/

REVOKE ALL PRIVILEGES
ON TABLE public.evento_servizio
FROM anon;

REVOKE ALL PRIVILEGES
ON TABLE public.evento_servizio
FROM authenticated;

GRANT SELECT, INSERT, UPDATE
ON TABLE public.evento_servizio
TO authenticated;

COMMIT;