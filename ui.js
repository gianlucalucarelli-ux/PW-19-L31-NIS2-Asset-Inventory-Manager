// ===============================================================================================================
// FILE: src/ui.js
// DESCRIZIONE: Manipolazione del DOM, attivazione delle viste applicative e gestione del tema.
// ===============================================================================================================

import { fetchAssets, fetchSupplyChain, fetchAuditLogs, fetchDashboardData } from './database.js?v=2';
import { navigateTo } from './router.js?v=2';

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
        contenitore.appendChild(creaStatoDashboard('Nessun incidente registrato.'));
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
        const inizio = incidente.inizio ? new Date(incidente.inizio).toLocaleString('it-IT') : 'Data non disponibile';
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
        const data = log.data_modifica ? new Date(log.data_modifica).toLocaleString('it-IT') : 'Data non disponibile';
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

        if (stato) {
            stato.textContent = dati.errori.length > 0
                ? `Dashboard aggiornata con ${dati.errori.length} sorgente/i non disponibili.`
                : `Dashboard aggiornata alle ${new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}.`;
            stato.classList.toggle('dashboard-status--warning', dati.errori.length > 0);
        }
    } catch (error) {
        console.error('Errore durante il caricamento della Dashboard:', error);
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
    if (!container) {
        console.error("DEBUG: Elemento 'audit-table-body' non trovato nel DOM!");
        return;
    }
    
    console.log("DEBUG: Inizio esecuzione renderAuditLog"); // TEST 1
    
    try {
        container.innerHTML = '<tr><td colspan="4" class="table-state">Caricamento log in corso...</td></tr>';
        const logs = await fetchAuditLogs();
        
        console.log("DEBUG: Log ricevuti dalla funzione:", logs); // TEST 2
        
        if (!logs || logs.length === 0) {
            container.innerHTML = '<tr><td colspan="4" class="table-state">Nessun evento registrato.</td></tr>';
            return;
        }

        container.innerHTML = logs.map(log => `
            <tr>
                <td class="cell-small">${new Date(log.data_modifica).toLocaleString()}</td>
                <td class="cell-primary">${log.operazione}</td>
                <td class="cell-small">${log.utente}</td>
                <td class="cell-small">Asset ID: ${log.asset_id || 'N/A'}</td>
            </tr>
        `).join('');
        
        console.log("DEBUG: Rendering completato con successo."); // TEST 3
        
    } catch (err) {
        console.error("DEBUG: Errore nella funzione renderAuditLog:", err); // TEST 4
        container.innerHTML = `<tr><td colspan="4" class="error-msg">Errore: ${err.message}</td></tr>`;
    }
}

// =========================================================================
// FUNZIONI ESISTENTI (INVENTARIO E SUPPLY CHAIN)
// =========================================================================

export async function loadAndRenderTable() {
    const assetTableBody = document.getElementById('asset-table-body');
    if (!assetTableBody) return;

    try {
        assetTableBody.innerHTML = '<tr><td colspan="5" class="table-state">Sincronizzazione in corso...</td></tr>';
        const data = await fetchAssets();
        
        if (!data || data.length === 0) {
            assetTableBody.innerHTML = '<tr><td colspan="5" class="table-state">Nessun asset censito.</td></tr>';
            return;
        }

        assetTableBody.innerHTML = data.map(a => {
            const id = a.id || a.Asset_ID;
            const nome = a.nome || a.Asset_Name || 'N/D';
            const versione = a.versione || a.Software_Version || 'N/D';
            const criticita = a.criticita || a.Criticity_Level || 'Bassa';
            const normalizedRisk = criticita.toLowerCase();
            const badgeClass = normalizedRisk === 'critica'
                ? 'risk-critical'
                : normalizedRisk === 'alta'
                    ? 'risk-high'
                    : normalizedRisk === 'media'
                        ? 'risk-medium'
                        : 'risk-low';

            return `
            <tr>
                <td class="cell-id">${id}</td>
                <td class="cell-primary">${nome}</td>
                <td class="cell-secondary">${versione}</td>
                <td><span class="badge ${badgeClass}">${criticita}</span></td>
                <td class="cell-actions">
                    <button class="btn-edit" data-id="${id}" type="button">Modifica</button>
                </td>
            </tr>
            `;
        }).join('');

        document.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.getAttribute('data-id');
                const asset = data.find(item => (item.id || item.Asset_ID) == id);
                if (asset) caricaAssetNelForm(asset);
            });
        });

    } catch (error) {
        console.error("Errore nel rendering:", error.message);
        assetTableBody.innerHTML = `<tr><td colspan="5" class="error-msg">Errore: ${error.message}</td></tr>`;
    }
}

export function caricaAssetNelForm(asset) {
    document.getElementById('asset-id').value = asset.id || asset.Asset_ID;
    document.getElementById('asset-nome').value = asset.nome || asset.Asset_Name || '';
    document.getElementById('asset-versione').value = asset.versione || asset.Software_Version || '';
    
    const currCrit = asset.criticita || asset.Criticity_Level || 'Bassa';
    const selectElem = document.getElementById('asset-criticita');
    if(selectElem) selectElem.value = currCrit.charAt(0).toUpperCase() + currCrit.slice(1).toLowerCase();

    const headerTitle = document.querySelector('#view-add-asset h2');
    const submitBtn = document.querySelector('#asset-form button[type="submit"]');
    if (headerTitle) headerTitle.textContent = "Modifica Configurazione Asset";
    if (submitBtn) submitBtn.textContent = "Aggiorna Dati";

    navigateTo('add-asset', { force: true });
}

export function resetAssetForm() {
    const form = document.getElementById('asset-form');
    if (form) {
        form.reset();
        document.getElementById('asset-id').value = '';
        const headerTitle = document.querySelector('#view-add-asset h2');
        const submitBtn = document.querySelector('#asset-form button[type="submit"]');
        if (headerTitle) headerTitle.textContent = "Inserimento Nuovo Asset";
        if (submitBtn) submitBtn.textContent = "Salva Asset";
    }
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
