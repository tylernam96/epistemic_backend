import { createGraph } from './graph-component.js';
import { UI } from './ui-components.js';

const state = {
    selectedNode: null,
    isLinkMode: false,
    linkSource: null,
    graphData: null
};

// Initialize Graph
const Graph = createGraph(
    '3d-graph',
    async (node) => handleNodeClick(node),
    (link) => handleLinkClick(link)
);

// -------------------------
// Fly To Node
// -------------------------
function flyToNode(node, duration = 2000) {
    const distance = 60;
    const distRatio = 1 + distance / Math.hypot(node.x || 1, node.y || 1, node.z || 1);

    Graph.cameraPosition(
        {
            x: node.x * distRatio,
            y: node.y * distRatio,
            z: node.z * distRatio
        },
        node,
        duration
    );
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
    console.log("Link clicked:", link);
}

// -------------------------
// Refresh Graph Data
// -------------------------
async function refreshGraph() {
    const res = await fetch('/graph/3d-json');
    const data = await res.json();

    state.graphData = data;
    Graph.graphData(data);

    UI.initLegends();

    UI.setupSearch(data.nodes, (nodeId) => {
        const node = data.nodes.find(n => n.id === nodeId);
        if (!node) return;
        flyToNode(node, 3000);
    });

    // -------------------------
    // Epoch Slider
    // -------------------------
    const slider = document.getElementById('time-slider');
    const timeLabel = document.getElementById('current-time');

    if (slider) {
        // Find the max epoch across all nodes and links
        const allEpochs = [
            ...data.nodes.map(n => n.valid_from).filter(v => v != null),
            ...data.links.map(l => l.valid_from).filter(v => v != null),
        ];
        const maxEpoch = allEpochs.length > 0 ? Math.max(...allEpochs) : 1;

        // Set slider range to match actual epoch range
        slider.min = 1;
        slider.max = maxEpoch;
        slider.value = maxEpoch;
        timeLabel.innerText = `Epoch ${maxEpoch}`;

        slider.oninput = (e) => {
            const epoch = parseInt(e.target.value);
            timeLabel.innerText = `Epoch ${epoch}`;

            const filteredNodes = data.nodes.filter(n =>
                n.valid_from == null || n.valid_from <= epoch
            );
            const filteredLinks = data.links.filter(l =>
                l.valid_from == null || l.valid_from <= epoch
            );

            Graph.graphData({ nodes: filteredNodes, links: filteredLinks });
        };
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
        alert("Sending to LLM...");
    }
};

// Initial load
refreshGraph();