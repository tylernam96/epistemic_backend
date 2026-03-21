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
    modal.innerHTML = `
        <div class="creation-modal">
            <div class="modal-header">
                <span class="modal-tag">NEW NODE</span>
                <button class="modal-close" id="add-node-close">&#x2715;</button>
            </div>
            <div class="modal-body">
                <div class="field-group">
                    <label>Content <span class="req">*</span></label>
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
                    const embedRes = await fetch('/api/embed', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text: content }),
                    });
                    if (!embedRes.ok) throw new Error('embed failed');
                    const { embedding } = await embedRes.json();

                    const nodesWithEmb = existingNodes.filter(n => n.embedding?.length > 0);
                    if (!nodesWithEmb.length) { if (relDiv) relDiv.style.display = 'none'; return; }

                    const sims = nodesWithEmb
                        .map(n => ({ node: n, sim: cosineSimilarity(embedding, n.embedding) }))
                        .sort((a, b) => b.sim - a.sim);

                    const candidates = [
                        ...sims.filter(m => m.sim >= 0.55).slice(0, 5),
                        ...sims.filter(m => m.sim >= 0.3 && m.sim < 0.55).slice(0, 2),
                    ].filter((m, i, arr) => arr.findIndex(x => x.node.node_id === m.node.node_id) === i);

                    if (!candidates.length) { if (relDiv) relDiv.style.display = 'none'; return; }

                    const geminiRes = await fetch('/api/placement/analyze-graph', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            content, parent_type: parentType,
                            existing_nodes: candidates.map(m => ({
                                node_id: m.node.node_id,
                                content: m.node.content || m.node.name || '',
                                parent_type: m.node.parent_type || 'Concept',
                                x: m.node.x || 0, y: m.node.y || 0, z: 0,
                                embedding: [],
                            })),
                            existing_relations: [],
                        }),
                    });
                    if (!geminiRes.ok) throw new Error('analyze-graph ' + geminiRes.status);
                    const geminiData = await geminiRes.json();
                    const relations  = (geminiData.predicted_relations || []).slice(0, 5);

                    if (!currentSuggestion) return;
                    const accepted = new Set(relations.map((_, i) => i));
                    currentSuggestion._pendingRels  = relations;
                    currentSuggestion._relAccepted  = accepted;

                    // Reposition if top relation is CONTRADICTS
                    const topRel = relations.slice().sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];
                    if (topRel?.rel_type === 'CONTRADICTS') {
                        const target = existingNodes.find(n => n.node_id === topRel.target_node_id);
                        if (target) {
                            const opp = repelFromOverlap(...Object.values(placeOpposite(target, existingNodes, 140)), existingNodes);
                            currentSuggestion.x = opp.x;
                            currentSuggestion.y = opp.y;
                            coordsEl.textContent = `x: ${opp.x.toFixed(1)} y: ${opp.y.toFixed(1)} ⚔️`;
                            explanationEl.textContent = currentSuggestion.explanation
                                + `\n\n⚔️ CONTRADICTS "${(target.content || '').slice(0, 40)}" — repositioned to opposing side.`;
                        }
                    }

                    const REL_COLOR = {
                        CONTRADICTS:'#ff5a5a', SUPPORTS:'#00c8a0', REQUIRES:'#ffa500',
                        TRIGGERS:'#a78bfa', AMPLIFIES:'#34d399', DEPENDS_ON:'#60a5fa',
                        ELABORATES:'#f9a8d4', EXEMPLIFIES:'#fcd34d', RELATES_TO:'#445070',
                    };

                    function renderRelCards() {
                        if (!relList) return;
                        relList.innerHTML = relations.length === 0
                            ? '<div style="padding:4px 2px;font-size:10px;color:#445070;">No strong relations detected.</div>'
                            : relations.map((r, i) => {
                                const col    = REL_COLOR[r.rel_type] || '#445070';
                                const chk    = accepted.has(i);
                                const target = existingNodes.find(n => n.node_id === r.target_node_id);
                                const label  = (target?.content || target?.name || r.target_node_id || '').substring(0, 52);
                                return `<div data-rel-idx="${i}" style="display:flex;align-items:flex-start;gap:7px;padding:7px 8px;
                                    background:rgba(255,255,255,0.015);border:1px solid ${chk ? col+'44' : '#1a2030'};
                                    border-radius:5px;cursor:pointer;">
                                    <div style="margin-top:2px;width:12px;height:12px;border-radius:2px;flex-shrink:0;
                                        border:1px solid ${chk ? col : '#2a3550'};background:${chk ? col+'33' : 'transparent'};
                                        display:flex;align-items:center;justify-content:center;font-size:8px;color:${col};">${chk ? '✓' : ''}</div>
                                    <div style="flex:1;min-width:0;">
                                        <div style="display:flex;align-items:center;gap:5px;margin-bottom:2px;">
                                            <span style="font-size:9px;font-weight:700;color:${col};letter-spacing:0.06em;">${r.rel_type}</span>
                                            <span style="font-size:9px;color:#2a3550;">${Math.round((r.confidence ?? 0.75) * 100)}%</span>
                                        </div>
                                        <div style="font-size:10px;color:#c8d0e0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${label}</div>
                                        <div style="font-size:9px;color:#8e99b3;margin-top:2px;line-height:1.4;">${r.justification || ''}</div>
                                    </div>
                                </div>`;
                            }).join('');

                        relList.querySelectorAll('[data-rel-idx]').forEach(el => {
                            el.onclick = () => {
                                const i = parseInt(el.dataset.relIdx);
                                if (accepted.has(i)) accepted.delete(i); else accepted.add(i);
                                renderRelCards();
                            };
                        });
                    }

                    renderRelCards();
                    if (relDiv) relDiv.style.display = relations.length > 0 ? 'block' : 'none';

                } catch (err) {
                    console.warn('Relation prediction failed:', err);
                    if (relDiv) relDiv.style.display = 'none';
                }
            })();

            if (suggestion?.x !== undefined) {
                explanationEl.textContent = suggestion.explanation;
                coordsEl.textContent = `x: ${suggestion.x.toFixed(1)} y: ${suggestion.y.toFixed(1)}`;
                if (suggestion.matches?.length > 0) {
                    const avg = suggestion.matches.reduce((s, m) => s + parseInt(m.sim), 0) / suggestion.matches.length;
                    confidenceEl.textContent = `Match quality: ${avg.toFixed(0)}%`;
                }
                useSuggestionBtn.onclick = () => {
                    xInput.value = suggestion.x.toFixed(1);
                    yInput.value = suggestion.y.toFixed(1);
                    if (!zInput.value) {
                        const lvl = parseInt(document.getElementById('an-abstraction').value);
                        zInput.value = (lvl - 3) * 60;
                    }
                    suggestionDiv.style.opacity = '0.7';
                    setTimeout(() => { suggestionDiv.style.display = 'none'; suggestionDiv.style.opacity = '1'; }, 500);
                    [xInput, yInput].forEach(inp => {
                        inp.style.background = 'rgba(0,200,160,0.15)';
                        inp.style.borderColor = 'var(--concept)';
                        setTimeout(() => { inp.style.background = ''; inp.style.borderColor = ''; }, 800);
                    });
                };
            } else if (suggestion?.explanation) {
                explanationEl.textContent = suggestion.explanation;
                coordsEl.textContent = 'x: — y: — (manual placement recommended)';
                useSuggestionBtn.style.opacity = '0.5';
                useSuggestionBtn.style.pointerEvents = 'none';
            }
        }, 800);
    });

    // Tooltip hover
    explanationEl.addEventListener('mouseenter', e => {
        if (currentSuggestion?.matches?.length > 0) {
            popupEl.textContent = currentSuggestion.matches.map(m => {
                const bar = '█'.repeat(Math.floor(parseInt(m.sim) / 10)) + '░'.repeat(10 - Math.floor(parseInt(m.sim) / 10));
                return `${m.name}\n   ${bar} ${m.sim}% · ${m.type}`;
            }).join('\n\n');
            popupEl.style.display = 'block';
            const rect = e.target.getBoundingClientRect();
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
            err.textContent = 'Content is required.';
            err.style.display = 'block';
            return;
        }
        const btn = document.getElementById('add-node-submit');
        btn.textContent = 'Creating...'; btn.disabled = true;

        const xv = document.getElementById('an-x').value;
        const yv = document.getElementById('an-y').value;
        const zv = document.getElementById('an-z').value;
        const vf = document.getElementById('an-valid-from').value;
        const vt = document.getElementById('an-valid-to').value;

        const acceptedRelations = (currentSuggestion?._pendingRels || [])
            .filter((_, i) => currentSuggestion?._relAccepted?.has(i));

        const result = await onSubmit({
            content,
            parent_type:        document.getElementById('an-type').value,
            valid_from:         vf ? parseInt(vf) : null,
            valid_to:           vt ? parseInt(vt) : null,
            x:                  xv !== '' ? parseFloat(xv) : (currentSuggestion?.x ?? null),
            y:                  yv !== '' ? parseFloat(yv) : (currentSuggestion?.y ?? null),
            z:                  zv !== '' ? parseFloat(zv) : null,
            abstraction_level:  parseInt(document.getElementById('an-abstraction').value),
            confidence_tier:    parseInt(document.getElementById('an-confidence-tier').value),
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
                    <label>Content <span class="req">*</span></label>
                    <textarea id="en-content" rows="4">${node.content || node.name || ''}</textarea>
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
    setTimeout(() => document.getElementById('en-content')?.focus(), 50);

    document.getElementById('edit-node-close').onclick  = () => modal.remove();
    document.getElementById('edit-node-cancel').onclick = () => modal.remove();
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    document.getElementById('edit-node-submit').onclick = async () => {
        const content = document.getElementById('en-content').value.trim();
        if (!content) {
            const err = document.getElementById('en-error');
            err.textContent = 'Content is required.'; err.style.display = 'block'; return;
        }
        const btn = document.getElementById('edit-node-submit');
        btn.textContent = 'Saving...'; btn.disabled = true;
        const vf = document.getElementById('en-valid-from').value;
        const vt = document.getElementById('en-valid-to').value;
        try {
            await onSubmit({
                content,
                parent_type: document.getElementById('en-type').value,
                valid_from:  vf ? parseInt(vf) : null,
                valid_to:    vt ? parseInt(vt) : null,
            });
            modal.remove();
            showFlash('Node updated');
        } catch {
            btn.textContent = 'Save Changes →'; btn.disabled = false;
            const errEl = document.getElementById('en-error');
            errEl.textContent = 'Save failed — check console.'; errEl.style.display = 'block';
        }
    };
}