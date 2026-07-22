-- ============================================================================
-- FILE: sql/16-Hardening-Relazione-Asset-Fornitore-v1.0.sql
-- TIPO: MIGRAZIONE PRODUTTIVA
-- VERSIONE: 1.0
--
-- PROGETTO:
--   NIS2 Asset Inventory Manager
--
-- SCOPO:
--   1. creare una tassonomia delle relazioni asset-fornitore;
--   2. creare una relazione diretta molti-a-molti tra asset e fornitori;
--   3. distinguere produzione, fornitura, licenza, manutenzione, supporto,
--      hosting e integrazione;
--   4. consentire più relazioni contemporanee per la stessa coppia;
--   5. individuare un fornitore primario per asset e tipologia;
--   6. storicizzare apertura e chiusura delle relazioni;
--   7. impedire duplicazioni attive e riattivazioni di relazioni chiuse;
--   8. applicare RLS e privilegi coerenti con il modello di sicurezza.
--
-- RISULTATO ATTESO:
--   - tabelle public prima della migrazione: 28;
--   - nuove tabelle: 2;
--   - tabelle public dopo la migrazione: 30;
--   - tipi di relazione attivi: 8;
--   - relazioni asset-fornitore iniziali: 0.
--
-- DECISIONE SUI DATI:
--   Le coppie individuate dalla diagnostica X12 non vengono inserite
--   automaticamente. La partecipazione di un asset e di un fornitore allo
--   stesso servizio rappresenta una correlazione indiretta, non una prova
--   sufficiente di una relazione diretta di fornitura.
--
-- PREREQUISITI:
--   - pipeline produttiva eseguita fino allo script 15;
--   - diagnostica X12 eseguita con esito positivo.
-- ============================================================================

BEGIN;


-- ============================================================================
-- 1. CREAZIONE DELLA TASSONOMIA DELLE RELAZIONI ASSET-FORNITORE
-- ============================================================================

CREATE TABLE public.tipo_relazione_asset_fornitore (
    id bigint GENERATED ALWAYS AS IDENTITY,

    codice varchar(60) NOT NULL,

    nome varchar(120) NOT NULL,

    descrizione text,

    attiva boolean NOT NULL DEFAULT true,

    creato_il timestamp with time zone
        NOT NULL
        DEFAULT now(),

    aggiornato_il timestamp with time zone
        NOT NULL
        DEFAULT now(),

    CONSTRAINT tipo_relazione_asset_fornitore_pkey
        PRIMARY KEY (id),

    CONSTRAINT tipo_relazione_asset_fornitore_codice_key
        UNIQUE (codice),

    CONSTRAINT tipo_relazione_asset_fornitore_nome_key
        UNIQUE (nome),

    CONSTRAINT tipo_relazione_asset_fornitore_codice_formato_ck
        CHECK (
            codice
            ~ '^[A-Z0-9]+(?:_[A-Z0-9]+)*$'
        )
);


COMMENT ON TABLE public.tipo_relazione_asset_fornitore IS
    'Tassonomia delle relazioni dirette tra asset e fornitori.';


COMMENT ON COLUMN public.tipo_relazione_asset_fornitore.codice IS
    'Codice applicativo stabile della tipologia di relazione asset-fornitore.';


-- ============================================================================
-- 2. POPOLAMENTO DELLA TASSONOMIA
-- ============================================================================

INSERT INTO public.tipo_relazione_asset_fornitore (
    codice,
    nome,
    descrizione,
    attiva
)
VALUES
    (
        'PRODUTTORE',
        'Produttore',
        'Il fornitore produce l''asset hardware o sviluppa il componente software.',
        true
    ),
    (
        'FORNITURA',
        'Fornitura',
        'Il fornitore ha fornito commercialmente l''asset all''organizzazione.',
        true
    ),
    (
        'LICENZA_SOFTWARE',
        'Licenza software',
        'Il fornitore concede o gestisce la licenza software associata all''asset.',
        true
    ),
    (
        'MANUTENZIONE',
        'Manutenzione',
        'Il fornitore svolge attività di manutenzione sull''asset.',
        true
    ),
    (
        'SUPPORTO_TECNICO',
        'Supporto tecnico',
        'Il fornitore eroga assistenza o supporto tecnico relativo all''asset.',
        true
    ),
    (
        'HOSTING_CLOUD',
        'Hosting o servizio cloud',
        'L''asset è ospitato o erogato attraverso l''infrastruttura cloud del fornitore.',
        true
    ),
    (
        'INTEGRAZIONE',
        'Integrazione',
        'Il fornitore ha installato, configurato o integrato l''asset nel sistema informativo.',
        true
    ),
    (
        'ALTRO',
        'Altra relazione',
        'Tipologia residuale per relazioni non comprese nelle categorie precedenti.',
        true
    );


-- ============================================================================
-- 3. CREAZIONE DELLA RELAZIONE DIRETTA ASSET-FORNITORE
--
-- Il modello consente:
--   - più fornitori per lo stesso asset;
--   - più asset per lo stesso fornitore;
--   - più tipologie per la stessa coppia asset-fornitore;
--   - un fornitore primario per ciascun asset e tipologia;
--   - relazioni storiche chiuse;
--   - riferimenti contrattuali opzionali.
-- ============================================================================

CREATE TABLE public.asset_fornitore (
    id bigint GENERATED ALWAYS AS IDENTITY,

    asset_id integer NOT NULL,

    fornitore_id integer NOT NULL,

    tipo_relazione_asset_fornitore_id bigint NOT NULL,

    descrizione text,

    riferimento_contratto varchar(160),

    attiva boolean NOT NULL DEFAULT true,

    valido_dal date NOT NULL DEFAULT current_date,

    valido_al date,

    relazione_primaria boolean NOT NULL DEFAULT false,

    motivo_chiusura text,

    creato_il timestamp with time zone
        NOT NULL
        DEFAULT now(),

    aggiornato_il timestamp with time zone
        NOT NULL
        DEFAULT now(),

    CONSTRAINT asset_fornitore_pkey
        PRIMARY KEY (id),

    CONSTRAINT asset_fornitore_asset_fkey
        FOREIGN KEY (asset_id)
        REFERENCES public.asset (id)
        ON DELETE RESTRICT,

    CONSTRAINT asset_fornitore_fornitore_fkey
        FOREIGN KEY (fornitore_id)
        REFERENCES public.fornitore (id)
        ON DELETE RESTRICT,

    CONSTRAINT asset_fornitore_tipo_relazione_fkey
        FOREIGN KEY (tipo_relazione_asset_fornitore_id)
        REFERENCES public.tipo_relazione_asset_fornitore (id)
        ON DELETE RESTRICT,

    CONSTRAINT asset_fornitore_validita_ck
        CHECK (
            valido_al IS NULL
            OR valido_al >= valido_dal
        ),

    CONSTRAINT asset_fornitore_stato_temporale_ck
        CHECK (
            (
                attiva = true
                AND valido_al IS NULL
            )
            OR
            (
                attiva = false
                AND valido_al IS NOT NULL
            )
        ),

    CONSTRAINT asset_fornitore_primaria_attiva_ck
        CHECK (
            relazione_primaria = false
            OR attiva = true
        ),

    CONSTRAINT asset_fornitore_riferimento_contratto_ck
        CHECK (
            riferimento_contratto IS NULL
            OR btrim(riferimento_contratto) <> ''
        )
);


COMMENT ON TABLE public.asset_fornitore IS
    'Relazioni dirette, tipizzate e storicizzate tra asset e fornitori.';


COMMENT ON COLUMN public.asset_fornitore.relazione_primaria IS
    'Indica il fornitore principale per l''asset e la specifica tipologia di relazione.';


COMMENT ON COLUMN public.asset_fornitore.riferimento_contratto IS
    'Riferimento opzionale al contratto, ordine o accordo relativo alla relazione.';


-- ============================================================================
-- 4. INDICI DI SUPPORTO
-- ============================================================================

CREATE INDEX idx_asset_fornitore_asset
    ON public.asset_fornitore (
        asset_id
    );


CREATE INDEX idx_asset_fornitore_fornitore
    ON public.asset_fornitore (
        fornitore_id
    );


CREATE INDEX idx_asset_fornitore_tipo
    ON public.asset_fornitore (
        tipo_relazione_asset_fornitore_id
    );


CREATE INDEX idx_asset_fornitore_attiva
    ON public.asset_fornitore (
        attiva
    );


CREATE INDEX idx_asset_fornitore_validita
    ON public.asset_fornitore (
        valido_dal,
        valido_al
    );


-- ============================================================================
-- 5. UNICITA' DELLA RELAZIONE ATTIVA
--
-- La stessa coppia asset-fornitore può avere più tipologie, ma non può avere
-- due relazioni attive duplicate della stessa tipologia.
-- ============================================================================

CREATE UNIQUE INDEX uq_asset_fornitore_relazione_attiva
    ON public.asset_fornitore (
        asset_id,
        fornitore_id,
        tipo_relazione_asset_fornitore_id
    )
    WHERE attiva = true;


-- ============================================================================
-- 6. UNICO FORNITORE PRIMARIO PER ASSET E TIPOLOGIA
--
-- Un asset può avere più fornitori attivi per la stessa tipologia, ma soltanto
-- uno può essere contrassegnato come primario.
-- ============================================================================

CREATE UNIQUE INDEX uq_asset_fornitore_primaria_attiva
    ON public.asset_fornitore (
        asset_id,
        tipo_relazione_asset_fornitore_id
    )
    WHERE attiva = true
      AND relazione_primaria = true;


-- ============================================================================
-- 7. FUNZIONE DI VALIDAZIONE E STORICIZZAZIONE
--
-- La funzione:
--   - impedisce l'utilizzo di tipi di relazione disattivati;
--   - impedisce la riattivazione di relazioni chiuse;
--   - valorizza automaticamente la data di chiusura;
--   - rimuove il flag primario dalle relazioni chiuse;
--   - mantiene nullo valido_al per le relazioni attive;
--   - aggiorna il timestamp aggiornato_il.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_validate_asset_fornitore()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tipo_attivo boolean;
BEGIN
    IF TG_OP = 'UPDATE'
       AND OLD.attiva = false
       AND NEW.attiva = true THEN
        RAISE EXCEPTION
            'Una relazione asset-fornitore chiusa non può essere riattivata. Creare una nuova relazione.';
    END IF;

    IF NEW.attiva = false THEN
        IF NEW.valido_al IS NULL THEN
            NEW.valido_al := greatest(
                current_date,
                NEW.valido_dal
            );
        END IF;

        NEW.relazione_primaria := false;
    ELSE
        NEW.valido_al := NULL;
    END IF;

    IF NEW.attiva = true THEN
        SELECT traf.attiva
        INTO v_tipo_attivo
        FROM public.tipo_relazione_asset_fornitore AS traf
        WHERE traf.id = NEW.tipo_relazione_asset_fornitore_id;

        IF coalesce(v_tipo_attivo, false) = false THEN
            RAISE EXCEPTION
                'Tipo di relazione asset-fornitore non esistente o non attivo: %.',
                NEW.tipo_relazione_asset_fornitore_id;
        END IF;
    END IF;

    NEW.aggiornato_il := now();

    RETURN NEW;
END;
$$;


REVOKE ALL
ON FUNCTION public.fn_validate_asset_fornitore()
FROM PUBLIC;


REVOKE ALL
ON FUNCTION public.fn_validate_asset_fornitore()
FROM anon;


REVOKE ALL
ON FUNCTION public.fn_validate_asset_fornitore()
FROM authenticated;


-- ============================================================================
-- 8. TRIGGER DI VALIDAZIONE
-- ============================================================================

CREATE TRIGGER trg_validate_asset_fornitore
BEFORE INSERT OR UPDATE
ON public.asset_fornitore
FOR EACH ROW
EXECUTE FUNCTION public.fn_validate_asset_fornitore();


-- ============================================================================
-- 9. ABILITAZIONE DELLA ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.tipo_relazione_asset_fornitore
    ENABLE ROW LEVEL SECURITY;


ALTER TABLE public.asset_fornitore
    ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- 10. POLICY DI LETTURA DELLA TASSONOMIA
-- ============================================================================

CREATE POLICY "Read_All_Policy"
ON public.tipo_relazione_asset_fornitore
FOR SELECT
TO authenticated
USING (
    (
        auth.jwt() ->> 'aal'
    ) = 'aal2'
    OR
    lower(
        coalesce(
            auth.jwt() ->> 'email',
            ''
        )
    ) = lower(
        'docentepegaso@gmail.com'
    )
);


-- ============================================================================
-- 11. POLICY DI LETTURA DELLE RELAZIONI ASSET-FORNITORE
-- ============================================================================

CREATE POLICY "Read_All_Policy"
ON public.asset_fornitore
FOR SELECT
TO authenticated
USING (
    (
        auth.jwt() ->> 'aal'
    ) = 'aal2'
    OR
    lower(
        coalesce(
            auth.jwt() ->> 'email',
            ''
        )
    ) = lower(
        'docentepegaso@gmail.com'
    )
);


-- ============================================================================
-- 12. POLICY DI INSERIMENTO DELLE RELAZIONI
-- ============================================================================

CREATE POLICY "Insert_MFA_Policy"
ON public.asset_fornitore
FOR INSERT
TO authenticated
WITH CHECK (
    (
        auth.jwt() ->> 'aal'
    ) = 'aal2'
);


-- ============================================================================
-- 13. POLICY DI AGGIORNAMENTO DELLE RELAZIONI
-- ============================================================================

CREATE POLICY "Update_MFA_Policy"
ON public.asset_fornitore
FOR UPDATE
TO authenticated
USING (
    (
        auth.jwt() ->> 'aal'
    ) = 'aal2'
)
WITH CHECK (
    (
        auth.jwt() ->> 'aal'
    ) = 'aal2'
);


-- ============================================================================
-- 14. PRIVILEGI DELLE NUOVE TABELLE
-- ============================================================================

REVOKE ALL
ON TABLE public.tipo_relazione_asset_fornitore
FROM anon;


REVOKE ALL
ON TABLE public.tipo_relazione_asset_fornitore
FROM authenticated;


REVOKE ALL
ON TABLE public.asset_fornitore
FROM anon;


REVOKE ALL
ON TABLE public.asset_fornitore
FROM authenticated;


GRANT SELECT
ON TABLE public.tipo_relazione_asset_fornitore
TO authenticated;


GRANT SELECT, INSERT, UPDATE
ON TABLE public.asset_fornitore
TO authenticated;


-- ============================================================================
-- 15. PRIVILEGI DELLE SEQUENZE IDENTITY
-- ============================================================================

REVOKE ALL
ON SEQUENCE public.tipo_relazione_asset_fornitore_id_seq
FROM anon;


REVOKE ALL
ON SEQUENCE public.tipo_relazione_asset_fornitore_id_seq
FROM authenticated;


REVOKE ALL
ON SEQUENCE public.asset_fornitore_id_seq
FROM anon;


REVOKE ALL
ON SEQUENCE public.asset_fornitore_id_seq
FROM authenticated;


GRANT USAGE, SELECT
ON SEQUENCE public.asset_fornitore_id_seq
TO authenticated;


-- ============================================================================
-- 16. VERIFICA FINALE BLOCCANTE
-- ============================================================================

DO $$
DECLARE
    v_nuove_tabelle integer;
    v_tipi_relazione integer;
    v_relazioni_iniziali integer;
    v_rls_attive integer;
BEGIN
    SELECT count(*)
    INTO v_nuove_tabelle
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name IN (
          'tipo_relazione_asset_fornitore',
          'asset_fornitore'
      );

    SELECT count(*)
    INTO v_tipi_relazione
    FROM public.tipo_relazione_asset_fornitore
    WHERE attiva = true;

    SELECT count(*)
    INTO v_relazioni_iniziali
    FROM public.asset_fornitore;

    SELECT count(*)
    INTO v_rls_attive
    FROM pg_class AS c
    JOIN pg_namespace AS n
        ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN (
          'tipo_relazione_asset_fornitore',
          'asset_fornitore'
      )
      AND c.relrowsecurity = true;

    IF v_nuove_tabelle <> 2 THEN
        RAISE EXCEPTION
            'Verifica finale fallita: risultano % nuove tabelle invece di 2.',
            v_nuove_tabelle;
    END IF;

    IF v_tipi_relazione <> 8 THEN
        RAISE EXCEPTION
            'Verifica finale fallita: risultano % tipi di relazione attivi invece di 8.',
            v_tipi_relazione;
    END IF;

    IF v_relazioni_iniziali <> 0 THEN
        RAISE EXCEPTION
            'Verifica finale fallita: sono state create % relazioni asset-fornitore non validate.',
            v_relazioni_iniziali;
    END IF;

    IF v_rls_attive <> 2 THEN
        RAISE EXCEPTION
            'Verifica finale fallita: RLS attiva soltanto su % nuove tabelle.',
            v_rls_attive;
    END IF;
END;
$$;


COMMIT;


-- ============================================================================
-- 17. RISULTATO FINALE
-- ============================================================================

SELECT
    'SCRIPT_16_COMPLETATO' AS esito,

    (
        SELECT count(*)
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
    ) AS numero_tabelle_public,

    (
        SELECT count(*)
        FROM public.tipo_relazione_asset_fornitore
        WHERE attiva = true
    ) AS tipi_relazione_attivi,

    (
        SELECT count(*)
        FROM public.asset_fornitore
    ) AS relazioni_asset_fornitore,

    (
        SELECT relrowsecurity
        FROM pg_class
        WHERE oid = 'public.tipo_relazione_asset_fornitore'::regclass
    ) AS rls_tipo_relazione,

    (
        SELECT relrowsecurity
        FROM pg_class
        WHERE oid = 'public.asset_fornitore'::regclass
    ) AS rls_asset_fornitore;