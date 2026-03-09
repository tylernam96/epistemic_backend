/**
 * epistemic-log.js
 * Session-scoped activity feed for the Epistemic Engine.
 * Tracks node/relation creation, deletion, moves, AI events.
 * No persistence — lives in memory for the session, shown in a panel.
 */

// ─── Event Store ──────────────────────────────────────────────────────────────

const LOG_EVENTS = [];
let _logPanelMounted = false;
let _listeners = [];

export const EpistemicLog = {

    /**
     * Push a new event into the log.
     * type: 'NODE_CREATED' | 'NODE_DELETED' | 'NODE_MOVED' | 'RELATION_CREATED' |
     *       'RELATION_DELETED' | 'AI_ANALYZE' | 'AI_CHALLENGE' | 'PLACEMENT_NOTE'
     */
    push(type, data = {}) {
        const event = {
            id: crypto.randomUUID(),
            type,
            data,
            ts: new Date(),
        };
        LOG_EVENTS.unshift(event); // newest first
        if (LOG_EVENTS.length > 200) LOG_EVENTS.pop(); // cap at 200
        _notifyListeners();
        _flashLogButton();
    },

    getAll() { return LOG_EVENTS; },

    clear() {
        LOG_EVENTS.length = 0;
        _notifyListeners();
    },

    subscribe(fn) {
        _listeners.push(fn);
        return () => { _listeners = _listeners.filter(l => l !== fn); };
    },

    /** Mount the toggle button and panel into the DOM (call once) */
    mount() {
        if (_logPanelMounted) return;
        _logPanelMounted = true;
        _injectStyles();
        _buildPanel();
    }
};

function _notifyListeners() {
    _listeners.forEach(fn => fn(LOG_EVENTS));
    _rerenderIfOpen();
}

// ─── DOM ──────────────────────────────────────────────────────────────────────

let _panelOpen = false;

function _buildPanel() {
    // Toggle button
    const btn = document.createElement('button');
    btn.id = 'log-toggle-btn';
    btn.className = 'panel-glass action-btn';
    btn.innerHTML = `<span class="log-btn-icon">◈</span> Log <span id="log-count-badge" class="log-badge">0</span>`;
    btn.onclick = _togglePanel;
    document.getElementById('graph-actions')?.appendChild(btn);

    // Panel
    const panel = document.createElement('div');
    panel.id = 'epistemic-log-panel';
    panel.innerHTML = _renderPanelHTML();
    document.getElementById('ui-layer')?.appendChild(panel);

    document.getElementById('log-clear-btn')?.addEventListener('click', () => {
        EpistemicLog.clear();
    });
}

function _togglePanel() {
    _panelOpen = !_panelOpen;
    const panel = document.getElementById('epistemic-log-panel');
    const btn = document.getElementById('log-toggle-btn');
    if (!panel) return;
    if (_panelOpen) {
        panel.classList.add('log-panel--open');
        btn?.classList.add('active');
        _rerenderFeed();
    } else {
        panel.classList.remove('log-panel--open');
        btn?.classList.remove('active');
    }
}

function _flashLogButton() {
    const btn = document.getElementById('log-toggle-btn');
    if (!btn) return;
    // Update badge count
    const badge = document.getElementById('log-count-badge');
    if (badge) badge.textContent = LOG_EVENTS.length;

    if (!_panelOpen) {
        btn.classList.add('log-btn--flash');
        setTimeout(() => btn.classList.remove('log-btn--flash'), 600);
    }
}

function _rerenderIfOpen() {
    if (_panelOpen) _rerenderFeed();
}

function _rerenderFeed() {
    const feed = document.getElementById('log-feed');
    if (!feed) return;
    if (LOG_EVENTS.length === 0) {
        feed.innerHTML = `<div class="log-empty">No activity yet this session.</div>`;
        return;
    }
    feed.innerHTML = LOG_EVENTS.map(_renderEvent).join('');
}

function _renderPanelHTML() {
    return `
        <div class="log-panel-inner">
            <div class="log-header">
                <div class="log-header-left">
                    <span class="log-title">EPISTEMIC LOG</span>
                    <span class="log-subtitle">this session</span>
                </div>
                <div class="log-header-right">
                    <button id="log-clear-btn" class="log-clear-btn" title="Clear log">↺ clear</button>
                    <button class="log-close-btn" onclick="document.getElementById('log-toggle-btn').click()">✕</button>
                </div>
            </div>
            <div id="log-feed" class="log-feed">
                <div class="log-empty">No activity yet this session.</div>
            </div>
        </div>
    `;
}

// ─── Event Rendering ──────────────────────────────────────────────────────────

const EVENT_META = {
    NODE_CREATED:     { icon: '◉', label: 'Node created',   color: '#00c8a0' },
    NODE_DELETED:     { icon: '◌', label: 'Node deleted',   color: '#ff5a5a' },
    NODE_MOVED:       { icon: '⊹', label: 'Node moved',     color: '#8896b8' },
    RELATION_CREATED: { icon: '⟶', label: 'Relation',       color: '#e85090' },
    RELATION_DELETED: { icon: '⟵', label: 'Rel. deleted',   color: '#ff5a5a' },
    AI_ANALYZE:       { icon: '✦', label: 'AI analysis',    color: '#ffa500' },
    AI_CHALLENGE:     { icon: '⚡', label: 'AI challenge',   color: '#ffa500' },
    PLACEMENT_NOTE:   { icon: '✎', label: 'Placement note', color: '#8896b8' },
};

function _renderEvent(evt) {
    const meta = EVENT_META[evt.type] || { icon: '·', label: evt.type, color: '#445070' };
    const time = _formatTime(evt.ts);
    const detail = _renderDetail(evt);

    return `
        <div class="log-event log-event--${evt.type.toLowerCase().replace(/_/g,'-')}" data-id="${evt.id}">
            <div class="log-event-gutter">
                <span class="log-event-icon" style="color:${meta.color}">${meta.icon}</span>
                <div class="log-event-line" style="background:${meta.color}22"></div>
            </div>
            <div class="log-event-body">
                <div class="log-event-header">
                    <span class="log-event-label" style="color:${meta.color}">${meta.label}</span>
                    <span class="log-event-time">${time}</span>
                </div>
                ${detail ? `<div class="log-event-detail">${detail}</div>` : ''}
            </div>
        </div>
    `;
}

function _renderDetail(evt) {
    const d = evt.data;
    switch (evt.type) {
        case 'NODE_CREATED':
            return `<span class="log-node-chip" style="border-color:${_typeColor(d.node_type)}">${_typeIcon(d.node_type)} ${_truncate(d.content || d.name, 48)}</span>`;

        case 'NODE_DELETED':
            return `<span class="log-detail-muted">${_truncate(d.content || d.name || d.id, 48)}</span>`;

        case 'NODE_MOVED': {
            const note = d.placement_note ? `<div class="log-note">"${_truncate(d.placement_note, 72)}"</div>` : '';
            const pos = d.x != null ? `<span class="log-coords">(${Math.round(d.x)}, ${Math.round(d.y)}, ${Math.round(d.z)})</span>` : '';
            return `<span class="log-node-chip">${_truncate(d.content || d.name, 36)}</span>${pos}${note}`;
        }

        case 'RELATION_CREATED': {
            const relColor = _relColor(d.rel_type);
            return `
                <div class="log-rel-row">
                    <span class="log-node-chip log-chip-sm">${_truncate(d.source_name || '?', 22)}</span>
                    <span class="log-rel-type" style="color:${relColor};border-color:${relColor}22">${d.rel_type || '?'}</span>
                    <span class="log-node-chip log-chip-sm">${_truncate(d.target_name || '?', 22)}</span>
                </div>
            `;
        }

        case 'RELATION_DELETED':
            return `<span class="log-detail-muted">${d.rel_type || '?'} · ${_truncate(d.source_name || '', 20)} → ${_truncate(d.target_name || '', 20)}</span>`;

        case 'AI_ANALYZE':
            return `<span class="log-detail-muted">${d.node_count || 0} nodes extracted · ${d.relation_count || 0} relations suggested</span>`;

        case 'AI_CHALLENGE':
            return `<span class="log-node-chip">${_truncate(d.content || d.name, 48)}</span>`;

        case 'PLACEMENT_NOTE':
            return `<div class="log-note">"${_truncate(d.note, 80)}"</div><span class="log-detail-muted">${_truncate(d.content, 36)}</span>`;

        default:
            return '';
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _truncate(str, max) {
    if (!str) return '';
    return str.length > max ? str.slice(0, max) + '…' : str;
}

function _formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const TYPE_COLOR_MAP = {
    Concept:       '#005c49',
    Observation:   '#a65129',
    Method:        '#6622aa',
    Reference:     '#8c7600',
    DraftFragment: '#5c667e',
    Event:         '#a33865',
};
function _typeColor(t) {
    if (!t) return '#445070';
    const key = t.charAt(0).toUpperCase() + t.slice(1);
    return TYPE_COLOR_MAP[key] || '#445070';
}

function _typeIcon(t) {
    const icons = { Concept: '◉', Observation: '◈', Method: '⟁', Reference: '⊞', DraftFragment: '◫', Event: '◆' };
    return icons[t] || '◉';
}

const REL_COLOR_MAP = {
    SUPPORTS: '#00c8a0', SUPPORT: '#00c8a0',
    CONTRADICTS: '#ff5a5a', CONTRADICT: '#ff5a5a',
    TRIGGERS: '#e85090',
    AMPLIFIES: '#ffa500',
    DEPENDS_ON: '#6622aa', REQUIRES: '#6622aa',
    RELATES_TO: '#8896b8', HAS_VERSION: '#8896b8',
};
function _relColor(t) {
    if (!t) return '#8896b8';
    return REL_COLOR_MAP[t.toUpperCase()] || '#8896b8';
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function _injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
        /* ── Panel ── */
        #epistemic-log-panel {
            position: fixed;
            bottom: 90px;
            left: 20px;
            width: 340px;
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.25s ease;
            opacity: 0;
            z-index: 50;
            pointer-events: none;
        }
        #epistemic-log-panel.log-panel--open {
            max-height: 520px;
            opacity: 1;
            pointer-events: auto;
        }
        .log-panel-inner {
            background: rgba(7, 9, 15, 0.94);
            backdrop-filter: blur(16px);
            border: 1px solid #161b29;
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.02);
            display: flex;
            flex-direction: column;
            max-height: 520px;
        }

        /* ── Header ── */
        .log-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 14px 10px;
            border-bottom: 1px solid #161b29;
            flex-shrink: 0;
        }
        .log-header-left { display: flex; align-items: baseline; gap: 8px; }
        .log-title {
            font-family: 'DM Mono', monospace;
            font-size: 10px;
            font-weight: 600;
            letter-spacing: 0.15em;
            color: #00c8a0;
        }
        .log-subtitle {
            font-family: 'DM Mono', monospace;
            font-size: 9px;
            color: #2a3048;
            letter-spacing: 0.05em;
        }
        .log-header-right { display: flex; align-items: center; gap: 6px; }
        .log-clear-btn {
            background: none; border: none;
            font-family: 'DM Mono', monospace;
            font-size: 9px; letter-spacing: 0.08em;
            color: #2a3048; cursor: pointer;
            padding: 3px 6px; border-radius: 3px;
            transition: color 0.15s;
        }
        .log-clear-btn:hover { color: #ff5a5a; }
        .log-close-btn {
            background: none; border: none;
            color: #2a3048; cursor: pointer;
            font-size: 11px; padding: 3px 6px;
            border-radius: 3px; transition: color 0.15s;
        }
        .log-close-btn:hover { color: #8e99b3; }

        /* ── Feed ── */
        .log-feed {
            overflow-y: auto;
            flex: 1;
            padding: 8px 0 12px;
            scrollbar-width: thin;
            scrollbar-color: #161b29 transparent;
        }
        .log-feed::-webkit-scrollbar { width: 3px; }
        .log-feed::-webkit-scrollbar-thumb { background: #1e2535; border-radius: 2px; }
        .log-empty {
            font-family: 'DM Mono', monospace;
            font-size: 11px; color: #2a3048;
            text-align: center; padding: 40px 20px;
            letter-spacing: 0.05em;
        }

        /* ── Event ── */
        .log-event {
            display: flex;
            gap: 0;
            padding: 0 14px;
            animation: logSlideIn 0.2s ease;
        }
        @keyframes logSlideIn {
            from { opacity: 0; transform: translateX(-6px); }
            to   { opacity: 1; transform: translateX(0); }
        }
        .log-event-gutter {
            display: flex;
            flex-direction: column;
            align-items: center;
            width: 24px;
            flex-shrink: 0;
            margin-right: 10px;
            padding-top: 2px;
        }
        .log-event-icon {
            font-size: 12px;
            line-height: 1;
            flex-shrink: 0;
        }
        .log-event-line {
            width: 1px;
            flex: 1;
            min-height: 6px;
            margin-top: 4px;
        }
        .log-event-body {
            flex: 1;
            padding: 6px 0 8px;
            min-width: 0;
        }
        .log-event-header {
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            gap: 8px;
            margin-bottom: 4px;
        }
        .log-event-label {
            font-family: 'DM Mono', monospace;
            font-size: 10px;
            font-weight: 600;
            letter-spacing: 0.1em;
            text-transform: uppercase;
        }
        .log-event-time {
            font-family: 'DM Mono', monospace;
            font-size: 9px;
            color: #2a3048;
            letter-spacing: 0.04em;
            white-space: nowrap;
            flex-shrink: 0;
        }
        .log-event-detail {
            font-family: 'DM Mono', monospace;
            font-size: 11px;
            color: #8e99b3;
            line-height: 1.5;
        }

        /* ── Chips & detail elements ── */
        .log-node-chip {
            display: inline-block;
            background: rgba(0,200,160,0.05);
            border: 1px solid rgba(0,200,160,0.15);
            border-radius: 4px;
            padding: 2px 7px;
            font-size: 10px;
            color: #8e99b3;
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .log-chip-sm { font-size: 9px; padding: 1px 5px; }
        .log-detail-muted {
            font-size: 10px;
            color: #445070;
        }
        .log-coords {
            font-family: 'DM Mono', monospace;
            font-size: 9px;
            color: #2a3048;
            margin-left: 6px;
        }
        .log-note {
            font-size: 10px;
            color: #8896b8;
            font-style: italic;
            margin-top: 4px;
            border-left: 2px solid #1e2535;
            padding-left: 7px;
            line-height: 1.5;
        }
        .log-rel-row {
            display: flex;
            align-items: center;
            gap: 5px;
            flex-wrap: wrap;
        }
        .log-rel-type {
            font-family: 'DM Mono', monospace;
            font-size: 9px;
            font-weight: 600;
            letter-spacing: 0.08em;
            border: 1px solid;
            border-radius: 3px;
            padding: 1px 5px;
        }

        /* ── Toggle button badge ── */
        .log-badge {
            display: inline-block;
            background: rgba(0,200,160,0.12);
            border: 1px solid rgba(0,200,160,0.25);
            color: #00c8a0;
            border-radius: 10px;
            font-size: 9px;
            padding: 0 5px;
            margin-left: 3px;
            min-width: 16px;
            text-align: center;
        }
        .log-btn--flash {
            animation: logBtnFlash 0.5s ease;
        }
        @keyframes logBtnFlash {
            0%   { border-color: var(--border); }
            30%  { border-color: #00c8a0; box-shadow: 0 0 8px rgba(0,200,160,0.3); }
            100% { border-color: var(--border); }
        }
    `;
    document.head.appendChild(style);
}