// ===============================================================================================================
// FILE: src/router.js
// DESCRIZIONE: Gestione centralizzata delle rotte hash, della cronologia browser e dei controlli di accesso.
// ===============================================================================================================

const ROTTE_VALIDE = new Set([
    'dashboard',
    'organizations',
    'add-organization',
    'organization-people',
    'archived-organizations',
    'inventory',
    'archived-assets',
    'add-asset',
    'supply-chain',
    'audit-log',
    'incidenti-aperti',
    'incidenti-chiusi',
    'nuova-segnalazione',
    'riepilogo',
    'info'
]);

const ALIAS_ROTTE = {
    '': 'dashboard',
    'dashboard-section': 'dashboard',
    company: 'organizations',
    companies: 'organizations',
    organizations: 'organizations',
    'new-organization': 'add-organization',
    people: 'organization-people',
    'nis2-roles': 'organization-people',
    'archived-organizations': 'archived-organizations',
    assets: 'inventory',
    archive: 'archived-assets',
    archived: 'archived-assets',
    'asset-archiviati': 'archived-assets',
    'new-asset': 'add-asset',
    audit: 'audit-log',
    incidenti: 'incidenti-aperti',
    incidents: 'incidenti-aperti',
    'open-incidents': 'incidenti-aperti',
    'closed-incidents': 'incidenti-chiusi',
    'new-incident': 'nuova-segnalazione',
    report: 'riepilogo',
    'info-section': 'info'
};

let gestoreRotta = null;
let verificaAutorizzazione = () => false;
let gestoreAccessoNegato = null;
let routerInizializzato = false;

/**
 * Normalizza una rotta proveniente dall'hash o da un controllo di navigazione.
 */
function normalizzaRotta(valore = '') {
    const pulita = String(valore)
        .trim()
        .replace(/^#\/?/, '')
        .replace(/^\//, '')
        .toLowerCase();

    const risolta = ALIAS_ROTTE[pulita] || pulita;
    return ROTTE_VALIDE.has(risolta) ? risolta : 'dashboard';
}

/**
 * Restituisce la rotta corrente in formato applicativo.
 */
export function getCurrentRoute() {
    return normalizzaRotta(window.location.hash);
}

/**
 * Esegue il gestore associato alla rotta corrente dopo il controllo di accesso.
 */
async function applicaRottaCorrente() {
    const rotta = getCurrentRoute();

    if (!verificaAutorizzazione()) {
        if (typeof gestoreAccessoNegato === 'function') {
            gestoreAccessoNegato(rotta);
        }
        return;
    }

    if (typeof gestoreRotta === 'function') {
        await gestoreRotta(rotta);
    }
}

/**
 * Inizializza il router una sola volta e collega la cronologia del browser.
 */
export async function initializeRouter(options = {}) {
    const {
        isAuthorized,
        onRouteChange,
        onUnauthorized,
        defaultRoute = 'dashboard'
    } = options;

    verificaAutorizzazione = typeof isAuthorized === 'function'
        ? isAuthorized
        : () => false;

    gestoreRotta = typeof onRouteChange === 'function'
        ? onRouteChange
        : null;

    gestoreAccessoNegato = typeof onUnauthorized === 'function'
        ? onUnauthorized
        : null;

    if (!window.location.hash) {
        window.history.replaceState(null, '', `#${normalizzaRotta(defaultRoute)}`);
    }

    if (!routerInizializzato) {
        window.addEventListener('hashchange', applicaRottaCorrente);
        routerInizializzato = true;
    }

    await applicaRottaCorrente();
}

/**
 * Porta l'utente alla rotta richiesta mantenendo la cronologia del browser.
 */
export async function navigateTo(route, options = {}) {
    const { replace = false, force = false } = options;
    const destinazione = normalizzaRotta(route);
    const nuovoHash = `#${destinazione}`;

    if (replace) {
        window.history.replaceState(null, '', nuovoHash);
        await applicaRottaCorrente();
        return;
    }

    if (window.location.hash !== nuovoHash) {
        window.location.hash = nuovoHash;
        return;
    }

    if (force) {
        await applicaRottaCorrente();
    }
}

/**
 * Riesegue la rotta corrente, utile dopo login, MFA o aggiornamento dati.
 */
export async function refreshCurrentRoute() {
    await applicaRottaCorrente();
}
