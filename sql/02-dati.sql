-- =========================================================================
-- FILE: sql/02-dati.sql (VERSIONE 6.8 - ALLINEATA A SCHEMA_HARDENED)
-- Descrizione: Dataset di popolamento conforme alle tabelle 3NF v6.8.
-- =========================================================================

-- 1. RESET CONTROLLATO DEI DATI (Ordine corretto per vincoli FK)
TRUNCATE 
    public.versioning_asset,
    public.evento_servizio,
    public.servizio_componente,
    public.servizio_dipendenza,
    public.servizio,
    public.fornitore,
    public.asset,
    public.vulnerabilita,
    public.responsabile_ruolo,
    public.responsabile,
    public.tipo_dipendenza_servizio,
    public.tipo_dipendenza,
    public.esito_impatto,
    public.stato_servizio,
    public.ruolo,
    public.ruolo_organigramma,
    public.tipo_fornitore,
    public.tipo_servizio,
    public.categoria_asset,
    public.organizzazione
RESTART IDENTITY CASCADE;

-- 2. POPOLAMENTO TABELLE DI DIZIONARIO / DOMINIO (PADRE)
INSERT INTO public.organizzazione (nome, descrizione) 
VALUES ('Azienda Sanitaria Territoriale Alpha', 'Presidio Ospedaliero e Rete Ambulatoriale Critica');

INSERT INTO public.categoria_asset (codice_acn, nome, descrizione) VALUES 
('AC:NW_HW-FW', 'Network Security Appliance', 'Dispositivi hardware di sicurezza e filtraggio perimetrale'),
('AC:SW_DB-SQL', 'Database Management System', 'Sistemi di gestione di basi dati relazionali e documentali'),
('AC:MD_HW-SRV', 'Medical Imaging Server', 'Server dedicati alla gestione e archiviazione di immagini diagnostiche');

INSERT INTO public.tipo_servizio (nome, descrizione) VALUES 
('Core Business', 'Servizi sanitari diretti al cittadino'),
('Infrastrutturale', 'Servizi IT di supporto all''infrastruttura di rete');

INSERT INTO public.tipo_fornitore (nome, descrizione) VALUES 
('Hardware Vendor', 'Fornitori di apparati fisici ed appliance di rete'),
('Cloud Provider', 'Fornitori di servizi cloud e backend managed'),
('Software Vendor', 'Sviluppatori di applicativi e piattaforme EHR/PACS');

INSERT INTO public.ruolo_organigramma (nome, descrizione) VALUES 
('Security Infrastructure Specialist', 'Specialista della sicurezza delle architetture e reti'),
('Direttore IT e Operations', 'Responsabile apicale dei sistemi informativi aziendali');

INSERT INTO public.ruolo (nome, descrizione) VALUES 
('Referente Architetture e Infrastrutture', 'Responsabile della sicurezza dei sistemi e del network aziendale'),
('Referente CSIRT per ACN', 'Punto di contatto operativo per la gestione e notifica degli incidenti NIS2'),
('CISO', 'Chief Information Security Officer in ambito Sanitario'),
('System Administrator', 'Amministratore di sistema e basi dati critiche');

INSERT INTO public.stato_servizio (codice, descrizione) VALUES 
('ATT', 'Attivo ed operativo'),
('DEG', 'Degradato o in manutenzione'),
('DOWN', 'Non disponibile');

INSERT INTO public.tipo_dipendenza_servizio (codice, descrizione) VALUES 
('CRIT', 'Dipendenza critica essenziale per l''erogazione del servizio');

-- 3. RISORSE UMANE E GOVERNANCE
INSERT INTO public.responsabile (nome, email, telefono, organizzazione_id, ruolo_organigramma_id) VALUES
('Gianluca Lucarelli', 'g.lucarelli@sanita.it', '+39011555123', 1, 1),
('Francesco Manager', 'f.manager@sanita.it', '+39011555456', 1, 2);

INSERT INTO public.responsabile_ruolo (responsabile_id, ruolo_id, is_titolare) VALUES 
(1, 1, true), 
(1, 2, true), 
(2, 3, true); 

-- 4. SUPPLY CHAIN
INSERT INTO public.fornitore (nome, tipo_fornitore_id, indirizzo, contatto_email) VALUES 
('Fortinet Sec', 1, 'Milano, Italia', 'tac@fortinet.com'),
('Supabase Cloud', 2, 'Singapore', 'enterprise@supabase.io'),
('Microsoft Healthcare', 3, 'Roma, Italia', 'support@microsoft.com');

-- 5. GESTIONE DEL RISCHIO (Vulnerabilità)
INSERT INTO public.vulnerabilita (codice_bollettino, descrizione_rischio, livello_severita) VALUES
('CVE-2026-0001', 'Vulnerabilità di esecuzione codice remoto nel firmware perimetrale', 'Critica');

-- 6. INVENTARIO ASSET (CORE)
INSERT INTO public.asset (nome, categoria_asset_id, vulnerabilita_id, classificazione_criticita, descrizione, ubicazione, organizzazione_id, responsabile_id) VALUES
('FW-BORDER-01', 1, 1, 'Critica', 'Firewall perimetrale di frontiera a protezione del CED centrale', 'Server Room Piano -1', 1, 1),
('DB-EHR-POSTGRES', 2, NULL, 'Critica', 'Base dati centralizzata del Fascicolo Sanitario Elettronico', 'Cluster Supabase Staging', 1, 1),
('SRV-PACS-01', 3, NULL, 'Alta', 'Sistema di archiviazione e refertazione radiologica (DICOM)', 'CED Ospedaliero Centrale', 1, 2);

-- 7. MODELLAZIONE SERVIZI E DIPENDENZE
INSERT INTO public.servizio (nome, descrizione, tipo_servizio_id, stato_servizio_id, organizzazione_id, responsabile_id) VALUES
('Accettazione e Pronto Soccorso', 'Triage e gestione urgenze mediche real-time', 1, 1, 1, 2),
('Fascicolo Sanitario e Consultazione', 'Erogazione della storia clinica del paziente ai reparti', 1, 1, 1, 1);

INSERT INTO public.servizio_dipendenza (servizio_id, tipo_dipendenza_servizio_id, asset_id, fornitore_id, descrizione) VALUES 
(1, 1, 1, NULL, 'Il servizio di Pronto Soccorso dipende dal corretto instradamento del Firewall Fortinet'),
(2, 1, 2, NULL, 'La consultazione dei fascicoli dipende dalla disponibilità del database su Supabase');
