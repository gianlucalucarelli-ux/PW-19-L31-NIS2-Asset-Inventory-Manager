-- 1. ORGANIZZAZIONE
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

-- 4. TIPI DI SERVIZIO
INSERT INTO tipo_servizio (nome) VALUES ('Essenziale'), ('Importante');

-- 5. STATO SERVIZIO (Allineato a: codice, descrizione)
INSERT INTO stato_servizio (codice, descrizione) VALUES 
('OPERATIVO', 'Il servizio è pienamente attivo e funzionante'),
('MANUTENZIONE', 'Il servizio è in fase di manutenzione programmata'),
('CRITICO', 'Il servizio presenta anomalie o interruzioni');

-- 6. ANAGRAFICA RESPONSABILI (Legame dinamico con Organizzazione)
INSERT INTO responsabile (organizzazione_id, nome, email, telefono) 
SELECT id, 'Mario Rossi', 'mario.rossi@ente-esempio.it', '+39 0123456789'
FROM organizzazione WHERE nome = 'Ente Pubblico Esempio';

-- 7. ASSET DI ESEMPIO (Legame dinamico con Org e Categoria)
INSERT INTO asset (organizzazione_id, categoria_asset_id, nome, descrizione, classificazione_criticita, versione) 
SELECT 
    o.id, 
    c.id, 
    'DC-PROD-01', 
    'Domain Controller principale', 
    'Alta', 
    '1.0'
FROM organizzazione o, categoria_asset c
WHERE o.nome = 'Ente Pubblico Esempio' AND c.nome = 'Server Fisico';

INSERT INTO asset (organizzazione_id, categoria_asset_id, nome, descrizione, classificazione_criticita, versione) 
SELECT 
    o.id, 
    c.id, 
    'FW-PERIM-01', 
    'Firewall Perimetrale Cisco', 
    'Critica', 
    '2.4.1'
FROM organizzazione o, categoria_asset c
WHERE o.nome = 'Ente Pubblico Esempio' AND c.nome = 'Firewall';

-- 8. SERVIZI CRITICI (Legame dinamico con Org, Tipo e Stato)
INSERT INTO servizio (organizzazione_id, tipo_servizio_id, stato_servizio_id, nome, descrizione) 
SELECT 
    o.id, 
    t.id, 
    s.id, 
    'Servizio Anagrafe Digitale', 
    'Erogazione servizi demografici online'
FROM organizzazione o, tipo_servizio t, stato_servizio s
WHERE o.nome = 'Ente Pubblico Esempio' 
AND t.nome = 'Essenziale' 
AND s.codice = 'OPERATIVO';

-- 9. ASSOCIAZIONE SERVIZIO-COMPONENTE
INSERT INTO servizio_componente (servizio_id, asset_id) 
SELECT s.id, a.id 
FROM servizio s, asset a 
WHERE s.nome = 'Servizio Anagrafe Digitale' AND a.nome = 'DC-PROD-01';
