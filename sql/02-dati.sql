-- ===============================================================
-- 02-POPOLAMENTO DATI (VERSIONE 3.5 - LOGICA 3NF)
-- ===============================================================

-- 1. PULIZIA DATI (Mantiene lo schema, resetta i contenuti)
TRUNCATE organizzazione, categoria_asset, stato_servizio, tipo_servizio, ruolo, responsabile, vulnerabilita, asset, servizio RESTART IDENTITY CASCADE;

-- 2. INSERIMENTI DI DOMINIO
INSERT INTO organizzazione (nome, descrizione) VALUES ('Ente Pubblico Esempio', 'Organizzazione pilota NIS2');
INSERT INTO stato_servizio (codice, descrizione) VALUES ('OPERATIVO', 'Attivo'), ('CRITICO', 'Down');
INSERT INTO tipo_servizio (nome) VALUES ('Essenziale');
INSERT INTO categoria_asset (codice_acn, nome) VALUES ('AC:IN_HW-CS_SR', 'Server Fisico'), ('AC:IN_HW-NW_FW', 'Firewall');

-- 3. INSERIMENTO VULNERABILITÀ (L'entità che garantisce la 3NF)
INSERT INTO vulnerabilita (codice_bollettino, descrizione_rischio, livello_severita)
VALUES ('BL01/2026', 'Rilevata vulnerabilità critica su gestione memoria (CVE-2024-1234). Patching richiesto.', 'Alta');

-- 4. RESPONSABILE
INSERT INTO responsabile (organizzazione_id, nome, email) 
SELECT id, 'Mario Rossi', 'mario.rossi@ente.it' FROM organizzazione WHERE nome = 'Ente Pubblico Esempio';

-- 5. ASSET (Collegamento tra Categoria, Organizzazione e Vulnerabilità)
INSERT INTO asset (
    organizzazione_id, categoria_asset_id, vulnerabilita_id, nome, descrizione, 
    classificazione_criticita, versione
) 
SELECT 
    o.id, c.id, v.id, 'SRV-DB-CITIZENS', 'Database Anagrafe Centrale', 
    'Alta', 'SQL Server 2022'
FROM organizzazione o, categoria_asset c, vulnerabilita v
WHERE o.nome = 'Ente Pubblico Esempio' 
  AND c.nome = 'Server Fisico' 
  AND v.codice_bollettino = 'BL01/2026';

-- 6. SERVIZIO NIS2
INSERT INTO servizio (organizzazione_id, tipo_servizio_id, stato_servizio_id, nome)
SELECT o.id, t.id, s.id, 'Anagrafe Digitale'
FROM organizzazione o, tipo_servizio t, stato_servizio s
WHERE o.nome = 'Ente Pubblico Esempio' AND t.nome = 'Essenziale' AND s.codice = 'OPERATIVO';
