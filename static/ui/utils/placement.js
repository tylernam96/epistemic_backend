import { cosineSimilarity } from './colors.js';

// ─── Graph-aware placement (Gemini) ──────────────────────────────────────────

export async function suggestPositionFromGraph(content, existingNodes, existingRelations, parentType = 'Concept') {
    try {
        const nodesForApi = existingNodes.map(n => {
            const nodeId = n.node_id || n.id;
            const outgoingRels = existingRelations
                .filter(r => r.source?.id === nodeId || r.source === nodeId)
                .map(r => ({ type: r.rel_type || r.type, target: r.target?.id || r.target }));
            const incomingRels = existingRelations
                .filter(r => r.target?.id === nodeId || r.target === nodeId)
                .map(r => ({ type: r.rel_type || r.type, source: r.source?.id || r.source }));
            return {
                id: n.id, node_id: n.node_id,
                content: n.content || n.name || '',
                parent_type: n.parent_type || n.node_type || 'Concept',
                abstraction_level: n.abstraction_level || 3,
                confidence_tier: n.confidence_tier,
                valid_from: n.valid_from, valid_to: n.valid_to,
                x: n.x || 0, y: n.y || 0, z: n.z || 0,
                embedding: n.embedding,
                relations: {
                    outgoing: outgoingRels.slice(0, 10),
                    incoming: incomingRels.slice(0, 10),
                },
                content_preview: (n.content || n.name || '').substring(0, 100),
            };
        }).slice(0, 30);

        const relationsForApi = existingRelations.slice(0, 50).map(r => ({
            source:   r.source?.id || r.source,
            target:   r.target?.id || r.target,
            rel_type: r.rel_type || r.type || 'RELATES_TO',
        }));

        const graphSummary = {
            totalNodes: existingNodes.length,
            totalRelations: existingRelations.length,
            nodeTypes: Object.entries(
                existingNodes.reduce((acc, n) => {
                    const t = n.parent_type || n.node_type || 'Concept';
                    acc[t] = (acc[t] || 0) + 1;
                    return acc;
                }, {})
            ),
            relationTypes: Object.entries(
                existingRelations.reduce((acc, r) => {
                    const t = r.rel_type || r.type || 'RELATES_TO';
                    acc[t] = (acc[t] || 0) + 1;
                    return acc;
                }, {})
            ),
        };

        const response = await fetch('/api/placement/analyze-graph', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content, parent_type: parentType,
                existing_nodes: nodesForApi,
                existing_relations: relationsForApi,
                graph_summary: graphSummary,
                focus_nodes: nodesForApi.slice(0, 10),
            }),
        });
        if (!response.ok) throw new Error(`API error: ${response.status}`);

        const result = await response.json();

        let explanation = result.reasoning?.spatial_rationale || '';
        if (result.reasoning?.primary_influences?.length > 0) {
            explanation += '\n\n📊 Strongest Connections:\n';
            result.reasoning.primary_influences.forEach(inf => {
                const node = existingNodes.find(n => n.node_id === inf.node_id);
                const nodeName = node ? (node.content || node.name || '').slice(0, 40) : inf.node_id;
                const similarity = inf.influence_weight ? ` (${(inf.influence_weight * 100).toFixed(0)}% match)` : '';
                explanation += `• "${nodeName}"${similarity}: ${inf.reason}\n`;
            });
        }
        if (result.predicted_relations?.length > 0) {
            explanation += '\n🔮 Suggested Relations:\n';
            result.predicted_relations.forEach(rel => {
                const targetNode = existingNodes.find(n => n.node_id === rel.target_node_id);
                const targetName = targetNode
                    ? (targetNode.content || targetNode.name || '').slice(0, 30)
                    : rel.target_node_id;
                explanation += `• ${rel.rel_type} → "${targetName}" (${(rel.confidence * 100).toFixed(0)}% confidence): ${rel.justification}\n`;
            });
        }

        return {
            position: result.position,
            explanation,
            label: `✨ ${result.reasoning?.cluster_placement || 'Graph-aware placement'}`,
            relations: result.predicted_relations || [],
            primaryInfluences: result.reasoning?.primary_influences || [],
        };

    } catch (err) {
        console.error('Graph analysis failed:', err);
        return {
            position: { x: (Math.random() - 0.5) * 300, y: (Math.random() - 0.5) * 300, z: 0 },
            explanation: `Error analyzing graph: ${err.message}. Using random placement.`,
            label: '⚠️ Fallback placement',
            relations: [],
        };
    }
}

// ─── Graph-aware explanation panel ───────────────────────────────────────────

export function showGraphAwareExplanation(node, suggestionData) {
    document.getElementById('graph-explanation')?.remove();

    const panel = document.createElement('div');
    panel.id = 'graph-explanation';
    panel.style.cssText = `
        position:fixed; top:20px; right:20px; width:450px; max-height:80vh;
        overflow-y:auto; background:rgba(8,10,16,0.98); border:1px solid #00c8a0;
        border-radius:12px; padding:20px; z-index:10000;
        font-family:'DM Mono',monospace; box-shadow:0 20px 60px rgba(0,200,160,0.2);
        backdrop-filter:blur(10px); animation:slideInRight 0.3s ease-out;
    `;

    const influences = suggestionData.primaryInfluences || [];
    const relations  = suggestionData.relations || [];

    const influencesHtml = influences.length === 0 ? '' : `
        <div style="margin-bottom:20px;">
            <div style="color:#445070;font-size:10px;letter-spacing:0.05em;margin-bottom:10px;">🔗 PRIMARY INFLUENCES</div>
            ${influences.map(inf => {
                const bar = '█'.repeat(Math.min(10, Math.max(0, Math.floor(inf.influence_weight * 10))))
                          + '░'.repeat(10 - Math.min(10, Math.max(0, Math.floor(inf.influence_weight * 10))));
                return `
                <div style="margin-bottom:12px;padding:8px;background:rgba(255,255,255,0.02);border-radius:6px;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                        <span style="color:#c8d0e0;font-size:11px;">${inf.node_id}</span>
                        <span style="color:#00c8a0;font-size:10px;">${(inf.influence_weight * 100).toFixed(0)}%</span>
                    </div>
                    <div style="color:#445070;font-family:monospace;font-size:12px;letter-spacing:2px;margin-bottom:4px;">${bar}</div>
                    <div style="color:#8e99b3;font-size:10px;">${inf.reason}</div>
                </div>`;
            }).join('')}
        </div>`;

    const relationsHtml = relations.length === 0 ? '' : `
        <div style="margin-bottom:20px;">
            <div style="color:#445070;font-size:10px;letter-spacing:0.05em;margin-bottom:10px;">🔮 PREDICTED RELATIONSHIPS</div>
            ${relations.map(rel => `
                <div style="margin-bottom:10px;padding:10px;background:rgba(0,200,160,0.03);border-radius:6px;border-left:3px solid #00c8a0;">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                        <span style="color:#00c8a0;font-size:10px;font-weight:600;">${rel.rel_type}</span>
                        <span style="color:#445070;font-size:9px;">→</span>
                        <span style="color:#c8d0e0;font-size:10px;">${rel.target_node_id}</span>
                        <span style="color:#445070;font-size:9px;">${(rel.confidence * 100).toFixed(0)}%</span>
                    </div>
                    <div style="color:#8e99b3;font-size:10px;">${rel.justification}</div>
                </div>`).join('')}
        </div>`;

    panel.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
            <span style="font-size:20px;">🧠</span>
            <span style="color:#00c8a0;font-size:12px;font-weight:600;letter-spacing:0.05em;flex:1;">GRAPH-AWARE PLACEMENT</span>
            <button id="close-panel" style="background:none;border:none;color:#445070;cursor:pointer;font-size:16px;">✕</button>
        </div>
        <div style="margin-bottom:20px;padding:15px;background:rgba(0,200,160,0.05);border-radius:8px;">
            <div style="color:#c8d0e0;font-size:14px;font-weight:500;margin-bottom:8px;">${(node.content || node.name || '').substring(0, 100)}</div>
            <div style="color:#8e99b3;font-size:12px;line-height:1.6;white-space:pre-wrap;">${suggestionData.explanation || 'No explanation provided.'}</div>
        </div>
        ${influencesHtml}
        ${relationsHtml}
        <div style="display:flex;gap:12px;margin-top:16px;padding-top:16px;border-top:1px solid #1e2535;">
            <div style="flex:1;">
                <div style="color:#445070;font-size:9px;margin-bottom:4px;">POSITION</div>
                <div style="color:#00c8a0;font-size:11px;">x: ${suggestionData.position?.x?.toFixed(1) || '?'}</div>
                <div style="color:#00c8a0;font-size:11px;">y: ${suggestionData.position?.y?.toFixed(1) || '?'}</div>
            </div>
            <div style="flex:2;">
                <div style="color:#445070;font-size:9px;margin-bottom:4px;">CLUSTER</div>
                <div style="color:#8e99b3;font-size:11px;">${(suggestionData.label || '').replace('✨ ', '')}</div>
            </div>
        </div>`;

    document.body.appendChild(panel);
    _ensureSlideInKeyframe();
    document.getElementById('close-panel').onclick = () => {
        panel.style.animation = 'slideInRight 0.3s reverse';
        setTimeout(() => panel.remove(), 300);
    };
    setTimeout(() => {
        if (panel.parentNode) {
            panel.style.animation = 'slideInRight 0.3s reverse';
            setTimeout(() => panel.remove(), 300);
        }
    }, 20000);
}

// ─── Placement helpers ────────────────────────────────────────────────────────

const MIN_NODE_DISTANCE = 45;

export function repelFromOverlap(x, y, existingNodes, minDist = MIN_NODE_DISTANCE) {
    const placed = existingNodes.filter(n => n.x != null && n.y != null);
    if (!placed.length) return { x, y };
    const cx = placed.reduce((s, n) => s + n.x, 0) / placed.length;
    const cy = placed.reduce((s, n) => s + n.y, 0) / placed.length;
    let px = x, py = y;
    for (let iter = 0; iter < 12; iter++) {
        const too = placed.find(n => Math.hypot(px - n.x, py - n.y) < minDist);
        if (!too) break;
        let dx = px - cx, dy = py - cy;
        const len = Math.hypot(dx, dy) || 1;
        dx /= len; dy /= len;
        const step = minDist * (1 + iter * 0.5);
        px += dx * step; py += dy * step;
    }
    return { x: px, y: py };
}

export function placeOpposite(targetNode, existingNodes, distance = 120) {
    const placed = existingNodes.filter(n => n.x != null && n.y != null);
    const cx = placed.length ? placed.reduce((s, n) => s + n.x, 0) / placed.length : 0;
    const cy = placed.length ? placed.reduce((s, n) => s + n.y, 0) / placed.length : 0;
    const tx = targetNode.x || 0, ty = targetNode.y || 0;
    let dx = tx - cx, dy = ty - cy;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    return {
        x: tx + dx * distance + (Math.random() - 0.5) * 20,
        y: ty + dy * distance + (Math.random() - 0.5) * 20,
    };
}

// ─── Embedding-based position suggestion ─────────────────────────────────────

export async function suggestPositionFromSimilarity(content, existingNodes) {
    if (!content || content.length < 10) {
        return { explanation: 'Content too short for semantic analysis.', label: '⚠️ Content too short' };
    }
    try {
        const embedRes = await fetch('/api/embed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: content }),
        });
        if (!embedRes.ok) return { explanation: 'Could not generate embedding.', label: '⚠️ Embedding failed' };

        const { embedding } = await embedRes.json();
        const nodesWithEmb = existingNodes.filter(n => n.embedding?.length > 0);

        if (!nodesWithEmb.length) {
            return { explanation: 'No existing nodes have embeddings yet.', label: '✨ No reference points yet' };
        }

        const sims = nodesWithEmb
            .map(n => ({ node: n, sim: cosineSimilarity(embedding, n.embedding) }))
            .sort((a, b) => b.sim - a.sim);

        const topMatches  = sims.slice(0, 5);
        const goodMatches = topMatches.filter(m => m.sim > 0.6);
        const contradictTarget = existingNodes._contradictTarget || null;

        let rawPos;
        if (contradictTarget) {
            rawPos = placeOpposite(contradictTarget, existingNodes, 140);
        } else if (!goodMatches.length) {
            rawPos = {
                x: (topMatches[0].node.x || 0) + (Math.random() - 0.5) * 100,
                y: (topMatches[0].node.y || 0) + (Math.random() - 0.5) * 100,
            };
        } else {
            const totalW = goodMatches.reduce((s, m) => s + m.sim, 0);
            rawPos = {
                x: goodMatches.reduce((s, m) => s + (m.node.x || 0) * m.sim, 0) / totalW,
                y: goodMatches.reduce((s, m) => s + (m.node.y || 0) * m.sim, 0) / totalW,
            };
        }

        const finalPos = repelFromOverlap(rawPos.x, rawPos.y, existingNodes);
        const avgSim   = goodMatches.length
            ? goodMatches.reduce((s, m) => s + m.sim, 0) / goodMatches.length
            : (topMatches[0]?.sim || 0);

        const matchDetails = (goodMatches.length ? goodMatches : topMatches).slice(0, 3).map(m => ({
            name: (m.node.content || m.node.name || '').slice(0, 40),
            sim:  (m.sim * 100).toFixed(0),
            type: m.node.parent_type || m.node.node_type || 'Concept',
        }));

        let explanation = contradictTarget
            ? `Placed opposite "${(contradictTarget.content || '').slice(0, 40)}" — CONTRADICTS pushes to opposing side.`
            : avgSim > 0.85 ? `Very similar to existing concepts (${(avgSim * 100).toFixed(0)}% avg). Placed near the cluster.`
            : avgSim > 0.7  ? `Related to several existing concepts. Positioned at their centroid.`
                            : `Somewhat related but distinct. Placed at the cluster periphery.`;

        explanation += `\n\nMost influenced by: ${matchDetails.map(m => `"${m.name}" (${m.sim}%)`).join(', ')}`;
        if (finalPos.x !== rawPos.x || finalPos.y !== rawPos.y) {
            explanation += '\n\n↔ Position nudged to avoid overlap with nearby nodes.';
        }

        return {
            x: finalPos.x, y: finalPos.y,
            explanation,
            label: `✨ Suggested near: ${matchDetails.map(m => m.name).join(', ')}`,
            matches: matchDetails,
        };
    } catch (err) {
        console.warn('Position suggestion failed:', err);
        return { explanation: 'Error analyzing semantic relationships.', label: '⚠️ Analysis failed' };
    }
}

// ─── Placement explanation panel (post-creation) ─────────────────────────────

export function showPlacementExplanation(node, suggestionData) {
    document.getElementById('placement-explanation')?.remove();

    const panel = document.createElement('div');
    panel.id = 'placement-explanation';
    panel.style.cssText = `
        position:fixed; top:20px; right:20px; width:360px;
        background:rgba(8,10,16,0.98); border:1px solid var(--concept);
        border-radius:10px; padding:18px; z-index:1000;
        font-family:'DM Mono',monospace; box-shadow:0 10px 40px rgba(0,200,160,0.15);
        backdrop-filter:blur(8px); animation:slideInRight 0.3s ease-out;
    `;

    const matchDetails = suggestionData.matches ? suggestionData.matches.map(m => {
        const filled = Math.floor(parseInt(m.sim) / 10);
        const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
        return `
            <div style="margin-bottom:12px;padding:8px;background:rgba(255,255,255,0.02);border-radius:6px;">
                <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                    <span style="color:#c8d0e0;font-size:11px;">${m.name}</span>
                    <span style="color:var(--concept);font-size:10px;">${m.sim}%</span>
                </div>
                <div style="color:#445070;font-family:monospace;font-size:12px;letter-spacing:2px;">${bar}</div>
                <div style="color:#445070;font-size:9px;margin-top:2px;">${m.type}</div>
            </div>`;
    }).join('') : '';

    panel.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
            <span style="font-size:16px;">✨</span>
            <span style="color:var(--concept);font-size:11px;font-weight:600;letter-spacing:0.05em;flex:1;">PLACEMENT EXPLANATION</span>
            <button id="close-explanation" style="background:none;border:none;color:#445070;cursor:pointer;font-size:14px;">✕</button>
        </div>
        <div style="margin-bottom:16px;padding:10px;background:rgba(0,200,160,0.05);border-left:3px solid var(--concept);border-radius:4px;">
            <div style="color:#c8d0e0;font-size:13px;font-weight:500;margin-bottom:4px;">${node.content || node.name}</div>
            <div style="color:#8e99b3;font-size:11px;line-height:1.6;white-space:pre-wrap;">${suggestionData.explanation}</div>
        </div>
        ${matchDetails ? `
            <div style="margin-top:12px;">
                <div style="color:#445070;font-size:10px;letter-spacing:0.05em;margin-bottom:8px;">MOST SIMILAR CONCEPTS</div>
                ${matchDetails}
            </div>` : ''}
        <div style="margin-top:16px;padding-top:12px;border-top:1px solid #1e2535;font-size:10px;color:#445070;">
            📍 Position: ${node.x?.toFixed(1) || '?'}, ${node.y?.toFixed(1) || '?'}, ${node.z?.toFixed(1) || '?'}
        </div>`;

    document.body.appendChild(panel);
    _ensureSlideInKeyframe();
    document.getElementById('close-explanation').onclick = () => panel.remove();
    setTimeout(() => {
        if (panel.parentNode) {
            panel.style.animation = 'slideInRight 0.3s reverse';
            setTimeout(() => panel.remove(), 300);
        }
    }, 15000);
}

// ─── Shared keyframe injection ────────────────────────────────────────────────

function _ensureSlideInKeyframe() {
    if (document.getElementById('explanation-keyframes')) return;
    const s = document.createElement('style');
    s.id = 'explanation-keyframes';
    s.textContent = `
        @keyframes slideInRight {
            from { transform: translateX(100%); opacity: 0; }
            to   { transform: translateX(0);    opacity: 1; }
        }`;
    document.head.appendChild(s);
}