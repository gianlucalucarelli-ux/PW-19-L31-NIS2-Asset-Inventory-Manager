// ===============================================================================================================
// FILE: src/database.js
// DESCRIZIONE: Lettura e scrittura dei dati applicativi tramite Supabase e viste PostgreSQL protette da RLS.
// ===============================================================================================================

import { supabase } from './supabase.js';

/**
 * Estrae l'elenco degli asset sfruttando la vista di esportazione ACN.
 */
export async function fetchAssets() {
    const { data, error } = await supabase
        .from('vista_esportazione_acn_assets')
        .select('*');

    if (error) throw error;
    return data;
}

/**
 * Allinea il payload del frontend alla struttura attualmente usata dalla tabella asset.
 * I valori relazionali temporanei verranno sostituiti da selezioni controllate nella Fase B2.
 */
function trasformaPayload(payload) {
    return {
        nome: payload.nome,
        versione: payload.versione,
        classificazione_criticita: payload.criticita || 'Bassa',
        categoria_asset_id: 1,
        organizzazione_id: 1,
        responsabile_id: 1
    };
}

/**
 * Esegue l'inserimento di un nuovo asset.
 */
export async function insertAsset(payload) {
    const dbPayload = trasformaPayload(payload);
    const { data, error } = await supabase
        .from('asset')
        .insert([dbPayload])
        .select();

    if (error) throw error;
    return data;
}

/**
 * Esegue l'aggiornamento di un asset esistente.
 */
export async function updateAsset(id, payload) {
    const dbPayload = trasformaPayload(payload);
    const { data, error } = await supabase
        .from('asset')
        .update(dbPayload)
        .eq('id', id)
        .select();

    if (error) throw error;
    return data;
}

/**
 * Esegue l'inserimento massivo per il flusso di importazione Excel.
 */
export async function bulkInsertAssets(assetsArray) {
    const dbPayloadArray = assetsArray.map((asset) => trasformaPayload(asset));
    const { data, error } = await supabase
        .from('asset')
        .insert(dbPayloadArray)
        .select();

    if (error) throw error;
    return data;
}

/**
 * Legge i dati della Supply Chain dalla vista di reporting dei servizi critici.
 */
export async function fetchSupplyChain() {
    const { data, error } = await supabase
        .from('vista_reporting_servizi_critici')
        .select('*');

    if (error) throw error;
    return data;
}

/**
 * Legge gli eventi di audit più recenti.
 */
export async function fetchAuditLogs(limit = 50) {
    const { data, error } = await supabase
        .from('audit_log')
        .select('*')
        .order('data_modifica', { ascending: false })
        .limit(limit);

    if (error) throw error;
    return data;
}

/**
 * Restituisce il conteggio di una tabella applicando, quando necessario, filtri RLS compatibili.
 */
async function contaRighe(tabella, configuraQuery = null) {
    let query = supabase
        .from(tabella)
        .select('*', { count: 'exact', head: true });

    if (typeof configuraQuery === 'function') {
        query = configuraQuery(query);
    }

    const { count, error } = await query;
    if (error) throw error;
    return count ?? 0;
}

/**
 * Conta gli incidenti attivi, non chiusi e dotati di almeno una classificazione ACN attiva.
 * In questo modo la Dashboard esclude record tecnici e compilazioni interrotte senza tassonomia.
 */
async function contaIncidentiClassificatiAperti() {
    const { count, error } = await supabase
        .from('evento_servizio')
        .select('id, evento_tassonomia_acn!inner(id)', { count: 'exact', head: true })
        .eq('attiva', true)
        .is('fine', null)
        .eq('evento_tassonomia_acn.attiva', true);

    if (error) throw error;
    return count ?? 0;
}

/**
 * Converte un risultato Promise.allSettled in un valore utilizzabile e registra eventuali errori parziali.
 */
function estraiRisultato(risultato, valorePredefinito, chiave, errori) {
    if (risultato.status === 'fulfilled') {
        return risultato.value;
    }

    console.error(`Errore dashboard nella sorgente ${chiave}:`, risultato.reason);
    errori.push({ chiave, messaggio: risultato.reason?.message || 'Errore non specificato' });
    return valorePredefinito;
}

/**
 * Raccoglie in parallelo gli indicatori e le liste necessarie alla Dashboard operativa.
 * Ogni sorgente viene gestita separatamente, così un errore parziale non blocca l'intera pagina.
 */
export async function fetchDashboardData() {
    const richieste = await Promise.allSettled([
        contaRighe('asset', (query) => query.eq('attiva', true)),
        contaRighe('asset', (query) => query.eq('attiva', true).eq('classificazione_criticita', 'Critica')),
        contaRighe('servizio', (query) => query.eq('attiva', true)),
        contaRighe('fornitore', (query) => query.eq('attiva', true)),
        contaRighe('asset_vulnerabilita', (query) => query.eq('attiva', true).eq('stato_remediation', 'OPEN')),
        contaIncidentiClassificatiAperti(),
        fetchAssets(),
        fetchSupplyChain(),
        supabase
            .from('evento_servizio')
            .select('id, inizio, fine, causa, severita, tipologia, servizio_id, evento_tassonomia_acn!inner(id)')
            .eq('attiva', true)
            .is('fine', null)
            .eq('evento_tassonomia_acn.attiva', true)
            .order('inizio', { ascending: false })
            .limit(5)
            .then(({ data, error }) => {
                if (error) throw error;
                return data ?? [];
            }),
        supabase
            .from('audit_log')
            .select('id, data_modifica, operazione, utente, utente_email, tabella, tipo_entita, record_id, codice_record, nome_record')
            .order('data_modifica', { ascending: false })
            .limit(5)
            .then(({ data, error }) => {
                if (error) throw error;
                return data ?? [];
            })
    ]);

    const errori = [];

    return {
        metriche: {
            assetAttivi: estraiRisultato(richieste[0], null, 'asset-attivi', errori),
            assetCritici: estraiRisultato(richieste[1], null, 'asset-critici', errori),
            serviziAttivi: estraiRisultato(richieste[2], null, 'servizi-attivi', errori),
            fornitoriAttivi: estraiRisultato(richieste[3], null, 'fornitori-attivi', errori),
            vulnerabilitaAperte: estraiRisultato(richieste[4], null, 'vulnerabilita-aperte', errori),
            incidentiAperti: estraiRisultato(richieste[5], null, 'incidenti-aperti', errori)
        },
        asset: estraiRisultato(richieste[6], [], 'distribuzione-asset', errori),
        supplyChain: estraiRisultato(richieste[7], [], 'supply-chain', errori),
        incidentiRecenti: estraiRisultato(richieste[8], [], 'incidenti-recenti', errori),
        auditRecente: estraiRisultato(richieste[9], [], 'audit-recente', errori),
        errori
    };
}
