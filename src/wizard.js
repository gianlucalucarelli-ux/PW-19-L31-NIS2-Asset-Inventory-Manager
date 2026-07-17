// src/wizard.js
import { fetchTassonomiaByPasso, salvaSelezioneIncidente, startIncidente, updateIncidente } from './incidentService.js';

let passoCorrente = 1;
let eventoId = null;

const container = document.getElementById('step-content');
const title = document.getElementById('step-title');

const stepsConfig = {
    2: { title: "Passo 2: Baseline Characterization (Impatto)", area: "BC", cat: "Impatto" },
    3: { title: "Passo 3: Baseline Characterization (Causa)", area: "BC", cat: "Causa" },
    4: { title: "Passo 4: Baseline Characterization (Severità)", area: "BC", cat: "Severità" },
    5: { title: "Passo 5: Tipo Minaccia", area: "TT", cat: null },
    6: { title: "Passo 6: Threat Actor", area: "TA", cat: null }
};

async function initWizard() {
    container.innerHTML = 'Avvio sessione incidente...';
    try {
        const nuovoIncidente = await startIncidente({ 
            inizio: new Date().toISOString(),
            severita: 'Media' 
        });
        eventoId = nuovoIncidente.id;
        console.log("Incidente inizializzato con ID:", eventoId);
        renderPasso(); 
    } catch (err) {
        console.error("Errore initWizard:", err);
        container.innerHTML = "Errore critico: verifica le policy RLS su Supabase.";
    }
}

async function renderPasso() {
    if (passoCorrente === 1) {
        title.innerText = "Step 1: Tipologia Soggetto";
        container.innerHTML = `
            <p>Indica la tipologia soggetto (NIS2):</p>
            <label class="checkbox-item"><input type="radio" name="tipologia" value="essenziale" checked> Soggetto Essenziale</label>
            <label class="checkbox-item"><input type="radio" name="tipologia" value="importante"> Soggetto Importante</label>
        `;
        return;
    }

    const cfg = stepsConfig[passoCorrente];
    if (!cfg) return;
    title.innerText = cfg.title;
    container.innerHTML = 'Caricamento dati...';
    try {
        const options = await fetchTassonomiaByPasso(cfg.area, cfg.cat);
        container.innerHTML = options.map(opt => `
            <label class="checkbox-item"><input type="checkbox" value="${opt.id}"> ${opt.nome_esteso}</label>
        `).join('');
    } catch (err) {
        container.innerHTML = "Errore nel caricamento.";
    }
}

document.getElementById('btn-avanti').addEventListener('click', async () => {
    if (!eventoId) {
        alert("Errore: Il wizard non è stato inizializzato correttamente.");
        return;
    }

    try {
        if (passoCorrente === 1) {
            const selectedRadio = document.querySelector('input[name="tipologia"]:checked');
            if (!selectedRadio) {
                alert("Seleziona una tipologia.");
                return;
            }
            await updateIncidente(eventoId, { tipologia: selectedRadio.value });
        } else {
            const selezionati = container.querySelectorAll('input:checked');
            if (selezionati.length === 0) {
                alert("Seleziona almeno un'opzione.");
                return;
            }
            for (let input of selezionati) {
                await salvaSelezioneIncidente(eventoId, input.value, passoCorrente);
            }
        }

        if (passoCorrente < 6) {
            passoCorrente++;
            renderPasso();
        } else {
            alert("Wizard completato!");
        }
    } catch (err) {
        console.error("Errore salvataggio:", err);
        alert("Errore salvataggio: " + err.message);
    }
});

document.getElementById('btn-indietro').addEventListener('click', () => {
    if (passoCorrente > 1) { passoCorrente--; renderPasso(); }
});

initWizard();