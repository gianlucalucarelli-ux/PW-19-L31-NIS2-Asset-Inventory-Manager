-- =================================================================================
-- FASE 3: ZERO TRUST & ROW LEVEL SECURITY (RLS) - INFRASTRUTTURA COMPLETA
-- Obiettivo: Bloccare tutti gli accessi di default e consentire solo la lettura pubblica.
-- =================================================================================

-- STEP 1: Abilitazione del blocco totale (Zero Trust) su tutte le tabelle
ALTER TABLE asset ENABLE ROW LEVEL SECURITY;
ALTER TABLE categoria_asset ENABLE ROW LEVEL SECURITY;
ALTER TABLE esito_impatto ENABLE ROW LEVEL SECURITY;
ALTER TABLE evento_servizio ENABLE ROW LEVEL SECURITY;
ALTER TABLE fornitore ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizzazione ENABLE ROW LEVEL SECURITY;
ALTER TABLE responsabile ENABLE ROW LEVEL SECURITY;
ALTER TABLE responsabile_ruolo ENABLE ROW LEVEL SECURITY;
ALTER TABLE ruolo ENABLE ROW LEVEL SECURITY;
ALTER TABLE ruolo_organigramma ENABLE ROW LEVEL SECURITY;
ALTER TABLE servizio ENABLE ROW LEVEL SECURITY;
ALTER TABLE servizio_componente ENABLE ROW LEVEL SECURITY;
ALTER TABLE servizio_dipendenza ENABLE ROW LEVEL SECURITY;
ALTER TABLE stato_servizio ENABLE ROW LEVEL SECURITY;
ALTER TABLE tipo_dipendenza ENABLE ROW LEVEL SECURITY;
ALTER TABLE tipo_dipendenza_servizio ENABLE ROW LEVEL SECURITY;
ALTER TABLE tipo_fornitore ENABLE ROW LEVEL SECURITY;
ALTER TABLE tipo_servizio ENABLE ROW LEVEL SECURITY;
ALTER TABLE versioning_asset ENABLE ROW LEVEL SECURITY;
ALTER TABLE vulnerabilita ENABLE ROW LEVEL SECURITY;

-- STEP 2: Pulizia di vecchie policy (Rende lo script idempotente/rieseguibile)
DROP POLICY IF EXISTS "Lettura pubblica asset" ON asset;
DROP POLICY IF EXISTS "Lettura pubblica categoria_asset" ON categoria_asset;
DROP POLICY IF EXISTS "Lettura pubblica esito_impatto" ON esito_impatto;
DROP POLICY IF EXISTS "Lettura pubblica evento_servizio" ON evento_servizio;
DROP POLICY IF EXISTS "Lettura pubblica fornitore" ON fornitore;
DROP POLICY IF EXISTS "Lettura pubblica organizzazione" ON organizzazione;
DROP POLICY IF EXISTS "Lettura pubblica responsabile" ON responsabile;
DROP POLICY IF EXISTS "Lettura pubblica responsabile_ruolo" ON responsabile_ruolo;
DROP POLICY IF EXISTS "Lettura pubblica ruolo" ON ruolo;
DROP POLICY IF EXISTS "Lettura pubblica ruolo_organigramma" ON ruolo_organigramma;
DROP POLICY IF EXISTS "Lettura pubblica servizio" ON servizio;
DROP POLICY IF EXISTS "Lettura pubblica servizio_componente" ON servizio_componente;
DROP POLICY IF EXISTS "Lettura pubblica servizio_dipendenza" ON servizio_dipendenza;
DROP POLICY IF EXISTS "Lettura pubblica stato_servizio" ON stato_servizio;
DROP POLICY IF EXISTS "Lettura pubblica tipo_dipendenza" ON tipo_dipendenza;
DROP POLICY IF EXISTS "Lettura pubblica tipo_dipendenza_servizio" ON tipo_dipendenza_servizio;
DROP POLICY IF EXISTS "Lettura pubblica tipo_fornitore" ON tipo_fornitore;
DROP POLICY IF EXISTS "Lettura pubblica tipo_servizio" ON tipo_servizio;
DROP POLICY IF EXISTS "Lettura pubblica versioning_asset" ON versioning_asset;
DROP POLICY IF EXISTS "Lettura pubblica vulnerabilita" ON vulnerabilita;

-- STEP 3: Creazione delle eccezioni (Policy FOR SELECT)
CREATE POLICY "Lettura pubblica asset" ON asset FOR SELECT USING (true);
CREATE POLICY "Lettura pubblica categoria_asset" ON categoria_asset FOR SELECT USING (true);
CREATE POLICY "Lettura pubblica esito_impatto" ON esito_impatto FOR SELECT USING (true);
CREATE POLICY "Lettura pubblica evento_servizio" ON evento_servizio FOR SELECT USING (true);
CREATE POLICY "Lettura pubblica fornitore" ON fornitore FOR SELECT USING (true);
CREATE POLICY "Lettura pubblica organizzazione" ON organizzazione FOR SELECT USING (true);
CREATE POLICY "Lettura pubblica responsabile" ON responsabile FOR SELECT USING (true);
CREATE POLICY "Lettura pubblica responsabile_ruolo" ON responsabile_ruolo FOR SELECT USING (true);
CREATE POLICY "Lettura pubblica ruolo" ON ruolo FOR SELECT USING (true);
CREATE POLICY "Lettura pubblica ruolo_organigramma" ON ruolo_organigramma FOR SELECT USING (true);
CREATE POLICY "Lettura pubblica servizio" ON servizio FOR SELECT USING (true);
CREATE POLICY "Lettura pubblica servizio_componente" ON servizio_componente FOR SELECT USING (true);
CREATE POLICY "Lettura pubblica servizio_dipendenza" ON servizio_dipendenza FOR SELECT USING (true);
CREATE POLICY "Lettura pubblica stato_servizio" ON stato_servizio FOR SELECT USING (true);
CREATE POLICY "Lettura pubblica tipo_dipendenza" ON tipo_dipendenza FOR SELECT USING (true);
CREATE POLICY "Lettura pubblica tipo_dipendenza_servizio" ON tipo_dipendenza_servizio FOR SELECT USING (true);
CREATE POLICY "Lettura pubblica tipo_fornitore" ON tipo_fornitore FOR SELECT USING (true);
CREATE POLICY "Lettura pubblica tipo_servizio" ON tipo_servizio FOR SELECT USING (true);
CREATE POLICY "Lettura pubblica versioning_asset" ON versioning_asset FOR SELECT USING (true);
CREATE POLICY "Lettura pubblica vulnerabilita" ON vulnerabilita FOR SELECT USING (true);
