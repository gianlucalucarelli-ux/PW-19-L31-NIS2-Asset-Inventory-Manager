/**
 * CONFIGURAZIONE CONNESSIONE BACKEND
 * Nota: Credenziali aggiornate allineate all'istanza Supabase Pro
 */
const SUPABASE_URL = 'https://jacyruehgxjzxufzfoly.supabase.co';
// TODO: Sostituisci questa stringa con la tua vera chiave anonPublic (Settings -> API) che inizia con eyJhbGciOi
const SUPABASE_KEY = 'INSERISCI_QUI_LA_TUA_ANON_PUBLIC_KEY_REALE'; 
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * FUNZIONE PRINCIPALE: loadAssets
 * Recupera gli asset e include i servizi essenziali associati tramite tabella pivot
 */
async function loadAssets() {
    console.log("Tentativo di recupero dati in corso...");

    // Query relazionale basata sullo schema reale di Supabase
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

    if (error) {
        console.error("Errore durante il recupero dei dati:", error.message);
        document.getElementById('assetBody').innerHTML = `<tr><td colspan="5">Errore di rete: verificare configurazione RLS o credenziali API.</td></tr>`;
        return;
    }

    renderTable(data);
}

/**
 * FUNZIONE DI RENDERING: Trasforma l'array JSON in righe HTML coerenti con NIS2
 */
function renderTable(assets) {
    const tbody = document.getElementById('assetBody');
    tbody.innerHTML = '';

    assets.forEach(asset => {
        const row = document.createElement('tr');
        
        // Estrae i nomi dei servizi associati mappando l'array della relazione
        const relazioni = asset.relazione_asset_servizio || [];
        const serviziNomi = relazioni
            .map(r => r.servizio_essenziale?.nome_servizio)
            .filter(Boolean)
            .join(', ');

        const listaServizi = serviziNomi || 'Nessun servizio associato';
        const criticita = asset.classificazione_criticita || 'Bassa';
        
        // Assegnazione classe CSS in base alla criticità dell'asset
        const riskClass = criticita === 'Alta' ? 'risk-high' : 'risk-none';

        row.innerHTML = `
            <td><strong>${asset.nome}</strong></td>
            <td>${asset.versione || '---'}</td>
            <td><span class="risk-badge ${riskClass}">${criticita}</span></td>
            <td>${listaServizi}</td>
        `;
        
        tbody.appendChild(row);
    });
}

// Avvio dell'applicazione al caricamento della pagina
document.addEventListener('DOMContentLoaded', loadAssets);
