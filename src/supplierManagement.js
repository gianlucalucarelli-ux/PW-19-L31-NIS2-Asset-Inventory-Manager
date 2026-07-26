// ===============================================================================================================
// FILE: src/supplierManagement.js
// DESCRIZIONE: Interfaccia completa per fornitori attivi/cessati, dettaglio, importazione ed esportazione XLSX.
// ===============================================================================================================

import {
    fetchSuppliers,
    fetchSupplierReferences,
    fetchNextSupplierCode,
    insertSupplier,
    updateSupplier,
    archiveSupplier,
    fetchSupplierDetail
} from './supplierService.js?build=20260726-h1';
import { navigateTo, getCurrentRoute } from './router.js?build=20260726-h1';
import { t } from './i18n.js?build=20260726-i1';
import {
    exportRowsToExcel,
    downloadImportTemplate,
    readFirstSheetRows
} from './entitySpreadsheet.js?build=20260726-h1';
import {
    startAuditVerificationWindow,
    verifyAuditRecord,
    verifyAuditRecords
} from './auditVerification.js?build=20260726-i1';

let initialized = false;
let suppliersCache = [];
let archivedSuppliersCache = [];
let filteredSuppliersCache = [];
let referencesCache = null;
let currentPage = 1;
let pageSize = 10;
let archiveCandidate = null;
let pendingImport = null;
let pendingEditSupplier = null;
let activeFormSupplier = null;

function escapeHtml(value) {
    const element = document.createElement('div');
    element.textContent = String(value ?? '');
    return element.innerHTML;
}

function formatDateTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat(document.documentElement.lang === 'en' ? 'en-GB' : 'it-IT', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'Europe/Rome'
    }).format(date);
}

function formatError(error) {
    const code = String(error?.code || '');
    const message = String(error?.message || '').trim();
    if (code === '23505') return t('Codice fornitore già utilizzato.');
    if (code === '23502') return t('Uno o più campi obbligatori non sono stati valorizzati.');
    if (code === '23503') return t('Uno dei riferimenti selezionati non è più disponibile.');
    if (code === '23514') return t('Uno dei valori non rispetta i vincoli previsti dal database.');
    if (code === '42501' || /row-level security|permission denied/i.test(message)) return t('La sessione non dispone dell’autorizzazione necessaria per completare l’operazione.');
    return message || t('Errore operativo non specificato.');
}


function auditVerificationText(result) {
    if (result?.verified) {
        return result.expected > 1
            ? `${result.found}/${result.expected} ${t('eventi Audit verificati')}.`
            : t('Audit Log verificato.');
    }
    if (result?.available === false) {
        return t('Operazione completata. Verifica Audit non disponibile: controlla la sezione Audit Log.');
    }
    return result?.expected > 1
        ? `${result?.found || 0}/${result?.expected || 0} ${t('eventi Audit verificati')}. ${t('Controlla la sezione Audit Log.')}`
        : t('Operazione completata, ma la verifica immediata dell’Audit Log non ha trovato l’evento. Controlla la sezione Audit Log.');
}

function setStatus(id, message, error = false) {
    const element = document.getElementById(id);
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('error-msg', error);
}

function applySupplierFormContext(supplier = null) {
    activeFormSupplier = supplier;
    const isEditing = Boolean(supplier?.id);
    const title = document.getElementById('supplier-form-title');
    const submit = document.getElementById('supplier-submit');

    if (title) title.textContent = isEditing ? t('Modifica fornitore') : t('Nuovo fornitore');
    if (submit) submit.textContent = isEditing ? t('Aggiorna fornitore') : t('Salva fornitore');

    document.dispatchEvent(new CustomEvent('app:workspace-context', {
        detail: {
            section: 'Fornitori',
            label: 'FORNITORI',
            title: isEditing ? 'Modifica fornitore' : 'Nuovo fornitore',
            navigationRoute: isEditing ? 'suppliers' : 'add-supplier'
        }
    }));
}

function readFilters() {
    return {
        query: String(document.getElementById('supplier-search')?.value || '').trim().toLowerCase(),
        type: document.getElementById('supplier-type-filter')?.value || ''
    };
}

function updatePagination(total) {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    currentPage = Math.min(Math.max(currentPage, 1), totalPages);
    const previous = document.getElementById('supplier-page-prev');
    const next = document.getElementById('supplier-page-next');
    const indicator = document.getElementById('supplier-page-indicator');
    const status = document.getElementById('supplier-page-status');
    if (previous) previous.disabled = currentPage <= 1;
    if (next) next.disabled = currentPage >= totalPages || total === 0;
    if (indicator) indicator.textContent = `${t('Pagina')} ${currentPage} ${t('di')} ${totalPages}`;
    if (status) status.textContent = total === 0 ? `0 ${t('risultati')}` : `${((currentPage - 1) * pageSize) + 1}–${Math.min(currentPage * pageSize, total)} ${t('di')} ${total}`;
}

function renderSuppliers() {
    const body = document.getElementById('supplier-table-body');
    if (!body) return;
    const filters = readFilters();
    filteredSuppliersCache = suppliersCache.filter((supplier) => {
        const searchable = [supplier.codice_fornitore, supplier.nome, supplier.indirizzo, supplier.contatto_email, supplier.tipo_fornitore?.nome].join(' ').toLowerCase();
        return (!filters.query || searchable.includes(filters.query))
            && (!filters.type || Number(supplier.tipo_fornitore_id) === Number(filters.type));
    });
    updatePagination(filteredSuppliersCache.length);
    if (filteredSuppliersCache.length === 0) {
        body.innerHTML = `<tr><td colspan="6" class="table-state">${escapeHtml(t('Nessun fornitore disponibile.'))}</td></tr>`;
        return;
    }
    const start = (currentPage - 1) * pageSize;
    body.innerHTML = filteredSuppliersCache.slice(start, start + pageSize).map((supplier) => `
        <tr>
            <td class="cell-primary"><strong>${escapeHtml(supplier.codice_fornitore)}</strong></td>
            <td><strong>${escapeHtml(supplier.nome)}</strong><small>${escapeHtml(supplier.contatto_email || '')}</small></td>
            <td>${escapeHtml(supplier.tipo_fornitore?.nome || 'N/D')}</td>
            <td>${escapeHtml(supplier.indirizzo || 'N/D')}</td>
            <td>${escapeHtml(supplier.contatto_email || 'N/D')}</td>
            <td class="cell-actions">
                <div class="cell-action-group">
                    <button type="button" class="btn-detail" data-supplier-action="detail" data-id="${supplier.id}" aria-haspopup="dialog">${escapeHtml(t('Dettaglio'))}</button>
                    <button type="button" class="btn-edit" data-supplier-action="edit" data-id="${supplier.id}">${escapeHtml(t('Modifica'))}</button>
                    <button type="button" class="btn-archive" data-supplier-action="archive" data-id="${supplier.id}" aria-haspopup="dialog">${escapeHtml(t('Cessa'))}</button>
                </div>
            </td>
        </tr>
    `).join('');
}

async function ensureReferences() {
    if (!referencesCache) referencesCache = await fetchSupplierReferences();
    return referencesCache;
}

function fillFilterOptions() {
    const select = document.getElementById('supplier-type-filter');
    if (!select || !referencesCache) return;
    select.innerHTML = `<option value="">${escapeHtml(t('Tutti i tipi'))}</option>${referencesCache.tipi.map((item) => `<option value="${item.id}">${escapeHtml(item.nome)}</option>`).join('')}`;
}

async function loadSuppliers() {
    const body = document.getElementById('supplier-table-body');
    if (body) body.innerHTML = `<tr><td colspan="6" class="table-state">${escapeHtml(t('Caricamento fornitori…'))}</td></tr>`;
    try {
        [suppliersCache] = await Promise.all([fetchSuppliers({ active: true }), ensureReferences()]);
        fillFilterOptions();
        currentPage = 1;
        renderSuppliers();
        setStatus('supplier-list-status', `${suppliersCache.length} ${t('fornitori attivi')}`);
    } catch (error) {
        console.error('Errore caricamento fornitori:', error);
        suppliersCache = [];
        renderSuppliers();
        setStatus('supplier-list-status', formatError(error), true);
    }
}

async function prepareSupplierForm(supplier = null) {
    await ensureReferences();
    const form = document.getElementById('supplier-form');
    if (!form) return;
    form.reset();
    document.getElementById('supplier-type').innerHTML = referencesCache.tipi.map((item) => `<option value="${item.id}">${escapeHtml(item.nome)}</option>`).join('');
    document.getElementById('supplier-id').value = supplier?.id || '';
    document.getElementById('supplier-code').value = supplier?.codice_fornitore || await fetchNextSupplierCode();
    document.getElementById('supplier-name').value = supplier?.nome || '';
    document.getElementById('supplier-type').value = supplier?.tipo_fornitore_id || referencesCache.tipi[0]?.id || '';
    document.getElementById('supplier-address').value = supplier?.indirizzo || '';
    document.getElementById('supplier-email').value = supplier?.contatto_email || '';
    applySupplierFormContext(supplier);
    setStatus('supplier-form-status', '');
}

async function submitSupplierForm(event) {
    event.preventDefault();
    const id = document.getElementById('supplier-id')?.value;
    const submit = document.getElementById('supplier-submit');
    try {
        submit.disabled = true;
        submit.textContent = t('Salvataggio…');
        const payload = {
            codice_fornitore: document.getElementById('supplier-code')?.value,
            nome: document.getElementById('supplier-name')?.value,
            tipo_fornitore_id: document.getElementById('supplier-type')?.value,
            indirizzo: document.getElementById('supplier-address')?.value,
            contatto_email: document.getElementById('supplier-email')?.value
        };
        const auditStartedAt = startAuditVerificationWindow();
        const operation = id ? 'UPDATE' : 'INSERT';
        const saved = id ? await updateSupplier(id, payload) : await insertSupplier(payload);
        const auditResult = await verifyAuditRecord({
            table: 'fornitore',
            operation,
            recordId: saved.id,
            startedAt: auditStartedAt
        });
        window.alert(`${t('Fornitore salvato correttamente')}: ${saved.codice_fornitore} · ${saved.nome}
${auditVerificationText(auditResult)}`);
        await navigateTo('suppliers', { force: true });
    } catch (error) {
        console.error('Errore salvataggio fornitore:', error);
        setStatus('supplier-form-status', formatError(error), true);
    } finally {
        submit.disabled = false;
        submit.textContent = id ? t('Aggiorna fornitore') : t('Salva fornitore');
    }
}

function detailField(label, value, wide = false) {
    return `
        <div class="asset-detail-field${wide ? ' asset-detail-field--wide' : ''}">
            <dt>${escapeHtml(label)}</dt>
            <dd>${escapeHtml(value || 'N/D')}</dd>
        </div>
    `;
}

function relationSection(title, items, emptyMessage) {
    const body = items.length
        ? `<ul class="asset-detail-relation-list">${items.map((item) => `<li>${item}</li>`).join('')}</ul>`
        : `<p class="asset-detail-empty">${escapeHtml(emptyMessage)}</p>`;
    return `
        <section class="asset-detail-section">
            <div class="asset-detail-section-heading">
                <h3>${escapeHtml(title)}</h3>
                <span class="asset-detail-count">${items.length}</span>
            </div>
            ${body}
        </section>
    `;
}

async function showSupplierDetail(supplier) {
    const dialog = document.getElementById('supplier-detail-dialog');
    const content = document.getElementById('supplier-detail-content');
    const subtitle = document.getElementById('supplier-detail-subtitle');
    if (!dialog || !content) return;

    if (subtitle) subtitle.textContent = `${supplier.codice_fornitore} · ${supplier.nome}`;
    content.innerHTML = `<p class="table-state">${escapeHtml(t('Caricamento dettaglio…'))}</p>`;
    if (!dialog.open) dialog.showModal();

    try {
        const detail = await fetchSupplierDetail(supplier.id);
        const record = detail.supplier;
        if (subtitle) subtitle.textContent = `${record.codice_fornitore} · ${record.nome}`;

        const services = detail.services.map((item) => `
            <div class="asset-detail-relation-title">
                <strong>${escapeHtml(item.servizio.codice_servizio)}</strong>
                <span>${escapeHtml(item.tipo?.codice || item.tipo?.descrizione || '')}</span>
            </div>
            <p>${escapeHtml(item.servizio.nome)}</p>
        `);
        const assets = detail.assets.map((item) => `
            <div class="asset-detail-relation-title">
                <strong>${escapeHtml(item.asset.codice_asset)}</strong>
                <span>${escapeHtml(item.tipo?.codice || item.tipo?.descrizione || '')}</span>
            </div>
            <p>${escapeHtml(item.asset.nome)}</p>
        `);
        const hierarchy = detail.hierarchy.map((item) => `
            <div class="asset-detail-relation-title">
                <strong>${escapeHtml(item.direction)}</strong>
                <span>${escapeHtml(item.related.codice_fornitore)}</span>
            </div>
            <p>${escapeHtml(item.related.nome)}</p>
            ${item.tipo?.codice ? `<small>${escapeHtml(item.tipo.codice)}</small>` : ''}
        `);

        content.innerHTML = `
            <section class="asset-detail-section entity-detail-overview">
                <div class="asset-detail-section-heading"><h3>${escapeHtml(t('Dati fornitore'))}</h3></div>
                <dl class="asset-detail-grid">
                    ${detailField(t('Codice fornitore'), record.codice_fornitore)}
                    ${detailField(t('Nome fornitore'), record.nome)}
                    ${detailField(t('Tipo fornitore'), record.tipo_fornitore?.nome || 'N/D')}
                    ${detailField(t('E-mail contatto'), record.contatto_email || 'N/D')}
                    ${detailField(t('Indirizzo'), record.indirizzo || 'N/D', true)}
                </dl>
            </section>
            <div class="asset-detail-relations entity-detail-relations">
                ${relationSection(t('Servizi collegati'), services, t('Nessun servizio collegato.'))}
                ${relationSection(t('Asset collegati'), assets, t('Nessun asset collegato.'))}
                ${relationSection(t('Gerarchia fornitori'), hierarchy, t('Nessuna relazione di subfornitura.'))}
            </div>
        `;
    } catch (error) {
        content.innerHTML = `
            <section class="asset-detail-section">
                <p class="error-msg">${escapeHtml(formatError(error))}</p>
            </section>
        `;
    }
}

function openArchiveDialog(supplier) {
    archiveCandidate = supplier;
    document.getElementById('supplier-archive-subtitle').textContent = `${supplier.codice_fornitore} · ${supplier.nome}`;
    document.getElementById('supplier-archive-reason').value = '';
    document.getElementById('supplier-archive-confirm').disabled = true;
    setStatus('supplier-archive-status', '');
    document.getElementById('supplier-archive-dialog')?.showModal();
}

async function submitArchive(event) {
    event.preventDefault();
    if (!archiveCandidate) return;
    const button = document.getElementById('supplier-archive-confirm');
    try {
        button.disabled = true;
        const supplierToArchive = archiveCandidate;
        const auditStartedAt = startAuditVerificationWindow();
        const archived = await archiveSupplier(supplierToArchive.id, document.getElementById('supplier-archive-reason')?.value);
        const auditResult = await verifyAuditRecord({
            table: 'fornitore',
            operation: 'UPDATE',
            recordId: archived.id,
            startedAt: auditStartedAt
        });
        document.getElementById('supplier-archive-dialog')?.close();
        archiveCandidate = null;
        await loadSuppliers();
        window.alert(`${t('Fornitore cessato correttamente')}: ${supplierToArchive.codice_fornitore} · ${supplierToArchive.nome}
${auditVerificationText(auditResult)}`);
    } catch (error) {
        setStatus('supplier-archive-status', formatError(error), true);
    } finally {
        button.disabled = false;
    }
}

async function loadArchivedSuppliers() {
    const body = document.getElementById('archived-suppliers-body');
    if (body) body.innerHTML = `<tr><td colspan="6" class="table-state">${escapeHtml(t('Caricamento fornitori cessati…'))}</td></tr>`;
    try {
        archivedSuppliersCache = await fetchSuppliers({ active: false });
        if (!body) return;
        body.innerHTML = archivedSuppliersCache.length === 0
            ? `<tr><td colspan="6" class="table-state">${escapeHtml(t('Nessun fornitore cessato.'))}</td></tr>`
            : archivedSuppliersCache.map((supplier) => `
                <tr>
                    <td><strong>${escapeHtml(supplier.codice_fornitore)}</strong></td>
                    <td>${escapeHtml(supplier.nome)}</td>
                    <td>${escapeHtml(supplier.tipo_fornitore?.nome || 'N/D')}</td>
                    <td>${escapeHtml(formatDateTime(supplier.archiviato_il))}</td>
                    <td>${escapeHtml(supplier.motivo_archiviazione || 'N/D')}</td>
                    <td><button type="button" class="btn-table" data-archived-supplier-id="${supplier.id}">${escapeHtml(t('Visualizza'))}</button></td>
                </tr>
            `).join('');
        setStatus('archived-suppliers-status', `${archivedSuppliersCache.length} ${t('fornitori cessati')}`);
    } catch (error) {
        if (body) body.innerHTML = `<tr><td colspan="6" class="error-msg">${escapeHtml(formatError(error))}</td></tr>`;
    }
}

function exportRows(records) {
    return records.map((supplier) => ({
        codice: supplier.codice_fornitore,
        nome: supplier.nome,
        tipo: supplier.tipo_fornitore?.nome || '',
        indirizzo: supplier.indirizzo || '',
        email: supplier.contatto_email || '',
        archiviatoIl: supplier.archiviato_il ? formatDateTime(supplier.archiviato_il) : '',
        motivo: supplier.motivo_archiviazione || ''
    }));
}

async function exportSuppliers(records, archived = false) {
    await exportRowsToExcel({
        rows: exportRows(records),
        columns: [
            { header: 'Codice fornitore', key: 'codice', width: 24 },
            { header: 'Nome fornitore', key: 'nome', width: 38 },
            { header: 'Tipo fornitore', key: 'tipo', width: 30 },
            { header: 'Indirizzo', key: 'indirizzo', width: 48 },
            { header: 'E-mail contatto', key: 'email', width: 38 },
            ...(archived ? [
                { header: 'Cessato il', key: 'archiviatoIl', width: 24 },
                { header: 'Motivo cessazione', key: 'motivo', width: 52 }
            ] : [])
        ],
        sheetName: archived ? 'Fornitori cessati' : 'Fornitori attivi',
        filename: archived ? 'fornitori_cessati' : 'fornitori_attivi',
        metadata: [{ label: 'Stato', value: archived ? 'Cessati logicamente' : 'Attivi' }]
    });
}

function normalizeKey(value) {
    return String(value ?? '').trim().toLowerCase();
}

function readCell(row, aliases) {
    const keyMap = new Map(Object.keys(row).map((key) => [normalizeKey(key), key]));
    for (const alias of aliases) {
        const actual = keyMap.get(normalizeKey(alias));
        if (actual) return String(row[actual] ?? '').trim();
    }
    return '';
}

function validateImportRows(rows, existingRecords = suppliersCache) {
    const typeMap = new Map(referencesCache.tipi.map((item) => [normalizeKey(item.nome), item]));
    const existingCodes = new Set(existingRecords.map((item) => normalizeKey(item.codice_fornitore)));
    const fileCodes = new Set();
    return rows.map((row, index) => {
        const code = readCell(row, ['Codice fornitore', 'Supplier code']).toUpperCase();
        const name = readCell(row, ['Nome fornitore', 'Supplier name']);
        const typeValue = readCell(row, ['Tipo fornitore', 'Supplier type']);
        const address = readCell(row, ['Indirizzo', 'Address']);
        const email = readCell(row, ['Email contatto', 'E-mail contatto', 'Contact email']).toLowerCase();
        const type = typeMap.get(normalizeKey(typeValue));
        const errors = [];
        if (!/^[A-Z0-9][A-Z0-9_-]{2,79}$/.test(code)) errors.push(t('Codice non valido'));
        if (!name) errors.push(t('Nome obbligatorio'));
        if (!type) errors.push(t('Tipo non riconosciuto'));
        if (!/^\S+@\S+\.\S+$/.test(email)) errors.push(t('E-mail non valida'));
        if (existingCodes.has(normalizeKey(code))) errors.push(t('Codice già presente nel database'));
        if (fileCodes.has(normalizeKey(code))) errors.push(t('Codice duplicato nel file'));
        if (code) fileCodes.add(normalizeKey(code));
        return {
            rowNumber: index + 2,
            code,
            name,
            typeValue,
            email,
            errors,
            payload: errors.length === 0 ? {
                codice_fornitore: code,
                nome: name,
                tipo_fornitore_id: type.id,
                indirizzo: address,
                contatto_email: email
            } : null
        };
    });
}

function renderImportPreview(items) {
    const body = document.getElementById('supplier-import-preview-body');
    const confirm = document.getElementById('supplier-import-confirm');
    const validCount = items.filter((item) => item.payload).length;
    if (body) body.innerHTML = items.map((item) => `
        <tr>
            <td>${item.rowNumber}</td>
            <td>${escapeHtml(item.code || '—')}</td>
            <td>${escapeHtml(item.name || '—')}</td>
            <td>${escapeHtml(item.typeValue || '—')}</td>
            <td>${item.errors.length ? `<span class="error-msg">${escapeHtml(item.errors.join('; '))}</span>` : `<span class="badge status-active">${escapeHtml(t('Valida'))}</span>`}</td>
        </tr>
    `).join('');
    setStatus('supplier-import-status', `${validCount} ${t('righe valide')} · ${items.length - validCount} ${t('righe non valide')}`);
    if (confirm) confirm.disabled = validCount === 0;
}

async function handleImportFile(file) {
    await ensureReferences();
    if (suppliersCache.length === 0) suppliersCache = await fetchSuppliers({ active: true });
    const [rows, allSuppliers] = await Promise.all([
        readFirstSheetRows(file),
        fetchSuppliers({ active: null })
    ]);
    pendingImport = validateImportRows(rows, allSuppliers);
    renderImportPreview(pendingImport);
    document.getElementById('supplier-import-dialog')?.showModal();
}

async function confirmImport() {
    const validItems = (pendingImport ?? []).filter((item) => item.payload);
    if (validItems.length === 0) return;
    const button = document.getElementById('supplier-import-confirm');
    let completed = 0;
    const insertedIds = [];
    const auditStartedAt = startAuditVerificationWindow();
    try {
        button.disabled = true;
        for (const item of validItems) {
            setStatus('supplier-import-status', `${t('Importazione in corso')} ${completed + 1}/${validItems.length}…`);
            const saved = await insertSupplier(item.payload);
            insertedIds.push(saved.id);
            completed += 1;
        }
        const auditResult = await verifyAuditRecords({
            table: 'fornitore',
            operation: 'INSERT',
            recordIds: insertedIds,
            startedAt: auditStartedAt
        });
        document.getElementById('supplier-import-dialog')?.close();
        pendingImport = null;
        window.alert(`${completed} ${t('fornitori importati correttamente')}.
${auditVerificationText(auditResult)}`);
        await loadSuppliers();
    } catch (error) {
        setStatus('supplier-import-status', `${completed}/${validItems.length}: ${formatError(error)}`, true);
    } finally {
        button.disabled = false;
    }
}

async function downloadTemplate() {
    await ensureReferences();
    await downloadImportTemplate({
        sheetName: 'Import fornitori',
        filename: 'modello_import_fornitori',
        columns: [
            { header: 'Codice fornitore', key: 'codice', width: 24 },
            { header: 'Nome fornitore', key: 'nome', width: 38 },
            { header: 'Tipo fornitore', key: 'tipo', width: 30 },
            { header: 'Indirizzo', key: 'indirizzo', width: 48 },
            { header: 'Email contatto', key: 'email', width: 38 }
        ],
        exampleRow: {
            codice: 'FOR-ESEMPIO-001',
            nome: 'Fornitore dimostrativo',
            tipo: referencesCache.tipi[0]?.nome || '',
            indirizzo: 'Indirizzo da sostituire',
            email: 'contatto@example.org'
        },
        referenceSheets: [
            { name: 'Tipi fornitore', columns: [{ header: 'Nome', key: 'name', width: 40 }, { header: 'Descrizione', key: 'description', width: 60 }], rows: referencesCache.tipi.map((item) => ({ name: item.nome, description: item.descrizione || '' })) }
        ]
    });
}

function bindEvents() {
    if (initialized) return;
    initialized = true;
    document.getElementById('supplier-search')?.addEventListener('input', () => { currentPage = 1; renderSuppliers(); });
    document.getElementById('supplier-type-filter')?.addEventListener('change', () => { currentPage = 1; renderSuppliers(); });
    document.getElementById('supplier-filter-reset')?.addEventListener('click', () => {
        document.getElementById('supplier-search').value = '';
        document.getElementById('supplier-type-filter').value = '';
        currentPage = 1;
        renderSuppliers();
    });
    document.getElementById('supplier-page-size')?.addEventListener('change', (event) => { pageSize = Number(event.target.value) || 10; currentPage = 1; renderSuppliers(); });
    document.getElementById('supplier-page-prev')?.addEventListener('click', () => { currentPage -= 1; renderSuppliers(); });
    document.getElementById('supplier-page-next')?.addEventListener('click', () => { currentPage += 1; renderSuppliers(); });
    document.getElementById('supplier-table-body')?.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-supplier-action]');
        if (!button) return;
        const supplier = suppliersCache.find((item) => Number(item.id) === Number(button.dataset.id));
        if (!supplier) return;
        if (button.dataset.supplierAction === 'detail') await showSupplierDetail(supplier);
        else if (button.dataset.supplierAction === 'edit') {
            pendingEditSupplier = supplier;
            await navigateTo('add-supplier', { force: true });
        } else if (button.dataset.supplierAction === 'archive') openArchiveDialog(supplier);
    });
    document.getElementById('supplier-form')?.addEventListener('submit', submitSupplierForm);
    document.getElementById('supplier-form-cancel')?.addEventListener('click', () => navigateTo('suppliers', { force: true }));
    document.getElementById('supplier-archive-form')?.addEventListener('submit', submitArchive);
    document.getElementById('supplier-archive-reason')?.addEventListener('input', (event) => {
        document.getElementById('supplier-archive-confirm').disabled = String(event.target.value || '').trim().length < 5;
    });
    document.getElementById('archived-suppliers-body')?.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-archived-supplier-id]');
        if (!button) return;
        const supplier = archivedSuppliersCache.find((item) => Number(item.id) === Number(button.dataset.archivedSupplierId));
        if (supplier) await showSupplierDetail(supplier);
    });
    document.getElementById('supplier-export-btn')?.addEventListener('click', async () => {
        try { await exportSuppliers(filteredSuppliersCache); } catch (error) { window.alert(formatError(error)); }
    });
    document.getElementById('archived-suppliers-export-btn')?.addEventListener('click', async () => {
        try { await exportSuppliers(archivedSuppliersCache, true); } catch (error) { window.alert(formatError(error)); }
    });
    document.getElementById('supplier-template-btn')?.addEventListener('click', async () => {
        try { await downloadTemplate(); } catch (error) { window.alert(formatError(error)); }
    });
    document.getElementById('supplier-import-btn')?.addEventListener('click', () => document.getElementById('supplier-import-input')?.click());
    document.getElementById('supplier-import-input')?.addEventListener('change', async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        try { await handleImportFile(file); } catch (error) { window.alert(formatError(error)); }
    });
    document.getElementById('supplier-import-confirm')?.addEventListener('click', confirmImport);
    document.addEventListener('click', (event) => {
        const control = event.target.closest('[data-close-dialog^="supplier-"]');
        if (!control) return;
        document.getElementById(control.dataset.closeDialog)?.close();
    });
    document.addEventListener('app:language-changed', () => {
        renderSuppliers();
        if (archivedSuppliersCache.length) loadArchivedSuppliers();
        if (getCurrentRoute() === 'add-supplier') applySupplierFormContext(activeFormSupplier);
    });
}

export async function loadSupplierView(route) {
    bindEvents();
    if (route === 'suppliers') {
        await loadSuppliers();
        return;
    }
    if (route === 'add-supplier') {
        const supplier = pendingEditSupplier;
        pendingEditSupplier = null;
        await prepareSupplierForm(supplier);
        return;
    }
    if (route === 'archived-suppliers') await loadArchivedSuppliers();
}
