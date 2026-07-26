// ===============================================================================================================
// FILE: src/supplyChain.js
// DESCRIZIONE: Ricerca, filtri e dettaglio dei percorsi multilivello della Supply Chain.
// ===============================================================================================================

import { fetchSupplyChain } from './database.js?v=9';

let supplyRows = [];
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

function renderRows() {
    const tbody = document.getElementById('supply-chain-table-body');
    const status = document.getElementById('supply-filter-status');
    const clear = document.getElementById('supply-filter-clear');
    if (!tbody) return;

    const filters = readFilters();
    const filtered = supplyRows.filter((row) => {
        if (!matchesSearch(row, filters.query)) return false;
        if (filters.serviceId && String(row.servizioRadiceId) !== filters.serviceId) return false;
        if (filters.assetId && String(row.assetEffettivoId || '') !== filters.assetId) return false;
        if (filters.supplierId && String(row.fornitoreEffettivoId) !== filters.supplierId) return false;
        if (filters.origin === 'direct' && row.derivata) return false;
        if (filters.origin === 'derived' && !row.derivata) return false;
        return true;
    });

    if (clear) clear.disabled = !activeFilters(filters);
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
            : 'Collegamento diretto';
        const supplier = row.fornitoreEffettivoCodice
            ? `${row.fornitoreEffettivoCodice} · ${row.fornitoreEffettivo}`
            : row.fornitoreEffettivo;
        const typeLabel = row.derivata ? 'Derivata' : 'Diretta';
        const routeLabel = row.origineCollegamento === 'SERVIZIO_ASSET_FORNITORE'
            ? 'Servizio → Asset → Fornitore'
            : 'Servizio → Fornitore';

        return `
            <tr>
                <td class="cell-primary">${escapeHtml(service)}</td>
                <td class="cell-primary">${escapeHtml(asset)}</td>
                <td class="cell-primary">${escapeHtml(supplier)}</td>
                <td>
                    <span class="supply-origin-badge ${row.derivata ? 'supply-origin-badge--derived' : 'supply-origin-badge--direct'}">${typeLabel}</span>
                    <small class="supply-route-label">${escapeHtml(routeLabel)}</small>
                </td>
                <td class="cell-small">S${row.profonditaServizio} · A${row.profonditaAsset} · F${row.profonditaFornitore}</td>
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
        supplyRows = await fetchSupplyChain();

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
    } catch (error) {
        console.error('Errore rendering Supply Chain:', error);
        supplyRows = [];
        tbody.innerHTML = `<tr><td colspan="6" class="error-msg">Errore: ${escapeHtml(error.message)}</td></tr>`;
        if (status) status.textContent = 'Supply Chain non disponibile.';
    }
}
