-- =========================================================================
-- FILE: sql/X7_EXPORT_DATABASE_CONSTRAINTS.sql
-- TARGET ARCHITETTURALE: DATABASE POSTGRESQL IN PRODUZIONE SU SUPABASE
-- DESCRIZIONE: Query diagnostica per esportare chiavi primarie, chiavi
--              esterne, vincoli UNIQUE e vincoli CHECK dello schema public
-- TIPO SCRIPT: Diagnostico, sola lettura, nessuna modifica al database
-- =========================================================================

/*
    SCOPO DELLA QUERY

    La query interroga i cataloghi di sistema PostgreSQL per ottenere
    l'elenco dei vincoli effettivamente presenti sulle tabelle dello
    schema public.

    I risultati saranno utilizzati per:

    1. verificare l'integrità referenziale del database;
    2. confrontare Supabase con gli script SQL e il diagramma ER;
    3. verificare formalmente la Terza Forma Normale (3FN);
    4. aggiornare la documentazione tecnica e il Project Work.

    La query è esclusivamente diagnostica e non modifica il database.
*/

SELECT
    n.nspname AS schema_name,
    c.relname AS table_name,
    con.conname AS constraint_name,

    CASE con.contype
        WHEN 'p' THEN 'PRIMARY KEY'
        WHEN 'f' THEN 'FOREIGN KEY'
        WHEN 'u' THEN 'UNIQUE'
        WHEN 'c' THEN 'CHECK'
        ELSE con.contype::text
    END AS constraint_type,

    pg_get_constraintdef(con.oid, true) AS constraint_definition,

    CASE
        WHEN con.contype = 'f' THEN referenced_namespace.nspname
        ELSE NULL
    END AS referenced_schema,

    CASE
        WHEN con.contype = 'f' THEN referenced_table.relname
        ELSE NULL
    END AS referenced_table

FROM pg_constraint AS con

INNER JOIN pg_class AS c
    ON c.oid = con.conrelid

INNER JOIN pg_namespace AS n
    ON n.oid = c.relnamespace

LEFT JOIN pg_class AS referenced_table
    ON referenced_table.oid = con.confrelid

LEFT JOIN pg_namespace AS referenced_namespace
    ON referenced_namespace.oid = referenced_table.relnamespace

WHERE
    n.nspname = 'public'
    AND c.relkind IN ('r', 'p')
    AND con.contype IN ('p', 'f', 'u', 'c')

ORDER BY
    c.relname,
    constraint_type,
    con.conname;