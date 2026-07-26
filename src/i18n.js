// ===============================================================================================================
// FILE: src/i18n.js
// DESCRIZIONE: Gestione centralizzata della lingua italiana/inglese, persistenza e traduzione progressiva del DOM.
// ===============================================================================================================

const STORAGE_KEY = 'nis2-language';
const SUPPORTED_LANGUAGES = new Set(['it', 'en']);

let currentLanguage = 'it';
let observer = null;
let dialogsWrapped = false;

const originalTextNodes = new WeakMap();
const originalAttributes = new WeakMap();

const ENGLISH_TRANSLATIONS = new Map(Object.entries({
    'Verifica della sessione in corso…': 'Checking the current session…',
    'Vai al contenuto principale': 'Skip to main content',
    'Navigazione principale': 'Main navigation',
    'Comandi della sessione': 'Session controls',
    'Selezione lingua': 'Language selection',
    'Navigazione applicativa': 'Application navigation',
    "Sezioni dell'applicazione": 'Application sections',
    'Area applicativa autenticata': 'Authenticated application area',
    'Dashboard operativa': 'Operational dashboard',
    'Informazioni e guida': 'Information and guide',
    'Tema chiaro': 'Light theme',
    'Tema scuro': 'Dark theme',
    'Passa al tema chiaro': 'Switch to light theme',
    'Passa al tema scuro': 'Switch to dark theme',
    'Logout': 'Sign out',
    'UNIVERSITÀ TELEMATICA PEGASO · PROJECT WORK L-31': 'PEGASO ONLINE UNIVERSITY · L-31 PROJECT WORK',
    'Applicazione web per censire asset e dipendenze, rappresentare la Supply Chain, tracciare le operazioni e supportare la gestione guidata degli incidenti.': 'Web application for recording assets and dependencies, mapping the supply chain, tracking operations and supporting guided incident management.',
    'Candidato': 'Candidate',
    'Corso': 'Degree programme',
    'Informatica per le aziende digitali': 'Computer Science for Digital Businesses',
    'Ambito': 'Area',
    'Privacy e sicurezza aziendale': 'Business privacy and security',
    'ACCESSO RISERVATO': 'RESTRICTED ACCESS',
    'Personale autorizzato': 'Authorised personnel',
    'Accedi con le credenziali abilitate. Gli utenti operativi completano la verifica MFA.': 'Sign in with an enabled account. Operational users must complete MFA verification.',
    'E-mail': 'Email',
    'Password': 'Password',
    'Entra nel sistema': 'Sign in',
    'VERIFICA IDENTITÀ': 'IDENTITY VERIFICATION',
    'Sicurezza 2FA': '2FA security',
    'Codice monouso': 'One-time code',
    'Codice OTP': 'OTP code',
    'Verifica identità': 'Verify identity',
    'Annulla accesso': 'Cancel sign-in',
    'FUNZIONALITÀ PRINCIPALI': 'MAIN FEATURES',
    'Un unico punto di accesso ai dati operativi e di conformità': 'A single access point for operational and compliance data',
    'Inventario centralizzato': 'Centralised inventory',
    'Consultazione e gestione controllata degli asset con criticità, versioni e tracciamento delle modifiche.': 'Controlled asset browsing and management with criticality, versions and change tracking.',
    'Dipendenze e Supply Chain': 'Dependencies and supply chain',
    'Rappresentazione delle relazioni tra servizi, asset e fornitori, predisposta per percorsi multilivello.': 'Representation of relationships among services, assets and suppliers, designed for multi-level paths.',
    'Sicurezza e tracciabilità': 'Security and traceability',
    'Autenticazione Supabase, MFA, policy RLS, Audit Log e wizard guidato per la classificazione degli incidenti.': 'Supabase authentication, MFA, RLS policies, audit log and a guided incident-classification wizard.',
    'Area riservata': 'Restricted area',
    'Menu applicativo': 'Application menu',
    'Azienda': 'Organisation',
    'AZIENDA': 'ORGANISATION',
    'Soggetti NIS2': 'NIS2 entities',
    'Nuovo soggetto': 'New entity',
    'Persone e figure NIS2': 'People and NIS2 roles',
    'Soggetti archiviati': 'Archived entities',
    'Inventario': 'Inventory',
    'INVENTARIO': 'INVENTORY',
    'Inventario Asset': 'Asset inventory',
    'Nuovo Asset': 'New asset',
    'Asset archiviati': 'Archived assets',
    'Relazioni': 'Relationships',
    'RELAZIONI': 'RELATIONSHIPS',
    'Incidenti': 'Incidents',
    'INCIDENTI': 'INCIDENTS',
    'Incidenti aperti': 'Open incidents',
    'Incidenti chiusi': 'Closed incidents',
    'Nuova segnalazione': 'New report',
    'Sicurezza': 'Security',
    'SICUREZZA': 'SECURITY',
    'Sicurezza e conformità': 'Security and compliance',
    'SICUREZZA E CONFORMITÀ': 'SECURITY AND COMPLIANCE',
    'Supporto': 'Support',
    'SUPPORTO': 'SUPPORT',
    'Panoramica': 'Overview',
    'DASHBOARD': 'DASHBOARD',
    'PANORAMICA OPERATIVA': 'OPERATIONAL OVERVIEW',
    'Stato sintetico dell’ambiente': 'Environment summary',
    'Indicatori aggiornati da Supabase per asset, servizi, fornitori, vulnerabilità, incidenti, Supply Chain e attività di audit.': 'Indicators updated from Supabase for assets, services, suppliers, vulnerabilities, incidents, supply chain and audit activity.',
    'In attesa di aggiornamento': 'Waiting for update',
    'Aggiorna dati': 'Refresh data',
    'Asset attivi': 'Active assets',
    'Inventario operativo': 'Operational inventory',
    'Asset critici': 'Critical assets',
    'Classificazione Critica': 'Critical classification',
    'Servizi attivi': 'Active services',
    'Servizi censiti': 'Registered services',
    'Fornitori attivi': 'Active suppliers',
    'Terze parti censite': 'Registered third parties',
    'Vulnerabilità aperte': 'Open vulnerabilities',
    'Associazioni da trattare': 'Associations requiring action',
    'Incidenti classificati aperti': 'Open classified incidents',
    'Classificazioni ACN senza data di chiusura': 'ACN classifications without a closing date',
    'CRITICITÀ': 'CRITICALITY',
    'Distribuzione degli asset': 'Asset distribution',
    'Apri inventario': 'Open inventory',
    'Copertura Supply Chain': 'Supply chain coverage',
    'Apri relazioni': 'Open relationships',
    'Servizi mappati': 'Mapped services',
    'Con asset collegati': 'With linked assets',
    'Con fornitori collegati': 'With linked suppliers',
    'Caricamento dello stato delle dipendenze…': 'Loading dependency status…',
    'Incidenti recenti': 'Recent incidents',
    'Gestione incidenti': 'Incident management',
    'TRACCIABILITÀ': 'TRACEABILITY',
    'Ultime attività di audit': 'Latest audit activity',
    'Apri Audit Log': 'Open audit log',
    'AZIONI RAPIDE': 'QUICK ACTIONS',
    'Operazioni frequenti': 'Frequent operations',
    'Registra una nuova risorsa': 'Register a new resource',
    'Avvia il wizard ACN': 'Start the ACN wizard',
    'Consulta le dipendenze': 'Browse dependencies',
    'Verifica le ultime modifiche': 'Review latest changes',
    'Asset critici aziendali': 'Business-critical assets',
    'Dati protetti da autenticazione, policy RLS e tracciamento delle operazioni.': 'Data protected by authentication, RLS policies and operation tracking.',
    'Esporta XLS': 'Export XLS',
    'Modello import': 'Import template',
    'Importa XLS': 'Import XLS',
    'Ricerca asset': 'Search assets',
    'Cerca per codice o nome asset': 'Search by asset code or name',
    'Criticità NIS2': 'NIS2 criticality',
    'Tutte le criticità': 'All criticalities',
    'Critica': 'Critical',
    'Alta': 'High',
    'Media': 'Medium',
    'Bassa': 'Low',
    'Categoria': 'Category',
    'Tutte le categorie': 'All categories',
    'Organizzazione': 'Organisation',
    'Tutte le organizzazioni': 'All organisations',
    'Caricamento asset…': 'Loading assets…',
    'Azzera tutto': 'Clear all',
    'Esporta risultati filtrati': 'Export filtered results',
    'ID': 'ID',
    'Codice': 'Code',
    'Nome': 'Name',
    'Nome asset': 'Asset name',
    'Versione': 'Version',
    'Azioni': 'Actions',
    'Righe per pagina': 'Rows per page',
    'Righe': 'Rows',
    'Caricamento paginazione…': 'Loading pagination…',
    'Precedente': 'Previous',
    'Successiva': 'Next',
    'DETTAGLIO ASSET': 'ASSET DETAILS',
    'Dettaglio asset': 'Asset details',
    'Chiudi': 'Close',
    'ARCHIVIAZIONE LOGICA': 'LOGICAL ARCHIVING',
    'Archivia asset': 'Archive asset',
    'Conferma operazione sensibile': 'Confirm sensitive operation',
    'L’asset verrà escluso da inventario, Dashboard e viste operative. Nessun dato verrà cancellato: relazioni e storico di audit resteranno conservati.': 'The asset will be excluded from the inventory, dashboard and operational views. No data will be deleted: relationships and audit history will be retained.',
    'Motivo dell’archiviazione': 'Archiving reason',
    'Indicare la motivazione operativa': 'Enter the operational reason',
    'Minimo 5 caratteri. La motivazione sarà registrata insieme all’operazione.': 'Minimum 5 characters. The reason will be recorded with the operation.',
    'Confermo di voler archiviare questo asset e di aver verificato codice e nome visualizzati in alto.': 'I confirm that I want to archive this asset and that I have checked the code and name shown above.',
    'Annulla': 'Cancel',
    'Consultazione in sola lettura dei record esclusi dall\'inventario operativo.': 'Read-only view of records excluded from the operational inventory.',
    'Esporta archiviati XLS': 'Export archived XLS',
    'Caricamento asset archiviati…': 'Loading archived assets…',
    'Archiviato il': 'Archived on',
    'Motivazione': 'Reason',
    'Vista di sola lettura: nessun ripristino e nessuna cancellazione fisica vengono eseguiti.': 'Read-only view: no restore or physical deletion is performed.',
    'ANTEPRIMA IMPORTAZIONE': 'IMPORT PREVIEW',
    'Verifica file Excel': 'Check Excel file',
    'Riga': 'Row',
    'Criticità': 'Criticality',
    'Esito': 'Outcome',
    'Confermo di aver controllato l’anteprima e di voler importare esclusivamente le righe valide.': 'I confirm that I reviewed the preview and want to import valid rows only.',
    'Importa righe valide': 'Import valid rows',
    'Inserimento nuovo asset': 'New asset entry',
    'Registra l’asset con codice univoco, classificazione, organizzazione e riferimenti controllati caricati direttamente da Supabase.': 'Register the asset with a unique code, classification, organisation and controlled references loaded directly from Supabase.',
    'Codice asset': 'Asset code',
    'Da 3 a 80 caratteri: lettere maiuscole, numeri, trattino e underscore.': '3 to 80 characters: uppercase letters, numbers, hyphen and underscore.',
    'Categoria asset': 'Asset category',
    'Caricamento categorie…': 'Loading categories…',
    'Caricamento organizzazioni…': 'Loading organisations…',
    'Responsabile tecnico': 'Technical owner',
    'Nessun responsabile associato': 'No owner assigned',
    'Versione software o firmware': 'Software or firmware version',
    'Ubicazione': 'Location',
    'Descrizione': 'Description',
    'Livello di criticità': 'Criticality level',
    'Salva Asset': 'Save asset',
    'Mappatura Supply Chain e servizi critici': 'Supply chain and critical-service mapping',
    'Percorsi diretti e derivati tra servizi, asset e fornitori, con livelli gerarchici.': 'Direct and derived paths among services, assets and suppliers, including hierarchy levels.',
    'Ricerca': 'Search',
    'Servizio': 'Service',
    'Tutti i servizi': 'All services',
    'Asset': 'Asset',
    'Tutti gli asset': 'All assets',
    'Fornitore': 'Supplier',
    'Tutti i fornitori': 'All suppliers',
    'Origine relazione': 'Relationship origin',
    'Dirette e derivate': 'Direct and derived',
    'Solo dirette': 'Direct only',
    'Solo derivate': 'Derived only',
    'Caricamento Supply Chain…': 'Loading supply chain…',
    'Azzera filtri': 'Clear filters',
    'Relazione': 'Relationship',
    'Livelli': 'Levels',
    'CATENA DI DIPENDENZA': 'DEPENDENCY CHAIN',
    'Dettaglio Supply Chain': 'Supply chain details',
    'Tracciamento storico, ricerca ed esportazione delle operazioni applicative.': 'Historical tracking, search and export of application operations.',
    'Ricerca libera': 'Free-text search',
    'Record, utente, asset, servizio o fornitore': 'Record, user, asset, service or supplier',
    'Tabella': 'Table',
    'Tutte le tabelle': 'All tables',
    'Operazione': 'Operation',
    'Tutte le operazioni': 'All operations',
    'Utente': 'User',
    'Tutti gli utenti': 'All users',
    'Dal': 'From',
    'Al': 'To',
    'Caricamento Audit Log…': 'Loading audit log…',
    'Esporta risultati': 'Export results',
    'Data e ora': 'Date and time',
    'Entità': 'Entity',
    'AUDIT LOG': 'AUDIT LOG',
    'Dettaglio evento': 'Event details',
    'Valore precedente': 'Previous value',
    'Valore nuovo': 'New value',
    'Eventi operativi classificati.': 'Classified operational events.',
    'Severità': 'Severity',
    'Tutte le severità': 'All severities',
    'Caricamento incidenti…': 'Loading incidents…',
    'Inizio': 'Start',
    'Fine': 'End',
    'Tipologia': 'Type',
    'Stato': 'Status',
    'Classificazioni': 'Classifications',
    'Gestione Incidenti': 'Incident management',
    'Torna agli incidenti aperti': 'Back to open incidents',
    'Indietro': 'Back',
    'Avanti': 'Next',
    'DETTAGLIO INCIDENTE': 'INCIDENT DETAILS',
    'Incidente classificato': 'Classified incident',
    'OPERAZIONE CONTROLLATA': 'CONTROLLED OPERATION',
    'Chiudi incidente': 'Close incident',
    'L’incidente passerà tra i chiusi. Nessun dato verrà cancellato o archiviato automaticamente.': 'The incident will be moved to closed incidents. No data will be deleted or automatically archived.',
    'Data e ora di chiusura': 'Closing date and time',
    'Causa accertata': 'Confirmed cause',
    '(facoltativa)': '(optional)',
    'Descrivi la causa accertata': 'Describe the confirmed cause',
    'Risoluzione': 'Resolution',
    'Descrivi le azioni di risoluzione eseguite': 'Describe the resolution actions performed',
    'Minimo 10 caratteri.': 'Minimum 10 characters.',
    'Confermo di aver verificato l’incidente e di volerlo chiudere.': 'I confirm that I reviewed the incident and want to close it.',
    'La chiusura non cancella né archivia automaticamente il record.': 'Closing does not delete or automatically archive the record.',
    'Riepilogo Report ACN': 'ACN report summary',
    'Sintesi narrativa generata dalle classificazioni selezionate nel wizard.': 'Narrative summary generated from the classifications selected in the wizard.',
    'Testo del report ACN': 'ACN report text',
    '📋 Copia negli appunti': '📋 Copy to clipboard',
    'Chiudi e nuovo incidente': 'Close and start new incident',
    'Contesto, architettura e modalità di utilizzo dell\'applicazione.': 'Context, architecture and application usage.',
    'Finalità': 'Purpose',
    'L\'applicazione supporta il censimento degli asset, la lettura delle dipendenze, la tracciabilità delle modifiche e la classificazione guidata degli incidenti.': 'The application supports asset registration, dependency analysis, change tracking and guided incident classification.',
    'Architettura': 'Architecture',
    'Frontend HTML5, CSS e JavaScript modulare pubblicato su GitHub Pages, integrato con Supabase per autenticazione, MFA, API dati e policy RLS.': 'Modular HTML5, CSS and JavaScript frontend published on GitHub Pages and integrated with Supabase for authentication, MFA, data APIs and RLS policies.',
    'L\'accesso ai dati è controllato tramite sessione autenticata, livello AAL, privilegi PostgreSQL e Row Level Security.': 'Data access is controlled through authenticated sessions, AAL level, PostgreSQL privileges and Row Level Security.',
    'Project Work': 'Project Work',
    'Progetto sviluppato per il corso di Informatica per le aziende digitali': 'Project developed for the Computer Science for Digital Businesses degree programme',
    ', con impostazione generale e non vincolata a uno specifico settore produttivo.': ', with a general-purpose design not tied to a specific industry.',
    'NIS2 Asset Inventory Manager · Project Work universitario · Applicazione dimostrativa': 'NIS2 Asset Inventory Manager · University Project Work · Demonstration application',

    'Soggetti NIS2 utilizzatori': 'NIS2 user entities',
    'Dati identificativi': 'Identification data',
    'Persone': 'People',
    'Incarichi NIS2/ACN': 'NIS2/ACN appointments',
    'DETTAGLIO SOGGETTO NIS2': 'NIS2 ENTITY DETAILS',
    'Confermo di voler archiviare il soggetto NIS2 selezionato.': 'I confirm that I want to archive the selected NIS2 entity.',
    'PERSONA AZIENDALE': 'ORGANISATION PERSON',
    'FIGURA NIS2/ACN': 'NIS2/ACN ROLE',
    'Punto di contatto NIS2, Vice Punto di contatto NIS2, Referente CSIRT e Vice Referente CSIRT sono proposti come opzioni esplicite.': 'NIS2 point of contact, Deputy NIS2 point of contact, CSIRT contact person and Deputy CSIRT contact person are provided as explicit options.',
    'CESSAZIONE INCARICO': 'APPOINTMENT CLOSING',
    'Nessun soggetto NIS2 archiviato.': 'No archived NIS2 entity.',
    'Concludi prima gli incarichi attivi associati alla persona.': 'Close the person’s active appointments first.',
    'Motivo della disattivazione (minimo 5 caratteri):': 'Deactivation reason (minimum 5 characters):',
    'Codice o identificativo legale già utilizzato.': 'Code or legal identifier already in use.',
    'Uno o più campi obbligatori non sono stati valorizzati.': 'One or more required fields have not been completed.',
    'Uno dei riferimenti selezionati non è più disponibile.': 'One of the selected references is no longer available.',
    'Uno dei valori non rispetta i vincoli previsti dal database.': 'One of the values does not comply with the database constraints.',
    'La sessione non dispone dell’autorizzazione necessaria per completare l’operazione.': 'The session is not authorised to complete the operation.',
    'Errore operativo non specificato.': 'Unspecified operational error.',
    'Anagrafica delle organizzazioni essenziali o importanti che utilizzano l’applicativo.': 'Registry of essential or important organisations using the application.',
    'Registra soggetto': 'Register entity',
    'Ricerca soggetto': 'Search entity',
    'Cerca per codice, denominazione o identificativo legale': 'Search by code, legal name or legal identifier',
    'Classificazione NIS2': 'NIS2 classification',
    'Tutte le classificazioni': 'All classifications',
    'Da classificare': 'To be classified',
    'Essenziale': 'Essential',
    'Importante': 'Important',
    'Denominazione ufficiale': 'Official legal name',
    'Identificativo legale': 'Legal identifier',
    'Sede legale': 'Registered office',
    'Contatti': 'Contacts',
    'Caricamento soggetti NIS2…': 'Loading NIS2 entities…',
    'Nessun soggetto NIS2 disponibile.': 'No NIS2 entity available.',
    'Nuovo soggetto NIS2': 'New NIS2 entity',
    'Compila l’anagrafica legale e i contatti principali dell’organizzazione utilizzatrice.': 'Complete the legal registry and main contact details of the user organisation.',
    'Codice organizzazione': 'Organisation code',
    'Ragione sociale / denominazione': 'Legal name',
    'Forma giuridica': 'Legal form',
    'Tipo identificativo': 'Identifier type',
    'Partita IVA': 'VAT number',
    'Codice fiscale': 'Tax code',
    'Altro identificativo': 'Other identifier',
    'Indirizzo': 'Address',
    'CAP': 'Postal code',
    'Comune': 'City',
    'Provincia': 'Province',
    'Paese': 'Country',
    'E-mail istituzionale': 'Institutional email',
    'PEC': 'Certified email',
    'Telefono': 'Telephone',
    'Sito web': 'Website',
    'Salva soggetto': 'Save entity',
    'Aggiorna soggetto': 'Update entity',
    'Modifica soggetto NIS2': 'Edit NIS2 entity',
    'Dettaglio soggetto NIS2': 'NIS2 entity details',
    'Archivia soggetto': 'Archive entity',
    'Il soggetto sarà escluso dalle viste operative. Asset, servizi, persone e storico resteranno conservati.': 'The entity will be excluded from operational views. Assets, services, people and history will be retained.',
    'Persone e incarichi NIS2': 'People and NIS2 appointments',
    'Gestisci le persone dell’azienda e gli incarichi titolare, vice o supporto.': 'Manage organisation people and holder, deputy or support appointments.',
    'Seleziona il soggetto NIS2': 'Select the NIS2 entity',
    'Nuova persona': 'New person',
    'Assegna figura NIS2': 'Assign NIS2 role',
    'Persona': 'Person',
    'Ruoli attivi': 'Active roles',
    'Incarico': 'Appointment',
    'Posizione': 'Position',
    'Validità': 'Validity',
    'Titolare': 'Holder',
    'TITOLARE': 'HOLDER',
    'VICE': 'DEPUTY',
    'Vice': 'Deputy',
    'Punto di contatto NIS2': 'NIS2 point of contact',
    'Vice Punto di contatto NIS2': 'Deputy NIS2 point of contact',
    'Referente CSIRT': 'CSIRT contact person',
    'Vice Referente CSIRT': 'Deputy CSIRT contact person',
    'Legale rappresentante': 'Legal representative',
    'Direttore generale': 'General manager',
    'Responsabile IT': 'IT manager',
    'Responsabile cybersecurity': 'Cybersecurity manager',
    'Responsabile della protezione dei dati (DPO)': 'Data Protection Officer (DPO)',
    'Aggiungi persona': 'Add person',
    'Modifica persona': 'Edit person',
    'Cognome': 'Last name',
    'Salva persona': 'Save person',
    'Assegna incarico': 'Assign appointment',
    'Tipo incarico': 'Appointment type',
    'Valido dal': 'Valid from',
    'Note': 'Notes',
    'Concludi incarico': 'Close appointment',
    'Motivo della cessazione': 'Closing reason',
    'Data di fine': 'End date',
    'Conferma cessazione': 'Confirm closing',
    'Nessun incarico attivo.': 'No active appointment.',
    'Nessuna persona disponibile.': 'No person available.',
    'Soggetti NIS2 archiviati': 'Archived NIS2 entities',
    'Consultazione in sola lettura delle organizzazioni non più operative.': 'Read-only view of organisations that are no longer operational.',
    'Caricamento soggetti archiviati…': 'Loading archived entities…',
    'Modifica': 'Edit',
    'Dettaglio': 'Details',
    'Archivia': 'Archive',
    'Disattiva': 'Deactivate',
    'Cessa': 'Close',
    'N/D': 'N/A',
    'Non disponibile': 'Not available',
    'Non assegnato': 'Unassigned',
    'Nessuno': 'None',
    'Tutte': 'All',
    'Attivo': 'Active',
    'Chiuso': 'Closed',
    'Aperto': 'Open',
    'Salvataggio…': 'Saving…',
    'Aggiornamento…': 'Updating…',
    'Caricamento…': 'Loading…',
    'Operazione completata.': 'Operation completed.',
    'Accesso valutazione': 'Evaluation access',
    'Verifica MFA richiesta': 'MFA verification required',
    'Accesso in corso…': 'Signing in…',
    'Verifica in corso…': 'Verifying…',
    'Identificativo incidente non valido.': 'Invalid incident identifier.',
    'Il codice organizzazione deve contenere da 3 a 30 caratteri tra lettere maiuscole, numeri, trattino e underscore.': 'The organisation code must contain 3 to 30 characters using uppercase letters, numbers, hyphens and underscores.',
    'La denominazione ufficiale è obbligatoria.': 'The official legal name is required.',
    'Tipo e valore dell’identificativo legale devono essere compilati insieme.': 'The legal identifier type and value must be completed together.',
    'Organizzazione non trovata o non accessibile.': 'Organisation not found or not accessible.',
    'Inserimento dell’organizzazione non confermato dal database.': 'The database did not confirm the organisation entry.',
    'Nessuna organizzazione attiva è stata aggiornata.': 'No active organisation was updated.',
    'Indica un motivo di archiviazione di almeno 5 caratteri.': 'Enter an archiving reason of at least 5 characters.',
    'Il soggetto NIS2 non è stato archiviato.': 'The NIS2 entity was not archived.',
    'Nessuna persona attiva è stata aggiornata.': 'No active person was updated.',
    'Indica un motivo di disattivazione di almeno 5 caratteri.': 'Enter a deactivation reason of at least 5 characters.',
    'La persona non è stata disattivata.': 'The person was not deactivated.',
    'La data di inizio è obbligatoria.': 'The start date is required.',
    'Assegnazione dell’incarico non confermata dal database.': 'The database did not confirm the appointment assignment.',
    'La data di fine è obbligatoria.': 'The end date is required.',
    'Indica un motivo di cessazione di almeno 5 caratteri.': 'Enter a closing reason of at least 5 characters.',
    'L’incarico non è stato concluso.': 'The appointment was not closed.',
    'Accesso non autorizzato.': 'Unauthorised access.',
    'Impossibile verificare la sessione. Riprova tra qualche istante.': 'The session could not be verified. Try again in a few moments.',
    'Non è stato possibile completare la disconnessione.': 'Sign-out could not be completed.',
    'Effettua l’accesso per aprire questa sezione.': 'Sign in to open this section.',
    'Il codice asset è già utilizzato. Inserisci un codice univoco.': 'The asset code is already in use. Enter a unique code.',
    'Categoria, organizzazione o responsabile non sono più disponibili.': 'The category, organisation or owner is no longer available.',
    'Controlla l’anteprima e conferma soltanto le righe valide.': 'Review the preview and confirm valid rows only.',
    'Conferma di aver verificato l’anteprima prima di avviare l’importazione.': 'Confirm that you reviewed the preview before starting the import.',
    'Chiudi e aggiorna': 'Close and refresh',
    'E-mail o password non valide. Verifica i dati e riprova.': 'Invalid email or password. Check the details and try again.',
    'Il codice MFA non è valido o è scaduto.': 'The MFA code is invalid or has expired.',
    "Nessun dato disponibile per l'esportazione.": 'No data available for export.',
    'Nessun risultato filtrato disponibile per l’esportazione.': 'No filtered results are available for export.',
    'Modulo ExcelJS non disponibile. Ricaricare la pagina e riprovare.': 'The ExcelJS module is unavailable. Reload the page and try again.',
    'Nessun asset archiviato disponibile per l’esportazione.': 'No archived assets are available for export.',
    'Nessuna cancellazione fisica o operazione di ripristino è inclusa nel file.': 'The file includes no physical deletion or restore operation.',
    'Seleziona un valore dall’elenco controllato.': 'Select a value from the controlled list.',
    'Usa una categoria presente nell’elenco.': 'Use a category from the list.',
    'Organizzazione non valida': 'Invalid organisation',
    'Usa un’organizzazione presente nell’elenco.': 'Use an organisation from the list.',
    'Criticità non valida': 'Invalid criticality',
    'Usa una e-mail presente nell’elenco oppure lascia il campo vuoto.': 'Use an email address from the list or leave the field blank.',
    'Seleziona un file da importare.': 'Select a file to import.',
    'Impossibile leggere il file selezionato.': 'The selected file could not be read.',
    'L’account non dispone di un fattore MFA verificato. Contatta l’amministratore del sistema.': 'The account does not have a verified MFA factor. Contact the system administrator.',
    'Nessun fattore TOTP verificato è associato a questo account.': 'No verified TOTP factor is associated with this account.',
    'Seleziona una categoria': 'Select a category',
    'Seleziona un’organizzazione': 'Select an organisation',
    'Nessun asset soddisfa i criteri di ricerca e filtro selezionati.': 'No asset matches the selected search and filter criteria.',
    'Nessun asset attivo censito.': 'No active asset is registered.',
    'Nessun percorso soddisfa i criteri selezionati.': 'No path matches the selected criteria.',
    'Servizio → Asset → Fornitore': 'Service → Asset → Supplier',
    'Servizio → Fornitore': 'Service → Supplier',
    'Sottoservizio': 'Subservice',
    'Sottoasset': 'Sub-asset',
    'Subfornitore': 'Sub-supplier',
    'Nessun percorso disponibile per l’esportazione.': 'No path is available for export.',
    'Servizio radice': 'Root service',
    'Servizio origine': 'Source service',
    'Asset origine': 'Source asset',
    'Asset effettivo': 'Effective asset',
    'Fornitore origine': 'Source supplier',
    'Fornitore effettivo': 'Effective supplier',
    'Contatto fornitore': 'Supplier contact',
    'Relazione asset-fornitore': 'Asset-supplier relationship',
    'Ereditarietà': 'Inheritance',
    'Descrizione relazione': 'Relationship description',
    'Relazione diretta': 'Direct relationship',
    'Dipendenza servizio': 'Service dependency',
    'Nessuna descrizione': 'No description',
    'Errore non specificato': 'Unspecified error',
    'Non è presente alcun testo da copiare.': 'There is no text to copy.',
    'Il report è selezionato: premi Ctrl+C.': 'The report is selected: press Ctrl+C.'
}));

const ENGLISH_PATTERNS = [
    [/^Pagina\s+(\d+)\s+di\s+(\d+)$/i, 'Page $1 of $2'],
    [/^(\d+)\s+risultato$/i, '$1 result'],
    [/^(\d+)\s+risultati$/i, '$1 results'],
    [/^(\d+)\s+evento$/i, '$1 event'],
    [/^(\d+)\s+eventi$/i, '$1 events'],
    [/^Da\s+(\d+)\s+a\s+(\d+)\s+di\s+(\d+)\s+risultati$/i, '$1 to $2 of $3 results'],
    [/^Inserisci il codice generato dall’app di autenticazione per (.+)\.$/i, 'Enter the code generated by the authentication app for $1.'],
    [/^Asset\s+(.+)\s+aggiornato correttamente\.$/i, 'Asset $1 updated successfully.'],
    [/^Asset\s+(.+)\s+registrato correttamente\.$/i, 'Asset $1 registered successfully.'],
    [/^Organizzazione\s+(.+)\s+salvata correttamente\.$/i, 'Organisation $1 saved successfully.'],
    [/^Persona\s+(.+)\s+salvata correttamente\.$/i, 'Person $1 saved successfully.'],
    [/^Incarico\s+(.+)\s+assegnato correttamente\.$/i, 'Appointment $1 assigned successfully.'],
    [/^Errore:\s+(.+)$/i, 'Error: $1'],
    [/^Errore operativo:\s+(.+)$/i, 'Operational error: $1'],
    [/^Ultimo aggiornamento:\s+(.+)$/i, 'Last updated: $1']
];

function normalizeLanguage(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return SUPPORTED_LANGUAGES.has(normalized) ? normalized : 'it';
}

function preserveOuterWhitespace(source, replacement) {
    const leading = source.match(/^\s*/)?.[0] || '';
    const trailing = source.match(/\s*$/)?.[0] || '';
    return `${leading}${replacement}${trailing}`;
}

function translateItalianText(value) {
    const normalized = String(value ?? '').trim();
    if (!normalized) return value;

    const direct = ENGLISH_TRANSLATIONS.get(normalized);
    if (direct) return preserveOuterWhitespace(String(value), direct);

    for (const [pattern, replacement] of ENGLISH_PATTERNS) {
        if (pattern.test(normalized)) {
            return preserveOuterWhitespace(String(value), normalized.replace(pattern, replacement));
        }
    }

    return value;
}

function translatedValue(original, language) {
    return language === 'en' ? translateItalianText(original) : original;
}

function updateTextNode(node, sourceLanguage = currentLanguage) {
    if (!node || node.nodeType !== Node.TEXT_NODE) return;
    if (node.parentElement?.closest('[data-no-i18n="true"]')) return;

    const currentValue = node.nodeValue ?? '';
    let originalValue = originalTextNodes.get(node);

    if (originalValue === undefined) {
        originalValue = currentValue;
        originalTextNodes.set(node, originalValue);
    } else {
        const expectedCurrent = translatedValue(originalValue, sourceLanguage);
        if (currentValue !== expectedCurrent && currentValue !== originalValue) {
            originalValue = currentValue;
            originalTextNodes.set(node, originalValue);
        }
    }

    const nextValue = translatedValue(originalValue, currentLanguage);
    if (node.nodeValue !== nextValue) node.nodeValue = nextValue;
}

const TRANSLATABLE_ATTRIBUTES = ['placeholder', 'title', 'aria-label'];

function updateElementAttributes(element, sourceLanguage = currentLanguage) {
    if (!(element instanceof Element)) return;
    if (element.closest('[data-no-i18n="true"]')) return;

    let attributeStore = originalAttributes.get(element);
    if (!attributeStore) {
        attributeStore = new Map();
        originalAttributes.set(element, attributeStore);
    }

    TRANSLATABLE_ATTRIBUTES.forEach((attributeName) => {
        if (!element.hasAttribute(attributeName)) return;

        const currentValue = element.getAttribute(attributeName) || '';
        let originalValue = attributeStore.get(attributeName);

        if (originalValue === undefined) {
            originalValue = currentValue;
            attributeStore.set(attributeName, originalValue);
        } else {
            const expectedCurrent = translatedValue(originalValue, sourceLanguage);
            if (currentValue !== expectedCurrent && currentValue !== originalValue) {
                originalValue = currentValue;
                attributeStore.set(attributeName, originalValue);
            }
        }

        const nextValue = translatedValue(originalValue, currentLanguage);
        if (currentValue !== nextValue) element.setAttribute(attributeName, nextValue);
    });
}

function translateSubtree(root, sourceLanguage = currentLanguage) {
    if (!root) return;

    if (root.nodeType === Node.TEXT_NODE) {
        updateTextNode(root, sourceLanguage);
        return;
    }

    if (!(root instanceof Element || root instanceof Document || root instanceof DocumentFragment)) return;

    if (root instanceof Element) updateElementAttributes(root, sourceLanguage);

    const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
        {
            acceptNode(node) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    const tag = node.tagName?.toLowerCase();
                    if (['script', 'style', 'template'].includes(tag)) return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    let node = walker.nextNode();
    while (node) {
        if (node.nodeType === Node.TEXT_NODE) updateTextNode(node, sourceLanguage);
        else updateElementAttributes(node, sourceLanguage);
        node = walker.nextNode();
    }
}

function updateLanguageControls() {
    document.querySelectorAll('[data-language]').forEach((button) => {
        const language = normalizeLanguage(button.dataset.language);
        const isActive = language === currentLanguage;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
    });
}

function installDialogTranslation() {
    if (dialogsWrapped) return;
    dialogsWrapped = true;

    const nativeAlert = window.alert.bind(window);
    const nativeConfirm = window.confirm.bind(window);
    const nativePrompt = window.prompt.bind(window);

    window.alert = (message) => nativeAlert(t(String(message ?? '')));
    window.confirm = (message) => nativeConfirm(t(String(message ?? '')));
    window.prompt = (message, defaultValue) => nativePrompt(t(String(message ?? '')), defaultValue);
}

function startObserver() {
    if (observer) return;

    observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'characterData') {
                updateTextNode(mutation.target);
                return;
            }

            if (mutation.type === 'attributes') {
                updateElementAttributes(mutation.target);
                return;
            }

            mutation.addedNodes.forEach((node) => translateSubtree(node));
        });
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: TRANSLATABLE_ATTRIBUTES
    });
}

export function getLanguage() {
    return currentLanguage;
}

export function t(italianText) {
    return currentLanguage === 'en' ? translateItalianText(italianText) : italianText;
}

export function setLanguage(language, options = {}) {
    const { persist = true, announce = true } = options;
    const previousLanguage = currentLanguage;
    currentLanguage = normalizeLanguage(language);

    if (persist) localStorage.setItem(STORAGE_KEY, currentLanguage);

    document.documentElement.lang = currentLanguage;
    updateLanguageControls();
    translateSubtree(document.body, previousLanguage);

    if (announce) {
        document.dispatchEvent(new CustomEvent('app:language-changed', {
            detail: { language: currentLanguage }
        }));
    }
}

export function initI18n() {
    currentLanguage = normalizeLanguage(localStorage.getItem(STORAGE_KEY) || 'it');

    document.querySelectorAll('[data-language]').forEach((button) => {
        if (button.dataset.languageBound === 'true') return;
        button.dataset.languageBound = 'true';
        button.addEventListener('click', () => setLanguage(button.dataset.language));
    });

    setLanguage(currentLanguage, { persist: false, announce: false });
    installDialogTranslation();
    startObserver();
}
