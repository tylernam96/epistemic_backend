import { createGraph, reflowGraph, assignVersionZ, randomOnSphere, zFromAbstractionLevel, drawSuggestionVectors, clearSuggestionVectors } from './graph-component.js';
import { UI } from './ui-components.js';

const state = {
    selectedNode: null,
    isLinkMode: false,
    linkSource: null,
    graphData: null,
    dirtyNodes: {}  // nodes moved by drag, pending save: { id: {x,y,z} }
};

// Initialize Graph
const Graph = createGraph(
    '3d-graph',
    async (node) => handleNodeClick(node),
    (link) => handleLinkClick(link),
    (node) => handleNodeDrag(node)
);
window.__graph = Graph; // debug access

// -------------------------
// Fly To Node
// -------------------------
function flyToNode(node, duration = 2000) {
    const distance = 60;
    const distRatio = 1 + distance / Math.hypot(node.x || 1, node.y || 1, node.z || 1);
    Graph.cameraPosition(
        { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio },
        node,
        duration
    );
}

// -------------------------
// Node Drag — with Epistemic Log
// -------------------------
function handleNodeDrag(node) {
    // Pin the node at its dropped position so it doesn't drift further.
    // The simulation is still alive — unpinned nodes continue to settle
    // around this newly fixed point. User can unpin everything via Reflow.
    Graph.pinNode(node.id);

    state.dirtyNodes[node.id] = { x: node.x, y: node.y, z: node.z };

    const btn = document.getElementById('btn-save-positions');
    if (btn) {
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
        btn.textContent = `💾 Save Positions (${Object.keys(state.dirtyNodes).length})`;
    }

    // Clear any suggestion vectors when node is manually repositioned
    clearSuggestionVectors(Graph.scene());

    // Epistemic log prompt
    UI.renderEpistemicLogPrompt(node, async (note) => {
        if (!note) return;
        await fetch(`/api/nodes/${node.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ placement_note: note }),
        });
    });
}

// -------------------------
// Node Click
// -------------------------
async function handleNodeClick(node) {
    const fullNode = (state.graphData?.nodes || []).find(n =>
        n.id === node.id || n.node_id === node.node_id || n.node_id === node.code
    ) || node;

    // --- LINK MODE: two-click selection ---
    if (state.isLinkMode) {
        if (!state.linkSource) {
            state.linkSource = fullNode;
            UI.setLinkModeStatus(`SOURCE: "${fullNode.content || fullNode.name}" — now click target node`);
            flyToNode(fullNode);
        } else {
            const source = state.linkSource;
            state.linkSource = null;
            state.isLinkMode = false;
            UI.setLinkModeStatus(null);
            document.getElementById('link-mode-indicator').style.display = 'none';
            document.getElementById('btn-link-mode').classList.remove('active');
            UI.renderRelationModal(source, fullNode, async (payload) => {
                await fetch('/api/links', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                refreshGraph();
            });
        }
        return;
    }

    state.selectedNode = fullNode;
    flyToNode(fullNode);

    const fetchId = fullNode.id || fullNode.node_id || fullNode.code;
    const response = await fetch(`/graph/node/${fetchId}/neighbors`);
    const neighbors = await response.json();

    UI.renderNodeInspector(fullNode, neighbors, (neighborStub) => {
        const fullNeighbor = (state.graphData?.nodes || []).find(n =>
            n.node_id === neighborStub.code
        ) || neighborStub;
        handleNodeClick(fullNeighbor);
    });
}

function handleLinkClick(link) {
    // Enrich with source/target node names from graphData
    const nodes = state.graphData?.nodes || [];
    const sourceNode = nodes.find(n => n.id === (link.source?.id ?? link.source));
    const targetNode = nodes.find(n => n.id === (link.target?.id ?? link.target));
    UI.renderRelationInspector(link, sourceNode, targetNode, async (relId) => {
        await fetch(`/api/links/${relId}`, { method: 'DELETE' });
        document.getElementById('relation-inspector')?.remove();
        refreshGraph();
        const flash = document.createElement('div');
        flash.className = 'success-flash';
        flash.textContent = 'Relation deleted';
        flash.style.background = 'rgba(255,90,90,0.12)';
        flash.style.borderColor = '#ff5a5a';
        flash.style.color = '#ff5a5a';
        document.body.appendChild(flash);
        setTimeout(() => flash.remove(), 2500);
    });
}

// -------------------------
// Refresh Graph Data
// -------------------------
async function refreshGraph() {
    const res = await fetch('/graph/3d-json');
    const data = await res.json();

    // Assign Z for HAS_VERSION chains first
    assignVersionZ(data.nodes, data.links);

    data.nodes.forEach(node => {
        // Z rule (priority order):
        //   1. HAS_VERSION chain depth  (set by assignVersionZ as node.version_z)
        //   2. Abstraction level        (L1=-120 … L5=+120, step 60)
        //   3. Zero                     (fallback)
        // Saved DB z values are intentionally ignored — abstraction level is the source of truth.
        const lvl = node.abstraction_level != null ? parseInt(node.abstraction_level) : null;
        node.z = zFromAbstractionLevel(lvl) ?? node.version_z ?? 0;


        if (node.x != null && node.y != null) {
            node.fx = node.x;
            node.fy = node.y;
        } else {
            const angle = Math.random() * 2 * Math.PI;
            const r     = 80 + Math.random() * 120;
            node.x  = r * Math.cos(angle);
            node.y  = r * Math.sin(angle);
            node.fx = node.x;
            node.fy = node.y;
        }
    });

    state.graphData = data;
    state.dirtyNodes = {};

    // Reset save button
    const btn = document.getElementById('btn-save-positions');
    if (btn) {
        btn.style.opacity = '0.4';
        btn.style.pointerEvents = 'none';
        btn.textContent = '💾 Save Positions';
    }

    UI.initLegends();

    UI.setupSearch(data.nodes, (nodeId) => {
        const node = data.nodes.find(n => n.id === nodeId);
        if (!node) return;
        flyToNode(node, 3000);
    });

    // -------------------------
    // Abstraction Level Filter
    // -------------------------
    const slider = document.getElementById('time-slider');
    const timeLabel = document.getElementById('current-time');
    const btnShowAll = document.getElementById('btn-show-all-levels');
    const levelBtnLabel = document.getElementById('level-btn-label');

    if (slider && btnShowAll) {
        // Preserve slider position and toggle state across refreshGraph calls
        if (!slider._levelFilterInit) {
            slider.value = 1;
            slider._levelFilterInit = true;
            slider._showAllUpTo = false;
        }

        let showAllUpTo = slider._showAllUpTo ?? false;
        let currentLevel = parseInt(slider.value) || 1;

        function applyLevelFilter() {
            // Persist toggle state on the DOM element so it survives refreshGraph
            slider._showAllUpTo = showAllUpTo;

            timeLabel.innerText = `L${currentLevel}`;
            if (levelBtnLabel) levelBtnLabel.textContent = currentLevel;
            btnShowAll.textContent = showAllUpTo
                ? `Show only L${currentLevel}`
                : `Show all ≤ L${currentLevel}`;
            btnShowAll.classList.toggle('active', showAllUpTo);

            const filteredNodes = data.nodes.filter(n => {
                if (n.abstraction_level == null) return true; // always show unlevelled nodes
                const lvl = parseInt(n.abstraction_level);
                if (showAllUpTo) return lvl <= currentLevel;
                return lvl === currentLevel;
            });

            // Re-apply Z before rendering — graphData() rebuilds the scene from scratch
            // and needs correct z values on every node in the filtered set.
            filteredNodes.forEach(node => {
                const lvl = node.abstraction_level != null ? parseInt(node.abstraction_level) : null;
                node.z = zFromAbstractionLevel(lvl) ?? node.version_z ?? 0;

            });

            const filteredNodeIds = new Set(filteredNodes.map(n => n.id));
            const filteredLinks = data.links.filter(l => {
                const srcId = l.source?.id ?? l.source;
                const tgtId = l.target?.id ?? l.target;
                return filteredNodeIds.has(srcId) && filteredNodeIds.has(tgtId);
            });

Graph.graphData({ nodes: filteredNodes, links: filteredLinks });

            filteredNodes.forEach(node => {
                Graph.moveNodeZ(node.id, node.z);
            });
        }

        slider.min = 1;
        slider.max = 5;
        currentLevel = parseInt(slider.value);

        slider.oninput = (e) => {
            currentLevel = parseInt(e.target.value);
            applyLevelFilter();
        };

        btnShowAll.onclick = () => {
            showAllUpTo = !showAllUpTo;
            applyLevelFilter();
        };

        applyLevelFilter();
    } else {
        // No filter UI present — render everything
        Graph.graphData(data);
    }
}

// -------------------------
// Save Positions
// -------------------------
async function savePositions() {
    const dirty = state.dirtyNodes;
    const ids = Object.keys(dirty);
    if (ids.length === 0) return;

    const btn = document.getElementById('btn-save-positions');
    if (btn) btn.textContent = 'Saving...';

    await Promise.all(ids.map(id =>
        fetch(`/api/nodes/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                x: dirty[id].x,
                y: dirty[id].y,
                z: dirty[id].z
            })
        })
    ));

    state.dirtyNodes = {};
    if (btn) {
        btn.textContent = '✓ Saved';
        btn.style.opacity = '0.4';
        btn.style.pointerEvents = 'none';
        setTimeout(() => { btn.textContent = '💾 Save Positions'; }, 2000);
    }
}

// -------------------------
// Toggle Link Mode
// -------------------------
window.toggleLinkMode = () => {
    state.isLinkMode = !state.isLinkMode;
    state.linkSource = null;
    const indicator = document.getElementById('link-mode-indicator');
    const btn = document.getElementById('btn-link-mode');
    if (state.isLinkMode) {
        indicator.style.display = 'block';
        indicator.innerText = 'LINK MODE: SELECT SOURCE NODE';
        btn.classList.add('active');
    } else {
        indicator.style.display = 'none';
        btn.classList.remove('active');
    }
};

window.savePositions = savePositions;

// -------------------------
// Global Dispatcher
// -------------------------
window.dispatch = async (action, payload) => {

    if (action === 'DELETE_NODE') {
        await fetch(`/api/nodes/${payload}`, { method: 'DELETE' });
        document.getElementById('node-inspector').style.display = 'none';
        refreshGraph();
    }

    if (action === 'ADD_NODE') {
        UI.renderAddNodeModal(async (data) => {
            const res = await fetch('/api/nodes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await res.json();
            refreshGraph();
            return result;
        });
    }

    if (action === 'AI_CHALLENGE') {
        const node = (state.graphData?.nodes || []).find(n =>
            n.id === payload || n.node_id === payload
        );
        if (node) {
            UI.renderAIChallenge(node);
        }
    }

    if (action === 'AI_ANALYZE') {
        UI.renderAIAnalyzePanel(state.graphData?.nodes || [], async (selectedFragments, fullResult) => {
            // selectedFragments: [{ key, content, parent_type, embedding, position, suggested_relations }]

            const scene = Graph.scene();
            const placedNodes = [];

            for (const frag of selectedFragments) {
                // Use embedding-derived position, or fall back to sphere scatter
                const pos = frag.position && frag.position.x != null
                    ? frag.position
                    : randomOnSphere(200);

                // Create node in Neo4j
                const res = await fetch('/api/nodes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        content:     frag.content,
                        parent_type: frag.parent_type || 'Concept',
                        x: pos.x, y: pos.y, z: pos.z,
                    }),
                });
                const newNode = await res.json();

                // Store embedding vector on the node
                if (frag.embedding && frag.embedding.length > 0) {
                    await fetch(`/api/nodes/${newNode.id}/embedding`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ embedding: frag.embedding }),
                    });
                }

                placedNodes.push({ frag, newNode, pos });
            }

            // Refresh graph to get all new nodes in state
            await refreshGraph();

            const allNodes = state.graphData?.nodes || [];

            // Draw suggestion vectors for all placed nodes
            const allVectorTargets = [];
            for (const { frag, newNode } of placedNodes) {
                const ghostNode = allNodes.find(n => n.node_id === newNode.node_id)
                    || { x: 0, y: 0, z: 0, node_id: newNode.node_id, content: frag.content };

                for (const sr of (frag.suggested_relations || [])) {
                    const target = allNodes.find(n => n.node_id === sr.node_id);
                    if (target) {
                        allVectorTargets.push({
                            from: ghostNode,
                            node: target,
                            color: sr.rel_type === 'CONTRADICTS' ? '#ff5a5a' : '#00c8a0',
                            label: sr.rel_type,
                        });
                    }
                }
            }

            // Group by fromNode and draw
            if (allVectorTargets.length > 0) {
                clearSuggestionVectors(scene);
                allVectorTargets.forEach(({ from, node, color, label }) => {
                    drawSuggestionVectors(scene, from, [{ node, color, label }]);
                });
            }

            // Cross-relations between the newly placed nodes themselves
            for (const cr of (fullResult.cross_relations || [])) {
                const fromNode = allNodes.find(n => n.node_id === placedNodes.find(p => p.frag.key === cr.from_fragment)?.newNode?.node_id);
                const toNode   = allNodes.find(n => n.node_id === placedNodes.find(p => p.frag.key === cr.to_fragment)?.newNode?.node_id);
                if (fromNode && toNode) {
                    drawSuggestionVectors(scene, fromNode, [{
                        node:  toNode,
                        color: cr.rel_type === 'CONTRADICTS' ? '#ff5a5a' : '#00c8a0',
                        label: cr.rel_type,
                    }]);
                }
            }

            // Build combined suggestion result for the panel
            const combinedRelations = [];
            for (const { frag, newNode } of placedNodes) {
                const ghostNode = allNodes.find(n => n.node_id === newNode.node_id) || newNode;
                for (const sr of (frag.suggested_relations || [])) {
                    const target = allNodes.find(n => n.node_id === sr.node_id);
                    if (target) {
                        combinedRelations.push({
                            ...sr,
                            target_id: target.id,
                            target_name: target.content || target.name,
                            source_node: ghostNode,
                            source_content: frag.content,
                        });
                    }
                }
            }

            UI.renderAISuggestionPanel(
                allNodes.find(n => n.node_id === placedNodes[0]?.newNode?.node_id) || placedNodes[0]?.newNode || {},
                {
                    ...fullResult,
                    suggested_relations: combinedRelations,
                    _placedNodes: placedNodes.map(p => ({
                        node_id: p.newNode.node_id,
                        id: p.newNode.id,
                        content: p.frag.content,
                    })),
                },
                allNodes,
                async (accepted) => {
                    clearSuggestionVectors(Graph.scene());
                    if (accepted.length > 0) {
                        await Promise.all(accepted.map(sr =>
                            fetch('/api/links', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    node_a: sr.source_node?.id || placedNodes[0]?.newNode?.id,
                                    node_b: sr.target_id,
                                    rel_type: sr.rel_type,
                                    justification: sr.justification,
                                    weight: 0.8, confidence: 0.75, status: 'PROVISIONAL',
                                }),
                            })
                        ));
                    }
                    refreshGraph();
                }
            );
        });
    }

    if (action === 'SETTINGS') {
        UI.renderSettingsPanel(() => refreshGraph());
    }

    if (action === 'REFRESH') {
        refreshGraph();
    }

    if (action === 'REFLOW') {
        if (state.graphData) reflowGraph(Graph, state.graphData);
    }

    if (action === 'MOVE_NODE_Z') {
        // payload = { id, z, level }
        const node = (state.graphData?.nodes || []).find(n => n.id === payload.id);
        if (!node) return;
        node.z = payload.z;
        if (payload.level != null) node.abstraction_level = payload.level;
        Graph.moveNodeZ(payload.id, payload.z);
        // Auto-save Z to DB so it persists without needing Save Positions
        await fetch(`/api/nodes/${payload.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ z: payload.z }),
        });
    }

    if (action === 'NEW_VERSION') {
        // payload = source node id
        const sourceNode = (state.graphData?.nodes || []).find(n => n.id === payload);
        if (!sourceNode) return;

        const VERSION_Z_STEP = 80;
        const newZ = (sourceNode.z ?? 0) - VERSION_Z_STEP;

        const res = await fetch('/api/nodes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content:           (sourceNode.content || sourceNode.name) + ' (v2)',
                parent_type:       sourceNode.parent_type || sourceNode.node_type || 'Concept',
                abstraction_level: sourceNode.abstraction_level,
                confidence_tier:   sourceNode.confidence_tier,
                x: sourceNode.x,
                y: sourceNode.y,
                z: newZ,
            }),
        });
        const newNode = await res.json();

        // Connect with HAS_VERSION edge
        await fetch('/api/links', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                node_a:      sourceNode.id,
                node_b:      newNode.id,
                rel_type:    'HAS_VERSION',
                weight:      1.0,
                confidence:  1.0,
                status:      'ACTIVE',
            }),
        });

        await refreshGraph();

        // Select the new node so the user can rename/edit it immediately
        const fresh = state.graphData?.nodes.find(n => n.id === newNode.id);
        if (fresh) {
            flyToNode(fresh, 1200);
            const neighbors = await fetch(`/graph/node/${fresh.id}/neighbors`).then(r => r.json());
            UI.renderNodeInspector(fresh, neighbors, (nb) => {
                const full = (state.graphData?.nodes || []).find(n => n.node_id === nb.code) || nb;
                handleNodeClick(full);
            });
        }

        showFlash('New version created — Shift+drag to reposition on Z axis');
    }
};

function showFlash(msg) {
    const f = document.createElement('div');
    f.className = 'success-flash';
    f.textContent = msg;
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 2500);
}

// Initial load
refreshGraph();