import { TYPE_COLORS, REL_COLORS } from './graph-component.js';

export const UI = {

    setLinkModeStatus(msg) {
        const indicator = document.getElementById('link-mode-indicator');
        if (msg) {
            indicator.style.display = 'block';
            indicator.innerText = msg;
        } else {
            indicator.style.display = 'none';
        }
    },

    renderAddNodeModal(onSubmit) {
        const existing = document.getElementById('add-node-modal');
        if (existing) existing.remove();

        const NODE_TYPES = ['Concept', 'Observation', 'Method', 'Reference', 'DraftFragment', 'Event'];

        const modal = document.createElement('div');
        modal.id = 'add-node-modal';
        modal.className = 'creation-modal-overlay';
        modal.innerHTML = `
            <div class="creation-modal">
                <div class="modal-header">
                    <span class="modal-tag">NEW NODE</span>
                    <button class="modal-close" id="add-node-close">✕</button>
                </div>
                <div class="modal-body">
                    <div class="field-group">
                        <label>Content <span class="req">*</span></label>
                        <textarea id="an-content" rows="3" placeholder="Describe this concept, observation, or event..."></textarea>
                    </div>
                    <div class="field-row">
                        <div class="field-group">
                            <label>Type <span class="req">*</span></label>
                            <select id="an-type">
                                ${NODE_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
                            </select>
                        </div>
                        <div class="field-group">
                            <label>Epoch From <span class="opt">(optional)</span></label>
                            <input type="number" id="an-valid-from" min="1" step="1" placeholder="e.g. 1">
                        </div>
                    </div>
                    <div class="field-group">
                        <label>Epoch To <span class="opt">(optional — leave blank if ongoing)</span></label>
                        <input type="number" id="an-valid-to" min="1" step="1" placeholder="e.g. 3">
                    </div>
                    <div id="an-error" class="modal-error" style="display:none"></div>
                </div>
                <div class="modal-footer">
                    <button class="modal-btn-cancel" id="add-node-cancel">Cancel</button>
                    <button class="modal-btn-confirm" id="add-node-submit">Create Node →</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('add-node-close').onclick = () => modal.remove();
        document.getElementById('add-node-cancel').onclick = () => modal.remove();
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

        document.getElementById('add-node-submit').onclick = async () => {
            const content = document.getElementById('an-content').value.trim();
            const parent_type = document.getElementById('an-type').value;
            const vf = document.getElementById('an-valid-from').value;
            const vt = document.getElementById('an-valid-to').value;
            const valid_from = vf ? parseInt(vf) : null;
            const valid_to = vt ? parseInt(vt) : null;

            if (!content) {
                const err = document.getElementById('an-error');
                err.textContent = 'Content is required.';
                err.style.display = 'block';
                return;
            }

            const btn = document.getElementById('add-node-submit');
            btn.textContent = 'Creating...';
            btn.disabled = true;

            const result = await onSubmit({ content, parent_type, valid_from, valid_to });
            modal.remove();

            const flash = document.createElement('div');
            flash.className = 'success-flash';
            flash.textContent = `Node ${result.node_id} created`;
            document.body.appendChild(flash);
            setTimeout(() => flash.remove(), 2500);
        };
    },

    renderRelationModal(sourceNode, targetNode, onSubmit) {
        const existing = document.getElementById('add-rel-modal');
        if (existing) existing.remove();

        const REL_TYPES = ['SUPPORTS', 'CONTRADICTS', 'REQUIRES', 'TRIGGERS', 'AMPLIFIES', 'DEPENDS_ON', 'HAS_VERSION', 'RELATES_TO'];
        const EVIDENCE_TYPES = ['theoretical', 'empirical', 'anecdotal', 'simulated', 'inferred'];
        const SCOPES = ['institutional', 'individual', 'systemic', 'temporal', 'cultural'];
        const STATUS_OPTS = ['CONFIRMED', 'PROVISIONAL', 'DISPUTED', 'DEPRECATED'];

        const modal = document.createElement('div');
        modal.id = 'add-rel-modal';
        modal.className = 'creation-modal-overlay';
        modal.innerHTML = `
            <div class="creation-modal creation-modal--wide">
                <div class="modal-header">
                    <span class="modal-tag">NEW RELATION</span>
                    <button class="modal-close" id="add-rel-close">✕</button>
                </div>
                <div class="relation-nodes-header">
                    <div class="rel-node-chip">${sourceNode.content || sourceNode.name}</div>
                    <div class="rel-arrow">→</div>
                    <div class="rel-node-chip">${targetNode.content || targetNode.name}</div>
                </div>
                <div class="modal-body">
                    <div class="field-row">
                        <div class="field-group">
                            <label>Relation Type <span class="req">*</span></label>
                            <select id="ar-rel-type">
                                ${REL_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
                            </select>
                        </div>
                        <div class="field-group">
                            <label>Status</label>
                            <select id="ar-status">
                                ${STATUS_OPTS.map(s => `<option value="${s}" ${s === 'CONFIRMED' ? 'selected' : ''}>${s}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="field-group">
                        <label>Justification <span class="opt">(optional)</span></label>
                        <textarea id="ar-justification" rows="2" placeholder="Why does this relation hold?"></textarea>
                    </div>
                    <div class="field-group">
                        <label>Mechanism <span class="opt">(optional)</span></label>
                        <textarea id="ar-mechanism" rows="2" placeholder="How does this relation work?"></textarea>
                    </div>
                    <div class="field-row">
                        <div class="field-group">
                            <label>Weight <span class="opt">(0–1)</span></label>
                            <div class="slider-row">
                                <input type="range" id="ar-weight" min="0" max="1" step="0.05" value="0.8">
                                <span id="ar-weight-val">0.80</span>
                            </div>
                        </div>
                        <div class="field-group">
                            <label>Confidence <span class="opt">(0–1)</span></label>
                            <div class="slider-row">
                                <input type="range" id="ar-confidence" min="0" max="1" step="0.05" value="0.75">
                                <span id="ar-confidence-val">0.75</span>
                            </div>
                        </div>
                    </div>
                    <div class="field-row">
                        <div class="field-group">
                            <label>Evidence Type <span class="opt">(optional)</span></label>
                            <select id="ar-evidence-type">
                                <option value="">— none —</option>
                                ${EVIDENCE_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
                            </select>
                        </div>
                        <div class="field-group">
                            <label>Scope <span class="opt">(optional)</span></label>
                            <select id="ar-scope">
                                <option value="">— none —</option>
                                ${SCOPES.map(s => `<option value="${s}">${s}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="field-row">
                        <div class="field-group">
                            <label>Epoch From <span class="opt">(optional)</span></label>
                            <input type="number" id="ar-valid-from" min="1" step="1" placeholder="e.g. 1">
                        </div>
                        <div class="field-group">
                            <label>Epoch To <span class="opt">(optional)</span></label>
                            <input type="number" id="ar-valid-to" min="1" step="1" placeholder="e.g. 3">
                        </div>
                    </div>
                    <div id="ar-error" class="modal-error" style="display:none"></div>
                </div>
                <div class="modal-footer">
                    <button class="modal-btn-cancel" id="add-rel-cancel">Cancel</button>
                    <button class="modal-btn-confirm" id="add-rel-submit">Create Relation →</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const wSlider = document.getElementById('ar-weight');
        const wVal = document.getElementById('ar-weight-val');
        wSlider.oninput = () => wVal.textContent = parseFloat(wSlider.value).toFixed(2);

        const cSlider = document.getElementById('ar-confidence');
        const cVal = document.getElementById('ar-confidence-val');
        cSlider.oninput = () => cVal.textContent = parseFloat(cSlider.value).toFixed(2);

        document.getElementById('add-rel-close').onclick = () => modal.remove();
        document.getElementById('add-rel-cancel').onclick = () => modal.remove();
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

        const getColor = (relType) => {
            const COLORS = {
                SUPPORTS: '#00c8a0', CONTRADICTS: '#ff5a5a',
                HAS_VERSION: '#8896b8', TRIGGERS: '#e85090',
                AMPLIFIES: '#ffa500', DEPENDS_ON: '#6622aa',
                REQUIRES: '#6622aa', RELATES_TO: '#8896b8'
            };
            return COLORS[relType] || '#445070';
        };

        document.getElementById('add-rel-submit').onclick = async () => {
            const rel_type = document.getElementById('ar-rel-type').value;
            const status = document.getElementById('ar-status').value;
            const justification = document.getElementById('ar-justification').value.trim();
            const mechanism = document.getElementById('ar-mechanism').value.trim();
            const weight = parseFloat(document.getElementById('ar-weight').value);
            const confidence = parseFloat(document.getElementById('ar-confidence').value);
            const evidence_type = document.getElementById('ar-evidence-type').value || null;
            const scope = document.getElementById('ar-scope').value || null;
            const vf = document.getElementById('ar-valid-from').value;
            const vt = document.getElementById('ar-valid-to').value;
            const valid_from = vf ? parseInt(vf) : null;
            const valid_to = vt ? parseInt(vt) : null;

            const btn = document.getElementById('add-rel-submit');
            btn.textContent = 'Creating...';
            btn.disabled = true;

            await onSubmit({
                node_a: sourceNode.id,
                node_b: targetNode.id,
                rel_type,
                justification,
                mechanism,
                color: getColor(rel_type),
                weight,
                confidence,
                evidence_type,
                scope,
                status,
                valid_from,
                valid_to,
            });

            modal.remove();

            const flash = document.createElement('div');
            flash.className = 'success-flash';
            flash.textContent = `Relation ${rel_type} created`;
            document.body.appendChild(flash);
            setTimeout(() => flash.remove(), 2500);
        };
    },

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
            <button class="ai-btn" onclick="window.dispatch('AI_CHALLENGE', '${node.id || node.node_id}')">
                Challenge Concept
            </button>
            <button class="delete-btn" onclick="window.__confirmDelete()">
                Delete
            </button>
        `;

        const el = document.getElementById('node-inspector');
        el.innerHTML = content;
        el.style.display = 'block';

        window.__inspectNode = (code) => {
            const fakeNode = neighbors.find(nb => nb.code === code);
            if (fakeNode) onNodeClick(fakeNode);
        };

        window.__confirmDelete = () => {
            const existing = document.getElementById('delete-confirm-modal');
            if (existing) existing.remove();

            const nodeId = node.id || node.node_id;
            const nodeName = node.content || node.name || 'this node';

            const modal = document.createElement('div');
            modal.id = 'delete-confirm-modal';
            modal.style.cssText = `
                position: fixed; inset: 0; z-index: 9999;
                background: rgba(0,0,0,0.6);
                display: flex; align-items: center; justify-content: center;
                backdrop-filter: blur(4px);
            `;
            modal.innerHTML = `
                <div style="
                    background: #0a0c12;
                    border: 1px solid #ff5a5a;
                    border-radius: 12px;
                    padding: 28px 32px;
                    max-width: 380px;
                    width: 90%;
                    font-family: 'Syne', sans-serif;
                ">
                    <div style="color:#ff5a5a; font-size:11px; letter-spacing:0.1em; margin-bottom:10px;">CONFIRM DELETE</div>
                    <div style="color:white; font-weight:700; font-size:15px; margin-bottom:8px;">${nodeName}</div>
                    <div style="color:#8e99b3; font-size:12px; margin-bottom:24px; line-height:1.6;">
                        This will permanently delete this node and <strong style="color:white">all its relations</strong>. This cannot be undone.
                    </div>
                    <div style="display:flex; gap:10px;">
                        <button id="modal-cancel-btn" style="
                            flex:1; padding:10px; border-radius:6px;
                            background: transparent; border: 1px solid #161b29;
                            color: #8e99b3; cursor:pointer; font-family:inherit; font-size:13px;
                        ">Cancel</button>
                        <button id="modal-confirm-btn" style="
                            flex:1; padding:10px; border-radius:6px;
                            background: #ff5a5a22; border: 1px solid #ff5a5a;
                            color: #ff5a5a; cursor:pointer; font-family:inherit; font-size:13px; font-weight:600;
                        ">Delete Node</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            document.getElementById('modal-cancel-btn').onclick = () => modal.remove();
            document.getElementById('modal-confirm-btn').onclick = () => {
                modal.remove();
                window.dispatch('DELETE_NODE', nodeId);
            };
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.remove();
            });
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