// ===============================================================================================================
// FILE: src/serviceManagement.js
// DESCRIZIONE: Interfaccia completa per servizi attivi/cessati, dettaglio, importazione ed esportazione XLSX.
// ===============================================================================================================

import {
    fetchServices,
    fetchServiceById,
    fetchServiceReferences,
    fetchNextServiceCode,
    insertService,
    updateService,
    archiveService,
    fetchServiceDetail
} from './serviceService.js?build=20260726-h1';
import { navigateTo, getCurrentRoute } from './router.js?build=20260727-m1';
import { t } from './i18n.js?build=20260727-m1';
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
let servicesCache = [];
let archivedServicesCache = [];
let filteredServicesCache = [];
let referencesCache = null;
let currentPage = 1;
let pageSize = 10;
let archiveCandidate = null;
let pendingImport = null;
let pendingEditService = null;
let activeFormService = null;

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
    if (code === '23505') return t('Codice servizio già utilizzato.');
    if (code === '23502') return t('Uno o più campi obbligatori non sono stati valorizzati.');
    if (code === '23503') return t('Uno dei riferimenti selezionati non è più disponibile.');
    if (code === '23514') return t('Uno dei valori non rispetta i vincoli previsti dal database.');
    if (code === '42501' || /row-level security|permission denied/i.test(message)) {
        return t('La sessione non dispone dell’autorizzazione necessaria per completare l’operazione.');
    }
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

function applyServiceFormContext(service = null) {
    activeFormService = service;
    const isEditing = Boolean(service?.id);
    const title = document.getElementById('service-form-title');
    const submit = document.getElementById('service-submit');

    if (title) title.textContent = isEditing ? t('Modifica servizio') : t('Nuovo servizio');
    if (submit) submit.textContent = isEditing ? t('Aggiorna servizio') : t('Salva servizio');

    document.dispatchEvent(new CustomEvent('app:workspace-context', {
        detail: {
            section: 'Servizi',
            label: 'SERVIZI',
            title: isEditing ? 'Modifica servizio' : 'Nuovo servizio',
            navigationRoute: isEditing ? 'services' : 'add-service'
        }
    }));
}

function personLabel(person) {
    if (!person) return 'N/D';
    return `${person.nome || ''} ${person.cognome || ''}`.trim() || person.email || 'N/D';
}

function serviceStateLabel(service) {
    return service.stato_servizio?.descrizione || service.stato_servizio?.codice || 'N/D';
}

function readFilters() {
    return {
        query: String(document.getElementById('service-search')?.value || '').trim().toLowerCase(),
        organization: document.getElementById('service-organization-filter')?.value || '',
        type: document.getElementById('service-type-filter')?.value || '',
        state: document.getElementById('service-state-filter')?.value || ''
    };
}

function updatePagination(total) {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    currentPage = Math.min(Math.max(currentPage, 1), totalPages);
    const previous = document.getElementById('service-page-prev');
    const next = document.getElementById('service-page-next');
    const indicator = document.getElementById('service-page-indicator');
    const status = document.getElementById('service-page-status');
    if (previous) previous.disabled = currentPage <= 1;
    if (next) next.disabled = currentPage >= totalPages || total === 0;
    if (indicator) indicator.textContent = `${t('Pagina')} ${currentPage} ${t('di')} ${totalPages}`;
    if (status) {
        if (total === 0) status.textContent = `0 ${t('risultati')}`;
        else {
            const start = ((currentPage - 1) * pageSize) + 1;
            const end = Math.min(currentPage * pageSize, total);
            status.textContent = `${start}–${end} ${t('di')} ${total}`;
        }
    }
}

function renderServices() {
    const body = document.getElementById('service-table-body');
    if (!body) return;
    const filters = readFilters();
    filteredServicesCache = servicesCache.filter((service) => {
        const searchable = [
            service.codice_servizio,
            service.nome,
            service.descrizione,
            service.organizzazione?.nome,
            service.tipo_servizio?.nome,
            personLabel(service.responsabile)
        ].join(' ').toLowerCase();
        return (!filters.query || searchable.includes(filters.query))
            && (!filters.organization || Number(service.organizzazione_id) === Number(filters.organization))
            && (!filters.type || Number(service.tipo_servizio_id) === Number(filters.type))
            && (!filters.state || Number(service.stato_servizio_id) === Number(filters.state));
    });

    updatePagination(filteredServicesCache.length);
    if (filteredServicesCache.length === 0) {
        body.innerHTML = `<tr><td colspan="7" class="table-state">${escapeHtml(t('Nessun servizio disponibile.'))}</td></tr>`;
        return;
    }
    const start = (currentPage - 1) * pageSize;
    const rows = filteredServicesCache.slice(start, start + pageSize);
    body.innerHTML = rows.map((service) => `
        <tr>
            <td class="cell-primary"><strong>${escapeHtml(service.codice_servizio)}</strong></td>
            <td><strong>${escapeHtml(service.nome)}</strong><small>${escapeHtml(service.descrizione || '')}</small></td>
            <td>${escapeHtml(service.organizzazione?.nome || 'N/D')}</td>
            <td>${escapeHtml(service.tipo_servizio?.nome || 'N/D')}</td>
            <td><span class="badge status-active">${escapeHtml(serviceStateLabel(service))}</span></td>
            <td>${escapeHtml(personLabel(service.responsabile))}</td>
            <td class="cell-actions">
                <div class="cell-action-group">
                    <button type="button" class="btn-detail" data-service-action="detail" data-id="${service.id}" aria-haspopup="dialog">${escapeHtml(t('Dettaglio'))}</button>
                    <button type="button" class="btn-edit" data-service-action="edit" data-id="${service.id}">${escapeHtml(t('Modifica'))}</button>
                    <button type="button" class="btn-archive" data-service-action="archive" data-id="${service.id}" aria-haspopup="dialog">${escapeHtml(t('Cessa'))}</button>
                </div>
            </td>
        </tr>
    `).join('');
}

async function ensureReferences() {
    if (!referencesCache) referencesCache = await fetchServiceReferences();
    return referencesCache;
}

function fillFilterOptions() {
    if (!referencesCache) return;
    const organization = document.getElementById('service-organization-filter');
    const type = document.getElementById('service-type-filter');
    const state = document.getElementById('service-state-filter');
    if (organization) organization.innerHTML = `<option value="">${escapeHtml(t('Tutte le organizzazioni'))}</option>${referencesCache.organizzazioni.map((item) => `<option value="${item.id}">${escapeHtml(item.nome)}</option>`).join('')}`;
    if (type) type.innerHTML = `<option value="">${escapeHtml(t('Tutti i tipi'))}</option>${referencesCache.tipi.map((item) => `<option value="${item.id}">${escapeHtml(item.nome)}</option>`).join('')}`;
    if (state) state.innerHTML = `<option value="">${escapeHtml(t('Tutti gli stati'))}</option>${referencesCache.stati.map((item) => `<option value="${item.id}">${escapeHtml(item.descrizione || item.codice)}</option>`).join('')}`;
}

async function loadServices() {
    const body = document.getElementById('service-table-body');
    if (body) body.innerHTML = `<tr><td colspan="7" class="table-state">${escapeHtml(t('Caricamento servizi…'))}</td></tr>`;
    setStatus('service-list-status', t('Caricamento servizi…'));
    try {
        [servicesCache] = await Promise.all([fetchServices({ active: true }), ensureReferences()]);
        fillFilterOptions();
        currentPage = 1;
        renderServices();
        setStatus('service-list-status', `${servicesCache.length} ${t('servizi attivi')}`);
    } catch (error) {
        console.error('Errore caricamento servizi:', error);
        servicesCache = [];
        renderServices();
        setStatus('service-list-status', formatError(error), true);
    }
}

function fillSelect(id, rows, labelFactory, placeholder = '') {
    const select = document.getElementById(id);
    if (!select) return;
    select.innerHTML = `${placeholder ? `<option value="">${escapeHtml(placeholder)}</option>` : ''}${rows.map((row) => `<option value="${row.id}">${escapeHtml(labelFactory(row))}</option>`).join('')}`;
}

function updateResponsibleOptions(selectedValue = '') {
    if (!referencesCache) return;
    const organizationId = Number(document.getElementById('service-organization')?.value || 0);
    const people = referencesCache.responsabili.filter((person) => Number(person.organizzazione_id) === organizationId);
    fillSelect('service-responsible', people, (person) => `${person.cognome} ${person.nome} · ${person.email}`, t('Nessun responsabile associato'));
    const select = document.getElementById('service-responsible');
    if (select && selectedValue) select.value = String(selectedValue);
}

async function prepareServiceForm(service = null) {
    await ensureReferences();
    const form = document.getElementById('service-form');
    if (!form) return;
    form.reset();
    fillSelect('service-organization', referencesCache.organizzazioni, (item) => `${item.codice_organizzazione || ''} · ${item.nome}`);
    fillSelect('service-type', referencesCache.tipi, (item) => item.nome);
    fillSelect('service-state', referencesCache.stati, (item) => `${item.codice} · ${item.descrizione || ''}`);

    const id = document.getElementById('service-id');
    const code = document.getElementById('service-code');
    if (id) id.value = service?.id || '';
    if (code) code.value = service?.codice_servizio || await fetchNextServiceCode();
    document.getElementById('service-name').value = service?.nome || '';
    document.getElementById('service-description').value = service?.descrizione || '';
    document.getElementById('service-organization').value = service?.organizzazione_id || referencesCache.organizzazioni[0]?.id || '';
    document.getElementById('service-type').value = service?.tipo_servizio_id || referencesCache.tipi[0]?.id || '';
    document.getElementById('service-state').value = service?.stato_servizio_id || referencesCache.stati[0]?.id || '';
    updateResponsibleOptions(service?.responsabile_id || '');
    applyServiceFormContext(service);
    setStatus('service-form-status', '');
}

async function submitServiceForm(event) {
    event.preventDefault();
    const id = document.getElementById('service-id')?.value;
    const submit = document.getElementById('service-submit');
    try {
        if (submit) {
            submit.disabled = true;
            submit.textContent = t('Salvataggio…');
        }
        const payload = {
            codice_servizio: document.getElementById('service-code')?.value,
            nome: document.getElementById('service-name')?.value,
            descrizione: document.getElementById('service-description')?.value,
            organizzazione_id: document.getElementById('service-organization')?.value,
            tipo_servizio_id: document.getElementById('service-type')?.value,
            stato_servizio_id: document.getElementById('service-state')?.value,
            responsabile_id: document.getElementById('service-responsible')?.value
        };
        const auditStartedAt = startAuditVerificationWindow();
        const operation = id ? 'UPDATE' : 'INSERT';
        const saved = id ? await updateService(id, payload) : await insertService(payload);
        const auditResult = await verifyAuditRecord({
            table: 'servizio',
            operation,
            recordId: saved.id,
            startedAt: auditStartedAt
        });
        window.alert(`${t('Servizio salvato correttamente')}: ${saved.codice_servizio} · ${saved.nome}
${auditVerificationText(auditResult)}`);
        await navigateTo('services', { force: true });
    } catch (error) {
        console.error('Errore salvataggio servizio:', error);
        setStatus('service-form-status', formatError(error), true);
    } finally {
        if (submit) {
            submit.disabled = false;
            submit.textContent = id ? t('Aggiorna servizio') : t('Salva servizio');
        }
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

async function showServiceDetail(service) {
    const dialog = document.getElementById('service-detail-dialog');
    const content = document.getElementById('service-detail-content');
    const subtitle = document.getElementById('service-detail-subtitle');
    if (!dialog || !content) return;

    if (subtitle) subtitle.textContent = `${service.codice_servizio} · ${service.nome}`;
    content.innerHTML = `<p class="table-state">${escapeHtml(t('Caricamento dettaglio…'))}</p>`;
    if (!dialog.open) dialog.showModal();

    try {
        const detail = await fetchServiceDetail(service.id);
        const record = detail.service;
        if (subtitle) subtitle.textContent = `${record.codice_servizio} · ${record.nome}`;

        const assets = detail.assets.map((item) => `
            <div class="asset-detail-relation-title">
                <strong>${escapeHtml(item.asset.codice_asset)}</strong>
                <span>${escapeHtml(item.tipo?.codice || item.tipo?.descrizione || '')}</span>
            </div>
            <p>${escapeHtml(item.asset.nome)}</p>
        `);
        const suppliers = detail.suppliers.map((item) => `
            <div class="asset-detail-relation-title">
                <strong>${escapeHtml(item.fornitore.codice_fornitore)}</strong>
                <span>${escapeHtml(item.tipo?.codice || item.tipo?.descrizione || '')}</span>
            </div>
            <p>${escapeHtml(item.fornitore.nome)}</p>
        `);
        const hierarchy = detail.hierarchy.map((item) => `
            <div class="asset-detail-relation-title">
                <strong>${escapeHtml(item.direction)}</strong>
                <span>${escapeHtml(item.related.codice_servizio)}</span>
            </div>
            <p>${escapeHtml(item.related.nome)}</p>
        `);
        const incidents = detail.incidents.map((item) => `
            <div class="asset-detail-relation-title">
                <strong>#${escapeHtml(item.id)}</strong>
                <span>${escapeHtml(item.fine ? t('Chiuso') : t('Aperto'))}</span>
            </div>
            <p>${escapeHtml(item.tipologia || 'Incidente')} · ${escapeHtml(item.severita || 'N/D')}</p>
        `);

        content.innerHTML = `
            <section class="asset-detail-section entity-detail-overview">
                <div class="asset-detail-section-heading"><h3>${escapeHtml(t('Dati servizio'))}</h3></div>
                <dl class="asset-detail-grid">
                    ${detailField(t('Codice servizio'), record.codice_servizio)}
                    ${detailField(t('Nome servizio'), record.nome)}
                    ${detailField(t('Soggetto NIS2'), record.organizzazione?.nome || 'N/D')}
                    ${detailField(t('Tipo servizio'), record.tipo_servizio?.nome || 'N/D')}
                    ${detailField(t('Stato servizio'), serviceStateLabel(record))}
                    ${detailField(t('Responsabile'), personLabel(record.responsabile))}
                    ${detailField(t('Descrizione'), record.descrizione || 'N/D', true)}
                </dl>
            </section>
            <div class="asset-detail-relations entity-detail-relations">
                ${relationSection(t('Asset collegati'), assets, t('Nessun asset collegato.'))}
                ${relationSection(t('Fornitori collegati'), suppliers, t('Nessun fornitore collegato.'))}
                ${relationSection(t('Gerarchia servizi'), hierarchy, t('Nessuna relazione gerarchica.'))}
                ${relationSection(t('Incidenti recenti'), incidents, t('Nessun incidente associato.'))}
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

function openArchiveDialog(service) {
    archiveCandidate = service;
    document.getElementById('service-archive-subtitle').textContent = `${service.codice_servizio} · ${service.nome}`;
    document.getElementById('service-archive-reason').value = '';
    document.getElementById('service-archive-confirm').disabled = true;
    setStatus('service-archive-status', '');
    document.getElementById('service-archive-dialog')?.showModal();
}

async function submitArchive(event) {
    event.preventDefault();
    if (!archiveCandidate) return;
    const submit = document.getElementById('service-archive-confirm');
    try {
        submit.disabled = true;
        const serviceToArchive = archiveCandidate;
        const auditStartedAt = startAuditVerificationWindow();
        const archived = await archiveService(serviceToArchive.id, document.getElementById('service-archive-reason')?.value);
        const auditResult = await verifyAuditRecord({
            table: 'servizio',
            operation: 'UPDATE',
            recordId: archived.id,
            startedAt: auditStartedAt
        });
        document.getElementById('service-archive-dialog')?.close();
        archiveCandidate = null;
        await loadServices();
        window.alert(`${t('Servizio cessato correttamente')}: ${serviceToArchive.codice_servizio} · ${serviceToArchive.nome}
${auditVerificationText(auditResult)}`);
    } catch (error) {
        setStatus('service-archive-status', formatError(error), true);
    } finally {
        if (submit) submit.disabled = false;
    }
}

async function loadArchivedServices() {
    const body = document.getElementById('archived-services-body');
    if (body) body.innerHTML = `<tr><td colspan="6" class="table-state">${escapeHtml(t('Caricamento servizi cessati…'))}</td></tr>`;
    try {
        archivedServicesCache = await fetchServices({ active: false });
        if (!body) return;
        body.innerHTML = archivedServicesCache.length === 0
            ? `<tr><td colspan="6" class="table-state">${escapeHtml(t('Nessun servizio cessato.'))}</td></tr>`
            : archivedServicesCache.map((service) => `
                <tr>
                    <td><strong>${escapeHtml(service.codice_servizio)}</strong></td>
                    <td>${escapeHtml(service.nome)}</td>
                    <td>${escapeHtml(service.organizzazione?.nome || 'N/D')}</td>
                    <td>${escapeHtml(formatDateTime(service.archiviato_il))}</td>
                    <td>${escapeHtml(service.motivo_archiviazione || 'N/D')}</td>
                    <td><button type="button" class="btn-table" data-archived-service-id="${service.id}">${escapeHtml(t('Visualizza'))}</button></td>
                </tr>
            `).join('');
        setStatus('archived-services-status', `${archivedServicesCache.length} ${t('servizi cessati')}`);
    } catch (error) {
        if (body) body.innerHTML = `<tr><td colspan="6" class="error-msg">${escapeHtml(formatError(error))}</td></tr>`;
    }
}

function activeExportRows(records) {
    return records.map((service) => ({
        codice: service.codice_servizio,
        nome: service.nome,
        organizzazione: service.organizzazione?.nome || '',
        tipo: service.tipo_servizio?.nome || '',
        stato: serviceStateLabel(service),
        responsabile: personLabel(service.responsabile),
        emailResponsabile: service.responsabile?.email || '',
        descrizione: service.descrizione || '',
        archiviatoIl: service.archiviato_il ? formatDateTime(service.archiviato_il) : '',
        motivo: service.motivo_archiviazione || ''
    }));
}

async function exportServices(records, archived = false) {
    await exportRowsToExcel({
        rows: activeExportRows(records),
        columns: [
            { header: 'Codice servizio', key: 'codice', width: 24 },
            { header: 'Nome servizio', key: 'nome', width: 36 },
            { header: 'Organizzazione', key: 'organizzazione', width: 38 },
            { header: 'Tipo servizio', key: 'tipo', width: 28 },
            { header: 'Stato servizio', key: 'stato', width: 28 },
            { header: 'Responsabile', key: 'responsabile', width: 32 },
            { header: 'E-mail responsabile', key: 'emailResponsabile', width: 36 },
            { header: 'Descrizione', key: 'descrizione', width: 52 },
            ...(archived ? [
                { header: 'Cessato il', key: 'archiviatoIl', width: 24 },
                { header: 'Motivo cessazione', key: 'motivo', width: 52 }
            ] : [])
        ],
        sheetName: archived ? 'Servizi cessati' : 'Servizi attivi',
        filename: archived ? 'servizi_cessati' : 'servizi_attivi',
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

function validateImportRows(rows, existingRecords = servicesCache) {
    const refs = referencesCache;
    const organizationMap = new Map(refs.organizzazioni.flatMap((item) => [[normalizeKey(item.nome), item], [normalizeKey(item.codice_organizzazione), item]]));
    const typeMap = new Map(refs.tipi.map((item) => [normalizeKey(item.nome), item]));
    const stateMap = new Map(refs.stati.flatMap((item) => [[normalizeKey(item.codice), item], [normalizeKey(item.descrizione), item]]));
    const peopleMap = new Map(refs.responsabili.map((item) => [normalizeKey(item.email), item]));
    const existingCodes = new Set(existingRecords.map((item) => normalizeKey(item.codice_servizio)));
    const fileCodes = new Set();

    return rows.map((row, index) => {
        const code = readCell(row, ['Codice servizio', 'Service code']).toUpperCase();
        const name = readCell(row, ['Nome servizio', 'Service name']);
        const organizationValue = readCell(row, ['Organizzazione', 'Organisation']);
        const typeValue = readCell(row, ['Tipo servizio', 'Service type']);
        const stateValue = readCell(row, ['Stato servizio', 'Service status']);
        const responsibleEmail = readCell(row, ['Responsabile email', 'Owner email']).toLowerCase();
        const description = readCell(row, ['Descrizione', 'Description']);
        const errors = [];
        const organization = organizationMap.get(normalizeKey(organizationValue));
        const type = typeMap.get(normalizeKey(typeValue));
        const state = stateMap.get(normalizeKey(stateValue));
        const responsible = responsibleEmail ? peopleMap.get(normalizeKey(responsibleEmail)) : null;

        if (!/^[A-Z0-9][A-Z0-9_-]{2,79}$/.test(code)) errors.push(t('Codice non valido'));
        if (!name) errors.push(t('Nome obbligatorio'));
        if (!organization) errors.push(t('Organizzazione non riconosciuta'));
        if (!type) errors.push(t('Tipo non riconosciuto'));
        if (!state) errors.push(t('Stato non riconosciuto'));
        if (responsibleEmail && !responsible) errors.push(t('Responsabile non riconosciuto'));
        if (responsible && organization && Number(responsible.organizzazione_id) !== Number(organization.id)) errors.push(t('Il responsabile appartiene a un’altra organizzazione'));
        if (existingCodes.has(normalizeKey(code))) errors.push(t('Codice già presente nel database'));
        if (fileCodes.has(normalizeKey(code))) errors.push(t('Codice duplicato nel file'));
        if (code) fileCodes.add(normalizeKey(code));

        return {
            rowNumber: index + 2,
            code,
            name,
            organizationValue,
            typeValue,
            stateValue,
            responsibleEmail,
            errors,
            payload: errors.length === 0 ? {
                codice_servizio: code,
                nome: name,
                organizzazione_id: organization.id,
                tipo_servizio_id: type.id,
                stato_servizio_id: state.id,
                responsabile_id: responsible?.id || null,
                descrizione: description
            } : null
        };
    });
}

function renderImportPreview(items) {
    const body = document.getElementById('service-import-preview-body');
    const confirm = document.getElementById('service-import-confirm');
    const validCount = items.filter((item) => item.payload).length;
    if (body) body.innerHTML = items.map((item) => `
        <tr>
            <td>${item.rowNumber}</td>
            <td>${escapeHtml(item.code || '—')}</td>
            <td>${escapeHtml(item.name || '—')}</td>
            <td>${escapeHtml(item.organizationValue || '—')}</td>
            <td>${item.errors.length ? `<span class="error-msg">${escapeHtml(item.errors.join('; '))}</span>` : `<span class="badge status-active">${escapeHtml(t('Valida'))}</span>`}</td>
        </tr>
    `).join('');
    setStatus('service-import-status', `${validCount} ${t('righe valide')} · ${items.length - validCount} ${t('righe non valide')}`);
    if (confirm) confirm.disabled = validCount === 0;
}

async function handleImportFile(file) {
    await ensureReferences();
    if (servicesCache.length === 0) servicesCache = await fetchServices({ active: true });
    const [rows, allServices] = await Promise.all([
        readFirstSheetRows(file),
        fetchServices({ active: null })
    ]);
    pendingImport = validateImportRows(rows, allServices);
    renderImportPreview(pendingImport);
    document.getElementById('service-import-dialog')?.showModal();
}

async function confirmImport() {
    const validItems = (pendingImport ?? []).filter((item) => item.payload);
    if (validItems.length === 0) return;
    const button = document.getElementById('service-import-confirm');
    let completed = 0;
    const insertedIds = [];
    const auditStartedAt = startAuditVerificationWindow();
    try {
        button.disabled = true;
        for (const item of validItems) {
            setStatus('service-import-status', `${t('Importazione in corso')} ${completed + 1}/${validItems.length}…`);
            const saved = await insertService(item.payload);
            insertedIds.push(saved.id);
            completed += 1;
        }
        const auditResult = await verifyAuditRecords({
            table: 'servizio',
            operation: 'INSERT',
            recordIds: insertedIds,
            startedAt: auditStartedAt
        });
        document.getElementById('service-import-dialog')?.close();
        pendingImport = null;
        window.alert(`${completed} ${t('servizi importati correttamente')}.
${auditVerificationText(auditResult)}`);
        await loadServices();
    } catch (error) {
        setStatus('service-import-status', `${completed}/${validItems.length}: ${formatError(error)}`, true);
    } finally {
        if (button) button.disabled = false;
    }
}

async function downloadTemplate() {
    await ensureReferences();
    await downloadImportTemplate({
        sheetName: 'Import servizi',
        filename: 'modello_import_servizi',
        columns: [
            { header: 'Codice servizio', key: 'codice', width: 24 },
            { header: 'Nome servizio', key: 'nome', width: 36 },
            { header: 'Organizzazione', key: 'organizzazione', width: 38 },
            { header: 'Tipo servizio', key: 'tipo', width: 28 },
            { header: 'Stato servizio', key: 'stato', width: 28 },
            { header: 'Responsabile email', key: 'responsabile', width: 36 },
            { header: 'Descrizione', key: 'descrizione', width: 52 }
        ],
        exampleRow: {
            codice: 'SRV-ESEMPIO-001',
            nome: 'Servizio dimostrativo',
            organizzazione: referencesCache.organizzazioni[0]?.codice_organizzazione || referencesCache.organizzazioni[0]?.nome || '',
            tipo: referencesCache.tipi[0]?.nome || '',
            stato: referencesCache.stati[0]?.codice || referencesCache.stati[0]?.descrizione || '',
            responsabile: referencesCache.responsabili[0]?.email || '',
            descrizione: 'Riga dimostrativa da sostituire.'
        },
        referenceSheets: [
            { name: 'Organizzazioni', columns: [{ header: 'Codice', key: 'code', width: 24 }, { header: 'Nome', key: 'name', width: 40 }], rows: referencesCache.organizzazioni.map((item) => ({ code: item.codice_organizzazione, name: item.nome })) },
            { name: 'Tipi servizio', columns: [{ header: 'Nome', key: 'name', width: 40 }], rows: referencesCache.tipi.map((item) => ({ name: item.nome })) },
            { name: 'Stati servizio', columns: [{ header: 'Codice', key: 'code', width: 20 }, { header: 'Descrizione', key: 'description', width: 50 }], rows: referencesCache.stati.map((item) => ({ code: item.codice, description: item.descrizione })) },
            { name: 'Responsabili', columns: [{ header: 'E-mail', key: 'email', width: 40 }, { header: 'Nome', key: 'name', width: 36 }], rows: referencesCache.responsabili.map((item) => ({ email: item.email, name: `${item.cognome} ${item.nome}` })) }
        ]
    });
}

function bindEvents() {
    if (initialized) return;
    initialized = true;

    ['service-search', 'service-organization-filter', 'service-type-filter', 'service-state-filter'].forEach((id) => {
        document.getElementById(id)?.addEventListener(id === 'service-search' ? 'input' : 'change', () => {
            currentPage = 1;
            renderServices();
        });
    });
    document.getElementById('service-filter-reset')?.addEventListener('click', () => {
        ['service-search', 'service-organization-filter', 'service-type-filter', 'service-state-filter'].forEach((id) => {
            const element = document.getElementById(id);
            if (element) element.value = '';
        });
        currentPage = 1;
        renderServices();
    });
    document.getElementById('service-page-size')?.addEventListener('change', (event) => {
        pageSize = Number(event.target.value) || 10;
        currentPage = 1;
        renderServices();
    });
    document.getElementById('service-page-prev')?.addEventListener('click', () => { currentPage -= 1; renderServices(); });
    document.getElementById('service-page-next')?.addEventListener('click', () => { currentPage += 1; renderServices(); });
    document.getElementById('service-table-body')?.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-service-action]');
        if (!button) return;
        const service = servicesCache.find((item) => Number(item.id) === Number(button.dataset.id));
        if (!service) return;
        if (button.dataset.serviceAction === 'detail') await showServiceDetail(service);
        else if (button.dataset.serviceAction === 'edit') {
            pendingEditService = service;
            await navigateTo('add-service', { force: true });
        } else if (button.dataset.serviceAction === 'archive') openArchiveDialog(service);
    });
    document.getElementById('service-form')?.addEventListener('submit', submitServiceForm);
    document.getElementById('service-form-cancel')?.addEventListener('click', () => navigateTo('services', { force: true }));
    document.getElementById('service-organization')?.addEventListener('change', () => updateResponsibleOptions());
    document.getElementById('service-archive-form')?.addEventListener('submit', submitArchive);
    document.getElementById('service-archive-reason')?.addEventListener('input', (event) => {
        document.getElementById('service-archive-confirm').disabled = String(event.target.value || '').trim().length < 5;
    });
    document.getElementById('archived-services-body')?.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-archived-service-id]');
        if (!button) return;
        const service = archivedServicesCache.find((item) => Number(item.id) === Number(button.dataset.archivedServiceId));
        if (service) await showServiceDetail(service);
    });
    document.getElementById('service-export-btn')?.addEventListener('click', async () => {
        try { await exportServices(filteredServicesCache); } catch (error) { window.alert(formatError(error)); }
    });
    document.getElementById('archived-services-export-btn')?.addEventListener('click', async () => {
        try { await exportServices(archivedServicesCache, true); } catch (error) { window.alert(formatError(error)); }
    });
    document.getElementById('service-template-btn')?.addEventListener('click', async () => {
        try { await downloadTemplate(); } catch (error) { window.alert(formatError(error)); }
    });
    document.getElementById('service-import-btn')?.addEventListener('click', () => document.getElementById('service-import-input')?.click());
    document.getElementById('service-import-input')?.addEventListener('change', async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        try { await handleImportFile(file); } catch (error) { window.alert(formatError(error)); }
    });
    document.getElementById('service-import-confirm')?.addEventListener('click', confirmImport);
    document.addEventListener('click', (event) => {
        const control = event.target.closest('[data-close-dialog^="service-"]');
        if (!control) return;
        document.getElementById(control.dataset.closeDialog)?.close();
    });
    document.addEventListener('app:language-changed', () => {
        renderServices();
        if (archivedServicesCache.length) loadArchivedServices();
        if (getCurrentRoute() === 'add-service') applyServiceFormContext(activeFormService);
    });
}

export async function loadServiceView(route) {
    bindEvents();
    if (route === 'services') {
        await loadServices();
        return;
    }
    if (route === 'add-service') {
        const service = pendingEditService;
        pendingEditService = null;
        await prepareServiceForm(service);
        return;
    }
    if (route === 'archived-services') await loadArchivedServices();
}
