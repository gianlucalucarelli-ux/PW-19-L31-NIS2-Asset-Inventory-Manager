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
        // Campi obbligatori per il DB (inizio e severita)
        const nuovoIncidente = await startIncidente({ 
            inizio: new Date().toISOString(),
            severita: 'Media' 
        });
        eventoId = nuovoIncidente.id;
        renderPasso(); 
    } catch (err) {
        console.error("Errore initWizard:", err);
        container.innerHTML = "Errore critico: verifica la tabella evento_servizio.";
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
    try {
        // Logica specifica passo 1: aggiorna il record creato
        if (passoCorrente === 1) {
            const val = document.querySelector('input[name="tipologia"]:checked').value;
            await updateIncidente(eventoId, { tipologia: val });
        } else {
            // Salvataggio passi 2-6
            const selezionati = container.querySelectorAll('input:checked');
            if (selezionati.length === 0) return alert("Seleziona almeno un'opzione.");
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
        alert("Errore salvataggio: " + err.message);
    }
});

document.getElementById('btn-indietro').addEventListener('click', () => {
    if (passoCorrente > 1) { passoCorrente--; renderPasso(); }
});

initWizard();