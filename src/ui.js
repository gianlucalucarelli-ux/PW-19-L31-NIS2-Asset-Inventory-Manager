// =========================================================================
// FILE: src/ui.js Manipolazione del DOM, routing visivo e gestione del tema.
// =========================================================================
import { fetchAssets, fetchSupplyChain, fetchAuditLogs } from './database.js';

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

export function switchView(viewId) {
    // Nascondi tutte le sezioni
    document.querySelectorAll('.view-section').forEach(section => {
        section.style.display = 'none';
    });
    
    // Mostra la sezione selezionata
    const targetView = document.getElementById('view-' + viewId);
    if (targetView) targetView.style.display = 'block';

    // Gestione logiche specifiche per vista
    if (viewId === 'inventory') {
        loadAndRenderTable();
        resetAssetForm();
    } else if (viewId === 'add-asset') {
        if (!document.getElementById('asset-id').value) {
            resetAssetForm();
        }
    } else if (viewId === 'supply-chain') {
        loadAndRenderSupplyChain();
    } else if (viewId === 'audit-log') {
        renderAuditLog();
    } else if (viewId === 'incidenti') {
        initIncidentWizard();
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

function initIncidentWizard() {
    const container = document.getElementById('view-incidenti');
    if (!container) return;
    console.log("Wizard Incidenti inizializzato e pronto.");
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

    switchView('add-asset');
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

export function mostraDashboardInterfaccia() {
    const authContainer = document.getElementById('auth-container');
    const dashboardContainer = document.getElementById('dashboard-container');
    const navMenuLinks = document.getElementById('nav-menu-links');
    const logoutBtn = document.getElementById('logout-btn');

    if (authContainer) authContainer.style.display = 'none';
    if (dashboardContainer) dashboardContainer.style.display = 'block';
    if (navMenuLinks) navMenuLinks.style.display = 'flex';
    if (logoutBtn) logoutBtn.style.display = 'block';
    
    // Aggiorna l'utente nell'header dopo il login
    updateHeaderUser(); 
    
    loadAndRenderTable();
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
// --- NUOVA FUNZIONE PER VISUALIZZARE L'UTENTE LOGGATO ---
export async function updateHeaderUser() {
    try {
        // Assumendo che 'supabase' sia disponibile globalmente o importato nel tuo main.js
        const { data: { user } } = await supabase.auth.getUser();
        const userDisplay = document.getElementById('user-display');
        
        if (userDisplay) {
            if (user) {
                userDisplay.innerText = `👤 ${user.email}`;
            } else {
                userDisplay.innerText = "Nessun utente loggato";
            }
        }
    } catch (err) {
        console.error("Errore nel recupero utente:", err);
    }
}