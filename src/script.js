/**
 * CONFIGURAZIONE CONNESSIONE BACKEND
 */
const SUPABASE_URL = 'https://jacyruehgxjzxufzfoly.supabase.co';
// TODO: Ricorda di inserire qui la tua vera chiave anonPublic (Settings -> API) che inizia con eyJhbGciOi
const SUPABASE_KEY = 'https://jacyruehgxjzxufzfoly.supabase.co/rest/v1/'; 
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * RECUPERO DATI DAL DB PRO
 */
async function loadAssets() {
    console.log("Tentativo di recupero dati in corso...");

    const { data, error } = await _supabase
        .from('asset')
        .select(`
            id,
            nome,
            versione,
            classificazione_criticita,
            relazione_asset_servizio (
                servizio_essenziale (
                    nome_servizio
                )
            )
        `);

    const tbody = document.getElementById('asset-table-body');
    const noDataMsg = document.getElementById('no-data');

    if (error) {
        console.error("Errore durante il recupero dei dati:", error.message);
        tbody.innerHTML = `<tr><td colspan="5" style="color: #ef4444; text-align: center;"><strong>Errore di Sicurezza (RLS):</strong> Accesso non autorizzato.</td></tr>`;
        noDataMsg.style.display = 'block';
        return;
    }

    renderTable(data);
}

/**
 * RENDERING DELLE RIGHE HTML
 */
function renderTable(assets) {
    const tbody = document.getElementById('asset-table-body');
    const noDataMsg = document.getElementById('no-data');
    tbody.innerHTML = '';

    if (!assets || assets.length === 0) {
        noDataMsg.style.display = 'block';
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #94a3b8;">Nessun asset disponibile.</td></tr>`;
        return;
    }

    assets.forEach(asset => {
        const row = document.createElement('tr');
        
        const relazioni = asset.relazione_asset_servizio || [];
        const serviziNomi = relazioni
            .map(r => r.servizio_essenziale?.nome_servizio)
            .filter(Boolean)
            .join(', ');

        const listaServizi = serviziNomi || '<span style="color: #94a3b8;">Nessun servizio</span>';
        const criticita = asset.classificazione_criticita || 'Bassa';
        
        const riskClass = (criticita === 'Alta' || criticita === 'Critica') ? 'risk-high' : 'risk-none';

        row.innerHTML = `
            <td><span style="color: #94a3b8;">#${asset.id}</span></td>
            <td><strong>${asset.nome}</strong></td>
            <td><code>${asset.versione || '---'}</code></td>
            <td><span class="risk-badge ${riskClass}">${criticita}</span></td>
            <td>${listaServizi}</td>
        `;
        
        tbody.appendChild(row);
    });
}

// Inizializzazione al caricamento del DOM
document.addEventListener('DOMContentLoaded', loadAssets);
/**
 * GESTIONE TEMA DINAMICO (DARK / LIGHT MODE)
 */
const themeToggle = document.getElementById('theme-toggle');
themeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
});

/**
 * GESTIONE MENU DI NAVIGAZIONE INTERNO
 */
const links = document.querySelectorAll('.nav-link');
links.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        links.forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        const target = link.getAttribute('href');
        if (target === '#dashboard-section') {
            document.getElementById('dashboard-container').style.display = 'block';
            document.getElementById('info-container').style.display = 'none';
        } else if (target === '#info-section') {
            document.getElementById('dashboard-container').style.display = 'none';
            document.getElementById('info-container').style.display = 'block';
        }
    });
});

/**
 * MODIFICA NELLE FUNZIONI DI MOSTRA DASHBOARD ESISTENTI
 * Assicurati che quando l'utente si autentica con successo, venga mostrato il menu:
 */
function showDashboard() {
    document.getElementById('auth-container').style.display = 'none';
    document.getElementById('nav-menu-links').style.display = 'flex'; // Mostra il menu
    document.getElementById('logout-btn').style.display = 'block';      // Mostra il logout
    document.getElementById('dashboard-container').style.display = 'block';
    loadAssets();
}
