// batch-import-modal.js — Four-phase batch import
// Phase 1: Create all nodes
// Phase 2: Fetch embeddings → compute placement → PATCH positions
// Phase 3: Predict relations (new↔new + new↔existing)
// Phase 4: Review & confirm relations

import { cosineSimilarity } from '../utils/colors.js';
import { repelFromOverlap  } from '../utils/placement.js';

// ─── Relation type colours (matches node-modal.js) ───────────────────────────
const REL_COLORS = {
    SUPPORTS:'#00c8a0', CONTRADICTS:'#ff5a5a', RELATES_TO:'#8896b8',
    DEPENDS_ON:'#6622aa', TRIGGERS:'#e85090', AMPLIFIES:'#ffa500',
    REQUIRES:'#6622aa', HAS_VERSION:'#8896b8', DISCUSSES:'#b03070',
    FRICTION:'#e85090', DETERRITORIALIZES:'#a78bfa', RETERRITORIALIZES:'#818cf8',
    OPENS_INTO:'#c084fc', SEDIMENTS_INTO:'#60a5fa', HAUNTS:'#6366f1',
    CONTAMINATES:'#f59e0b', SUPPLEMENTS:'#34d399', RESONATES_WITH:'#00c8a0',
    INTENSIFIES:'#fbbf24', SUSPENDS:'#94a3b8',
};
const relColor = t => REL_COLORS[(t||'').toUpperCase()] || '#8896b8';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const esc = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function getGraphId() { return localStorage.getItem('ee_graph_id') || 'default'; }

// ─── Main export ──────────────────────────────────────────────────────────────
export function renderBatchImportModal(existingNodes = [], existingLinks = [], onComplete) {
    document.getElementById('batch-import-modal')?.remove();

    // ── Shell ─────────────────────────────────────────────────────────────────
    const modal = document.createElement('div');
    modal.id = 'batch-import-modal';
    modal.style.cssText = `
        position:fixed;inset:0;z-index:9999;
        background:rgba(2,3,7,0.94);
        display:flex;align-items:center;justify-content:center;
        backdrop-filter:blur(8px);
        font-family:'DM Mono',monospace;
    `;

    modal.innerHTML = `
    <div id="bim-box" style="
        width:min(900px,96vw);max-height:93vh;
        background:#06080f;
        border:1px solid rgba(0,200,160,0.18);
        border-radius:14px;
        display:flex;flex-direction:column;
        overflow:hidden;
        box-shadow:0 0 80px rgba(0,200,160,0.05),0 32px 80px rgba(0,0,0,0.8);
    ">
        <!-- ── Header ── -->
        <div id="bim-header" style="
            padding:14px 20px;
            border-bottom:1px solid rgba(0,200,160,0.09);
            display:flex;align-items:center;justify-content:space-between;
            flex-shrink:0;background:rgba(0,200,160,0.015);
        ">
            <div>
                <div style="color:#00c8a0;font-size:11px;font-weight:700;letter-spacing:0.1em;">📋 BATCH IMPORT</div>
                <div id="bim-subtitle" style="color:#2d3f5a;font-size:10px;margin-top:2px;">
                    Paste thesis text · AI places & connects nodes
                </div>
            </div>
            <!-- Phase indicator -->
            <div style="display:flex;align-items:center;gap:6px;margin-right:16px;">
                ${[1,2,3,4].map(n=>`
                <div class="bim-phase-dot" data-phase="${n}" style="
                    width:26px;height:26px;border-radius:50%;
                    border:1px solid rgba(0,200,160,0.15);
                    display:flex;align-items:center;justify-content:center;
                    font-size:9px;color:#2d3f5a;transition:all 0.3s;
                ">${n}</div>
                ${n<4?'<div style="width:12px;height:1px;background:rgba(0,200,160,0.12);"></div>':''}`).join('')}
            </div>
            <button id="bim-close" style="
                background:none;border:1px solid rgba(255,255,255,0.07);
                color:#2d3f5a;border-radius:6px;width:28px;height:28px;
                cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;
            ">✕</button>
        </div>

        <!-- ── Step 1: Paste & parse ── -->
        <div id="bim-step-1" style="flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:14px;">
            <div style="display:flex;gap:12px;flex-wrap:wrap;">
                <div style="flex:1;min-width:160px;">
                    <label style="color:#5a6f90;font-size:10px;display:block;margin-bottom:6px;letter-spacing:0.05em;">NODE TYPE</label>
                    <select id="bim-type" style="width:100%;background:#090b13;border:1px solid #1a2030;color:#c0c8dc;border-radius:6px;padding:8px 10px;font-family:'DM Mono',monospace;font-size:11px;">
                        <option value="DraftFragment" selected>DraftFragment</option>
                        <option value="Concept">Concept</option>
                        <option value="Observation">Observation</option>
                        <option value="Method">Method</option>
                        <option value="Reference">Reference</option>
                        <option value="Event">Event</option>
                    </select>
                </div>
                <div style="flex:1;min-width:160px;">
                    <label style="color:#5a6f90;font-size:10px;display:block;margin-bottom:6px;letter-spacing:0.05em;">SPLIT ON</label>
                    <select id="bim-split" style="width:100%;background:#090b13;border:1px solid #1a2030;color:#c0c8dc;border-radius:6px;padding:8px 10px;font-family:'DM Mono',monospace;font-size:11px;">
                        <option value="subsection" selected>Subsections (3.1, 3.2 …)</option>
                        <option value="section">Top-level (3., 4. …)</option>
                        <option value="both">All numbered headings</option>
                        <option value="paragraph">Every paragraph</option>
                    </select>
                </div>
                <div style="flex:1;min-width:160px;">
                    <label style="color:#5a6f90;font-size:10px;display:block;margin-bottom:6px;letter-spacing:0.05em;">AUTO-CREATE RELATIONS ≥</label>
                    <select id="bim-conf-threshold" style="width:100%;background:#090b13;border:1px solid #1a2030;color:#c0c8dc;border-radius:6px;padding:8px 10px;font-family:'DM Mono',monospace;font-size:11px;">
                        <option value="0.6">60% — generous</option>
                        <option value="0.75" selected>75% — balanced</option>
                        <option value="0.85">85% — strict</option>
                        <option value="1.1">Manual only — review all</option>
                    </select>
                </div>
            </div>

            <div>
                <label style="color:#5a6f90;font-size:10px;display:block;margin-bottom:6px;letter-spacing:0.05em;">
                    THESIS TEXT <span style="color:#2d3f5a;">(30 pages is fine)</span>
                </label>
                <textarea id="bim-text" placeholder="Paste your thesis text here…

3. ZAMANSALLIK, JEODİNAMİK EŞİKLER VE GEÇİCİLİK
3.1. Kalıcılığın Mitosunda "Kurumsallaşmış Süreksizlik"
Kurumsallaşan planlamanın…

The tool detects numbered headings like 3.1, 3.2, A.1 etc." style="
                    width:100%;height:260px;resize:vertical;
                    background:#040508;border:1px solid #1a2030;
                    color:#c0c8dc;border-radius:8px;padding:14px;
                    font-family:'DM Mono',monospace;font-size:11px;line-height:1.75;
                    box-sizing:border-box;
                "></textarea>
            </div>

            <div style="display:flex;gap:10px;align-items:center;">
                <button id="bim-parse-btn" style="
                    background:rgba(0,200,160,0.1);border:1px solid rgba(0,200,160,0.35);
                    color:#00c8a0;border-radius:6px;padding:10px 22px;
                    font-family:'DM Mono',monospace;font-size:11px;font-weight:700;
                    cursor:pointer;letter-spacing:0.05em;
                ">✦ DETECT SECTIONS →</button>
                <span id="bim-parse-hint" style="color:#2d3f5a;font-size:10px;"></span>
            </div>
        </div>

        <!-- ── Step 2: Preview ── -->
        <div id="bim-step-2" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
            <div style="
                padding:10px 18px;border-bottom:1px solid rgba(0,200,160,0.07);
                display:flex;align-items:center;justify-content:space-between;
                flex-shrink:0;background:rgba(0,0,0,0.18);
            ">
                <div style="display:flex;align-items:center;gap:12px;">
                    <span id="bim-count-lbl" style="color:#00c8a0;font-size:11px;font-weight:700;"></span>
                    <button id="bim-sel-all" style="background:none;border:1px solid rgba(0,200,160,0.18);color:#2d3f5a;border-radius:4px;padding:4px 10px;font-family:'DM Mono',monospace;font-size:10px;cursor:pointer;">Select all</button>
                    <button id="bim-sel-none" style="background:none;border:1px solid rgba(255,255,255,0.05);color:#2d3f5a;border-radius:4px;padding:4px 10px;font-family:'DM Mono',monospace;font-size:10px;cursor:pointer;">Deselect all</button>
                </div>
                <button id="bim-back-1" style="background:none;border:1px solid rgba(255,255,255,0.07);color:#2d3f5a;border-radius:4px;padding:4px 12px;font-family:'DM Mono',monospace;font-size:10px;cursor:pointer;">← Back</button>
            </div>
            <div id="bim-preview-list" style="flex:1;overflow-y:auto;padding:12px 16px;display:flex;flex-direction:column;gap:8px;"></div>
            <div style="
                padding:14px 20px;border-top:1px solid rgba(0,200,160,0.07);
                display:flex;align-items:center;justify-content:space-between;
                flex-shrink:0;background:rgba(0,0,0,0.18);
            ">
                <span style="color:#2d3f5a;font-size:10px;">Uncheck sections to skip · edit titles inline</span>
                <button id="bim-start-import" style="
                    background:#00c8a0;border:none;color:#030508;
                    border-radius:6px;padding:10px 26px;
                    font-family:'DM Mono',monospace;font-size:11px;font-weight:700;
                    cursor:pointer;letter-spacing:0.05em;
                ">BEGIN IMPORT →</button>
            </div>
        </div>

        <!-- ── Step 3: Progress (phases 1–3) ── -->
        <div id="bim-step-3" style="display:none;flex:1;padding:28px;flex-direction:column;gap:18px;">
            <!-- Phase bars -->
            <div id="bim-phases" style="display:flex;flex-direction:column;gap:10px;">
                ${['1 — Creating nodes','2 — Computing placement','3 — Predicting relations'].map((label,i)=>`
                <div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
                        <span class="bim-phase-label" data-pi="${i+1}" style="color:#2d3f5a;font-size:10px;letter-spacing:0.05em;">${label}</span>
                        <span class="bim-phase-pct" data-pi="${i+1}" style="color:#2d3f5a;font-size:10px;">—</span>
                    </div>
                    <div style="background:rgba(255,255,255,0.04);border-radius:4px;height:4px;overflow:hidden;">
                        <div class="bim-phase-bar" data-pi="${i+1}" style="height:100%;background:linear-gradient(90deg,#00c8a0,#00ffb3);border-radius:4px;width:0%;transition:width 0.4s ease;box-shadow:0 0 8px rgba(0,200,160,0.4);"></div>
                    </div>
                </div>`).join('')}
            </div>

            <!-- Log -->
            <div id="bim-log" style="
                background:#020306;border:1px solid #1a2030;border-radius:8px;
                padding:12px 14px;flex:1;min-height:180px;max-height:280px;overflow-y:auto;
                font-size:10px;color:#2d3f5a;line-height:1.85;
            "></div>
            <div id="bim-status" style="color:#5a6f90;font-size:11px;text-align:center;"></div>
        </div>

        <!-- ── Step 4: Relation review ── -->
        <div id="bim-step-4" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
            <div style="
                padding:12px 20px;border-bottom:1px solid rgba(0,200,160,0.07);
                display:flex;align-items:center;justify-content:space-between;flex-shrink:0;
            ">
                <div>
                    <div style="color:#00c8a0;font-size:11px;font-weight:700;letter-spacing:0.08em;">🔮 RELATION REVIEW</div>
                    <div id="bim-rel-summary" style="color:#2d3f5a;font-size:10px;margin-top:2px;"></div>
                </div>
                <div style="display:flex;gap:8px;">
                    <button id="bim-rel-sel-all" style="background:none;border:1px solid rgba(0,200,160,0.18);color:#2d3f5a;border-radius:4px;padding:4px 10px;font-family:'DM Mono',monospace;font-size:10px;cursor:pointer;">Select all</button>
                    <button id="bim-rel-sel-none" style="background:none;border:1px solid rgba(255,255,255,0.05);color:#2d3f5a;border-radius:4px;padding:4px 10px;font-family:'DM Mono',monospace;font-size:10px;cursor:pointer;">Deselect all</button>
                </div>
            </div>

            <!-- Filter bar -->
            <div style="padding:8px 18px;border-bottom:1px solid rgba(0,200,160,0.05);display:flex;align-items:center;gap:10px;flex-shrink:0;background:rgba(0,0,0,0.1);">
                <span style="color:#2d3f5a;font-size:10px;">Show:</span>
                <button class="bim-rel-filter active" data-filter="all" style="background:rgba(0,200,160,0.1);border:1px solid rgba(0,200,160,0.3);color:#00c8a0;border-radius:4px;padding:3px 10px;font-family:'DM Mono',monospace;font-size:10px;cursor:pointer;">All</button>
                <button class="bim-rel-filter" data-filter="new-new" style="background:none;border:1px solid #1a2030;color:#2d3f5a;border-radius:4px;padding:3px 10px;font-family:'DM Mono',monospace;font-size:10px;cursor:pointer;">New ↔ New</button>
                <button class="bim-rel-filter" data-filter="new-existing" style="background:none;border:1px solid #1a2030;color:#2d3f5a;border-radius:4px;padding:3px 10px;font-family:'DM Mono',monospace;font-size:10px;cursor:pointer;">New → Existing</button>
            </div>

            <div id="bim-rel-list" style="flex:1;overflow-y:auto;padding:12px 16px;display:flex;flex-direction:column;gap:6px;"></div>

            <div style="
                padding:14px 20px;border-top:1px solid rgba(0,200,160,0.07);
                display:flex;align-items:center;justify-content:space-between;flex-shrink:0;
                background:rgba(0,0,0,0.18);
            ">
                <div style="color:#2d3f5a;font-size:10px;" id="bim-rel-footer-hint"></div>
                <div style="display:flex;gap:10px;">
                    <button id="bim-skip-relations" style="background:none;border:1px solid rgba(255,255,255,0.07);color:#2d3f5a;border-radius:6px;padding:10px 18px;font-family:'DM Mono',monospace;font-size:11px;cursor:pointer;">Skip relations</button>
                    <button id="bim-confirm-relations" style="background:#00c8a0;border:none;color:#030508;border-radius:6px;padding:10px 26px;font-family:'DM Mono',monospace;font-size:11px;font-weight:700;cursor:pointer;letter-spacing:0.05em;">CONFIRM RELATIONS →</button>
                </div>
            </div>
        </div>

        <!-- ── Step 5: Done ── -->
        <div id="bim-step-5" style="display:none;flex:1;padding:40px 28px;flex-direction:column;gap:16px;align-items:center;justify-content:center;text-align:center;">
            <div style="font-size:32px;">✦</div>
            <div style="color:#00c8a0;font-size:13px;font-weight:700;letter-spacing:0.1em;">IMPORT COMPLETE</div>
            <div id="bim-done-summary" style="color:#5a6f90;font-size:11px;line-height:1.8;"></div>
            <button id="bim-done-close" style="margin-top:12px;background:#00c8a0;border:none;color:#030508;border-radius:6px;padding:12px 30px;font-family:'DM Mono',monospace;font-size:11px;font-weight:700;cursor:pointer;letter-spacing:0.05em;">Close & Refresh Graph</button>
        </div>
    </div>`;

    document.body.appendChild(modal);

    // ── State ─────────────────────────────────────────────────────────────────
    let parsedSections = [];
    let checkedSections = new Set();
    let allRelations    = [];      // { sourceId, targetId, sourceName, targetName, rel_type, confidence, justification, kind:'new-new'|'new-existing', checked }
    let createdNodes    = [];      // nodes returned from Phase 1

    // ── Phase indicator ───────────────────────────────────────────────────────
    function setPhase(n) {
        document.querySelectorAll('.bim-phase-dot').forEach(d => {
            const dn = parseInt(d.dataset.phase);
            d.style.background   = dn < n  ? 'rgba(0,200,160,0.25)' : dn === n ? 'rgba(0,200,160,0.15)' : 'transparent';
            d.style.color        = dn <= n  ? '#00c8a0' : '#2d3f5a';
            d.style.borderColor  = dn <= n  ? 'rgba(0,200,160,0.4)' : 'rgba(0,200,160,0.1)';
        });
        document.getElementById('bim-subtitle').textContent =
            ['','Paste & detect sections','Preview sections','Creating nodes & computing AI…','Review suggested relations','Done'][n] || '';
    }

    function showStep(n) {
        [1,2,3,4,5].forEach(i => {
            const el = document.getElementById(`bim-step-${i}`);
            if (el) el.style.display = i === n ? 'flex' : 'none';
        });
        setPhase(n > 3 ? n-1 : n > 2 ? 3 : n);
    }

    // ── Progress helpers ──────────────────────────────────────────────────────
    function setBar(phaseIdx, pct) {
        const bar = document.querySelector(`.bim-phase-bar[data-pi="${phaseIdx}"]`);
        const lbl = document.querySelector(`.bim-phase-pct[data-pi="${phaseIdx}"]`);
        if (bar) bar.style.width = pct + '%';
        if (lbl) lbl.textContent = pct === 100 ? '✓' : pct + '%';
        if (pct === 100 && lbl) lbl.style.color = '#00c8a0';
    }
    function setLabelActive(phaseIdx) {
        document.querySelectorAll('.bim-phase-label').forEach(l => l.style.color = '#2d3f5a');
        const lbl = document.querySelector(`.bim-phase-label[data-pi="${phaseIdx}"]`);
        if (lbl) lbl.style.color = '#00c8a0';
    }
    function log(msg, color='#2d3f5a') {
        const logEl = document.getElementById('bim-log');
        if (!logEl) return;
        const line = document.createElement('div');
        line.style.color = color;
        line.textContent = msg;
        logEl.appendChild(line);
        logEl.scrollTop = logEl.scrollHeight;
    }
    function setStatus(msg) {
        const el = document.getElementById('bim-status');
        if (el) el.textContent = msg;
    }

    // ── Close ─────────────────────────────────────────────────────────────────
    const close = () => modal.remove();
    document.getElementById('bim-close').onclick = close;
    modal.addEventListener('click', e => { if (e.target === modal) close(); });

    // ═══════════════════════════════════════════════════════════════════════════
    // PARSER
    // ═══════════════════════════════════════════════════════════════════════════
    function parseThesisText(raw, mode) {
        // Remove lone footnote numbers (e.g. "5\n")
        const text = raw.replace(/^\s*\d{1,2}\s*$/gm, '').trim();

        let splitRE;
        if      (mode === 'subsection') splitRE = /(?=^(\d+\.\d+(?:\.\d+)*\.?)\s+)/m;
        else if (mode === 'section')    splitRE = /(?=^(\d+\.)\s+(?!\d))/m;
        else if (mode === 'both')       splitRE = /(?=^(\d+(?:\.\d+)*\.?)\s+[^\d\s])/m;
        else                            splitRE = /\n\n+/;

        const chunks = text.split(splitRE).filter(c => c?.trim().length > 40);
        const sections = [];

        for (const chunk of chunks) {
            const lines = chunk.trim().split('\n').map(l => l.trim()).filter(Boolean);
            if (!lines.length) continue;

            let sectionNum = '', title = '', bodyLines = lines;
            const hm = lines[0].match(/^(\d+(?:\.\d+)*\.?)\s+(.+)$/) ||
                       lines[0].match(/^([A-Z]\.\d*\.?)\s+(.+)$/);
            if (hm) {
                sectionNum = hm[1].replace(/\.$/, '');
                title      = hm[2].trim();
                bodyLines  = lines.slice(1);
            } else {
                title     = lines[0].length > 80 ? lines[0].slice(0, 77) + '…' : lines[0];
                bodyLines = lines.slice(1);
            }

            // Rejoin and fix PDF hyphenation
            const content = bodyLines.join(' ')
                .replace(/(\w)- (\w)/g, '$1$2')
                .replace(/\s{2,}/g, ' ').trim();

            if (!content && !title) continue;
            sections.push({
                sectionNum,
                title:     title || `Section ${sections.length + 1}`,
                content:   content || title,
                wordCount: (content || title).split(/\s+/).length,
            });
        }
        return sections;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 1 → STEP 2: Parse
    // ═══════════════════════════════════════════════════════════════════════════
    document.getElementById('bim-parse-btn').onclick = () => {
        const raw  = document.getElementById('bim-text').value;
        const mode = document.getElementById('bim-split').value;
        const hint = document.getElementById('bim-parse-hint');

        if (!raw.trim()) { hint.textContent = '⚠ Paste some text first.'; hint.style.color='#ff5a5a'; return; }

        const sections = parseThesisText(raw, mode);
        if (!sections.length) { hint.textContent = '⚠ No sections detected — try a different split mode.'; hint.style.color='#ff5a5a'; return; }

        hint.textContent = `✓ Found ${sections.length} sections`; hint.style.color='#00c8a0';
        parsedSections   = sections;
        checkedSections  = new Set(sections.map((_,i) => i));
        renderPreview();
        showStep(2);
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // RENDER PREVIEW
    // ═══════════════════════════════════════════════════════════════════════════
    function renderPreview() {
        const list = document.getElementById('bim-preview-list');
        list.innerHTML = '';

        parsedSections.forEach((sec, idx) => {
            const card = document.createElement('div');
            card.dataset.idx = idx;
            card.style.cssText = `
                background:rgba(255,255,255,0.015);border:1px solid #1a2030;
                border-radius:8px;padding:12px 14px;
                display:grid;grid-template-columns:26px 1fr;gap:10px;
                cursor:pointer;transition:border-color 0.15s,background 0.15s;
            `;
            card.innerHTML = `
                <div style="padding-top:2px;">
                    <input type="checkbox" checked data-check="${idx}" style="width:14px;height:14px;cursor:pointer;accent-color:#00c8a0;">
                </div>
                <div>
                    <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:4px;flex-wrap:wrap;">
                        ${sec.sectionNum ? `<span style="color:#00c8a0;font-size:10px;font-weight:700;">${esc(sec.sectionNum)}</span>` : ''}
                        <span style="color:#c0c8dc;font-size:11px;font-weight:600;">${esc(sec.title)}</span>
                        <span style="color:#1e2a3a;font-size:9px;">${sec.wordCount} words</span>
                    </div>
                    <div style="color:#2d3f5a;font-size:10px;line-height:1.6;max-height:52px;overflow:hidden;">
                        ${esc(sec.content.slice(0,200))}${sec.content.length>200?'…':''}
                    </div>
                    <input type="text" data-title-idx="${idx}" value="${esc(sec.title)}" placeholder="Node title…" style="
                        margin-top:7px;width:100%;background:#040508;border:1px solid #1a2030;
                        color:#5a6f90;border-radius:4px;padding:5px 8px;
                        font-family:'DM Mono',monospace;font-size:10px;box-sizing:border-box;
                    ">
                </div>`;

            const cb = card.querySelector(`[data-check="${idx}"]`);
            const styleCard = () => {
                if (checkedSections.has(idx)) {
                    card.style.borderColor = 'rgba(0,200,160,0.28)';
                    card.style.background  = 'rgba(0,200,160,0.025)';
                    cb.checked = true;
                } else {
                    card.style.borderColor = '#1a2030';
                    card.style.background  = 'rgba(255,255,255,0.008)';
                    cb.checked = false;
                }
            };
            styleCard();

            cb.onchange = e => { e.stopPropagation(); if(cb.checked) checkedSections.add(idx); else checkedSections.delete(idx); styleCard(); updateCountLbl(); };
            card.onclick = e => { if(e.target.tagName==='INPUT') return; if(checkedSections.has(idx)) checkedSections.delete(idx); else checkedSections.add(idx); styleCard(); updateCountLbl(); };

            card.querySelector(`[data-title-idx="${idx}"]`).oninput = e => {
                parsedSections[idx].title = e.target.value;
            };
            card.querySelector(`[data-title-idx="${idx}"]`).onclick = e => e.stopPropagation();

            list.appendChild(card);
        });
        updateCountLbl();
    }

    function updateCountLbl() {
        const n = checkedSections.size;
        document.getElementById('bim-count-lbl').textContent = `${n} of ${parsedSections.length} sections selected`;
        document.getElementById('bim-start-import').textContent = `BEGIN IMPORT (${n} nodes) →`;
    }

    document.getElementById('bim-sel-all').onclick = () => {
        parsedSections.forEach((_,i) => checkedSections.add(i));
        renderPreview();
    };
    document.getElementById('bim-sel-none').onclick = () => {
        checkedSections.clear();
        renderPreview();
    };
    document.getElementById('bim-back-1').onclick = () => showStep(1);

    // ═══════════════════════════════════════════════════════════════════════════
    // BEGIN IMPORT
    // ═══════════════════════════════════════════════════════════════════════════
    document.getElementById('bim-start-import').onclick = async () => {
        const toImport = parsedSections.filter((_,i) => checkedSections.has(i));
        if (!toImport.length) return;

        const nodeType   = document.getElementById('bim-type').value;
        const threshold  = parseFloat(document.getElementById('bim-conf-threshold').value);
        const graphId    = getGraphId();

        showStep(3);
        createdNodes = [];
        allRelations = [];

        // ── PHASE 1: Create all nodes ────────────────────────────────────────
        setLabelActive(1);
        log(`Phase 1 — Creating ${toImport.length} nodes…`, '#5a6f90');
        const BATCH = 3;

        for (let i = 0; i < toImport.length; i += BATCH) {
            const batch = toImport.slice(i, i+BATCH);
            await Promise.all(batch.map(async (sec, bi) => {
                const gi = i + bi;
                try {
                    const res = await fetch('/api/nodes', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            title:       sec.title,
                            content:     sec.content || sec.title,
                            parent_type: nodeType,
                            graph_id:    graphId,
                        }),
                    });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const node = await res.json();
                    // Attach original section data for later phases
                    node._sec = sec;
                    createdNodes.push(node);
                    const lbl = sec.sectionNum ? `${sec.sectionNum} ${sec.title.slice(0,38)}` : sec.title.slice(0,48);
                    log(`✓ [${gi+1}/${toImport.length}] ${lbl}`, '#00c8a0');
                } catch(err) {
                    log(`✕ [${gi+1}/${toImport.length}] ${sec.title.slice(0,40)} — ${err.message}`, '#ff5a5a');
                }
            }));
            setBar(1, Math.round(((i+batch.length)/toImport.length)*100));
            if (i+BATCH < toImport.length) await sleep(300);
        }
        setBar(1, 100);
        log(`Phase 1 complete — ${createdNodes.length} nodes created.`, '#5a6f90');

        if (!createdNodes.length) { setStatus('No nodes created — check errors above.'); return; }

        // ── PHASE 2: Fetch all embeddings → compute placement ────────────────
        setLabelActive(2);
        setStatus('Fetching embeddings…');
        log('', '');
        log('Phase 2 — Computing semantic placement…', '#5a6f90');

        let embMap = {};
        try {
            const embRes = await fetch('/api/nodes/embeddings');
            if (embRes.ok) {
                const { nodes: embNodes } = await embRes.json();
                for (const n of embNodes) {
                    if (n.node_id) embMap[n.node_id] = n.embedding;
                    if (n.id)      embMap[n.id]      = n.embedding;
                }
            }
        } catch(e) { log(`⚠ Could not fetch embeddings: ${e.message}`, '#ffa500'); }

        // Build a combined pool: all existing nodes + newly created nodes (with embeddings)
        const allNodesPool = [
            ...existingNodes.map(n => ({
                ...n,
                embedding: embMap[n.node_id] || embMap[n.id] || n.embedding || [],
            })),
            ...createdNodes.map(n => ({
                ...n,
                embedding: embMap[n.node_id] || embMap[n.id] || [],
            })),
        ];

        const nodesWithEmb = allNodesPool.filter(n => n.embedding?.length > 0);
        log(`Embeddings available for ${nodesWithEmb.length} of ${allNodesPool.length} nodes.`, '#2d3f5a');

        // Place each created node
        const placedPositions = {}; // node_id → {x, y}

        for (let i = 0; i < createdNodes.length; i++) {
            const node = createdNodes[i];
            const nodeEmb = embMap[node.node_id] || embMap[node.id];

            if (!nodeEmb || !nodeEmb.length) {
                // No embedding yet — scatter near centroid
                const cx = allNodesPool.reduce((s,n)=>s+(n.x||0),0)/Math.max(1,allNodesPool.length);
                const cy = allNodesPool.reduce((s,n)=>s+(n.y||0),0)/Math.max(1,allNodesPool.length);
                const angle = Math.random()*2*Math.PI;
                const r = 80 + Math.random()*100;
                placedPositions[node.node_id] = { x: cx + r*Math.cos(angle), y: cy + r*Math.sin(angle) };
            } else {
                // Cosine similarity against all other nodes (excluding self)
                const others = nodesWithEmb.filter(n => n.node_id !== node.node_id && n.id !== node.id);
                const sims = others
                    .map(n => ({ node: n, sim: cosineSimilarity(nodeEmb, n.embedding) }))
                    .sort((a,b) => b.sim - a.sim);

                const topMatches  = sims.slice(0, 5);
                const goodMatches = topMatches.filter(m => m.sim > 0.6);
                const pool        = goodMatches.length ? goodMatches : topMatches;

                let rawX, rawY;
                if (pool.length) {
                    const totalW = pool.reduce((s,m) => s + m.sim, 0);
                    rawX = pool.reduce((s,m) => s + (m.node.x||0)*m.sim, 0) / totalW;
                    rawY = pool.reduce((s,m) => s + (m.node.y||0)*m.sim, 0) / totalW;
                } else {
                    rawX = (Math.random()-0.5)*300;
                    rawY = (Math.random()-0.5)*300;
                }

                // Include already-placed nodes from this batch in the repel pool
                const placedSoFar = Object.entries(placedPositions).map(([nid, pos]) => ({
                    ...allNodesPool.find(n=>n.node_id===nid||n.id===nid)||{},
                    ...pos,
                }));
                const repelPool = [...allNodesPool, ...placedSoFar];
                const finalPos  = repelFromOverlap(rawX, rawY, repelPool);
                placedPositions[node.node_id] = finalPos;
            }

            // Add to pool so subsequent nodes repel correctly
            const placed = placedPositions[node.node_id];
            const poolEntry = allNodesPool.find(n=>n.node_id===node.node_id||n.id===node.id);
            if (poolEntry) { poolEntry.x = placed.x; poolEntry.y = placed.y; }

            setBar(2, Math.round(((i+1)/createdNodes.length)*100));
        }

        // PATCH positions in parallel
        setStatus('Saving positions…');
        await Promise.all(createdNodes.map(async node => {
            const pos = placedPositions[node.node_id];
            if (!pos) return;
            try {
                await fetch(`/api/nodes/${node.id || node.node_id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ x: pos.x, y: pos.y }),
                });
                // Update local reference for relation phase
                node.x = pos.x; node.y = pos.y;
                log(`📍 Placed "${(node._sec?.title||node.node_id).slice(0,40)}" at (${pos.x.toFixed(0)}, ${pos.y.toFixed(0)})`, '#2d3f5a');
            } catch(e) { /* non-fatal */ }
        }));
        setBar(2, 100);
        log('Phase 2 complete.', '#5a6f90');

        // ── PHASE 3: Predict relations ───────────────────────────────────────
        setLabelActive(3);
        log('', '');
        log('Phase 3 — Predicting relations…', '#5a6f90');

        // Build node reference maps for display names
        const createdMap  = new Map(createdNodes.map(n => [n.node_id, n]));
        const existingMap = new Map(existingNodes.map(n => [n.node_id, n]));

        // For relation prediction, send:
        //   existing_nodes = existingNodes + all other createdNodes (to get new↔new links too)
        for (let i = 0; i < createdNodes.length; i++) {
            const node = createdNodes[i];
            const otherCreated = createdNodes.filter((_,j) => j !== i);

            const existingForPrediction = [
                ...existingNodes.map(n => ({
                    id: n.id, node_id: n.node_id,
                    content: (n.content||n.name||'').slice(0,300),
                    parent_type: n.parent_type||n.node_type||'Concept',
                })),
                ...otherCreated.map(n => ({
                    id: n.id, node_id: n.node_id,
                    content: (n._sec?.content||n.content||'').slice(0,300),
                    parent_type: n.parent_type||nodeType,
                })),
            ];

            try {
                const resp = await fetch('/api/relations/predict', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        content:     node._sec?.content || '',
                        parent_type: node.parent_type || nodeType,
                        existing_nodes: existingForPrediction,
                    }),
                });
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                const { relations = [] } = await resp.json();

                for (const rel of relations) {
                    // Avoid duplicates (A→B and B→A for same pair)
                    const dupKey1 = `${node.node_id}::${rel.target_node_id}`;
                    const dupKey2 = `${rel.target_node_id}::${node.node_id}`;
                    const alreadyExists = allRelations.some(r =>
                        (r._key === dupKey1 || r._key === dupKey2)
                    );
                    if (alreadyExists) continue;

                    const isNewNew = createdMap.has(rel.target_node_id);
                    const targetNode = isNewNew
                        ? createdMap.get(rel.target_node_id)
                        : existingMap.get(rel.target_node_id);

                    if (!targetNode) continue; // target not found

                    const conf = typeof rel.confidence === 'number' ? rel.confidence : 0.7;
                    allRelations.push({
                        _key:         dupKey1,
                        sourceId:     node.id || node.node_id,
                        targetId:     targetNode.id || targetNode.node_id,
                        sourceNodeId: node.node_id,
                        targetNodeId: rel.target_node_id,
                        sourceName:   (node._sec?.title || node.node_id || '').slice(0,50),
                        targetName:   (targetNode._sec?.title || targetNode.title || targetNode.content || rel.target_node_id || '').slice(0,50),
                        rel_type:     rel.rel_type,
                        confidence:   conf,
                        justification: rel.justification || '',
                        kind:         isNewNew ? 'new-new' : 'new-existing',
                        // Auto-check if above threshold
                        checked:      conf >= threshold,
                    });
                }

                const lbl = (node._sec?.title||node.node_id).slice(0,38);
                log(`🔮 [${i+1}/${createdNodes.length}] ${lbl} — ${relations.length} relations found`, '#2d3f5a');
            } catch(e) {
                log(`⚠ [${i+1}/${createdNodes.length}] Prediction failed: ${e.message}`, '#ffa500');
            }

            setBar(3, Math.round(((i+1)/createdNodes.length)*100));
            // Small pause to avoid hammering the API
            if (i < createdNodes.length-1) await sleep(150);
        }

        setBar(3, 100);
        log(`Phase 3 complete — ${allRelations.length} unique relations found.`, '#5a6f90');

        if (!allRelations.length) {
            // Skip review, go straight to done
            await finalize([]);
            return;
        }

        // ── Move to review ───────────────────────────────────────────────────
        renderRelationReview();
        showStep(4);
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 4: Relation review
    // ═══════════════════════════════════════════════════════════════════════════
    let currentFilter = 'all';

    function renderRelationReview() {
        const newNew = allRelations.filter(r => r.kind === 'new-new');
        const newEx  = allRelations.filter(r => r.kind === 'new-existing');
        const checked = allRelations.filter(r => r.checked);

        document.getElementById('bim-rel-summary').textContent =
            `${allRelations.length} suggested (${newNew.length} new↔new · ${newEx.length} new→existing) · ${checked.length} pre-selected`;

        updateRelFooterHint();
        renderRelCards();
    }

    function updateRelFooterHint() {
        const n = allRelations.filter(r => r.checked).length;
        document.getElementById('bim-rel-footer-hint').textContent =
            `${n} relation${n!==1?'s':''} will be created`;
    }

    function renderRelCards(filter = currentFilter) {
        currentFilter = filter;
        const list = document.getElementById('bim-rel-list');
        list.innerHTML = '';

        // Update filter button styles
        document.querySelectorAll('.bim-rel-filter').forEach(btn => {
            const active = btn.dataset.filter === filter;
            btn.style.background   = active ? 'rgba(0,200,160,0.1)' : 'none';
            btn.style.borderColor  = active ? 'rgba(0,200,160,0.3)' : '#1a2030';
            btn.style.color        = active ? '#00c8a0' : '#2d3f5a';
        });

        const visible = allRelations.filter(r => filter === 'all' || r.kind === filter);
        if (!visible.length) {
            list.innerHTML = '<div style="padding:20px;color:#2d3f5a;font-size:10px;text-align:center;">No relations in this view.</div>';
            return;
        }

        visible.forEach((rel, vi) => {
            // Find real index in allRelations
            const ri = allRelations.indexOf(rel);
            const color   = relColor(rel.rel_type);
            const confPct = Math.round(rel.confidence * 100);
            const kindBadge = rel.kind === 'new-new'
                ? '<span style="font-size:8px;background:rgba(0,200,160,0.12);color:#00c8a0;border-radius:3px;padding:2px 5px;margin-left:4px;">NEW↔NEW</span>'
                : '<span style="font-size:8px;background:rgba(136,150,184,0.1);color:#5a6f90;border-radius:3px;padding:2px 5px;margin-left:4px;">→ EXISTING</span>';

            const card = document.createElement('div');
            card.style.cssText = `
                background:${rel.checked ? 'rgba(0,200,160,0.02)' : 'rgba(255,255,255,0.01)'};
                border:1px solid ${rel.checked ? 'rgba(0,200,160,0.22)' : '#1a2030'};
                border-left:3px solid ${color};
                border-radius:6px;padding:9px 11px;
                cursor:pointer;transition:all 0.15s;
            `;
            card.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;">
                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                        <span style="font-size:10px;font-weight:700;color:${color};letter-spacing:0.05em;">${rel.rel_type}</span>
                        <span style="font-size:9px;color:#2d3f5a;">${confPct}% confidence</span>
                        ${kindBadge}
                    </div>
                    <input type="checkbox" ${rel.checked?'checked':''} data-ri="${ri}"
                        style="width:14px;height:14px;cursor:pointer;accent-color:${color};">
                </div>
                <div style="font-size:11px;color:#8896b8;font-family:'DM Mono',monospace;margin-bottom:3px;">
                    <span style="color:#c0c8dc;">${esc(rel.sourceName)}</span>
                    <span style="color:#2d3f5a;margin:0 5px;">→</span>
                    <span style="color:#c0c8dc;">${esc(rel.targetName)}</span>
                </div>
                ${rel.justification ? `<div style="font-size:9px;color:#2d3f5a;line-height:1.5;border-top:1px solid rgba(255,255,255,0.04);padding-top:4px;margin-top:3px;">${esc(rel.justification)}</div>` : ''}
            `;

            const cb = card.querySelector(`[data-ri="${ri}"]`);
            const toggle = () => {
                allRelations[ri].checked = cb.checked;
                card.style.background  = cb.checked ? 'rgba(0,200,160,0.02)' : 'rgba(255,255,255,0.01)';
                card.style.borderColor = cb.checked ? `rgba(0,200,160,0.22)` : '#1a2030';
                // keep left border color
                card.style.borderLeftColor = color;
                updateRelFooterHint();
            };
            cb.onchange = e => { e.stopPropagation(); toggle(); };
            card.onclick = e => { if(e.target===cb) return; cb.checked=!cb.checked; toggle(); };

            list.appendChild(card);
        });
    }

    // Filter buttons
    document.querySelectorAll('.bim-rel-filter').forEach(btn => {
        btn.onclick = () => renderRelCards(btn.dataset.filter);
    });

    // Select all / none for relations
    document.getElementById('bim-rel-sel-all').onclick = () => {
        allRelations.forEach(r => r.checked = true);
        renderRelCards(currentFilter);
        updateRelFooterHint();
    };
    document.getElementById('bim-rel-sel-none').onclick = () => {
        allRelations.forEach(r => r.checked = false);
        renderRelCards(currentFilter);
        updateRelFooterHint();
    };

    document.getElementById('bim-skip-relations').onclick = () => finalize([]);
    document.getElementById('bim-confirm-relations').onclick = () =>
        finalize(allRelations.filter(r => r.checked));

    // ═══════════════════════════════════════════════════════════════════════════
    // FINALIZE: write confirmed relations to DB
    // ═══════════════════════════════════════════════════════════════════════════
    async function finalize(confirmedRels) {
        if (confirmedRels.length) {
            // Brief progress feedback inside review step before switching
            document.getElementById('bim-confirm-relations').textContent = `Writing ${confirmedRels.length} relations…`;
            document.getElementById('bim-confirm-relations').disabled = true;

            const BATCH = 5;
            for (let i = 0; i < confirmedRels.length; i += BATCH) {
                await Promise.all(confirmedRels.slice(i, i+BATCH).map(rel =>
                    fetch('/api/links', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            node_a:       rel.sourceId,
                            node_b:       rel.targetId,
                            rel_type:     rel.rel_type,
                            justification: rel.justification,
                            confidence:   rel.confidence,
                            weight:       rel.confidence,
                            status:       'PROVISIONAL',
                        }),
                    }).catch(() => {}) // non-fatal per relation
                ));
                await sleep(100);
            }
        }

        // Done screen
        showStep(5);
        document.getElementById('bim-done-summary').innerHTML =
            `${createdNodes.length} nodes created<br>
             ${confirmedRels.length} relations written<br>
             ${allRelations.length - confirmedRels.length} relations skipped`;

        document.getElementById('bim-done-close').onclick = () => {
            modal.remove();
            if (typeof onComplete === 'function') onComplete(createdNodes, confirmedRels);
        };
    }

    showStep(1);

    // ── Utility ───────────────────────────────────────────────────────────────
    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}