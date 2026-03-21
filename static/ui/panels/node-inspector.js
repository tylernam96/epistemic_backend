import { resolveRelColor } from '../utils/colors.js';
import { showFlash } from '../utils/flash.js';

export function renderNodeInspector(node, neighbors, onNodeClick) {
    const el = document.getElementById('node-inspector');

    el.innerHTML = `
        <div class="insp-header">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
                <h2 style="color:white;margin:0;flex:1;font-size:15px;line-height:1.4;">${node.content || node.name}</h2>
                <div style="display:flex;gap:6px;flex-shrink:0;">
                    <button onclick="window.__editNode()" style="background:rgba(0,200,160,0.08);border:1px solid rgba(0,200,160,0.3);color:var(--concept);border-radius:5px;padding:4px 10px;font-size:11px;cursor:pointer;white-space:nowrap;font-family:'DM Mono',monospace;">Edit &#x270E;</button>
                    <button onclick="document.getElementById('node-inspector').style.display='none'" style="background:none;border:none;color:#445070;font-size:14px;cursor:pointer;padding:2px 6px;border-radius:4px;">&#x2715;</button>
                </div>
            </div>
            <span class="code-badge">${node.node_id || ''}</span>
            <div style="font-size:10px;color:#445070;margin-top:4px;font-family:'DM Mono',monospace;">
                x:${node.x != null ? node.x.toFixed(1) : '—'} y:${node.y != null ? node.y.toFixed(1) : '—'} z:${node.z != null ? node.z.toFixed(1) : '—'}
            </div>
            <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);">
                <div style="font-size:10px;color:#445070;font-family:'DM Mono',monospace;letter-spacing:0.08em;margin-bottom:6px;">
                    ABSTRACTION — <span style="color:${(node.abstraction_level||3) >= 4 ? '#ffa500' : (node.abstraction_level||3) <= 2 ? '#4488ff' : '#8896b8'}">L${node.abstraction_level||3} ${{1:'Observation',2:'Evidence',3:'Hypothesis',4:'Principle',5:'Axiom'}[node.abstraction_level||3]}</span>
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <input type="range" id="insp-abstraction" min="1" max="5" step="1" value="${node.abstraction_level||3}" style="flex:1;accent-color:var(--concept);cursor:pointer;">
                    <span id="insp-abstraction-val" style="font-size:10px;color:var(--concept);width:14px;text-align:right;font-family:'DM Mono',monospace;">${node.abstraction_level||3}</span>
                    <button id="insp-abstraction-save" style="background:rgba(0,200,160,0.08);border:1px solid rgba(0,200,160,0.3);color:var(--concept);border-radius:4px;padding:3px 10px;font-size:10px;cursor:pointer;font-family:'DM Mono',monospace;white-space:nowrap;">Save Z</button>
                </div>
            </div>
        </div>

        <div class="neighbor-list">
            ${neighbors.length === 0
                ? `<div style="color:#445070;font-size:12px;font-family:'DM Mono',monospace;padding:8px 0;">No relations</div>`
                : neighbors.map((nb, i) => `
                    <div class="neighbor-card">
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                            <div onclick="window.__viewRelation(${i})" style="color:${resolveRelColor(nb.rel_type)};font-size:10px;font-weight:600;letter-spacing:0.05em;cursor:pointer;padding:2px 4px 2px 0;">
                                ${nb.rel_type || '—'} <span style="opacity:0.4;font-size:9px;">&#x25B6;</span>
                            </div>
                            ${nb.rel_id ? `<button onclick="window.__deleteRelation('${nb.rel_id}', '${(nb.name || '').replace(/'/g, "\\&#39;")}')" style="background:none;border:1px solid rgba(255,90,90,0.25);color:rgba(255,90,90,0.5);border-radius:4px;padding:2px 7px;font-size:10px;cursor:pointer;font-family:'DM Mono',monospace;">&#x2715;</button>` : ''}
                        </div>
                        <div onclick="window.__inspectNode('${nb.code}')" style="cursor:pointer;font-weight:bold;color:#c8d0e0;">${nb.name}</div>
                        ${nb.justification ? `<div style="font-size:11px;margin-top:4px;color:#8e99b3;">${nb.justification}</div>` : ''}
                    </div>`).join('')}
        </div>

        <div style="display:flex;gap:8px;margin-top:12px;">
            <button class="ai-btn" onclick="window.dispatch('AI_CHALLENGE', '${node.id || node.node_id}')">&#x26A1; Challenge</button>
            <button id="btn-propose-relations" class="ai-btn" style="color:#00c8a0;border-color:rgba(0,200,160,0.3);">Propose</button>
            <button class="delete-btn" onclick="window.__confirmDelete()">Delete Node</button>
        </div>`;

    el.style.display = 'block';

    const absSlider = document.getElementById('insp-abstraction');
    const absVal    = document.getElementById('insp-abstraction-val');
    if (absSlider) {
        absSlider.oninput = () => { absVal.textContent = absSlider.value; };
        document.getElementById('insp-abstraction-save').onclick = async () => {
            const level = parseInt(absSlider.value);
            const newZ  = (level - 3) * 60;
            await fetch(`/api/nodes/${node.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ abstraction_level: level }),
            });
            node.abstraction_level = level;
            node.z = newZ;
            window.dispatch('MOVE_NODE_Z', { id: node.id, z: newZ, level });
            showFlash(`L${level} → Z ${newZ > 0 ? '+' : ''}${newZ}`);
        };
    }

    window.__inspectNode = (code) => {
        const nb = neighbors.find(n => n.code === code);
        if (nb) onNodeClick(nb);
    };

    window.__viewRelation = (idx) => {
        const nb = neighbors[idx];
        if (!nb) return;
        // Lazy import to avoid circular dep — renderRelationInspector is in panels/relation-inspector.js
        // but window.UI is always available at call time
        window.UI.renderRelationInspector(
            {
                id: nb.rel_id || null,
                rel_type: nb.rel_type, type: nb.rel_type,
                justification: nb.justification, mechanism: nb.mechanism,
                weight: nb.weight, confidence: nb.confidence,
                evidence_type: nb.evidence_type, scope: nb.scope,
                status: nb.status, valid_from: nb.valid_from, valid_to: nb.valid_to,
                source: { id: node.id }, target: { id: nb.id },
            },
            node,
            { content: nb.name, name: nb.name, id: nb.id },
            async (relId) => {
                if (!relId) return;
                await fetch(`/api/links/${relId}`, { method: 'DELETE' });
                document.getElementById('relation-inspector')?.remove();
                window.dispatch('REFRESH');
                showFlash('Relation deleted', true);
            }
        );
    };

    window.__editNode = () => {
        window.UI.renderEditNodeModal(node, async (updates) => {
            await fetch(`/api/nodes/${node.id || node.node_id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates),
            });
            window.dispatch('REFRESH');
        });
    };

    window.__deleteRelation = (relId, relName) => {
        document.getElementById('delete-rel-modal')?.remove();
        const modal = document.createElement('div');
        modal.id = 'delete-rel-modal';
        modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';
        modal.innerHTML = `
            <div style="background:#0a0c12;border:1px solid #ff5a5a;border-radius:12px;padding:28px 32px;max-width:360px;width:90%;font-family:'Syne',sans-serif;">
                <div style="color:#ff5a5a;font-size:11px;letter-spacing:0.1em;margin-bottom:10px;">CONFIRM DELETE RELATION</div>
                <div style="color:#8e99b3;font-size:12px;margin-bottom:24px;line-height:1.6;">Delete relation to <strong style="color:white">${relName}</strong>? This cannot be undone.</div>
                <div style="display:flex;gap:10px;">
                    <button id="del-rel-cancel" style="flex:1;padding:10px;border-radius:6px;background:transparent;border:1px solid #161b29;color:#8e99b3;cursor:pointer;font-family:inherit;font-size:13px;">Cancel</button>
                    <button id="del-rel-confirm" style="flex:1;padding:10px;border-radius:6px;background:#ff5a5a22;border:1px solid #ff5a5a;color:#ff5a5a;cursor:pointer;font-family:inherit;font-size:13px;font-weight:600;">Delete</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        document.getElementById('del-rel-cancel').onclick = () => modal.remove();
        document.getElementById('del-rel-confirm').onclick = async () => {
            modal.remove();
            await fetch(`/api/links/${relId}`, { method: 'DELETE' });
            window.dispatch('REFRESH');
            showFlash('Relation deleted', true);
        };
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    };

    window.__confirmDelete = () => {
        document.getElementById('delete-confirm-modal')?.remove();
        const nodeId   = node.id || node.node_id;
        const nodeName = node.content || node.name || 'this node';
        const modal = document.createElement('div');
        modal.id = 'delete-confirm-modal';
        modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';
        modal.innerHTML = `
            <div style="background:#0a0c12;border:1px solid #ff5a5a;border-radius:12px;padding:28px 32px;max-width:380px;width:90%;font-family:'Syne',sans-serif;">
                <div style="color:#ff5a5a;font-size:11px;letter-spacing:0.1em;margin-bottom:10px;">CONFIRM DELETE</div>
                <div style="color:white;font-weight:700;font-size:15px;margin-bottom:8px;">${nodeName}</div>
                <div style="color:#8e99b3;font-size:12px;margin-bottom:24px;line-height:1.6;">This will permanently delete this node and <strong style="color:white">all its relations</strong>. This cannot be undone.</div>
                <div style="display:flex;gap:10px;">
                    <button id="modal-cancel-btn" style="flex:1;padding:10px;border-radius:6px;background:transparent;border:1px solid #161b29;color:#8e99b3;cursor:pointer;font-family:inherit;font-size:13px;">Cancel</button>
                    <button id="modal-confirm-btn" style="flex:1;padding:10px;border-radius:6px;background:#ff5a5a22;border:1px solid #ff5a5a;color:#ff5a5a;cursor:pointer;font-family:inherit;font-size:13px;font-weight:600;">Delete Node</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        document.getElementById('modal-cancel-btn').onclick = () => modal.remove();
        document.getElementById('modal-confirm-btn').onclick = () => { modal.remove(); window.dispatch('DELETE_NODE', nodeId); };
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    };
}