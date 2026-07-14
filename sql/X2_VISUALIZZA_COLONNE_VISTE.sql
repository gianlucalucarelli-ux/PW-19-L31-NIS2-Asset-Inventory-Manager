-- Per vedere le colonne della vista ACN
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'vista_esportazione_acn_assets';

-- Per vedere le colonne della vista Servizi Critici
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'vista_reporting_servizi_critici';