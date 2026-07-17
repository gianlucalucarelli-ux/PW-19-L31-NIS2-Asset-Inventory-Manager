// src/wizard.js
import { fetchTassonomiaByPasso, salvaSelezioneIncidente } from './incidentService.js';

let passoCorrente = 1;
let eventoId = 1; 

const container = document.getElementById('step-content');
const title = document.getElementById('step-title');

// Configurazione solo per i passi dinamici (dal 2 al 6)
const stepsConfig = {
    2: { title: "Passo 2: Baseline Characterization (Impatto)", area: "BC", cat: "Impatto" },
    3: { title: "Passo 3: Baseline Characterization (Causa)", area: "BC", cat: "Causa" },
    4: { title: "Passo 4: Baseline Characterization (Severità)", area: "BC", cat: "Severità" },
    5: { title: "Passo 5: Tipo Minaccia", area: "TT", cat: null },
    6: { title: "Passo 6: Threat Actor", area: "TA", cat: null }
};

async function renderPasso() {
    container.innerHTML = 'Caricamento...';

    // 1. GESTIONE PASSO 1 (STATICO)
    if (passoCorrente === 1) {
        title.innerText = "Step 1: Tipologia Soggetto";
        container.innerHTML = `
            <p style="margin-bottom: 15px;">Indica se il tuo ente è un soggetto essenziale o importante secondo la classificazione NIS2.</p>
            <label class="checkbox-item" style="display:block; margin-bottom:10px;">
                <input type="radio" name="tipologia" value="essenziale" checked> 
                <strong>Soggetto Essenziale</strong><br>
                <span style="font-size:0.8rem; color:var(--text-low);">Notifiche obbligatorie: IS-1, IS-2, IS-3, IS-4</span>
            </label>
            <label class="checkbox-item" style="display:block;">
                <input type="radio" name="tipologia" value="importante"> 
                <strong>Soggetto Importante</strong><br>
                <span style="font-size:0.8rem; color:var(--text-low);">Notifiche obbligatorie: IS-1, IS-2, IS-3</span>
            </label>
        `;
        return;
    }

    // 2. GESTIONE PASSI DINAMICI (2-6)
    const cfg = stepsConfig[passoCorrente];
    if (!cfg) return;

    title.innerText = cfg.title;

    try {
        const options = await fetchTassonomiaByPasso(cfg.area, cfg.cat);
        console.log(`Dati ricevuti per passo ${passoCorrente}:`, options);
        
        container.innerHTML = options.map(opt => `
            <label class="checkbox-item">
                <input type="checkbox" value="${opt.id}"> ${opt.nome_esteso}
            </label>
        `).join('');
    } catch (err) {
        container.innerHTML = "Errore nel caricamento dei dati.";
        console.error("Errore renderPasso:", err);
    }
}

// LOGICA AVANTI
document.getElementById('btn-avanti').addEventListener('click', async () => {
    console.log("Cliccato Avanti. Passo attuale:", passoCorrente);

    try {
        // Se siamo al passo 1, non salviamo su DB (o salviamo in una tabella dedicata se vuoi)
        if (passoCorrente === 1) {
            console.log("Passo 1 superato.");
        } else {
            // Salvataggio passi 2-6
            const selezionati = container.querySelectorAll('input:checked');
            if (selezionati.length === 0) {
                alert("Seleziona almeno un'opzione per proseguire.");
                return;
            }
            
            for (let input of selezionati) {
                await salvaSelezioneIncidente(eventoId, input.value, passoCorrente);
                console.log("Salvato ID:", input.value);
            }
        }

        // Passaggio passo
        if (passoCorrente < 6) {
            passoCorrente++;
            renderPasso();
        } else {
            alert("Wizard completato!");
        }
    } catch (err) {
        console.error("Errore salvataggio:", err);
        alert("Errore durante il salvataggio. Controlla la console.");
    }
});

// LOGICA INDIETRO
document.getElementById('btn-indietro').addEventListener('click', () => {
    if (passoCorrente > 1) {
        passoCorrente--;
        renderPasso();
    }
});

// Avvio
renderPasso();