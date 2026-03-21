export async function renderAIChallenge(node) {
    document.getElementById('ai-challenge-panel')?.remove();

    const panel = document.createElement('div');
    panel.id = 'ai-challenge-panel';
    panel.className = 'creation-modal-overlay';
    panel.innerHTML = `
        <div class="creation-modal creation-modal--wide">
            <div class="modal-header">
                <span class="modal-tag" style="color:#e85090;">&#x26A1; AI CHALLENGE</span>
                <button class="modal-close" id="ai-close">&#x2715;</button>
            </div>
            <div class="modal-body" style="gap:16px;">
                <div style="font-size:11px;color:#445070;font-family:'DM Mono',monospace;padding:8px 0;">Challenging concept:</div>
                <div style="background:rgba(232,80,144,0.07);border:1px solid rgba(232,80,144,0.2);border-radius:6px;padding:10px 14px;color:#c8d0e0;font-size:13px;line-height:1.6;">${node.content || node.name}</div>
                <div id="ai-response-container" style="background:#0c0e16;border:1px solid #1e2535;border-radius:6px;padding:16px;min-height:120px;font-size:13px;color:#8e99b3;font-family:'DM Mono',monospace;line-height:1.7;white-space:pre-wrap;">
                    <span style="color:#445070;">Analyzing concept...</span>
                </div>
            </div>
            <div class="modal-footer">
                <button class="modal-btn-cancel" id="ai-dismiss">Dismiss</button>
                <button class="modal-btn-confirm" id="ai-rechallenge" style="opacity:0.4;pointer-events:none;">Challenge Again &#x2192;</button>
            </div>
        </div>`;

    document.body.appendChild(panel);
    document.getElementById('ai-close').onclick   = () => panel.remove();
    document.getElementById('ai-dismiss').onclick = () => panel.remove();
    panel.addEventListener('click', e => { if (e.target === panel) panel.remove(); });

    const container = document.getElementById('ai-response-container');

    const challenge = async () => {
        container.innerHTML = '<span style="color:#445070;">Analyzing concept...</span>';
        const rechallengeBtn = document.getElementById('ai-rechallenge');
        rechallengeBtn.style.opacity = '0.4';
        rechallengeBtn.style.pointerEvents = 'none';
        try {
            const response = await fetch('/api/ai/challenge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: node.content || node.name, parent_type: node.parent_type || node.node_type || 'Concept' }),
            });
            if (!response.ok) throw new Error(`Server error ${response.status}`);
            const data = await response.json();
            container.style.color = '#c8d0e0';
            container.textContent = data.result;
            const btn = document.getElementById('ai-rechallenge');
            if (btn) { btn.style.opacity = '1'; btn.style.pointerEvents = 'auto'; }
        } catch (err) {
            container.style.color = '#ff5a5a';
            container.textContent = `Error: ${err.message}`;
        }
    };

    document.getElementById('ai-rechallenge').onclick = challenge;
    await challenge();
}