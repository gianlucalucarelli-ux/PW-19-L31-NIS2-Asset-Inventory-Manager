# Università Telematica Pegaso
## Laurea Triennale in Informatica per le aziende digitali L-31
## Tema n. 2 Privacy e sicurezza aziendale
## PW 19. Progettare e realizzare una base dati relazionale per catalogare asset, servizi, dipendenze e responsabilità utili alla compilazione dei profili richiesti dall'ACN nell'ambito della NIS2
### Registro Centralizzato Asset e Servizi Critici (Direttiva NIS2 / ACN)

---

## 1. Descrizione del Progetto
Il presente Project Work nasce dall'esigenza di affrontare una sfida reale e stringente per le infrastrutture critiche del settore pubblico e privato: la gestione sicura e censita degli asset informativi in conformità con la direttiva NIS2 e le linee guida dell'Agenzia per la Cybersicurezza Nazionale (ACN). Il lavoro si inserisce nel percorso accademico presso l'Università Telematica Pegaso, a completamento del Corso di Laurea Triennale in Informatica per le aziende digitali (L-31), traducendo i modelli teorici in un prototipo funzionale di Asset Management. L'architettura proposta non si limita a catalogare le risorse hardware e software, ma implementa un sistema di gestione del dato basato su criteri di tracciabilità, integrità e sicurezza, offrendo un modello scalabile e conforme ai moderni standard di cybersecurity. Attraverso lo sviluppo di questo prototipo, l'elaborato intende dimostrare come l'adozione di metodologie di sviluppo agili e di piattaforme cloud native possa rispondere efficacemente alla complessità normativa, garantendo al contempo una gestione operativa semplificata e rigorosa per le aziende.

## 2. Architettura e Tecnologie
Il sistema è sviluppato seguendo i criteri di normalizzazione e sicurezza richiesti in ambito progettuale e professionale:
*   Database: PostgreSQL (Modellazione in Terza Forma Normale - 3FN).  
*   Tassonomia: Integrazione dei codici ACN (TC-ACN v2.0) per la classificazione standardizzata degli asset.  
*   Frontend: Interfaccia di gestione sviluppata in HTML5, CSS3 e JavaScript ES6.  
*   Hosting: Versionamento su GitHub con deployment del database tramite Cloud Provider (Supabase/PostgreSQL).  

## 3. Struttura del Repository
Il progetto è organizzato in modo modulare per garantire manutenibilità e scansionabilità:
*   `/sql`: Script SQL produttivi numerati da `01` a `14` e toolkit diagnostico numerato da `X1` a `X10`.  
*   `/src`: Codice sorgente dell'interfaccia web e logica di interfacciamento.  
*   `/docs`: Documentazione tecnica, Diagrammi ER (Entity-Relationship) e specifiche ACN.  

## 4. Funzionalità Implementate

*   **Modellazione relazionale:** base dati PostgreSQL composta da 26 tabelle, progettata secondo criteri di normalizzazione e integrità referenziale.
*   **Gestione di asset e servizi:** catalogazione degli asset tecnologici, dei servizi aziendali, delle responsabilità e delle relative dipendenze.
*   **Gerarchie multilivello:** rappresentazione di servizi e sottoservizi e di asset e sotto-asset, con prevenzione di autorelazioni e cicli.
*   **Supply Chain Management:** mappatura delle dipendenze tra servizi, asset e fornitori terzi.
*   **Tassonomia ACN:** classificazione degli asset e degli eventi mediante domini e codici coerenti con il contesto NIS2/ACN.
*   **Auditing:** registrazione automatica delle operazioni sugli asset mediante funzione e trigger PL/pgSQL.
*   **Sicurezza:** Row Level Security, autenticazione MFA, accesso docente dedicato e applicazione del principio del minimo privilegio.
*   **Importazione ed esportazione:** gestione dei dati tramite file XLS e viste relazionali dedicate al reporting.

## 5. Documentazione tecnica

La documentazione tecnica del progetto raccoglie le relazioni di approfondimento, il modello Entity-Relationship, i diagrammi della pipeline SQL, gli strumenti diagnostici e la documentazione di riferimento utilizzata durante lo sviluppo.

### 5.1 Relazione tecnica del backend e del database

- [Relazione Tecnica Backend e Database](./docs/Relazione_Tecnica_Backend_Database.pdf)  
  Descrive l’architettura del backend dati, la pipeline produttiva SQL 01–14, il toolkit diagnostico X1–X10, il sistema di audit, il modello di sicurezza RLS/DCL e le gerarchie multilivello di servizi e asset.

### 5.2 Modello Entity-Relationship

- [Diagramma ER versione 4.0](./docs/Diagramma%20ER%20Ver4.0.pdf)  
  Rappresentazione del modello relazionale aggiornato, composto attualmente da 26 tabelle.

- [Codice del diagramma ER versione 4.0](./docs/Codice%20diagramma%20ER%20ver%204.0.pdf)  
  Codice sorgente utilizzato per generare il diagramma Entity-Relationship.

### 5.3 Pipeline delle migrazioni SQL

- [Diagramma Core Migration Pipeline](./docs/Core%20Migration%20Pipeline.png)  
  Rappresentazione della pipeline produttiva composta dagli script SQL numerati da 01 a 14.

- [Codice del diagramma Core Migration Pipeline](./docs/Codice_diagramma_Core_Migration_Pipeline.pdf)  
  Codice PlantUML utilizzato per generare il diagramma della pipeline produttiva.

### 5.4 Toolkit diagnostico e di supporto

- [Diagramma Diagnostic & Patch Toolkit](./docs/Diagnostic%20Patch%20ToolKit.png)  
  Rappresentazione degli script diagnostici, di bonifica e di prototipazione numerati da X1 a X10.

- [Codice del diagramma Diagnostic & Patch Toolkit](./docs/Codice_diagramma_Diagnostic_Patch_Toolkit_X.puml.pdf)  
  Codice PlantUML utilizzato per generare il diagramma del toolkit diagnostico.

### 5.5 Documentazione di riferimento

- [Tassonomia Cyber ACN](./docs/ACN_Tassonomia_Cyber_CLEAR.pdf)  
  Documento di riferimento utilizzato per la classificazione degli incidenti cyber secondo la tassonomia dell’Agenzia per la Cybersicurezza Nazionale.

## 6. Note Operative e Roadmap di Sviluppo
L'applicazione è consultabile online per la valutazione delle funzionalità implementate:
*  URL: https://gianlucalucarelli-ux.github.io/PW-19-L31-NIS2-Asset-Inventory-Manager/
*  Credenziali: Il sistema utilizza un'autenticazione tramite provider esterno. Per l'accesso in modalità semplice senza MFA per i docenti
    * Utenza: docentepegaso@gmail.com
    * password: 9P4UxeD2S$
    * 
L'autenticazione MFA è stata implementata ed è funzionante 
