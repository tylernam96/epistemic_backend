export function renderAIAnalyzePanel(existingNodes, onSubmit) {
    document.getElementById('ai-analyze-panel')?.remove();

    const panel = document.createElement('div');
    panel.id = 'ai-analyze-panel';
    panel.className = 'creation-modal-overlay';
    panel.innerHTML = `
        <div class="creation-modal creation-modal--wide" style="max-width:600px;">
            <div class="modal-header">
                <span class="modal-tag" style="color:#00c8a0;">&#x2728; MAP EXTRACTOR</span>
                <button class="modal-close" id="aap-close">&#x2715;</button>
            </div>
            <div class="modal-body" style="gap:14px;">
                <div style="font-size:11px;color:#445070;line-height:1.7;font-family:'DM Mono',monospace;">
                    Paste text — the AI extracts a <span style="color:#00c8a0;">Core Concept</span>,
                    <span style="color:#a65129;">Observation</span>, and
                    <span style="color:#ff5a5a;">Counter-Argument</span>.
                    Each becomes a node placed by semantic similarity.
                </div>
                <div class="field-group">
                    <label>Text to extract from <span class="req">*</span></label>
                    <textarea id="aap-text" rows="6" placeholder="Paste notes, a hypothesis, a quote, or any passage…"></textarea>
                </div>
                <div id="aap-progress" style="display:none;">
                    <div style="font-size:10px;letter-spacing:0.1em;color:#445070;font-family:'DM Mono',monospace;margin-bottom:10px;">EXTRACTING…</div>
                    <div id="aap-steps" style="display:flex;flex-direction:column;gap:6px;font-family:'DM Mono',monospace;font-size:11px;"></div>
                </div>
                <div id="aap-fragments" style="display:none;flex-direction:column;gap:10px;"></div>
                <div id="aap-error" class="modal-error" style="display:none;"></div>
            </div>
            <div class="modal-footer">
                <button class="modal-btn-cancel" id="aap-cancel">Cancel</button>
                <button class="modal-btn-confirm" id="aap-analyze">Extract &amp; Place &#x2728;</button>
            </div>
        </div>`;

    document.body.appendChild(panel);
    document.getElementById('aap-close').onclick  = () => panel.remove();
    document.getElementById('aap-cancel').onclick = () => panel.remove();
    panel.addEventListener('click', e => { if (e.target === panel) panel.remove(); });

    const FRAG_META = {
        core_concept:    { label: 'CORE CONCEPT',    color: '#00c8a0', icon: '◈' },
        observation:     { label: 'OBSERVATION',      color: '#a65129', icon: '◉' },
        counter_argument:{ label: 'COUNTER-ARGUMENT', color: '#ff5a5a', icon: '◆' },
    };

    const setStep = (id, text, done = false) => {
        let el = document.getElementById(`aap-step-${id}`);
        if (!el) {
            el = document.createElement('div');
            el.id = `aap-step-${id}`;
            el.style.cssText = 'display:flex;align-items:center;gap:8px;color:#445070;';
            document.getElementById('aap-steps').appendChild(el);
        }
        el.innerHTML = `<span style="color:${done ? '#00c8a0' : '#8896b8'};">${done ? '✓' : '…'}</span> ${text}`;
    };

    document.getElementById('aap-analyze').onclick = async () => {
        const text = document.getElementById('aap-text').value.trim();
        if (!text) {
            const err = document.getElementById('aap-error');
            err.textContent = 'Please enter some text to extract from.';
            err.style.display = 'block';
            return;
        }

        const btn = document.getElementById('aap-analyze');
        btn.textContent = 'Extracting…'; btn.disabled = true;
        document.getElementById('aap-error').style.display = 'none';
        document.getElementById('aap-fragments').style.display = 'none';

        const progress = document.getElementById('aap-progress');
        progress.style.display = 'block';
        document.getElementById('aap-steps').innerHTML = '';
        setStep('extract', 'Sending text to Map Extractor…');

        try {
            const res = await fetch('/api/ai/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text,
                    existing_node_ids: existingNodes.map(n => n.node_id).filter(Boolean),
                }),
            });
            if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'API error'); }
            const result = await res.json();
            setStep('extract', 'Map Extractor complete — 3 fragments extracted', true);

            const fragsEl = document.getElementById('aap-fragments');
            fragsEl.innerHTML = '';
            fragsEl.style.display = 'flex';

            const fragments  = result.fragments || {};
            const activeFrags = {};

            for (const [key, frag] of Object.entries(fragments)) {
                if (!frag || !frag.content) continue;
                const meta = FRAG_META[key] || { label: key, color: '#8896b8', icon: '○' };
                activeFrags[key] = true;

                const relRows = (frag.suggested_relations || []).map(sr => `
                    <div style="display:flex;align-items:flex-start;gap:6px;margin-top:5px;padding:6px 8px;background:rgba(255,255,255,0.02);border:1px solid #1e2535;border-radius:5px;">
                        <span style="color:${meta.color};font-size:9px;margin-top:2px;">→</span>
                        <div style="flex:1;">
                            <span style="color:#8896b8;font-size:10px;">${sr.rel_type}</span>
                            <span style="color:#445070;font-size:10px;margin-left:4px;">${sr.node_id}</span>
                            ${sr.auto ? '<span style="color:#445070;font-size:9px;"> (embedding match)</span>' : ''}
                            <div style="color:#445070;font-size:10px;margin-top:2px;">${sr.justification || ''}</div>
                        </div>
                    </div>`).join('');

                const pos  = frag.position || {};
                const card = document.createElement('div');
                card.dataset.fragKey = key;
                card.style.cssText = `background:rgba(255,255,255,0.02);border:1px solid ${meta.color}44;border-radius:8px;padding:12px 14px;font-family:'DM Mono',monospace;cursor:pointer;transition:border-color 0.15s;`;
                card.innerHTML = `
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                        <div style="display:flex;align-items:center;gap:6px;">
                            <span style="color:${meta.color};font-size:14px;">${meta.icon}</span>
                            <span style="color:${meta.color};font-size:10px;letter-spacing:0.1em;">${meta.label}</span>
                        </div>
                        <div style="display:flex;align-items:center;gap:8px;">
                            <span style="font-size:9px;color:#445070;">x:${pos.x ?? '?'} y:${pos.y ?? '?'} z:${pos.z ?? '?'}</span>
                            <div class="frag-checkbox" data-key="${key}"
                                style="width:16px;height:16px;border-radius:4px;border:1px solid ${meta.color};background:${meta.color}33;display:flex;align-items:center;justify-content:center;color:${meta.color};font-size:11px;">✓</div>
                        </div>
                    </div>
                    <div style="color:#c8d0e0;font-size:12px;line-height:1.6;margin-bottom:${relRows ? '8px' : '0'};">${frag.content}</div>
                    ${relRows ? `<div style="margin-top:4px;">${relRows}</div>` : ''}`;

                card.querySelector('.frag-checkbox').addEventListener('click', (e) => {
                    e.stopPropagation();
                    activeFrags[key] = !activeFrags[key];
                    const cb = card.querySelector('.frag-checkbox');
                    if (activeFrags[key]) {
                        cb.style.background = `${meta.color}33`; cb.style.border = `1px solid ${meta.color}`; cb.innerHTML = '✓'; card.style.borderColor = `${meta.color}44`;
                    } else {
                        cb.style.background = 'transparent'; cb.style.border = '1px solid #1e2535'; cb.innerHTML = ''; card.style.borderColor = '#1e2535';
                    }
                });
                fragsEl.appendChild(card);
            }

            progress.style.display = 'none';
            btn.innerHTML = 'Place Selected Nodes &#x2192;';
            btn.disabled = false;
            btn.onclick = () => {
                const selected = Object.entries(activeFrags)
                    .filter(([, v]) => v)
                    .map(([k]) => ({ key: k, ...fragments[k] }))
                    .filter(f => f.content);
                if (!selected.length) {
                    const err = document.getElementById('aap-error');
                    err.textContent = 'Select at least one fragment to place.';
                    err.style.display = 'block';
                    return;
                }
                panel.remove();
                onSubmit(selected, result);
            };

        } catch (err) {
            progress.style.display = 'none';
            const errEl = document.getElementById('aap-error');
            errEl.textContent = `Error: ${err.message}`; errEl.style.display = 'block';
            btn.textContent = 'Extract & Place ✨'; btn.disabled = false;
        }
    };
}

export function renderAISuggestionPanel(newNode, analysisResult, allNodes, onConfirm) {
    document.getElementById('ai-suggestion-panel')?.remove();

    const suggestions = (analysisResult.suggested_relations || []).map(sr => {
        const target = allNodes.find(n =>
            n.node_id === sr.node_id ||
            (n.content || '').toLowerCase().includes((sr.match_hint || '').toLowerCase())
        );
        return target ? { ...sr, target_id: target.id, target_name: target.content || target.name } : null;
    }).filter(Boolean);

    const panel = document.createElement('div');
    panel.id = 'ai-suggestion-panel';
    panel.style.cssText = `
        position:fixed; top:20px; left:220px; width:300px;
        background:rgba(8,10,16,0.97); border:1px solid rgba(0,200,160,0.3);
        border-radius:10px; padding:16px 18px; z-index:300;
        font-family:'DM Mono',monospace; box-shadow:0 0 40px rgba(0,200,160,0.06);`;

    const accepted = new Set(suggestions.map((_, i) => i));

    const render = () => {
        panel.innerHTML = `
            <div style="font-size:10px;letter-spacing:0.12em;color:var(--concept);margin-bottom:10px;">&#x2728; SUGGESTED RELATIONS</div>
            <div style="font-size:11px;color:#8e99b3;margin-bottom:12px;line-height:1.5;">
                <strong style="color:#c8d0e0">${(newNode.content||'').slice(0,40)}</strong> has been placed. Accept or reject suggested connections:
            </div>
            ${suggestions.length === 0
                ? `<div style="color:#445070;font-size:11px;margin-bottom:12px;">No relation suggestions for existing nodes.</div>`
                : suggestions.map((sr, i) => `
                    <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;padding:8px;
                        background:rgba(255,255,255,0.02);
                        border:1px solid ${accepted.has(i) ? 'rgba(0,200,160,0.25)' : '#1e2535'};
                        border-radius:6px;cursor:pointer;" data-idx="${i}">
                        <div style="margin-top:1px;width:14px;height:14px;border-radius:3px;
                            border:1px solid ${accepted.has(i) ? 'var(--concept)' : '#445070'};
                            background:${accepted.has(i) ? 'rgba(0,200,160,0.2)' : 'transparent'};
                            flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--concept);">
                            ${accepted.has(i) ? '&#x2713;' : ''}
                        </div>
                        <div style="flex:1;min-width:0;">
                            <div style="font-size:10px;font-weight:600;color:${sr.rel_type === 'CONTRADICTS' ? '#ff5a5a' : 'var(--concept)'};letter-spacing:0.05em;margin-bottom:2px;">${sr.rel_type}</div>
                            <div style="font-size:11px;color:#c8d0e0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${sr.target_name}</div>
                            <div style="font-size:10px;color:#445070;margin-top:2px;line-height:1.4;">${sr.justification}</div>
                        </div>
                    </div>`).join('')}
            <div style="display:flex;gap:8px;margin-top:4px;">
                <button id="asp-dismiss" style="flex:1;padding:7px;border-radius:6px;background:transparent;border:1px solid #1e2535;color:#445070;cursor:pointer;font-size:11px;">Dismiss</button>
                <button id="asp-confirm" style="flex:2;padding:7px;border-radius:6px;background:rgba(0,200,160,0.08);border:1px solid rgba(0,200,160,0.4);color:var(--concept);cursor:pointer;font-size:11px;font-weight:600;">Create Selected &#x2192;</button>
            </div>`;

        panel.querySelectorAll('[data-idx]').forEach(el => {
            el.onclick = () => {
                const i = parseInt(el.dataset.idx);
                if (accepted.has(i)) accepted.delete(i); else accepted.add(i);
                render();
            };
        });
        panel.querySelector('#asp-dismiss').onclick = () => { panel.remove(); onConfirm([]); };
        panel.querySelector('#asp-confirm').onclick = () => { panel.remove(); onConfirm(suggestions.filter((_, i) => accepted.has(i))); };
    };

    document.body.appendChild(panel);
    render();
}