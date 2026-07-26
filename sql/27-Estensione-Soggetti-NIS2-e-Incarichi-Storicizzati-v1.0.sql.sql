-- =========================================================================
-- FILE: sql/27-Estensione-Soggetti-NIS2-e-Incarichi-Storicizzati-v1.0.sql
-- TARGET ARCHITETTURALE: ER V5.2 (30 TABELLE, 3FN PRESERVATA)
-- DESCRIZIONE: Estensione dell'anagrafica delle organizzazioni utilizzatrici
--              e storicizzazione degli incarichi aziendali NIS2/ACN.
-- =========================================================================
-- TIPO: MIGRAZIONE PRODUTTIVA
-- VERSIONE: 1.0
--
-- PROGETTO:
--   NIS2 Asset Inventory Manager
--
-- SCOPO:
--   1. mantenere public.organizzazione come soggetto NIS2 utilizzatore;
--   2. aggiungere i soli attributi atomici propri dell'organizzazione;
--   3. mantenere public.responsabile come anagrafica delle persone;
--   4. riutilizzare public.ruolo come catalogo delle figure NIS2/ACN;
--   5. trasformare public.responsabile_ruolo in relazione storicizzabile;
--   6. consentire incarichi TITOLARE, VICE e SUPPORTO;
--   7. preservare RLS, audit, blocco DELETE e accesso operativo;
--   8. abilitare il frontend alla creazione e modifica delle organizzazioni;
--   9. non aggiungere nuove tabelle e preservare la terza forma normale.
--
-- PREREQUISITI:
--   - pipeline produttiva eseguita fino allo script 26;
--   - 30 tabelle e 7 viste nello schema public;
--   - public.fn_accesso_operativo() presente;
--   - public.fn_audit_generico() presente;
--   - public.fn_blocca_cancellazione_fisica() presente;
--   - nessun record responsabile privo di organizzazione;
--   - nessun duplicato nella coppia responsabile_id/ruolo_id.
--
-- RISULTATO ATTESO:
--   - numero tabelle public invariato: 30;
--   - numero viste public invariato: 7;
--   - organizzazione estesa con dati legali, sede e contatti principali;
--   - responsabile.organizzazione_id obbligatorio;
--   - ruolo dotato di codice applicativo stabile;
--   - responsabile_ruolo dotato di chiave autonoma e validita temporale;
--   - un solo incarico TITOLARE o VICE attivo per ruolo e organizzazione;
--   - 15 tabelle operative coperte da audit e blocco DELETE;
--   - nessuna policy o privilegio DELETE;
--   - nessun privilegio per anon.
-- =========================================================================

BEGIN;


-- =========================================================================
-- 1. VERIFICHE PRELIMINARI BLOCCANTI
-- =========================================================================

DO $$
DECLARE
    v_numero_tabelle integer;
    v_numero_viste integer;
    v_responsabili_senza_organizzazione integer;
    v_duplicati_responsabile_ruolo integer;
BEGIN
    IF to_regclass('public.organizzazione') IS NULL
       OR to_regclass('public.responsabile') IS NULL
       OR to_regclass('public.ruolo') IS NULL
       OR to_regclass('public.responsabile_ruolo') IS NULL THEN
        RAISE EXCEPTION
            'Prerequisito mancante: una o piu tabelle organizzative non esistono.';
    END IF;

    IF to_regprocedure('public.fn_accesso_operativo()') IS NULL THEN
        RAISE EXCEPTION
            'Prerequisito mancante: public.fn_accesso_operativo() non esiste.';
    END IF;

    IF to_regprocedure('public.fn_audit_generico()') IS NULL THEN
        RAISE EXCEPTION
            'Prerequisito mancante: public.fn_audit_generico() non esiste.';
    END IF;

    IF to_regprocedure('public.fn_blocca_cancellazione_fisica()') IS NULL THEN
        RAISE EXCEPTION
            'Prerequisito mancante: public.fn_blocca_cancellazione_fisica() non esiste.';
    END IF;

    SELECT count(*)
    INTO v_numero_tabelle
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE';

    SELECT count(*)
    INTO v_numero_viste
    FROM information_schema.views
    WHERE table_schema = 'public';

    IF v_numero_tabelle <> 30 THEN
        RAISE EXCEPTION
            'Numero tabelle public inatteso: % invece di 30.',
            v_numero_tabelle;
    END IF;

    IF v_numero_viste <> 7 THEN
        RAISE EXCEPTION
            'Numero viste public inatteso: % invece di 7.',
            v_numero_viste;
    END IF;

    SELECT count(*)
    INTO v_responsabili_senza_organizzazione
    FROM public.responsabile
    WHERE organizzazione_id IS NULL;

    IF v_responsabili_senza_organizzazione <> 0 THEN
        RAISE EXCEPTION
            'Impossibile rendere obbligatoria organizzazione_id: % responsabili senza organizzazione.',
            v_responsabili_senza_organizzazione;
    END IF;

    SELECT count(*)
    INTO v_duplicati_responsabile_ruolo
    FROM (
        SELECT responsabile_id, ruolo_id
        FROM public.responsabile_ruolo
        GROUP BY responsabile_id, ruolo_id
        HAVING count(*) > 1
    ) AS duplicati;

    IF v_duplicati_responsabile_ruolo <> 0 THEN
        RAISE EXCEPTION
            'Rilevate % coppie responsabile/ruolo duplicate.',
            v_duplicati_responsabile_ruolo;
    END IF;
END;
$$;


-- =========================================================================
-- 2. ESTENSIONE ATOMICA DELL'ANAGRAFICA ORGANIZZAZIONE
--
-- public.organizzazione rappresenta il soggetto NIS2 che usa l'applicativo.
-- Non rappresenta un fornitore.
-- =========================================================================

ALTER TABLE public.organizzazione
    ADD COLUMN IF NOT EXISTS codice_organizzazione varchar(30),
    ADD COLUMN IF NOT EXISTS classificazione_nis2 varchar(20),
    ADD COLUMN IF NOT EXISTS forma_giuridica varchar(120),
    ADD COLUMN IF NOT EXISTS tipo_identificativo_legale varchar(30),
    ADD COLUMN IF NOT EXISTS identificativo_legale varchar(80),
    ADD COLUMN IF NOT EXISTS indirizzo_sede_legale varchar(255),
    ADD COLUMN IF NOT EXISTS cap_sede_legale varchar(20),
    ADD COLUMN IF NOT EXISTS comune_sede_legale varchar(120),
    ADD COLUMN IF NOT EXISTS provincia_sede_legale varchar(120),
    ADD COLUMN IF NOT EXISTS paese_sede_legale varchar(120),
    ADD COLUMN IF NOT EXISTS email_istituzionale varchar(320),
    ADD COLUMN IF NOT EXISTS pec varchar(320),
    ADD COLUMN IF NOT EXISTS telefono varchar(40),
    ADD COLUMN IF NOT EXISTS sito_web varchar(500);


UPDATE public.organizzazione
SET codice_organizzazione =
    'ORG-' || lpad(id::text, 4, '0')
WHERE codice_organizzazione IS NULL
   OR btrim(codice_organizzazione) = '';


UPDATE public.organizzazione
SET classificazione_nis2 = 'DA_CLASSIFICARE'
WHERE classificazione_nis2 IS NULL
   OR btrim(classificazione_nis2) = '';


ALTER TABLE public.organizzazione
    ALTER COLUMN codice_organizzazione SET NOT NULL,
    ALTER COLUMN classificazione_nis2 SET NOT NULL;


ALTER TABLE public.organizzazione
    DROP CONSTRAINT IF EXISTS check_organizzazione_classificazione_nis2;

ALTER TABLE public.organizzazione
    ADD CONSTRAINT check_organizzazione_classificazione_nis2
    CHECK (
        classificazione_nis2 IN (
            'DA_CLASSIFICARE',
            'ESSENZIALE',
            'IMPORTANTE'
        )
    );


ALTER TABLE public.organizzazione
    DROP CONSTRAINT IF EXISTS check_organizzazione_identificativo_legale;

ALTER TABLE public.organizzazione
    ADD CONSTRAINT check_organizzazione_identificativo_legale
    CHECK (
        (
            tipo_identificativo_legale IS NULL
            AND identificativo_legale IS NULL
        )
        OR
        (
            tipo_identificativo_legale IS NOT NULL
            AND identificativo_legale IS NOT NULL
            AND btrim(tipo_identificativo_legale) <> ''
            AND btrim(identificativo_legale) <> ''
        )
    );


CREATE UNIQUE INDEX IF NOT EXISTS
    uq_organizzazione_codice_normalizzato
ON public.organizzazione (
    upper(btrim(codice_organizzazione))
);


CREATE UNIQUE INDEX IF NOT EXISTS
    uq_organizzazione_identificativo_legale_normalizzato
ON public.organizzazione (
    upper(btrim(identificativo_legale))
)
WHERE identificativo_legale IS NOT NULL;


CREATE INDEX IF NOT EXISTS
    idx_organizzazione_classificazione_nis2
ON public.organizzazione (
    classificazione_nis2
);


-- =========================================================================
-- 3. PROPRIETA ESCLUSIVA DELLE PERSONE
--
-- Ogni persona appartiene a una sola organizzazione utilizzatrice.
-- I dati live risultano gia coerenti; viene quindi reso obbligatorio il FK.
-- =========================================================================

ALTER TABLE public.responsabile
    ALTER COLUMN organizzazione_id SET NOT NULL;


-- =========================================================================
-- 4. CODICE STABILE E CATALOGO DELLE FIGURE NIS2/ACN
--
-- Il ruolo descrive la funzione ricoperta.
-- TITOLARE, VICE e SUPPORTO sono invece attributi dell'incarico e non ruoli
-- duplicati, preservando la 3FN.
-- =========================================================================

ALTER TABLE public.ruolo
    ADD COLUMN IF NOT EXISTS codice_ruolo varchar(60),
    ADD COLUMN IF NOT EXISTS unico_per_organizzazione boolean NOT NULL DEFAULT true;


UPDATE public.ruolo
SET
    codice_ruolo = 'REFERENTE_CSIRT',
    nome = 'Referente CSIRT',
    descrizione = coalesce(
        nullif(descrizione, ''),
        'Referente per le comunicazioni e il coordinamento con il CSIRT Italia.'
    )
WHERE codice_ruolo IS NULL
  AND upper(nome) LIKE '%CSIRT%';


DO $$
DECLARE
    v_ruolo record;
BEGIN
    FOR v_ruolo IN
        SELECT id
        FROM public.ruolo
        WHERE codice_ruolo IS NULL
    LOOP
        UPDATE public.ruolo
        SET codice_ruolo =
            'RUOLO-' || lpad(v_ruolo.id::text, 4, '0')
        WHERE id = v_ruolo.id;
    END LOOP;
END;
$$;


ALTER TABLE public.ruolo
    ALTER COLUMN codice_ruolo SET NOT NULL;


ALTER TABLE public.ruolo
    DROP CONSTRAINT IF EXISTS ruolo_codice_ruolo_key;

ALTER TABLE public.ruolo
    ADD CONSTRAINT ruolo_codice_ruolo_key
    UNIQUE (codice_ruolo);


INSERT INTO public.ruolo (
    codice_ruolo,
    nome,
    descrizione,
    unico_per_organizzazione
)
VALUES
    (
        'LEGALE_RAPPRESENTANTE',
        'Legale rappresentante',
        'Soggetto dotato dei poteri di rappresentanza legale dell''organizzazione.',
        true
    ),
    (
        'DIRETTORE_GENERALE',
        'Direttore generale',
        'Responsabile della direzione generale dell''organizzazione.',
        true
    ),
    (
        'RESPONSABILE_IT',
        'Responsabile IT',
        'Responsabile dei sistemi informativi e delle infrastrutture tecnologiche.',
        true
    ),
    (
        'RESPONSABILE_CYBERSECURITY',
        'Responsabile cybersecurity',
        'Responsabile del presidio di sicurezza informatica e cyber risk.',
        true
    ),
    (
        'PUNTO_CONTATTO_NIS2',
        'Punto di contatto NIS2',
        'Punto di contatto designato per gli adempimenti e le comunicazioni NIS2.',
        true
    ),
    (
        'REFERENTE_CSIRT',
        'Referente CSIRT',
        'Referente per le comunicazioni e il coordinamento con il CSIRT Italia.',
        true
    ),
    (
        'DPO',
        'Responsabile della protezione dei dati (DPO)',
        'Responsabile della protezione dei dati personali ai sensi della normativa applicabile.',
        true
    )
ON CONFLICT (codice_ruolo)
DO UPDATE SET
    nome = EXCLUDED.nome,
    descrizione = EXCLUDED.descrizione,
    unico_per_organizzazione = EXCLUDED.unico_per_organizzazione;


-- =========================================================================
-- 5. STORICIZZAZIONE DI RESPONSABILE_RUOLO
--
-- La precedente PK composta impediva piu periodi storici per la stessa
-- persona e lo stesso ruolo. Si introduce una chiave autonoma senza creare
-- una nuova tabella.
-- =========================================================================

ALTER TABLE public.responsabile_ruolo
    ADD COLUMN IF NOT EXISTS id bigint,
    ADD COLUMN IF NOT EXISTS tipo_incarico varchar(20),
    ADD COLUMN IF NOT EXISTS valido_dal date,
    ADD COLUMN IF NOT EXISTS valido_al date,
    ADD COLUMN IF NOT EXISTS attiva boolean,
    ADD COLUMN IF NOT EXISTS motivo_cessazione text,
    ADD COLUMN IF NOT EXISTS note text,
    ADD COLUMN IF NOT EXISTS creato_il timestamptz,
    ADD COLUMN IF NOT EXISTS aggiornato_il timestamptz;


CREATE SEQUENCE IF NOT EXISTS
    public.responsabile_ruolo_id_seq
AS bigint;


ALTER SEQUENCE public.responsabile_ruolo_id_seq
    OWNED BY public.responsabile_ruolo.id;


ALTER TABLE public.responsabile_ruolo
    ALTER COLUMN id SET DEFAULT
        nextval('public.responsabile_ruolo_id_seq'::regclass);


UPDATE public.responsabile_ruolo
SET id = nextval('public.responsabile_ruolo_id_seq'::regclass)
WHERE id IS NULL;


SELECT setval(
    'public.responsabile_ruolo_id_seq'::regclass,
    greatest(
        coalesce((SELECT max(id) FROM public.responsabile_ruolo), 0),
        1
    ),
    EXISTS (SELECT 1 FROM public.responsabile_ruolo)
);


UPDATE public.responsabile_ruolo
SET tipo_incarico =
    CASE
        WHEN coalesce(is_titolare, true) IS TRUE THEN 'TITOLARE'
        ELSE 'SUPPORTO'
    END
WHERE tipo_incarico IS NULL
   OR btrim(tipo_incarico) = '';


UPDATE public.responsabile_ruolo
SET
    valido_dal = coalesce(valido_dal, current_date),
    attiva = coalesce(attiva, true),
    creato_il = coalesce(creato_il, clock_timestamp()),
    aggiornato_il = coalesce(aggiornato_il, clock_timestamp());


ALTER TABLE public.responsabile_ruolo
    ALTER COLUMN id SET NOT NULL,
    ALTER COLUMN tipo_incarico SET NOT NULL,
    ALTER COLUMN valido_dal SET DEFAULT current_date,
    ALTER COLUMN valido_dal SET NOT NULL,
    ALTER COLUMN attiva SET DEFAULT true,
    ALTER COLUMN attiva SET NOT NULL,
    ALTER COLUMN creato_il SET DEFAULT clock_timestamp(),
    ALTER COLUMN creato_il SET NOT NULL,
    ALTER COLUMN aggiornato_il SET DEFAULT clock_timestamp(),
    ALTER COLUMN aggiornato_il SET NOT NULL;


ALTER TABLE public.responsabile_ruolo
    DROP CONSTRAINT IF EXISTS responsabile_ruolo_pkey;

ALTER TABLE public.responsabile_ruolo
    ADD CONSTRAINT responsabile_ruolo_pkey
    PRIMARY KEY (id);


ALTER TABLE public.responsabile_ruolo
    DROP CONSTRAINT IF EXISTS check_responsabile_ruolo_tipo_incarico;

ALTER TABLE public.responsabile_ruolo
    ADD CONSTRAINT check_responsabile_ruolo_tipo_incarico
    CHECK (
        tipo_incarico IN (
            'TITOLARE',
            'VICE',
            'SUPPORTO'
        )
    );


ALTER TABLE public.responsabile_ruolo
    DROP CONSTRAINT IF EXISTS check_responsabile_ruolo_periodo;

ALTER TABLE public.responsabile_ruolo
    ADD CONSTRAINT check_responsabile_ruolo_periodo
    CHECK (
        valido_al IS NULL
        OR valido_al >= valido_dal
    );


ALTER TABLE public.responsabile_ruolo
    DROP CONSTRAINT IF EXISTS check_responsabile_ruolo_stato;

ALTER TABLE public.responsabile_ruolo
    ADD CONSTRAINT check_responsabile_ruolo_stato
    CHECK (
        (
            attiva IS TRUE
            AND valido_al IS NULL
            AND motivo_cessazione IS NULL
        )
        OR
        (
            attiva IS FALSE
            AND valido_al IS NOT NULL
            AND motivo_cessazione IS NOT NULL
            AND btrim(motivo_cessazione) <> ''
        )
    );


DROP INDEX IF EXISTS
    public.uq_responsabile_ruolo_attivo;

CREATE UNIQUE INDEX
    uq_responsabile_ruolo_attivo
ON public.responsabile_ruolo (
    responsabile_id,
    ruolo_id
)
WHERE attiva IS TRUE;


CREATE INDEX IF NOT EXISTS
    idx_responsabile_ruolo_ruolo_attivo
ON public.responsabile_ruolo (
    ruolo_id,
    tipo_incarico,
    attiva
);


CREATE INDEX IF NOT EXISTS
    idx_responsabile_ruolo_validita
ON public.responsabile_ruolo (
    valido_dal,
    valido_al
);


-- Mantiene il nome storico is_titolare come colonna derivata e non ridondante.
ALTER TABLE public.responsabile_ruolo
    DROP COLUMN IF EXISTS is_titolare;

ALTER TABLE public.responsabile_ruolo
    ADD COLUMN is_titolare boolean
    GENERATED ALWAYS AS (
        tipo_incarico = 'TITOLARE'
    ) STORED;


-- =========================================================================
-- 6. VALIDAZIONE DEGLI INCARICHI E AGGIORNAMENTO TEMPORALE
-- =========================================================================

CREATE OR REPLACE FUNCTION public.fn_valida_incarico_nis2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_organizzazione_id integer;
    v_incarico_unico boolean;
    v_conflitti integer;
BEGIN
    SELECT r.organizzazione_id
    INTO v_organizzazione_id
    FROM public.responsabile AS r
    WHERE r.id = NEW.responsabile_id
      AND r.attiva IS TRUE;

    IF v_organizzazione_id IS NULL THEN
        RAISE EXCEPTION
            'Il responsabile % non esiste, non e attivo o non appartiene a un''organizzazione.',
            NEW.responsabile_id;
    END IF;

    SELECT ruolo.unico_per_organizzazione
    INTO v_incarico_unico
    FROM public.ruolo AS ruolo
    WHERE ruolo.id = NEW.ruolo_id;

    IF v_incarico_unico IS NULL THEN
        RAISE EXCEPTION
            'Il ruolo % non esiste.',
            NEW.ruolo_id;
    END IF;

    IF NEW.attiva IS TRUE
       AND NEW.tipo_incarico IN ('TITOLARE', 'VICE')
       AND v_incarico_unico IS TRUE THEN

        SELECT count(*)
        INTO v_conflitti
        FROM public.responsabile_ruolo AS rr
        INNER JOIN public.responsabile AS r
            ON r.id = rr.responsabile_id
        WHERE rr.ruolo_id = NEW.ruolo_id
          AND rr.tipo_incarico = NEW.tipo_incarico
          AND rr.attiva IS TRUE
          AND r.organizzazione_id = v_organizzazione_id
          AND rr.id IS DISTINCT FROM NEW.id;

        IF v_conflitti > 0 THEN
            RAISE EXCEPTION
                'Esiste gia un incarico % attivo per questo ruolo e questa organizzazione.',
                NEW.tipo_incarico;
        END IF;
    END IF;

    IF NEW.attiva IS FALSE
       AND NEW.valido_al IS NULL THEN
        NEW.valido_al := current_date;
    END IF;

    IF NEW.attiva IS TRUE THEN
        NEW.valido_al := NULL;
        NEW.motivo_cessazione := NULL;
    END IF;

    IF TG_OP = 'INSERT' THEN
        NEW.creato_il := coalesce(NEW.creato_il, clock_timestamp());
    END IF;

    NEW.aggiornato_il := clock_timestamp();

    RETURN NEW;
END;
$$;


ALTER FUNCTION public.fn_valida_incarico_nis2()
OWNER TO postgres;

REVOKE ALL
ON FUNCTION public.fn_valida_incarico_nis2()
FROM PUBLIC, anon, authenticated;


DROP TRIGGER IF EXISTS
    trg_valida_incarico_nis2
ON public.responsabile_ruolo;

CREATE TRIGGER trg_valida_incarico_nis2
BEFORE INSERT OR UPDATE
ON public.responsabile_ruolo
FOR EACH ROW
EXECUTE FUNCTION public.fn_valida_incarico_nis2();


-- =========================================================================
-- 7. AUDIT E BLOCCO DELLA CANCELLAZIONE FISICA
-- =========================================================================

DROP TRIGGER IF EXISTS
    trg_audit_responsabile_ruolo
ON public.responsabile_ruolo;

CREATE TRIGGER trg_audit_responsabile_ruolo
AFTER INSERT OR UPDATE OR DELETE
ON public.responsabile_ruolo
FOR EACH ROW
EXECUTE FUNCTION public.fn_audit_generico();


DROP TRIGGER IF EXISTS
    trg_blocca_delete_responsabile_ruolo
ON public.responsabile_ruolo;

CREATE TRIGGER trg_blocca_delete_responsabile_ruolo
BEFORE DELETE
ON public.responsabile_ruolo
FOR EACH ROW
EXECUTE FUNCTION public.fn_blocca_cancellazione_fisica();


-- =========================================================================
-- 8. ACCESSO OPERATIVO ALL'ANAGRAFICA ORGANIZZAZIONE
--
-- La tabella era in sola lettura. Il nuovo modulo AZIENDA richiede INSERT e
-- UPDATE, mantenendo esclusi anon e DELETE.
-- =========================================================================

GRANT SELECT, INSERT, UPDATE
ON TABLE public.organizzazione
TO authenticated;

REVOKE ALL
ON TABLE public.organizzazione
FROM anon;


DO $$
DECLARE
    v_sequenza text;
BEGIN
    v_sequenza :=
        pg_get_serial_sequence(
            'public.organizzazione',
            'id'
        );

    IF v_sequenza IS NOT NULL THEN
        EXECUTE format(
            'GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated',
            v_sequenza
        );

        EXECUTE format(
            'REVOKE ALL ON SEQUENCE %s FROM anon',
            v_sequenza
        );
    END IF;
END;
$$;


GRANT USAGE, SELECT
ON SEQUENCE public.responsabile_ruolo_id_seq
TO authenticated;

REVOKE ALL
ON SEQUENCE public.responsabile_ruolo_id_seq
FROM anon;


ALTER TABLE public.organizzazione
    ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS
    "Insert_MFA_Policy"
ON public.organizzazione;

DROP POLICY IF EXISTS
    "Update_MFA_Policy"
ON public.organizzazione;

DROP POLICY IF EXISTS
    "Insert_Operativo_Policy"
ON public.organizzazione;

DROP POLICY IF EXISTS
    "Update_Operativo_Policy"
ON public.organizzazione;


CREATE POLICY "Insert_Operativo_Policy"
ON public.organizzazione
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (
    public.fn_accesso_operativo()
);


CREATE POLICY "Update_Operativo_Policy"
ON public.organizzazione
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (
    public.fn_accesso_operativo()
)
WITH CHECK (
    public.fn_accesso_operativo()
);


-- =========================================================================
-- 9. VERIFICHE BLOCCANTI PRIMA DEL COMMIT
-- =========================================================================

DO $$
DECLARE
    v_numero_tabelle integer;
    v_numero_viste integer;
    v_colonne_organizzazione integer;
    v_pk_responsabile_ruolo text;
    v_ruoli_nis2 integer;
    v_policy_organizzazione integer;
    v_privilegi_anon integer;
    v_privilegi_delete integer;
    v_policy_delete integer;
    v_trigger_audit integer;
    v_trigger_blocco integer;
    v_fk_cascade integer;
BEGIN
    SELECT count(*)
    INTO v_numero_tabelle
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE';

    SELECT count(*)
    INTO v_numero_viste
    FROM information_schema.views
    WHERE table_schema = 'public';

    IF v_numero_tabelle <> 30 THEN
        RAISE EXCEPTION
            'Verifica fallita: tabelle public % invece di 30.',
            v_numero_tabelle;
    END IF;

    IF v_numero_viste <> 7 THEN
        RAISE EXCEPTION
            'Verifica fallita: viste public % invece di 7.',
            v_numero_viste;
    END IF;

    SELECT count(*)
    INTO v_colonne_organizzazione
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organizzazione'
      AND column_name IN (
          'codice_organizzazione',
          'classificazione_nis2',
          'forma_giuridica',
          'tipo_identificativo_legale',
          'identificativo_legale',
          'indirizzo_sede_legale',
          'cap_sede_legale',
          'comune_sede_legale',
          'provincia_sede_legale',
          'paese_sede_legale',
          'email_istituzionale',
          'pec',
          'telefono',
          'sito_web'
      );

    IF v_colonne_organizzazione <> 14 THEN
        RAISE EXCEPTION
            'Verifica fallita: colonne organizzazione rilevate %, attese 14.',
            v_colonne_organizzazione;
    END IF;

    SELECT string_agg(a.attname, ', ' ORDER BY k.ordinality)
    INTO v_pk_responsabile_ruolo
    FROM pg_constraint AS c
    INNER JOIN pg_class AS t
        ON t.oid = c.conrelid
    INNER JOIN pg_namespace AS n
        ON n.oid = t.relnamespace
    CROSS JOIN LATERAL
        unnest(c.conkey) WITH ORDINALITY AS k(attnum, ordinality)
    INNER JOIN pg_attribute AS a
        ON a.attrelid = t.oid
       AND a.attnum = k.attnum
    WHERE n.nspname = 'public'
      AND t.relname = 'responsabile_ruolo'
      AND c.contype = 'p';

    IF v_pk_responsabile_ruolo <> 'id' THEN
        RAISE EXCEPTION
            'Verifica fallita: PK responsabile_ruolo = %, attesa id.',
            coalesce(v_pk_responsabile_ruolo, 'assente');
    END IF;

    SELECT count(*)
    INTO v_ruoli_nis2
    FROM public.ruolo
    WHERE codice_ruolo IN (
        'LEGALE_RAPPRESENTANTE',
        'DIRETTORE_GENERALE',
        'RESPONSABILE_IT',
        'RESPONSABILE_CYBERSECURITY',
        'PUNTO_CONTATTO_NIS2',
        'REFERENTE_CSIRT',
        'DPO'
    );

    IF v_ruoli_nis2 <> 7 THEN
        RAISE EXCEPTION
            'Verifica fallita: ruoli NIS2 presenti %, attesi 7.',
            v_ruoli_nis2;
    END IF;

    SELECT count(*)
    INTO v_policy_organizzazione
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organizzazione'
      AND policyname IN (
          'Insert_Operativo_Policy',
          'Update_Operativo_Policy'
      );

    IF v_policy_organizzazione <> 2 THEN
        RAISE EXCEPTION
            'Verifica fallita: policy operative organizzazione %, attese 2.',
            v_policy_organizzazione;
    END IF;

    SELECT count(*)
    INTO v_privilegi_anon
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name IN (
          'organizzazione',
          'responsabile',
          'responsabile_ruolo',
          'ruolo'
      )
      AND grantee = 'anon';

    IF v_privilegi_anon <> 0 THEN
        RAISE EXCEPTION
            'Verifica fallita: privilegi anon rilevati %.',
            v_privilegi_anon;
    END IF;

    SELECT count(*)
    INTO v_privilegi_delete
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name IN (
          'organizzazione',
          'responsabile',
          'responsabile_ruolo',
          'ruolo'
      )
      AND grantee = 'authenticated'
      AND privilege_type = 'DELETE';

    IF v_privilegi_delete <> 0 THEN
        RAISE EXCEPTION
            'Verifica fallita: privilegi DELETE rilevati %.',
            v_privilegi_delete;
    END IF;

    SELECT count(*)
    INTO v_policy_delete
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
          'organizzazione',
          'responsabile',
          'responsabile_ruolo',
          'ruolo'
      )
      AND cmd = 'DELETE';

    IF v_policy_delete <> 0 THEN
        RAISE EXCEPTION
            'Verifica fallita: policy DELETE rilevate %.',
            v_policy_delete;
    END IF;

    SELECT count(*)
    INTO v_trigger_audit
    FROM pg_trigger AS t
    INNER JOIN pg_class AS c
        ON c.oid = t.tgrelid
    INNER JOIN pg_namespace AS n
        ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'responsabile_ruolo'
      AND t.tgname = 'trg_audit_responsabile_ruolo'
      AND t.tgisinternal IS FALSE;

    IF v_trigger_audit <> 1 THEN
        RAISE EXCEPTION
            'Verifica fallita: trigger audit responsabile_ruolo assente.';
    END IF;

    SELECT count(*)
    INTO v_trigger_blocco
    FROM pg_trigger AS t
    INNER JOIN pg_class AS c
        ON c.oid = t.tgrelid
    INNER JOIN pg_namespace AS n
        ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'responsabile_ruolo'
      AND t.tgname = 'trg_blocca_delete_responsabile_ruolo'
      AND t.tgisinternal IS FALSE;

    IF v_trigger_blocco <> 1 THEN
        RAISE EXCEPTION
            'Verifica fallita: trigger blocco DELETE responsabile_ruolo assente.';
    END IF;

    SELECT count(*)
    INTO v_fk_cascade
    FROM pg_constraint AS c
    INNER JOIN pg_class AS origine
        ON origine.oid = c.conrelid
    INNER JOIN pg_namespace AS n_origine
        ON n_origine.oid = origine.relnamespace
    INNER JOIN pg_class AS destinazione
        ON destinazione.oid = c.confrelid
    INNER JOIN pg_namespace AS n_destinazione
        ON n_destinazione.oid = destinazione.relnamespace
    WHERE c.contype = 'f'
      AND c.confdeltype = 'c'
      AND n_origine.nspname = 'public'
      AND n_destinazione.nspname = 'public';

    IF v_fk_cascade <> 0 THEN
        RAISE EXCEPTION
            'Verifica fallita: restano % vincoli ON DELETE CASCADE.',
            v_fk_cascade;
    END IF;
END;
$$;


COMMIT;


-- =========================================================================
-- 10. RISULTATO FINALE
-- =========================================================================

SELECT
    'SCRIPT_27_COMPLETATO' AS esito,

    (
        SELECT count(*)
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
    ) AS numero_tabelle_public,

    (
        SELECT count(*)
        FROM information_schema.views
        WHERE table_schema = 'public'
    ) AS numero_viste_public,

    (
        SELECT count(*)
        FROM public.ruolo
        WHERE codice_ruolo IN (
            'LEGALE_RAPPRESENTANTE',
            'DIRETTORE_GENERALE',
            'RESPONSABILE_IT',
            'RESPONSABILE_CYBERSECURITY',
            'PUNTO_CONTATTO_NIS2',
            'REFERENTE_CSIRT',
            'DPO'
        )
    ) AS ruoli_nis2_disponibili,

    (
        SELECT count(*)
        FROM pg_trigger AS t
        INNER JOIN pg_class AS c
            ON c.oid = t.tgrelid
        INNER JOIN pg_namespace AS n
            ON n.oid = c.relnamespace
        INNER JOIN pg_proc AS p
            ON p.oid = t.tgfoid
        WHERE n.nspname = 'public'
          AND t.tgisinternal IS FALSE
          AND p.proname = 'fn_audit_generico'
    ) AS trigger_audit_totali,

    (
        SELECT count(*)
        FROM pg_trigger AS t
        INNER JOIN pg_class AS c
            ON c.oid = t.tgrelid
        INNER JOIN pg_namespace AS n
            ON n.oid = c.relnamespace
        INNER JOIN pg_proc AS p
            ON p.oid = t.tgfoid
        WHERE n.nspname = 'public'
          AND t.tgisinternal IS FALSE
          AND p.proname = 'fn_blocca_cancellazione_fisica'
    ) AS trigger_blocco_delete_totali,

    (
        SELECT count(*)
        FROM information_schema.role_table_grants
        WHERE table_schema = 'public'
          AND grantee = 'anon'
    ) AS privilegi_anon_public,

    (
        SELECT count(*)
        FROM information_schema.role_table_grants
        WHERE table_schema = 'public'
          AND grantee = 'authenticated'
          AND privilege_type = 'DELETE'
    ) AS privilegi_delete_authenticated;
