-- ============================================================================
-- FILE: sql/X17_CHECK_VERIFICA_FINALE_BACKEND.sql
-- TIPO: SCRIPT DIAGNOSTICO PERMANENTE - SOLA LETTURA
-- VERSIONE: 1.1
--
-- PROGETTO:
--   NIS2 Asset Inventory Manager
--
-- SCOPO:
--   Eseguire la verifica finale del backend PostgreSQL/Supabase dopo
--   l'applicazione della pipeline produttiva fino allo script 20.
--
-- CLASSIFICAZIONE:
--   2) Diagnostica permanente da conservare nella cartella /sql.
--
-- AMBITO DELLA VERIFICA:
--   1. struttura generale e numero delle tabelle;
--   2. Row Level Security;
--   3. privilegi di anon e authenticated;
--   4. assenza di policy e privilegi DELETE;
--   5. audit generalizzato;
--   6. archiviazione logica e blocco delle cancellazioni fisiche;
--   7. chiavi esterne, vincoli e indici;
--   8. presenza, sicurezza e accessibilita delle viste;
--   9. coerenza funzionale delle viste principali;
--  10. sicurezza delle funzioni principali;
--  11. coerenza dei dati archiviati;
--  12. riproducibilita logica dello stato finale del database.
--
-- LIMITAZIONE:
--   Lo script verifica gli oggetti e lo stato finale presenti nel database.
--   Non puo verificare direttamente la presenza fisica dei file SQL nel
--   repository GitHub o nella copia locale.
--
-- CORREZIONE VERSIONE 1.1:
--   Le verifiche dei privilegi usano gli OID degli oggetti PostgreSQL anziche
--   nomi testuali qualificati. Questo evita risoluzioni ambigue di relazioni
--   di catalogo, come il tentativo di cercare public.pg_statistic.
--
-- SICUREZZA:
--   Lo script esegue esclusivamente interrogazioni SELECT.
--   Non modifica schema, dati, trigger, policy, privilegi o configurazioni.
--
-- RISULTATO ATTESO:
--   La sezione 16_ESITO_FINALE deve restituire:
--       VERIFICA_FINALE_BACKEND_SUPERATA
-- ============================================================================

WITH

-- ============================================================================
-- 1. ELENCHI DI RIFERIMENTO
-- ============================================================================

tabelle_operative (
    ordine,
    nome_tabella,
    categoria
) AS (
    VALUES
        (1,  'organizzazione',                'ENTITA'),
        (2,  'responsabile',                  'ENTITA'),
        (3,  'asset',                         'ENTITA'),
        (4,  'asset_vulnerabilita',           'RELAZIONE'),
        (5,  'servizio',                      'ENTITA'),
        (6,  'servizio_componente',           'GERARCHIA'),
        (7,  'servizio_dipendenza_asset',     'RELAZIONE'),
        (8,  'servizio_dipendenza_fornitore', 'RELAZIONE'),
        (9,  'fornitore',                     'ENTITA'),
        (10, 'fornitore_relazione',           'GERARCHIA'),
        (11, 'asset_componente',              'GERARCHIA'),
        (12, 'asset_fornitore',               'RELAZIONE'),
        (13, 'evento_servizio',               'ENTITA'),
        (14, 'evento_tassonomia_acn',         'RELAZIONE')
),

tabelle_archiviazione_standard (
    ordine,
    nome_tabella
) AS (
    VALUES
        (1,  'organizzazione'),
        (2,  'responsabile'),
        (3,  'asset'),
        (4,  'asset_vulnerabilita'),
        (5,  'servizio'),
        (6,  'servizio_dipendenza_asset'),
        (7,  'servizio_dipendenza_fornitore'),
        (8,  'fornitore'),
        (9,  'evento_servizio'),
        (10, 'evento_tassonomia_acn')
),

tabelle_temporali (
    ordine,
    nome_tabella
) AS (
    VALUES
        (1, 'servizio_componente'),
        (2, 'fornitore_relazione'),
        (3, 'asset_componente'),
        (4, 'asset_fornitore')
),

viste_attese (
    ordine,
    nome_vista
) AS (
    VALUES
        (1, 'vista_esportazione_acn_assets'),
        (2, 'vista_reporting_servizi_critici'),
        (3, 'vista_gerarchia_servizi_espansa'),
        (4, 'vista_gerarchia_asset_espansa'),
        (5, 'vista_gerarchia_fornitori_espansa'),
        (6, 'vista_supply_chain_multilivello'),
        (7, 'vista_audit_dettagliato')
),

funzioni_attese (
    ordine,
    nome_funzione,
    security_definer_atteso
) AS (
    VALUES
        (1, 'fn_audit_generico',               true),
        (2, 'fn_gestisci_archiviazione_logica', false),
        (3, 'fn_blocca_cancellazione_fisica',   false)
),

-- ============================================================================
-- 2. STRUTTURA DELLE TABELLE
-- ============================================================================

tabelle_public AS (
    SELECT
        c.oid,
        c.relname AS nome_tabella,
        c.relrowsecurity AS rls_attiva,
        c.relforcerowsecurity AS force_rls
    FROM pg_class AS c
    JOIN pg_namespace AS n
        ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
),

stato_tabelle_operative AS (
    SELECT
        t.ordine,
        t.nome_tabella,
        t.categoria,
        p.oid IS NOT NULL AS esistente,
        coalesce(p.rls_attiva, false) AS rls_attiva,
        coalesce(p.force_rls, false) AS force_rls
    FROM tabelle_operative AS t
    LEFT JOIN tabelle_public AS p
        ON p.nome_tabella = t.nome_tabella
),

-- ============================================================================
-- 3. COLONNE DI ARCHIVIAZIONE
-- ============================================================================

colonne_archiviazione_standard AS (
    SELECT
        t.ordine,
        t.nome_tabella,

        count(*) FILTER (
            WHERE c.column_name = 'attiva'
              AND c.data_type = 'boolean'
              AND c.is_nullable = 'NO'
        ) = 1 AS attiva_valida,

        count(*) FILTER (
            WHERE c.column_name = 'archiviato_il'
              AND c.data_type = 'timestamp with time zone'
        ) = 1 AS archiviato_il_valida,

        count(*) FILTER (
            WHERE c.column_name = 'archiviato_da'
              AND c.udt_name = 'uuid'
        ) = 1 AS archiviato_da_valida,

        count(*) FILTER (
            WHERE c.column_name = 'motivo_archiviazione'
              AND c.data_type = 'text'
        ) = 1 AS motivo_archiviazione_valida

    FROM tabelle_archiviazione_standard AS t

    LEFT JOIN information_schema.columns AS c
        ON c.table_schema = 'public'
       AND c.table_name = t.nome_tabella
       AND c.column_name IN (
           'attiva',
           'archiviato_il',
           'archiviato_da',
           'motivo_archiviazione'
       )

    GROUP BY
        t.ordine,
        t.nome_tabella
),

colonne_temporali AS (
    SELECT
        t.ordine,
        t.nome_tabella,

        count(*) FILTER (
            WHERE c.column_name = 'attiva'
              AND c.data_type = 'boolean'
              AND c.is_nullable = 'NO'
        ) = 1 AS attiva_valida,

        count(*) FILTER (
            WHERE c.column_name = 'valido_dal'
              AND c.is_nullable = 'NO'
        ) = 1 AS valido_dal_valida,

        count(*) FILTER (
            WHERE c.column_name = 'valido_al'
        ) = 1 AS valido_al_valida

    FROM tabelle_temporali AS t

    LEFT JOIN information_schema.columns AS c
        ON c.table_schema = 'public'
       AND c.table_name = t.nome_tabella
       AND c.column_name IN (
           'attiva',
           'valido_dal',
           'valido_al'
       )

    GROUP BY
        t.ordine,
        t.nome_tabella
),

-- ============================================================================
-- 4. PRIVILEGI
-- ============================================================================

privilegi_anon AS (
    SELECT
        c.relname AS oggetto,
        CASE c.relkind
            WHEN 'r' THEN 'TABELLA'
            WHEN 'v' THEN 'VISTA'
            WHEN 'm' THEN 'VISTA_MATERIALIZZATA'
            ELSE c.relkind::text
        END AS tipo_oggetto,
        p.privilegio
    FROM pg_class AS c
    JOIN pg_namespace AS n
        ON n.oid = c.relnamespace
    CROSS JOIN (
        VALUES
            ('SELECT'),
            ('INSERT'),
            ('UPDATE'),
            ('DELETE'),
            ('TRUNCATE'),
            ('REFERENCES'),
            ('TRIGGER')
    ) AS p(privilegio)
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'v', 'm')
      AND has_table_privilege(
              'anon',
              c.oid,
              p.privilegio
          )
),

privilegi_delete_authenticated AS (
    SELECT
        c.relname AS nome_tabella
    FROM pg_class AS c
    JOIN pg_namespace AS n
        ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND has_table_privilege(
              'authenticated',
              c.oid,
              'DELETE'
          )
),

privilegi_audit_log AS (
    SELECT
        has_table_privilege(
            'authenticated',
            'public.audit_log',
            'SELECT'
        ) AS authenticated_select,

        has_table_privilege(
            'authenticated',
            'public.audit_log',
            'INSERT'
        ) AS authenticated_insert,

        has_table_privilege(
            'authenticated',
            'public.audit_log',
            'UPDATE'
        ) AS authenticated_update,

        has_table_privilege(
            'authenticated',
            'public.audit_log',
            'DELETE'
        ) AS authenticated_delete,

        has_table_privilege(
            'anon',
            'public.audit_log',
            'SELECT'
        ) AS anon_select
),

-- ============================================================================
-- 5. POLICY RLS
-- ============================================================================

policy_delete AS (
    SELECT
        schemaname,
        tablename,
        policyname,
        roles
    FROM pg_policies
    WHERE schemaname = 'public'
      AND cmd = 'DELETE'
),

policy_per_comando AS (
    SELECT
        cmd,
        count(*) AS numero_policy
    FROM pg_policies
    WHERE schemaname = 'public'
    GROUP BY cmd
),

-- ============================================================================
-- 6. TRIGGER PRINCIPALI
-- ============================================================================

trigger_principali AS (
    SELECT
        tabella.relname AS nome_tabella,
        trigger.tgname AS nome_trigger,
        funzione.proname AS nome_funzione,
        trigger.tgenabled AS stato_trigger,
        pg_get_triggerdef(trigger.oid, true) AS definizione
    FROM pg_trigger AS trigger
    JOIN pg_class AS tabella
        ON tabella.oid = trigger.tgrelid
    JOIN pg_namespace AS n
        ON n.oid = tabella.relnamespace
    JOIN pg_proc AS funzione
        ON funzione.oid = trigger.tgfoid
    WHERE trigger.tgisinternal = false
      AND n.nspname = 'public'
      AND funzione.proname IN (
          'fn_audit_generico',
          'fn_gestisci_archiviazione_logica',
          'fn_blocca_cancellazione_fisica'
      )
),

copertura_trigger AS (
    SELECT
        t.ordine,
        t.nome_tabella,

        count(*) FILTER (
            WHERE p.nome_funzione = 'fn_audit_generico'
              AND p.stato_trigger <> 'D'
        ) AS trigger_audit_attivi,

        count(*) FILTER (
            WHERE p.nome_funzione = 'fn_blocca_cancellazione_fisica'
              AND p.stato_trigger <> 'D'
        ) AS trigger_blocco_delete_attivi,

        count(*) FILTER (
            WHERE p.nome_funzione = 'fn_gestisci_archiviazione_logica'
              AND p.stato_trigger <> 'D'
        ) AS trigger_archiviazione_attivi

    FROM tabelle_operative AS t

    LEFT JOIN trigger_principali AS p
        ON p.nome_tabella = t.nome_tabella

    GROUP BY
        t.ordine,
        t.nome_tabella
),

-- ============================================================================
-- 7. CHIAVI ESTERNE, VINCOLI E INDICI
-- ============================================================================

chiavi_esterne_cascade AS (
    SELECT
        origine.relname AS tabella_origine,
        vincolo.conname AS nome_vincolo,
        destinazione.relname AS tabella_destinazione,
        pg_get_constraintdef(vincolo.oid, true) AS definizione
    FROM pg_constraint AS vincolo
    JOIN pg_class AS origine
        ON origine.oid = vincolo.conrelid
    JOIN pg_namespace AS n_origine
        ON n_origine.oid = origine.relnamespace
    JOIN pg_class AS destinazione
        ON destinazione.oid = vincolo.confrelid
    JOIN pg_namespace AS n_destinazione
        ON n_destinazione.oid = destinazione.relnamespace
    WHERE vincolo.contype = 'f'
      AND vincolo.confdeltype = 'c'
      AND n_origine.nspname = 'public'
      AND n_destinazione.nspname = 'public'
),

vincoli_non_validati AS (
    SELECT
        tabella.relname AS nome_tabella,
        vincolo.conname AS nome_vincolo,
        vincolo.contype AS tipo_vincolo
    FROM pg_constraint AS vincolo
    JOIN pg_class AS tabella
        ON tabella.oid = vincolo.conrelid
    JOIN pg_namespace AS n
        ON n.oid = tabella.relnamespace
    WHERE n.nspname = 'public'
      AND vincolo.convalidated = false
),

indici_non_validi AS (
    SELECT
        tabella.relname AS nome_tabella,
        indice.relname AS nome_indice,
        stato.indisvalid,
        stato.indisready
    FROM pg_index AS stato
    JOIN pg_class AS indice
        ON indice.oid = stato.indexrelid
    JOIN pg_class AS tabella
        ON tabella.oid = stato.indrelid
    JOIN pg_namespace AS n
        ON n.oid = tabella.relnamespace
    WHERE n.nspname = 'public'
      AND (
          stato.indisvalid = false
          OR stato.indisready = false
      )
),

-- ============================================================================
-- 8. VISTE ATTESE
-- ============================================================================

stato_viste AS (
    SELECT
        v.ordine,
        v.nome_vista,
        c.oid IS NOT NULL AS esistente,

        CASE
            WHEN c.oid IS NULL THEN false
            ELSE coalesce(
                c.reloptions,
                ARRAY[]::text[]
            ) @> ARRAY['security_invoker=true']
        END AS security_invoker,

        CASE
            WHEN c.oid IS NULL THEN false
            ELSE has_table_privilege(
                'authenticated',
                c.oid,
                'SELECT'
            )
        END AS authenticated_select,

        CASE
            WHEN c.oid IS NULL THEN false
            ELSE has_table_privilege(
                'anon',
                c.oid,
                'SELECT'
            )
        END AS anon_select

    FROM viste_attese AS v

    LEFT JOIN pg_namespace AS n
        ON n.nspname = 'public'

    LEFT JOIN pg_class AS c
        ON c.relnamespace = n.oid
       AND c.relname = v.nome_vista
       AND c.relkind = 'v'
),

-- ============================================================================
-- 9. FUNZIONI ATTESE
-- ============================================================================

stato_funzioni AS (
    SELECT
        f.ordine,
        f.nome_funzione,
        f.security_definer_atteso,

        count(p.oid) AS numero_definizioni,

        bool_or(
            coalesce(
                p.prosecdef,
                false
            ) = f.security_definer_atteso
        ) AS security_definer_coerente,

        bool_or(
            CASE
                WHEN f.security_definer_atteso = false
                    THEN true
                ELSE EXISTS (
                    SELECT 1
                    FROM unnest(
                        coalesce(
                            p.proconfig,
                            ARRAY[]::text[]
                        )
                    ) AS configurazione(voce)
                    WHERE configurazione.voce
                          LIKE 'search_path=%'
                )
            END
        ) AS search_path_coerente

    FROM funzioni_attese AS f

    LEFT JOIN pg_namespace AS n
        ON n.nspname = 'public'

    LEFT JOIN pg_proc AS p
        ON p.pronamespace = n.oid
       AND p.proname = f.nome_funzione
       AND p.prokind = 'f'

    GROUP BY
        f.ordine,
        f.nome_funzione,
        f.security_definer_atteso
),

-- ============================================================================
-- 10. COERENZA DEI DATI ARCHIVIATI
-- ============================================================================

anomalie_archiviazione_standard AS (
    SELECT
        'organizzazione' AS nome_tabella,
        count(*) AS anomalie
    FROM public.organizzazione
    WHERE (
              attiva = true
              AND archiviato_il IS NOT NULL
          )
       OR (
              attiva = false
              AND archiviato_il IS NULL
          )

    UNION ALL

    SELECT
        'responsabile',
        count(*)
    FROM public.responsabile
    WHERE (
              attiva = true
              AND archiviato_il IS NOT NULL
          )
       OR (
              attiva = false
              AND archiviato_il IS NULL
          )

    UNION ALL

    SELECT
        'asset',
        count(*)
    FROM public.asset
    WHERE (
              attiva = true
              AND archiviato_il IS NOT NULL
          )
       OR (
              attiva = false
              AND archiviato_il IS NULL
          )

    UNION ALL

    SELECT
        'asset_vulnerabilita',
        count(*)
    FROM public.asset_vulnerabilita
    WHERE (
              attiva = true
              AND archiviato_il IS NOT NULL
          )
       OR (
              attiva = false
              AND archiviato_il IS NULL
          )

    UNION ALL

    SELECT
        'servizio',
        count(*)
    FROM public.servizio
    WHERE (
              attiva = true
              AND archiviato_il IS NOT NULL
          )
       OR (
              attiva = false
              AND archiviato_il IS NULL
          )

    UNION ALL

    SELECT
        'servizio_dipendenza_asset',
        count(*)
    FROM public.servizio_dipendenza_asset
    WHERE (
              attiva = true
              AND archiviato_il IS NOT NULL
          )
       OR (
              attiva = false
              AND archiviato_il IS NULL
          )

    UNION ALL

    SELECT
        'servizio_dipendenza_fornitore',
        count(*)
    FROM public.servizio_dipendenza_fornitore
    WHERE (
              attiva = true
              AND archiviato_il IS NOT NULL
          )
       OR (
              attiva = false
              AND archiviato_il IS NULL
          )

    UNION ALL

    SELECT
        'fornitore',
        count(*)
    FROM public.fornitore
    WHERE (
              attiva = true
              AND archiviato_il IS NOT NULL
          )
       OR (
              attiva = false
              AND archiviato_il IS NULL
          )

    UNION ALL

    SELECT
        'evento_servizio',
        count(*)
    FROM public.evento_servizio
    WHERE (
              attiva = true
              AND archiviato_il IS NOT NULL
          )
       OR (
              attiva = false
              AND archiviato_il IS NULL
          )

    UNION ALL

    SELECT
        'evento_tassonomia_acn',
        count(*)
    FROM public.evento_tassonomia_acn
    WHERE (
              attiva = true
              AND archiviato_il IS NOT NULL
          )
       OR (
              attiva = false
              AND archiviato_il IS NULL
          )
),

anomalie_tabelle_temporali AS (
    SELECT
        'servizio_componente' AS nome_tabella,
        count(*) AS anomalie
    FROM public.servizio_componente
    WHERE (
              attiva = true
              AND valido_al IS NOT NULL
          )
       OR (
              attiva = false
              AND valido_al IS NULL
          )
       OR (
              valido_al IS NOT NULL
              AND valido_al < valido_dal
          )

    UNION ALL

    SELECT
        'fornitore_relazione',
        count(*)
    FROM public.fornitore_relazione
    WHERE (
              attiva = true
              AND valido_al IS NOT NULL
          )
       OR (
              attiva = false
              AND valido_al IS NULL
          )
       OR (
              valido_al IS NOT NULL
              AND valido_al < valido_dal
          )

    UNION ALL

    SELECT
        'asset_componente',
        count(*)
    FROM public.asset_componente
    WHERE (
              attiva = true
              AND valido_al IS NOT NULL
          )
       OR (
              attiva = false
              AND valido_al IS NULL
          )
       OR (
              valido_al IS NOT NULL
              AND valido_al < valido_dal
          )

    UNION ALL

    SELECT
        'asset_fornitore',
        count(*)
    FROM public.asset_fornitore
    WHERE (
              attiva = true
              AND valido_al IS NOT NULL
          )
       OR (
              attiva = false
              AND valido_al IS NULL
          )
       OR (
              valido_al IS NOT NULL
              AND valido_al < valido_dal
          )
),

-- ============================================================================
-- 11. COERENZA FUNZIONALE DELLE VISTE PRINCIPALI
-- ============================================================================

coerenza_viste AS (
    SELECT
        (
            SELECT count(*)
            FROM public.vista_reporting_servizi_critici
        ) AS righe_reporting,

        (
            SELECT count(DISTINCT servizio_id)
            FROM public.vista_reporting_servizi_critici
        ) AS servizi_distinti_reporting,

        (
            SELECT count(*)
            FROM public.audit_log
        ) AS righe_audit_log,

        (
            SELECT count(*)
            FROM public.vista_audit_dettagliato
        ) AS righe_vista_audit,

        (
            SELECT count(*)
            FROM public.vista_supply_chain_multilivello
        ) AS righe_supply_chain
),

-- ============================================================================
-- 12. RIEPILOGO TECNICO
-- ============================================================================

riepilogo AS (
    SELECT
        (SELECT count(*) FROM tabelle_public)
            AS numero_tabelle_public,

        (
            SELECT count(*)
            FROM tabelle_public
            WHERE rls_attiva = false
        ) AS tabelle_public_senza_rls,

        (
            SELECT count(*)
            FROM stato_tabelle_operative
            WHERE esistente = false
        ) AS tabelle_operative_mancanti,

        (
            SELECT count(*)
            FROM stato_tabelle_operative
            WHERE rls_attiva = false
        ) AS tabelle_operative_senza_rls,

        (SELECT count(*) FROM privilegi_anon)
            AS privilegi_anon,

        (SELECT count(*) FROM privilegi_delete_authenticated)
            AS privilegi_delete_authenticated,

        (SELECT count(*) FROM policy_delete)
            AS policy_delete,

        (
            SELECT count(*)
            FROM trigger_principali
            WHERE nome_funzione = 'fn_audit_generico'
              AND stato_trigger <> 'D'
        ) AS trigger_audit_attivi,

        (
            SELECT count(*)
            FROM trigger_principali
            WHERE nome_funzione = 'fn_blocca_cancellazione_fisica'
              AND stato_trigger <> 'D'
        ) AS trigger_blocco_delete_attivi,

        (
            SELECT count(*)
            FROM trigger_principali
            WHERE nome_funzione = 'fn_gestisci_archiviazione_logica'
              AND stato_trigger <> 'D'
        ) AS trigger_archiviazione_attivi,

        (SELECT count(*) FROM chiavi_esterne_cascade)
            AS chiavi_esterne_cascade,

        (SELECT count(*) FROM vincoli_non_validati)
            AS vincoli_non_validati,

        (SELECT count(*) FROM indici_non_validi)
            AS indici_non_validi,

        (
            SELECT count(*)
            FROM stato_viste
            WHERE esistente = false
        ) AS viste_mancanti,

        (
            SELECT count(*)
            FROM stato_viste
            WHERE esistente = true
              AND security_invoker = false
        ) AS viste_senza_security_invoker,

        (
            SELECT count(*)
            FROM stato_viste
            WHERE esistente = true
              AND authenticated_select = false
        ) AS viste_senza_select_authenticated,

        (
            SELECT count(*)
            FROM stato_viste
            WHERE anon_select = true
        ) AS viste_con_select_anon,

        (
            SELECT count(*)
            FROM stato_funzioni
            WHERE numero_definizioni <> 1
               OR security_definer_coerente = false
               OR search_path_coerente = false
        ) AS funzioni_non_coerenti,

        (
            SELECT count(*)
            FROM colonne_archiviazione_standard
            WHERE attiva_valida = false
               OR archiviato_il_valida = false
               OR archiviato_da_valida = false
               OR motivo_archiviazione_valida = false
        ) AS tabelle_archiviazione_standard_non_coerenti,

        (
            SELECT count(*)
            FROM colonne_temporali
            WHERE attiva_valida = false
               OR valido_dal_valida = false
               OR valido_al_valida = false
        ) AS tabelle_temporali_non_coerenti,

        (
            SELECT coalesce(sum(anomalie), 0)
            FROM anomalie_archiviazione_standard
        ) AS anomalie_dati_archiviazione_standard,

        (
            SELECT coalesce(sum(anomalie), 0)
            FROM anomalie_tabelle_temporali
        ) AS anomalie_dati_temporali,

        (
            SELECT
                righe_reporting
                - servizi_distinti_reporting
            FROM coerenza_viste
        ) AS duplicati_reporting,

        (
            SELECT
                abs(
                    righe_audit_log
                    - righe_vista_audit
                )
            FROM coerenza_viste
        ) AS differenza_righe_audit,

        (
            SELECT authenticated_select
            FROM privilegi_audit_log
        ) AS audit_authenticated_select,

        (
            SELECT authenticated_insert
            FROM privilegi_audit_log
        ) AS audit_authenticated_insert,

        (
            SELECT authenticated_update
            FROM privilegi_audit_log
        ) AS audit_authenticated_update,

        (
            SELECT authenticated_delete
            FROM privilegi_audit_log
        ) AS audit_authenticated_delete,

        (
            SELECT anon_select
            FROM privilegi_audit_log
        ) AS audit_anon_select
),

-- ============================================================================
-- 13. RISULTATO CONSOLIDATO
-- ============================================================================

risultato AS (

    -- ------------------------------------------------------------------------
    -- 01. Struttura generale
    -- ------------------------------------------------------------------------

    SELECT
        1 AS ordine,
        '01_STRUTTURA_GENERALE' AS sezione,

        CASE
            WHEN r.numero_tabelle_public = 30
             AND r.tabelle_operative_mancanti = 0
            THEN 'OK'
            ELSE 'DA_CORREGGERE'
        END AS esito,

        jsonb_build_object(
            'numero_tabelle_public',
            r.numero_tabelle_public,

            'numero_tabelle_atteso',
            30,

            'tabelle_operative_attese',
            14,

            'tabelle_operative_mancanti',
            r.tabelle_operative_mancanti,

            'dettaglio_mancanti',
            coalesce(
                (
                    SELECT jsonb_agg(
                        nome_tabella
                        ORDER BY ordine
                    )
                    FROM stato_tabelle_operative
                    WHERE esistente = false
                ),
                '[]'::jsonb
            )
        ) AS dettaglio

    FROM riepilogo AS r

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 02. RLS su tutte le tabelle public
    -- ------------------------------------------------------------------------

    SELECT
        2,
        '02_RLS_TABELLE_PUBLIC',

        CASE
            WHEN r.tabelle_public_senza_rls = 0
            THEN 'OK'
            ELSE 'DA_CORREGGERE'
        END,

        jsonb_build_object(
            'tabelle_public_senza_rls',
            r.tabelle_public_senza_rls,

            'dettaglio',
            coalesce(
                (
                    SELECT jsonb_agg(
                        nome_tabella
                        ORDER BY nome_tabella
                    )
                    FROM tabelle_public
                    WHERE rls_attiva = false
                ),
                '[]'::jsonb
            )
        )

    FROM riepilogo AS r

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 03. RLS sulle tabelle operative
    -- ------------------------------------------------------------------------

    SELECT
        3,
        '03_RLS_TABELLE_OPERATIVE',

        CASE
            WHEN r.tabelle_operative_senza_rls = 0
             AND r.tabelle_operative_mancanti = 0
            THEN 'OK'
            ELSE 'DA_CORREGGERE'
        END,

        jsonb_build_object(
            'tabelle_operative_senza_rls',
            r.tabelle_operative_senza_rls,

            'dettaglio',
            coalesce(
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'tabella',
                            nome_tabella,

                            'categoria',
                            categoria,

                            'esistente',
                            esistente,

                            'rls_attiva',
                            rls_attiva,

                            'force_rls',
                            force_rls
                        )
                        ORDER BY ordine
                    )
                    FROM stato_tabelle_operative
                ),
                '[]'::jsonb
            )
        )

    FROM riepilogo AS r

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 04. Privilegi anon
    -- ------------------------------------------------------------------------

    SELECT
        4,
        '04_PRIVILEGI_ANON',

        CASE
            WHEN r.privilegi_anon = 0
            THEN 'OK'
            ELSE 'DA_CORREGGERE'
        END,

        jsonb_build_object(
            'privilegi_anon_rilevati',
            r.privilegi_anon,

            'dettaglio',
            coalesce(
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'oggetto',
                            oggetto,

                            'tipo',
                            tipo_oggetto,

                            'privilegio',
                            privilegio
                        )
                        ORDER BY
                            tipo_oggetto,
                            oggetto,
                            privilegio
                    )
                    FROM privilegi_anon
                ),
                '[]'::jsonb
            )
        )

    FROM riepilogo AS r

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 05. Protezione DELETE
    -- ------------------------------------------------------------------------

    SELECT
        5,
        '05_PROTEZIONE_DELETE',

        CASE
            WHEN r.privilegi_delete_authenticated = 0
             AND r.policy_delete = 0
             AND r.trigger_blocco_delete_attivi = 14
             AND r.chiavi_esterne_cascade = 0
            THEN 'OK'
            ELSE 'DA_CORREGGERE'
        END,

        jsonb_build_object(
            'privilegi_delete_authenticated',
            r.privilegi_delete_authenticated,

            'policy_delete',
            r.policy_delete,

            'trigger_blocco_delete_attivi',
            r.trigger_blocco_delete_attivi,

            'trigger_blocco_delete_attesi',
            14,

            'chiavi_esterne_on_delete_cascade',
            r.chiavi_esterne_cascade,

            'tabelle_con_delete_authenticated',
            coalesce(
                (
                    SELECT jsonb_agg(
                        nome_tabella
                        ORDER BY nome_tabella
                    )
                    FROM privilegi_delete_authenticated
                ),
                '[]'::jsonb
            ),

            'policy_delete_rilevate',
            coalesce(
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'tabella',
                            tablename,

                            'policy',
                            policyname,

                            'ruoli',
                            roles
                        )
                        ORDER BY
                            tablename,
                            policyname
                    )
                    FROM policy_delete
                ),
                '[]'::jsonb
            ),

            'vincoli_cascade',
            coalesce(
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'tabella_origine',
                            tabella_origine,

                            'vincolo',
                            nome_vincolo,

                            'tabella_destinazione',
                            tabella_destinazione,

                            'definizione',
                            definizione
                        )
                        ORDER BY
                            tabella_origine,
                            nome_vincolo
                    )
                    FROM chiavi_esterne_cascade
                ),
                '[]'::jsonb
            )
        )

    FROM riepilogo AS r

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 06. Copertura audit
    -- ------------------------------------------------------------------------

    SELECT
        6,
        '06_COPERTURA_AUDIT',

        CASE
            WHEN r.trigger_audit_attivi = 14
             AND NOT EXISTS (
                 SELECT 1
                 FROM copertura_trigger
                 WHERE trigger_audit_attivi <> 1
             )
            THEN 'OK'
            ELSE 'DA_CORREGGERE'
        END,

        jsonb_build_object(
            'trigger_audit_attivi',
            r.trigger_audit_attivi,

            'trigger_audit_attesi',
            14,

            'copertura_per_tabella',
            coalesce(
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'tabella',
                            nome_tabella,

                            'trigger_audit_attivi',
                            trigger_audit_attivi
                        )
                        ORDER BY ordine
                    )
                    FROM copertura_trigger
                ),
                '[]'::jsonb
            )
        )

    FROM riepilogo AS r

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 07. Archiviazione logica
    -- ------------------------------------------------------------------------

    SELECT
        7,
        '07_ARCHIVIAZIONE_LOGICA',

        CASE
            WHEN r.trigger_archiviazione_attivi = 10
             AND r.tabelle_archiviazione_standard_non_coerenti = 0
             AND r.tabelle_temporali_non_coerenti = 0
             AND NOT EXISTS (
                 SELECT 1
                 FROM copertura_trigger AS c
                 JOIN tabelle_archiviazione_standard AS t
                   ON t.nome_tabella = c.nome_tabella
                 WHERE c.trigger_archiviazione_attivi <> 1
             )
            THEN 'OK'
            ELSE 'DA_CORREGGERE'
        END,

        jsonb_build_object(
            'trigger_archiviazione_attivi',
            r.trigger_archiviazione_attivi,

            'trigger_archiviazione_attesi',
            10,

            'tabelle_standard_non_coerenti',
            r.tabelle_archiviazione_standard_non_coerenti,

            'tabelle_temporali_non_coerenti',
            r.tabelle_temporali_non_coerenti,

            'colonne_standard',
            coalesce(
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'tabella',
                            nome_tabella,

                            'attiva_valida',
                            attiva_valida,

                            'archiviato_il_valida',
                            archiviato_il_valida,

                            'archiviato_da_valida',
                            archiviato_da_valida,

                            'motivo_archiviazione_valida',
                            motivo_archiviazione_valida
                        )
                        ORDER BY ordine
                    )
                    FROM colonne_archiviazione_standard
                ),
                '[]'::jsonb
            ),

            'colonne_temporali',
            coalesce(
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'tabella',
                            nome_tabella,

                            'attiva_valida',
                            attiva_valida,

                            'valido_dal_valida',
                            valido_dal_valida,

                            'valido_al_valida',
                            valido_al_valida
                        )
                        ORDER BY ordine
                    )
                    FROM colonne_temporali
                ),
                '[]'::jsonb
            )
        )

    FROM riepilogo AS r

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 08. Coerenza dei dati archiviati
    -- ------------------------------------------------------------------------

    SELECT
        8,
        '08_COERENZA_DATI_ARCHIVIAZIONE',

        CASE
            WHEN r.anomalie_dati_archiviazione_standard = 0
             AND r.anomalie_dati_temporali = 0
            THEN 'OK'
            ELSE 'DA_CORREGGERE'
        END,

        jsonb_build_object(
            'anomalie_archiviazione_standard',
            r.anomalie_dati_archiviazione_standard,

            'anomalie_tabelle_temporali',
            r.anomalie_dati_temporali,

            'dettaglio_standard',
            coalesce(
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'tabella',
                            nome_tabella,

                            'anomalie',
                            anomalie
                        )
                        ORDER BY nome_tabella
                    )
                    FROM anomalie_archiviazione_standard
                ),
                '[]'::jsonb
            ),

            'dettaglio_temporale',
            coalesce(
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'tabella',
                            nome_tabella,

                            'anomalie',
                            anomalie
                        )
                        ORDER BY nome_tabella
                    )
                    FROM anomalie_tabelle_temporali
                ),
                '[]'::jsonb
            )
        )

    FROM riepilogo AS r

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 09. Vincoli e indici
    -- ------------------------------------------------------------------------

    SELECT
        9,
        '09_VINCOLI_E_INDICI',

        CASE
            WHEN r.vincoli_non_validati = 0
             AND r.indici_non_validi = 0
             AND r.chiavi_esterne_cascade = 0
            THEN 'OK'
            ELSE 'DA_CORREGGERE'
        END,

        jsonb_build_object(
            'vincoli_non_validati',
            r.vincoli_non_validati,

            'indici_non_validi',
            r.indici_non_validi,

            'chiavi_esterne_cascade',
            r.chiavi_esterne_cascade,

            'dettaglio_vincoli_non_validati',
            coalesce(
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'tabella',
                            nome_tabella,

                            'vincolo',
                            nome_vincolo,

                            'tipo',
                            tipo_vincolo
                        )
                        ORDER BY
                            nome_tabella,
                            nome_vincolo
                    )
                    FROM vincoli_non_validati
                ),
                '[]'::jsonb
            ),

            'dettaglio_indici_non_validi',
            coalesce(
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'tabella',
                            nome_tabella,

                            'indice',
                            nome_indice,

                            'valido',
                            indisvalid,

                            'pronto',
                            indisready
                        )
                        ORDER BY
                            nome_tabella,
                            nome_indice
                    )
                    FROM indici_non_validi
                ),
                '[]'::jsonb
            )
        )

    FROM riepilogo AS r

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 10. Sicurezza e accessibilita delle viste
    -- ------------------------------------------------------------------------

    SELECT
        10,
        '10_SICUREZZA_VISTE',

        CASE
            WHEN r.viste_mancanti = 0
             AND r.viste_senza_security_invoker = 0
             AND r.viste_senza_select_authenticated = 0
             AND r.viste_con_select_anon = 0
            THEN 'OK'
            ELSE 'DA_CORREGGERE'
        END,

        jsonb_build_object(
            'viste_attese',
            7,

            'viste_mancanti',
            r.viste_mancanti,

            'viste_senza_security_invoker',
            r.viste_senza_security_invoker,

            'viste_senza_select_authenticated',
            r.viste_senza_select_authenticated,

            'viste_con_select_anon',
            r.viste_con_select_anon,

            'dettaglio',
            coalesce(
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'vista',
                            nome_vista,

                            'esistente',
                            esistente,

                            'security_invoker',
                            security_invoker,

                            'authenticated_select',
                            authenticated_select,

                            'anon_select',
                            anon_select
                        )
                        ORDER BY ordine
                    )
                    FROM stato_viste
                ),
                '[]'::jsonb
            )
        )

    FROM riepilogo AS r

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 11. Coerenza funzionale delle viste
    -- ------------------------------------------------------------------------

    SELECT
        11,
        '11_COERENZA_FUNZIONALE_VISTE',

        CASE
            WHEN r.duplicati_reporting = 0
             AND r.differenza_righe_audit = 0
            THEN 'OK'
            ELSE 'DA_CORREGGERE'
        END,

        jsonb_build_object(
            'duplicati_reporting',
            r.duplicati_reporting,

            'differenza_righe_audit',
            r.differenza_righe_audit,

            'metriche',
            (
                SELECT jsonb_build_object(
                    'righe_reporting',
                    righe_reporting,

                    'servizi_distinti_reporting',
                    servizi_distinti_reporting,

                    'righe_audit_log',
                    righe_audit_log,

                    'righe_vista_audit',
                    righe_vista_audit,

                    'righe_supply_chain',
                    righe_supply_chain
                )
                FROM coerenza_viste
            )
        )

    FROM riepilogo AS r

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 12. Sicurezza delle funzioni
    -- ------------------------------------------------------------------------

    SELECT
        12,
        '12_SICUREZZA_FUNZIONI',

        CASE
            WHEN r.funzioni_non_coerenti = 0
            THEN 'OK'
            ELSE 'DA_CORREGGERE'
        END,

        jsonb_build_object(
            'funzioni_attese',
            3,

            'funzioni_non_coerenti',
            r.funzioni_non_coerenti,

            'dettaglio',
            coalesce(
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'funzione',
                            nome_funzione,

                            'numero_definizioni',
                            numero_definizioni,

                            'security_definer_atteso',
                            security_definer_atteso,

                            'security_definer_coerente',
                            security_definer_coerente,

                            'search_path_coerente',
                            search_path_coerente
                        )
                        ORDER BY ordine
                    )
                    FROM stato_funzioni
                ),
                '[]'::jsonb
            )
        )

    FROM riepilogo AS r

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 13. Protezione audit_log
    -- ------------------------------------------------------------------------

    SELECT
        13,
        '13_PROTEZIONE_AUDIT_LOG',

        CASE
            WHEN r.audit_authenticated_select = true
             AND r.audit_authenticated_insert = false
             AND r.audit_authenticated_update = false
             AND r.audit_authenticated_delete = false
             AND r.audit_anon_select = false
            THEN 'OK'
            ELSE 'DA_CORREGGERE'
        END,

        jsonb_build_object(
            'authenticated_select',
            r.audit_authenticated_select,

            'authenticated_insert',
            r.audit_authenticated_insert,

            'authenticated_update',
            r.audit_authenticated_update,

            'authenticated_delete',
            r.audit_authenticated_delete,

            'anon_select',
            r.audit_anon_select
        )

    FROM riepilogo AS r

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 14. Riepilogo delle policy
    -- ------------------------------------------------------------------------

    SELECT
        14,
        '14_RIEPILOGO_POLICY_RLS',
        'INFORMATIVO',

        jsonb_build_object(
            'policy_per_comando',
            coalesce(
                (
                    SELECT jsonb_object_agg(
                        cmd,
                        numero_policy
                    )
                    FROM policy_per_comando
                ),
                '{}'::jsonb
            ),

            'policy_delete',
            r.policy_delete
        )

    FROM riepilogo AS r

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 15. Riproducibilita logica dello stato finale
    -- ------------------------------------------------------------------------

    SELECT
        15,
        '15_RIPRODUCIBILITA_LOGICA_DATABASE',

        CASE
            WHEN r.numero_tabelle_public = 30
             AND r.tabelle_operative_mancanti = 0
             AND r.tabelle_public_senza_rls = 0
             AND r.trigger_audit_attivi = 14
             AND r.trigger_blocco_delete_attivi = 14
             AND r.trigger_archiviazione_attivi = 10
             AND r.chiavi_esterne_cascade = 0
             AND r.vincoli_non_validati = 0
             AND r.indici_non_validi = 0
             AND r.viste_mancanti = 0
             AND r.funzioni_non_coerenti = 0
            THEN 'OK'
            ELSE 'DA_CORREGGERE'
        END,

        jsonb_build_object(
            'stato_database_verificato',
            true,

            'file_repository_verificabili_dal_database',
            false,

            'nota',
            'La presenza e l''ordine dei file SQL in GitHub e nella copia locale devono essere verificati separatamente.',

            'milestone',
            jsonb_build_object(
                'tabelle_public',
                r.numero_tabelle_public,

                'viste_attese_presenti',
                7 - r.viste_mancanti,

                'funzioni_principali_coerenti',
                3 - r.funzioni_non_coerenti,

                'trigger_audit',
                r.trigger_audit_attivi,

                'trigger_blocco_delete',
                r.trigger_blocco_delete_attivi,

                'trigger_archiviazione',
                r.trigger_archiviazione_attivi,

                'vincoli_cascade',
                r.chiavi_esterne_cascade,

                'vincoli_non_validati',
                r.vincoli_non_validati,

                'indici_non_validi',
                r.indici_non_validi
            )
        )

    FROM riepilogo AS r

    UNION ALL

    -- ------------------------------------------------------------------------
    -- 16. Esito finale
    -- ------------------------------------------------------------------------

    SELECT
        16,
        '16_ESITO_FINALE',

        CASE
            WHEN r.numero_tabelle_public = 30
             AND r.tabelle_public_senza_rls = 0
             AND r.tabelle_operative_mancanti = 0
             AND r.tabelle_operative_senza_rls = 0
             AND r.privilegi_anon = 0
             AND r.privilegi_delete_authenticated = 0
             AND r.policy_delete = 0
             AND r.trigger_audit_attivi = 14
             AND r.trigger_blocco_delete_attivi = 14
             AND r.trigger_archiviazione_attivi = 10
             AND r.chiavi_esterne_cascade = 0
             AND r.vincoli_non_validati = 0
             AND r.indici_non_validi = 0
             AND r.viste_mancanti = 0
             AND r.viste_senza_security_invoker = 0
             AND r.viste_senza_select_authenticated = 0
             AND r.viste_con_select_anon = 0
             AND r.funzioni_non_coerenti = 0
             AND r.tabelle_archiviazione_standard_non_coerenti = 0
             AND r.tabelle_temporali_non_coerenti = 0
             AND r.anomalie_dati_archiviazione_standard = 0
             AND r.anomalie_dati_temporali = 0
             AND r.duplicati_reporting = 0
             AND r.differenza_righe_audit = 0
             AND r.audit_authenticated_select = true
             AND r.audit_authenticated_insert = false
             AND r.audit_authenticated_update = false
             AND r.audit_authenticated_delete = false
             AND r.audit_anon_select = false
             AND NOT EXISTS (
                 SELECT 1
                 FROM copertura_trigger
                 WHERE trigger_audit_attivi <> 1
                    OR trigger_blocco_delete_attivi <> 1
             )
             AND NOT EXISTS (
                 SELECT 1
                 FROM copertura_trigger AS c
                 JOIN tabelle_archiviazione_standard AS t
                   ON t.nome_tabella = c.nome_tabella
                 WHERE c.trigger_archiviazione_attivi <> 1
             )
            THEN 'VERIFICA_FINALE_BACKEND_SUPERATA'
            ELSE 'VERIFICA_FINALE_BACKEND_NON_SUPERATA'
        END,

        jsonb_build_object(
            'numero_tabelle_public',
            r.numero_tabelle_public,

            'tabelle_public_senza_rls',
            r.tabelle_public_senza_rls,

            'tabelle_operative_mancanti',
            r.tabelle_operative_mancanti,

            'privilegi_anon',
            r.privilegi_anon,

            'privilegi_delete_authenticated',
            r.privilegi_delete_authenticated,

            'policy_delete',
            r.policy_delete,

            'trigger_audit_attivi',
            r.trigger_audit_attivi,

            'trigger_blocco_delete_attivi',
            r.trigger_blocco_delete_attivi,

            'trigger_archiviazione_attivi',
            r.trigger_archiviazione_attivi,

            'chiavi_esterne_cascade',
            r.chiavi_esterne_cascade,

            'vincoli_non_validati',
            r.vincoli_non_validati,

            'indici_non_validi',
            r.indici_non_validi,

            'viste_mancanti',
            r.viste_mancanti,

            'viste_senza_security_invoker',
            r.viste_senza_security_invoker,

            'viste_senza_select_authenticated',
            r.viste_senza_select_authenticated,

            'viste_con_select_anon',
            r.viste_con_select_anon,

            'funzioni_non_coerenti',
            r.funzioni_non_coerenti,

            'anomalie_archiviazione',
            (
                r.anomalie_dati_archiviazione_standard
                + r.anomalie_dati_temporali
            ),

            'duplicati_reporting',
            r.duplicati_reporting,

            'differenza_righe_audit',
            r.differenza_righe_audit
        )

    FROM riepilogo AS r
)

-- ============================================================================
-- RISULTATO FINALE UNICO
-- ============================================================================

SELECT
    sezione,
    esito,
    dettaglio
FROM risultato
ORDER BY ordine;
