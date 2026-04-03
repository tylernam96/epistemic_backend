import { createGraph, reflowGraph, assignVersionZ, randomOnSphere, zFromAbstractionLevel, drawSuggestionVectors, clearSuggestionVectors } from './graph-component.js';
import { UI } from './ui.js';
import { openDriftCapture, openDriftArchive, linkCrystalToNode, openTimeLayerPanel } from './ui/hud/drift-log.js';
import * as THREE from 'https://unpkg.com/three@0.152.0/build/three.module.js';

// ── epochToZ: converts epoch value to Z coordinate ──────────────────────────
// Year format (>1900): (year - 2000) * 40  →  2000=0, 2010=400, 2020=800
// Period format (small number): period * 80
function epochToZ(node) {
    const epoch = node.epoch ?? node.valid_from ?? null;
    if (epoch == null) return 0;
    const e = Number(epoch);
    if (isNaN(e)) return 0;
    return e > 1900 ? (e - 2000) * 40 : e * 80;
}

const state = {
    selectedNode: null,
    isLinkMode: false,
    linkSource: null,
    graphData: null,
    dirtyNodes: {},  // nodes moved by drag, pending save: { id: {x,y,z} }
    labelsVisible: true,
    // ── Discussion node selection ──────────────────────────────────
    isDiscussionMode: false,
    discussionSelection: [],   // array of full node objects picked so far
    _discussionBannerUpdate: null,  // fn returned by showDiscussionSelectionBanner
    // ── Isolation mode ────────────────────────────────────────────
    isIsolationMode: false,
    isolationNodeId: null,     // id of the DiscussionNode currently isolated
};

// ── Workspace (graph_id) ──────────────────────────────────────────────────
// Persisted in localStorage so each browser tab remembers its last workspace.
function getGraphId() {
    return localStorage.getItem('ee_graph_id') || 'default';
}
function setGraphId(id) {
    localStorage.setItem('ee_graph_id', id);
}

// Initialize Graph
const Graph = createGraph(
    '3d-graph',
    async (node) => handleNodeClick(node),
    (link) => handleLinkClick(link),
    (node) => handleNodeDrag(node)
);
window.__graph = Graph; // debug access
window.__state = state;

function initSubnodeRaycaster() {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const canvas = document.getElementById('3d-graph').querySelector('canvas');

    canvas.addEventListener('click', (e) => {
        // Find camera lazily on each click (available after graph loads)
        let camera;
        Graph.scene().traverse(obj => { if (obj.isCamera) camera = obj; });
        if (!camera) return;

        const rect = canvas.getBoundingClientRect();
        mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
        mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);

        const clickableSpheres = subnodeState.subnodeObjects.filter(
            o => o.isMesh && o.userData?.isSubnode
        );
        console.log('clickable spheres:', clickableSpheres.length);
        const hits = raycaster.intersectObjects(clickableSpheres, false);
        console.log('hits:', hits.length);
        if (hits.length) {
            hits[0].object.userData.onClick?.();
            e.stopPropagation();
        }
    });
}
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
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 255, g: 255, b: 255 };
}

function makeLabelSprite(text, colorHex, opacity = 0.9) {
    console.log('makeLabelSprite called:', text, colorHex);

    const canvas  = document.createElement('canvas');
    const ctx     = canvas.getContext('2d');
    // 2× resolution canvas for crisp rendering at distance
    const fontSize = 42;
    const pad      = 18;
    ctx.font = `600 ${fontSize}px Arial`;
    const textW   = ctx.measureText(text).width;
    canvas.width  = textW + pad * 2;
    canvas.height = fontSize + pad * 2;

    // Dark pill background for legibility against any scene color
    const borderRadius = canvas.height / 2;
    ctx.fillStyle = 'rgba(5, 6, 8, 0.72)';
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, borderRadius);
    ctx.fill();

    // Text
    const {r, g, b} = hexToRgb(colorHex);
    ctx.fillStyle = `rgba(${r},${g},${b},${opacity})`;

    ctx.font = `600 ${fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(canvas),
        depthWrite: false,
        transparent: true,
    }));
    // Scale down from 2× canvas so world units stay the same, but texture is sharper
    sprite.scale.set(canvas.width / 10, canvas.height / 10, 1);
    return sprite;
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
        if (node.userData?.isSubnode) {
        showSubnodeDetails(node.userData.subnodeData, node.userData.parentNode);
        return;
    }

    const fullNode = (state.graphData?.nodes || []).find(n =>
        n.id === node.id || n.node_id === node.node_id || n.node_id === node.code
    ) || node;

    console.log('=== NODE CLICK ===');
    console.log('Clicked node:', fullNode);
    console.log('Node has subnodes?', fullNode.subnodes);
    console.log('Subnodes count:', fullNode.subnodes?.length || 0);
    

    // ── DISCUSSION MODE: accumulate members one click at a time ───
    if (state.isDiscussionMode) {
        const alreadyIdx = state.discussionSelection.findIndex(n => n.id === fullNode.id);
        if (alreadyIdx !== -1) {
            state.discussionSelection.splice(alreadyIdx, 1);
        } else {
            state.discussionSelection.push(fullNode);
        }
        if (state._discussionBannerUpdate) state._discussionBannerUpdate();
        return;
    }

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

        // Show/hide subnodes
    toggleSubnodes(fullNode);

    // ── If this is a DiscussionNode, enter isolation mode ────────────
    const nodeType = fullNode.parent_type || fullNode.node_type || '';
    if (nodeType === 'DiscussionNode') {
        enterIsolationMode(fullNode);
        return;
    }

    const fetchId = fullNode.id || fullNode.node_id || fullNode.code;
    const response = await fetch(`/graph/node/${fetchId}/neighbors`);
    const neighbors = await response.json();

    UI.renderNodeInspector(fullNode, neighbors, (neighborStub) => {
        const fullNeighbor = (state.graphData?.nodes || []).find(n =>
            n.node_id === neighborStub.code
        ) || neighborStub;
        handleNodeClick(fullNeighbor);
    });
        setTimeout(() => {
        const btn = document.getElementById('btn-propose-relations');
        if (!btn) return;

        btn.onclick = async () => {
            try {
                btn.innerText = "Thinking...";
                btn.style.opacity = 0.6;

                const res = await fetch('/api/relations/propose', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ node_id: fullNode.id || fullNode.node_id })
                });

                const data = await res.json();

                // Clear old suggestions
                if (window.clearSuggestionVectors) {
                    window.clearSuggestionVectors();
                }

                // Draw new ones
                if (window.drawSuggestionVectors) {
                    window.drawSuggestionVectors(
                        window.graphScene || window.scene,
                        fullNode,
                        data.proposals
                    );
                }

// Remove old proposal list if exists
document.getElementById('proposal-list')?.remove();

// Create list container
const list = document.createElement('div');
list.id = 'proposal-list';
list.style.marginTop = '12px';

// Populate proposals
list.innerHTML = data.proposals.map(p => `
    <div class="neighbor-card" style="border-color:rgba(0,200,160,0.3);">
        <div style="font-size:10px;color:#00c8a0;font-weight:600;">
            ${p.rel_type} → ${p.target}
        </div>
        <div style="font-size:11px;color:#8e99b3;margin-top:4px;">
            ${p.justification || ''}
        </div>
        <div style="font-size:10px;color:#445070;margin-top:4px;">
            confidence: ${(p.confidence * 100).toFixed(0)}%
        </div>
    </div>
`).join('');

// Append to inspector
document.getElementById('node-inspector').appendChild(list);

// Update button label
btn.innerText = `✨ ${data.proposals.length}`;

            } catch (err) {
                console.error(err);
                btn.innerText = "Error";
            } finally {
                btn.style.opacity = 1;
            }
        };
    }, 0);
}

const subnodeState = {
    activeNodeId: null,
    subnodeObjects: [], // THREE.js objects for subnodes
    subnodeLines: []    // THREE.js lines connecting to parent
};
 
function toggleSubnodes(node) {
    const scene = Graph.scene();
    if (!scene) return;
    
    // If clicking the same node, hide subnodes
    if (subnodeState.activeNodeId === node.id) {
        clearSubnodes();
        return;
    }
    
    // Clear any existing subnodes
    clearSubnodes();
    
    // Check if node has subnodes
    const subnodes = node.subnodes || [];
    if (!subnodes.length) return;
    
    subnodeState.activeNodeId = node.id;
    
    // Store subnode positions for connecting lines
    const subnodePositions = [];
    
    // Create subnode visualizations
    const angleStep = (Math.PI * 2) / subnodes.length;
    
    subnodes.forEach((subnode, idx) => {

  const spacing = 25;
const prevPos = idx === 0
    ? { x: node.x, y: node.y }
    : subnodePositions[idx - 1];
const subnodeX = prevPos.x + spacing;
const subnodeY = prevPos.y;
const subnodeZ = node.z;
        
        // Store position for later linking
        subnodePositions.push({ x: subnodeX, y: subnodeY, z: subnodeZ, data: subnode, idx });
        
        // Create subnode sphere (clickable)
        const geometry = new THREE.SphereGeometry(3, 24, 24);
        const material = new THREE.MeshBasicMaterial({
            color: 0x00c8a0,
        });
        const sphere = new THREE.Mesh(geometry, material);
        sphere.position.set(subnodeX, subnodeY, subnodeZ);
        
        // Store subnode data for click handling
        sphere.userData = {
            isSubnode: true,
            parentId: node.id,
            parentNode: node,
            subnodeData: subnode,
            subnodeIndex: idx
        };
        
        // Make sphere clickable
        sphere.userData.clickable = true;
        
        // Add to scene
        scene.add(sphere);
        subnodeState.subnodeObjects.push(sphere);
        
      
         // 🔥 Use SAME system as main nodes
const label = makeLabelSprite(
    subnode.title || subnode.description?.substring(0, 40) || 'Subnode',
    '#00c8a0'
);

label.position.set(subnodeX, subnodeY + 6, subnodeZ);

scene.add(label);
console.log('label added at:', label.position, 'scale:', label.scale);

subnodeState.subnodeObjects.push(label); // ✅ just push, don't clear


// Also make sphere clickable via Raycaster
        sphere.userData.onClick = () => {
            showSubnodeDetails(subnode, node);
        };
    });
    
    // Create connections between subnodes (sequential linking)

    
    // Also connect first and last to create a ring? Optional - uncomment if desired
    
    // Create connections from parent to each subnode (already done with lines)
   // Connect parent to first subnode only, then chain each to the next
subnodePositions.forEach((pos, i) => {
    const from = i === 0
        ? { x: node.x, y: node.y, z: node.z }  // parent → first
        : subnodePositions[i - 1];               // previous subnode → this one

    const lineMaterial = new THREE.LineBasicMaterial({
        color: 0x00c8a0,
        opacity: 0.4,
        transparent: true
    });

    const points = [
        new THREE.Vector3(from.x, from.y, from.z),
        new THREE.Vector3(pos.x, pos.y, pos.z)
    ];

    const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(lineGeometry, lineMaterial);

    scene.add(line);
    subnodeState.subnodeLines.push(line);
});
}

// Helper function to show subnode details
function showSubnodeDetails(subnode, parentNode) {
    // Remove any existing subnode modal
    document.getElementById('subnode-details-modal')?.remove();
    
    const modal = document.createElement('div');
    modal.id = 'subnode-details-modal';
    modal.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(10, 12, 18, 0.98);
        border: 1px solid #00c8a0;
        border-radius: 12px;
        padding: 24px;
        min-width: 300px;
        max-width: 500px;
        max-height: 80vh;
        overflow-y: auto;
        z-index: 10000;
        backdrop-filter: blur(12px);
        box-shadow: 0 0 40px rgba(0, 200, 160, 0.2);
        font-family: 'DM Mono', monospace;
    `;
    
    modal.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid rgba(0, 200, 160, 0.3); padding-bottom: 12px;">
            <div style="color: #00c8a0; font-size: 11px; font-weight: 600; letter-spacing: 0.05em;">SUBNODE</div>
            <button id="close-subnode-modal" style="background: none; border: none; color: #445070; cursor: pointer; font-size: 18px;">✕</button>
        </div>
        <div style="margin-bottom: 16px;">
            <div style="color: #c8d0e0; font-size: 14px; font-weight: 600; margin-bottom: 8px;">${escapeHtml(subnode.title || 'Untitled')}</div>
            <div style="color: #8e99b3; font-size: 12px; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(subnode.description || 'No description')}</div>
        </div>
        <div style="background: rgba(0, 200, 160, 0.05); border-radius: 6px; padding: 12px; margin-top: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="color: #445070; font-size: 10px;">Strength:</span>
                <span style="color: #00c8a0; font-size: 11px; font-weight: 600;">${subnode.strength || 50}%</span>
            </div>
            <div style="margin-top: 8px;">
                <div style="background: rgba(0, 200, 160, 0.1); height: 4px; border-radius: 2px; overflow: hidden;">
                    <div style="background: #00c8a0; width: ${subnode.strength || 50}%; height: 100%;"></div>
                </div>
            </div>
        </div>
        <div style="margin-top: 20px; display: flex; gap: 12px; justify-content: flex-end;">
            <button id="close-subnode-btn" style="background: transparent; border: 1px solid #445070; color: #8e99b3; border-radius: 6px; padding: 6px 16px; cursor: pointer; font-family: 'DM Mono', monospace; font-size: 11px;">Close</button>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const closeModal = () => modal.remove();
    document.getElementById('close-subnode-modal')?.addEventListener('click', closeModal);
    document.getElementById('close-subnode-btn')?.addEventListener('click', closeModal);
    
    // Close on backdrop click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
}

// Helper function to escape HTML
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function clearSubnodes() {
    const scene = Graph.scene();
    if (!scene) return;
    
    // Remove all subnode objects
    subnodeState.subnodeObjects.forEach(obj => {
        scene.remove(obj);
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
            if (obj.material.map) obj.material.map.dispose();
            obj.material.dispose();
        }
    });
    
    // Remove all lines
    subnodeState.subnodeLines.forEach(line => {
        scene.remove(line);
        if (line.geometry) line.geometry.dispose();
        if (line.material) line.material.dispose();
    });
    
    subnodeState.subnodeObjects = [];
    subnodeState.subnodeLines = [];
    subnodeState.activeNodeId = null;
}
 
// Helper function to wrap text for canvas rendering
function wrapText(context, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';
    
    words.forEach(word => {
        const testLine = currentLine + (currentLine ? ' ' : '') + word;
        const metrics = context.measureText(testLine);
        
        if (metrics.width > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = word;
        } else {
            currentLine = testLine;
        }
    });
    
    if (currentLine) lines.push(currentLine);
    return lines;
}
 
// Expose for external use
window.toggleSubnodes = toggleSubnodes;
window.clearSubnodes = clearSubnodes;

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
    const res = await fetch(`/graph/3d-json?graph_id=${encodeURIComponent(getGraphId())}`);
    const data = await res.json();

    // Assign Z for HAS_VERSION chains first
    assignVersionZ(data.nodes, data.links);

    data.nodes.forEach(node => {
        // Z = time. Derived from epoch/valid_from via epochToZ().
        // HAS_VERSION chain depth takes priority via version_z.
        node.z = epochToZ(node) || node.version_z || 0;


        if (node.x != null && node.y != null) {
            node.fx = node.x;
            node.fy = node.y;
            node.fz = node.z;  // Also pin Z if needed
            node.pinned = true;

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

    // If we were in isolation mode, the graph just re-rendered so clear it
    if (state.isIsolationMode) {
        exitIsolationMode();
    }

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

    // ── Time Controller: Chronological + Thick Time modes ─────────────────────────
    const slider       = document.getElementById('time-slider');
    const timeLabel    = document.getElementById('current-time');
    const btnShowAll   = document.getElementById('btn-show-all-levels');
    const levelBtnLabel = document.getElementById('level-btn-label');
    const btnThickMode  = document.getElementById('btn-thick-time-mode');

    // ── Thick Time skoru hesapla ──────────────────────────────────────────────
    // Counts layer depth for each node (0-7).
    // Drift supplement, HAUNTS/OPENS_INTO relations, comments add score.
    function computeThickScores(nodes, links) {
        const scores = {};
        // Drift log verisi
        let driftEntries = [];
        let driftComments = {};
        try {
            driftEntries  = JSON.parse(localStorage.getItem('drift_log_entries') || '[]');
            driftComments = JSON.parse(localStorage.getItem('drift_node_comments') || '{}');
        } catch {}

        // Supplement map: nodeId → crystal
        const supplementMap = {};
        for (const entry of driftEntries) {
            for (const crystal of (entry.crystals || [])) {
                if (crystal.nodeId) supplementMap[crystal.nodeId] = crystal;
            }
        }

        // Relation type map: nodeId → array of relation types
        const relTypeMap = {};
        for (const link of links) {
            const srcId = link.source?.id ?? link.source;
            const tgtId = link.target?.id ?? link.target;
            const type  = (link.rel_type || '').toUpperCase();
            if (!relTypeMap[srcId]) relTypeMap[srcId] = [];
            if (!relTypeMap[tgtId]) relTypeMap[tgtId] = [];
            relTypeMap[srcId].push(type);
            relTypeMap[tgtId].push(type);
        }

        for (const node of nodes) {
            const nid = node.id || node.node_id;
            let score = 1; // baseline — theoretical content exists

            // Supplement: crystallized from drift record
            if (supplementMap[nid]) {
                score += 1;

                // Does the supplement open into another historicity?
                const crystal = supplementMap[nid];
                if (crystal.status === 'flowing' || crystal.ontologyStatus === 'flowing') score += 1;
            }

            // Dynamic relations
            const relTypes = relTypeMap[nid] || [];
            if (relTypes.includes('HAUNTS'))     score += 1;
            if (relTypes.includes('OPENS_INTO')) score += 1;
            if (relTypes.includes('SEDIMENTS_INTO')) score += 1;

            // Deconstructed node
            if (node.ontology_status === 'deconstructed') score += 1;

            // Yorumlar
            const comments = driftComments[nid] || [];
            if (comments.some(c => c.type === 'inner')) score += 1;
            if (comments.some(c => c.type === 'outer')) score += 1;

            scores[nid] = Math.min(score, 7);
        }
        return scores;
    }

    // Thick time scores — always computed
    const thickScores = computeThickScores(data.nodes, data.links);
    const maxThick    = Math.max(1, ...Object.values(thickScores));

    // Epoch range
    const epochs   = data.nodes
        .map(n => n.epoch ?? n.valid_from ?? null)
        .filter(e => e != null).map(Number);
    const hasEpochs = epochs.length > 0;
    const minEpoch  = hasEpochs ? Math.min(...epochs) : 0;
    const maxEpoch  = hasEpochs ? Math.max(...epochs) : 0;

    // Shared render helper
    function _renderFiltered(filteredNodes) {
        filteredNodes.forEach(n => { 
            n.z = epochToZ(n) || n.version_z || 0;
            // PRESERVE fx/fy settings
            if (n.x != null && n.y != null) {
                n.fx = n.x;
                n.fy = n.y;
                n.fz = n.z;
            }
        });
        const filteredIds = new Set(filteredNodes.map(n => n.id));
        const filteredLinks = data.links.filter(l => {
            const s = l.source?.id ?? l.source;
            const t = l.target?.id ?? l.target;
            return filteredIds.has(s) && filteredIds.has(t);
        });
       
        // 🔥 ADD THIS BLOCK BEFORE graphData
const newNodes = [];
const newLinks = [];

filteredNodes.forEach(node => {
    if (!node.subnodes) return;

    node.subnodes.forEach((sub, i) => {
        const subId = `${node.id}_sub_${i}`;

        newNodes.push({
            id: subId,
            name: sub.label || "subnode",
            parent_type: "Subnode",

            // position near parent
            x: node.x + (Math.random() - 0.5) * 20,
            y: node.y + (Math.random() - 0.5) * 20,
            z: node.z
        });

        newLinks.push({
            source: node.id,
            target: subId,
            rel_type: "HAS_SUBNODE",
            weight: 0.3
        });
    });
});

// merge into existing graph
const finalNodes = [...filteredNodes, ...newNodes];
const finalLinks = [...filteredLinks, ...newLinks];

console.log("FINAL NODES", finalNodes);

        // Load data into graph
        Graph.graphData({ nodes: filteredNodes, links: filteredLinks });
        
        // CRITICAL: Pin each node after loading
        filteredNodes.forEach(n => {
            Graph.moveNodeZ(n.id, n.z);
            if (n.x != null && n.y != null) {
                Graph.pinNode(n.id);
            }
        });
    }

    if (slider && btnShowAll) {
        // Mod durumunu slider DOM'unda sakla — refreshGraph'tan sonra korunur
        if (!slider._timeInit) {
            slider._timeInit = true;
            slider._mode     = 'chrono';
            slider._showAll  = true;
        }

        let mode    = slider._mode;
        let showAll = slider._showAll;

        function _updateModeBtn() {
            if (!btnThickMode) return;
            if (mode === 'thick') {
                btnThickMode.textContent       = '◈ Thick Time';
                btnThickMode.style.color       = 'rgba(180,140,255,0.85)';
                btnThickMode.style.borderColor = 'rgba(180,140,255,0.35)';
                btnThickMode.classList.add('active');
            } else {
                btnThickMode.textContent       = '◈ Chronological';
                btnThickMode.style.color       = '#8896b8';
                btnThickMode.style.borderColor = 'rgba(136,150,184,0.3)';
                btnThickMode.classList.remove('active');
            }
        }

        function _setSliderRange() {
            if (mode === 'chrono') {
                slider.min   = hasEpochs ? minEpoch : 0;
                slider.max   = hasEpochs ? maxEpoch : 0;
                slider.step  = 1;
                slider.disabled = !hasEpochs;
            } else {
                slider.min      = 1;
                slider.max      = maxThick;
                slider.step     = 1;
                slider.disabled = false;
            }
        }

        function applyFilter() {
            slider._mode    = mode;
            slider._showAll = showAll;

            const val = parseInt(slider.value) || 0;

            if (mode === 'chrono') {
                if (!hasEpochs) {
                    // No epochs — show all, slider inactive
                    if (timeLabel) timeLabel.innerText = '—';
                    if (levelBtnLabel) levelBtnLabel.textContent = '—';
                    btnShowAll.textContent = 'All';
                    _renderFiltered(data.nodes);
                    return;
                }

                if (timeLabel) timeLabel.innerText = val;
                if (levelBtnLabel) levelBtnLabel.textContent = val;
                btnShowAll.textContent = showAll ? `≤ ${val}` : `= ${val}`;
                btnShowAll.classList.toggle('active', !showAll);

                const filtered = data.nodes.filter(n => {
                    const ep = n.epoch ?? n.valid_from ?? null;
                    if (ep == null) return true; // nodes without epoch are always visible
                    const e = Number(ep);
                    return showAll ? e <= val : e === val;
                });
                _renderFiltered(filtered);

            } else {
                // Thick zaman modu
                const labels = ['', 'Surface', 'Trace', 'Sedimentary', 'Fissured', 'Resonant', 'Haunted', 'Thick'];
                if (timeLabel) timeLabel.innerText = labels[val] || String(val);
                if (levelBtnLabel) levelBtnLabel.textContent = val;
                btnShowAll.textContent = showAll ? `≤ ${val}` : `= ${val}`;
                btnShowAll.classList.toggle('active', !showAll);

                const filtered = data.nodes.filter(n => {
                    const nid   = n.id || n.node_id;
                    const score = thickScores[nid] || 1;
                    return showAll ? score <= val : score === val;
                });
                filtered.forEach(n => {
                    n._thickSize = thickScores[n.id || n.node_id] || 1;
                });
                _renderFiltered(filtered);
            }
        }

        // Initial values — range first, then value, then filter
        _setSliderRange();
        slider.value = mode === 'chrono'
            ? (hasEpochs ? maxEpoch : 0)
            : maxThick;
        _updateModeBtn();

        // Event handler'lar
        slider.oninput = () => applyFilter();

        btnShowAll.onclick = () => {
            showAll = !showAll;
            applyFilter();
        };

        if (btnThickMode) {
            btnThickMode.onclick = () => {
                mode    = mode === 'chrono' ? 'thick' : 'chrono';
                showAll = true;
                _setSliderRange();
                slider.value = mode === 'chrono'
                    ? (hasEpochs ? maxEpoch : 0)
                    : maxThick;
                _updateModeBtn();
                applyFilter();
            };
        }

        applyFilter();

    } else {
        // No slider DOM element — show all
        _renderFiltered(data.nodes);
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
    UI.renderAddNodeModal(async (data, suggestionData) => {
        const res = await fetch('/api/nodes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...data, graph_id: getGraphId() })
        });
        const result = await res.json();

        // After node is created, show placement explanation if we had a suggestion
        if (suggestionData && suggestionData.explanation) {
            setTimeout(() => {
                UI.showPlacementExplanation(result, suggestionData);
            }, 500);
        }

        refreshGraph();
        return result;
    }, state.graphData?.nodes || [],
       state.graphData?.links || []);
}

if (action === 'EDIT_NODE') {
    const node = (state.graphData?.nodes || []).find(n => n.id === payload);
    if (!node) return;
    UI.renderEditNodeModal(node, async (data) => {
        try {
            const res = await fetch(`/api/nodes/${node.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await res.json();
            console.log('PATCH result:', result);
            await refreshGraph();
        } catch(err) {
            console.error('EDIT_NODE error:', err);
            throw err; // re-throw so modal catch sees it
        }
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

    // ── Discussion Node ────────────────────────────────────────────────────
    if (action === 'CREATE_DISCUSSION_NODE') {
        // If already in discussion mode, cancel it first
        if (state.isDiscussionMode) {
            window.dispatch('EXIT_DISCUSSION_MODE');
            return;
        }

        state.isDiscussionMode = true;
        state.discussionSelection = [];

        // Mark the toolbar button as active
        const btn = document.getElementById('btn-discussion-mode');
        if (btn) btn.classList.add('active');

        // Show the banner and hold on to the update fn
        state._discussionBannerUpdate = UI.showDiscussionSelectionBanner(
            state.discussionSelection,

            // onConfirm: user clicked "Confirm (N) →"
            (selectedNodes) => {
                // Exit selection mode immediately so clicks go back to normal
                state.isDiscussionMode = false;
                state.discussionSelection = [];
                document.getElementById('disc-selection-banner')?.remove();
                const btn = document.getElementById('btn-discussion-mode');
                if (btn) btn.classList.remove('active');

                // Open the naming modal
                UI.renderDiscussionNodeModal(selectedNodes, async ({ title, context, abstraction_level, memberIds }) => {
                    // 1. Create the discussion node
                    const res = await fetch('/api/discussion-nodes', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            title,
                            context,
                            abstraction_level,
                            member_ids: memberIds,
                            graph_id: getGraphId(),
                        }),
                    });
                    if (!res.ok) {
                        const err = await res.json().catch(() => ({}));
                        throw new Error(err.detail || `HTTP ${res.status}`);
                    }

                    await refreshGraph();

                    // Show success flash
                    showFlash(`Discussion "${title}" created with ${memberIds.length} members`);
                });
            },

            // onCancel
            () => {
                window.dispatch('EXIT_DISCUSSION_MODE');
            }
        );
    }

    if (action === 'EXIT_ISOLATION') {
        exitIsolationMode();
    }

    if (action === 'EXIT_DISCUSSION_MODE') {
        state.isDiscussionMode = false;
        state.discussionSelection = [];
        state._discussionBannerUpdate = null;
        document.getElementById('disc-selection-banner')?.remove();
        const btn = document.getElementById('btn-discussion-mode');
        if (btn) btn.classList.remove('active');
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

// ── Isolation mode ───────────────────────────────────────────────────────────
// Dims all non-member nodes and flies the camera to the cluster.
// Called when the user clicks a DiscussionNode.
async function enterIsolationMode(discussionNode) {
    // Fetch the member list from the discussion node's neighbors
    const fetchId = discussionNode.id || discussionNode.node_id;
    const neighbors = await fetch(`/graph/node/${fetchId}/neighbors`).then(r => r.json());

    // Members are nodes connected via a DISCUSSES edge
    const memberIds = neighbors
        .filter(nb => (nb.rel_type || '').toUpperCase() === 'DISCUSSES')
        .map(nb => {
            // Resolve neighbor element-id from graphData
            const found = (state.graphData?.nodes || []).find(n => n.node_id === nb.code);
            return found?.id || nb.id;
        })
        .filter(Boolean);

    // Also include the discussion node itself in the lit set
    memberIds.push(discussionNode.id);

    state.isIsolationMode = true;
    state.isolationNodeId  = discussionNode.id;

    // Dim scene
    const bounds = Graph.setIsolation(memberIds);

    // Fly camera to cluster bounding box
    const dist = bounds.radius * 2.8 + 80;
    Graph.cameraPosition(
        { x: bounds.cx, y: bounds.cy, z: bounds.cz + dist },
        { x: bounds.cx, y: bounds.cy, z: bounds.cz },
        1800
    );

    // Show the exit button + discussion label
    showIsolationOverlay(discussionNode.content || discussionNode.name || 'Discussion');
}

function exitIsolationMode() {
    if (!state.isIsolationMode) return;
    state.isIsolationMode = false;
    state.isolationNodeId  = null;
    Graph.clearIsolation();
    document.getElementById('isolation-overlay')?.remove();
}

function showIsolationOverlay(title) {
    document.getElementById('isolation-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'isolation-overlay';
    overlay.innerHTML = `
        <div style="
            display: flex;
            align-items: center;
            gap: 12px;
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 1000;
            background: rgba(10,12,18,0.92);
            border: 1px solid #b03070;
            border-radius: 8px;
            padding: 10px 18px;
            font-family: 'DM Mono', monospace;
            font-size: 11px;
            backdrop-filter: blur(12px);
            box-shadow: 0 0 30px rgba(176,48,112,0.2);
            pointer-events: auto;
        ">
            <span style="color:#b03070;letter-spacing:0.1em;font-weight:600;">DISCUSSION</span>
            <span style="color:#445070;">—</span>
            <span style="color:#c8d0e0;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
                title="${title.replace(/"/g, '&quot;')}">${title}</span>
            <button id="btn-exit-isolation" style="
                background: rgba(176,48,112,0.1);
                border: 1px solid #b03070;
                color: #b03070;
                border-radius: 5px;
                padding: 5px 12px;
                cursor: pointer;
                font-family: 'DM Mono', monospace;
                font-size: 11px;
                letter-spacing: 0.05em;
                transition: all 0.15s;
                white-space: nowrap;
            ">✕ Exit</button>
        </div>
    `;
    document.body.appendChild(overlay);
    document.getElementById('btn-exit-isolation').onclick = exitIsolationMode;
}

function showFlash(msg) {
    const f = document.createElement('div');
    f.className = 'success-flash';
    f.textContent = msg;
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 2500);
}

// ── Workspace switcher ───────────────────────────────────────────────────
async function initWorkspaceSwitcher() {
    // Only ever render one instance
    if (document.getElementById('workspace-switcher')) return;

    // Fetch workspaces from DB, but always include the current one even if
    // it has no nodes yet (e.g. brand-new workspace before first node is added)
    let graphs = [];
    try {
        const r = await fetch('/api/graphs');
        const d = await r.json();
        graphs = d.graphs || [];
    } catch(e) { /* ignore */ }

    const current = getGraphId();
    // Ensure current workspace appears even if DB doesn't know it yet
    if (!graphs.includes(current)) graphs.unshift(current);
    if (!graphs.includes('default')) graphs.unshift('default');
    // Deduplicate preserving order
    graphs = [...new Set(graphs)];

    const wrap = document.createElement('div');
    wrap.id = 'workspace-switcher';
    wrap.style.cssText = `
        display:inline-flex; align-items:center; gap:6px;
        font-family:'DM Mono',monospace; font-size:11px;
    `;

    const renderSelect = (list, active) => list
        .map(g => `<option value="${g}" ${g===active?'selected':''}>${g}</option>`)
        .join('') + '<option value="__new__">+ New workspace…</option>';

    wrap.innerHTML = `
        <span style="color:#445070;letter-spacing:0.06em;">WORKSPACE</span>
        <select id="ws-select" style="
            background:#0a0c14; border:1px solid #1e2535; color:#c8d0e0;
            border-radius:5px; padding:4px 8px; font-family:'DM Mono',monospace;
            font-size:11px; cursor:pointer; outline:none;">
            ${renderSelect(graphs, current)}
        </select>
    `;

    // Insert before the first button in the toolbar
    const firstBtn = document.querySelector('button');
    if (firstBtn) firstBtn.parentElement.insertBefore(wrap, firstBtn);
    else document.body.prepend(wrap);

    document.getElementById('ws-select').onchange = async (e) => {
        let val = e.target.value;

        if (val === '__new__') {
            // Reset select back to current while the prompt is open
            e.target.value = current;
            const raw = prompt('New workspace name (letters, numbers, hyphens):');
            if (!raw || !raw.trim()) return;
            val = raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
            if (!val) return;

            // Add to in-memory list and re-render options so it appears immediately
            if (!graphs.includes(val)) graphs.push(val);
            e.target.innerHTML = renderSelect(graphs, val);
        }

        // Save and switch — don't rebuild the entire switcher, just update state
        setGraphId(val);
        await refreshGraph();

        // Update the selected option to match new workspace
        const sel = document.getElementById('ws-select');
        if (sel) {
            if (!graphs.includes(val)) {
                graphs.push(val);
                sel.innerHTML = renderSelect(graphs, val);
            } else {
                sel.value = val;
            }
        }
    };
}

// ── Label toggle button ───────────────────────────────────────────────────
window.toggleLabels = () => {
    state.labelsVisible = !state.labelsVisible;
    const btn = document.getElementById('btn-toggle-labels');
    const on  = state.labelsVisible;
    Graph.setLabelsVisible(on);
    if (btn) {
        btn.textContent = on ? '🏷 Labels' : '🏷 Labels (off)';
        btn.classList.toggle('active', !on);
    }
};

function injectLabelToggleBtn() {
    if (document.getElementById('btn-toggle-labels')) return;
    const saveBtn = document.getElementById('btn-save-positions');
    if (!saveBtn) return;
    const btn = document.createElement('button');
    btn.id          = 'btn-toggle-labels';
    btn.textContent = '🏷 Labels';
    btn.title       = 'Toggle node labels — hover still shows label';
    btn.className   = saveBtn.className;
    btn.onclick     = () => window.toggleLabels();
    saveBtn.parentElement.insertBefore(btn, saveBtn.nextSibling);
}

function injectDiscussionBtn() {
    if (document.getElementById('btn-discussion-mode')) return;
    const saveBtn = document.getElementById('btn-save-positions');
    if (!saveBtn) return;
    const btn = document.createElement('button');
    btn.id          = 'btn-discussion-mode';
    btn.textContent = '⬡ Discussion';
    btn.title       = 'Create a Discussion Node — click nodes to select members';
    btn.className   = saveBtn.className;   // inherits action-btn styles
    btn.onclick     = () => window.dispatch('CREATE_DISCUSSION_NODE');
    // Insert after the label toggle button (or after saveBtn if label btn not present)
    const anchor = document.getElementById('btn-toggle-labels') || saveBtn;
    anchor.parentElement.insertBefore(btn, anchor.nextSibling);
}

// Initial load — run once after the DOM is ready
// (module scripts execute after HTML is parsed, so DOMContentLoaded
//  may have already fired; we call directly and also register as fallback)
function _initUI() {
    injectLabelToggleBtn();
    injectDiscussionBtn();
    initWorkspaceSwitcher();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _initUI);
} else {
    _initUI();
}
initSubnodeRaycaster(); // ← add this

refreshGraph();