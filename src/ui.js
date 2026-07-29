// ===============================================================================================================
// FILE: src/ui.js
// DESCRIZIONE: Manipolazione del DOM, attivazione delle viste applicative e gestione del tema.
// ===============================================================================================================

import { fetchAssets, fetchArchivedAssets, fetchAssetReferences, fetchAssetDetailRelations, archiveAsset, fetchDashboardData } from './database.js?build=20260726-d2';
import { loadAndRenderSupplyChain } from './supplyChain.js?build=20260727-n1';
import { loadAndRenderAuditLog } from './auditLog.js?build=20260728-q1';
import { navigateTo, getCurrentRoute } from './router.js?build=20260727-m1';
import { exportArchivedAssetsToExcel } from './importExport.js?build=20260726-d3';
import { loadIncidentManagementView, openNewIncidentWizard } from './incidentManagement.js?build=20260727-m1';
import { formatRomeDateTime } from './dateTime.js?build=20260726-d3';
import { loadOrganizationView } from './organizationManagement.js?build=20260727-m1';
import { loadServiceView } from './serviceManagement.js?build=20260729-v1';
import { loadSupplierView } from './supplierManagement.js?build=20260729-w1';
import { t } from './i18n.js?build=20260728-p2';
import { loadRelationshipBuilder } from './relationshipBuilder.js?build=20260727-n1';
import { fetchRelationshipCoverage } from './relationshipService.js?build=20260727-m1';

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
    organizations: 'organizations',
    'add-organization': 'add-organization',
    'organization-people': 'organization-people',
    'archived-organizations': 'archived-organizations',
    services: 'services',
    'add-service': 'add-service',
    'archived-services': 'archived-services',
    suppliers: 'suppliers',
    'add-supplier': 'add-supplier',
    'archived-suppliers': 'archived-suppliers',
    inventory: 'inventory',
    'archived-assets': 'archived-assets',
    'add-asset': 'add-asset',
    'supply-chain': 'supply-chain',
    'relationship-builder': 'relationship-builder',
    'audit-log': 'audit-log',
    'incidenti-aperti': 'incidenti',
    'incidenti-chiusi': 'incidenti',
    'nuova-segnalazione': 'incidenti',
    riepilogo: 'riepilogo',
    info: 'info'
};

const ROUTE_METADATA = {
    dashboard: {
        section: 'Panoramica',
        label: 'DASHBOARD',
        title: 'Dashboard operativa'
    },
    organizations: {
        section: 'Azienda',
        label: 'AZIENDA',
        title: 'Soggetti NIS2'
    },
    'add-organization': {
        section: 'Azienda',
        label: 'AZIENDA',
        title: 'Nuovo soggetto'
    },
    'organization-people': {
        section: 'Azienda',
        label: 'AZIENDA',
        title: 'Persone e figure NIS2'
    },
    'archived-organizations': {
        section: 'Azienda',
        label: 'AZIENDA',
        title: 'Soggetti archiviati'
    },
    services: {
        section: 'Servizi',
        label: 'SERVIZI',
        title: 'Elenco servizi'
    },
    'add-service': {
        section: 'Servizi',
        label: 'SERVIZI',
        title: 'Nuovo servizio'
    },
    'archived-services': {
        section: 'Servizi',
        label: 'SERVIZI',
        title: 'Servizi cessati'
    },
    suppliers: {
        section: 'Fornitori',
        label: 'FORNITORI',
        title: 'Elenco fornitori'
    },
    'add-supplier': {
        section: 'Fornitori',
        label: 'FORNITORI',
        title: 'Nuovo fornitore'
    },
    'archived-suppliers': {
        section: 'Fornitori',
        label: 'FORNITORI',
        title: 'Fornitori cessati'
    },
    inventory: {
        section: 'Inventario',
        label: 'INVENTARIO',
        title: 'Inventario Asset'
    },
    'archived-assets': {
        section: 'Inventario',
        label: 'INVENTARIO',
        title: 'Asset archiviati'
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
    'relationship-builder': {
        section: 'Relazioni',
        label: 'RELAZIONI',
        title: 'Costruzione dipendenze'
    },
    'audit-log': {
        section: 'Sicurezza e conformità',
        label: 'SICUREZZA E CONFORMITÀ',
        title: 'Audit Log'
    },
    'incidenti-aperti': {
        section: 'Incidenti',
        label: 'INCIDENTI',
        title: 'Incidenti aperti'
    },
    'incidenti-chiusi': {
        section: 'Incidenti',
        label: 'INCIDENTI',
        title: 'Incidenti chiusi'
    },
    'nuova-segnalazione': {
        section: 'Incidenti',
        label: 'INCIDENTI',
        title: 'Nuova segnalazione'
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

const SIDEBAR_GROUP_STORAGE_KEY = 'nis2-sidebar-open-group';
let sidebarNavigationInitialized = false;

function setNavigationGroupExpanded(group, expanded) {
    if (!group) return;
    const toggle = group.querySelector(':scope > .navigation-group__toggle');
    if (!toggle) return;
    toggle.setAttribute('aria-expanded', String(Boolean(expanded)));
    group.classList.toggle('is-expanded', Boolean(expanded));
}

function initializeSidebarNavigation() {
    if (sidebarNavigationInitialized) return;
    sidebarNavigationInitialized = true;

    const groups = [...document.querySelectorAll('.navigation-group[data-menu-group]')];
    const savedGroup = localStorage.getItem(SIDEBAR_GROUP_STORAGE_KEY);

    groups.forEach((group) => {
        const toggle = group.querySelector(':scope > .navigation-group__toggle');
        if (!toggle) return;

        const shouldStartExpanded = savedGroup
            ? group.dataset.menuGroup === savedGroup
            : toggle.getAttribute('aria-expanded') === 'true';
        setNavigationGroupExpanded(group, shouldStartExpanded);

        toggle.addEventListener('click', () => {
            const willExpand = toggle.getAttribute('aria-expanded') !== 'true';
            groups.forEach((candidate) => setNavigationGroupExpanded(candidate, false));
            setNavigationGroupExpanded(group, willExpand);

            if (willExpand) localStorage.setItem(SIDEBAR_GROUP_STORAGE_KEY, group.dataset.menuGroup || '');
            else localStorage.removeItem(SIDEBAR_GROUP_STORAGE_KEY);
        });
    });
}

function keepRouteVisibleInsideSidebar(routeControl) {
    const navigation = routeControl?.closest('.sidebar-navigation');
    if (!navigation) return;

    window.requestAnimationFrame(() => {
        const navigationRect = navigation.getBoundingClientRect();
        const controlRect = routeControl.getBoundingClientRect();
        const safeGap = 10;

        if (controlRect.top < navigationRect.top + safeGap) {
            navigation.scrollTop -= (navigationRect.top + safeGap) - controlRect.top;
        } else if (controlRect.bottom > navigationRect.bottom - safeGap) {
            navigation.scrollTop += controlRect.bottom - (navigationRect.bottom - safeGap);
        }
    });
}

function revealNavigationGroupForRoute(route) {
    initializeSidebarNavigation();
    const routeControl = [...document.querySelectorAll('.sidebar-navigation [data-route]')]
        .find((control) => control.dataset.route === route);
    const activeGroup = routeControl?.closest('.navigation-group[data-menu-group]');
    if (!activeGroup) return;

    document.querySelectorAll('.navigation-group[data-menu-group]').forEach((group) => {
        setNavigationGroupExpanded(group, group === activeGroup);
    });
    localStorage.setItem(SIDEBAR_GROUP_STORAGE_KEY, activeGroup.dataset.menuGroup || '');
    keepRouteVisibleInsideSidebar(routeControl);
}

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

    revealNavigationGroupForRoute(route);
}

/**
 * Aggiorna titolo, breadcrumb e titolo della scheda del browser.
 */
let workspaceContextOverride = null;

function updateWorkspaceHeader(route, override = null) {
    const metadata = override || ROUTE_METADATA[route] || ROUTE_METADATA.dashboard;
    const breadcrumbSection = document.getElementById('breadcrumb-section');
    const breadcrumbCurrent = document.getElementById('breadcrumb-current');
    const pageSectionLabel = document.getElementById('page-section-label');
    const pageTitle = document.getElementById('page-title');

    if (breadcrumbSection) breadcrumbSection.textContent = t(metadata.section);
    if (breadcrumbCurrent) breadcrumbCurrent.textContent = t(metadata.title);
    if (pageSectionLabel) pageSectionLabel.textContent = t(metadata.label);
    if (pageTitle) pageTitle.textContent = t(metadata.title);

    document.title = `${t(metadata.title)} | NIS2 Asset Inventory Manager`;
}

function resetApplicationScrollPosition() {
    const scrollingElement = document.scrollingElement || document.documentElement;
    if (scrollingElement) {
        scrollingElement.scrollTop = 0;
        scrollingElement.scrollLeft = 0;
    }

    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });

    const workspace = document.getElementById('app-workspace');
    if (workspace) {
        workspace.scrollTop = 0;
        workspace.scrollLeft = 0;
    }
}

document.addEventListener('app:workspace-context', (event) => {
    const detail = event.detail || {};
    workspaceContextOverride = detail.title ? detail : null;
    updateWorkspaceHeader(getCurrentRoute(), workspaceContextOverride);

    if (detail.navigationRoute) {
        updateNavigationState(detail.navigationRoute);
    }
});

document.addEventListener('app:language-changed', () => {
    updateWorkspaceHeader(getCurrentRoute(), workspaceContextOverride);
});

/**
 * Attiva una vista applicativa in base alla rotta risolta dal router centrale.
 */
export async function activateApplicationRoute(route) {
    const viewId = ROUTE_TO_VIEW[route] || 'inventory';
    workspaceContextOverride = null;
    resetApplicationScrollPosition();
    document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());

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
    } else if (['organizations', 'add-organization', 'organization-people', 'archived-organizations'].includes(route)) {
        await loadOrganizationView(route);
    } else if (['services', 'add-service', 'archived-services'].includes(route)) {
        await loadServiceView(route);
    } else if (['suppliers', 'add-supplier', 'archived-suppliers'].includes(route)) {
        await loadSupplierView(route);
    } else if (route === 'inventory') {
        await loadAndRenderTable();
        resetAssetForm();
    } else if (route === 'archived-assets') {
        await loadAndRenderArchivedAssets();
    } else if (route === 'add-asset') {
        await loadAssetFormReferences();
        const assetId = document.getElementById('asset-id');
        if (!assetId?.value) {
            resetAssetForm();
        }
    } else if (route === 'supply-chain') {
        await loadAndRenderSupplyChain();
    } else if (route === 'relationship-builder') {
        await loadRelationshipBuilder();
    } else if (route === 'audit-log') {
        await loadAndRenderAuditLog();
    } else if (route === 'incidenti-aperti') {
        await loadIncidentManagementView('open');
    } else if (route === 'incidenti-chiusi') {
        await loadIncidentManagementView('closed');
    } else if (route === 'nuova-segnalazione') {
        openNewIncidentWizard();
    }

    window.requestAnimationFrame(resetApplicationScrollPosition);
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
 * Formatta in modo uniforme i timestamp del database nel fuso Europe/Rome.
 */
function formattaTimestampApplicativo(valore) {
    return formatRomeDateTime(valore, 'Data non disponibile');
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
 * Restituisce il messaggio corretto al singolare o al plurale per i servizi da verificare.
 */
function formatRelationshipReviewMessage(count) {
    const total = Number(count) || 0;
    return total === 1
        ? '1 servizio richiede una verifica delle dipendenze.'
        : `${total} servizi richiedono una verifica delle dipendenze.`;
}

/**
 * Riepiloga la copertura della Supply Chain usando i dati aggregati della vista di reporting.
 */
function renderRiepilogoSupplyChain(source) {
    const coverageData = source?.summary && Array.isArray(source?.rows) ? source : null;

    if (coverageData) {
        const summary = coverageData.summary;
        impostaTesto('supply-services-count', summary.activeServices);
        impostaTesto('supply-mapped-count', summary.mappedServices);
        impostaTesto('supply-review-count', summary.servicesToReview);
        impostaTesto('supply-disconnected-count', summary.disconnectedServices);

        const note = document.getElementById('supply-summary-note');
        const warning = document.getElementById('supply-summary-warning');
        const warningList = document.getElementById('supply-summary-warning-list');
        const manageButton = document.getElementById('supply-manage-missing');

        if (note) {
            note.textContent = summary.servicesToReview > 0
                ? formatRelationshipReviewMessage(summary.servicesToReview)
                : 'La copertura delle relazioni è completa per i servizi censiti.';
        }

        warning?.classList.toggle('is-hidden', summary.servicesToReview === 0);
        manageButton?.classList.toggle('is-hidden', summary.servicesToReview === 0);
        if (warningList) {
            warningList.replaceChildren();
            coverageData.rows
                .filter((row) => row.needsReview)
                .slice(0, 3)
                .forEach((row) => {
                    const item = document.createElement('li');
                    const title = document.createElement('strong');
                    title.textContent = `${row.service.codice_servizio} · ${row.service.nome}`;
                    const detail = document.createElement('span');
                    detail.textContent = row.issues.slice(0, 2).join(' · ');
                    item.append(title, detail);
                    warningList.appendChild(item);
                });
        }
        return;
    }

    const data = Array.isArray(source) ? source : [];
    const services = new Set();
    data.forEach((record) => {
        const service = leggiCampo(record, ['servizioRadiceId', 'Service_Name', 'servizio_nome', 'nome_servizio']);
        if (service) services.add(String(service));
    });
    impostaTesto('supply-services-count', services.size || data.length);
    impostaTesto('supply-mapped-count', services.size || data.length);
    impostaTesto('supply-review-count', '—');
    impostaTesto('supply-disconnected-count', '—');
    const note = document.getElementById('supply-summary-note');
    if (note) note.textContent = data.length > 0 ? `${data.length} percorsi attivi rilevati.` : 'Nessuna dipendenza attiva disponibile.';
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
        const inizio = formattaTimestampApplicativo(incidente.inizio);
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
        const data = formattaTimestampApplicativo(log.data_modifica);
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
        let relationshipCoverage = null;
        try {
            relationshipCoverage = (await fetchRelationshipCoverage()).coverage;
        } catch (relationshipError) {
            console.error('Errore caricamento copertura relazioni:', relationshipError);
            dati.errori.push({ chiave: 'copertura-relazioni', messaggio: relationshipError.message || 'Errore non specificato' });
        }

        impostaTesto('metric-assets-active', dati.metriche.assetAttivi);
        impostaTesto('metric-assets-critical', dati.metriche.assetCritici);
        impostaTesto('metric-services-active', dati.metriche.serviziAttivi);
        impostaTesto('metric-suppliers-active', dati.metriche.fornitoriAttivi);
        impostaTesto('metric-vulnerabilities-open', dati.metriche.vulnerabilitaAperte);
        impostaTesto('metric-incidents-open', dati.metriche.incidentiAperti);

        renderDistribuzioneCriticita(dati.asset);
        renderRiepilogoSupplyChain(relationshipCoverage || dati.supplyChain);
        renderIncidentiRecenti(dati.incidentiRecenti);
        renderAuditRecente(dati.auditRecente);

        const dataOraFormattata = formatRomeDateTime(new Date(), 'Data non disponibile');

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
// GESTIONE INCIDENTI
// La logica operativa e' isolata in incidentManagement.js.
// =========================================================================

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
let archiveAssetCandidate = null;
let archivedAssetsCache = [];
let archivedAssetsCurrentPage = 1;
let archivedAssetsPageSize = 10;


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
    const nominativoResponsabile = asset.responsabile_nome || (responsabile
        ? `${responsabile.nome || ''} ${responsabile.cognome || ''}`.trim()
        : 'Non assegnato');

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
                ${creaCampoDettaglio('Categoria', asset.categoria_nome || categoria?.nome || inventoryCategoryMap.get(asset.categoria_asset_id) || 'N/D')}
                ${creaCampoDettaglio('Organizzazione', asset.organizzazione_nome || organizzazione?.nome || inventoryOrganizationMap.get(asset.organizzazione_id) || 'N/D')}
                ${creaCampoDettaglio('Responsabile', nominativoResponsabile)}
                ${creaCampoDettaglio('E-mail responsabile', asset.responsabile_email || responsabile?.email || 'N/D')}
                ${creaCampoDettaglio('Telefono responsabile', asset.responsabile_telefono || responsabile?.telefono || 'N/D')}
                ${creaCampoDettaglio('Versione', asset.versione || 'N/D')}
                ${creaCampoDettaglio('Ubicazione', asset.ubicazione || 'N/D')}
                ${creaCampoDettaglio('Data inserimento', formattaDataBreve(asset.data_inserimento))}
                ${creaCampoDettaglio('Stato', asset.attiva === false ? 'Archiviato' : 'Attivo')}
                ${asset.attiva === false ? creaCampoDettaglio('Archiviato il', formattaTimestampApplicativo(asset.archiviato_il)) : ''}
                ${asset.attiva === false ? creaCampoDettaglio('Archiviato da', asset.archiviato_da || 'N/D') : ''}
                ${asset.attiva === false ? creaCampoDettaglio('Motivo archiviazione', asset.motivo_archiviazione || 'N/D', 'asset-detail-field--wide') : ''}
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


function archivedAssetExportRows() {
    return archivedAssetsCache.map((asset) => ({
        ...asset,
        categoria: asset.categoria_nome || inventoryCategoryMap.get(asset.categoria_asset_id) || 'N/D',
        organizzazione: asset.organizzazione_nome || inventoryOrganizationMap.get(asset.organizzazione_id) || 'N/D',
        responsabile: asset.responsabile_nome || 'Non assegnato',
        email_responsabile: asset.responsabile_email || ''
    }));
}

function aggiornaPaginazioneAssetArchiviati(totaleRisultati) {
    const previousButton = document.getElementById('archived-assets-page-prev');
    const nextButton = document.getElementById('archived-assets-page-next');
    const indicator = document.getElementById('archived-assets-page-indicator');
    const status = document.getElementById('archived-assets-page-status');
    const pageSizeSelect = document.getElementById('archived-assets-page-size');
    if (!previousButton || !nextButton || !indicator || !status || !pageSizeSelect) return;

    const totalePagine = totaleRisultati === 0 ? 0 : Math.ceil(totaleRisultati / archivedAssetsPageSize);
    if (totalePagine === 0) {
        archivedAssetsCurrentPage = 1;
        previousButton.disabled = true;
        nextButton.disabled = true;
        indicator.textContent = `${t('Pagina')} 0 ${t('di')} 0`;
        status.textContent = `0 ${t('risultati')}`;
        pageSizeSelect.value = String(archivedAssetsPageSize);
        return;
    }

    archivedAssetsCurrentPage = Math.min(Math.max(archivedAssetsCurrentPage, 1), totalePagine);
    const primoElemento = ((archivedAssetsCurrentPage - 1) * archivedAssetsPageSize) + 1;
    const ultimoElemento = Math.min(archivedAssetsCurrentPage * archivedAssetsPageSize, totaleRisultati);
    previousButton.disabled = archivedAssetsCurrentPage === 1;
    nextButton.disabled = archivedAssetsCurrentPage === totalePagine;
    indicator.textContent = `${t('Pagina')} ${archivedAssetsCurrentPage} ${t('di')} ${totalePagine}`;
    status.textContent = `${primoElemento}–${ultimoElemento} ${t('di')} ${totaleRisultati}`;
    pageSizeSelect.value = String(archivedAssetsPageSize);
}

function renderArchivedAssets() {
    const tbody = document.getElementById('archived-assets-table-body');
    const status = document.getElementById('archived-assets-status');
    const exportButton = document.getElementById('btn-export-archived-assets');
    if (!tbody) return;

    if (exportButton) exportButton.disabled = archivedAssetsCache.length === 0;
    if (status) status.textContent = `${archivedAssetsCache.length} ${t('asset archiviati')}`;
    aggiornaPaginazioneAssetArchiviati(archivedAssetsCache.length);

    if (archivedAssetsCache.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="table-state">${escapeHtml(t('Nessun asset archiviato disponibile.'))}</td></tr>`;
        return;
    }

    const indiceIniziale = (archivedAssetsCurrentPage - 1) * archivedAssetsPageSize;
    const righePagina = archivedAssetsCache.slice(indiceIniziale, indiceIniziale + archivedAssetsPageSize);

    tbody.innerHTML = righePagina.map((asset) => `
        <tr>
            <td class="cell-id">${escapeHtml(asset.id)}</td>
            <td class="cell-primary">${escapeHtml(asset.codice_asset || 'N/D')}</td>
            <td class="cell-primary">${escapeHtml(asset.nome || 'N/D')}</td>
            <td class="cell-small">${escapeHtml(formattaTimestampApplicativo(asset.archiviato_il))}</td>
            <td class="cell-secondary archived-reason-cell">${escapeHtml(asset.motivo_archiviazione || 'N/D')}</td>
            <td class="cell-actions cell-actions--single">
                <button class="btn-detail archived-asset-detail-btn" data-id="${escapeHtml(asset.id)}" type="button" aria-haspopup="dialog">${escapeHtml(t('Dettaglio'))}</button>
            </td>
        </tr>
    `).join('');

    tbody.querySelectorAll('.archived-asset-detail-btn').forEach((button) => {
        button.addEventListener('click', async (event) => {
            const id = Number(event.currentTarget.getAttribute('data-id'));
            const asset = archivedAssetsCache.find((record) => Number(record.id) === id);
            if (!asset) return;

            const detailDialog = document.getElementById('asset-detail-dialog');
            if (detailDialog) detailDialog.dataset.assetId = String(asset.id);
            await apriDettaglioAsset(asset);
        });
    });
}

function inizializzaVistaAssetArchiviati() {
    const exportButton = document.getElementById('btn-export-archived-assets');
    const pageSizeSelect = document.getElementById('archived-assets-page-size');
    const previousButton = document.getElementById('archived-assets-page-prev');
    const nextButton = document.getElementById('archived-assets-page-next');
    if (!exportButton || exportButton.dataset.bound === 'true') return;

    exportButton.dataset.bound = 'true';
    exportButton.addEventListener('click', async () => {
        const defaultLabel = exportButton.textContent;
        try {
            exportButton.disabled = true;
            exportButton.textContent = t('Esportazione…');
            await exportArchivedAssetsToExcel(archivedAssetExportRows());
        } catch (error) {
            console.error('Errore esportazione asset archiviati:', error);
            window.alert(`${t('Esportazione non riuscita')}: ${error.message}`);
        } finally {
            exportButton.textContent = defaultLabel;
            exportButton.disabled = archivedAssetsCache.length === 0;
        }
    });

    pageSizeSelect?.addEventListener('change', () => {
        const nextSize = Number(pageSizeSelect.value);
        archivedAssetsPageSize = [5, 10, 25].includes(nextSize) ? nextSize : 10;
        archivedAssetsCurrentPage = 1;
        renderArchivedAssets();
    });

    previousButton?.addEventListener('click', () => {
        if (archivedAssetsCurrentPage <= 1) return;
        archivedAssetsCurrentPage -= 1;
        renderArchivedAssets();
        document.getElementById('archived-assets-pagination')?.scrollIntoView({ block: 'nearest' });
    });

    nextButton?.addEventListener('click', () => {
        const totalePagine = Math.max(1, Math.ceil(archivedAssetsCache.length / archivedAssetsPageSize));
        if (archivedAssetsCurrentPage >= totalePagine) return;
        archivedAssetsCurrentPage += 1;
        renderArchivedAssets();
        document.getElementById('archived-assets-pagination')?.scrollIntoView({ block: 'nearest' });
    });
}

async function loadAndRenderArchivedAssets() {
    const tbody = document.getElementById('archived-assets-table-body');
    const status = document.getElementById('archived-assets-status');
    const exportButton = document.getElementById('btn-export-archived-assets');
    if (!tbody) return;

    inizializzaDialogDettaglioAsset();
    inizializzaVistaAssetArchiviati();
    tbody.innerHTML = '<tr><td colspan="6" class="table-state">Caricamento asset archiviati…</td></tr>';
    if (status) status.textContent = 'Lettura archivio logico in corso…';
    if (exportButton) exportButton.disabled = true;

    try {
        archivedAssetsCache = await fetchArchivedAssets();
        archivedAssetsCurrentPage = 1;
        renderArchivedAssets();
    } catch (error) {
        console.error('Errore caricamento asset archiviati:', error);
        archivedAssetsCache = [];
        tbody.innerHTML = `<tr><td colspan="6" class="error-msg">Errore: ${escapeHtml(error.message)}</td></tr>`;
        if (status) status.textContent = 'Archivio asset non disponibile.';
    }
}

function chiudiDialogArchiviazione() {
    const dialog = document.getElementById('asset-archive-dialog');
    if (dialog?.open) dialog.close();
}

function apriDialogArchiviazione(asset) {
    const dialog = document.getElementById('asset-archive-dialog');
    const subtitle = document.getElementById('asset-archive-subtitle');
    const reason = document.getElementById('asset-archive-reason');
    const acknowledge = document.getElementById('asset-archive-acknowledge');
    const confirm = document.getElementById('asset-archive-confirm');
    const status = document.getElementById('asset-archive-status');
    if (!dialog || !reason || !status) return;

    archiveAssetCandidate = asset;
    if (subtitle) subtitle.textContent = `${asset.codice_asset} · ${asset.nome}`;
    reason.value = '';
    if (acknowledge) acknowledge.checked = false;
    if (confirm) confirm.disabled = true;
    status.textContent = 'Nessuna cancellazione fisica verrà eseguita.';
    if (!dialog.open) dialog.showModal();
    window.setTimeout(() => reason.focus(), 0);
}

function inizializzaDialogArchiviazione() {
    const dialog = document.getElementById('asset-archive-dialog');
    const form = document.getElementById('asset-archive-form');
    const cancel = document.getElementById('asset-archive-cancel');
    const close = document.getElementById('asset-archive-close');
    const confirm = document.getElementById('asset-archive-confirm');
    const reason = document.getElementById('asset-archive-reason');
    const acknowledge = document.getElementById('asset-archive-acknowledge');
    const status = document.getElementById('asset-archive-status');

    if (!dialog || !form || dialog.dataset.initialized === 'true') return;
    dialog.dataset.initialized = 'true';

    const aggiornaConfermaArchiviazione = () => {
        if (!confirm) return;
        const motivoValido = (reason?.value.trim().length || 0) >= 5;
        confirm.disabled = !(motivoValido && acknowledge?.checked);
    };

    reason?.addEventListener('input', aggiornaConfermaArchiviazione);
    acknowledge?.addEventListener('change', aggiornaConfermaArchiviazione);
    cancel?.addEventListener('click', chiudiDialogArchiviazione);
    close?.addEventListener('click', chiudiDialogArchiviazione);
    dialog.addEventListener('click', (event) => {
        if (event.target === dialog) chiudiDialogArchiviazione();
    });
    dialog.addEventListener('close', () => {
        archiveAssetCandidate = null;
        form.reset();
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!archiveAssetCandidate) return;

        const motivo = reason?.value.trim() || '';
        const defaultLabel = confirm?.textContent || 'Archivia asset';
        if (motivo.length < 5 || !acknowledge?.checked) {
            if (status) status.textContent = 'Inserisci una motivazione valida e conferma consapevolmente l’operazione.';
            (motivo.length < 5 ? reason : acknowledge)?.focus();
            aggiornaConfermaArchiviazione();
            return;
        }

        try {
            if (confirm) {
                confirm.disabled = true;
                confirm.textContent = 'Archiviazione…';
            }
            if (status) status.textContent = 'Aggiornamento controllato in corso…';

            const archived = await archiveAsset(archiveAssetCandidate.id, motivo);
            chiudiDialogArchiviazione();
            await loadAndRenderTable();
            window.alert(`Asset ${archived.codice_asset} archiviato logicamente.`);
        } catch (error) {
            console.error('Errore archiviazione asset:', error);
            if (status) status.textContent = error.message || 'Archiviazione non riuscita.';
        } finally {
            if (confirm) {
                confirm.disabled = false;
                confirm.textContent = defaultLabel;
            }
        }
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
                    <div class="cell-action-group">
                        <button class="btn-detail" data-id="${escapeHtml(asset.id)}" type="button" aria-haspopup="dialog">Dettaglio</button>
                        <button class="btn-edit" data-id="${escapeHtml(asset.id)}" type="button">Modifica</button>
                        <button class="btn-archive" data-id="${escapeHtml(asset.id)}" type="button" aria-haspopup="dialog">Archivia</button>
                    </div>
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

    assetTableBody.querySelectorAll('.btn-archive').forEach((button) => {
        button.addEventListener('click', (event) => {
            const id = Number(event.currentTarget.getAttribute('data-id'));
            const asset = inventoryAssetsCache.find((item) => item.id === id);
            if (asset) apriDialogArchiviazione(asset);
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
        assets: inventoryFilteredCache.map((asset) => {
            const responsible = inventoryResponsibleMap.get(Number(asset.responsabile_id));
            return {
                id: asset.id,
                codice_asset: asset.codice_asset || '',
                nome: asset.nome || '',
                categoria: inventoryCategoryMap.get(asset.categoria_asset_id) || 'N/D',
                organizzazione: inventoryOrganizationMap.get(asset.organizzazione_id) || 'N/D',
                responsabile: responsible
                    ? `${responsible.nome || ''} ${responsible.cognome || ''}`.trim()
                    : 'N/D',
                email_responsabile: responsible?.email || '',
                versione: asset.versione || 'N/D',
                ubicazione: asset.ubicazione || 'N/D',
                descrizione: asset.descrizione || '',
                data_inserimento: asset.data_inserimento || '',
                classificazione_criticita: normalizzaCriticita(asset.classificazione_criticita)
            };
        }),
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
    inizializzaDialogArchiviazione();

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


