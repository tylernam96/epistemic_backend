import { resolveRelColor } from '../utils/colors.js';

export function renderRelationInspector(link, sourceNode, targetNode, onDelete) {
    document.getElementById('relation-inspector')?.remove();

    const relType  = (link.rel_type || link.type || '').toUpperCase().trim();
    const relColor = resolveRelColor(relType);
    const srcName  = sourceNode?.content || sourceNode?.name || '?';
    const tgtName  = targetNode?.content || targetNode?.name || '?';

    const fmt      = v => (v != null && v !== '' ? v : null);
    const fmtFloat = v => (v != null ? parseFloat(v).toFixed(2) : null);

    const rows = [
        ['Justification', fmt(link.justification)],
        ['Mechanism',     fmt(link.mechanism)],
        ['Weight',        fmtFloat(link.weight)],
        ['Confidence',    fmtFloat(link.confidence)],
        ['Evidence',      fmt(link.evidence_type)],
        ['Scope',         fmt(link.scope)],
        ['Status',        fmt(link.status)],
        ['Epoch from',    fmt(link.valid_from)],
        ['Epoch to',      fmt(link.valid_to)],
    ].filter(([, v]) => v !== null);

    const panel = document.createElement('div');
    panel.id = 'relation-inspector';
    panel.className = 'panel';
    panel.style.display = 'block';
    panel.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
            <span style="font-size:11px;font-weight:700;letter-spacing:0.12em;color:${relColor};font-family:'DM Mono',monospace;">${relType || '—'}</span>
            <button id="rel-insp-close" style="background:none;border:none;color:#445070;font-size:14px;cursor:pointer;padding:2px 6px;border-radius:4px;">&#x2715;</button>
        </div>
        <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;margin-bottom:14px;background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:6px;font-size:12px;">
            <span style="color:#c8d0e0;flex:1;text-align:right;">${srcName}</span>
            <span style="color:${relColor};font-size:16px;flex-shrink:0;">&#x2192;</span>
            <span style="color:#c8d0e0;flex:1;">${tgtName}</span>
        </div>
        ${rows.length > 0 ? `
        <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px;">
            ${rows.map(([label, val]) => `
                <div style="display:flex;gap:8px;font-size:11px;font-family:'DM Mono',monospace;">
                    <span style="color:#445070;min-width:80px;flex-shrink:0;">${label}</span>
                    <span style="color:#8e99b3;word-break:break-word;">${val}</span>
                </div>`).join('')}
        </div>` : `<div style="color:#445070;font-size:11px;font-family:'DM Mono',monospace;margin-bottom:16px;">No metadata</div>`}
        <div style="display:flex;gap:8px;">
            <button id="rel-insp-edit" style="flex:1;padding:9px;border-radius:6px;background:rgba(0,200,160,0.07);border:1px solid rgba(0,200,160,0.3);color:var(--concept);cursor:pointer;font-family:'DM Mono',monospace;font-size:11px;letter-spacing:0.05em;">Edit &#x270E;</button>
            <button id="rel-insp-delete" style="flex:1;padding:9px;border-radius:6px;background:rgba(255,90,90,0.05);border:1px solid rgba(255,90,90,0.25);color:rgba(255,90,90,0.6);cursor:pointer;font-family:'DM Mono',monospace;font-size:11px;letter-spacing:0.05em;">Delete</button>
        </div>`;

    document.body.appendChild(panel);
    document.getElementById('rel-insp-close').onclick = () => panel.remove();

    document.getElementById('rel-insp-edit').onclick = () => {
        panel.remove();
        window.UI.renderEditRelationModal(link, async (updates) => {
            await fetch(`/api/links/${link.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates),
            });
            window.dispatch('REFRESH');
        });
    };

    const deleteBtn = document.getElementById('rel-insp-delete');
    deleteBtn.onmouseenter = () => { deleteBtn.style.background = 'rgba(255,90,90,0.12)'; deleteBtn.style.color = '#ff5a5a'; deleteBtn.style.borderColor = '#ff5a5a'; };
    deleteBtn.onmouseleave = () => { deleteBtn.style.background = 'rgba(255,90,90,0.05)'; deleteBtn.style.color = 'rgba(255,90,90,0.6)'; deleteBtn.style.borderColor = 'rgba(255,90,90,0.25)'; };
    deleteBtn.onclick = () => {
        deleteBtn.textContent = 'Confirm delete?';
        deleteBtn.style.background = 'rgba(255,90,90,0.2)';
        deleteBtn.style.color = '#ff5a5a';
        deleteBtn.style.borderColor = '#ff5a5a';
        deleteBtn.onmouseenter = null;
        deleteBtn.onmouseleave = null;
        deleteBtn.onclick = () => onDelete(link.id);
    };
}