import { TYPE_COLORS } from '../../graph-component.js';
import { showFlash } from '../utils/flash.js';
import { cosineSimilarity } from '../utils/colors.js';
import { suggestPositionFromSimilarity, repelFromOverlap, placeOpposite } from '../utils/placement.js';

// All 20 valid relation types
const ALL_REL_TYPES = [
    'SUPPORTS', 'CONTRADICTS', 'RELATES_TO', 'DEPENDS_ON', 'TRIGGERS',
    'AMPLIFIES', 'REQUIRES', 'HAS_VERSION', 'DISCUSSES', 'FRICTION',
    'DETERRITORIALIZES', 'RETERRITORIALIZES', 'OPENS_INTO', 'SEDIMENTS_INTO',
    'HAUNTS', 'CONTAMINATES', 'SUPPLEMENTS', 'RESONATES_WITH', 'INTENSIFIES', 'SUSPENDS'
];

// Color per rel type for visual clarity
const REL_TYPE_COLORS = {
    SUPPORTS: '#00c8a0', CONTRADICTS: '#ff5a5a', RELATES_TO: '#8896b8',
    DEPENDS_ON: '#6622aa', TRIGGERS: '#e85090', AMPLIFIES: '#ffa500',
    REQUIRES: '#6622aa', HAS_VERSION: '#8896b8', DISCUSSES: '#b03070',
    FRICTION: '#e85090', DETERRITORIALIZES: '#a78bfa', RETERRITORIALIZES: '#818cf8',
    OPENS_INTO: '#c084fc', SEDIMENTS_INTO: '#60a5fa', HAUNTS: '#6366f1',
    CONTAMINATES: '#f59e0b', SUPPLEMENTS: '#34d399', RESONATES_WITH: '#00c8a0',
    INTENSIFIES: '#fbbf24', SUSPENDS: '#94a3b8',
};

function relColor(type) {
    return REL_TYPE_COLORS[(type || '').toUpperCase()] || '#8896b8';
}

export function renderAddNodeModal(onSubmit, existingNodes = [], existingRelations = []) {
    document.getElementById('add-node-modal')?.remove();

    const NODE_TYPES = Object.keys(TYPE_COLORS);
    const modal = document.createElement('div');
    modal.id = 'add-node-modal';
    modal.className = 'creation-modal-overlay';

    let subnodes = [];

    modal.innerHTML = `
        <div class="creation-modal">
            <div class="modal-header">
                <span class="modal-tag">NEW NODE</span>
                <button class="modal-close" id="add-node-close">&#x2715;</button>
            </div>
            <div class="modal-body">
                <div class="field-group">
                    <label>Title <span class="opt">(shows above node)</span></label>
                    <input type="text" id="an-title" placeholder="Node title..." style="margin-bottom:10px;">
                </div>

                <div class="field-group">
                    <label>Description <span class="req">*</span></label>
                    <textarea id="an-content" rows="3" placeholder="Describe this concept, observation, or event..."></textarea>

                    <!-- Placement reasoning box -->
                    <div id="an-suggestion" style="display:none; margin-top:10px; background:rgba(0,200,160,0.03); border:1px solid rgba(0,200,160,0.15); border-radius:8px; overflow:hidden;">
                        <div style="padding:10px 14px; background:rgba(0,200,160,0.02); border-bottom:1px solid rgba(0,200,160,0.08);">
                            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
                                <span style="color:var(--concept); font-size:10px; font-weight:600; letter-spacing:0.05em;">✨ PLACEMENT REASONING</span>
                                <span id="an-confidence" style="font-size:10px; color:#445070; font-family:'DM Mono',monospace;"></span>
                            </div>
                            <!-- Explanation always visible, no hover needed -->
                            <div id="an-explanation" style="font-size:11px; color:#8e99b3; line-height:1.6; font-family:'DM Mono',monospace; white-space:pre-wrap; max-height:80px; overflow-y:auto;"></div>
                        </div>
                        <div style="padding:8px 14px; display:flex; align-items:center; justify-content:space-between; background:rgba(0,0,0,0.15);">
                            <span id="an-coords" style="font-size:10px; color:#445070; font-family:'DM Mono',monospace;">x: — y: —</span>
                            <button id="an-use-suggestion" style="background:rgba(0,200,160,0.1); border:1px solid rgba(0,200,160,0.4); color:var(--concept); border-radius:4px; padding:5px 14px; font-size:10px; cursor:pointer; font-family:'DM Mono',monospace; font-weight:600;">Use This Position</button>
                        </div>
                    </div>

                    <!-- Suggested relations -->
                    <div id="an-relations" style="display:none; margin-top:8px; border:1px solid rgba(0,200,160,0.15); border-radius:8px; overflow:hidden;">
                        <div style="padding:8px 12px; background:rgba(0,200,160,0.03); border-bottom:1px solid rgba(0,200,160,0.08); display:flex; align-items:center; justify-content:space-between;">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span style="font-size:10px; color:#00c8a0; font-weight:600; letter-spacing:0.06em;">🔮 SUGGESTED RELATIONS</span>
                                <span style="font-size:9px; color:#445070;">checked = will be created</span>
                            </div>
                            <span id="an-rel-status" style="font-size:9px; color:#445070; font-family:'DM Mono',monospace;"></span>
                        </div>
                        <div id="an-relations-list" style="padding:8px; display:flex; flex-direction:column; gap:6px; max-height:220px; overflow-y:auto;"></div>
                    </div>
                </div>

                <div class="field-group">
                    <label style="display:flex; align-items:center; justify-content:space-between;">
                        <span>Subnodes <span class="opt">(hidden until node is clicked)</span></span>
                        <button id="add-subnode-btn" type="button" style="background:rgba(0,200,160,0.08); border:1px solid rgba(0,200,160,0.3); color:var(--concept); border-radius:4px; padding:4px 10px; font-size:10px; cursor:pointer; font-family:'DM Mono',monospace;">+ Add Subnode</button>
                    </label>
                    <div id="subnodes-container" style="margin-top:8px; display:flex; flex-direction:column; gap:8px;"></div>
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
                    <label>Epoch To <span class="opt">(optional)</span></label>
                    <input type="number" id="an-valid-to" min="1" step="1" placeholder="e.g. 3">
                </div>
                <div class="field-group">
                    <label>Position <span class="opt">(leave blank for AI-suggested)</span></label>
                    <div class="field-row">
                        <input type="number" id="an-x" step="any" placeholder="X">
                        <input type="number" id="an-y" step="any" placeholder="Y">
                        <input type="number" id="an-z" step="any" placeholder="Z override">
                    </div>
                </div>
                <div id="an-error" class="modal-error" style="display:none"></div>
            </div>
            <div class="modal-footer">
                <button class="modal-btn-cancel" id="add-node-cancel">Cancel</button>
                <button class="modal-btn-confirm" id="add-node-submit">Create Node &#x2192;</button>
            </div>
        </div>`;

    document.body.appendChild(modal);

    // ── Subnodes ──────────────────────────────────────────────────────────────
    function renderSubnodes() {
        const container = document.getElementById('subnodes-container');
        if (!subnodes.length) {
            container.innerHTML = '<div style="color:#445070; font-size:11px; font-family:\'DM Mono\',monospace; padding:8px;">No subnodes yet — click "+ Add Subnode" to create one</div>';
            return;
        }
        container.innerHTML = subnodes.map((subnode, idx) => `
            <div style="background:rgba(255,255,255,0.02); border:1px solid #1e2535; border-radius:6px; padding:10px;">
                <div style="display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:8px;">
                    <div style="flex:1;">
                        <input type="text" data-subnode-idx="${idx}" data-field="title" value="${subnode.title}" placeholder="Subnode title..." style="width:100%; background:#0c0e16; border:1px solid #1e2535; border-radius:4px; color:#c8d0e0; font-family:'DM Mono',monospace; font-size:11px; padding:6px 8px; margin-bottom:6px;">
                        <textarea data-subnode-idx="${idx}" data-field="description" rows="2" placeholder="Subnode description..." style="width:100%; background:#0c0e16; border:1px solid #1e2535; border-radius:4px; color:#c8d0e0; font-family:'DM Mono',monospace; font-size:11px; padding:6px 8px; resize:none;">${subnode.description}</textarea>
                    </div>
                    <button data-remove-subnode="${idx}" style="background:none; border:1px solid rgba(255,90,90,0.25); color:rgba(255,90,90,0.5); border-radius:4px; padding:4px 8px; font-size:10px; cursor:pointer; margin-left:8px; flex-shrink:0;">✕</button>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <label style="color:#445070; font-size:10px; font-family:'DM Mono',monospace; flex-shrink:0;">Strength:</label>
                    <input type="range" data-subnode-idx="${idx}" data-field="strength" min="1" max="100" value="${subnode.strength}" style="flex:1;">
                    <span data-strength-display="${idx}" style="color:var(--concept); font-size:10px; font-family:'DM Mono',monospace; width:40px; text-align:right;">${subnode.strength}</span>
                </div>
            </div>
        `).join('');

        container.querySelectorAll('input[data-subnode-idx], textarea[data-subnode-idx]').forEach(el => {
            const idx   = parseInt(el.dataset.subnodeIdx);
            const field = el.dataset.field;
            if (field === 'strength') {
                el.oninput = (e) => {
                    subnodes[idx].strength = parseInt(e.target.value);
                    const display = container.querySelector(`[data-strength-display="${idx}"]`);
                    if (display) display.textContent = e.target.value;
                };
            } else {
                el.oninput = (e) => { subnodes[idx][field] = e.target.value; };
            }
        });

        container.querySelectorAll('[data-remove-subnode]').forEach(btn => {
            btn.onclick = () => {
                subnodes.splice(parseInt(btn.dataset.removeSubnode), 1);
                renderSubnodes();
            };
        });
    }

    document.getElementById('add-subnode-btn').onclick = () => {
        subnodes.push({ title: '', description: '', strength: 50 });
        renderSubnodes();
    };
    renderSubnodes();

    // ── Suggestion + Relation prediction ─────────────────────────────────────
    const contentInput     = document.getElementById('an-content');
    const suggestionDiv    = document.getElementById('an-suggestion');
    const explanationEl    = document.getElementById('an-explanation');
    const confidenceEl     = document.getElementById('an-confidence');
    const coordsEl         = document.getElementById('an-coords');
    const useSuggestionBtn = document.getElementById('an-use-suggestion');
    const xInput           = document.getElementById('an-x');
    const yInput           = document.getElementById('an-y');
    const submitBtn        = document.getElementById('add-node-submit');
    let suggestionTimeout, currentSuggestion = null;
    let _predictionPending = false;

    function _setSubmitReady() {
        submitBtn.disabled     = false;
        submitBtn.textContent  = 'Create Node →';
        submitBtn.style.opacity = '1';
        _predictionPending = false;
    }

    function _setSubmitWaiting() {
        submitBtn.disabled     = true;
        submitBtn.textContent  = '⟳ Predicting relations…';
        submitBtn.style.opacity = '0.6';
        _predictionPending = true;
    }

    contentInput.addEventListener('input', () => {
        clearTimeout(suggestionTimeout);
        suggestionDiv.style.display = 'none';
        suggestionTimeout = setTimeout(async () => {
            const content = contentInput.value.trim();
            if (content.length < 15) { suggestionDiv.style.display = 'none'; return; }

            // Show placement loading
            explanationEl.textContent = '🔍 Analyzing semantic relationships…';
            confidenceEl.textContent  = '';
            coordsEl.textContent      = 'x: — y: —';
            suggestionDiv.style.display = 'block';

            // Show relation loading + disable submit
            const relDiv    = document.getElementById('an-relations');
            const relList   = document.getElementById('an-relations-list');
            const relStatus = document.getElementById('an-rel-status');
            relDiv.style.display = 'block';
            relList.innerHTML    = '<div style="padding:6px 2px; font-size:10px; color:#445070; font-family:\'DM Mono\',monospace;">⟳ Predicting relations…</div>';
            _setSubmitWaiting();

            const parentType = document.getElementById('an-type').value;

            // Run placement + prediction in parallel
let enrichedNodes = existingNodes;
try {
    const embRes = await fetch('/api/nodes/embeddings');
    const { nodes: embNodes } = await embRes.json();
    const embMap = {};
    for (const n of embNodes) {
        if (n.node_id) embMap[n.node_id] = n.embedding;
        if (n.id)      embMap[n.id]      = n.embedding;
    }
    enrichedNodes = existingNodes.map(n => ({
        ...n,
        embedding: embMap[n.node_id] || embMap[n.id] || n.embedding || [],
    }));
    console.log('Enriched:', enrichedNodes.filter(n => n.embedding?.length > 0).length, 'of', enrichedNodes.length);
} catch (e) {
    console.warn('Could not enrich embeddings for placement:', e);
}

const [suggestion] = await Promise.all([
    suggestPositionFromSimilarity(content, enrichedNodes),
                // Relation prediction runs inside its own try/catch below
                (async () => {
                    try {
                        const resp = await fetch('/api/relations/predict', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                content,
                                parent_type: parentType,
                                existing_nodes: existingNodes.map(n => ({
                                    id: n.id,
                                    node_id: n.node_id,
                                    content: n.content || n.name || '',
                                    parent_type: n.parent_type || n.node_type || 'Concept',
                                    embedding: n.embedding,
                                })),
                            }),
                        });

                        if (!resp.ok) throw new Error('Prediction failed');
                        const predictionData = await resp.json();
                        const rels = predictionData.relations || [];

                        if (!currentSuggestion) currentSuggestion = {};
                        currentSuggestion._pendingRels  = rels;
                        currentSuggestion._relAccepted  = new Set(rels.map((_, i) => i));

                        if (!rels.length) {
                            relDiv.style.display = 'none';
                            _setSubmitReady();
                            return;
                        }

                        // Render relation cards
                        relList.innerHTML = rels.map((rel, i) => {
                            const targetNode = existingNodes.find(n => n.node_id === rel.target_node_id);
                            const targetName = targetNode
                                ? (targetNode.title || targetNode.content || targetNode.name || '').slice(0, 50)
                                : rel.target_node_id;
                            const color    = relColor(rel.rel_type);
                            const confPct  = Math.round((rel.confidence || 0.7) * 100);

                            return `
                            <div data-rel-idx="${i}" style="
                                background: rgba(255,255,255,0.02);
                                border: 1px solid rgba(255,255,255,0.06);
                                border-left: 3px solid ${color};
                                border-radius: 6px;
                                padding: 8px 10px;
                                transition: background 0.15s;
                            ">
                                <!-- Header row: rel type + confidence + checkbox -->
                                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:5px;">
                                    <div style="display:flex; align-items:center; gap:6px;">
                                        <span style="font-size:10px; font-weight:700; color:${color}; letter-spacing:0.06em;">${rel.rel_type}</span>
                                        <span style="font-size:9px; color:#445070; font-family:'DM Mono',monospace;">${confPct}% confidence</span>
                                    </div>
                                    <label style="display:flex; align-items:center; gap:5px; cursor:pointer; flex-shrink:0;">
                                        <input type="checkbox" data-rel-check="${i}" checked
                                            style="width:14px; height:14px; cursor:pointer; accent-color:${color};">
                                        <span style="font-size:9px; color:#445070;">include</span>
                                    </label>
                                </div>

                                <!-- Target node name -->
                                <div style="font-size:11px; color:#c8d0e0; margin-bottom:4px; font-family:'DM Mono',monospace;">
                                    → <span style="color:#e0e8ff;">${targetName}</span>
                                </div>

                                <!-- AI justification — always visible -->
                                <div style="font-size:10px; color:#6a7a9a; line-height:1.5; font-family:'DM Mono',monospace; border-top:1px solid rgba(255,255,255,0.04); padding-top:5px; margin-top:2px;">
                                    ${rel.justification || ''}
                                </div>
                            </div>`;
                        }).join('');

                        if (relStatus) relStatus.textContent = `${rels.length} suggested`;

                        // Checkbox toggle listeners
                        relList.querySelectorAll('[data-rel-check]').forEach(cb => {
                            const i = parseInt(cb.dataset.relCheck);
                            cb.onchange = () => {
                                if (cb.checked) currentSuggestion._relAccepted.add(i);
                                else currentSuggestion._relAccepted.delete(i);
                            };
                            // Clicking the whole card toggles the checkbox too
                            cb.closest('[data-rel-idx]').onclick = (e) => {
                                if (e.target === cb) return; // avoid double-toggle
                                cb.checked = !cb.checked;
                                cb.onchange();
                            };
                        });

                        _setSubmitReady();

                    } catch (err) {
                        console.warn('Relation prediction failed:', err);
                        relDiv.style.display = 'none';
                        _setSubmitReady();
                    }
                })(),
            ]);

            // Store suggestion for position use
            currentSuggestion = { ...(currentSuggestion || {}), ...suggestion };

            // Update placement UI
            if (!suggestion.x) {
                explanationEl.textContent = suggestion.explanation || 'Could not generate suggestion.';
                coordsEl.textContent      = 'x: — y: —';
                useSuggestionBtn.style.opacity      = '0.4';
                useSuggestionBtn.style.pointerEvents = 'none';
            } else {
                explanationEl.textContent = suggestion.explanation || 'Position calculated from semantic similarity.';
                confidenceEl.textContent  = suggestion.label || '';
                coordsEl.textContent      = `x: ${suggestion.x.toFixed(1)}  y: ${suggestion.y.toFixed(1)}`;
                useSuggestionBtn.style.opacity      = '1';
                useSuggestionBtn.style.pointerEvents = 'auto';
            }

        }, 800);
    });

    useSuggestionBtn.onclick = () => {
        if (!currentSuggestion?.x) return;
        xInput.value = currentSuggestion.x.toFixed(2);
        yInput.value = currentSuggestion.y.toFixed(2);
    };

    // ── Close ─────────────────────────────────────────────────────────────────
    const close = () => { window.clearSuggestedPosition?.(); modal.remove(); };
    document.getElementById('add-node-close').onclick  = close;
    document.getElementById('add-node-cancel').onclick = close;
    modal.addEventListener('click', e => { if (e.target === modal) close(); });

    // ── Submit ────────────────────────────────────────────────────────────────
    submitBtn.onclick = async () => {
        const content = contentInput.value.trim();
        if (!content) {
            const err = document.getElementById('an-error');
            err.textContent  = 'Description is required.';
            err.style.display = 'block';
            return;
        }

        submitBtn.textContent = 'Creating…';
        submitBtn.disabled    = true;

        const title = document.getElementById('an-title').value.trim();
        const xv    = document.getElementById('an-x').value;
        const yv    = document.getElementById('an-y').value;
        const zv    = document.getElementById('an-z').value;
        const vf    = document.getElementById('an-valid-from').value;
        const vt    = document.getElementById('an-valid-to').value;

        const acceptedRelations = (currentSuggestion?._pendingRels || [])
            .filter((_, i) => currentSuggestion?._relAccepted?.has(i));

        try {
            const result = await onSubmit({
                title,
                content,
                parent_type: document.getElementById('an-type').value,
                valid_from:  vf ? parseInt(vf) : null,
                valid_to:    vt ? parseInt(vt) : null,
                x:           xv !== '' ? parseFloat(xv) : (currentSuggestion?.x ?? null),
                y:           yv !== '' ? parseFloat(yv) : (currentSuggestion?.y ?? null),
                z:           zv !== '' ? parseFloat(zv) : null,
                subnodes:    subnodes.filter(s => s.title.trim() || s.description.trim()),
            }, { ...(currentSuggestion || {}), acceptedRelations });

            window.clearSuggestedPosition?.();
            modal.remove();
            showFlash(`Node ${result.node_id} created`);
        } catch (err) {
            console.error('Node creation error:', err);
            submitBtn.textContent = 'Create Node →';
            submitBtn.disabled    = false;
            const errEl = document.getElementById('an-error');
            errEl.textContent  = err.message || 'Failed to create node.';
            errEl.style.display = 'block';
        }
    };
}

export function renderEditNodeModal(node, onSubmit) {
    document.getElementById('edit-node-modal')?.remove();

    const NODE_TYPES  = Object.keys(TYPE_COLORS);
    const currentType = node.parent_type || node.node_type || 'Concept';

    let subnodes = [];
    if (node.subnodes && Array.isArray(node.subnodes)) {
        subnodes = node.subnodes.map(s => ({
            id:          s.id || null,
            title:       s.title || s.name || '',
            description: s.description || s.content || '',
            strength:    s.strength || 50,
        }));
    }

    const modal = document.createElement('div');
    modal.id = 'edit-node-modal';
    modal.className = 'creation-modal-overlay';
    modal.innerHTML = `
        <div class="creation-modal">
            <div class="modal-header">
                <span class="modal-tag">EDIT NODE</span>
                <span style="font-size:10px;color:#445070;font-family:'DM Mono',monospace;">${node.node_id || ''}</span>
                <button class="modal-close" id="edit-node-close">&#x2715;</button>
            </div>
            <div class="modal-body">
                <div class="field-group">
                    <label>Title <span class="opt">(shows above node)</span></label>
                    <input type="text" id="en-title" value="${node.title || ''}" style="margin-bottom:10px;">
                </div>

                <div class="field-group">
                    <label>Description <span class="req">*</span></label>
                    <textarea id="en-content" rows="4">${node.content || node.name || ''}</textarea>
                </div>

                <div class="field-group">
                    <label style="display:flex; align-items:center; justify-content:space-between;">
                        <span>Subnodes <span class="opt">(hidden until node is clicked)</span></span>
                        <button id="edit-add-subnode-btn" type="button" style="background:rgba(0,200,160,0.08); border:1px solid rgba(0,200,160,0.3); color:var(--concept); border-radius:4px; padding:4px 10px; font-size:10px; cursor:pointer; font-family:'DM Mono',monospace;">+ Add Subnode</button>
                    </label>
                    <div id="edit-subnodes-container" style="margin-top:8px; display:flex; flex-direction:column; gap:8px;"></div>
                </div>

                <div class="field-row">
                    <div class="field-group">
                        <label>Type</label>
                        <select id="en-type">
                            ${NODE_TYPES.map(t => `<option value="${t}" ${t === currentType ? 'selected' : ''}>${t}</option>`).join('')}
                        </select>
                    </div>
                    <div class="field-group">
                        <label>Epoch From <span class="opt">(optional)</span></label>
                        <input type="number" id="en-valid-from" min="1" step="1" value="${node.valid_from ?? ''}">
                    </div>
                </div>
                <div class="field-group">
                    <label>Epoch To <span class="opt">(optional)</span></label>
                    <input type="number" id="en-valid-to" min="1" step="1" value="${node.valid_to ?? ''}">
                </div>
                <div id="en-error" class="modal-error" style="display:none"></div>
            </div>
            <div class="modal-footer">
                <button class="modal-btn-cancel" id="edit-node-cancel">Cancel</button>
                <button class="modal-btn-confirm" id="edit-node-submit">Save Changes &#x2192;</button>
            </div>
        </div>`;

    document.body.appendChild(modal);

    // ── Edit subnodes ─────────────────────────────────────────────────────────
    function renderEditSubnodes() {
        const container = document.getElementById('edit-subnodes-container');
        if (!subnodes.length) {
            container.innerHTML = '<div style="color:#445070; font-size:11px; font-family:\'DM Mono\',monospace; padding:8px;">No subnodes — click "+ Add Subnode" to create one</div>';
            return;
        }
        container.innerHTML = subnodes.map((subnode, idx) => `
            <div style="background:rgba(255,255,255,0.02); border:1px solid #1e2535; border-radius:6px; padding:10px;">
                <div style="display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:8px;">
                    <div style="flex:1;">
                        <input type="text" data-edit-subnode-idx="${idx}" data-field="title" value="${subnode.title || ''}" placeholder="Subnode title..." style="width:100%; background:#0c0e16; border:1px solid #1e2535; border-radius:4px; color:#c8d0e0; font-family:'DM Mono',monospace; font-size:11px; padding:6px 8px; margin-bottom:6px;">
                        <textarea data-edit-subnode-idx="${idx}" data-field="description" rows="2" placeholder="Subnode description..." style="width:100%; background:#0c0e16; border:1px solid #1e2535; border-radius:4px; color:#c8d0e0; font-family:'DM Mono',monospace; font-size:11px; padding:6px 8px; resize:none;">${subnode.description || ''}</textarea>
                    </div>
                    <button data-edit-remove-subnode="${idx}" style="background:none; border:1px solid rgba(255,90,90,0.25); color:rgba(255,90,90,0.5); border-radius:4px; padding:4px 8px; font-size:10px; cursor:pointer; margin-left:8px; flex-shrink:0;">✕</button>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <label style="color:#445070; font-size:10px; font-family:'DM Mono',monospace; flex-shrink:0;">Strength:</label>
                    <input type="range" data-edit-subnode-idx="${idx}" data-field="strength" min="1" max="100" value="${subnode.strength || 50}" style="flex:1;">
                    <span data-edit-strength-display="${idx}" style="color:var(--concept); font-size:10px; font-family:'DM Mono',monospace; width:40px; text-align:right;">${subnode.strength || 50}</span>
                </div>
            </div>
        `).join('');

        container.querySelectorAll('input[data-edit-subnode-idx], textarea[data-edit-subnode-idx]').forEach(el => {
            const idx   = parseInt(el.dataset.editSubnodeIdx);
            const field = el.dataset.field;
            if (field === 'strength') {
                el.oninput = (e) => {
                    subnodes[idx].strength = parseInt(e.target.value);
                    const display = container.querySelector(`[data-edit-strength-display="${idx}"]`);
                    if (display) display.textContent = e.target.value;
                };
            } else {
                el.oninput = (e) => { subnodes[idx][field] = e.target.value; };
            }
        });

        container.querySelectorAll('[data-edit-remove-subnode]').forEach(btn => {
            btn.onclick = () => {
                subnodes.splice(parseInt(btn.dataset.editRemoveSubnode), 1);
                renderEditSubnodes();
            };
        });
    }

    document.getElementById('edit-add-subnode-btn').onclick = () => {
        subnodes.push({ title: '', description: '', strength: 50 });
        renderEditSubnodes();
    };
    renderEditSubnodes();

    setTimeout(() => document.getElementById('en-content')?.focus(), 50);

    document.getElementById('edit-node-close').onclick  = () => modal.remove();
    document.getElementById('edit-node-cancel').onclick = () => modal.remove();
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    document.getElementById('edit-node-submit').onclick = async () => {
        const content = document.getElementById('en-content').value.trim();
        if (!content) {
            const err = document.getElementById('en-error');
            err.textContent = 'Description is required.'; err.style.display = 'block'; return;
        }
        const btn = document.getElementById('edit-node-submit');
        btn.textContent = 'Saving…'; btn.disabled = true;
        const title = document.getElementById('en-title').value.trim();
        const vf    = document.getElementById('en-valid-from').value;
        const vt    = document.getElementById('en-valid-to').value;
        try {
            await onSubmit({
                title,
                content,
                parent_type: document.getElementById('en-type').value,
                valid_from:  vf ? parseInt(vf) : null,
                valid_to:    vt ? parseInt(vt) : null,
                subnodes:    subnodes.filter(s => s.title.trim() || s.description.trim()),
            });
            modal.remove();
            showFlash('Node updated');
        } catch (err) {
            console.error('Edit node error:', err);
            btn.textContent = 'Save Changes →'; btn.disabled = false;
            const errEl = document.getElementById('en-error');
            errEl.textContent = 'Save failed — check console.'; errEl.style.display = 'block';
        }
    };
}