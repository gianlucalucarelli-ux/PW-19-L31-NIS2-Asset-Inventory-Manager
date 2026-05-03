-- 1. ORGANIZZAZIONE (Verifica se le colonne sono nome/descrizione)
INSERT INTO organizzazione (nome, descrizione) 
VALUES ('Ente Pubblico Esempio', 'Organizzazione pilota per la gestione Asset NIS2');

-- 2. RUOLI DI SICUREZZA
INSERT INTO ruolo (nome, descrizione) VALUES 
('CISO', 'Chief Information Security Officer'),
('Amministratore di Sistema', 'Gestione operativa delle infrastrutture IT'),
('DPO', 'Data Protection Officer');

-- 3. CATEGORIE ASSET (Tassonomia ACN)
INSERT INTO categoria_asset (codice_acn, nome, descrizione) VALUES 
('AC:IN_HW-CS_SR', 'Server Fisico', 'Infrastruttura di calcolo on-premise'),
('AC:IN_HW-NW_FW', 'Firewall', 'Dispositivo di sicurezza perimetrale'),
('AC:IN_SW-APP_DB', 'Database', 'Sistemi di gestione basi di dati');

-- 4. TIPI DI SERVIZIO (Corretto con 'nome' o 'descrizione' in base allo schema)
-- Se tipo_servizio ha 'nome', usa questa riga:
INSERT INTO tipo_servizio (nome) VALUES ('Essenziale'), ('Importante');

-- 5. STATO SERVIZIO (CORRETTO in base al tuo screenshot)
INSERT INTO stato_servizio (codice, descrizione) VALUES 
('OPERATIVO', 'Il servizio è pienamente attivo e funzionante'),
('MANUTENZIONE', 'Il servizio è in fase di manutenzione programmata'),
('CRITICO', 'Il servizio presenta anomalie o interruzioni');

-- 6. ANAGRAFICA RESPONSABILI
INSERT INTO responsabile (organizzazione_id, nome, email, telefono) VALUES 
(1, 'Mario Rossi', 'mario.rossi@ente-esempio.it', '+39 0123456789'),
(1, 'Luca Bianchi', 'luca.bianchi@ente-esempio.it', '+39 0987654321');

-- 7. ASSET DI ESEMPIO
INSERT INTO asset (organizzazione_id, categoria_asset_id, nome, descrizione, criticita, versione) VALUES 
(1, 1, 'DC-PROD-01', 'Domain Controller principale', 'Alta', '1.0'),
(1, 2, 'FW-PERIM-01', 'Firewall Perimetrale Cisco', 'Critica', '2.4.1'),
(1, 3, 'DB-SQL-ERP', 'Database centrale gestione risorse', 'Alta', 'SQL Server 2022');

-- 8. SERVIZI CRITICI
INSERT INTO servizio (organizzazione_id, tipo_servizio_id, stato_servizio_id, nome, descrizione) VALUES 
(1, 1, 1, 'Servizio Anagrafe Digitale', 'Erogazione servizi demografici online'),
(1, 1, 1, 'Infrastruttura Rete Interna', 'Connettività e sicurezza uffici');

-- 9. ASSOCIAZIONE SERVIZIO-COMPONENTE
INSERT INTO servizio_componente (servizio_id, asset_id) VALUES (1, 1), (1, 3), (2, 2);
