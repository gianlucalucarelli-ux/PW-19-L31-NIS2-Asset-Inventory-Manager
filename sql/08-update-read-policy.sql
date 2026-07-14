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
        -- Rimuoviamo la policy restrittiva precedente
        EXECUTE format('DROP POLICY IF EXISTS "Read_All_Policy" ON public.%I', t);
        
        -- Creiamo una policy di sola lettura aperta a tutti gli autenticati
        -- (La scrittura rimane protetta dalle altre policy che hai già)
        EXECUTE format('
            CREATE POLICY "Read_All_Policy" ON public.%I FOR SELECT TO authenticated 
            USING (true)', 
            t
        );
    END LOOP;
END $$;