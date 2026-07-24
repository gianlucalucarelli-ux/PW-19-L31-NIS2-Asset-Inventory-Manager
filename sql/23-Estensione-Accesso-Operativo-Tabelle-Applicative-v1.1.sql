-- =============================================================================
-- 23 - Estensione dell'accesso operativo controllato alle tabelle applicative
-- Versione: 1.1
--
-- Obiettivo:
--   - mantenere l'accesso ordinario in scrittura per sessioni AAL2;
--   - consentire all'utenza di valutazione autorizzata da
--     public.fn_accesso_operativo() di inserire e modificare senza TOTP;
--   - uniformare le policy INSERT e UPDATE sulle 14 tabelle operative;
--   - abilitare la scrittura su asset_componente e fornitore_relazione;
--   - mantenere esclusi anon e DELETE;
--   - preservare RLS, audit e archiviazione logica.
--
-- Prerequisito:
--   - script 22 applicato con public.fn_accesso_operativo().
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Verifica del prerequisito
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF to_regprocedure('public.fn_accesso_operativo()') IS NULL THEN
        RAISE EXCEPTION
            'Prerequisito mancante: public.fn_accesso_operativo() non esiste.';
    END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Privilegi applicativi
--
-- GRANT è idempotente. Non viene concesso DELETE.
-- -----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON TABLE
    public.asset,
    public.asset_componente,
    public.asset_fornitore,
    public.asset_vulnerabilita,
    public.evento_servizio,
    public.evento_tassonomia_acn,
    public.fornitore,
    public.fornitore_relazione,
    public.responsabile,
    public.responsabile_ruolo,
    public.servizio,
    public.servizio_componente,
    public.servizio_dipendenza_asset,
    public.servizio_dipendenza_fornitore
TO authenticated;

REVOKE ALL ON TABLE
    public.asset,
    public.asset_componente,
    public.asset_fornitore,
    public.asset_vulnerabilita,
    public.evento_servizio,
    public.evento_tassonomia_acn,
    public.fornitore,
    public.fornitore_relazione,
    public.responsabile,
    public.responsabile_ruolo,
    public.servizio,
    public.servizio_componente,
    public.servizio_dipendenza_asset,
    public.servizio_dipendenza_fornitore
FROM anon;

-- Concede l'uso delle sole sequenze possedute dalle tabelle operative.
-- Serve per eventuali colonne serial/identity valorizzate automaticamente.
DO $$
DECLARE
    v_sequenza regclass;
BEGIN
    FOR v_sequenza IN
        SELECT DISTINCT seq.oid::regclass
        FROM pg_class AS seq
        JOIN pg_namespace AS ns_seq
            ON ns_seq.oid = seq.relnamespace
        JOIN pg_depend AS dep
            ON dep.objid = seq.oid
           AND dep.classid = 'pg_class'::regclass
           AND dep.refclassid = 'pg_class'::regclass
           AND dep.deptype IN ('a', 'i')
        JOIN pg_class AS tab
            ON tab.oid = dep.refobjid
        JOIN pg_namespace AS ns_tab
            ON ns_tab.oid = tab.relnamespace
        WHERE seq.relkind = 'S'
          AND ns_seq.nspname = 'public'
          AND ns_tab.nspname = 'public'
          AND tab.relname = ANY (ARRAY[
              'asset',
              'asset_componente',
              'asset_fornitore',
              'asset_vulnerabilita',
              'evento_servizio',
              'evento_tassonomia_acn',
              'fornitore',
              'fornitore_relazione',
              'responsabile',
              'responsabile_ruolo',
              'servizio',
              'servizio_componente',
              'servizio_dipendenza_asset',
              'servizio_dipendenza_fornitore'
          ])
    LOOP
        EXECUTE format(
            'GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated',
            v_sequenza
        );
        EXECUTE format(
            'REVOKE ALL ON SEQUENCE %s FROM anon',
            v_sequenza
        );
    END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Uniformazione delle policy di scrittura
--
-- Le policy SELECT esistenti non vengono modificate.
-- Le policy DELETE non vengono create.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_tabella text;
    v_tabelle constant text[] := ARRAY[
        'asset',
        'asset_componente',
        'asset_fornitore',
        'asset_vulnerabilita',
        'evento_servizio',
        'evento_tassonomia_acn',
        'fornitore',
        'fornitore_relazione',
        'responsabile',
        'responsabile_ruolo',
        'servizio',
        'servizio_componente',
        'servizio_dipendenza_asset',
        'servizio_dipendenza_fornitore'
    ];
BEGIN
    FOREACH v_tabella IN ARRAY v_tabelle
    LOOP
        -- Rimuove le policy precedenti, sia MFA sia operative.
        EXECUTE format(
            'DROP POLICY IF EXISTS %I ON public.%I',
            'Insert_MFA_Policy',
            v_tabella
        );

        EXECUTE format(
            'DROP POLICY IF EXISTS %I ON public.%I',
            'Update_MFA_Policy',
            v_tabella
        );

        EXECUTE format(
            'DROP POLICY IF EXISTS %I ON public.%I',
            'Insert_Operativo_Policy',
            v_tabella
        );

        EXECUTE format(
            'DROP POLICY IF EXISTS %I ON public.%I',
            'Update_Operativo_Policy',
            v_tabella
        );

        -- INSERT: autorizzato solo se la funzione operativa restituisce true.
        EXECUTE format(
            'CREATE POLICY %I ON public.%I
             AS PERMISSIVE
             FOR INSERT
             TO authenticated
             WITH CHECK (public.fn_accesso_operativo())',
            'Insert_Operativo_Policy',
            v_tabella
        );

        -- UPDATE: la riga visibile e la nuova versione devono entrambe essere
        -- autorizzate dalla funzione operativa.
        EXECUTE format(
            'CREATE POLICY %I ON public.%I
             AS PERMISSIVE
             FOR UPDATE
             TO authenticated
             USING (public.fn_accesso_operativo())
             WITH CHECK (public.fn_accesso_operativo())',
            'Update_Operativo_Policy',
            v_tabella
        );
    END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Verifiche bloccanti prima del COMMIT
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_numero_tabelle integer;
    v_policy_insert integer;
    v_policy_update integer;
    v_policy_delete integer;
    v_privilegi_anon integer;
    v_privilegi_delete integer;
BEGIN
    SELECT COUNT(DISTINCT p.tablename)
    INTO v_numero_tabelle
    FROM pg_policies AS p
    WHERE p.schemaname = 'public'
      AND p.tablename = ANY (ARRAY[
          'asset',
          'asset_componente',
          'asset_fornitore',
          'asset_vulnerabilita',
          'evento_servizio',
          'evento_tassonomia_acn',
          'fornitore',
          'fornitore_relazione',
          'responsabile',
          'responsabile_ruolo',
          'servizio',
          'servizio_componente',
          'servizio_dipendenza_asset',
          'servizio_dipendenza_fornitore'
      ])
      AND p.policyname IN (
          'Insert_Operativo_Policy',
          'Update_Operativo_Policy'
      );

    IF v_numero_tabelle <> 14 THEN
        RAISE EXCEPTION
            'Verifica fallita: policy operative presenti su % tabelle invece di 14.',
            v_numero_tabelle;
    END IF;

    SELECT COUNT(*)
    INTO v_policy_insert
    FROM pg_policies AS p
    WHERE p.schemaname = 'public'
      AND p.tablename = ANY (ARRAY[
          'asset',
          'asset_componente',
          'asset_fornitore',
          'asset_vulnerabilita',
          'evento_servizio',
          'evento_tassonomia_acn',
          'fornitore',
          'fornitore_relazione',
          'responsabile',
          'responsabile_ruolo',
          'servizio',
          'servizio_componente',
          'servizio_dipendenza_asset',
          'servizio_dipendenza_fornitore'
      ])
      AND p.cmd = 'INSERT'
      AND p.policyname = 'Insert_Operativo_Policy'
      AND p.with_check LIKE '%fn_accesso_operativo%';

    IF v_policy_insert <> 14 THEN
        RAISE EXCEPTION
            'Verifica fallita: policy INSERT operative trovate %, attese 14.',
            v_policy_insert;
    END IF;

    SELECT COUNT(*)
    INTO v_policy_update
    FROM pg_policies AS p
    WHERE p.schemaname = 'public'
      AND p.tablename = ANY (ARRAY[
          'asset',
          'asset_componente',
          'asset_fornitore',
          'asset_vulnerabilita',
          'evento_servizio',
          'evento_tassonomia_acn',
          'fornitore',
          'fornitore_relazione',
          'responsabile',
          'responsabile_ruolo',
          'servizio',
          'servizio_componente',
          'servizio_dipendenza_asset',
          'servizio_dipendenza_fornitore'
      ])
      AND p.cmd = 'UPDATE'
      AND p.policyname = 'Update_Operativo_Policy'
      AND p.qual LIKE '%fn_accesso_operativo%'
      AND p.with_check LIKE '%fn_accesso_operativo%';

    IF v_policy_update <> 14 THEN
        RAISE EXCEPTION
            'Verifica fallita: policy UPDATE operative trovate %, attese 14.',
            v_policy_update;
    END IF;

    SELECT COUNT(*)
    INTO v_policy_delete
    FROM pg_policies AS p
    WHERE p.schemaname = 'public'
      AND p.tablename = ANY (ARRAY[
          'asset',
          'asset_componente',
          'asset_fornitore',
          'asset_vulnerabilita',
          'evento_servizio',
          'evento_tassonomia_acn',
          'fornitore',
          'fornitore_relazione',
          'responsabile',
          'responsabile_ruolo',
          'servizio',
          'servizio_componente',
          'servizio_dipendenza_asset',
          'servizio_dipendenza_fornitore'
      ])
      AND p.cmd = 'DELETE';

    IF v_policy_delete <> 0 THEN
        RAISE EXCEPTION
            'Verifica fallita: rilevate % policy DELETE.',
            v_policy_delete;
    END IF;

    SELECT COUNT(*)
    INTO v_privilegi_anon
    FROM information_schema.role_table_grants AS g
    WHERE g.table_schema = 'public'
      AND g.table_name = ANY (ARRAY[
          'asset',
          'asset_componente',
          'asset_fornitore',
          'asset_vulnerabilita',
          'evento_servizio',
          'evento_tassonomia_acn',
          'fornitore',
          'fornitore_relazione',
          'responsabile',
          'responsabile_ruolo',
          'servizio',
          'servizio_componente',
          'servizio_dipendenza_asset',
          'servizio_dipendenza_fornitore'
      ])
      AND g.grantee = 'anon';

    IF v_privilegi_anon <> 0 THEN
        RAISE EXCEPTION
            'Verifica fallita: rilevati % privilegi anon.',
            v_privilegi_anon;
    END IF;

    SELECT COUNT(*)
    INTO v_privilegi_delete
    FROM information_schema.role_table_grants AS g
    WHERE g.table_schema = 'public'
      AND g.table_name = ANY (ARRAY[
          'asset',
          'asset_componente',
          'asset_fornitore',
          'asset_vulnerabilita',
          'evento_servizio',
          'evento_tassonomia_acn',
          'fornitore',
          'fornitore_relazione',
          'responsabile',
          'responsabile_ruolo',
          'servizio',
          'servizio_componente',
          'servizio_dipendenza_asset',
          'servizio_dipendenza_fornitore'
      ])
      AND g.grantee = 'authenticated'
      AND g.privilege_type = 'DELETE';

    IF v_privilegi_delete <> 0 THEN
        RAISE EXCEPTION
            'Verifica fallita: authenticated possiede % privilegi DELETE.',
            v_privilegi_delete;
    END IF;
END;
$$;

COMMIT;

-- =============================================================================
-- RISULTATI DI VERIFICA
-- =============================================================================

SELECT
    p.tablename,
    p.policyname,
    p.cmd,
    p.roles,
    p.qual AS condizione_using,
    p.with_check AS condizione_with_check
FROM pg_policies AS p
WHERE p.schemaname = 'public'
  AND p.tablename IN (
      'asset',
      'asset_componente',
      'asset_fornitore',
      'asset_vulnerabilita',
      'evento_servizio',
      'evento_tassonomia_acn',
      'fornitore',
      'fornitore_relazione',
      'responsabile',
      'responsabile_ruolo',
      'servizio',
      'servizio_componente',
      'servizio_dipendenza_asset',
      'servizio_dipendenza_fornitore'
  )
  AND p.cmd IN ('INSERT', 'UPDATE', 'DELETE')
ORDER BY p.tablename, p.cmd, p.policyname;

SELECT
    g.table_name,
    g.privilege_type
FROM information_schema.role_table_grants AS g
WHERE g.table_schema = 'public'
  AND g.table_name IN (
      'asset',
      'asset_componente',
      'asset_fornitore',
      'asset_vulnerabilita',
      'evento_servizio',
      'evento_tassonomia_acn',
      'fornitore',
      'fornitore_relazione',
      'responsabile',
      'responsabile_ruolo',
      'servizio',
      'servizio_componente',
      'servizio_dipendenza_asset',
      'servizio_dipendenza_fornitore'
  )
  AND g.grantee IN ('anon', 'authenticated')
ORDER BY g.table_name, g.grantee, g.privilege_type;
