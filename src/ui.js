// ===============================================================================================================
// FILE: src/ui.js
// DESCRIZIONE: Manipolazione del DOM, attivazione delle viste applicative e gestione del tema.
// ===============================================================================================================

import { fetchAssets, fetchSupplyChain, fetchAuditLogs } from './database.js';
import { navigateTo } from './router.js?v=1';

export function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
}

export function toggleTheme() {
    const root = document.documentElement;
    const currentTheme = root.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
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
    const authContainer = document.getElementById('auth-container');
    const loginView = document.getElementById('login-view');
    const mfaView = document.getElementById('mfa-view');
    const dashboardContainer = document.getElementById('dashboard-container');
    const navMenuLinks = document.getElementById('nav-menu-links');
    const logoutBtn = document.getElementById('logout-btn');
    const userSession = document.getElementById('user-session');

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
    const authContainer = document.getElementById('auth-container');
    const loginView = document.getElementById('login-view');
    const mfaView = document.getElementById('mfa-view');
    const dashboardContainer = document.getElementById('dashboard-container');
    const navMenuLinks = document.getElementById('nav-menu-links');
    const logoutBtn = document.getElementById('logout-btn');

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
    const authContainer = document.getElementById('auth-container');
    const dashboardContainer = document.getElementById('dashboard-container');
    const navMenuLinks = document.getElementById('nav-menu-links');
    const logoutBtn = document.getElementById('logout-btn');

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
    inventory: 'inventory',
    'add-asset': 'add-asset',
    'supply-chain': 'supply-chain',
    'audit-log': 'audit-log',
    incidenti: 'incidenti',
    riepilogo: 'riepilogo',
    info: 'info'
};

/**
 * Aggiorna l'evidenziazione dei controlli di navigazione e gli attributi accessibili.
 */
function updateNavigationState(route) {
    document.querySelectorAll('[data-route]').forEach((control) => {
        const controlRoute = control.dataset.route;
        const navigationGroup = control.dataset.navGroup;
        const isActive = navigationGroup === 'dashboard'
            ? route !== 'info'
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
 * Attiva una vista applicativa in base alla rotta risolta dal router centrale.
 */
export async function activateApplicationRoute(route) {
    const viewId = ROUTE_TO_VIEW[route] || 'inventory';

    document.querySelectorAll('.view-section').forEach((section) => {
        section.style.display = 'none';
    });

    const targetView = document.getElementById(`view-${viewId}`);
    if (targetView) {
        targetView.style.display = 'block';
    }

    updateNavigationState(route);

    if (route === 'inventory') {
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
        container.innerHTML = '<tr><td colspan="4" style="text-align:center;">Caricamento log in corso...</td></tr>';
        const logs = await fetchAuditLogs();
        
        console.log("DEBUG: Log ricevuti dalla funzione:", logs); // TEST 2
        
        if (!logs || logs.length === 0) {
            container.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nessun evento registrato.</td></tr>';
            return;
        }

        container.innerHTML = logs.map(log => `
            <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="padding: 10px; font-size: 0.85rem;">${new Date(log.data_modifica).toLocaleString()}</td>
                <td style="padding: 10px;">${log.operazione}</td>
                <td style="padding: 10px; font-size: 0.85rem;">${log.utente}</td>
                <td style="padding: 10px; font-size: 0.85rem;">Asset ID: ${log.asset_id || 'N/A'}</td>
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
        assetTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--text-low);">Sincronizzazione in corso...</td></tr>';
        const data = await fetchAssets();
        
        if (!data || data.length === 0) {
            assetTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--text-low);">Nessun asset censito.</td></tr>';
            return;
        }

        assetTableBody.innerHTML = data.map(a => {
            const id = a.id || a.Asset_ID;
            const nome = a.nome || a.Asset_Name || 'N/D';
            const versione = a.versione || a.Software_Version || 'N/D';
            const criticita = a.criticita || a.Criticity_Level || 'Bassa';
            const badgeClass = (criticita.toLowerCase() === 'critica' || criticita.toLowerCase() === 'alta') ? 'risk-high' : 'risk-none';

            return `
            <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="padding: 10px;"><strong>${id}</strong></td>
                <td style="padding: 10px; color: var(--text-high); font-weight: 600;">${nome}</td>
                <td style="padding: 10px; color: var(--text-muted);">${versione}</td>
                <td style="padding: 10px;"><span class="badge ${badgeClass}" style="padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 0.8rem;">${criticita}</span></td>
                <td style="padding: 10px; text-align:center;">
                    <button class="btn-edit" data-id="${id}" style="padding: 6px 12px; font-size:0.75rem; background:transparent; border: 1px solid var(--primary); color: var(--primary); border-radius: 4px; cursor: pointer;">Modifica</button>
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
        container.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--text-low);">Estrazione dati in corso...</td></tr>';
        const data = await fetchSupplyChain();
        if (!data || data.length === 0) {
            container.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nessuna dipendenza registrata.</td></tr>';
            return;
        }

        container.innerHTML = data.map(item => `
            <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="padding: 10px;">${item.Service_Name || 'N/D'}</td>
                <td style="padding: 10px;">${item.Service_Type || 'N/D'}</td>
                <td style="padding: 10px;"><strong>${item.Dependent_Asset || 'N/D'}</strong></td>
                <td style="padding: 10px;">${item.Vendor_Partner || 'N/D'}</td>
                <td style="padding: 10px; font-size: 0.8rem; color: var(--text-muted);">${item.Vendor_Contact || 'N/D'}</td>
            </tr>
        `).join('');
    } catch (err) {
        console.error("Errore rendering Supply Chain:", err);
        container.innerHTML = `<tr><td colspan="5" class="error-msg">Errore: ${err.message}</td></tr>`;
    }
}
