// ===============================================================================================================
// FILE: src/supplierService.js
// DESCRIZIONE: Accesso dati per anagrafica, dettaglio, importazione e cessazione logica dei fornitori.
// ===============================================================================================================

import { supabase } from './supabase.js?build=20260726-d2';

const SUPPLIER_COLUMNS = [
    'id',
    'codice_fornitore',
    'nome',
    'tipo_fornitore_id',
    'indirizzo',
    'contatto_email',
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

function normalizeSupplierPayload(payload = {}) {
    const code = String(payload.codice_fornitore ?? '').trim().toUpperCase();
    const name = String(payload.nome ?? '').trim();
    const email = String(payload.contatto_email ?? '').trim().toLowerCase();
    const typeId = positiveInteger(payload.tipo_fornitore_id, 'Tipo fornitore');

    if (!/^[A-Z0-9][A-Z0-9_-]{2,79}$/.test(code)) {
        throw new Error('Il codice fornitore deve contenere da 3 a 80 caratteri tra lettere maiuscole, numeri, trattino e underscore.');
    }
    if (name.length < 2) throw new Error('Il nome del fornitore è obbligatorio.');
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Inserisci un indirizzo e-mail valido.');

    return {
        codice_fornitore: code,
        nome: name,
        tipo_fornitore_id: typeId,
        indirizzo: nullableText(payload.indirizzo),
        contatto_email: email
    };
}

async function fetchRowsByIds(table, columns, ids) {
    const normalizedIds = [...new Set((ids ?? []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
    if (normalizedIds.length === 0) return [];
    const { data, error } = await supabase.from(table).select(columns).in('id', normalizedIds);
    if (error) throw error;
    return data ?? [];
}

async function enrichSuppliers(records = []) {
    if (records.length === 0) return [];
    const types = await fetchRowsByIds('tipo_fornitore', 'id,nome,descrizione', records.map((record) => record.tipo_fornitore_id));
    const typesMap = new Map(types.map((row) => [Number(row.id), row]));
    return records.map((record) => ({
        ...record,
        tipo_fornitore: typesMap.get(Number(record.tipo_fornitore_id)) ?? null
    }));
}

export async function fetchSuppliers(options = {}) {
    const { active = true } = options;
    let query = supabase.from('fornitore').select(SUPPLIER_COLUMNS).order('nome', { ascending: true });
    if (typeof active === 'boolean') query = query.eq('attiva', active);
    const { data, error } = await query;
    if (error) throw error;
    return enrichSuppliers(data ?? []);
}

export async function fetchSupplierById(id) {
    const supplierId = positiveInteger(id, 'Identificativo fornitore');
    const { data, error } = await supabase
        .from('fornitore')
        .select(SUPPLIER_COLUMNS)
        .eq('id', supplierId)
        .maybeSingle();
    if (error) throw error;
    if (!data?.id) throw new Error('Fornitore non trovato o non accessibile.');
    const [enriched] = await enrichSuppliers([data]);
    return enriched;
}

export async function fetchSupplierReferences() {
    const { data, error } = await supabase
        .from('tipo_fornitore')
        .select('id,nome,descrizione')
        .order('nome', { ascending: true });
    if (error) throw error;
    return { tipi: data ?? [] };
}

export async function fetchNextSupplierCode() {
    const { data, error } = await supabase
        .from('fornitore')
        .select('id')
        .order('id', { ascending: false })
        .limit(1);
    if (error) throw error;
    const nextId = Number(data?.[0]?.id || 0) + 1;
    return `FOR-${String(nextId).padStart(4, '0')}`;
}

export async function insertSupplier(payload) {
    const { data, error } = await supabase
        .from('fornitore')
        .insert(normalizeSupplierPayload(payload))
        .select(SUPPLIER_COLUMNS)
        .single();
    if (error) throw error;
    if (!data?.id) throw new Error('Inserimento del fornitore non confermato dal database.');
    return data;
}

export async function updateSupplier(id, payload) {
    const supplierId = positiveInteger(id, 'Identificativo fornitore');
    const { data, error } = await supabase
        .from('fornitore')
        .update(normalizeSupplierPayload(payload))
        .eq('id', supplierId)
        .eq('attiva', true)
        .select(SUPPLIER_COLUMNS)
        .maybeSingle();
    if (error) throw error;
    if (!data?.id) throw new Error('Nessun fornitore attivo è stato aggiornato.');
    return data;
}

export async function archiveSupplier(id, reason) {
    const supplierId = positiveInteger(id, 'Identificativo fornitore');
    const normalizedReason = String(reason ?? '').trim();
    if (normalizedReason.length < 5) throw new Error('Indica un motivo di cessazione di almeno 5 caratteri.');

    const [services, assets, hierarchy] = await Promise.all([
        supabase.from('servizio_dipendenza_fornitore').select('fornitore_id', { count: 'exact', head: true }).eq('fornitore_id', supplierId).eq('attiva', true),
        supabase.from('asset_fornitore').select('fornitore_id', { count: 'exact', head: true }).eq('fornitore_id', supplierId).eq('attiva', true),
        supabase.from('fornitore_relazione').select('id', { count: 'exact', head: true }).or(`fornitore_padre_id.eq.${supplierId},fornitore_figlio_id.eq.${supplierId}`).eq('attiva', true)
    ]);
    const referenceError = services.error || assets.error || hierarchy.error;
    if (referenceError) throw referenceError;

    const counts = {
        servizi: services.count || 0,
        asset: assets.count || 0,
        gerarchie: hierarchy.count || 0
    };
    if (Object.values(counts).some((count) => count > 0)) {
        throw new Error(`Il fornitore non può essere cessato: risultano attivi ${counts.servizi} collegamenti servizi, ${counts.asset} collegamenti asset e ${counts.gerarchie} relazioni di subfornitura.`);
    }

    const { data, error } = await supabase
        .from('fornitore')
        .update({ attiva: false, motivo_archiviazione: normalizedReason })
        .eq('id', supplierId)
        .eq('attiva', true)
        .select(SUPPLIER_COLUMNS)
        .maybeSingle();
    if (error) throw error;
    if (!data?.id) throw new Error('Il fornitore non è stato cessato.');
    return data;
}

export async function fetchSupplierDetail(id) {
    const supplier = await fetchSupplierById(id);
    const supplierId = Number(supplier.id);

    const [servicesResult, assetsResult, hierarchyResult] = await Promise.all([
        supabase.from('servizio_dipendenza_fornitore').select('servizio_id,tipo_dipendenza_servizio_id,descrizione,attiva').eq('fornitore_id', supplierId).eq('attiva', true),
        supabase.from('asset_fornitore').select('id,asset_id,tipo_relazione_asset_fornitore_id,descrizione,relazione_primaria,valido_dal,valido_al,attiva').eq('fornitore_id', supplierId).eq('attiva', true),
        supabase.from('fornitore_relazione').select('id,fornitore_padre_id,fornitore_figlio_id,tipo_relazione_fornitore_id,descrizione,relazione_primaria,attiva').or(`fornitore_padre_id.eq.${supplierId},fornitore_figlio_id.eq.${supplierId}`).eq('attiva', true)
    ]);
    const error = servicesResult.error || assetsResult.error || hierarchyResult.error;
    if (error) throw error;

    const serviceRows = servicesResult.data ?? [];
    const assetRows = assetsResult.data ?? [];
    const hierarchyRows = hierarchyResult.data ?? [];
    const [services, assets, relatedSuppliers, serviceTypes, assetTypes, supplierTypes] = await Promise.all([
        fetchRowsByIds('servizio', 'id,codice_servizio,nome,organizzazione_id,attiva', serviceRows.map((row) => row.servizio_id)),
        fetchRowsByIds('asset', 'id,codice_asset,nome,classificazione_criticita,organizzazione_id,attiva', assetRows.map((row) => row.asset_id)),
        fetchRowsByIds('fornitore', 'id,codice_fornitore,nome,attiva', hierarchyRows.flatMap((row) => [row.fornitore_padre_id, row.fornitore_figlio_id])),
        fetchRowsByIds('tipo_dipendenza_servizio', 'id,codice,descrizione', serviceRows.map((row) => row.tipo_dipendenza_servizio_id)),
        fetchRowsByIds('tipo_relazione_asset_fornitore', 'id,codice,descrizione', assetRows.map((row) => row.tipo_relazione_asset_fornitore_id)),
        fetchRowsByIds('tipo_relazione_fornitore', 'id,codice,descrizione', hierarchyRows.map((row) => row.tipo_relazione_fornitore_id))
    ]);

    const map = (rows) => new Map(rows.map((row) => [Number(row.id), row]));
    const servicesMap = map(services);
    const assetsMap = map(assets);
    const suppliersMap = map(relatedSuppliers);
    const serviceTypesMap = map(serviceTypes);
    const assetTypesMap = map(assetTypes);
    const supplierTypesMap = map(supplierTypes);

    return {
        supplier,
        services: serviceRows.map((row) => ({ ...row, servizio: servicesMap.get(Number(row.servizio_id)), tipo: serviceTypesMap.get(Number(row.tipo_dipendenza_servizio_id)) })).filter((row) => row.servizio),
        assets: assetRows.map((row) => ({ ...row, asset: assetsMap.get(Number(row.asset_id)), tipo: assetTypesMap.get(Number(row.tipo_relazione_asset_fornitore_id)) })).filter((row) => row.asset),
        hierarchy: hierarchyRows.map((row) => ({
            ...row,
            direction: Number(row.fornitore_padre_id) === supplierId ? 'FIGLIO' : 'PADRE',
            related: suppliersMap.get(Number(Number(row.fornitore_padre_id) === supplierId ? row.fornitore_figlio_id : row.fornitore_padre_id)),
            tipo: supplierTypesMap.get(Number(row.tipo_relazione_fornitore_id))
        })).filter((row) => row.related)
    };
}
