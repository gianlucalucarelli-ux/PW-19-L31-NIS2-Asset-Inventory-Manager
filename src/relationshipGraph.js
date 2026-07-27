// ===============================================================================================================
// FILE: src/relationshipGraph.js
// DESCRIZIONE: Rendering accessibile dell'albero-grafo multilivello di servizi, asset e fornitori.
// ===============================================================================================================

function kindLabel(kind) {
    if (kind === 'service') return 'Servizio';
    if (kind === 'asset') return 'Asset';
    if (kind === 'supplier') return 'Fornitore';
    return 'Nodo';
}

function kindIcon(kind) {
    if (kind === 'service') return '🧩';
    if (kind === 'asset') return '📦';
    if (kind === 'supplier') return '🏢';
    return '•';
}

function relationSummary(relation) {
    if (!relation) return '';
    const parts = [];
    if (relation.type) parts.push(relation.type);
    if (relation.impact) parts.push(`Impatto: ${relation.impact}`);
    const numericWeight = Number(relation.weight);
    if (relation.weight !== null && relation.weight !== undefined && String(relation.weight).trim() !== '' && numericWeight > 0) {
        parts.push(`Peso: ${numericWeight}%`);
    } else {
        parts.push('Peso: non configurato');
    }
    if (relation.primary) parts.push('Primaria');
    return parts.join(' · ');
}

export function flattenDependencyTree(tree) {
    const rows = [];
    const visit = (node, depth = 0) => {
        if (!node) return;
        rows.push({ node, depth });
        (node.children ?? []).forEach((child) => visit(child, depth + 1));
    };
    visit(tree);
    return rows;
}

function createBadge(text, className = '') {
    const badge = document.createElement('span');
    badge.className = `dependency-node__badge ${className}`.trim();
    badge.textContent = text;
    return badge;
}

function createNodeCard(node, onSelect) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `dependency-node dependency-node--${node.kind}`;
    card.dataset.nodeKind = node.kind;
    card.dataset.nodeId = String(node.id);
    card.setAttribute('aria-label', `${kindLabel(node.kind)} ${node.code || ''} ${node.label}`.trim());

    const icon = document.createElement('span');
    icon.className = 'dependency-node__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = kindIcon(node.kind);

    const content = document.createElement('span');
    content.className = 'dependency-node__content';

    const heading = document.createElement('span');
    heading.className = 'dependency-node__heading';

    const code = document.createElement('strong');
    code.textContent = node.code || kindLabel(node.kind);

    const name = document.createElement('span');
    name.textContent = node.label || 'N/D';
    heading.append(code, name);

    const meta = document.createElement('span');
    meta.className = 'dependency-node__meta';
    meta.textContent = relationSummary(node.relation) || kindLabel(node.kind);

    const badges = document.createElement('span');
    badges.className = 'dependency-node__badges';
    if (node.shared) badges.appendChild(createBadge('Condiviso', 'dependency-node__badge--shared'));
    if (node.cycle) badges.appendChild(createBadge('Ciclo rilevato', 'dependency-node__badge--warning'));
    if (node.criticality) badges.appendChild(createBadge(node.criticality));

    content.append(heading, meta);
    if (badges.childElementCount > 0) content.appendChild(badges);
    card.append(icon, content);
    card.addEventListener('click', () => onSelect?.(node, card));
    return card;
}

function createBranch(node, options, depth = 0) {
    const { onSelect, expandedDepth, showKinds } = options;
    const children = (node.children ?? []).filter((child) => showKinds.has(child.kind));

    const item = document.createElement('li');
    item.className = `dependency-branch dependency-branch--${node.kind}`;

    const row = document.createElement('div');
    row.className = 'dependency-branch__row';

    if (children.length > 0) {
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'dependency-branch__toggle';
        toggle.setAttribute('aria-label', `Espandi o comprimi ${node.label}`);
        const expanded = depth < expandedDepth;
        toggle.setAttribute('aria-expanded', String(expanded));
        toggle.textContent = expanded ? '−' : '+';
        row.appendChild(toggle);

        const childList = document.createElement('ul');
        childList.className = 'dependency-tree dependency-tree--nested';
        childList.hidden = !expanded;
        children.forEach((child) => childList.appendChild(createBranch(child, options, depth + 1)));
        toggle.addEventListener('click', () => {
            const next = toggle.getAttribute('aria-expanded') !== 'true';
            toggle.setAttribute('aria-expanded', String(next));
            toggle.textContent = next ? '−' : '+';
            childList.hidden = !next;
        });
        row.appendChild(createNodeCard(node, onSelect));
        item.append(row, childList);
        return item;
    }

    const spacer = document.createElement('span');
    spacer.className = 'dependency-branch__toggle-spacer';
    spacer.setAttribute('aria-hidden', 'true');
    row.append(spacer, createNodeCard(node, onSelect));
    item.appendChild(row);
    return item;
}

/**
 * Disegna un albero espandibile. Asset e fornitori condivisi sono ripetuti nel
 * percorso corretto e marcati con un badge, evitando di nascondere i legami trasversali.
 */
export function renderDependencyTree(container, tree, options = {}) {
    if (!container) return { nodes: 0, shared: 0 };
    container.replaceChildren();

    if (!tree) {
        const empty = document.createElement('p');
        empty.className = 'dashboard-empty';
        empty.textContent = options.emptyMessage || 'Nessuna struttura disponibile per il servizio selezionato.';
        container.appendChild(empty);
        return { nodes: 0, shared: 0 };
    }

    const showKinds = new Set(options.showKinds || ['service', 'asset', 'supplier']);
    showKinds.add('service');
    const rows = flattenDependencyTree(tree).filter(({ node }) => showKinds.has(node.kind));

    const treeList = document.createElement('ul');
    treeList.className = 'dependency-tree dependency-tree--root';
    treeList.appendChild(createBranch(tree, {
        onSelect: options.onSelect,
        expandedDepth: Number.isInteger(options.expandedDepth) ? options.expandedDepth : 2,
        showKinds
    }));
    container.appendChild(treeList);

    return {
        nodes: rows.length,
        shared: rows.filter(({ node }) => node.shared).length
    };
}

export function renderImpactPath(container, node) {
    if (!container) return;
    container.replaceChildren();

    if (!node) {
        const message = document.createElement('p');
        message.className = 'dashboard-note';
        message.textContent = 'Seleziona un nodo della mappa per visualizzare il percorso potenziale verso il servizio principale.';
        container.appendChild(message);
        return;
    }

    const heading = document.createElement('div');
    heading.className = 'impact-path__heading';
    const title = document.createElement('strong');
    title.textContent = `${node.code || kindLabel(node.kind)} · ${node.label}`;
    const subtitle = document.createElement('span');
    subtitle.textContent = node.relation?.impact
        ? `Impatto dichiarato sul livello superiore: ${node.relation.impact}`
        : 'Impatto da valutare in base alle relazioni configurate.';
    heading.append(title, subtitle);

    const path = document.createElement('ol');
    path.className = 'impact-path';
    [...(node.path ?? []), node.label].forEach((label, index, values) => {
        const item = document.createElement('li');
        const marker = document.createElement('span');
        marker.className = 'impact-path__marker';
        marker.textContent = index === values.length - 1 ? '●' : '↑';
        const text = document.createElement('span');
        text.textContent = label;
        item.append(marker, text);
        path.prepend(item);
    });

    container.append(heading, path);
}
