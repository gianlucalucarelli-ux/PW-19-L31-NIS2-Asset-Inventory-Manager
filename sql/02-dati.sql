-- ===============================================================
-- 02-POPOLAMENTO DATI (VERSIONE 4.0 - LOGICA 3NF & TASS. ACN)
-- Progetto: NIS2 Asset Inventory Manager
-- ===============================================================

-- 1. PULIZIA DATI (Idempotenza)
-- Utilizziamo TRUNCATE con CASCADE e RESTART IDENTITY per garantire che ogni 
-- esecuzione dello script parta da un database pulito, resettando i contatori degli ID.
TRUNCATE organizzazione, categoria_asset, stato_servizio, tipo_servizio, ruolo, 
         responsabile, vulnerabilita, asset, servizio, servizio_componente, 
         versioning_asset RESTART IDENTITY CASCADE;

-- 2. INSERIMENTI DI DOMINIO (Configurazione base dell'ambiente)
INSERT INTO organizzazione (nome, descrizione) 
VALUES ('Ente Pubblico Esempio', 'Organizzazione pilota per la gestione Asset NIS2');

INSERT INTO stato_servizio (codice, descrizione) 
VALUES ('OPERATIVO', 'Servizio attivo'), ('CRITICO', 'Servizio interrotto/compromesso');

INSERT INTO tipo_servizio (nome) VALUES ('Essenziale'), ('Importante');

-- 3. CATEGORIE ASSET (Mapping Tassonomia Cyber ACN v2.0)
-- Inseriamo le categorie utilizzando i codici predicati ufficiali ACN per l'interoperabilità.
INSERT INTO categoria_asset (codice_acn, nome, descrizione) VALUES
('AC:IN_HW-CS_SR', 'Server Fisico', 'Infrastruttura di calcolo on-premise'),
('AC:IN_HW-NW_GT', 'Dispositivo Networking', 'Router, Switch e Gateway di rete'),
('AC:IN_SW-DM_DB', 'Database Management', 'Sistemi di gestione basi dati'),
('AC:IN_SW-AP_WS', 'Applicativo Web', 'Server web e interfacce utente'),
('AC:IN_HW-CS_WS', 'Workstation', 'Postazioni di lavoro ufficio tecnico'),
('AC:IN_HW-NW_FW', 'Firewall/Security', 'Appliance di sicurezza perimetrale'),
('AC:IN_SW-DM_BK', 'Backup System', 'Sistemi di conservazione dati'),
('AC:IN_HW-IT_ID', 'IoT Device', 'Sensori e dispositivi smart'),
('AC:IN_HW-CS_MB', 'Dispositivo Mobile', 'Smartphone e tablet aziendali'),
('AC:IN_SW-OS_LX', 'Sistema Operativo', 'Distribuzioni Linux enterprise');

-- 4. ANAGRAFICA RESPONSABILI (Punti di Contatto - PoC)
INSERT INTO responsabile (organizzazione_id, nome, email) 
SELECT id, 'Mario Rossi', 'mario.rossi@ente.it' FROM organizzazione WHERE nome = 'Ente Pubblico Esempio';

-- 5. VULNERABILITÀ (Entità per la gestione proattiva del rischio)
-- Inseriamo bollettini di sicurezza realistici per testare la segnalazione nel frontend.
INSERT INTO vulnerabilita (codice_bollettino, descrizione_rischio, livello_severita) VALUES 
('BL-2024-001', 'Vulnerabilità critica nel servizio di autenticazione', 'Alta'),
('BL-2024-018', 'Zero-day exploit su kernel di rete', 'Alta'),
('BL-2026-003', 'Rilevata vulnerabilità su gestione memoria (CVE-2024-1234)', 'Alta'),
('BL-2024-005', 'Necessario aggiornamento firmware protocollo SSL', 'Media'),
('BL-2023-099', 'Configurazione debole cifratura backup', 'Bassa');

-- 6. ASSET (Inventario Hardware e Software)
-- Colleghiamo gli asset alle categorie ACN e, dove necessario, alle vulnerabilità rilevate.
INSERT INTO asset (organizzazione_id, categoria_asset_id, vulnerabilita_id, nome, descrizione, classificazione_criticita, versione) 
SELECT o.id, c.id, v.id, 'SRV-DB-CITIZENS', 'Database Anagrafe Centrale', 'Critica', 'PostgreSQL 15'
FROM organizzazione o, categoria_asset c, vulnerabilita v 
WHERE o.nome = 'Ente Pubblico Esempio' AND c.codice_acn = 'AC:IN_SW-DM_DB' AND v.codice_bollettino = 'BL-2026-003';

INSERT INTO asset (organizzazione_id, categoria_asset_id, vulnerabilita_id, nome, descrizione, classificazione_criticita, versione)
SELECT o.id, c.id, v.id, 'FW-PERIM-01', 'Firewall Perimetrale Core', 'Critica', 'FortiOS 7.2'
FROM organizzazione o, categoria_asset c, vulnerabilita v 
WHERE o.nome = 'Ente Pubblico Esempio' AND c.codice_acn = 'AC:IN_HW-NW_FW' AND v.codice_bollettino = 'BL-2024-018';

-- Asset senza vulnerabilità note (Baseline di sicurezza)
INSERT INTO asset (organizzazione_id, categoria_asset_id, nome, descrizione, classificazione_criticita, versione)
SELECT id, (SELECT id FROM categoria_asset WHERE codice_acn = 'AC:IN_HW-CS_SR'), 'SRV-CORE-01', 'Domain Controller', 'Alta', 'Windows 2022' FROM organizzazione;

INSERT INTO asset (organizzazione_id, categoria_asset_id, nome, descrizione, classificazione_criticita, versione)
SELECT id, (SELECT id FROM categoria_asset WHERE codice_acn = 'AC:IN_HW-NW_GT'), 'SW-DIST-05', 'Switch Distribuzione', 'Media', 'Cisco IOS 17.x' FROM organizzazione;

INSERT INTO asset (organizzazione_id, categoria_asset_id, nome, descrizione, classificazione_criticita, versione)
SELECT id, (SELECT id FROM categoria_asset WHERE codice_acn = 'AC:IN_SW-AP_WS'), 'WEB-PORTAL-01', 'Portale Servizi Online', 'Alta', 'Nginx 1.24' FROM organizzazione;

-- 7. SERVIZI NIS2 (Modellazione Servizi Essenziali)
INSERT INTO servizio (organizzazione_id, tipo_servizio_id, stato_servizio_id, nome)
SELECT o.id, t.id, s.id, 'Anagrafe Digitale'
FROM organizzazione o, tipo_servizio t, stato_servizio s
WHERE o.nome = 'Ente Pubblico Esempio' AND t.nome = 'Essenziale' AND s.codice = 'OPERATIVO';

INSERT INTO servizio (organizzazione_id, tipo_servizio_id, stato_servizio_id, nome)
SELECT o.id, t.id, s.id, 'Gateway Pagamenti'
FROM organizzazione o, tipo_servizio t, stato_servizio s
WHERE o.nome = 'Ente Pubblico Esempio' AND t.nome = 'Essenziale' AND s.codice = 'OPERATIVO';
