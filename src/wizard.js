// src/wizard.js
import { fetchTassonomiaByPasso, salvaSelezioneIncidente } from './incidentService.js';

let passoCorrente = 1;
let eventoId = 1; 

const container = document.getElementById('step-content');
const title = document.getElementById('step-title');

const stepsConfig = {
    1: { title: "Passo 1: Baseline Characterization (Impatto)", area: "BC", cat: "Impatto" },
    2: { title: "Passo 2: Baseline Characterization (Causa)", area: "BC", cat: "Causa" },
    3: { title: "Passo 3: Baseline Characterization (Severità)", area: "BC", cat: "Severità" },
    4: { title: "Passo 4: Tipo Minaccia", area: "TT", cat: null },
    5: { title: "Passo 5: Threat Actor", area: "TA", cat: null },
    6: { title: "Passo 6: Additional Context", area: "AC", cat: null }
};

async function renderPasso() {
    const cfg = stepsConfig[passoCorrente];
    if (!cfg) return;

    title.innerText = cfg.title;
    container.innerHTML = 'Caricamento dati...';

    try {
        const options = await fetchTassonomiaByPasso(cfg.area, cfg.cat);
        
        container.innerHTML = options.map(opt => `
            <label class="checkbox-item">
                <input type="checkbox" value="${opt.id}"> ${opt.nome_esteso}
            </label>
        `).join('');
    } catch (err) {
        container.innerHTML = "Errore nel caricamento dei dati.";
        console.error(err);
    }
}

document.getElementById('btn-avanti').addEventListener('click', async () => {
    const selezionati = container.querySelectorAll('input:checked');
    for (let input of selezionati) {
        await salvaSelezioneIncidente(eventoId, input.value, passoCorrente);
    }

    if (passoCorrente < 6) {
        passoCorrente++;
        renderPasso();
    } else {
        alert("Wizard completato!");
    }
});

// Aggiungi il tasto indietro
document.getElementById('btn-indietro').addEventListener('click', () => {
    if (passoCorrente > 1) {
        passoCorrente--;
        renderPasso();
    }
});

renderPasso();