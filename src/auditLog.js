// ===============================================================================================================
// FILE: src/auditLog.js
// DESCRIZIONE: Filtri, paginazione, dettaglio ed esportazione controllata dell'Audit Log.
// ===============================================================================================================

import { fetchAuditLogs } from './database.js?build=20260726-d2';

const state = {
    rows: [],
    filtered: [],
    page: 1,
    pageSize: 10,
    initialized: false
};

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function normalize(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLocaleLowerCase('it-IT');
}

function readFirst(row, keys, fallback = '') {
    for (const key of keys) {
        const value = row?.[key];
        if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return fallback;
}

function formatTimestamp(value) {
    if (!value) return 'N/D';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return new Intl.DateTimeFormat('it-IT', {
        timeZone: 'Europe/Rome',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    }).format(date);
}

function getRowId(row) {
    return String(readFirst(row, ['audit_id', 'id'], ''));
}

function getTable(row) {
    return String(readFirst(row, ['tabella', 'tipo_entita'], 'Record applicativo'));
}

function getEntity(row) {
    return String(readFirst(row, ['tipo_entita', 'tabella'], 'Record applicativo'));
}

function getRecord(row) {
    return String(readFirst(row, ['record_visualizzato', 'nome_record', 'codice_record', 'record_id'], 'N/D'));
}

function getUser(row) {
    return String(readFirst(row, ['utente_visualizzato', 'utente_email', 'utente', 'utente_id', 'ruolo_database'], 'Sistema'));
}

function getSearchText(row) {
    return normalize([
        row.testo_ricerca,
        row.operazione,
        getTable(row),
        getEntity(row),
        getRecord(row),
        getUser(row),
        row.asset_collegati,
        row.servizi_collegati,
        row.fornitori_collegati
    ].join(' '));
}

function readFilters() {
    return {
        text: document.getElementById('audit-search')?.value.trim() ?? '',
        table: document.getElementById('audit-filter-table')?.value ?? '',
        operation: document.getElementById('audit-filter-operation')?.value ?? '',
        user: document.getElementById('audit-filter-user')?.value ?? '',
        from: document.getElementById('audit-filter-from')?.value ?? '',
        to: document.getElementById('audit-filter-to')?.value ?? ''
    };
}

function filterRows() {
    const filters = readFilters();
    const text = normalize(filters.text);
    const start = filters.from ? new Date(`${filters.from}T00:00:00`) : null;
    const end = filters.to ? new Date(`${filters.to}T23:59:59.999`) : null;

    state.filtered = state.rows.filter((row) => {
        const rowDate = row.data_modifica ? new Date(row.data_modifica) : null;
        if (text && !getSearchText(row).includes(text)) return false;
        if (filters.table && getTable(row) !== filters.table) return false;
        if (filters.operation && String(row.operazione ?? '') !== filters.operation) return false;
        if (filters.user && getUser(row) !== filters.user) return false;
        if (start && (!rowDate || Number.isNaN(rowDate.getTime()) || rowDate < start)) return false;
        if (end && (!rowDate || Number.isNaN(rowDate.getTime()) || rowDate > end)) return false;
        return true;
    });
}

function populateSelect(id, values, placeholder) {
    const select = document.getElementById(id);
    if (!select) return;
    const current = select.value;
    const options = [...new Set(values.filter(Boolean))]
        .sort((a, b) => String(a).localeCompare(String(b), 'it'));

    select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>${options
        .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
        .join('')}`;
    if (options.includes(current)) select.value = current;
}

function populateFilters() {
    populateSelect('audit-filter-table', state.rows.map(getTable), 'Tutte le tabelle');
    populateSelect('audit-filter-operation', state.rows.map((row) => String(row.operazione ?? '')), 'Tutte le operazioni');
    populateSelect('audit-filter-user', state.rows.map(getUser), 'Tutti gli utenti');
}

function updatePagination() {
    const total = state.filtered.length;
    const pages = Math.max(1, Math.ceil(total / state.pageSize));
    state.page = Math.min(Math.max(1, state.page), pages);

    const start = total === 0 ? 0 : (state.page - 1) * state.pageSize + 1;
    const end = Math.min(state.page * state.pageSize, total);
    const status = document.getElementById('audit-page-status');
    const indicator = document.getElementById('audit-page-indicator');
    const previous = document.getElementById('audit-page-prev');
    const next = document.getElementById('audit-page-next');

    if (status) status.textContent = total === 0 ? 'Nessun evento' : `${start}-${end} di ${total} eventi`;
    if (indicator) indicator.textContent = `Pagina ${state.page} di ${pages}`;
    if (previous) previous.disabled = state.page <= 1 || total === 0;
    if (next) next.disabled = state.page >= pages || total === 0;
}

function renderRows() {
    const tbody = document.getElementById('audit-table-body');
    if (!tbody) return;

    filterRows();
    updatePagination();

    const start = (state.page - 1) * state.pageSize;
    const rows = state.filtered.slice(start, start + state.pageSize);

    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="table-state">Nessun evento corrisponde ai filtri.</td></tr>';
    } else {
        tbody.innerHTML = rows.map((row) => `
            <tr>
                <td class="cell-small">${escapeHtml(formatTimestamp(row.data_modifica))}</td>
                <td class="cell-primary">${escapeHtml(row.operazione || 'OPERAZIONE')}</td>
                <td class="cell-small">${escapeHtml(getEntity(row))}</td>
                <td class="cell-primary">${escapeHtml(getRecord(row))}</td>
                <td class="cell-small">${escapeHtml(getUser(row))}</td>
                <td class="cell-actions">
                    <button class="btn-secondary audit-detail-button" type="button" data-audit-id="${escapeHtml(getRowId(row))}" aria-haspopup="dialog">Dettaglio</button>
                </td>
            </tr>
        `).join('');
    }

    const filterStatus = document.getElementById('audit-filter-status');
    const exportButton = document.getElementById('audit-export');
    if (filterStatus) filterStatus.textContent = `${state.filtered.length} eventi filtrati su ${state.rows.length} caricati.`;
    if (exportButton) exportButton.disabled = state.filtered.length === 0;

    tbody.querySelectorAll('.audit-detail-button').forEach((button) => {
        button.addEventListener('click', () => {
            const row = state.rows.find((item) => getRowId(item) === button.dataset.auditId);
            if (row) openDetail(row);
        });
    });
}

function prettyJson(value) {
    if (value === null || value === undefined || value === '') return 'Nessun valore disponibile.';
    try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        return JSON.stringify(parsed, null, 2);
    } catch {
        return String(value);
    }
}

function detailField(label, value) {
    return `<div class="asset-detail-field"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || 'N/D')}</dd></div>`;
}

function openDetail(row) {
    const dialog = document.getElementById('audit-detail-dialog');
    const subtitle = document.getElementById('audit-detail-subtitle');
    const overview = document.getElementById('audit-detail-overview');
    const previous = document.getElementById('audit-detail-before');
    const next = document.getElementById('audit-detail-after');
    if (!dialog || !overview || !previous || !next) return;

    if (subtitle) subtitle.textContent = `${row.operazione || 'Operazione'} · ${getRecord(row)}`;
    overview.innerHTML = `
        <dl class="asset-detail-grid">
            ${detailField('Data e ora', formatTimestamp(row.data_modifica))}
            ${detailField('Tabella', getTable(row))}
            ${detailField('Entità', getEntity(row))}
            ${detailField('Record', getRecord(row))}
            ${detailField('Utente', getUser(row))}
            ${detailField('AAL', readFirst(row, ['livello_autenticazione'], 'N/D'))}
            ${detailField('Ruolo JWT', readFirst(row, ['ruolo_jwt'], 'N/D'))}
            ${detailField('Ruolo database', readFirst(row, ['ruolo_database'], 'N/D'))}
            ${detailField('Asset collegati', readFirst(row, ['asset_collegati'], 'Nessuno'))}
            ${detailField('Servizi collegati', readFirst(row, ['servizi_collegati'], 'Nessuno'))}
            ${detailField('Fornitori collegati', readFirst(row, ['fornitori_collegati'], 'Nessuno'))}
        </dl>`;
    previous.textContent = prettyJson(readFirst(row, ['valore_precedente_jsonb', 'valore_precedente'], null));
    next.textContent = prettyJson(readFirst(row, ['valore_nuovo_jsonb', 'valore_nuovo'], null));
    dialog.showModal();
}

function resetFilters() {
    ['audit-search', 'audit-filter-table', 'audit-filter-operation', 'audit-filter-user', 'audit-filter-from', 'audit-filter-to']
        .forEach((id) => {
            const element = document.getElementById(id);
            if (element) element.value = '';
        });
    state.page = 1;
    renderRows();
}

function formatDateForFile(date = new Date()) {
    return new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Europe/Rome',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(date);
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

async function exportAudit() {
    const button = document.getElementById('audit-export');
    if (state.filtered.length === 0) return;
    const original = button?.textContent || 'Esporta risultati';

    try {
        if (button) {
            button.disabled = true;
            button.textContent = 'Esportazione…';
        }

        const records = state.filtered.map((row) => ({
            'Data e ora': formatTimestamp(row.data_modifica),
            Operazione: row.operazione || '',
            Tabella: getTable(row),
            Entita: getEntity(row),
            Record: getRecord(row),
            Utente: getUser(row),
            AAL: readFirst(row, ['livello_autenticazione'], ''),
            'Ruolo JWT': readFirst(row, ['ruolo_jwt'], ''),
            Asset: readFirst(row, ['asset_collegati'], ''),
            Servizi: readFirst(row, ['servizi_collegati'], ''),
            Fornitori: readFirst(row, ['fornitori_collegati'], ''),
            'Valore precedente': prettyJson(readFirst(row, ['valore_precedente_jsonb', 'valore_precedente'], null)),
            'Valore nuovo': prettyJson(readFirst(row, ['valore_nuovo_jsonb', 'valore_nuovo'], null))
        }));

        if (window.ExcelJS) {
            const workbook = new window.ExcelJS.Workbook();
            workbook.creator = 'NIS2 Asset Inventory Manager';
            workbook.created = new Date();
            const sheet = workbook.addWorksheet('Audit filtrato', { views: [{ state: 'frozen', ySplit: 1 }] });
            sheet.columns = Object.keys(records[0]).map((key) => ({ header: key, key, width: Math.min(45, Math.max(14, key.length + 4)) }));
            sheet.addRows(records);
            sheet.getRow(1).font = { bold: true };
            sheet.autoFilter = { from: 'A1', to: `${sheet.getColumn(sheet.columnCount).letter}1` };
            sheet.eachRow((row) => row.alignment = { vertical: 'top', wrapText: true });

            const criteria = workbook.addWorksheet('Criteri');
            const filters = readFilters();
            criteria.addRows([
                ['Esportato il', formatTimestamp(new Date())],
                ['Eventi esportati', state.filtered.length],
                ['Ricerca', filters.text || 'Nessuna'],
                ['Tabella', filters.table || 'Tutte'],
                ['Operazione', filters.operation || 'Tutte'],
                ['Utente', filters.user || 'Tutti'],
                ['Dal', filters.from || 'Non impostato'],
                ['Al', filters.to || 'Non impostato']
            ]);
            criteria.getColumn(1).font = { bold: true };
            criteria.columns = [{ width: 22 }, { width: 45 }];

            const buffer = await workbook.xlsx.writeBuffer();
            downloadBlob(
                new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
                `audit_log_${formatDateForFile()}.xlsx`
            );
        } else {
            const headers = Object.keys(records[0]);
            const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
            const csv = [headers.map(quote).join(';'), ...records.map((row) => headers.map((key) => quote(row[key])).join(';'))].join('\n');
            downloadBlob(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }), `audit_log_${formatDateForFile()}.csv`);
        }
    } finally {
        if (button) {
            button.disabled = state.filtered.length === 0;
            button.textContent = original;
        }
    }
}

function bindControls() {
    if (state.initialized) return;
    state.initialized = true;

    ['audit-search', 'audit-filter-table', 'audit-filter-operation', 'audit-filter-user', 'audit-filter-from', 'audit-filter-to']
        .forEach((id) => {
            const element = document.getElementById(id);
            element?.addEventListener(element.tagName === 'INPUT' && element.type === 'search' ? 'input' : 'change', () => {
                state.page = 1;
                renderRows();
            });
        });

    document.getElementById('audit-filter-reset')?.addEventListener('click', resetFilters);
    document.getElementById('audit-export')?.addEventListener('click', exportAudit);
    document.getElementById('audit-page-prev')?.addEventListener('click', () => {
        if (state.page > 1) {
            state.page -= 1;
            renderRows();
        }
    });
    document.getElementById('audit-page-next')?.addEventListener('click', () => {
        if (state.page * state.pageSize < state.filtered.length) {
            state.page += 1;
            renderRows();
        }
    });
    document.getElementById('audit-page-size')?.addEventListener('change', (event) => {
        state.pageSize = Number(event.target.value) || 10;
        state.page = 1;
        renderRows();
    });
}

export async function loadAndRenderAuditLog() {
    const tbody = document.getElementById('audit-table-body');
    if (!tbody) return;

    bindControls();
    tbody.innerHTML = '<tr><td colspan="6" class="table-state">Caricamento log in corso…</td></tr>';

    try {
        state.rows = await fetchAuditLogs(1000);
        state.page = 1;
        populateFilters();
        renderRows();
    } catch (error) {
        console.error('Errore durante il caricamento dell’Audit Log:', error);
        state.rows = [];
        state.filtered = [];
        tbody.innerHTML = `<tr><td colspan="6" class="error-msg">Errore: ${escapeHtml(error.message)}</td></tr>`;
        const status = document.getElementById('audit-filter-status');
        if (status) status.textContent = 'Audit Log non disponibile.';
        updatePagination();
    }
}
