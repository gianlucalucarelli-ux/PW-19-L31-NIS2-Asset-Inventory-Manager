SELECT 
    table_name AS "Tabella",
    string_agg(column_name || ' (' || data_type || ')', ', ' ORDER BY ordinal_position) AS "Campi (Tipo)"
FROM 
    information_schema.columns
WHERE 
    table_schema = 'public'
GROUP BY 
    table_name
ORDER BY 
    table_name;