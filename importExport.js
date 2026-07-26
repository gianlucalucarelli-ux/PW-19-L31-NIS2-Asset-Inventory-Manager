/* =========================================================================
   FILE: src/importExport.js - Modulo Import/Export (SheetJS Wrapper)
   ========================================================================= */

/**
 * Esporta la lista degli asset correnti in un file Excel (.xlsx)
 * @param {Array} assetsList - Array di oggetti ricevuto dalla vista Supabase
 */
export function exportToExcel(assetsList) {
    if (!assetsList || assetsList.length === 0) {
        alert("Nessun dato disponibile per l'esportazione.");
        return;
    }

    // Mappatura per esportazione professionale
    const rows = assetsList.map(asset => ({
        "ID": asset.id || 'N/A',
        "Nome Asset": asset.nome || asset.Asset_Name || 'N/D',
        "Versione SW/FW": asset.versione || asset.Software_Version || 'N/D',
        "Criticità (NIS2)": asset.classificazione_criticita || asset.Criticity_Level || 'Bassa'
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "AssetInventory");

    XLSX.writeFile(workbook, "NIS2_Asset_Inventory.xlsx");
}


function normalizzaSegmentoNomeFile(valore, fallback = 'tutte') {
    const segmento = String(valore ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('it-IT')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');

    return segmento || fallback;
}

function dataLocalePerNomeFile(data = new Date()) {
    const anno = data.getFullYear();
    const mese = String(data.getMonth() + 1).padStart(2, '0');
    const giorno = String(data.getDate()).padStart(2, '0');
    return `${anno}-${mese}-${giorno}`;
}

function scaricaBufferExcel(buffer, nomeFile) {
    const blob = new Blob(
        [buffer],
        { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nomeFile;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

/**
 * Esporta esclusivamente gli asset attualmente visualizzati dopo ricerca e filtri.
 * Il file contiene un foglio dati formattato e un foglio con i criteri applicati.
 */
export async function exportFilteredAssetsToExcel(assetsList, criteria = {}) {
    if (!assetsList || assetsList.length === 0) {
        alert('Nessun risultato filtrato disponibile per l’esportazione.');
        return;
    }

    if (typeof ExcelJS === 'undefined') {
        throw new Error('Modulo ExcelJS non disponibile. Ricaricare la pagina e riprovare.');
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'NIS2 Asset Inventory Manager';
    workbook.lastModifiedBy = 'NIS2 Asset Inventory Manager';
    workbook.created = new Date();
    workbook.modified = new Date();

    const worksheet = workbook.addWorksheet('Asset filtrati', {
        views: [{ state: 'frozen', ySplit: 1, activeCell: 'A2' }],
        properties: { defaultRowHeight: 20 }
    });

    worksheet.columns = [
        { header: 'ID', key: 'id', width: 10 },
        { header: 'Codice asset', key: 'codice', width: 24 },
        { header: 'Nome asset', key: 'nome', width: 34 },
        { header: 'Categoria', key: 'categoria', width: 34 },
        { header: 'Organizzazione', key: 'organizzazione', width: 38 },
        { header: 'Responsabile', key: 'responsabile', width: 32 },
        { header: 'E-mail responsabile', key: 'emailResponsabile', width: 36 },
        { header: 'Versione', key: 'versione', width: 24 },
        { header: 'Ubicazione', key: 'ubicazione', width: 30 },
        { header: 'Descrizione', key: 'descrizione', width: 52 },
        { header: 'Data inserimento', key: 'dataInserimento', width: 20 },
        { header: 'Criticità NIS2', key: 'criticita', width: 18 }
    ];

    assetsList.forEach((asset) => {
        worksheet.addRow({
            id: asset.id ?? '',
            codice: asset.codice_asset ?? '',
            nome: asset.nome ?? '',
            categoria: asset.categoria ?? 'N/D',
            organizzazione: asset.organizzazione ?? 'N/D',
            responsabile: asset.responsabile ?? 'N/D',
            emailResponsabile: asset.email_responsabile ?? '',
            versione: asset.versione ?? 'N/D',
            ubicazione: asset.ubicazione ?? 'N/D',
            descrizione: asset.descrizione ?? '',
            dataInserimento: asset.data_inserimento ?? '',
            criticita: asset.classificazione_criticita ?? 'Bassa'
        });
    });

    const headerRow = worksheet.getRow(1);
    headerRow.height = 26;
    headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
            bottom: { style: 'medium', color: { argb: 'FF0B5F59' } }
        };
    });

    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        row.height = 22;
        row.eachCell((cell, columnNumber) => {
            cell.alignment = {
                vertical: 'middle',
                horizontal: columnNumber === 1 ? 'center' : 'left',
                wrapText: true
            };
            cell.border = {
                bottom: { style: 'thin', color: { argb: 'FFD8E2E5' } }
            };
            if (rowNumber % 2 === 0) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F8F8' } };
            }
        });

        const criticitaCell = row.getCell(12);
        const criticita = String(criticitaCell.value ?? '');
        const criticitaColori = {
            Critica: { fill: 'FFFDE2E2', font: 'FF9B1C1C' },
            Alta: { fill: 'FFFFE8CC', font: 'FF9A4B00' },
            Media: { fill: 'FFFFF3BF', font: 'FF765C00' },
            Bassa: { fill: 'FFE1F4E8', font: 'FF176B3A' }
        };
        const colori = criticitaColori[criticita];
        if (colori) {
            criticitaCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colori.fill } };
            criticitaCell.font = { bold: true, color: { argb: colori.font } };
            criticitaCell.alignment = { vertical: 'middle', horizontal: 'center' };
        }
    });

    worksheet.autoFilter = {
        from: 'A1',
        to: `L${worksheet.rowCount}`
    };

    const criteriaSheet = workbook.addWorksheet('Criteri esportazione', {
        properties: { defaultRowHeight: 21 }
    });
    criteriaSheet.columns = [
        { header: 'Criterio', key: 'criterio', width: 28 },
        { header: 'Valore', key: 'valore', width: 52 }
    ];

    const dataEsportazione = new Intl.DateTimeFormat('it-IT', {
        dateStyle: 'medium',
        timeStyle: 'medium'
    }).format(new Date());

    criteriaSheet.addRows([
        { criterio: 'Data esportazione', valore: dataEsportazione },
        { criterio: 'Testo cercato', valore: criteria.testoRicerca || 'Nessuno' },
        { criterio: 'Criticità', valore: criteria.criticita || 'Tutte' },
        { criterio: 'Categoria', valore: criteria.categoria || 'Tutte' },
        { criterio: 'Organizzazione', valore: criteria.organizzazione || 'Tutte' },
        { criterio: 'Numero risultati', valore: criteria.numeroRisultati ?? assetsList.length }
    ]);

    const criteriaHeader = criteriaSheet.getRow(1);
    criteriaHeader.height = 26;
    criteriaHeader.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    criteriaSheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        row.getCell(1).font = { bold: true, color: { argb: 'FF334155' } };
        row.eachCell((cell) => {
            cell.alignment = { vertical: 'middle', wrapText: true };
            cell.border = {
                bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }
            };
        });
    });

    criteriaSheet.views = [{ state: 'frozen', ySplit: 1, activeCell: 'A2' }];
    criteriaSheet.autoFilter = { from: 'A1', to: `B${criteriaSheet.rowCount}` };

    const criticitaFile = normalizzaSegmentoNomeFile(criteria.criticita, 'tutte');
    const nomeFile = `inventario_asset_filtrato_${criticitaFile}_${dataLocalePerNomeFile()}.xlsx`;
    const buffer = await workbook.xlsx.writeBuffer();
    scaricaBufferExcel(buffer, nomeFile);
}

/**
 * Scarica il modello ufficiale di importazione e un foglio di supporto con i
 * valori controllati correntemente disponibili nel database.
 */
export async function downloadAssetImportTemplate(references = {}) {
    if (typeof ExcelJS === 'undefined') {
        throw new Error('Modulo ExcelJS non disponibile. Ricaricare la pagina e riprovare.');
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'NIS2 Asset Inventory Manager';

    const sheet = workbook.addWorksheet('Import asset', {
        views: [{ state: 'frozen', ySplit: 1, activeCell: 'A2' }]
    });
    sheet.columns = [
        { header: 'Codice asset', key: 'codice', width: 24 },
        { header: 'Nome asset', key: 'nome', width: 34 },
        { header: 'Categoria', key: 'categoria', width: 34 },
        { header: 'Organizzazione', key: 'organizzazione', width: 38 },
        { header: 'Criticità NIS2', key: 'criticita', width: 18 },
        { header: 'Responsabile', key: 'responsabile', width: 34 },
        { header: 'Versione', key: 'versione', width: 24 },
        { header: 'Ubicazione', key: 'ubicazione', width: 30 },
        { header: 'Descrizione', key: 'descrizione', width: 55 }
    ];

    const header = sheet.getRow(1);
    header.height = 26;
    header.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    sheet.autoFilter = { from: 'A1', to: 'I1' };

    for (let row = 2; row <= 501; row += 1) {
        sheet.getCell(`E${row}`).dataValidation = {
            type: 'list',
            allowBlank: false,
            formulae: ['"Bassa,Media,Alta,Critica"']
        };
    }

    const values = workbook.addWorksheet('Valori ammessi');
    values.columns = [
        { header: 'Categorie', key: 'categorie', width: 40 },
        { header: 'Codice ACN', key: 'codiceAcn', width: 22 },
        { header: 'Organizzazioni', key: 'organizzazioni', width: 42 },
        { header: 'Responsabili', key: 'responsabili', width: 42 },
        { header: 'E-mail responsabile', key: 'email', width: 42 }
    ];

    const maxRows = Math.max(
        references.categorie?.length || 0,
        references.organizzazioni?.length || 0,
        references.responsabili?.length || 0,
        1
    );
    for (let index = 0; index < maxRows; index += 1) {
        const category = references.categorie?.[index];
        const organization = references.organizzazioni?.[index];
        const responsible = references.responsabili?.[index];
        values.addRow({
            categorie: category?.nome || '',
            codiceAcn: category?.codice_acn || '',
            organizzazioni: organization?.nome || '',
            responsabili: responsible
                ? `${responsible.nome || ''} ${responsible.cognome || ''}`.trim()
                : '',
            email: responsible?.email || ''
        });
    }
    values.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
    });

    const instructions = workbook.addWorksheet('Istruzioni');
    instructions.columns = [
        { header: 'Regola', key: 'regola', width: 32 },
        { header: 'Descrizione', key: 'descrizione', width: 90 }
    ];
    instructions.addRows([
        { regola: 'Campi obbligatori', descrizione: 'Codice asset, Nome asset, Categoria, Organizzazione e Criticità NIS2.' },
        { regola: 'Codice asset', descrizione: 'Da 3 a 80 caratteri: lettere, numeri, trattino e underscore. Deve essere univoco.' },
        { regola: 'Categoria', descrizione: 'Usare il nome o il codice ACN riportato nel foglio Valori ammessi.' },
        { regola: 'Organizzazione', descrizione: 'Usare il nome riportato nel foglio Valori ammessi.' },
        { regola: 'Responsabile', descrizione: 'Campo facoltativo: usare preferibilmente l’e-mail riportata nel foglio Valori ammessi.' },
        { regola: 'Anteprima', descrizione: 'L’applicazione mostra gli errori riga per riga prima di eseguire qualsiasi inserimento.' }
    ]);
    instructions.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    scaricaBufferExcel(buffer, `modello_import_asset_${dataLocalePerNomeFile()}.xlsx`);
}

function normalizeHeader(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('it-IT')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function normalizeLookup(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('it-IT')
        .trim();
}

const IMPORT_HEADER_ALIASES = {
    codice: ['codice asset', 'codice', 'asset code', 'codice_asset'],
    nome: ['nome asset', 'nome', 'asset name', 'nome_asset'],
    categoria: ['categoria', 'categoria asset', 'codice acn', 'categoria_asset_id'],
    organizzazione: ['organizzazione', 'organization', 'organizzazione_id'],
    criticita: ['criticita nis2', 'criticita', 'criticita (nis2)', 'criticity level'],
    responsabile: ['responsabile', 'responsabile tecnico', 'email responsabile', 'responsabile_id'],
    versione: ['versione', 'versione sw/fw', 'software version'],
    ubicazione: ['ubicazione', 'location'],
    descrizione: ['descrizione', 'description']
};

function mapHeaders(headers) {
    const mapped = new Map();
    headers.forEach((header) => {
        const normalized = normalizeHeader(header);
        for (const [canonical, aliases] of Object.entries(IMPORT_HEADER_ALIASES)) {
            if (aliases.some((alias) => normalizeHeader(alias) === normalized)) {
                mapped.set(canonical, header);
                break;
            }
        }
    });
    return mapped;
}

function readMapped(row, headerMap, field) {
    const header = headerMap.get(field);
    return header ? row[header] : '';
}

function buildReferenceMaps(references = {}) {
    const categories = new Map();
    (references.categorie || []).forEach((item) => {
        [item.id, item.nome, item.codice_acn].filter(Boolean).forEach((key) => {
            categories.set(normalizeLookup(key), item);
        });
    });

    const organizations = new Map();
    (references.organizzazioni || []).forEach((item) => {
        [item.id, item.nome].filter(Boolean).forEach((key) => {
            organizations.set(normalizeLookup(key), item);
        });
    });

    const responsibles = new Map();
    (references.responsabili || []).forEach((item) => {
        const fullName = `${item.nome || ''} ${item.cognome || ''}`.trim();
        [item.id, item.email, fullName].filter(Boolean).forEach((key) => {
            responsibles.set(normalizeLookup(key), item);
        });
    });

    return { categories, organizations, responsibles };
}

function normalizeCriticality(value) {
    const normalized = normalizeLookup(value);
    const mapping = {
        bassa: 'Bassa',
        media: 'Media',
        alta: 'Alta',
        critica: 'Critica'
    };
    return mapping[normalized] || '';
}

function parseWorkbook(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                if (typeof XLSX === 'undefined') {
                    throw new Error('Modulo SheetJS non disponibile.');
                }
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                if (!sheetName) throw new Error('Il file non contiene fogli leggibili.');
                const sheet = workbook.Sheets[sheetName];
                const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
                const headers = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 0, blankrows: false })[0] || [];
                resolve({ rows, headers, sheetName });
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = () => reject(new Error('Impossibile leggere il file selezionato.'));
        reader.readAsArrayBuffer(file);
    });
}

/**
 * Analizza e valida integralmente un file prima dell'importazione.
 * Nessuna query INSERT viene eseguita in questa fase.
 */
export async function parseAssetImportFile(file, references = {}, existingAssets = []) {
    const { rows, headers, sheetName } = await parseWorkbook(file);
    const headerMap = mapHeaders(headers);
    const missingHeaders = ['codice', 'nome', 'categoria', 'organizzazione', 'criticita']
        .filter((field) => !headerMap.has(field));

    if (missingHeaders.length > 0) {
        const labels = {
            codice: 'Codice asset',
            nome: 'Nome asset',
            categoria: 'Categoria',
            organizzazione: 'Organizzazione',
            criticita: 'Criticità NIS2'
        };
        throw new Error(`Intestazioni obbligatorie mancanti: ${missingHeaders.map((field) => labels[field]).join(', ')}.`);
    }

    const refs = buildReferenceMaps(references);
    const existingCodes = new Set(existingAssets.map((asset) => normalizeLookup(asset.codice_asset)));
    const fileCodes = new Set();
    const previewRows = [];

    rows.forEach((row, index) => {
        const rowNumber = index + 2;
        const code = String(readMapped(row, headerMap, 'codice') ?? '').trim().toUpperCase();
        const name = String(readMapped(row, headerMap, 'nome') ?? '').trim();
        const categoryValue = String(readMapped(row, headerMap, 'categoria') ?? '').trim();
        const organizationValue = String(readMapped(row, headerMap, 'organizzazione') ?? '').trim();
        const criticalityValue = String(readMapped(row, headerMap, 'criticita') ?? '').trim();
        const responsibleValue = String(readMapped(row, headerMap, 'responsabile') ?? '').trim();
        const version = String(readMapped(row, headerMap, 'versione') ?? '').trim();
        const location = String(readMapped(row, headerMap, 'ubicazione') ?? '').trim();
        const description = String(readMapped(row, headerMap, 'descrizione') ?? '').trim();

        if (![code, name, categoryValue, organizationValue, criticalityValue, responsibleValue, version, location, description].some(Boolean)) {
            return;
        }

        const errors = [];
        const category = refs.categories.get(normalizeLookup(categoryValue));
        const organization = refs.organizations.get(normalizeLookup(organizationValue));
        const responsible = responsibleValue
            ? refs.responsibles.get(normalizeLookup(responsibleValue))
            : null;
        const criticality = normalizeCriticality(criticalityValue);
        const normalizedCode = normalizeLookup(code);

        if (!/^[A-Z0-9][A-Z0-9_-]{2,79}$/.test(code)) {
            errors.push('Codice non valido');
        }
        if (!name) errors.push('Nome obbligatorio');
        if (!category) errors.push('Categoria non riconosciuta');
        if (!organization) errors.push('Organizzazione non riconosciuta');
        if (!criticality) errors.push('Criticità non valida');
        if (responsibleValue && !responsible) errors.push('Responsabile non riconosciuto');
        if (existingCodes.has(normalizedCode)) errors.push('Codice già presente nel database');
        if (fileCodes.has(normalizedCode)) errors.push('Codice duplicato nel file');
        if (normalizedCode) fileCodes.add(normalizedCode);

        previewRows.push({
            rowNumber,
            display: {
                codice: code,
                nome: name,
                categoria: category?.nome || categoryValue,
                organizzazione: organization?.nome || organizationValue,
                criticita: criticality || criticalityValue
            },
            payload: {
                codice_asset: code,
                nome: name,
                categoria_asset_id: category?.id || null,
                organizzazione_id: organization?.id || null,
                responsabile_id: responsible?.id || null,
                criticita: criticality || criticalityValue,
                versione: version,
                ubicazione: location,
                descrizione: description
            },
            errors,
            valid: errors.length === 0
        });
    });

    if (previewRows.length === 0) {
        throw new Error('Il foglio non contiene righe dati compilate.');
    }

    return {
        fileName: file.name,
        sheetName,
        rows: previewRows,
        validRows: previewRows.filter((row) => row.valid),
        invalidRows: previewRows.filter((row) => !row.valid)
    };
}

/**
 * Compatibilità con il vecchio chiamante: restituisce soltanto i payload validi.
 */
export async function parseExcelFile(file, references = {}, existingAssets = []) {
    const preview = await parseAssetImportFile(file, references, existingAssets);
    return preview.validRows.map((row) => row.payload);
}
