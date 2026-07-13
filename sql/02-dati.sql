-- =========================================================================
-- FILE: sql/02-dati.sql
-- DESCRIZIONE: Popolamento dizionari e record di test (ER v3.6)
-- =========================================================================

TRUNCATE 
    public.audit_log, public.evento_servizio, public.servizio_componente,
    public.esito_impatto, public.tipo_dipendenza, public.servizio_dipendenza_fornitore,
    public.servizio_dipendenza_asset, public.tipo_dipendenza_servizio, public.servizio,
    public.stato_servizio, public.fornitore, public.asset_vulnerabilita, public.asset,
    public.vulnerabilita, public.responsabile_ruolo, public.ruolo, public.responsabile,
    public.ruolo_organigramma, public.tipo_fornitore, public.tipo_servizio,
    public.categoria_asset, public.organizzazione
RESTART IDENTITY CASCADE;

-- Inserimento dizionari stabili
INSERT INTO public.organizzazione (nome, descrizione) VALUES ('Azienda Sanitaria Territoriale Alpha', 'Presidio Ospedaliero Critico');
INSERT INTO public.categoria_asset (codice_acn, nome, descrizione) VALUES ('AC:NW_HW-FW', 'Network Security Appliance', 'Hardware filtraggio reti');
INSERT INTO public.tipo_servizio (nome, descrizione) VALUES ('Core Business', 'Prestazioni sanitarie dirette');
INSERT INTO public.tipo_fornitore (nome, descrizione) VALUES ('Hardware Vendor', 'Fornitori di appliance fisiche');
INSERT INTO public.ruolo_organigramma (nome, descrizione) VALUES ('Security Infrastructure Specialist', 'Specialista infrastrutture');
INSERT INTO public.ruolo (nome, descrizione) VALUES ('Referente CSIRT per ACN', 'Punto di contatto notifiche NIS2');
INSERT INTO public.stato_servizio (codice, descrizione) VALUES ('ATT', 'Servizio Attivo ed Operativo');
INSERT INTO public.tipo_dipendenza_servizio (codice, descrizione) VALUES ('TECNICA', 'Dipendenza da risorsa ICT hardware/software');

-- Record Relazionali Complessi
INSERT INTO public.responsabile (nome, cognome, email, telefono, organizzazione_id, ruolo_organigramma_id) VALUES ('Gianluca', 'Lucarelli', 'g.lucarelli@sanita.it', '+39011555123', 1, 1);
INSERT INTO public.responsabile_ruolo (responsabile_id, ruolo_id, is_titolare) VALUES (1, 1, true);
INSERT INTO public.vulnerabilita (codice_bollettino, descrizione_rischio, livello_severita) VALUES ('CVE-2026-0001', 'RCE nel firmware perimetrale', 'Critica');

-- Core Asset
INSERT INTO public.asset (nome, categoria_asset_id, classificazione_criticita, descrizione, ubicazione, versione, organizzazione_id, responsabile_id) VALUES 
('FW-BORDER-01', 1, 'Critica', 'Firewall principale', 'Server Room Piano -1', 'v7.4.2', 1, 1);

-- Giunzioni Relazionali pure (ER v3.6 Specific)
INSERT INTO public.asset_vulnerabilita (asset_id, vulnerabilita_id, stato_remediation) VALUES (1, 1, 'OPEN');
INSERT INTO public.fornitore (nome, tipo_fornitore_id, indirizzo, contatto_email) VALUES ('Fortinet Sec', 1, 'Milano, Italia', 'tac@fortinet.com');
INSERT INTO public.servizio (nome, descrizione, tipo_servizio_id, stato_servizio_id, organizzazione_id, responsabile_id) VALUES ('Pronto Soccorso Real-Time', 'Triage urgenze', 1, 1, 1, 1);

INSERT INTO public.servizio_dipendenza_asset (servizio_id, asset_id, tipo_dipendenza_servizio_id, descrizione) VALUES (1, 1, 1, 'Il Pronto Soccorso richiede il corretto instradamento del firewall');