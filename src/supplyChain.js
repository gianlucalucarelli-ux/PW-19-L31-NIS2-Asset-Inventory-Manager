// ===============================================================================================================
// FILE: src/supplyChain.js
// DESCRIZIONE: Ricerca, filtri e dettaglio dei percorsi multilivello della Supply Chain.
// ===============================================================================================================

import { fetchSupplyChain } from './database.js?build=20260726-d2';
import { fetchRelationshipWorkspace, getRootServices, buildServiceDependencyTree } from './relationshipService.js?build=20260727-m1';
import { renderDependencyTree, renderImpactPath } from './relationshipGraph.js?build=20260727-n1';

let supplyRows = [];
let supplyWorkspace = null;
let supplyInitialized = false;

function escapeHtml(value) {
    const element = document.createElement('div');
    element.textContent = String(value ?? '');
    return element.innerHTML;
}

function normalize(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('it-IT')
        .trim();
}

function firstSupplyValue(row, keys, fallback = '') {
    for (const key of keys) {
        const value = row?.[key];
        if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return fallback;
}

function safeSupplyDepth(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizeSupplyRow(row, index) {
    const service = String(firstSupplyValue(row, [
        'servizioRadice', 'nome_servizio_radice', 'Service_Name', 'servizio_nome'
    ], 'N/D'));
    const asset = String(firstSupplyValue(row, [
        'assetEffettivo', 'nome_asset_effettivo', 'Dependent_Asset', 'asset_dipendenti'
    ], ''));
    const supplier = String(firstSupplyValue(row, [
        'fornitoreEffettivo', 'nome_fornitore_effettivo', 'Vendor_Partner', 'fornitori'
    ], 'N/D'));
    const serviceDepth = safeSupplyDepth(firstSupplyValue(row, ['profonditaServizio', 'profondita_servizio'], 0));
    const assetDepth = safeSupplyDepth(firstSupplyValue(row, ['profonditaAsset', 'profondita_asset'], 0));
    const supplierDepth = safeSupplyDepth(firstSupplyValue(row, ['profonditaFornitore', 'profondita_fornitore'], 0));

    return {
        ...row,
        idPercorso: String(firstSupplyValue(row, ['idPercorso', 'id_percorso'], `supply-${index + 1}`)),
        origineCollegamento: String(firstSupplyValue(row, ['origineCollegamento', 'origine_collegamento'], asset
            ? 'SERVIZIO_ASSET_FORNITORE'
            : 'SERVIZIO_FORNITORE')),
        servizioRadiceId: firstSupplyValue(row, ['servizioRadiceId', 'servizio_radice_id'], null),
        servizioRadiceCodice: String(firstSupplyValue(row, ['servizioRadiceCodice', 'codice_servizio_radice'], '')),
        servizioRadice: service,
        servizioOrigineId: firstSupplyValue(row, ['servizioOrigineId', 'servizio_origine_id'], null),
        servizioOrigineCodice: String(firstSupplyValue(row, ['servizioOrigineCodice', 'codice_servizio_origine'], '')),
        servizioOrigine: String(firstSupplyValue(row, ['servizioOrigine', 'nome_servizio_origine'], service)),
        profonditaServizio: serviceDepth,
        assetOrigineId: firstSupplyValue(row, ['assetOrigineId', 'asset_origine_id'], null),
        assetOrigineCodice: String(firstSupplyValue(row, ['assetOrigineCodice', 'codice_asset_origine'], '')),
        assetOrigine: String(firstSupplyValue(row, ['assetOrigine', 'nome_asset_origine'], asset)),
        assetEffettivoId: firstSupplyValue(row, ['assetEffettivoId', 'asset_effettivo_id'], null),
        assetEffettivoCodice: String(firstSupplyValue(row, ['assetEffettivoCodice', 'codice_asset_effettivo'], '')),
        assetEffettivo: asset,
        profonditaAsset: assetDepth,
        fornitoreOrigineId: firstSupplyValue(row, ['fornitoreOrigineId', 'fornitore_origine_id'], null),
        fornitoreOrigineCodice: String(firstSupplyValue(row, ['fornitoreOrigineCodice', 'codice_fornitore_origine'], '')),
        fornitoreOrigine: String(firstSupplyValue(row, ['fornitoreOrigine', 'nome_fornitore_origine'], supplier)),
        fornitoreEffettivoId: firstSupplyValue(row, ['fornitoreEffettivoId', 'fornitore_effettivo_id'], null),
        fornitoreEffettivoCodice: String(firstSupplyValue(row, ['fornitoreEffettivoCodice', 'codice_fornitore_effettivo'], '')),
        fornitoreEffettivo: supplier,
        profonditaFornitore: supplierDepth,
        contattoFornitore: String(firstSupplyValue(row, ['contattoFornitore', 'contatto_fornitore', 'Vendor_Contact'], '')),
        tipoDipendenzaServizio: String(firstSupplyValue(row, ['tipoDipendenzaServizio', 'tipo_dipendenza_servizio'], 'Non specificata')),
        tipoRelazioneAssetFornitore: String(firstSupplyValue(row, ['tipoRelazioneAssetFornitore', 'tipo_relazione_asset_fornitore'], '')),
        descrizioneDipendenzaServizio: String(firstSupplyValue(row, ['descrizioneDipendenzaServizio', 'descrizione_dipendenza_servizio'], '')),
        descrizioneRelazioneAssetFornitore: String(firstSupplyValue(row, ['descrizioneRelazioneAssetFornitore', 'descrizione_relazione_asset_fornitore'], '')),
        derivata: Boolean(row?.derivata)
            || serviceDepth > 0
            || assetDepth > 0
            || supplierDepth > 0
            || Boolean(row?.ereditataDaSottoservizio ?? row?.ereditata_da_sottoservizio)
            || Boolean(row?.ereditataDaSottoasset ?? row?.ereditata_da_sottoasset)
            || Boolean(row?.ereditataDaSubfornitore ?? row?.ereditata_da_subfornitore)
    };
}

function syncSelectTitle(select) {
    if (!select) return;
    const selectedText = select.selectedOptions?.[0]?.textContent?.trim() || '';
    select.title = selectedText;
    select.setAttribute('aria-label', selectedText || select.getAttribute('aria-label') || 'Selezione');
}

function setSelectOptions(select, values, placeholder) {
    if (!select) return;
    const current = select.value;
    select.replaceChildren();

    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = placeholder;
    select.appendChild(empty);

    values.forEach(({ value, label }) => {
        const option = document.createElement('option');
        option.value = String(value);
        option.textContent = label;
        select.appendChild(option);
    });

    if ([...select.options].some((option) => option.value === current)) {
        select.value = current;
    }
    syncSelectTitle(select);
}

function uniqueOptions(rows, idField, codeField, nameField) {
    const map = new Map();
    rows.forEach((row) => {
        const id = row[idField];
        if (id === null || id === undefined || map.has(String(id))) return;
        const code = row[codeField] || '';
        const name = row[nameField] || 'N/D';
        map.set(String(id), {
            value: id,
            label: code ? `${code} · ${name}` : name
        });
    });
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'it'));
}

function readFilters() {
    return {
        query: normalize(document.getElementById('supply-search')?.value),
        serviceId: document.getElementById('supply-filter-service')?.value || '',
        assetId: document.getElementById('supply-filter-asset')?.value || '',
        supplierId: document.getElementById('supply-filter-supplier')?.value || '',
        origin: document.getElementById('supply-filter-origin')?.value || ''
    };
}

function activeFilters(filters) {
    return Boolean(filters.query || filters.serviceId || filters.assetId || filters.supplierId || filters.origin);
}

function matchesSearch(row, query) {
    if (!query) return true;
    return [
        row.servizioRadiceCodice,
        row.servizioRadice,
        row.servizioOrigineCodice,
        row.servizioOrigine,
        row.assetOrigineCodice,
        row.assetOrigine,
        row.assetEffettivoCodice,
        row.assetEffettivo,
        row.fornitoreOrigineCodice,
        row.fornitoreOrigine,
        row.fornitoreEffettivoCodice,
        row.fornitoreEffettivo,
        row.tipoDipendenzaServizio,
        row.tipoRelazioneAssetFornitore
    ].some((value) => normalize(value).includes(query));
}

function getFilteredRows(filters = readFilters()) {
    return supplyRows.filter((row) => {
        if (!matchesSearch(row, filters.query)) return false;
        if (filters.serviceId && String(row.servizioRadiceId) !== filters.serviceId) return false;
        if (filters.assetId && String(row.assetEffettivoId || '') !== filters.assetId) return false;
        if (filters.supplierId && String(row.fornitoreEffettivoId) !== filters.supplierId) return false;
        if (filters.origin === 'direct' && row.derivata) return false;
        if (filters.origin === 'derived' && !row.derivata) return false;
        return true;
    });
}

function renderRows() {
    const tbody = document.getElementById('supply-chain-table-body');
    const status = document.getElementById('supply-filter-status');
    const clear = document.getElementById('supply-filter-clear');
    const exportButton = document.getElementById('btn-export-supply-chain');
    if (!tbody) return;

    const filters = readFilters();
    const filtered = getFilteredRows(filters);

    if (clear) clear.disabled = !activeFilters(filters);
    if (exportButton) exportButton.disabled = filtered.length === 0;
    if (status) {
        status.textContent = activeFilters(filters)
            ? `${filtered.length} percorsi su ${supplyRows.length}`
            : `${supplyRows.length} percorsi attivi`;
    }

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="table-state">Nessun percorso soddisfa i criteri selezionati.</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map((row) => {
        const service = row.servizioRadiceCodice
            ? `${row.servizioRadiceCodice} · ${row.servizioRadice}`
            : row.servizioRadice;
        const asset = row.assetEffettivo
            ? `${row.assetEffettivoCodice ? `${row.assetEffettivoCodice} · ` : ''}${row.assetEffettivo}`
            : '—';
        const supplier = row.fornitoreEffettivoCodice
            ? `${row.fornitoreEffettivoCodice} · ${row.fornitoreEffettivo}`
            : row.fornitoreEffettivo;
        const typeLabel = row.derivata ? 'Derivata' : 'Diretta';
        const hasAssetStep = row.origineCollegamento === 'SERVIZIO_ASSET_FORNITORE' && Boolean(row.assetEffettivo);
        const routeLabel = hasAssetStep
            ? 'Servizio → Asset → Fornitore'
            : 'Servizio → Fornitore';
        const levelsLabel = hasAssetStep
            ? `S${row.profonditaServizio} · A${row.profonditaAsset} · F${row.profonditaFornitore}`
            : `S${row.profonditaServizio} · A— · F${row.profonditaFornitore}`;

        return `
            <tr>
                <td class="cell-primary">${escapeHtml(service)}</td>
                <td class="cell-primary">${escapeHtml(asset)}</td>
                <td class="cell-primary">${escapeHtml(supplier)}</td>
                <td>
                    <span class="supply-origin-badge ${row.derivata ? 'supply-origin-badge--derived' : 'supply-origin-badge--direct'}">${typeLabel}</span>
                    <small class="supply-route-label">${escapeHtml(routeLabel)}</small>
                </td>
                <td class="cell-small">${escapeHtml(levelsLabel)}</td>
                <td class="cell-actions">
                    <button type="button" class="btn-detail supply-detail-btn" data-path-id="${escapeHtml(row.idPercorso)}" aria-haspopup="dialog">Dettaglio</button>
                </td>
            </tr>
        `;
    }).join('');

    tbody.querySelectorAll('.supply-detail-btn').forEach((button) => {
        button.addEventListener('click', () => {
            const row = supplyRows.find((item) => item.idPercorso === button.dataset.pathId);
            if (row) openSupplyDetail(row);
        });
    });
}

function supplyLabel(code, name, fallback = 'N/D') {
    const cleanCode = String(code || '').trim();
    const cleanName = String(name || '').trim();
    if (cleanCode && cleanName) return `${cleanCode} · ${cleanName}`;
    return cleanName || cleanCode || fallback;
}

function supplyRouteLabel(row) {
    return row.origineCollegamento === 'SERVIZIO_ASSET_FORNITORE'
        ? 'Servizio → Asset → Fornitore'
        : 'Servizio → Fornitore';
}

function supplyInheritanceLabel(row) {
    return [
        row.ereditataDaSottoservizio ? 'Sottoservizio' : '',
        row.ereditataDaSottoasset ? 'Sottoasset' : '',
        row.ereditataDaSubfornitore ? 'Subfornitore' : ''
    ].filter(Boolean).join(', ') || 'Nessuna';
}

function supplyExportFileName() {
    const date = new Date();
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `supply_chain_${yyyy}-${mm}-${dd}.xlsx`;
}

async function exportSupplyChain() {
    const exportButton = document.getElementById('btn-export-supply-chain');
    const status = document.getElementById('supply-filter-status');
    const filters = readFilters();
    const rows = getFilteredRows(filters);

    if (rows.length === 0) {
        if (status) status.textContent = 'Nessun percorso disponibile per l’esportazione.';
        return;
    }
    if (typeof ExcelJS === 'undefined') {
        throw new Error('Modulo ExcelJS non disponibile. Ricaricare la pagina e riprovare.');
    }

    const defaultLabel = exportButton?.textContent || 'Esporta XLS';
    try {
        if (exportButton) {
            exportButton.disabled = true;
            exportButton.textContent = 'Esportazione…';
        }
        if (status) status.textContent = `Preparazione di ${rows.length} percorsi…`;

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'NIS2 Asset Inventory Manager';
        workbook.lastModifiedBy = 'NIS2 Asset Inventory Manager';
        workbook.created = new Date();

        const sheet = workbook.addWorksheet('Supply Chain', {
            views: [{ state: 'frozen', ySplit: 1, activeCell: 'A2' }]
        });
        sheet.columns = [
            { header: 'Servizio radice', key: 'servizioRadice', width: 34 },
            { header: 'Servizio origine', key: 'servizioOrigine', width: 34 },
            { header: 'Asset origine', key: 'assetOrigine', width: 32 },
            { header: 'Asset effettivo', key: 'assetEffettivo', width: 32 },
            { header: 'Fornitore origine', key: 'fornitoreOrigine', width: 34 },
            { header: 'Fornitore effettivo', key: 'fornitoreEffettivo', width: 34 },
            { header: 'Contatto fornitore', key: 'contatto', width: 34 },
            { header: 'Relazione', key: 'relazione', width: 16 },
            { header: 'Percorso', key: 'percorso', width: 32 },
            { header: 'Livelli S/A/F', key: 'livelli', width: 18 },
            { header: 'Tipo dipendenza', key: 'tipoDipendenza', width: 28 },
            { header: 'Relazione asset-fornitore', key: 'tipoRelazione', width: 32 },
            { header: 'Ereditarietà', key: 'ereditarieta', width: 28 },
            { header: 'Descrizione dipendenza', key: 'descrizioneDipendenza', width: 48 },
            { header: 'Descrizione relazione', key: 'descrizioneRelazione', width: 48 }
        ];

        rows.forEach((row) => {
            sheet.addRow({
                servizioRadice: supplyLabel(row.servizioRadiceCodice, row.servizioRadice),
                servizioOrigine: supplyLabel(row.servizioOrigineCodice, row.servizioOrigine),
                assetOrigine: row.assetOrigine
                    ? supplyLabel(row.assetOrigineCodice, row.assetOrigine)
                    : 'Non applicabile',
                assetEffettivo: row.assetEffettivo
                    ? supplyLabel(row.assetEffettivoCodice, row.assetEffettivo)
                    : 'Non applicabile',
                fornitoreOrigine: supplyLabel(row.fornitoreOrigineCodice, row.fornitoreOrigine),
                fornitoreEffettivo: supplyLabel(row.fornitoreEffettivoCodice, row.fornitoreEffettivo),
                contatto: row.contattoFornitore || '',
                relazione: row.derivata ? 'Derivata' : 'Diretta',
                percorso: supplyRouteLabel(row),
                livelli: row.assetEffettivo
                    ? `S${safeSupplyDepth(row.profonditaServizio)} · A${safeSupplyDepth(row.profonditaAsset)} · F${safeSupplyDepth(row.profonditaFornitore)}`
                    : `S${safeSupplyDepth(row.profonditaServizio)} · A— · F${safeSupplyDepth(row.profonditaFornitore)}`,
                tipoDipendenza: row.tipoDipendenzaServizio || 'Non specificata',
                tipoRelazione: row.tipoRelazioneAssetFornitore || 'Non applicabile',
                ereditarieta: supplyInheritanceLabel(row),
                descrizioneDipendenza: row.descrizioneDipendenzaServizio || '',
                descrizioneRelazione: row.descrizioneRelazioneAssetFornitore || ''
            });
        });

        const header = sheet.getRow(1);
        header.height = 28;
        header.eachCell((cell) => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        });
        sheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return;
            row.eachCell((cell) => {
                cell.alignment = { vertical: 'top', wrapText: true };
                cell.border = { bottom: { style: 'thin', color: { argb: 'FFD8E2E5' } } };
            });
        });
        sheet.autoFilter = { from: 'A1', to: `O${sheet.rowCount}` };

        const criteria = workbook.addWorksheet('Criteri esportazione');
        criteria.columns = [
            { header: 'Criterio', key: 'criterio', width: 30 },
            { header: 'Valore', key: 'valore', width: 60 }
        ];
        criteria.addRows([
            { criterio: 'Data esportazione', valore: new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date()) },
            { criterio: 'Ricerca', valore: document.getElementById('supply-search')?.value.trim() || 'Nessuna' },
            { criterio: 'Servizio', valore: document.getElementById('supply-filter-service')?.selectedOptions?.[0]?.textContent || 'Tutti' },
            { criterio: 'Asset', valore: document.getElementById('supply-filter-asset')?.selectedOptions?.[0]?.textContent || 'Tutti' },
            { criterio: 'Fornitore', valore: document.getElementById('supply-filter-supplier')?.selectedOptions?.[0]?.textContent || 'Tutti' },
            { criterio: 'Origine relazione', valore: document.getElementById('supply-filter-origin')?.selectedOptions?.[0]?.textContent || 'Dirette e derivate' },
            { criterio: 'Percorsi esportati', valore: rows.length }
        ]);
        criteria.getRow(1).eachCell((cell) => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
        });

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = supplyExportFileName();
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);

        if (status) status.textContent = `${rows.length} percorsi esportati correttamente.`;
    } catch (error) {
        console.error('Errore esportazione Supply Chain:', error);
        if (status) status.textContent = `Esportazione non riuscita: ${error.message}`;
    } finally {
        if (exportButton) {
            exportButton.textContent = defaultLabel;
            exportButton.disabled = getFilteredRows().length === 0;
        }
    }
}

function detailField(label, value) {
    return `
        <div class="asset-detail-field">
            <dt>${escapeHtml(label)}</dt>
            <dd>${escapeHtml(value || 'N/D')}</dd>
        </div>
    `;
}

function hierarchyLabel(code, name, depth) {
    const base = `${code ? `${code} · ` : ''}${name || 'N/D'}`;
    return depth > 0 ? `${base} (livello ${depth})` : `${base} (radice)`;
}

function openSupplyDetail(row) {
    const dialog = document.getElementById('supply-detail-dialog');
    const title = document.getElementById('supply-detail-title');
    const subtitle = document.getElementById('supply-detail-subtitle');
    const content = document.getElementById('supply-detail-content');
    if (!dialog || !title || !subtitle || !content) return;

    title.textContent = row.servizioRadice || 'Dettaglio Supply Chain';
    subtitle.textContent = row.derivata ? 'Percorso derivato o gerarchico' : 'Relazione diretta';

    const route = row.origineCollegamento === 'SERVIZIO_ASSET_FORNITORE'
        ? 'Servizio → Asset → Fornitore'
        : 'Servizio → Fornitore';

    content.innerHTML = `
        <section class="asset-detail-section">
            <div class="asset-detail-section-heading">
                <h3>Percorso e classificazione</h3>
                <span class="supply-origin-badge ${row.derivata ? 'supply-origin-badge--derived' : 'supply-origin-badge--direct'}">${row.derivata ? 'Derivata' : 'Diretta'}</span>
            </div>
            <dl class="asset-detail-grid">
                ${detailField('Percorso', route)}
                ${detailField('Tipo dipendenza', row.tipoDipendenzaServizio)}
                ${detailField('Relazione asset-fornitore', row.tipoRelazioneAssetFornitore || 'Non applicabile')}
                ${detailField('Livelli', `Servizio ${row.profonditaServizio} · Asset ${row.profonditaAsset} · Fornitore ${row.profonditaFornitore}`)}
            </dl>
        </section>
        <section class="asset-detail-section">
            <div class="asset-detail-section-heading"><h3>Gerarchia completa</h3></div>
            <dl class="asset-detail-grid">
                ${detailField('Servizio radice', hierarchyLabel(row.servizioRadiceCodice, row.servizioRadice, 0))}
                ${detailField('Servizio origine', hierarchyLabel(row.servizioOrigineCodice, row.servizioOrigine, row.profonditaServizio))}
                ${detailField('Asset origine', row.assetOrigine ? hierarchyLabel(row.assetOrigineCodice, row.assetOrigine, 0) : 'Non applicabile')}
                ${detailField('Asset effettivo', row.assetEffettivo ? hierarchyLabel(row.assetEffettivoCodice, row.assetEffettivo, row.profonditaAsset) : 'Non applicabile')}
                ${detailField('Fornitore origine', hierarchyLabel(row.fornitoreOrigineCodice, row.fornitoreOrigine, 0))}
                ${detailField('Fornitore effettivo', hierarchyLabel(row.fornitoreEffettivoCodice, row.fornitoreEffettivo, row.profonditaFornitore))}
                ${detailField('Contatto fornitore', row.contattoFornitore || 'N/D')}
                ${detailField('Ereditarietà', [
                    row.ereditataDaSottoservizio ? 'sottoservizio' : '',
                    row.ereditataDaSottoasset ? 'sottoasset' : '',
                    row.ereditataDaSubfornitore ? 'subfornitore' : ''
                ].filter(Boolean).join(', ') || 'Nessuna')}
            </dl>
        </section>
        <section class="asset-detail-section">
            <div class="asset-detail-section-heading"><h3>Descrizioni</h3></div>
            <dl class="asset-detail-grid">
                ${detailField('Dipendenza servizio', row.descrizioneDipendenzaServizio || 'Nessuna descrizione')}
                ${detailField('Relazione asset-fornitore', row.descrizioneRelazioneAssetFornitore || 'Nessuna descrizione')}
            </dl>
        </section>
    `;

    if (!dialog.open) dialog.showModal();
}


function supplyMapKinds() {
    const kinds = ['service'];
    if (document.getElementById('supply-map-show-assets')?.checked) kinds.push('asset');
    if (document.getElementById('supply-map-show-suppliers')?.checked) kinds.push('supplier');
    return kinds;
}

function supplyOrganizationOptions() {
    return (supplyWorkspace?.organizations ?? []).map((record) => ({
        value: record.id,
        label: `${record.codice_organizzazione || `ORG-${record.id}`} · ${record.nome}`
    }));
}

function populateSupplyMapRoots(selected = '') {
    if (!supplyWorkspace) return;
    const organizationId = document.getElementById('supply-map-organization')?.value || '';
    const roots = getRootServices(supplyWorkspace, organizationId || null).map((record) => ({
        value: record.id,
        label: `${record.codice_servizio} · ${record.nome}`
    }));
    setSelectOptions(document.getElementById('supply-map-root'), roots, 'Seleziona servizio principale');
    const root = document.getElementById('supply-map-root');
    if (root && selected && roots.some((row) => String(row.value) === String(selected))) root.value = String(selected);
    if (root && !root.value && roots.length === 1) root.value = String(roots[0].value);
    syncSelectTitle(root);
}

function renderSupplyMap() {
    const canvas = document.getElementById('supply-map-canvas');
    const status = document.getElementById('supply-map-status');
    const rootId = document.getElementById('supply-map-root')?.value;
    if (!canvas) return;
    if (!supplyWorkspace || !rootId) {
        canvas.replaceChildren();
        if (status) status.textContent = 'Seleziona un servizio principale per esplorare la catena.';
        renderImpactPath(document.getElementById('supply-impact-path'), null);
        return;
    }
    try {
        const tree = buildServiceDependencyTree(supplyWorkspace, rootId);
        const result = renderDependencyTree(canvas, tree, {
            showKinds: supplyMapKinds(),
            expandedDepth: 3,
            onSelect: (node, card) => {
                document.querySelectorAll('#supply-map-canvas .dependency-node.is-selected').forEach((row) => row.classList.remove('is-selected'));
                card.classList.add('is-selected');
                renderImpactPath(document.getElementById('supply-impact-path'), node);
            }
        });
        if (status) status.textContent = `${result.nodes} nodi visualizzati · ${result.shared} elementi condivisi.`;
        renderImpactPath(document.getElementById('supply-impact-path'), null);
    } catch (error) {
        canvas.replaceChildren();
        if (status) status.textContent = error.message;
    }
}

function setSupplyView(mode) {
    const mapPanel = document.getElementById('supply-map-panel');
    const tablePanel = document.getElementById('supply-table-panel');
    const mapButton = document.getElementById('supply-view-map');
    const tableButton = document.getElementById('supply-view-table');
    const showMap = mode !== 'table';
    mapPanel?.classList.toggle('is-hidden', !showMap);
    tablePanel?.classList.toggle('is-hidden', showMap);
    mapButton?.classList.toggle('is-active', showMap);
    tableButton?.classList.toggle('is-active', !showMap);
    mapButton?.setAttribute('aria-pressed', String(showMap));
    tableButton?.setAttribute('aria-pressed', String(!showMap));
    if (showMap) renderSupplyMap();
}

function initializeControls() {
    if (supplyInitialized) return;
    supplyInitialized = true;

    ['supply-search', 'supply-filter-service', 'supply-filter-asset', 'supply-filter-supplier', 'supply-filter-origin']
        .forEach((id) => {
            const control = document.getElementById(id);
            if (!control) return;
            control.addEventListener(control.tagName === 'INPUT' ? 'input' : 'change', renderRows);
        });

    document.getElementById('supply-filter-clear')?.addEventListener('click', () => {
        ['supply-search', 'supply-filter-service', 'supply-filter-asset', 'supply-filter-supplier', 'supply-filter-origin']
            .forEach((id) => {
                const control = document.getElementById(id);
                if (control) control.value = '';
            });
        renderRows();
        document.getElementById('supply-search')?.focus();
    });

    document.getElementById('btn-export-supply-chain')?.addEventListener('click', exportSupplyChain);
    document.getElementById('supply-view-map')?.addEventListener('click', () => setSupplyView('map'));
    document.getElementById('supply-view-table')?.addEventListener('click', () => setSupplyView('table'));
    document.getElementById('supply-map-organization')?.addEventListener('change', () => { syncSelectTitle(document.getElementById('supply-map-organization')); populateSupplyMapRoots(); renderSupplyMap(); });
    document.getElementById('supply-map-root')?.addEventListener('change', () => { syncSelectTitle(document.getElementById('supply-map-root')); renderSupplyMap(); });
    ['supply-map-show-assets', 'supply-map-show-suppliers'].forEach((id) => document.getElementById(id)?.addEventListener('change', renderSupplyMap));

    const dialog = document.getElementById('supply-detail-dialog');
    dialog?.addEventListener('click', (event) => {
        if (event.target === dialog) dialog.close();
    });
}

export async function loadAndRenderSupplyChain() {
    const tbody = document.getElementById('supply-chain-table-body');
    const status = document.getElementById('supply-filter-status');
    if (!tbody) return;

    initializeControls();
    tbody.innerHTML = '<tr><td colspan="6" class="table-state">Estrazione dei percorsi multilivello in corso…</td></tr>';
    if (status) status.textContent = 'Caricamento Supply Chain…';

    try {
        const [supplyData, workspaceData] = await Promise.all([fetchSupplyChain(), fetchRelationshipWorkspace()]);
        supplyRows = supplyData.map(normalizeSupplyRow);
        supplyWorkspace = workspaceData;

        setSelectOptions(document.getElementById('supply-map-organization'), supplyOrganizationOptions(), 'Tutti i soggetti NIS2');
        if (supplyWorkspace.organizations.length === 1) {
            document.getElementById('supply-map-organization').value = String(supplyWorkspace.organizations[0].id);
        }
        populateSupplyMapRoots();

        setSelectOptions(
            document.getElementById('supply-filter-service'),
            uniqueOptions(supplyRows, 'servizioRadiceId', 'servizioRadiceCodice', 'servizioRadice'),
            'Tutti i servizi'
        );
        setSelectOptions(
            document.getElementById('supply-filter-asset'),
            uniqueOptions(supplyRows, 'assetEffettivoId', 'assetEffettivoCodice', 'assetEffettivo'),
            'Tutti gli asset'
        );
        setSelectOptions(
            document.getElementById('supply-filter-supplier'),
            uniqueOptions(supplyRows, 'fornitoreEffettivoId', 'fornitoreEffettivoCodice', 'fornitoreEffettivo'),
            'Tutti i fornitori'
        );

        renderRows();
        setSupplyView('map');
    } catch (error) {
        console.error('Errore rendering Supply Chain:', error);
        supplyRows = [];
        tbody.innerHTML = `<tr><td colspan="6" class="error-msg">Errore: ${escapeHtml(error.message)}</td></tr>`;
        if (status) status.textContent = 'Supply Chain non disponibile.';
    }
}
