export function renderEpistemicLogPrompt(node, onSave) {
    document.getElementById('epistemic-log-prompt')?.remove();

    const prompt = document.createElement('div');
    prompt.id = 'epistemic-log-prompt';
    prompt.style.cssText = `
        position:fixed; bottom:110px; left:50%; transform:translateX(-50%);
        width:480px; background:rgba(8,10,16,0.97);
        border:1px solid rgba(0,200,160,0.35); border-radius:10px;
        padding:16px 20px; z-index:500; font-family:'DM Mono',monospace;
        box-shadow:0 0 40px rgba(0,200,160,0.08);`;
    prompt.innerHTML = `
        <div style="font-size:10px;letter-spacing:0.12em;color:var(--concept);margin-bottom:8px;">EPISTEMIC LOG</div>
        <div style="font-size:12px;color:#8e99b3;margin-bottom:10px;">Why did you place <strong style="color:#c8d0e0">${(node.content || node.name || '').slice(0, 40)}</strong> here?</div>
        <textarea id="elog-note" rows="2"
            placeholder="e.g. This contradicts the assumption in Chapter 3…"
            style="width:100%;box-sizing:border-box;background:#0c0e16;border:1px solid #1e2535;border-radius:6px;color:#c8d0e0;font-family:'DM Mono',monospace;font-size:12px;padding:8px 10px;resize:none;outline:none;"></textarea>
        <div style="display:flex;gap:8px;margin-top:10px;">
            <button id="elog-skip" style="flex:1;padding:7px;border-radius:6px;background:transparent;border:1px solid #1e2535;color:#445070;cursor:pointer;font-family:'DM Mono',monospace;font-size:11px;">Skip</button>
            <button id="elog-save" style="flex:2;padding:7px;border-radius:6px;background:rgba(0,200,160,0.08);border:1px solid rgba(0,200,160,0.4);color:var(--concept);cursor:pointer;font-family:'DM Mono',monospace;font-size:11px;font-weight:600;">Save Note &#x2192;</button>
        </div>`;

    document.body.appendChild(prompt);
    setTimeout(() => prompt.querySelector('#elog-note')?.focus(), 50);

    const dismiss = () => prompt.remove();
    document.getElementById('elog-skip').onclick = dismiss;
    document.getElementById('elog-save').onclick = () => {
        const note = document.getElementById('elog-note').value.trim();
        dismiss();
        if (note) onSave(note);
    };
    setTimeout(dismiss, 12000);
}