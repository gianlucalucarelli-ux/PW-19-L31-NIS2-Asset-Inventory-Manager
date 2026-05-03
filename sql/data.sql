-- ==============================================================================
-- PROGETTO TESI L31 - POPOLAMENTO DATI DI ESEMPIO (DATASET DI TEST)
-- CONFORMITÀ: NIS2 / TASSONOMIA ACN
-- ==============================================================================

-- 1. ORGANIZZAZIONE
INSERT INTO organizzazione (nome, descrizione) 
VALUES ('Ente Pubblico Esempio', 'Organizzazione pilota per la gestione Asset NIS2');

-- 2. RUOLI DI SICUREZZA
INSERT INTO ruolo (nome, descrizione) VALUES 
('CISO', 'Chief Information Security Officer'),
('Amministratore di Sistema', 'Gestione operativa delle infrastrutture IT'),
('DPO', 'Data Protection Officer');

-- 3. CATEGORIE ASSET (Esempi Tassonomia ACN)
INSERT INTO categoria_asset (codice_acn, nome, descrizione) VALUES 
('AC:IN_HW-CS_SR', 'Server Fisico', 'Infrastruttura di calcolo on-premise'),
('AC:IN_HW-NW_FW', 'Firewall', 'Dispositivo di sicurezza perimetrale'),
('AC:IN_SW-APP_DB', 'Database', 'Sistemi di gestione basi di dati');

-- 4. TIPI DI SERVIZIO E STATI
INSERT INTO tipo_servizio (nome) VALUES ('Essenziale'), ('Importante');
INSERT INTO stato_servizio (nome) VALUES ('Operativo'), ('Manutenzione'), ('Critico');

-- 5. ANAGRAFICA RESPONSABILI
-- Nota: id 1 dell'organizzazione creato sopra
INSERT INTO responsabile (organizzazione_id, nome, email, telefono) VALUES 
(1, 'Mario Rossi', 'mario.rossi@ente-esempio.it', '+39 0123456789'),
(1, 'Luca Bianchi', 'luca.bianchi@ente-esempio.it', '+39 0987654321');

-- 6. ASSET DI ESEMPIO
INSERT INTO asset (organizzazione_id, categoria_asset_id, nome, descrizione, criticita, versione) VALUES 
(1, 1, 'DC-PROD-01', 'Domain Controller principale', 'Alta', '1.0'),
(1, 2, 'FW-PERIM-01', 'Firewall Perimetrale Cisco', 'Critica', '2.4.1'),
(1, 3, 'DB-SQL-ERP', 'Database centrale gestione risorse', 'Alta', 'SQL Server 2022');

-- 7. SERVIZI CRITICI
INSERT INTO servizio (organizzazione_id, tipo_servizio_id, stato_servizio_id, nome, descrizione) VALUES 
(1, 1, 1, 'Servizio Anagrafe Digitale', 'Erogazione servizi demografici online'),
(1, 1, 1, 'Infrastruttura Rete Interna', 'Connettività e sicurezza uffici');

-- 8. ASSOCIAZIONE SERVIZIO-COMPONENTE (Quali asset compongono il servizio)
INSERT INTO servizio_componente (servizio_id, asset_id) VALUES 
(1, 1), -- L'Anagrafe dipende dal Domain Controller
(1, 3), -- L'Anagrafe dipende dal Database ERP
(2, 2); -- L'Infrastruttura dipende dal Firewall
