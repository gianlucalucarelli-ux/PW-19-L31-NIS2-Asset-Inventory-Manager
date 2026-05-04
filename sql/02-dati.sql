-- ===============================================================
-- 02-POPOLAMENTO DATI (VERSIONE 5.0 - DATASET COMPLETO NIS2)
-- ===============================================================

-- 1. RESET TOTALE (Garantisce che l'ordine degli ID riparta da 1)
TRUNCATE organizzazione, categoria_asset, stato_servizio, tipo_servizio, ruolo, 
         responsabile, vulnerabilita, asset, servizio, servizio_componente, 
         versioning_asset RESTART IDENTITY CASCADE;

-- 2. ORGANIZZAZIONE
INSERT INTO organizzazione (nome, descrizione) 
VALUES ('Comune Digitale Alpha', 'Ente pilota per la resilienza infrastrutturale NIS2');

-- 3. CATEGORIE ASSET (Tassonomia ACN v2.0 completa)
INSERT INTO categoria_asset (codice_acn, nome, descrizione) VALUES
('AC:IN_HW-CS_SR', 'Server Fisico', 'Infrastruttura di calcolo on-premise'),
('AC:IN_HW-NW_GT', 'Networking Gateway', 'Router e Gateway di frontiera'),
('AC:IN_SW-DM_DB', 'Database Management', 'Sistemi di gestione basi dati'),
('AC:IN_SW-AP_WS', 'Web Server', 'Server per erogazione servizi web'),
('AC:IN_HW-CS_WS', 'Workstation', 'Postazioni di lavoro critiche'),
('AC:IN_HW-NW_FW', 'Firewall Appliance', 'Sistemi di difesa perimetrale'),
('AC:IN_SW-DM_BK', 'Backup & Recovery', 'Sistemi di salvataggio dati'),
('AC:IN_HW-IT_ID', 'IoT Sensor', 'Sensori monitoraggio ambientale'),
('AC:IN_HW-CS_MB', 'Mobile Device', 'Dispositivi mobili di servizio'),
('AC:IN_SW-OS_LX', 'OS Enterprise', 'Sistemi operativi Linux-based');

-- 4. STATI E TIPI SERVIZIO
INSERT INTO stato_servizio (codice, descrizione) VALUES 
('OPERATIVO', 'Attivo'), ('CRITICO', 'Interrotto'), ('MANUTENZIONE', 'In aggiornamento');
INSERT INTO tipo_servizio (nome) VALUES ('Essenziale'), ('Importante');

-- 5. RESPONSABILI (PoC - Punti di Contatto)
INSERT INTO responsabile (organizzazione_id, nome, email) VALUES
(1, 'Marco Bianchi', 'm.bianchi@comune.it'),
(1, 'Laura Neri', 'l.neri@comune.it'),
(1, 'Stefano Verdi', 's.verdi@comune.it'),
(1, 'Giulia Rossi', 'g.rossi@comune.it'),
(1, 'Roberto Blu', 'r.blu@comune.it');

-- 6. VULNERABILITÀ (Catalogo CVE/Bollettini simulati)
INSERT INTO vulnerabilita (codice_bollettino, descrizione_rischio, livello_severita) VALUES
('CVE-2024-001', 'Buffer Overflow in OpenSSL', 'Alta'),
('CVE-2024-015', 'Privilege Escalation Kernel', 'Alta'),
('CVE-2023-999', 'Weak SSH Configuration', 'Media'),
('CVE-2024-555', 'SQL Injection Portal', 'Alta'),
('ACN-2026-03', 'Outdated Firmware IoT', 'Bassa'),
('CVE-2024-111', 'Zero-day RDP exploit', 'Critica'),
('CVE-2024-222', 'Insecure Backup Protocol', 'Media'),
('CVE-2024-333', 'DDoS Vulnerability', 'Bassa'),
('CVE-2024-444', 'Cross-Site Scripting (XSS)', 'Media'),
('CVE-2024-666', 'Broken Access Control', 'Alta');

-- 7. ASSET (10 record diversificati)
INSERT INTO asset (organizzazione_id, categoria_asset_id, vulnerabilita_id, nome, descrizione, classificazione_criticita, versione) VALUES
(1, 1, 1, 'SRV-DC-01', 'Domain Controller Primario', 'Alta', 'Windows 2022'),
(1, 3, 4, 'DB-CITIZENS-01', 'Database Anagrafe', 'Critica', 'PostgreSQL 15'),
(1, 6, 6, 'FW-BORDER-01', 'Firewall Perimetrale Esterno', 'Critica', 'FortiOS 7.4'),
(1, 4, 10, 'WEB-APP-PORTAL', 'Portale Servizi Cittadino', 'Alta', 'Ubuntu 22.04 / Nginx'),
(1, 7, 7, 'NAS-SAFE-STORE', 'Storage Backup Immutabile', 'Alta', 'TrueNAS Enterprise'),
(1, 2, 3, 'RTR-MAIN-GATE', 'Router di Frontiera', 'Alta', 'Cisco IOS-XE'),
(1, 5, 2, 'WS-ADMIN-SEC', 'Workstation Amministratore', 'Media', 'Debian 12'),
(1, 8, 5, 'IOT-TEMP-SENS', 'Sensore Temperatura CED', 'Bassa', 'FreeRTOS'),
(1, 10, NULL, 'OS-GENERIC-LX', 'Template OS per Virtual Machines', 'Media', 'RHEL 9'),
(1, 1, NULL, 'SRV-PRINT-01', 'Server di Stampa Uffici', 'Bassa', 'Windows 2019');

-- 8. SERVIZI (Esempi di Servizi Essenziali NIS2)
INSERT INTO servizio (organizzazione_id, tipo_servizio_id, stato_servizio_id, nome) VALUES
(1, 1, 1, 'Anagrafe Online'),
(1, 1, 1, 'Sistema Pagamenti PagoPA'),
(1, 1, 2, 'Portale della Trasparenza'),
(1, 2, 1, 'Protocollo Informatico'),
(1, 1, 3, 'Gestione Rifiuti Smart'),
(1, 2, 1, 'SUAP Digitale'),
(1, 1, 1, 'Emergenza Protezione Civile'),
(1, 1, 1, 'Fascicolo Sanitario Locale'),
(1, 2, 1, 'Mensa Scolastica Web'),
(1, 1, 1, 'Posta Elettronica Certificata');
