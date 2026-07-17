import { supabase } from './supabase.js';

export async function startIncidente(payload) {
    const { data, error } = await supabase
        .from('evento_servizio')
        .insert([payload])
        .select('id');
    if (error) throw error;
    return data[0]; 
}

// NUOVA FUNZIONE: serve per aggiornare l'incidente dopo il Passo 1
export async function updateIncidente(eventoId, payload) {
    const { data, error } = await supabase
        .from('evento_servizio')
        .update(payload)
        .eq('id', eventoId);
    if (error) throw error;
    return data;
}

export async function salvaSelezioneIncidente(eventoId, tassonomiaId, passo) {
    const { data, error } = await supabase
        .from('evento_tassonomia_acn')
        .upsert([{ evento_id: eventoId, tassonomia_id: tassonomiaId, passo_wizard: passo }]);
    if (error) throw error;
    return data;
}

export async function fetchTassonomiaByPasso(macroArea, sottoCategoria = null) {
    let query = supabase.from('tassonomia_incidenti_acn').select('*').eq('macro_area', macroArea);
    if (sottoCategoria) query = query.eq('sotto_categoria', sottoCategoria);
    const { data, error } = await query;
    if (error) throw error;
    return data;
}