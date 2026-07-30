// ===============================================================================================================
// FILE: src/assessmentService.js
// DESCRIZIONE: Accesso dati per Profili Target, Profili Attuali e valutazioni FNCSDP.
// ===============================================================================================================

import { supabase } from './supabase.js?build=20260726-d2';

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

function requiredText(value, label, minLength = 2) {
    const normalized = String(value ?? '').trim();
    if (normalized.length < minLength) {
        throw new Error(`${label} obbligatorio.`);
    }
    return normalized;
}

function normalizedCode(value, label) {
    const normalized = String(value ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(normalized)) {
        throw new Error(`${label} non valido.`);
    }
    return normalized;
}

function normalizeCoverage(value, { allowNull = false } = {}) {
    if (allowNull && (value === '' || value === null || value === undefined)) return null;
    const normalized = Number(value);
    const allowed = [0, 0.2, 0.4, 0.6, 0.8, 1];
    if (!allowed.includes(normalized)) {
        throw new Error('Il grado di copertura deve essere uno dei valori previsti: 0, 0.2, 0.4, 0.6, 0.8 oppure 1.');
    }
    return normalized;
}

function normalizeMaturity(value, coverage) {
    if (coverage === 0 || value === '' || value === null || value === undefined) return null;
    const normalized = Number(value);
    if (!Number.isInteger(normalized) || normalized < 1 || normalized > 5) {
        throw new Error('Il livello di maturità deve essere compreso tra 1 e 5.');
    }
    return normalized;
}

export async function fetchAssessmentReferences() {
    const [organizationsResult, peopleResult] = await Promise.all([
        supabase
            .from('organizzazione')
            .select('id,codice_organizzazione,nome')
            .eq('attiva', true)
            .order('nome', { ascending: true }),
        supabase
            .from('responsabile')
            .select('id,nome,cognome,email,organizzazione_id')
            .eq('attiva', true)
            .order('cognome', { ascending: true })
            .order('nome', { ascending: true })
    ]);

    const error = organizationsResult.error || peopleResult.error;
    if (error) throw error;

    return {
        organizzazioni: organizationsResult.data ?? [],
        responsabili: peopleResult.data ?? []
    };
}

export async function fetchTargetProfiles() {
    const { data, error } = await supabase
        .from('vista_profili_target_fncsdp')
        .select('*')
        .eq('attiva', true)
        .order('creato_il', { ascending: false });

    if (error) throw error;
    return data ?? [];
}

export async function fetchTargetControls(targetId) {
    const normalizedId = positiveInteger(targetId, 'Profilo Target');
    const { data, error } = await supabase
        .from('vista_controlli_target_fncsdp')
        .select('*')
        .eq('profilo_target_id', normalizedId)
        .eq('attiva', true)
        .order('ordine', { ascending: true });

    if (error) throw error;
    return data ?? [];
}

export async function createTargetProfile(payload = {}) {
    const organizationId = positiveInteger(payload.organizzazione_id, 'Soggetto NIS2');
    const code = normalizedCode(payload.codice, 'Codice Profilo Target');
    const name = requiredText(payload.nome, 'Nome Profilo Target', 3);
    const perimeter = requiredText(payload.perimetro, 'Perimetro', 10);

    const { data, error } = await supabase.rpc('fn_crea_profilo_target_fncsdp', {
        p_organizzazione_id: organizationId,
        p_codice: code,
        p_nome: name,
        p_descrizione: nullableText(payload.descrizione),
        p_perimetro: perimeter
    });

    if (error) throw error;
    return positiveInteger(data, 'Profilo Target creato');
}

export async function updateTargetControl(controlId, payload = {}) {
    const normalizedId = positiveInteger(controlId, 'Controllo Target');
    const coverage = normalizeCoverage(payload.copertura_target);
    const name = requiredText(payload.nome, 'Nome controllo', 3);
    const description = requiredText(payload.descrizione, 'Descrizione controllo', 5);

    const { data, error } = await supabase
        .from('controllo_target_fncsdp')
        .update({
            nome: name,
            descrizione: description,
            copertura_target: coverage
        })
        .eq('id', normalizedId)
        .eq('attiva', true)
        .select('id')
        .maybeSingle();

    if (error) throw error;
    if (!data?.id) throw new Error('Il controllo non è stato aggiornato. Il Profilo Target potrebbe essere già approvato.');
    return data.id;
}

export async function approveTargetProfile(targetId) {
    const normalizedId = positiveInteger(targetId, 'Profilo Target');
    const { data, error } = await supabase.rpc('fn_approva_profilo_target_fncsdp', {
        p_profilo_target_id: normalizedId
    });
    if (error) throw error;
    return positiveInteger(data, 'Profilo Target approvato');
}

export async function fetchAssessments(targetId = null) {
    let query = supabase
        .from('vista_profili_attuali_fncsdp')
        .select('*')
        .eq('attiva', true)
        .order('data_assessment', { ascending: false })
        .order('assessment_id', { ascending: false });

    if (targetId !== null && targetId !== undefined && targetId !== '') {
        query = query.eq('profilo_target_id', positiveInteger(targetId, 'Profilo Target'));
    }

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
}

export async function createAssessment(payload = {}) {
    const targetId = positiveInteger(payload.profilo_target_id, 'Profilo Target');
    const code = normalizedCode(payload.codice, 'Codice assessment');
    const name = requiredText(payload.nome, 'Nome assessment', 3);
    const assessorId = payload.responsabile_assessor_id
        ? positiveInteger(payload.responsabile_assessor_id, 'Assessor')
        : null;

    const { data, error } = await supabase.rpc('fn_crea_assessment_fncsdp', {
        p_profilo_target_id: targetId,
        p_codice: code,
        p_nome: name,
        p_data_assessment: payload.data_assessment || null,
        p_responsabile_assessor_id: assessorId,
        p_note: nullableText(payload.note)
    });

    if (error) throw error;
    return positiveInteger(data, 'Assessment creato');
}

export async function fetchAssessmentEvaluation(assessmentId) {
    const normalizedId = positiveInteger(assessmentId, 'Assessment');
    const { data, error } = await supabase
        .from('vista_valutazione_fncsdp')
        .select('*')
        .eq('assessment_id', normalizedId)
        .order('ordine', { ascending: true })
        .order('subcategory_codice', { ascending: true });

    if (error) throw error;
    return data ?? [];
}

export async function updateAssessmentMeasure(measureId, payload = {}) {
    const normalizedId = positiveInteger(measureId, 'Misura');
    const coverage = normalizeCoverage(payload.copertura_attuale, { allowNull: true });
    const maturity = normalizeMaturity(payload.livello_maturita, coverage);

    const { data, error } = await supabase
        .from('misura_controllo_fncsdp')
        .update({
            risposta: nullableText(payload.risposta),
            note_copertura: nullableText(payload.note_copertura),
            copertura_attuale: coverage,
            note_maturita: nullableText(payload.note_maturita),
            livello_maturita: maturity,
            evidenze: nullableText(payload.evidenze),
            note: nullableText(payload.note)
        })
        .eq('id', normalizedId)
        .eq('attiva', true)
        .select('id')
        .maybeSingle();

    if (error) throw error;
    if (!data?.id) throw new Error('La misura non è stata aggiornata. L’assessment potrebbe essere già completato.');
    return data.id;
}

export async function completeAssessment(assessmentId) {
    const normalizedId = positiveInteger(assessmentId, 'Assessment');
    const { data, error } = await supabase.rpc('fn_completa_assessment_fncsdp', {
        p_assessment_id: normalizedId
    });
    if (error) throw error;
    return positiveInteger(data, 'Assessment completato');
}
