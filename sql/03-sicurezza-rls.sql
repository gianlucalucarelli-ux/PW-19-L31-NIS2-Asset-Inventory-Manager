-- =================================================================================
-- FILE: sql/03-sicurezza-rls.sql (VERSIONE REALE BLINDATA)
-- DESCRIZIONE: Configurazione delle policy RLS a doppio binario (MFA o Account Ispezione)
-- =================================================================================

-- 1. Abilitazione del blocco totale (Zero Trust) sulle 9 tabelle attive
ALTER TABLE public.organizzazione ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.responsabile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servizio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fornitore ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ruolo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.responsabile_ruolo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dipendenza ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.versioning_asset ENABLE ROW LEVEL SECURITY;

-- 2. Rimozione preventiva di vecchie policy per garantire l'idempotenza
DROP POLICY IF EXISTS "Sorgente Protetta o Deroga Docente" ON public.organizzazione;
DROP POLICY IF EXISTS "Sorgente Protetta o Deroga Docente" ON public.responsabile;
DROP POLICY IF EXISTS "Sorgente Protetta o Deroga Docente" ON public.asset;
DROP POLICY IF EXISTS "Sorgente Protetta o Deroga Docente" ON public.servizio;
DROP POLICY IF EXISTS "Sorgente Protetta o Deroga Docente" ON public.fornitore;
DROP POLICY IF EXISTS "Sorgente Protetta o Deroga Docente" ON public.ruolo;
DROP POLICY IF EXISTS "Sorgente Protetta o Deroga Docente" ON public.responsabile_ruolo;
DROP POLICY IF EXISTS "Sorgente Protetta o Deroga Docente" ON public.dipendenza;
DROP POLICY IF EXISTS "Sorgente Protetta o Deroga Docente" ON public.versioning_asset;

-- 3. Implementazione del doppio binario (MFA Livello AAL2 obbligatorio OR Eccezione nominale Docente)
CREATE POLICY "Sorgente Protetta o Deroga Docente" ON public.organizzazione FOR ALL TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Sorgente Protetta o Deroga Docente" ON public.responsabile FOR ALL TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Sorgente Protetta o Deroga Docente" ON public.asset FOR ALL TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Sorgente Protetta o Deroga Docente" ON public.servizio FOR ALL TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Sorgente Protetta o Deroga Docente" ON public.fornitore FOR ALL TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Sorgente Protetta o Deroga Docente" ON public.ruolo FOR ALL TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Sorgente Protetta o Deroga Docente" ON public.responsabile_ruolo FOR ALL TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Sorgente Protetta o Deroga Docente" ON public.dipendenza FOR ALL TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Sorgente Protetta o Deroga Docente" ON public.versioning_asset FOR SELECT TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
