/**
 * drift-log.js — Drift Log
 *
 * Proust's time: the past erupts into the present.
 * When a node is clicked it opens inward — from outside in:
 *
 *   Current form       — latest state
 *   Crystallization moment — what was selected, what status it entered with
 *   Raw flow           — full text before crystallization, unselected parts included
 *   Inner voices       — added when you look back at your own past moment
 *   Outer voices       — comments added by others while navigating
 *
 * Writing completes the moment while producing its lack — this gap is not erased, it is carried.
 */

const STORE_KEY    = 'drift_log_entries';
const COMMENTS_KEY = 'drift_node_comments';

// ── Depolama ──────────────────────────────────────────────────────────────────

function loadEntries() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); }
    catch { return []; }
}

function saveEntries(entries) {
    localStorage.setItem(STORE_KEY, JSON.stringify(entries));
}

function loadComments() {
    try { return JSON.parse(localStorage.getItem(COMMENTS_KEY) || '{}'); }
    catch { return {}; }
}

function saveComments(comments) {
    localStorage.setItem(COMMENTS_KEY, JSON.stringify(comments));
}

export function addEntry(entry) {
    const entries = loadEntries();
    entries.unshift(entry);
    saveEntries(entries);
    return entry;
}

export function updateEntry(id, patch) {
    const entries = loadEntries();
    const idx = entries.findIndex(e => e.id === id);
    if (idx === -1) return null;
    entries[idx] = { ...entries[idx], ...patch };
    saveEntries(entries);
    return entries[idx];
}

// ── Yorum sistemi ─────────────────────────────────────────────────────────────

export function addComment(nodeId, text, type = 'inner') {
    const comments = loadComments();
    if (!comments[nodeId]) comments[nodeId] = [];
    const comment = {
        id:        `comment_${Date.now()}`,
        nodeId,
        text,
        type,
        timestamp: new Date().toISOString(),
    };
    comments[nodeId].unshift(comment);
    saveComments(comments);
    return comment;
}

export function getComments(nodeId) {
    const comments = loadComments();
    return comments[nodeId] || [];
}

// ── Supplement ────────────────────────────────────────────────────────────────

export function linkCrystalToNode(entryId, crystalId, nodeId) {
    const entries = loadEntries();
    const entry   = entries.find(e => e.id === entryId);
    if (!entry) return;
    const crystal = (entry.crystals || []).find(c => c.id === crystalId);
    if (!crystal) return;
    crystal.nodeId = nodeId;
    entry.status   = entry.crystals.every(c => c.nodeId) ? 'crystallized' : 'crystallizing';
    saveEntries(entries);
}

export function getTimeLayersForNode(nodeId) {
    const entries = loadEntries();
    const layers  = [];
    for (const entry of entries) {
        const crystal = (entry.crystals || []).find(c => c.nodeId === nodeId);
        if (!crystal) continue;
        layers.push({
            crystalMoment: {
                selectedText:   crystal.selectedText,
                status:         crystal.status,
                ontologyStatus: crystal.ontologyStatus || crystal.status,
                createdAt:      crystal.createdAt,
            },
            rawFlow: {
                fullText:  entry.text,
                location:  entry.location,
                timestamp: entry.timestamp,
                entryId:   entry.id,
                crystalId: crystal.id,
            },
        });
    }
    const comments    = getComments(nodeId);
    const innerVoices = comments.filter(c => c.type === 'inner');
    const outerVoices = comments.filter(c => c.type === 'outer');
    return { layers, innerVoices, outerVoices };
}

export function getSupplementForNode(nodeId) {
    const { layers } = getTimeLayersForNode(nodeId);
    if (!layers.length) return null;
    return layers[0];
}

// ── Katman 1: Ham records ───────────────────────────────────────────────────────

export function openDriftCapture(onSave) {
    document.getElementById('drift-capture')?.remove();
    const panel = document.createElement('div');
    panel.id = 'drift-capture';
    panel.style.cssText = `
        position:fixed;bottom:0;left:0;right:0;
        background:rgba(5,6,10,0.98);
        border-top:1px solid rgba(180,140,255,0.2);
        padding:16px 24px 22px;z-index:600;
        font-family:'DM Mono',monospace;
        box-shadow:0 -20px 60px rgba(0,0,0,0.6);
        animation:driftSlideUp 0.25s ease-out;`;
    const now   = new Date();
    const stamp = now.toISOString();
    const label = now.toLocaleString('tr-TR',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
    panel.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <div style="display:flex;align-items:center;gap:10px;">
                <span style="font-size:9px;letter-spacing:0.16em;color:rgba(180,140,255,0.7);">DRIFT RECORD</span>
                <span style="font-size:10px;color:#1e2535;">${label}</span>
            </div>
            <button id="dc-close" style="background:none;border:none;color:#2a3048;cursor:pointer;font-size:14px;">✕</button>
        </div>
        <div style="font-size:10px;color:#1a2535;margin-bottom:10px;line-height:1.5;">Raw record — system does not categorize. Crystallization is chosen later.</div>
        <input id="dc-location" type="text" placeholder="Location (optional)"
            style="width:100%;box-sizing:border-box;background:#08090f;border:1px solid #141824;border-radius:5px;color:#8896b8;font-family:'DM Mono',monospace;font-size:11px;padding:6px 10px;outline:none;margin-bottom:8px;">
        <textarea id="dc-text" rows="5"
            placeholder="What is happening now? What does the body feel? Why did you slow down?&#10;&#10;Do not categorize — just record."
            style="width:100%;box-sizing:border-box;background:#08090f;border:1px solid #141824;border-radius:6px;color:#c8d0e0;font-family:'DM Mono',monospace;font-size:13px;line-height:1.75;padding:10px 12px;resize:vertical;outline:none;min-height:110px;"></textarea>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:10px;">
            <span style="font-size:10px;color:#141824;">Crystallization is chosen later — for now, just flow.</span>
            <div style="display:flex;gap:8px;">
                <button id="dc-skip" style="padding:7px 14px;border-radius:5px;background:transparent;border:1px solid #141824;color:#2a3048;cursor:pointer;font-family:'DM Mono',monospace;font-size:11px;">Skip</button>
                <button id="dc-save" style="padding:7px 18px;border-radius:5px;background:rgba(180,140,255,0.07);border:1px solid rgba(180,140,255,0.3);color:rgba(180,140,255,0.85);cursor:pointer;font-family:'DM Mono',monospace;font-size:11px;font-weight:600;">Save →</button>
            </div>
        </div>`;
    _ensureDriftStyles();
    document.body.appendChild(panel);
    setTimeout(() => panel.querySelector('#dc-text')?.focus(), 60);
    const dismiss = () => panel.remove();
    document.getElementById('dc-close').onclick = dismiss;
    document.getElementById('dc-skip').onclick  = dismiss;
    document.getElementById('dc-save').onclick  = () => {
        const text     = document.getElementById('dc-text').value.trim();
        const location = document.getElementById('dc-location').value.trim();
        if (!text) { dismiss(); return; }
        const entry = addEntry({
            id: `drift_${Date.now()}`, timestamp: stamp,
            location: location || null, text, crystals: [], status: 'flowing',
        });
        dismiss();
        if (onSave) onSave(entry);
        _driftFlash('Record saved — crystallize from the archive');
    };
}

// ── Layer 2: Archive ───────────────────────────────────────────────────────────

export function openDriftArchive(existingNodes, onCrystallize) {
    document.getElementById('drift-archive')?.remove();
    const panel = document.createElement('div');
    panel.id = 'drift-archive';
    panel.style.cssText = `
        position:fixed;top:0;right:0;width:420px;height:100vh;
        background:rgba(5,6,10,0.99);border-left:1px solid rgba(180,140,255,0.12);
        z-index:700;overflow-y:auto;font-family:'DM Mono',monospace;
        box-shadow:-20px 0 60px rgba(0,0,0,0.7);
        animation:driftSlideRight 0.25s ease-out;`;
    _ensureDriftStyles();
    document.body.appendChild(panel);
    _renderArchive(panel, existingNodes, onCrystallize);
}

function _renderArchive(panel, existingNodes, onCrystallize) {
    const entries = loadEntries();
    panel.innerHTML = `
        <div style="padding:18px 20px 12px;position:sticky;top:0;background:rgba(5,6,10,0.99);z-index:1;border-bottom:1px solid #0c0e16;">
            <div style="display:flex;align-items:center;justify-content:space-between;">
                <span style="font-size:9px;letter-spacing:0.16em;color:rgba(180,140,255,0.7);">DRIFT ARCHIVE</span>
                <div style="display:flex;gap:6px;align-items:center;">
                    <button id="da-new" style="background:rgba(180,140,255,0.06);border:1px solid rgba(180,140,255,0.2);color:rgba(180,140,255,0.7);border-radius:4px;padding:4px 10px;cursor:pointer;font-family:'DM Mono',monospace;font-size:10px;">+ New</button>
                    <button id="da-close" style="background:none;border:none;color:#2a3048;cursor:pointer;font-size:14px;">✕</button>
                </div>
            </div>
            <div style="font-size:10px;color:#1a2535;margin-top:6px;">
                ${entries.length} records · ${entries.filter(e=>e.crystals?.length>0).length} crystallized · ${entries.filter(e=>e.status==='flowing').length} flowing
            </div>
        </div>
        <div id="da-list" style="padding:14px 20px;display:flex;flex-direction:column;gap:10px;">
            ${entries.length === 0
                ? `<div style="color:#1a2535;font-size:12px;padding:30px 0;text-align:center;line-height:1.8;">No records yetok.<br><span style="font-size:10px;">Record when the drift begins.</span></div>`
                : entries.map(e => _entryCard(e)).join('')}
        </div>`;
    document.getElementById('da-close').onclick = () => panel.remove();
    document.getElementById('da-new').onclick   = () => {
        panel.remove();
        openDriftCapture(() => openDriftArchive(existingNodes, onCrystallize));
    };
    panel.querySelectorAll('[data-crystallize]').forEach(btn => {
        btn.onclick = () => {
            const entry = loadEntries().find(e => e.id === btn.dataset.crystallize);
            if (!entry) return;
            _openCrystallizeModal(entry, existingNodes, onCrystallize,
                () => _renderArchive(panel, existingNodes, onCrystallize));
        };
    });
    panel.querySelectorAll('[data-delete]').forEach(btn => {
        btn.onclick = () => {
            saveEntries(loadEntries().filter(e => e.id !== btn.dataset.delete));
            _renderArchive(panel, existingNodes, onCrystallize);
        };
    });
}

function _entryCard(entry) {
    const date = new Date(entry.timestamp).toLocaleString('tr-TR',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
    const sc   = {flowing:'rgba(180,140,255,0.4)',crystallizing:'#ffa500',crystallized:'#00c8a0'}[entry.status]||'#2a3048';
    const prev = entry.text.length > 160 ? entry.text.slice(0,160)+'…' : entry.text;
    const crystals = entry.crystals || [];
    return `
        <div style="border:1px solid #0e1220;border-radius:8px;overflow:hidden;">
            <div style="padding:8px 12px;background:rgba(180,140,255,0.015);border-bottom:1px solid #0e1220;display:flex;align-items:center;justify-content:space-between;">
                <div style="display:flex;align-items:center;gap:8px;">
                    <span style="width:5px;height:5px;border-radius:50%;background:${sc};flex-shrink:0;display:inline-block;"></span>
                    <span style="font-size:10px;color:#2a3048;">${date}</span>
                    ${entry.location?`<span style="font-size:10px;color:#1a2535;">· ${_esc(entry.location)}</span>`:''}
                </div>
                ${crystals.length>0?`<span style="font-size:9px;color:#00c8a0;">${crystals.length} kristal</span>`:''}
            </div>
            <div style="padding:10px 12px;">
                <div style="font-size:12px;color:#445070;line-height:1.7;white-space:pre-wrap;margin-bottom:10px;">${_esc(prev)}</div>
                ${crystals.length>0?`<div style="margin-bottom:8px;display:flex;flex-direction:column;gap:4px;">${crystals.map(c=>`
                    <div style="padding:5px 8px;background:rgba(0,200,160,0.03);border:1px solid rgba(0,200,160,0.12);border-radius:4px;font-size:10px;color:#00c8a0;">
                        ◈ ${_esc((c.selectedText||'').slice(0,55))} ${c.nodeId?`<span style="color:#2a3048;"> → node</span>`:`<span style="color:#1a2535;"> · pending</span>`}
                    </div>`).join('')}</div>`:''}
                <div style="display:flex;gap:6px;">
                    <button data-crystallize="${entry.id}" style="flex:1;padding:5px;border-radius:4px;background:rgba(180,140,255,0.04);border:1px solid rgba(180,140,255,0.18);color:rgba(180,140,255,0.65);cursor:pointer;font-family:'DM Mono',monospace;font-size:10px;">◈ Crystallize</button>
                    <button data-delete="${entry.id}" style="padding:5px 8px;border-radius:4px;background:transparent;border:1px solid rgba(255,90,90,0.12);color:rgba(255,90,90,0.35);cursor:pointer;font-family:'DM Mono',monospace;font-size:10px;">✕</button>
                </div>
            </div>
        </div>`;
}

// ── Crystallization modal ──────────────────────────────────────────────────────

function _openCrystallizeModal(entry, existingNodes, onCrystallize, onRefresh) {
    document.getElementById('crystallize-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'crystallize-modal';
    modal.style.cssText = `position:fixed;inset:0;z-index:800;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(5px);`;
    modal.innerHTML = `
        <div style="width:560px;max-height:88vh;overflow-y:auto;background:#06080e;border:1px solid rgba(180,140,255,0.22);border-radius:12px;font-family:'DM Mono',monospace;">
            <div style="padding:16px 20px 12px;border-bottom:1px solid #0c0e16;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:#06080e;z-index:1;">
                <span style="font-size:9px;letter-spacing:0.14em;color:rgba(180,140,255,0.7);">CRYSTALLIZATION SELECTION</span>
                <button id="cm-close" style="background:none;border:none;color:#2a3048;cursor:pointer;font-size:14px;">✕</button>
            </div>
            <div style="padding:16px 20px;">
                <div style="font-size:10px;color:#1a2535;margin-bottom:12px;line-height:1.6;">Select a passage from the text → düğüm adayına dönüşür.<br>Geri kalanı akar — supplement olarak taşınır.</div>
                ${entry.location?`<div style="font-size:10px;color:#1a2535;margin-bottom:8px;">📍 ${_esc(entry.location)}</div>`:''}
                <div id="cm-text" style="font-size:13px;color:#8e99b3;line-height:1.8;white-space:pre-wrap;padding:12px;background:#08090f;border:1px solid #141824;border-radius:6px;margin-bottom:12px;user-select:text;cursor:text;"
                    onmouseup="window.__driftSel()" ontouchend="window.__driftSel()">${_esc(entry.text)}</div>
                <div id="cm-selected" style="display:none;margin-bottom:12px;padding:8px 12px;background:rgba(180,140,255,0.04);border:1px solid rgba(180,140,255,0.18);border-radius:5px;">
                    <div style="font-size:9px;letter-spacing:0.1em;color:rgba(180,140,255,0.55);margin-bottom:5px;">SELECTED</div>
                    <div id="cm-sel-text" style="font-size:12px;color:#c8d0e0;line-height:1.6;"></div>
                </div>
                <div id="cm-form" style="display:none;flex-direction:column;gap:10px;">
                    <div>
                        <div style="font-size:9px;letter-spacing:0.1em;color:#2a3048;margin-bottom:4px;">NODE CONTENT</div>
                        <textarea id="cm-content" rows="3" style="width:100%;box-sizing:border-box;background:#08090f;border:1px solid #141824;border-radius:5px;color:#c8d0e0;font-family:'DM Mono',monospace;font-size:12px;line-height:1.6;padding:8px 10px;resize:none;outline:none;"></textarea>
                    </div>
                    <div>
                        <div style="font-size:9px;letter-spacing:0.1em;color:#2a3048;margin-bottom:6px;">ONTOLOGICAL STATUS</div>
                        <div style="display:flex;gap:5px;flex-wrap:wrap;">
                            ${[['crystallized','Crystallized','#00c8a0','Form acquired'],['suspended','Suspended','#ffa500','Holds its ambiguity'],['deconstructed','Deconstructed','#ff5a5a','An assumption collapsed'],['flowing','Flowing','#a78bfa','Not yet crystallized']].map(([val,label,color,desc])=>`
                            <label style="display:flex;align-items:flex-start;gap:5px;padding:6px 9px;border-radius:5px;cursor:pointer;border:1px solid ${color}22;background:${color}06;flex:1;min-width:120px;">
                                <input type="radio" name="cm-status" value="${val}" ${val==='crystallized'?'checked':''} style="accent-color:${color};margin-top:2px;">
                                <div><div style="font-size:10px;color:${color};">${label}</div><div style="font-size:9px;color:#1a2535;">${desc}</div></div>
                            </label>`).join('')}
                        </div>
                    </div>
                    <div style="font-size:10px;color:#1a2535;line-height:1.6;padding:8px 10px;background:#08090f;border:1px solid #141824;border-radius:5px;">
                        This record is carried as the node's <span style="color:#34d399;">supplement</span> — like Proust's trace.
                    </div>
                </div>
                <div id="cm-hint" style="font-size:10px;color:#1a2535;text-align:center;padding:8px 0;">↑ Select a passage from the text to begin</div>
            </div>
            <div style="padding:12px 20px;border-top:1px solid #0c0e16;display:flex;gap:8px;justify-content:flex-end;position:sticky;bottom:0;background:#06080e;">
                <button id="cm-cancel" style="padding:7px 16px;border-radius:5px;background:transparent;border:1px solid #141824;color:#2a3048;cursor:pointer;font-family:'DM Mono',monospace;font-size:11px;">Cancel</button>
                <button id="cm-confirm" disabled style="padding:7px 18px;border-radius:5px;background:rgba(180,140,255,0.06);border:1px solid rgba(180,140,255,0.2);color:rgba(180,140,255,0.4);cursor:not-allowed;font-family:'DM Mono',monospace;font-size:11px;font-weight:600;">Create Node →</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    let selectedText = '';
    window.__driftSel = () => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) return;
        selectedText = sel.toString().trim();
        if (selectedText.length < 5) return;
        document.getElementById('cm-selected').style.display = 'block';
        document.getElementById('cm-sel-text').textContent   = selectedText;
        document.getElementById('cm-form').style.display     = 'flex';
        document.getElementById('cm-hint').style.display     = 'none';
        document.getElementById('cm-content').value          = selectedText;
        const btn = document.getElementById('cm-confirm');
        btn.disabled = false; btn.style.color = 'rgba(180,140,255,0.9)';
        btn.style.cursor = 'pointer'; btn.style.borderColor = 'rgba(180,140,255,0.35)';
    };
    const close = () => { modal.remove(); delete window.__driftSel; };
    document.getElementById('cm-close').onclick  = close;
    document.getElementById('cm-cancel').onclick = close;
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    document.getElementById('cm-confirm').onclick = () => {
        const content = document.getElementById('cm-content').value.trim();
        const status  = modal.querySelector('input[name="cm-status"]:checked')?.value || 'crystallized';
        if (!content) return;
        const crystal = { id:`crystal_${Date.now()}`, selectedText, nodeContent:content, status, ontologyStatus:status, nodeId:null, createdAt:new Date().toISOString() };
        const updatedEntry = updateEntry(entry.id, { crystals:[...(entry.crystals||[]),crystal], status:'crystallizing' });
        close();
        if (onCrystallize) onCrystallize({ crystal, entry: updatedEntry });
        if (onRefresh)     onRefresh();
    };
}

// ── Proust katman paneli ──────────────────────────────────────────────────────

export function openTimeLayerPanel(node, onAddComment) {
    document.getElementById('time-layer-panel')?.remove();
    const { layers, innerVoices, outerVoices } = getTimeLayersForNode(node.id || node.node_id);
    if (!layers.length && !innerVoices.length && !outerVoices.length) return;

    const panel = document.createElement('div');
    panel.id = 'time-layer-panel';
    panel.style.cssText = `
        position:fixed;top:0;left:0;width:380px;height:100vh;
        background:rgba(5,6,10,0.99);border-right:1px solid rgba(52,211,153,0.12);
        z-index:650;overflow-y:auto;font-family:'DM Mono',monospace;
        box-shadow:20px 0 60px rgba(0,0,0,0.6);
        animation:driftSlideLeft 0.25s ease-out;`;

    const nodeLabel = (node.content || node.name || '').slice(0,60);
    panel.innerHTML = `
        <div style="padding:18px 20px 12px;position:sticky;top:0;background:rgba(5,6,10,0.99);z-index:1;border-bottom:1px solid #0c0e16;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                <span style="font-size:9px;letter-spacing:0.14em;color:#34d399;">TIME LAYERS</span>
                <button id="tlp-close" style="background:none;border:none;color:#2a3048;cursor:pointer;font-size:14px;">✕</button>
            </div>
            <div style="font-size:11px;color:#445070;line-height:1.5;">${_esc(nodeLabel)}</div>
            <div style="font-size:9px;color:#1a2535;margin-top:4px;">Opening inward — Proust's time</div>
        </div>
        <div style="padding:16px 20px;display:flex;flex-direction:column;gap:0;">
            ${layers.map((layer,i) => `
                <div style="position:relative;padding-left:18px;margin-bottom:0;">
                    <div style="position:absolute;left:6px;top:0;bottom:0;width:1px;background:rgba(52,211,153,0.15);"></div>
                    <div style="position:absolute;left:2px;top:14px;width:9px;height:9px;border-radius:50%;background:rgba(52,211,153,0.6);border:1px solid rgba(52,211,153,0.3);"></div>
                    <div style="padding:10px 12px;background:rgba(52,211,153,0.03);border:1px solid rgba(52,211,153,0.1);border-radius:7px;margin-bottom:2px;">
                        <div style="font-size:9px;letter-spacing:0.1em;color:#34d399;margin-bottom:5px;display:flex;align-items:center;justify-content:space-between;">
                            <span>CRYSTALLIZATION MOMENT</span>
                            <span style="color:#1a2535;font-size:9px;">${new Date(layer.crystalMoment.createdAt).toLocaleString('tr-TR',{day:'2-digit',month:'short',year:'numeric'})}</span>
                        </div>
                        <div style="font-size:12px;color:#8e99b3;line-height:1.6;">${_esc(layer.crystalMoment.selectedText||'')}</div>
                        <div style="margin-top:6px;">${_statusBadge(layer.crystalMoment.ontologyStatus)}</div>
                    </div>
                </div>
                <div style="position:relative;padding-left:30px;margin-bottom:12px;">
                    <div style="position:absolute;left:18px;top:0;bottom:0;width:1px;background:rgba(180,140,255,0.1);"></div>
                    <div style="position:absolute;left:14px;top:12px;width:8px;height:8px;border-radius:50%;background:rgba(180,140,255,0.3);border:1px solid rgba(180,140,255,0.2);"></div>
                    <details style="border:1px solid rgba(180,140,255,0.08);border-radius:6px;overflow:hidden;">
                        <summary style="padding:8px 12px;cursor:pointer;font-size:9px;letter-spacing:0.1em;color:rgba(180,140,255,0.5);list-style:none;display:flex;align-items:center;justify-content:space-between;background:rgba(180,140,255,0.02);">
                            <span>RAW FLOW</span>
                            <span style="font-size:9px;color:#1a2535;">${layer.rawFlow.location?`📍 ${_esc(layer.rawFlow.location)} · `:''}${new Date(layer.rawFlow.timestamp).toLocaleString('tr-TR',{day:'2-digit',month:'short',year:'numeric'})}</span>
                        </summary>
                        <div style="padding:10px 12px;font-size:11px;color:#445070;line-height:1.8;white-space:pre-wrap;border-top:1px solid rgba(180,140,255,0.06);">${_esc(layer.rawFlow.fullText)}</div>
                    </details>
                </div>`).join('')}

            ${innerVoices.length>0?`
                <div style="margin-bottom:12px;">
                    <div style="font-size:9px;letter-spacing:0.1em;color:#6366f1;margin-bottom:8px;">INNER VOICES</div>
                    ${innerVoices.map(c=>`
                        <div style="padding:8px 10px;background:rgba(99,102,241,0.03);border:1px solid rgba(99,102,241,0.1);border-radius:5px;margin-bottom:5px;">
                            <div style="font-size:10px;color:#1a2535;margin-bottom:4px;">${new Date(c.timestamp).toLocaleString('tr-TR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</div>
                            <div style="font-size:11px;color:#6366f1;line-height:1.6;">${_esc(c.text)}</div>
                        </div>`).join('')}
                </div>`:''}

            ${outerVoices.length>0?`
                <div style="margin-bottom:12px;">
                    <div style="font-size:9px;letter-spacing:0.1em;color:#94a3b8;margin-bottom:8px;">OUTER VOICES</div>
                    ${outerVoices.map(c=>`
                        <div style="padding:8px 10px;background:rgba(148,163,184,0.03);border:1px solid rgba(148,163,184,0.1);border-radius:5px;margin-bottom:5px;">
                            <div style="font-size:10px;color:#1a2535;margin-bottom:4px;">${new Date(c.timestamp).toLocaleString('tr-TR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</div>
                            <div style="font-size:11px;color:#94a3b8;line-height:1.6;">${_esc(c.text)}</div>
                        </div>`).join('')}
                </div>`:''}

            <div style="border-top:1px solid #0c0e16;padding-top:14px;margin-top:4px;">
                <div style="font-size:9px;letter-spacing:0.1em;color:#2a3048;margin-bottom:8px;">ADD COMMENT</div>
                <div style="display:flex;gap:6px;margin-bottom:8px;">
                    <label style="flex:1;display:flex;align-items:center;gap:5px;padding:5px 8px;border-radius:4px;cursor:pointer;border:1px solid rgba(99,102,241,0.2);background:rgba(99,102,241,0.04);">
                        <input type="radio" name="comment-type" value="inner" checked style="accent-color:#6366f1;">
                        <div><div style="font-size:10px;color:#6366f1;">Inner voice</div><div style="font-size:9px;color:#1a2535;">Looking back at your own past</div></div>
                    </label>
                    <label style="flex:1;display:flex;align-items:center;gap:5px;padding:5px 8px;border-radius:4px;cursor:pointer;border:1px solid rgba(148,163,184,0.15);background:rgba(148,163,184,0.03);">
                        <input type="radio" name="comment-type" value="outer" style="accent-color:#94a3b8;">
                        <div><div style="font-size:10px;color:#94a3b8;">Outer voice</div><div style="font-size:9px;color:#1a2535;">As someone passing through</div></div>
                    </label>
                </div>
                <textarea id="tlp-comment" rows="3" placeholder="What do you see when you look at this node?"
                    style="width:100%;box-sizing:border-box;background:#08090f;border:1px solid #141824;border-radius:5px;color:#c8d0e0;font-family:'DM Mono',monospace;font-size:11px;line-height:1.6;padding:7px 10px;resize:none;outline:none;"></textarea>
                <button id="tlp-save-comment" style="margin-top:7px;width:100%;padding:7px;border-radius:5px;background:rgba(52,211,153,0.05);border:1px solid rgba(52,211,153,0.15);color:#34d399;cursor:pointer;font-family:'DM Mono',monospace;font-size:11px;">Save →</button>
            </div>
        </div>`;

    _ensureDriftStyles();
    document.body.appendChild(panel);
    document.getElementById('tlp-close').onclick = () => panel.remove();
    document.getElementById('tlp-save-comment').onclick = () => {
        const text = document.getElementById('tlp-comment').value.trim();
        if (!text) return;
        const type = panel.querySelector('input[name="comment-type"]:checked')?.value || 'inner';
        const comment = addComment(node.id || node.node_id, text, type);
        if (onAddComment) onAddComment(comment);
        panel.remove();
        openTimeLayerPanel(node, onAddComment);
        _driftFlash(type === 'inner' ? 'Inner voice eklendi' : 'Outer voice eklendi');
    };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function _statusBadge(status) {
    const map = {crystallized:['Crystallized','#00c8a0'],suspended:['Suspended','#ffa500'],deconstructed:['Deconstructed','#ff5a5a'],flowing:['Flowing','#a78bfa']};
    const [label,color] = map[status]||['Unknown','#445070'];
    return `<span style="font-size:9px;color:${color};border:1px solid ${color}33;border-radius:3px;padding:2px 6px;">${label}</span>`;
}

function _esc(str) {
    return (str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _driftFlash(msg) {
    const f = document.createElement('div');
    f.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(5,6,10,0.95);border:1px solid rgba(180,140,255,0.25);border-radius:5px;padding:7px 16px;z-index:900;font-family:'DM Mono',monospace;font-size:11px;color:rgba(180,140,255,0.75);white-space:nowrap;animation:driftFadeUp 0.3s ease-out;`;
    f.textContent = msg;
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 3000);
}

function _ensureDriftStyles() {
    if (document.getElementById('drift-styles')) return;
    const s = document.createElement('style');
    s.id = 'drift-styles';
    s.textContent = `
        @keyframes driftSlideUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes driftSlideRight{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
        @keyframes driftSlideLeft{from{transform:translateX(-100%);opacity:0}to{transform:translateX(0);opacity:1}}
        @keyframes driftFadeUp{from{opacity:0;transform:translate(-50%,8px)}to{opacity:1;transform:translate(-50%,0)}}
    `;
    document.head.appendChild(s);
}