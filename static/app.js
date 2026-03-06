import { createGraph } from './graph-component.js';
import { UI } from './ui-components.js';

const state = {
    selectedNode: null,
    isLinkMode: false,
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
    // Find the real node with x/y/z coords — try id, node_id, and code
    const fullNode = (state.graphData?.nodes || []).find(n => 
        n.id === node.id || n.node_id === node.node_id || n.node_id === node.code
    ) || node;
    state.selectedNode = fullNode;

    console.log('flying to node:', fullNode);

    // Fly camera to the node
    flyToNode(fullNode);

    // Fetch neighbors — use whatever id field is available
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

// Optional: link click handler
function handleLinkClick(link) {
    console.log("Link clicked:", link);
}

// -------------------------
// Refresh Graph Data
// -------------------------
async function refreshGraph() {
    const res = await fetch('/graph/3d-json');
    const data = await res.json();

    // Store in state so handleNodeClick can resolve coords
    state.graphData = data;

    Graph.graphData(data);

    // Initialize legends
    UI.initLegends();

    // Search functionality
    UI.setupSearch(data.nodes, (nodeId) => {
        const node = data.nodes.find(n => n.id === nodeId);
        if (!node) return;
        flyToNode(node, 3000);
    });

    // -------------------------
    // Time Slider
    // -------------------------
    const slider = document.getElementById('time-slider');

    if (slider) {
        slider.oninput = (e) => {
            const val = e.target.value;

            document.getElementById('current-time').innerText =
                `T-${100 - val}%`;

            const threshold = (val / 100) * data.links.length;

            const filteredLinks = data.links.slice(0, Math.floor(threshold));

            Graph.graphData({
                nodes: data.nodes,
                links: filteredLinks
            });
        };
    }
}

// -------------------------
// Global Dispatcher
// -------------------------
window.dispatch = async (action, payload) => {

    if (action === 'DELETE_NODE') {
        await fetch(`/api/nodes/${payload}`, {
            method: 'DELETE'
        });

        document.getElementById('node-inspector').style.display = 'none';

        refreshGraph();
    }

    if (action === 'AI_CHALLENGE') {
        alert("Sending to LLM...");
        // Example future call
        // await fetch('/engine/ai/challenge', {method:'POST'})
    }
};

// Initial load
refreshGraph();