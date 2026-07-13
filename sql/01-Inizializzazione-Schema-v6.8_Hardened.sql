-- =========================================================================
-- FILE: sql/01-Inizializzazione-Schema-v6.8_Hardened.sql
-- TARGET ARCHITETTURALE: ER V3.6 (22 TABELLE PURA 3NF)
-- DESCRIZIONE: DDL completo, Audit Log Engine e Trigger di sistema
-- =========================================================================

-- Rimozione preventiva per garantire la pulizia dell'ambiente di staging
DROP TRIGGER IF EXISTS trg_asset_audit ON public.asset;
DROP FUNCTION IF EXISTS public.process_asset_audit();
DROP TABLE IF EXISTS public.audit_log CASCADE;
DROP TABLE IF EXISTS public.evento_servizio CASCADE;
DROP TABLE IF EXISTS public.stato_servizio CASCADE;
DROP TABLE IF EXISTS public.servizio_componente CASCADE;
DROP TABLE IF EXISTS public.esito_impatto CASCADE;
DROP TABLE IF EXISTS public.tipo_dipendenza CASCADE;
DROP TABLE IF EXISTS public.servizio_dipendenza_fornitore CASCADE;
DROP TABLE IF EXISTS public.servizio_dipendenza_asset CASCADE;
DROP TABLE IF EXISTS public.tipo_dipendenza_servizio CASCADE;
DROP TABLE IF EXISTS public.servizio CASCADE;
DROP TABLE IF EXISTS public.fornitore CASCADE;
DROP TABLE IF EXISTS public.asset_vulnerabilita CASCADE;
DROP TABLE IF EXISTS public.asset CASCADE;
DROP TABLE IF EXISTS public.vulnerabilita CASCADE;
DROP TABLE IF EXISTS public.responsabile_ruolo CASCADE;
DROP TABLE IF EXISTS public.ruolo CASCADE;
DROP TABLE IF EXISTS public.responsabile CASCADE;
DROP TABLE IF EXISTS public.ruolo_organigramma CASCADE;
DROP TABLE IF EXISTS public.tipo_fornitore CASCADE;
DROP TABLE IF EXISTS public.tipo_servizio CASCADE;
DROP TABLE IF EXISTS public.categoria_asset CASCADE;
DROP TABLE IF EXISTS public.organizzazione CASCADE;
DROP TABLE IF EXISTS public.dipendenza CASCADE;
DROP TABLE IF EXISTS public.versioning_asset CASCADE;

-- 1. APPARATO ANAGRAFICHE E CORE
CREATE TABLE public.organizzazione (
    id serial PRIMARY KEY,
    nome varchar NOT NULL,
    descrizione text
);

CREATE TABLE public.categoria_asset (
    id serial PRIMARY KEY,
    codice_acn varchar UNIQUE,
    nome varchar NOT NULL,
    descrizione text
);

CREATE TABLE public.tipo_servizio (id serial PRIMARY KEY, nome varchar NOT NULL, descrizione text);
CREATE TABLE public.tipo_fornitore (id serial PRIMARY KEY, nome varchar NOT NULL, descrizione text);
CREATE TABLE public.ruolo_organigramma (id serial PRIMARY KEY, nome varchar NOT NULL, descrizione text);

CREATE TABLE public.responsabile (
    id serial PRIMARY KEY,
    nome varchar NOT NULL,
    cognome varchar NOT NULL,
    email varchar UNIQUE NOT NULL,
    telefono varchar,
    organizzazione_id int REFERENCES public.organizzazione(id) ON DELETE RESTRICT,
    ruolo_organigramma_id int REFERENCES public.ruolo_organigramma(id) ON DELETE RESTRICT
);

CREATE TABLE public.ruolo (id serial PRIMARY KEY, nome varchar UNIQUE NOT NULL, descrizione text);

CREATE TABLE public.responsabile_ruolo (
    responsabile_id int REFERENCES public.responsabile(id) ON DELETE CASCADE,
    ruolo_id int REFERENCES public.ruolo(id) ON DELETE CASCADE,
    is_titolare boolean DEFAULT true,
    PRIMARY KEY (responsabile_id, ruolo_id)
);

-- 2. MODULO SECURITY & RISK ASSESSMENT (CVE N:M)
CREATE TABLE public.vulnerabilita (
    id serial PRIMARY KEY,
    codice_bollettino varchar UNIQUE NOT NULL,
    descrizione_rischio text,
    livello_severita varchar NOT NULL CONSTRAINT check_severita CHECK (livello_severita IN ('Informativa', 'Bassa', 'Media', 'Alta', 'Critica')),
    data_pubblicazione date DEFAULT now()
);

CREATE TABLE public.asset (
    id serial PRIMARY KEY,
    nome varchar NOT NULL,
    categoria_asset_id int REFERENCES public.categoria_asset(id) ON DELETE RESTRICT,
    classificazione_criticita varchar NOT NULL CONSTRAINT check_criticita_asset CHECK (classificazione_criticita IN ('Bassa', 'Media', 'Alta', 'Critica')),
    descrizione text,
    ubicazione varchar,
    versione varchar,
    data_inserimento date DEFAULT now(),
    organizzazione_id int REFERENCES public.organizzazione(id) ON DELETE RESTRICT,
    responsabile_id int REFERENCES public.responsabile(id) ON DELETE RESTRICT
);

CREATE TABLE public.asset_vulnerabilita (
    asset_id int REFERENCES public.asset(id) ON DELETE CASCADE,
    vulnerabilita_id int REFERENCES public.vulnerabilita(id) ON DELETE CASCADE,
    data_rilevamento timestamp DEFAULT now(),
    stato_remediation varchar NOT NULL CONSTRAINT check_remediation CHECK (stato_remediation IN ('OPEN', 'PATCHED', 'MITIGATED')),
    PRIMARY KEY (asset_id, vulnerabilita_id)
);

-- 3. SUPPLY CHAIN E SERVIZI ESSENZIALI
CREATE TABLE public.fornitore (
    id serial PRIMARY KEY,
    nome varchar NOT NULL,
    tipo_fornitore_id int REFERENCES public.tipo_fornitore(id) ON DELETE RESTRICT,
    indirizzo varchar,
    contatto_email varchar NOT NULL
);

CREATE TABLE public.stato_servizio (id serial PRIMARY KEY, codice varchar UNIQUE NOT NULL, descrizione text);

CREATE TABLE public.servizio (
    id serial PRIMARY KEY,
    nome varchar NOT NULL,
    descrizione text,
    tipo_servizio_id int REFERENCES public.tipo_servizio(id) ON DELETE RESTRICT,
    stato_servizio_id int REFERENCES public.stato_servizio(id) ON DELETE RESTRICT,
    organizzazione_id int REFERENCES public.organizzazione(id) ON DELETE RESTRICT,
    responsabile_id int REFERENCES public.responsabile(id) ON DELETE RESTRICT
);

-- 4. MODELLAZIONE DIPENDENZE SENZA CAMPI NULLI (3NF PURA)
CREATE TABLE public.tipo_dipendenza_servizio (id serial PRIMARY KEY, codice varchar UNIQUE NOT NULL, descrizione text);

CREATE TABLE public.servizio_dipendenza_asset (
    servizio_id int REFERENCES public.servizio(id) ON DELETE CASCADE,
    asset_id int REFERENCES public.asset(id) ON DELETE CASCADE,
    tipo_dipendenza_servizio_id int REFERENCES public.tipo_dipendenza_servizio(id) ON DELETE RESTRICT,
    descrizione text,
    PRIMARY KEY (servizio_id, asset_id)
);

CREATE TABLE public.servizio_dipendenza_fornitore (
    servizio_id int REFERENCES public.servizio(id) ON DELETE CASCADE,
    fornitore_id int REFERENCES public.fornitore(id) ON DELETE CASCADE,
    tipo_dipendenza_servizio_id int REFERENCES public.tipo_dipendenza_servizio(id) ON DELETE RESTRICT,
    descrizione text,
    PRIMARY KEY (servizio_id, fornitore_id)
);

-- 5. COMPOSIZIONE DEI SERVIZI GERARCHICI
CREATE TABLE public.tipo_dipendenza (id serial PRIMARY KEY, codice varchar UNIQUE NOT NULL, descrizione text);
CREATE TABLE public.esito_impatto (id serial PRIMARY KEY, codice varchar UNIQUE NOT NULL, descrizione text);

CREATE TABLE public.servizio_componente (
    servizio_padre_id int REFERENCES public.servizio(id) ON DELETE CASCADE,
    servizio_figlio_id int REFERENCES public.servizio(id) ON DELETE CASCADE,
    tipo_dipendenza_id int REFERENCES public.tipo_dipendenza(id) ON DELETE RESTRICT,
    esito_impatto_id int REFERENCES public.esito_impatto(id) ON DELETE RESTRICT,
    peso_percentuale int CHECK (peso_percentuale BETWEEN 0 AND 100),
    descrizione text,
    PRIMARY KEY (servizio_padre_id, servizio_figlio_id)
);

-- 6. INCIDENT RESPONSE E LOG COMPLIANCE FORENSE
CREATE TABLE public.evento_servizio (
    id serial PRIMARY KEY,
    servizio_id int REFERENCES public.servizio(id) ON DELETE CASCADE,
    stato_servizio_id int REFERENCES public.stato_servizio(id) ON DELETE RESTRICT,
    inizio timestamp NOT NULL DEFAULT now(),
    fine timestamp,
    causa varchar,
    severita varchar NOT NULL CONSTRAINT check_severita_evento CHECK (severita IN ('Bassa', 'Media', 'Alta', 'Critica'))
);

CREATE TABLE public.audit_log (
    id serial PRIMARY KEY,
    asset_id int,
    utente varchar NOT NULL,
    operazione varchar NOT NULL CONSTRAINT check_operazione_audit CHECK (operazione IN ('INSERT', 'UPDATE', 'DELETE')),
    data_modifica timestamp DEFAULT now(),
    valore_precedente text,
    valore_nuovo text
);

-- 7. AUDIT ENGINE INTEGRATO CON JWT SUPABASE
CREATE OR REPLACE FUNCTION public.process_asset_audit()
RETURNS TRIGGER AS $$
DECLARE
    current_actor varchar;
BEGIN
    current_actor := COALESCE(auth.jwt() ->> 'email', 'SYSTEM_CORE');
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO public.audit_log (asset_id, utente, operazione, valore_nuovo)
        VALUES (NEW.id, current_actor, 'INSERT', ROW_TO_JSON(NEW)::text);
        RETURN NEW;
    ELSIF (TG_OP = 'UPDATE') THEN
        INSERT INTO public.audit_log (asset_id, utente, operazione, valore_precedente, valore_nuovo)
        VALUES (OLD.id, current_actor, 'UPDATE', ROW_TO_JSON(OLD)::text, ROW_TO_JSON(NEW)::text);
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO public.audit_log (asset_id, utente, operazione, valore_precedente)
        VALUES (OLD.id, current_actor, 'DELETE', ROW_TO_JSON(OLD)::text);
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_asset_audit
AFTER INSERT OR UPDATE OR DELETE ON public.asset
FOR EACH ROW EXECUTE FUNCTION public.process_asset_audit();
