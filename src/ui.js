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
    document.querySelectorAll('.menu-btn').forEach(btn => {
        btn.classList.remove('active');
        if(btn.textContent.toLowerCase().includes(viewId.replace('-', ' '))) {
            btn.classList.add('active');
        }
    });

    if (viewId === 'inventory') {
        caricaEIniettaAsset();
    }
}

export async function caricaEIniettaAsset() {
    const assetTableBody = document.getElementById('asset-table-body');
    if (!assetTableBody) return;

    try {
        const data = await fetchAssets();
        assetTableBody.innerHTML = data.map(a => `
            <tr>
                <td><strong>${a.Asset_ID}</strong></td>
                <td>${a.Asset_Name} <br><small style="color:var(--text-low);">${a.Software_Version}</small></td>
                <td>${a.ACN_Taxonomy_Code} <br><small style="color:var(--text-low);">${a.Asset_Category}</small></td>
                <td><span class="risk-badge ${a.Criticity_Level === 'Critica' ? 'risk-high' : 'risk-none'}">${a.Criticity_Level}</span></td>
                <td><small>${a.Technical_Owner}</small></td>
                <td>
                    <button class="btn-logout" style="padding: 4px 8px; font-size:0.75rem; background:#475569;" onclick="alert('Funzione di modifica asset da implementare nel prossimo step!')">Modifica</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error("Errore nel rendering:", error.message);
        assetTableBody.innerHTML = `<tr><td colspan="6" class="error-msg">Errore RLS o Vista: ${error.message}</td></tr>`;
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
    
    caricaEIniettaAsset();
}