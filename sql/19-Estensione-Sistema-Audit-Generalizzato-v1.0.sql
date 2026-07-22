-- ============================================================================
-- FILE: sql/19-Estensione-Sistema-Audit-Generalizzato-v1.0.sql
-- TIPO: MIGRAZIONE PRODUTTIVA
-- VERSIONE: 1.0
--
-- PROGETTO:
--   NIS2 Asset Inventory Manager
--
-- SCOPO:
--   1. estendere l'audit alle principali entità e relazioni operative;
--   2. sostituire il trigger specifico dell'asset con un trigger generalizzato;
--   3. registrare tabella, identificativo, codice e nome dell'entità;
--   4. registrare UUID, email, AAL e ruolo JWT dell'utente;
--   5. conservare valori precedenti e nuovi in formato JSONB;
--   6. preservare la compatibilità con le colonne storiche di audit_log;
--   7. predisporre una vista ricercabile per asset, servizio e utente;
--   8. mantenere audit_log non modificabile dai ruoli applicativi.
--
-- PREREQUISITI:
--   - pipeline produttiva eseguita fino allo script 18;
--   - diagnostica X15 con esito PRONTO_PER_ESTENSIONE.
--
-- RISULTATO ATTESO:
--   - numero tabelle public invariato: 30;
--   - 14 tabelle operative coperte da audit;
--   - una funzione generalizzata di audit;
--   - una vista dettagliata di reporting;
--   - nessun privilegio di scrittura diretto su audit_log.
-- ============================================================================

BEGIN;


-- ============================================================================
-- 1. ESTENSIONE DELLA TABELLA AUDIT_LOG
--
-- Le colonne storiche vengono mantenute per non interrompere il frontend:
--
--   id
--   asset_id
--   utente
--   operazione
--   data_modifica
--   valore_precedente
--   valore_nuovo
--
-- Le nuove colonne permettono un audit generalizzato e strutturato.
-- ============================================================================

ALTER TABLE public.audit_log
    ADD COLUMN IF NOT EXISTS tabella varchar(80),

    ADD COLUMN IF NOT EXISTS tipo_entita varchar(30),

    ADD COLUMN IF NOT EXISTS record_id text,

    ADD COLUMN IF NOT EXISTS chiave_record jsonb,

    ADD COLUMN IF NOT EXISTS codice_record varchar(255),

    ADD COLUMN IF NOT EXISTS nome_record varchar(500),

    ADD COLUMN IF NOT EXISTS servizio_id integer,

    ADD COLUMN IF NOT EXISTS fornitore_id integer,

    ADD COLUMN IF NOT EXISTS utente_id uuid,

    ADD COLUMN IF NOT EXISTS utente_email varchar(320),

    ADD COLUMN IF NOT EXISTS livello_autenticazione varchar(20),

    ADD COLUMN IF NOT EXISTS ruolo_jwt varchar(100),

    ADD COLUMN IF NOT EXISTS ruolo_database varchar(100),

    ADD COLUMN IF NOT EXISTS origine_utente varchar(20),

    ADD COLUMN IF NOT EXISTS valore_precedente_jsonb jsonb,

    ADD COLUMN IF NOT EXISTS valore_nuovo_jsonb jsonb;


-- ============================================================================
-- 2. CONVERSIONE SICURA DEI PAYLOAD STORICI
--
-- Alcune righe contengono JSON testuale, mentre altre hanno valori nulli.
-- Eventuali testi non convertibili vengono conservati senza perdita.
-- ============================================================================

DO $$
DECLARE
    v_riga record;
    v_precedente jsonb;
    v_nuovo jsonb;
BEGIN
    FOR v_riga IN
        SELECT
            id,
            valore_precedente,
            valore_nuovo
        FROM public.audit_log
        WHERE valore_precedente_jsonb IS NULL
           OR valore_nuovo_jsonb IS NULL
    LOOP
        v_precedente := NULL;
        v_nuovo := NULL;

        IF v_riga.valore_precedente IS NOT NULL THEN
            BEGIN
                v_precedente :=
                    v_riga.valore_precedente::jsonb;
            EXCEPTION
                WHEN others THEN
                    v_precedente :=
                        jsonb_build_object(
                            '_valore_testuale',
                            v_riga.valore_precedente
                        );
            END;
        END IF;

        IF v_riga.valore_nuovo IS NOT NULL THEN
            BEGIN
                v_nuovo :=
                    v_riga.valore_nuovo::jsonb;
            EXCEPTION
                WHEN others THEN
                    v_nuovo :=
                        jsonb_build_object(
                            '_valore_testuale',
                            v_riga.valore_nuovo
                        );
            END;
        END IF;

        UPDATE public.audit_log
        SET
            valore_precedente_jsonb =
                coalesce(
                    valore_precedente_jsonb,
                    v_precedente
                ),

            valore_nuovo_jsonb =
                coalesce(
                    valore_nuovo_jsonb,
                    v_nuovo
                )

        WHERE id = v_riga.id;
    END LOOP;
END;
$$;


-- ============================================================================
-- 3. NORMALIZZAZIONE DELLE RIGHE STORICHE
--
-- Tutte le righe precedenti derivano dal vecchio audit specifico dell'asset.
-- La cronologia non viene cancellata né riscritta semanticamente.
-- ============================================================================

UPDATE public.audit_log
SET
    tabella =
        coalesce(
            nullif(tabella, ''),
            'asset'
        ),

    tipo_entita =
        coalesce(
            nullif(tipo_entita, ''),
            'ENTITA'
        ),

    record_id =
        coalesce(
            nullif(record_id, ''),
            asset_id::text,
            'legacy-' || id::text
        ),

    chiave_record =
        coalesce(
            chiave_record,
            CASE
                WHEN asset_id IS NOT NULL
                THEN jsonb_build_object(
                    'asset_id',
                    asset_id
                )
                ELSE jsonb_build_object(
                    'audit_id_storico',
                    id
                )
            END
        ),

    utente_email =
        coalesce(
            utente_email,
            CASE
                WHEN position('@' IN utente) > 1
                THEN lower(utente)
                ELSE NULL
            END
        ),

    origine_utente =
        coalesce(
            nullif(origine_utente, ''),
            'LEGACY'
        ),

    ruolo_database =
        coalesce(
            nullif(ruolo_database, ''),
            'legacy'
        );


-- ============================================================================
-- 4. ARRICCHIMENTO DELLE RIGHE STORICHE RELATIVE AGLI ASSET
-- ============================================================================

UPDATE public.audit_log AS al
SET
    codice_record =
        coalesce(
            al.codice_record,
            a.codice_asset
        ),

    nome_record =
        coalesce(
            al.nome_record,
            a.nome
        )

FROM public.asset AS a

WHERE al.tabella = 'asset'
  AND al.asset_id = a.id;


-- ============================================================================
-- 5. VINCOLI DELLE NUOVE COLONNE
-- ============================================================================

ALTER TABLE public.audit_log
    ALTER COLUMN tabella SET NOT NULL,

    ALTER COLUMN tipo_entita SET NOT NULL,

    ALTER COLUMN record_id SET NOT NULL,

    ALTER COLUMN chiave_record SET NOT NULL,

    ALTER COLUMN origine_utente SET NOT NULL;


ALTER TABLE public.audit_log
    DROP CONSTRAINT IF EXISTS
        check_audit_tipo_entita;


ALTER TABLE public.audit_log
    ADD CONSTRAINT check_audit_tipo_entita
    CHECK (
        tipo_entita IN (
            'ENTITA',
            'RELAZIONE',
            'GERARCHIA'
        )
    );


ALTER TABLE public.audit_log
    DROP CONSTRAINT IF EXISTS
        check_audit_origine_utente;


ALTER TABLE public.audit_log
    ADD CONSTRAINT check_audit_origine_utente
    CHECK (
        origine_utente IN (
            'JWT',
            'DATABASE',
            'LEGACY'
        )
    );


-- ============================================================================
-- 6. INDICI PER RICERCA E FILTRAGGIO
-- ============================================================================

CREATE INDEX IF NOT EXISTS
    idx_audit_log_tabella_data
ON public.audit_log (
    tabella,
    data_modifica DESC
);


CREATE INDEX IF NOT EXISTS
    idx_audit_log_record_id
ON public.audit_log (
    record_id
);


CREATE INDEX IF NOT EXISTS
    idx_audit_log_codice_record
ON public.audit_log (
    codice_record
);


CREATE INDEX IF NOT EXISTS
    idx_audit_log_utente_email
ON public.audit_log (
    lower(utente_email)
);


CREATE INDEX IF NOT EXISTS
    idx_audit_log_operazione
ON public.audit_log (
    operazione
);


CREATE INDEX IF NOT EXISTS
    idx_audit_log_data_modifica
ON public.audit_log (
    data_modifica DESC
);


CREATE INDEX IF NOT EXISTS
    idx_audit_log_valore_precedente_jsonb
ON public.audit_log
USING gin (
    valore_precedente_jsonb
);


CREATE INDEX IF NOT EXISTS
    idx_audit_log_valore_nuovo_jsonb
ON public.audit_log
USING gin (
    valore_nuovo_jsonb
);


-- ============================================================================
-- 7. RIMOZIONE DEL TRIGGER SPECIFICO PRECEDENTE
-- ============================================================================

DROP TRIGGER IF EXISTS
    trg_asset_audit
ON public.asset;


DROP FUNCTION IF EXISTS
    public.fn_audit_asset_changes();


DROP FUNCTION IF EXISTS
    public.process_asset_audit();


-- ============================================================================
-- 8. FUNZIONE GENERALIZZATA DI AUDIT
--
-- La funzione:
--   - identifica automaticamente la tabella;
--   - salva OLD e NEW in JSONB;
--   - acquisisce l'identità dal JWT Supabase;
--   - usa session_user soltanto quando il JWT non è disponibile;
--   - non memorizza password, token o segreti;
--   - mantiene valorizzate anche le colonne storiche.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_audit_generico()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_old jsonb;
    v_new jsonb;
    v_riga jsonb;

    v_chiave jsonb;

    v_record_id text;
    v_codice_record text;
    v_nome_record text;

    v_asset_id integer;
    v_servizio_id integer;
    v_fornitore_id integer;

    v_utente_id uuid;
    v_utente_email text;
    v_livello_autenticazione text;
    v_ruolo_jwt text;
    v_ruolo_database text;
    v_origine_utente text;
    v_utente_visualizzato text;

    v_valore_testuale text;
BEGIN
    -- ------------------------------------------------------------------------
    -- 8.1 Preparazione dei valori OLD e NEW
    -- ------------------------------------------------------------------------

    IF TG_OP IN (
        'UPDATE',
        'DELETE'
    ) THEN
        v_old :=
            to_jsonb(OLD)
            - ARRAY[
                'password',
                'password_hash',
                'token',
                'access_token',
                'refresh_token',
                'secret',
                'client_secret'
            ]::text[];
    END IF;

    IF TG_OP IN (
        'INSERT',
        'UPDATE'
    ) THEN
        v_new :=
            to_jsonb(NEW)
            - ARRAY[
                'password',
                'password_hash',
                'token',
                'access_token',
                'refresh_token',
                'secret',
                'client_secret'
            ]::text[];
    END IF;

    IF TG_OP = 'UPDATE'
       AND v_old IS NOT DISTINCT FROM v_new THEN
        RETURN NEW;
    END IF;

    v_riga :=
        coalesce(
            v_new,
            v_old,
            '{}'::jsonb
        );

    -- ------------------------------------------------------------------------
    -- 8.2 Costruzione della chiave logica del record
    -- ------------------------------------------------------------------------

    v_chiave :=
        jsonb_strip_nulls(
            jsonb_build_object(
                'id',
                v_riga -> 'id',

                'organizzazione_id',
                v_riga -> 'organizzazione_id',

                'responsabile_id',
                v_riga -> 'responsabile_id',

                'asset_id',
                v_riga -> 'asset_id',

                'asset_padre_id',
                v_riga -> 'asset_padre_id',

                'asset_figlio_id',
                v_riga -> 'asset_figlio_id',

                'servizio_id',
                v_riga -> 'servizio_id',

                'servizio_padre_id',
                v_riga -> 'servizio_padre_id',

                'servizio_figlio_id',
                v_riga -> 'servizio_figlio_id',

                'fornitore_id',
                v_riga -> 'fornitore_id',

                'fornitore_padre_id',
                v_riga -> 'fornitore_padre_id',

                'fornitore_figlio_id',
                v_riga -> 'fornitore_figlio_id',

                'vulnerabilita_id',
                v_riga -> 'vulnerabilita_id',

                'evento_id',
                v_riga -> 'evento_id',

                'tassonomia_acn_id',
                v_riga -> 'tassonomia_acn_id'
            )
        );

    IF v_chiave = '{}'::jsonb THEN
        v_chiave :=
            jsonb_build_object(
                'hash_record',
                md5(v_riga::text)
            );
    END IF;

    v_record_id :=
        coalesce(
            nullif(
                v_riga ->> 'id',
                ''
            ),
            md5(v_chiave::text)
        );

    -- ------------------------------------------------------------------------
    -- 8.3 Codice e denominazione leggibile
    -- ------------------------------------------------------------------------

    v_codice_record :=
        coalesce(
            nullif(v_riga ->> 'codice_asset', ''),
            nullif(v_riga ->> 'codice_servizio', ''),
            nullif(v_riga ->> 'codice_fornitore', ''),
            nullif(v_riga ->> 'codice_evento', ''),
            nullif(v_riga ->> 'codice_cve', ''),
            nullif(v_riga ->> 'codice', '')
        );

    v_nome_record :=
        left(
            coalesce(
                nullif(v_riga ->> 'nome', ''),
                nullif(v_riga ->> 'titolo', ''),
                nullif(v_riga ->> 'descrizione', ''),
                nullif(v_riga ->> 'denominazione', '')
            ),
            500
        );

    -- ------------------------------------------------------------------------
    -- 8.4 Identificativi diretti principali
    -- ------------------------------------------------------------------------

    v_valore_testuale :=
        CASE
            WHEN TG_TABLE_NAME = 'asset'
            THEN v_record_id
            ELSE v_riga ->> 'asset_id'
        END;

    IF v_valore_testuale ~ '^[0-9]+$' THEN
        v_asset_id :=
            v_valore_testuale::integer;
    END IF;


    v_valore_testuale :=
        CASE
            WHEN TG_TABLE_NAME = 'servizio'
            THEN v_record_id
            ELSE v_riga ->> 'servizio_id'
        END;

    IF v_valore_testuale ~ '^[0-9]+$' THEN
        v_servizio_id :=
            v_valore_testuale::integer;
    END IF;


    v_valore_testuale :=
        CASE
            WHEN TG_TABLE_NAME = 'fornitore'
            THEN v_record_id
            ELSE v_riga ->> 'fornitore_id'
        END;

    IF v_valore_testuale ~ '^[0-9]+$' THEN
        v_fornitore_id :=
            v_valore_testuale::integer;
    END IF;

    -- ------------------------------------------------------------------------
    -- 8.5 Identificazione dell'attore
    --
    -- current_user non viene usato come identità dell'utente applicativo
    -- perché la funzione è SECURITY DEFINER.
    -- ------------------------------------------------------------------------

    v_utente_id :=
        auth.uid();

    v_utente_email :=
        nullif(
            auth.jwt() ->> 'email',
            ''
        );

    v_livello_autenticazione :=
        nullif(
            auth.jwt() ->> 'aal',
            ''
        );

    v_ruolo_jwt :=
        nullif(
            auth.jwt() ->> 'role',
            ''
        );

    v_ruolo_database :=
        session_user;

    v_origine_utente :=
        CASE
            WHEN v_utente_id IS NOT NULL
              OR v_utente_email IS NOT NULL
            THEN 'JWT'
            ELSE 'DATABASE'
        END;

    v_utente_visualizzato :=
        coalesce(
            v_utente_email,
            v_utente_id::text,
            v_ruolo_database,
            'UTENTE_NON_IDENTIFICATO'
        );

    -- ------------------------------------------------------------------------
    -- 8.6 Inserimento della registrazione
    -- ------------------------------------------------------------------------

    INSERT INTO public.audit_log (
        asset_id,
        utente,
        operazione,
        data_modifica,
        valore_precedente,
        valore_nuovo,

        tabella,
        tipo_entita,
        record_id,
        chiave_record,
        codice_record,
        nome_record,

        servizio_id,
        fornitore_id,

        utente_id,
        utente_email,
        livello_autenticazione,
        ruolo_jwt,
        ruolo_database,
        origine_utente,

        valore_precedente_jsonb,
        valore_nuovo_jsonb
    )
    VALUES (
        v_asset_id,
        v_utente_visualizzato,
        TG_OP,
        timezone(
            'UTC',
            clock_timestamp()
        ),

        CASE
            WHEN v_old IS NULL
            THEN NULL
            ELSE v_old::text
        END,

        CASE
            WHEN v_new IS NULL
            THEN NULL
            ELSE v_new::text
        END,

        TG_TABLE_NAME,

        CASE
            WHEN TG_TABLE_NAME IN (
                'organizzazione',
                'responsabile',
                'asset',
                'servizio',
                'fornitore',
                'evento_servizio'
            )
            THEN 'ENTITA'

            WHEN TG_TABLE_NAME IN (
                'servizio_componente',
                'asset_componente',
                'fornitore_relazione'
            )
            THEN 'GERARCHIA'

            ELSE 'RELAZIONE'
        END,

        v_record_id,
        v_chiave,
        v_codice_record,
        v_nome_record,

        v_servizio_id,
        v_fornitore_id,

        v_utente_id,
        v_utente_email,
        v_livello_autenticazione,
        v_ruolo_jwt,
        v_ruolo_database,
        v_origine_utente,

        v_old,
        v_new
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION public.fn_audit_generico()
OWNER TO postgres;


REVOKE ALL
ON FUNCTION public.fn_audit_generico()
FROM PUBLIC;


REVOKE ALL
ON FUNCTION public.fn_audit_generico()
FROM anon;


REVOKE ALL
ON FUNCTION public.fn_audit_generico()
FROM authenticated;


-- ============================================================================
-- 9. CREAZIONE DEI TRIGGER SULLE 14 TABELLE OPERATIVE
-- ============================================================================

DO $$
DECLARE
    v_tabella text;
    v_nome_trigger text;
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
        IF to_regclass(
            format(
                'public.%I',
                v_tabella
            )
        ) IS NULL THEN
            RAISE EXCEPTION
                'Tabella operativa mancante: %.',
                v_tabella;
        END IF;

        v_nome_trigger :=
            'trg_audit_' || v_tabella;

        EXECUTE format(
            'DROP TRIGGER IF EXISTS %I ON public.%I',
            v_nome_trigger,
            v_tabella
        );

        EXECUTE format(
            'CREATE TRIGGER %I
             AFTER INSERT OR UPDATE OR DELETE
             ON public.%I
             FOR EACH ROW
             EXECUTE FUNCTION public.fn_audit_generico()',
            v_nome_trigger,
            v_tabella
        );
    END LOOP;
END;
$$;


-- ============================================================================
-- 10. VISTA DETTAGLIATA E RICERCABILE
--
-- La vista espone:
--   - entità e operazione;
--   - codice e nome del record;
--   - utente reale quando disponibile;
--   - asset, servizi e fornitori collegati;
--   - valori precedenti e nuovi;
--   - testo consolidato per la ricerca frontend.
-- ============================================================================

CREATE OR REPLACE VIEW public.vista_audit_dettagliato
WITH (
    security_invoker = true
)
AS
WITH base AS (
    SELECT
        al.*,

        coalesce(
            al.valore_nuovo_jsonb,
            al.valore_precedente_jsonb,
            '{}'::jsonb
        ) AS payload

    FROM public.audit_log AS al
)

SELECT
    b.id AS audit_id,

    b.data_modifica,

    b.data_modifica AT TIME ZONE 'UTC'
        AS data_modifica_utc,

    b.operazione,

    b.tabella,

    b.tipo_entita,

    b.record_id,

    b.chiave_record,

    b.codice_record,

    b.nome_record,

    coalesce(
        b.codice_record,
        b.nome_record,
        b.tabella || ' #' || b.record_id
    ) AS record_visualizzato,

    b.utente_id,

    b.utente_email,

    b.livello_autenticazione,

    b.ruolo_jwt,

    b.ruolo_database,

    b.origine_utente,

    coalesce(
        b.utente_email,
        b.utente_id::text,
        b.utente,
        b.ruolo_database
    ) AS utente_visualizzato,

    coalesce(
        contesto_asset.elenco_asset,
        ''
    ) AS asset_collegati,

    coalesce(
        contesto_asset.dettaglio_asset,
        '[]'::jsonb
    ) AS dettaglio_asset,

    coalesce(
        contesto_servizi.elenco_servizi,
        ''
    ) AS servizi_collegati,

    coalesce(
        contesto_servizi.dettaglio_servizi,
        '[]'::jsonb
    ) AS dettaglio_servizi,

    coalesce(
        contesto_fornitori.elenco_fornitori,
        ''
    ) AS fornitori_collegati,

    coalesce(
        contesto_fornitori.dettaglio_fornitori,
        '[]'::jsonb
    ) AS dettaglio_fornitori,

    b.valore_precedente_jsonb,

    b.valore_nuovo_jsonb,

    lower(
        concat_ws(
            ' ',
            b.id::text,
            b.operazione,
            b.tabella,
            b.tipo_entita,
            b.record_id,
            b.codice_record,
            b.nome_record,
            b.utente,
            b.utente_email,
            b.utente_id::text,
            b.ruolo_jwt,
            contesto_asset.elenco_asset,
            contesto_servizi.elenco_servizi,
            contesto_fornitori.elenco_fornitori
        )
    ) AS testo_ricerca

FROM base AS b


-- ============================================================================
-- 10.1 IDENTIFICATIVI ESPLICITI DEGLI ASSET
-- ============================================================================

LEFT JOIN LATERAL (
    SELECT
        array_agg(
            DISTINCT identificativi.id
        ) FILTER (
            WHERE identificativi.id IS NOT NULL
        ) AS ids

    FROM (
        SELECT b.asset_id AS id

        UNION ALL

        SELECT
            CASE
                WHEN b.tabella = 'asset'
                 AND b.record_id ~ '^[0-9]+$'
                THEN b.record_id::integer
                ELSE NULL
            END

        UNION ALL

        SELECT
            CASE
                WHEN b.payload ->> 'asset_id' ~ '^[0-9]+$'
                THEN (b.payload ->> 'asset_id')::integer
                ELSE NULL
            END

        UNION ALL

        SELECT
            CASE
                WHEN b.payload ->> 'asset_padre_id' ~ '^[0-9]+$'
                THEN (b.payload ->> 'asset_padre_id')::integer
                ELSE NULL
            END

        UNION ALL

        SELECT
            CASE
                WHEN b.payload ->> 'asset_figlio_id' ~ '^[0-9]+$'
                THEN (b.payload ->> 'asset_figlio_id')::integer
                ELSE NULL
            END
    ) AS identificativi
) AS asset_espliciti
ON true


-- ============================================================================
-- 10.2 IDENTIFICATIVI ESPLICITI DEI SERVIZI
-- ============================================================================

LEFT JOIN LATERAL (
    SELECT
        array_agg(
            DISTINCT identificativi.id
        ) FILTER (
            WHERE identificativi.id IS NOT NULL
        ) AS ids

    FROM (
        SELECT b.servizio_id AS id

        UNION ALL

        SELECT
            CASE
                WHEN b.tabella = 'servizio'
                 AND b.record_id ~ '^[0-9]+$'
                THEN b.record_id::integer
                ELSE NULL
            END

        UNION ALL

        SELECT
            CASE
                WHEN b.payload ->> 'servizio_id' ~ '^[0-9]+$'
                THEN (b.payload ->> 'servizio_id')::integer
                ELSE NULL
            END

        UNION ALL

        SELECT
            CASE
                WHEN b.payload ->> 'servizio_padre_id' ~ '^[0-9]+$'
                THEN (b.payload ->> 'servizio_padre_id')::integer
                ELSE NULL
            END

        UNION ALL

        SELECT
            CASE
                WHEN b.payload ->> 'servizio_figlio_id' ~ '^[0-9]+$'
                THEN (b.payload ->> 'servizio_figlio_id')::integer
                ELSE NULL
            END
    ) AS identificativi
) AS servizi_espliciti
ON true


-- ============================================================================
-- 10.3 ASSET ESPLICITI E ASSET COLLEGATI AI SERVIZI
-- ============================================================================

LEFT JOIN LATERAL (
    SELECT
        array_agg(
            DISTINCT identificativi.id
        ) FILTER (
            WHERE identificativi.id IS NOT NULL
        ) AS ids

    FROM (
        SELECT
            unnest(
                coalesce(
                    asset_espliciti.ids,
                    ARRAY[]::integer[]
                )
            ) AS id

        UNION

        SELECT sda.asset_id
        FROM public.servizio_dipendenza_asset AS sda
        WHERE sda.servizio_id = ANY (
            coalesce(
                servizi_espliciti.ids,
                ARRAY[]::integer[]
            )
        )
    ) AS identificativi
) AS asset_completi
ON true


-- ============================================================================
-- 10.4 SERVIZI ESPLICITI E SERVIZI COLLEGATI AGLI ASSET
-- ============================================================================

LEFT JOIN LATERAL (
    SELECT
        array_agg(
            DISTINCT identificativi.id
        ) FILTER (
            WHERE identificativi.id IS NOT NULL
        ) AS ids

    FROM (
        SELECT
            unnest(
                coalesce(
                    servizi_espliciti.ids,
                    ARRAY[]::integer[]
                )
            ) AS id

        UNION

        SELECT sda.servizio_id
        FROM public.servizio_dipendenza_asset AS sda
        WHERE sda.asset_id = ANY (
            coalesce(
                asset_completi.ids,
                ARRAY[]::integer[]
            )
        )
    ) AS identificativi
) AS servizi_completi
ON true


-- ============================================================================
-- 10.5 IDENTIFICATIVI DEI FORNITORI
-- ============================================================================

LEFT JOIN LATERAL (
    SELECT
        array_agg(
            DISTINCT identificativi.id
        ) FILTER (
            WHERE identificativi.id IS NOT NULL
        ) AS ids

    FROM (
        SELECT b.fornitore_id AS id

        UNION ALL

        SELECT
            CASE
                WHEN b.tabella = 'fornitore'
                 AND b.record_id ~ '^[0-9]+$'
                THEN b.record_id::integer
                ELSE NULL
            END

        UNION ALL

        SELECT
            CASE
                WHEN b.payload ->> 'fornitore_id' ~ '^[0-9]+$'
                THEN (b.payload ->> 'fornitore_id')::integer
                ELSE NULL
            END

        UNION ALL

        SELECT
            CASE
                WHEN b.payload ->> 'fornitore_padre_id' ~ '^[0-9]+$'
                THEN (b.payload ->> 'fornitore_padre_id')::integer
                ELSE NULL
            END

        UNION ALL

        SELECT
            CASE
                WHEN b.payload ->> 'fornitore_figlio_id' ~ '^[0-9]+$'
                THEN (b.payload ->> 'fornitore_figlio_id')::integer
                ELSE NULL
            END

        UNION

        SELECT sdf.fornitore_id
        FROM public.servizio_dipendenza_fornitore AS sdf
        WHERE sdf.servizio_id = ANY (
            coalesce(
                servizi_completi.ids,
                ARRAY[]::integer[]
            )
        )

        UNION

        SELECT af.fornitore_id
        FROM public.asset_fornitore AS af
        WHERE af.asset_id = ANY (
            coalesce(
                asset_completi.ids,
                ARRAY[]::integer[]
            )
        )
    ) AS identificativi
) AS fornitori_completi
ON true


-- ============================================================================
-- 10.6 CONTESTO LEGGIBILE DEGLI ASSET
-- ============================================================================

LEFT JOIN LATERAL (
    SELECT
        string_agg(
            concat_ws(
                ' - ',
                a.codice_asset,
                a.nome
            ),
            ', '
            ORDER BY
                a.codice_asset,
                a.nome
        ) AS elenco_asset,

        jsonb_agg(
            jsonb_build_object(
                'asset_id',
                a.id,

                'codice_asset',
                a.codice_asset,

                'nome_asset',
                a.nome
            )
            ORDER BY
                a.codice_asset,
                a.nome
        ) AS dettaglio_asset

    FROM public.asset AS a

    WHERE a.id = ANY (
        coalesce(
            asset_completi.ids,
            ARRAY[]::integer[]
        )
    )
) AS contesto_asset
ON true


-- ============================================================================
-- 10.7 CONTESTO LEGGIBILE DEI SERVIZI
-- ============================================================================

LEFT JOIN LATERAL (
    SELECT
        string_agg(
            concat_ws(
                ' - ',
                s.codice_servizio,
                s.nome
            ),
            ', '
            ORDER BY
                s.codice_servizio,
                s.nome
        ) AS elenco_servizi,

        jsonb_agg(
            jsonb_build_object(
                'servizio_id',
                s.id,

                'codice_servizio',
                s.codice_servizio,

                'nome_servizio',
                s.nome
            )
            ORDER BY
                s.codice_servizio,
                s.nome
        ) AS dettaglio_servizi

    FROM public.servizio AS s

    WHERE s.id = ANY (
        coalesce(
            servizi_completi.ids,
            ARRAY[]::integer[]
        )
    )
) AS contesto_servizi
ON true


-- ============================================================================
-- 10.8 CONTESTO LEGGIBILE DEI FORNITORI
-- ============================================================================

LEFT JOIN LATERAL (
    SELECT
        string_agg(
            concat_ws(
                ' - ',
                f.codice_fornitore,
                f.nome
            ),
            ', '
            ORDER BY
                f.codice_fornitore,
                f.nome
        ) AS elenco_fornitori,

        jsonb_agg(
            jsonb_build_object(
                'fornitore_id',
                f.id,

                'codice_fornitore',
                f.codice_fornitore,

                'nome_fornitore',
                f.nome
            )
            ORDER BY
                f.codice_fornitore,
                f.nome
        ) AS dettaglio_fornitori

    FROM public.fornitore AS f

    WHERE f.id = ANY (
        coalesce(
            fornitori_completi.ids,
            ARRAY[]::integer[]
        )
    )
) AS contesto_fornitori
ON true;


-- ============================================================================
-- 11. COMMENTI DOCUMENTALI
-- ============================================================================

COMMENT ON VIEW public.vista_audit_dettagliato IS
    'Vista di audit generalizzata e ricercabile per entità, asset, servizio, fornitore, utente, operazione e data.';


COMMENT ON COLUMN
    public.vista_audit_dettagliato.testo_ricerca
IS
    'Testo normalizzato destinato alla ricerca libera nel frontend.';


COMMENT ON COLUMN
    public.vista_audit_dettagliato.dettaglio_servizi
IS
    'Elenco JSONB dei servizi collegati direttamente o tramite gli asset coinvolti.';


-- ============================================================================
-- 12. PRIVILEGI DELLA VISTA
-- ============================================================================

REVOKE ALL
ON TABLE public.vista_audit_dettagliato
FROM PUBLIC;


REVOKE ALL
ON TABLE public.vista_audit_dettagliato
FROM anon;


REVOKE ALL
ON TABLE public.vista_audit_dettagliato
FROM authenticated;


GRANT SELECT
ON TABLE public.vista_audit_dettagliato
TO authenticated;


-- ============================================================================
-- 13. CONFERMA DEI PRIVILEGI DI AUDIT_LOG
-- ============================================================================

REVOKE ALL
ON TABLE public.audit_log
FROM PUBLIC;


REVOKE ALL
ON TABLE public.audit_log
FROM anon;


REVOKE INSERT, UPDATE, DELETE, TRUNCATE
ON TABLE public.audit_log
FROM authenticated;


GRANT SELECT
ON TABLE public.audit_log
TO authenticated;


-- ============================================================================
-- 14. VERIFICA FINALE BLOCCANTE
-- ============================================================================

DO $$
DECLARE
    v_numero_tabelle integer;
    v_numero_trigger integer;
    v_righe_audit integer;
    v_righe_vista integer;

    v_security_definer boolean;
    v_search_path_sicuro boolean;
    v_security_invoker boolean;

    v_anon_select boolean;
    v_authenticated_select boolean;
    v_authenticated_insert boolean;
    v_authenticated_update boolean;
    v_authenticated_delete boolean;

    v_anon_select_vista boolean;
    v_authenticated_select_vista boolean;

    v_righe_non_normalizzate integer;
BEGIN
    SELECT count(*)
    INTO v_numero_tabelle
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE';

    SELECT count(*)
    INTO v_numero_trigger
    FROM pg_trigger AS t
    WHERE t.tgisinternal = false
      AND t.tgfoid =
          'public.fn_audit_generico()'::regprocedure;

    SELECT count(*)
    INTO v_righe_audit
    FROM public.audit_log;

    SELECT count(*)
    INTO v_righe_vista
    FROM public.vista_audit_dettagliato;

    SELECT
        p.prosecdef,

        EXISTS (
            SELECT 1
            FROM unnest(
                coalesce(
                    p.proconfig,
                    ARRAY[]::text[]
                )
            ) AS configurazione
            WHERE configurazione ILIKE 'search_path=%'
        )

    INTO
        v_security_definer,
        v_search_path_sicuro

    FROM pg_proc AS p

    WHERE p.oid =
        'public.fn_audit_generico()'::regprocedure;

    SELECT
        coalesce(
            c.reloptions,
            ARRAY[]::text[]
        ) @> ARRAY['security_invoker=true']

    INTO v_security_invoker

    FROM pg_class AS c

    WHERE c.oid =
        'public.vista_audit_dettagliato'::regclass;

    SELECT has_table_privilege(
        'anon',
        'public.audit_log',
        'SELECT'
    )
    INTO v_anon_select;

    SELECT has_table_privilege(
        'authenticated',
        'public.audit_log',
        'SELECT'
    )
    INTO v_authenticated_select;

    SELECT has_table_privilege(
        'authenticated',
        'public.audit_log',
        'INSERT'
    )
    INTO v_authenticated_insert;

    SELECT has_table_privilege(
        'authenticated',
        'public.audit_log',
        'UPDATE'
    )
    INTO v_authenticated_update;

    SELECT has_table_privilege(
        'authenticated',
        'public.audit_log',
        'DELETE'
    )
    INTO v_authenticated_delete;

    SELECT has_table_privilege(
        'anon',
        'public.vista_audit_dettagliato',
        'SELECT'
    )
    INTO v_anon_select_vista;

    SELECT has_table_privilege(
        'authenticated',
        'public.vista_audit_dettagliato',
        'SELECT'
    )
    INTO v_authenticated_select_vista;

    SELECT count(*)
    INTO v_righe_non_normalizzate
    FROM public.audit_log
    WHERE tabella IS NULL
       OR tipo_entita IS NULL
       OR record_id IS NULL
       OR chiave_record IS NULL
       OR origine_utente IS NULL;

    IF v_numero_tabelle <> 30 THEN
        RAISE EXCEPTION
            'Numero tabelle public inatteso: % invece di 30.',
            v_numero_tabelle;
    END IF;

    IF v_numero_trigger <> 14 THEN
        RAISE EXCEPTION
            'Numero trigger di audit inatteso: % invece di 14.',
            v_numero_trigger;
    END IF;

    IF v_righe_audit <> v_righe_vista THEN
        RAISE EXCEPTION
            'La vista espone % righe, audit_log ne contiene %.',
            v_righe_vista,
            v_righe_audit;
    END IF;

    IF v_righe_non_normalizzate <> 0 THEN
        RAISE EXCEPTION
            'Sono presenti % righe di audit non normalizzate.',
            v_righe_non_normalizzate;
    END IF;

    IF coalesce(v_security_definer, false) = false THEN
        RAISE EXCEPTION
            'La funzione di audit non utilizza SECURITY DEFINER.';
    END IF;

    IF coalesce(v_search_path_sicuro, false) = false THEN
        RAISE EXCEPTION
            'La funzione di audit non possiede un search_path esplicito.';
    END IF;

    IF coalesce(v_security_invoker, false) = false THEN
        RAISE EXCEPTION
            'La vista di audit non utilizza security_invoker.';
    END IF;

    IF v_anon_select = true
       OR v_anon_select_vista = true THEN
        RAISE EXCEPTION
            'Il ruolo anon possiede accesso al sistema di audit.';
    END IF;

    IF v_authenticated_select = false
       OR v_authenticated_select_vista = false THEN
        RAISE EXCEPTION
            'Il ruolo authenticated non possiede accesso in lettura.';
    END IF;

    IF v_authenticated_insert = true
       OR v_authenticated_update = true
       OR v_authenticated_delete = true THEN
        RAISE EXCEPTION
            'Il ruolo authenticated possiede privilegi di modifica su audit_log.';
    END IF;
END;
$$;


COMMIT;


-- ============================================================================
-- 15. RISULTATO FINALE
-- ============================================================================

SELECT
    'SCRIPT_19_COMPLETATO' AS esito,

    (
        SELECT count(*)
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
    ) AS numero_tabelle_public,

    (
        SELECT count(*)
        FROM pg_trigger AS t
        WHERE t.tgisinternal = false
          AND t.tgfoid =
              'public.fn_audit_generico()'::regprocedure
    ) AS trigger_audit_attivi,

    (
        SELECT count(*)
        FROM public.audit_log
    ) AS eventi_audit,

    (
        SELECT count(*)
        FROM public.vista_audit_dettagliato
    ) AS righe_vista_audit,

    (
        SELECT count(*)
        FROM public.audit_log
        WHERE origine_utente = 'LEGACY'
    ) AS eventi_storici_normalizzati,

    (
        SELECT
            coalesce(
                c.reloptions,
                ARRAY[]::text[]
            ) @> ARRAY['security_invoker=true']
        FROM pg_class AS c
        WHERE c.oid =
            'public.vista_audit_dettagliato'::regclass
    ) AS security_invoker,

    has_table_privilege(
        'anon',
        'public.audit_log',
        'SELECT'
    ) AS anon_select_audit,

    has_table_privilege(
        'authenticated',
        'public.audit_log',
        'SELECT'
    ) AS authenticated_select_audit,

    has_table_privilege(
        'authenticated',
        'public.audit_log',
        'INSERT'
    ) AS authenticated_insert_audit,

    has_table_privilege(
        'authenticated',
        'public.vista_audit_dettagliato',
        'SELECT'
    ) AS authenticated_select_vista;