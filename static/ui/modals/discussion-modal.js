export function renderDiscussionNodeModal(selectedNodes, onSubmit) {
    document.getElementById('discussion-node-modal')?.remove();

    const LEVEL_NAMES = { 1:'Observation', 2:'Evidence', 3:'Hypothesis', 4:'Principle', 5:'Axiom' };

    const memberChips = () => selectedNodes.map((n, i) => `
        <div id="disc-chip-${i}" style="
            display:inline-flex; align-items:center; gap:6px;
            background:rgba(232,80,144,0.07); border:1px solid rgba(232,80,144,0.25);
            border-radius:6px; padding:5px 10px; font-size:11px; color:#e85090;
            font-family:'DM Mono',monospace; margin:3px;">
            <span style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
                title="${(n.content || n.name || '').replace(/"/g,'&quot;')}">
                ${(n.content || n.name || 'Unnamed').slice(0, 40)}
            </span>
            <button data-disc-remove="${i}" style="
                background:none; border:none; color:rgba(232,80,144,0.5);
                cursor:pointer; font-size:12px; padding:0; line-height:1;">&#x2715;</button>
        </div>`).join('');

    const modal = document.createElement('div');
    modal.id = 'discussion-node-modal';
    modal.className = 'creation-modal-overlay';
    modal.innerHTML = `
        <div class="creation-modal creation-modal--wide">
            <div class="modal-header">
                <span class="modal-tag" style="color:#e85090;">NEW DISCUSSION</span>
                <button class="modal-close" id="disc-modal-close">&#x2715;</button>
            </div>
            <div class="modal-body">
                <div class="field-group">
                    <label>Discussion Title <span class="req">*</span></label>
                    <input type="text" id="disc-title" placeholder="What is this discussion about?" style="font-size:13px;">
                </div>
                <div class="field-group">
                    <label>Context <span class="opt">(optional — frames the discussion)</span></label>
                    <textarea id="disc-context" rows="2" placeholder="What question, tension, or problem does this discussion address?"></textarea>
                </div>
                <div class="field-group">
                    <label style="display:flex;align-items:center;justify-content:space-between;">
                        <span>Member Nodes <span class="req">*</span>
                            <span style="color:#445070;font-size:9px;margin-left:6px;">(${selectedNodes.length} selected)</span>
                        </span>
                    </label>
                    <div id="disc-member-chips" style="
                        min-height:40px; padding:6px;
                        background:#0c0e16; border:1px solid #1e2535; border-radius:6px;
                        display:flex; flex-wrap:wrap; align-items:flex-start;">
                        ${memberChips()}
                    </div>
                    <div style="font-size:10px;color:#2a3048;margin-top:4px;font-family:'DM Mono',monospace;">
                        DISCUSSES edges will be created from the discussion node to each member.
                    </div>
                </div>
                <div class="field-group">
                    <label>Abstraction Level <span class="opt">(encoded as color — 1=observation … 5=axiom)</span></label>
                    <div class="slider-row">
                        <input type="range" id="disc-abstraction" min="1" max="5" step="1" value="3">
                        <span id="disc-abstraction-val" style="color:#e85090;width:90px;font-size:10px;flex-shrink:0;">3 — Hypothesis</span>
                    </div>
                </div>
                <div id="disc-error" class="modal-error" style="display:none"></div>
            </div>
            <div class="modal-footer">
                <button class="modal-btn-cancel" id="disc-modal-cancel">Cancel</button>
                <button class="modal-btn-confirm" id="disc-modal-submit"
                    style="background:rgba(232,80,144,0.08);border-color:#e85090;color:#e85090;">
                    Create Discussion &#x2192;
                </button>
            </div>
        </div>`;

    document.body.appendChild(modal);

    const absSlider = document.getElementById('disc-abstraction');
    const absVal    = document.getElementById('disc-abstraction-val');
    absSlider.oninput = () => { absVal.textContent = `${absSlider.value} — ${LEVEL_NAMES[absSlider.value]}`; };

    const chipsEl = document.getElementById('disc-member-chips');
    chipsEl.addEventListener('click', e => {
        const idx = e.target.closest('[data-disc-remove]')?.dataset.discRemove;
        if (idx == null) return;
        selectedNodes.splice(parseInt(idx), 1);
        chipsEl.innerHTML = memberChips();
        modal.querySelector('span.req + span').textContent = `(${selectedNodes.length} selected)`;
    });

    const close = () => modal.remove();
    document.getElementById('disc-modal-close').onclick  = close;
    document.getElementById('disc-modal-cancel').onclick = close;
    modal.addEventListener('click', e => { if (e.target === modal) close(); });

    document.getElementById('disc-modal-submit').onclick = async () => {
        const title = document.getElementById('disc-title').value.trim();
        const errEl = document.getElementById('disc-error');
        if (!title) { errEl.textContent = 'A discussion title is required.'; errEl.style.display = 'block'; document.getElementById('disc-title').focus(); return; }
        if (selectedNodes.length < 2) { errEl.textContent = 'A discussion needs at least 2 member nodes.'; errEl.style.display = 'block'; return; }
        errEl.style.display = 'none';
        const btn = document.getElementById('disc-modal-submit');
        btn.textContent = 'Creating…'; btn.disabled = true;
        try {
            await onSubmit({
                title,
                context:           document.getElementById('disc-context').value.trim(),
                abstraction_level: parseInt(absSlider.value),
                memberIds:         selectedNodes.map(n => n.id),
            });
            modal.remove();
        } catch (err) {
            errEl.textContent = `Error: ${err.message}`; errEl.style.display = 'block';
            btn.textContent = 'Create Discussion →'; btn.disabled = false;
        }
    };
}

export function showDiscussionSelectionBanner(selectedNodes, onConfirm, onCancel) {
    document.getElementById('disc-selection-banner')?.remove();

    const banner = document.createElement('div');
    banner.id = 'disc-selection-banner';
    banner.style.cssText = `
        position:fixed; bottom:90px; left:50%; transform:translateX(-50%);
        z-index:1000; display:flex; align-items:center; gap:14px;
        background:rgba(10,12,18,0.95); border:1px solid #e85090;
        border-radius:10px; padding:12px 20px;
        font-family:'DM Mono',monospace; font-size:11px;
        box-shadow:0 0 40px rgba(232,80,144,0.15);
        backdrop-filter:blur(12px); pointer-events:auto;`;

    const update = () => {
        const count = selectedNodes.length;
        banner.innerHTML = `
            <span style="color:#e85090;letter-spacing:0.1em;font-weight:600;">DISCUSSION MODE</span>
            <span style="color:#445070;">—</span>
            <span style="color:#c8d0e0;">
                ${count === 0 ? 'Click nodes to add members' : `${count} node${count !== 1 ? 's' : ''} selected`}
            </span>
            ${count > 0 ? `
            <div style="display:flex;gap:6px;flex-wrap:wrap;max-width:300px;">
                ${selectedNodes.slice(0,4).map(n => `
                    <span style="background:rgba(232,80,144,0.08);border:1px solid rgba(232,80,144,0.2);
                        border-radius:4px;padding:2px 8px;color:#e85090;font-size:10px;
                        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px;"
                        title="${(n.content || n.name || '').replace(/"/g,'&quot;')}">
                        ${(n.content || n.name || 'Node').slice(0,20)}
                    </span>`).join('')}
                ${count > 4 ? `<span style="color:#445070;font-size:10px;align-self:center;">+${count-4} more</span>` : ''}
            </div>` : ''}
            <button id="disc-sel-confirm" style="
                background:rgba(232,80,144,0.1); border:1px solid #e85090; color:#e85090;
                border-radius:6px; padding:7px 16px;
                cursor:${count >= 2 ? 'pointer' : 'not-allowed'};
                font-family:'DM Mono',monospace; font-size:11px; font-weight:600;
                opacity:${count >= 2 ? '1' : '0.35'}; white-space:nowrap;">
                Confirm (${count}) &#x2192;</button>
            <button id="disc-sel-cancel" style="
                background:none; border:1px solid #1e2535; color:#445070;
                border-radius:6px; padding:7px 12px; cursor:pointer;
                font-family:'DM Mono',monospace; font-size:11px;">&#x2715; Cancel</button>`;

        document.getElementById('disc-sel-confirm').onclick = () => { if (selectedNodes.length >= 2) onConfirm([...selectedNodes]); };
        document.getElementById('disc-sel-cancel').onclick  = () => { banner.remove(); onCancel(); };
    };

    document.body.appendChild(banner);
    update();
    return update;
}