-- ==========================================================================
-- DDL EMENDATO: 01-Inizializzazione-Schema-v6.8_Hardened
-- ==========================================================================

-- 0. RESET SELETTIVO DELLE TABELLE (NON DISTRUGGE LO SCHEMA PUBLIC)
DROP TRIGGER IF EXISTS trg_asset_audit ON asset;
DROP FUNCTION IF EXISTS process_asset_audit();
DROP TABLE IF EXISTS versioning_asset CASCADE;
DROP TABLE IF EXISTS evento_servizio CASCADE;
DROP TABLE IF EXISTS servizio_componente CASCADE;
DROP TABLE IF EXISTS servizio_dipendenza CASCADE;
DROP TABLE IF EXISTS servizio CASCADE;
DROP TABLE IF EXISTS fornitore CASCADE;
DROP TABLE IF EXISTS asset CASCADE;
DROP TABLE IF EXISTS vulnerabilita CASCADE;
DROP TABLE IF EXISTS responsabile_ruolo CASCADE;
DROP TABLE IF EXISTS responsabile CASCADE;
DROP TABLE IF EXISTS tipo_dipendenza_servizio CASCADE;
DROP TABLE IF EXISTS tipo_dipendenza CASCADE;
DROP TABLE IF EXISTS esito_impatto CASCADE;
DROP TABLE IF EXISTS stato_servizio CASCADE;
DROP TABLE IF EXISTS ruolo CASCADE;
DROP TABLE IF EXISTS ruolo_organigramma CASCADE;
DROP TABLE IF EXISTS tipo_fornitore CASCADE;
DROP TABLE IF EXISTS tipo_servizio CASCADE;
DROP TABLE IF EXISTS categoria_asset CASCADE;
DROP TABLE IF EXISTS organizzazione CASCADE;

-- 1. TABELLE DI DOMINIO
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
    organizzazione_id int REFERENCES organizzazione(id) ON DELETE SET NULL,
    ruolo_organigramma_id int REFERENCES ruolo_organigramma(id) ON DELETE SET NULL
);

CREATE TABLE responsabile_ruolo (
    responsabile_id int REFERENCES responsabile(id) ON DELETE CASCADE,
    ruolo_id int REFERENCES ruolo(id) ON DELETE CASCADE,
    is_titolare boolean DEFAULT true,
    PRIMARY KEY (responsabile_id, ruolo_id)
);

-- 3. GESTIONE DEL RISCHIO
CREATE TABLE vulnerabilita (
    id serial PRIMARY KEY,
    codice_bollettino varchar UNIQUE, 
    descrizione_rischio text,
    livello_severita varchar NOT NULL CONSTRAINT check_severita CHECK (livello_severita IN ('Informativa', 'Bassa', 'Media', 'Alta', 'Critica')),
    data_pubblicazione date DEFAULT now()
);

-- 4. INVENTARIO ASSET (CORE)
CREATE TABLE asset (
    id serial PRIMARY KEY,
    nome varchar NOT NULL,
    categoria_asset_id int REFERENCES categoria_asset(id) ON DELETE RESTRICT,
    vulnerabilita_id int REFERENCES vulnerabilita(id) ON DELETE SET NULL, 
    classificazione_criticita varchar NOT NULL CONSTRAINT check_criticita_asset CHECK (classificazione_criticita IN ('Bassa', 'Media', 'Alta', 'Critica')),
    descrizione text,
    ubicazione varchar,
    versione varchar,
    data_inserimento timestamptz DEFAULT now(), -- Modificato in timestamptz per granularità NIS2
    organizzazione_id int REFERENCES organizzazione(id) ON DELETE SET NULL,
    responsabile_id int REFERENCES responsabile(id) ON DELETE SET NULL
);

-- 5. SUPPLY CHAIN
CREATE TABLE fornitore (
    id serial PRIMARY KEY, 
    nome varchar NOT NULL, 
    tipo_fornitore_id int REFERENCES tipo_fornitore(id) ON DELETE SET NULL,
    indirizzo varchar, 
    contatto_email varchar
);

-- 6. MODELLAZIONE SERVIZI E DIPENDENZE
CREATE TABLE servizio (
    id serial PRIMARY KEY, 
    nome varchar NOT NULL, 
    descrizione text,
    tipo_servizio_id int REFERENCES tipo_servizio(id) ON DELETE SET NULL,
    stato_servizio_id int REFERENCES stato_servizio(id) ON DELETE SET NULL,
    organizzazione_id int REFERENCES organizzazione(id) ON DELETE SET NULL,
    responsabile_id int REFERENCES responsabile(id) ON DELETE SET NULL
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

-- 7. EVENTI, AUDITING E VERSIONING (HARDENED)
CREATE TABLE evento_servizio (
    id serial PRIMARY KEY,
    servizio_id int REFERENCES servizio(id) ON DELETE CASCADE,
    stato_servizio_id int REFERENCES stato_servizio(id) ON DELETE SET NULL,
    descrizione text, 
    data_inizio timestamp NOT NULL DEFAULT now(), 
    data_fine timestamp,
    causa varchar,
    severita varchar CONSTRAINT check_severita_evento CHECK (severita IN ('Bassa', 'Media', 'Alta', 'Critica'))
);

CREATE TABLE versioning_asset (
    id serial PRIMARY KEY,
    asset_id int, -- Rimosso il vincolo RESTRICT/CASCADE per conservare lo storico anche se l'asset viene eliminato
    utente_id uuid, -- Cambiato in UUID per legarsi a auth.users di Supabase
    operazione varchar NOT NULL CONSTRAINT check_operazione CHECK (operazione IN ('INSERT', 'UPDATE', 'DELETE')), 
    descrizione text,
    data_modifica timestamp DEFAULT now()
);

-- 8. BUSINESS LOGIC (TRIGGER PER AUDITING REALE CON SUPABASE JWT CLAIMS)
CREATE OR REPLACE FUNCTION process_asset_audit()
RETURNS TRIGGER AS $$
DECLARE
    current_uid uuid;
BEGIN
    -- Estrazione sicura dell'UUID utente dal JWT di Supabase
    BEGIN
        current_uid := auth.uid();
    EXCEPTION WHEN OTHERS THEN
        current_uid := NULL; -- Gestione inserimenti diretti da superuser senza sessione HTTP
    END;

    IF (TG_OP = 'INSERT') THEN
        INSERT INTO versioning_asset (asset_id, utente_id, operazione, descrizione)
        VALUES (NEW.id, current_uid, 'INSERT', 'Registrazione iniziale del nuovo asset nell''inventario');
        RETURN NEW;
    ELSIF (TG_OP = 'UPDATE') THEN
        INSERT INTO versioning_asset (asset_id, utente_id, operazione, descrizione)
        VALUES (OLD.id, current_uid, 'UPDATE', 'Aggiornamento attributi asset. Modificato da: ' || COALESCE(current_uid::text, 'System'));
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO versioning_asset (asset_id, utente_id, operazione, descrizione)
        VALUES (OLD.id, current_uid, 'DELETE', 'Rimozione definitiva dell''asset dal registro attivo');
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_asset_audit
AFTER INSERT OR UPDATE OR DELETE ON asset
FOR EACH ROW EXECUTE FUNCTION process_asset_audit();
