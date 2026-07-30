// ===============================================================================================================
// FILE: src/assessmentManagement.js
// DESCRIZIONE: Interfaccia Profili Target e Attuale secondo la metodologia di assessment FNCSDP.
// ===============================================================================================================

import {
    fetchAssessmentReferences,
    fetchTargetProfiles,
    fetchTargetControls,
    createTargetProfile,
    updateTargetControl,
    approveTargetProfile,
    fetchAssessments,
    createAssessment,
    fetchAssessmentEvaluation,
    updateAssessmentMeasure,
    completeAssessment
} from './assessmentService.js?build=20260730-f6';
import { exportWorkbookToExcel } from './entitySpreadsheet.js?build=20260730-f6';
import { formatRomeDateTime } from './dateTime.js?build=20260726-d3';

let initializedRoot = null;
let references = { organizzazioni: [], responsabili: [] };
let targets = [];
let controls = [];
let assessments = [];
let evaluation = [];
let selectedTargetId = null;
let selectedAssessmentId = null;
let lastExportedAssessmentId = null;

const FNCSDP_CONTROLS = [
    { code: 'ID.AM-1', label: 'Sistemi e apparati fisici' },
    { code: 'ID.AM-2', label: 'Piattaforme e applicazioni software' },
    { code: 'ID.AM-3', label: 'Flussi di dati e comunicazioni' },
    { code: 'ID.AM-4', label: 'Sistemi informativi esterni' },
    { code: 'ID.AM-5', label: 'Classificazione e prioritizzazione delle risorse' },
    { code: 'ID.AM-6', label: 'Ruoli e responsabilità cybersecurity' }
];

function escapeHtml(value) {
    const element = document.createElement('div');
    element.textContent = String(value ?? '');
    return element.innerHTML;
}

function nullableDisplay(value, fallback = 'N/D') {
    const normalized = String(value ?? '').trim();
    return normalized || fallback;
}

function formatError(error) {
    const code = String(error?.code || '');
    const message = String(error?.message || '').trim();
    if (code === '23505') return 'Codice già utilizzato nel contesto selezionato.';
    if (code === '23503') return 'Uno dei riferimenti selezionati non è più disponibile.';
    if (code === '23514') return 'Uno dei valori non rispetta i vincoli previsti dal database.';
    if (code === '42501' || /row-level security|permission denied/i.test(message)) {
        return 'La sessione non dispone dell’autorizzazione necessaria.';
    }
    return message || 'Errore operativo non specificato.';
}

function setStatus(message = '', error = false) {
    const element = document.getElementById('assessment-status');
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('error-msg', error);
}

function setBusy(button, busy, busyLabel = 'Operazione in corso…') {
    if (!button) return;
    if (!button.dataset.defaultLabel) button.dataset.defaultLabel = button.textContent;
    button.disabled = Boolean(busy);
    button.textContent = busy ? busyLabel : button.dataset.defaultLabel;
}

function coverageLabel(value) {
    if (value === null || value === undefined || value === '') return 'Non misurata';
    const number = Number(value);
    const labels = new Map([
        [0, '0 · Nullo'],
        [0.2, '0,2 · Insufficiente'],
        [0.4, '0,4 · Iniziale'],
        [0.6, '0,6 · Incompleto'],
        [0.8, '0,8 · Avanzato'],
        [1, '1 · Completo']
    ]);
    return labels.get(number) || String(value);
}

function maturityLabel(value) {
    if (value === null || value === undefined || value === '') return 'N/A';
    const labels = {
        1: '1 · Iniziale',
        2: '2 · Ripetibile',
        3: '3 · Definito',
        4: '4 · Gestito',
        5: '5 · Ottimizzato'
    };
    return labels[Number(value)] || String(value);
}

function percentage(value, fallback = '—') {
    if (value === null || value === undefined || value === '') return fallback;
    const normalized = Number(value);
    if (!Number.isFinite(normalized)) return fallback;
    return `${Math.round(normalized * 100)}%`;
}

function nis2ClassificationLabel(value) {
    const normalized = String(value ?? '').trim().toUpperCase();
    const labels = {
        ESSENZIALE: 'Soggetto essenziale',
        IMPORTANTE: 'Soggetto importante',
        DA_CLASSIFICARE: 'Classificazione da completare'
    };
    return labels[normalized] || 'Classificazione NIS2 non indicata';
}

function organizationReference(organizationId) {
    return references.organizzazioni.find((item) => Number(item.id) === Number(organizationId)) || null;
}

function selectedTarget() {
    return targets.find((item) => Number(item.profilo_target_id) === Number(selectedTargetId)) || null;
}

function selectedAssessment() {
    return assessments.find((item) => Number(item.assessment_id) === Number(selectedAssessmentId)) || null;
}

function assessmentProgress(assessment = selectedAssessment()) {
    const value = Number(assessment?.avanzamento ?? 0);
    return Number.isFinite(value) ? value : 0;
}

function groupedMeasures() {
    return groupMeasures(evaluation);
}

function isMeasureComplete(measure) {
    const measured = measure?.copertura_attuale !== null && measure?.copertura_attuale !== undefined;
    return measured && (Number(measure.copertura_attuale) === 0 || measure.livello_maturita !== null);
}

function nextIncompleteMeasure(afterMeasureId = null) {
    const measures = groupedMeasures();
    if (measures.length === 0) return null;

    const incomplete = measures.filter((measure) => !isMeasureComplete(measure));
    if (incomplete.length === 0) return null;
    if (!afterMeasureId) return incomplete[0];

    const currentIndex = measures.findIndex((measure) => Number(measure.misura_id) === Number(afterMeasureId));
    const following = measures.slice(currentIndex + 1).find((measure) => !isMeasureComplete(measure));
    return following || incomplete[0];
}

function scrollToPanel(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function workflowState() {
    const target = selectedTarget();
    const assessment = selectedAssessment();
    const approved = target?.stato === 'APPROVATO';
    const completed = assessment?.stato === 'COMPLETATO';
    const progress = assessmentProgress(assessment);

    if (!target) {
        return { step: 1, action: 'new-target', label: 'Crea Profilo Target', text: 'Inizia scegliendo il soggetto NIS2 e confermando il perimetro.' };
    }
    if (!approved) {
        return { step: 2, action: 'save-approve', label: 'Salva e approva il Target', text: 'Controlla i sei requisiti ID.AM. La copertura Target è già impostata al 100%.' };
    }
    if (!assessment) {
        return { step: 4, action: 'new-assessment', label: 'Crea il Profilo Attuale', text: 'Il Target è approvato. Avvia ora la misura della situazione reale.' };
    }
    if (!completed && progress < 1) {
        const remaining = groupedMeasures().filter((measure) => !isMeasureComplete(measure)).length;
        return { step: 5, action: 'next-measure', label: 'Compila il prossimo controllo', text: `Restano ${remaining} controlli da misurare. Il sistema apre automaticamente il primo incompleto.` };
    }
    if (!completed) {
        return { step: 6, action: 'complete-assessment', label: 'Completa e calcola i risultati', text: 'Tutti i controlli sono compilati. Consolida il Profilo Attuale e rendi definitive le metriche.' };
    }
    if (Number(lastExportedAssessmentId) === Number(assessment.assessment_id)) {
        return { step: 8, action: 'export', label: 'Esporta di nuovo XLSX', text: 'Percorso completato: Target, Profilo Attuale, risultati ed esportazione sono disponibili.' };
    }
    return { step: 7, action: 'export', label: 'Visualizza risultati ed esporta XLSX', text: 'Assessment completato: controlla score e gap, quindi genera il report definitivo.' };
}

function renderWorkflow() {
    const state = workflowState();
    document.querySelectorAll('[data-assessment-workflow-step]').forEach((element) => {
        const step = Number(element.dataset.assessmentWorkflowStep);
        element.classList.toggle('is-active', step === state.step);
        element.classList.toggle('is-done', step < state.step || (state.step === 8 && step <= 7));
        element.setAttribute('aria-current', step === state.step ? 'step' : 'false');
    });

    const text = document.getElementById('assessment-next-action-text');
    const button = document.getElementById('assessment-next-action');
    if (text) text.textContent = state.text;
    if (button) {
        button.dataset.action = state.action;
        button.textContent = state.label;
    }
}

function readTargetFormPayload() {
    const organizationSelect = document.getElementById('assessment-target-organization');
    const selectedOption = organizationSelect?.options?.[organizationSelect.selectedIndex] || null;
    return {
        organizzazione_id: organizationSelect?.value,
        organizzazione_nome: selectedOption?.dataset?.organizationName || selectedOption?.textContent?.trim() || 'N/D',
        organizzazione_classificazione: selectedOption?.dataset?.classification || '',
        codice: document.getElementById('assessment-target-code')?.value?.trim(),
        nome: document.getElementById('assessment-target-name')?.value?.trim(),
        perimetro: document.getElementById('assessment-target-perimeter')?.value?.trim(),
        descrizione: document.getElementById('assessment-target-notes')?.value?.trim()
    };
}

function resetTargetConfirmation() {
    const fields = document.getElementById('assessment-target-fields');
    const confirmation = document.getElementById('assessment-target-confirmation');
    const backButton = document.getElementById('assessment-target-back');
    const submitButton = document.getElementById('assessment-target-submit');

    fields?.classList.remove('is-hidden');
    confirmation?.classList.add('is-hidden');
    backButton?.classList.add('is-hidden');
    if (submitButton) {
        submitButton.dataset.confirmation = 'false';
        submitButton.textContent = 'Verifica dati';
    }
}

function showTargetConfirmation(payload) {
    const values = {
        'assessment-confirm-organization': payload.organizzazione_nome,
        'assessment-confirm-classification': nis2ClassificationLabel(payload.organizzazione_classificazione),
        'assessment-confirm-code': payload.codice,
        'assessment-confirm-name': payload.nome,
        'assessment-confirm-perimeter': payload.perimetro,
        'assessment-confirm-description': payload.descrizione || 'Nessuna descrizione aggiuntiva'
    };

    Object.entries(values).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = nullableDisplay(value);
    });

    document.getElementById('assessment-target-fields')?.classList.add('is-hidden');
    document.getElementById('assessment-target-confirmation')?.classList.remove('is-hidden');
    document.getElementById('assessment-target-back')?.classList.remove('is-hidden');

    const submitButton = document.getElementById('assessment-target-submit');
    if (submitButton) {
        submitButton.dataset.confirmation = 'true';
        submitButton.textContent = 'Conferma e crea';
    }
}

function groupControls(rows = []) {
    const grouped = new Map();
    rows.forEach((row) => {
        const id = Number(row.controllo_target_id);
        if (!grouped.has(id)) {
            grouped.set(id, {
                ...row,
                subcategories: []
            });
        }
        grouped.get(id).subcategories.push({
            codice: row.subcategory_codice,
            descrizione: row.subcategory_descrizione,
            peso: Number(row.peso)
        });
    });
    return [...grouped.values()].sort((a, b) => Number(a.ordine) - Number(b.ordine));
}

function groupMeasures(rows = []) {
    const grouped = new Map();
    rows.forEach((row) => {
        const key = Number(row.misura_id || row.controllo_target_id);
        if (!grouped.has(key)) {
            grouped.set(key, {
                ...row,
                subcategories: []
            });
        }
        grouped.get(key).subcategories.push({
            codice: row.subcategory_codice,
            descrizione: row.subcategory_descrizione,
            peso: Number(row.peso)
        });
    });
    return [...grouped.values()].sort((a, b) => Number(a.ordine) - Number(b.ordine));
}

function ensureMarkup() {
    const container = document.getElementById('view-assessment-fncsdp');
    if (!container || container.dataset.rendered === 'true') return;

    container.dataset.rendered = 'true';
    container.innerHTML = `
        <div class="assessment-header">
            <div>
                <p class="eyebrow">CYBERSECURITY ASSESSMENT</p>
                <h2>Profili Target e Attuale FNCSDP</h2>
                <p class="section-intro">
                    Procedura guidata: definisci il Target, misura i sei controlli Asset Management e ottieni score, gap ed esportazione XLSX.
                </p>
            </div>
            <div class="assessment-method-badge" aria-label="Fasi della metodologia">
                <span>Contestualizzazione</span>
                <span>Misura</span>
                <span>Valutazione</span>
            </div>
        </div>

        <nav class="assessment-workflow" aria-label="Percorso guidato Assessment FNCSDP">
            <ol>
                <li data-assessment-workflow-step="1"><span>1</span><strong>Crea Profilo Target</strong></li>
                <li data-assessment-workflow-step="2"><span>2</span><strong>Controlla/modifica i 6 controlli</strong></li>
                <li data-assessment-workflow-step="3"><span>3</span><strong>Approva il Target</strong></li>
                <li data-assessment-workflow-step="4"><span>4</span><strong>Crea assessment</strong></li>
                <li data-assessment-workflow-step="5"><span>5</span><strong>Compila il Profilo Attuale</strong></li>
                <li data-assessment-workflow-step="6"><span>6</span><strong>Completa assessment</strong></li>
                <li data-assessment-workflow-step="7"><span>7</span><strong>Visualizza score e gap</strong></li>
                <li data-assessment-workflow-step="8"><span>8</span><strong>Esporta XLSX</strong></li>
            </ol>
            <div class="assessment-next-action">
                <div>
                    <span>Prossima azione consigliata</span>
                    <strong id="assessment-next-action-text">Crea il primo Profilo Target.</strong>
                </div>
                <button id="assessment-next-action" type="button" class="btn-primary" data-action="new-target">Crea Profilo Target</button>
            </div>
        </nav>

        <div id="assessment-status" class="view-status" role="status" aria-live="polite"></div>

        <div class="assessment-grid">
            <section class="assessment-panel assessment-panel--profiles" aria-labelledby="assessment-targets-title">
                <div class="view-header compact-header">
                    <div>
                        <h3 id="assessment-targets-title">Profili Target</h3>
                        <p class="section-intro">Obiettivo di sicurezza desiderato per il soggetto NIS2.</p>
                    </div>
                    <button id="assessment-new-target" type="button" class="btn-primary">Nuovo Profilo Target</button>
                </div>
                <div class="table-wrapper">
                    <table class="data-table assessment-table">
                        <thead>
                            <tr>
                                <th>Codice</th>
                                <th>Soggetto NIS2</th>
                                <th>Stato</th>
                                <th>Controlli</th>
                                <th>Azioni</th>
                            </tr>
                        </thead>
                        <tbody id="assessment-target-list">
                            <tr><td colspan="5" class="table-state">Caricamento Profili Target…</td></tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <section id="assessment-target-detail" class="assessment-panel assessment-panel--target-detail is-hidden" aria-labelledby="assessment-target-detail-title">
                <div class="view-header compact-header">
                    <div>
                        <p class="eyebrow">PROFILO TARGET</p>
                        <h3 id="assessment-target-detail-title">Dettaglio Profilo Target</h3>
                        <p id="assessment-target-description" class="section-intro"></p>
                    </div>
                    <div class="button-row">
                        <button id="assessment-save-controls" type="button" class="btn-secondary">Salva modifiche</button>
                        <button id="assessment-approve-target" type="button" class="btn-primary">Approva Target</button>
                        <button id="assessment-new-assessment" type="button" class="btn-primary">Crea Profilo Attuale</button>
                    </div>
                </div>

                <dl id="assessment-target-metadata" class="assessment-metadata"></dl>

                <div class="table-wrapper">
                    <table class="data-table assessment-table assessment-control-table assessment-responsive-table">
                        <thead>
                            <tr>
                                <th>Controllo</th>
                                <th>Subcategory</th>
                                <th>Descrizione</th>
                                <th>Copertura Target</th>
                                <th>Azioni</th>
                            </tr>
                        </thead>
                        <tbody id="assessment-control-list"></tbody>
                    </table>
                </div>
            </section>

            <section id="assessment-runs-panel" class="assessment-panel assessment-panel--runs is-hidden" aria-labelledby="assessment-runs-title">
                <div class="view-header compact-header">
                    <div>
                        <p class="eyebrow">PROFILO ATTUALE</p>
                        <h3 id="assessment-runs-title">Assessment del Target selezionato</h3>
                        <p class="section-intro">Le misure periodiche restano confrontabili finché utilizzano lo stesso Profilo Target.</p>
                    </div>
                </div>
                <div class="table-wrapper">
                    <table class="data-table assessment-table">
                        <thead>
                            <tr>
                                <th>Codice</th>
                                <th>Data</th>
                                <th>Stato</th>
                                <th>Avanzamento</th>
                                <th>Score</th>
                                <th>Azioni</th>
                            </tr>
                        </thead>
                        <tbody id="assessment-run-list"></tbody>
                    </table>
                </div>
            </section>

            <section id="assessment-current-detail" class="assessment-panel assessment-panel--wide is-hidden" aria-labelledby="assessment-current-title">
                <div class="view-header compact-header">
                    <div>
                        <p class="eyebrow">VALUTAZIONE</p>
                        <h3 id="assessment-current-title">Profilo Attuale e gap</h3>
                        <p id="assessment-current-description" class="section-intro"></p>
                    </div>
                    <div class="button-row">
                        <button id="assessment-export" type="button" class="btn-secondary">Esporta XLS</button>
                        <button id="assessment-complete" type="button" class="btn-primary">Completa assessment</button>
                    </div>
                </div>

                <div class="assessment-kpi-grid">
                    <article class="assessment-kpi"><span>Avanzamento</span><strong id="assessment-kpi-progress">—</strong></article>
                    <article class="assessment-kpi"><span>Score</span><strong id="assessment-kpi-score">—</strong></article>
                    <article class="assessment-kpi"><span>Gap</span><strong id="assessment-kpi-gap">—</strong></article>
                    <article class="assessment-kpi"><span>Maturità media indicativa</span><strong id="assessment-kpi-maturity">—</strong></article>
                </div>

                <div class="table-wrapper">
                    <table class="data-table assessment-table assessment-measure-table assessment-responsive-table">
                        <thead>
                            <tr>
                                <th>Controllo</th>
                                <th>Subcategory</th>
                                <th>Target</th>
                                <th>Copertura attuale</th>
                                <th>Maturità</th>
                                <th>Stato misura</th>
                                <th>Azioni</th>
                            </tr>
                        </thead>
                        <tbody id="assessment-measure-list"></tbody>
                    </table>
                </div>
            </section>
        </div>

        <dialog id="assessment-target-dialog" class="app-dialog assessment-dialog">
            <form id="assessment-target-form" method="dialog" class="dialog-form">
                <div class="dialog-header">
                    <div>
                        <p class="eyebrow">CONTESTUALIZZAZIONE</p>
                        <h3>Nuovo Profilo Target</h3>
                    </div>
                    <button type="button" class="dialog-close" data-assessment-dialog-close="assessment-target-dialog" aria-label="Chiudi">×</button>
                </div>
                <p class="section-intro">Scegli un soggetto NIS2 già censito. Il sistema genera automaticamente i sei controlli iniziali, che potrai verificare prima dell’approvazione.</p>
                <div id="assessment-target-fields" class="form-grid two-columns assessment-dialog-scroll">
                    <ul class="assessment-control-summary form-field--wide">
                        ${FNCSDP_CONTROLS.map((item) => `<li><strong>${item.code}</strong><span>${item.label}</span></li>`).join('')}
                    </ul>
                    <div class="form-field">
                        <label for="assessment-target-organization">Soggetto NIS2</label>
                        <select id="assessment-target-organization" class="form-input" required></select>
                        <small class="form-help">Elenco collegato all’anagrafica Azienda → Soggetti NIS2: non vengono create organizzazioni duplicate.</small>
                    </div>
                    <div class="form-field">
                        <label for="assessment-target-code">Codice</label>
                        <input id="assessment-target-code" class="form-input" maxlength="40" placeholder="PT-2026-01" required>
                    </div>
                    <div class="form-field form-field--wide">
                        <label for="assessment-target-name">Nome</label>
                        <input id="assessment-target-name" class="form-input" maxlength="160" placeholder="Profilo Target Asset Management 2026" required>
                    </div>
                    <div class="form-field form-field--wide">
                        <label for="assessment-target-perimeter">Perimetro</label>
                        <textarea id="assessment-target-perimeter" class="form-input" rows="3" required placeholder="Sistemi, servizi, sedi e processi inclusi nell’assessment"></textarea>
                    </div>
                    <div class="form-field form-field--wide">
                        <label for="assessment-target-notes">Descrizione</label>
                        <textarea id="assessment-target-notes" class="form-input" rows="3" placeholder="Obiettivi e criteri del Profilo Target"></textarea>
                    </div>
                </div>
                <section id="assessment-target-confirmation" class="assessment-confirmation is-hidden" aria-live="polite">
                    <div class="assessment-confirmation__heading">
                        <p class="eyebrow">CONFERMA DATI</p>
                        <h4>Verifica prima della registrazione</h4>
                        <p>I sei controlli ID.AM saranno creati automaticamente dopo la conferma.</p>
                    </div>
                    <dl class="assessment-confirmation-grid">
                        <div><dt>Soggetto NIS2</dt><dd id="assessment-confirm-organization"></dd></div>
                        <div><dt>Classificazione NIS2</dt><dd id="assessment-confirm-classification"></dd></div>
                        <div><dt>Codice</dt><dd id="assessment-confirm-code"></dd></div>
                        <div class="assessment-confirmation-grid__wide"><dt>Nome</dt><dd id="assessment-confirm-name"></dd></div>
                        <div class="assessment-confirmation-grid__wide"><dt>Perimetro</dt><dd id="assessment-confirm-perimeter"></dd></div>
                        <div class="assessment-confirmation-grid__wide"><dt>Descrizione</dt><dd id="assessment-confirm-description"></dd></div>
                    </dl>
                </section>
                <div class="dialog-actions">
                    <button type="button" class="btn-secondary" data-assessment-dialog-close="assessment-target-dialog">Annulla</button>
                    <button id="assessment-target-back" type="button" class="btn-secondary is-hidden">Modifica dati</button>
                    <button id="assessment-target-submit" type="submit" class="btn-primary" data-confirmation="false">Verifica dati</button>
                </div>
            </form>
        </dialog>

        <dialog id="assessment-run-dialog" class="app-dialog assessment-dialog">
            <form id="assessment-run-form" method="dialog" class="dialog-form">
                <div class="dialog-header">
                    <div>
                        <p class="eyebrow">MISURA</p>
                        <h3>Nuovo assessment / Profilo Attuale</h3>
                    </div>
                    <button type="button" class="dialog-close" data-assessment-dialog-close="assessment-run-dialog" aria-label="Chiudi">×</button>
                </div>
                <div class="form-grid two-columns">
                    <div class="form-field">
                        <label for="assessment-run-code">Codice</label>
                        <input id="assessment-run-code" class="form-input" maxlength="40" placeholder="ASS-2026-01" required>
                    </div>
                    <div class="form-field">
                        <label for="assessment-run-date">Data assessment</label>
                        <input id="assessment-run-date" type="date" class="form-input" required>
                    </div>
                    <div class="form-field form-field--wide">
                        <label for="assessment-run-name">Nome</label>
                        <input id="assessment-run-name" class="form-input" maxlength="160" placeholder="Assessment periodico luglio 2026" required>
                    </div>
                    <div class="form-field form-field--wide">
                        <label for="assessment-run-assessor">Assessor</label>
                        <select id="assessment-run-assessor" class="form-input"></select>
                    </div>
                    <div class="form-field form-field--wide">
                        <label for="assessment-run-notes">Note</label>
                        <textarea id="assessment-run-notes" class="form-input" rows="3"></textarea>
                    </div>
                </div>
                <div class="dialog-actions">
                    <button type="button" class="btn-secondary" data-assessment-dialog-close="assessment-run-dialog">Annulla</button>
                    <button id="assessment-run-submit" type="submit" class="btn-primary">Crea e inizia compilazione</button>
                </div>
            </form>
        </dialog>

        <dialog id="assessment-measure-dialog" class="app-dialog assessment-dialog assessment-dialog--wide">
            <form id="assessment-measure-form" method="dialog" class="dialog-form">
                <input id="assessment-measure-id" type="hidden">
                <div class="dialog-header">
                    <div>
                        <p class="eyebrow">MISURA DEL CONTROLLO</p>
                        <h3 id="assessment-measure-title">Compila misura</h3>
                        <p id="assessment-measure-subcategory" class="section-intro"></p>
                        <p id="assessment-measure-progress" class="assessment-dialog-progress"></p>
                    </div>
                    <button type="button" class="dialog-close" data-assessment-dialog-close="assessment-measure-dialog" aria-label="Chiudi">×</button>
                </div>
                <div class="form-grid two-columns">
                    <div class="form-field form-field--wide">
                        <label for="assessment-measure-answer">Risposta dell’intervistato</label>
                        <textarea id="assessment-measure-answer" class="form-input" rows="3"></textarea>
                    </div>
                    <div class="form-field">
                        <label for="assessment-measure-coverage">Grado di copertura</label>
                        <select id="assessment-measure-coverage" class="form-input">
                            <option value="">Non misurata</option>
                            <option value="0">0 · Nullo</option>
                            <option value="0.2">0,2 · Insufficiente</option>
                            <option value="0.4">0,4 · Iniziale</option>
                            <option value="0.6">0,6 · Incompleto</option>
                            <option value="0.8">0,8 · Avanzato</option>
                            <option value="1">1 · Completo</option>
                        </select>
                    </div>
                    <div class="form-field">
                        <label for="assessment-measure-maturity">Livello di maturità CMMI</label>
                        <select id="assessment-measure-maturity" class="form-input">
                            <option value="">N/A</option>
                            <option value="1">1 · Iniziale</option>
                            <option value="2">2 · Ripetibile</option>
                            <option value="3">3 · Definito</option>
                            <option value="4">4 · Gestito</option>
                            <option value="5">5 · Ottimizzato</option>
                        </select>
                    </div>
                    <div class="form-field form-field--wide">
                        <label for="assessment-measure-coverage-notes">Note sulla copertura</label>
                        <textarea id="assessment-measure-coverage-notes" class="form-input" rows="2"></textarea>
                    </div>
                    <div class="form-field form-field--wide">
                        <label for="assessment-measure-maturity-notes">Note sulla maturità</label>
                        <textarea id="assessment-measure-maturity-notes" class="form-input" rows="2"></textarea>
                    </div>
                    <div class="form-field form-field--wide">
                        <label for="assessment-measure-evidence">Evidenze</label>
                        <textarea id="assessment-measure-evidence" class="form-input" rows="3" placeholder="Documenti, registri, procedure, report tecnici o altre evidenze verificabili"></textarea>
                    </div>
                    <div class="form-field form-field--wide">
                        <label for="assessment-measure-notes">Ulteriori note dell’assessor</label>
                        <textarea id="assessment-measure-notes" class="form-input" rows="2"></textarea>
                    </div>
                </div>
                <div class="dialog-actions">
                    <button type="button" class="btn-secondary" data-assessment-dialog-close="assessment-measure-dialog">Annulla</button>
                    <button id="assessment-measure-submit" type="submit" class="btn-secondary" data-next="false">Salva</button>
                    <button id="assessment-measure-submit-next" type="submit" class="btn-primary" data-next="true">Salva e prossimo</button>
                </div>
            </form>
        </dialog>
    `;
}

function fillReferenceControls() {
    const organizationSelect = document.getElementById('assessment-target-organization');
    if (organizationSelect) {
        const previousValue = organizationSelect.value;
        if (references.organizzazioni.length === 0) {
            organizationSelect.innerHTML = '<option value="">Nessun soggetto NIS2 attivo disponibile</option>';
            organizationSelect.disabled = true;
        } else {
            organizationSelect.disabled = false;
            organizationSelect.innerHTML = [
                '<option value="">Seleziona il soggetto NIS2</option>',
                ...references.organizzazioni.map((organization) => (
                    `<option value="${organization.id}" data-organization-name="${escapeHtml(`${organization.codice_organizzazione} · ${organization.nome}`)}" data-classification="${escapeHtml(organization.classificazione_nis2 || '')}">${escapeHtml(organization.codice_organizzazione)} · ${escapeHtml(organization.nome)} · ${escapeHtml(nis2ClassificationLabel(organization.classificazione_nis2))}</option>`
                ))
            ].join('');

            if (previousValue && references.organizzazioni.some((item) => String(item.id) === String(previousValue))) {
                organizationSelect.value = previousValue;
            } else if (references.organizzazioni.length === 1) {
                organizationSelect.value = String(references.organizzazioni[0].id);
            }
        }
    }

    const assessorSelect = document.getElementById('assessment-run-assessor');
    if (assessorSelect) {
        const target = selectedTarget();
        const people = target
            ? references.responsabili.filter((person) => Number(person.organizzazione_id) === Number(target.organizzazione_id))
            : references.responsabili;
        assessorSelect.innerHTML = [
            '<option value="">Assessor non associato a una persona censita</option>',
            ...people.map((person) => (
                `<option value="${person.id}">${escapeHtml(person.cognome)} ${escapeHtml(person.nome)} · ${escapeHtml(person.email)}</option>`
            ))
        ].join('');
    }
}

function renderTargets() {
    const body = document.getElementById('assessment-target-list');
    if (!body) return;

    if (targets.length === 0) {
        body.innerHTML = '<tr><td colspan="5" class="table-state">Nessun Profilo Target presente. Creane uno per iniziare.</td></tr>';
        return;
    }

    body.innerHTML = targets.map((target) => {
        const active = Number(target.profilo_target_id) === Number(selectedTargetId) ? ' row-selected' : '';
        return `
            <tr class="${active.trim()}">
                <td class="cell-primary"><strong>${escapeHtml(target.codice)}</strong><small>v${escapeHtml(target.versione)}</small></td>
                <td><strong>${escapeHtml(target.organizzazione_nome)}</strong><small>${escapeHtml(target.codice_organizzazione)} · ${escapeHtml(nis2ClassificationLabel(organizationReference(target.organizzazione_id)?.classificazione_nis2))}</small></td>
                <td><span class="badge ${target.stato === 'APPROVATO' ? 'status-success' : 'status-warning'}">${escapeHtml(target.stato)}</span></td>
                <td>${Number(target.numero_controlli || 0)}</td>
                <td><button type="button" class="btn-table" data-assessment-target-open="${target.profilo_target_id}" title="Apri il dettaglio del Profilo Target">Apri</button></td>
            </tr>
        `;
    }).join('');
}

function renderTargetDetail() {
    const panel = document.getElementById('assessment-target-detail');
    const runsPanel = document.getElementById('assessment-runs-panel');
    const target = selectedTarget();
    panel?.classList.toggle('is-hidden', !target);
    runsPanel?.classList.toggle('is-hidden', !target);

    if (!target) return;

    const title = document.getElementById('assessment-target-detail-title');
    const description = document.getElementById('assessment-target-description');
    const metadata = document.getElementById('assessment-target-metadata');
    const saveControlsButton = document.getElementById('assessment-save-controls');
    const approveButton = document.getElementById('assessment-approve-target');
    const newAssessmentButton = document.getElementById('assessment-new-assessment');

    if (title) title.textContent = `${target.codice} · ${target.nome}`;
    if (description) description.textContent = target.descrizione || 'Profilo Target FNCSDP per il perimetro selezionato.';
    if (metadata) {
        metadata.innerHTML = `
            <div><dt>Soggetto NIS2</dt><dd>${escapeHtml(target.codice_organizzazione)} · ${escapeHtml(target.organizzazione_nome)}</dd></div>
            <div><dt>Classificazione NIS2</dt><dd>${escapeHtml(nis2ClassificationLabel(organizationReference(target.organizzazione_id)?.classificazione_nis2))}</dd></div>
            <div><dt>Stato</dt><dd>${escapeHtml(target.stato)}</dd></div>
            <div><dt>Perimetro</dt><dd>${escapeHtml(target.perimetro)}</dd></div>
            <div><dt>Subcategory</dt><dd>${Number(target.numero_subcategory || 0)}</dd></div>
            <div><dt>Assessment</dt><dd>${Number(target.numero_assessment || 0)}</dd></div>
            <div><dt>Ultima misura</dt><dd>${target.ultimo_assessment_il ? escapeHtml(target.ultimo_assessment_il) : 'Non disponibile'}</dd></div>
        `;
    }

    if (saveControlsButton) {
        saveControlsButton.disabled = target.stato === 'APPROVATO';
        saveControlsButton.classList.toggle('is-hidden', target.stato === 'APPROVATO');
        saveControlsButton.textContent = 'Salva modifiche ai controlli';
    }
    if (approveButton) {
        approveButton.disabled = target.stato === 'APPROVATO';
        approveButton.textContent = target.stato === 'APPROVATO' ? 'Target approvato' : 'Salva e approva Target';
    }
    if (newAssessmentButton) {
        newAssessmentButton.disabled = target.stato !== 'APPROVATO';
        newAssessmentButton.textContent = target.stato === 'APPROVATO' ? 'Crea assessment / Profilo Attuale' : 'Disponibile dopo approvazione';
    }

    const body = document.getElementById('assessment-control-list');
    if (!body) return;
    const grouped = groupControls(controls);

    if (grouped.length === 0) {
        body.innerHTML = '<tr><td colspan="5" class="table-state">Nessun controllo disponibile.</td></tr>';
        return;
    }

    const readOnly = target.stato === 'APPROVATO';
    body.innerHTML = grouped.map((control) => {
        const label = FNCSDP_CONTROLS.find((item) => item.code === control.subcategories[0]?.codice)?.label || control.nome;
        const descriptionCell = readOnly
            ? `<div class="assessment-readonly-text">${escapeHtml(control.descrizione)}</div>`
            : `<textarea class="form-input assessment-inline-text" data-control-description="${control.controllo_target_id}" rows="3">${escapeHtml(control.descrizione)}</textarea>`;
        const coverageCell = readOnly
            ? `<span class="assessment-coverage-chip">${coverageLabel(control.copertura_target)}</span>`
            : `<select class="form-input compact-select" data-control-coverage="${control.controllo_target_id}">
                    ${[0, 0.2, 0.4, 0.6, 0.8, 1].map((value) => `<option value="${value}" ${Number(control.copertura_target) === value ? 'selected' : ''}>${coverageLabel(value)}</option>`).join('')}
               </select>`;

        return `
            <tr data-control-row="${control.controllo_target_id}">
                <td class="cell-primary" data-label="Controllo"><strong>${escapeHtml(control.codice)}</strong><small>${escapeHtml(label)}</small></td>
                <td data-label="Subcategory">${control.subcategories.map((item) => `<span class="assessment-subcategory" title="${escapeHtml(item.descrizione)}">${escapeHtml(item.codice)} · peso ${String(item.peso).replace('.', ',')}</span>`).join('')}</td>
                <td data-label="Descrizione">${descriptionCell}</td>
                <td data-label="Copertura Target">${coverageCell}</td>
                <td data-label="Azioni">${readOnly ? '<span class="badge status-success">Approvato</span>' : `<button type="button" class="btn-table" data-control-save="${control.controllo_target_id}">Salva</button>`}</td>
            </tr>
        `;
    }).join('');
}

function renderAssessments() {
    const body = document.getElementById('assessment-run-list');
    if (!body) return;

    if (assessments.length === 0) {
        body.innerHTML = '<tr><td colspan="6" class="table-state">Nessun assessment associato al Target selezionato.</td></tr>';
        return;
    }

    body.innerHTML = assessments.map((assessment) => {
        const active = Number(assessment.assessment_id) === Number(selectedAssessmentId) ? ' row-selected' : '';
        return `
            <tr class="${active.trim()}">
                <td class="cell-primary"><strong>${escapeHtml(assessment.codice)}</strong><small>${escapeHtml(assessment.nome)}</small></td>
                <td>${escapeHtml(assessment.data_assessment)}</td>
                <td><span class="badge ${assessment.stato === 'COMPLETATO' ? 'status-success' : 'status-warning'}">${escapeHtml(assessment.stato)}</span></td>
                <td>${percentage(assessment.avanzamento, '0%')}</td>
                <td>${percentage(assessment.score)}</td>
                <td><button type="button" class="btn-table" data-assessment-run-open="${assessment.assessment_id}" title="Apri e raggiungi il dettaglio del Profilo Attuale">${active ? 'Vai al dettaglio' : 'Apri'}</button></td>
            </tr>
        `;
    }).join('');
}

function renderCurrentProfile() {
    const panel = document.getElementById('assessment-current-detail');
    const assessment = selectedAssessment();
    panel?.classList.toggle('is-hidden', !assessment);
    if (!assessment) return;

    const description = document.getElementById('assessment-current-description');
    const completeButton = document.getElementById('assessment-complete');
    const exportButton = document.getElementById('assessment-export');
    if (description) {
        description.textContent = `${assessment.codice} · ${assessment.nome} · ${assessment.data_assessment}`;
    }
    const progress = assessmentProgress(assessment);
    if (completeButton) {
        completeButton.disabled = assessment.stato === 'COMPLETATO' || progress < 1;
        completeButton.textContent = assessment.stato === 'COMPLETATO'
            ? 'Assessment completato'
            : progress < 1
                ? `Completa dopo il 100% (${percentage(progress, '0%')})`
                : 'Completa e calcola risultati';
    }
    if (exportButton) {
        exportButton.disabled = assessment.stato !== 'COMPLETATO' || evaluation.length === 0;
        exportButton.textContent = assessment.stato === 'COMPLETATO' ? 'Esporta XLSX' : 'Esporta dopo completamento';
    }

    const values = {
        'assessment-kpi-progress': percentage(assessment.avanzamento, '0%'),
        'assessment-kpi-score': percentage(assessment.score),
        'assessment-kpi-gap': percentage(assessment.gap),
        'assessment-kpi-maturity': assessment.maturita_media_indicativa === null || assessment.maturita_media_indicativa === undefined
            ? '—'
            : `${Number(assessment.maturita_media_indicativa).toFixed(2)} / 5`
    };
    Object.entries(values).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    });

    const body = document.getElementById('assessment-measure-list');
    if (!body) return;
    const measures = groupMeasures(evaluation);
    if (measures.length === 0) {
        body.innerHTML = '<tr><td colspan="7" class="table-state">Nessuna misura disponibile.</td></tr>';
        return;
    }

    body.innerHTML = measures.map((measure) => {
        const complete = isMeasureComplete(measure);
        return `
            <tr>
                <td class="cell-primary" data-label="Controllo"><strong>${escapeHtml(measure.controllo_codice)}</strong><small>${escapeHtml(measure.controllo_nome)}</small></td>
                <td data-label="Subcategory">${measure.subcategories.map((item) => `<span class="assessment-subcategory">${escapeHtml(item.codice)}</span>`).join('')}</td>
                <td data-label="Target">${coverageLabel(measure.copertura_target)}</td>
                <td data-label="Copertura attuale">${coverageLabel(measure.copertura_attuale)}</td>
                <td data-label="Maturita">${maturityLabel(measure.livello_maturita)}</td>
                <td data-label="Stato misura"><span class="badge ${complete ? 'status-success' : 'status-warning'}">${complete ? 'Completa' : 'Da compilare'}</span></td>
                <td data-label="Azioni"><button type="button" class="btn-table" data-measure-open="${measure.misura_id}">${assessment.stato === 'COMPLETATO' ? 'Visualizza' : 'Compila'}</button></td>
            </tr>
        `;
    }).join('');
}

async function loadTargets(preferredTargetId = null) {
    targets = await fetchTargetProfiles();
    if (preferredTargetId && targets.some((item) => Number(item.profilo_target_id) === Number(preferredTargetId))) {
        selectedTargetId = Number(preferredTargetId);
    } else if (selectedTargetId && !targets.some((item) => Number(item.profilo_target_id) === Number(selectedTargetId))) {
        selectedTargetId = null;
    }
    renderTargets();
    renderWorkflow();
}

async function loadTargetContext(targetId) {
    selectedTargetId = Number(targetId);
    selectedAssessmentId = null;
    evaluation = [];
    setStatus('Caricamento Profilo Target…');
    [controls, assessments] = await Promise.all([
        fetchTargetControls(selectedTargetId),
        fetchAssessments(selectedTargetId)
    ]);
    if (assessments.length > 0) {
        selectedAssessmentId = Number(assessments[0].assessment_id);
        evaluation = await fetchAssessmentEvaluation(selectedAssessmentId);
    }
    renderTargets();
    renderTargetDetail();
    renderAssessments();
    renderCurrentProfile();
    fillReferenceControls();
    renderWorkflow();
    setStatus('Profilo Target caricato. Segui la prossima azione consigliata.');
}

async function loadAssessmentContext(assessmentId) {
    selectedAssessmentId = Number(assessmentId);
    setStatus('Caricamento Profilo Attuale…');
    evaluation = await fetchAssessmentEvaluation(selectedAssessmentId);
    assessments = await fetchAssessments(selectedTargetId);
    renderAssessments();
    renderCurrentProfile();
    renderWorkflow();
    setStatus('Profilo Attuale caricato. Segui la prossima azione consigliata.');
}

function openTargetDialog() {
    const form = document.getElementById('assessment-target-form');
    form?.reset();
    resetTargetConfirmation();
    const code = document.getElementById('assessment-target-code');
    if (code) {
        const next = targets.length + 1;
        code.value = `PT-${new Date().getFullYear()}-${String(next).padStart(2, '0')}`;
    }
    fillReferenceControls();
    if (references.organizzazioni.length === 0) {
        setStatus('Non è presente alcun soggetto NIS2 attivo. Crealo prima nel menu Azienda → Soggetti NIS2.', true);
        return;
    }
    document.getElementById('assessment-target-dialog')?.showModal();
}

function openAssessmentDialog() {
    const target = selectedTarget();
    if (!target || target.stato !== 'APPROVATO') {
        setStatus('Approva prima il Profilo Target.', true);
        return;
    }
    const form = document.getElementById('assessment-run-form');
    form?.reset();
    const code = document.getElementById('assessment-run-code');
    const date = document.getElementById('assessment-run-date');
    const name = document.getElementById('assessment-run-name');
    if (date) date.value = new Date().toISOString().slice(0, 10);
    if (code) code.value = `ASS-${new Date().getFullYear()}-${String(assessments.length + 1).padStart(2, '0')}`;
    if (name) name.value = `Assessment ${target.codice}`;
    fillReferenceControls();
    document.getElementById('assessment-run-dialog')?.showModal();
}

function openMeasureDialog(measureId) {
    const measure = groupMeasures(evaluation).find((item) => Number(item.misura_id) === Number(measureId));
    if (!measure) {
        setStatus('Misura non trovata.', true);
        return;
    }

    document.getElementById('assessment-measure-id').value = measure.misura_id;
    document.getElementById('assessment-measure-title').textContent = `${measure.controllo_codice} · ${measure.controllo_nome}`;
    document.getElementById('assessment-measure-subcategory').textContent = measure.subcategories
        .map((item) => `${item.codice} · ${item.descrizione}`)
        .join(' | ');
    const measures = groupedMeasures();
    const measureIndex = measures.findIndex((item) => Number(item.misura_id) === Number(measure.misura_id));
    const progressElement = document.getElementById('assessment-measure-progress');
    if (progressElement) progressElement.textContent = `Controllo ${measureIndex + 1} di ${measures.length} · ${measures.filter(isMeasureComplete).length} già completati`;
    document.getElementById('assessment-measure-answer').value = measure.risposta ?? '';
    document.getElementById('assessment-measure-coverage-notes').value = measure.note_copertura ?? '';
    document.getElementById('assessment-measure-coverage').value = measure.copertura_attuale ?? '';
    document.getElementById('assessment-measure-maturity-notes').value = measure.note_maturita ?? '';
    document.getElementById('assessment-measure-maturity').value = measure.livello_maturita ?? '';
    document.getElementById('assessment-measure-evidence').value = measure.evidenze ?? '';
    document.getElementById('assessment-measure-notes').value = measure.note ?? '';

    const readOnly = selectedAssessment()?.stato === 'COMPLETATO';
    [
        'assessment-measure-answer',
        'assessment-measure-coverage-notes',
        'assessment-measure-coverage',
        'assessment-measure-maturity-notes',
        'assessment-measure-maturity',
        'assessment-measure-evidence',
        'assessment-measure-notes'
    ].forEach((id) => {
        const field = document.getElementById(id);
        if (field) field.disabled = readOnly;
    });

    const submitButton = document.getElementById('assessment-measure-submit');
    const submitNextButton = document.getElementById('assessment-measure-submit-next');
    if (submitButton) submitButton.classList.toggle('is-hidden', readOnly);
    if (submitNextButton) submitNextButton.classList.toggle('is-hidden', readOnly);
    const closeButton = document.querySelector('[data-assessment-dialog-close="assessment-measure-dialog"].btn-secondary');
    if (closeButton) closeButton.textContent = readOnly ? 'Chiudi' : 'Annulla';

    if (!readOnly) synchronizeMaturityControl();
    document.getElementById('assessment-measure-dialog')?.showModal();
}

function synchronizeMaturityControl() {
    const coverage = document.getElementById('assessment-measure-coverage');
    const maturity = document.getElementById('assessment-measure-maturity');
    if (!coverage || !maturity) return;
    const isZero = coverage.value === '0';
    maturity.disabled = isZero;
    if (isZero) maturity.value = '';
}

async function handleTargetSubmit(event) {
    event.preventDefault();
    const button = document.getElementById('assessment-target-submit');
    const payload = readTargetFormPayload();

    if (button?.dataset.confirmation !== 'true') {
        showTargetConfirmation(payload);
        return;
    }

    setBusy(button, true, 'Creazione…');
    try {
        const targetId = await createTargetProfile(payload);
        document.getElementById('assessment-target-dialog')?.close();
        resetTargetConfirmation();
        await loadTargets(targetId);
        await loadTargetContext(targetId);
        renderWorkflow();
        scrollToPanel('assessment-target-detail');
        setStatus(`Profilo Target ${payload.codice} creato e collegato a ${payload.organizzazione_nome}. I sei controlli ID.AM sono pronti: verificali e approva il Target.`);
    } catch (error) {
        console.error('Errore creazione Profilo Target:', error);
        setStatus(formatError(error), true);
    } finally {
        setBusy(button, false);
        if (button?.dataset.confirmation === 'true') button.textContent = 'Conferma e crea';
    }
}

async function handleAssessmentSubmit(event) {
    event.preventDefault();
    const button = document.getElementById('assessment-run-submit');
    setBusy(button, true, 'Creazione…');
    try {
        const targetId = Number(selectedTargetId);
        const assessmentId = await createAssessment({
            profilo_target_id: targetId,
            codice: document.getElementById('assessment-run-code')?.value,
            nome: document.getElementById('assessment-run-name')?.value,
            data_assessment: document.getElementById('assessment-run-date')?.value,
            responsabile_assessor_id: document.getElementById('assessment-run-assessor')?.value,
            note: document.getElementById('assessment-run-notes')?.value
        });
        document.getElementById('assessment-run-dialog')?.close();

        // Ricarica anche la testata del Target: il contatore Assessment deve aggiornarsi subito.
        await loadTargets(targetId);
        await loadTargetContext(targetId);
        await loadAssessmentContext(assessmentId);

        renderWorkflow();
        scrollToPanel('assessment-current-detail');
        setStatus('Profilo Attuale creato e aperto. Compila i sei controlli; il sistema passa automaticamente al successivo.');
        const firstMeasure = nextIncompleteMeasure();
        if (firstMeasure) openMeasureDialog(firstMeasure.misura_id);
    } catch (error) {
        console.error('Errore creazione assessment:', error);
        setStatus(formatError(error), true);
    } finally {
        setBusy(button, false);
    }
}

async function handleMeasureSubmit(event) {
    event.preventDefault();
    const button = event.submitter || document.getElementById('assessment-measure-submit-next');
    const moveNext = button?.dataset.next === 'true';
    const measureId = document.getElementById('assessment-measure-id')?.value;
    const coverage = document.getElementById('assessment-measure-coverage')?.value ?? '';
    const maturity = document.getElementById('assessment-measure-maturity')?.value ?? '';

    if (coverage === '') {
        setStatus('Seleziona il grado di copertura prima di salvare la misura.', true);
        document.getElementById('assessment-measure-coverage')?.focus();
        return;
    }
    if (coverage !== '0' && maturity === '') {
        setStatus('Se la copertura è superiore a zero, indica anche il livello di maturità CMMI.', true);
        document.getElementById('assessment-measure-maturity')?.focus();
        return;
    }

    setBusy(button, true, 'Salvataggio…');
    try {
        await updateAssessmentMeasure(measureId, {
            risposta: document.getElementById('assessment-measure-answer')?.value,
            note_copertura: document.getElementById('assessment-measure-coverage-notes')?.value,
            copertura_attuale: coverage,
            note_maturita: document.getElementById('assessment-measure-maturity-notes')?.value,
            livello_maturita: maturity,
            evidenze: document.getElementById('assessment-measure-evidence')?.value,
            note: document.getElementById('assessment-measure-notes')?.value
        });
        document.getElementById('assessment-measure-dialog')?.close();
        await loadAssessmentContext(selectedAssessmentId);

        const nextMeasure = nextIncompleteMeasure(measureId);
        if (moveNext && nextMeasure) {
            setStatus('Misura salvata. Passaggio al prossimo controllo incompleto.');
            openMeasureDialog(nextMeasure.misura_id);
        } else if (!nextMeasure) {
            setStatus('Tutti i sei controlli sono compilati. Ora completa l’assessment per consolidare score e gap.');
            scrollToPanel('assessment-current-detail');
        } else {
            setStatus('Misura salvata e metriche aggiornate.');
        }
        renderWorkflow();
    } catch (error) {
        console.error('Errore salvataggio misura:', error);
        setStatus(formatError(error), true);
    } finally {
        setBusy(button, false);
    }
}

async function saveControl(controlId, button) {
    const control = groupControls(controls).find((item) => Number(item.controllo_target_id) === Number(controlId));
    if (!control) return;
    setBusy(button, true, 'Salvataggio…');
    try {
        await updateTargetControl(controlId, {
            nome: control.nome,
            descrizione: document.querySelector(`[data-control-description="${controlId}"]`)?.value,
            copertura_target: document.querySelector(`[data-control-coverage="${controlId}"]`)?.value
        });
        controls = await fetchTargetControls(selectedTargetId);
        renderTargetDetail();
        setStatus(`Controllo ${control.codice} aggiornato.`);
    } catch (error) {
        console.error('Errore aggiornamento controllo:', error);
        setStatus(formatError(error), true);
    } finally {
        setBusy(button, false);
    }
}

async function saveAllControls(button = null, { silent = false } = {}) {
    const target = selectedTarget();
    if (!target || target.stato === 'APPROVATO') return 0;

    const grouped = groupControls(controls);
    const changed = grouped.filter((control) => {
        const description = document.querySelector(`[data-control-description="${control.controllo_target_id}"]`)?.value?.trim() ?? '';
        const coverage = Number(document.querySelector(`[data-control-coverage="${control.controllo_target_id}"]`)?.value);
        return description !== String(control.descrizione ?? '').trim() || coverage !== Number(control.copertura_target);
    });

    if (changed.length === 0) {
        if (!silent) setStatus('Nessuna modifica ai controlli da salvare.');
        return 0;
    }

    setBusy(button, true, `Salvataggio ${changed.length} controlli…`);
    try {
        for (const control of changed) {
            await updateTargetControl(control.controllo_target_id, {
                nome: control.nome,
                descrizione: document.querySelector(`[data-control-description="${control.controllo_target_id}"]`)?.value,
                copertura_target: document.querySelector(`[data-control-coverage="${control.controllo_target_id}"]`)?.value
            });
        }
        controls = await fetchTargetControls(selectedTargetId);
        renderTargetDetail();
        renderWorkflow();
        if (!silent) setStatus(`${changed.length} controlli aggiornati correttamente.`);
        return changed.length;
    } finally {
        setBusy(button, false);
    }
}

async function saveAllControlsAndApprove(button) {
    try {
        await saveAllControls(button, { silent: true });
        await approveCurrentTarget(button);
    } catch (error) {
        console.error('Errore salvataggio/approvazione Target:', error);
        setStatus(formatError(error), true);
    }
}

async function approveCurrentTarget(button) {
    const target = selectedTarget();
    if (!target || target.stato === 'APPROVATO') return;
    const confirmed = window.confirm('Approvare il Profilo Target? Dopo l’approvazione controlli e mapping diventeranno in sola lettura.');
    if (!confirmed) return;
    setBusy(button, true, 'Approvazione…');
    try {
        await approveTargetProfile(selectedTargetId);
        await loadTargets(selectedTargetId);
        await loadTargetContext(selectedTargetId);
        renderWorkflow();
        setStatus('Profilo Target approvato e reso immutabile. Ora crea il Profilo Attuale.');
        openAssessmentDialog();
    } catch (error) {
        console.error('Errore approvazione Target:', error);
        setStatus(formatError(error), true);
    } finally {
        setBusy(button, false);
    }
}

async function completeCurrentAssessment(button) {
    const assessment = selectedAssessment();
    if (!assessment || assessment.stato === 'COMPLETATO') return;
    if (assessmentProgress(assessment) < 1) {
        setStatus('Completa prima tutti i sei controlli del Profilo Attuale.', true);
        const nextMeasure = nextIncompleteMeasure();
        if (nextMeasure) openMeasureDialog(nextMeasure.misura_id);
        return;
    }
    const confirmed = window.confirm('Completare l’assessment? Le misure diventeranno in sola lettura e score/gap saranno consolidati.');
    if (!confirmed) return;
    setBusy(button, true, 'Completamento…');
    try {
        await completeAssessment(selectedAssessmentId);
        await loadAssessmentContext(selectedAssessmentId);
        renderWorkflow();
        setStatus('Assessment completato. Score e gap sono consolidati; controlla i risultati e poi esporta il report XLSX.');
        scrollToPanel('assessment-current-detail');
    } catch (error) {
        console.error('Errore completamento assessment:', error);
        setStatus(formatError(error), true);
    } finally {
        setBusy(button, false);
    }
}

async function exportCurrentAssessment(button) {
    const assessment = selectedAssessment();
    const target = selectedTarget();
    if (!assessment || !target || evaluation.length === 0) return;
    if (assessment.stato !== 'COMPLETATO') {
        setStatus('Completa l’assessment prima di esportare il report definitivo.', true);
        return;
    }
    setBusy(button, true, 'Esportazione…');

    try {
        const measures = groupMeasures(evaluation);
        await exportWorkbookToExcel({
            filename: `assessment_fncsdp_${assessment.codice}`,
            metadata: [
                { label: 'Metodologia', value: 'Cybersecurity assessment FNCSDP - Profili Target e Attuale' },
                { label: 'Soggetto NIS2', value: `${target.codice_organizzazione} · ${target.organizzazione_nome}` },
                { label: 'Classificazione NIS2', value: nis2ClassificationLabel(organizationReference(target.organizzazione_id)?.classificazione_nis2) },
                { label: 'Profilo Target', value: `${target.codice} · ${target.nome}` },
                { label: 'Assessment', value: `${assessment.codice} · ${assessment.nome}` },
                { label: 'Stato assessment', value: assessment.stato }
            ],
            sheets: [
                {
                    name: 'Riepilogo',
                    columns: [
                        { header: 'Soggetto NIS2', key: 'organization', width: 36 },
                        { header: 'Profilo Target', key: 'target', width: 34 },
                        { header: 'Assessment', key: 'assessment', width: 34 },
                        { header: 'Data', key: 'date', width: 14 },
                        { header: 'Stato', key: 'status', width: 16 },
                        { header: 'Avanzamento', key: 'progress', width: 16 },
                        { header: 'Score', key: 'score', width: 14 },
                        { header: 'Gap', key: 'gap', width: 14 },
                        { header: 'Maturità media indicativa', key: 'maturity', width: 24 }
                    ],
                    rows: [{
                        organization: `${target.codice_organizzazione} · ${target.organizzazione_nome}`,
                        target: `${target.codice} · ${target.nome}`,
                        assessment: `${assessment.codice} · ${assessment.nome}`,
                        date: assessment.data_assessment,
                        status: assessment.stato,
                        progress: percentage(assessment.avanzamento, '0%'),
                        score: percentage(assessment.score),
                        gap: percentage(assessment.gap),
                        maturity: assessment.maturita_media_indicativa ?? ''
                    }],
                    autoFilter: false
                },
                {
                    name: 'Profilo Target',
                    columns: [
                        { header: 'Ordine', key: 'order', width: 10 },
                        { header: 'Codice controllo', key: 'controlCode', width: 22 },
                        { header: 'Nome controllo', key: 'controlName', width: 34 },
                        { header: 'Descrizione', key: 'description', width: 68 },
                        { header: 'Copertura Target', key: 'targetCoverage', width: 20 }
                    ],
                    rows: measures.map((item) => ({
                        order: item.ordine,
                        controlCode: item.controllo_codice,
                        controlName: item.controllo_nome,
                        description: item.controllo_descrizione,
                        targetCoverage: item.copertura_target
                    }))
                },
                {
                    name: 'Profilo Attuale',
                    columns: [
                        { header: 'Codice controllo', key: 'controlCode', width: 22 },
                        { header: 'Copertura attuale', key: 'coverage', width: 20 },
                        { header: 'Maturità CMMI', key: 'maturity', width: 20 },
                        { header: 'Risposta', key: 'answer', width: 52 },
                        { header: 'Note copertura', key: 'coverageNotes', width: 52 },
                        { header: 'Note maturità', key: 'maturityNotes', width: 52 },
                        { header: 'Evidenze', key: 'evidence', width: 58 },
                        { header: 'Ulteriori note', key: 'notes', width: 45 }
                    ],
                    rows: measures.map((item) => ({
                        controlCode: item.controllo_codice,
                        coverage: item.copertura_attuale ?? '',
                        maturity: item.livello_maturita ?? 'N/A',
                        answer: item.risposta ?? '',
                        coverageNotes: item.note_copertura ?? '',
                        maturityNotes: item.note_maturita ?? '',
                        evidence: item.evidenze ?? '',
                        notes: item.note ?? ''
                    }))
                },
                {
                    name: 'Mapping FNCSDP',
                    columns: [
                        { header: 'Codice controllo', key: 'controlCode', width: 22 },
                        { header: 'Function', key: 'functionCode', width: 12 },
                        { header: 'Category', key: 'categoryCode', width: 14 },
                        { header: 'Subcategory', key: 'subcategoryCode', width: 18 },
                        { header: 'Descrizione Subcategory', key: 'subcategoryDescription', width: 72 },
                        { header: 'Peso', key: 'weight', width: 12 },
                        { header: 'Rapporto copertura', key: 'ratio', width: 20 },
                        { header: 'Gap controllo', key: 'gap', width: 18 }
                    ],
                    rows: evaluation.map((item) => ({
                        controlCode: item.controllo_codice,
                        functionCode: item.funzione_codice,
                        categoryCode: item.categoria_codice,
                        subcategoryCode: item.subcategory_codice,
                        subcategoryDescription: item.subcategory_descrizione,
                        weight: item.peso,
                        ratio: item.rapporto_copertura ?? '',
                        gap: item.gap_controllo ?? ''
                    }))
                }
            ]
        });
        lastExportedAssessmentId = assessment.assessment_id;
        renderWorkflow();
        setStatus('Assessment esportato in formato XLSX con Riepilogo, Profilo Target, Profilo Attuale, Mapping FNCSDP e Metadati.');
    } catch (error) {
        console.error('Errore esportazione assessment:', error);
        setStatus(formatError(error), true);
    } finally {
        setBusy(button, false);
    }
}

function initializeEvents() {
    const root = document.getElementById('view-assessment-fncsdp');
    if (!root) return;

    // Il router può ricreare il contenuto della vista. Il binding viene quindi
    // associato al nodo DOM reale e non a un flag globale permanente.
    if (initializedRoot === root && root.dataset.assessmentEventsBound === 'true') return;
    initializedRoot = root;
    root.dataset.assessmentEventsBound = 'true';

    document.getElementById('assessment-new-target')?.addEventListener('click', openTargetDialog);
    document.getElementById('assessment-new-assessment')?.addEventListener('click', openAssessmentDialog);
    document.getElementById('assessment-target-form')?.addEventListener('submit', handleTargetSubmit);
    document.getElementById('assessment-target-back')?.addEventListener('click', resetTargetConfirmation);
    document.getElementById('assessment-run-form')?.addEventListener('submit', handleAssessmentSubmit);
    document.getElementById('assessment-measure-form')?.addEventListener('submit', handleMeasureSubmit);
    document.getElementById('assessment-measure-coverage')?.addEventListener('change', synchronizeMaturityControl);

    document.getElementById('assessment-save-controls')?.addEventListener('click', (event) => saveAllControls(event.currentTarget));
    document.getElementById('assessment-approve-target')?.addEventListener('click', (event) => saveAllControlsAndApprove(event.currentTarget));
    document.getElementById('assessment-complete')?.addEventListener('click', (event) => completeCurrentAssessment(event.currentTarget));
    document.getElementById('assessment-export')?.addEventListener('click', (event) => exportCurrentAssessment(event.currentTarget));
    document.getElementById('assessment-next-action')?.addEventListener('click', async (event) => {
        const button = event.currentTarget;
        const action = button.dataset.action;
        if (action === 'new-target') openTargetDialog();
        if (action === 'save-approve') await saveAllControlsAndApprove(button);
        if (action === 'new-assessment') openAssessmentDialog();
        if (action === 'next-measure') {
            const measure = nextIncompleteMeasure();
            if (measure) openMeasureDialog(measure.misura_id);
        }
        if (action === 'complete-assessment') await completeCurrentAssessment(button);
        if (action === 'export') await exportCurrentAssessment(button);
    });

    root.addEventListener('click', async (event) => {
        const clickedElement = event.target instanceof Element ? event.target : null;
        if (!clickedElement) return;

        const targetOpen = clickedElement.closest('[data-assessment-target-open]');
        if (targetOpen) {
            event.preventDefault();
            const targetId = Number(targetOpen.dataset.assessmentTargetOpen);
            setBusy(targetOpen, true, 'Apertura…');
            try {
                await loadTargetContext(targetId);
                scrollToPanel('assessment-target-detail');
                const target = selectedTarget();
                setStatus(`Profilo Target ${target?.codice || targetId} aperto.`);
            } catch (error) {
                console.error('Errore apertura Target:', error);
                setStatus(formatError(error), true);
            } finally {
                setBusy(targetOpen, false);
            }
            return;
        }

        const runOpen = clickedElement.closest('[data-assessment-run-open]');
        if (runOpen) {
            event.preventDefault();
            const assessmentId = Number(runOpen.dataset.assessmentRunOpen);
            setBusy(runOpen, true, 'Apertura…');
            try {
                await loadAssessmentContext(assessmentId);
                scrollToPanel('assessment-current-detail');
                const assessment = selectedAssessment();
                setStatus(`Profilo Attuale ${assessment?.codice || assessmentId} aperto. Prosegui con la compilazione dei controlli.`);
            } catch (error) {
                console.error('Errore apertura assessment:', error);
                setStatus(formatError(error), true);
            } finally {
                setBusy(runOpen, false);
            }
            return;
        }

        const controlSave = event.target.closest('[data-control-save]');
        if (controlSave) {
            await saveControl(controlSave.dataset.controlSave, controlSave);
            return;
        }

        const measureOpen = event.target.closest('[data-measure-open]');
        if (measureOpen) {
            openMeasureDialog(measureOpen.dataset.measureOpen);
            return;
        }

        const closeControl = event.target.closest('[data-assessment-dialog-close]');
        if (closeControl) {
            const dialogId = closeControl.dataset.assessmentDialogClose;
            document.getElementById(dialogId)?.close();
            if (dialogId === 'assessment-target-dialog') resetTargetConfirmation();
        }
    });
}

export async function loadAssessmentView() {
    ensureMarkup();
    initializeEvents();
    setStatus('Caricamento modulo Assessment FNCSDP…');

    try {
        [references, targets] = await Promise.all([
            fetchAssessmentReferences(),
            fetchTargetProfiles()
        ]);
        renderTargets();
        fillReferenceControls();
        renderWorkflow();

        if (selectedTargetId && targets.some((item) => Number(item.profilo_target_id) === Number(selectedTargetId))) {
            await loadTargetContext(selectedTargetId);
            if (selectedAssessmentId) await loadAssessmentContext(selectedAssessmentId);
        } else {
            selectedTargetId = null;
            selectedAssessmentId = null;
            controls = [];
            assessments = [];
            evaluation = [];
            renderTargetDetail();
            renderAssessments();
            renderCurrentProfile();
            renderWorkflow();
            setStatus(`${targets.length} Profili Target disponibili. Segui la prossima azione consigliata.`);
        }
    } catch (error) {
        console.error('Errore caricamento Assessment FNCSDP:', error);
        setStatus(formatError(error), true);
    }
}
