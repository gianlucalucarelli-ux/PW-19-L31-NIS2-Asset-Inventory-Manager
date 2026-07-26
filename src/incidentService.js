// ===============================================================================================================
// FILE: src/incidentService.js
// DESCRIZIONE: Accesso controllato ai dati della Gestione Incidenti e verifica preventiva della sessione utente.
// ===============================================================================================================

import { supabase } from './supabase.js?build=20260726-d2';
import { getCurrentSession, resolveAccessState } from './auth.js?build=20260726-d2';

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

/**
 * Decodifica i dati di chiusura salvati nel campo causa mantenendo compatibilita
 * con gli eventi storici che contengono testo semplice.
 */
function parseClosurePayload(value) {
    if (!value) return { cause: '', resolution: '' };

    try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object') {
            return {
                cause: String(parsed.causa_accertata || parsed.causa || ''),
                resolution: String(parsed.risoluzione || '')
            };
        }
    } catch {
        // Il formato legacy resta leggibile come causa testuale.
    }

    return { cause: String(value), resolution: '' };
}

/**
 * Recupera gli incidenti classificati aperti o chiusi senza includere record archiviati.
 */
export async function fetchIncidentList(options = {}) {
    await verificaAccessoIncidenti();

    const {
        status = 'open',
        limit = 500
    } = options;

    const { data: classifications, error: classificationError } = await supabase
        .from('evento_tassonomia_acn')
        .select('evento_id')
        .eq('attiva', true);

    if (classificationError) throw classificationError;

    const counts = new Map();
    (classifications ?? []).forEach((row) => {
        const id = Number(row.evento_id);
        if (!Number.isInteger(id)) return;
        counts.set(id, (counts.get(id) || 0) + 1);
    });

    const eventIds = [...counts.keys()];
    if (eventIds.length === 0) return [];

    let query = supabase
        .from('evento_servizio')
        .select('id, servizio_id, stato_servizio_id, inizio, fine, causa, severita, tipologia, attiva, archiviato_il, motivo_archiviazione')
        .eq('attiva', true)
        .in('id', eventIds)
        .order('inizio', { ascending: false })
        .limit(limit);

    query = status === 'closed'
        ? query.not('fine', 'is', null)
        : query.is('fine', null);

    const { data: events, error: eventError } = await query;
    if (eventError) throw eventError;

    const serviceIds = [...new Set((events ?? [])
        .map((event) => Number(event.servizio_id))
        .filter(Number.isInteger))];

    let services = [];
    if (serviceIds.length > 0) {
        const { data, error } = await supabase
            .from('servizio')
            .select('id, codice_servizio, nome, attiva')
            .in('id', serviceIds);
        if (error) throw error;
        services = data ?? [];
    }

    const serviceMap = new Map(services.map((service) => [Number(service.id), service]));

    return (events ?? []).map((event) => {
        const service = serviceMap.get(Number(event.servizio_id));
        const closure = parseClosurePayload(event.causa);
        return {
            ...event,
            servizioCodice: service?.codice_servizio || '',
            servizioNome: service?.nome || 'Non associato',
            classificazioni: counts.get(Number(event.id)) || 0,
            stato: event.fine ? 'Chiuso' : 'Aperto',
            causaAccertata: closure.cause,
            risoluzione: closure.resolution
        };
    });
}

/**
 * Recupera il dettaglio completo di un incidente e le classificazioni ACN associate.
 */
export async function fetchIncidentDetail(eventId) {
    await verificaAccessoIncidenti();

    const id = Number(eventId);
    if (!Number.isInteger(id) || id <= 0) {
        throw new Error('Identificativo incidente non valido.');
    }

    const { data: event, error: eventError } = await supabase
        .from('evento_servizio')
        .select('id, servizio_id, stato_servizio_id, inizio, fine, causa, severita, tipologia, attiva, archiviato_il, motivo_archiviazione')
        .eq('id', id)
        .single();

    if (eventError) throw eventError;

    let serviceLabel = 'Non associato';
    if (event.servizio_id) {
        const { data: service, error: serviceError } = await supabase
            .from('servizio')
            .select('codice_servizio, nome')
            .eq('id', event.servizio_id)
            .maybeSingle();
        if (serviceError) throw serviceError;
        if (service) {
            serviceLabel = service.codice_servizio
                ? `${service.codice_servizio} · ${service.nome}`
                : service.nome;
        }
    }

    const { data: classifications, error: classificationError } = await supabase
        .from('evento_tassonomia_acn')
        .select(`
            passo_wizard,
            tassonomia_incidenti_acn (
                codice_acn,
                nome_esteso,
                macro_area,
                sotto_categoria
            )
        `)
        .eq('evento_id', id)
        .eq('attiva', true)
        .order('passo_wizard', { ascending: true });

    if (classificationError) throw classificationError;

    return {
        ...event,
        servizioLabel: serviceLabel,
        classificazioni: (classifications ?? []).map((row) => ({
            passo: row.passo_wizard,
            codice_acn: row.tassonomia_incidenti_acn?.codice_acn || '',
            nome_esteso: row.tassonomia_incidenti_acn?.nome_esteso || '',
            macro_area: row.tassonomia_incidenti_acn?.macro_area || '',
            sotto_categoria: row.tassonomia_incidenti_acn?.sotto_categoria || ''
        }))
    };
}

/**
 * Chiude un incidente con una sola operazione UPDATE. Nessun record viene eliminato
 * o archiviato automaticamente; la risoluzione resta consultabile nello storico.
 */
export async function closeIncident(eventId, payload = {}) {
    await verificaAccessoIncidenti();

    const id = Number(eventId);
    const resolution = String(payload.resolution || '').trim();
    const cause = String(payload.cause || '').trim();
    const closedAt = new Date(payload.closedAt);

    if (!Number.isInteger(id) || id <= 0) {
        throw new Error('Identificativo incidente non valido.');
    }
    if (resolution.length < 10) {
        throw new Error('La risoluzione deve contenere almeno 10 caratteri.');
    }
    if (Number.isNaN(closedAt.getTime())) {
        throw new Error('Data e ora di chiusura non valide.');
    }

    const closurePayload = JSON.stringify({
        versione: 1,
        causa_accertata: cause,
        risoluzione: resolution
    });

    const { data, error } = await supabase
        .from('evento_servizio')
        .update({
            fine: closedAt.toISOString(),
            causa: closurePayload
        })
        .eq('id', id)
        .eq('attiva', true)
        .is('fine', null)
        .select('id, fine, causa')
        .single();

    if (error) throw error;
    return data;
}
