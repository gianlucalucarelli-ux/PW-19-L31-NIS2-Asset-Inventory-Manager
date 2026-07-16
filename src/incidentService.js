// ===================================================================================================
// FILE: src/incidentService.js - Gestione della logica di business per gli Incidenti e Wizard
// ===================================================================================================
import { supabase } from './supabase.js';

/**
 * Inizializza un nuovo incidente nella tabella "evento_servizio".
 * Restituisce l'ID del nuovo evento creato.
 */
export async function startIncidente(payload) {
    const { data, error } = await supabase
        .from('evento_servizio')
        .insert([payload])
        .select('id'); // Recuperiamo l'ID appena generato
        
    if (error) throw error;
    return data[0]; 
}

/**
 * Salva una selezione specifica del Wizard nella tabella di giunzione.
 * Utilizziamo upsert per permettere all'utente di cambiare idea durante i passaggi.
 */
export async function saveTassonomiaScelta(eventoId, tassonomiaId, passo) {
    const { data, error } = await supabase
        .from('evento_tassonomia_acn')
        .upsert([
            { 
                evento_id: eventoId, 
                tassonomia_id: tassonomiaId, 
                passo_wizard: passo 
            }
        ]);
        
    if (error) throw error;
    return data;
}

/**
 * Recupera i dati della tassonomia filtrati per passo e macro-area
 * (Usata per popolare le checkbox del Wizard)
 */
export async function fetchTassonomiaByPasso(macroArea, sottoCategoria = null) {
    let query = supabase.from('tassonomia_incidenti_acn').select('*');
    
    query = query.eq('macro_area', macroArea);
    if (sottoCategoria) {
        query = query.eq('sotto_categoria', sottoCategoria);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return data;
}

/**
 * Genera il riepilogo finale con i codici selezionati (Il Report per ACN)
 */
export async function fetchReportIncidente(eventoId) {
    const { data, error } = await supabase
        .from('evento_tassonomia_acn')
        .select(`
            passo_wizard,
            tassonomia_incidenti_acn (codice_acn, nome_esteso, descrizione)
        `)
        .eq('evento_id', eventoId)
        .order('passo_wizard', { ascending: true });

    if (error) throw error;
    return data;
}