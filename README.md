# PW-19 L-31 — NIS2 Asset Inventory Manager

## Università Telematica Pegaso

Corso di Laurea Triennale in Informatica per le aziende digitali — L-31  
Tema n. 2 — Privacy e sicurezza aziendale

Project Work n. 19: progettazione e realizzazione di una base dati relazionale per catalogare asset, servizi, dipendenze, fornitori e responsabilità utili alla compilazione dei profili richiesti dall’Agenzia per la Cybersicurezza Nazionale nell’ambito della direttiva NIS2.

---

## 1. Descrizione del progetto

NIS2 Asset Inventory Manager è un prototipo applicativo per la gestione centralizzata di asset tecnologici, servizi critici, dipendenze, fornitori, responsabilità organizzative, vulnerabilità ed eventi di servizio.

Il progetto è rivolto in modo generale a organizzazioni pubbliche e private e utilizza un modello relazionale PostgreSQL sviluppato su Supabase. L’obiettivo è offrire una base dati strutturata, verificabile e tracciabile, utile alle attività di censimento, analisi delle dipendenze e supporto alla compliance NIS2/ACN.

Il backend è stato consolidato attraverso una pipeline SQL versionata composta da 26 migrazioni produttive e 19 diagnostiche. Il frontend web, sviluppato in HTML5, CSS3 e JavaScript ES6, è pubblicato su GitHub Pages e ha superato i test funzionali relativi a inventario asset, inserimento, modifica, Dashboard e Audit Log. Restano da completare le funzionalità avanzate di B1, B2, B3 e il ciclo di vita completo degli incidenti.

## 2. Obiettivi principali

Il progetto comprende:

- catalogazione di asset fisici, logici e organizzativi;
- censimento di servizi e servizi critici;
- gestione delle dipendenze servizio–asset e servizio–fornitore;
- gerarchie storicizzabili servizio–sottoservizio, asset–sotto-asset e fornitore–subfornitore;
- relazione esplicita e storicizzabile tra asset e fornitori;
- ricostruzione della Supply Chain multilivello;
- classificazione di vulnerabilità ed eventi secondo tassonomie ACN;
- gestione di responsabilità e ruoli organizzativi;
- audit generalizzato delle principali entità e relazioni operative;
- archiviazione logica e blocco della cancellazione fisica;
- viste dedicate a reporting, esportazione e consultazione;
- sicurezza applicativa basata su PostgreSQL RLS e autenticazione MFA.

---

## 3. Architettura e tecnologie

- Database: PostgreSQL su Supabase.
- Sicurezza: Row Level Security, privilegi PostgreSQL e autenticazione MFA.
- Backend dati: SQL, PL/pgSQL, trigger, funzioni e viste `security_invoker`.
- Frontend: HTML5, CSS3 e JavaScript ES6.
- Versionamento: Git e GitHub.
- Deployment web: GitHub Pages.
- Modellazione: schema relazionale normalizzato, con separazione di entità, domini, gerarchie e relazioni molti-a-molti.
- Diagrammi: PlantUML e DBML.

Il modello è stato progettato secondo criteri sostanzialmente coerenti con la terza forma normale. La documentazione non presenta tuttavia una certificazione formale della 3FN in assenza di una matrice completa delle dipendenze funzionali.

---

## 4. Stato verificato del backend

La verifica finale `X17_CHECK_VERIFICA_FINALE_BACKEND.sql` ha restituito:

```text
VERIFICA_FINALE_BACKEND_SUPERATA
```

Le diagnostiche successive `X18` e `X19` hanno inoltre verificato il modello di accesso, le utenze di valutazione, la qualità dei dati e la readiness delle normalizzazioni finali.

Stato consolidato:

| Indicatore | Valore |
|---|---:|
| Tabelle nello schema `public` | 30 |
| Viste applicative principali | 7 |
| Tabelle operative sottoposte ad audit | 14 |
| Trigger di blocco della cancellazione fisica | 14 |
| Trigger di archiviazione standard | 10 |
| Vincoli `ON DELETE CASCADE` residui | 0 |
| Policy `DELETE` applicative | 0 |
| Privilegi del ruolo `anon` sulle risorse applicative | 0 |
| Vincoli non validati | 0 |
| Indici non validi | 0 |
| Duplicati nella vista di reporting dei servizi critici | 0 |
| Migrazioni produttive versionate | 26 |
| Diagnostiche versionate | 19 |
| Asset attivi verificati | 13 |
| Asset archiviati logicamente | 6 |

Il backend è completo rispetto al perimetro tecnico attualmente definito. Le attività residue riguardano principalmente il completamento funzionale del frontend e la documentazione conclusiva del Project Work.

## 5. Funzionalità backend consolidate

### Supply Chain multilivello

Il modello rappresenta:

- servizio → servizio;
- servizio → asset;
- asset → asset;
- asset → fornitore;
- servizio → fornitore;
- fornitore → fornitore.

Le viste gerarchiche e `vista_supply_chain_multilivello` consentono di distinguere le dipendenze dirette da quelle derivate.

### Audit generalizzato

La funzione `fn_audit_generico()` registra le operazioni sulle principali tabelle operative e conserva:

- tabella ed entità interessata;
- identificativo e chiave del record;
- contesto di asset, servizio e fornitore;
- UUID ed e-mail dell’utente;
- livello AAL e ruolo JWT;
- ruolo database e origine dell’operazione;
- valori precedenti e nuovi in formato JSONB.

La consultazione avviene mediante `vista_audit_dettagliato`.

### Archiviazione logica

Le entità operative non vengono eliminate fisicamente. Il modello utilizza:

- `attiva`, `archiviato_il`, `archiviato_da` e `motivo_archiviazione` sulle tabelle standard;
- `attiva`, `valido_dal` e `valido_al` sulle relazioni storicizzate;
- trigger `BEFORE DELETE` che bloccano la cancellazione fisica;
- chiavi esterne configurate con `RESTRICT`.

### Reporting e interoperabilità

Le viste principali comprendono:

- `vista_esportazione_acn_assets`;
- `vista_reporting_servizi_critici`;
- `vista_gerarchia_servizi_espansa`;
- `vista_gerarchia_asset_espansa`;
- `vista_gerarchia_fornitori_espansa`;
- `vista_supply_chain_multilivello`;
- `vista_audit_dettagliato`.

---

## 6. Sicurezza

Il modello di accesso separa privilegi PostgreSQL e policy RLS.

- Il ruolo `anon` non dispone di privilegi sulle tabelle e sulle viste applicative.
- Il modello ordinario richiede una sessione MFA con livello `aal2`.
- L’utenza docente `docentepegaso@gmail.com` costituisce un’eccezione controllata di valutazione e può operare in `aal1` tramite `fn_accesso_operativo()`.
- Gli script `22` e `23` estendono l’accesso operativo controllato alle tabelle applicative previste.
- `INSERT` e `UPDATE` sono disponibili soltanto sulle tabelle operative autorizzate.
- Non vengono concesse policy o privilegi `DELETE`.
- Le viste principali utilizzano `security_invoker`.
- La tabella `audit_log` è leggibile dagli utenti autorizzati, ma non è scrivibile direttamente dal frontend.
- L’utenza obsoleta `docenteunitopegaso@gmail.com` è stata rimossa da Supabase Authentication.

Le credenziali riportate nella sezione dedicata all’accesso sono pubblicate temporaneamente per consentire ai docenti la valutazione dell’applicativo. Prima della consegna definitiva saranno trasferite nel documento di Project Work, rimosse dal repository pubblico e la password verrà ruotata in Supabase.

## 7. Struttura del repository

```text
/
├── index.html
├── README.md
├── sql/
│   ├── 01 ... 26
│   └── X1 ... X19
├── src/
│   ├── main.js
│   ├── database.js
│   ├── ui.js
│   ├── style.css
│   └── wizard.css
├── docs/
│   ├── README.md
│   ├── ACN_Tassonomia_Cyber_CLEAR.pdf
│   ├── Relazione_Tecnica_Backend_Database_v2.2.docx
│   ├── Relazione_Tecnica_Backend_Database_v2.2.pdf
│   └── diagrammi/
│       ├── Core_Migration_Pipeline_01-26.puml
│       ├── Core_Migration_Pipeline_01-26.png
│       ├── Diagnostic_Validation_Patch_Toolkit_X1-X19.puml
│       ├── Diagnostic_Validation_Patch_Toolkit_X1-X19.png
│       ├── Diagramma_Navigazione_Frontend_v3.puml
│       ├── Diagramma_Navigazione_Frontend_v3.png
│       ├── Diagramma_ER_V5.1_30_tabelle.dbml
│       └── Diagramma_ER_V5.1_30_tabelle.pdf
└── tools/
    ├── genera_schemi_backend.py
    └── requirements.txt
```

### Cartella `sql`

Contiene due insiemi distinti:

- Core Migration Pipeline `01–26`: migrazioni produttive, popolamenti, hardening, accessi controllati e normalizzazioni;
- Diagnostic, Validation & Patch Toolkit `X1–X19`: diagnostiche, controlli di readiness, validazioni, accessi e qualità dei dati.

### Cartella `src`

Contiene il codice JavaScript e CSS dell’applicativo web, incluse integrazione Supabase, rendering dell’interfaccia, gestione degli asset, Dashboard, Audit Log e wizard incidenti.

### Cartella `docs`

Contiene le relazioni tecniche ufficiali e la sottocartella `diagrammi`, nella quale sono raccolti i sorgenti PlantUML, i PNG generati, il sorgente DBML e il diagramma ER.

### Cartella `tools`

Contiene gli strumenti di supporto usati per rigenerare i diagrammi tecnici.

## 8. Pipeline SQL

La pipeline produttiva comprende 26 script sequenziali.

Principali fasi:

1. baseline dello schema, dati, RLS e privilegi;
2. viste, audit iniziale e configurazione temporale;
3. tassonomia degli incidenti ACN;
4. hardening dei domini e gerarchie di servizi e asset;
5. gerarchia dei fornitori e relazione asset–fornitore;
6. Supply Chain multilivello, reporting e audit generalizzato;
7. archiviazione logica e rimozione dei vincoli `ON DELETE CASCADE`;
8. accesso operativo controllato e abilitazione dell’utenza di valutazione;
9. archiviazione logica dei record dimostrativi e normalizzazione dei dati applicativi.

Le diagnostiche `X1–X19` accompagnano la pipeline e documentano struttura, sicurezza, readiness, accessi, qualità dei dati e stato finale del database.

## 9. Documentazione tecnica

### Relazione tecnica backend

- [Relazione tecnica backend v2.2 — PDF](docs/Relazione_Tecnica_Backend_Database_v2.2.pdf)
- [Relazione tecnica backend v2.2 — DOCX](docs/Relazione_Tecnica_Backend_Database_v2.2.docx)

### Core Migration Pipeline

- [Sorgente PlantUML della Core Migration Pipeline 01–26](docs/diagrammi/Core_Migration_Pipeline_01-26.puml)
- [Immagine della Core Migration Pipeline 01–26](docs/diagrammi/Core_Migration_Pipeline_01-26.png)

### Diagnostic, Validation & Patch Toolkit

- [Sorgente PlantUML del Toolkit X1–X19](docs/diagrammi/Diagnostic_Validation_Patch_Toolkit_X1-X19.puml)
- [Immagine del Toolkit X1–X19](docs/diagrammi/Diagnostic_Validation_Patch_Toolkit_X1-X19.png)

### Diagramma ER

- [Sorgente DBML del diagramma ER V5.1](docs/diagrammi/Diagramma_ER_V5.1_30_tabelle.dbml)
- [Diagramma ER V5.1 a 30 tabelle](docs/diagrammi/Diagramma_ER_V5.1_30_tabelle.pdf)

### Navigazione frontend

- [Sorgente PlantUML del diagramma di navigazione frontend v3](docs/diagrammi/Diagramma_Navigazione_Frontend_v3.puml)
- [Immagine del diagramma di navigazione frontend v3](docs/diagrammi/Diagramma_Navigazione_Frontend_v3.png)

### Tassonomia ACN

- [Documento di riferimento sulla tassonomia ACN](docs/ACN_Tassonomia_Cyber_CLEAR.pdf)

La relazione tecnica frontend sarà aggiunta con il nome:

```text
docs/Relazione_Tecnica_Frontend_Applicativo.pdf
```

al termine del consolidamento delle sezioni B1, B2, B3 e del ciclo di vita completo degli incidenti.

## 10. Applicativo web

L’applicazione è pubblicata tramite GitHub Pages:

[NIS2 Asset Inventory Manager](https://gianlucalucarelli-ux.github.io/PW-19-L31-NIS2-Asset-Inventory-Manager/)

### Accesso riservato alla valutazione

Le seguenti credenziali consentono ai docenti di accedere all’applicativo durante la fase di valutazione:

- Utenza: `docentepegaso@gmail.com`
- Password: `9P4UxeD2S$`

L’utenza docente utilizza l’eccezione controllata di valutazione in `aal1`. Le utenze operative ordinarie devono invece raggiungere `aal2` mediante MFA.

Le credenziali saranno rimosse dal repository pubblico dopo il loro inserimento nella versione definitiva del documento di Project Work e la password sarà successivamente ruotata in Supabase.

Stato verificato:

- inventario limitato agli asset attivi;
- 13 asset attivi e 6 asset archiviati logicamente;
- inserimento completo di un nuovo asset;
- modifica completa di un asset esistente;
- conteggi Dashboard coerenti con la criticità;
- Audit Log con registrazione di `INSERT` e `UPDATE`;
- visualizzazione degli orari nel fuso `Europe/Rome`;
- accesso docente operativo;
- Dashboard, Supply Chain e Audit Log consultabili;
- gestione incidenti ancora parziale: il wizard di creazione è disponibile, mentre elenco, dettaglio, aggiornamento, chiusura e archiviazione logica devono ancora essere sviluppati.

## 11. Riproducibilità e versionamento

Il flusso adottato per gli script SQL è:

1. esecuzione e verifica su Supabase;
2. salvataggio nel repository tramite `vscode.dev` o interfaccia GitHub;
3. commit nel ramo `main`;
4. pubblicazione automatica tramite GitHub Pages;
5. aggiornamento della copia locale mediante `Code → Download ZIP`.

La sorgente ufficiale del codice è il ramo `main` del repository. Supabase rappresenta lo stato operativo del database, mentre lo ZIP locale costituisce la copia di sicurezza aggiornata.

Questa procedura evita di versionare migrazioni non ancora verificate e mantiene allineati database cloud, repository remoto, pubblicazione web e archivio locale.

## 12. Stato del Project Work

### Completato

- progettazione e consolidamento del backend;
- pipeline produttiva `01–26`;
- toolkit diagnostico `X1–X19`;
- modello ER V5.1 a 30 tabelle;
- sicurezza RLS, privilegi e MFA;
- accesso controllato dell’utenza docente;
- audit generalizzato;
- archiviazione logica;
- normalizzazione dei dati applicativi;
- verifica finale del database;
- relazione tecnica backend v2.2;
- diagrammi backend aggiornati;
- inventario asset operativo;
- inserimento e modifica asset verificati;
- Dashboard e Audit Log verificati;
- orario Audit Log corretto.

### In corso

- chiusura B1: collegamento degli incidenti a un elenco effettivo e verifiche finali di navigazione;
- completamento B2: ricerca, filtri, paginazione, dettaglio, archiviazione logica dal web e collaudo completo import/export;
- ripresa della sezione B3 secondo la scaletta originale;
- sviluppo D2/D3: elenco, dettaglio, aggiornamento, chiusura e archiviazione logica degli incidenti;
- relazione tecnica frontend–database;
- aggiornamento di `docs/README.md`;
- revisione finale del documento principale del Project Work.

## 13. Autore

Gianluca Lucarelli  
Corso di Laurea Triennale in Informatica per le aziende digitali — L-31  
Università Telematica Pegaso

<!-- Ridistribuzione GitHub Pages -->
