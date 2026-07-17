// ===================================================================================================
// FILE: src/incidentService.js - Gestione della logica di business per gli Incidenti e Wizard
// ===================================================================================================
import { supabase } from './supabase.js';

export async function startIncidente(payload) {
    const { data, error } = await supabase
        .from('evento_servizio')
        .insert([payload])
        .select('id');
        
    if (error) throw error;
    return data[0]; 
}

// Questa è la funzione che serve a wizard.js
export async function salvaSelezioneIncidente(eventoId, tassonomiaId, passo) {
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