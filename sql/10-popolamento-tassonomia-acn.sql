-- =========================================================================
-- FILE: sql/10-popolamento-tassonomia-acn.sql
-- DESCRIZIONE: DML di popolamento ESTESO Tassonomia Cyber ACN v2.0
-- =========================================================================

INSERT INTO public.tassonomia_incidenti_acn (uuid, macro_area, sotto_categoria, codice_acn, nome_esteso, descrizione, colore_hex) VALUES

-- =========================================================================
-- MACRO-AREA 1: BASELINE CHARACTERIZATION (BC) - Colore: #6E92A0
-- =========================================================================
-- Sotto-categoria: Impatto (IM)
('0812b4ad-eee0-53a4-bea7-2a87ff3df4a1', 'BC', 'Impatto', 'BC:IM_AC', 'Compromissione Account', 'Compromissione di un account utente o di un account di servizio.', '#6E92A0'),
('62de5062-4dde-5770-baff-1c86630722d5', 'BC', 'Impatto', 'BC:IM_AP', 'Compromissione Applicazione', 'Compromissione di un''applicazione o servizio, inclusi database o app web.', '#6E92A0'),
('c2dd8e6b-c582-58a1-8d6c-c97be8f8e536', 'BC', 'Impatto', 'BC:IM_AV', 'Disponibilità (Availability)', 'Le attività malevole hanno compromesso la disponibilità del sistema o del servizio.', '#6E92A0'),
('0e475c76-7c86-5b44-94c5-f776df01e932', 'BC', 'Impatto', 'BC:IM_DX', 'Esfiltrazione Dati', 'La riservatezza delle informazioni è stata compromessa tramite furto o perdita di dati.', '#6E92A0'),
('fb5d7ce4-1e73-54b7-be7c-53aec999f0d9', 'BC', 'Impatto', 'BC:IM_DE', 'Esposizione Dati', 'Divulgazione non autorizzata di dati sensibili causata da vulnerabilità o errori.', '#6E92A0'),
('b202e03b-a3b1-5df6-8b9e-18ece3e2df8a', 'BC', 'Impatto', 'BC:IM_DM', 'Manipolazione Dati', 'L''integrità delle informazioni è stata compromessa tramite modifica o distruzione.', '#6E92A0'),
('c937ddeb-f275-5150-b873-69fbb775db63', 'BC', 'Impatto', 'BC:IM_NI', 'Nessun Impatto', 'L''evento è stato prevenuto o non ha causato danni effettivi.', '#6E92A0'),
('ab5fdcdf-6a3b-5894-b63b-2b21bb52648d', 'BC', 'Impatto', 'BC:IM_SC', 'Compromissione Sistema', 'L''evento ha comportato la compromissione fisica o logica di un asset informatico.', '#6E92A0'),

-- Sotto-categoria: Causa Radice (RO)
('bea26838-e3de-517a-a0ff-7bcced27d0f6', 'BC', 'Causa', 'BC:RO_HE', 'Errore Umano', 'Eventi causati da un errore umano non intenzionale.', '#6E92A0'),
('5bf51ec3-acf1-5e2a-9202-ba730d489711', 'BC', 'Causa', 'BC:RO_MA', 'Azioni Malevole', 'Tentativo intenzionale di compromettere integrità, riservatezza o disponibilità.', '#6E92A0'),
('8e8a106a-4f9c-5f7e-baa2-aed22ac3fa8d', 'BC', 'Causa', 'BC:RO_NP', 'Fenomeni Naturali', 'Eventi causati da occorrenze naturali come terremoti o alluvioni.', '#6E92A0'),
('cfc9a1f8-4c4e-5695-a139-975330774289', 'BC', 'Causa', 'BC:RO_SF', 'Guasto di Sistema', 'Malfunzionamento imprevisto in cui un sistema cessa di operare secondo le specifiche.', '#6E92A0'),
('907575ed-27e7-5577-a114-5d60d7a33ed8', 'BC', 'Causa', 'BC:RO_TF', 'Guasto Terze Parti', 'Interruzione attribuibile a malfunzionamenti di servizi forniti da terzi (Supply Chain).', '#6E92A0'),

-- Sotto-categoria: Severità (SE)
('64193821-4f41-5415-8b71-d1b3671507a4', 'BC', 'Severità', 'BC:SE_HI', 'Alta (High)', 'Impossibilità di fornire servizi essenziali o esfiltrazione massiva di dati proprietari.', '#6E92A0'),
('d5d43c71-adcc-55b4-880b-db4992c80fe1', 'BC', 'Severità', 'BC:SE_ME', 'Media (Medium)', 'Fornitura di servizi ridotta o accesso non autorizzato rilevato. Tempi di recupero incerti.', '#6E92A0'),
('b2591d1b-9f79-5259-8ae3-972160106fdd', 'BC', 'Severità', 'BC:SE_LO', 'Bassa (Low)', 'Servizi essenziali garantiti ma non in modo ottimale. Recupero in tempi noti.', '#6E92A0'),
('abedd27c-125c-5678-878b-8d8aef3dfc8b', 'BC', 'Severità', 'BC:SE_NO', 'Nessuna (None)', 'Nessun effetto sulla capacità di erogare servizi.', '#6E92A0'),


-- =========================================================================
-- MACRO-AREA 2: THREAT TYPE (TT) - Colore: #F07930
-- =========================================================================
-- Sotto-categoria: Codice Malevolo (MA)
('5cdb005a-50c7-52e0-9179-bbbd1a902696', 'TT', 'Codice Malevolo', 'TT:MA_BA', 'Backdoor', 'Malware che garantisce un accesso secondario e occulto a un asset compromesso.', '#F07930'),
('d09e5d25-066a-5c05-8f4a-3a0ca7d8dc7e', 'TT', 'Codice Malevolo', 'TT:MA_BK', 'Banker', 'Malware finalizzato al furto di credenziali bancarie o informazioni finanziarie.', '#F07930'),
('1900d684-8a1a-5de9-9bd3-d1f0317ead0e', 'TT', 'Codice Malevolo', 'TT:MA_BO', 'Bot / Botnet', 'Programma utilizzato per creare una rete di macchine zombie controllate da remoto.', '#F07930'),
('50366c23-12a4-5009-85ca-fc91e242a580', 'TT', 'Codice Malevolo', 'TT:MA_CM', 'Coin Miner', 'Malware che sfrutta la potenza di calcolo per estrarre criptovalute.', '#F07930'),
('65c38d42-ad2a-57de-9653-67de478999a2', 'TT', 'Codice Malevolo', 'TT:MA_EK', 'Exploit Kit', 'Strumenti software progettati per sfruttare vulnerabilità di rete o applicazioni.', '#F07930'),
('e2b07f64-91c7-5418-8397-cbe3cd23f454', 'TT', 'Codice Malevolo', 'TT:MA_IS', 'Information Stealer', 'Malware (inclusi keylogger e spyware) mirato alla raccolta illecita di informazioni.', '#F07930'),
('d5187ce4-7800-5af8-b13d-9b6337b6fedf', 'TT', 'Codice Malevolo', 'TT:MA_RA', 'Ransomware', 'Minaccia che mira a cifrare i dati dell''asset bersaglio a scopo estorsivo.', '#F07930'),
('65c81af9-6bd9-5ea2-9b2b-9bd529a0bd5c', 'TT', 'Codice Malevolo', 'TT:MA_RT', 'Remote Access Tool', 'Strumento che permette a un attaccante di controllare l''asset bersaglio da remoto.', '#F07930'),
('272b3c5a-d121-57f1-91c4-c524a8c86193', 'TT', 'Codice Malevolo', 'TT:MA_RO', 'Rootkit', 'Malware sofisticato progettato per infiltrarsi nel SO e ottenere privilegi elevati.', '#F07930'),
('4bed81db-92c1-5a6d-808b-a1b5b57668f1', 'TT', 'Codice Malevolo', 'TT:MA_TR', 'Trojan', 'Software che si presenta come legittimo ma scarica ed esegue codice malevolo.', '#F07930'),
('c5c99536-83be-5d0c-9cf0-40ba3abe97c7', 'TT', 'Codice Malevolo', 'TT:MA_VI', 'Virus', 'Software che mira ad autoreplicarsi modificando i programmi in esecuzione.', '#F07930'),
('38ee2742-ef5f-5104-b825-c8d7678fe56b', 'TT', 'Codice Malevolo', 'TT:MA_WE', 'Webshell', 'Script installato su server web per ottenere un accesso remoto e persistente.', '#F07930'),
('00cb640a-5a87-5c52-8e53-d6e3e2c413ad', 'TT', 'Codice Malevolo', 'TT:MA_WI', 'Wiper', 'Malware il cui obiettivo primario è cancellare irreversibilmente file e dati.', '#F07930'),

-- Sotto-categoria: Ingegneria Sociale (SO)
('d7b12cba-3eee-56de-b234-198e89d3c36a', 'TT', 'Ingegneria Sociale', 'TT:SO_PH', 'Phishing', 'Utente contattato via email per indurlo a eseguire codice o visitare risorse false.', '#F07930'),
('9305ee4e-07bb-57f8-a10d-792bd3c9f05d', 'TT', 'Ingegneria Sociale', 'TT:SO_SM', 'Smishing', 'Ingegneria sociale perpetrata tramite invio di messaggi SMS.', '#F07930'),
('a5e5a942-6d94-5b30-a6b9-3a55e28f438c', 'TT', 'Ingegneria Sociale', 'TT:SO_SP', 'Spear Phishing', 'Phishing altamente mirato verso soggetti specifici tramite account che sembrano familiari.', '#F07930'),
('3edbb14f-316f-56cc-aa16-6714e4581ceb', 'TT', 'Ingegneria Sociale', 'TT:SO_VI', 'Vishing', 'Ingegneria sociale perpetrata tramite sistemi di comunicazione vocale (chiamate).', '#F07930'),
('0ff5e622-44e8-5892-b5d3-8159c455006a', 'TT', 'Ingegneria Sociale', 'TT:SO_WH', 'Watering Hole', 'Infezione di siti web legittimi regolarmente visitati da uno specifico gruppo bersaglio.', '#F07930'),

-- Sotto-categoria: Frode (FR)
('74636284-6c73-5e13-ae8c-44e0bf6a1919', 'TT', 'Frode', 'TT:FR_BA', 'Brand Abuse', 'Sfruttamento della notorietà di un''organizzazione per creare siti falsi o truffe.', '#F07930'),
('731becab-219c-5dce-98a4-e929d2d6349d', 'TT', 'Frode', 'TT:FR_EX', 'Estorsione', 'Coercizione per ottenere vantaggi finanziari tramite minaccia di danni o leak di dati.', '#F07930'),
('87411808-1d85-5b5b-96eb-52e62c792dff', 'TT', 'Frode', 'TT:FR_MA', 'Masquerade', 'Assunzione dell''identità di un altro utente o dispositivo per aggirare la sicurezza.', '#F07930'),

-- Sotto-categoria: Vulnerabilità (VU)
('62833057-dfb8-5c38-8e45-7998936aac86', 'TT', 'Vulnerabilità', 'TT:VU_0D', 'Vulnerabilità 0-Day', 'Vulnerabilità non nota pubblicamente sfruttata per compromettere un sistema.', '#F07930'),
('dcb5039e-8dbb-58a0-990e-32b2df2a464e', 'TT', 'Vulnerabilità', 'TT:VU_ND', 'Vulnerabilità n-Day', 'Vulnerabilità già resa pubblica e sfruttata dagli attaccanti.', '#F07930'),
('b9a9404b-4d16-51c8-9710-b99db680816b', 'TT', 'Vulnerabilità', 'TT:VU_SM', 'Errata Configurazione di Sicurezza', 'Configurazione errata di un asset che crea falle facilmente sfruttabili.', '#F07930'),


-- =========================================================================
-- MACRO-AREA 3: THREAT ACTOR (TA) - Colore: #C10000
-- =========================================================================
-- Sotto-categoria: Tipo Avversario (AD)
('df896f80-7c0f-535d-92ef-1904cac50d14', 'TA', 'Tipo Avversario', 'TA:AD_CR', 'Criminale', 'Attore i cui obiettivi primari tendono a generare profitto illecito.', '#C10000'),
('d189a534-3eaa-50e2-b3d1-4965252e1199', 'TA', 'Tipo Avversario', 'TA:AD_HA', 'Hacktivist', 'Soggetti che utilizzano strumenti digitali per promuovere agende politiche o sociali.', '#C10000'),
('10656f67-ffd1-569a-bff9-86296ac9c47e', 'TA', 'Tipo Avversario', 'TA:AD_IN', 'Insider', 'Attaccante interno che utilizza i propri permessi per condurre attacchi dall''interno.', '#C10000'),
('301b53de-3274-58ed-bfad-b37909f0229a', 'TA', 'Tipo Avversario', 'TA:AD_NS', 'Nation State', 'Eventi cyber condotti o sponsorizzati da entità governative o stati sovrani.', '#C10000'),

-- Sotto-categoria: Motivazione (AM)
('feff7e29-19a9-5fe0-a2bc-aac03223c57c', 'TA', 'Motivazione', 'TA:AM_DE', 'Distruzione', 'Attività mirata a danneggiare un asset per interromperne le operazioni.', '#C10000'),
('24f002c2-b109-5dc3-8865-ee7329461541', 'TA', 'Motivazione', 'TA:AM_ES', 'Spionaggio', 'Attività mirata ad acquisire dati classificati o proprietari per vantaggio competitivo.', '#C10000'),
('9a526783-531d-5613-bc39-ece8112ff8f9', 'TA', 'Motivazione', 'TA:AM_ID', 'Ideologia', 'Azioni per diffondere un messaggio di natura ideologica o politica.', '#C10000'),
('472a49fb-ed9e-57cb-9711-2c07093ecea3', 'TA', 'Motivazione', 'TA:AM_DI', 'Disinformazione', 'Disseminazione intenzionale di notizie distorte per influenzare l''opinione pubblica.', '#C10000'),
('2e26b93f-7e0d-5972-88b8-6b35c27e8a39', 'TA', 'Motivazione', 'TA:AM_PR', 'Profitto', 'L''attaccante compie azioni illecite per ottenere un ritorno economico.', '#C10000'),


-- =========================================================================
-- MACRO-AREA 4: ADDITIONAL CONTEXT (AC) - Colore: #0070C0
-- =========================================================================
-- Sotto-categoria: Vettore (VE)
('b2a8b90c-6cca-54e9-a026-79a4ecf9ff2e', 'AC', 'Vettore', 'AC:VE_EM', 'E-mail', 'Utilizzo di una casella di posta elettronica come vettore di attacco iniziale.', '#0070C0'),
('70614f11-91be-5e57-94d5-df9d5fa426fa', 'AC', 'Vettore', 'AC:VE_EV', 'Sfruttamento Vulnerabilità', 'Sfruttamento di falle note o sconosciute (es. su servizi web esposti).', '#0070C0'),
('4021f71d-507e-5666-9692-b58db7774e8b', 'AC', 'Vettore', 'AC:VE_ER', 'Servizi Remoti Esterni', 'Sfruttamento di servizi di accesso remoto (RDP, VPN) per penetrare la rete.', '#0070C0'),
('63790f2b-3ae1-5784-9d23-1e737c390e8d', 'AC', 'Vettore', 'AC:VE_SU', 'Supply Chain', 'Utilizzo di prodotti o servizi compromessi forniti da terze parti.', '#0070C0'),
('4ee0c311-6b7e-5870-8387-d1e31ac5ba98', 'AC', 'Vettore', 'AC:VE_VA', 'Account Validi', 'L''attaccante utilizza credenziali legittime rubate per compiere azioni malevole.', '#0070C0'),
('25dc6fa5-6c47-56ed-9f4d-97618d6d03ad', 'AC', 'Vettore', 'AC:VE_CO', 'Dominio Compromesso', 'L''evento ha interessato un dominio internet legittimo utilizzato per condurre l''attacco.', '#0070C0'),
('acd16c29-3822-5183-b5a8-8eea438eeeb2', 'AC', 'Vettore', 'AC:VE_SM', 'Social Media', 'Utilizzo di piattaforme social come vettore d''attacco iniziale.', '#0070C0'),

-- Sotto-categoria: Prospettiva (OU)
('5548e2dc-b77a-5da1-9609-2cb0524b32b0', 'AC', 'Prospettiva', 'AC:OU_IM', 'In Miglioramento', 'Incidente in cui si prevede una riduzione dell''impatto nelle prossime sei ore.', '#0070C0'),
('32b64337-417b-50e9-8dd7-a8594fdc0ee4', 'AC', 'Prospettiva', 'AC:OU_ST', 'Stabile', 'Incidente in cui l''impatto rimarrà invariato entro le prossime sei ore.', '#0070C0'),
('bc8331c8-7b35-52fd-b62c-4ac75f733f78', 'AC', 'Prospettiva', 'AC:OU_WO', 'In Peggioramento', 'Incidente in cui si prevede che l''impatto peggiorerà nelle prossime sei ore.', '#0070C0')

ON CONFLICT (codice_acn) DO NOTHING;