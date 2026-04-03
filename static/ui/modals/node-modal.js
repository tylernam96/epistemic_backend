import { TYPE_COLORS } from '../../graph-component.js';
import { showFlash } from '../utils/flash.js';
import { cosineSimilarity } from '../utils/colors.js';
import { suggestPositionFromSimilarity, repelFromOverlap, placeOpposite } from '../utils/placement.js';

export function renderAddNodeModal(onSubmit, existingNodes = [], existingRelations = []) {
    document.getElementById('add-node-modal')?.remove();

    const NODE_TYPES = Object.keys(TYPE_COLORS);
    const modal = document.createElement('div');
    modal.id = 'add-node-modal';
    modal.className = 'creation-modal-overlay';
    
    // Store subnodes in modal state
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

                    <div id="an-suggestion" class="position-suggestion" style="display:none; margin-top:10px; background:rgba(0,200,160,0.03); border:1px solid rgba(0,200,160,0.15); border-radius:8px; overflow:hidden; position:relative;">
                        <div style="padding:12px 14px; background:rgba(0,200,160,0.02); border-bottom:1px solid rgba(0,200,160,0.1);">
                            <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
                                <span style="color:var(--concept); font-size:11px; font-weight:600; letter-spacing:0.05em;">✨ PLACEMENT REASONING</span>
                                <span style="font-size:10px; color:#445070; font-family:'DM Mono',monospace;" id="an-confidence"></span>
                            </div>
                            <div id="an-explanation" style="font-size:12px; color:#8e99b3; line-height:1.6; white-space:pre-wrap; font-family:'DM Mono',monospace; cursor:help;"></div>
                        </div>
                        <div style="padding:10px 14px; display:flex; align-items:center; justify-content:space-between; background:rgba(0,0,0,0.2);">
                            <div style="display:flex; gap:8px; align-items:center;">
                                <span style="font-size:11px; color:#445070;">Suggested position:</span>
                                <span id="an-coords" style="font-size:11px; color:var(--concept); font-family:'DM Mono',monospace;">x: — y: —</span>
                            </div>
                            <button id="an-use-suggestion" style="background:rgba(0,200,160,0.1); border:1px solid var(--concept); color:var(--concept); border-radius:4px; padding:6px 16px; font-size:11px; cursor:pointer; font-family:'DM Mono',monospace; font-weight:600;">Use This Position</button>
                        </div>
                    </div>

                    <div id="an-relations" style="display:none; margin-top:8px; border:1px solid rgba(0,200,160,0.12); border-radius:8px; overflow:hidden;">
                        <div style="padding:7px 12px; background:rgba(0,200,160,0.03); border-bottom:1px solid rgba(0,200,160,0.1); display:flex; align-items:center; gap:8px;">
                            <span style="font-size:10px; color:#445070; letter-spacing:0.08em;">🔮 SUGGESTED RELATIONS</span>
                            <span style="font-size:9px; color:#1e3040;">toggle to include on creation</span>
                        </div>
                        <div id="an-relations-list" style="padding:8px; display:flex; flex-direction:column; gap:5px;"></div>
                    </div>

                    <div id="an-details-popup" style="display:none; position:fixed; background:#0c0e16; border:1px solid var(--concept); border-radius:8px; padding:14px; max-width:350px; z-index:10000; box-shadow:0 10px 40px rgba(0,0,0,0.8); backdrop-filter:blur(8px); pointer-events:none; white-space:pre-wrap; font-family:'DM Mono',monospace; font-size:11px; line-height:1.7; color:#8e99b3;"></div>
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
                <div class="field-group">
                    <label>Abstraction Level <span class="opt">(1=observation … 5=axiom)</span></label>
                    <div class="slider-row">
                        <input type="range" id="an-abstraction" min="1" max="5" step="1" value="3">
                        <span id="an-abstraction-val" style="color:#8896b8;width:90px;font-size:10px;flex-shrink:0;">3 — Hypothesis</span>
                    </div>
                </div>
                <div class="field-group">
                    <label>Confidence Tier <span class="opt">(drives edge distances)</span></label>
                    <select id="an-confidence-tier">
                        <option value="0">0 — Speculative</option>
                        <option value="1" selected>1 — Working</option>
                        <option value="2">2 — Provisional</option>
                        <option value="3">3 — Confirmed</option>
                    </select>
                </div>
                <div id="an-error" class="modal-error" style="display:none"></div>
            </div>
            <div class="modal-footer">
                <button class="modal-btn-cancel" id="add-node-cancel">Cancel</button>
                <button class="modal-btn-confirm" id="add-node-submit">Create Node &#x2192;</button>
            </div>
        </div>`;

    document.body.appendChild(modal);

    // Function to render subnodes list
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
        
        // Add event listeners for subnode fields
        container.querySelectorAll('input[data-subnode-idx], textarea[data-subnode-idx]').forEach(el => {
            const idx = parseInt(el.dataset.subnodeIdx);
            const field = el.dataset.field;
            
            if (field === 'strength') {
                el.oninput = (e) => {
                    subnodes[idx].strength = parseInt(e.target.value);
                    const display = container.querySelector(`[data-strength-display="${idx}"]`);
                    if (display) display.textContent = e.target.value;
                };
            } else {
                el.oninput = (e) => {
                    subnodes[idx][field] = e.target.value;
                };
            }
        });
        
        // Add remove button listeners
        container.querySelectorAll('[data-remove-subnode]').forEach(btn => {
            btn.onclick = () => {
                const idx = parseInt(btn.dataset.removeSubnode);
                subnodes.splice(idx, 1);
                renderSubnodes();
            };
        });
    }
    
    // Add subnode button
    document.getElementById('add-subnode-btn').onclick = () => {
        subnodes.push({
            title: '',
            description: '',
            strength: 50
        });
        renderSubnodes();
    };
    
    renderSubnodes();

    const contentInput   = document.getElementById('an-content');
    const suggestionDiv  = document.getElementById('an-suggestion');
    const explanationEl  = document.getElementById('an-explanation');
    const confidenceEl   = document.getElementById('an-confidence');
    const coordsEl       = document.getElementById('an-coords');
    const useSuggestionBtn = document.getElementById('an-use-suggestion');
    const xInput         = document.getElementById('an-x');
    const yInput         = document.getElementById('an-y');
    const zInput         = document.getElementById('an-z');
    const popupEl        = document.getElementById('an-details-popup');
    let suggestionTimeout, currentSuggestion = null;

    contentInput.addEventListener('input', () => {
        clearTimeout(suggestionTimeout);
        suggestionDiv.style.display = 'none';
        suggestionTimeout = setTimeout(async () => {
            const content = contentInput.value.trim();
            if (content.length < 15) { suggestionDiv.style.display = 'none'; return; }

            explanationEl.textContent = '🔍 Analyzing semantic relationships...';
            confidenceEl.textContent = '';
            coordsEl.textContent = 'x: — y: —';
            useSuggestionBtn.style.opacity = '1';
            useSuggestionBtn.style.pointerEvents = 'auto';
            suggestionDiv.style.display = 'block';

            const parentType = document.getElementById('an-type').value;
            const suggestion = await suggestPositionFromSimilarity(content, existingNodes);
            currentSuggestion = suggestion;

            // Relation loading state
            const relDiv  = document.getElementById('an-relations');
            const relList = document.getElementById('an-relations-list');
            if (relDiv && relList) {
                relDiv.style.display = 'block';
                relList.innerHTML = '<div style="padding:4px 2px;font-size:10px;color:#445070;">🔮 Predicting relations...</div>';
            }

            // Background: Gemini relation prediction
            (async () => {
                try {
                    const resp = await fetch('/api/relations/predict', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            content, parent_type: parentType,
                            existing_nodes: existingNodes.map(n => ({
                                id: n.id, node_id: n.node_id,
                                content: n.content || n.name || '',
                                parent_type: n.parent_type || n.node_type || 'Concept',
                                embedding: n.embedding,
                            })),
                        }),
                    });
                    if (!resp.ok) throw new Error('Prediction failed');
                    const predictionData = await resp.json();
                    const rels = predictionData.relations || [];

                    currentSuggestion._pendingRels = rels;
                    currentSuggestion._relAccepted = new Set(rels.map((_, i) => i));

                    if (!rels.length) {
                        relDiv.style.display = 'none';
                        return;
                    }

                    relList.innerHTML = rels.map((rel, i) => {
                        const targetNode = existingNodes.find(n => n.node_id === rel.target_node_id);
                        const targetName = targetNode
                            ? (targetNode.content || targetNode.name || '').slice(0, 40)
                            : rel.target_node_id;
                        return `
                            <div data-rel-idx="${i}" style="display:flex; align-items:flex-start; gap:8px; padding:6px; background:rgba(0,200,160,0.02); border:1px solid rgba(0,200,160,0.15); border-radius:5px; cursor:pointer; transition:all 0.15s;">
                                <input type="checkbox" data-rel-check="${i}" checked style="margin-top:2px; cursor:pointer;">
                                <div style="flex:1; min-width:0;">
                                    <div style="font-size:10px; font-weight:600; color:var(--concept); letter-spacing:0.05em; margin-bottom:2px;">${rel.rel_type}</div>
                                    <div style="font-size:11px; color:#c8d0e0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${targetName}</div>
                                    <div style="font-size:10px; color:#445070; margin-top:2px; line-height:1.4;">${rel.justification}</div>
                                </div>
                            </div>`;
                    }).join('');

                    relList.querySelectorAll('[data-rel-check]').forEach(cb => {
                        const i = parseInt(cb.dataset.relCheck);
                        cb.onchange = () => {
                            if (cb.checked) currentSuggestion._relAccepted.add(i);
                            else currentSuggestion._relAccepted.delete(i);
                        };
                    });

                } catch (err) {
                    console.warn('Relation prediction failed:', err);
                    relDiv.style.display = 'none';
                }
            })();

            if (!suggestion.x) {
                explanationEl.textContent = suggestion.explanation || 'Could not generate suggestion.';
                coordsEl.textContent = 'x: — y: —';
                useSuggestionBtn.style.opacity = '0.4';
                useSuggestionBtn.style.pointerEvents = 'none';
                return;
            }

            explanationEl.textContent = suggestion.explanation || 'Position calculated from semantic similarity.';
            confidenceEl.textContent = suggestion.label || '';
            coordsEl.textContent = `x: ${suggestion.x.toFixed(1)} y: ${suggestion.y.toFixed(1)}`;
        }, 800);
    });

    useSuggestionBtn.onclick = () => {
        if (!currentSuggestion?.x) return;
        xInput.value = currentSuggestion.x.toFixed(2);
        yInput.value = currentSuggestion.y.toFixed(2);
    };

    explanationEl.addEventListener('mouseenter', e => {
        if (!currentSuggestion?.explanation) return;
        popupEl.textContent = currentSuggestion.explanation;
        popupEl.style.display = 'block';
        const rect = explanationEl.getBoundingClientRect();
        if (rect) {
            popupEl.style.left = (rect.right + 20) + 'px';
            popupEl.style.top  = (rect.top  - 20) + 'px';
        }
    });
    explanationEl.addEventListener('mousemove', e => {
        if (popupEl.style.display === 'block') {
            popupEl.style.left = (e.pageX + 20) + 'px';
            popupEl.style.top  = (e.pageY - 100) + 'px';
        }
    });
    explanationEl.addEventListener('mouseleave', () => { popupEl.style.display = 'none'; });

    const close = () => { window.clearSuggestedPosition?.(); modal.remove(); };
    document.getElementById('add-node-close').onclick  = close;
    document.getElementById('add-node-cancel').onclick = close;
    modal.addEventListener('click', e => { if (e.target === modal) close(); });

    const ABSTRACTION_LABELS = ['', 'Observation', 'Evidence', 'Hypothesis', 'Principle', 'Axiom'];
    const absSlider = document.getElementById('an-abstraction');
    const absVal    = document.getElementById('an-abstraction-val');
    absSlider.oninput = () => {
        const v = parseInt(absSlider.value);
        absVal.textContent = `${v} — ${ABSTRACTION_LABELS[v]}`;
        if (!zInput.value) zInput.placeholder = `Auto: ${(v - 3) * 60}`;
    };

    document.getElementById('add-node-submit').onclick = async () => {
        const content = document.getElementById('an-content').value.trim();
        if (!content) {
            const err = document.getElementById('an-error');
            err.textContent = 'Description is required.';
            err.style.display = 'block';
            return;
        }
        const btn = document.getElementById('add-node-submit');
        btn.textContent = 'Creating...'; btn.disabled = true;

        const title = document.getElementById('an-title').value.trim();
        const xv = document.getElementById('an-x').value;
        const yv = document.getElementById('an-y').value;
        const zv = document.getElementById('an-z').value;
        const vf = document.getElementById('an-valid-from').value;
        const vt = document.getElementById('an-valid-to').value;

        const acceptedRelations = (currentSuggestion?._pendingRels || [])
            .filter((_, i) => currentSuggestion?._relAccepted?.has(i));

        const result = await onSubmit({
            title,
            content,
            parent_type:        document.getElementById('an-type').value,
            valid_from:         vf ? parseInt(vf) : null,
            valid_to:           vt ? parseInt(vt) : null,
            x:                  xv !== '' ? parseFloat(xv) : (currentSuggestion?.x ?? null),
            y:                  yv !== '' ? parseFloat(yv) : (currentSuggestion?.y ?? null),
            z:                  zv !== '' ? parseFloat(zv) : null,
            abstraction_level:  parseInt(document.getElementById('an-abstraction').value),
            confidence_tier:    parseInt(document.getElementById('an-confidence-tier').value),
            subnodes:           subnodes.filter(s => s.title.trim() || s.description.trim()), // Only include non-empty subnodes
        }, { ...(currentSuggestion || {}), acceptedRelations });

        window.clearSuggestedPosition?.();
        modal.remove();
        showFlash(`Node ${result.node_id} created`);
    };
}

export function renderEditNodeModal(node, onSubmit) {
    document.getElementById('edit-node-modal')?.remove();

    const NODE_TYPES  = Object.keys(TYPE_COLORS);
    const currentType = node.parent_type || node.node_type || 'Concept';
    
    console.log('=== EDIT NODE MODAL ===');
    console.log('Node ID:', node.id);
    console.log('Node subnodes:', node.subnodes);
    console.log('Full node object:', node);
    

    // Initialize subnodes from existing node data
    //let subnodes = node.subnodes || [];

    let subnodes = [];
    if (node.subnodes && Array.isArray(node.subnodes)) {
        subnodes = node.subnodes.map(s => ({
            id: s.id || null,
            title: s.title || s.name || '',
            description: s.description || s.content || '',
            strength: s.strength || 50
        }));
        console.log('Initialized subnodes:', subnodes);
    } else {
        console.log('No subnodes found on node object');
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
    
    // Function to render subnodes list for edit modal
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
        
        // Add event listeners for subnode fields
        container.querySelectorAll('input[data-edit-subnode-idx], textarea[data-edit-subnode-idx]').forEach(el => {
            const idx = parseInt(el.dataset.editSubnodeIdx);
            const field = el.dataset.field;
            
            if (field === 'strength') {
                el.oninput = (e) => {
                        console.log('input changed:', idx, field, e.target.value);

                    subnodes[idx].strength = parseInt(e.target.value);
                    const display = container.querySelector(`[data-edit-strength-display="${idx}"]`);
                    if (display) display.textContent = e.target.value;
                };
            } else {
                el.oninput = (e) => {
                    subnodes[idx][field] = e.target.value;
                };
            }
        });
        
        // Add remove button listeners
        container.querySelectorAll('[data-edit-remove-subnode]').forEach(btn => {
            btn.onclick = () => {
                const idx = parseInt(btn.dataset.editRemoveSubnode);
                subnodes.splice(idx, 1);
                renderEditSubnodes();
            };
        });
    }
    
    // Add subnode button
    document.getElementById('edit-add-subnode-btn').onclick = () => {
        subnodes.push({
            title: '',
            description: '',
            strength: 50
        });
        renderEditSubnodes();
    };
    
    renderEditSubnodes();
    
    setTimeout(() => document.getElementById('en-content')?.focus(), 50);

    document.getElementById('edit-node-close').onclick  = () => modal.remove();
    document.getElementById('edit-node-cancel').onclick = () => modal.remove();
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    document.getElementById('edit-node-submit').onclick = async () => {
        console.log('Submit clicked, subnodes:', subnodes); // ← add this

        const content = document.getElementById('en-content').value.trim();
        if (!content) {
            const err = document.getElementById('en-error');
            err.textContent = 'Description is required.'; err.style.display = 'block'; return;
        }
        const btn = document.getElementById('edit-node-submit');
        btn.textContent = 'Saving...'; btn.disabled = true;
        const title = document.getElementById('en-title').value.trim();
        const vf = document.getElementById('en-valid-from').value;
        const vt = document.getElementById('en-valid-to').value;
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
} catch(err) {
    console.error('Submit error:', err); // ← add this
    btn.textContent = 'Save Changes →'; btn.disabled = false;
    const errEl = document.getElementById('en-error');
    errEl.textContent = 'Save failed — check console.'; errEl.style.display = 'block';
}
    };
}