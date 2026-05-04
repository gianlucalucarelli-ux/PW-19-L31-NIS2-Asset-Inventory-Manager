/**
 * CONFIGURAZIONE CONNESSIONE BACKEND
 * Nota: In una vera pipeline di CI/CD queste chiavi sarebbero variabili d'ambiente.
 */
const SUPABASE_URL = 'https://jacyruehgxjzxufzfoly.supabase.co';
const SUPABASE_KEY = 'sb_publishable_s5aXWNZZ7ZuHYKVo_XpdqA_lJV8wHUw';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * FUNZIONE PRINCIPALE: loadAssets
 * Recupera i dati tramite una JOIN complessa tra Asset e Vulnerabilità
 */
async function loadAssets() {
    console.log("Tentativo di recupero dati in corso...");

    // Eseguiamo una query "relazionale": chiediamo gli asset e i dettagli 
    // della vulnerabilità collegata tramite Foreign Key
    const { data, error } = await _supabase
        .from('asset')
        .select(`
            nome,
            versione,
            classificazione_criticita,
            vulnerabilita (
                codice_bollettino,
                livello_severita
            )
        `);

    if (error) {
        console.error("Errore durante il recupero dei dati:", error.message);
        document.getElementById('assetBody').innerHTML = `<tr><td colspan="5">Errore di rete: verificare configurazione CORS.</td></tr>`;
        return;
    }

    renderTable(data);
}

/**
 * FUNZIONE DI RENDERING: Trasforma l'array di oggetti JSON in righe HTML
 */
function renderTable(assets) {
    const tbody = document.getElementById('assetBody');
    
    // Svuotiamo il caricamento
    tbody.innerHTML = '';

    assets.forEach(asset => {
        const row = document.createElement('tr');
        
        // Logica per gestire la mancanza di vulnerabilità (Asset sicuro)
        const bollettino = asset.vulnerabilita?.codice_bollettino || 'N/D';
        const severita = asset.vulnerabilita?.livello_severita || 'Nessuna';
        const riskClass = severita === 'Alta' ? 'risk-high' : 'risk-none';

        row.innerHTML = `
            <td><strong>${asset.nome}</strong></td>
            <td>${asset.versione || '---'}</td>
            <td>${asset.classificazione_criticita}</td>
            <td><code>${bollettino}</code></td>
            <td><span class="risk-badge ${riskClass}">${severita}</span></td>
        `;
        
        tbody.appendChild(row);
    });
}

// Avvio dell'applicazione al caricamento della pagina
document.addEventListener('DOMContentLoaded', loadAssets);
