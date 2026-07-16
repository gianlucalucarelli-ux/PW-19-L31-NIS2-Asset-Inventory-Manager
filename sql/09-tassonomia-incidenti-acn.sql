-- =========================================================================
-- FILE: sql/09-tassonomia-incidenti-acn.sql
-- TARGET ARCHITETTURALE: ER V3.9 (ESTESA PER LIFECYCLE MANAGEMENT)
-- CONFORMITÀ: TASSONOMIA CYBER ACN V2.0 + AUDITABILITY
-- =========================================================================

-- Pulizia rigida per permettere l'aggiornamento strutturale
DROP TABLE IF EXISTS public.evento_tassonomia_acn CASCADE;
DROP TABLE IF EXISTS public.tassonomia_incidenti_acn CASCADE;

-- 1. Tabella Dizionario con supporto al ciclo di vita e audit
CREATE TABLE public.tassonomia_incidenti_acn (
    id serial PRIMARY KEY,
    uuid uuid NOT NULL UNIQUE,
    macro_area varchar(2) NOT NULL CONSTRAINT check_macro_area CHECK (macro_area IN ('BC', 'TT', 'TA', 'AC')),
    sotto_categoria varchar(50) NOT NULL,
    codice_acn varchar(50) NOT NULL UNIQUE, 
    nome_esteso varchar(100) NOT NULL,
    descrizione text,
    colore_hex varchar(7),
    is_active boolean DEFAULT true, -- NEW: Permette di deprecare codici ACN nel tempo
    created_at timestamp WITH TIME ZONE DEFAULT now() -- NEW: Audit data inserimento
);

-- 2. Tabella di giunzione
CREATE TABLE public.evento_tassonomia_acn (
    evento_id integer REFERENCES public.evento_servizio(id) ON DELETE CASCADE,
    tassonomia_id integer REFERENCES public.tassonomia_incidenti_acn(id) ON DELETE RESTRICT,
    passo_wizard integer NOT NULL CONSTRAINT check_passo CHECK (passo_wizard BETWEEN 1 AND 6),
    PRIMARY KEY (evento_id, tassonomia_id)
);

-- 3. Policy RLS (Rinnovate per la nuova struttura)
ALTER TABLE public.tassonomia_incidenti_acn ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evento_tassonomia_acn ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read_All_Tassonomia" ON public.tassonomia_incidenti_acn FOR SELECT TO authenticated USING (true);
CREATE POLICY "Read_All_Evento_Tassonomia" ON public.evento_tassonomia_acn FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert_Evento_Tassonomia" ON public.evento_tassonomia_acn FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Delete_Evento_Tassonomia" ON public.evento_tassonomia_acn FOR DELETE TO authenticated USING (true);