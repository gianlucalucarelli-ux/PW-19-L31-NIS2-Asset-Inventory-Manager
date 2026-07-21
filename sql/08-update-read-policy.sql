-- =========================================================================
-- FILE: sql/08-update-read-policy.sql
-- TARGET ARCHITETTURALE: BASELINE ER V3.7 - 24 TABELLE
-- DESCRIZIONE: Riallineamento della policy SELECT sulle tabelle della
--              baseline, con accesso riservato alle sessioni MFA aal2
--              oppure all'utenza docente autorizzata
-- TIPO SCRIPT: Produttivo - aggiornamento policy RLS di lettura
-- =========================================================================

/*
    SCOPO

    Lo script riallinea esclusivamente la policy RLS di lettura denominata:

        Read_All_Policy

    Non modifica:

    - le policy INSERT;
    - le policy UPDATE;
    - i privilegi DCL;
    - le funzioni;
    - i trigger;
    - le altre policy specifiche.

    REGOLE DI ACCESSO

    La lettura è consentita:

    1. agli utenti personali autenticati con livello MFA aal2;

    2. all'utenza docente:

           docentepegaso@gmail.com

       anche nel percorso di accesso semplificato previsto per la
       valutazione del Project Work.

    La lettura non è concessa genericamente a tutti gli utenti
    authenticated.

    NOTA SULLA PIPELINE

    Lo script 03 configura la policy iniziale.

    Lo script 08 costituisce una migrazione successiva di riallineamento,
    necessaria per sostituire la precedente versione che utilizzava:

        USING (true)

    e apriva impropriamente la lettura a qualsiasi utente autenticato.
*/

BEGIN;

DO $$
DECLARE
    v_tabella text;

    v_email_docente constant text :=
        'docentepegaso@gmail.com';

    /*
        Elenco completo delle 24 tabelle appartenenti alla baseline
        applicativa nel punto 08 della pipeline.
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

BEGIN
    FOREACH v_tabella IN ARRAY v_tabelle_progetto
    LOOP
        /*
            La verifica evita errori qualora una tabella non sia presente
            in un ambiente parziale o di sviluppo.
        */

        IF to_regclass(
            format('public.%I', v_tabella)
        ) IS NULL THEN
            RAISE NOTICE
                'Tabella public.% non presente: policy SELECT non aggiornata.',
                v_tabella;

            CONTINUE;
        END IF;

        /*
            RLS deve risultare attiva prima della creazione della policy.
            Il comando è idempotente.
        */

        EXECUTE format(
            'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
            v_tabella
        );

        /*
            Viene sostituita soltanto la policy di lettura.

            Le policy Insert_MFA_Policy e Update_MFA_Policy eventualmente
            presenti restano inalterate.
        */

        EXECUTE format(
            'DROP POLICY IF EXISTS "Read_All_Policy" ON public.%I',
            v_tabella
        );

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
    END LOOP;
END
$$;

COMMIT;