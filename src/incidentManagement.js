// ===============================================================================================================
// FILE: src/incidentManagement.js
// DESCRIZIONE: Elenchi incidenti aperti/chiusi, dettaglio, chiusura controllata ed esportazione XLS/CSV.
// ===============================================================================================================

import {
    closeIncident,
    fetchIncidentDetail,
    fetchIncidentList
} from './incidentService.js?build=20260726-d2';
import { navigateTo } from './router.js?build=20260726-d2';

const PAGE_SIZE_DEFAULT = 10;

const state = {
    mode: 'open',
    rows: [],
    filteredRows: [],
    currentPage: 1,
    pageSize: PAGE_SIZE_DEFAULT,
    closingIncident: null,
    bound: false
};

function escapeHtml(value) {
    const node = document.createElement('div');
    node.textContent = String(value ?? '');
    return node.innerHTML;
}

function formatDateTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('it-IT', {
        dateStyle: 'short',
        timeStyle: 'medium',
        timeZone: 'Europe/Rome'
    }).format(date);
}

function normalizeSeverity(value) {
    const normalized = String(value || 'Media').trim().toLowerCase();
    const values = { bassa: 'Bassa', media: 'Media', alta: 'Alta', critica: 'Critica' };
    return values[normalized] || 'Media';
}

function severityClass(value) {
    const severity = normalizeSeverity(value).toLowerCase();
    if (severity === 'critica') return 'risk-critical';
    if (severity === 'alta') return 'risk-high';
    if (severity === 'media') return 'risk-medium';
    return 'risk-low';
}

function parseClosureData(value) {
    if (!value) return { cause: '', resolution: '' };
    try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object') {
            return {
                cause: String(parsed.causa_accertata || parsed.causa || ''),
                resolution: String(parsed.risoluzione || '')
            };
        }
    } catch {
        // I record storici possono contenere testo semplice.
    }
    return { cause: String(value), resolution: '' };
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
}

function showList() {
    document.getElementById('incident-list-container')?.classList.remove('is-hidden');
    document.getElementById('wizard-container')?.classList.add('is-hidden');
}

export function openNewIncidentWizard() {
    document.getElementById('incident-list-container')?.classList.add('is-hidden');
    document.getElementById('wizard-container')?.classList.remove('is-hidden');
    document.dispatchEvent(new CustomEvent('incident:wizard:start'));
}

function configureHeader(mode) {
    const isClosed = mode === 'closed';
    setText('incident-list-title', isClosed ? 'Incidenti chiusi' : 'Incidenti aperti');
    setText(
        'incident-list-description',
        isClosed
            ? 'Eventi conclusi, consultabili ed esportabili senza cancellazione fisica.'
            : 'Eventi operativi classificati, consultabili e chiudibili con conferma esplicita.'
    );
}

function populateServiceFilter(rows) {
    const select = document.getElementById('incident-service-filter');
    if (!select) return;
    const current = select.value;
    const services = [...new Set(rows.map((row) => row.servizioNome).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'it'));
    select.innerHTML = '<option value="">Tutti i servizi</option>'
        + services.map((service) => `<option value="${escapeHtml(service)}">${escapeHtml(service)}</option>`).join('');
    if (services.includes(current)) select.value = current;
}

function getFilters() {
    return {
        search: String(document.getElementById('incident-search')?.value || '').trim().toLowerCase(),
        severity: String(document.getElementById('incident-severity-filter')?.value || ''),
        service: String(document.getElementById('incident-service-filter')?.value || '')
    };
}

function applyFilters() {
    const filters = getFilters();
    state.filteredRows = state.rows.filter((row) => {
        const closure = parseClosureData(row.causa);
        const searchable = [
            row.id,
            row.tipologia,
            row.servizioCodice,
            row.servizioNome,
            row.severita,
            closure.cause,
            closure.resolution
        ].join(' ').toLowerCase();
        return (!filters.search || searchable.includes(filters.search))
            && (!filters.severity || normalizeSeverity(row.severita) === filters.severity)
            && (!filters.service || row.servizioNome === filters.service);
    });
    state.currentPage = 1;
    renderTable();
}

function paginatedRows() {
    const start = (state.currentPage - 1) * state.pageSize;
    return state.filteredRows.slice(start, start + state.pageSize);
}

function totalPages() {
    return Math.max(1, Math.ceil(state.filteredRows.length / state.pageSize));
}

function renderTable() {
    const tbody = document.getElementById('incident-list-body');
    if (!tbody) return;
    const isClosed = state.mode === 'closed';
    const rows = paginatedRows();

    if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="table-state">Nessun incidente ${isClosed ? 'chiuso' : 'aperto'} corrispondente ai filtri.</td></tr>`;
    } else {
        tbody.innerHTML = rows.map((incident) => {
            const service = incident.servizioCodice
                ? `${incident.servizioCodice} · ${incident.servizioNome}`
                : incident.servizioNome;
            return `
                <tr>
                    <td class="cell-id">${escapeHtml(incident.id)}</td>
                    <td class="cell-small">${escapeHtml(formatDateTime(incident.inizio))}</td>
                    <td class="cell-small">${escapeHtml(isClosed ? formatDateTime(incident.fine) : '—')}</td>
                    <td class="cell-primary">${escapeHtml(incident.tipologia || 'N/D')}</td>
                    <td class="cell-primary">${escapeHtml(service || 'Non associato')}</td>
                    <td><span class="badge ${severityClass(incident.severita)}">${escapeHtml(normalizeSeverity(incident.severita))}</span></td>
                    <td>${escapeHtml(isClosed ? 'Chiuso' : 'Aperto')}</td>
                    <td class="cell-small">${escapeHtml(incident.classificazioni)}</td>
                    <td class="cell-actions incident-row-actions">
                        <button type="button" class="btn-detail" data-incident-action="detail" data-incident-id="${incident.id}">Dettaglio</button>
                        ${isClosed ? '' : `<button type="button" class="btn-danger" data-incident-action="close" data-incident-id="${incident.id}">Chiudi</button>`}
                    </td>
                </tr>
            `;
        }).join('');
    }

    const pages = totalPages();
    if (state.currentPage > pages) state.currentPage = pages;
    setText('incident-page-indicator', `Pagina ${state.currentPage} di ${pages}`);
    setText('incident-page-status', `${state.filteredRows.length} risultati su ${state.rows.length}`);
    setText('incident-list-status', `${state.filteredRows.length} incidenti ${isClosed ? 'chiusi' : 'aperti'} visualizzati`);

    const previous = document.getElementById('incident-prev-page');
    const next = document.getElementById('incident-next-page');
    if (previous) previous.disabled = state.currentPage <= 1;
    if (next) next.disabled = state.currentPage >= pages;

    const reset = document.getElementById('incident-reset-filters');
    const filters = getFilters();
    if (reset) reset.disabled = !filters.search && !filters.severity && !filters.service;
}

async function showIncidentDetail(id) {
    const dialog = document.getElementById('incident-detail-dialog');
    const content = document.getElementById('incident-detail-content');
    const subtitle = document.getElementById('incident-detail-subtitle');
    if (!dialog || !content) return;

    content.innerHTML = '<p class="table-state">Caricamento dettaglio incidente…</p>';
    if (subtitle) subtitle.textContent = `Incidente #${id}`;
    if (!dialog.open) dialog.showModal();

    try {
        const detail = await fetchIncidentDetail(id);
        const closure = parseClosureData(detail.causa);
        const classifications = detail.classificazioni || [];
        content.innerHTML = `
            <section class="asset-detail-section">
                <h3>Dati principali</h3>
                <dl class="asset-detail-grid">
                    <div><dt>ID</dt><dd>${escapeHtml(detail.id)}</dd></div>
                    <div><dt>Stato</dt><dd>${escapeHtml(detail.fine ? 'Chiuso' : 'Aperto')}</dd></div>
                    <div><dt>Inizio</dt><dd>${escapeHtml(formatDateTime(detail.inizio))}</dd></div>
                    <div><dt>Fine</dt><dd>${escapeHtml(formatDateTime(detail.fine))}</dd></div>
                    <div><dt>Tipologia</dt><dd>${escapeHtml(detail.tipologia || 'N/D')}</dd></div>
                    <div><dt>Severità</dt><dd>${escapeHtml(normalizeSeverity(detail.severita))}</dd></div>
                    <div><dt>Servizio</dt><dd>${escapeHtml(detail.servizioLabel || 'Non associato')}</dd></div>
                    <div><dt>Classificazioni</dt><dd>${escapeHtml(classifications.length)}</dd></div>
                </dl>
            </section>
            <section class="asset-detail-section">
                <h3>Chiusura e risoluzione</h3>
                <dl class="asset-detail-grid">
                    <div class="detail-grid-wide"><dt>Causa accertata</dt><dd>${escapeHtml(closure.cause || 'Non indicata')}</dd></div>
                    <div class="detail-grid-wide"><dt>Risoluzione</dt><dd>${escapeHtml(closure.resolution || 'Non indicata')}</dd></div>
                </dl>
            </section>
            <section class="asset-detail-section">
                <h3>Classificazione ACN</h3>
                ${classifications.length
                    ? `<ul class="incident-classification-list">${classifications.map((item) => `<li><strong>${escapeHtml(item.codice_acn || '—')}</strong> · ${escapeHtml(item.nome_esteso || 'N/D')}</li>`).join('')}</ul>`
                    : '<p class="section-intro">Nessuna classificazione associata.</p>'}
            </section>
        `;
    } catch (error) {
        console.error('Errore dettaglio incidente:', error);
        content.innerHTML = `<p class="error-msg">${escapeHtml(error.message || 'Dettaglio non disponibile.')}</p>`;
    }
}

function localDateTimeValue() {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
}

function openCloseDialog(id) {
    const incident = state.rows.find((row) => Number(row.id) === Number(id));
    const dialog = document.getElementById('incident-close-dialog');
    if (!incident || !dialog) return;

    state.closingIncident = incident;
    setText('incident-close-subtitle', `Incidente #${incident.id} · ${incident.tipologia || 'N/D'}`);
    const closedAt = document.getElementById('incident-close-at');
    const cause = document.getElementById('incident-close-cause');
    const resolution = document.getElementById('incident-close-resolution');
    const acknowledge = document.getElementById('incident-close-acknowledge');
    const confirm = document.getElementById('incident-close-confirm');
    if (closedAt) closedAt.value = localDateTimeValue();
    if (cause) cause.value = '';
    if (resolution) resolution.value = '';
    if (acknowledge) acknowledge.checked = false;
    if (confirm) confirm.disabled = true;
    if (!dialog.open) dialog.showModal();
}

function validateCloseForm() {
    const closedAt = document.getElementById('incident-close-at')?.value;
    const resolution = String(document.getElementById('incident-close-resolution')?.value || '').trim();
    const acknowledge = document.getElementById('incident-close-acknowledge')?.checked;
    const valid = Boolean(closedAt && resolution.length >= 10 && acknowledge);
    const confirm = document.getElementById('incident-close-confirm');
    if (confirm) confirm.disabled = !valid;
    return valid;
}

async function confirmCloseIncident() {
    if (!state.closingIncident || !validateCloseForm()) return;
    const button = document.getElementById('incident-close-confirm');
    const status = document.getElementById('incident-close-status');
    const payload = {
        closedAt: document.getElementById('incident-close-at').value,
        cause: String(document.getElementById('incident-close-cause').value || '').trim(),
        resolution: String(document.getElementById('incident-close-resolution').value || '').trim()
    };

    if (button) {
        button.disabled = true;
        button.textContent = 'Chiusura…';
    }
    if (status) status.textContent = 'Registrazione della chiusura in corso…';

    try {
        await closeIncident(state.closingIncident.id, payload);
        document.getElementById('incident-close-dialog')?.close();
        state.closingIncident = null;
        await loadIncidentManagementView('open');
    } catch (error) {
        console.error('Errore chiusura incidente:', error);
        if (status) status.textContent = error.message || 'Chiusura non riuscita.';
        validateCloseForm();
    } finally {
        if (button) button.textContent = 'Chiudi incidente';
    }
}

function exportRows() {
    return state.filteredRows.map((row) => {
        const closure = parseClosureData(row.causa);
        return {
            ID: row.id,
            Inizio: formatDateTime(row.inizio),
            Fine: formatDateTime(row.fine),
            Tipologia: row.tipologia || 'N/D',
            Servizio: row.servizioCodice ? `${row.servizioCodice} · ${row.servizioNome}` : row.servizioNome,
            Severità: normalizeSeverity(row.severita),
            Stato: row.fine ? 'Chiuso' : 'Aperto',
            Classificazioni: row.classificazioni,
            'Causa accertata': closure.cause,
            Risoluzione: closure.resolution
        };
    });
}

function fileDate() {
    return new Date().toISOString().slice(0, 10);
}

function downloadBlob(content, type, fileName) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function exportCsv() {
    const rows = exportRows();
    if (rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const csv = [headers.map(quote).join(';'), ...rows.map((row) => headers.map((header) => quote(row[header])).join(';'))].join('\r\n');
    downloadBlob(`\uFEFF${csv}`, 'text/csv;charset=utf-8', `incidenti_${state.mode}_${fileDate()}.csv`);
}

async function exportXlsx() {
    const rows = exportRows();
    if (rows.length === 0) return;
    if (typeof window.ExcelJS === 'undefined') {
        throw new Error('Libreria Excel non disponibile. Ricarica la pagina e riprova.');
    }
    const workbook = new window.ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(state.mode === 'closed' ? 'Incidenti chiusi' : 'Incidenti aperti');
    const headers = Object.keys(rows[0]);
    sheet.addRow(headers);
    rows.forEach((row) => sheet.addRow(headers.map((header) => row[header])));
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.columns.forEach((column) => { column.width = 22; });
    const filters = workbook.addWorksheet('Criteri');
    const active = getFilters();
    filters.addRows([
        ['Stato', state.mode === 'closed' ? 'Chiuso' : 'Aperto'],
        ['Ricerca', active.search || 'Nessuna'],
        ['Severità', active.severity || 'Tutte'],
        ['Servizio', active.service || 'Tutti'],
        ['Righe esportate', rows.length]
    ]);
    const buffer = await workbook.xlsx.writeBuffer();
    downloadBlob(buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', `incidenti_${state.mode}_${fileDate()}.xlsx`);
}

function resetFilters() {
    const search = document.getElementById('incident-search');
    const severity = document.getElementById('incident-severity-filter');
    const service = document.getElementById('incident-service-filter');
    if (search) search.value = '';
    if (severity) severity.value = '';
    if (service) service.value = '';
    applyFilters();
}

function bindEvents() {
    if (state.bound) return;
    state.bound = true;

    ['incident-search', 'incident-severity-filter', 'incident-service-filter'].forEach((id) => {
        const element = document.getElementById(id);
        element?.addEventListener(id === 'incident-search' ? 'input' : 'change', applyFilters);
    });
    document.getElementById('incident-reset-filters')?.addEventListener('click', resetFilters);
    document.getElementById('incident-page-size')?.addEventListener('change', (event) => {
        state.pageSize = Number(event.target.value) || PAGE_SIZE_DEFAULT;
        state.currentPage = 1;
        renderTable();
    });
    document.getElementById('incident-prev-page')?.addEventListener('click', () => {
        if (state.currentPage > 1) {
            state.currentPage -= 1;
            renderTable();
        }
    });
    document.getElementById('incident-next-page')?.addEventListener('click', () => {
        if (state.currentPage < totalPages()) {
            state.currentPage += 1;
            renderTable();
        }
    });
    document.getElementById('incident-list-body')?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-incident-action]');
        if (!button) return;
        const id = Number(button.dataset.incidentId);
        if (button.dataset.incidentAction === 'detail') showIncidentDetail(id);
        if (button.dataset.incidentAction === 'close') openCloseDialog(id);
    });
    document.getElementById('incident-export-csv')?.addEventListener('click', exportCsv);
    document.getElementById('incident-export-xlsx')?.addEventListener('click', async () => {
        try { await exportXlsx(); } catch (error) { window.alert(error.message); }
    });
    document.getElementById('incident-list-back-btn')?.addEventListener('click', () => navigateTo('incidenti-aperti', { force: true }));
    ['incident-close-at', 'incident-close-cause', 'incident-close-resolution', 'incident-close-acknowledge'].forEach((id) => {
        const element = document.getElementById(id);
        element?.addEventListener(id === 'incident-close-acknowledge' ? 'change' : 'input', validateCloseForm);
    });
    document.getElementById('incident-close-confirm')?.addEventListener('click', confirmCloseIncident);
    document.getElementById('incident-close-dialog')?.addEventListener('close', () => {
        state.closingIncident = null;
        setText('incident-close-status', 'La chiusura non cancella né archivia automaticamente il record.');
    });
}

export async function loadIncidentManagementView(mode = 'open') {
    state.mode = mode === 'closed' ? 'closed' : 'open';
    state.currentPage = 1;
    configureHeader(state.mode);
    bindEvents();
    showList();

    const tbody = document.getElementById('incident-list-body');
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="table-state">Caricamento incidenti…</td></tr>';
    setText('incident-list-status', 'Caricamento incidenti…');

    try {
        state.rows = await fetchIncidentList({ status: state.mode, limit: 500 });
        populateServiceFilter(state.rows);
        applyFilters();
    } catch (error) {
        console.error('Errore caricamento incidenti:', error);
        if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="error-msg">${escapeHtml(error.message || 'Elenco incidenti non disponibile.')}</td></tr>`;
        setText('incident-list-status', 'Elenco incidenti non disponibile.');
    }
}
