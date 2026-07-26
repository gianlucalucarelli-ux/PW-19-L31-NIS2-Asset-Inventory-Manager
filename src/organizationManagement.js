// ===============================================================================================================
// FILE: src/organizationManagement.js
// DESCRIZIONE: Interfaccia per soggetti NIS2 utilizzatori, persone aziendali e incarichi NIS2/ACN.
// ===============================================================================================================

import {
    fetchOrganizations,
    fetchOrganizationById,
    insertOrganization,
    updateOrganization,
    archiveOrganization,
    fetchPeople,
    insertPerson,
    updatePerson,
    archivePerson,
    fetchNis2Roles,
    fetchAssignments,
    insertAssignment,
    closeAssignment
} from './organizationService.js?build=20260726-e1';
import { navigateTo } from './router.js?build=20260726-f1';
import { t } from './i18n.js?build=20260726-f1';

let initialized = false;
let organizationsCache = [];
let archivedOrganizationsCache = [];
let filteredOrganizationsCache = [];
let peopleCache = [];
let archivedPeopleCache = [];
let rolesCache = [];
let assignmentsCache = [];
let organizationCurrentPage = 1;
let organizationPageSize = 5;
let selectedOrganizationId = null;
let organizationArchiveCandidate = null;
let assignmentCloseCandidate = null;

function escapeHtml(value) {
    const element = document.createElement('div');
    element.textContent = String(value ?? '');
    return element.innerHTML;
}

function formatDate(value) {
    if (!value) return '—';
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat(document.documentElement.lang === 'en' ? 'en-GB' : 'it-IT').format(date);
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

function classificationLabel(value) {
    const labels = {
        DA_CLASSIFICARE: 'Da classificare',
        ESSENZIALE: 'Essenziale',
        IMPORTANTE: 'Importante'
    };
    return labels[value] || value || 'Da classificare';
}

function classificationClass(value) {
    if (value === 'ESSENZIALE') return 'risk-critical';
    if (value === 'IMPORTANTE') return 'risk-high';
    return 'risk-medium';
}

function formatOperationalError(error) {
    const code = String(error?.code || '');
    const message = String(error?.message || '').trim();

    if (code === '23505') return t('Codice o identificativo legale già utilizzato.');
    if (code === '23502') return t('Uno o più campi obbligatori non sono stati valorizzati.');
    if (code === '23503') return t('Uno dei riferimenti selezionati non è più disponibile.');
    if (code === '23514') return t('Uno dei valori non rispetta i vincoli previsti dal database.');
    if (code === '42501' || /row-level security|permission denied/i.test(message)) {
        return t('La sessione non dispone dell’autorizzazione necessaria per completare l’operazione.');
    }
    return message || t('Errore operativo non specificato.');
}

function setStatus(id, message, error = false) {
    const element = document.getElementById(id);
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('error-msg', error);
}

function organizationContact(organization) {
    return [organization.email_istituzionale, organization.pec, organization.telefono]
        .filter(Boolean)
        .join(' · ') || 'N/D';
}

function organizationLocation(organization) {
    return [
        organization.indirizzo_sede_legale,
        organization.cap_sede_legale,
        organization.comune_sede_legale,
        organization.provincia_sede_legale,
        organization.paese_sede_legale
    ].filter(Boolean).join(', ') || 'N/D';
}

function organizationIdentifier(organization) {
    if (!organization.identificativo_legale) return 'N/D';
    return `${organization.tipo_identificativo_legale || ''} ${organization.identificativo_legale}`.trim();
}

function readOrganizationFilters() {
    return {
        query: String(document.getElementById('organization-search')?.value || '').trim().toLocaleLowerCase('it'),
        classification: document.getElementById('organization-classification-filter')?.value || ''
    };
}

function updateOrganizationPagination(total) {
    const totalPages = Math.max(1, Math.ceil(total / organizationPageSize));
    organizationCurrentPage = Math.min(Math.max(organizationCurrentPage, 1), totalPages);

    const previous = document.getElementById('organization-page-prev');
    const next = document.getElementById('organization-page-next');
    const indicator = document.getElementById('organization-page-indicator');
    const status = document.getElementById('organization-page-status');

    if (previous) previous.disabled = organizationCurrentPage <= 1;
    if (next) next.disabled = organizationCurrentPage >= totalPages || total === 0;
    if (indicator) indicator.textContent = `Pagina ${organizationCurrentPage} di ${totalPages}`;

    if (status) {
        if (total === 0) status.textContent = '0 risultati';
        else {
            const start = ((organizationCurrentPage - 1) * organizationPageSize) + 1;
            const end = Math.min(organizationCurrentPage * organizationPageSize, total);
            status.textContent = `Da ${start} a ${end} di ${total} risultati`;
        }
    }
}

function renderOrganizations() {
    const body = document.getElementById('organization-table-body');
    if (!body) return;

    const filters = readOrganizationFilters();
    filteredOrganizationsCache = organizationsCache.filter((organization) => {
        const searchable = [
            organization.codice_organizzazione,
            organization.nome,
            organization.identificativo_legale,
            organization.comune_sede_legale
        ].join(' ').toLocaleLowerCase('it');

        return (!filters.query || searchable.includes(filters.query))
            && (!filters.classification || organization.classificazione_nis2 === filters.classification);
    });

    updateOrganizationPagination(filteredOrganizationsCache.length);

    if (filteredOrganizationsCache.length === 0) {
        body.innerHTML = '<tr><td colspan="7" class="table-state">Nessun soggetto NIS2 disponibile.</td></tr>';
        return;
    }

    const start = (organizationCurrentPage - 1) * organizationPageSize;
    const page = filteredOrganizationsCache.slice(start, start + organizationPageSize);

    body.innerHTML = page.map((organization) => `
        <tr>
            <td class="cell-primary"><strong>${escapeHtml(organization.codice_organizzazione)}</strong></td>
            <td><strong>${escapeHtml(organization.nome)}</strong><small>${escapeHtml(organization.forma_giuridica || '')}</small></td>
            <td><span class="badge ${classificationClass(organization.classificazione_nis2)}">${escapeHtml(classificationLabel(organization.classificazione_nis2))}</span></td>
            <td>${escapeHtml(organizationIdentifier(organization))}</td>
            <td>${escapeHtml(organizationLocation(organization))}</td>
            <td>${escapeHtml(organizationContact(organization))}</td>
            <td>
                <div class="table-actions">
                    <button type="button" class="btn-table" data-organization-action="detail" data-id="${organization.id}">Dettaglio</button>
                    <button type="button" class="btn-table" data-organization-action="edit" data-id="${organization.id}">Modifica</button>
                    <button type="button" class="btn-table btn-table-danger" data-organization-action="archive" data-id="${organization.id}">Archivia</button>
                </div>
            </td>
        </tr>
    `).join('');
}

async function loadOrganizations() {
    const body = document.getElementById('organization-table-body');
    if (body) body.innerHTML = '<tr><td colspan="7" class="table-state">Caricamento soggetti NIS2…</td></tr>';
    setStatus('organization-list-status', 'Caricamento soggetti NIS2…');

    try {
        organizationsCache = await fetchOrganizations({ active: true });
        organizationCurrentPage = 1;
        renderOrganizations();
        setStatus('organization-list-status', `${organizationsCache.length} risultati`);
    } catch (error) {
        console.error('Errore caricamento organizzazioni:', error);
        organizationsCache = [];
        if (body) body.innerHTML = `<tr><td colspan="7" class="error-msg">Errore: ${escapeHtml(formatOperationalError(error))}</td></tr>`;
        setStatus('organization-list-status', formatOperationalError(error), true);
    }
}

function nextOrganizationCode() {
    const maxId = organizationsCache.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0);
    return `ORG-${String(maxId + 1).padStart(4, '0')}`;
}

function resetOrganizationForm() {
    const form = document.getElementById('organization-form');
    if (!form) return;
    form.reset();

    document.getElementById('organization-id').value = '';
    document.getElementById('organization-code').value = nextOrganizationCode();
    document.getElementById('organization-classification').value = 'DA_CLASSIFICARE';
    document.getElementById('organization-identifier-type').value = 'PARTITA_IVA';
    document.getElementById('organization-country').value = 'Italia';
    document.getElementById('organization-form-title').textContent = 'Nuovo soggetto NIS2';
    document.getElementById('organization-submit').textContent = 'Salva soggetto';
    setStatus('organization-form-status', '');
}

async function fillOrganizationForm(id) {
    const organization = organizationsCache.find((item) => Number(item.id) === Number(id))
        || await fetchOrganizationById(id);

    const values = {
        'organization-id': organization.id,
        'organization-code': organization.codice_organizzazione,
        'organization-name': organization.nome,
        'organization-classification': organization.classificazione_nis2,
        'organization-description': organization.descrizione,
        'organization-legal-form': organization.forma_giuridica,
        'organization-identifier-type': organization.tipo_identificativo_legale,
        'organization-identifier': organization.identificativo_legale,
        'organization-address': organization.indirizzo_sede_legale,
        'organization-postal-code': organization.cap_sede_legale,
        'organization-city': organization.comune_sede_legale,
        'organization-province': organization.provincia_sede_legale,
        'organization-country': organization.paese_sede_legale,
        'organization-email': organization.email_istituzionale,
        'organization-pec': organization.pec,
        'organization-phone': organization.telefono,
        'organization-website': organization.sito_web
    };

    Object.entries(values).forEach(([elementId, value]) => {
        const element = document.getElementById(elementId);
        if (element) element.value = value ?? '';
    });

    document.getElementById('organization-form-title').textContent = 'Modifica soggetto NIS2';
    document.getElementById('organization-submit').textContent = 'Aggiorna soggetto';
    await navigateTo('add-organization', { force: true });
}

function organizationPayloadFromForm() {
    return {
        codice_organizzazione: document.getElementById('organization-code')?.value,
        nome: document.getElementById('organization-name')?.value,
        classificazione_nis2: document.getElementById('organization-classification')?.value,
        descrizione: document.getElementById('organization-description')?.value,
        forma_giuridica: document.getElementById('organization-legal-form')?.value,
        tipo_identificativo_legale: document.getElementById('organization-identifier-type')?.value,
        identificativo_legale: document.getElementById('organization-identifier')?.value,
        indirizzo_sede_legale: document.getElementById('organization-address')?.value,
        cap_sede_legale: document.getElementById('organization-postal-code')?.value,
        comune_sede_legale: document.getElementById('organization-city')?.value,
        provincia_sede_legale: document.getElementById('organization-province')?.value,
        paese_sede_legale: document.getElementById('organization-country')?.value,
        email_istituzionale: document.getElementById('organization-email')?.value,
        pec: document.getElementById('organization-pec')?.value,
        telefono: document.getElementById('organization-phone')?.value,
        sito_web: document.getElementById('organization-website')?.value
    };
}

async function submitOrganizationForm(event) {
    event.preventDefault();
    const button = document.getElementById('organization-submit');
    const id = document.getElementById('organization-id')?.value;
    const defaultLabel = button?.textContent || 'Salva soggetto';

    try {
        if (button) {
            button.disabled = true;
            button.textContent = id ? 'Aggiornamento…' : 'Salvataggio…';
        }
        setStatus('organization-form-status', 'Salvataggio…');

        const saved = id
            ? await updateOrganization(id, organizationPayloadFromForm())
            : await insertOrganization(organizationPayloadFromForm());

        window.alert(`Organizzazione ${saved.codice_organizzazione} salvata correttamente.`);
        await navigateTo('organizations', { force: true });
    } catch (error) {
        console.error('Errore salvataggio organizzazione:', error);
        setStatus('organization-form-status', formatOperationalError(error), true);
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = defaultLabel;
        }
    }
}

function showOrganizationDetail(organization) {
    const dialog = document.getElementById('organization-detail-dialog');
    const title = document.getElementById('organization-detail-title');
    const subtitle = document.getElementById('organization-detail-subtitle');
    const content = document.getElementById('organization-detail-content');
    if (!dialog || !content) return;

    if (title) title.textContent = organization.nome;
    if (subtitle) subtitle.textContent = organization.codice_organizzazione;
    content.innerHTML = `
        <div class="detail-grid">
            <div><span>Classificazione NIS2</span><strong>${escapeHtml(classificationLabel(organization.classificazione_nis2))}</strong></div>
            <div><span>Identificativo legale</span><strong>${escapeHtml(organizationIdentifier(organization))}</strong></div>
            <div><span>Forma giuridica</span><strong>${escapeHtml(organization.forma_giuridica || 'N/D')}</strong></div>
            <div><span>Sede legale</span><strong>${escapeHtml(organizationLocation(organization))}</strong></div>
            <div><span>E-mail istituzionale</span><strong>${escapeHtml(organization.email_istituzionale || 'N/D')}</strong></div>
            <div><span>PEC</span><strong>${escapeHtml(organization.pec || 'N/D')}</strong></div>
            <div><span>Telefono</span><strong>${escapeHtml(organization.telefono || 'N/D')}</strong></div>
            <div><span>Sito web</span><strong>${escapeHtml(organization.sito_web || 'N/D')}</strong></div>
        </div>
        <section class="detail-note"><h3>Descrizione</h3><p>${escapeHtml(organization.descrizione || 'N/D')}</p></section>
    `;
    dialog.showModal();
}

function openOrganizationArchiveDialog(organization) {
    organizationArchiveCandidate = organization;
    const dialog = document.getElementById('organization-archive-dialog');
    const subtitle = document.getElementById('organization-archive-subtitle');
    const reason = document.getElementById('organization-archive-reason');
    const confirmation = document.getElementById('organization-archive-acknowledge');
    const confirmButton = document.getElementById('organization-archive-confirm');

    if (subtitle) subtitle.textContent = `${organization.codice_organizzazione} · ${organization.nome}`;
    if (reason) reason.value = '';
    if (confirmation) confirmation.checked = false;
    if (confirmButton) confirmButton.disabled = true;
    setStatus('organization-archive-status', '');
    dialog?.showModal();
}

async function confirmOrganizationArchive(event) {
    event.preventDefault();
    if (!organizationArchiveCandidate) return;

    const reason = document.getElementById('organization-archive-reason')?.value || '';
    const button = document.getElementById('organization-archive-confirm');

    try {
        if (button) {
            button.disabled = true;
            button.textContent = 'Archiviazione…';
        }
        await archiveOrganization(organizationArchiveCandidate.id, reason);
        document.getElementById('organization-archive-dialog')?.close();
        organizationArchiveCandidate = null;
        await loadOrganizations();
    } catch (error) {
        console.error('Errore archiviazione organizzazione:', error);
        setStatus('organization-archive-status', formatOperationalError(error), true);
    } finally {
        if (button) button.textContent = 'Archivia soggetto';
    }
}

async function loadArchivedOrganizations() {
    const body = document.getElementById('archived-organizations-body');
    if (!body) return;
    body.innerHTML = '<tr><td colspan="6" class="table-state">Caricamento soggetti archiviati…</td></tr>';

    try {
        archivedOrganizationsCache = await fetchOrganizations({ active: false });
        if (archivedOrganizationsCache.length === 0) {
            body.innerHTML = '<tr><td colspan="6" class="table-state">Nessun soggetto NIS2 archiviato.</td></tr>';
            return;
        }

        body.innerHTML = archivedOrganizationsCache.map((organization) => `
            <tr>
                <td><strong>${escapeHtml(organization.codice_organizzazione)}</strong></td>
                <td>${escapeHtml(organization.nome)}</td>
                <td>${escapeHtml(classificationLabel(organization.classificazione_nis2))}</td>
                <td>${escapeHtml(formatDateTime(organization.archiviato_il))}</td>
                <td>${escapeHtml(organization.motivo_archiviazione || 'N/D')}</td>
                <td><button type="button" class="btn-table" data-archived-organization-id="${organization.id}">Dettaglio</button></td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Errore caricamento organizzazioni archiviate:', error);
        body.innerHTML = `<tr><td colspan="6" class="error-msg">Errore: ${escapeHtml(formatOperationalError(error))}</td></tr>`;
    }
}

function fillOrganizationSelector() {
    const selector = document.getElementById('organization-people-selector');
    if (!selector) return;

    selector.innerHTML = organizationsCache.map((organization) => `
        <option value="${organization.id}">${escapeHtml(organization.codice_organizzazione)} · ${escapeHtml(organization.nome)}</option>
    `).join('');

    const validSelected = organizationsCache.some((organization) => Number(organization.id) === Number(selectedOrganizationId));
    selectedOrganizationId = validSelected
        ? Number(selectedOrganizationId)
        : Number(organizationsCache[0]?.id || 0) || null;

    selector.value = selectedOrganizationId ? String(selectedOrganizationId) : '';
}

function roleDisplayName(assignment) {
    const roleName = assignment.ruolo?.nome || 'N/D';
    const code = assignment.ruolo?.codice_ruolo;
    const type = assignment.tipo_incarico;

    if (code === 'PUNTO_CONTATTO_NIS2' && type === 'VICE') return 'Vice Punto di contatto NIS2';
    if (code === 'REFERENTE_CSIRT' && type === 'VICE') return 'Vice Referente CSIRT';
    if (type === 'SUPPORTO') return `Supporto · ${roleName}`;
    return roleName;
}

function activeRolesForPerson(personId) {
    return assignmentsCache
        .filter((assignment) => assignment.attiva && Number(assignment.responsabile_id) === Number(personId))
        .map(roleDisplayName);
}

function renderPeopleAndAssignments() {
    const peopleBody = document.getElementById('organization-people-body');
    const assignmentsBody = document.getElementById('organization-assignments-body');
    const assignmentButton = document.getElementById('assignment-add-btn');

    if (peopleBody) {
        peopleBody.innerHTML = peopleCache.length === 0
            ? '<tr><td colspan="5" class="table-state">Nessuna persona disponibile.</td></tr>'
            : peopleCache.map((person) => {
                const roles = activeRolesForPerson(person.id);
                return `
                    <tr>
                        <td><strong>${escapeHtml(`${person.nome} ${person.cognome}`)}</strong></td>
                        <td>${escapeHtml(person.email)}</td>
                        <td>${escapeHtml(person.telefono || 'N/D')}</td>
                        <td>${roles.length ? roles.map((role) => `<span class="relation-chip">${escapeHtml(role)}</span>`).join(' ') : '<span class="text-muted">Nessun incarico attivo.</span>'}</td>
                        <td>
                            <div class="table-actions">
                                <button type="button" class="btn-table" data-person-action="edit" data-id="${person.id}">Modifica</button>
                                <button type="button" class="btn-table btn-table-danger" data-person-action="archive" data-id="${person.id}">Disattiva</button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
    }

    const archivedPeopleBody = document.getElementById('organization-archived-people-body');
    if (archivedPeopleBody) {
        archivedPeopleBody.innerHTML = archivedPeopleCache.length === 0
            ? '<tr><td colspan="5" class="table-state">Nessuna persona disattivata.</td></tr>'
            : archivedPeopleCache.map((person) => `
                <tr>
                    <td><strong>${escapeHtml(`${person.nome} ${person.cognome}`)}</strong></td>
                    <td>${escapeHtml(person.email)}</td>
                    <td>${escapeHtml(person.telefono || 'N/D')}</td>
                    <td>${escapeHtml(formatDateTime(person.archiviato_il))}</td>
                    <td>${escapeHtml(person.motivo_archiviazione || 'N/D')}</td>
                </tr>
            `).join('');
    }

    if (assignmentsBody) {
        assignmentsBody.innerHTML = assignmentsCache.length === 0
            ? '<tr><td colspan="6" class="table-state">Nessun incarico attivo.</td></tr>'
            : assignmentsCache.map((assignment) => {
                const person = assignment.persona;
                const status = assignment.attiva ? 'Attivo' : 'Chiuso';
                return `
                    <tr>
                        <td><strong>${escapeHtml(roleDisplayName(assignment))}</strong></td>
                        <td>${escapeHtml(person ? `${person.nome} ${person.cognome}` : 'N/D')}</td>
                        <td>${escapeHtml(assignment.tipo_incarico)}</td>
                        <td>${escapeHtml(formatDate(assignment.valido_dal))} → ${escapeHtml(formatDate(assignment.valido_al))}</td>
                        <td><span class="badge ${assignment.attiva ? 'status-active' : 'status-closed'}">${status}</span></td>
                        <td>${assignment.attiva ? `<button type="button" class="btn-table btn-table-danger" data-assignment-action="close" data-id="${assignment.id}">Cessa</button>` : '—'}</td>
                    </tr>
                `;
            }).join('');
    }

    if (assignmentButton) assignmentButton.disabled = peopleCache.length === 0;
    setStatus('organization-people-status', `${peopleCache.length} persone · ${assignmentsCache.filter((item) => item.attiva).length} incarichi attivi`);
}

async function loadPeopleArea() {
    setStatus('organization-people-status', 'Caricamento…');

    try {
        if (organizationsCache.length === 0) organizationsCache = await fetchOrganizations({ active: true });
        fillOrganizationSelector();

        if (!selectedOrganizationId) {
            peopleCache = [];
            archivedPeopleCache = [];
            assignmentsCache = [];
            renderPeopleAndAssignments();
            return;
        }

        [peopleCache, archivedPeopleCache, rolesCache, assignmentsCache] = await Promise.all([
            fetchPeople(selectedOrganizationId, { active: true }),
            fetchPeople(selectedOrganizationId, { active: false }),
            fetchNis2Roles(),
            fetchAssignments(selectedOrganizationId, { active: null })
        ]);
        renderPeopleAndAssignments();
    } catch (error) {
        console.error('Errore caricamento persone e incarichi:', error);
        peopleCache = [];
        archivedPeopleCache = [];
        rolesCache = [];
        assignmentsCache = [];
        renderPeopleAndAssignments();
        setStatus('organization-people-status', formatOperationalError(error), true);
    }
}

function openPersonDialog(person = null) {
    const dialog = document.getElementById('person-dialog');
    const form = document.getElementById('person-form');
    if (!dialog || !form || !selectedOrganizationId) return;

    form.reset();
    document.getElementById('person-id').value = person?.id || '';
    document.getElementById('person-organization-id').value = selectedOrganizationId;
    document.getElementById('person-first-name').value = person?.nome || '';
    document.getElementById('person-last-name').value = person?.cognome || '';
    document.getElementById('person-email').value = person?.email || '';
    document.getElementById('person-phone').value = person?.telefono || '';
    document.getElementById('person-dialog-title').textContent = person ? 'Modifica persona' : 'Aggiungi persona';
    setStatus('person-form-status', '');
    dialog.showModal();
}

async function submitPerson(event) {
    event.preventDefault();
    const id = document.getElementById('person-id')?.value;
    const submit = document.getElementById('person-submit');

    try {
        if (submit) {
            submit.disabled = true;
            submit.textContent = id ? 'Aggiornamento…' : 'Salvataggio…';
        }

        const payload = {
            organizzazione_id: document.getElementById('person-organization-id')?.value,
            nome: document.getElementById('person-first-name')?.value,
            cognome: document.getElementById('person-last-name')?.value,
            email: document.getElementById('person-email')?.value,
            telefono: document.getElementById('person-phone')?.value
        };

        const saved = id ? await updatePerson(id, payload) : await insertPerson(payload);
        document.getElementById('person-dialog')?.close();
        window.alert(`Persona ${saved.nome} ${saved.cognome} salvata correttamente.`);
        await loadPeopleArea();
    } catch (error) {
        console.error('Errore salvataggio persona:', error);
        setStatus('person-form-status', formatOperationalError(error), true);
    } finally {
        if (submit) {
            submit.disabled = false;
            submit.textContent = 'Salva persona';
        }
    }
}

async function deactivatePerson(person) {
    const activeAssignments = assignmentsCache.filter((assignment) => assignment.attiva && Number(assignment.responsabile_id) === Number(person.id));
    if (activeAssignments.length > 0) {
        window.alert(t('Concludi prima gli incarichi attivi associati alla persona.'));
        return;
    }

    const reason = window.prompt(t('Motivo della disattivazione (minimo 5 caratteri):'));
    if (reason === null) return;

    try {
        await archivePerson(person.id, reason);
        await loadPeopleArea();
    } catch (error) {
        window.alert(formatOperationalError(error));
    }
}

function assignmentOptions() {
    const options = [];
    rolesCache.forEach((role) => {
        if (role.codice_ruolo === 'PUNTO_CONTATTO_NIS2') {
            options.push({ value: `${role.id}|TITOLARE`, label: 'Punto di contatto NIS2' });
            options.push({ value: `${role.id}|VICE`, label: 'Vice Punto di contatto NIS2' });
            return;
        }
        if (role.codice_ruolo === 'REFERENTE_CSIRT') {
            options.push({ value: `${role.id}|TITOLARE`, label: 'Referente CSIRT' });
            options.push({ value: `${role.id}|VICE`, label: 'Vice Referente CSIRT' });
            return;
        }
        options.push({ value: `${role.id}|TITOLARE`, label: role.nome });
        options.push({ value: `${role.id}|SUPPORTO`, label: `Supporto · ${role.nome}` });
    });
    return options;
}

function openAssignmentDialog() {
    const dialog = document.getElementById('assignment-dialog');
    const personSelect = document.getElementById('assignment-person');
    const roleSelect = document.getElementById('assignment-role-choice');
    const date = document.getElementById('assignment-valid-from');
    const note = document.getElementById('assignment-note');
    if (!dialog || !personSelect || !roleSelect) return;

    personSelect.innerHTML = peopleCache.map((person) => `
        <option value="${person.id}">${escapeHtml(`${person.cognome} ${person.nome}`)}</option>
    `).join('');
    roleSelect.innerHTML = assignmentOptions().map((option) => `
        <option value="${option.value}">${escapeHtml(option.label)}</option>
    `).join('');
    if (date) date.value = new Date().toISOString().slice(0, 10);
    if (note) note.value = '';
    setStatus('assignment-form-status', '');
    dialog.showModal();
}

async function submitAssignment(event) {
    event.preventDefault();
    const choice = String(document.getElementById('assignment-role-choice')?.value || '');
    const [roleId, type] = choice.split('|');
    const submit = document.getElementById('assignment-submit');

    try {
        if (submit) {
            submit.disabled = true;
            submit.textContent = 'Salvataggio…';
        }
        const saved = await insertAssignment({
            responsabile_id: document.getElementById('assignment-person')?.value,
            ruolo_id: roleId,
            tipo_incarico: type,
            valido_dal: document.getElementById('assignment-valid-from')?.value,
            note: document.getElementById('assignment-note')?.value
        });
        document.getElementById('assignment-dialog')?.close();
        window.alert(`Incarico ${saved.id} assegnato correttamente.`);
        await loadPeopleArea();
    } catch (error) {
        console.error('Errore assegnazione incarico:', error);
        setStatus('assignment-form-status', formatOperationalError(error), true);
    } finally {
        if (submit) {
            submit.disabled = false;
            submit.textContent = 'Assegna incarico';
        }
    }
}

function openAssignmentCloseDialog(assignment) {
    assignmentCloseCandidate = assignment;
    const dialog = document.getElementById('assignment-close-dialog');
    const subtitle = document.getElementById('assignment-close-subtitle');
    if (subtitle) subtitle.textContent = `${roleDisplayName(assignment)} · ${assignment.persona?.nome || ''} ${assignment.persona?.cognome || ''}`.trim();
    document.getElementById('assignment-end-date').value = new Date().toISOString().slice(0, 10);
    document.getElementById('assignment-close-reason').value = '';
    setStatus('assignment-close-status', '');
    dialog?.showModal();
}

async function submitAssignmentClose(event) {
    event.preventDefault();
    if (!assignmentCloseCandidate) return;
    const submit = document.getElementById('assignment-close-submit');

    try {
        if (submit) {
            submit.disabled = true;
            submit.textContent = 'Aggiornamento…';
        }
        await closeAssignment(assignmentCloseCandidate.id, {
            valido_al: document.getElementById('assignment-end-date')?.value,
            motivo_cessazione: document.getElementById('assignment-close-reason')?.value
        });
        document.getElementById('assignment-close-dialog')?.close();
        assignmentCloseCandidate = null;
        await loadPeopleArea();
    } catch (error) {
        console.error('Errore cessazione incarico:', error);
        setStatus('assignment-close-status', formatOperationalError(error), true);
    } finally {
        if (submit) {
            submit.disabled = false;
            submit.textContent = 'Conferma cessazione';
        }
    }
}

function bindEvents() {
    if (initialized) return;
    initialized = true;

    document.getElementById('organization-search')?.addEventListener('input', () => {
        organizationCurrentPage = 1;
        renderOrganizations();
    });
    document.getElementById('organization-classification-filter')?.addEventListener('change', () => {
        organizationCurrentPage = 1;
        renderOrganizations();
    });
    document.getElementById('organization-filter-reset')?.addEventListener('click', () => {
        const search = document.getElementById('organization-search');
        const classification = document.getElementById('organization-classification-filter');
        if (search) search.value = '';
        if (classification) classification.value = '';
        organizationCurrentPage = 1;
        renderOrganizations();
    });
    document.getElementById('organization-page-size')?.addEventListener('change', (event) => {
        organizationPageSize = Number(event.target.value) || 5;
        organizationCurrentPage = 1;
        renderOrganizations();
    });
    document.getElementById('organization-page-prev')?.addEventListener('click', () => {
        organizationCurrentPage -= 1;
        renderOrganizations();
    });
    document.getElementById('organization-page-next')?.addEventListener('click', () => {
        organizationCurrentPage += 1;
        renderOrganizations();
    });

    document.getElementById('organization-table-body')?.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-organization-action]');
        if (!button) return;
        const organization = organizationsCache.find((item) => Number(item.id) === Number(button.dataset.id));
        if (!organization) return;

        if (button.dataset.organizationAction === 'detail') showOrganizationDetail(organization);
        else if (button.dataset.organizationAction === 'edit') await fillOrganizationForm(organization.id);
        else if (button.dataset.organizationAction === 'archive') openOrganizationArchiveDialog(organization);
    });

    document.getElementById('organization-form')?.addEventListener('submit', submitOrganizationForm);
    document.getElementById('organization-form-cancel')?.addEventListener('click', () => navigateTo('organizations', { force: true }));
    document.getElementById('organization-archive-form')?.addEventListener('submit', confirmOrganizationArchive);
    document.getElementById('organization-archive-cancel')?.addEventListener('click', () => document.getElementById('organization-archive-dialog')?.close());
    document.getElementById('organization-archive-acknowledge')?.addEventListener('change', (event) => {
        const button = document.getElementById('organization-archive-confirm');
        const reason = document.getElementById('organization-archive-reason')?.value || '';
        if (button) button.disabled = !(event.target.checked && reason.trim().length >= 5);
    });
    document.getElementById('organization-archive-reason')?.addEventListener('input', () => {
        const button = document.getElementById('organization-archive-confirm');
        const acknowledged = document.getElementById('organization-archive-acknowledge')?.checked;
        const reason = document.getElementById('organization-archive-reason')?.value || '';
        if (button) button.disabled = !(acknowledged && reason.trim().length >= 5);
    });

    document.getElementById('archived-organizations-body')?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-archived-organization-id]');
        if (!button) return;
        const organization = archivedOrganizationsCache.find((item) => Number(item.id) === Number(button.dataset.archivedOrganizationId));
        if (organization) showOrganizationDetail(organization);
    });

    document.getElementById('organization-people-selector')?.addEventListener('change', async (event) => {
        selectedOrganizationId = Number(event.target.value) || null;
        await loadPeopleArea();
    });
    document.getElementById('person-add-btn')?.addEventListener('click', () => openPersonDialog());
    document.getElementById('assignment-add-btn')?.addEventListener('click', openAssignmentDialog);
    document.getElementById('organization-people-body')?.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-person-action]');
        if (!button) return;
        const person = peopleCache.find((item) => Number(item.id) === Number(button.dataset.id));
        if (!person) return;
        if (button.dataset.personAction === 'edit') openPersonDialog(person);
        else if (button.dataset.personAction === 'archive') await deactivatePerson(person);
    });
    document.getElementById('organization-assignments-body')?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-assignment-action="close"]');
        if (!button) return;
        const assignment = assignmentsCache.find((item) => Number(item.id) === Number(button.dataset.id));
        if (assignment) openAssignmentCloseDialog(assignment);
    });

    document.getElementById('person-form')?.addEventListener('submit', submitPerson);
    document.getElementById('assignment-form')?.addEventListener('submit', submitAssignment);
    document.getElementById('assignment-close-form')?.addEventListener('submit', submitAssignmentClose);

    document.addEventListener('click', (event) => {
        const control = event.target.closest('[data-close-dialog]');
        if (!control) return;
        document.getElementById(control.dataset.closeDialog)?.close();
    });

    document.addEventListener('app:language-changed', () => {
        renderOrganizations();
        renderPeopleAndAssignments();
        if (archivedOrganizationsCache.length) loadArchivedOrganizations();
    });
}

export async function loadOrganizationView(route) {
    bindEvents();

    if (route === 'organizations') {
        await loadOrganizations();
        return;
    }

    if (route === 'add-organization') {
        if (!document.getElementById('organization-id')?.value) {
            if (organizationsCache.length === 0) {
                try {
                    organizationsCache = await fetchOrganizations({ active: true });
                } catch (error) {
                    console.error('Errore preparazione codice organizzazione:', error);
                }
            }
            resetOrganizationForm();
        }
        return;
    }

    if (route === 'organization-people') {
        await loadPeopleArea();
        return;
    }

    if (route === 'archived-organizations') {
        await loadArchivedOrganizations();
    }
}
