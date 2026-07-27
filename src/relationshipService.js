// ===============================================================================================================
// FILE: src/relationshipService.js
// DESCRIZIONE: Lettura, validazione e gestione controllata delle relazioni multilivello della Supply Chain.
// ===============================================================================================================

import { supabase } from './supabase.js?build=20260726-d2';

export const RELATION_TYPES = Object.freeze({
    SERVICE_SERVICE: 'SERVICE_SERVICE',
    SERVICE_ASSET: 'SERVICE_ASSET',
    ASSET_ASSET: 'ASSET_ASSET',
    SERVICE_SUPPLIER: 'SERVICE_SUPPLIER',
    ASSET_SUPPLIER: 'ASSET_SUPPLIER',
    SUPPLIER_SUPPLIER: 'SUPPLIER_SUPPLIER'
});

const RELATION_CONFIG = Object.freeze({
    [RELATION_TYPES.SERVICE_SERVICE]: {
        table: 'servizio_componente',
        sourceField: 'servizio_padre_id',
        targetField: 'servizio_figlio_id',
        idField: 'id',
        sourceEntity: 'service',
        targetEntity: 'service',
        temporal: true
    },
    [RELATION_TYPES.SERVICE_ASSET]: {
        table: 'servizio_dipendenza_asset',
        sourceField: 'servizio_id',
        targetField: 'asset_id',
        idField: null,
        sourceEntity: 'service',
        targetEntity: 'asset',
        temporal: false
    },
    [RELATION_TYPES.ASSET_ASSET]: {
        table: 'asset_componente',
        sourceField: 'asset_padre_id',
        targetField: 'asset_figlio_id',
        idField: 'id',
        sourceEntity: 'asset',
        targetEntity: 'asset',
        temporal: true
    },
    [RELATION_TYPES.SERVICE_SUPPLIER]: {
        table: 'servizio_dipendenza_fornitore',
        sourceField: 'servizio_id',
        targetField: 'fornitore_id',
        idField: null,
        sourceEntity: 'service',
        targetEntity: 'supplier',
        temporal: false
    },
    [RELATION_TYPES.ASSET_SUPPLIER]: {
        table: 'asset_fornitore',
        sourceField: 'asset_id',
        targetField: 'fornitore_id',
        idField: 'id',
        sourceEntity: 'asset',
        targetEntity: 'supplier',
        temporal: true
    },
    [RELATION_TYPES.SUPPLIER_SUPPLIER]: {
        table: 'fornitore_relazione',
        sourceField: 'fornitore_padre_id',
        targetField: 'fornitore_figlio_id',
        idField: 'id',
        sourceEntity: 'supplier',
        targetEntity: 'supplier',
        temporal: true
    }
});

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

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function mapById(rows) {
    return new Map(asArray(rows).map((row) => [Number(row.id), row]));
}

function uniqueNumbers(values) {
    return [...new Set(asArray(values)
        .map(Number)
        .filter((value) => Number.isInteger(value) && value > 0))];
}

function labelOf(record, codeField, nameField = 'nome') {
    if (!record) return 'N/D';
    const code = String(record[codeField] ?? '').trim();
    const name = String(record[nameField] ?? '').trim() || 'N/D';
    return code ? `${code} · ${name}` : name;
}

async function executeQueries(queries) {
    const results = await Promise.all(queries);
    const error = results.find((result) => result.error)?.error;
    if (error) throw error;
    return results.map((result) => result.data ?? []);
}

/**
 * Carica in un'unica operazione il catalogo delle entità, i domini e le relazioni attive.
 */
export async function fetchRelationshipWorkspace() {
    const [
        organizations,
        services,
        assets,
        suppliers,
        serviceDependencyTypes,
        serviceHierarchyTypes,
        impactOutcomes,
        assetRelationshipTypes,
        assetSupplierTypes,
        supplierRelationshipTypes,
        serviceComponents,
        serviceAssets,
        assetComponents,
        serviceSuppliers,
        assetSuppliers,
        supplierRelations
    ] = await executeQueries([
        supabase.from('organizzazione').select('id,codice_organizzazione,nome,attiva').eq('attiva', true).order('nome'),
        supabase.from('servizio').select('id,codice_servizio,nome,descrizione,organizzazione_id,attiva').eq('attiva', true).order('nome'),
        supabase.from('asset').select('id,codice_asset,nome,descrizione,classificazione_criticita,organizzazione_id,attiva').eq('attiva', true).order('nome'),
        supabase.from('fornitore').select('id,codice_fornitore,nome,contatto_email,attiva').eq('attiva', true).order('nome'),
        supabase.from('tipo_dipendenza_servizio').select('id,codice,descrizione').order('codice'),
        supabase.from('tipo_dipendenza').select('id,codice,descrizione').order('codice'),
        supabase.from('esito_impatto').select('id,codice,descrizione').order('codice'),
        supabase.from('tipo_relazione_asset').select('id,codice,nome,descrizione').order('nome'),
        supabase.from('tipo_relazione_asset_fornitore').select('id,codice,nome,descrizione,attiva').eq('attiva', true).order('nome'),
        supabase.from('tipo_relazione_fornitore').select('id,codice,nome,descrizione,attiva').eq('attiva', true).order('nome'),
        supabase.from('servizio_componente').select('id,servizio_padre_id,servizio_figlio_id,tipo_dipendenza_id,esito_impatto_id,peso_percentuale,descrizione,relazione_primaria,ordine_componente,attiva,valido_dal,valido_al').eq('attiva', true),
        supabase.from('servizio_dipendenza_asset').select('servizio_id,asset_id,tipo_dipendenza_servizio_id,descrizione,attiva').eq('attiva', true),
        supabase.from('asset_componente').select('id,asset_padre_id,asset_figlio_id,tipo_relazione_asset_id,descrizione,relazione_primaria,ordine_componente,attiva,valido_dal,valido_al').eq('attiva', true),
        supabase.from('servizio_dipendenza_fornitore').select('servizio_id,fornitore_id,tipo_dipendenza_servizio_id,descrizione,attiva').eq('attiva', true),
        supabase.from('asset_fornitore').select('id,asset_id,fornitore_id,tipo_relazione_asset_fornitore_id,descrizione,riferimento_contratto,relazione_primaria,attiva,valido_dal,valido_al').eq('attiva', true),
        supabase.from('fornitore_relazione').select('id,fornitore_padre_id,fornitore_figlio_id,tipo_relazione_fornitore_id,descrizione,relazione_primaria,ordine_relazione,attiva,valido_dal,valido_al').eq('attiva', true)
    ]);

    const workspace = {
        organizations,
        services,
        assets,
        suppliers,
        domains: {
            serviceDependencyTypes,
            serviceHierarchyTypes,
            impactOutcomes,
            assetRelationshipTypes,
            assetSupplierTypes,
            supplierRelationshipTypes
        },
        relations: {
            serviceComponents,
            serviceAssets,
            assetComponents,
            serviceSuppliers,
            assetSuppliers,
            supplierRelations
        }
    };

    workspace.maps = {
        organizations: mapById(organizations),
        services: mapById(services),
        assets: mapById(assets),
        suppliers: mapById(suppliers),
        serviceDependencyTypes: mapById(serviceDependencyTypes),
        serviceHierarchyTypes: mapById(serviceHierarchyTypes),
        impactOutcomes: mapById(impactOutcomes),
        assetRelationshipTypes: mapById(assetRelationshipTypes),
        assetSupplierTypes: mapById(assetSupplierTypes),
        supplierRelationshipTypes: mapById(supplierRelationshipTypes)
    };

    return workspace;
}

function buildLookup(rows, key) {
    const map = new Map();
    asArray(rows).forEach((row) => {
        const id = Number(row[key]);
        if (!Number.isInteger(id) || id <= 0) return;
        if (!map.has(id)) map.set(id, []);
        map.get(id).push(row);
    });
    return map;
}

function collectAssetDescendants(assetId, assetChildrenMap, visited = new Set()) {
    const id = Number(assetId);
    if (!Number.isInteger(id) || visited.has(id)) return [];
    visited.add(id);
    const direct = asArray(assetChildrenMap.get(id));
    const descendants = [];
    direct.forEach((relation) => {
        const childId = Number(relation.asset_figlio_id);
        if (!Number.isInteger(childId) || visited.has(childId)) return;
        descendants.push(childId, ...collectAssetDescendants(childId, assetChildrenMap, visited));
    });
    return uniqueNumbers(descendants);
}

/**
 * Calcola la copertura operativa senza trasformare l'assenza di una relazione in errore.
 * Le segnalazioni sono inviti alla verifica dell'utente, non vincoli automatici.
 */
export function computeRelationshipCoverage(workspace) {
    const services = asArray(workspace?.services);
    const relations = workspace?.relations ?? {};
    const serviceChildren = buildLookup(relations.serviceComponents, 'servizio_padre_id');
    const serviceParents = buildLookup(relations.serviceComponents, 'servizio_figlio_id');
    const serviceAssets = buildLookup(relations.serviceAssets, 'servizio_id');
    const serviceSuppliers = buildLookup(relations.serviceSuppliers, 'servizio_id');
    const assetChildren = buildLookup(relations.assetComponents, 'asset_padre_id');
    const assetSuppliers = buildLookup(relations.assetSuppliers, 'asset_id');

    const rows = services.map((service) => {
        const serviceId = Number(service.id);
        const directAssets = asArray(serviceAssets.get(serviceId));
        const directAssetIds = uniqueNumbers(directAssets.map((row) => row.asset_id));
        const allAssetIds = uniqueNumbers(directAssetIds.flatMap((assetId) => [
            assetId,
            ...collectAssetDescendants(assetId, assetChildren)
        ]));
        const supplierIdsViaAssets = uniqueNumbers(allAssetIds.flatMap((assetId) => (
            asArray(assetSuppliers.get(assetId)).map((row) => row.fornitore_id)
        )));
        const directSupplierIds = uniqueNumbers(asArray(serviceSuppliers.get(serviceId)).map((row) => row.fornitore_id));
        const suppliers = uniqueNumbers([...directSupplierIds, ...supplierIdsViaAssets]);
        const incoming = asArray(serviceParents.get(serviceId));
        const outgoing = asArray(serviceChildren.get(serviceId));
        const relationshipCount = incoming.length + outgoing.length + directAssets.length + directSupplierIds.length;
        const disconnected = relationshipCount === 0;
        const hasAssets = allAssetIds.length > 0;
        const hasSuppliers = suppliers.length > 0;
        const hasHierarchy = incoming.length > 0 || outgoing.length > 0;
        const needsReview = disconnected || !hasAssets || !hasSuppliers;

        const issues = [];
        if (disconnected) issues.push('Nessuna relazione attiva');
        if (!hasAssets) issues.push('Nessun asset collegato');
        if (!hasSuppliers) issues.push('Nessun fornitore diretto o tramite asset');
        if (!hasHierarchy) issues.push('Nessuna posizione gerarchica');

        return {
            service,
            disconnected,
            hasAssets,
            hasSuppliers,
            hasHierarchy,
            needsReview,
            issues,
            directAssetCount: directAssetIds.length,
            totalAssetCount: allAssetIds.length,
            directSupplierCount: directSupplierIds.length,
            totalSupplierCount: suppliers.length,
            parentCount: incoming.length,
            childCount: outgoing.length
        };
    });

    return {
        rows,
        summary: {
            activeServices: rows.length,
            mappedServices: rows.filter((row) => !row.disconnected).length,
            disconnectedServices: rows.filter((row) => row.disconnected).length,
            servicesToReview: rows.filter((row) => row.needsReview).length,
            servicesWithAssets: rows.filter((row) => row.hasAssets).length,
            servicesWithSuppliers: rows.filter((row) => row.hasSuppliers).length
        }
    };
}

export async function fetchRelationshipCoverage() {
    const workspace = await fetchRelationshipWorkspace();
    return {
        workspace,
        coverage: computeRelationshipCoverage(workspace)
    };
}

function incrementCounter(map, id) {
    const key = Number(id);
    if (!Number.isInteger(key)) return;
    map.set(key, (map.get(key) || 0) + 1);
}

function buildUsageCounters(workspace) {
    const assetUsage = new Map();
    const supplierUsage = new Map();
    const serviceUsage = new Map();
    const relations = workspace.relations;

    relations.serviceComponents.forEach((row) => incrementCounter(serviceUsage, row.servizio_figlio_id));
    relations.serviceAssets.forEach((row) => incrementCounter(assetUsage, row.asset_id));
    relations.assetComponents.forEach((row) => incrementCounter(assetUsage, row.asset_figlio_id));
    relations.serviceSuppliers.forEach((row) => incrementCounter(supplierUsage, row.fornitore_id));
    relations.assetSuppliers.forEach((row) => incrementCounter(supplierUsage, row.fornitore_id));
    relations.supplierRelations.forEach((row) => incrementCounter(supplierUsage, row.fornitore_figlio_id));

    return { assetUsage, supplierUsage, serviceUsage };
}

function relationMeta(workspace, kind, relation) {
    if (kind === 'service') {
        const type = workspace.maps.serviceHierarchyTypes.get(Number(relation.tipo_dipendenza_id));
        const impact = workspace.maps.impactOutcomes.get(Number(relation.esito_impatto_id));
        return {
            type: type?.codice || type?.descrizione || 'Gerarchia',
            impact: impact?.codice || impact?.descrizione || 'Non specificato',
            weight: Number.isFinite(Number(relation.peso_percentuale)) ? Number(relation.peso_percentuale) : null,
            primary: Boolean(relation.relazione_primaria)
        };
    }
    if (kind === 'asset') {
        const type = workspace.maps.assetRelationshipTypes.get(Number(relation.tipo_relazione_asset_id));
        return { type: type?.nome || type?.codice || 'Componente', impact: null, weight: null, primary: Boolean(relation.relazione_primaria) };
    }
    if (kind === 'supplier') {
        const type = workspace.maps.supplierRelationshipTypes.get(Number(relation.tipo_relazione_fornitore_id));
        return { type: type?.nome || type?.codice || 'Subfornitura', impact: null, weight: null, primary: Boolean(relation.relazione_primaria) };
    }
    return { type: '', impact: null, weight: null, primary: false };
}

/**
 * Costruisce un albero navigabile a partire da un servizio radice, mantenendo
 * i collegamenti condivisi come riferimenti ripetuti ma marcati.
 */
export function buildServiceDependencyTree(workspace, rootServiceId) {
    const rootId = positiveInteger(rootServiceId, 'Servizio radice');
    const rootService = workspace.maps.services.get(rootId);
    if (!rootService) throw new Error('Servizio radice non trovato.');

    const relations = workspace.relations;
    const usage = buildUsageCounters(workspace);
    const serviceChildren = buildLookup(relations.serviceComponents, 'servizio_padre_id');
    const serviceAssets = buildLookup(relations.serviceAssets, 'servizio_id');
    const serviceSuppliers = buildLookup(relations.serviceSuppliers, 'servizio_id');
    const assetChildren = buildLookup(relations.assetComponents, 'asset_padre_id');
    const assetSuppliers = buildLookup(relations.assetSuppliers, 'asset_id');
    const supplierChildren = buildLookup(relations.supplierRelations, 'fornitore_padre_id');

    const buildSupplier = (supplierId, path, relation = null, visiting = new Set()) => {
        const id = Number(supplierId);
        const record = workspace.maps.suppliers.get(id);
        if (!record) return null;
        if (visiting.has(id)) {
            return {
                kind: 'supplier', id, code: record.codice_fornitore, label: record.nome,
                shared: true, cycle: true, path, relation: relationMeta(workspace, 'supplier', relation || {}) , children: []
            };
        }
        const nextVisiting = new Set(visiting);
        nextVisiting.add(id);
        const children = asArray(supplierChildren.get(id))
            .sort((a, b) => Number(a.ordine_relazione || 1) - Number(b.ordine_relazione || 1))
            .map((row) => buildSupplier(row.fornitore_figlio_id, [...path, record.nome], row, nextVisiting))
            .filter(Boolean);
        return {
            kind: 'supplier',
            id,
            code: record.codice_fornitore,
            label: record.nome,
            shared: (usage.supplierUsage.get(id) || 0) > 1,
            cycle: false,
            path,
            relation: relation ? relationMeta(workspace, 'supplier', relation) : null,
            children
        };
    };

    const buildAsset = (assetId, path, relation = null, visiting = new Set()) => {
        const id = Number(assetId);
        const record = workspace.maps.assets.get(id);
        if (!record) return null;
        if (visiting.has(id)) {
            return {
                kind: 'asset', id, code: record.codice_asset, label: record.nome,
                shared: true, cycle: true, path, relation: relationMeta(workspace, 'asset', relation || {}), children: []
            };
        }
        const nextVisiting = new Set(visiting);
        nextVisiting.add(id);
        const supplierNodes = asArray(assetSuppliers.get(id)).map((row) => {
            const supplier = buildSupplier(row.fornitore_id, [...path, record.nome], null, new Set());
            if (supplier) {
                const type = workspace.maps.assetSupplierTypes.get(Number(row.tipo_relazione_asset_fornitore_id));
                supplier.relation = {
                    type: type?.nome || type?.codice || 'Fornitore asset',
                    impact: null,
                    weight: null,
                    primary: Boolean(row.relazione_primaria)
                };
            }
            return supplier;
        }).filter(Boolean);
        const childAssets = asArray(assetChildren.get(id))
            .sort((a, b) => Number(a.ordine_componente || 1) - Number(b.ordine_componente || 1))
            .map((row) => buildAsset(row.asset_figlio_id, [...path, record.nome], row, nextVisiting))
            .filter(Boolean);
        return {
            kind: 'asset',
            id,
            code: record.codice_asset,
            label: record.nome,
            criticality: record.classificazione_criticita || '',
            shared: (usage.assetUsage.get(id) || 0) > 1,
            cycle: false,
            path,
            relation: relation ? relationMeta(workspace, 'asset', relation) : null,
            children: [...childAssets, ...supplierNodes]
        };
    };

    const buildService = (serviceId, path, relation = null, visiting = new Set()) => {
        const id = Number(serviceId);
        const record = workspace.maps.services.get(id);
        if (!record) return null;
        if (visiting.has(id)) {
            return {
                kind: 'service', id, code: record.codice_servizio, label: record.nome,
                shared: true, cycle: true, path, relation: relationMeta(workspace, 'service', relation || {}), children: []
            };
        }
        const nextVisiting = new Set(visiting);
        nextVisiting.add(id);
        const directAssetNodes = asArray(serviceAssets.get(id)).map((row) => {
            const node = buildAsset(row.asset_id, [...path, record.nome], null, new Set());
            if (node) {
                const type = workspace.maps.serviceDependencyTypes.get(Number(row.tipo_dipendenza_servizio_id));
                node.relation = {
                    type: type?.codice || type?.descrizione || 'Dipendenza tecnica',
                    impact: null,
                    weight: null,
                    primary: false
                };
            }
            return node;
        }).filter(Boolean);
        const directSupplierNodes = asArray(serviceSuppliers.get(id)).map((row) => {
            const node = buildSupplier(row.fornitore_id, [...path, record.nome], null, new Set());
            if (node) {
                const type = workspace.maps.serviceDependencyTypes.get(Number(row.tipo_dipendenza_servizio_id));
                node.relation = {
                    type: type?.codice || type?.descrizione || 'Fornitore servizio',
                    impact: null,
                    weight: null,
                    primary: false
                };
            }
            return node;
        }).filter(Boolean);
        const childServiceNodes = asArray(serviceChildren.get(id))
            .sort((a, b) => Number(a.ordine_componente || 1) - Number(b.ordine_componente || 1))
            .map((row) => buildService(row.servizio_figlio_id, [...path, record.nome], row, nextVisiting))
            .filter(Boolean);
        return {
            kind: 'service',
            id,
            code: record.codice_servizio,
            label: record.nome,
            shared: (usage.serviceUsage.get(id) || 0) > 1,
            cycle: false,
            path,
            relation: relation ? relationMeta(workspace, 'service', relation) : null,
            children: [...directAssetNodes, ...directSupplierNodes, ...childServiceNodes]
        };
    };

    return buildService(rootId, [], null, new Set());
}

export function getRootServices(workspace, organizationId = null) {
    const parented = new Set(asArray(workspace?.relations?.serviceComponents).map((row) => Number(row.servizio_figlio_id)));
    const orgId = organizationId ? Number(organizationId) : null;
    const services = asArray(workspace?.services).filter((service) => !orgId || Number(service.organizzazione_id) === orgId);
    const roots = services.filter((service) => !parented.has(Number(service.id)));
    return (roots.length > 0 ? roots : services).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'it'));
}

function getEntity(workspace, entityType, id) {
    const numericId = positiveInteger(id, 'Elemento');
    if (entityType === 'service') return workspace.maps.services.get(numericId);
    if (entityType === 'asset') return workspace.maps.assets.get(numericId);
    if (entityType === 'supplier') return workspace.maps.suppliers.get(numericId);
    return null;
}

function assertSameOrganization(source, target) {
    if (!source || !target) throw new Error('Gli elementi selezionati non sono disponibili.');
    if (Number(source.organizzazione_id) !== Number(target.organizzazione_id)) {
        throw new Error('Servizi e asset collegati devono appartenere allo stesso soggetto NIS2.');
    }
}

function graphContainsPath(edges, startId, targetId, sourceField, targetField) {
    const adjacency = new Map();
    edges.forEach((edge) => {
        const source = Number(edge[sourceField]);
        const target = Number(edge[targetField]);
        if (!adjacency.has(source)) adjacency.set(source, []);
        adjacency.get(source).push(target);
    });
    const stack = [Number(startId)];
    const visited = new Set();
    while (stack.length > 0) {
        const current = stack.pop();
        if (current === Number(targetId)) return true;
        if (visited.has(current)) continue;
        visited.add(current);
        asArray(adjacency.get(current)).forEach((next) => stack.push(next));
    }
    return false;
}

async function assertNoDuplicate(config, sourceId, targetId) {
    const { count, error } = await supabase
        .from(config.table)
        .select(config.idField || config.sourceField, { count: 'exact', head: true })
        .eq(config.sourceField, sourceId)
        .eq(config.targetField, targetId)
        .eq('attiva', true);
    if (error) throw error;
    if ((count || 0) > 0) throw new Error('La relazione selezionata è già attiva.');
}

async function assertNoCycle(type, sourceId, targetId) {
    const config = RELATION_CONFIG[type];
    if (![RELATION_TYPES.SERVICE_SERVICE, RELATION_TYPES.ASSET_ASSET, RELATION_TYPES.SUPPLIER_SUPPLIER].includes(type)) return;
    const { data, error } = await supabase
        .from(config.table)
        .select(`${config.sourceField},${config.targetField}`)
        .eq('attiva', true);
    if (error) throw error;
    if (graphContainsPath(data ?? [], targetId, sourceId, config.sourceField, config.targetField)) {
        throw new Error('La relazione genererebbe un ciclo gerarchico e non può essere salvata.');
    }
}

function normalizeCommonPayload(payload = {}) {
    return {
        sourceId: positiveInteger(payload.sourceId, 'Elemento principale'),
        targetId: positiveInteger(payload.targetId, 'Elemento collegato'),
        description: nullableText(payload.description),
        primary: Boolean(payload.primary),
        order: Number.isInteger(Number(payload.order)) && Number(payload.order) > 0 ? Number(payload.order) : 1
    };
}

export async function createRelationship(type, payload, workspace = null) {
    const config = RELATION_CONFIG[type];
    if (!config) throw new Error('Tipo di relazione non supportato.');
    const common = normalizeCommonPayload(payload);
    if (common.sourceId === common.targetId && config.sourceEntity === config.targetEntity) {
        throw new Error('Un elemento non può essere collegato a sé stesso.');
    }

    const currentWorkspace = workspace || await fetchRelationshipWorkspace();
    const source = getEntity(currentWorkspace, config.sourceEntity, common.sourceId);
    const target = getEntity(currentWorkspace, config.targetEntity, common.targetId);
    if (!source || !target) throw new Error('Uno degli elementi selezionati non è più disponibile.');
    if (source.attiva === false || target.attiva === false) throw new Error('Non è possibile collegare record cessati o archiviati.');
    if ([RELATION_TYPES.SERVICE_SERVICE, RELATION_TYPES.SERVICE_ASSET, RELATION_TYPES.ASSET_ASSET].includes(type)) {
        assertSameOrganization(source, target);
    }

    await assertNoDuplicate(config, common.sourceId, common.targetId);
    await assertNoCycle(type, common.sourceId, common.targetId);

    let record;
    if (type === RELATION_TYPES.SERVICE_SERVICE) {
        record = {
            servizio_padre_id: common.sourceId,
            servizio_figlio_id: common.targetId,
            tipo_dipendenza_id: positiveInteger(payload.relationshipTypeId, 'Tipo di dipendenza'),
            esito_impatto_id: positiveInteger(payload.impactOutcomeId, 'Esito di impatto'),
            peso_percentuale: Math.min(100, Math.max(0, Number(payload.weight ?? 0))),
            descrizione: common.description,
            relazione_primaria: common.primary,
            ordine_componente: common.order,
            attiva: true
        };
    } else if (type === RELATION_TYPES.SERVICE_ASSET) {
        record = {
            servizio_id: common.sourceId,
            asset_id: common.targetId,
            tipo_dipendenza_servizio_id: positiveInteger(payload.relationshipTypeId, 'Tipo di dipendenza'),
            descrizione: common.description,
            attiva: true
        };
    } else if (type === RELATION_TYPES.ASSET_ASSET) {
        record = {
            asset_padre_id: common.sourceId,
            asset_figlio_id: common.targetId,
            tipo_relazione_asset_id: positiveInteger(payload.relationshipTypeId, 'Tipo di relazione'),
            descrizione: common.description,
            relazione_primaria: common.primary,
            ordine_componente: common.order,
            attiva: true
        };
    } else if (type === RELATION_TYPES.SERVICE_SUPPLIER) {
        record = {
            servizio_id: common.sourceId,
            fornitore_id: common.targetId,
            tipo_dipendenza_servizio_id: positiveInteger(payload.relationshipTypeId, 'Tipo di dipendenza'),
            descrizione: common.description,
            attiva: true
        };
    } else if (type === RELATION_TYPES.ASSET_SUPPLIER) {
        record = {
            asset_id: common.sourceId,
            fornitore_id: common.targetId,
            tipo_relazione_asset_fornitore_id: positiveInteger(payload.relationshipTypeId, 'Tipo di relazione'),
            descrizione: common.description,
            riferimento_contratto: nullableText(payload.contractReference),
            relazione_primaria: common.primary,
            valido_dal: new Date().toISOString().slice(0, 10),
            attiva: true
        };
    } else {
        record = {
            fornitore_padre_id: common.sourceId,
            fornitore_figlio_id: common.targetId,
            tipo_relazione_fornitore_id: positiveInteger(payload.relationshipTypeId, 'Tipo di relazione'),
            descrizione: common.description,
            relazione_primaria: common.primary,
            ordine_relazione: common.order,
            attiva: true
        };
    }

    const { data, error } = await supabase
        .from(config.table)
        .insert(record)
        .select('*')
        .single();
    if (error) throw error;
    return { type, table: config.table, record: data, source, target };
}

export async function closeRelationship(type, relation, reason) {
    const config = RELATION_CONFIG[type];
    if (!config) throw new Error('Tipo di relazione non supportato.');
    const normalizedReason = String(reason ?? '').trim();
    if (normalizedReason.length < 5) throw new Error('Indica una motivazione di almeno 5 caratteri.');

    let query = supabase.from(config.table).update(config.temporal
        ? {
            attiva: false,
            valido_al: [RELATION_TYPES.ASSET_SUPPLIER, RELATION_TYPES.SUPPLIER_SUPPLIER].includes(type)
                ? new Date().toISOString().slice(0, 10)
                : new Date().toISOString(),
            motivo_chiusura: normalizedReason
        }
        : {
            attiva: false,
            motivo_archiviazione: normalizedReason
        });

    if (config.idField) {
        query = query.eq(config.idField, positiveInteger(relation?.[config.idField] ?? relation?.id, 'Relazione'));
    } else {
        query = query
            .eq(config.sourceField, positiveInteger(relation?.[config.sourceField], 'Elemento principale'))
            .eq(config.targetField, positiveInteger(relation?.[config.targetField], 'Elemento collegato'));
    }

    const { data, error } = await query.eq('attiva', true).select('*').maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('La relazione non è stata cessata oppure non è più attiva.');
    return { type, table: config.table, record: data };
}

export function relationshipTypeLabel(type) {
    const labels = {
        [RELATION_TYPES.SERVICE_SERVICE]: 'Servizio → Sottoservizio',
        [RELATION_TYPES.SERVICE_ASSET]: 'Servizio → Asset',
        [RELATION_TYPES.ASSET_ASSET]: 'Asset → Sotto-asset',
        [RELATION_TYPES.SERVICE_SUPPLIER]: 'Servizio → Fornitore',
        [RELATION_TYPES.ASSET_SUPPLIER]: 'Asset → Fornitore',
        [RELATION_TYPES.SUPPLIER_SUPPLIER]: 'Fornitore → Subfornitore'
    };
    return labels[type] || type;
}

export function entityLabel(workspace, entityType, id) {
    if (entityType === 'service') return labelOf(workspace.maps.services.get(Number(id)), 'codice_servizio');
    if (entityType === 'asset') return labelOf(workspace.maps.assets.get(Number(id)), 'codice_asset');
    if (entityType === 'supplier') return labelOf(workspace.maps.suppliers.get(Number(id)), 'codice_fornitore');
    return 'N/D';
}

export function relationConfig(type) {
    return RELATION_CONFIG[type] ?? null;
}

const AUDIT_RETRY_DELAYS = [0, 180, 360, 650, 900];

function wait(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export function startRelationshipAuditWindow() {
    return new Date(Date.now() - 2500).toISOString().slice(0, 19);
}

/**
 * Verifica l'evento generato dal trigger anche per le tabelle con chiave composta.
 */
export async function verifyRelationshipAudit({
    type,
    operation,
    record,
    startedAt = startRelationshipAuditWindow()
}) {
    const config = RELATION_CONFIG[type];
    if (!config || !record) return { verified: false, available: false, row: null };

    let lastError = null;
    for (const delay of AUDIT_RETRY_DELAYS) {
        if (delay > 0) await wait(delay);
        try {
            const { data, error } = await supabase
                .from('audit_log')
                .select('id,record_id,operazione,tabella,data_modifica,valore_precedente_jsonb,valore_nuovo_jsonb')
                .eq('tabella', config.table)
                .eq('operazione', operation)
                .gte('data_modifica', startedAt)
                .order('data_modifica', { ascending: false })
                .limit(30);
            if (error) throw error;

            const matching = (data ?? []).find((row) => {
                const payload = operation === 'INSERT'
                    ? (row.valore_nuovo_jsonb ?? {})
                    : (row.valore_nuovo_jsonb ?? row.valore_precedente_jsonb ?? {});
                if (config.idField && record[config.idField] !== undefined) {
                    return Number(payload?.[config.idField] ?? row.record_id) === Number(record[config.idField]);
                }
                return Number(payload?.[config.sourceField]) === Number(record[config.sourceField])
                    && Number(payload?.[config.targetField]) === Number(record[config.targetField]);
            });

            if (matching) return { verified: true, available: true, row: matching };
        } catch (error) {
            lastError = error;
            break;
        }
    }

    return { verified: false, available: lastError === null, row: null, error: lastError };
}
