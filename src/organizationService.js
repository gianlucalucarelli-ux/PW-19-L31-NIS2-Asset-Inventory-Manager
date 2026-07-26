// ===============================================================================================================
// FILE: src/organizationService.js
// DESCRIZIONE: Accesso ai dati per soggetti NIS2, persone e incarichi aziendali storicizzati.
// ===============================================================================================================

import { supabase } from './supabase.js?build=20260726-d2';

const ORGANIZATION_COLUMNS = [
    'id',
    'codice_organizzazione',
    'nome',
    'descrizione',
    'classificazione_nis2',
    'forma_giuridica',
    'tipo_identificativo_legale',
    'identificativo_legale',
    'indirizzo_sede_legale',
    'cap_sede_legale',
    'comune_sede_legale',
    'provincia_sede_legale',
    'paese_sede_legale',
    'email_istituzionale',
    'pec',
    'telefono',
    'sito_web',
    'attiva',
    'archiviato_il',
    'archiviato_da',
    'motivo_archiviazione'
].join(',');

const PERSON_COLUMNS = [
    'id',
    'nome',
    'cognome',
    'email',
    'telefono',
    'organizzazione_id',
    'ruolo_organigramma_id',
    'attiva',
    'archiviato_il',
    'archiviato_da',
    'motivo_archiviazione'
].join(',');

const ASSIGNMENT_COLUMNS = [
    'id',
    'responsabile_id',
    'ruolo_id',
    'tipo_incarico',
    'valido_dal',
    'valido_al',
    'attiva',
    'motivo_cessazione',
    'note',
    'creato_il',
    'aggiornato_il',
    'is_titolare'
].join(',');

function positiveInteger(value, label) {
    const normalized = Number(value);
    if (!Number.isInteger(normalized) || normalized <= 0) {
        throw new Error(`${label} non valido.`);
    }
    return normalized;
}

function nullableText(value) {
    const normalized = String(value ?? '').trim();
    return normalized || null;
}

function normalizeOrganizationPayload(payload = {}) {
    const code = String(payload.codice_organizzazione ?? '').trim().toUpperCase();
    const name = String(payload.nome ?? '').trim();
    const classification = String(payload.classificazione_nis2 ?? 'DA_CLASSIFICARE').trim().toUpperCase();
    const identifierType = nullableText(payload.tipo_identificativo_legale);
    const identifierValue = nullableText(payload.identificativo_legale);

    if (!/^[A-Z0-9][A-Z0-9_-]{2,29}$/.test(code)) {
        throw new Error('Il codice organizzazione deve contenere da 3 a 30 caratteri tra lettere maiuscole, numeri, trattino e underscore.');
    }
    if (name.length < 2) {
        throw new Error('La denominazione ufficiale è obbligatoria.');
    }
    if (!['DA_CLASSIFICARE', 'ESSENZIALE', 'IMPORTANTE'].includes(classification)) {
        throw new Error('Classificazione NIS2 non valida.');
    }
    if ((identifierType && !identifierValue) || (!identifierType && identifierValue)) {
        throw new Error('Tipo e valore dell’identificativo legale devono essere compilati insieme.');
    }

    return {
        codice_organizzazione: code,
        nome: name,
        descrizione: nullableText(payload.descrizione),
        classificazione_nis2: classification,
        forma_giuridica: nullableText(payload.forma_giuridica),
        tipo_identificativo_legale: identifierType,
        identificativo_legale: identifierValue,
        indirizzo_sede_legale: nullableText(payload.indirizzo_sede_legale),
        cap_sede_legale: nullableText(payload.cap_sede_legale),
        comune_sede_legale: nullableText(payload.comune_sede_legale),
        provincia_sede_legale: nullableText(payload.provincia_sede_legale),
        paese_sede_legale: nullableText(payload.paese_sede_legale),
        email_istituzionale: nullableText(payload.email_istituzionale),
        pec: nullableText(payload.pec),
        telefono: nullableText(payload.telefono),
        sito_web: nullableText(payload.sito_web)
    };
}

function normalizePersonPayload(payload = {}) {
    const organizationId = positiveInteger(payload.organizzazione_id, 'Organizzazione');
    const firstName = String(payload.nome ?? '').trim();
    const lastName = String(payload.cognome ?? '').trim();
    const email = String(payload.email ?? '').trim().toLowerCase();

    if (!firstName || !lastName) {
        throw new Error('Nome e cognome sono obbligatori.');
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
        throw new Error('Inserisci un indirizzo e-mail valido.');
    }

    return {
        nome: firstName,
        cognome: lastName,
        email,
        telefono: nullableText(payload.telefono),
        organizzazione_id: organizationId,
        ruolo_organigramma_id: payload.ruolo_organigramma_id
            ? positiveInteger(payload.ruolo_organigramma_id, 'Ruolo di organigramma')
            : null
    };
}

export async function fetchOrganizations(options = {}) {
    const { active = true } = options;

    let query = supabase
        .from('organizzazione')
        .select(ORGANIZATION_COLUMNS)
        .order('nome', { ascending: true });

    if (typeof active === 'boolean') query = query.eq('attiva', active);

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
}

export async function fetchOrganizationById(id) {
    const organizationId = positiveInteger(id, 'Identificativo organizzazione');
    const { data, error } = await supabase
        .from('organizzazione')
        .select(ORGANIZATION_COLUMNS)
        .eq('id', organizationId)
        .maybeSingle();

    if (error) throw error;
    if (!data?.id) throw new Error('Organizzazione non trovata o non accessibile.');
    return data;
}

export async function insertOrganization(payload) {
    const { data, error } = await supabase
        .from('organizzazione')
        .insert(normalizeOrganizationPayload(payload))
        .select(ORGANIZATION_COLUMNS)
        .single();

    if (error) throw error;
    if (!data?.id) throw new Error('Inserimento dell’organizzazione non confermato dal database.');
    return data;
}

export async function updateOrganization(id, payload) {
    const organizationId = positiveInteger(id, 'Identificativo organizzazione');
    const { data, error } = await supabase
        .from('organizzazione')
        .update(normalizeOrganizationPayload(payload))
        .eq('id', organizationId)
        .eq('attiva', true)
        .select(ORGANIZATION_COLUMNS)
        .maybeSingle();

    if (error) throw error;
    if (!data?.id) throw new Error('Nessuna organizzazione attiva è stata aggiornata.');
    return data;
}

export async function archiveOrganization(id, reason) {
    const organizationId = positiveInteger(id, 'Identificativo organizzazione');
    const normalizedReason = String(reason ?? '').trim();
    if (normalizedReason.length < 5) {
        throw new Error('Indica un motivo di archiviazione di almeno 5 caratteri.');
    }

    const [assetsResult, servicesResult, peopleResult] = await Promise.all([
        supabase.from('asset').select('id', { count: 'exact', head: true }).eq('organizzazione_id', organizationId).eq('attiva', true),
        supabase.from('servizio').select('id', { count: 'exact', head: true }).eq('organizzazione_id', organizationId).eq('attiva', true),
        supabase.from('responsabile').select('id', { count: 'exact', head: true }).eq('organizzazione_id', organizationId).eq('attiva', true)
    ]);

    const referenceError = assetsResult.error || servicesResult.error || peopleResult.error;
    if (referenceError) throw referenceError;

    const activeAssets = assetsResult.count || 0;
    const activeServices = servicesResult.count || 0;
    const activePeople = peopleResult.count || 0;
    if (activeAssets + activeServices + activePeople > 0) {
        throw new Error(
            `Il soggetto non può essere archiviato: risultano ancora attivi ${activeAssets} asset, ${activeServices} servizi e ${activePeople} persone.`
        );
    }

    const { data, error } = await supabase
        .from('organizzazione')
        .update({
            attiva: false,
            motivo_archiviazione: normalizedReason
        })
        .eq('id', organizationId)
        .eq('attiva', true)
        .select(ORGANIZATION_COLUMNS)
        .maybeSingle();

    if (error) throw error;
    if (!data?.id) throw new Error('Il soggetto NIS2 non è stato archiviato.');
    return data;
}

export async function fetchPeople(organizationId, options = {}) {
    const id = positiveInteger(organizationId, 'Organizzazione');
    const { active = true } = options;

    let query = supabase
        .from('responsabile')
        .select(PERSON_COLUMNS)
        .eq('organizzazione_id', id)
        .order('cognome', { ascending: true })
        .order('nome', { ascending: true });

    if (typeof active === 'boolean') query = query.eq('attiva', active);

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
}

export async function insertPerson(payload) {
    const { data, error } = await supabase
        .from('responsabile')
        .insert(normalizePersonPayload(payload))
        .select(PERSON_COLUMNS)
        .single();

    if (error) throw error;
    if (!data?.id) throw new Error('Inserimento della persona non confermato dal database.');
    return data;
}

export async function updatePerson(id, payload) {
    const personId = positiveInteger(id, 'Identificativo persona');
    const { data, error } = await supabase
        .from('responsabile')
        .update(normalizePersonPayload(payload))
        .eq('id', personId)
        .eq('attiva', true)
        .select(PERSON_COLUMNS)
        .maybeSingle();

    if (error) throw error;
    if (!data?.id) throw new Error('Nessuna persona attiva è stata aggiornata.');
    return data;
}

export async function archivePerson(id, reason) {
    const personId = positiveInteger(id, 'Identificativo persona');
    const normalizedReason = String(reason ?? '').trim();
    if (normalizedReason.length < 5) {
        throw new Error('Indica un motivo di disattivazione di almeno 5 caratteri.');
    }

    const [assetsResult, servicesResult] = await Promise.all([
        supabase.from('asset').select('id', { count: 'exact', head: true }).eq('responsabile_id', personId).eq('attiva', true),
        supabase.from('servizio').select('id', { count: 'exact', head: true }).eq('responsabile_id', personId).eq('attiva', true)
    ]);

    const referenceError = assetsResult.error || servicesResult.error;
    if (referenceError) throw referenceError;

    const activeAssets = assetsResult.count || 0;
    const activeServices = servicesResult.count || 0;
    if (activeAssets + activeServices > 0) {
        throw new Error(
            `La persona non può essere disattivata: risulta responsabile di ${activeAssets} asset e ${activeServices} servizi attivi.`
        );
    }

    const { data, error } = await supabase
        .from('responsabile')
        .update({
            attiva: false,
            motivo_archiviazione: normalizedReason
        })
        .eq('id', personId)
        .eq('attiva', true)
        .select(PERSON_COLUMNS)
        .maybeSingle();

    if (error) throw error;
    if (!data?.id) throw new Error('La persona non è stata disattivata.');
    return data;
}

export async function fetchNis2Roles() {
    const { data, error } = await supabase
        .from('ruolo')
        .select('id, codice_ruolo, nome, descrizione, unico_per_organizzazione')
        .order('nome', { ascending: true });

    if (error) throw error;
    return data ?? [];
}

export async function fetchAssignments(organizationId, options = {}) {
    const id = positiveInteger(organizationId, 'Organizzazione');
    const { active = null } = options;

    const people = await fetchPeople(id, { active: null });
    const personIds = people.map((person) => Number(person.id));
    if (personIds.length === 0) return [];

    let query = supabase
        .from('responsabile_ruolo')
        .select(ASSIGNMENT_COLUMNS)
        .in('responsabile_id', personIds)
        .order('attiva', { ascending: false })
        .order('valido_dal', { ascending: false });

    if (typeof active === 'boolean') query = query.eq('attiva', active);

    const [assignmentsResult, roles] = await Promise.all([
        query,
        fetchNis2Roles()
    ]);

    if (assignmentsResult.error) throw assignmentsResult.error;

    const peopleMap = new Map(people.map((person) => [Number(person.id), person]));
    const rolesMap = new Map(roles.map((role) => [Number(role.id), role]));

    return (assignmentsResult.data ?? []).map((assignment) => ({
        ...assignment,
        persona: peopleMap.get(Number(assignment.responsabile_id)) ?? null,
        ruolo: rolesMap.get(Number(assignment.ruolo_id)) ?? null
    }));
}

export async function insertAssignment(payload = {}) {
    const personId = positiveInteger(payload.responsabile_id, 'Persona');
    const roleId = positiveInteger(payload.ruolo_id, 'Ruolo');
    const type = String(payload.tipo_incarico ?? '').trim().toUpperCase();
    const validFrom = String(payload.valido_dal ?? '').trim();

    if (!['TITOLARE', 'VICE', 'SUPPORTO'].includes(type)) {
        throw new Error('Tipo di incarico non valido.');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(validFrom)) {
        throw new Error('La data di inizio è obbligatoria.');
    }

    const { data, error } = await supabase
        .from('responsabile_ruolo')
        .insert({
            responsabile_id: personId,
            ruolo_id: roleId,
            tipo_incarico: type,
            valido_dal: validFrom,
            attiva: true,
            note: nullableText(payload.note)
        })
        .select(ASSIGNMENT_COLUMNS)
        .single();

    if (error) throw error;
    if (!data?.id) throw new Error('Assegnazione dell’incarico non confermata dal database.');
    return data;
}

export async function closeAssignment(id, payload = {}) {
    const assignmentId = positiveInteger(id, 'Identificativo incarico');
    const endDate = String(payload.valido_al ?? '').trim();
    const reason = String(payload.motivo_cessazione ?? '').trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        throw new Error('La data di fine è obbligatoria.');
    }
    if (reason.length < 5) {
        throw new Error('Indica un motivo di cessazione di almeno 5 caratteri.');
    }

    const { data, error } = await supabase
        .from('responsabile_ruolo')
        .update({
            attiva: false,
            valido_al: endDate,
            motivo_cessazione: reason
        })
        .eq('id', assignmentId)
        .eq('attiva', true)
        .select(ASSIGNMENT_COLUMNS)
        .maybeSingle();

    if (error) throw error;
    if (!data?.id) throw new Error('L’incarico non è stato concluso.');
    return data;
}
