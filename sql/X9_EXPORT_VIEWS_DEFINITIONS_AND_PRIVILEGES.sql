-- =========================================================================
-- FILE: sql/X9_EXPORT_VIEWS_DEFINITIONS_AND_PRIVILEGES.sql
-- TARGET ARCHITETTURALE: DATABASE POSTGRESQL IN PRODUZIONE SU SUPABASE
-- DESCRIZIONE: Esportazione delle definizioni, delle colonne, del
--              proprietario, dei privilegi e della configurazione
--              security_invoker delle viste applicative ACN
-- TIPO SCRIPT: Diagnostico, sola lettura, nessuna modifica al database
-- =========================================================================

/*
    SCOPO DELLA QUERY

    La query verifica lo stato reale delle due viste applicative:

    1. public.vista_esportazione_acn_assets;
    2. public.vista_reporting_servizi_critici.

    Per ciascuna vista vengono estratti:

    - esistenza effettiva nel database;
    - schema e nome;
    - proprietario;
    - opzione security_invoker;
    - definizione SQL completa;
    - colonne esposte e relativi tipi;
    - privilegi assegnati ai ruoli PostgreSQL.

    I risultati saranno utilizzati per confrontare:

    - database Supabase in produzione;
    - script 05_viste_esportazione_acn.sql;
    - frontend JavaScript;
    - README e documentazione tecnica;
    - Project Work.

    La query non modifica il database.
*/

WITH expected_views(view_name) AS (
    VALUES
        ('vista_esportazione_acn_assets'),
        ('vista_reporting_servizi_critici')
)

SELECT
    expected.view_name AS expected_view_name,

    CASE
        WHEN actual.view_oid IS NOT NULL THEN true
        ELSE false
    END AS view_exists,

    actual.schema_name,
    actual.view_name,
    actual.owner_name,
    actual.security_invoker,
    actual.columns_definition,
    actual.privileges_definition,
    actual.view_definition

FROM expected_views AS expected

LEFT JOIN LATERAL (
    SELECT
        c.oid AS view_oid,
        n.nspname AS schema_name,
        c.relname AS view_name,
        owner_role.rolname AS owner_name,

        COALESCE(
            (
                SELECT option_value::boolean
                FROM pg_options_to_table(c.reloptions)
                WHERE option_name = 'security_invoker'
            ),
            false
        ) AS security_invoker,

        COALESCE(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'ordinal_position', cols.ordinal_position,
                        'column_name', cols.column_name,
                        'data_type', cols.data_type,
                        'udt_name', cols.udt_name,
                        'is_nullable', cols.is_nullable
                    )
                    ORDER BY cols.ordinal_position
                )
                FROM information_schema.columns AS cols
                WHERE cols.table_schema = n.nspname
                  AND cols.table_name = c.relname
            ),
            '[]'::jsonb
        ) AS columns_definition,

        COALESCE(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'grantee', grants.grantee,
                        'privilege_type', grants.privilege_type,
                        'is_grantable', grants.is_grantable
                    )
                    ORDER BY grants.grantee, grants.privilege_type
                )
                FROM information_schema.role_table_grants AS grants
                WHERE grants.table_schema = n.nspname
                  AND grants.table_name = c.relname
            ),
            '[]'::jsonb
        ) AS privileges_definition,

        pg_get_viewdef(c.oid, true) AS view_definition

    FROM pg_class AS c

    INNER JOIN pg_namespace AS n
        ON n.oid = c.relnamespace

    INNER JOIN pg_roles AS owner_role
        ON owner_role.oid = c.relowner

    WHERE n.nspname = 'public'
      AND c.relkind = 'v'
      AND c.relname = expected.view_name

    LIMIT 1
) AS actual ON true

ORDER BY expected.view_name;