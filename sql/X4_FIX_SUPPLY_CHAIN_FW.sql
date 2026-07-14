-- =========================================================================
-- FILE: X4_FIX_SUPPLY_CHAIN_FW.sql
-- OBIETTIVO: Forzare la chiusura relazionale sul dato esistente
-- =========================================================================

-- 1. Inseriamo il fornitore specifico
INSERT INTO fornitore (nome, contatto_email, indirizzo)
VALUES ('Palo Alto Networks', 'support-med@paloaltonetworks.com', 'Santa Clara, CA');

-- 2. Chiudiamo la relazione tra il Servizio esistente e il Fornitore
INSERT INTO servizio_dipendenza_fornitore (servizio_id, fornitore_id, descrizione)
SELECT s.id, f.id, 'Fornitura NGFW e supporto H24'
FROM servizio s, fornitore f
WHERE s.nome = 'Pronto Soccorso Real-Time' AND f.nome = 'Palo Alto Networks';