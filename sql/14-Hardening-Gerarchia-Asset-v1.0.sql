-- =========================================================================
-- FILE: sql/14-Hardening-Gerarchia-Asset-v1.0.sql
-- TARGET ARCHITETTURALE: ER V4.0 - SUPPLY CHAIN MULTILIVELLO
-- DESCRIZIONE: Introduzione dei codici stabili degli asset, del dominio
--              delle relazioni tra asset e della gerarchia storicizzabile
--              asset-sotto-asset con controllo delle ciclicità
-- TIPO SCRIPT: Produttivo - modifica struttura, vincoli, indici e trigger
-- =========================================================================

/*
    OBIETTIVI

    1. Introdurre un codice applicativo stabile per ciascun asset.

    2. Rendere obbligatoria la categoria ACN dell'asset.

    3. Creare il dominio tipo_relazione_asset per classificare
       semanticamente le relazioni tra asset.

    4. Creare asset_componente per rappresentare:
       - asset principali;
       - sotto-asset;
       - componenti fisici;
       - componenti logici;
       - cluster;
       - elementi virtualizzati;
       - componenti condivisi.

    5. Consentire:
       - più sotto-asset per uno stesso asset padre;
       - più asset padre per un componente condiviso;
       - un eventuale asset padre primario;
       - gerarchie multilivello;
       - validità temporale e storicizzazione.

    6. Impedire:
       - autorelazioni;
       - duplicati attivi;
       - più padri primari attivi;
       - cicli come A -> B -> C -> A;
       - cancellazioni a cascata.

    SICUREZZA INIZIALE

    Le nuove tabelle saranno consultabili dagli utenti autenticati,
    ma non saranno ancora modificabili dal frontend.

    Le policy di scrittura saranno introdotte soltanto dopo
    l'estensione dell'audit generalizzato, così da non consentire
    operazioni applicative non tracciate.
*/

BEGIN;

-- =========================================================================
-- 1. CONTROLLO DI PRECONDIZIONE
-- =========================================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'asset'
          AND column_name = 'codice_asset'
    ) THEN
        RAISE EXCEPTION
            'La colonna asset.codice_asset esiste già. Migrazione annullata.';
    END IF;

    IF to_regclass('public.tipo_relazione_asset') IS NOT NULL THEN
        RAISE EXCEPTION
            'La tabella tipo_relazione_asset esiste già. Migrazione annullata.';
    END IF;

    IF to_regclass('public.asset_componente') IS NOT NULL THEN
        RAISE EXCEPTION
            'La tabella asset_componente esiste già. Migrazione annullata.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.asset
        WHERE categoria_asset_id IS NULL
    ) THEN
        RAISE EXCEPTION
            'Sono presenti asset senza categoria ACN. Migrazione annullata.';
    END IF;
END
$$;

-- =========================================================================
-- 2. CODICE APPLICATIVO STABILE DEGLI ASSET
-- =========================================================================

ALTER TABLE public.asset
    ADD COLUMN codice_asset varchar(80);

/*
    Per gli asset esistenti viene tentata la generazione di un codice
    leggibile a partire dal nome.

    Se il nome normalizzato è vuoto, duplicato o non conforme,
    viene utilizzato un codice legacy basato sull'identificativo
    esistente.
*/

WITH nomi_normalizzati AS (
    SELECT
        id,

        regexp_replace(
            regexp_replace(
                upper(trim(nome)),
                '[^A-Z0-9]+',
                '-',
                'g'
            ),
            '(^-+|-+$)',
            '',
            'g'
        ) AS codice_normalizzato

    FROM public.asset
),

codici_classificati AS (
    SELECT
        id,
        codice_normalizzato,

        COUNT(*) OVER (
            PARTITION BY codice_normalizzato
        ) AS numero_occorrenze

    FROM nomi_normalizzati
)

UPDATE public.asset AS a
SET codice_asset =
    CASE
        WHEN cc.codice_normalizzato ~
             '^[A-Z0-9][A-Z0-9_-]{2,79}$'
         AND cc.numero_occorrenze = 1
        THEN cc.codice_normalizzato

        ELSE
            'AST-LEGACY-' || lpad(a.id::text, 6, '0')
    END

FROM codici_classificati AS cc
WHERE cc.id = a.id;

ALTER TABLE public.asset
    ALTER COLUMN codice_asset SET NOT NULL;

ALTER TABLE public.asset
    ADD CONSTRAINT asset_codice_asset_key
    UNIQUE (codice_asset);

ALTER TABLE public.asset
    ADD CONSTRAINT check_codice_asset_formato
    CHECK (
        codice_asset ~ '^[A-Z0-9][A-Z0-9_-]{2,79}$'
    );

COMMENT ON COLUMN public.asset.codice_asset IS
    'Codice stabile utilizzato da GUI, API e import/export XLS.';

-- =========================================================================
-- 3. CATEGORIA ACN OBBLIGATORIA
-- =========================================================================

ALTER TABLE public.asset
    ALTER COLUMN categoria_asset_id SET NOT NULL;

COMMENT ON COLUMN public.asset.categoria_asset_id IS
    'Categoria ACN obbligatoria per la classificazione dell asset.';

-- =========================================================================
-- 4. DOMINIO DELLE RELAZIONI TRA ASSET
-- =========================================================================

CREATE TABLE public.tipo_relazione_asset (
    id integer GENERATED BY DEFAULT AS IDENTITY,

    codice varchar(50) NOT NULL,
    nome varchar(100) NOT NULL,
    descrizione text,

    CONSTRAINT tipo_relazione_asset_pkey
        PRIMARY KEY (id),

    CONSTRAINT tipo_relazione_asset_codice_key
        UNIQUE (codice),

    CONSTRAINT tipo_relazione_asset_nome_key
        UNIQUE (nome),

    CONSTRAINT check_tipo_relazione_asset_codice
        CHECK (
            codice ~ '^[A-Z0-9][A-Z0-9_]{2,49}$'
        )
);

INSERT INTO public.tipo_relazione_asset (
    codice,
    nome,
    descrizione
)
VALUES
    (
        'COMPOSIZIONE_FISICA',
        'Composizione fisica',
        'Il sotto-asset costituisce una componente fisica dell asset padre.'
    ),
    (
        'COMPONENTE_LOGICO',
        'Componente logico',
        'Il sotto-asset costituisce una componente software o logica.'
    ),
    (
        'VIRTUALIZZAZIONE',
        'Virtualizzazione',
        'Relazione tra infrastruttura ospitante e componente virtualizzato.'
    ),
    (
        'CLUSTER',
        'Componente di cluster',
        'L asset figlio partecipa a un cluster o a un aggregato tecnologico.'
    ),
    (
        'DIPENDENZA_CONDIVISA',
        'Dipendenza condivisa',
        'Il componente è condiviso da più asset o aggregazioni tecnologiche.'
    ),
    (
        'ALTRO',
        'Altra relazione',
        'Relazione non riconducibile alle tipologie precedenti.'
    );

COMMENT ON TABLE public.tipo_relazione_asset IS
    'Dominio normalizzato delle tipologie di relazione asset-sotto-asset.';

-- =========================================================================
-- 5. GERARCHIA ASSET-SOTTO-ASSET
-- =========================================================================

CREATE TABLE public.asset_componente (
    id bigint GENERATED BY DEFAULT AS IDENTITY,

    asset_padre_id integer NOT NULL,
    asset_figlio_id integer NOT NULL,
    tipo_relazione_asset_id integer NOT NULL,

    descrizione text,

    attiva boolean NOT NULL DEFAULT true,

    valido_dal timestamp with time zone
        NOT NULL DEFAULT now(),

    valido_al timestamp with time zone,

    relazione_primaria boolean
        NOT NULL DEFAULT false,

    ordine_componente integer
        NOT NULL DEFAULT 1,

    motivo_chiusura text,

    creato_il timestamp with time zone
        NOT NULL DEFAULT now(),

    aggiornato_il timestamp with time zone
        NOT NULL DEFAULT now(),

    CONSTRAINT asset_componente_pkey
        PRIMARY KEY (id),

    CONSTRAINT asset_componente_asset_padre_id_fkey
        FOREIGN KEY (asset_padre_id)
        REFERENCES public.asset(id)
        ON DELETE RESTRICT,

    CONSTRAINT asset_componente_asset_figlio_id_fkey
        FOREIGN KEY (asset_figlio_id)
        REFERENCES public.asset(id)
        ON DELETE RESTRICT,

    CONSTRAINT asset_componente_tipo_relazione_asset_id_fkey
        FOREIGN KEY (tipo_relazione_asset_id)
        REFERENCES public.tipo_relazione_asset(id)
        ON DELETE RESTRICT,

    CONSTRAINT check_asset_componente_no_self_reference
        CHECK (
            asset_padre_id <> asset_figlio_id
        ),

    CONSTRAINT check_asset_componente_validita
        CHECK (
            valido_al IS NULL
            OR valido_al >= valido_dal
        ),

    CONSTRAINT check_asset_componente_stato_temporale
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

    CONSTRAINT check_asset_componente_primaria_attiva
        CHECK (
            relazione_primaria = false
            OR attiva = true
        ),

    CONSTRAINT check_asset_componente_ordine
        CHECK (
            ordine_componente > 0
        )
);

COMMENT ON TABLE public.asset_componente IS
    'Relazioni storicizzabili, direzionali e acicliche tra asset e sotto-asset.';

COMMENT ON COLUMN public.asset_componente.relazione_primaria IS
    'Indica l eventuale asset padre principale del sotto-asset.';

COMMENT ON COLUMN public.asset_componente.ordine_componente IS
    'Ordine di visualizzazione del sotto-asset nella futura GUI.';

COMMENT ON COLUMN public.asset_componente.motivo_chiusura IS
    'Motivazione della chiusura logica della relazione.';

-- =========================================================================
-- 6. INDICI DI UNIVOCITA E NAVIGAZIONE
-- =========================================================================

/*
    La stessa coppia padre-figlio può comparire più volte nello storico,
    ma può esistere una sola relazione attiva alla volta.
*/

CREATE UNIQUE INDEX uq_asset_componente_relazione_attiva
    ON public.asset_componente (
        asset_padre_id,
        asset_figlio_id
    )
    WHERE attiva = true;

/*
    Un componente condiviso può appartenere a più asset padre,
    ma può avere un solo padre primario attivo.
*/

CREATE UNIQUE INDEX uq_asset_componente_padre_primario
    ON public.asset_componente (
        asset_figlio_id
    )
    WHERE attiva = true
      AND relazione_primaria = true;

/*
    Navigazione asset padre -> sotto-asset.
*/

CREATE INDEX idx_asset_componente_padre_attivo
    ON public.asset_componente (
        asset_padre_id,
        ordine_componente
    )
    WHERE attiva = true;

/*
    Navigazione sotto-asset -> asset padre.
*/

CREATE INDEX idx_asset_componente_figlio_attivo
    ON public.asset_componente (
        asset_figlio_id
    )
    WHERE attiva = true;

CREATE INDEX idx_asset_componente_tipo_relazione
    ON public.asset_componente (
        tipo_relazione_asset_id
    )
    WHERE attiva = true;

-- =========================================================================
-- 7. FUNZIONE DI CONTROLLO DELLA GERARCHIA ASSET
-- =========================================================================

CREATE OR REPLACE FUNCTION public.fn_check_asset_componente_cycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    relazione_esclusa_id bigint;
    ciclo_rilevato boolean;
BEGIN
    NEW.aggiornato_il := now();

    IF NEW.asset_padre_id = NEW.asset_figlio_id THEN
        RAISE EXCEPTION
            'Un asset non può essere componente di sé stesso.';
    END IF;

    /*
        Una relazione storica chiusa non può essere riattivata.
        Per un nuovo periodo deve essere inserita una nuova relazione.
    */

    IF TG_OP = 'UPDATE'
       AND OLD.attiva = false
       AND NEW.attiva = true
    THEN
        RAISE EXCEPTION
            'Una relazione storica chiusa non può essere riattivata.';
    END IF;

    /*
        La chiusura logica valorizza automaticamente valido_al.
    */

    IF NEW.attiva = false
       AND NEW.valido_al IS NULL
    THEN
        NEW.valido_al := now();
    END IF;

    IF NEW.attiva = false THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        relazione_esclusa_id := OLD.id;
    ELSE
        relazione_esclusa_id := NULL;
    END IF;

    /*
        Partendo dal nuovo asset figlio vengono attraversati tutti
        i suoi discendenti attivi.

        Se tra i discendenti compare il nuovo asset padre,
        l inserimento produrrebbe un ciclo.
    */

    WITH RECURSIVE discendenti AS (
        SELECT
            ac.asset_figlio_id

        FROM public.asset_componente AS ac

        WHERE ac.asset_padre_id = NEW.asset_figlio_id
          AND ac.attiva = true
          AND (
              relazione_esclusa_id IS NULL
              OR ac.id <> relazione_esclusa_id
          )

        UNION

        SELECT
            ac.asset_figlio_id

        FROM public.asset_componente AS ac

        INNER JOIN discendenti AS d
            ON ac.asset_padre_id = d.asset_figlio_id

        WHERE ac.attiva = true
          AND (
              relazione_esclusa_id IS NULL
              OR ac.id <> relazione_esclusa_id
          )
    )

    SELECT EXISTS (
        SELECT 1
        FROM discendenti
        WHERE asset_figlio_id = NEW.asset_padre_id
    )
    INTO ciclo_rilevato;

    IF ciclo_rilevato THEN
        RAISE EXCEPTION
            'Relazione non valida: rilevato un ciclo nella gerarchia degli asset.';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_check_asset_componente_cycle() IS
    'Impedisce autorelazioni e cicli nella gerarchia asset-sotto-asset.';

-- =========================================================================
-- 8. TRIGGER DI VALIDAZIONE
-- =========================================================================

CREATE TRIGGER trg_check_asset_componente_cycle
BEFORE INSERT OR UPDATE
ON public.asset_componente
FOR EACH ROW
EXECUTE FUNCTION public.fn_check_asset_componente_cycle();

-- =========================================================================
-- 9. SICUREZZA RLS INIZIALE
-- =========================================================================

/*
    Le tabelle sono inizialmente disponibili in sola lettura agli utenti
    autenticati.

    INSERT e UPDATE saranno abilitati soltanto quando il nuovo audit
    generalizzato sarà pronto a tracciare anche le relazioni.
*/

ALTER TABLE public.tipo_relazione_asset
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.asset_componente
    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read_All_Policy"
ON public.tipo_relazione_asset;

CREATE POLICY "Read_All_Policy"
ON public.tipo_relazione_asset
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Read_All_Policy"
ON public.asset_componente;

CREATE POLICY "Read_All_Policy"
ON public.asset_componente
FOR SELECT
TO authenticated
USING (true);

REVOKE ALL PRIVILEGES
ON public.tipo_relazione_asset
FROM anon;

REVOKE ALL PRIVILEGES
ON public.asset_componente
FROM anon;

GRANT SELECT
ON public.tipo_relazione_asset
TO authenticated;

GRANT SELECT
ON public.asset_componente
TO authenticated;

COMMIT;