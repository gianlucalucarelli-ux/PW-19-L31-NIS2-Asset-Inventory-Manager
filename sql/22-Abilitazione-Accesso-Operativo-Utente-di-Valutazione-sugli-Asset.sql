-- ============================================================================
-- SCRIPT 22 - ABILITAZIONE ACCESSO OPERATIVO UTENTE DI VALUTAZIONE SUGLI ASSET
-- Versione: 1.0
--
-- Obiettivo:
--   - mantenere la scrittura ordinaria riservata agli utenti con MFA AAL2;
--   - consentire all'account docente dedicato alla valutazione di inserire e
--     modificare gli asset anche con sessione AAL1;
--   - non concedere privilegi anonimi;
--   - non introdurre policy DELETE;
--   - predisporre una funzione riutilizzabile nelle successive aree applicative.
--
-- Ordine operativo:
--   1. eseguire prima nel SQL Editor di Supabase;
--   2. verificare l'esito delle query finali;
--   3. solo dopo il successo salvare il file nel repository e nella copia locale.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Funzione comune per riconoscere un utente abilitato alle operazioni.
--
-- Sono autorizzati:
--   - gli utenti autenticati con livello AAL2;
--   - l'account docente dedicato alla valutazione del Project Work.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_accesso_operativo()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT
        COALESCE(auth.jwt() ->> 'aal', '') = 'aal2'
        OR LOWER(COALESCE(auth.jwt() ->> 'email', '')) =
           LOWER('docentepegaso@gmail.com');
$$;

COMMENT ON FUNCTION public.fn_accesso_operativo() IS
'Autorizza le operazioni applicative per utenti MFA AAL2 o per l''account docente dedicato alla valutazione.';

REVOKE ALL ON FUNCTION public.fn_accesso_operativo() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_accesso_operativo() FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_accesso_operativo() TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. Sostituzione delle policy INSERT e UPDATE della tabella asset.
--
-- La policy SELECT esistente non viene modificata perché consente già la lettura
-- sia agli utenti AAL2 sia all'account docente.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Insert_MFA_Policy" ON public.asset;
DROP POLICY IF EXISTS "Insert_Operativo_Policy" ON public.asset;

CREATE POLICY "Insert_Operativo_Policy"
ON public.asset
FOR INSERT
TO authenticated
WITH CHECK (public.fn_accesso_operativo());

DROP POLICY IF EXISTS "Update_MFA_Policy" ON public.asset;
DROP POLICY IF EXISTS "Update_Operativo_Policy" ON public.asset;

CREATE POLICY "Update_Operativo_Policy"
ON public.asset
FOR UPDATE
TO authenticated
USING (public.fn_accesso_operativo())
WITH CHECK (public.fn_accesso_operativo());

-- ----------------------------------------------------------------------------
-- 3. Controlli automatici essenziali prima del commit.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'asset'
          AND policyname = 'Insert_Operativo_Policy'
          AND cmd = 'INSERT'
    ) THEN
        RAISE EXCEPTION 'Policy INSERT operativa non creata sulla tabella asset.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'asset'
          AND policyname = 'Update_Operativo_Policy'
          AND cmd = 'UPDATE'
    ) THEN
        RAISE EXCEPTION 'Policy UPDATE operativa non creata sulla tabella asset.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'asset'
          AND cmd = 'DELETE'
    ) THEN
        RAISE EXCEPTION 'Rilevata una policy DELETE non prevista sulla tabella asset.';
    END IF;
END;
$$;

COMMIT;

-- ============================================================================
-- VERIFICA FINALE DI SOLA LETTURA
-- ============================================================================
SELECT
    policyname,
    cmd,
    roles,
    qual AS condizione_using,
    with_check AS condizione_with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'asset'
ORDER BY cmd, policyname;

SELECT
    routine_name,
    security_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'fn_accesso_operativo';

SELECT
    grantee,
    privilege_type
FROM information_schema.routine_privileges
WHERE specific_schema = 'public'
  AND routine_name = 'fn_accesso_operativo'
ORDER BY grantee, privilege_type;
