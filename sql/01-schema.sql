-- ===============================================================
-- 01-INIZIALIZZAZIONE SCHEMA (VERSIONE 6.7 - 3NF PURA)
-- Progetto: NIS2 Asset Inventory Manager
-- Obiettivo: Sincronizzazione totale con Dataset V. 6.6+
-- ===============================================================

-- 0. RESET TOTALE 
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

-- 1. TABELLE DI DOMINIO (PADRE)
CREATE TABLE organizzazione (
    id serial PRIMARY KEY, 
    nome varchar NOT NULL, 
    descrizione text
);

CREATE TABLE categoria_asset (
    id serial PRIMARY KEY, 
    codice_acn varchar UNIQUE, -- Codice Tassonomia ACN (es: AC:IN_HW-CS_SR)
    nome varchar NOT NULL, 
    descrizione text
);

CREATE TABLE tipo_servizio (id serial PRIMARY KEY, nome varchar NOT NULL, descrizione text);
CREATE TABLE tipo_fornitore (id serial PRIMARY KEY, nome varchar NOT NULL, descrizione text);
CREATE TABLE ruolo_organigramma (id serial PRIMARY KEY, nome varchar NOT NULL, descrizione text);
CREATE TABLE ruolo (id serial PRIMARY KEY, nome varchar, descrizione text);
CREATE TABLE stato_servizio (id serial PRIMARY KEY, codice varchar UNIQUE, descrizione text);
CREATE TABLE esito_impatto (id serial PRIMARY KEY, codice varchar UNIQUE, descrizione text);
CREATE TABLE tipo_dipendenza (id serial PRIMARY KEY, codice varchar UNIQUE, descrizione text);
CREATE TABLE tipo_dipendenza_servizio (id serial PRIMARY KEY, codice varchar UNIQUE, descrizione text);

-- 2. RISORSE UMANE E GOVERNANCE
CREATE TABLE responsabile (
    id serial PRIMARY KEY, 
    nome varchar NOT NULL, 
    email varchar UNIQUE, 
    telefono varchar,
    organizzazione_id int REFERENCES organizzazione(id),
    ruolo_organigramma_id int REFERENCES ruolo_organigramma(id)
);

CREATE TABLE responsabile_ruolo (
    responsabile_id int REFERENCES responsabile(id) ON DELETE CASCADE,
    ruolo_id int REFERENCES ruolo(id) ON DELETE CASCADE,
    is_titolare boolean DEFAULT true,
    PRIMARY KEY (responsabile_id, ruolo_id)
);

-- 3. GESTIONE DEL RISCHIO (3NF)
CREATE TABLE vulnerabilita (
    id serial PRIMARY KEY,
    codice_bollettino varchar UNIQUE, -- CVE o ID ACN
    descrizione_rischio text,
    livello_severita varchar,
    data_pubblicazione date DEFAULT now()
);

-- 4. INVENTARIO ASSET (CORE)
CREATE TABLE asset (
    id serial PRIMARY KEY,
    nome varchar NOT NULL,
    categoria_asset_id int REFERENCES categoria_asset(id),
    vulnerabilita_id int REFERENCES vulnerabilita(id) ON DELETE SET NULL, 
    classificazione_criticita varchar,
    descrizione text,
    ubicazione varchar,
    versione varchar,
    data_inserimento date DEFAULT now(),
    organizzazione_id int REFERENCES organizzazione(id),
    responsabile_id int REFERENCES responsabile(id)
);

-- 5. SUPPLY CHAIN
CREATE TABLE fornitore (
    id serial PRIMARY KEY, 
    nome varchar NOT NULL, 
    tipo_fornitore_id int REFERENCES tipo_fornitore(id),
    indirizzo varchar, 
    contatto_email varchar
);

-- 6. MODELLAZIONE SERVIZI E DIPENDENZE
CREATE TABLE servizio (
    id serial PRIMARY KEY, 
    nome varchar NOT NULL, 
    descrizione text,
    tipo_servizio_id int REFERENCES tipo_servizio(id),
    stato_servizio_id int REFERENCES stato_servizio(id),
    organizzazione_id int REFERENCES organizzazione(id),
    responsabile_id int REFERENCES responsabile(id)
);

CREATE TABLE servizio_dipendenza (
    id serial PRIMARY KEY,
    servizio_id int NOT NULL REFERENCES servizio(id) ON DELETE CASCADE,
    tipo_dipendenza_servizio_id int NOT NULL REFERENCES tipo_dipendenza_servizio(id),
    asset_id int REFERENCES asset(id) ON DELETE CASCADE,
    fornitore_id int REFERENCES fornitore(id) ON DELETE CASCADE,
    descrizione text,
    CONSTRAINT check_dipendenza_esclusiva CHECK (
        (asset_id IS NOT NULL AND fornitore_id IS NULL) OR 
        (asset_id IS NULL AND fornitore_id IS NOT NULL)
    )
);

CREATE TABLE servizio_componente (
    servizio_padre_id int REFERENCES servizio(id) ON DELETE CASCADE,
    servizio_figlio_id int REFERENCES servizio(id) ON DELETE CASCADE,
    tipo_dipendenza_id int REFERENCES tipo_dipendenza(id),
    esito_impatto_id int REFERENCES esito_impatto(id),
    peso_percentuale int CHECK (peso_percentuale BETWEEN 0 AND 100),
    descrizione text,
    PRIMARY KEY (servizio_padre_id, servizio_figlio_id)
);

-- 7. EVENTI, AUDITING E VERSIONING (FIXED)
CREATE TABLE evento_servizio (
    id serial PRIMARY KEY,
    servizio_id int REFERENCES servizio(id) ON DELETE CASCADE,
    stato_servizio_id int REFERENCES stato_servizio(id),
    descrizione text, -- Re-inserita per coerenza Dataset V. 6.6
    data_inizio timestamp NOT NULL DEFAULT now(), -- Re-inserita per coerenza Dataset V. 6.6
    data_fine timestamp,
    causa varchar,
    severita varchar
);

CREATE TABLE versioning_asset (
    id serial PRIMARY KEY,
    asset_id int REFERENCES asset(id) ON DELETE CASCADE,
    utente varchar NOT NULL,
    operazione varchar NOT NULL, -- INSERT, UPDATE, DELETE
    descrizione text,
    data_modifica timestamp DEFAULT now()
);

-- 8. BUSINESS LOGIC (TRIGGER PER AUDITING)
CREATE OR REPLACE FUNCTION process_asset_audit()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'UPDATE') THEN
        INSERT INTO versioning_asset (asset_id, utente, operazione, descrizione)
        VALUES (OLD.id, current_user, 'UPDATE', 'Aggiornamento attributi asset');
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO versioning_asset (asset_id, utente, operazione, descrizione)
        VALUES (OLD.id, current_user, 'DELETE', 'Rimozione asset dal registro');
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_asset_audit
AFTER UPDATE OR DELETE ON asset
FOR EACH ROW EXECUTE FUNCTION process_asset_audit();
