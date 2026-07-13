-- =========================================================================
-- FILE: sql/03-sicurezza-rls.sql
-- DESCRIZIONE: Abilitazione RLS e Generazione Policy di Isolamento (22 Tabelle)
-- =========================================================================

-- Forzatura blocco totale su ogni singolo nodo dell'ER v3.6
ALTER TABLE public.organizzazione ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categoria_asset ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tipo_servizio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tipo_fornitore ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ruolo_organigramma ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.responsabile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ruolo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.responsabile_ruolo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vulnerabilita ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_vulnerabilita ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fornitore ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stato_servizio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servizio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tipo_dipendenza_servizio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servizio_dipendenza_asset ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servizio_dipendenza_fornitore ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tipo_dipendenza ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.esito_impatto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servizio_componente ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evento_servizio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Rimozione automatizzata dei vecchi schemi di policy per evitare duplicazioni
DO $$ 
DECLARE 
    t text;
BEGIN
    FOR t IN EACH ARRAY ARRAY[
        'organizzazione', 'categoria_asset', 'tipo_servizio', 'tipo_fornitore', 
        'ruolo_organigramma', 'responsabile', 'ruolo', 'responsabile_ruolo', 
        'vulnerabilita', 'asset', 'asset_vulnerabilita', 'fornitore', 'stato_servizio',
        'servizio', 'tipo_dipendenza_servizio', 'servizio_dipendenza_asset', 
        'servizio_dipendenza_fornitore', 'tipo_dipendenza', 'esito_impatto', 
        'servizio_componente', 'evento_servizio', 'audit_log'
    ] LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Read_All_Policy" ON public.%I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Write_Admin_Policy" ON public.%I', t);
    END LOOP;
END $$;

-- BINARIO A: LETTURA GENERALE (AAL2 Elevato OPPURE Ispezione Nominale Docente)
CREATE POLICY "Read_All_Policy" ON public.organizzazione FOR SELECT TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Read_All_Policy" ON public.categoria_asset FOR SELECT TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Read_All_Policy" ON public.tipo_servizio FOR SELECT TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Read_All_Policy" ON public.tipo_fornitore FOR SELECT TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Read_All_Policy" ON public.ruolo_organigramma FOR SELECT TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Read_All_Policy" ON public.responsabile FOR SELECT TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Read_All_Policy" ON public.ruolo FOR SELECT TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Read_All_Policy" ON public.responsabile_ruolo FOR SELECT TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Read_All_Policy" ON public.vulnerabilita FOR SELECT TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Read_All_Policy" ON public.asset FOR SELECT TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Read_All_Policy" ON public.asset_vulnerabilita FOR SELECT TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Read_All_Policy" ON public.fornitore FOR SELECT TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Read_All_Policy" ON public.stato_servizio FOR SELECT TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Read_All_Policy" ON public.servizio FOR SELECT TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Read_All_Policy" ON public.tipo_dipendenza_servizio FOR SELECT TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Read_All_Policy" ON public.servizio_dipendenza_asset FOR SELECT TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Read_All_Policy" ON public.servizio_dipendenza_fornitore FOR SELECT TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Read_All_Policy" ON public.tipo_dipendenza FOR SELECT TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Read_All_Policy" ON public.esito_impatto FOR SELECT TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Read_All_Policy" ON public.servizio_componente FOR SELECT TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Read_All_Policy" ON public.evento_servizio FOR SELECT TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));
CREATE POLICY "Read_All_Policy" ON public.audit_log FOR SELECT TO authenticated USING ((auth.jwt() ->> 'aal' = 'aal2') OR (auth.jwt() ->> 'email' = 'docenteunitopegaso@gmail.com'));

-- BINARIO B: MODIFICA SCRITTURA (ESCLUSIVA AMMINISTRATORE AAL2 - DOCENTE BLOCCATO IN BI-PARTIZIONE)
CREATE POLICY "Write_Admin_Policy" ON public.organizzazione FOR INSERT, UPDATE, DELETE TO authenticated WITH CHECK (auth.jwt() ->> 'aal' = 'aal2');
CREATE POLICY "Write_Admin_Policy" ON public.categoria_asset FOR INSERT, UPDATE, DELETE TO authenticated WITH CHECK (auth.jwt() ->> 'aal' = 'aal2');
CREATE POLICY "Write_Admin_Policy" ON public.tipo_servizio FOR INSERT, UPDATE, DELETE TO authenticated WITH CHECK (auth.jwt() ->> 'aal' = 'aal2');
CREATE POLICY "Write_Admin_Policy" ON public.tipo_fornitore FOR INSERT, UPDATE, DELETE TO authenticated WITH CHECK (auth.jwt() ->> 'aal' = 'aal2');
CREATE POLICY "Write_Admin_Policy" ON public.ruolo_organigramma FOR INSERT, UPDATE, DELETE TO authenticated WITH CHECK (auth.jwt() ->> 'aal' = 'aal2');
CREATE POLICY "Write_Admin_Policy" ON public.responsabile FOR INSERT, UPDATE, DELETE TO authenticated WITH CHECK (auth.jwt() ->> 'aal' = 'aal2');
CREATE POLICY "Write_Admin_Policy" ON public.ruolo FOR INSERT, UPDATE, DELETE TO authenticated WITH CHECK (auth.jwt() ->> 'aal' = 'aal2');
CREATE POLICY "Write_Admin_Policy" ON public.responsabile_ruolo FOR INSERT, UPDATE, DELETE TO authenticated WITH CHECK (auth.jwt() ->> 'aal' = 'aal2');
CREATE POLICY "Write_Admin_Policy" ON public.vulnerabilita FOR INSERT, UPDATE, DELETE TO authenticated WITH CHECK (auth.jwt() ->> 'aal' = 'aal2');
CREATE POLICY "Write_Admin_Policy" ON public.asset FOR INSERT, UPDATE, DELETE TO authenticated WITH CHECK (auth.jwt() ->> 'aal' = 'aal2');
CREATE POLICY "Write_Admin_Policy" ON public.asset_vulnerabilita FOR INSERT, UPDATE, DELETE TO authenticated WITH CHECK (auth.jwt() ->> 'aal' = 'aal2');
CREATE POLICY "Write_Admin_Policy" ON public.fornitore FOR INSERT, UPDATE, DELETE TO authenticated WITH CHECK (auth.jwt() ->> 'aal' = 'aal2');
CREATE POLICY "Write_Admin_Policy" ON public.stato_servizio FOR INSERT, UPDATE, DELETE TO authenticated WITH CHECK (auth.jwt() ->> 'aal' = 'aal2');
CREATE POLICY "Write_Admin_Policy" ON public.servizio FOR INSERT, UPDATE, DELETE TO authenticated WITH CHECK (auth.jwt() ->> 'aal' = 'aal2');
CREATE POLICY "Write_Admin_Policy" ON public.tipo_dipendenza_servizio FOR INSERT, UPDATE, DELETE TO authenticated WITH CHECK (auth.jwt() ->> 'aal' = 'aal2');
CREATE POLICY "Write_Admin_Policy" ON public.servizio_dipendenza_asset FOR INSERT, UPDATE, DELETE TO authenticated WITH CHECK (auth.jwt() ->> 'aal' = 'aal2');
CREATE POLICY "Write_Admin_Policy" ON public.servizio_dipendenza_fornitore FOR INSERT, UPDATE, DELETE TO authenticated WITH CHECK (auth.jwt() ->> 'aal' = 'aal2');
CREATE POLICY "Write_Admin_Policy" ON public.tipo_dipendenza FOR INSERT, UPDATE, DELETE TO authenticated WITH CHECK (auth.jwt() ->> 'aal' = 'aal2');
CREATE POLICY "Write_Admin_Policy" ON public.esito_impatto FOR INSERT, UPDATE, DELETE TO authenticated WITH CHECK (auth.jwt() ->> 'aal' = 'aal2');
CREATE POLICY "Write_Admin_Policy" ON public.servizio_componente FOR INSERT, UPDATE, DELETE TO authenticated WITH CHECK (auth.jwt() ->> 'aal' = 'aal2');
CREATE POLICY "Write_Admin_Policy" ON public.evento_servizio FOR INSERT, UPDATE, DELETE TO authenticated WITH CHECK (auth.jwt() ->> 'aal' = 'aal2');
CREATE POLICY "Write_Admin_Policy" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (auth.jwt() ->> 'aal' = 'aal2');
