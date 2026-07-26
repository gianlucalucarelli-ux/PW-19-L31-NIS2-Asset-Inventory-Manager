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
    'data_inserimento',
    'archiviato_il',
    'archiviato_da',
    'motivo_archiviazione'
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
 * Estrae gli asset archiviati logicamente e arricchisce i riferimenti descrittivi.
 * La funzione è di sola lettura e non espone operazioni di ripristino o cancellazione.
 */
export async function fetchArchivedAssets() {
    const { data, error } = await supabase
        .from('asset')
        .select(ASSET_COLUMNS)
        .eq('attiva', false)
        .order('archiviato_il', { ascending: false, nullsFirst: false })
        .order('id', { ascending: true });

    if (error) throw error;

    const records = data ?? [];
    if (records.length === 0) return [];

    const categoryIds = records.map((record) => record.categoria_asset_id);
    const organizationIds = records.map((record) => record.organizzazione_id);
    const responsibleIds = records.map((record) => record.responsabile_id);

    const [categories, organizations, responsibles] = await Promise.all([
        fetchRowsByIds('categoria_asset', 'id, nome, codice_acn', categoryIds),
        fetchRowsByIds('organizzazione', 'id, nome', organizationIds),
        fetchRowsByIds('responsabile', 'id, nome, cognome, email, telefono', responsibleIds)
    ]);

    const categoryMap = new Map(categories.map((record) => [Number(record.id), record]));
    const organizationMap = new Map(organizations.map((record) => [Number(record.id), record]));
    const responsibleMap = new Map(responsibles.map((record) => [Number(record.id), record]));

    return records.map((record) => {
        const category = categoryMap.get(Number(record.categoria_asset_id));
        const organization = organizationMap.get(Number(record.organizzazione_id));
        const responsible = responsibleMap.get(Number(record.responsabile_id));

        return {
            ...record,
            categoria_nome: category?.nome || 'N/D',
            categoria_codice: category?.codice_acn || '',
            organizzazione_nome: organization?.nome || 'N/D',
            responsabile_nome: responsible
                ? `${responsible.nome || ''} ${responsible.cognome || ''}`.trim()
                : 'Non assegnato',
            responsabile_email: responsible?.email || '',
            responsabile_telefono: responsible?.telefono || ''
        };
    });
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
            .select('id, nome, cognome, email, telefono, organizzazione_id')
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
 * Carica le relazioni attive associate a un asset per la vista di dettaglio.
 * Le query sono di sola lettura, rispettano RLS e non modificano il database.
 */
export async function fetchAssetDetailRelations(assetId) {
    const id = Number(assetId);
    if (!Number.isInteger(id) || id <= 0) {
        throw new Error('Identificativo asset non valido.');
    }

    const [serviziResult, vulnerabilitaResult, fornitoriResult] = await Promise.all([
        supabase
            .from('servizio_dipendenza_asset')
            .select('servizio_id, tipo_dipendenza_servizio_id, descrizione, attiva')
            .eq('asset_id', id)
            .eq('attiva', true),
        supabase
            .from('asset_vulnerabilita')
            .select('vulnerabilita_id, data_rilevamento, stato_remediation, attiva')
            .eq('asset_id', id)
            .eq('attiva', true),
        supabase
            .from('asset_fornitore')
            .select('id, fornitore_id, tipo_relazione_asset_fornitore_id, descrizione, riferimento_contratto, relazione_primaria, valido_dal, valido_al, attiva')
            .eq('asset_id', id)
            .eq('attiva', true)
    ]);

    const erroriRelazioni = [
        serviziResult.error,
        vulnerabilitaResult.error,
        fornitoriResult.error
    ].filter(Boolean);

    if (erroriRelazioni.length > 0) throw erroriRelazioni[0];

    const relazioniServizi = serviziResult.data ?? [];
    const relazioniVulnerabilita = vulnerabilitaResult.data ?? [];
    const relazioniFornitori = fornitoriResult.data ?? [];

    const valoriUnici = (righe, campo) => [...new Set(
        righe
            .map((riga) => Number(riga?.[campo]))
            .filter((valore) => Number.isInteger(valore) && valore > 0)
    )];

    const servizioIds = valoriUnici(relazioniServizi, 'servizio_id');
    const tipoDipendenzaIds = valoriUnici(relazioniServizi, 'tipo_dipendenza_servizio_id');
    const vulnerabilitaIds = valoriUnici(relazioniVulnerabilita, 'vulnerabilita_id');
    const fornitoreIds = valoriUnici(relazioniFornitori, 'fornitore_id');
    const tipoRelazioneIds = valoriUnici(relazioniFornitori, 'tipo_relazione_asset_fornitore_id');

    const queryPerIds = (tabella, colonne, ids) => ids.length === 0
        ? Promise.resolve({ data: [], error: null })
        : supabase.from(tabella).select(colonne).in('id', ids);

    const [
        serviziLookup,
        tipiDipendenzaLookup,
        vulnerabilitaLookup,
        fornitoriLookup,
        tipiRelazioneLookup
    ] = await Promise.all([
        queryPerIds('servizio', 'id, codice_servizio, nome, descrizione, attiva', servizioIds),
        queryPerIds('tipo_dipendenza_servizio', 'id, codice, descrizione', tipoDipendenzaIds),
        queryPerIds('vulnerabilita', 'id, codice_bollettino, descrizione_rischio, livello_severita, data_pubblicazione', vulnerabilitaIds),
        queryPerIds('fornitore', 'id, codice_fornitore, nome, contatto_email, attiva', fornitoreIds),
        queryPerIds('tipo_relazione_asset_fornitore', 'id, codice, descrizione', tipoRelazioneIds)
    ]);

    const erroriLookup = [
        serviziLookup.error,
        tipiDipendenzaLookup.error,
        vulnerabilitaLookup.error,
        fornitoriLookup.error,
        tipiRelazioneLookup.error
    ].filter(Boolean);

    if (erroriLookup.length > 0) throw erroriLookup[0];

    const creaMappa = (righe) => new Map((righe ?? []).map((riga) => [Number(riga.id), riga]));
    const serviziMap = creaMappa(serviziLookup.data);
    const tipiDipendenzaMap = creaMappa(tipiDipendenzaLookup.data);
    const vulnerabilitaMap = creaMappa(vulnerabilitaLookup.data);
    const fornitoriMap = creaMappa(fornitoriLookup.data);
    const tipiRelazioneMap = creaMappa(tipiRelazioneLookup.data);

    const servizi = relazioniServizi
        .map((relazione) => {
            const servizio = serviziMap.get(Number(relazione.servizio_id));
            const tipo = tipiDipendenzaMap.get(Number(relazione.tipo_dipendenza_servizio_id));
            if (!servizio) return null;

            return {
                id: servizio.id,
                codice: servizio.codice_servizio,
                nome: servizio.nome,
                descrizione: relazione.descrizione || servizio.descrizione || '',
                tipoDipendenza: tipo?.codice || tipo?.descrizione || 'Non specificata'
            };
        })
        .filter(Boolean)
        .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'it'));

    const vulnerabilita = relazioniVulnerabilita
        .map((relazione) => {
            const record = vulnerabilitaMap.get(Number(relazione.vulnerabilita_id));
            if (!record) return null;

            return {
                id: record.id,
                codice: record.codice_bollettino,
                descrizione: record.descrizione_rischio || '',
                severita: record.livello_severita || 'Non specificata',
                dataPubblicazione: record.data_pubblicazione || null,
                dataRilevamento: relazione.data_rilevamento || null,
                statoRemediation: relazione.stato_remediation || 'Non specificato'
            };
        })
        .filter(Boolean)
        .sort((a, b) => String(a.codice).localeCompare(String(b.codice), 'it'));

    const fornitori = relazioniFornitori
        .map((relazione) => {
            const fornitore = fornitoriMap.get(Number(relazione.fornitore_id));
            const tipo = tipiRelazioneMap.get(Number(relazione.tipo_relazione_asset_fornitore_id));
            if (!fornitore) return null;

            return {
                id: fornitore.id,
                codice: fornitore.codice_fornitore,
                nome: fornitore.nome,
                email: fornitore.contatto_email || '',
                tipoRelazione: tipo?.codice || tipo?.descrizione || 'Non specificata',
                descrizione: relazione.descrizione || '',
                riferimentoContratto: relazione.riferimento_contratto || '',
                relazionePrimaria: Boolean(relazione.relazione_primaria),
                validoDal: relazione.valido_dal || null,
                validoAl: relazione.valido_al || null
            };
        })
        .filter(Boolean)
        .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'it'));

    return { servizi, vulnerabilita, fornitori };
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
 * Archivia logicamente un asset attivo. Il trigger PostgreSQL valorizza
 * archiviato_il e archiviato_da; il frontend invia soltanto il motivo.
 */
export async function archiveAsset(id, motivo) {
    const assetId = Number(id);
    const motivoNormalizzato = String(motivo ?? '').trim();

    if (!Number.isInteger(assetId) || assetId <= 0) {
        throw new Error('Identificativo asset non valido.');
    }
    if (motivoNormalizzato.length < 5) {
        throw new Error('Indica un motivo di archiviazione di almeno 5 caratteri.');
    }

    const { data, error } = await supabase
        .from('asset')
        .update({
            attiva: false,
            motivo_archiviazione: motivoNormalizzato
        })
        .eq('id', assetId)
        .eq('attiva', true)
        .select(ASSET_COLUMNS)
        .maybeSingle();

    if (error) throw error;
    if (!data?.id) {
        throw new Error('L’asset non è stato archiviato: potrebbe essere già inattivo o non accessibile.');
    }

    return data;
}

async function fetchRowsByIds(tabella, colonne, ids) {
    const validIds = [...new Set(ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
    if (validIds.length === 0) return [];

    const { data, error } = await supabase
        .from(tabella)
        .select(colonne)
        .in('id', validIds);

    if (error) throw error;
    return data ?? [];
}

/**
 * Legge la Supply Chain multilivello e scarta nel frontend i percorsi che
 * coinvolgono entità archiviate. Mantiene anche alias compatibili con la
 * Dashboard storica.
 */
function supplyFirst(record, keys, fallback = null) {
    for (const key of keys) {
        const value = record?.[key];
        if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return fallback;
}

function supplyInteger(value, fallback = null) {
    if (value === null || value === undefined || value === '') return fallback;
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : fallback;
}

function supplyDepth(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function supplyBoolean(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    return ['true', 't', '1', 'yes', 'si', 'sì'].includes(String(value ?? '').trim().toLowerCase());
}

function normalizeSupplyChainRecord(record, index) {
    const serviceRootId = supplyInteger(supplyFirst(record, ['servizioRadiceId', 'servizio_radice_id', 'service_root_id']));
    const serviceOriginId = supplyInteger(supplyFirst(record, ['servizioOrigineId', 'servizio_origine_id', 'service_origin_id'], serviceRootId));
    const assetOriginId = supplyInteger(supplyFirst(record, ['assetOrigineId', 'asset_origine_id', 'asset_origin_id']));
    const assetEffectiveId = supplyInteger(supplyFirst(record, ['assetEffettivoId', 'asset_effettivo_id', 'asset_effective_id'], assetOriginId));
    const supplierOriginId = supplyInteger(supplyFirst(record, ['fornitoreOrigineId', 'fornitore_origine_id', 'supplier_origin_id']));
    const supplierEffectiveId = supplyInteger(supplyFirst(record, ['fornitoreEffettivoId', 'fornitore_effettivo_id', 'supplier_effective_id'], supplierOriginId));

    const serviceRoot = String(supplyFirst(record, [
        'servizioRadice', 'nome_servizio_radice', 'Service_Name', 'servizio_nome', 'nome_servizio'
    ], 'N/D'));
    const serviceOrigin = String(supplyFirst(record, [
        'servizioOrigine', 'nome_servizio_origine', 'Service_Name', 'servizio_nome', 'nome_servizio'
    ], serviceRoot));
    const assetOrigin = String(supplyFirst(record, [
        'assetOrigine', 'nome_asset_origine', 'Dependent_Asset', 'asset_dipendenti', 'asset_nome'
    ], ''));
    const assetEffective = String(supplyFirst(record, [
        'assetEffettivo', 'nome_asset_effettivo', 'Dependent_Asset', 'asset_dipendenti', 'asset_nome'
    ], assetOrigin));
    const supplierOrigin = String(supplyFirst(record, [
        'fornitoreOrigine', 'nome_fornitore_origine', 'Vendor_Partner', 'fornitori', 'fornitore_nome'
    ], 'N/D'));
    const supplierEffective = String(supplyFirst(record, [
        'fornitoreEffettivo', 'nome_fornitore_effettivo', 'Vendor_Partner', 'fornitori', 'fornitore_nome'
    ], supplierOrigin));

    const serviceDepth = supplyDepth(supplyFirst(record, ['profonditaServizio', 'profondita_servizio']));
    const assetDepth = supplyDepth(supplyFirst(record, ['profonditaAsset', 'profondita_asset']));
    const supplierDepth = supplyDepth(supplyFirst(record, ['profonditaFornitore', 'profondita_fornitore']));
    const origin = String(supplyFirst(record, ['origineCollegamento', 'origine_collegamento'], assetEffective
        ? 'SERVIZIO_ASSET_FORNITORE'
        : 'SERVIZIO_FORNITORE'));
    const inheritedService = supplyBoolean(supplyFirst(record, ['ereditataDaSottoservizio', 'ereditata_da_sottoservizio']));
    const inheritedAsset = supplyBoolean(supplyFirst(record, ['ereditataDaSottoasset', 'ereditata_da_sottoasset']));
    const inheritedSupplier = supplyBoolean(supplyFirst(record, ['ereditataDaSubfornitore', 'ereditata_da_subfornitore']));
    const derived = supplyBoolean(record?.derivata)
        || serviceDepth > 0
        || assetDepth > 0
        || supplierDepth > 0
        || inheritedService
        || inheritedAsset
        || inheritedSupplier;

    return {
        idPercorso: String(supplyFirst(record, ['idPercorso', 'id_percorso'], [
            serviceRootId || serviceRoot,
            serviceOriginId || serviceOrigin,
            assetEffectiveId || assetEffective || 0,
            supplierEffectiveId || supplierEffective,
            origin,
            index
        ].join('-'))),
        origineCollegamento: origin,
        servizioRadiceId: serviceRootId,
        servizioRadiceCodice: String(supplyFirst(record, ['servizioRadiceCodice', 'codice_servizio_radice', 'Service_Code'], '')),
        servizioRadice: serviceRoot,
        servizioOrigineId: serviceOriginId,
        servizioOrigineCodice: String(supplyFirst(record, ['servizioOrigineCodice', 'codice_servizio_origine', 'Service_Code'], '')),
        servizioOrigine: serviceOrigin,
        profonditaServizio: serviceDepth,
        assetOrigineId: assetOriginId,
        assetOrigineCodice: String(supplyFirst(record, ['assetOrigineCodice', 'codice_asset_origine', 'Asset_Code'], '')),
        assetOrigine: assetOrigin,
        assetEffettivoId: assetEffectiveId,
        assetEffettivoCodice: String(supplyFirst(record, ['assetEffettivoCodice', 'codice_asset_effettivo', 'Asset_Code'], '')),
        assetEffettivo: assetEffective,
        profonditaAsset: assetDepth,
        fornitoreOrigineId: supplierOriginId,
        fornitoreOrigineCodice: String(supplyFirst(record, ['fornitoreOrigineCodice', 'codice_fornitore_origine', 'Vendor_Code'], '')),
        fornitoreOrigine: supplierOrigin,
        fornitoreEffettivoId: supplierEffectiveId,
        fornitoreEffettivoCodice: String(supplyFirst(record, ['fornitoreEffettivoCodice', 'codice_fornitore_effettivo', 'Vendor_Code'], '')),
        fornitoreEffettivo: supplierEffective,
        profonditaFornitore: supplierDepth,
        contattoFornitore: String(supplyFirst(record, [
            'contattoFornitore', 'contatto_fornitore', 'Vendor_Contact', 'fornitore_email'
        ], '')),
        tipoDipendenzaServizio: String(supplyFirst(record, [
            'tipoDipendenzaServizio', 'tipo_dipendenza_servizio', 'Dependency_Type'
        ], 'Non specificata')),
        tipoRelazioneAssetFornitore: String(supplyFirst(record, [
            'tipoRelazioneAssetFornitore', 'tipo_relazione_asset_fornitore', 'Relationship_Type'
        ], '')),
        descrizioneDipendenzaServizio: String(supplyFirst(record, [
            'descrizioneDipendenzaServizio', 'descrizione_dipendenza_servizio'
        ], '')),
        descrizioneRelazioneAssetFornitore: String(supplyFirst(record, [
            'descrizioneRelazioneAssetFornitore', 'descrizione_relazione_asset_fornitore'
        ], '')),
        ereditataDaSottoservizio: inheritedService,
        ereditataDaSottoasset: inheritedAsset,
        ereditataDaSubfornitore: inheritedSupplier,
        derivata: derived,
        Service_Name: serviceRoot,
        Dependent_Asset: assetEffective || 'N/D',
        Vendor_Partner: supplierEffective,
        Vendor_Contact: String(supplyFirst(record, ['Vendor_Contact', 'contattoFornitore', 'contatto_fornitore'], 'N/D'))
    };
}

/**
 * Legge la Supply Chain multilivello, normalizza i nomi delle colonne tra le
 * diverse versioni delle viste e scarta i percorsi che referenziano entità
 * archiviate quando gli identificativi sono disponibili.
 */
export async function fetchSupplyChain() {
    const primary = await supabase
        .from('vista_supply_chain_multilivello')
        .select('*');

    let sourceRows;
    if (primary.error) {
        const fallback = await supabase
            .from('vista_reporting_servizi_critici')
            .select('*');
        if (fallback.error) throw fallback.error;
        sourceRows = fallback.data ?? [];
    } else {
        sourceRows = primary.data ?? [];
    }

    const normalizedRows = sourceRows.map(normalizeSupplyChainRecord);
    if (normalizedRows.length === 0) return [];

    const serviceIds = normalizedRows.flatMap((row) => [row.servizioRadiceId, row.servizioOrigineId]);
    const assetIds = normalizedRows.flatMap((row) => [row.assetOrigineId, row.assetEffettivoId]);
    const supplierIds = normalizedRows.flatMap((row) => [row.fornitoreOrigineId, row.fornitoreEffettivoId]);

    const [services, assets, suppliers] = await Promise.all([
        fetchRowsByIds('servizio', 'id, attiva', serviceIds),
        fetchRowsByIds('asset', 'id, attiva', assetIds),
        fetchRowsByIds('fornitore', 'id, attiva, contatto_email', supplierIds)
    ]);

    const serviceMap = new Map(services.map((record) => [Number(record.id), record]));
    const assetMap = new Map(assets.map((record) => [Number(record.id), record]));
    const supplierMap = new Map(suppliers.map((record) => [Number(record.id), record]));

    const entityIsVisible = (id, map) => {
        if (!id) return true;
        const record = map.get(Number(id));
        return Boolean(record) && record.attiva !== false;
    };

    return normalizedRows
        .filter((row) => (
            entityIsVisible(row.servizioRadiceId, serviceMap)
            && entityIsVisible(row.servizioOrigineId, serviceMap)
            && entityIsVisible(row.assetOrigineId, assetMap)
            && entityIsVisible(row.assetEffettivoId, assetMap)
            && entityIsVisible(row.fornitoreOrigineId, supplierMap)
            && entityIsVisible(row.fornitoreEffettivoId, supplierMap)
        ))
        .map((row) => {
            const supplier = supplierMap.get(Number(row.fornitoreEffettivoId));
            return {
                ...row,
                contattoFornitore: row.contattoFornitore || supplier?.contatto_email || '',
                Vendor_Contact: row.contattoFornitore || supplier?.contatto_email || 'N/D'
            };
        })
        .sort((left, right) => (
            left.servizioRadice.localeCompare(right.servizioRadice, 'it')
            || left.fornitoreEffettivo.localeCompare(right.fornitoreEffettivo, 'it')
            || left.assetEffettivo.localeCompare(right.assetEffettivo, 'it')
        ));
}

/**
 * Elenco sintetico degli incidenti realmente classificati, usato dalla
 * Dashboard come destinazione operativa invece del solo wizard.
 */
export async function fetchIncidentList(limit = 100) {
    const { data: classificazioni, error: classificazioniError } = await supabase
        .from('evento_tassonomia_acn')
        .select('evento_id, passo_wizard')
        .eq('attiva', true);

    if (classificazioniError) throw classificazioniError;

    const conteggi = new Map();
    (classificazioni ?? []).forEach((r) => {
        const id = Number(r.evento_id);
        if (!Number.isInteger(id)) return;
        conteggi.set(id, (conteggi.get(id) || 0) + 1);
    });
    const ids = [...conteggi.keys()];
    if (ids.length === 0) return [];

    const { data: eventi, error: eventiError } = await supabase
        .from('evento_servizio')
        .select('id, servizio_id, stato_servizio_id, inizio, fine, causa, severita, tipologia, attiva')
        .eq('attiva', true)
        .in('id', ids)
        .order('inizio', { ascending: false })
        .limit(limit);

    if (eventiError) throw eventiError;

    const servizi = await fetchRowsByIds(
        'servizio',
        'id, codice_servizio, nome, attiva',
        (eventi ?? []).map((r) => r.servizio_id)
    );
    const servizioMap = new Map(servizi.map((r) => [Number(r.id), r]));

    return (eventi ?? []).map((evento) => {
        const servizio = servizioMap.get(Number(evento.servizio_id));
        return {
            ...evento,
            servizioCodice: servizio?.codice_servizio || '',
            servizioNome: servizio?.nome || 'Non associato',
            classificazioni: conteggi.get(Number(evento.id)) || 0,
            stato: evento.fine ? 'Chiuso' : 'Aperto'
        };
    });
}

/**
 * Legge gli eventi di audit più recenti.
 */
export async function fetchAuditLogs(limit = 500) {
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
