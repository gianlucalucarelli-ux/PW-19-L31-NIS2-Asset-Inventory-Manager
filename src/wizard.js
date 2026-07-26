// ===============================================================================================================
// FILE: src/wizard.js
// DESCRIZIONE: Inizializzazione controllata e gestione progressiva del wizard di classificazione incidenti ACN.
// ===============================================================================================================

import {
    fetchTassonomiaByPasso,
    salvaSelezioneIncidente,
    startIncidente,
    updateIncidente,
    fetchReportIncidente,
    verificaAccessoIncidenti
} from './incidentService.js?build=20260726-d3';
import { navigateTo } from './router.js?build=20260726-d2';
import { nowDatabaseUtcTimestamp } from './dateTime.js?build=20260726-d3';

let passoCorrente = 1;
let eventoId = null;
let wizardAvviato = false;
let operazioneInCorso = false;

const container = document.getElementById('step-content');
const title = document.getElementById('step-title');
const btnAvanti = document.getElementById('btn-avanti');
const btnIndietro = document.getElementById('btn-indietro');

const stepsConfig = {
    2: { title: 'Passo 2: Baseline Characterization (Impatto)', area: 'BC', cat: 'Impatto' },
    3: { title: 'Passo 3: Baseline Characterization (Causa)', area: 'BC', cat: 'Causa' },
    4: { title: 'Passo 4: Baseline Characterization (Severità)', area: 'BC', cat: 'Severità' },
    5: { title: 'Passo 5: Tipo Minaccia', area: 'TT', cat: null },
    6: { title: 'Passo 6: Threat Actor', area: 'TA', cat: null }
};

/**
 * Converte gli errori tecnici in messaggi comprensibili per l'utente.
 */
function formattaErroreIncidente(error) {
    const message = String(error?.message || error || '').trim();
    const normalized = message.toLowerCase();

    if (normalized.includes('row-level security') || normalized.includes('permission denied') || normalized.includes('42501')) {
        return 'Operazione non autorizzata. Verifica la sessione e il livello di accesso, quindi riprova.';
    }

    if (normalized.includes('jwt') || normalized.includes('sessione') || normalized.includes('session')) {
        return 'La sessione non è più valida. Effettua nuovamente l’accesso.';
    }

    return message || 'Si è verificato un errore durante la gestione dell’incidente.';
}

/**
 * Imposta lo stato occupato dei comandi, evitando doppi clic e inserimenti duplicati.
 */
function setWizardBusy(isBusy) {
    operazioneInCorso = isBusy;

    if (btnAvanti) btnAvanti.disabled = isBusy;
    if (btnIndietro) btnIndietro.disabled = isBusy;

    const startButton = document.getElementById('btn-nuova-segnalazione');
    if (startButton) startButton.disabled = isBusy;
}

/**
 * Mostra o nasconde i comandi di navigazione del wizard.
 */
function setWizardNavigationVisible(isVisible) {
    if (btnAvanti) btnAvanti.classList.toggle('is-hidden', !isVisible);
    if (btnIndietro) btnIndietro.classList.toggle('is-hidden', !isVisible);
}

/**
 * Mostra la pagina iniziale senza creare alcun record nel database.
 */
function renderPaginaIniziale() {
    if (!container || !title) return;

    title.textContent = 'Gestione Incidenti';
    container.innerHTML = `
        <div class="wizard-start">
            <p>Avvia una nuova segnalazione guidata secondo la tassonomia ACN.</p>
            <p class="wizard-note">L’incidente sarà registrato nel database soltanto dopo la conferma del primo passo.</p>
            <button id="btn-nuova-segnalazione" type="button" class="btn-primary">Nuova segnalazione</button>
        </div>
    `;

    setWizardNavigationVisible(false);
}

/**
 * Prepara un nuovo wizard in memoria. Nessuna INSERT viene eseguita in questa fase.
 */
async function preparaNuovaSegnalazione() {
    if (operazioneInCorso) return;

    setWizardBusy(true);
    if (title) title.textContent = 'Nuova segnalazione';
    if (container) container.textContent = 'Verifica autorizzazioni e preparazione del primo passo…';
    setWizardNavigationVisible(false);

    try {
        await verificaAccessoIncidenti();
        passoCorrente = 1;
        eventoId = null;
        wizardAvviato = true;
        setWizardNavigationVisible(true);
        await renderPasso();
    } catch (error) {
        console.error('Errore nella preparazione della segnalazione:', error);
        title.textContent = 'Gestione Incidenti';
        container.textContent = formattaErroreIncidente(error);
        setWizardNavigationVisible(false);
    } finally {
        setWizardBusy(false);
    }
}

/**
 * Inizializza la vista soltanto quando l'utente apre la Gestione Incidenti.
 */
export async function initIncidentWizard() {
    if (!container || !title) return;

    container.textContent = 'Verifica della sessione in corso...';
    setWizardNavigationVisible(false);

    try {
        await verificaAccessoIncidenti();

        if (wizardAvviato) {
            setWizardNavigationVisible(true);
            await renderPasso();
        } else {
            renderPaginaIniziale();
        }
    } catch (error) {
        console.error('Errore di accesso alla Gestione Incidenti:', error);
        title.textContent = 'Gestione Incidenti';
        container.textContent = formattaErroreIncidente(error);
    }
}

/**
 * Azzera lo stato in memoria quando la sessione viene chiusa.
 */
export function resetIncidentWizardState() {
    passoCorrente = 1;
    eventoId = null;
    wizardAvviato = false;
    operazioneInCorso = false;

    if (container && title) {
        renderPaginaIniziale();
    }
}

/**
 * Costruisce il contenuto del passo corrente.
 */
async function renderPasso() {
    if (!container || !title) return;

    if (passoCorrente === 1) {
        title.textContent = 'Passo 1: Tipologia Soggetto';
        container.innerHTML = `
            <p class="wizard-instruction">Indica la tipologia di soggetto prevista dalla NIS2:</p>
            <label class="checkbox-item">
                <input type="radio" name="tipologia" value="essenziale" checked>
                Soggetto Essenziale
            </label>
            <label class="checkbox-item">
                <input type="radio" name="tipologia" value="importante">
                Soggetto Importante
            </label>
        `;

        if (btnIndietro) btnIndietro.disabled = false;
        return;
    }

    const cfg = stepsConfig[passoCorrente];
    if (!cfg) return;

    title.textContent = cfg.title;
    container.textContent = 'Caricamento dati...';

    try {
        const options = await fetchTassonomiaByPasso(cfg.area, cfg.cat);

        if (options.length === 0) {
            container.textContent = 'Nessuna opzione disponibile per questo passo.';
            return;
        }

        container.innerHTML = options.map((option) => `
            <label class="checkbox-item">
                <input type="checkbox" value="${option.id}">
                ${option.nome_esteso}
            </label>
        `).join('');
    } catch (error) {
        console.error('Errore nel caricamento della tassonomia:', error);
        container.textContent = formattaErroreIncidente(error);
    }
}

/**
 * Crea o aggiorna l'incidente dopo la conferma del primo passo.
 */
async function salvaPrimoPasso() {
    const selectedRadio = document.querySelector('input[name="tipologia"]:checked');

    if (!selectedRadio) {
        throw new Error('Seleziona una tipologia di soggetto.');
    }

    if (!eventoId) {
        const nuovoIncidente = await startIncidente({
            inizio: nowDatabaseUtcTimestamp(),
            severita: 'Media',
            tipologia: selectedRadio.value
        });

        eventoId = nuovoIncidente.id;
        return;
    }

    await updateIncidente(eventoId, { tipologia: selectedRadio.value });
}

/**
 * Salva tutte le opzioni selezionate nel passo corrente.
 */
async function salvaPassoTassonomico() {
    if (!eventoId) {
        throw new Error('La segnalazione non è stata inizializzata correttamente.');
    }

    const selezionati = [...container.querySelectorAll('input:checked')];

    if (selezionati.length === 0) {
        throw new Error('Seleziona almeno un’opzione.');
    }

    for (const input of selezionati) {
        await salvaSelezioneIncidente(eventoId, input.value, passoCorrente);
    }
}

/**
 * Genera il testo narrativo conclusivo del report.
 */
async function generaReportFinale() {
    const reportData = await fetchReportIncidente(eventoId);

    const formatData = (passo) => {
        const items = reportData.filter((item) => item.passo_wizard === passo);
        if (items.length === 0) return '[dato non inserito]';

        return items
            .map((item) => `${item.tassonomia_incidenti_acn.nome_esteso} ${item.tassonomia_incidenti_acn.codice_acn}`)
            .join(', ');
    };

    const testoReport = `L'incidente ha comportato ${formatData(2)}, causato da ${formatData(3)}. `
        + `La severità è stata valutata come ${formatData(4)}. `
        + `L'attacco è stato caratterizzato da minacce di tipo ${formatData(5)} `
        + `ad opera di attori classificabili come ${formatData(6)}.`;

    const reportOutput = document.getElementById('report-output');
    if (reportOutput) reportOutput.value = testoReport;

    await navigateTo('riepilogo', { force: true });
}

if (container) {
    container.addEventListener('click', (event) => {
        const startButton = event.target.closest('#btn-nuova-segnalazione');
        if (startButton) {
            preparaNuovaSegnalazione();
        }
    });
}

if (btnAvanti) {
    btnAvanti.addEventListener('click', async () => {
        if (!wizardAvviato || operazioneInCorso) return;

        setWizardBusy(true);

        try {
            await verificaAccessoIncidenti();

            if (passoCorrente === 1) {
                await salvaPrimoPasso();
            } else {
                await salvaPassoTassonomico();
            }

            if (passoCorrente < 6) {
                passoCorrente += 1;
                await renderPasso();
            } else {
                await generaReportFinale();
            }
        } catch (error) {
            console.error('Errore nel salvataggio del wizard:', error);
            window.alert(formattaErroreIncidente(error));
        } finally {
            setWizardBusy(false);
        }
    });
}

if (btnIndietro) {
    btnIndietro.addEventListener('click', async () => {
        if (!wizardAvviato || operazioneInCorso) return;

        if (passoCorrente === 1 && !eventoId) {
            wizardAvviato = false;
            renderPaginaIniziale();
            return;
        }

        if (passoCorrente > 1) {
            passoCorrente -= 1;
            await renderPasso();
        }
    });
}

const copyButton = document.getElementById('btn-copia');
if (copyButton) {
    copyButton.addEventListener('click', () => {
        const copyText = document.getElementById('report-output');
        if (!copyText) return;

        copyText.select();
        document.execCommand('copy');
        window.alert('Testo copiato negli appunti.');
    });
}

const restartButton = document.getElementById('btn-restart-incident');
if (restartButton) {
    restartButton.addEventListener('click', async () => {
        resetIncidentWizardState();
        await navigateTo('nuova-segnalazione', { force: true });
    });
}

// Il modulo registra soltanto gli eventi. Nessuna query o INSERT viene eseguita al caricamento della pagina.
document.addEventListener('incident:wizard:open', async () => {
    await initIncidentWizard();
});

document.addEventListener('incident:wizard:start', async () => {
    await preparaNuovaSegnalazione();
});

document.addEventListener('incident:wizard:reset', () => {
    resetIncidentWizardState();
});
