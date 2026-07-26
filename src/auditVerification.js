// ===============================================================================================================
// FILE: src/auditVerification.js
// DESCRIZIONE: Verifica applicativa non invasiva degli eventi generati dai trigger dell'Audit Log.
// ===============================================================================================================

import { supabase } from './supabase.js?build=20260726-d2';
const RETRY_DELAYS_MS = [0, 180, 320, 520, 800];

function wait(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function normalizeIds(values) {
    return [...new Set((values ?? [])
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
        .map(String))];
}

/**
 * Crea l'istante iniziale della finestra di verifica con un piccolo margine
 * per compensare la precisione al secondo della colonna audit_log.data_modifica.
 */
export function startAuditVerificationWindow() {
    return new Date(Date.now() - 2500).toISOString().slice(0, 19);
}

async function fetchAuditMatches({ table, operation, recordIds, startedAt }) {
    let query = supabase
        .from('audit_log')
        .select('id,operazione,tabella,record_id,codice_record,nome_record,data_modifica')
        .eq('tabella', table)
        .eq('operazione', operation)
        .gte('data_modifica', startedAt)
        .order('data_modifica', { ascending: false })
        .limit(Math.min(1000, Math.max(20, recordIds.length * 3)));

    query = recordIds.length === 1
        ? query.eq('record_id', recordIds[0])
        : query.in('record_id', recordIds);

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
}

/**
 * Verifica che l'operazione appena completata abbia prodotto un evento Audit.
 * La mutazione non viene mai annullata da questa verifica: un eventuale problema
 * di lettura viene restituito come stato esplicito e mostrato all'utente.
 */
export async function verifyAuditRecords({
    table,
    operation,
    recordIds,
    startedAt = startAuditVerificationWindow()
}) {
    const normalizedIds = normalizeIds(recordIds);
    if (!table || !operation || normalizedIds.length === 0) {
        return {
            verified: false,
            available: false,
            expected: normalizedIds.length,
            found: 0,
            rows: [],
            error: new Error('Parametri di verifica Audit non validi.')
        };
    }

    let lastError = null;
    let bestRows = [];
    let bestFound = 0;
    for (const delay of RETRY_DELAYS_MS) {
        if (delay > 0) await wait(delay);
        try {
            const rows = await fetchAuditMatches({
                table,
                operation,
                recordIds: normalizedIds,
                startedAt
            });
            const foundIds = new Set(rows.map((row) => String(row.record_id ?? '')));
            const found = normalizedIds.filter((id) => foundIds.has(id)).length;
            if (found > bestFound) {
                bestFound = found;
                bestRows = rows;
            }
            if (found === normalizedIds.length) {
                return {
                    verified: true,
                    available: true,
                    expected: normalizedIds.length,
                    found,
                    rows,
                    error: null
                };
            }
        } catch (error) {
            lastError = error;
            break;
        }
    }

    return {
        verified: false,
        available: lastError === null,
        expected: normalizedIds.length,
        found: bestFound,
        rows: bestRows,
        error: lastError
    };
}

export async function verifyAuditRecord(options) {
    return verifyAuditRecords({
        ...options,
        recordIds: [options.recordId]
    });
}
