// ===================================================================================================
// FILE: src/database.js Gestione delle transazioni di lettura e scrittura sul database (CRUD e Viste)
// ===================================================================================================
import { supabase } from './supabase.js';

// Mappatura statica per la transcodifica Frontend (String) -> Backend (Foreign Key 3NF)
// NOTA: Verifica che questi ID corrispondano esattamente agli ID della tua tabella "criticita" su Supabase.
const CRITICITA_MAP = {
    'bassa': 1,
    'media': 2,
    'alta': 3,
    'critica': 4
};

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
 * Helper interno: normalizza il payload JSON in entrata per renderlo compatibile con lo schema 3NF.
 */
function trasformaPayloadPer3NF(payload) {
    const key = payload.criticita ? payload.criticita.toLowerCase() : 'bassa';
    return {
        nome: payload.nome,
        // Sostituisci 'versione' con il nome colonna esatto della tua tabella se diverso (es. software_version)
        versione: payload.versione, 
        criticita_asset_id: CRITICITA_MAP[key] || 1
    };
}

/**
 * Esegue l'inserimento di un nuovo asset rispettando la normalizzazione 3NF.
 */
export async function insertAsset(payload) {
    const dbPayload = trasformaPayloadPer3NF(payload);
    
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
    const dbPayload = trasformaPayloadPer3NF(payload);

    const { data, error } = await supabase
        .from('asset')
        .update(dbPayload)
        // Attenzione: se la tua Primary Key in 'asset' si chiama diversamente (es. id_asset), cambiala qui sotto
        .eq('id', id) 
        .select();

    if (error) throw error;
    return data;
}

/**
 * Esegue l'inserimento massivo per il flusso di importazione Excel.
 */
export async function bulkInsertAssets(assetsArray) {
    // Normalizziamo l'intero array prelevato da Excel nel formato atteso dalla 3NF
    const dbPayloadArray = assetsArray.map(asset => trasformaPayloadPer3NF(asset));

    const { data, error } = await supabase
        .from('asset')
        .insert(dbPayloadArray)
        .select();

    if (error) throw error;
    return data;
}