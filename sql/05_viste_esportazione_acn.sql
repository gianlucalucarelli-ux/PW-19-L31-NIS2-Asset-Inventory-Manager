-- =========================================================================
-- FILE: sql/05_viste_esportazione_acn.sql
-- DESCRIZIONE: Viste di Reporting e Export (Conformità ACN / NIS2 / 3NF)
-- TARGET ARCHITETTURALE: ER V3.6 (22 Tabelle)
-- SECURITY: security_invoker = true & Zero-Trust Grants
-- =========================================================================

-- Rimozione preventiva delle vecchie viste obsolete
DROP VIEW IF EXISTS public.vista_reporting_servizi_critici CASCADE;
DROP VIEW IF EXISTS public.vista_esportazione_acn_assets CASCADE;

-- -------------------------------------------------------------------------
-- 1. VISTA: Profilo "Involved Assets" (ACN Taxonomy & CVE Aggregation)
-- -------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vista_esportazione_acn_assets 
WITH (security_invoker = true) AS
SELECT 
    a.id AS "Asset_ID",
    a.nome AS "Asset_Name",
    c.codice_acn AS "ACN_Taxonomy_Code",
    c.nome AS "Asset_Category",
    a.versione AS "Software_Version",
    a.classificazione_criticita AS "Criticity_Level",
    COALESCE(v.codice_bollettino, 'NESSUNA') AS "Vulnerability_ID",
    COALESCE(v.livello_severita, 'N/D') AS "Vulnerability_Severity",
    r.nome || ' ' || r.cognome AS "Technical_Owner",
    r.email AS "Owner_Email"
FROM 
    public.asset a
JOIN 
    public.categoria_asset c ON a.categoria_asset_id = c.id
LEFT JOIN 
    public.responsabile r ON a.responsabile_id = r.id
LEFT JOIN 
    public.asset_vulnerabilita av ON a.id = av.asset_id
LEFT JOIN 
    public.vulnerabilita v ON av.vulnerabilita_id = v.id;

-- -------------------------------------------------------------------------
-- 2. VISTA: Mapping Servizi-Dipendenze-Fornitori (Supply Chain 3NF)
-- -------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vista_reporting_servizi_critici 
WITH (security_invoker = true) AS
SELECT 
    s.nome AS "Service_Name",
    ts.nome AS "Service_Type",
    a.nome AS "Dependent_Asset",
    f.nome AS "Vendor_Partner",
    f.contatto_email AS "Vendor_Contact"
FROM 
    public.servizio s
JOIN 
    public.tipo_servizio ts ON s.tipo_servizio_id = ts.id
-- Integrazione delle tabelle di dipendenza sdoppiate in 3NF
LEFT JOIN 
    public.servizio_dipendenza_asset sda ON s.id = sda.servizio_id
LEFT JOIN 
    public.asset a ON sda.asset_id = a.id
LEFT JOIN 
    public.servizio_dipendenza_fornitore sdf ON s.id = sdf.servizio_id
LEFT JOIN 
    public.fornitore f ON sdf.fornitore_id = f.id;

-- -------------------------------------------------------------------------
-- 3. PERMESSI DI ACCESSO (DCL - POLITICA ZERO-TRUST)
-- -------------------------------------------------------------------------
-- Revoca totale di qualsiasi esposizione pubblica (anon)
REVOKE ALL ON TABLE public.vista_esportazione_acn_assets FROM anon;
REVOKE ALL ON TABLE public.vista_reporting_servizi_critici FROM anon;

-- Concessione esclusiva alle utenze autenticate sotto controllo RLS
GRANT SELECT ON TABLE public.vista_esportazione_acn_assets TO authenticated;
GRANT SELECT ON TABLE public.vista_reporting_servizi_critici TO authenticated;