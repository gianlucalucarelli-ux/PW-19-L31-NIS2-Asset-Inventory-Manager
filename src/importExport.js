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
        { header: 'Codice', key: 'codice', width: 24 },
        { header: 'Nome asset', key: 'nome', width: 34 },
        { header: 'Categoria', key: 'categoria', width: 34 },
        { header: 'Organizzazione', key: 'organizzazione', width: 38 },
        { header: 'Versione', key: 'versione', width: 24 },
        { header: 'Criticità NIS2', key: 'criticita', width: 18 }
    ];

    assetsList.forEach((asset) => {
        worksheet.addRow({
            id: asset.id ?? '',
            codice: asset.codice_asset ?? '',
            nome: asset.nome ?? '',
            categoria: asset.categoria ?? 'N/D',
            organizzazione: asset.organizzazione ?? 'N/D',
            versione: asset.versione ?? 'N/D',
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

        const criticitaCell = row.getCell(7);
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
        to: `G${worksheet.rowCount}`
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
 * Parsifica un file caricato dall'utente e restituisce un array normalizzato
 * @param {File} file - Il file selezionato dall'input HTML
 * @returns {Promise<Array>}
 */
export function parseExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const rawJson = XLSX.utils.sheet_to_json(firstSheet);

                // Normalizzazione dati per allinearli alla struttura della tabella "asset"
                const normalized = rawJson.map(row => {
                    return {
                        nome: row["Nome Asset"] || row["nome"] || row["Nome"] || "Asset Senza Nome",
                        versione: row["Versione SW/FW"] || row["Versione SW"] || row["versione"] || "N/D",
                        criticita: row["Criticità (NIS2)"] || row["Criticità"] || row["criticita"] || "Bassa"
                    };
                }).filter(item => item.nome !== "Asset Senza Nome");

                resolve(normalized);
            } catch (err) {
                reject(err);
            }
        };

        reader.onerror = (err) => reject(err);
        reader.readAsArrayBuffer(file);
    });
}