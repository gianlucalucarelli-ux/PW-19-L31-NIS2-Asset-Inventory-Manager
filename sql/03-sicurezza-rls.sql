-- =========================================================================
-- FILE: sql/03-sicurezza-rls.sql (VERSIONE AGGIORNATA - NUOVO DOCENTE)
-- DESCRIZIONE: Abilitazione RLS e Policy (MFA AAL2 + Accesso Docente Pegaso)
-- =========================================================================

-- 1. Abilitazione forzata della RLS su tutte le tabelle
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

-- 2. Blocco procedurale per la gestione delle policy
DO $$ 
DECLARE 
    t text;
    docente_email text := 'docentepegaso@gmail.com'; -- Email corretta aggiornata
    tables text[] := ARRAY[
        'organizzazione', 'categoria_asset', 'tipo_servizio', 'tipo_fornitore', 
        'ruolo_organigramma', 'responsabile', 'ruolo', 'responsabile_ruolo', 
        'vulnerabilita', 'asset', 'asset_vulnerabilita', 'fornitore', 'stato_servizio',
        'servizio', 'tipo_dipendenza_servizio', 'servizio_dipendenza_asset', 
        'servizio_dipendenza_fornitore', 'tipo_dipendenza', 'esito_impatto', 
        'servizio_componente', 'evento_servizio', 'audit_log'
    ];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        -- Rimozione preventiva
        EXECUTE format('DROP POLICY IF EXISTS "Read_All_Policy" ON public.%I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Insert_Admin_Policy" ON public.%I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Update_Admin_Policy" ON public.%I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Delete_Admin_Policy" ON public.%I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Write_Admin_Policy" ON public.%I', t);

        -- BINARIO A (Lettura): MFA AAL2 OR Email Docente Corretta
        EXECUTE format('
            CREATE POLICY "Read_All_Policy" ON public.%I FOR SELECT TO authenticated 
            USING ((auth.jwt() ->> %L = %L) OR (auth.jwt() ->> %L = %L))', 
            t, 'aal', 'aal2', 'email', docente_email);

        -- BINARIO B (Scrittura)
        IF t = 'audit_log' THEN
            EXECUTE format('
                CREATE POLICY "Insert_Admin_Policy" ON public.%I FOR INSERT TO authenticated 
                WITH CHECK ((auth.jwt() ->> %L = %L) OR (auth.jwt() ->> %L = %L))', 
                t, 'aal', 'aal2', 'email', docente_email);
        ELSE
            EXECUTE format('
                CREATE POLICY "Insert_Admin_Policy" ON public.%I FOR INSERT TO authenticated 
                WITH CHECK ((auth.jwt() ->> %L = %L) OR (auth.jwt() ->> %L = %L))', 
                t, 'aal', 'aal2', 'email', docente_email);

            EXECUTE format('
                CREATE POLICY "Update_Admin_Policy" ON public.%I FOR UPDATE TO authenticated 
                USING ((auth.jwt() ->> %L = %L) OR (auth.jwt() ->> %L = %L)) 
                WITH CHECK ((auth.jwt() ->> %L = %L) OR (auth.jwt() ->> %L = %L))', 
                t, 'aal', 'aal2', 'email', docente_email, 'aal', 'aal2', 'email', docente_email);

            EXECUTE format('
                CREATE POLICY "Delete_Admin_Policy" ON public.%I FOR DELETE TO authenticated 
                USING ((auth.jwt() ->> %L = %L) OR (auth.jwt() ->> %L = %L))', 
                t, 'aal', 'aal2', 'email', docente_email);
        END IF;
    END LOOP;
END $$;