import { REL_COLORS } from '../../graph-component.js';
import { showFlash } from '../utils/flash.js';

const REL_TYPES      = () => Object.keys(REL_COLORS).filter(k => !['SUPPORT','CONTRADICT','DEPENDS'].includes(k));
const EVIDENCE_TYPES = ['theoretical','empirical','anecdotal','simulated','inferred'];
const SCOPES         = ['institutional','individual','systemic','temporal','cultural'];
const STATUS_OPTS    = ['CONFIRMED','PROVISIONAL','DISPUTED','DEPRECATED'];

// ── Dynamic ilişki katmanı (Deleuze-Guattari / Derrida vokabüleri) ───────────
// Logical katman (SUPPORTS, CONTRADICTS…) argüman iskeletini kurar.
// Dynamic katman dönüşümü, akışı ve zamansallığı kodlar.
// İki katman ayrı ama geçirgen — bir ilişki başta dinamik, sonra mantıksal olabilir.

export const DYNAMIC_REL_TYPES = {
    // Dönüşümsel — temas her iki tarafı da değiştirir
    FRICTION:          { label: 'Friction',              color: '#e85090', desc: 'Tsing — contact leaves traces, both sides transform' },
    DETERRITORIALIZES: { label: 'Deterritorializes', color: '#a78bfa', desc: 'Deleuze — one node dissolves the codes of another' },
    RETERRITORIALIZES: { label: 'Reterritorializes',    color: '#818cf8', desc: 'Deleuze — what was dissolved crystallizes in a new form' },
    OPENS_INTO:        { label: 'Opens Into',                 color: '#c084fc', desc: 'Opens a door from one historicity to another' },

    // Tortulama — zamansal birikim
    SEDIMENTS_INTO:    { label: 'Sediments Into',             color: '#60a5fa', desc: 'Settles beneath, invisible but constitutive' },
    HAUNTS:            { label: 'Haunts',           color: '#6366f1', desc: 'Fisher — the past returns to the present unresolved' },
    CONTAMINATES:      { label: 'Contaminates',                 color: '#f59e0b', desc: 'Passage through boundary violation, contaminates category' },
    SUPPLEMENTS:       { label: 'Supplements',      color: '#34d399', desc: 'Derrida — appears as supplement, constitutes the lack' },

    // Akış — henüz kristalleşmemiş
    RESONATES_WITH:    { label: 'Resonates With',          color: '#00c8a0', desc: 'Carries the same resonance, not the same thing' },
    INTENSIFIES:       { label: 'Intensifies',           color: '#fbbf24', desc: 'Increases intensity, not content' },
    SUSPENDS:          { label: 'Suspends',             color: '#94a3b8', desc: 'Does not resolve, does not freeze — preserves ambiguity' },
};

// Ontological status — crystallization state of each relation
export const REL_STATUS_ONTOLOGY = {
    crystallized:  { label: 'Crystallized',       color: '#00c8a0', desc: 'Form acquired, readable' },
    suspended:     { label: 'Suspended',               color: '#ffa500', desc: 'Holds its ambiguityüz ne olduğu belli değil' },
    deconstructed: { label: 'Deconstructed',  color: '#ff5a5a', desc: 'An assumption collapsed when this connection was madeayım çöktü' },
    flowing:       { label: 'Flowing',               color: '#a78bfa', desc: 'Not yet crystallized, hareket halinde' },
};

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
                <div class="field-group">
                    <label>Relation Layer <span class="req">*</span></label>
                    <div style="display:flex;gap:6px;margin-bottom:8px;">
                        <label style="flex:1;display:flex;align-items:center;gap:6px;
                            padding:7px 10px;border-radius:5px;cursor:pointer;
                            border:1px solid rgba(136,150,184,0.3);background:rgba(136,150,184,0.04);">
                            <input type="radio" name="ar-layer" value="logical" checked
                                style="accent-color:#8896b8;">
                            <div>
                                <div style="font-size:11px;color:#8896b8;">Logical</div>
                                <div style="font-size:9px;color:#2a3048;">Argument skeleton</div>
                            </div>
                        </label>
                        <label style="flex:1;display:flex;align-items:center;gap:6px;
                            padding:7px 10px;border-radius:5px;cursor:pointer;
                            border:1px solid rgba(180,140,255,0.25);background:rgba(180,140,255,0.04);">
                            <input type="radio" name="ar-layer" value="dynamic"
                                style="accent-color:#b48cff;">
                            <div>
                                <div style="font-size:11px;color:rgba(180,140,255,0.8);">Dynamic</div>
                                <div style="font-size:9px;color:#2a3048;">Transformation / flow</div>
                            </div>
                        </label>
                        <label style="flex:1;display:flex;align-items:center;gap:6px;
                            padding:7px 10px;border-radius:5px;cursor:pointer;
                            border:1px solid rgba(148,163,184,0.2);background:rgba(148,163,184,0.02);">
                            <input type="radio" name="ar-layer" value="uncertain"
                                style="accent-color:#94a3b8;">
                            <div>
                                <div style="font-size:11px;color:#94a3b8;">Uncertain</div>
                                <div style="font-size:9px;color:#2a3048;">Not yet crystallized</div>
                            </div>
                        </label>
                    </div>
                </div>

                <div class="field-row">
                    <div class="field-group" id="ar-logical-group">
                        <label>Logical Type <span class="req">*</span></label>
                        <select id="ar-rel-type">
                            ${REL_TYPES().map(t => `<option value="${t}">${t}</option>`).join('')}
                        </select>
                    </div>
                    <div class="field-group" id="ar-dynamic-group" style="display:none;">
                        <label>Dynamic Type <span class="req">*</span></label>
                        <select id="ar-dynamic-type">
                            ${Object.entries(DYNAMIC_REL_TYPES).map(([k, v]) =>
                                `<option value="${k}" style="color:${v.color}">${v.label} (${k})</option>`
                            ).join('')}
                        </select>
                        <div id="ar-dynamic-desc" style="font-size:10px;color:#445070;margin-top:4px;line-height:1.5;"></div>
                    </div>
                    <div class="field-group">
                        <label>Verification Status</label>
                        <select id="ar-status">
                            ${STATUS_OPTS.map(s => `<option value="${s}" ${s === 'CONFIRMED' ? 'selected' : ''}>${s}</option>`).join('')}
                        </select>
                    </div>
                </div>

                <div class="field-group">
                    <label>Ontological Status</label>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;">
                        ${Object.entries(REL_STATUS_ONTOLOGY).map(([val, meta]) => `
                            <label style="display:flex;align-items:center;gap:5px;
                                padding:5px 10px;border-radius:5px;cursor:pointer;
                                border:1px solid ${meta.color}33;background:${meta.color}08;">
                                <input type="radio" name="ar-ontology" value="${val}"
                                    ${val === 'crystallized' ? 'checked' : ''}
                                    style="accent-color:${meta.color};">
                                <div>
                                    <div style="font-size:10px;color:${meta.color};">${meta.label}</div>
                                </div>
                            </label>`).join('')}
                    </div>
                    <div id="ar-ontology-desc" style="font-size:10px;color:#445070;margin-top:5px;line-height:1.5;"></div>
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

    // Katman seçimi → ilgili formu göster/gizle
    modal.querySelectorAll('input[name="ar-layer"]').forEach(radio => {
        radio.onchange = () => {
            const layer = modal.querySelector('input[name="ar-layer"]:checked')?.value;
            document.getElementById('ar-logical-group').style.display =
                layer === 'logical' ? 'block' : 'none';
            document.getElementById('ar-dynamic-group').style.display =
                layer === 'dynamic' ? 'block' : 'none';
        };
    });

    // Dynamic tür açıklaması
    const dynSelect = document.getElementById('ar-dynamic-type');
    const dynDesc   = document.getElementById('ar-dynamic-desc');
    if (dynSelect && dynDesc) {
        const updateDynDesc = () => {
            const meta = DYNAMIC_REL_TYPES[dynSelect.value];
            if (meta) dynDesc.textContent = meta.desc;
        };
        dynSelect.onchange = updateDynDesc;
        updateDynDesc();
    }

    // Ontoloji açıklaması
    modal.querySelectorAll('input[name="ar-ontology"]').forEach(radio => {
        radio.onchange = () => {
            const val  = modal.querySelector('input[name="ar-ontology"]:checked')?.value;
            const meta = REL_STATUS_ONTOLOGY[val];
            const desc = document.getElementById('ar-ontology-desc');
            if (desc && meta) desc.textContent = meta.desc;
        };
    });
    // İlk açıklamayı doldur
    (() => {
        const desc = document.getElementById('ar-ontology-desc');
        if (desc) desc.textContent = REL_STATUS_ONTOLOGY['crystallized'].desc;
    })();

    document.getElementById('add-rel-submit').onclick = async () => {
        const layer        = modal.querySelector('input[name="ar-layer"]:checked')?.value || 'logical';
        const ontology     = modal.querySelector('input[name="ar-ontology"]:checked')?.value || 'crystallized';
        const isDynamic    = layer === 'dynamic';
        const isUncertain  = layer === 'uncertain';

        const rel_type = isDynamic
            ? document.getElementById('ar-dynamic-type').value
            : (isUncertain ? 'RELATES_TO' : document.getElementById('ar-rel-type').value);

        const dynMeta  = DYNAMIC_REL_TYPES[rel_type];
        const color    = isDynamic && dynMeta
            ? dynMeta.color
            : (REL_COLORS_LOCAL[rel_type] || '#445070');

        const btn = document.getElementById('add-rel-submit');
        btn.textContent = 'Creating...'; btn.disabled = true;
        const vf = document.getElementById('ar-valid-from').value;
        const vt = document.getElementById('ar-valid-to').value;
        await onSubmit({
            node_a:            sourceNode.id,
            node_b:            targetNode.id,
            rel_type,
            color,
            layer,             // 'logical' | 'dynamic' | 'uncertain'
            ontology_status:   ontology,  // 'crystallized' | 'suspended' | 'deconstructed' | 'flowing'
            status:            document.getElementById('ar-status').value,
            justification:     document.getElementById('ar-justification').value.trim(),
            mechanism:         document.getElementById('ar-mechanism').value.trim(),
            weight:            parseFloat(document.getElementById('ar-weight').value),
            confidence:        parseFloat(document.getElementById('ar-confidence').value),
            evidence_type:     document.getElementById('ar-evidence-type').value || null,
            scope:             document.getElementById('ar-scope').value || null,
            valid_from:        vf ? parseInt(vf) : null,
            valid_to:          vt ? parseInt(vt) : null,
        });
        modal.remove();
        showFlash(`${isDynamic ? dynMeta?.label || rel_type : rel_type} relation created`);
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