# NIS2 Asset & Service Inventory Manager

[![Project Status: Active](https://img.shields.io/badge/status-active-success.svg)]()
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)]()

## 📝 Descrizione del Progetto
Il presente Project Work nasce dall'esigenza di affrontare una sfida reale e stringente per le infrastrutture critiche del settore pubblico e privato: la gestione sicura e censita degli asset informativi in conformità con la direttiva NIS2 e le linee guida dell'Agenzia per la Cybersicurezza Nazionale (ACN). Il lavoro si inserisce nel percorso accademico presso l'Università Telematica Pegaso, a completamento del Corso di Laurea Triennale in Informatica per le aziende digitali (L-31), traducendo i modelli teorici in un prototipo funzionale di Asset Management. L'architettura proposta non si limita a catalogare le risorse hardware e software, ma implementa un sistema di gestione del dato basato su criteri di tracciabilità, integrità e sicurezza, offrendo un modello scalabile e conforme ai moderni standard di cybersecurity. Attraverso lo sviluppo di questo prototipo, l'elaborato intende dimostrare come l'adozione di metodologie di sviluppo agili e di piattaforme cloud native possa rispondere efficacemente alla complessità normativa, garantendo al contempo una gestione operativa semplificata e rigorosa per le aziende.

## 🏗️ Architettura Tecnica
Il sistema adotta un approccio *Cloud Native* per garantire scalabilità e sicurezza:
* **Database:** PostgreSQL, progettato in Terza Forma Normale (3NF) per garantire l'integrità referenziale.
* **Backend:** Supabase (PostgreSQL as a Service) con policy RLS (Row Level Security) attive.
* **Frontend:** Interfaccia web sviluppata in HTML5, CSS3 e JavaScript ES6 (Vanilla).
* **Versionamento:** Git & GitHub.

## 📁 Struttura del Repository
Il progetto è modulare per facilitare l'ispezione del codice:
* `/src/` : Logica di business, gestione del DOM e interazione asincrona con le API.
* `/sql/` : Script DDL per la modellazione relazionale e popolamento del database.
* `/docs/` : Documentazione tecnica, schemi Entità-Relazione (ER) e flussi di processo.

## 🚀 Funzionalità Principali
* **Modellazione Relazionale:** Gestione completa delle relazioni tra asset IT, servizi e fornitori (Supply Chain).
* **Compliance ACN:** Struttura dati ottimizzata per la generazione di report di sicurezza.
* **Auditing Tracciabile:** Implementazione di trigger PL/pgSQL per la registrazione automatica delle modifiche su asset critici.
* **Esportazione Dati:** Funzionalità di export in formato CSV standardizzato per le notifiche ACN.

---
*Progetto di Project Work - Corso di Laurea L-31 in Informatica per le aziende digitali - Università Telematica Pegaso.*
