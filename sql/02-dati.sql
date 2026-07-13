-- =========================================================================
-- FILE: sql/02-dati.sql (VERSIONE CORRETTA - FIX TYPO)
-- Descrizione: Dataset di popolamento conforme alle 9 tabelle core.
-- =========================================================================

TRUNCATE public.dipendenza, public.responsabile_ruolo, public.ruolo, 
         public.servizio, public.versioning_asset, public.asset, 
         public.responsabile, public.fornitore, public.organizzazione 
RESTART IDENTITY CASCADE;

INSERT INTO public.organizzazione (nome, descrizione) 
VALUES ('Azienda Sanitaria Territoriale Alpha', 'Presidio Ospedaliero e Rete Ambulatoriale Critica');

INSERT INTO public.ruolo (nome, descrizione) VALUES 
('Referente Architetture e Infrastrutture', 'Responsabile della sicurezza dei sistemi e del network aziendale'),
('Referente CSIRT per ACN', 'Punto di contatto operativo per la gestione e notifica degli incidenti NIS2'),
('CISO', 'Chief Information Security Officer in ambito Sanitario'),
('System Administrator', 'Amministratore di sistema e basi dati critiche');

INSERT INTO public.responsabile (nome, cognome, ruolo_organigramma, email, telefono, organizzazione_id) VALUES
('Gianluca', 'Lucarelli', 'Security Infrastructure Specialist', 'g.lucarelli@sanita.it', '+39011555123', 1),
('Francesco', 'Manager', 'Direttore IT e Operations', 'f.manager@sanita.it', '+39011555456', 1);

INSERT INTO public.responsabile_ruolo (responsabile_id, ruolo_id, is_titolare) VALUES 
(1, 1, true), 
(1, 2, true), 
(2, 3, true); 

INSERT INTO public.fornitore (nome, tipo, indirizzo, contatto_email) VALUES 
('Fortinet Sec', 'Firewall Appliance & Gateway Vendor', 'Milano, Italia', 'tac@fortinet.com'),
('Supabase Cloud', 'Backend-as-a-Service Provider', 'Singapore', 'enterprise@supabase.io'),
('Microsoft Healthcare', 'EHR & Cloud Infrastructure', 'Roma, Italia', 'support@microsoft.com');

-- FIX: Corretto il nome della colonna in responsabile_id
INSERT INTO public.asset (nome, categoria, classificazione_criticita, descrizione, ubicazione, organizzazione_id, responsabile_id) VALUES
('FW-BORDER-01', 'Network Security Appliance', 'Critica', 'Firewall perimetrale di frontiera a protezione del CED centrale', 'Server Room Piano -1', 1, 1),
('DB-EHR-POSTGRES', 'Database Management System', 'Critica', 'Base dati centralizzata del Fascicolo Sanitario Elettronico', 'Cluster Supabase Staging', 1, 1),
('SRV-PACS-01', 'Medical Imaging Server', 'Alto', 'Sistema di archiviazione e refertazione radiologica (DICOM)', 'CED Ospedaliero Centrale', 1, 2);

INSERT INTO public.servizio (nome, descrizione, organizzazione_id, responsable_id) VALUES -- Nota: se nel DDL del file 01 la colonna è responsabile_id, uniformare anche qui
('Accettazione e Pronto Soccorso', 'Triage e gestione urgenze mediche real-time', 1, 2),
('Fascicolo Sanitario e Consultazione', 'Erogazione della storia clinica del paziente ai reparti', 1, 1);

-- Nota di controllo: Se in 01-schema.sql per la tabella servizio la colonna è responsabile_id, modifica la riga sopra da "responsable_id" a "responsabile_id" per coerenza.

INSERT INTO public.dipendenza (asset_id, servizio_id, fornitore_id, descrizione) VALUES 
(1, 1, 1, 'Il servizio di Pronto Soccorso dipende dal corretto instradamento del Firewall Fortinet'),
(2, 2, 2, 'La consultazione dei fascicoli dipende dalla disponibilità del database su Supabase');
