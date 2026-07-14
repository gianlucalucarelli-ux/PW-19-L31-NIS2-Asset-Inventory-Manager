// =========================================================================
// FILE: src/ui.js Manipolazione del DOM, routing visivo e gestione del tema.
// =========================================================================
import { fetchAssets } from './database.js';

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
    
    // Gestione stato attivo sulla Sidebar
    /* Nota: Commentato temporaneamente se usi bottoni di tipo generico per evitare errori di classe
    document.querySelectorAll('.menu-btn').forEach(btn => {
        btn.classList.remove('active');
        if(btn.textContent.toLowerCase().includes(viewId.replace('-', ' '))) {
            btn.classList.add('active');
        }
    });
    */

    if (viewId === 'inventory') {
        loadAndRenderTable();
        resetAssetForm(); // Pulisce sempre il form quando torni alla dashboard
    } else if (viewId === 'add-asset') {
        // Se c'è un ID nel campo nascosto stiamo modificando, altrimenti assicurati sia pulito
        if (!document.getElementById('asset-id').value) {
            resetAssetForm();
        }
    }
}

export async function loadAndRenderTable() {
    const assetTableBody = document.getElementById('asset-table-body');
    if (!assetTableBody) return;

    try {
        assetTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--text-low);">Sincronizzazione in corso...</td></tr>';
        
        const data = await fetchAssets();
        
        if (!data || data.length === 0) {
            assetTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--text-low);">Nessun asset censito. Importa un file Excel o creane uno manualmente.</td></tr>';
            return;
        }

        // Mapping compatibile sia con nomi colonna vecchi che nuovi
        assetTableBody.innerHTML = data.map(a => {
            const id = a.id || a.Asset_ID;
            const nome = a.nome || a.Asset_Name || 'N/D';
            const versione = a.versione || a.Software_Version || 'N/D';
            const criticita = a.criticita || a.Criticity_Level || 'Bassa';
            
            // Logica CSS per i badge di rischio
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

        // Collega i listener per l'edit dinamicamente sui nuovi bottoni
        document.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.getAttribute('data-id');
                const asset = data.find(item => (item.id || item.Asset_ID) == id);
                if (asset) {
                    caricaAssetNelForm(asset);
                }
            });
        });

    } catch (error) {
        console.error("Errore nel rendering:", error.message);
        assetTableBody.innerHTML = `<tr><td colspan="5" class="error-msg">Errore di comunicazione col DB: ${error.message}</td></tr>`;
    }
}

export function caricaAssetNelForm(asset) {
    // 1. Inserisce i dati nei campi input
    document.getElementById('asset-id').value = asset.id || asset.Asset_ID;
    document.getElementById('asset-nome').value = asset.nome || asset.Asset_Name || '';
    document.getElementById('asset-versione').value = asset.versione || asset.Software_Version || '';
    
    // Normalizzazione Criticità per la tendina Select
    const currCrit = asset.criticita || asset.Criticity_Level || 'Bassa';
    const selectElem = document.getElementById('asset-criticita');
    if(selectElem) selectElem.value = currCrit.charAt(0).toUpperCase() + currCrit.slice(1).toLowerCase();

    // 2. Modifica dinamicamente i testi della UI per indicare la modalità UPDATE
    const headerTitle = document.querySelector('#view-add-asset h2');
    const submitBtn = document.querySelector('#asset-form button[type="submit"]');
    
    if (headerTitle) headerTitle.textContent = "Modifica Configurazione Asset";
    if (submitBtn) submitBtn.textContent = "Aggiorna Dati";

    // 3. Sposta l'utente sulla vista del form
    switchView('add-asset');
}

export function resetAssetForm() {
    const form = document.getElementById('asset-form');
    if (form) {
        form.reset(); // Pulisce tutti i campi
        document.getElementById('asset-id').value = ''; // Svuota l'ID nascosto
        
        // Ripristina i testi originali per l'INSERT
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
    
    loadAndRenderTable();
}