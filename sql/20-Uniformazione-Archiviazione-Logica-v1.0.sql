-- ============================================================================
-- FILE: sql/20-Uniformazione-Archiviazione-Logica-v1.0.sql
-- TIPO: MIGRAZIONE PRODUTTIVA
-- VERSIONE: 1.0
--
-- PROGETTO:
--   NIS2 Asset Inventory Manager
--
-- SCOPO:
--   1. uniformare l'archiviazione logica delle principali tabelle operative;
--   2. mantenere i modelli temporali gia presenti nelle relazioni storicizzate;
--   3. aggiungere un modello comune alle dieci tabelle che ne sono prive;
--   4. impedire la cancellazione fisica sulle quattordici tabelle operative;
--   5. sostituire i vincoli ON DELETE CASCADE rilevati da X16 con RESTRICT;
--   6. mantenere attivi audit, RLS e privilegi applicativi esistenti.
--
-- PREREQUISITI:
--   - pipeline produttiva eseguita fino allo script 19;
--   - diagnostica X16 versione 1.1 con esito PRONTO_PER_UNIFORMAZIONE.
--
-- MODELLO ADOTTATO:
--   Tabelle senza storicizzazione precedente:
--     - attiva
--     - archiviato_il
--     - archiviato_da
--     - motivo_archiviazione
--
--   Tabelle gia storicizzate:
--     - attiva
--     - valido_dal
--     - valido_al
--
--   In entrambi i casi la cancellazione fisica viene bloccata.
--
-- RISULTATO ATTESO:
--   - numero di tabelle public invariato: 30;
--   - 14 tabelle operative dotate del campo attiva;
--   - 10 tabelle dotate di archiviato_il;
--   - 4 tabelle dotate di valido_al;
--   - 14 trigger di blocco DELETE;
--   - 14 trigger di audit ancora attivi;
--   - nessun vincolo ON DELETE CASCADE nell'ambito operativo analizzato;
--   - nessun privilegio o policy DELETE per anon e authenticated.
-- ============================================================================

BEGIN;


-- ============================================================================
-- 1. AGGIUNTA DEL MODELLO DI ARCHIVIAZIONE ALLE DIECI TABELLE PRIVE DI MARKER
-- ============================================================================

DO $$
DECLARE
    v_tabella text;
BEGIN
    FOREACH v_tabella IN ARRAY ARRAY[
        'organizzazione',
        'responsabile',
        'asset',
        'asset_vulnerabilita',
        'servizio',
        'servizio_dipendenza_asset',
        'servizio_dipendenza_fornitore',
        'fornitore',
        'evento_servizio',
        'evento_tassonomia_acn'
    ]
    LOOP
        IF to_regclass(format('public.%I', v_tabella)) IS NULL THEN
            RAISE EXCEPTION
                'Tabella operativa mancante: %.',
                v_tabella;
        END IF;

        EXECUTE format(
            'ALTER TABLE public.%I
                 ADD COLUMN IF NOT EXISTS attiva boolean NOT NULL DEFAULT true,
                 ADD COLUMN IF NOT EXISTS archiviato_il timestamptz,
                 ADD COLUMN IF NOT EXISTS archiviato_da uuid,
                 ADD COLUMN IF NOT EXISTS motivo_archiviazione text',
            v_tabella
        );

        EXECUTE format(
            'ALTER TABLE public.%I
                 DROP CONSTRAINT IF EXISTS %I',
            v_tabella,
            'check_' || v_tabella || '_archiviazione_logica'
        );

        EXECUTE format(
            'ALTER TABLE public.%I
                 ADD CONSTRAINT %I
                 CHECK (
                     (
                         attiva = true
                         AND archiviato_il IS NULL
                     )
                     OR
                     (
                         attiva = false
                         AND archiviato_il IS NOT NULL
                     )
                 )',
            v_tabella,
            'check_' || v_tabella || '_archiviazione_logica'
        );

        EXECUTE format(
            'CREATE INDEX IF NOT EXISTS %I
             ON public.%I (archiviato_il)
             WHERE attiva = false',
            'idx_' || v_tabella || '_archiviati',
            v_tabella
        );
    END LOOP;
END;
$$;


-- ============================================================================
-- 2. FUNZIONE DI GESTIONE AUTOMATICA DEI METADATI DI ARCHIVIAZIONE
--
-- La funzione:
--   - valorizza data e utente quando attiva passa a false;
--   - conserva la data originaria durante modifiche successive;
--   - azzera i metadati quando il record viene riattivato;
--   - funziona anche per operazioni eseguite senza JWT.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_gestisci_archiviazione_logica()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, auth, pg_temp
AS $$
BEGIN
    IF NEW.attiva = false THEN
        NEW.archiviato_il :=
            coalesce(
                NEW.archiviato_il,
                clock_timestamp()
            );

        NEW.archiviato_da :=
            coalesce(
                NEW.archiviato_da,
                auth.uid()
            );
    ELSE
        NEW.archiviato_il := NULL;
        NEW.archiviato_da := NULL;
        NEW.motivo_archiviazione := NULL;
    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION public.fn_gestisci_archiviazione_logica()
OWNER TO postgres;


REVOKE ALL
ON FUNCTION public.fn_gestisci_archiviazione_logica()
FROM PUBLIC;


REVOKE ALL
ON FUNCTION public.fn_gestisci_archiviazione_logica()
FROM anon;


REVOKE ALL
ON FUNCTION public.fn_gestisci_archiviazione_logica()
FROM authenticated;


-- ============================================================================
-- 3. TRIGGER DI GESTIONE ARCHIVIAZIONE SULLE DIECI TABELLE
-- ============================================================================

DO $$
DECLARE
    v_tabella text;
    v_trigger text;
BEGIN
    FOREACH v_tabella IN ARRAY ARRAY[
        'organizzazione',
        'responsabile',
        'asset',
        'asset_vulnerabilita',
        'servizio',
        'servizio_dipendenza_asset',
        'servizio_dipendenza_fornitore',
        'fornitore',
        'evento_servizio',
        'evento_tassonomia_acn'
    ]
    LOOP
        v_trigger :=
            'trg_archiviazione_' || v_tabella;

        EXECUTE format(
            'DROP TRIGGER IF EXISTS %I ON public.%I',
            v_trigger,
            v_tabella
        );

        EXECUTE format(
            'CREATE TRIGGER %I
             BEFORE INSERT OR UPDATE OF
                 attiva,
                 archiviato_il,
                 archiviato_da,
                 motivo_archiviazione
             ON public.%I
             FOR EACH ROW
             EXECUTE FUNCTION public.fn_gestisci_archiviazione_logica()',
            v_trigger,
            v_tabella
        );
    END LOOP;
END;
$$;


-- ============================================================================
-- 4. FUNZIONE DI BLOCCO DELLA CANCELLAZIONE FISICA
--
-- Il blocco e applicato anche alle operazioni amministrative ordinarie.
-- Eventuali interventi eccezionali di manutenzione richiederanno la rimozione
-- esplicita e documentata del trigger all'interno di una migrazione dedicata.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_blocca_cancellazione_fisica()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    RAISE EXCEPTION
        'Cancellazione fisica bloccata sulla tabella %. Usare l''archiviazione logica.',
        TG_TABLE_NAME
        USING
            ERRCODE = 'P0001',
            HINT = 'Impostare attiva = false e valorizzare, quando disponibile, il motivo di archiviazione.';
END;
$$;


ALTER FUNCTION public.fn_blocca_cancellazione_fisica()
OWNER TO postgres;


REVOKE ALL
ON FUNCTION public.fn_blocca_cancellazione_fisica()
FROM PUBLIC;


REVOKE ALL
ON FUNCTION public.fn_blocca_cancellazione_fisica()
FROM anon;


REVOKE ALL
ON FUNCTION public.fn_blocca_cancellazione_fisica()
FROM authenticated;


-- ============================================================================
-- 5. TRIGGER DI BLOCCO DELETE SULLE QUATTORDICI TABELLE OPERATIVE
-- ============================================================================

DO $$
DECLARE
    v_tabella text;
    v_trigger text;
BEGIN
    FOREACH v_tabella IN ARRAY ARRAY[
        'organizzazione',
        'responsabile',
        'asset',
        'asset_vulnerabilita',
        'servizio',
        'servizio_componente',
        'servizio_dipendenza_asset',
        'servizio_dipendenza_fornitore',
        'fornitore',
        'fornitore_relazione',
        'asset_componente',
        'asset_fornitore',
        'evento_servizio',
        'evento_tassonomia_acn'
    ]
    LOOP
        IF to_regclass(format('public.%I', v_tabella)) IS NULL THEN
            RAISE EXCEPTION
                'Tabella operativa mancante: %.',
                v_tabella;
        END IF;

        v_trigger :=
            'trg_blocca_delete_' || v_tabella;

        EXECUTE format(
            'DROP TRIGGER IF EXISTS %I ON public.%I',
            v_trigger,
            v_tabella
        );

        EXECUTE format(
            'CREATE TRIGGER %I
             BEFORE DELETE
             ON public.%I
             FOR EACH ROW
             EXECUTE FUNCTION public.fn_blocca_cancellazione_fisica()',
            v_trigger,
            v_tabella
        );
    END LOOP;
END;
$$;


-- ============================================================================
-- 6. SOSTITUZIONE DEI NOVE VINCOLI ON DELETE CASCADE CON RESTRICT
--
-- La modifica elimina il rischio residuo di cancellazioni concatenate anche
-- in presenza di operazioni amministrative o migrazioni future.
-- ============================================================================

ALTER TABLE public.asset_vulnerabilita
    DROP CONSTRAINT IF EXISTS
        asset_vulnerabilita_asset_id_fkey;

ALTER TABLE public.asset_vulnerabilita
    ADD CONSTRAINT asset_vulnerabilita_asset_id_fkey
    FOREIGN KEY (asset_id)
    REFERENCES public.asset(id)
    ON DELETE RESTRICT;


ALTER TABLE public.asset_vulnerabilita
    DROP CONSTRAINT IF EXISTS
        asset_vulnerabilita_vulnerabilita_id_fkey;

ALTER TABLE public.asset_vulnerabilita
    ADD CONSTRAINT asset_vulnerabilita_vulnerabilita_id_fkey
    FOREIGN KEY (vulnerabilita_id)
    REFERENCES public.vulnerabilita(id)
    ON DELETE RESTRICT;


ALTER TABLE public.evento_servizio
    DROP CONSTRAINT IF EXISTS
        evento_servizio_servizio_id_fkey;

ALTER TABLE public.evento_servizio
    ADD CONSTRAINT evento_servizio_servizio_id_fkey
    FOREIGN KEY (servizio_id)
    REFERENCES public.servizio(id)
    ON DELETE RESTRICT;


ALTER TABLE public.evento_tassonomia_acn
    DROP CONSTRAINT IF EXISTS
        evento_tassonomia_acn_evento_id_fkey;

ALTER TABLE public.evento_tassonomia_acn
    ADD CONSTRAINT evento_tassonomia_acn_evento_id_fkey
    FOREIGN KEY (evento_id)
    REFERENCES public.evento_servizio(id)
    ON DELETE RESTRICT;


ALTER TABLE public.responsabile_ruolo
    DROP CONSTRAINT IF EXISTS
        responsabile_ruolo_responsabile_id_fkey;

ALTER TABLE public.responsabile_ruolo
    ADD CONSTRAINT responsabile_ruolo_responsabile_id_fkey
    FOREIGN KEY (responsabile_id)
    REFERENCES public.responsabile(id)
    ON DELETE RESTRICT;


ALTER TABLE public.servizio_dipendenza_asset
    DROP CONSTRAINT IF EXISTS
        servizio_dipendenza_asset_asset_id_fkey;

ALTER TABLE public.servizio_dipendenza_asset
    ADD CONSTRAINT servizio_dipendenza_asset_asset_id_fkey
    FOREIGN KEY (asset_id)
    REFERENCES public.asset(id)
    ON DELETE RESTRICT;


ALTER TABLE public.servizio_dipendenza_asset
    DROP CONSTRAINT IF EXISTS
        servizio_dipendenza_asset_servizio_id_fkey;

ALTER TABLE public.servizio_dipendenza_asset
    ADD CONSTRAINT servizio_dipendenza_asset_servizio_id_fkey
    FOREIGN KEY (servizio_id)
    REFERENCES public.servizio(id)
    ON DELETE RESTRICT;


ALTER TABLE public.servizio_dipendenza_fornitore
    DROP CONSTRAINT IF EXISTS
        servizio_dipendenza_fornitore_fornitore_id_fkey;

ALTER TABLE public.servizio_dipendenza_fornitore
    ADD CONSTRAINT servizio_dipendenza_fornitore_fornitore_id_fkey
    FOREIGN KEY (fornitore_id)
    REFERENCES public.fornitore(id)
    ON DELETE RESTRICT;


ALTER TABLE public.servizio_dipendenza_fornitore
    DROP CONSTRAINT IF EXISTS
        servizio_dipendenza_fornitore_servizio_id_fkey;

ALTER TABLE public.servizio_dipendenza_fornitore
    ADD CONSTRAINT servizio_dipendenza_fornitore_servizio_id_fkey
    FOREIGN KEY (servizio_id)
    REFERENCES public.servizio(id)
    ON DELETE RESTRICT;


-- ============================================================================
-- 7. CONFERMA DEL DIVIETO DI DELETE PER I RUOLI APPLICATIVI
-- ============================================================================

DO $$
DECLARE
    v_tabella text;
BEGIN
    FOREACH v_tabella IN ARRAY ARRAY[
        'organizzazione',
        'responsabile',
        'asset',
        'asset_vulnerabilita',
        'servizio',
        'servizio_componente',
        'servizio_dipendenza_asset',
        'servizio_dipendenza_fornitore',
        'fornitore',
        'fornitore_relazione',
        'asset_componente',
        'asset_fornitore',
        'evento_servizio',
        'evento_tassonomia_acn'
    ]
    LOOP
        EXECUTE format(
            'REVOKE DELETE ON TABLE public.%I FROM anon',
            v_tabella
        );

        EXECUTE format(
            'REVOKE DELETE ON TABLE public.%I FROM authenticated',
            v_tabella
        );
    END LOOP;
END;
$$;


-- ============================================================================
-- 8. RIMOZIONE DI EVENTUALI POLICY DELETE RESIDUE
-- ============================================================================

DO $$
DECLARE
    v_policy record;
BEGIN
    FOR v_policy IN
        SELECT
            schemaname,
            tablename,
            policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND cmd = 'DELETE'
          AND tablename IN (
              'organizzazione',
              'responsabile',
              'asset',
              'asset_vulnerabilita',
              'servizio',
              'servizio_componente',
              'servizio_dipendenza_asset',
              'servizio_dipendenza_fornitore',
              'fornitore',
              'fornitore_relazione',
              'asset_componente',
              'asset_fornitore',
              'evento_servizio',
              'evento_tassonomia_acn'
          )
    LOOP
        EXECUTE format(
            'DROP POLICY IF EXISTS %I ON %I.%I',
            v_policy.policyname,
            v_policy.schemaname,
            v_policy.tablename
        );
    END LOOP;
END;
$$;


-- ============================================================================
-- 9. COMMENTI DOCUMENTALI
-- ============================================================================

COMMENT ON FUNCTION public.fn_gestisci_archiviazione_logica() IS
    'Gestisce automaticamente data e utente dell''archiviazione logica sulle tabelle operative prive di validita temporale.';


COMMENT ON FUNCTION public.fn_blocca_cancellazione_fisica() IS
    'Impedisce la cancellazione fisica delle principali entita e relazioni operative.';


-- ============================================================================
-- 10. VERIFICA BLOCCANTE DELLA STRUTTURA
-- ============================================================================

DO $$
DECLARE
    v_numero_tabelle integer;
    v_tabelle_con_attiva integer;
    v_tabelle_con_archiviato_il integer;
    v_tabelle_con_valido_al integer;
    v_trigger_blocco_delete integer;
    v_trigger_audit integer;
    v_trigger_archiviazione integer;
    v_fk_cascade integer;
    v_policy_delete integer;
    v_privilegi_delete integer;
    v_tabelle_senza_rls integer;
    v_asset_id integer;
    v_delete_bloccata boolean := false;
BEGIN
    SELECT count(*)
    INTO v_numero_tabelle
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE';

    SELECT count(DISTINCT table_name)
    INTO v_tabelle_con_attiva
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'attiva'
      AND table_name IN (
          'organizzazione',
          'responsabile',
          'asset',
          'asset_vulnerabilita',
          'servizio',
          'servizio_componente',
          'servizio_dipendenza_asset',
          'servizio_dipendenza_fornitore',
          'fornitore',
          'fornitore_relazione',
          'asset_componente',
          'asset_fornitore',
          'evento_servizio',
          'evento_tassonomia_acn'
      );

    SELECT count(DISTINCT table_name)
    INTO v_tabelle_con_archiviato_il
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'archiviato_il'
      AND table_name IN (
          'organizzazione',
          'responsabile',
          'asset',
          'asset_vulnerabilita',
          'servizio',
          'servizio_dipendenza_asset',
          'servizio_dipendenza_fornitore',
          'fornitore',
          'evento_servizio',
          'evento_tassonomia_acn'
      );

    SELECT count(DISTINCT table_name)
    INTO v_tabelle_con_valido_al
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'valido_al'
      AND table_name IN (
          'servizio_componente',
          'fornitore_relazione',
          'asset_componente',
          'asset_fornitore'
      );

    SELECT count(*)
    INTO v_trigger_blocco_delete
    FROM pg_trigger AS t
    JOIN pg_proc AS p
        ON p.oid = t.tgfoid
    WHERE t.tgisinternal = false
      AND p.proname = 'fn_blocca_cancellazione_fisica';

    SELECT count(*)
    INTO v_trigger_audit
    FROM pg_trigger AS t
    JOIN pg_proc AS p
        ON p.oid = t.tgfoid
    WHERE t.tgisinternal = false
      AND p.proname = 'fn_audit_generico';

    SELECT count(*)
    INTO v_trigger_archiviazione
    FROM pg_trigger AS t
    JOIN pg_proc AS p
        ON p.oid = t.tgfoid
    WHERE t.tgisinternal = false
      AND p.proname = 'fn_gestisci_archiviazione_logica';

    SELECT count(*)
    INTO v_fk_cascade
    FROM pg_constraint AS c
    JOIN pg_class AS origine
        ON origine.oid = c.conrelid
    JOIN pg_namespace AS ns
        ON ns.oid = origine.relnamespace
    JOIN pg_class AS destinazione
        ON destinazione.oid = c.confrelid
    WHERE c.contype = 'f'
      AND c.confdeltype = 'c'
      AND ns.nspname = 'public'
      AND (
          origine.relname IN (
              'organizzazione',
              'responsabile',
              'asset',
              'asset_vulnerabilita',
              'servizio',
              'servizio_componente',
              'servizio_dipendenza_asset',
              'servizio_dipendenza_fornitore',
              'fornitore',
              'fornitore_relazione',
              'asset_componente',
              'asset_fornitore',
              'evento_servizio',
              'evento_tassonomia_acn'
          )
          OR destinazione.relname IN (
              'organizzazione',
              'responsabile',
              'asset',
              'servizio',
              'fornitore',
              'evento_servizio'
          )
      );

    SELECT count(*)
    INTO v_policy_delete
    FROM pg_policies
    WHERE schemaname = 'public'
      AND cmd = 'DELETE'
      AND tablename IN (
          'organizzazione',
          'responsabile',
          'asset',
          'asset_vulnerabilita',
          'servizio',
          'servizio_componente',
          'servizio_dipendenza_asset',
          'servizio_dipendenza_fornitore',
          'fornitore',
          'fornitore_relazione',
          'asset_componente',
          'asset_fornitore',
          'evento_servizio',
          'evento_tassonomia_acn'
      );

    SELECT count(*)
    INTO v_privilegi_delete
    FROM (
        SELECT nome_tabella
        FROM unnest(ARRAY[
            'organizzazione',
            'responsabile',
            'asset',
            'asset_vulnerabilita',
            'servizio',
            'servizio_componente',
            'servizio_dipendenza_asset',
            'servizio_dipendenza_fornitore',
            'fornitore',
            'fornitore_relazione',
            'asset_componente',
            'asset_fornitore',
            'evento_servizio',
            'evento_tassonomia_acn'
        ]) AS elenco(nome_tabella)
        WHERE has_table_privilege(
                  'anon',
                  format('public.%I', nome_tabella),
                  'DELETE'
              )
           OR has_table_privilege(
                  'authenticated',
                  format('public.%I', nome_tabella),
                  'DELETE'
              )
    ) AS privilegi;

    SELECT count(*)
    INTO v_tabelle_senza_rls
    FROM pg_class AS c
    JOIN pg_namespace AS n
        ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname IN (
          'organizzazione',
          'responsabile',
          'asset',
          'asset_vulnerabilita',
          'servizio',
          'servizio_componente',
          'servizio_dipendenza_asset',
          'servizio_dipendenza_fornitore',
          'fornitore',
          'fornitore_relazione',
          'asset_componente',
          'asset_fornitore',
          'evento_servizio',
          'evento_tassonomia_acn'
      )
      AND c.relrowsecurity = false;

    SELECT min(id)
    INTO v_asset_id
    FROM public.asset;

    IF v_asset_id IS NULL THEN
        RAISE EXCEPTION
            'Impossibile verificare il blocco DELETE: nessun asset disponibile.';
    END IF;

    BEGIN
        DELETE FROM public.asset
        WHERE id = v_asset_id;

        RAISE EXCEPTION
            'TEST_DELETE_NON_BLOCCATO';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM = 'TEST_DELETE_NON_BLOCCATO' THEN
                RAISE;
            END IF;

            IF position(
                'Cancellazione fisica bloccata'
                IN SQLERRM
            ) > 0 THEN
                v_delete_bloccata := true;
            ELSE
                RAISE;
            END IF;
    END;

    IF v_numero_tabelle <> 30 THEN
        RAISE EXCEPTION
            'Numero tabelle public inatteso: % invece di 30.',
            v_numero_tabelle;
    END IF;

    IF v_tabelle_con_attiva <> 14 THEN
        RAISE EXCEPTION
            'Tabelle con attiva: % invece di 14.',
            v_tabelle_con_attiva;
    END IF;

    IF v_tabelle_con_archiviato_il <> 10 THEN
        RAISE EXCEPTION
            'Tabelle con archiviato_il: % invece di 10.',
            v_tabelle_con_archiviato_il;
    END IF;

    IF v_tabelle_con_valido_al <> 4 THEN
        RAISE EXCEPTION
            'Tabelle temporali con valido_al: % invece di 4.',
            v_tabelle_con_valido_al;
    END IF;

    IF v_trigger_blocco_delete <> 14 THEN
        RAISE EXCEPTION
            'Trigger di blocco DELETE: % invece di 14.',
            v_trigger_blocco_delete;
    END IF;

    IF v_trigger_audit <> 14 THEN
        RAISE EXCEPTION
            'Trigger di audit: % invece di 14.',
            v_trigger_audit;
    END IF;

    IF v_trigger_archiviazione <> 10 THEN
        RAISE EXCEPTION
            'Trigger di archiviazione: % invece di 10.',
            v_trigger_archiviazione;
    END IF;

    IF v_fk_cascade <> 0 THEN
        RAISE EXCEPTION
            'Restano % vincoli ON DELETE CASCADE nell''ambito operativo.',
            v_fk_cascade;
    END IF;

    IF v_policy_delete <> 0 THEN
        RAISE EXCEPTION
            'Restano % policy DELETE applicative.',
            v_policy_delete;
    END IF;

    IF v_privilegi_delete <> 0 THEN
        RAISE EXCEPTION
            'Restano privilegi DELETE applicativi su % tabelle.',
            v_privilegi_delete;
    END IF;

    IF v_tabelle_senza_rls <> 0 THEN
        RAISE EXCEPTION
            'Sono presenti % tabelle operative senza RLS.',
            v_tabelle_senza_rls;
    END IF;

    IF v_delete_bloccata = false THEN
        RAISE EXCEPTION
            'Il test del blocco DELETE non e stato superato.';
    END IF;
END;
$$;


COMMIT;


-- ============================================================================
-- 11. RISULTATO FINALE
-- ============================================================================

SELECT
    'SCRIPT_20_COMPLETATO' AS esito,

    (
        SELECT count(*)
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
    ) AS numero_tabelle_public,

    (
        SELECT count(DISTINCT table_name)
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_name = 'attiva'
          AND table_name IN (
              'organizzazione',
              'responsabile',
              'asset',
              'asset_vulnerabilita',
              'servizio',
              'servizio_componente',
              'servizio_dipendenza_asset',
              'servizio_dipendenza_fornitore',
              'fornitore',
              'fornitore_relazione',
              'asset_componente',
              'asset_fornitore',
              'evento_servizio',
              'evento_tassonomia_acn'
          )
    ) AS tabelle_con_attiva,

    (
        SELECT count(*)
        FROM pg_trigger AS t
        JOIN pg_proc AS p
            ON p.oid = t.tgfoid
        WHERE t.tgisinternal = false
          AND p.proname = 'fn_blocca_cancellazione_fisica'
    ) AS trigger_blocco_delete,

    (
        SELECT count(*)
        FROM pg_trigger AS t
        JOIN pg_proc AS p
            ON p.oid = t.tgfoid
        WHERE t.tgisinternal = false
          AND p.proname = 'fn_gestisci_archiviazione_logica'
    ) AS trigger_archiviazione,

    (
        SELECT count(*)
        FROM pg_trigger AS t
        JOIN pg_proc AS p
            ON p.oid = t.tgfoid
        WHERE t.tgisinternal = false
          AND p.proname = 'fn_audit_generico'
    ) AS trigger_audit,

    (
        SELECT count(*)
        FROM pg_constraint AS c
        JOIN pg_class AS origine
            ON origine.oid = c.conrelid
        JOIN pg_namespace AS ns
            ON ns.oid = origine.relnamespace
        JOIN pg_class AS destinazione
            ON destinazione.oid = c.confrelid
        WHERE c.contype = 'f'
          AND c.confdeltype = 'c'
          AND ns.nspname = 'public'
          AND (
              origine.relname IN (
                  'organizzazione',
                  'responsabile',
                  'asset',
                  'asset_vulnerabilita',
                  'servizio',
                  'servizio_componente',
                  'servizio_dipendenza_asset',
                  'servizio_dipendenza_fornitore',
                  'fornitore',
                  'fornitore_relazione',
                  'asset_componente',
                  'asset_fornitore',
                  'evento_servizio',
                  'evento_tassonomia_acn'
              )
              OR destinazione.relname IN (
                  'organizzazione',
                  'responsabile',
                  'asset',
                  'servizio',
                  'fornitore',
                  'evento_servizio'
              )
          )
    ) AS vincoli_delete_cascade,

    (
        SELECT count(*)
        FROM pg_policies
        WHERE schemaname = 'public'
          AND cmd = 'DELETE'
          AND tablename IN (
              'organizzazione',
              'responsabile',
              'asset',
              'asset_vulnerabilita',
              'servizio',
              'servizio_componente',
              'servizio_dipendenza_asset',
              'servizio_dipendenza_fornitore',
              'fornitore',
              'fornitore_relazione',
              'asset_componente',
              'asset_fornitore',
              'evento_servizio',
              'evento_tassonomia_acn'
          )
    ) AS policy_delete_applicative,

    (
        SELECT count(*)
        FROM (
            SELECT nome_tabella
            FROM unnest(ARRAY[
                'organizzazione',
                'responsabile',
                'asset',
                'asset_vulnerabilita',
                'servizio',
                'servizio_componente',
                'servizio_dipendenza_asset',
                'servizio_dipendenza_fornitore',
                'fornitore',
                'fornitore_relazione',
                'asset_componente',
                'asset_fornitore',
                'evento_servizio',
                'evento_tassonomia_acn'
            ]) AS elenco(nome_tabella)
            WHERE has_table_privilege(
                      'anon',
                      format('public.%I', nome_tabella),
                      'DELETE'
                  )
               OR has_table_privilege(
                      'authenticated',
                      format('public.%I', nome_tabella),
                      'DELETE'
                  )
        ) AS privilegi
    ) AS tabelle_con_privilegio_delete_applicativo,

    true AS test_blocco_delete_superato;