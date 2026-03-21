import { TYPE_COLORS, REL_COLORS } from '../../graph-component.js';

export function initLegends() {
    const nLegend = document.getElementById('node-legend');
    const rLegend = document.getElementById('rel-legend');

    nLegend.innerHTML = Object.entries(TYPE_COLORS).map(([type, color]) => `
        <div class="legend-item"><span class="dot" style="background:${color}"></span> ${type}</div>
    `).join('');

    const seen = new Set();
    rLegend.innerHTML = Object.entries(REL_COLORS)
        .filter(([type]) => {
            const base = type.replace(/S$/, '');
            if (seen.has(base)) return false;
            seen.add(base);
            return true;
        })
        .map(([type, color]) => `
            <div class="legend-item"><span class="dot" style="background:${color}"></span> ${type.toLowerCase()}</div>
        `).join('');
}

export function setupSearch(nodes, onSelect) {
    const input   = document.getElementById('node-search');
    const results = document.getElementById('search-results');

    input.oninput = (e) => {
        const val = e.target.value.toLowerCase();
        if (!val) { results.innerHTML = ''; return; }

        const matches = nodes
            .filter(n => (n.content || n.name || '').toLowerCase().includes(val))
            .slice(0, 5);

        results.innerHTML = matches.map(m => `
            <div class="search-item" data-id="${m.id}">${m.content || m.name}</div>
        `).join('');

        results.querySelectorAll('.search-item').forEach(el => {
            el.onclick = () => {
                onSelect(el.dataset.id);
                results.innerHTML = '';
                input.value = '';
            };
        });
    };
}

export function setLinkModeStatus(msg) {
    const indicator = document.getElementById('link-mode-indicator');
    if (msg) {
        indicator.style.display = 'block';
        indicator.innerText = msg;
    } else {
        indicator.style.display = 'none';
    }
}