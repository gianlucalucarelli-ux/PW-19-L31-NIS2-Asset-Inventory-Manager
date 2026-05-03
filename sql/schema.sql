-- ===============================================================
-- 01-INIZIALIZZAZIONE SCHEMA (VERSIONE 3.5 - 3NF PURA - 20 TABELLE)
-- ===============================================================

-- 0. RESET TOTALE (Se dà ancora errore di throttling, aspetta un minuto)
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;

-- 1. TABELLE DI DOMINIO (PADRE)
CREATE TABLE organizzazione (
    id serial PRIMARY KEY, 
    nome varchar NOT NULL, 
    descrizione text
);

CREATE TABLE categoria_asset (
    id serial PRIMARY KEY, 
    codice_acn varchar UNIQUE, 
    nome varchar NOT NULL, 
    descrizione text
);

CREATE TABLE tipo_servizio (id serial PRIMARY KEY, nome varchar NOT NULL, descrizione text);
CREATE TABLE tipo_fornitore (id serial PRIMARY KEY, nome varchar NOT NULL, descrizione text);
CREATE TABLE ruolo_organigramma (id serial PRIMARY KEY, nome varchar NOT NULL, descrizione text);
CREATE TABLE ruolo (id serial PRIMARY KEY, nome varchar, descrizione text);

-- 2. RISORSE UMANE
CREATE TABLE responsabile (
    id serial PRIMARY KEY, 
    nome varchar NOT NULL, 
    email varchar, 
    telefono varchar,
    organizzazione_id int REFERENCES organizzazione(id),
    ruolo_organigramma_id int REFERENCES ruolo_organigramma(id)
);

CREATE TABLE responsabile_ruolo (
    responsabile_id int REFERENCES responsabile(id),
    ruolo_id int REFERENCES ruolo(id),
    is_titolare boolean DEFAULT true,
    PRIMARY KEY (responsabile_id, ruolo_id)
);

-- 3. NUOVA TABELLA VULNERABILITÀ (PER 3NF)
CREATE TABLE vulnerabilita (
    id serial PRIMARY KEY,
    codice_bollettino varchar UNIQUE, 
    descrizione_rischio text,
    livello_severita varchar,
    data_pubblicazione date DEFAULT now()
);

-- 4. TABELLA ASSET (NORMALIZZATA)
CREATE TABLE asset (
    id serial PRIMARY KEY,
    nome varchar NOT NULL,
    categoria_asset_id int REFERENCES categoria_asset(id),
    vulnerabilita_id int REFERENCES vulnerabilita(id), 
    classificazione_criticita varchar,
    descrizione text,
    ubicazione varchar,
    versione varchar,
    data_inserimento date DEFAULT now(),
    organizzazione_id int REFERENCES organizzazione(id),
    responsabile_id int REFERENCES responsabile(id)
);

-- 5. SUPPLY CHAIN E MONITORAGGIO
CREATE TABLE fornitore (
    id serial PRIMARY KEY, 
    nome varchar NOT NULL, 
    tipo_fornitore_id int REFERENCES tipo_fornitore(id),
    indirizzo varchar, 
    contatto_email varchar
);

CREATE TABLE stato_servizio (id serial PRIMARY KEY, codice varchar, descrizione text);

CREATE TABLE servizio (
    id serial PRIMARY KEY, 
    nome varchar NOT NULL, 
    descrizione text,
    tipo_servizio_id int REFERENCES tipo_servizio(id),
    stato_servizio_id int REFERENCES stato_servizio(id),
    organizzazione_id int REFERENCES organizzazione(id),
    responsabile_id int REFERENCES responsabile(id)
);

-- 6. DIPENDENZE E COMPOSIZIONE
CREATE TABLE tipo_dipendenza_servizio (id serial PRIMARY KEY, codice varchar, descrizione text);

CREATE TABLE servizio_dipendenza (
    id serial PRIMARY KEY,
    servizio_id int NOT NULL REFERENCES servizio(id),
    tipo_dipendenza_servizio_id int NOT NULL REFERENCES tipo_dipendenza_servizio(id),
    asset_id int REFERENCES asset(id),
    fornitore_id int REFERENCES fornitore(id),
    descrizione text,
    CONSTRAINT check_dipendenza_esclusiva CHECK (
        (asset_id IS NOT NULL AND fornitore_id IS NULL) OR 
        (asset_id IS NULL AND fornitore_id IS NOT NULL)
    )
);

CREATE TABLE tipo_dipendenza (id serial PRIMARY KEY, codice varchar, descrizione text);
CREATE TABLE esito_impatto (id serial PRIMARY KEY, codice varchar, descrizione text);

CREATE TABLE servizio_componente (
    servizio_padre_id int REFERENCES servizio(id),
    servizio_figlio_id int REFERENCES servizio(id),
    tipo_dipendenza_id int REFERENCES tipo_dipendenza(id),
    esito_impatto_id int REFERENCES esito_impatto(id),
    peso_percentuale int CHECK (peso_percentuale BETWEEN 0 AND 100),
    descrizione text,
    PRIMARY KEY (servizio_padre_id, servizio_figlio_id)
);

-- 7. EVENTI E AUDITING
CREATE TABLE evento_servizio (
    id serial PRIMARY KEY,
    servizio_id int REFERENCES servizio(id),
    stato_servizio_id int REFERENCES stato_servizio(id),
    inizio timestamp,
    fine timestamp,
    causa varchar,
    severita varchar
);

CREATE TABLE versioning_asset (
    id serial PRIMARY KEY,
    asset_id int REFERENCES asset(id),
    utente varchar,
    operazione varchar, 
    data_modifica timestamp DEFAULT now(),
    descrizione text
);

-- 8. TRIGGER
CREATE OR REPLACE FUNCTION process_asset_audit()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'UPDATE') THEN
        INSERT INTO versioning_asset (asset_id, utente, operazione, descrizione)
        VALUES (OLD.id, current_user, 'UPDATE', 'Modifica record asset in 3NF');
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO versioning_asset (asset_id, utente, operazione, descrizione)
        VALUES (OLD.id, current_user, 'DELETE', 'Eliminazione record asset');
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_asset_audit
AFTER UPDATE OR DELETE ON asset
FOR EACH ROW EXECUTE FUNCTION process_asset_audit();
