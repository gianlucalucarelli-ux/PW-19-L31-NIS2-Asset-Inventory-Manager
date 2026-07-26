// ===============================================================================================================
// FILE: src/serviceService.js
// DESCRIZIONE: Accesso dati per anagrafica, dettaglio, importazione e cessazione logica dei servizi.
// ===============================================================================================================

import { supabase } from './supabase.js?build=20260726-d2';

const SERVICE_COLUMNS = [
    'id',
    'codice_servizio',
    'nome',
    'descrizione',
    'tipo_servizio_id',
    'stato_servizio_id',
    'organizzazione_id',
    'responsabile_id',
    'attiva',
    'archiviato_il',
    'archiviato_da',
    'motivo_archiviazione'
].join(',');

function positiveInteger(value, label) {
    const normalized = Number(value);
    if (!Number.isInteger(normalized) || normalized <= 0) throw new Error(`${label} non valido.`);
    return normalized;
}

function nullableText(value) {
    const normalized = String(value ?? '').trim();
    return normalized || null;
}

function normalizeServicePayload(payload = {}) {
    const code = String(payload.codice_servizio ?? '').trim().toUpperCase();
    const name = String(payload.nome ?? '').trim();
    const organizationId = positiveInteger(payload.organizzazione_id, 'Organizzazione');
    const typeId = positiveInteger(payload.tipo_servizio_id, 'Tipo servizio');
    const stateId = positiveInteger(payload.stato_servizio_id, 'Stato servizio');
    const responsibleId = payload.responsabile_id
        ? positiveInteger(payload.responsabile_id, 'Responsabile')
        : null;

    if (!/^[A-Z0-9][A-Z0-9_-]{2,79}$/.test(code)) {
        throw new Error('Il codice servizio deve contenere da 3 a 80 caratteri tra lettere maiuscole, numeri, trattino e underscore.');
    }
    if (name.length < 2) throw new Error('Il nome del servizio è obbligatorio.');

    return {
        codice_servizio: code,
        nome: name,
        descrizione: nullableText(payload.descrizione),
        tipo_servizio_id: typeId,
        stato_servizio_id: stateId,
        organizzazione_id: organizationId,
        responsabile_id: responsibleId
    };
}

async function fetchRowsByIds(table, columns, ids) {
    const normalizedIds = [...new Set((ids ?? []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
    if (normalizedIds.length === 0) return [];
    const { data, error } = await supabase.from(table).select(columns).in('id', normalizedIds);
    if (error) throw error;
    return data ?? [];
}

async function enrichServices(records = []) {
    if (records.length === 0) return [];
    const [types, states, organizations, people] = await Promise.all([
        fetchRowsByIds('tipo_servizio', 'id,nome,descrizione', records.map((record) => record.tipo_servizio_id)),
        fetchRowsByIds('stato_servizio', 'id,codice,descrizione', records.map((record) => record.stato_servizio_id)),
        fetchRowsByIds('organizzazione', 'id,codice_organizzazione,nome,attiva', records.map((record) => record.organizzazione_id)),
        fetchRowsByIds('responsabile', 'id,nome,cognome,email,telefono,organizzazione_id,attiva', records.map((record) => record.responsabile_id))
    ]);

    const map = (rows) => new Map(rows.map((row) => [Number(row.id), row]));
    const typesMap = map(types);
    const statesMap = map(states);
    const organizationsMap = map(organizations);
    const peopleMap = map(people);

    return records.map((record) => ({
        ...record,
        tipo_servizio: typesMap.get(Number(record.tipo_servizio_id)) ?? null,
        stato_servizio: statesMap.get(Number(record.stato_servizio_id)) ?? null,
        organizzazione: organizationsMap.get(Number(record.organizzazione_id)) ?? null,
        responsabile: peopleMap.get(Number(record.responsabile_id)) ?? null
    }));
}

export async function fetchServices(options = {}) {
    const { active = true } = options;
    let query = supabase.from('servizio').select(SERVICE_COLUMNS).order('nome', { ascending: true });
    if (typeof active === 'boolean') query = query.eq('attiva', active);
    const { data, error } = await query;
    if (error) throw error;
    return enrichServices(data ?? []);
}

export async function fetchServiceById(id) {
    const serviceId = positiveInteger(id, 'Identificativo servizio');
    const { data, error } = await supabase
        .from('servizio')
        .select(SERVICE_COLUMNS)
        .eq('id', serviceId)
        .maybeSingle();
    if (error) throw error;
    if (!data?.id) throw new Error('Servizio non trovato o non accessibile.');
    const [enriched] = await enrichServices([data]);
    return enriched;
}

export async function fetchServiceReferences() {
    const [typesResult, statesResult, organizationsResult, peopleResult] = await Promise.all([
        supabase.from('tipo_servizio').select('id,nome,descrizione').order('nome', { ascending: true }),
        supabase.from('stato_servizio').select('id,codice,descrizione').order('codice', { ascending: true }),
        supabase.from('organizzazione').select('id,codice_organizzazione,nome').eq('attiva', true).order('nome', { ascending: true }),
        supabase.from('responsabile').select('id,nome,cognome,email,organizzazione_id').eq('attiva', true).order('cognome', { ascending: true }).order('nome', { ascending: true })
    ]);
    const error = typesResult.error || statesResult.error || organizationsResult.error || peopleResult.error;
    if (error) throw error;
    return {
        tipi: typesResult.data ?? [],
        stati: statesResult.data ?? [],
        organizzazioni: organizationsResult.data ?? [],
        responsabili: peopleResult.data ?? []
    };
}

export async function fetchNextServiceCode() {
    const { data, error } = await supabase
        .from('servizio')
        .select('id')
        .order('id', { ascending: false })
        .limit(1);
    if (error) throw error;
    const nextId = Number(data?.[0]?.id || 0) + 1;
    return `SRV-${String(nextId).padStart(4, '0')}`;
}

export async function insertService(payload) {
    const { data, error } = await supabase
        .from('servizio')
        .insert(normalizeServicePayload(payload))
        .select(SERVICE_COLUMNS)
        .single();
    if (error) throw error;
    if (!data?.id) throw new Error('Inserimento del servizio non confermato dal database.');
    return data;
}

export async function updateService(id, payload) {
    const serviceId = positiveInteger(id, 'Identificativo servizio');
    const { data, error } = await supabase
        .from('servizio')
        .update(normalizeServicePayload(payload))
        .eq('id', serviceId)
        .eq('attiva', true)
        .select(SERVICE_COLUMNS)
        .maybeSingle();
    if (error) throw error;
    if (!data?.id) throw new Error('Nessun servizio attivo è stato aggiornato.');
    return data;
}

export async function archiveService(id, reason) {
    const serviceId = positiveInteger(id, 'Identificativo servizio');
    const normalizedReason = String(reason ?? '').trim();
    if (normalizedReason.length < 5) throw new Error('Indica un motivo di cessazione di almeno 5 caratteri.');

    const [assets, suppliers, hierarchy, incidents] = await Promise.all([
        supabase.from('servizio_dipendenza_asset').select('servizio_id', { count: 'exact', head: true }).eq('servizio_id', serviceId).eq('attiva', true),
        supabase.from('servizio_dipendenza_fornitore').select('servizio_id', { count: 'exact', head: true }).eq('servizio_id', serviceId).eq('attiva', true),
        supabase.from('servizio_componente').select('id', { count: 'exact', head: true }).or(`servizio_padre_id.eq.${serviceId},servizio_figlio_id.eq.${serviceId}`).eq('attiva', true),
        supabase.from('evento_servizio').select('id', { count: 'exact', head: true }).eq('servizio_id', serviceId).eq('attiva', true).is('fine', null)
    ]);
    const referenceError = assets.error || suppliers.error || hierarchy.error || incidents.error;
    if (referenceError) throw referenceError;

    const counts = {
        asset: assets.count || 0,
        fornitori: suppliers.count || 0,
        gerarchie: hierarchy.count || 0,
        incidenti: incidents.count || 0
    };
    if (Object.values(counts).some((count) => count > 0)) {
        throw new Error(`Il servizio non può essere cessato: risultano attivi ${counts.asset} collegamenti asset, ${counts.fornitori} collegamenti fornitori, ${counts.gerarchie} relazioni gerarchiche e ${counts.incidenti} incidenti aperti.`);
    }

    const { data, error } = await supabase
        .from('servizio')
        .update({ attiva: false, motivo_archiviazione: normalizedReason })
        .eq('id', serviceId)
        .eq('attiva', true)
        .select(SERVICE_COLUMNS)
        .maybeSingle();
    if (error) throw error;
    if (!data?.id) throw new Error('Il servizio non è stato cessato.');
    return data;
}

export async function fetchServiceDetail(id) {
    const service = await fetchServiceById(id);
    const serviceId = Number(service.id);

    const [assetsResult, suppliersResult, hierarchyResult, incidentsResult] = await Promise.all([
        supabase.from('servizio_dipendenza_asset').select('asset_id,tipo_dipendenza_servizio_id,descrizione,attiva').eq('servizio_id', serviceId).eq('attiva', true),
        supabase.from('servizio_dipendenza_fornitore').select('fornitore_id,tipo_dipendenza_servizio_id,descrizione,attiva').eq('servizio_id', serviceId).eq('attiva', true),
        supabase.from('servizio_componente').select('id,servizio_padre_id,servizio_figlio_id,tipo_dipendenza_id,esito_impatto_id,peso_percentuale,descrizione,relazione_primaria,attiva').or(`servizio_padre_id.eq.${serviceId},servizio_figlio_id.eq.${serviceId}`).eq('attiva', true),
        supabase.from('evento_servizio').select('id,inizio,fine,severita,tipologia,attiva').eq('servizio_id', serviceId).eq('attiva', true).order('inizio', { ascending: false }).limit(10)
    ]);
    const error = assetsResult.error || suppliersResult.error || hierarchyResult.error || incidentsResult.error;
    if (error) throw error;

    const assetRows = assetsResult.data ?? [];
    const supplierRows = suppliersResult.data ?? [];
    const hierarchyRows = hierarchyResult.data ?? [];
    const [assets, suppliers, relatedServices, dependencyTypes] = await Promise.all([
        fetchRowsByIds('asset', 'id,codice_asset,nome,classificazione_criticita,attiva', assetRows.map((row) => row.asset_id)),
        fetchRowsByIds('fornitore', 'id,codice_fornitore,nome,contatto_email,attiva', supplierRows.map((row) => row.fornitore_id)),
        fetchRowsByIds('servizio', 'id,codice_servizio,nome,attiva', hierarchyRows.flatMap((row) => [row.servizio_padre_id, row.servizio_figlio_id])),
        fetchRowsByIds('tipo_dipendenza_servizio', 'id,codice,descrizione', [...assetRows, ...supplierRows].map((row) => row.tipo_dipendenza_servizio_id))
    ]);

    const map = (rows) => new Map(rows.map((row) => [Number(row.id), row]));
    const assetsMap = map(assets);
    const suppliersMap = map(suppliers);
    const servicesMap = map(relatedServices);
    const dependencyMap = map(dependencyTypes);

    return {
        service,
        assets: assetRows.map((row) => ({ ...row, asset: assetsMap.get(Number(row.asset_id)), tipo: dependencyMap.get(Number(row.tipo_dipendenza_servizio_id)) })).filter((row) => row.asset),
        suppliers: supplierRows.map((row) => ({ ...row, fornitore: suppliersMap.get(Number(row.fornitore_id)), tipo: dependencyMap.get(Number(row.tipo_dipendenza_servizio_id)) })).filter((row) => row.fornitore),
        hierarchy: hierarchyRows.map((row) => ({
            ...row,
            direction: Number(row.servizio_padre_id) === serviceId ? 'FIGLIO' : 'PADRE',
            related: servicesMap.get(Number(Number(row.servizio_padre_id) === serviceId ? row.servizio_figlio_id : row.servizio_padre_id))
        })).filter((row) => row.related),
        incidents: incidentsResult.data ?? []
    };
}
