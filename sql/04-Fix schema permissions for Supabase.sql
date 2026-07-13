-- ==========================================================================
-- FILE: sql/04-Fix-Schema-Permissions-v6.8_Hardened.sql
-- DESCRIZIONE: Configurazione privilegi di accesso PostgreSQL (DML)
-- OBIETTIVO: Allineamento permessi interni con flussi RLS e vincoli NIS2
-- ==========================================================================

-- 1. RIPRISTINO PRIVILEGI DI DEFAULT DELLO SCHEMA (ISOLAMENTO RUOLO ANONIMO)
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- Concessione USAGE allo schema (Necessario per l'instradamento di PostgREST)
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- 2. CONCESSIONE PRIVILEGI DML AL RUOLO AUTENTICATO (UTENTI LOGGATI)
-- Permette le operazioni CRUD fondamentali. Il filtraggio granulare è demandato all'RLS.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

-- 3. GESTIONE DELLE SEQUENZE (CRUCIALE PER GLI ID GENERATI TRAMITE SERIAL/IDENTITY)
-- Consente l'incremento degli ID durante le operazioni di INSERT
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- 4. AUTOMAZIONE DEI PRIVILEGI SUI FUTURI OGGETTI DATABASE (HARDENING)
-- Assicura che nuove tabelle o dizionari creati ereditino la corretta compartimentazione
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO authenticated;