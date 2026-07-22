# PW-19 L-31 — NIS2 Asset Inventory Manager

## Università Telematica Pegaso

Corso di Laurea Triennale in Informatica per le aziende digitali — L-31  
Tema n. 2 — Privacy e sicurezza aziendale

Project Work n. 19: progettazione e realizzazione di una base dati relazionale per catalogare asset, servizi, dipendenze, fornitori e responsabilità utili alla compilazione dei profili richiesti dall’Agenzia per la Cybersicurezza Nazionale nell’ambito della direttiva NIS2.

---

## 1. Descrizione del progetto

NIS2 Asset Inventory Manager è un prototipo applicativo per la gestione centralizzata di asset tecnologici, servizi critici, dipendenze, fornitori, responsabilità organizzative, vulnerabilità ed eventi di servizio.

Il progetto è rivolto in modo generale a organizzazioni pubbliche e private e utilizza un modello relazionale PostgreSQL sviluppato su Supabase. L’obiettivo è offrire una base dati strutturata, verificabile e tracciabile, utile alle attività di censimento, analisi delle dipendenze e supporto alla compliance NIS2/ACN.

Il backend è stato consolidato attraverso una pipeline SQL versionata e una serie di diagnostiche progressive. Il frontend web è sviluppato in HTML5, CSS3 e JavaScript ES6 ed è in fase di riallineamento al modello backend definitivo.

---

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

Stato finale verificato:

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

Il backend è completo rispetto al perimetro definito per il Project Work.

---

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
- La lettura è consentita alle sessioni MFA con livello `aal2` oppure all’utenza docente autorizzata.
- `INSERT` e `UPDATE` sono disponibili soltanto sulle tabelle operative e richiedono MFA `aal2`.
- Non vengono concesse policy o privilegi `DELETE`.
- Le viste principali utilizzano `security_invoker`.
- La tabella `audit_log` è leggibile dagli utenti autorizzati, ma non è scrivibile direttamente dal frontend.

Le credenziali riportate nella sezione dedicata all’accesso sono pubblicate temporaneamente per consentire ai docenti la valutazione dell’applicativo. Saranno rimosse dal repository dopo il loro inserimento nella versione definitiva del documento di Project Work consegnato tramite la piattaforma Pegaso.

---

## 7. Struttura del repository

```text
/
├── index.html
├── README.md
├── sql/
│   ├── 01 ... 21
│   └── X1 ... X17
├── src/
│   ├── css/
│   └── js/
└── docs/
    ├── ACN_Tassonomia_Cyber_CLEAR.pdf
    ├── Codice_diagramma_Core_Migration_Pipeline.puml
    ├── Codice_diagramma_Diagnostic_Validation_Patch_Toolkit_X.puml
    ├── Core_Migration_Pipeline.png
    ├── Diagramma_Diagnostic_Patch_Toolkit.png
    ├── Diagramma_ER_V5.0_30_tabelle.dbml
    ├── Diagramma_ER_V5.0_30_tabelle.dbml.pdf
    ├── Diagramma_ER_V5.0_30_tabelle.pdf
    ├── Relazione_Tecnica_Backend_Database_v2.1.docx
    └── Relazione_Tecnica_Backend_Database_v2.1.pdf
```

### Cartella `sql`

Contiene due insiemi distinti:

- Core Migration Pipeline `01–21`: migrazioni produttive, popolamenti, hardening e correzioni;
- Diagnostic, Validation & Patch Toolkit `X1–X17`: diagnostiche, controlli di readiness, validazioni e verifica finale.

### Cartella `src`

Contiene il codice JavaScript e CSS dell’applicativo web.

### Cartella `docs`

Contiene la relazione tecnica backend, i sorgenti e le immagini dei diagrammi PlantUML, il sorgente DBML, il diagramma ER finale e la documentazione sulla tassonomia ACN.

---

## 8. Pipeline SQL

La pipeline produttiva comprende 21 script sequenziali.

Principali fasi:

1. baseline dello schema, dati, RLS e privilegi;
2. viste, audit iniziale e configurazione temporale;
3. tassonomia degli incidenti ACN;
4. hardening dei domini e gerarchie di servizi e asset;
5. gerarchia dei fornitori e relazione asset–fornitore;
6. Supply Chain multilivello, reporting e audit generalizzato;
7. archiviazione logica e rimozione dei vincoli `ON DELETE CASCADE`.

Le diagnostiche `X1–X17` accompagnano la pipeline e documentano lo stato del database prima e dopo le migrazioni.

---

## 9. Documentazione tecnica

### Relazione tecnica backend

- [Relazione tecnica backend v2.1 — PDF](docs/Relazione_Tecnica_Backend_Database_v2.1.pdf)
- [Relazione tecnica backend v2.1 — DOCX](docs/Relazione_Tecnica_Backend_Database_v2.1.docx)

### Core Migration Pipeline

- [Sorgente PlantUML della Core Migration Pipeline](docs/Codice_diagramma_Core_Migration_Pipeline.puml)
- [Immagine della Core Migration Pipeline](docs/Core_Migration_Pipeline.png)

### Diagnostic, Validation & Patch Toolkit

- [Sorgente PlantUML del Diagnostic, Validation & Patch Toolkit](docs/Codice_diagramma_Diagnostic_Validation_Patch_Toolkit_X.puml)
- [Immagine del Diagnostic, Validation & Patch Toolkit](docs/Diagramma_Diagnostic_Patch_Toolkit.png)

### Diagramma ER

- [Sorgente DBML del diagramma ER V5.0](docs/Diagramma_ER_V5.0_30_tabelle.dbml)
- [Esportazione PDF del sorgente DBML](docs/Diagramma_ER_V5.0_30_tabelle.dbml.pdf)
- [Diagramma ER finale a 30 tabelle](docs/Diagramma_ER_V5.0_30_tabelle.pdf)

### Tassonomia ACN

- [Documento di riferimento sulla tassonomia ACN](docs/ACN_Tassonomia_Cyber_CLEAR.pdf)

La relazione tecnica frontend sarà aggiunta con il nome:

```text
docs/Relazione_Tecnica_Frontend_Applicativo.pdf
```

dopo il consolidamento dell’applicativo web e delle SCR.

---

## 10. Applicativo web

L’applicazione è pubblicata tramite GitHub Pages:

[NIS2 Asset Inventory Manager](https://gianlucalucarelli-ux.github.io/PW-19-L31-NIS2-Asset-Inventory-Manager/)

### Accesso riservato alla valutazione

Le seguenti credenziali consentono ai docenti di accedere all’applicativo durante la fase di valutazione:

- Utenza: `docentepegaso@gmail.com`
- Password: `9P4UxeD2S$`

L’utenza docente è configurata per l’accesso semplificato senza MFA. L’autenticazione MFA è comunque implementata e funzionante per le utenze operative abilitate.

Le credenziali saranno rimosse dal repository pubblico dopo il loro inserimento nella versione definitiva del documento di Project Work consegnato tramite la piattaforma Pegaso.

Stato attuale:

- backend completato e verificato;
- frontend funzionante nelle funzioni principali;
- SCR e interfaccia in fase di consolidamento rispetto al database definitivo;
- relazione tecnica frontend da redigere al termine dei test applicativi.

---

## 11. Riproducibilità e versionamento

Il flusso adottato per gli script SQL è:

1. esecuzione e verifica su Supabase;
2. salvataggio su `vscode.dev`;
3. commit nel repository GitHub;
4. copia locale di sicurezza.

Questa procedura evita di versionare migrazioni non ancora verificate e mantiene allineati database cloud, repository remoto e archivio locale.

---

## 12. Stato del Project Work

### Completato

- progettazione e consolidamento del backend;
- pipeline produttiva `01–21`;
- toolkit diagnostico `X1–X17`;
- modello ER finale a 30 tabelle;
- sicurezza RLS e MFA;
- audit generalizzato;
- archiviazione logica;
- verifica finale del database;
- relazione tecnica backend;
- documentazione tecnica backend.

### Fase successiva

- consolidamento delle SCR;
- riallineamento del frontend al modello definitivo;
- test funzionali completi dell’applicativo;
- redazione della `Relazione_Tecnica_Frontend_Applicativo.pdf`;
- revisione finale del documento principale del Project Work.

---

## 13. Autore

Gianluca Lucarelli  
Corso di Laurea Triennale in Informatica per le aziende digitali — L-31  
Università Telematica Pegaso
