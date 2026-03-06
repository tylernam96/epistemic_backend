import { TYPE_COLORS, REL_COLORS } from './graph-component.js';

export const UI = {

    renderNodeInspector(node, neighbors, onNodeClick) {
        const content = `
            <div class="insp-header">
                <h2 style="color:white">${node.content || node.name}</h2>
                <span class="code-badge">${node.node_id || ''}</span>
            </div>
            <div class="neighbor-list">
                ${neighbors.map(nb => `
                    <div class="neighbor-card">
                        <div style="color:${REL_COLORS[(nb.rel_type || '').toUpperCase().trim()] || '#ffffff'}; font-size:10px; font-weight:600; letter-spacing:0.05em;">${nb.rel_type}</div>
                        <div class="nb-name" style="cursor:pointer; font-weight:bold;" onclick="window.__inspectNode('${nb.code}')">${nb.name}</div>
                        <div style="font-size:11px; margin-top:5px;">${nb.justification || ''}</div>
                    </div>
                `).join('')}
            </div>
            <button class="ai-btn" onclick="window.dispatch('AI_CHALLENGE', '${node.id}')">
                Challenge Concept
            </button>
            <button class="delete-btn" onclick="window.dispatch('DELETE_NODE', '${node.id}')">
                Delete
            </button>
        `;

        const el = document.getElementById('node-inspector');
        el.innerHTML = content;
        el.style.display = 'block';

        // Register global handler so inline onclick can call back into app
        window.__inspectNode = (code) => {
            const fakeNode = neighbors.find(nb => nb.code === code);
            console.log('__inspectNode called with:', code, '→ found:', fakeNode);
            if (fakeNode) onNodeClick(fakeNode);
        };
    },

    initLegends() {
        const nLegend = document.getElementById('node-legend');
        const rLegend = document.getElementById('rel-legend');

        nLegend.innerHTML = Object.entries(TYPE_COLORS).map(([type, color]) => `
            <div class="legend-item">
                <span class="dot" style="background:${color}"></span> ${type}
            </div>
        `).join('');

        rLegend.innerHTML = Object.entries(REL_COLORS).map(([type, color]) => `
            <div class="legend-item">
                <span class="dot" style="background:${color}"></span> ${type.toLowerCase()}
            </div>
        `).join('');
    },

    setupSearch(nodes, onSelect) {
        const input = document.getElementById('node-search');
        const results = document.getElementById('search-results');

        input.oninput = (e) => {
            const val = e.target.value.toLowerCase();
            if (!val) {
                results.innerHTML = '';
                return;
            }

            const matches = nodes
                .filter(n => (n.content || n.name || "").toLowerCase().includes(val))
                .slice(0, 5);

            results.innerHTML = matches.map(m => `
                <div class="search-item" data-id="${m.id}">
                    ${m.content || m.name}
                </div>
            `).join('');

            // Click to fly to node
            document.querySelectorAll('.search-item').forEach(el => {
                el.onclick = () => {
                    onSelect(el.dataset.id);
                    results.innerHTML = '';
                    input.value = '';
                };
            });
        };
    }

};