# NIS2 Asset & Service Inventory Manager

[![Project Status: Active](https://img.shields.io/badge/status-active-success.svg)]()
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)]()

## 📝 Descrizione del Progetto
Soluzione software progettata per rispondere agli obblighi di censimento e modellazione degli asset critici, definita dalla direttiva **NIS2 (UE 2022/2555)**. Il sistema permette alle organizzazioni (pubbliche e private) di mappare le dipendenze tra infrastruttura tecnologica e servizi erogati, garantendo piena aderenza alla tassonomia stabilita dall'**Agenzia per la Cybersicurezza Nazionale (ACN)**.

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
