-- =========================================================================
-- FILE: sql/04-Fix schema permissions for Supabase.sql
-- DESCRIZIONE: Privilegi DML PostgreSQL per integrità PostgREST Gateway
-- =========================================================================

-- Rimozione totale permessi di default sul ruolo anonimo (Inversione Zero-Trust)
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- Permesso di instradamento del dizionario API
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Abilitazione operazioni fondamentali per le utenze loggate
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Protezione persistente per l'automazione dei futuri oggetti
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
