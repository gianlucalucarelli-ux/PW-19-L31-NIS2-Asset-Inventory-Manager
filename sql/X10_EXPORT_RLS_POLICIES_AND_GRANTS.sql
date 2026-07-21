-- =========================================================================
-- FILE: sql/X10_EXPORT_RLS_POLICIES_AND_GRANTS.sql
-- TARGET ARCHITETTURALE: DATABASE POSTGRESQL SU SUPABASE
-- DESCRIZIONE: Esportazione dello stato RLS, delle policy e dei privilegi
--              assegnati ai ruoli anon e authenticated nello schema public
-- TIPO SCRIPT: Diagnostico permanente, sola lettura
-- =========================================================================

/*
    OBIETTIVI

    1. Verificare su quali tabelle sia attiva la Row Level Security.
    2. Esportare tutte le policy attualmente presenti.
    3. Esportare i privilegi assegnati ai ruoli:
       - anon;
       - authenticated.
    4. Individuare eventuali riferimenti residui all'utenza errata:
       docenteunitopegaso@gmail.com.
    5. Verificare la presenza dell'utenza corretta:
       docentepegaso@gmail.com.

    La query restituisce una sola riga per tabella, così Supabase mostra
    l'intero risultato in un unico output.
*/

WITH tabelle_public AS (
    SELECT
        c.oid,
        n.nspname AS schema_name,
        c.relname AS table_name,
        pg_get_userbyid(c.relowner) AS owner_name,
        c.relrowsecurity AS rls_enabled,
        c.relforcerowsecurity AS rls_forced

    FROM pg_class AS c

    INNER JOIN pg_namespace AS n
        ON n.oid = c.relnamespace

    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
),

policy_aggregate AS (
    SELECT
        p.schemaname AS schema_name,
        p.tablename AS table_name,

        jsonb_agg(
            jsonb_build_object(
                'policy_name', p.policyname,
                'permissive', p.permissive,
                'roles', p.roles,
                'command', p.cmd,
                'using_expression', p.qual,
                'with_check_expression', p.with_check
            )
            ORDER BY p.policyname
        ) AS policies

    FROM pg_policies AS p

    WHERE p.schemaname = 'public'

    GROUP BY
        p.schemaname,
        p.tablename
),

grant_aggregate AS (
    SELECT
        g.table_schema AS schema_name,
        g.table_name,

        jsonb_agg(
            jsonb_build_object(
                'grantee', g.grantee,
                'privilege', g.privilege_type,
                'grantable', g.is_grantable
            )
            ORDER BY g.grantee, g.privilege_type
        ) AS grants

    FROM information_schema.role_table_grants AS g

    WHERE g.table_schema = 'public'
      AND g.grantee IN ('anon', 'authenticated')

    GROUP BY
        g.table_schema,
        g.table_name
)

SELECT
    t.schema_name,
    t.table_name,
    t.owner_name,
    t.rls_enabled,
    t.rls_forced,

    COALESCE(
        p.policies,
        '[]'::jsonb
    ) AS policies,

    COALESCE(
        g.grants,
        '[]'::jsonb
    ) AS grants,

    COALESCE(
        p.policies::text ILIKE
            '%docenteunitopegaso@gmail.com%',
        false
    ) AS contains_obsolete_teacher_email,

    COALESCE(
        p.policies::text ILIKE
            '%docentepegaso@gmail.com%',
        false
    ) AS contains_correct_teacher_email

FROM tabelle_public AS t

LEFT JOIN policy_aggregate AS p
    ON p.schema_name = t.schema_name
   AND p.table_name = t.table_name

LEFT JOIN grant_aggregate AS g
    ON g.schema_name = t.schema_name
   AND g.table_name = t.table_name

ORDER BY
    t.table_name;