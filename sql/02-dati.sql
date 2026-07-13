-- =========================================================================
-- FILE: sql/02-dati.sql (VERSIONE ALLINEATA ALLA NUOVA STRUTTURA 3NF)
-- Descrizione: Dataset di popolamento conforme alle 9 tabelle core.
-- Obiettivo: Validazione del framework in ambiente di simulazione sanitaria
-- =========================================================================

-- 1. RESET CONTROLLATO DEI DATI (Integrità garantita da CASCADE)
TRUNCATE public.dipendenza, public.responsabile_ruolo, public.ruolo, 
         public.servizio, public.versioning_asset, public.asset, 
         public.responsabile, public.fornitore, public.organizzazione 
RESTART IDENTITY CASCADE;

-- 2. POPOLAMENTO ORGANIZZAZIONE
INSERT INTO public.organizzazione (nome, descrizione) 
VALUES ('Azienda Sanitaria Territoriale Alpha', 'Presidio Ospedaliero e Rete Ambulatoriale Critica');

-- 3. POPOLAMENTO RUOLI NORMATIVI ACN / CSIRT
INSERT INTO public.ruolo (nome, descrizione) VALUES 
('Referente Architetture e Infrastrutture', 'Responsabile della sicurezza dei sistemi e del network aziendale'),
('Referente CSIRT per ACN', 'Punto di contatto operativo per la gestione e notifica degli incidenti NIS2'),
('CISO', 'Chief Information Security Officer in ambito Sanitario'),
('System Administrator', 'Amministratore di sistema e basi dati critiche');

-- 4. POPOLAMENTO RESPONSABILI
INSERT INTO public.responsabile (nome, cognome, ruolo_organigramma, email, telefono, organizzazione_id) VALUES
('Gianluca', 'Lucarelli', 'Security Infrastructure Specialist', 'g.lucarelli@sanita.it', '+39011555123', 1),
('Francesco', 'Manager', 'Direttore IT e Operations', 'f.manager@sanita.it', '+39011555456', 1);

-- 5. ASSOCIAZIONE ASSOCIAZIONI RESPONSABILI - RUOLI (Tabella N:M)
INSERT INTO public.responsabile_ruolo (responsabile_id, ruolo_id, is_titolare) VALUES 
(1, 1, true), -- Gianluca: Referente Architetture
(1, 2, true), -- Gianluca: Referente CSIRT per ACN
(2, 3, true); -- Francesco: CISO

-- 6. POPOLAMENTO FORNITORI (Supply Chain Risk Management NIS2)
INSERT INTO public.fornitore (nome, tipo, indirizzo, contatto_email) VALUES 
('Fortinet Sec', 'Firewall Appliance & Gateway Vendor', 'Milano, Italia', 'tac@fortinet.com'),
('Supabase Cloud', 'Backend-as-a-Service Provider', 'Singapore', 'enterprise@supabase.io'),
('Microsoft Healthcare', 'EHR & Cloud Infrastructure', 'Roma, Italia', 'support@microsoft.com');

-- 7. POPOLAMENTO ASSET CRITICI (Censimento granularizzato)
INSERT INTO public.asset (nome, categoria, classificazione_criticita, descrizione, ubicazione, organizzazione_id, responsable_id) VALUES
('FW-BORDER-01', 'Network Security Appliance', 'Critica', 'Firewall perimetrale di frontiera a protezione del CED centrale', 'Server Room Piano -1', 1, 1),
('DB-EHR-POSTGRES', 'Database Management System', 'Critica', 'Base dati centralizzata del Fascicolo Sanitario Elettronico', 'Cluster Supabase Staging', 1, 1),
('SRV-PACS-01', 'Medical Imaging Server', 'Alto', 'Sistema di archiviazione e refertazione radiologica (DICOM)', 'CED Ospedaliero Centrale', 1, 2);

-- 8. POPOLAMENTO SERVIZI ESSENZIALI
INSERT INTO public.servizio (nome, descrizione, organizzazione_id, responsabile_id) VALUES
('Accettazione e Pronto Soccorso', 'Triage e gestione urgenze mediche real-time', 1, 2),
('Fascicolo Sanitario e Consultazione', 'Erogazione della storia clinica del paziente ai reparti', 1, 1);

-- 9. POPOLAMENTO DIPENDENZE INFRASTRUTTURALI
INSERT INTO public.dipendenza (asset_id, servizio_id, fornitore_id, descrizione) VALUES 
(1, 1, 1, 'Il servizio di Pronto Soccorso dipende dal corretto instradamento del Firewall Fortinet'),
(2, 2, 2, 'La consultazione dei fascicoli dipende dalla disponibilità del database su Supabase');
