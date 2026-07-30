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
} from './assessmentService.js?build=20260730-f1';
import { exportWorkbookToExcel } from './entitySpreadsheet.js?build=20260730-f1';
import { formatRomeDateTime } from './dateTime.js?build=20260726-d3';

let initialized = false;
let references = { organizzazioni: [], responsabili: [] };
let targets = [];
let controls = [];
let assessments = [];
let evaluation = [];
let selectedTargetId = null;
let selectedAssessmentId = null;

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

function selectedTarget() {
    return targets.find((item) => Number(item.profilo_target_id) === Number(selectedTargetId)) || null;
}

function selectedAssessment() {
    return assessments.find((item) => Number(item.assessment_id) === Number(selectedAssessmentId)) || null;
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
                    Definisci la postura desiderata, misura copertura e maturità dei controlli e valuta il gap.
                    Il modulo utilizza le Subcategory Asset Management ID.AM-1–ID.AM-6 coerenti con il perimetro del Project Work.
                </p>
            </div>
            <div class="assessment-method-badge" aria-label="Fasi della metodologia">
                <span>1 · Contestualizzazione</span>
                <span>2 · Misura</span>
                <span>3 · Valutazione</span>
            </div>
        </div>

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

            <section id="assessment-target-detail" class="assessment-panel is-hidden" aria-labelledby="assessment-target-detail-title">
                <div class="view-header compact-header">
                    <div>
                        <p class="eyebrow">PROFILO TARGET</p>
                        <h3 id="assessment-target-detail-title">Dettaglio Profilo Target</h3>
                        <p id="assessment-target-description" class="section-intro"></p>
                    </div>
                    <div class="button-row">
                        <button id="assessment-approve-target" type="button" class="btn-secondary">Approva Target</button>
                        <button id="assessment-new-assessment" type="button" class="btn-primary">Avvia assessment</button>
                    </div>
                </div>

                <dl id="assessment-target-metadata" class="assessment-metadata"></dl>

                <div class="table-wrapper">
                    <table class="data-table assessment-table assessment-control-table">
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

            <section id="assessment-runs-panel" class="assessment-panel is-hidden" aria-labelledby="assessment-runs-title">
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
                    <table class="data-table assessment-table">
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
                <p class="section-intro">Il sistema genera sei controlli iniziali collegati alle Subcategory ID.AM-1–ID.AM-6.</p>
                <div class="form-grid two-columns">
                    <div class="form-field">
                        <label for="assessment-target-organization">Soggetto NIS2</label>
                        <select id="assessment-target-organization" class="form-input" required></select>
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
                <div class="dialog-actions">
                    <button type="button" class="btn-secondary" data-assessment-dialog-close="assessment-target-dialog">Annulla</button>
                    <button id="assessment-target-submit" type="submit" class="btn-primary">Crea Profilo Target</button>
                </div>
            </form>
        </dialog>

        <dialog id="assessment-run-dialog" class="app-dialog assessment-dialog">
            <form id="assessment-run-form" method="dialog" class="dialog-form">
                <div class="dialog-header">
                    <div>
                        <p class="eyebrow">MISURA</p>
                        <h3>Nuovo assessment</h3>
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
                    <button id="assessment-run-submit" type="submit" class="btn-primary">Crea assessment</button>
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
                    <button id="assessment-measure-submit" type="submit" class="btn-primary">Salva misura</button>
                </div>
            </form>
        </dialog>
    `;
}

function fillReferenceControls() {
    const organizationSelect = document.getElementById('assessment-target-organization');
    if (organizationSelect) {
        organizationSelect.innerHTML = [
            '<option value="">Seleziona il soggetto NIS2</option>',
            ...references.organizzazioni.map((organization) => (
                `<option value="${organization.id}">${escapeHtml(organization.codice_organizzazione)} · ${escapeHtml(organization.nome)}</option>`
            ))
        ].join('');
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
                <td><strong>${escapeHtml(target.organizzazione_nome)}</strong><small>${escapeHtml(target.codice_organizzazione)}</small></td>
                <td><span class="badge ${target.stato === 'APPROVATO' ? 'status-success' : 'status-warning'}">${escapeHtml(target.stato)}</span></td>
                <td>${Number(target.numero_controlli || 0)}</td>
                <td><button type="button" class="btn-table" data-assessment-target-open="${target.profilo_target_id}">Apri</button></td>
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
    const approveButton = document.getElementById('assessment-approve-target');
    const newAssessmentButton = document.getElementById('assessment-new-assessment');

    if (title) title.textContent = `${target.codice} · ${target.nome}`;
    if (description) description.textContent = target.descrizione || 'Profilo Target FNCSDP per il perimetro selezionato.';
    if (metadata) {
        metadata.innerHTML = `
            <div><dt>Soggetto NIS2</dt><dd>${escapeHtml(target.organizzazione_nome)}</dd></div>
            <div><dt>Stato</dt><dd>${escapeHtml(target.stato)}</dd></div>
            <div><dt>Perimetro</dt><dd>${escapeHtml(target.perimetro)}</dd></div>
            <div><dt>Subcategory</dt><dd>${Number(target.numero_subcategory || 0)}</dd></div>
            <div><dt>Assessment</dt><dd>${Number(target.numero_assessment || 0)}</dd></div>
            <div><dt>Ultima misura</dt><dd>${target.ultimo_assessment_il ? escapeHtml(target.ultimo_assessment_il) : 'Non disponibile'}</dd></div>
        `;
    }

    if (approveButton) {
        approveButton.disabled = target.stato === 'APPROVATO';
        approveButton.textContent = target.stato === 'APPROVATO' ? 'Target approvato' : 'Approva Target';
    }
    if (newAssessmentButton) newAssessmentButton.disabled = target.stato !== 'APPROVATO';

    const body = document.getElementById('assessment-control-list');
    if (!body) return;
    const grouped = groupControls(controls);

    if (grouped.length === 0) {
        body.innerHTML = '<tr><td colspan="5" class="table-state">Nessun controllo disponibile.</td></tr>';
        return;
    }

    const readOnly = target.stato === 'APPROVATO';
    body.innerHTML = grouped.map((control) => `
        <tr data-control-row="${control.controllo_target_id}">
            <td class="cell-primary"><strong>${escapeHtml(control.codice)}</strong><small>${escapeHtml(control.nome)}</small></td>
            <td>${control.subcategories.map((item) => `<span class="assessment-subcategory" title="${escapeHtml(item.descrizione)}">${escapeHtml(item.codice)} · peso ${String(item.peso).replace('.', ',')}</span>`).join('')}</td>
            <td><textarea class="form-input assessment-inline-text" data-control-description="${control.controllo_target_id}" rows="3" ${readOnly ? 'disabled' : ''}>${escapeHtml(control.descrizione)}</textarea></td>
            <td>
                <select class="form-input compact-select" data-control-coverage="${control.controllo_target_id}" ${readOnly ? 'disabled' : ''}>
                    ${[0, 0.2, 0.4, 0.6, 0.8, 1].map((value) => `<option value="${value}" ${Number(control.copertura_target) === value ? 'selected' : ''}>${coverageLabel(value)}</option>`).join('')}
                </select>
            </td>
            <td>${readOnly ? '<span class="muted-text">Sola lettura</span>' : `<button type="button" class="btn-table" data-control-save="${control.controllo_target_id}">Salva</button>`}</td>
        </tr>
    `).join('');
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
                <td><button type="button" class="btn-table" data-assessment-run-open="${assessment.assessment_id}">Apri</button></td>
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
    if (completeButton) {
        completeButton.disabled = assessment.stato === 'COMPLETATO';
        completeButton.textContent = assessment.stato === 'COMPLETATO' ? 'Assessment completato' : 'Completa assessment';
    }
    if (exportButton) exportButton.disabled = evaluation.length === 0;

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
        const measured = measure.copertura_attuale !== null && measure.copertura_attuale !== undefined;
        const complete = measured && (Number(measure.copertura_attuale) === 0 || measure.livello_maturita !== null);
        return `
            <tr>
                <td class="cell-primary"><strong>${escapeHtml(measure.controllo_codice)}</strong><small>${escapeHtml(measure.controllo_nome)}</small></td>
                <td>${measure.subcategories.map((item) => `<span class="assessment-subcategory">${escapeHtml(item.codice)}</span>`).join('')}</td>
                <td>${coverageLabel(measure.copertura_target)}</td>
                <td>${coverageLabel(measure.copertura_attuale)}</td>
                <td>${maturityLabel(measure.livello_maturita)}</td>
                <td><span class="badge ${complete ? 'status-success' : 'status-warning'}">${complete ? 'Completa' : 'Da compilare'}</span></td>
                <td><button type="button" class="btn-table" data-measure-open="${measure.misura_id}">${assessment.stato === 'COMPLETATO' ? 'Visualizza' : 'Compila'}</button></td>
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
    renderTargets();
    renderTargetDetail();
    renderAssessments();
    renderCurrentProfile();
    fillReferenceControls();
    setStatus('Profilo Target caricato.');
}

async function loadAssessmentContext(assessmentId) {
    selectedAssessmentId = Number(assessmentId);
    setStatus('Caricamento Profilo Attuale…');
    evaluation = await fetchAssessmentEvaluation(selectedAssessmentId);
    assessments = await fetchAssessments(selectedTargetId);
    renderAssessments();
    renderCurrentProfile();
    setStatus('Profilo Attuale caricato.');
}

function openTargetDialog() {
    const form = document.getElementById('assessment-target-form');
    form?.reset();
    const code = document.getElementById('assessment-target-code');
    if (code) {
        const next = targets.length + 1;
        code.value = `PT-${new Date().getFullYear()}-${String(next).padStart(2, '0')}`;
    }
    fillReferenceControls();
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
    if (submitButton) submitButton.classList.toggle('is-hidden', readOnly);
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
    setBusy(button, true, 'Creazione…');
    try {
        const targetId = await createTargetProfile({
            organizzazione_id: document.getElementById('assessment-target-organization')?.value,
            codice: document.getElementById('assessment-target-code')?.value,
            nome: document.getElementById('assessment-target-name')?.value,
            perimetro: document.getElementById('assessment-target-perimeter')?.value,
            descrizione: document.getElementById('assessment-target-notes')?.value
        });
        document.getElementById('assessment-target-dialog')?.close();
        await loadTargets(targetId);
        await loadTargetContext(targetId);
        setStatus('Profilo Target creato con i sei controlli ID.AM.');
    } catch (error) {
        console.error('Errore creazione Profilo Target:', error);
        setStatus(formatError(error), true);
    } finally {
        setBusy(button, false);
    }
}

async function handleAssessmentSubmit(event) {
    event.preventDefault();
    const button = document.getElementById('assessment-run-submit');
    setBusy(button, true, 'Creazione…');
    try {
        const assessmentId = await createAssessment({
            profilo_target_id: selectedTargetId,
            codice: document.getElementById('assessment-run-code')?.value,
            nome: document.getElementById('assessment-run-name')?.value,
            data_assessment: document.getElementById('assessment-run-date')?.value,
            responsabile_assessor_id: document.getElementById('assessment-run-assessor')?.value,
            note: document.getElementById('assessment-run-notes')?.value
        });
        document.getElementById('assessment-run-dialog')?.close();
        assessments = await fetchAssessments(selectedTargetId);
        renderAssessments();
        await loadAssessmentContext(assessmentId);
        setStatus('Assessment creato. Sono state predisposte le misure dei controlli del Target.');
    } catch (error) {
        console.error('Errore creazione assessment:', error);
        setStatus(formatError(error), true);
    } finally {
        setBusy(button, false);
    }
}

async function handleMeasureSubmit(event) {
    event.preventDefault();
    const button = document.getElementById('assessment-measure-submit');
    setBusy(button, true, 'Salvataggio…');
    try {
        await updateAssessmentMeasure(document.getElementById('assessment-measure-id')?.value, {
            risposta: document.getElementById('assessment-measure-answer')?.value,
            note_copertura: document.getElementById('assessment-measure-coverage-notes')?.value,
            copertura_attuale: document.getElementById('assessment-measure-coverage')?.value,
            note_maturita: document.getElementById('assessment-measure-maturity-notes')?.value,
            livello_maturita: document.getElementById('assessment-measure-maturity')?.value,
            evidenze: document.getElementById('assessment-measure-evidence')?.value,
            note: document.getElementById('assessment-measure-notes')?.value
        });
        document.getElementById('assessment-measure-dialog')?.close();
        await loadAssessmentContext(selectedAssessmentId);
        setStatus('Misura salvata e metriche aggiornate.');
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
        setStatus('Profilo Target approvato e reso immutabile.');
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
    const confirmed = window.confirm('Completare l’assessment? Le misure diventeranno in sola lettura.');
    if (!confirmed) return;
    setBusy(button, true, 'Completamento…');
    try {
        await completeAssessment(selectedAssessmentId);
        await loadAssessmentContext(selectedAssessmentId);
        setStatus('Assessment completato e Profilo Attuale consolidato.');
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
    setBusy(button, true, 'Esportazione…');

    try {
        const measures = groupMeasures(evaluation);
        await exportWorkbookToExcel({
            filename: `assessment_fncsdp_${assessment.codice}`,
            metadata: [
                { label: 'Metodologia', value: 'Cybersecurity assessment FNCSDP - Profili Target e Attuale' },
                { label: 'Soggetto NIS2', value: `${target.codice_organizzazione} · ${target.organizzazione_nome}` },
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
        setStatus('Assessment esportato in formato XLSX.');
    } catch (error) {
        console.error('Errore esportazione assessment:', error);
        setStatus(formatError(error), true);
    } finally {
        setBusy(button, false);
    }
}

function initializeEvents() {
    if (initialized) return;
    initialized = true;

    document.getElementById('assessment-new-target')?.addEventListener('click', openTargetDialog);
    document.getElementById('assessment-new-assessment')?.addEventListener('click', openAssessmentDialog);
    document.getElementById('assessment-target-form')?.addEventListener('submit', handleTargetSubmit);
    document.getElementById('assessment-run-form')?.addEventListener('submit', handleAssessmentSubmit);
    document.getElementById('assessment-measure-form')?.addEventListener('submit', handleMeasureSubmit);
    document.getElementById('assessment-measure-coverage')?.addEventListener('change', synchronizeMaturityControl);

    document.getElementById('assessment-approve-target')?.addEventListener('click', (event) => approveCurrentTarget(event.currentTarget));
    document.getElementById('assessment-complete')?.addEventListener('click', (event) => completeCurrentAssessment(event.currentTarget));
    document.getElementById('assessment-export')?.addEventListener('click', (event) => exportCurrentAssessment(event.currentTarget));

    document.getElementById('view-assessment-fncsdp')?.addEventListener('click', async (event) => {
        const targetOpen = event.target.closest('[data-assessment-target-open]');
        if (targetOpen) {
            try {
                await loadTargetContext(targetOpen.dataset.assessmentTargetOpen);
            } catch (error) {
                console.error('Errore apertura Target:', error);
                setStatus(formatError(error), true);
            }
            return;
        }

        const runOpen = event.target.closest('[data-assessment-run-open]');
        if (runOpen) {
            try {
                await loadAssessmentContext(runOpen.dataset.assessmentRunOpen);
            } catch (error) {
                console.error('Errore apertura assessment:', error);
                setStatus(formatError(error), true);
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
            document.getElementById(closeControl.dataset.assessmentDialogClose)?.close();
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
            setStatus(`${targets.length} Profili Target disponibili.`);
        }
    } catch (error) {
        console.error('Errore caricamento Assessment FNCSDP:', error);
        setStatus(formatError(error), true);
    }
}
