import { REL_COLORS } from '../../graph-component.js';
import { showFlash } from '../utils/flash.js';

const REL_TYPES      = () => Object.keys(REL_COLORS).filter(k => !['SUPPORT','CONTRADICT','DEPENDS'].includes(k));
const EVIDENCE_TYPES = ['theoretical','empirical','anecdotal','simulated','inferred'];
const SCOPES         = ['institutional','individual','systemic','temporal','cultural'];
const STATUS_OPTS    = ['CONFIRMED','PROVISIONAL','DISPUTED','DEPRECATED'];

const REL_COLORS_LOCAL = {
    SUPPORTS:'#00c8a0', CONTRADICTS:'#ff5a5a', HAS_VERSION:'#8896b8',
    TRIGGERS:'#e85090', AMPLIFIES:'#ffa500',   DEPENDS_ON:'#6622aa',
    REQUIRES:'#6622aa', RELATES_TO:'#8896b8',  DISCUSSES:'#b03070',
};

function _sliderPair(idBase, initial) {
    const slider = document.getElementById(`${idBase}`);
    const val    = document.getElementById(`${idBase}-val`);
    if (slider && val) slider.oninput = () => { val.textContent = parseFloat(slider.value).toFixed(2); };
}

export function renderRelationModal(sourceNode, targetNode, onSubmit) {
    document.getElementById('add-rel-modal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'add-rel-modal';
    modal.className = 'creation-modal-overlay';
    modal.innerHTML = `
        <div class="creation-modal creation-modal--wide">
            <div class="modal-header">
                <span class="modal-tag">NEW RELATION</span>
                <button class="modal-close" id="add-rel-close">&#x2715;</button>
            </div>
            <div class="relation-nodes-header">
                <div class="rel-node-chip">${sourceNode.content || sourceNode.name}</div>
                <div class="rel-arrow">&#x2192;</div>
                <div class="rel-node-chip">${targetNode.content || targetNode.name}</div>
            </div>
            <div class="modal-body">
                <div class="field-row">
                    <div class="field-group">
                        <label>Relation Type <span class="req">*</span></label>
                        <select id="ar-rel-type">
                            ${REL_TYPES().map(t => `<option value="${t}">${t}</option>`).join('')}
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
                        <label>Weight</label>
                        <div class="slider-row">
                            <input type="range" id="ar-weight" min="0" max="1" step="0.05" value="0.8">
                            <span id="ar-weight-val">0.80</span>
                        </div>
                    </div>
                    <div class="field-group">
                        <label>Confidence</label>
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
                            <option value="">&#x2014; none &#x2014;</option>
                            ${EVIDENCE_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
                        </select>
                    </div>
                    <div class="field-group">
                        <label>Scope <span class="opt">(optional)</span></label>
                        <select id="ar-scope">
                            <option value="">&#x2014; none &#x2014;</option>
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
                <button class="modal-btn-confirm" id="add-rel-submit">Create Relation &#x2192;</button>
            </div>
        </div>`;

    document.body.appendChild(modal);
    _sliderPair('ar-weight', 0.8);
    _sliderPair('ar-confidence', 0.75);
    document.getElementById('add-rel-close').onclick  = () => modal.remove();
    document.getElementById('add-rel-cancel').onclick = () => modal.remove();
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    document.getElementById('add-rel-submit').onclick = async () => {
        const rel_type = document.getElementById('ar-rel-type').value;
        const btn = document.getElementById('add-rel-submit');
        btn.textContent = 'Creating...'; btn.disabled = true;
        const vf = document.getElementById('ar-valid-from').value;
        const vt = document.getElementById('ar-valid-to').value;
        await onSubmit({
            node_a:        sourceNode.id,
            node_b:        targetNode.id,
            rel_type,
            color:         REL_COLORS_LOCAL[rel_type] || '#445070',
            status:        document.getElementById('ar-status').value,
            justification: document.getElementById('ar-justification').value.trim(),
            mechanism:     document.getElementById('ar-mechanism').value.trim(),
            weight:        parseFloat(document.getElementById('ar-weight').value),
            confidence:    parseFloat(document.getElementById('ar-confidence').value),
            evidence_type: document.getElementById('ar-evidence-type').value || null,
            scope:         document.getElementById('ar-scope').value || null,
            valid_from:    vf ? parseInt(vf) : null,
            valid_to:      vt ? parseInt(vt) : null,
        });
        modal.remove();
        showFlash(`Relation ${rel_type} created`);
    };
}

export function renderEditRelationModal(rel, onSubmit) {
    document.getElementById('edit-rel-modal')?.remove();

    const curType       = (rel.rel_type || rel.type || 'RELATES_TO').toUpperCase().trim();
    const curStatus     = rel.status || 'CONFIRMED';
    const curWeight     = rel.weight     ?? 0.8;
    const curConfidence = rel.confidence ?? 0.75;

    const modal = document.createElement('div');
    modal.id = 'edit-rel-modal';
    modal.className = 'creation-modal-overlay';
    modal.innerHTML = `
        <div class="creation-modal creation-modal--wide">
            <div class="modal-header">
                <span class="modal-tag">EDIT RELATION</span>
                <button class="modal-close" id="edit-rel-close">&#x2715;</button>
            </div>
            <div class="modal-body">
                <div class="field-row">
                    <div class="field-group">
                        <label>Relation Type <span class="req">*</span></label>
                        <select id="er-rel-type">
                            ${REL_TYPES().map(t => `<option value="${t}" ${t === curType ? 'selected' : ''}>${t}</option>`).join('')}
                        </select>
                    </div>
                    <div class="field-group">
                        <label>Status</label>
                        <select id="er-status">
                            ${STATUS_OPTS.map(s => `<option value="${s}" ${s === curStatus ? 'selected' : ''}>${s}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="field-group">
                    <label>Justification <span class="opt">(optional)</span></label>
                    <textarea id="er-justification" rows="2">${rel.justification || ''}</textarea>
                </div>
                <div class="field-group">
                    <label>Mechanism <span class="opt">(optional)</span></label>
                    <textarea id="er-mechanism" rows="2">${rel.mechanism || ''}</textarea>
                </div>
                <div class="field-row">
                    <div class="field-group">
                        <label>Weight</label>
                        <div class="slider-row">
                            <input type="range" id="er-weight" min="0" max="1" step="0.05" value="${curWeight}">
                            <span id="er-weight-val">${parseFloat(curWeight).toFixed(2)}</span>
                        </div>
                    </div>
                    <div class="field-group">
                        <label>Confidence</label>
                        <div class="slider-row">
                            <input type="range" id="er-confidence" min="0" max="1" step="0.05" value="${curConfidence}">
                            <span id="er-confidence-val">${parseFloat(curConfidence).toFixed(2)}</span>
                        </div>
                    </div>
                </div>
                <div class="field-row">
                    <div class="field-group">
                        <label>Evidence Type <span class="opt">(optional)</span></label>
                        <select id="er-evidence-type">
                            <option value="">&#x2014; none &#x2014;</option>
                            ${EVIDENCE_TYPES.map(t => `<option value="${t}" ${t === rel.evidence_type ? 'selected' : ''}>${t}</option>`).join('')}
                        </select>
                    </div>
                    <div class="field-group">
                        <label>Scope <span class="opt">(optional)</span></label>
                        <select id="er-scope">
                            <option value="">&#x2014; none &#x2014;</option>
                            ${SCOPES.map(s => `<option value="${s}" ${s === rel.scope ? 'selected' : ''}>${s}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="field-row">
                    <div class="field-group">
                        <label>Epoch From <span class="opt">(optional)</span></label>
                        <input type="number" id="er-valid-from" min="1" step="1" value="${rel.valid_from ?? ''}">
                    </div>
                    <div class="field-group">
                        <label>Epoch To <span class="opt">(optional)</span></label>
                        <input type="number" id="er-valid-to" min="1" step="1" value="${rel.valid_to ?? ''}">
                    </div>
                </div>
                <div id="er-error" class="modal-error" style="display:none"></div>
            </div>
            <div class="modal-footer">
                <button class="modal-btn-cancel" id="edit-rel-cancel">Cancel</button>
                <button class="modal-btn-confirm" id="edit-rel-submit">Save Changes &#x2192;</button>
            </div>
        </div>`;

    document.body.appendChild(modal);
    _sliderPair('er-weight', curWeight);
    _sliderPair('er-confidence', curConfidence);
    document.getElementById('edit-rel-close').onclick  = () => modal.remove();
    document.getElementById('edit-rel-cancel').onclick = () => modal.remove();
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    document.getElementById('edit-rel-submit').onclick = async () => {
        const btn = document.getElementById('edit-rel-submit');
        btn.textContent = 'Saving...'; btn.disabled = true;
        const vf = document.getElementById('er-valid-from').value;
        const vt = document.getElementById('er-valid-to').value;
        await onSubmit({
            rel_type:      document.getElementById('er-rel-type').value,
            status:        document.getElementById('er-status').value,
            justification: document.getElementById('er-justification').value.trim(),
            mechanism:     document.getElementById('er-mechanism').value.trim(),
            weight:        parseFloat(document.getElementById('er-weight').value),
            confidence:    parseFloat(document.getElementById('er-confidence').value),
            evidence_type: document.getElementById('er-evidence-type').value || null,
            scope:         document.getElementById('er-scope').value || null,
            valid_from:    vf ? parseInt(vf) : null,
            valid_to:      vt ? parseInt(vt) : null,
        });
        modal.remove();
        showFlash('Relation updated');
    };
}