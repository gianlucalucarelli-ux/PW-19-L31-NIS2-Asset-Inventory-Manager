# PW-19 L-31 — NIS2 Asset Inventory Manager

## Università Telematica Pegaso

Corso di Laurea Triennale in Informatica per le aziende digitali — L-31  
Tema n. 2 — Privacy e sicurezza aziendale

Project Work n. 19: progettazione e realizzazione di una base dati relazionale per catalogare asset, servizi, dipendenze, fornitori e responsabilità utili alla compilazione dei profili richiesti dall’Agenzia per la Cybersicurezza Nazionale nell’ambito della direttiva NIS2.

---

## 1. Descrizione del progetto

NIS2 Asset Inventory Manager è un prototipo applicativo completo per la gestione centralizzata di soggetti NIS2, asset tecnologici, servizi, dipendenze, fornitori, responsabilità organizzative, vulnerabilità, incidenti, tracciabilità e cybersecurity assessment secondo il Framework Nazionale per la Cybersecurity e la Data Protection.

Il progetto è rivolto in modo generale a organizzazioni pubbliche e private e utilizza un modello relazionale PostgreSQL sviluppato su Supabase. L’obiettivo è offrire una sorgente informativa strutturata, verificabile e tracciabile, utile al censimento degli elementi, alla ricostruzione della Supply Chain, alla gestione delle responsabilità, alla preparazione dei dati per i profili ACN e al confronto tra Profilo Target e Profilo Attuale.

Il backend è stato consolidato attraverso una Core Migration Pipeline documentata dagli script `01–30` e un Diagnostic, Validation & Patch Toolkit formato dagli script `X1–X21`. Il frontend web, sviluppato con HTML5, CSS3 e JavaScript ES6 mediante moduli nativi, comprende home pubblica, autenticazione, dashboard, anagrafiche, inventario, servizi, fornitori, relazioni, Supply Chain, incidenti, Audit Log, importazioni, esportazioni e Assessment FNCSDP.

La build applicativa finale documentata e collaudata è `20260730-f11`.

## 2. Obiettivi principali

Il progetto comprende:

- catalogazione di asset fisici, logici e organizzativi;
- censimento dei soggetti NIS2 e delle relative figure organizzative;
- gestione di persone, ruoli, incarichi, titolari e vice;
- censimento di servizi e servizi critici;
- gestione delle dipendenze servizio–asset e servizio–fornitore;
- gerarchie storicizzabili servizio–sottoservizio, asset–sotto-asset e fornitore–subfornitore;
- relazione esplicita e storicizzabile tra asset e fornitori;
- ricostruzione della Supply Chain multilivello;
- classificazione di vulnerabilità e incidenti mediante tassonomie ACN;
- raccolta guidata delle informazioni nel wizard di Incident Reporting;
- audit generalizzato delle entità, delle relazioni e degli accessi applicativi;
- archiviazione logica e blocco della cancellazione fisica;
- viste dedicate a reporting, consultazione ed esportazione;
- sicurezza applicativa basata su privilegi PostgreSQL, RLS, JWT e MFA;
- Assessment FNCSDP con Profilo Target, Profilo Attuale, score, gap e maturità;
- esportazioni XLSX strutturate per inventario, Supply Chain, Audit Log e assessment.

---

## 3. Architettura e tecnologie

- Database: PostgreSQL su Supabase.
- Sicurezza: Row Level Security, privilegi PostgreSQL, JWT, livelli AAL e autenticazione MFA.
- Backend dati: SQL, PL/pgSQL, trigger, funzioni RPC e viste `security_invoker`.
- Frontend: HTML5, CSS3 e JavaScript ES6 con moduli nativi, senza framework applicativo.
- Comunicazione: client Supabase, API REST e funzioni RPC.
- Esportazioni: CSV mediante gli strumenti PostgreSQL/Supabase e XLSX tramite ExcelJS nel browser.
- Versionamento: Git e GitHub.
- Deployment web: GitHub Pages dalla cartella radice `/(root)` del ramo `main`.
- Modellazione: schema relazionale normalizzato, con separazione di entità, domini, gerarchie e relazioni molti-a-molti.
- Diagrammi: PlantUML per gli schemi UML e DBML per il modello ER completo.
- Documentazione: Microsoft Word e PDF per il Project Work e le relazioni tecniche.

Il modello finale è sviluppato in terza forma normale. La verifica `X21` controlla struttura, mapping FNCSDP, coerenza delle misure e assenza di ridondanze non necessarie nel perimetro del modulo di assessment.

---

## 4. Stato verificato del backend

La diagnostica `X17_CHECK_VERIFICA_FINALE_BACKEND.sql` ha confermato la chiusura del nucleo storico. Le successive diagnostiche `X18–X20` hanno verificato accessi, MFA, qualità dei dati e registrazione degli eventi applicativi. `X21-Diagnostica-Profili-Assessment-FNCSDP-v1.0.sql`, eseguita dopo la migrazione 30, ha restituito in due esecuzioni consecutive:

```text
VERIFICA_ASSESSMENT_FNCSDP_SUPERATA
```

Stato consolidato:

| Indicatore | Valore |
|---|---:|
| Tabelle nello schema `public` | 36 |
| Viste applicative principali | 11 |
| Tabelle operative coperte da audit e blocco `DELETE` | 21 |
| Trigger di audit | 21 |
| Trigger di blocco della cancellazione fisica | 21 |
| Trigger di archiviazione standard | 16 |
| Relazioni temporali storicizzate | 5 |
| Vincoli `ON DELETE CASCADE` residui | 0 |
| Policy `DELETE` applicative | 0 |
| Privilegi del ruolo `anon` sulle risorse applicative | 0 |
| Vincoli non validati | 0 |
| Indici non validi | 0 |
| Migrazioni produttive documentate | 30 |
| Diagnostiche documentate | 21 |
| Tabelle FNCSDP | 6 |
| Viste FNCSDP | 4 |

Il collaudo FNCSDP ha completato sei misure e ha prodotto avanzamento `100%`, score `67%`, gap `33%` e maturità media indicativa `3,17/5`, insieme a un file XLSX articolato in cinque fogli e agli eventi correlati nell’Audit Log.

## 5. Funzionalità backend consolidate

### Supply Chain multilivello

Il modello rappresenta:

- servizio → servizio;
- servizio → asset;
- asset → asset;
- asset → fornitore;
- servizio → fornitore;
- fornitore → fornitore.

Le viste gerarchiche e `vista_supply_chain_multilivello` consentono di distinguere dipendenze dirette e derivate, livello del percorso e servizio radice.

### Audit generalizzato

La funzione `fn_audit_generico()` copre il modello operativo storico, mentre `fn_audit_fncsdp()` estende la tracciabilità alle sei tabelle del modulo FNCSDP. La funzione `fn_registra_accesso_applicativo()` registra inoltre gli eventi `LOGIN`, `LOGOUT` e `MFA_VERIFICATA` senza consentire al frontend scritture arbitrarie nella tabella `audit_log`.

Il registro conserva:

- tabella ed entità interessata;
- identificativo, chiave, codice e nome del record;
- contesto di asset, servizio, fornitore, Profilo Target, assessment e controllo;
- UUID ed e-mail dell’utente;
- livello AAL e ruolo JWT;
- ruolo database e origine dell’operazione;
- valori precedenti e nuovi in formato JSONB.

La consultazione avviene mediante `vista_audit_dettagliato` e attraverso il modulo Audit Log del frontend.

### Archiviazione logica

Le entità operative non vengono eliminate fisicamente. Il modello utilizza:

- `attiva`, `archiviato_il`, `archiviato_da` e `motivo_archiviazione` sulle tabelle standard;
- `attiva`, `valido_dal` e `valido_al` sulle relazioni storicizzate;
- trigger `BEFORE DELETE` che bloccano la cancellazione fisica;
- chiavi esterne configurate con `RESTRICT`.

### Reporting e interoperabilità

Le undici viste principali comprendono le sette viste consolidate del nucleo storico e le quattro viste FNCSDP. Tra le principali:

- `vista_esportazione_acn_assets`;
- `vista_reporting_servizi_critici`;
- `vista_gerarchia_servizi_espansa`;
- `vista_gerarchia_asset_espansa`;
- `vista_gerarchia_fornitori_espansa`;
- `vista_supply_chain_multilivello`;
- `vista_audit_dettagliato`;
- `vista_profili_target_fncsdp`;
- `vista_controlli_target_fncsdp`;
- `vista_profili_attuali_fncsdp`;
- `vista_valutazione_fncsdp`.

### Assessment FNCSDP

Il modulo consente di:

1. creare un Profilo Target collegato a un soggetto NIS2;
2. associare e verificare le Subcategory `ID.AM-1–ID.AM-6`;
3. approvare il Target e renderlo di sola lettura;
4. generare un assessment;
5. compilare il Profilo Attuale e le evidenze;
6. completare le sei misure previste;
7. calcolare avanzamento, score, gap e maturità media;
8. esportare il risultato in XLSX e ricostruire gli eventi nell’Audit Log.

---

## 6. Sicurezza

Il modello di accesso separa privilegi PostgreSQL, policy RLS e controlli applicativi.

- Il ruolo `anon` non dispone di privilegi sulle tabelle e sulle viste applicative.
- Il modello ordinario richiede una sessione MFA con livello `aal2`.
- Un profilo dedicato alla valutazione costituisce un’eccezione controllata e può operare in `aal1` tramite `fn_accesso_operativo()`.
- Gli script `22` e `23` introducono ed estendono il criterio di accesso operativo alle tabelle applicative previste.
- La migrazione `30` applica il medesimo criterio alle sei tabelle FNCSDP.
- `INSERT` e `UPDATE` sono disponibili soltanto sulle tabelle operative autorizzate.
- Non vengono concesse policy o privilegi `DELETE`.
- Le viste principali utilizzano `security_invoker`.
- Le funzioni `SECURITY DEFINER` sono limitate a compiti specifici e utilizzano un `search_path` controllato.
- La tabella `audit_log` è consultabile dagli utenti autorizzati, ma non è scrivibile direttamente dal frontend.
- L’archiviazione logica e i trigger di blocco preservano le evidenze storiche.

Le credenziali e le procedure operative necessarie alla valutazione sono riportate esclusivamente nel documento principale del Project Work, consegnato separatamente e non pubblicato nel repository.

## 7. Struttura del repository

```text
/
├── index.html
├── README.md
├── assets/
│   └── branding/
├── sql/
│   ├── 01 ... 30
│   └── X1 ... X21
├── src/
│   ├── main.js
│   ├── router.js
│   ├── ui.js
│   ├── auth.js
│   ├── database.js
│   ├── organizationManagement.js
│   ├── serviceManagement.js
│   ├── supplierManagement.js
│   ├── relationshipBuilder.js
│   ├── supplyChain.js
│   ├── incidentManagement.js
│   ├── auditLog.js
│   ├── assessmentManagement.js
│   ├── assessmentService.js
│   ├── importExport.js
│   ├── export.js
│   ├── i18n.js
│   ├── style.css
│   └── wizard.css
└── docs/
    ├── ACN_Tassonomia_Cyber_CLEAR.pdf
    ├── Metodologia_Assessment_Framework_Nazionale_-_v1.0.pdf
    ├── Relazione_Tecnica_Backend_Database_v3.0.docx
    ├── Relazione_Tecnica_Backend_Database_v3.0.pdf
    ├── Relazione_Tecnica_Frontend_Applicativo_v1.0.docx
    ├── Relazione_Tecnica_Frontend_Applicativo_v1.0.pdf
    ├── diagrammi/
    │   ├── Core_Migration_Pipeline_01-30.puml/.png
    │   ├── Diagnostic_Validation_Patch_Toolkit_X1-X21.puml/.png
    │   ├── Architettura_Componenti_v2.puml/.png
    │   ├── Diagramma_Casi_Uso_NIS2_Ruoli_ACN_v2.puml/.png
    │   ├── Diagramma_Classi_Concettuale_NIS2_FNCSDP_v2.puml/.png
    │   ├── Diagramma_Stato_Assessment_FNCSDP_v2.puml/.png
    │   ├── Diagramma_Navigazione_Frontend_v5.puml/.png/.pdf
    │   ├── Diagramma_ER_V5.3_36_tabelle.dbml/.pdf
    │   ├── Diagramma_ER_V5.3_36_tabelle_viste.pdf
    │   └── Diagramma_ER_FNCSDP_Dettaglio_V1.png/.pdf
    └── tools/
        ├── genera_schemi_backend.py
        └── requirements.txt
```

### Cartella `sql`

Contiene due insiemi distinti:

- Core Migration Pipeline `01–30`: baseline, popolamenti, hardening, gerarchie, Supply Chain, sicurezza, audit, governance NIS2 e Assessment FNCSDP;
- Diagnostic, Validation & Patch Toolkit `X1–X21`: esportazioni diagnostiche, readiness, controlli strutturali, accessi, qualità dei dati, audit applicativo e validazione FNCSDP.

### Cartella `src`

Contiene il codice JavaScript e CSS dell’applicativo, organizzato in moduli dedicati a sessione, navigazione, rendering, organizzazioni, asset, servizi, fornitori, relazioni, Supply Chain, incidenti, Audit Log, importazioni, esportazioni e Assessment FNCSDP.

### Cartella `docs`

Contiene le relazioni tecniche definitive, i documenti metodologici e la sottocartella `diagrammi`. Gli schemi UML sono conservati come coppie PlantUML/PNG; il modello ER completo utilizza il sorgente DBML e i corrispondenti PDF. Il dettaglio FNCSDP è disponibile anche in PNG per la consultazione diretta su GitHub.

### Cartella `docs/tools`

Contiene gli strumenti utilizzati per rigenerare nel formato PNG la Core Migration Pipeline e il Diagnostic, Validation & Patch Toolkit.

## 8. Pipeline SQL

La pipeline produttiva comprende trenta passaggi documentati.

Principali fasi:

1. baseline dello schema, dati iniziali, RLS e privilegi;
2. viste, audit iniziale e configurazione temporale;
3. tassonomia degli incidenti ACN;
4. hardening dei domini e gerarchie di servizi e asset;
5. gerarchia dei fornitori e relazione asset–fornitore;
6. Supply Chain multilivello, reporting e audit generalizzato;
7. archiviazione logica e rimozione dei vincoli `ON DELETE CASCADE`;
8. accesso operativo controllato e policy sulle tabelle applicative;
9. archiviazione dei record dimostrativi e normalizzazione terminologica;
10. soggetti NIS2, incarichi storicizzati, cataloghi, audit degli accessi e modulo FNCSDP.

Le diagnostiche `X1–X21` accompagnano la pipeline e documentano struttura, sicurezza, readiness, accessi, qualità dei dati, eventi di autenticazione e stato finale dell’Assessment FNCSDP.

## 9. Documentazione tecnica

### Relazione tecnica backend

- [Relazione tecnica backend database v3.0 — PDF](docs/Relazione_Tecnica_Backend_Database_v3.0.pdf)
- [Relazione tecnica backend database v3.0 — DOCX](docs/Relazione_Tecnica_Backend_Database_v3.0.docx)

### Relazione tecnica frontend

- [Relazione tecnica frontend applicativo v1.0 — PDF](docs/Relazione_Tecnica_Frontend_Applicativo_v1.0.pdf)
- [Relazione tecnica frontend applicativo v1.0 — DOCX](docs/Relazione_Tecnica_Frontend_Applicativo_v1.0.docx)

### Core Migration Pipeline

- [Sorgente PlantUML della Core Migration Pipeline 01–30](docs/diagrammi/Core_Migration_Pipeline_01-30.puml)
- [Immagine della Core Migration Pipeline 01–30](docs/diagrammi/Core_Migration_Pipeline_01-30.png)

### Diagnostic, Validation & Patch Toolkit

- [Sorgente PlantUML del Toolkit X1–X21](docs/diagrammi/Diagnostic_Validation_Patch_Toolkit_X1-X21.puml)
- [Immagine del Toolkit X1–X21](docs/diagrammi/Diagnostic_Validation_Patch_Toolkit_X1-X21.png)

### Diagrammi del Project Work

- [Architettura dei componenti — PlantUML](docs/diagrammi/Architettura_Componenti_v2.puml)
- [Architettura dei componenti — PNG](docs/diagrammi/Architettura_Componenti_v2.png)
- [Casi d’uso e ruoli NIS2/ACN — PlantUML](docs/diagrammi/Diagramma_Casi_Uso_NIS2_Ruoli_ACN_v2.puml)
- [Casi d’uso e ruoli NIS2/ACN — PNG](docs/diagrammi/Diagramma_Casi_Uso_NIS2_Ruoli_ACN_v2.png)
- [Classi concettuali NIS2/FNCSDP — PlantUML](docs/diagrammi/Diagramma_Classi_Concettuale_NIS2_FNCSDP_v2.puml)
- [Classi concettuali NIS2/FNCSDP — PNG](docs/diagrammi/Diagramma_Classi_Concettuale_NIS2_FNCSDP_v2.png)
- [Stati del Profilo Target e dell’Assessment — PlantUML](docs/diagrammi/Diagramma_Stato_Assessment_FNCSDP_v2.puml)
- [Stati del Profilo Target e dell’Assessment — PNG](docs/diagrammi/Diagramma_Stato_Assessment_FNCSDP_v2.png)

### Diagramma ER

- [Sorgente DBML del diagramma ER V5.3 a 36 tabelle](docs/diagrammi/Diagramma_ER_V5.3_36_tabelle.dbml)
- [Diagramma ER V5.3 a 36 tabelle](docs/diagrammi/Diagramma_ER_V5.3_36_tabelle.pdf)
- [Diagramma ER V5.3 con tabelle e viste](docs/diagrammi/Diagramma_ER_V5.3_36_tabelle_viste.pdf)
- [Dettaglio ER FNCSDP — PDF](docs/diagrammi/Diagramma_ER_FNCSDP_Dettaglio_V1.pdf)
- [Dettaglio ER FNCSDP — PNG](docs/diagrammi/Diagramma_ER_FNCSDP_Dettaglio_V1.png)

### Navigazione frontend

- [Sorgente PlantUML del diagramma di navigazione frontend v5](docs/diagrammi/Diagramma_Navigazione_Frontend_v5.puml)
- [Immagine del diagramma di navigazione frontend v5](docs/diagrammi/Diagramma_Navigazione_Frontend_v5.png)
- [Diagramma di navigazione frontend v5 — PDF](docs/diagrammi/Diagramma_Navigazione_Frontend_v5.pdf)

### Fonti metodologiche

- [Tassonomia Cyber ACN](docs/ACN_Tassonomia_Cyber_CLEAR.pdf)
- [Metodologia di assessment del Framework Nazionale](docs/Metodologia_Assessment_Framework_Nazionale_-_v1.0.pdf)

## 10. Applicativo web

L’applicazione è pubblicata tramite GitHub Pages:

[NIS2 Asset Inventory Manager](https://gianlucalucarelli-ux.github.io/PW-19-L31-NIS2-Asset-Inventory-Manager/)

### Accesso riservato alla valutazione

Le credenziali, le modalità di accesso applicativo e le eventuali procedure di consultazione tecnica del progetto Supabase sono riportate nel documento principale del Project Work, consegnato privatamente al valutatore e non pubblicato nel repository.

Il profilo di valutazione utilizza l’eccezione controllata prevista dalle policy del progetto. Le utenze operative ordinarie devono invece raggiungere `aal2` mediante MFA.

Stato finale dell’applicativo:

- home pubblica con finalità, contesto e accesso all’area riservata;
- autenticazione Supabase, gestione della sessione e controllo AAL;
- dashboard con indicatori e collegamenti ai moduli operativi;
- gestione di soggetti NIS2, persone, ruoli e incarichi;
- inventario con ricerca, filtri, paginazione, dettaglio, inserimento, modifica e archiviazione logica;
- importazione degli asset con modello XLSX, anteprima, validazione e controllo duplicati;
- gestione di servizi, fornitori e relazioni;
- costruzione e consultazione della Supply Chain multilivello;
- wizard per la classificazione degli incidenti e gestione degli eventi;
- Audit Log con filtri, dettaglio ed esportazione;
- Assessment FNCSDP in otto passaggi, con Target, Attuale, score, gap e maturità;
- esportazioni XLSX strutturate e coerenti con i filtri applicati;
- navigazione hash, comportamento responsive, tema chiaro/scuro e interfaccia bilingue;
- pagina Informazioni e guida e sezione Ringraziamenti;
- build finale `20260730-f11`.

Il progetto non sostituisce i canali istituzionali di notifica ACN, una CMDB enterprise, strumenti di discovery automatico, vulnerability scanner o piattaforme complete di incident management.

## 11. Riproducibilità e versionamento

Il flusso adottato per gli script SQL è:

1. esecuzione e verifica su Supabase;
2. salvataggio nel repository mediante `vscode.dev` o interfaccia GitHub;
3. commit nel ramo `main`;
4. pubblicazione automatica tramite GitHub Pages;
5. aggiornamento della copia locale mediante `Code → Download ZIP`.

La sorgente ufficiale del codice è il ramo `main` del repository. Supabase rappresenta lo stato operativo del database, mentre lo ZIP locale costituisce la copia di sicurezza aggiornata.

Questa procedura evita di versionare migrazioni non verificate e mantiene allineati database cloud, repository remoto, pubblicazione web e archivio locale. I sorgenti PlantUML e DBML permettono inoltre di rigenerare i diagrammi senza dipendere esclusivamente dalle immagini esportate.

## 12. Stato del Project Work

### Completato

- progettazione e consolidamento del backend PostgreSQL/Supabase;
- Core Migration Pipeline `01–30`;
- Diagnostic, Validation & Patch Toolkit `X1–X21`;
- modello ER V5.3 a 36 tabelle e 11 viste principali;
- sicurezza RLS, privilegi, JWT, livelli AAL e MFA;
- profilo di valutazione controllato;
- audit generalizzato su 21 tabelle e registrazione degli accessi applicativi;
- archiviazione logica e blocco della cancellazione fisica;
- Supply Chain multilivello;
- normalizzazione e riallineamento terminologico dei dati dimostrativi;
- modulo soggetti NIS2 e incarichi storicizzati;
- wizard incidenti e Tassonomia Cyber ACN;
- modulo FNCSDP con sei tabelle, quattro viste e sei Subcategory ID.AM;
- collaudo Target `PT-2026-01` e Assessment `ASS-2026-01`;
- frontend modulare pubblicato tramite GitHub Pages;
- relazioni tecniche definitive backend v3.0 e frontend v1.0;
- diagrammi ER, UML, pipeline, diagnostiche e navigazione;
- documento principale del Project Work predisposto per la consegna privata.

### Documentazione pubblica e riservata

Il repository contiene codice, fonti metodologiche, diagrammi e relazioni tecniche. Il documento principale del Project Work non viene pubblicato perché contiene i riferimenti operativi destinati esclusivamente alla valutazione.

## 13. Autore

Gianluca Lucarelli  
Corso di Laurea Triennale in Informatica per le aziende digitali — L-31  
Università Telematica Pegaso

<!-- Ridistribuzione GitHub Pages -->
