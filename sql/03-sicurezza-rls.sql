-- =========================================================================
-- FILE: sql/03-sicurezza-rls.sql (AUTOMAZIONE DINAMICA PL/pgSQL)
-- DESCRIZIONE: Abilitazione RLS e Generazione Policy di Isolamento (22 Tabelle)
-- CONFORMITÀ: NIS2 / Immutabilità Log Forensi
-- =========================================================================

-- 1. Abilitazione forzata della Row Level Security su tutte le 22 tabelle dell'ER v3.6
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

-- 2. Blocco procedurale per la rimozione e creazione automatizzata delle policy
DO $$ 
DECLARE 
    t text;
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
        -- Rimozione preventiva per garantire l'idempotenza dello script
        EXECUTE format('DROP POLICY IF EXISTS "Read_All_Policy" ON public.%I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Insert_Admin_Policy" ON public.%I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Update_Admin_Policy" ON public.%I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Delete_Admin_Policy" ON public.%I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Write_Admin_Policy" ON public.%I', t);

        -- BINARIO A (Lettura): Accesso consentito con sessione MFA elevata (aal2) OPPURE al docente in sola lettura
        EXECUTE format('
            CREATE POLICY "Read_All_Policy" ON public.%I FOR SELECT TO authenticated 
            USING ((auth.jwt() ->> %L = %L) OR (auth.jwt() ->> %L = %L))', 
            t, 'aal', 'aal2', 'email', 'docenteunitopegaso@gmail.com');

        -- BINARIO B (Scrittura): Accesso di modifica concesso esclusivamente ad amministratori MFA (aal2)
        -- Per la conformità forense, la tabella audit_log è a scrittura cumulativa pura: NO UPDATE o DELETE consentiti
        IF t = 'audit_log' THEN
            EXECUTE format('
                CREATE POLICY "Insert_Admin_Policy" ON public.%I FOR INSERT TO authenticated 
                WITH CHECK (auth.jwt() ->> %L = %L)', 
                t, 'aal', 'aal2');
        ELSE
            EXECUTE format('
                CREATE POLICY "Insert_Admin_Policy" ON public.%I FOR INSERT TO authenticated 
                WITH CHECK (auth.jwt() ->> %L = %L)', 
                t, 'aal', 'aal2');

            EXECUTE format('
                CREATE POLICY "Update_Admin_Policy" ON public.%I FOR UPDATE TO authenticated 
                USING (auth.jwt() ->> %L = %L) WITH CHECK (auth.jwt() ->> %L = %L)', 
                t, 'aal', 'aal2', 'aal', 'aal2');

            EXECUTE format('
                CREATE POLICY "Delete_Admin_Policy" ON public.%I FOR DELETE TO authenticated 
                USING (auth.jwt() ->> %L = %L)', 
                t, 'aal', 'aal2');
        END IF;
    END LOOP;
END $$;