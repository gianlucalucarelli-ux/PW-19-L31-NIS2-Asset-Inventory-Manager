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
 * Esegue l'inserimento di un nuovo asset rispettando la normalizzazione 3NF.
 */
export async function insertAsset(nome, versione, criticitaId) {
    const { data, error } = await supabase
        .from('asset')
        .insert([
            { 
                nome: nome, 
                criticita_asset_id: parseInt(criticitaId)
                // Eventuali campi aggiuntivi conformi alle relazioni dello schema
            }
        ])
        .select();
    if (error) throw error;
    return data;
}