-- ==========================================================
-- 1. CONFIGURAZIONE FUNZIONE DI AUDIT
-- ==========================================================
/*
 * NOME FILE: 06_configurazione_audit_permissions.sql
 * DESCRIZIONE: 
 * Configurazione del sistema di audit log e definizione delle 
 * policy RLS (Row Level Security) per la gestione dei permessi 
 * utente sulla tabella 'asset'. 
 * Include la creazione della funzione 'fn_audit_asset_changes' 
 * e del relativo trigger per la tracciabilità delle operazioni 
 * (INSERT, UPDATE, DELETE) ai fini della conformità NIS2.
 */
CREATE OR REPLACE FUNCTION fn_audit_asset_changes()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO audit_log (operazione, utente, asset_id, data_modifica)
    VALUES (
        TG_OP, 
        COALESCE(auth.email(), 'SYSTEM_CORE'), 
        COALESCE(NEW.id, OLD.id), 
        NOW()
    );
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================================
-- 2. CONFIGURAZIONE TRIGGER
-- ==========================================================
DROP TRIGGER IF EXISTS trg_asset_audit ON asset;
CREATE TRIGGER trg_asset_audit
AFTER INSERT OR UPDATE OR DELETE ON asset
FOR EACH ROW EXECUTE FUNCTION fn_audit_asset_changes();

-- ==========================================================
-- 3. POLITICHE DI SICUREZZA (RLS)
-- ==========================================================
-- Abilita RLS
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset ENABLE ROW LEVEL SECURITY;

-- Policy per scrivere nei log
DROP POLICY IF EXISTS "Allow insert for authenticated users" ON audit_log;
CREATE POLICY "Allow insert for authenticated users" ON audit_log
FOR INSERT TO authenticated
WITH CHECK (true);

-- Policy unica per asset (Permette tutto agli autenticati)
DROP POLICY IF EXISTS "Allow all for authenticated" ON asset;
CREATE POLICY "Allow all for authenticated" ON asset
FOR ALL 
TO authenticated
USING (true)
WITH CHECK (true);