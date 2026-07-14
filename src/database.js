// ===================================================================================================
// FILE: src/database.js Gestione delle transazioni di lettura e scrittura sul database (CRUD e Viste)
// ===================================================================================================
import { supabase } from './supabase.js';

/**
 * Estrae l'elenco degli asset sfruttando la vista di sicurezza ACN.
 */
export async function fetchAssets() {
    const { data, error } = await supabase
        .from('vista_esportazione_acn_assets')
        .select('*');
    if (error) throw error;
    return data;
}

/**
 * Helper interno: allinea il payload del frontend alla struttura reale della tabella "asset"
 * inserendo valori di default (id=1) per i vincoli relazionali non attualmente gestiti dalla UI.
 */
function trasformaPayload(payload) {
    return {
        nome: payload.nome,
        versione: payload.versione,
        classificazione_criticita: payload.criticita || 'Bassa', // Il DB accetta stringhe testuali
        
        // Hardcode di sicurezza per vincoli Foreign Key obbligatori
        categoria_asset_id: 1, 
        organizzazione_id: 1,
        responsabile_id: 1
    };
}

/**
 * Esegue l'inserimento di un nuovo asset.
 */
export async function insertAsset(payload) {
    const dbPayload = trasformaPayload(payload);
    
    const { data, error } = await supabase
        .from('asset')
        .insert([dbPayload])
        .select();
        
    if (error) throw error;
    return data;
}

/**
 * Esegue l'aggiornamento (UPDATE) di un asset esistente.
 */
export async function updateAsset(id, payload) {
    const dbPayload = trasformaPayload(payload);

    const { data, error } = await supabase
        .from('asset')
        .update(dbPayload)
        .eq('id', id)
        .select();

    if (error) throw error;
    return data;
}

/**
 * Esegue l'inserimento massivo per il flusso di importazione Excel.
 */
export async function bulkInsertAssets(assetsArray) {
    const dbPayloadArray = assetsArray.map(asset => trasformaPayload(asset));

    const { data, error } = await supabase
        .from('asset')
        .insert(dbPayloadArray)
        .select();

    if (error) throw error;
    return data;
}
/**
 * Legge i dati di supply chain dalla vista reporting servizi critici
 */
export async function fetchSupplyChain() {
    const { data, error } = await supabase
        .from('vista_reporting_servizi_critici')
        .select('*');
    if (error) throw error;
    return data;
}