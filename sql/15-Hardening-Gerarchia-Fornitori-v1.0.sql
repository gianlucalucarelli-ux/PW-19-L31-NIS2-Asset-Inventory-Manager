-- ============================================================================
-- FILE: sql/15-Hardening-Gerarchia-Fornitori-v1.0.sql
-- TIPO: MIGRAZIONE PRODUTTIVA
-- VERSIONE: 1.0
--
-- PROGETTO:
--   NIS2 Asset Inventory Manager
--
-- SCOPO:
--   1. introdurre un codice applicativo stabile per ogni fornitore;
--   2. completare la tassonomia dei fornitori esistenti;
--   3. rendere obbligatoria la classificazione del fornitore;
--   4. creare la tassonomia delle relazioni tra fornitori;
--   5. creare la gerarchia fornitore-subfornitore;
--   6. supportare relazioni storicizzate e piú fornitori padre;
--   7. impedire auto-relazioni, riattivazioni e cicli gerarchici;
--   8. applicare RLS e privilegi coerenti con il modello di sicurezza.
--
-- RISULTATO ATTESO:
--   - tabelle public prima della migrazione: 26;
--   - nuove tabelle: 2;
--   - tabelle public dopo la migrazione: 28;
--   - fornitori senza tipologia: 0;
--   - codice_fornitore valorizzato, NOT NULL e UNIQUE.
--
-- PREREQUISITI:
--   - pipeline produttiva eseguita fino allo script 14;
--   - diagnostica X11 eseguita con esito positivo.
--
-- SICUREZZA:
--   - nessun privilegio per il ruolo anon;
--   - nessun privilegio DELETE per i ruoli applicativi;
--   - lettura consentita con MFA AAL2 oppure all'utenza docente;
--   - le nuove tabelle gerarchiche restano in sola lettura applicativa
--     fino al successivo completamento delle procedure di archiviazione.
-- ============================================================================

BEGIN;


-- ============================================================================
-- 1. COMPLETAMENTO DELLA TASSONOMIA DEI FORNITORI
--
-- La tabella tipo_fornitore contiene attualmente soltanto:
--   Hardware Vendor
--
-- Vengono introdotte le ulteriori categorie necessarie a classificare
-- correttamente tutti i fornitori presenti nel database.
-- ============================================================================

INSERT INTO public.tipo_fornitore (
    nome
)
VALUES
    ('Hardware Vendor'),
    ('Software Vendor'),
    ('Cloud Service Provider'),
    ('Cybersecurity Vendor'),
    ('Open Source Software Provider')
ON CONFLICT (nome) DO NOTHING;


-- ============================================================================
-- 2. CLASSIFICAZIONE DEI FORNITORI ESISTENTI
--
-- L'associazione viene effettuata tramite il nome del fornitore e il nome
-- della tipologia, senza utilizzare identificativi numerici hardcoded.
-- ============================================================================

WITH classificazione (
    nome_fornitore,
    nome_tipo_fornitore
) AS (
    VALUES
        (
            'Fortinet Sec',
            'Cybersecurity Vendor'
        ),
        (
            'Microsoft Corporation',
            'Cloud Service Provider'
        ),
        (
            'Cisco Systems',
            'Hardware Vendor'
        ),
        (
            'Fortinet Inc.',
            'Cybersecurity Vendor'
        ),
        (
            'PostgreSQL Global Group',
            'Open Source Software Provider'
        ),
        (
            'Palo Alto Networks',
            'Cybersecurity Vendor'
        )
)
UPDATE public.fornitore AS f
SET tipo_fornitore_id = tf.id
FROM classificazione AS c
JOIN public.tipo_fornitore AS tf
    ON lower(btrim(tf.nome))
       = lower(btrim(c.nome_tipo_fornitore))
WHERE lower(btrim(f.nome))
      = lower(btrim(c.nome_fornitore));


-- ============================================================================
-- 3. VERIFICA DELLA CLASSIFICAZIONE
--
-- La migrazione viene interrotta se anche un solo fornitore rimane privo
-- della relativa tipologia.
-- ============================================================================

DO $$
DECLARE
    v_fornitori_senza_tipo integer;
    v_elenco text;
BEGIN
    SELECT
        count(*),
        string_agg(
            format(
                '[id=%s, nome=%s]',
                f.id,
                f.nome
            ),
            ', '
            ORDER BY f.id
        )
    INTO
        v_fornitori_senza_tipo,
        v_elenco
    FROM public.fornitore AS f
    WHERE f.tipo_fornitore_id IS NULL;

    IF v_fornitori_senza_tipo > 0 THEN
        RAISE EXCEPTION
            'Classificazione incompleta: % fornitori senza tipo. Dettaglio: %',
            v_fornitori_senza_tipo,
            coalesce(v_elenco, 'non disponibile');
    END IF;
END;
$$;


-- ============================================================================
-- 4. OBBLIGATORIETA' DELLA TIPOLOGIA DEL FORNITORE
-- ============================================================================

ALTER TABLE public.fornitore
    ALTER COLUMN tipo_fornitore_id SET NOT NULL;


-- ============================================================================
-- 5. INTRODUZIONE DEL CODICE APPLICATIVO STABILE
--
-- Il codice applicativo:
--   - non dipende dall'identificativo numerico;
--   - può essere utilizzato da frontend, importazioni ed esportazioni;
--   - non deve cambiare in caso di modifica della denominazione descrittiva.
-- ============================================================================

ALTER TABLE public.fornitore
    ADD COLUMN IF NOT EXISTS codice_fornitore varchar(80);


-- ============================================================================
-- 6. POPOLAMENTO DEI CODICI DEI FORNITORI ESISTENTI
--
-- I codici corrispondono a quelli verificati dalla diagnostica X11.
-- Per eventuali record non previsti viene utilizzato un codice legacy
-- deterministico basato sull'identificativo primario.
-- ============================================================================

UPDATE public.fornitore
SET codice_fornitore = CASE lower(btrim(nome))
    WHEN 'fortinet sec'
        THEN 'FORTINET_SEC'

    WHEN 'microsoft corporation'
        THEN 'MICROSOFT_CORPORATION'

    WHEN 'cisco systems'
        THEN 'CISCO_SYSTEMS'

    WHEN 'fortinet inc.'
        THEN 'FORTINET_INC'

    WHEN 'postgresql global group'
        THEN 'POSTGRESQL_GLOBAL_GROUP'

    WHEN 'palo alto networks'
        THEN 'PALO_ALTO_NETWORKS'

    ELSE
        'FORNITORE_' || id::text
END
WHERE codice_fornitore IS NULL
   OR btrim(codice_fornitore) = '';


-- ============================================================================
-- 7. NORMALIZZAZIONE DEI CODICI
-- ============================================================================

UPDATE public.fornitore
SET codice_fornitore = upper(btrim(codice_fornitore))
WHERE codice_fornitore IS NOT NULL;


-- ============================================================================
-- 8. VERIFICA DEI CODICI PRIMA DELL'APPLICAZIONE DEI VINCOLI
-- ============================================================================

DO $$
DECLARE
    v_codici_nulli integer;
    v_codici_invalidi integer;
    v_codici_duplicati integer;
BEGIN
    SELECT count(*)
    INTO v_codici_nulli
    FROM public.fornitore
    WHERE codice_fornitore IS NULL
       OR btrim(codice_fornitore) = '';

    IF v_codici_nulli > 0 THEN
        RAISE EXCEPTION
            'Impossibile rendere codice_fornitore obbligatorio: % codici mancanti.',
            v_codici_nulli;
    END IF;

    SELECT count(*)
    INTO v_codici_invalidi
    FROM public.fornitore
    WHERE codice_fornitore !~ '^[A-Z0-9]+(?:_[A-Z0-9]+)*$';

    IF v_codici_invalidi > 0 THEN
        RAISE EXCEPTION
            'Sono presenti % codici fornitore con formato non valido.',
            v_codici_invalidi;
    END IF;

    SELECT count(*)
    INTO v_codici_duplicati
    FROM (
        SELECT codice_fornitore
        FROM public.fornitore
        GROUP BY codice_fornitore
        HAVING count(*) > 1
    ) AS duplicati;

    IF v_codici_duplicati > 0 THEN
        RAISE EXCEPTION
            'Sono presenti % collisioni tra i codici fornitore.',
            v_codici_duplicati;
    END IF;
END;
$$;


-- ============================================================================
-- 9. VINCOLI DEL CODICE FORNITORE
-- ============================================================================

ALTER TABLE public.fornitore
    ALTER COLUMN codice_fornitore SET NOT NULL;


DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.fornitore'::regclass
          AND conname = 'fornitore_codice_fornitore_key'
    ) THEN
        ALTER TABLE public.fornitore
            ADD CONSTRAINT fornitore_codice_fornitore_key
            UNIQUE (codice_fornitore);
    END IF;
END;
$$;


DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.fornitore'::regclass
          AND conname = 'fornitore_codice_fornitore_formato_ck'
    ) THEN
        ALTER TABLE public.fornitore
            ADD CONSTRAINT fornitore_codice_fornitore_formato_ck
            CHECK (
                codice_fornitore
                ~ '^[A-Z0-9]+(?:_[A-Z0-9]+)*$'
            );
    END IF;
END;
$$;


COMMENT ON COLUMN public.fornitore.codice_fornitore IS
    'Codice applicativo stabile e univoco del fornitore.';


-- ============================================================================
-- 10. CREAZIONE DELLA TASSONOMIA DELLE RELAZIONI TRA FORNITORI
-- ============================================================================

CREATE TABLE public.tipo_relazione_fornitore (
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

    CONSTRAINT tipo_relazione_fornitore_pkey
        PRIMARY KEY (id),

    CONSTRAINT tipo_relazione_fornitore_codice_key
        UNIQUE (codice),

    CONSTRAINT tipo_relazione_fornitore_nome_key
        UNIQUE (nome),

    CONSTRAINT tipo_relazione_fornitore_codice_formato_ck
        CHECK (
            codice
            ~ '^[A-Z0-9]+(?:_[A-Z0-9]+)*$'
        )
);


COMMENT ON TABLE public.tipo_relazione_fornitore IS
    'Tassonomia delle relazioni gerarchiche e operative tra fornitori.';


COMMENT ON COLUMN public.tipo_relazione_fornitore.codice IS
    'Codice applicativo stabile della tipologia di relazione.';


-- ============================================================================
-- 11. POPOLAMENTO DELLA TASSONOMIA DELLE RELAZIONI
-- ============================================================================

INSERT INTO public.tipo_relazione_fornitore (
    codice,
    nome,
    descrizione,
    attiva
)
VALUES
    (
        'SUBFORNITURA',
        'Subfornitura',
        'Il fornitore figlio opera come subfornitore del fornitore padre.',
        true
    ),
    (
        'DISTRIBUZIONE',
        'Distribuzione',
        'Il fornitore figlio distribuisce prodotti o servizi del fornitore padre.',
        true
    ),
    (
        'RIVENDITA',
        'Rivendita',
        'Il fornitore figlio rivende prodotti o servizi del fornitore padre.',
        true
    ),
    (
        'PARTNERSHIP_TECNOLOGICA',
        'Partnership tecnologica',
        'Relazione di collaborazione tecnologica tra il fornitore padre e il fornitore figlio.',
        true
    ),
    (
        'LICENZA_OEM',
        'Licenza OEM',
        'Il fornitore figlio incorpora o utilizza componenti del fornitore padre tramite accordo OEM.',
        true
    ),
    (
        'ALTRO',
        'Altra relazione',
        'Tipologia residuale per relazioni non comprese nelle categorie precedenti.',
        true
    )
ON CONFLICT (codice) DO UPDATE
SET
    nome = EXCLUDED.nome,
    descrizione = EXCLUDED.descrizione,
    attiva = EXCLUDED.attiva,
    aggiornato_il = now();


-- ============================================================================
-- 12. CREAZIONE DELLA GERARCHIA FORNITORE-SUBFORNITORE
--
-- Il modello consente:
--   - più fornitori padre per uno stesso fornitore figlio;
--   - una sola relazione primaria attiva per ciascun fornitore figlio;
--   - storicizzazione delle relazioni chiuse;
--   - classificazione della relazione;
--   - ordinamento opzionale delle relazioni.
-- ============================================================================

CREATE TABLE public.fornitore_relazione (
    id bigint GENERATED ALWAYS AS IDENTITY,

    fornitore_padre_id integer NOT NULL,

    fornitore_figlio_id integer NOT NULL,

    tipo_relazione_fornitore_id bigint NOT NULL,

    descrizione text,

    attiva boolean NOT NULL DEFAULT true,

    valido_dal date NOT NULL DEFAULT current_date,

    valido_al date,

    relazione_primaria boolean NOT NULL DEFAULT false,

    ordine_relazione integer,

    motivo_chiusura text,

    creato_il timestamp with time zone
        NOT NULL
        DEFAULT now(),

    aggiornato_il timestamp with time zone
        NOT NULL
        DEFAULT now(),

    CONSTRAINT fornitore_relazione_pkey
        PRIMARY KEY (id),

    CONSTRAINT fornitore_relazione_padre_fkey
        FOREIGN KEY (fornitore_padre_id)
        REFERENCES public.fornitore (id)
        ON DELETE RESTRICT,

    CONSTRAINT fornitore_relazione_figlio_fkey
        FOREIGN KEY (fornitore_figlio_id)
        REFERENCES public.fornitore (id)
        ON DELETE RESTRICT,

    CONSTRAINT fornitore_relazione_tipo_fkey
        FOREIGN KEY (tipo_relazione_fornitore_id)
        REFERENCES public.tipo_relazione_fornitore (id)
        ON DELETE RESTRICT,

    CONSTRAINT fornitore_relazione_no_autorelazione_ck
        CHECK (
            fornitore_padre_id <> fornitore_figlio_id
        ),

    CONSTRAINT fornitore_relazione_validita_ck
        CHECK (
            valido_al IS NULL
            OR valido_al >= valido_dal
        ),

    CONSTRAINT fornitore_relazione_stato_temporale_ck
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

    CONSTRAINT fornitore_relazione_primaria_attiva_ck
        CHECK (
            relazione_primaria = false
            OR attiva = true
        ),

    CONSTRAINT fornitore_relazione_ordine_ck
        CHECK (
            ordine_relazione IS NULL
            OR ordine_relazione > 0
        )
);


COMMENT ON TABLE public.fornitore_relazione IS
    'Relazioni gerarchiche e storicizzate tra fornitori e subfornitori.';


COMMENT ON COLUMN public.fornitore_relazione.fornitore_padre_id IS
    'Fornitore posto al livello superiore della relazione.';


COMMENT ON COLUMN public.fornitore_relazione.fornitore_figlio_id IS
    'Fornitore o subfornitore posto al livello inferiore della relazione.';


COMMENT ON COLUMN public.fornitore_relazione.relazione_primaria IS
    'Indica la relazione principale del fornitore figlio, quando presente.';


-- ============================================================================
-- 13. INDICI DELLA GERARCHIA
-- ============================================================================

CREATE INDEX idx_fornitore_relazione_padre
    ON public.fornitore_relazione (
        fornitore_padre_id
    );


CREATE INDEX idx_fornitore_relazione_figlio
    ON public.fornitore_relazione (
        fornitore_figlio_id
    );


CREATE INDEX idx_fornitore_relazione_tipo
    ON public.fornitore_relazione (
        tipo_relazione_fornitore_id
    );


CREATE INDEX idx_fornitore_relazione_attiva
    ON public.fornitore_relazione (
        attiva
    );


CREATE INDEX idx_fornitore_relazione_validita
    ON public.fornitore_relazione (
        valido_dal,
        valido_al
    );


-- ============================================================================
-- 14. UNICITA' DELLE RELAZIONI ATTIVE
--
-- Non possono esistere contemporaneamente due relazioni attive tra la stessa
-- coppia padre-figlio.
-- ============================================================================

CREATE UNIQUE INDEX uq_fornitore_relazione_coppia_attiva
    ON public.fornitore_relazione (
        fornitore_padre_id,
        fornitore_figlio_id
    )
    WHERE attiva = true;


-- ============================================================================
-- 15. UNICA RELAZIONE PRIMARIA ATTIVA PER FORNITORE FIGLIO
-- ============================================================================

CREATE UNIQUE INDEX uq_fornitore_relazione_primaria_attiva
    ON public.fornitore_relazione (
        fornitore_figlio_id
    )
    WHERE attiva = true
      AND relazione_primaria = true;


-- ============================================================================
-- 16. FUNZIONE DI VALIDAZIONE DELLA GERARCHIA
--
-- La funzione:
--   - impedisce auto-relazioni;
--   - impedisce l'utilizzo di tipi di relazione disattivati;
--   - impedisce la riattivazione di relazioni storicamente chiuse;
--   - completa automaticamente la data di chiusura;
--   - rimuove il flag primario dalle relazioni chiuse;
--   - impedisce la formazione di cicli gerarchici;
--   - aggiorna il timestamp aggiornato_il.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_validate_fornitore_relazione()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tipo_attivo boolean;
    v_ciclo_rilevato boolean;
BEGIN
    IF NEW.fornitore_padre_id = NEW.fornitore_figlio_id THEN
        RAISE EXCEPTION
            'Relazione fornitore non valida: padre e figlio coincidono (%).',
            NEW.fornitore_padre_id;
    END IF;

    IF TG_OP = 'UPDATE'
       AND OLD.attiva = false
       AND NEW.attiva = true THEN
        RAISE EXCEPTION
            'Una relazione fornitore chiusa non può essere riattivata. Creare una nuova relazione.';
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
        SELECT trf.attiva
        INTO v_tipo_attivo
        FROM public.tipo_relazione_fornitore AS trf
        WHERE trf.id = NEW.tipo_relazione_fornitore_id;

        IF coalesce(v_tipo_attivo, false) = false THEN
            RAISE EXCEPTION
                'Tipo di relazione fornitore non esistente o non attivo: %.',
                NEW.tipo_relazione_fornitore_id;
        END IF;

        WITH RECURSIVE percorso_fornitori AS (
            SELECT
                fr.fornitore_figlio_id
            FROM public.fornitore_relazione AS fr
            WHERE fr.fornitore_padre_id
                  = NEW.fornitore_figlio_id
              AND fr.attiva = true
              AND fr.id <> coalesce(NEW.id, -1)

            UNION

            SELECT
                fr.fornitore_figlio_id
            FROM public.fornitore_relazione AS fr
            JOIN percorso_fornitori AS percorso
                ON fr.fornitore_padre_id
                   = percorso.fornitore_figlio_id
            WHERE fr.attiva = true
              AND fr.id <> coalesce(NEW.id, -1)
        )
        SELECT EXISTS (
            SELECT 1
            FROM percorso_fornitori
            WHERE fornitore_figlio_id
                  = NEW.fornitore_padre_id
        )
        INTO v_ciclo_rilevato;

        IF v_ciclo_rilevato THEN
            RAISE EXCEPTION
                'Relazione fornitore non valida: il collegamento % -> % genererebbe un ciclo gerarchico.',
                NEW.fornitore_padre_id,
                NEW.fornitore_figlio_id;
        END IF;
    END IF;

    NEW.aggiornato_il := now();

    RETURN NEW;
END;
$$;


REVOKE ALL
ON FUNCTION public.fn_validate_fornitore_relazione()
FROM PUBLIC;


REVOKE ALL
ON FUNCTION public.fn_validate_fornitore_relazione()
FROM anon;


REVOKE ALL
ON FUNCTION public.fn_validate_fornitore_relazione()
FROM authenticated;


-- ============================================================================
-- 17. TRIGGER DI VALIDAZIONE
-- ============================================================================

CREATE TRIGGER trg_validate_fornitore_relazione
BEFORE INSERT OR UPDATE
ON public.fornitore_relazione
FOR EACH ROW
EXECUTE FUNCTION public.fn_validate_fornitore_relazione();


-- ============================================================================
-- 18. ABILITAZIONE DELLA ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.tipo_relazione_fornitore
    ENABLE ROW LEVEL SECURITY;


ALTER TABLE public.fornitore_relazione
    ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- 19. POLICY DI LETTURA DELLA TASSONOMIA DELLE RELAZIONI
-- ============================================================================

CREATE POLICY "Read_All_Policy"
ON public.tipo_relazione_fornitore
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
-- 20. POLICY DI LETTURA DELLA GERARCHIA DEI FORNITORI
-- ============================================================================

CREATE POLICY "Read_All_Policy"
ON public.fornitore_relazione
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
-- 21. PRIVILEGI DELLE NUOVE TABELLE
--
-- Le nuove tabelle sono rese disponibili in sola lettura all'applicazione.
-- Nessun accesso viene concesso al ruolo anon.
-- Nessun privilegio DELETE viene concesso.
-- ============================================================================

REVOKE ALL
ON TABLE public.tipo_relazione_fornitore
FROM anon;


REVOKE ALL
ON TABLE public.tipo_relazione_fornitore
FROM authenticated;


REVOKE ALL
ON TABLE public.fornitore_relazione
FROM anon;


REVOKE ALL
ON TABLE public.fornitore_relazione
FROM authenticated;


GRANT SELECT
ON TABLE public.tipo_relazione_fornitore
TO authenticated;


GRANT SELECT
ON TABLE public.fornitore_relazione
TO authenticated;


-- ============================================================================
-- 22. PRIVILEGI DELLE SEQUENZE IDENTITY
-- ============================================================================

REVOKE ALL
ON SEQUENCE public.tipo_relazione_fornitore_id_seq
FROM anon;


REVOKE ALL
ON SEQUENCE public.tipo_relazione_fornitore_id_seq
FROM authenticated;


REVOKE ALL
ON SEQUENCE public.fornitore_relazione_id_seq
FROM anon;


REVOKE ALL
ON SEQUENCE public.fornitore_relazione_id_seq
FROM authenticated;


-- ============================================================================
-- 23. VERIFICA FINALE BLOCCANTE
-- ============================================================================

DO $$
DECLARE
    v_fornitori_senza_codice integer;
    v_fornitori_senza_tipo integer;
    v_tipi_relazione integer;
    v_nuove_tabelle integer;
BEGIN
    SELECT count(*)
    INTO v_fornitori_senza_codice
    FROM public.fornitore
    WHERE codice_fornitore IS NULL
       OR btrim(codice_fornitore) = '';

    SELECT count(*)
    INTO v_fornitori_senza_tipo
    FROM public.fornitore
    WHERE tipo_fornitore_id IS NULL;

    SELECT count(*)
    INTO v_tipi_relazione
    FROM public.tipo_relazione_fornitore
    WHERE attiva = true;

    SELECT count(*)
    INTO v_nuove_tabelle
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
          'tipo_relazione_fornitore',
          'fornitore_relazione'
      )
      AND table_type = 'BASE TABLE';

    IF v_fornitori_senza_codice <> 0 THEN
        RAISE EXCEPTION
            'Verifica finale fallita: % fornitori senza codice.',
            v_fornitori_senza_codice;
    END IF;

    IF v_fornitori_senza_tipo <> 0 THEN
        RAISE EXCEPTION
            'Verifica finale fallita: % fornitori senza tipologia.',
            v_fornitori_senza_tipo;
    END IF;

    IF v_tipi_relazione < 6 THEN
        RAISE EXCEPTION
            'Verifica finale fallita: risultano soltanto % tipi di relazione attivi.',
            v_tipi_relazione;
    END IF;

    IF v_nuove_tabelle <> 2 THEN
        RAISE EXCEPTION
            'Verifica finale fallita: risultano % nuove tabelle invece di 2.',
            v_nuove_tabelle;
    END IF;
END;
$$;


COMMIT;


-- ============================================================================
-- 24. RISULTATO FINALE DELLA MIGRAZIONE
--
-- Supabase SQL Editor mostrerà questa singola riga come risultato finale.
-- ============================================================================

SELECT
    'SCRIPT_15_COMPLETATO' AS esito,

    (
        SELECT count(*)
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
    ) AS numero_tabelle_public,

    (
        SELECT count(*)
        FROM public.fornitore
    ) AS numero_fornitori,

    (
        SELECT count(*)
        FROM public.fornitore
        WHERE codice_fornitore IS NULL
           OR btrim(codice_fornitore) = ''
    ) AS fornitori_senza_codice,

    (
        SELECT count(*)
        FROM public.fornitore
        WHERE tipo_fornitore_id IS NULL
    ) AS fornitori_senza_tipologia,

    (
        SELECT count(*)
        FROM public.tipo_fornitore
    ) AS tipologie_fornitore,

    (
        SELECT count(*)
        FROM public.tipo_relazione_fornitore
        WHERE attiva = true
    ) AS tipi_relazione_fornitore_attivi,

    (
        SELECT count(*)
        FROM public.fornitore_relazione
        WHERE attiva = true
    ) AS relazioni_fornitore_attive;