-- =========================================================================
-- FILE: sql/01-schema.sql
-- DESCRIZIONE: DDL Schema 3NF e logica di Audit Trail (SELECT INTO)
-- =========================================================================

DROP TABLE IF EXISTS public.versioning_asset CASCADE;
DROP TABLE IF EXISTS public.dipendenza CASCADE;
DROP TABLE IF EXISTS public.responsabile_ruolo CASCADE;
DROP TABLE IF EXISTS public.ruolo CASCADE;
DROP TABLE IF EXISTS public.fornitore CASCADE;
DROP TABLE IF EXISTS public.servizio CASCADE;
DROP TABLE IF EXISTS public.asset CASCADE;
DROP TABLE IF EXISTS public.responsabile CASCADE;
DROP TABLE IF EXISTS public.organizzazione CASCADE;

CREATE TABLE public.organizzazione (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    descrizione TEXT
);

CREATE TABLE public.responsabile (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    cognome VARCHAR(100) NOT NULL,
    ruolo_organigramma VARCHAR(150),
    email VARCHAR(255) UNIQUE NOT NULL,
    telefono VARCHAR(50),
    organizzazione_id INT NOT NULL,
    CONSTRAINT fk_responsabile_organizzazione FOREIGN KEY (organizzazione_id) REFERENCES public.organizzazione(id) ON DELETE RESTRICT
);

CREATE TABLE public.asset (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    categoria VARCHAR(100) NOT NULL,
    classificazione_criticita VARCHAR(50) NOT NULL,
    descrizione TEXT,
    ubicazione VARCHAR(255),
    data_inserimento DATE DEFAULT CURRENT_DATE,
    organizzazione_id INT NOT NULL,
    responsabile_id INT NOT NULL,
    CONSTRAINT fk_asset_organizzazione FOREIGN KEY (organizzazione_id) REFERENCES public.organizzazione(id) ON DELETE RESTRICT,
    CONSTRAINT fk_asset_responsabile FOREIGN KEY (responsabile_id) REFERENCES public.responsabile(id) ON DELETE RESTRICT
);

CREATE TABLE public.servizio (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    descrizione TEXT,
    organizzazione_id INT NOT NULL,
    responsabile_id INT NOT NULL,
    CONSTRAINT fk_servizio_organizzazione FOREIGN KEY (organizzazione_id) REFERENCES public.organizzazione(id) ON DELETE RESTRICT,
    CONSTRAINT fk_servizio_responsabile FOREIGN KEY (responsabile_id) REFERENCES public.responsabile(id) ON DELETE RESTRICT
);

CREATE TABLE public.fornitore (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    tipo VARCHAR(100),
    indirizzo VARCHAR(255),
    contatto_email VARCHAR(255) NOT NULL
);

CREATE TABLE public.ruolo (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(150) NOT NULL UNIQUE,
    descrizione TEXT
);

CREATE TABLE public.responsabile_ruolo (
    responsabile_id INT NOT NULL,
    ruolo_id INT NOT NULL,
    is_titolare BOOLEAN DEFAULT TRUE,
    PRIMARY KEY (responsabile_id, ruolo_id, is_titolare),
    CONSTRAINT fk_resp_ruolo_responsabile FOREIGN KEY (responsabile_id) REFERENCES public.responsabile(id) ON DELETE CASCADE,
    CONSTRAINT fk_resp_ruolo_ruolo FOREIGN KEY (ruolo_id) REFERENCES public.ruolo(id) ON DELETE CASCADE
);

CREATE TABLE public.dipendenza (
    id SERIAL PRIMARY KEY,
    asset_id INT NOT NULL,
    servizio_id INT,
    fornitore_id INT,
    descrizione TEXT,
    CONSTRAINT fk_dipendenza_asset FOREIGN KEY (asset_id) REFERENCES public.asset(id) ON DELETE CASCADE,
    CONSTRAINT fk_dipendenza_servizio FOREIGN KEY (servizio_id) REFERENCES public.servizio(id) ON DELETE SET NULL,
    CONSTRAINT fk_dipendenza_fornitore FOREIGN KEY (fornitore_id) REFERENCES public.fornitore(id) ON DELETE SET NULL
);

CREATE TABLE public.versioning_asset (
    id SERIAL PRIMARY KEY,
    asset_id INT NOT NULL,
    utente VARCHAR(255) NOT NULL,
    operazione VARCHAR(50) NOT NULL,
    data_modifica TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    descrizione TEXT,
    CONSTRAINT fk_versioning_asset FOREIGN KEY (asset_id) REFERENCES public.asset(id) ON DELETE CASCADE
);

CREATE OR REPLACE FUNCTION public.process_asset_audit()
RETURNS TRIGGER AS $$
DECLARE
    current_user_email VARCHAR(255);
BEGIN
    SELECT COALESCE(auth.jwt() ->> 'email', 'SYSTEM_CORE') INTO current_user_email;
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO public.versioning_asset (asset_id, utente, operazione, descrizione)
        VALUES (NEW.id, current_user_email, 'INSERT', 'Inizializzazione asset ICT: ' || NEW.nome);
        RETURN NEW;
    ELSIF (TG_OP = 'UPDATE') THEN
        INSERT INTO public.versioning_asset (asset_id, utente, operazione, descrizione)
        VALUES (NEW.id, current_user_email, 'UPDATE', 'Variazione record. Precedente: ' || OLD.nome || ' -> Aggiornato: ' || NEW.nome);
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO public.versioning_asset (asset_id, utente, operazione, descrizione)
        VALUES (OLD.id, current_user_email, 'DELETE', 'Rimozione definitiva dall''inventario attivo dell''asset: ' || OLD.nome);
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_asset_audit
AFTER INSERT OR UPDATE OR DELETE ON public.asset
FOR EACH ROW EXECUTE FUNCTION public.process_asset_audit();
