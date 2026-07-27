// ===============================================================================================================
// FILE: src/relationshipBuilder.js
// DESCRIZIONE: Costruttore guidato delle dipendenze, diagnostica di copertura e anteprima del grafo.
// ===============================================================================================================

import {
    RELATION_TYPES,
    fetchRelationshipWorkspace,
    computeRelationshipCoverage,
    buildServiceDependencyTree,
    getRootServices,
    createRelationship,
    closeRelationship,
    relationshipTypeLabel,
    entityLabel,
    relationConfig,
    startRelationshipAuditWindow,
    verifyRelationshipAudit
} from './relationshipService.js?build=20260727-m1';
import { renderDependencyTree, renderImpactPath } from './relationshipGraph.js?build=20260727-m1';

let workspace = null;
let coverage = null;
let initialized = false;
let pendingClose = null;

function element(id) {
    return document.getElementById(id);
}

function setStatus(message, tone = '') {
    const status = element('relationship-builder-status');
    if (!status) return;
    status.textContent = message;
    status.className = `relationship-builder-status${tone ? ` relationship-builder-status--${tone}` : ''}`;
}

function option(value, label) {
    const node = document.createElement('option');
    node.value = String(value ?? '');
    node.textContent = label;
    return node;
}

function replaceOptions(select, rows, placeholder, selected = '') {
    if (!select) return;
    select.replaceChildren(option('', placeholder));
    rows.forEach((row) => select.appendChild(option(row.value, row.label)));
    if ([...select.options].some((row) => row.value === String(selected))) {
        select.value = String(selected);
    }
}

function entityRows(type, organizationId) {
    const orgId = Number(organizationId);
    if (type === 'service') {
        return workspace.services
            .filter((record) => !orgId || Number(record.organizzazione_id) === orgId)
            .map((record) => ({ value: record.id, label: `${record.codice_servizio} · ${record.nome}` }));
    }
    if (type === 'asset') {
        return workspace.assets
            .filter((record) => !orgId || Number(record.organizzazione_id) === orgId)
            .map((record) => ({ value: record.id, label: `${record.codice_asset} · ${record.nome}` }));
    }
    return workspace.suppliers
        .map((record) => ({ value: record.id, label: `${record.codice_fornitore} · ${record.nome}` }));
}

function selectedRelationType() {
    return element('relationship-type')?.value || RELATION_TYPES.SERVICE_SERVICE;
}

function domainRows(type) {
    const domains = workspace.domains;
    if (type === RELATION_TYPES.SERVICE_SERVICE) {
        return domains.serviceHierarchyTypes.map((row) => ({ value: row.id, label: row.codice || row.descrizione }));
    }
    if ([RELATION_TYPES.SERVICE_ASSET, RELATION_TYPES.SERVICE_SUPPLIER].includes(type)) {
        return domains.serviceDependencyTypes.map((row) => ({ value: row.id, label: row.codice || row.descrizione }));
    }
    if (type === RELATION_TYPES.ASSET_ASSET) {
        return domains.assetRelationshipTypes.map((row) => ({ value: row.id, label: row.nome || row.codice }));
    }
    if (type === RELATION_TYPES.ASSET_SUPPLIER) {
        return domains.assetSupplierTypes.map((row) => ({ value: row.id, label: row.nome || row.codice }));
    }
    return domains.supplierRelationshipTypes.map((row) => ({ value: row.id, label: row.nome || row.codice }));
}

function configureBuilderForm(preselectedSource = '') {
    const type = selectedRelationType();
    const config = relationConfig(type);
    const organizationId = element('relationship-organization')?.value || '';
    const source = element('relationship-source');
    const target = element('relationship-target');
    const domain = element('relationship-domain');
    const sourceLabel = element('relationship-source-label');
    const targetLabel = element('relationship-target-label');
    const impactField = element('relationship-impact-field');
    const weightField = element('relationship-weight-field');
    const contractField = element('relationship-contract-field');
    const primaryField = element('relationship-primary-field');
    const saveButton = element('relationship-save');

    if (!config) return;
    if (sourceLabel) sourceLabel.textContent = config.sourceEntity === 'service'
        ? 'Elemento principale: servizio'
        : config.sourceEntity === 'asset'
            ? 'Elemento principale: asset'
            : 'Elemento principale: fornitore';
    if (targetLabel) targetLabel.textContent = config.targetEntity === 'service'
        ? 'Elemento collegato: servizio'
        : config.targetEntity === 'asset'
            ? 'Elemento collegato: asset'
            : 'Elemento collegato: fornitore';

    const currentSource = preselectedSource || source?.value || '';
    const currentTarget = target?.value || '';
    replaceOptions(source, entityRows(config.sourceEntity, organizationId), 'Seleziona elemento principale', currentSource);
    replaceOptions(target, entityRows(config.targetEntity, organizationId), 'Seleziona elemento collegato', currentTarget);

    if (source?.value && config.sourceEntity === config.targetEntity) {
        [...target.options].forEach((row) => {
            row.disabled = row.value === source.value;
        });
        if (target.value === source.value) target.value = '';
    }

    const domains = domainRows(type);
    replaceOptions(domain, domains, 'Seleziona tipo di relazione');
    impactField?.classList.toggle('is-hidden', type !== RELATION_TYPES.SERVICE_SERVICE);
    weightField?.classList.toggle('is-hidden', type !== RELATION_TYPES.SERVICE_SERVICE);
    contractField?.classList.toggle('is-hidden', type !== RELATION_TYPES.ASSET_SUPPLIER);
    primaryField?.classList.toggle('is-hidden', ![
        RELATION_TYPES.SERVICE_SERVICE,
        RELATION_TYPES.ASSET_ASSET,
        RELATION_TYPES.ASSET_SUPPLIER,
        RELATION_TYPES.SUPPLIER_SUPPLIER
    ].includes(type));

    if (type === RELATION_TYPES.SERVICE_SERVICE) {
        replaceOptions(
            element('relationship-impact'),
            workspace.domains.impactOutcomes.map((row) => ({ value: row.id, label: row.codice || row.descrizione })),
            'Seleziona impatto sul servizio superiore'
        );
    }

    const domainReady = domains.length > 0;
    if (saveButton) saveButton.disabled = !domainReady;
    if (!domainReady) {
        setStatus('Il dominio necessario per questa relazione non contiene valori. Verifica la configurazione del database prima del salvataggio.', 'warning');
    }

    updatePreview();
    renderActiveRelationships();
}

function updatePreview() {
    const preview = element('relationship-preview');
    if (!preview || !workspace) return;
    const type = selectedRelationType();
    const config = relationConfig(type);
    const sourceId = element('relationship-source')?.value;
    const targetId = element('relationship-target')?.value;
    const typeText = element('relationship-domain')?.selectedOptions?.[0]?.textContent || 'Tipo non selezionato';
    const impactText = element('relationship-impact')?.selectedOptions?.[0]?.textContent || '';
    const weight = element('relationship-weight')?.value || '0';

    preview.replaceChildren();
    const title = document.createElement('strong');
    title.textContent = relationshipTypeLabel(type);
    const path = document.createElement('p');
    const source = sourceId ? entityLabel(workspace, config.sourceEntity, sourceId) : 'Elemento principale';
    const target = targetId ? entityLabel(workspace, config.targetEntity, targetId) : 'Elemento collegato';
    path.textContent = `${source}  →  ${target}`;
    const detail = document.createElement('small');
    detail.textContent = type === RELATION_TYPES.SERVICE_SERVICE
        ? `${typeText} · Impatto ${impactText || 'da selezionare'} · Peso ${weight}%`
        : typeText;
    preview.append(title, path, detail);
}

function organizationFilterRows() {
    return workspace.organizations.map((record) => ({
        value: record.id,
        label: `${record.codice_organizzazione || `ORG-${record.id}`} · ${record.nome}`
    }));
}

function fillOrganizations() {
    replaceOptions(element('relationship-organization'), organizationFilterRows(), 'Tutti i soggetti NIS2');
    replaceOptions(element('relationship-map-organization'), organizationFilterRows(), 'Tutti i soggetti NIS2');
    if (workspace.organizations.length === 1) {
        element('relationship-organization').value = String(workspace.organizations[0].id);
        element('relationship-map-organization').value = String(workspace.organizations[0].id);
    }
}

function coverageTone(row) {
    if (row.disconnected) return 'danger';
    if (row.needsReview) return 'warning';
    return 'success';
}

function renderCoverage() {
    const summary = coverage.summary;
    const values = {
        'relationship-summary-active': summary.activeServices,
        'relationship-summary-mapped': summary.mappedServices,
        'relationship-summary-review': summary.servicesToReview,
        'relationship-summary-disconnected': summary.disconnectedServices
    };
    Object.entries(values).forEach(([id, value]) => {
        if (element(id)) element(id).textContent = String(value);
    });

    const list = element('relationship-review-list');
    if (!list) return;
    list.replaceChildren();

    const orgId = Number(element('relationship-organization')?.value || 0);
    const rows = coverage.rows
        .filter((row) => row.needsReview)
        .filter((row) => !orgId || Number(row.service.organizzazione_id) === orgId)
        .sort((a, b) => Number(b.disconnected) - Number(a.disconnected) || a.service.nome.localeCompare(b.service.nome, 'it'));

    if (rows.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'dashboard-empty';
        empty.textContent = 'Nessun servizio richiede verifiche per il soggetto selezionato.';
        list.appendChild(empty);
        return;
    }

    rows.forEach((row) => {
        const article = document.createElement('article');
        article.className = `relationship-review relationship-review--${coverageTone(row)}`;
        const content = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = `${row.service.codice_servizio} · ${row.service.nome}`;
        const issues = document.createElement('p');
        issues.textContent = row.issues.join(' · ');
        const meta = document.createElement('small');
        meta.textContent = `${row.totalAssetCount} asset · ${row.totalSupplierCount} fornitori · ${row.parentCount} padri · ${row.childCount} figli`;
        content.append(title, issues, meta);

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn-secondary';
        button.textContent = row.disconnected ? 'Configura' : 'Completa';
        button.dataset.configureService = String(row.service.id);
        button.dataset.organizationId = String(row.service.organizzazione_id);
        button.dataset.issueAsset = String(!row.hasAssets);
        button.dataset.issueSupplier = String(!row.hasSuppliers);
        article.append(content, button);
        list.appendChild(article);
    });
}

function relationRowsForType(type) {
    const relations = workspace.relations;
    if (type === RELATION_TYPES.SERVICE_SERVICE) return relations.serviceComponents;
    if (type === RELATION_TYPES.SERVICE_ASSET) return relations.serviceAssets;
    if (type === RELATION_TYPES.ASSET_ASSET) return relations.assetComponents;
    if (type === RELATION_TYPES.SERVICE_SUPPLIER) return relations.serviceSuppliers;
    if (type === RELATION_TYPES.ASSET_SUPPLIER) return relations.assetSuppliers;
    return relations.supplierRelations;
}

function renderActiveRelationships() {
    const body = element('relationship-active-body');
    if (!body || !workspace) return;
    body.replaceChildren();
    const type = selectedRelationType();
    const config = relationConfig(type);
    const orgId = Number(element('relationship-organization')?.value || 0);

    const rows = relationRowsForType(type).filter((row) => {
        if (!orgId) return true;
        if (config.sourceEntity === 'supplier') return true;
        const source = config.sourceEntity === 'service'
            ? workspace.maps.services.get(Number(row[config.sourceField]))
            : workspace.maps.assets.get(Number(row[config.sourceField]));
        return Number(source?.organizzazione_id) === orgId;
    });

    if (rows.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 4;
        td.className = 'table-empty';
        td.textContent = 'Nessuna relazione attiva per la tipologia selezionata.';
        tr.appendChild(td);
        body.appendChild(tr);
        return;
    }

    rows.forEach((row, index) => {
        const tr = document.createElement('tr');
        const source = document.createElement('td');
        source.textContent = entityLabel(workspace, config.sourceEntity, row[config.sourceField]);
        const target = document.createElement('td');
        target.textContent = entityLabel(workspace, config.targetEntity, row[config.targetField]);
        const detail = document.createElement('td');
        detail.textContent = row.descrizione || (row.peso_percentuale !== undefined ? `Peso ${row.peso_percentuale || 0}%` : 'Relazione attiva');
        const actions = document.createElement('td');
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'btn-danger-outline';
        close.textContent = 'Cessa';
        close.dataset.closeRelationshipIndex = String(index);
        actions.appendChild(close);
        tr.append(source, target, detail, actions);
        tr.dataset.relationshipIndex = String(index);
        body.appendChild(tr);
    });

    body.dataset.relationType = type;
    body._visibleRows = rows;
}

function mapFilters() {
    const kinds = ['service'];
    if (element('relationship-show-assets')?.checked) kinds.push('asset');
    if (element('relationship-show-suppliers')?.checked) kinds.push('supplier');
    return kinds;
}

function populateMapRoots(selected = '') {
    const orgId = element('relationship-map-organization')?.value || '';
    const roots = getRootServices(workspace, orgId || null).map((record) => ({
        value: record.id,
        label: `${record.codice_servizio} · ${record.nome}`
    }));
    replaceOptions(element('relationship-map-root'), roots, 'Seleziona servizio principale', selected);
    if (!element('relationship-map-root')?.value && roots.length === 1) {
        element('relationship-map-root').value = String(roots[0].value);
    }
}

function renderMap() {
    const rootId = element('relationship-map-root')?.value;
    const container = element('relationship-map-canvas');
    const counter = element('relationship-map-status');
    if (!rootId) {
        container?.replaceChildren();
        if (counter) counter.textContent = 'Seleziona un servizio principale per visualizzare la catena.';
        renderImpactPath(element('relationship-impact-path'), null);
        return;
    }

    try {
        const tree = buildServiceDependencyTree(workspace, rootId);
        const result = renderDependencyTree(container, tree, {
            showKinds: mapFilters(),
            expandedDepth: 3,
            onSelect: (node, card) => {
                document.querySelectorAll('.dependency-node.is-selected').forEach((row) => row.classList.remove('is-selected'));
                card.classList.add('is-selected');
                renderImpactPath(element('relationship-impact-path'), node);
            }
        });
        if (counter) counter.textContent = `${result.nodes} nodi visualizzati · ${result.shared} elementi condivisi.`;
        renderImpactPath(element('relationship-impact-path'), null);
    } catch (error) {
        if (counter) counter.textContent = error.message;
        container?.replaceChildren();
    }
}

function readPayload() {
    return {
        sourceId: element('relationship-source')?.value,
        targetId: element('relationship-target')?.value,
        relationshipTypeId: element('relationship-domain')?.value,
        impactOutcomeId: element('relationship-impact')?.value,
        weight: element('relationship-weight')?.value,
        primary: Boolean(element('relationship-primary')?.checked),
        order: element('relationship-order')?.value,
        description: element('relationship-description')?.value,
        contractReference: element('relationship-contract')?.value
    };
}

async function submitRelationship(event) {
    event.preventDefault();
    const type = selectedRelationType();
    const save = element('relationship-save');
    const startedAt = startRelationshipAuditWindow();
    try {
        if (save) save.disabled = true;
        setStatus('Salvataggio della relazione in corso…');
        const created = await createRelationship(type, readPayload(), workspace);
        const audit = await verifyRelationshipAudit({ type, operation: 'INSERT', record: created.record, startedAt });
        await reloadWorkspace();
        setStatus(audit.verified
            ? 'Relazione salvata e Audit Log verificato.'
            : 'Relazione salvata. Verifica manualmente l’evento nella sezione Audit Log.', audit.verified ? 'success' : 'warning');
    } catch (error) {
        console.error('Errore salvataggio relazione:', error);
        setStatus(error.message || 'Salvataggio non riuscito.', 'danger');
    } finally {
        if (save) save.disabled = domainRows(type).length === 0;
    }
}

function openCloseDialog(type, relation) {
    pendingClose = { type, relation };
    const dialog = element('relationship-close-dialog');
    const reason = element('relationship-close-reason');
    if (reason) reason.value = '';
    if (dialog?.showModal) dialog.showModal();
}

async function confirmClose(event) {
    event.preventDefault();
    if (!pendingClose) return;
    const reason = element('relationship-close-reason')?.value || '';
    const confirm = element('relationship-close-confirm');
    const startedAt = startRelationshipAuditWindow();
    try {
        if (confirm) confirm.disabled = true;
        const result = await closeRelationship(pendingClose.type, pendingClose.relation, reason);
        const audit = await verifyRelationshipAudit({ type: pendingClose.type, operation: 'UPDATE', record: result.record, startedAt });
        element('relationship-close-dialog')?.close();
        pendingClose = null;
        await reloadWorkspace();
        setStatus(audit.verified
            ? 'Relazione cessata logicamente e Audit Log verificato.'
            : 'Relazione cessata. Verifica manualmente l’evento nella sezione Audit Log.', audit.verified ? 'success' : 'warning');
    } catch (error) {
        setStatus(error.message || 'Cessazione non riuscita.', 'danger');
    } finally {
        if (confirm) confirm.disabled = false;
    }
}

function bindEvents() {
    if (initialized) return;
    initialized = true;

    element('relationship-form')?.addEventListener('submit', submitRelationship);
    element('relationship-form')?.addEventListener('reset', () => window.setTimeout(() => configureBuilderForm(), 0));
    element('relationship-close-form')?.addEventListener('submit', confirmClose);
    element('relationship-close-x')?.addEventListener('click', () => element('relationship-close-dialog')?.close());
    element('relationship-close-cancel')?.addEventListener('click', () => element('relationship-close-dialog')?.close());
    element('relationship-type')?.addEventListener('change', () => configureBuilderForm());
    element('relationship-organization')?.addEventListener('change', () => {
        configureBuilderForm();
        renderCoverage();
    });
    ['relationship-source', 'relationship-target', 'relationship-domain', 'relationship-impact', 'relationship-weight']
        .forEach((id) => element(id)?.addEventListener('input', updatePreview));
    element('relationship-source')?.addEventListener('change', () => configureBuilderForm(element('relationship-source')?.value));

    element('relationship-review-list')?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-configure-service]');
        if (!button) return;
        const serviceId = button.dataset.configureService;
        if (button.dataset.organizationId && element('relationship-organization')) {
            element('relationship-organization').value = button.dataset.organizationId;
        }
        if (button.dataset.issueAsset === 'true') {
            element('relationship-type').value = RELATION_TYPES.SERVICE_ASSET;
        } else if (button.dataset.issueSupplier === 'true') {
            element('relationship-type').value = RELATION_TYPES.SERVICE_SUPPLIER;
        } else {
            element('relationship-type').value = RELATION_TYPES.SERVICE_SERVICE;
        }
        configureBuilderForm(serviceId);
        element('relationship-builder-form-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    element('relationship-active-body')?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-close-relationship-index]');
        if (!button) return;
        const body = element('relationship-active-body');
        const index = Number(button.dataset.closeRelationshipIndex);
        const row = body?._visibleRows?.[index];
        if (row) openCloseDialog(body.dataset.relationType, row);
    });

    element('relationship-map-organization')?.addEventListener('change', () => {
        populateMapRoots();
        renderMap();
    });
    element('relationship-map-root')?.addEventListener('change', renderMap);
    ['relationship-show-assets', 'relationship-show-suppliers'].forEach((id) => element(id)?.addEventListener('change', renderMap));
    document.addEventListener('app:language-changed', () => {
        if (workspace) {
            renderCoverage();
            renderActiveRelationships();
            renderMap();
        }
    });
}

async function reloadWorkspace() {
    const selectedOrg = element('relationship-organization')?.value || '';
    const selectedMapOrg = element('relationship-map-organization')?.value || '';
    const selectedRoot = element('relationship-map-root')?.value || '';
    workspace = await fetchRelationshipWorkspace();
    coverage = computeRelationshipCoverage(workspace);
    fillOrganizations();
    if (selectedOrg) element('relationship-organization').value = selectedOrg;
    if (selectedMapOrg) element('relationship-map-organization').value = selectedMapOrg;
    configureBuilderForm();
    renderCoverage();
    populateMapRoots(selectedRoot);
    renderMap();
}

export async function loadRelationshipBuilder() {
    bindEvents();
    setStatus('Caricamento delle relazioni e dei controlli di copertura…');
    try {
        await reloadWorkspace();
        const summary = coverage.summary;
        setStatus(summary.servicesToReview > 0
            ? `${summary.servicesToReview} servizi richiedono una verifica delle dipendenze.`
            : 'Tutti i servizi dispongono di relazioni operative da consultare.', summary.servicesToReview > 0 ? 'warning' : 'success');
    } catch (error) {
        console.error('Errore caricamento costruttore relazioni:', error);
        setStatus(`Impossibile caricare il costruttore: ${error.message}`, 'danger');
    }
}
