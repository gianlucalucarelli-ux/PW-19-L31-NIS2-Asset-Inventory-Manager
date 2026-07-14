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