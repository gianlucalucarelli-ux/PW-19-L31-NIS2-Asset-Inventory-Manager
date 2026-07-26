// ===============================================================================================================
// FILE: src/entitySpreadsheet.js
// DESCRIZIONE: Utilita condivise per esportazioni, modelli e lettura controllata di file XLSX.
// ===============================================================================================================

function safeFileSegment(value, fallback = 'dati') {
    const normalized = String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return normalized || fallback;
}

function dateStamp(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function downloadBuffer(buffer, filename) {
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function assertExcelJs() {
    if (typeof window.ExcelJS === 'undefined') {
        throw new Error('Modulo ExcelJS non disponibile. Ricaricare la pagina e riprovare.');
    }
}

function assertSheetJs() {
    if (typeof window.XLSX === 'undefined') {
        throw new Error('Modulo XLSX non disponibile. Ricaricare la pagina e riprovare.');
    }
}

export async function exportRowsToExcel({
    rows,
    columns,
    sheetName,
    filename,
    metadata = []
}) {
    if (!Array.isArray(rows) || rows.length === 0) {
        throw new Error('Nessun dato disponibile per l’esportazione.');
    }
    assertExcelJs();

    const workbook = new window.ExcelJS.Workbook();
    workbook.creator = 'NIS2 Asset Inventory Manager';
    workbook.lastModifiedBy = 'NIS2 Asset Inventory Manager';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet(sheetName, {
        views: [{ state: 'frozen', ySplit: 1, activeCell: 'A2' }],
        properties: { defaultRowHeight: 21 }
    });
    worksheet.columns = columns;
    rows.forEach((row) => worksheet.addRow(row));

    const header = worksheet.getRow(1);
    header.height = 28;
    header.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = { bottom: { style: 'medium', color: { argb: 'FF0B5F59' } } };
    });

    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        row.height = 23;
        row.eachCell((cell, columnNumber) => {
            cell.alignment = {
                vertical: 'top',
                horizontal: columnNumber === 1 ? 'center' : 'left',
                wrapText: true
            };
            cell.border = { bottom: { style: 'thin', color: { argb: 'FFD8E2E5' } } };
            if (rowNumber % 2 === 0) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F8F8' } };
            }
        });
    });

    const endColumn = worksheet.getColumn(columns.length).letter;
    worksheet.autoFilter = { from: 'A1', to: `${endColumn}${worksheet.rowCount}` };

    const metadataSheet = workbook.addWorksheet('Metadati');
    metadataSheet.columns = [
        { header: 'Voce', key: 'label', width: 34 },
        { header: 'Valore', key: 'value', width: 72 }
    ];
    metadataSheet.addRows([
        {
            label: 'Data esportazione',
            value: new Intl.DateTimeFormat('it-IT', {
                dateStyle: 'medium',
                timeStyle: 'medium',
                timeZone: 'Europe/Rome'
            }).format(new Date())
        },
        { label: 'Numero record', value: rows.length },
        ...metadata
    ]);
    metadataSheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    metadataSheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        row.eachCell((cell) => {
            cell.alignment = { vertical: 'top', wrapText: true };
            cell.border = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
        });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    downloadBuffer(buffer, `${safeFileSegment(filename)}_${dateStamp()}.xlsx`);
}

export async function downloadImportTemplate({
    sheetName,
    filename,
    columns,
    exampleRow,
    referenceSheets = []
}) {
    assertExcelJs();

    const workbook = new window.ExcelJS.Workbook();
    workbook.creator = 'NIS2 Asset Inventory Manager';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet(sheetName, {
        views: [{ state: 'frozen', ySplit: 1, activeCell: 'A2' }]
    });
    worksheet.columns = columns;
    if (exampleRow) worksheet.addRow(exampleRow);

    const header = worksheet.getRow(1);
    header.height = 30;
    header.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    });
    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        row.eachCell((cell) => {
            cell.alignment = { vertical: 'top', wrapText: true };
        });
    });

    referenceSheets.forEach((reference) => {
        const sheet = workbook.addWorksheet(reference.name);
        sheet.columns = reference.columns;
        sheet.addRows(reference.rows);
        sheet.getRow(1).eachCell((cell) => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF475569' } };
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        });
        sheet.views = [{ state: 'frozen', ySplit: 1, activeCell: 'A2' }];
    });

    const buffer = await workbook.xlsx.writeBuffer();
    downloadBuffer(buffer, `${safeFileSegment(filename)}.xlsx`);
}

export async function readFirstSheetRows(file, options = {}) {
    const { maxBytes = 5 * 1024 * 1024, maxRows = 500 } = options;
    if (!file) throw new Error('Seleziona un file XLSX.');
    if (file.size > maxBytes) throw new Error('Il file supera il limite massimo di 5 MB.');
    if (!/\.(xlsx|xls)$/i.test(file.name)) throw new Error('Sono ammessi soltanto file XLSX o XLS.');
    assertSheetJs();

    const data = await file.arrayBuffer();
    const workbook = window.XLSX.read(data, { type: 'array', cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) throw new Error('Il file non contiene fogli leggibili.');

    const rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], {
        defval: '',
        raw: false
    });

    if (rows.length === 0) throw new Error('Il foglio selezionato non contiene righe dati.');
    if (rows.length > maxRows) throw new Error(`Il file contiene ${rows.length} righe: il limite massimo è ${maxRows}.`);
    return rows;
}
