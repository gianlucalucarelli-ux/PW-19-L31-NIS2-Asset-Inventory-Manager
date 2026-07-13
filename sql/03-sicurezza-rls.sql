-- =================================================================================
-- FILE: sql/03-sicurezza-rls.sql (VERSIONE 6.8 - HARDENED ENTERPRISE)
-- DESCRIZIONE: Configurazione RLS Zero-Trust conforme a Direttiva NIS2
-- =================================================================================

-- 1. APPLICAZIONE REGOLE ZERO-TRUST (ABILITAZIONE RLS SU TUTTE LE 20 TABELLE)
ALTER TABLE public.organizzazione ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categoria_asset ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tipo_servizio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tipo_fornitore ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ruolo_organigramma ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ruolo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stato_servizio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.esito_impatto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tipo_dipendenza ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tipo_dipendenza_servizio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.responsabile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.responsabile_ruolo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vulnerabilita ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fornitore ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servizio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servizio_dipendenza ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servizio_componente ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evento_servizio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.versioning_asset ENABLE ROW LEVEL SECURITY;

-- 2. PULIZIA IDEMPOTENTE DELLE VECCHIE REGOLE LOOSE
DO $$ 
DECLARE 
    t text;
BEGIN
    FOR t IN EACH ARRAY ARRAY[
        'organizzazione', 'categoria_asset', 'tipo_servizio', 'tipo_fornitore', 
        'ruolo_organigramma', 'ruolo', 'stato_servizio', 'esito_impatto', 
        'tipo_dipendenza', 'tipo_dipendenza_servizio', 'responsabile', 
        'responsabile_ruolo', 'vulnerabilita', 'asset', 'fornitore', 
        'servizio', 'servizio_dipendenza', 'servizio_componente', 
        'evento_servizio', 'versioning_asset'
    ] LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Sorgente Protetta o Deroga Docente" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Read_All_Policy" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Write_Admin_Policy" ON %I', t);
    END LOOP;
END $$;

-- =================================================================================
-- 3. IMPLEMENTAZIONE DELLE POLICY DI ACCESSO GRANULARIZZATE
-- =================================================================================

-- MACRO DI CONFIGURAZIONE FUNZIONALE REALE:
-- Binario A (Lettura): Concesso a sessioni elevate (AAL2) OR Account nominale Docente.
-- Binario B (Scrittura): Concesso ESCLUSIVAMENTE a sessioni elevate (AAL2). Il docente viene bloccato.

CREATE POLICY "Read_All_Policy" ON public.organizzazione FOR SELECT TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Read_All_Policy" ON public.categoria_asset FOR SELECT TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Read_All_Policy" ON public.tipo_servizio FOR SELECT TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Read_All_Policy" ON public.tipo_fornitore FOR SELECT TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Read_All_Policy" ON public.ruolo_organigramma FOR SELECT TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Read_All_Policy" ON public.ruolo FOR SELECT TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Read_All_Policy" ON public.stato_servizio FOR SELECT TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Read_All_Policy" ON public.esito_impatto FOR SELECT TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Read_All_Policy" ON public.tipo_dipendenza FOR SELECT TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Read_All_Policy" ON public.tipo_dipendenza_servizio FOR SELECT TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Read_All_Policy" ON public.responsabile FOR SELECT TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Read_All_Policy" ON public.responsabile_ruolo FOR SELECT TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Read_All_Policy" ON public.vulnerabilita FOR SELECT TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Read_All_Policy" ON public.asset FOR SELECT TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Read_All_Policy" ON public.fornitore FOR SELECT TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Read_All_Policy" ON public.servizio FOR SELECT TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Read_All_Policy" ON public.servizio_dipendenza FOR SELECT TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Read_All_Policy" ON public.servizio_componente FOR SELECT TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Read_All_Policy" ON public.evento_servizio FOR SELECT TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Read_All_Policy" ON public.versioning_asset FOR SELECT TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));

-- PRIVILEGI DI MODIFICA DATI CRUCIALI (BLINDATI: SOLO UTENTE AMMINISTRATORE CON MFA ATTIVO)
CREATE POLICY "Write_Admin_Policy" ON public.organizzazione FOR INSERT, UPDATE, DELETE TO authenticated WITH CHECK (auth.jwt() ->> 'aal' = 'aal2');
CREATE POLICY "Write_Admin_Policy" ON public.categoria_asset FOR INSERT, UPDATE, DELETE TO authenticated WITH CHECK (auth.jwt() ->> 'aal' = 'aal2');
CREATE POLICY "Write_Admin_Policy" ON public.tipo_servizio FOR INSERT, UPDATE, DELETE TO authenticated WITH CHECK (auth.jwt() ->> 'aal' = 'aal2');
CREATE POLICY "Write_Admin_Policy" ON public.tipo_fornitore FOR INSERT, UPDATE, DELETE TO authenticated WITH CHECK (auth.jwt() ->> 'aal' = 'aal2');
CREATE POLICY "Write_Admin_Policy" ON public.ruolo_organigramma FOR INSERT, UPDATE, DELETE TO authenticated WITH CHECK (auth.jwt() ->> 'aal' = 'aal2');
CREATE POLICY "Write_Admin_Policy" ON public.ruolo FOR INSERT, UPDATE, DELETE TO authenticated WITH CHECK (auth.jwt() ->> 'aal' = 'aal2');
CREATE POLICY "Write_Admin_Policy" ON public.stato_servizio FOR INSERT, UPDATE, DELETE TO authenticated WITH CHECK (auth.jwt() ->> 'aal' = 'aal2');
CREATE POLICY "Write_Admin_Policy" ON public.esito_impatto FOR INSERT, UPDATE, DELETE TO authenticated WITH CHECK (auth.jwt() ->> 'aal' = 'aal2');
CREATE POLICY "Write_Admin_Policy" ON public.tipo_dipendenza FOR INSERT, UPDATE, DELETE TO authenticated WITH CHECK (auth.jwt() ->> 'aal' = 'aal2');
CREATE POLICY "Write_Admin_Policy" ON public.tipo_dipendenza_servizio FOR INSERT, UPDATE, DELETE TO authenticated WITH CHECK (auth.jwt() ->> 'aal' = 'aal2');
CREATE POLICY "Write_Admin_Policy" ON public.responsabile FOR INSERT, UPDATE, DELETE TO authenticated WITH CHECK (auth.jwt() ->> 'aal' = 'aal2');
CREATE POLICY "Write_Admin_Policy" ON public.responsabile_ruolo FOR INSERT, UPDATE, DELETE TO authenticated WITH CHECK (auth.jwt() ->> 'aal' = 'aal2');
CREATE POLICY "Write_Admin_Policy" ON public.vulnerabilita FOR INSERT, UPDATE, DELETE TO authenticated WITH CHECK (auth.jwt() ->> 'aal' = 'aal2');
CREATE POLICY "Write_Admin_Policy" ON public.asset FOR INSERT, UPDATE, DELETE TO authenticated WITH CHECK (auth.jwt() ->> 'aal' = 'aal2');
CREATE POLICY "Write_Admin_Policy" ON public.fornitore FOR INSERT, UPDATE, DELETE TO authenticated WITH CHECK (auth.jwt() ->> 'aal' = 'aal2');
CREATE POLICY "Write_Admin_Policy" ON public.servizio FOR INSERT, UPDATE, DELETE TO authenticated WITH CHECK (auth.jwt() ->> 'aal' = 'aal2');
CREATE POLICY "Write_Admin_Policy" ON public.servizio_dipendenza FOR INSERT, UPDATE, DELETE TO authenticated WITH CHECK (auth.jwt() ->> 'aal' = 'aal2');
CREATE POLICY "Write_Admin_Policy" ON public.servizio_componente FOR INSERT, UPDATE, DELETE TO authenticated WITH CHECK (auth.jwt() ->> 'aal' = 'aal2');
CREATE POLICY "Write_Admin_Policy" ON public.evento_servizio FOR INSERT, UPDATE, DELETE TO authenticated WITH CHECK (auth.jwt() ->> 'aal' = 'aal2');

-- ABILITAZIONE SCRITTURA LOG AUDIT PER IL TRIGGER (L'utente aal2 genera l'azione, il sistema la memorizza)
CREATE POLICY "Write_Admin_Policy" ON public.versioning_asset FOR INSERT TO authenticated WITH CHECK (auth.jwt() ->> 'aal' = 'aal2');