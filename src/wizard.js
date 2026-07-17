// src/wizard.js
import { supabase } from './supabase.js';
import { fetchTassonomiaByPasso, salvaSelezioneIncidente, startIncidente, updateIncidente, fetchReportIncidente } from './incidentService.js';

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

// Funzione principale di inizializzazione con attesa di sicurezza
async function initWizard() {
    container.innerHTML = 'Attesa autorizzazione di sicurezza...';
    
    try {
        // 1. Controllo immediato: vediamo se la sessione c'è già
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (session) {
            // Utente già loggato, partiamo subito
            await avviaWizard();
        } else {
            // 2. Se non c'è, restiamo in ascolto. Appena il token arriva, partiamo.
            const { data: authListener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
                if (newSession) {
                    authListener.subscription.unsubscribe(); // Stacchiamo l'ascoltatore per evitare duplicati
                    await avviaWizard();
                }
            });
        }
    } catch (err) {
        console.error("Errore verifica sessione:", err);
        container.innerHTML = "Errore di connessione al sistema di autenticazione.";
    }
}

// Funzione helper operativa per creare fisicamente l'incidente
async function avviaWizard() {
    container.innerHTML = 'Avvio sessione incidente...';
    try {
        const nuovoIncidente = await startIncidente({ 
            inizio: new Date().toISOString(),
            severita: 'Media' 
        });
        
        eventoId = nuovoIncidente.id;
        console.log("Incidente inizializzato in sicurezza con ID:", eventoId);
        renderPasso(); 
    } catch (err) {
        console.error("Errore avviaWizard:", err);
        container.innerHTML = "Errore: impossibile avviare l'incidente. Verifica le policy RLS.";
    }
}

async function renderPasso() {
    if (passoCorrente === 1) {
        title.innerText = "Step 1: Tipologia Soggetto";
        container.innerHTML = `
            <p style="margin-bottom:15px;">Indica la tipologia soggetto (NIS2):</p>
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
        container.innerHTML = "Errore nel caricamento dei dati.";
    }
}

async function generaReportFinale() {
    try {
        const reportData = await fetchReportIncidente(eventoId);
        
        // Funzione helper per mappare Nome Esteso + Codice ACN (Es. "azioni malevole intenzionali BC:RO_MA")
        const formatData = (passo) => {
            const items = reportData.filter(d => d.passo_wizard === passo);
            if (items.length === 0) return "[dato non inserito]";
            return items.map(d => `${d.tassonomia_incidenti_acn.nome_esteso} ${d.tassonomia_incidenti_acn.codice_acn}`).join(', ');
        };

        const impatti = formatData(2);
        const cause = formatData(3);
        const severita = formatData(4);
        const minacce = formatData(5);
        const attori = formatData(6);

        // Generazione del testo narrativo
        const testoReport = `L'incidente ha comportato ${impatti}, causato da ${cause}. La severità è stata valutata come ${severita}. L'attacco è stato caratterizzato da minacce di tipo ${minacce} ad opera di attori classificabili come ${attori}.`;

        // Passaggio visuale
        document.getElementById('view-incidenti').style.display = 'none';
        document.getElementById('view-riepilogo').style.display = 'block';
        document.getElementById('report-output').value = testoReport;

    } catch (err) {
        console.error("Errore generazione report:", err);
        alert("Impossibile generare il report narrativo.");
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
            // Generazione del Report Finale
            await generaReportFinale();
        }
    } catch (err) {
        console.error("Errore salvataggio:", err);
        alert("Errore salvataggio: " + err.message);
    }
});

// Listener globale per copia negli appunti
document.getElementById('btn-copia').addEventListener('click', () => {
    const copyText = document.getElementById("report-output");
    copyText.select();
    document.execCommand("copy");
    alert("Testo copiato negli appunti!");
});

document.getElementById('btn-indietro').addEventListener('click', () => {
    if (passoCorrente > 1) { passoCorrente--; renderPasso(); }
});

// Avvio
initWizard();