// ===============================================================================================================
// FILE: src/database.js
// DESCRIZIONE: Lettura e scrittura dei dati applicativi tramite Supabase e viste PostgreSQL protette da RLS.
// ===============================================================================================================

import { supabase } from './supabase.js';

/**
 * Colonne restituite dalle operazioni CRUD sugli asset.
 */
const ASSET_COLUMNS = [
    'id',
    'codice_asset',
    'nome',
    'categoria_asset_id',
    'classificazione_criticita',
    'descrizione',
    'ubicazione',
    'versione',
    'organizzazione_id',
    'responsabile_id',
    'attiva',
    'data_inserimento'
].join(',');

/**
 * Estrae esclusivamente gli asset attivi dalla tabella applicativa.
 *
 * La vista di esportazione non espone il campo "attiva"; per evitare che
 * record archiviati tornino nell'inventario, la vista operativa interroga
 * direttamente la tabella protetta da RLS.
 */
export async function fetchAssets() {
    const { data, error } = await supabase
        .from('asset')
        .select(ASSET_COLUMNS)
        .eq('attiva', true)
        .order('id', { ascending: true });

    if (error) throw error;
    return data ?? [];
}

/**
 * Estrae la vista ACN limitandola agli identificativi degli asset ancora attivi.
 * Mantiene così il formato storico dell'esportazione senza reintrodurre record archiviati.
 */
export async function fetchAssetsForExport() {
    const assetAttivi = await fetchAssets();
    const ids = assetAttivi.map((asset) => asset.id);

    if (ids.length === 0) return [];

    const { data, error } = await supabase
        .from('vista_esportazione_acn_assets')
        .select('*')
        .in('Asset_ID', ids)
        .order('Asset_ID', { ascending: true });

    if (error) throw error;
    return data ?? [];
}

/**
 * Carica i valori controllati usati dal form asset.
 */
export async function fetchAssetReferences() {
    const [categorieResult, organizzazioniResult, responsabiliResult] = await Promise.all([
        supabase
            .from('categoria_asset')
            .select('id, codice_acn, nome, descrizione')
            .order('nome', { ascending: true }),
        supabase
            .from('organizzazione')
            .select('id, nome, descrizione')
            .eq('attiva', true)
            .order('nome', { ascending: true }),
        supabase
            .from('responsabile')
            .select('id, nome, cognome, email, organizzazione_id')
            .eq('attiva', true)
            .order('cognome', { ascending: true })
            .order('nome', { ascending: true })
    ]);

    const errors = [
        categorieResult.error,
        organizzazioniResult.error,
        responsabiliResult.error
    ].filter(Boolean);

    if (errors.length > 0) {
        throw errors[0];
    }

    return {
        categorie: categorieResult.data ?? [],
        organizzazioni: organizzazioniResult.data ?? [],
        responsabili: responsabiliResult.data ?? []
    };
}

/**
 * Legge il primo valore valorizzato tra più possibili nomi di campo.
 * È usato anche dall'importazione per mantenere compatibilità con intestazioni note.
 */
function leggiValorePayload(payload, chiavi) {
    for (const chiave of chiavi) {
        const valore = payload?.[chiave];
        if (valore !== undefined && valore !== null && String(valore).trim() !== '') {
            return valore;
        }
    }
    return null;
}

function normalizzaTestoOpzionale(valore) {
    const testo = String(valore ?? '').trim();
    return testo === '' ? null : testo;
}

function normalizzaInteroObbligatorio(valore, etichetta) {
    const numero = Number(valore);
    if (!Number.isInteger(numero) || numero <= 0) {
        throw new Error(`${etichetta}: seleziona un valore valido.`);
    }
    return numero;
}

function normalizzaInteroOpzionale(valore, etichetta) {
    if (valore === null || valore === undefined || String(valore).trim() === '') {
        return null;
    }

    const numero = Number(valore);
    if (!Number.isInteger(numero) || numero <= 0) {
        throw new Error(`${etichetta}: seleziona un valore valido.`);
    }
    return numero;
}

/**
 * Allinea e valida il payload del frontend rispetto allo schema reale di public.asset.
 */
function trasformaPayload(payload, indice = null) {
    const prefisso = indice === null ? '' : `Riga ${indice + 1}: `;

    const codice = String(leggiValorePayload(payload, [
        'codice_asset',
        'codice',
        'Asset_Code',
        'Codice_Asset'
    ]) ?? '').trim().toUpperCase();

    const nome = String(leggiValorePayload(payload, [
        'nome',
        'Asset_Name',
        'Nome_Asset'
    ]) ?? '').trim();

    const criticita = String(leggiValorePayload(payload, [
        'criticita',
        'classificazione_criticita',
        'Criticity_Level'
    ]) ?? 'Bassa').trim();

    const categoriaId = leggiValorePayload(payload, [
        'categoria_asset_id',
        'Categoria_Asset_ID'
    ]);

    const organizzazioneId = leggiValorePayload(payload, [
        'organizzazione_id',
        'Organizzazione_ID'
    ]);

    const responsabileId = leggiValorePayload(payload, [
        'responsabile_id',
        'Responsabile_ID'
    ]);

    if (!/^[A-Z0-9][A-Z0-9_-]{2,79}$/.test(codice)) {
        throw new Error(
            `${prefisso}il codice asset deve contenere da 3 a 80 caratteri tra lettere maiuscole, numeri, trattino e underscore.`
        );
    }

    if (!nome) {
        throw new Error(`${prefisso}il nome dell'asset è obbligatorio.`);
    }

    if (!['Bassa', 'Media', 'Alta', 'Critica'].includes(criticita)) {
        throw new Error(`${prefisso}il livello di criticità non è valido.`);
    }

    return {
        codice_asset: codice,
        nome,
        categoria_asset_id: normalizzaInteroObbligatorio(
            categoriaId,
            `${prefisso}categoria asset`
        ),
        classificazione_criticita: criticita,
        descrizione: normalizzaTestoOpzionale(
            leggiValorePayload(payload, ['descrizione', 'Description'])
        ),
        ubicazione: normalizzaTestoOpzionale(
            leggiValorePayload(payload, ['ubicazione', 'Location'])
        ),
        versione: normalizzaTestoOpzionale(
            leggiValorePayload(payload, ['versione', 'Software_Version'])
        ),
        organizzazione_id: normalizzaInteroObbligatorio(
            organizzazioneId,
            `${prefisso}organizzazione`
        ),
        responsabile_id: normalizzaInteroOpzionale(
            responsabileId,
            `${prefisso}responsabile`
        )
    };
}

/**
 * Esegue l'inserimento di un nuovo asset e restituisce la riga realmente creata.
 */
export async function insertAsset(payload) {
    const dbPayload = trasformaPayload(payload);
    const { data, error } = await supabase
        .from('asset')
        .insert(dbPayload)
        .select(ASSET_COLUMNS)
        .single();

    if (error) throw error;
    if (!data?.id) {
        throw new Error('Inserimento non confermato dal database.');
    }

    return data;
}

/**
 * Aggiorna esclusivamente un asset attivo e restituisce la riga realmente modificata.
 */
export async function updateAsset(id, payload) {
    const assetId = Number(id);
    if (!Number.isInteger(assetId) || assetId <= 0) {
        throw new Error('Identificativo asset non valido.');
    }

    const dbPayload = trasformaPayload(payload);
    const { data, error } = await supabase
        .from('asset')
        .update(dbPayload)
        .eq('id', assetId)
        .eq('attiva', true)
        .select(ASSET_COLUMNS)
        .maybeSingle();

    if (error) throw error;
    if (!data?.id) {
        throw new Error(
            'Nessun asset attivo è stato aggiornato. Il record potrebbe essere stato archiviato o non essere più accessibile.'
        );
    }

    return data;
}

/**
 * Esegue l'inserimento massivo con la stessa validazione del form manuale.
 */
export async function bulkInsertAssets(assetsArray) {
    if (!Array.isArray(assetsArray) || assetsArray.length === 0) {
        throw new Error('Il file non contiene asset da importare.');
    }

    const dbPayloadArray = assetsArray.map((asset, indice) => trasformaPayload(asset, indice));
    const { data, error } = await supabase
        .from('asset')
        .insert(dbPayloadArray)
        .select(ASSET_COLUMNS);

    if (error) throw error;

    if (!Array.isArray(data) || data.length !== dbPayloadArray.length) {
        throw new Error(
            `Importazione non confermata: create ${data?.length ?? 0} righe su ${dbPayloadArray.length}.`
        );
    }

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
 * Recupera gli identificativi degli eventi che possiedono almeno una
 * classificazione ACN attiva.
 *
 * La lettura avviene direttamente dalla tabella associativa invece di
 * affidarsi all'embedding automatico di PostgREST. Questa soluzione evita
 * dipendenze dal nome della relazione esposta dall'API e rende la Dashboard
 * compatibile con lo schema effettivamente pubblicato da Supabase.
 */
async function fetchEventoIdsClassificatiAttivi() {
    const { data, error } = await supabase
        .from('evento_tassonomia_acn')
        .select('evento_id')
        .eq('attiva', true);

    if (error) throw error;

    return [...new Set(
        (data ?? [])
            .map((record) => record.evento_id)
            .filter((id) => id !== null && id !== undefined)
    )];
}

/**
 * Conta gli incidenti attivi, non chiusi e dotati di almeno una
 * classificazione ACN attiva.
 */
async function contaIncidentiClassificatiAperti() {
    const eventoIds = await fetchEventoIdsClassificatiAttivi();
    if (eventoIds.length === 0) return 0;

    const { count, error } = await supabase
        .from('evento_servizio')
        .select('id', { count: 'exact', head: true })
        .eq('attiva', true)
        .is('fine', null)
        .in('id', eventoIds);

    if (error) throw error;
    return count ?? 0;
}

/**
 * Legge gli incidenti classificati aperti più recenti.
 */
async function fetchIncidentiClassificatiRecenti(limit = 5) {
    const eventoIds = await fetchEventoIdsClassificatiAttivi();
    if (eventoIds.length === 0) return [];

    const { data, error } = await supabase
        .from('evento_servizio')
        .select('id, inizio, fine, causa, severita, tipologia, servizio_id')
        .eq('attiva', true)
        .is('fine', null)
        .in('id', eventoIds)
        .order('inizio', { ascending: false })
        .limit(limit);

    if (error) throw error;
    return data ?? [];
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
        fetchIncidentiClassificatiRecenti(5),
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
