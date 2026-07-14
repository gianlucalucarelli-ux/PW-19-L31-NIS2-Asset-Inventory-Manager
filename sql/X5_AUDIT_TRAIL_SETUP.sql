-- =========================================================================
-- FILE: X5_AUDIT_TRAIL_SETUP.sql
-- OBIETTIVO: Definizione funzione di tracciamento per Audit Log
-- =========================================================================

CREATE OR REPLACE FUNCTION fn_audit_asset_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        INSERT INTO audit_log (asset_id, utente, operazione, data_modifica, valore_precedente)
        VALUES (OLD.id, current_user, 'DELETE', now(), to_jsonb(OLD)::text);
        RETURN OLD;
    ELSIF (TG_OP = 'UPDATE') THEN
        INSERT INTO audit_log (asset_id, utente, operazione, data_modifica, valore_precedente, valore_nuovo)
        VALUES (NEW.id, current_user, 'UPDATE', now(), to_jsonb(OLD)::text, to_jsonb(NEW)::text);
        RETURN NEW;
    ELSIF (TG_OP = 'INSERT') THEN
        INSERT INTO audit_log (asset_id, utente, operazione, data_modifica, valore_nuovo)
        VALUES (NEW.id, current_user, 'INSERT', now(), to_jsonb(NEW)::text);
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;