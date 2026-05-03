# PW-19-L31-NIS2-Asset-Inventory-Manager
Registro centralizzato per la modellazione di asset e servizi critici secondo la direttiva NIS2 e tassonomia ACN.
# PW-19-L31-NIS2-Asset-Inventory-Manager
## Registro Centralizzato Asset e Servizi Critici (Direttiva NIS2 / ACN)
### Progetto di Project Work - Corso di Laurea L31 in Informatica - Università Pegaso

---

## 1. Descrizione del Progetto
Il progetto risponde all'esigenza delle organizzazioni soggette alla direttiva NIS2 (UE 2022/2555) di censire in modo strutturato gli asset, i servizi critici e le dipendenze verso fornitori terzi.  
L'obiettivo è la progettazione e realizzazione di un database relazionale centralizzato che consenta di modellare le relazioni gerarchiche tra asset e servizi, 
i rispettivi responsabili e i metadati richiesti dall'Agenzia per la Cybersicurezza Nazionale (ACN) per la generazione dei profili di sicurezza.  

## 2. Architettura e Tecnologie
Il sistema è sviluppato seguendo i criteri di normalizzazione e sicurezza richiesti in ambito progettuale e professionale:
*   Database: PostgreSQL (Modellazione in Terza Forma Normale - 3FN).  
*   Tassonomia: Integrazione dei codici ACN (TC-ACN v2.0) per la classificazione standardizzata degli asset.  
*   Frontend: Interfaccia di gestione sviluppata in HTML5, CSS3 e JavaScript ES6.  
*   Hosting: Versionamento su GitHub con deployment del database tramite Cloud Provider (Supabase/PostgreSQL).  

## 3. Struttura del Repository
Il progetto è organizzato in modo modulare per garantire manutenibilità e scansionabilità:
*   `/sql`: Script DDL di creazione del database (`schema.sql`) e dataset di test.  
*   `/src`: Codice sorgente dell'interfaccia web e logica di interfacciamento.  
*   `/docs`: Documentazione tecnica, Diagrammi ER (Entity-Relationship) e specifiche ACN.  

## 4. Funzionalità Implementate
*   Modellazione Asset/Servizi: Gestione delle relazioni molti-a-molti tra infrastruttura tecnologica e servizi erogati.  
*   Supply Chain Management: Mappatura delle dipendenze da fornitori terzi con vincoli di integrità referenziale.  
*   Auditing & Versioning: Sistema di log automatico tramite Trigger PL/pgSQL per la tracciabilità delle modifiche agli asset critici.  
*   Export Strutturato: Predisposizione per l'esportazione di dati in formato CSV conforme ai requisiti di notifica ACN.
