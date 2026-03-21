import { TYPE_COLORS, REL_COLORS, saveTypeColors, saveRelColors } from '../../graph-component.js';
import { showFlash } from '../utils/flash.js';
import { initLegends } from '../hud/search.js';

export function renderSettingsPanel(onRefresh) {
    const existing = document.getElementById('settings-panel');
    if (existing) { existing.remove(); return; }

    let nodeTypes = { ...TYPE_COLORS };
    let relTypes  = Object.fromEntries(
        Object.entries(REL_COLORS).filter(([k]) => !['SUPPORT','CONTRADICT','DEPENDS'].includes(k))
    );

    const panel = document.createElement('div');
    panel.id = 'settings-panel';
    panel.className = 'creation-modal-overlay';

    const render = () => {
        panel.innerHTML = `
            <div class="creation-modal creation-modal--wide" style="max-width:560px;">
                <div class="modal-header">
                    <span class="modal-tag">SETTINGS</span>
                    <button id="settings-close" class="modal-close">&#x2715;</button>
                </div>
                <div class="modal-body" style="gap:20px;">
                    <div>
                        <div class="field-section-label" style="margin-bottom:10px;">NODE TYPES</div>
                        <div id="node-type-list" style="display:flex;flex-direction:column;gap:6px;">
                            ${Object.entries(nodeTypes).map(([name, color]) => `
                                <div style="display:flex;align-items:center;gap:8px;">
                                    <input type="color" value="${color}" data-nt-color="${name}"
                                        style="width:32px;height:28px;border:1px solid #1e2535;border-radius:4px;background:none;cursor:pointer;padding:1px;">
                                    <input type="text" value="${name}" data-nt-name="${name}"
                                        style="flex:1;background:#0c0e16;border:1px solid #1e2535;border-radius:6px;color:#c8d0e0;font-family:'DM Mono',monospace;font-size:12px;padding:6px 10px;">
                                    <button data-nt-delete="${name}"
                                        style="background:none;border:1px solid rgba(255,90,90,0.25);color:rgba(255,90,90,0.5);border-radius:4px;padding:4px 8px;font-size:11px;cursor:pointer;font-family:'DM Mono',monospace;">&#x2715;</button>
                                </div>`).join('')}
                        </div>
                        <button id="add-node-type"
                            style="margin-top:8px;background:rgba(0,200,160,0.07);border:1px solid rgba(0,200,160,0.25);color:var(--concept);border-radius:6px;padding:6px 12px;font-size:11px;cursor:pointer;font-family:'DM Mono',monospace;letter-spacing:0.05em;">
                            + Add Node Type
                        </button>
                    </div>
                    <div>
                        <div class="field-section-label" style="margin-bottom:10px;">RELATION TYPES</div>
                        <div id="rel-type-list" style="display:flex;flex-direction:column;gap:6px;">
                            ${Object.entries(relTypes).map(([name, color]) => `
                                <div style="display:flex;align-items:center;gap:8px;">
                                    <input type="color" value="${color}" data-rt-color="${name}"
                                        style="width:32px;height:28px;border:1px solid #1e2535;border-radius:4px;background:none;cursor:pointer;padding:1px;">
                                    <input type="text" value="${name}" data-rt-name="${name}"
                                        style="flex:1;background:#0c0e16;border:1px solid #1e2535;border-radius:6px;color:#c8d0e0;font-family:'DM Mono',monospace;font-size:12px;padding:6px 10px;text-transform:uppercase;">
                                    <button data-rt-delete="${name}"
                                        style="background:none;border:1px solid rgba(255,90,90,0.25);color:rgba(255,90,90,0.5);border-radius:4px;padding:4px 8px;font-size:11px;cursor:pointer;font-family:'DM Mono',monospace;">&#x2715;</button>
                                </div>`).join('')}
                        </div>
                        <button id="add-rel-type"
                            style="margin-top:8px;background:rgba(0,200,160,0.07);border:1px solid rgba(0,200,160,0.25);color:var(--concept);border-radius:6px;padding:6px 12px;font-size:11px;cursor:pointer;font-family:'DM Mono',monospace;letter-spacing:0.05em;">
                            + Add Relation Type
                        </button>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="modal-btn-cancel" id="settings-cancel">Cancel</button>
                    <button class="modal-btn-confirm" id="settings-save">Save &amp; Apply &#x2192;</button>
                </div>
            </div>`;

        const snapshot = () => {
            const nt = {};
            panel.querySelectorAll('[data-nt-color]').forEach(colorEl => {
                const nameEl = panel.querySelector(`[data-nt-name="${colorEl.dataset.ntColor}"]`);
                const name = nameEl?.value.trim();
                if (name) nt[name] = colorEl.value;
            });
            const rt = {};
            panel.querySelectorAll('[data-rt-color]').forEach(colorEl => {
                const nameEl = panel.querySelector(`[data-rt-name="${colorEl.dataset.rtColor}"]`);
                const name = nameEl?.value.trim().toUpperCase();
                if (name) rt[name] = colorEl.value;
            });
            return { nt, rt };
        };

        panel.querySelectorAll('[data-nt-delete]').forEach(btn => {
            btn.onclick = () => { const { nt, rt } = snapshot(); delete nt[btn.dataset.ntDelete]; nodeTypes = nt; relTypes = rt; render(); };
        });
        panel.querySelectorAll('[data-rt-delete]').forEach(btn => {
            btn.onclick = () => { const { nt, rt } = snapshot(); delete rt[btn.dataset.rtDelete]; nodeTypes = nt; relTypes = rt; render(); };
        });

        panel.querySelector('#add-node-type').onclick = () => {
            const { nt, rt } = snapshot();
            let n = 'NewType', i = 2;
            while (nt[n]) n = `NewType${i++}`;
            nt[n] = '#445070'; nodeTypes = nt; relTypes = rt; render();
        };
        panel.querySelector('#add-rel-type').onclick = () => {
            const { nt, rt } = snapshot();
            let n = 'NEW_RELATION', i = 2;
            while (rt[n]) n = `NEW_RELATION_${i++}`;
            rt[n] = '#445070'; nodeTypes = nt; relTypes = rt; render();
        };

        panel.querySelector('#settings-close').onclick  = () => panel.remove();
        panel.querySelector('#settings-cancel').onclick = () => panel.remove();
        panel.addEventListener('click', e => { if (e.target === panel) panel.remove(); });

        panel.querySelector('#settings-save').onclick = () => {
            const { nt, rt } = snapshot();
            saveTypeColors(nt);
            saveRelColors(rt);
            panel.remove();
            initLegends();
            onRefresh();
            showFlash('Settings saved');
        };
    };

    document.body.appendChild(panel);
    render();
}