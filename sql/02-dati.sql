-- ===============================================================
-- 02-POPOLAMENTO DATI (VERSIONE 7.1 - DATASET INTEGRALE NIS2)
-- Descrizione: Dataset completo per valutazione offline.
-- Fix: Risoluzione CHECK CONSTRAINT su servizio_dipendenza.
-- ===============================================================

-- 1. RESET TOTALE (Integrità garantita da CASCADE)
TRUNCATE 
    organizzazione, categoria_asset, stato_servizio, tipo_servizio, 
    ruolo, responsabile, responsabile_ruolo, ruolo_organigramma,
    vulnerabilita, asset, fornitore, tipo_fornitore,
    servizio, servizio_componente, servizio_dipendenza,
    tipo_dipendenza, tipo_dipendenza_servizio, esito_impatto,
    evento_servizio, versioning_asset 
RESTART IDENTITY CASCADE;

-- 2. ORGANIZZAZIONE E DOMINI DI BASE
INSERT INTO organizzazione (nome, descrizione) 
VALUES ('Comune Digitale Alpha', 'Ente pilota per la resilienza infrastrutturale NIS2');

INSERT INTO stato_servizio (codice, descrizione) VALUES 
('OPERATIVO', 'Attivo'), ('CRITICO', 'Interrotto'), ('MANUTENZIONE', 'In aggiornamento');

INSERT INTO tipo_servizio (nome) VALUES ('Essenziale'), ('Importante');

INSERT INTO esito_impatto (codice, descrizione) VALUES 
('T0', 'Trascurabile'), ('S1', 'Significativo'), ('C2', 'Catastrofico');

-- 3. GOVERNANCE: RUOLI E RESPONSABILI (Punti di Contatto ACN/CSIRT)
INSERT INTO ruolo_organigramma (nome, descrizione) VALUES 
('Direzione Generale', 'Vertice decisionale'), 
('Cyber Security Team', 'Operatività sicurezza'), 
('IT Ops', 'Gestione sistemi');

INSERT INTO ruolo (nome, descrizione) VALUES 
('Amministratore Delegato', 'Rappresentante legale'),
('CISO', 'Chief Information Security Officer'),
('Punto di Contatto ACN', 'Referente principale Agenzia'),
('Vice Punto di Contatto ACN', 'Sostituto referente Agenzia'),
('Punto di Contatto CSIRT', 'Referente tecnico incidenti'),
('Vice Punto di Contatto CSIRT', 'Sostituto tecnico incidenti'),
('DPO', 'Data Protection Officer'),
('System Administrator', 'Amministratore sistemi'),
('Network Engineer', 'Gestione apparati rete'),
('Asset Owner', 'Responsabile logico asset');

INSERT INTO responsabile (organizzazione_id, nome, email) VALUES
(1, 'Giovanni Vertice', 'g.vertice@comune.it'),    
(1, 'Marco Bianchi', 'm.bianchi@comune.it'),       
(1, 'Laura Neri', 'l.neri@comune.it'),             
(1, 'Stefano Verdi', 's.verdi@comune.it'),
(1, 'Giulia Rossi', 'g.rossi@comune.it');

INSERT INTO responsabile_ruolo (responsabile_id, ruolo_id, is_titolare) VALUES 
(1, 1, true), (2, 2, true), (2, 3, true), (3, 5, true), (3, 8, true), (4, 4, true), (4, 6, true), (4, 7, true), (5, 9, true);

-- 4. TASSONOMIA ACN (10 Categorie)
INSERT INTO categoria_asset (codice_acn, nome, descrizione) VALUES
('AC:IN_HW-CS_SR', 'Server Fisico', 'Infrastruttura on-premise'),
('AC:IN_HW-NW_GT', 'Networking Gateway', 'Router e Gateway'),
('AC:IN_SW-DM_DB', 'Database Management', 'Sistemi gestione dati'),
('AC:IN_SW-AP_WS', 'Web Server', 'Server erogazione servizi'),
('AC:IN_HW-CS_WS', 'Workstation', 'Postazioni ufficio tecnico'),
('AC:IN_HW-NW_FW', 'Firewall Appliance', 'Sistemi difesa perimetrale'),
('AC:IN_SW-DM_BK', 'Backup & Recovery', 'Sistemi salvataggio dati'),
('AC:IN_HW-IT_ID', 'IoT Sensor', 'Sensori monitoraggio CED'),
('AC:IN_HW-CS_MB', 'Mobile Device', 'Smartphone di servizio'),
('AC:IN_SW-OS_LX', 'OS Enterprise', 'Sistemi operativi Linux');

-- 5. GESTIONE RISCHIO: VULNERABILITÀ (10 Bollettini)
INSERT INTO vulnerabilita (codice_bollettino, descrizione_rischio, livello_severita) VALUES
('CVE-2024-001', 'Buffer Overflow OpenSSL', 'Alta'),
('CVE-2024-111', 'Zero-day RDP exploit', 'Critica'),
('CVE-2024-444', 'XSS su portale servizi', 'Media'),
('CVE-2024-666', 'Broken Access Control', 'Alta'),
('CVE-2023-555', 'SQL Injection', 'Alta'),
('CVE-2024-777', 'Insecure API Endpoint', 'Media'),
('CVE-2024-888', 'Weak Ciphers SSH', 'Bassa'),
('CVE-2024-999', 'Privilege Escalation Kernel', 'Critica'),
('CVE-2023-123', 'Outdated Firmware BIOS', 'Media'),
('CVE-2024-321', 'Unauthenticated RCE', 'Critica');

-- 6. INVENTARIO ASSET (10 RECORD)
INSERT INTO asset (organizzazione_id, categoria_asset_id, vulnerabilita_id, nome, descrizione, classificazione_criticita, versione) VALUES
(1, 1, 1, 'SRV-DC-01', 'Domain Controller Primario', 'Alta', 'Windows 2022'),
(1, 3, 5, 'DB-CITIZENS-01', 'Database Anagrafe', 'Critica', 'PostgreSQL 15'),
(1, 6, 10, 'FW-BORDER-01', 'Firewall Perimetrale', 'Critica', 'FortiOS 7.4'),
(1, 4, 3, 'WEB-APP-PORTAL', 'Portale Servizi Cittadino', 'Alta', 'Ubuntu 22.04'),
(1, 7, 7, 'NAS-SAFE-STORE', 'Storage Backup Immutabile', 'Alta', 'TrueNAS'),
(1, 2, 8, 'RTR-MAIN-GATE', 'Router di Frontiera', 'Alta', 'Cisco IOS-XE'),
(1, 5, 2, 'WS-ADMIN-SEC', 'Workstation Amministratore', 'Media', 'Debian 12'),
(1, 8, 9, 'IOT-TEMP-SENS', 'Sensore Temperatura CED', 'Bassa', 'FreeRTOS'),
(1, 10, NULL, 'OS-TEMPLATE-LX', 'Base VM Linux', 'Media', 'RHEL 9'),
(1, 1, NULL, 'SRV-PRINT-01', 'Server Stampa Uffici', 'Bassa', 'Windows 2019');

-- 7. SUPPLY CHAIN: FORNITORI (10 Record)
INSERT INTO tipo_fornitore (nome, descrizione) VALUES ('Cloud', 'IaaS/PaaS'), ('HW', 'Hardware Vendor'), ('SW', 'Software House');

INSERT INTO fornitore (nome, tipo_fornitore_id, contatto_email, indirizzo) VALUES 
('Azure Cloud Italia', 1, 'support@azure.it', 'Milano'),
('Cisco Systems', 2, 'tac@cisco.com', 'Roma'),
('Postgres Ent.', 3, 'licensing@postgres.it', 'Firenze'),
('Dell Tech', 2, 'support@dell.com', 'Bologna'),
('Red Hat Enterprise', 3, 'legal@redhat.com', 'Torino'),
('Oracle Corp', 3, 'info@oracle.it', 'Roma'),
('Fortinet Sec', 2, 'tac@fortinet.com', 'Milano'),
('Amazon AWS', 1, 'aws@amazon.it', 'Milano'),
('VMware Inc', 3, 'support@vmware.it', 'Verona'),
('HP Enterprise', 2, 'hpe@hpe.it', 'Padova');

-- 8. SERVIZI NIS2 (10 RECORD)
INSERT INTO servizio (organizzazione_id, tipo_servizio_id, stato_servizio_id, nome, descrizione) VALUES
(1, 1, 1, 'Anagrafe Online', 'Gestione dati residenti'),
(1, 1, 1, 'PagoPA Gateway', 'Sistema pagamenti'),
(1, 1, 1, 'PEC Istituzionale', 'Posta certificata'),
(1, 1, 1, 'E-Gov Portal', 'Accesso unico cittadino'),
(1, 2, 1, 'Mensa Scolastica', 'Prenotazione pasti'),
(1, 1, 3, 'SUAP Digitale', 'Attività produttive'),
(1, 1, 1, 'SIT Territoriale', 'Geolocalizzazione'),
(1, 2, 1, 'Protocollo Info', 'Gestione documenti'),
(1, 1, 1, 'Auth Centrale', 'Single Sign-On'),
(1, 1, 2, 'Albo Pretorio', 'Pubblicità legale');

-- 9. RELAZIONI E DIPENDENZE (FIX LOGICO)
INSERT INTO tipo_dipendenza (codice, descrizione) VALUES ('HARD', 'Bloccante'), ('SOFT', 'Parziale');
INSERT INTO tipo_dipendenza_servizio (codice, descrizione) VALUES ('INFRA', 'Tecnica'), ('EST', 'Outsourcing');

-- Inserimento diretto rispettando il CHECK constraint (EOR: uno dei due deve essere NOT NULL)
INSERT INTO servizio_dipendenza (servizio_id, tipo_dipendenza_servizio_id, asset_id, fornitore_id, descrizione) VALUES 
(1, 1, 2, NULL, 'Anagrafe dipende da Database PostgreSQL'),
(2, 2, NULL, 1, 'PagoPA dipende da infrastruttura Azure Cloud');

-- Gerarchia Servizi
INSERT INTO servizio_componente (servizio_padre_id, servizio_figlio_id, tipo_dipendenza_id, peso_percentuale, descrizione) VALUES
(4, 1, 1, 70, 'Il Portale richiede i dati dell Anagrafe'),
(4, 9, 1, 30, 'Il Portale richiede l Auth Centrale');

-- 10. LOG, AUDITING E EVENTI
INSERT INTO evento_servizio (servizio_id, stato_servizio_id, descrizione, data_inizio) VALUES 
(1, 2, 'Rilevato tentativo SQL Injection - Intervento SOC', NOW() - INTERVAL '1 day'),
(4, 3, 'Manutenzione programmata sistema Auth', NOW() - INTERVAL '5 hours');

INSERT INTO versioning_asset (asset_id, utente, operazione, descrizione) VALUES 
(1, 'm.bianchi@comune.it', 'UPDATE', 'Configurazione Hardening RDP'),
(2, 'l.neri@comune.it', 'INSERT', 'Inizializzazione database cittadini');
