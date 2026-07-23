// ===============================================================================================================
// FILE: src/incidentService.js
// DESCRIZIONE: Accesso controllato ai dati della Gestione Incidenti e verifica preventiva della sessione utente.
// ===============================================================================================================

import { supabase } from './supabase.js';
import { getCurrentSession, resolveAccessState } from './auth.js';

/**
 * Verifica che la sessione corrente sia valida e che l'utente abbia completato
 * il percorso di accesso previsto prima di eseguire query protette da RLS.
 */
export async function verificaAccessoIncidenti() {
    const session = await getCurrentSession();

    if (!session?.user) {
        throw new Error('La sessione non è disponibile. Effettua nuovamente l’accesso.');
    }

    const accessState = await resolveAccessState(session);

    if (accessState.status === 'mfa-required') {
        throw new Error('Completa la verifica MFA prima di accedere alla Gestione Incidenti.');
    }

    if (accessState.status !== 'authorized') {
        throw new Error(accessState.message || 'L’utente non è autorizzato ad accedere alla Gestione Incidenti.');
    }

    return { session, accessState };
}

/**
 * Crea un incidente soltanto dopo la conferma del primo passo del wizard.
 * In questo modo l'apertura della pagina non genera record vuoti.
 */
export async function startIncidente(payload) {
    await verificaAccessoIncidenti();

    const { data, error } = await supabase
        .from('evento_servizio')
        .insert([payload])
        .select('id')
        .single();

    if (error) throw error;
    return data;
}

/**
 * Aggiorna i dati principali dell'incidente già creato.
 */
export async function updateIncidente(eventoId, payload) {
    await verificaAccessoIncidenti();

    const { data, error } = await supabase
        .from('evento_servizio')
        .update(payload)
        .eq('id', eventoId)
        .select('id')
        .single();

    if (error) throw error;
    return data;
}

/**
 * Registra una voce tassonomica selezionata nel wizard ACN.
 */
export async function salvaSelezioneIncidente(eventoId, tassonomiaId, passo) {
    await verificaAccessoIncidenti();

    const { data, error } = await supabase
        .from('evento_tassonomia_acn')
        .upsert([{
            evento_id: eventoId,
            tassonomia_id: tassonomiaId,
            passo_wizard: passo
        }]);

    if (error) throw error;
    return data;
}

/**
 * Recupera le opzioni tassonomiche del passo richiesto.
 */
export async function fetchTassonomiaByPasso(macroArea, sottoCategoria = null) {
    await verificaAccessoIncidenti();

    let query = supabase
        .from('tassonomia_incidenti_acn')
        .select('*')
        .eq('macro_area', macroArea)
        .order('codice_acn', { ascending: true });

    if (sottoCategoria) {
        query = query.eq('sotto_categoria', sottoCategoria);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
}

/**
 * Recupera le selezioni associate all'incidente per comporre il report finale.
 */
export async function fetchReportIncidente(eventoId) {
    await verificaAccessoIncidenti();

    const { data, error } = await supabase
        .from('evento_tassonomia_acn')
        .select(`
            passo_wizard,
            tassonomia_incidenti_acn (nome_esteso, codice_acn)
        `)
        .eq('evento_id', eventoId)
        .order('passo_wizard', { ascending: true });

    if (error) throw error;
    return data ?? [];
}
