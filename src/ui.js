// ===============================================================================================================
// FILE: src/ui.js
// DESCRIZIONE: Manipolazione del DOM, attivazione delle viste applicative e gestione del tema.
// ===============================================================================================================

import { fetchAssets, fetchAssetReferences, fetchAssetDetailRelations, fetchSupplyChain, fetchAuditLogs, fetchDashboardData } from './database.js?v=7';
import { navigateTo } from './router.js?v=3';

/**
 * Aggiorna il controllo del tema in modo coerente con il tema attualmente attivo.
 */
function updateThemeControl(theme) {
    const themeToggle = document.getElementById('theme-toggle');
    const themeIcon = document.getElementById('theme-toggle-icon');
    const themeLabel = document.getElementById('theme-toggle-label');
    const isLight = theme === 'light';
    const actionLabel = isLight ? 'Passa al tema scuro' : 'Passa al tema chiaro';

    if (themeToggle) {
        themeToggle.setAttribute('aria-label', actionLabel);
        themeToggle.setAttribute('title', actionLabel);
        themeToggle.setAttribute('aria-pressed', String(isLight));
    }

    if (themeIcon) themeIcon.textContent = isLight ? '🌙' : '☀️';
    if (themeLabel) themeLabel.textContent = isLight ? 'Tema scuro' : 'Tema chiaro';
}

/**
 * Applica il tema e sincronizza il relativo controllo nell'intestazione.
 */
function applyTheme(theme) {
    const normalizedTheme = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', normalizedTheme);
    updateThemeControl(normalizedTheme);
}

export function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const systemTheme = window.matchMedia?.('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark';

    applyTheme(savedTheme || systemTheme);
}

export function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    localStorage.setItem('theme', newTheme);
    applyTheme(newTheme);
}



// =========================================================================
// STATO DELL'INTERFACCIA DI AUTENTICAZIONE
// =========================================================================

function setVisibility(element, visible) {
    if (!element) return;
    element.classList.toggle('is-hidden', !visible);
}

export function setAuthError(message = '') {
    const authError = document.getElementById('auth-error');
    if (!authError) return;
    authError.textContent = message;
}

export function setAuthBusy(area, busy) {
    const controls = area === 'mfa'
        ? ['mfa-code', 'mfa-verify-btn', 'mfa-cancel-btn']
        : ['auth-email', 'auth-password', 'login-submit-btn'];

    controls.forEach((id) => {
        const control = document.getElementById(id);
        if (control) control.disabled = busy;
    });

    const buttonId = area === 'mfa' ? 'mfa-verify-btn' : 'login-submit-btn';
    const button = document.getElementById(buttonId);

    if (button) {
        if (!button.dataset.defaultLabel) {
            button.dataset.defaultLabel = button.textContent;
        }
        button.textContent = busy
            ? (area === 'mfa' ? 'Verifica in corso…' : 'Accesso in corso…')
            : button.dataset.defaultLabel;
    }
}

export function showSignedOutInterface() {
    const publicHome = document.getElementById('public-home');
    const authContainer = document.getElementById('auth-container');
    const loginView = document.getElementById('login-view');
    const mfaView = document.getElementById('mfa-view');
    const dashboardContainer = document.getElementById('dashboard-container');
    const navMenuLinks = document.getElementById('nav-menu-links');
    const logoutBtn = document.getElementById('logout-btn');
    const userSession = document.getElementById('user-session');

    setVisibility(publicHome, true);
    setVisibility(authContainer, true);
    setVisibility(loginView, true);
    setVisibility(mfaView, false);
    setVisibility(dashboardContainer, false);
    setVisibility(navMenuLinks, false);
    setVisibility(logoutBtn, false);
    setVisibility(userSession, false);

    const passwordInput = document.getElementById('auth-password');
    const mfaCodeInput = document.getElementById('mfa-code');
    if (passwordInput) passwordInput.value = '';
    if (mfaCodeInput) mfaCodeInput.value = '';

    clearHeaderUser();
}

export function showMfaInterface(session, accessState) {
    const publicHome = document.getElementById('public-home');
    const authContainer = document.getElementById('auth-container');
    const loginView = document.getElementById('login-view');
    const mfaView = document.getElementById('mfa-view');
    const dashboardContainer = document.getElementById('dashboard-container');
    const navMenuLinks = document.getElementById('nav-menu-links');
    const logoutBtn = document.getElementById('logout-btn');

    setVisibility(publicHome, true);
    setVisibility(authContainer, true);
    setVisibility(loginView, false);
    setVisibility(mfaView, true);
    setVisibility(dashboardContainer, false);
    setVisibility(navMenuLinks, false);
    setVisibility(logoutBtn, false);

    const description = document.getElementById('mfa-desc');
    if (description) {
        description.textContent = `Inserisci il codice generato dall’app di autenticazione per ${session.user.email}.`;
    }

    updateHeaderUser(session, {
        ...accessState,
        statusLabel: 'Verifica MFA richiesta'
    });

    window.setTimeout(() => document.getElementById('mfa-code')?.focus(), 0);
}

export function showAuthenticatedInterface(session, accessState) {
    const publicHome = document.getElementById('public-home');
    const authContainer = document.getElementById('auth-container');
    const dashboardContainer = document.getElementById('dashboard-container');
    const navMenuLinks = document.getElementById('nav-menu-links');
    const logoutBtn = document.getElementById('logout-btn');

    setVisibility(publicHome, false);
    setVisibility(authContainer, false);
    setVisibility(dashboardContainer, true);
    setVisibility(navMenuLinks, true);
    setVisibility(logoutBtn, true);

    updateHeaderUser(session, accessState);
}

export function updateHeaderUser(session, accessState = {}) {
    const userSession = document.getElementById('user-session');
    const userDisplay = document.getElementById('user-display');
    const userAccessLevel = document.getElementById('user-access-level');

    if (!userSession || !userDisplay || !userAccessLevel || !session?.user) return;

    const metadata = session.user.user_metadata ?? {};
    const displayName = metadata.full_name || metadata.name || session.user.email;
    const statusLabel = accessState.statusLabel
        || (accessState.accessType === 'evaluation'
            ? 'Accesso valutazione'
            : `MFA ${String(accessState.currentLevel || 'aal1').toUpperCase()}`);

    userDisplay.textContent = displayName;
    userAccessLevel.textContent = statusLabel;
    userSession.title = session.user.email;
    setVisibility(userSession, true);
}

export function clearHeaderUser() {
    const userSession = document.getElementById('user-session');
    const userDisplay = document.getElementById('user-display');
    const userAccessLevel = document.getElementById('user-access-level');

    if (userDisplay) userDisplay.textContent = '';
    if (userAccessLevel) userAccessLevel.textContent = '';
    if (userSession) {
        userSession.removeAttribute('title');
        setVisibility(userSession, false);
    }
}

const ROUTE_TO_VIEW = {
    dashboard: 'dashboard',
    inventory: 'inventory',
    'add-asset': 'add-asset',
    'supply-chain': 'supply-chain',
    'audit-log': 'audit-log',
    incidenti: 'incidenti',
    riepilogo: 'riepilogo',
    info: 'info'
};

const ROUTE_METADATA = {
    dashboard: {
        section: 'Panoramica',
        label: 'DASHBOARD',
        title: 'Dashboard operativa'
    },
    inventory: {
        section: 'Inventario',
        label: 'INVENTARIO',
        title: 'Inventario Asset'
    },
    'add-asset': {
        section: 'Inventario',
        label: 'INVENTARIO',
        title: 'Nuovo Asset'
    },
    'supply-chain': {
        section: 'Relazioni',
        label: 'RELAZIONI',
        title: 'Supply Chain'
    },
    'audit-log': {
        section: 'Sicurezza e conformità',
        label: 'SICUREZZA E CONFORMITÀ',
        title: 'Audit Log'
    },
    incidenti: {
        section: 'Sicurezza e conformità',
        label: 'SICUREZZA E CONFORMITÀ',
        title: 'Gestione Incidenti'
    },
    riepilogo: {
        section: 'Sicurezza e conformità',
        label: 'SICUREZZA E CONFORMITÀ',
        title: 'Riepilogo incidente'
    },
    info: {
        section: 'Supporto',
        label: 'SUPPORTO',
        title: 'Informazioni e guida'
    }
};

/**
 * Aggiorna l'evidenziazione dei controlli di navigazione e gli attributi accessibili.
 */
function updateNavigationState(route) {
    document.querySelectorAll('[data-route]').forEach((control) => {
        const controlRoute = control.dataset.route;
        const navigationGroup = control.dataset.navGroup;
        const isActive = navigationGroup === 'dashboard'
            ? route === 'dashboard'
            : navigationGroup === 'info'
                ? route === 'info'
                : controlRoute === route;

        control.classList.toggle('active', isActive);

        if (isActive) {
            control.setAttribute('aria-current', 'page');
        } else {
            control.removeAttribute('aria-current');
        }
    });
}

/**
 * Aggiorna titolo, breadcrumb e titolo della scheda del browser.
 */
function updateWorkspaceHeader(route) {
    const metadata = ROUTE_METADATA[route] || ROUTE_METADATA.dashboard;
    const breadcrumbSection = document.getElementById('breadcrumb-section');
    const breadcrumbCurrent = document.getElementById('breadcrumb-current');
    const pageSectionLabel = document.getElementById('page-section-label');
    const pageTitle = document.getElementById('page-title');

    if (breadcrumbSection) breadcrumbSection.textContent = metadata.section;
    if (breadcrumbCurrent) breadcrumbCurrent.textContent = metadata.title;
    if (pageSectionLabel) pageSectionLabel.textContent = metadata.label;
    if (pageTitle) pageTitle.textContent = metadata.title;

    document.title = `${metadata.title} | NIS2 Asset Inventory Manager`;
}

/**
 * Attiva una vista applicativa in base alla rotta risolta dal router centrale.
 */
export async function activateApplicationRoute(route) {
    const viewId = ROUTE_TO_VIEW[route] || 'inventory';
    const detailDialog = document.getElementById('asset-detail-dialog');
    if (detailDialog?.open) detailDialog.close();

    document.querySelectorAll('.view-section').forEach((section) => {
        section.classList.add('is-hidden');
    });

    const targetView = document.getElementById(`view-${viewId}`);
    if (targetView) {
        targetView.classList.remove('is-hidden');
    }

    updateNavigationState(route);
    updateWorkspaceHeader(route);

    if (route === 'dashboard') {
        await loadAndRenderDashboard();
    } else if (route === 'inventory') {
        await loadAndRenderTable();
        resetAssetForm();
    } else if (route === 'add-asset') {
        await loadAssetFormReferences();
        const assetId = document.getElementById('asset-id');
        if (!assetId?.value) {
            resetAssetForm();
        }
    } else if (route === 'supply-chain') {
        await loadAndRenderSupplyChain();
    } else if (route === 'audit-log') {
        await renderAuditLog();
    } else if (route === 'incidenti') {
        // Il wizard viene inizializzato solo all'apertura esplicita della vista.
        document.dispatchEvent(new CustomEvent('incident:wizard:open'));
    }
}

// =========================================================================
// DASHBOARD OPERATIVA
// =========================================================================

/**
 * Scrive un valore testuale in modo sicuro, mantenendo un trattino quando il dato non è disponibile.
 */
function impostaTesto(id, valore) {
    const elemento = document.getElementById(id);
    if (!elemento) return;
    elemento.textContent = valore === null || valore === undefined ? '—' : String(valore);
}

/**
 * Estrae il primo valore valorizzato tra i possibili nomi di colonna restituiti dalle viste.
 */
function leggiCampo(record, nomi, valorePredefinito = '') {
    for (const nome of nomi) {
        const valore = record?.[nome];
        if (valore !== null && valore !== undefined && String(valore).trim() !== '') {
            return valore;
        }
    }
    return valorePredefinito;
}

/**
 * Escaping minimo dei valori inseriti nelle tabelle costruite tramite template HTML.
 */
function escapeHtml(valore) {
    const elemento = document.createElement('div');
    elemento.textContent = String(valore ?? '');
    return elemento.innerHTML;
}

/**
 * Formatta un timestamp PostgreSQL senza fuso orario conservando l'ora locale
 * già registrata dal database Europe/Rome.
 */
function formattaTimestampLocaleDatabase(valore) {
    const testo = String(valore ?? '').trim();
    const corrispondenza = testo.match(
        /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/
    );

    if (!corrispondenza) return 'Data non disponibile';

    /*
     * audit_log.data_modifica è un timestamp senza fuso, ma i valori effettivi
     * registrati dal trigger seguono la convenzione UTC. La conversione viene
     * eseguita solo in visualizzazione, preservando integralmente lo storico.
     */
    const [, anno, mese, giorno, ore, minuti, secondi] = corrispondenza;
    const dataUtc = new Date(Date.UTC(
        Number(anno),
        Number(mese) - 1,
        Number(giorno),
        Number(ore),
        Number(minuti),
        Number(secondi)
    ));

    if (Number.isNaN(dataUtc.getTime())) return 'Data non disponibile';

    return dataUtc.toLocaleString('it-IT', {
        timeZone: 'Europe/Rome',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

/**
 * Formatta timestamp dotati di fuso o offset nel fuso operativo Europe/Rome.
 */
function formattaTimestampEuropeRome(valore) {
    if (!valore) return 'Data non disponibile';

    const data = new Date(valore);
    if (Number.isNaN(data.getTime())) return 'Data non disponibile';

    return data.toLocaleString('it-IT', {
        timeZone: 'Europe/Rome',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}


/**
 * Normalizza una criticità per il rendering coerente di badge e distribuzioni.
 */
function normalizzaCriticita(valore) {
    const normalizzata = String(valore || 'Bassa').trim().toLowerCase();
    if (normalizzata === 'critica') return 'Critica';
    if (normalizzata === 'alta') return 'Alta';
    if (normalizzata === 'media') return 'Media';
    return 'Bassa';
}

/**
 * Restituisce la classe grafica associata a una criticità.
 */
function classeCriticita(valore) {
    const normalizzata = normalizzaCriticita(valore).toLowerCase();
    if (normalizzata === 'critica') return 'risk-critical';
    if (normalizzata === 'alta') return 'risk-high';
    if (normalizzata === 'media') return 'risk-medium';
    return 'risk-low';
}

/**
 * Crea un messaggio vuoto o di caricamento per i pannelli della Dashboard.
 */
function creaStatoDashboard(messaggio) {
    const elemento = document.createElement('p');
    elemento.className = 'dashboard-empty';
    elemento.textContent = messaggio;
    return elemento;
}

/**
 * Disegna la distribuzione della criticità degli asset senza dipendenze grafiche esterne.
 */
function renderDistribuzioneCriticita(asset) {
    const contenitore = document.getElementById('dashboard-criticality');
    if (!contenitore) return;
    contenitore.replaceChildren();

    if (!Array.isArray(asset) || asset.length === 0) {
        contenitore.appendChild(creaStatoDashboard('Nessun asset disponibile per la distribuzione.'));
        return;
    }

    const conteggi = { Critica: 0, Alta: 0, Media: 0, Bassa: 0 };
    asset.forEach((record) => {
        const criticita = leggiCampo(record, [
            'classificazione_criticita',
            'criticita',
            'Criticity_Level',
            'CRITICITÀ NIS2'
        ], 'Bassa');
        conteggi[normalizzaCriticita(criticita)] += 1;
    });

    const massimo = Math.max(...Object.values(conteggi), 1);

    Object.entries(conteggi).forEach(([etichetta, valore]) => {
        const riga = document.createElement('div');
        riga.className = 'criticality-row';

        const intestazione = document.createElement('div');
        intestazione.className = 'criticality-row__header';

        const badge = document.createElement('span');
        badge.className = `badge ${classeCriticita(etichetta)}`;
        badge.textContent = etichetta;

        const conteggio = document.createElement('strong');
        conteggio.textContent = String(valore);

        const progresso = document.createElement('progress');
        progresso.className = `criticality-progress ${classeCriticita(etichetta)}`;
        progresso.max = massimo;
        progresso.value = valore;
        progresso.setAttribute('aria-label', `${etichetta}: ${valore} asset`);

        intestazione.append(badge, conteggio);
        riga.append(intestazione, progresso);
        contenitore.appendChild(riga);
    });
}

/**
 * Riepiloga la copertura della Supply Chain usando i dati aggregati della vista di reporting.
 */
function renderRiepilogoSupplyChain(righe) {
    const dati = Array.isArray(righe) ? righe : [];
    const nomiServizi = new Set();
    let conAsset = 0;
    let conFornitori = 0;

    dati.forEach((record) => {
        const servizio = leggiCampo(record, ['Service_Name', 'servizio_nome', 'nome_servizio']);
        const asset = leggiCampo(record, ['Dependent_Asset', 'asset_dipendenti', 'asset']);
        const fornitore = leggiCampo(record, ['Vendor_Partner', 'fornitori', 'fornitore']);

        if (servizio) nomiServizi.add(String(servizio));
        if (asset && String(asset).toUpperCase() !== 'N/D') conAsset += 1;
        if (fornitore && String(fornitore).toUpperCase() !== 'N/D') conFornitori += 1;
    });

    impostaTesto('supply-services-count', nomiServizi.size || dati.length);
    impostaTesto('supply-assets-count', conAsset);
    impostaTesto('supply-suppliers-count', conFornitori);

    const nota = document.getElementById('supply-summary-note');
    if (!nota) return;

    if (dati.length === 0) {
        nota.textContent = 'Nessuna dipendenza disponibile nella vista di reporting.';
        return;
    }

    nota.textContent = `${dati.length} record di reporting analizzati. Le viste multilivello saranno integrate nella fase dedicata alle relazioni.`;
}

/**
 * Inserisce nel pannello gli incidenti più recenti con severità e stato temporale.
 */
function renderIncidentiRecenti(incidenti) {
    const contenitore = document.getElementById('dashboard-incidents');
    if (!contenitore) return;
    contenitore.replaceChildren();

    if (!Array.isArray(incidenti) || incidenti.length === 0) {
        contenitore.appendChild(creaStatoDashboard('Nessun incidente classificato aperto.'));
        return;
    }

    incidenti.forEach((incidente) => {
        const riga = document.createElement('article');
        riga.className = 'dashboard-list-item';

        const contenuto = document.createElement('div');
        contenuto.className = 'dashboard-list-item__content';

        const titolo = document.createElement('strong');
        const tipologia = leggiCampo(incidente, ['tipologia'], 'Incidente');
        titolo.textContent = `${tipologia} #${incidente.id}`;

        const dettaglio = document.createElement('span');
        const inizio = formattaTimestampEuropeRome(incidente.inizio);
        const stato = incidente.fine ? 'Chiuso' : 'Aperto';
        dettaglio.textContent = `${inizio} · ${stato}`;

        const badge = document.createElement('span');
        badge.className = `badge ${classeCriticita(incidente.severita)}`;
        badge.textContent = normalizzaCriticita(incidente.severita);

        contenuto.append(titolo, dettaglio);
        riga.append(contenuto, badge);
        contenitore.appendChild(riga);
    });
}

/**
 * Inserisce nel pannello le attività di audit più recenti con contesto leggibile.
 */
function renderAuditRecente(logs) {
    const contenitore = document.getElementById('dashboard-audit');
    if (!contenitore) return;
    contenitore.replaceChildren();

    if (!Array.isArray(logs) || logs.length === 0) {
        contenitore.appendChild(creaStatoDashboard('Nessuna attività di audit disponibile.'));
        return;
    }

    logs.forEach((log) => {
        const riga = document.createElement('article');
        riga.className = 'dashboard-list-item';

        const contenuto = document.createElement('div');
        contenuto.className = 'dashboard-list-item__content';

        const titolo = document.createElement('strong');
        const entita = leggiCampo(log, ['nome_record', 'codice_record', 'tipo_entita', 'tabella'], 'Record applicativo');
        titolo.textContent = `${log.operazione || 'OPERAZIONE'} · ${entita}`;

        const dettaglio = document.createElement('span');
        const data = formattaTimestampLocaleDatabase(log.data_modifica);
        const utente = leggiCampo(log, ['utente_email', 'utente'], 'Sistema');
        dettaglio.textContent = `${data} · ${utente}`;

        const tipo = document.createElement('span');
        tipo.className = 'dashboard-list-item__tag';
        tipo.textContent = String(log.tabella || log.tipo_entita || 'audit');

        contenuto.append(titolo, dettaglio);
        riga.append(contenuto, tipo);
        contenitore.appendChild(riga);
    });
}

/**
 * Carica e visualizza tutti i pannelli della Dashboard operativa.
 */
export async function loadAndRenderDashboard() {
    const stato = document.getElementById('dashboard-status');
    const ultimoAggiornamento = document.getElementById('dashboard-last-updated');
    const refreshButton = document.getElementById('dashboard-refresh-btn');

    if (refreshButton && !refreshButton.dataset.bound) {
        refreshButton.dataset.bound = 'true';
        refreshButton.addEventListener('click', () => loadAndRenderDashboard());
    }

    if (refreshButton) {
        refreshButton.disabled = true;
        refreshButton.textContent = 'Aggiornamento…';
    }

    if (stato) stato.textContent = 'Aggiornamento degli indicatori in corso…';
    if (ultimoAggiornamento) ultimoAggiornamento.textContent = 'Aggiornamento in corso…';

    ['metric-assets-active', 'metric-assets-critical', 'metric-services-active',
        'metric-suppliers-active', 'metric-vulnerabilities-open', 'metric-incidents-open']
        .forEach((id) => impostaTesto(id, '…'));

    try {
        const dati = await fetchDashboardData();

        impostaTesto('metric-assets-active', dati.metriche.assetAttivi);
        impostaTesto('metric-assets-critical', dati.metriche.assetCritici);
        impostaTesto('metric-services-active', dati.metriche.serviziAttivi);
        impostaTesto('metric-suppliers-active', dati.metriche.fornitoriAttivi);
        impostaTesto('metric-vulnerabilities-open', dati.metriche.vulnerabilitaAperte);
        impostaTesto('metric-incidents-open', dati.metriche.incidentiAperti);

        renderDistribuzioneCriticita(dati.asset);
        renderRiepilogoSupplyChain(dati.supplyChain);
        renderIncidentiRecenti(dati.incidentiRecenti);
        renderAuditRecente(dati.auditRecente);

        const dataAggiornamento = new Date();
        const dataOraFormattata = dataAggiornamento.toLocaleString('it-IT', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        const aggiornamentoParziale = dati.errori.length > 0;
        const messaggioCompatto = aggiornamentoParziale
            ? `Aggiornamento parziale: ${dataOraFormattata}`
            : `Ultimo aggiornamento: ${dataOraFormattata}`;

        if (ultimoAggiornamento) {
            ultimoAggiornamento.textContent = messaggioCompatto;
            ultimoAggiornamento.classList.toggle('dashboard-last-updated--warning', aggiornamentoParziale);
        }

        if (stato) {
            stato.textContent = aggiornamentoParziale
                ? `Dashboard aggiornata con ${dati.errori.length} sorgente/i non disponibili alle ${dataOraFormattata}.`
                : `Dashboard aggiornata alle ${dataOraFormattata}.`;
            stato.classList.toggle('dashboard-status--warning', aggiornamentoParziale);
        }
    } catch (error) {
        console.error('Errore durante il caricamento della Dashboard:', error);
        if (ultimoAggiornamento) {
            ultimoAggiornamento.textContent = 'Aggiornamento non riuscito';
            ultimoAggiornamento.classList.add('dashboard-last-updated--warning');
        }
        if (stato) {
            stato.textContent = `Impossibile aggiornare la Dashboard: ${error.message}`;
            stato.classList.add('dashboard-status--warning');
        }
    } finally {
        if (refreshButton) {
            refreshButton.disabled = false;
            refreshButton.textContent = 'Aggiorna dati';
        }
    }
}

// =========================================================================
// FUNZIONI DI SUPPORTO VISTE (AUDIT E INCIDENTI)
// =========================================================================

async function renderAuditLog() {
    const container = document.getElementById('audit-table-body');
    if (!container) return;

    try {
        container.innerHTML = '<tr><td colspan="5" class="table-state">Caricamento log in corso...</td></tr>';
        const logs = await fetchAuditLogs();

        if (!Array.isArray(logs) || logs.length === 0) {
            container.innerHTML = '<tr><td colspan="5" class="table-state">Nessun evento registrato.</td></tr>';
            return;
        }

        container.innerHTML = logs.map((log) => {
            const entita = leggiCampo(log, ['tabella', 'tipo_entita'], 'Record applicativo');
            const record = leggiCampo(
                log,
                ['nome_record', 'codice_record', 'record_id'],
                'N/D'
            );
            const utente = leggiCampo(log, ['utente_email', 'utente'], 'Sistema');

            return `
                <tr>
                    <td class="cell-small">${escapeHtml(formattaTimestampLocaleDatabase(log.data_modifica))}</td>
                    <td class="cell-primary">${escapeHtml(log.operazione || 'OPERAZIONE')}</td>
                    <td class="cell-small">${escapeHtml(entita)}</td>
                    <td class="cell-primary">${escapeHtml(record)}</td>
                    <td class="cell-small">${escapeHtml(utente)}</td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('Errore durante il rendering dell’Audit Log:', error);
        container.innerHTML = `<tr><td colspan="5" class="error-msg">Errore: ${escapeHtml(error.message)}</td></tr>`;
    }
}

// =========================================================================
// FUNZIONI ESISTENTI (INVENTARIO E SUPPLY CHAIN)
// =========================================================================

let assetReferencesCache = null;
let inventoryAssetsCache = [];
let inventoryCategoryMap = new Map();
let inventoryOrganizationMap = new Map();
let inventoryResponsibleMap = new Map();
let inventoryFilteredCache = [];
let inventoryCurrentPage = 1;
let inventoryPageSize = 5;


/**
 * Popola una select conservando, quando possibile, il valore già selezionato.
 */
function popolaSelect(select, elementi, placeholder, creaEtichetta) {
    if (!select) return;

    const valoreCorrente = select.value;
    select.replaceChildren();

    const opzioneVuota = document.createElement('option');
    opzioneVuota.value = '';
    opzioneVuota.textContent = placeholder;
    select.appendChild(opzioneVuota);

    elementi.forEach((elemento) => {
        const opzione = document.createElement('option');
        opzione.value = String(elemento.id);
        opzione.textContent = creaEtichetta(elemento);
        select.appendChild(opzione);
    });

    if ([...select.options].some((opzione) => opzione.value === valoreCorrente)) {
        select.value = valoreCorrente;
    }
}

/**
 * Carica categorie, organizzazioni e responsabili attivi direttamente da Supabase.
 */
async function loadAssetFormReferences(force = false) {
    if (!assetReferencesCache || force) {
        assetReferencesCache = await fetchAssetReferences();
    }

    popolaSelect(
        document.getElementById('asset-categoria'),
        assetReferencesCache.categorie,
        'Seleziona una categoria',
        (categoria) => categoria.codice_acn
            ? `${categoria.nome} · ${categoria.codice_acn}`
            : categoria.nome
    );

    popolaSelect(
        document.getElementById('asset-organizzazione'),
        assetReferencesCache.organizzazioni,
        'Seleziona un’organizzazione',
        (organizzazione) => organizzazione.nome
    );

    popolaSelect(
        document.getElementById('asset-responsabile'),
        assetReferencesCache.responsabili,
        'Nessun responsabile associato',
        (responsabile) => {
            const nominativo = `${responsabile.nome} ${responsabile.cognome}`.trim();
            return responsabile.email
                ? `${nominativo} · ${responsabile.email}`
                : nominativo;
        }
    );

    return assetReferencesCache;
}

/**
 * Normalizza il testo usato dalla ricerca locale, ignorando maiuscole,
 * minuscole e segni diacritici.
 */
function normalizzaTestoRicerca(valore) {
    return String(valore ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('it-IT')
        .trim();
}

/**
 * Legge i criteri correnti della ricerca e dei filtri inventario.
 */
function leggiFiltriInventario() {
    const searchInput = document.getElementById('asset-search');
    const criticitaSelect = document.getElementById('asset-filter-criticita');
    const categoriaSelect = document.getElementById('asset-filter-categoria');
    const organizzazioneSelect = document.getElementById('asset-filter-organizzazione');

    return {
        testoOriginale: searchInput?.value.trim() ?? '',
        testoNormalizzato: normalizzaTestoRicerca(searchInput?.value ?? ''),
        criticita: criticitaSelect?.value ?? '',
        categoriaId: categoriaSelect?.value ?? '',
        organizzazioneId: organizzazioneSelect?.value ?? '',
        categoriaEtichetta: categoriaSelect?.selectedOptions?.[0]?.textContent?.trim() || 'Tutte le categorie',
        organizzazioneEtichetta: organizzazioneSelect?.selectedOptions?.[0]?.textContent?.trim() || 'Tutte le organizzazioni'
    };
}

function filtriInventarioAttivi(filtri) {
    return Boolean(
        filtri.testoOriginale
        || filtri.criticita
        || filtri.categoriaId
        || filtri.organizzazioneId
    );
}

/**
 * Aggiorna il riepilogo accessibile dei risultati della ricerca e dei filtri.
 */
function aggiornaStatoRicercaAsset(totale, visualizzati, filtri) {
    const stato = document.getElementById('asset-search-status');
    if (!stato) return;

    const etichettaRisultati = visualizzati === 1 ? 'risultato' : 'risultati';

    stato.textContent = filtriInventarioAttivi(filtri)
        ? `${visualizzati} ${etichettaRisultati} su ${totale} asset`
        : totale === 1
            ? '1 asset visualizzato'
            : `${totale} asset visualizzati`;
}

/**
 * Popola i filtri dinamici con le categorie e le organizzazioni lette da Supabase.
 */
function popolaFiltriInventario(riferimenti) {
    popolaSelect(
        document.getElementById('asset-filter-categoria'),
        riferimenti.categorie,
        'Tutte le categorie',
        (categoria) => categoria.nome
    );

    popolaSelect(
        document.getElementById('asset-filter-organizzazione'),
        riferimenti.organizzazioni,
        'Tutte le organizzazioni',
        (organizzazione) => organizzazione.nome
    );
}

function impostaDisponibilitaFiltriInventario(disabilitati) {
    [
        'asset-search',
        'asset-filter-criticita',
        'asset-filter-categoria',
        'asset-filter-organizzazione',
        'asset-page-size'
    ].forEach((id) => {
        const controllo = document.getElementById(id);
        if (controllo) controllo.disabled = disabilitati;
    });

    const clearButton = document.getElementById('asset-search-clear');
    const exportButton = document.getElementById('btn-export-filtered');
    const previousButton = document.getElementById('asset-page-prev');
    const nextButton = document.getElementById('asset-page-next');
    if (clearButton && disabilitati) clearButton.disabled = true;
    if (exportButton && disabilitati) exportButton.disabled = true;
    if (previousButton && disabilitati) previousButton.disabled = true;
    if (nextButton && disabilitati) nextButton.disabled = true;
}

/**
 * Collega una sola volta i controlli di ricerca e filtro all'inventario.
 */
function inizializzaRicercaAsset() {
    const input = document.getElementById('asset-search');
    const criticitaSelect = document.getElementById('asset-filter-criticita');
    const categoriaSelect = document.getElementById('asset-filter-categoria');
    const organizzazioneSelect = document.getElementById('asset-filter-organizzazione');
    const clearButton = document.getElementById('asset-search-clear');
    const pageSizeSelect = document.getElementById('asset-page-size');
    const previousButton = document.getElementById('asset-page-prev');
    const nextButton = document.getElementById('asset-page-next');

    if (
        !input
        || !criticitaSelect
        || !categoriaSelect
        || !organizzazioneSelect
        || !clearButton
        || !pageSizeSelect
        || !previousButton
        || !nextButton
    ) return;

    const applicaCriteriDallaPrimaPagina = () => {
        inventoryCurrentPage = 1;
        renderInventarioFiltrato();
    };

    input.oninput = applicaCriteriDallaPrimaPagina;
    criticitaSelect.onchange = applicaCriteriDallaPrimaPagina;
    categoriaSelect.onchange = applicaCriteriDallaPrimaPagina;
    organizzazioneSelect.onchange = applicaCriteriDallaPrimaPagina;

    pageSizeSelect.onchange = () => {
        const nuovaDimensione = Number(pageSizeSelect.value);
        inventoryPageSize = [5, 10, 25].includes(nuovaDimensione) ? nuovaDimensione : 5;
        inventoryCurrentPage = 1;
        renderInventarioFiltrato();
    };

    previousButton.onclick = () => {
        if (inventoryCurrentPage <= 1) return;
        inventoryCurrentPage -= 1;
        renderInventarioFiltrato();
        document.getElementById('asset-pagination')?.scrollIntoView({ block: 'nearest' });
    };

    nextButton.onclick = () => {
        const totalePagine = Math.max(1, Math.ceil(inventoryFilteredCache.length / inventoryPageSize));
        if (inventoryCurrentPage >= totalePagine) return;
        inventoryCurrentPage += 1;
        renderInventarioFiltrato();
        document.getElementById('asset-pagination')?.scrollIntoView({ block: 'nearest' });
    };

    clearButton.onclick = () => {
        input.value = '';
        criticitaSelect.value = '';
        categoriaSelect.value = '';
        organizzazioneSelect.value = '';
        inventoryCurrentPage = 1;
        renderInventarioFiltrato();
        input.focus();
    };
}

/**
 * Aggiorna riepilogo e comandi della paginazione locale.
 */
function aggiornaPaginazioneInventario(totaleRisultati) {
    const previousButton = document.getElementById('asset-page-prev');
    const nextButton = document.getElementById('asset-page-next');
    const indicator = document.getElementById('asset-page-indicator');
    const status = document.getElementById('asset-page-status');
    const pageSizeSelect = document.getElementById('asset-page-size');

    if (!previousButton || !nextButton || !indicator || !status || !pageSizeSelect) return;

    const totalePagine = totaleRisultati === 0
        ? 0
        : Math.ceil(totaleRisultati / inventoryPageSize);

    if (totalePagine === 0) {
        inventoryCurrentPage = 1;
        previousButton.disabled = true;
        nextButton.disabled = true;
        indicator.textContent = 'Pagina 0 di 0';
        status.textContent = 'Nessun elemento da paginare';
        pageSizeSelect.value = String(inventoryPageSize);
        return;
    }

    inventoryCurrentPage = Math.min(Math.max(inventoryCurrentPage, 1), totalePagine);

    const primoElemento = ((inventoryCurrentPage - 1) * inventoryPageSize) + 1;
    const ultimoElemento = Math.min(inventoryCurrentPage * inventoryPageSize, totaleRisultati);

    previousButton.disabled = inventoryCurrentPage === 1;
    nextButton.disabled = inventoryCurrentPage === totalePagine;
    indicator.textContent = `Pagina ${inventoryCurrentPage} di ${totalePagine}`;
    status.textContent = `Elementi ${primoElemento}–${ultimoElemento} di ${totaleRisultati}`;
    pageSizeSelect.value = String(inventoryPageSize);
}


function formattaDataBreve(valore) {
    if (!valore) return 'N/D';
    const data = new Date(`${String(valore).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(data.getTime())) return 'N/D';
    return data.toLocaleDateString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

function creaCampoDettaglio(etichetta, valore, classe = '') {
    return `
        <div class="asset-detail-field ${classe}">
            <dt>${escapeHtml(etichetta)}</dt>
            <dd>${escapeHtml(valore || 'N/D')}</dd>
        </div>
    `;
}

function creaListaRelazioni(titolo, elementi, renderElemento, messaggioVuoto) {
    const contenuto = elementi.length > 0
        ? `<ul class="asset-detail-relation-list">${elementi.map(renderElemento).join('')}</ul>`
        : `<p class="asset-detail-empty">${escapeHtml(messaggioVuoto)}</p>`;

    return `
        <section class="asset-detail-section">
            <div class="asset-detail-section-heading">
                <h3>${escapeHtml(titolo)}</h3>
                <span class="asset-detail-count">${elementi.length}</span>
            </div>
            ${contenuto}
        </section>
    `;
}

function renderRelazioniAsset(relazioni) {
    const container = document.getElementById('asset-detail-relations');
    if (!container) return;

    const servizi = Array.isArray(relazioni?.servizi) ? relazioni.servizi : [];
    const vulnerabilita = Array.isArray(relazioni?.vulnerabilita) ? relazioni.vulnerabilita : [];
    const fornitori = Array.isArray(relazioni?.fornitori) ? relazioni.fornitori : [];

    const sezioneServizi = creaListaRelazioni(
        'Servizi collegati',
        servizi,
        (servizio) => `
            <li>
                <div class="asset-detail-relation-title">
                    <strong>${escapeHtml(servizio.codice || 'Servizio')}</strong>
                    <span>${escapeHtml(servizio.tipoDipendenza)}</span>
                </div>
                <p>${escapeHtml(servizio.nome || 'N/D')}</p>
                ${servizio.descrizione ? `<small>${escapeHtml(servizio.descrizione)}</small>` : ''}
            </li>
        `,
        'Nessun servizio attivo collegato.'
    );

    const sezioneVulnerabilita = creaListaRelazioni(
        'Vulnerabilità associate',
        vulnerabilita,
        (record) => `
            <li>
                <div class="asset-detail-relation-title">
                    <strong>${escapeHtml(record.codice || 'Vulnerabilità')}</strong>
                    <span class="badge ${classeCriticita(normalizzaCriticita(record.severita))}">${escapeHtml(record.severita)}</span>
                </div>
                <p>Remediation: ${escapeHtml(record.statoRemediation)}</p>
                <small>Rilevata: ${escapeHtml(formattaDataBreve(record.dataRilevamento))}</small>
                ${record.descrizione ? `<small>${escapeHtml(record.descrizione)}</small>` : ''}
            </li>
        `,
        'Nessuna vulnerabilità attiva associata.'
    );

    const sezioneFornitori = creaListaRelazioni(
        'Fornitori collegati',
        fornitori,
        (fornitore) => `
            <li>
                <div class="asset-detail-relation-title">
                    <strong>${escapeHtml(fornitore.codice || 'Fornitore')}</strong>
                    <span>${escapeHtml(fornitore.tipoRelazione)}</span>
                </div>
                <p>${escapeHtml(fornitore.nome || 'N/D')}${fornitore.relazionePrimaria ? ' · Primario' : ''}</p>
                ${fornitore.email ? `<small>${escapeHtml(fornitore.email)}</small>` : ''}
                <small>Validità: ${escapeHtml(formattaDataBreve(fornitore.validoDal))}${fornitore.validoAl ? ` – ${escapeHtml(formattaDataBreve(fornitore.validoAl))}` : ' – attiva'}</small>
                ${fornitore.riferimentoContratto ? `<small>Riferimento: ${escapeHtml(fornitore.riferimentoContratto)}</small>` : ''}
            </li>
        `,
        'Nessun fornitore attivo collegato.'
    );

    container.innerHTML = sezioneServizi + sezioneVulnerabilita + sezioneFornitori;
}

async function apriDettaglioAsset(asset) {
    const dialog = document.getElementById('asset-detail-dialog');
    const title = document.getElementById('asset-detail-title');
    const subtitle = document.getElementById('asset-detail-subtitle');
    const overview = document.getElementById('asset-detail-overview');
    const relations = document.getElementById('asset-detail-relations');
    const status = document.getElementById('asset-detail-status');

    if (!dialog || !title || !subtitle || !overview || !relations || !status) return;

    const categoria = assetReferencesCache?.categorie?.find(
        (record) => Number(record.id) === Number(asset.categoria_asset_id)
    );
    const organizzazione = assetReferencesCache?.organizzazioni?.find(
        (record) => Number(record.id) === Number(asset.organizzazione_id)
    );
    const responsabile = inventoryResponsibleMap.get(Number(asset.responsabile_id));
    const nominativoResponsabile = responsabile
        ? `${responsabile.nome || ''} ${responsabile.cognome || ''}`.trim()
        : 'Non assegnato';

    title.textContent = asset.nome || 'Dettaglio asset';
    subtitle.textContent = asset.codice_asset || `Asset ID ${asset.id}`;
    status.textContent = 'Caricamento delle relazioni associate…';

    const criticita = normalizzaCriticita(asset.classificazione_criticita);
    overview.innerHTML = `
        <section class="asset-detail-section asset-detail-section--overview">
            <div class="asset-detail-section-heading">
                <h3>Dati identificativi e organizzativi</h3>
                <span class="badge ${classeCriticita(criticita)}">${escapeHtml(criticita)}</span>
            </div>
            <dl class="asset-detail-grid">
                ${creaCampoDettaglio('ID', asset.id)}
                ${creaCampoDettaglio('Codice asset', asset.codice_asset)}
                ${creaCampoDettaglio('Nome', asset.nome)}
                ${creaCampoDettaglio('Categoria', categoria?.nome || inventoryCategoryMap.get(asset.categoria_asset_id) || 'N/D')}
                ${creaCampoDettaglio('Organizzazione', organizzazione?.nome || inventoryOrganizationMap.get(asset.organizzazione_id) || 'N/D')}
                ${creaCampoDettaglio('Responsabile', nominativoResponsabile)}
                ${creaCampoDettaglio('E-mail responsabile', responsabile?.email || 'N/D')}
                ${creaCampoDettaglio('Telefono responsabile', responsabile?.telefono || 'N/D')}
                ${creaCampoDettaglio('Versione', asset.versione || 'N/D')}
                ${creaCampoDettaglio('Ubicazione', asset.ubicazione || 'N/D')}
                ${creaCampoDettaglio('Data inserimento', formattaDataBreve(asset.data_inserimento))}
                ${creaCampoDettaglio('Stato', asset.attiva === false ? 'Archiviato' : 'Attivo')}
                ${creaCampoDettaglio('Descrizione', asset.descrizione || 'Nessuna descrizione disponibile', 'asset-detail-field--wide')}
            </dl>
        </section>
    `;

    relations.innerHTML = `
        <section class="asset-detail-section">
            <div class="asset-detail-loading" role="status">
                <span class="loading-spinner" aria-hidden="true"></span>
                <span>Recupero di servizi, vulnerabilità e fornitori…</span>
            </div>
        </section>
    `;

    if (!dialog.open) dialog.showModal();

    try {
        const datiRelazioni = await fetchAssetDetailRelations(asset.id);
        if (!dialog.open || Number(dialog.dataset.assetId) !== Number(asset.id)) return;
        renderRelazioniAsset(datiRelazioni);
        status.textContent = 'Dettaglio completo caricato.';
    } catch (error) {
        console.error('Errore nel caricamento del dettaglio asset:', error);
        if (!dialog.open || Number(dialog.dataset.assetId) !== Number(asset.id)) return;
        relations.innerHTML = `
            <section class="asset-detail-section">
                <p class="error-msg">Impossibile caricare le relazioni associate: ${escapeHtml(error.message)}</p>
            </section>
        `;
        status.textContent = 'Dati principali disponibili; relazioni non caricate.';
    }
}

function inizializzaDialogDettaglioAsset() {
    const dialog = document.getElementById('asset-detail-dialog');
    if (!dialog || dialog.dataset.initialized === 'true') return;

    dialog.dataset.initialized = 'true';
    dialog.addEventListener('click', (event) => {
        if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener('close', () => {
        dialog.removeAttribute('data-asset-id');
    });
}

/**
 * Disegna le righe dell'inventario usando esclusivamente i dati già caricati.
 * Ricerca, filtri e paginazione non eseguono nuove query e non modificano il database.
 */
function renderInventarioFiltrato() {
    const assetTableBody = document.getElementById('asset-table-body');
    const clearButton = document.getElementById('asset-search-clear');
    const exportButton = document.getElementById('btn-export-filtered');
    if (!assetTableBody) return;

    const filtri = leggiFiltriInventario();
    inventoryFilteredCache = inventoryAssetsCache.filter((asset) => {
        if (filtri.testoNormalizzato) {
            const codice = normalizzaTestoRicerca(asset.codice_asset);
            const nome = normalizzaTestoRicerca(asset.nome);
            if (!codice.includes(filtri.testoNormalizzato) && !nome.includes(filtri.testoNormalizzato)) {
                return false;
            }
        }

        if (filtri.criticita && normalizzaCriticita(asset.classificazione_criticita) !== filtri.criticita) {
            return false;
        }

        if (filtri.categoriaId && String(asset.categoria_asset_id ?? '') !== filtri.categoriaId) {
            return false;
        }

        if (filtri.organizzazioneId && String(asset.organizzazione_id ?? '') !== filtri.organizzazioneId) {
            return false;
        }

        return true;
    });

    if (clearButton) clearButton.disabled = !filtriInventarioAttivi(filtri);
    if (exportButton) exportButton.disabled = inventoryFilteredCache.length === 0;

    aggiornaStatoRicercaAsset(
        inventoryAssetsCache.length,
        inventoryFilteredCache.length,
        filtri
    );

    aggiornaPaginazioneInventario(inventoryFilteredCache.length);

    if (inventoryFilteredCache.length === 0) {
        const messaggio = filtriInventarioAttivi(filtri)
            ? 'Nessun asset soddisfa i criteri di ricerca e filtro selezionati.'
            : 'Nessun asset attivo censito.';
        assetTableBody.innerHTML = `<tr><td colspan="8" class="table-state">${escapeHtml(messaggio)}</td></tr>`;
        return;
    }

    const indiceIniziale = (inventoryCurrentPage - 1) * inventoryPageSize;
    const assetPaginaCorrente = inventoryFilteredCache.slice(
        indiceIniziale,
        indiceIniziale + inventoryPageSize
    );

    assetTableBody.innerHTML = assetPaginaCorrente.map((asset) => {
        const criticita = normalizzaCriticita(asset.classificazione_criticita);
        const badgeClass = classeCriticita(criticita);

        return `
            <tr>
                <td class="cell-id">${escapeHtml(asset.id)}</td>
                <td class="cell-primary">${escapeHtml(asset.codice_asset)}</td>
                <td class="cell-primary">${escapeHtml(asset.nome)}</td>
                <td class="cell-secondary">${escapeHtml(inventoryCategoryMap.get(asset.categoria_asset_id) || 'N/D')}</td>
                <td class="cell-secondary">${escapeHtml(inventoryOrganizationMap.get(asset.organizzazione_id) || 'N/D')}</td>
                <td class="cell-secondary">${escapeHtml(asset.versione || 'N/D')}</td>
                <td><span class="badge ${badgeClass}">${escapeHtml(criticita)}</span></td>
                <td class="cell-actions">
                    <button class="btn-detail" data-id="${escapeHtml(asset.id)}" type="button" aria-haspopup="dialog">Dettaglio</button>
                    <button class="btn-edit" data-id="${escapeHtml(asset.id)}" type="button">Modifica</button>
                </td>
            </tr>
        `;
    }).join('');

    assetTableBody.querySelectorAll('.btn-detail').forEach((button) => {
        button.addEventListener('click', async (event) => {
            const id = Number(event.currentTarget.getAttribute('data-id'));
            const asset = inventoryAssetsCache.find((item) => item.id === id);
            if (asset) {
                const dialog = document.getElementById('asset-detail-dialog');
                if (dialog) dialog.dataset.assetId = String(asset.id);
                await apriDettaglioAsset(asset);
            }
        });
    });

    assetTableBody.querySelectorAll('.btn-edit').forEach((button) => {
        button.addEventListener('click', async (event) => {
            const id = Number(event.currentTarget.getAttribute('data-id'));
            const asset = inventoryAssetsCache.find((item) => item.id === id);
            if (asset) {
                await caricaAssetNelForm(asset);
            }
        });
    });
}

/**
 * Restituisce una copia dei risultati correntemente visualizzati e dei criteri
 * usati per l'esportazione separata dei dati filtrati.
 */
export function getFilteredInventoryExportSnapshot() {
    const filtri = leggiFiltriInventario();

    return {
        assets: inventoryFilteredCache.map((asset) => ({
            id: asset.id,
            codice_asset: asset.codice_asset || '',
            nome: asset.nome || '',
            categoria: inventoryCategoryMap.get(asset.categoria_asset_id) || 'N/D',
            organizzazione: inventoryOrganizationMap.get(asset.organizzazione_id) || 'N/D',
            versione: asset.versione || 'N/D',
            classificazione_criticita: normalizzaCriticita(asset.classificazione_criticita)
        })),
        criteria: {
            testoRicerca: filtri.testoOriginale || 'Nessuno',
            criticita: filtri.criticita || 'Tutte',
            categoria: filtri.categoriaId ? filtri.categoriaEtichetta : 'Tutte',
            organizzazione: filtri.organizzazioneId ? filtri.organizzazioneEtichetta : 'Tutte',
            numeroRisultati: inventoryFilteredCache.length
        }
    };
}

export async function loadAndRenderTable() {
    const assetTableBody = document.getElementById('asset-table-body');
    const searchStatus = document.getElementById('asset-search-status');
    if (!assetTableBody) return;

    inizializzaRicercaAsset();
    inizializzaDialogDettaglioAsset();

    try {
        assetTableBody.innerHTML = '<tr><td colspan="8" class="table-state">Sincronizzazione in corso...</td></tr>';
        impostaDisponibilitaFiltriInventario(true);
        if (searchStatus) searchStatus.textContent = 'Caricamento asset…';

        const [data, riferimenti] = await Promise.all([
            fetchAssets(),
            fetchAssetReferences()
        ]);
        assetReferencesCache = riferimenti;
        inventoryAssetsCache = Array.isArray(data) ? data : [];
        inventoryCurrentPage = 1;
        inventoryPageSize = 5;
        inventoryCategoryMap = new Map(
            riferimenti.categorie.map((categoria) => [categoria.id, categoria.nome])
        );
        inventoryOrganizationMap = new Map(
            riferimenti.organizzazioni.map((organizzazione) => [organizzazione.id, organizzazione.nome])
        );
        inventoryResponsibleMap = new Map(
            riferimenti.responsabili.map((responsabile) => [Number(responsabile.id), responsabile])
        );
        popolaFiltriInventario(riferimenti);

        impostaDisponibilitaFiltriInventario(false);
        renderInventarioFiltrato();
    } catch (error) {
        console.error('Errore nel rendering dell’inventario:', error);
        inventoryAssetsCache = [];
        inventoryCategoryMap = new Map();
        inventoryOrganizationMap = new Map();
        inventoryResponsibleMap = new Map();
        inventoryFilteredCache = [];
        inventoryCurrentPage = 1;
        inventoryPageSize = 5;
        aggiornaPaginazioneInventario(0);
        impostaDisponibilitaFiltriInventario(true);
        if (searchStatus) searchStatus.textContent = 'Ricerca e filtri non disponibili.';
        assetTableBody.innerHTML = `<tr><td colspan="8" class="error-msg">Errore: ${escapeHtml(error.message)}</td></tr>`;
    }
}

export async function caricaAssetNelForm(asset) {
    await loadAssetFormReferences();

    document.getElementById('asset-id').value = asset.id ?? '';
    document.getElementById('asset-codice').value = asset.codice_asset ?? '';
    document.getElementById('asset-nome').value = asset.nome ?? '';
    document.getElementById('asset-versione').value = asset.versione ?? '';
    document.getElementById('asset-ubicazione').value = asset.ubicazione ?? '';
    document.getElementById('asset-descrizione').value = asset.descrizione ?? '';
    document.getElementById('asset-categoria').value = String(asset.categoria_asset_id ?? '');
    document.getElementById('asset-organizzazione').value = String(asset.organizzazione_id ?? '');
    document.getElementById('asset-responsabile').value = asset.responsabile_id
        ? String(asset.responsabile_id)
        : '';

    const criticita = normalizzaCriticita(asset.classificazione_criticita);
    document.getElementById('asset-criticita').value = criticita;

    const headerTitle = document.querySelector('#view-add-asset h2');
    const submitBtn = document.querySelector('#asset-form button[type="submit"]');
    if (headerTitle) headerTitle.textContent = 'Modifica configurazione asset';
    if (submitBtn) submitBtn.textContent = 'Aggiorna dati';

    await navigateTo('add-asset', { force: true });
}

export function resetAssetForm() {
    const form = document.getElementById('asset-form');
    if (!form) return;

    form.reset();

    const assetId = document.getElementById('asset-id');
    const criticita = document.getElementById('asset-criticita');
    const headerTitle = document.querySelector('#view-add-asset h2');
    const submitBtn = document.querySelector('#asset-form button[type="submit"]');

    if (assetId) assetId.value = '';
    if (criticita) criticita.value = 'Bassa';
    if (headerTitle) headerTitle.textContent = 'Inserimento nuovo asset';
    if (submitBtn) submitBtn.textContent = 'Salva Asset';
}

export function mostraDashboardInterfaccia(session, accessState) {
    showAuthenticatedInterface(session, accessState);
}

export async function loadAndRenderSupplyChain() {
    const container = document.getElementById('supply-chain-table-body');
    if (!container) return;

    try {
        container.innerHTML = '<tr><td colspan="5" class="table-state">Estrazione dati in corso...</td></tr>';
        const data = await fetchSupplyChain();
        if (!data || data.length === 0) {
            container.innerHTML = '<tr><td colspan="5" class="table-state">Nessuna dipendenza registrata.</td></tr>';
            return;
        }

        container.innerHTML = data.map(item => `
            <tr>
                <td class="cell-primary">${item.Service_Name || 'N/D'}</td>
                <td>${item.Service_Type || 'N/D'}</td>
                <td class="cell-primary">${item.Dependent_Asset || 'N/D'}</td>
                <td>${item.Vendor_Partner || 'N/D'}</td>
                <td class="cell-small">${item.Vendor_Contact || 'N/D'}</td>
            </tr>
        `).join('');
    } catch (err) {
        console.error("Errore rendering Supply Chain:", err);
        container.innerHTML = `<tr><td colspan="5" class="error-msg">Errore: ${err.message}</td></tr>`;
    }
}
