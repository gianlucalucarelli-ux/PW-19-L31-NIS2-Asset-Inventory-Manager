// ===================================================================================================
// FILE: src/export.js Utility di manipolazione dati ed esportazione in formato CSV leggibile da Excel
// ===================================================================================================

export function exportToCSV(data) {
    if (!data || data.length === 0) return;

    const headers = ["ID", "Nome", "Versione", "Tassonomia ACN", "Criticità", "Owner"];
    const csvRows = [headers.join(';')]; // Punto e virgola per compatibilità Excel IT

    data.forEach(e => {
        const row = [
            e.Asset_ID || '',
            e.Asset_Name || '',
            e.Software_Version || '',
            e.ACN_Taxonomy_Code || '',
            e.Criticity_Level || '',
            e.Technical_Owner || ''
        ];
        csvRows.push(row.join(';'));
    });

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + csvRows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "Export_ACN_Assets.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}