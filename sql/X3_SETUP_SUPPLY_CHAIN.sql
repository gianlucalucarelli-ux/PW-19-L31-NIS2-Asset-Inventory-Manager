-- =========================================================================
-- FILE: X3_SETUP_SUPPLY_CHAIN.sql
-- DESCRIZIONE: Popolamento e allineamento tipi servizio post-bonifica duplicati.
-- NOTE: Utilizza LIMIT 1 per garantire l'idempotenza e prevenire errori 21000.
-- =========================================================================

-- Aggiornamento garantito con LIMIT 1
UPDATE servizio
SET tipo_servizio_id = (SELECT id FROM tipo_servizio WHERE nome = 'Infrastruttura' LIMIT 1)
WHERE nome IN ('Gestione Identità (Active Directory)', 'Rete e Connettività Perimetrale');

UPDATE servizio
SET tipo_servizio_id = (SELECT id FROM tipo_servizio WHERE nome = 'Data Storage' LIMIT 1)
WHERE nome = 'Database Cartelle Cliniche (EMR)';

UPDATE servizio
SET tipo_servizio_id = (SELECT id FROM tipo_servizio WHERE nome = 'Core Business' LIMIT 1)
WHERE nome = 'Pronto Soccorso Real-Time';