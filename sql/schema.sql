-- ===============================================================
-- PROGETTO TESI L31 - REGISTRO CENTRALIZZATO NIS2 (ACN)
-- VERSIONE: 3.3 (ALLINEAMENTO STRUTTURALE ACN & RISK MANAGEMENT)
-- ===============================================================

-- 1. TABELLE DI DOMINIO E ANAGRAFICHE BASE
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
COMMENT ON COLUMN categoria_asset.codice_acn IS 'Codice Tassonomia ACN es. AC:IN_HW-CS_SR';

CREATE TABLE tipo_servizio (
  id serial PRIMARY KEY,
  nome varchar NOT NULL,
  descrizione text
);

CREATE TABLE tipo_fornitore (
  id serial PRIMARY KEY,
  nome varchar NOT NULL,
  descrizione text
);

CREATE TABLE ruolo_organigramma (
  id serial PRIMARY KEY,
  nome varchar NOT NULL,
  descrizione text
);

CREATE TABLE ruolo (
  id serial PRIMARY KEY,
  nome varchar,
  descrizione text
);

-- 2. RISORSE UMANE E RESPONSABILITÀ
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

-- 3. ASSET, SERVIZI E FORNITORI
CREATE TABLE asset (
  id serial PRIMARY KEY,
  nome varchar NOT NULL,
  categoria_asset_id int REFERENCES categoria_asset(id),
  classificazione_criticita varchar,
  descrizione text,
  ubicazione varchar,
  versione varchar,             -- Tracciamento versioning (NIS2)
  bollettino_acn_ref varchar,    -- NUOVO: Riferimento ufficiale CSIRT/ACN
  analisi_rischio_cve text,      -- NUOVO: Dettaglio tecnico vulnerabilità
  data_inserimento date DEFAULT now(),
  organizzazione_id int REFERENCES organizzazione(id),
  responsabile_id int REFERENCES responsabile(id)
);

CREATE TABLE fornitore (
  id serial PRIMARY KEY,
  nome varchar NOT NULL,
  tipo_fornitore_id int REFERENCES tipo_fornitore(id),
  indirizzo varchar,
  contatto_email varchar
);

-- 6. STATO SERVIZIO
CREATE TABLE stato_servizio (
  id serial PRIMARY KEY,
  codice varchar, -- OPERATIVO, MANUTENZIONE, CRITICO
  descrizione text
);

CREATE TABLE servizio (
  id serial PRIMARY KEY,
  nome varchar NOT NULL,
  descrizione text,
  tipo_servizio_id int REFERENCES tipo_servizio(id),
  stato_servizio_id int REFERENCES stato_servizio(id),
  organizzazione_id int REFERENCES organizzazione(id),
  responsabile_id int REFERENCES responsabile(id)
);

-- 4. DIPENDENZE E SUPPLY CHAIN
CREATE TABLE tipo_dipendenza_servizio (
  id serial PRIMARY KEY,
  codice varchar, 
  descrizione text
);

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

-- 5. SERVICE COMPOSITION E IMPATTO
CREATE TABLE tipo_dipendenza (
  id serial PRIMARY KEY,
  codice varchar, 
  descrizione text
);

CREATE TABLE esito_impatto (
  id serial PRIMARY KEY,
  codice varchar, 
  descrizione text
);

CREATE TABLE servizio_componente (
  servizio_padre_id int REFERENCES servizio(id),
  servizio_figlio_id int REFERENCES servizio(id),
  tipo_dipendenza_id int REFERENCES tipo_dipendenza(id),
  esito_impatto_id int REFERENCES esito_impatto(id),
  peso_percentuale int CHECK (peso_percentuale BETWEEN 0 AND 100),
  descrizione text,
  PRIMARY KEY (servizio_padre_id, servizio_figlio_id)
);

-- 6. EVENTI
CREATE TABLE evento_servizio (
  id serial PRIMARY KEY,
  servizio_id int REFERENCES servizio(id),
  stato_servizio_id int REFERENCES stato_servizio(id),
  inizio timestamp,
  fine timestamp,
  causa varchar,
  severita varchar
);

-- 7. AUDITING (VERSIONING)
CREATE TABLE versioning_asset (
  id serial PRIMARY KEY,
  asset_id int REFERENCES asset(id),
  utente varchar,
  operazione varchar, 
  data_modifica timestamp DEFAULT now(),
  descrizione text
);

-- FUNZIONE TRIGGER
CREATE OR REPLACE FUNCTION process_asset_audit()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'UPDATE') THEN
        INSERT INTO versioning_asset (asset_id, utente, operazione, descrizione)
        VALUES (OLD.id, current_user, 'UPDATE', 'Modifica record asset');
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO versioning_asset (asset_id, utente, operazione, descrizione)
        VALUES (OLD.id, current_user, 'DELETE', 'Eliminazione record asset');
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ATTIVAZIONE TRIGGER
CREATE TRIGGER trg_asset_audit
AFTER UPDATE OR DELETE ON asset
FOR EACH ROW EXECUTE FUNCTION process_asset_audit();
