-- =========================================================================
-- FILE: sql/03-sicurezza-rls.sql
-- TARGET ARCHITETTURALE: BASELINE ER V3.7 - 24 TABELLE
-- DESCRIZIONE: Configurazione iniziale della Row Level Security sulle
--              tabelle applicative esistenti, con lettura riservata a
--              sessioni MFA o all'utenza docente e scrittura MFA controllata
-- TIPO SCRIPT: Produttivo di configurazione RLS iniziale
-- =========================================================================

/*
    SCOPO

    Lo script configura la Row Level Security per le tabelle appartenenti
    alla baseline relazionale del progetto.

    PRINCIPI APPLICATI

    1. L'accesso anonimo non viene autorizzato da alcuna policy.

    2. La lettura iniziale è consentita:
       - agli utenti autenticati con livello MFA aal2;
       - all'utenza docentepegaso@gmail.com utilizzata per la valutazione.

    3. INSERT e UPDATE sono consentiti esclusivamente agli utenti
       autenticati con livello MFA aal2 e soltanto sulle tabelle operative.

    4. Non viene creata alcuna policy DELETE.
       La cancellazione fisica non fa parte del modello applicativo;
       la dismissione sarà gestita mediante archiviazione logica.

    5. audit_log rimane inizialmente in sola lettura.
       La policy necessaria al relativo meccanismo di audit viene
       configurata successivamente dallo script 06.

    6. Le tabelle di dominio e tassonomia rimangono in sola lettura
       per i client applicativi. Il relativo popolamento viene effettuato
       dagli script SQL amministrativi.

    7. Lo script 08 sostituirà successivamente Read_All_Policy con una
       policy SELECT aperta a tutti gli utenti autenticati.

    8. Le tabelle introdotte da migrazioni successive devono configurare
       la propria RLS nello stesso script che le crea.

    AVVERTENZA

    Questo file appartiene alla ricostruzione sequenziale del database
    e deve essere eseguito nella posizione 03 della pipeline.

    Non deve essere rieseguito direttamente sull'istanza Supabase già
    migrata attraverso gli script 06, 08, 10, 13 e successivi, perché
    rimuoverebbe le policy introdotte dalle migrazioni posteriori.
*/

BEGIN;

DO $$
DECLARE
    v_tabella text;
    v_policy record;

    v_email_docente constant text :=
        'docentepegaso@gmail.com';

    /*
        Elenco delle 24 tabelle appartenenti alla baseline applicativa.

        La presenza viene controllata singolarmente: una tabella non ancora
        disponibile viene segnalata mediante NOTICE senza interrompere la
        pipeline. Le migrazioni che introducono nuovi oggetti configurano
        autonomamente la loro sicurezza.
    */
    v_tabelle_progetto constant text[] := ARRAY[
        'asset',
        'asset_vulnerabilita',
        'audit_log',
        'categoria_asset',
        'esito_impatto',
        'evento_servizio',
        'evento_tassonomia_acn',
        'fornitore',
        'organizzazione',
        'responsabile',
        'responsabile_ruolo',
        'ruolo',
        'ruolo_organigramma',
        'servizio',
        'servizio_componente',
        'servizio_dipendenza_asset',
        'servizio_dipendenza_fornitore',
        'stato_servizio',
        'tassonomia_incidenti_acn',
        'tipo_dipendenza',
        'tipo_dipendenza_servizio',
        'tipo_fornitore',
        'tipo_servizio',
        'vulnerabilita'
    ];

    /*
        Tabelle operative modificabili dall'applicazione esclusivamente
        tramite sessioni MFA aal2.

        audit_log non è incluso: la sua scrittura viene configurata nello
        script 06 ed è normalmente eseguita dal trigger di audit.
    */
    v_tabelle_scrivibili constant text[] := ARRAY[
        'asset',
        'asset_vulnerabilita',
        'evento_servizio',
        'evento_tassonomia_acn',
        'fornitore',
        'responsabile',
        'responsabile_ruolo',
        'servizio',
        'servizio_componente',
        'servizio_dipendenza_asset',
        'servizio_dipendenza_fornitore'
    ];

BEGIN
    FOREACH v_tabella IN ARRAY v_tabelle_progetto
    LOOP
        -- -----------------------------------------------------------------
        -- La tabella potrebbe essere introdotta da una migrazione seguente.
        -- In tal caso lo script non deve fallire.
        -- -----------------------------------------------------------------

        IF to_regclass(
            format('public.%I', v_tabella)
        ) IS NULL THEN
            RAISE NOTICE
                'Tabella public.% non presente: configurazione RLS rinviata.',
                v_tabella;

            CONTINUE;
        END IF;

        -- -----------------------------------------------------------------
        -- Abilitazione della Row Level Security.
        -- -----------------------------------------------------------------

        EXECUTE format(
            'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
            v_tabella
        );

        -- -----------------------------------------------------------------
        -- Ripristino deterministico delle policy della tabella.
        --
        -- Lo script 03 è la configurazione iniziale della pipeline:
        -- eventuali policy residue vengono eliminate prima di applicare
        -- la baseline corretta.
        -- -----------------------------------------------------------------

        FOR v_policy IN
            SELECT
                policyname
            FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename = v_tabella
        LOOP
            EXECUTE format(
                'DROP POLICY IF EXISTS %I ON public.%I',
                v_policy.policyname,
                v_tabella
            );
        END LOOP;

        -- -----------------------------------------------------------------
        -- Policy iniziale di lettura.
        --
        -- L'indirizzo e-mail viene confrontato in forma normalizzata.
        -- -----------------------------------------------------------------

        EXECUTE format(
            $policy$
                CREATE POLICY "Read_All_Policy"
                ON public.%I
                FOR SELECT
                TO authenticated
                USING (
                    (auth.jwt() ->> 'aal') = 'aal2'
                    OR lower(
                        COALESCE(
                            auth.jwt() ->> 'email',
                            ''
                        )
                    ) = lower(%L)
                )
            $policy$,
            v_tabella,
            v_email_docente
        );

        -- -----------------------------------------------------------------
        -- Le tabelle di dominio, tassonomia e audit rimangono in sola
        -- lettura. Le policy di scrittura vengono create soltanto per le
        -- tabelle operative esplicitamente elencate.
        -- -----------------------------------------------------------------

        IF v_tabella = ANY(v_tabelle_scrivibili) THEN

            -- -------------------------------------------------------------
            -- Inserimento consentito soltanto con autenticazione MFA aal2.
            -- -------------------------------------------------------------

            EXECUTE format(
                $policy$
                    CREATE POLICY "Insert_MFA_Policy"
                    ON public.%I
                    FOR INSERT
                    TO authenticated
                    WITH CHECK (
                        (auth.jwt() ->> 'aal') = 'aal2'
                    )
                $policy$,
                v_tabella
            );

            -- -------------------------------------------------------------
            -- Aggiornamento consentito soltanto con autenticazione MFA aal2.
            --
            -- USING controlla le righe modificabili.
            -- WITH CHECK controlla il nuovo stato della riga.
            -- -------------------------------------------------------------

            EXECUTE format(
                $policy$
                    CREATE POLICY "Update_MFA_Policy"
                    ON public.%I
                    FOR UPDATE
                    TO authenticated
                    USING (
                        (auth.jwt() ->> 'aal') = 'aal2'
                    )
                    WITH CHECK (
                        (auth.jwt() ->> 'aal') = 'aal2'
                    )
                $policy$,
                v_tabella
            );

        END IF;
    END LOOP;
END
$$;

COMMIT;