-- ===============================================================
-- FIX PERMESSI API & CORS
-- Eseguire dopo lo schema e i dati
-- ===============================================================

-- 1. Concedi l'uso dello schema public ai ruoli di Supabase
GRANT USAGE ON SCHEMA public TO anon, authenticated, postgres, service_role;

-- 2. Concedi il permesso di lettura (SELECT) su tutte le tabelle esistenti
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;

-- 3. Concedi il permesso per le sequenze (necessario per gli ID serial)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- 4. Assicurati che i futuri asset abbiano gli stessi permessi automaticamente
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon, authenticated;
