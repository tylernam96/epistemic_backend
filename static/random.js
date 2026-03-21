import { TYPE_COLORS, REL_COLORS, saveTypeColors, saveRelColors } from './graph-component.js';

function resolveRelColor(rawType) {
    if (!rawType) return '#445070';
    return REL_COLORS[rawType.toUpperCase().trim()] || '#445070';
}

function showFlash(msg, isError = false) {
    const flash = document.createElement('div');
    flash.className = 'success-flash';
    flash.textContent = msg;
    if (isError) {
        flash.style.background = 'rgba(255,90,90,0.12)';
        flash.style.borderColor = '#ff5a5a';
        flash.style.color = '#ff5a5a';
    }
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 2500);
}

// Cosine similarity helper
function cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
    }
    
    magA = Math.sqrt(magA);
    magB = Math.sqrt(magB);
    
    if (magA === 0 || magB === 0) return 0;
    return dot / (magA * magB);
}

async function suggestPositionFromGraph(content, existingNodes, existingRelations, parentType = 'Concept') {
    console.log('🔍 Calling graph-aware API with', existingNodes.length, 'nodes');
    
    try {
                console.log('📤 Preparing API request...');

        // Build rich node context - include EVERYTHING about each node
        const nodesForApi = existingNodes.map(n => {
            // Find all relations for this node
            const nodeId = n.node_id || n.id;
            const outgoingRels = existingRelations.filter(r => 
                (r.source?.id === nodeId || r.source === nodeId)
            ).map(r => ({
                type: r.rel_type || r.type,
                target: r.target?.id || r.target
            }));
            
            const incomingRels = existingRelations.filter(r => 
                (r.target?.id === nodeId || r.target === nodeId)
            ).map(r => ({
                type: r.rel_type || r.type,
                source: r.source?.id || r.source
            }));
            
            return {
                id: n.id,
                node_id: n.node_id,
                content: n.content || n.name || '',
                parent_type: n.parent_type || n.node_type || 'Concept',
                abstraction_level: n.abstraction_level || 3,
                confidence_tier: n.confidence_tier,
                valid_from: n.valid_from,
                valid_to: n.valid_to,
                x: n.x || 0,
                y: n.y || 0,
                z: n.z || 0,
                embedding: n.embedding, // Include if available
                relations: {
                    outgoing: outgoingRels.slice(0, 10),
                    incoming: incomingRels.slice(0, 10)
                },
                // Include a snippet of the content for quick reference
                content_preview: (n.content || n.name || '').substring(0, 100)
            };
        }).slice(0, 30); // Limit to 30 most relevant nodes
 
        const relationsForApi = existingRelations.slice(0, 50).map(r => ({
    source: r.source?.id || r.source,
    target: r.target?.id || r.target,
    rel_type: r.rel_type || r.type || 'RELATES_TO'
}));
               console.log(`📡 Sending ${nodesForApi.length} nodes and ${relationsForApi.length} relations to API...`);
        // Also send a summary of the graph structure
        const graphSummary = {
            totalNodes: existingNodes.length,
            totalRelations: existingRelations.length,
            nodeTypes: Object.entries(
                existingNodes.reduce((acc, n) => {
                    const type = n.parent_type || n.node_type || 'Concept';
                    acc[type] = (acc[type] || 0) + 1;
                    return acc;
                }, {})
            ),
            relationTypes: Object.entries(
                existingRelations.reduce((acc, r) => {
                    const type = r.rel_type || r.type || 'RELATES_TO';
                    acc[type] = (acc[type] || 0) + 1;
                    return acc;
                }, {})
            )
        };
        
        const response = await fetch('/api/placement/analyze-graph', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content,
                parent_type: parentType,
                existing_nodes: nodesForApi,
                existing_relations: relationsForApi,  // ✅ ADD THIS LINE
                graph_summary: graphSummary,
                // Include a few candidate nodes that might be related
                focus_nodes: nodesForApi.slice(0, 10) // Focus on first 10 nodes
            })
        });
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('✅ Graph API result:', result);
        
        // Format explanation with more detail
        let explanation = result.reasoning?.spatial_rationale || '';
        
        if (result.reasoning?.primary_influences?.length > 0) {
            explanation += '\n\n📊 Strongest Connections:\n';
            result.reasoning.primary_influences.forEach(inf => {
                const node = existingNodes.find(n => n.node_id === inf.node_id);
                const nodeName = node ? (node.content || node.name || '').slice(0, 40) : inf.node_id;
                const similarity = inf.influence_weight ? 
                    ` (${(inf.influence_weight * 100).toFixed(0)}% match)` : '';
                explanation += `• "${nodeName}"${similarity}: ${inf.reason}\n`;
            });
        }
        
        // Add relation predictions
        if (result.predicted_relations?.length > 0) {
            explanation += '\n🔮 Suggested Relations:\n';
            result.predicted_relations.forEach(rel => {
                const targetNode = existingNodes.find(n => n.node_id === rel.target_node_id);
                const targetName = targetNode ? 
                    (targetNode.content || targetNode.name || '').slice(0, 30) : 
                    rel.target_node_id;
                explanation += `• ${rel.rel_type} → "${targetName}" (${(rel.confidence * 100).toFixed(0)}% confidence): ${rel.justification}\n`;
            });
        }
        
        return {
            position: result.position,
            explanation,
            label: `✨ ${result.reasoning?.cluster_placement || 'Graph-aware placement'}`,
            relations: result.predicted_relations || [],
            primaryInfluences: result.reasoning?.primary_influences || []
        };
        
    } catch (err) {
        console.error('Graph analysis failed:', err);
        return {
            position: {
                x: (Math.random() - 0.5) * 300,
                y: (Math.random() - 0.5) * 300,
                z: 0
            },
            explanation: `Error analyzing graph: ${err.message}. Using random placement.`,
            label: '⚠️ Fallback placement',
            relations: []
        };
    }
}

function showGraphAwareExplanation(node, suggestionData) {
    console.log('📊 Showing explanation for node:', node, suggestionData);
    
    // Remove any existing panel
    const existing = document.getElementById('graph-explanation');
    if (existing) existing.remove();
    
    const panel = document.createElement('div');
    panel.id = 'graph-explanation';
    panel.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        width: 450px;
        max-height: 80vh;
        overflow-y: auto;
        background: rgba(8,10,16,0.98);
        border: 1px solid #00c8a0;
        border-radius: 12px;
        padding: 20px;
        z-index: 10000;
        font-family: 'DM Mono', monospace;
        box-shadow: 0 20px 60px rgba(0,200,160,0.2);
        backdrop-filter: blur(10px);
        animation: slideInRight 0.3s ease-out;
    `;
    
    // Create influences HTML
    const influences = suggestionData.primaryInfluences || [];
    const relations = suggestionData.relations || [];
    
    let influencesHtml = '';
    if (influences.length > 0) {
        influencesHtml = `
            <div style="margin-bottom: 20px;">
                <div style="color: #445070; font-size: 10px; letter-spacing: 0.05em; margin-bottom: 10px;">🔗 PRIMARY INFLUENCES</div>
                ${influences.map(inf => {
                   const barLength = Math.min(10, Math.max(0, Math.floor(inf.influence_weight * 10)));
const emptyLength = 10 - barLength;
const weightBar = '█'.repeat(barLength) + '░'.repeat(emptyLength);
                    return `
                    <div style="margin-bottom: 12px; padding: 8px; background: rgba(255,255,255,0.02); border-radius: 6px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                            <span style="color: #c8d0e0; font-size: 11px;">${inf.node_id}</span>
                            <span style="color: #00c8a0; font-size: 10px;">${(inf.influence_weight * 100).toFixed(0)}%</span>
                        </div>
                        <div style="color: #445070; font-family: monospace; font-size: 12px; letter-spacing: 2px; margin-bottom: 4px;">
                            ${weightBar}
                        </div>
                        <div style="color: #8e99b3; font-size: 10px;">${inf.reason}</div>
                    </div>
                `}).join('')}
            </div>
        `;
    }
    
    // Create relations HTML
    let relationsHtml = '';
    if (relations.length > 0) {
        relationsHtml = `
            <div style="margin-bottom: 20px;">
                <div style="color: #445070; font-size: 10px; letter-spacing: 0.05em; margin-bottom: 10px;">🔮 PREDICTED RELATIONSHIPS</div>
                ${relations.map(rel => `
                    <div style="margin-bottom: 10px; padding: 10px; background: rgba(0,200,160,0.03); border-radius: 6px; border-left: 3px solid #00c8a0;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                            <span style="color: #00c8a0; font-size: 10px; font-weight: 600;">${rel.rel_type}</span>
                            <span style="color: #445070; font-size: 9px;">→</span>
                            <span style="color: #c8d0e0; font-size: 10px;">${rel.target_node_id}</span>
                            <span style="color: #445070; font-size: 9px;">${(rel.confidence * 100).toFixed(0)}%</span>
                        </div>
                        <div style="color: #8e99b3; font-size: 10px;">${rel.justification}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    panel.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
            <span style="font-size: 20px;">🧠</span>
            <span style="color: #00c8a0; font-size: 12px; font-weight: 600; letter-spacing: 0.05em; flex:1;">GRAPH-AWARE PLACEMENT</span>
            <button id="close-panel" style="background:none; border:none; color:#445070; cursor:pointer; font-size:16px;">✕</button>
        </div>
        
        <div style="margin-bottom: 20px; padding: 15px; background: rgba(0,200,160,0.05); border-radius: 8px;">
            <div style="color: #c8d0e0; font-size: 14px; font-weight: 500; margin-bottom: 8px;">${(node.content || node.name || '').substring(0, 100)}</div>
            <div style="color: #8e99b3; font-size: 12px; line-height: 1.6; white-space: pre-wrap;">${suggestionData.explanation || 'No explanation provided.'}</div>
        </div>
        
        ${influencesHtml}
        ${relationsHtml}
        
        <div style="display: flex; gap: 12px; margin-top: 16px; padding-top: 16px; border-top: 1px solid #1e2535;">
            <div style="flex: 1;">
                <div style="color: #445070; font-size: 9px; margin-bottom: 4px;">POSITION</div>
                <div style="color: #00c8a0; font-size: 11px;">x: ${suggestionData.position?.x?.toFixed(1) || '?'}</div>
                <div style="color: #00c8a0; font-size: 11px;">y: ${suggestionData.position?.y?.toFixed(1) || '?'}</div>
            </div>
            <div style="flex: 2;">
                <div style="color: #445070; font-size: 9px; margin-bottom: 4px;">CLUSTER</div>
                <div style="color: #8e99b3; font-size: 11px;">${(suggestionData.label || '').replace('✨ ', '')}</div>
            </div>
        </div>
    `;
    
    document.body.appendChild(panel);
    
    // Add animation keyframes if not present
    if (!document.getElementById('explanation-keyframes')) {
        const style = document.createElement('style');
        style.id = 'explanation-keyframes';
        style.textContent = `
            @keyframes slideInRight {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }
    
    // Close button handler
    document.getElementById('close-panel').onclick = () => {
        panel.style.animation = 'slideInRight 0.3s reverse';
        setTimeout(() => panel.remove(), 300);
    };
    
    // Auto-dismiss after 20 seconds
    setTimeout(() => {
        if (panel.parentNode) {
            panel.style.animation = 'slideInRight 0.3s reverse';
            setTimeout(() => panel.remove(), 300);
        }
    }, 20000);
}

// Fallback embedding function
async function fallbackToEmbedding(content, existingNodes, parentType) {
    try {
        // Get embedding
        const embedRes = await fetch('/api/embed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: content })
        });
        
        if (!embedRes.ok) throw new Error("Embedding failed");
        
        const { embedding } = await embedRes.json();
        
        // Find nodes with embeddings
        const nodesWithEmbeddings = existingNodes.filter(n => 
            n.embedding && Array.isArray(n.embedding) && n.embedding.length > 0
        );
        
        if (nodesWithEmbeddings.length === 0) {
            return {
                position: { x: (Math.random() - 0.5) * 300, y: (Math.random() - 0.5) * 300 },
                explanation: "No embedding data available. Using random placement.",
                label: "⚠️ Random placement",
                relations: []
            };
        }
        
        // Calculate similarities
        const similarities = nodesWithEmbeddings.map(node => {
            const sim = cosineSimilarity(embedding, node.embedding);
            return { node, sim };
        });
        
        similarities.sort((a, b) => b.sim - a.sim);
        const topMatches = similarities.slice(0, 5);
        
        // Weighted centroid
        let totalWeight = 0;
        let weightedX = 0;
        let weightedY = 0;
        
        topMatches.forEach(({ node, sim }) => {
            const weight = Math.max(sim, 0.3);
            weightedX += (node.x || 0) * weight;
            weightedY += (node.y || 0) * weight;
            totalWeight += weight;
        });
        
        const position = {
            x: (weightedX / totalWeight) + (Math.random() - 0.5) * 20,
            y: (weightedY / totalWeight) + (Math.random() - 0.5) * 20
        };
        
        const avgSim = topMatches.reduce((sum, m) => sum + m.sim, 0) / topMatches.length;
        
        return {
            position,
            explanation: `Based on semantic similarity (${(avgSim*100).toFixed(0)}% average match) with existing nodes. Placed near conceptually similar content.`,
            label: `✨ Embedding-based placement`,
            relations: [],
            primaryInfluences: topMatches.slice(0, 3).map(m => ({
                node_id: m.node.node_id || m.node.id,
                influence_weight: m.sim,
                reason: `Semantic similarity: ${(m.sim*100).toFixed(0)}%`
            }))
        };
        
    } catch (err) {
        console.error("Fallback failed:", err);
        return {
            position: { x: (Math.random() - 0.5) * 300, y: (Math.random() - 0.5) * 300 },
            explanation: "Error in analysis. Using random placement.",
            label: "⚠️ Error - random placement",
            relations: []
        };
    }
}

// ── Placement helpers ──────────────────────────────────────────────────────

// Minimum distance between any two nodes before we nudge outward.
const MIN_NODE_DISTANCE = 45;

/**
 * Given a candidate (x, y) and the full list of existing nodes, nudge the
 * position outward from the local centroid until it is at least MIN_NODE_DISTANCE
 * away from every existing node.  Iterates up to 12 times; each miss doubles
 * the step so it escapes dense clusters quickly.
 */
function repelFromOverlap(x, y, existingNodes, minDist = MIN_NODE_DISTANCE) {
    const nodesWithPos = existingNodes.filter(n => n.x != null && n.y != null);
    if (nodesWithPos.length === 0) return { x, y };

    // Centroid of all placed nodes — we push *away* from it when overlapping
    const cx = nodesWithPos.reduce((s, n) => s + n.x, 0) / nodesWithPos.length;
    const cy = nodesWithPos.reduce((s, n) => s + n.y, 0) / nodesWithPos.length;

    let px = x, py = y;
    for (let iter = 0; iter < 12; iter++) {
        const tooClose = nodesWithPos.find(n =>
            Math.hypot(px - n.x, py - n.y) < minDist
        );
        if (!tooClose) break;

        // Direction from global centroid through current position
        let dx = px - cx, dy = py - cy;
        const len = Math.hypot(dx, dy) || 1;
        dx /= len; dy /= len;

        const step = minDist * (1 + iter * 0.5);
        px += dx * step;
        py += dy * step;
    }
    return { x: px, y: py };
}

/**
 * Given a CONTRADICTS target node at (tx, ty) and the graph centroid,
 * place the new node on the *opposite* side of the target from the centroid,
 * at `distance` units away.
 */
function placeOpposite(targetNode, existingNodes, distance = 120) {
    const nodesWithPos = existingNodes.filter(n => n.x != null && n.y != null);
    const cx = nodesWithPos.length
        ? nodesWithPos.reduce((s, n) => s + n.x, 0) / nodesWithPos.length
        : 0;
    const cy = nodesWithPos.length
        ? nodesWithPos.reduce((s, n) => s + n.y, 0) / nodesWithPos.length
        : 0;

    const tx = targetNode.x || 0;
    const ty = targetNode.y || 0;

    // Vector from centroid → target; extend past target
    let dx = tx - cx, dy = ty - cy;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;

    return {
        x: tx + dx * distance + (Math.random() - 0.5) * 20,
        y: ty + dy * distance + (Math.random() - 0.5) * 20,
    };
}

// Suggest position based on semantic similarity
async function suggestPositionFromSimilarity(content, existingNodes) {
    if (!content || content.length < 10) {
        return {
            explanation: "Content too short for semantic analysis. Please provide more detail for better placement suggestions.",
            label: "⚠️ Content too short"
        };
    }
    
    try {
        const embedRes = await fetch('/api/embed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: content })
        });
        if (!embedRes.ok) {
            return {
                explanation: "Could not generate embedding for this content. Using random placement.",
                label: "⚠️ Embedding failed"
            };
        }
        
        const { embedding } = await embedRes.json();
        
        const nodesWithEmbeddings = existingNodes.filter(n => 
            n.embedding && Array.isArray(n.embedding) && n.embedding.length > 0
        );
        
        if (nodesWithEmbeddings.length === 0) {
            return {
                explanation: "No existing nodes have embeddings yet.",
                label: "✨ No reference points yet"
            };
        }
        
        const similarities = nodesWithEmbeddings.map(node => ({
            node,
            sim: cosineSimilarity(embedding, node.embedding)
        })).sort((a, b) => b.sim - a.sim);
        
        const topMatches  = similarities.slice(0, 5);
        const goodMatches = topMatches.filter(m => m.sim > 0.6);

        // ── Check if the top predicted relation is a CONTRADICTION ──
        // (Relations arrive later via Gemini, but we can pre-check by looking at
        // sim range: very-high sim of a node that has "contradict" in its content
        // is a weak proxy — real check happens in the async relations block.)
        // We expose a hook: if the caller has pre-computed a dominant CONTRADICTS
        // relation, it can be passed as existingNodes._contradictTarget.
        const contradictTarget = existingNodes._contradictTarget || null;

        let rawPos;

        if (contradictTarget) {
            // Place on the opposite side of the CONTRADICTS target
            rawPos = placeOpposite(contradictTarget, existingNodes, 140);
        } else if (goodMatches.length === 0) {
            const bestMatch = topMatches[0];
            rawPos = {
                x: (bestMatch.node.x || 0) + (Math.random() - 0.5) * 100,
                y: (bestMatch.node.y || 0) + (Math.random() - 0.5) * 100,
            };
        } else {
            // Weighted centroid of good matches
            const totalW = goodMatches.reduce((s, m) => s + m.sim, 0);
            rawPos = {
                x: goodMatches.reduce((s, m) => s + (m.node.x || 0) * m.sim, 0) / totalW,
                y: goodMatches.reduce((s, m) => s + (m.node.y || 0) * m.sim, 0) / totalW,
            };
        }

        // ── Apply overlap repulsion ──────────────────────────────────────────
        const finalPos = repelFromOverlap(rawPos.x, rawPos.y, existingNodes);

        const avgSim = goodMatches.length
            ? goodMatches.reduce((s, m) => s + m.sim, 0) / goodMatches.length
            : (topMatches[0]?.sim || 0);

        let explanation = contradictTarget
            ? `Placed opposite "${(contradictTarget.content || '').slice(0, 40)}" — CONTRADICTS relation pushes to opposing side of the graph.`
            : avgSim > 0.85
                ? `Very similar to existing concepts (${(avgSim*100).toFixed(0)}% avg). Placed near the cluster.`
                : avgSim > 0.7
                    ? `Related to several existing concepts. Positioned at their centroid.`
                    : `Somewhat related but distinct. Placed at the cluster periphery.`;

        const matchDetails = (goodMatches.length ? goodMatches : topMatches).slice(0, 3).map(m => ({
            name: (m.node.content || m.node.name || '').slice(0, 40),
            sim:  (m.sim * 100).toFixed(0),
            type: m.node.parent_type || m.node.node_type || 'Concept'
        }));

        const matchNames = matchDetails.map(m => `"${m.name}" (${m.sim}%)`).join(', ');
        explanation += `\n\nMost influenced by: ${matchNames}`;

        if (finalPos.x !== rawPos.x || finalPos.y !== rawPos.y) {
            explanation += '\n\n↔ Position nudged to avoid overlap with nearby nodes.';
        }
        
        return {
            x: finalPos.x,
            y: finalPos.y,
            explanation,
            label: `✨ Suggested near: ${matchDetails.map(m => m.name).join(', ')}`,
            matches: matchDetails,
        };
        
    } catch (err) {
        console.warn('Failed to generate position suggestion:', err);
        return {
            explanation: "Error analyzing semantic relationships. Using random placement.",
            label: "⚠️ Analysis failed"
        };
    }
}

export const UI = {

    // -------------------------
    // Link Mode Status
    // -------------------------
    setLinkModeStatus(msg) {
        const indicator = document.getElementById('link-mode-indicator');
        if (msg) {
            indicator.style.display = 'block';
            indicator.innerText = msg;
        } else {
            indicator.style.display = 'none';
        }
    },

    // -------------------------
    // Add Node Modal with Similarity Placement
    // -------------------------
 renderAddNodeModal(onSubmit, existingNodes = [], existingRelations= []) {
    const existing = document.getElementById('add-node-modal');
    if (existing) existing.remove();

    const NODE_TYPES = Object.keys(TYPE_COLORS);

    const modal = document.createElement('div');
    modal.id = 'add-node-modal';
    modal.className = 'creation-modal-overlay';
    modal.innerHTML = `
        <div class="creation-modal">
            <div class="modal-header">
                <span class="modal-tag">NEW NODE</span>
                <button class="modal-close" id="add-node-close">&#x2715;</button>
            </div>
            <div class="modal-body">
                <div class="field-group">
                    <label>Content <span class="req">*</span></label>
                    <textarea id="an-content" rows="3" placeholder="Describe this concept, observation, or event..."></textarea>
                    
                    <!-- Suggestion panel -->
                    <div id="an-suggestion" class="position-suggestion" style="display:none; margin-top:10px; background:rgba(0,200,160,0.03); border:1px solid rgba(0,200,160,0.15); border-radius:8px; overflow:hidden; position:relative;">
                        <div style="padding:12px 14px; background:rgba(0,200,160,0.02); border-bottom:1px solid rgba(0,200,160,0.1);">
                            <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
                                <span style="color:var(--concept); font-size:11px; font-weight:600; letter-spacing:0.05em;">✨ PLACEMENT REASONING</span>
                                <span style="font-size:10px; color:#445070; font-family:'DM Mono',monospace;" id="an-confidence"></span>
                            </div>
                            <div id="an-explanation" style="font-size:12px; color:#8e99b3; line-height:1.6; white-space:pre-wrap; font-family:'DM Mono',monospace; cursor:help;"></div>
                        </div>
                        <div style="padding:10px 14px; display:flex; align-items:center; justify-content:space-between; background:rgba(0,0,0,0.2);">
                            <div style="display:flex; gap:8px; align-items:center;">
                                <span style="font-size:11px; color:#445070;">Suggested position:</span>
                                <span id="an-coords" style="font-size:11px; color:var(--concept); font-family:'DM Mono',monospace;">x: — y: —</span>
                            </div>
                            <button id="an-use-suggestion" style="background:rgba(0,200,160,0.1); border:1px solid var(--concept); color:var(--concept); border-radius:4px; padding:6px 16px; font-size:11px; cursor:pointer; font-family:'DM Mono',monospace; font-weight:600;">Use This Position</button>
                        </div>
                    </div>

                    <!-- Predicted relations ─ populated by background Gemini call -->
                    <div id="an-relations" style="display:none; margin-top:8px; border:1px solid rgba(0,200,160,0.12); border-radius:8px; overflow:hidden;">
                        <div style="padding:7px 12px; background:rgba(0,200,160,0.03); border-bottom:1px solid rgba(0,200,160,0.1); display:flex; align-items:center; gap:8px;">
                            <span style="font-size:10px; color:#445070; letter-spacing:0.08em;">🔮 SUGGESTED RELATIONS</span>
                            <span style="font-size:9px; color:#1e3040;">toggle to include on creation</span>
                        </div>
                        <div id="an-relations-list" style="padding:8px; display:flex; flex-direction:column; gap:5px;"></div>
                    </div>

                    <!-- Tooltip popup for detailed match info -->
                    <div id="an-details-popup" style="display:none; position:fixed; background:#0c0e16; border:1px solid var(--concept); border-radius:8px; padding:14px; max-width:350px; z-index:10000; box-shadow:0 10px 40px rgba(0,0,0,0.8); backdrop-filter:blur(8px); pointer-events:none; white-space:pre-wrap; font-family:'DM Mono',monospace; font-size:11px; line-height:1.7; color:#8e99b3;"></div>
                </div>
                
                <div class="field-row">
                    <div class="field-group">
                        <label>Type <span class="req">*</span></label>
                        <select id="an-type">
                            ${NODE_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
                        </select>
                    </div>
                    <div class="field-group">
                        <label>Epoch From <span class="opt">(optional)</span></label>
                        <input type="number" id="an-valid-from" min="1" step="1" placeholder="e.g. 1">
                    </div>
                </div>
                <div class="field-group">
                    <label>Epoch To <span class="opt">(optional)</span></label>
                    <input type="number" id="an-valid-to" min="1" step="1" placeholder="e.g. 3">
                </div>
                <div class="field-group">
                    <label>Position <span class="opt">(leave blank for AI-suggested)</span></label>
                    <div class="field-row">
                        <input type="number" id="an-x" step="any" placeholder="X">
                        <input type="number" id="an-y" step="any" placeholder="Y">
                        <input type="number" id="an-z" step="any" placeholder="Z override">
                    </div>
                </div>
                <div class="field-group">
                    <label>Abstraction Level <span class="opt">(1=observation … 5=axiom)</span></label>
                    <div class="slider-row">
                        <input type="range" id="an-abstraction" min="1" max="5" step="1" value="3">
                        <span id="an-abstraction-val" style="color:#8896b8;width:90px;font-size:10px;flex-shrink:0;">3 — Hypothesis</span>
                    </div>
                </div>
                <div class="field-group">
                    <label>Confidence Tier <span class="opt">(drives edge distances)</span></label>
                    <select id="an-confidence-tier">
                        <option value="0">0 — Speculative</option>
                        <option value="1" selected>1 — Working</option>
                        <option value="2">2 — Provisional</option>
                        <option value="3">3 — Confirmed</option>
                    </select>
                </div>
                <div id="an-error" class="modal-error" style="display:none"></div>
            </div>
            <div class="modal-footer">
                <button class="modal-btn-cancel" id="add-node-cancel">Cancel</button>
                <button class="modal-btn-confirm" id="add-node-submit">Create Node &#x2192;</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    
    // Get DOM elements
    const contentInput = document.getElementById('an-content');
    const suggestionDiv = document.getElementById('an-suggestion');
    const explanationEl = document.getElementById('an-explanation');
    const confidenceEl = document.getElementById('an-confidence');
    const coordsEl = document.getElementById('an-coords');
    const useSuggestionBtn = document.getElementById('an-use-suggestion');
    const xInput = document.getElementById('an-x');
    const yInput = document.getElementById('an-y');
    const zInput = document.getElementById('an-z');
    const popupEl = document.getElementById('an-details-popup');
    
    let suggestionTimeout;
    let currentSuggestion = null;
    
    // Content input handler with debounce
    contentInput.addEventListener('input', () => {
        clearTimeout(suggestionTimeout);
        suggestionDiv.style.display = 'none';
        
        suggestionTimeout = setTimeout(async () => {
            const content = contentInput.value.trim();
            if (content.length < 15) {
                suggestionDiv.style.display = 'none';
                return;
            }
            
            // Show loading state
            explanationEl.textContent = '🔍 Analyzing semantic relationships...';
            confidenceEl.textContent = '';
            coordsEl.textContent = 'x: — y: —';
            useSuggestionBtn.style.opacity = '1';
            useSuggestionBtn.style.pointerEvents = 'auto';
            suggestionDiv.style.display = 'block';
            
            const parentType = document.getElementById('an-type').value;
            const suggestion = await suggestPositionFromSimilarity(content, existingNodes, existingRelations, parentType);
            currentSuggestion = suggestion;

            // Show relation loading state in the panel footer area
            const relDiv = document.getElementById('an-relations');
            const relList = document.getElementById('an-relations-list');
            if (relDiv && relList) {
                relDiv.style.display = 'block';
                relList.innerHTML = '<div style="padding:4px 2px;font-size:10px;color:#445070;">🔮 Predicting relations...</div>';
            }

            // ── Background: Gemini relation prediction ───────────────────────────
            (async () => {
                try {
                    const embedRes = await fetch('/api/embed', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text: content }),
                    });
                    if (!embedRes.ok) throw new Error('embed failed');
                    const { embedding } = await embedRes.json();

                    const nodesWithEmb = existingNodes.filter(n => n.embedding?.length > 0);
                    if (nodesWithEmb.length === 0) { if (relDiv) relDiv.style.display = 'none'; return; }

                    const sims = nodesWithEmb
                        .map(n => ({ node: n, sim: cosineSimilarity(embedding, n.embedding) }))
                        .sort((a, b) => b.sim - a.sim);

                    const candidates = [
                        ...sims.filter(m => m.sim >= 0.55).slice(0, 5),
                        ...sims.filter(m => m.sim >= 0.3 && m.sim < 0.55).slice(0, 2),
                    ].filter((m, i, arr) => arr.findIndex(x => x.node.node_id === m.node.node_id) === i);

                    if (candidates.length === 0) { if (relDiv) relDiv.style.display = 'none'; return; }

                    const geminiRes = await fetch('/api/placement/analyze-graph', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            content,
                            parent_type: parentType,
                            existing_nodes: candidates.map(m => ({
                                node_id:     m.node.node_id,
                                content:     m.node.content || m.node.name || '',
                                parent_type: m.node.parent_type || 'Concept',
                                x: m.node.x || 0, y: m.node.y || 0, z: 0,
                                embedding: [],
                            })),
                            existing_relations: [],
                        }),
                    });
                    if (!geminiRes.ok) throw new Error('analyze-graph ' + geminiRes.status);
                    const geminiData = await geminiRes.json();
                    const relations = (geminiData.predicted_relations || []).slice(0, 5);

                    if (!currentSuggestion) return;
                    const accepted = new Set(relations.map((_, i) => i));
                    currentSuggestion._pendingRels = relations;
                    currentSuggestion._relAccepted = accepted;

                    // ── If top relation is CONTRADICTS, reposition to opposite side ──
                    const topRel = relations.slice().sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];
                    if (topRel?.rel_type === 'CONTRADICTS') {
                        const contradictTarget = existingNodes.find(n => n.node_id === topRel.target_node_id);
                        if (contradictTarget) {
                            const oppPos  = placeOpposite(contradictTarget, existingNodes, 140);
                            const finalOpp = repelFromOverlap(oppPos.x, oppPos.y, existingNodes);
                            currentSuggestion.x = finalOpp.x;
                            currentSuggestion.y = finalOpp.y;
                            coordsEl.textContent = `x: ${finalOpp.x.toFixed(1)} y: ${finalOpp.y.toFixed(1)} ⚔️`;
                            explanationEl.textContent = currentSuggestion.explanation +
                                `

⚔️ CONTRADICTS "${(contradictTarget.content||'').slice(0,40)}" — repositioned to opposing side.`;
                        }
                    }

                    // ── Render relation toggle cards ──────────────────────────────
                    const REL_COLOR = {
                        CONTRADICTS:'#ff5a5a', SUPPORTS:'#00c8a0', REQUIRES:'#ffa500',
                        TRIGGERS:'#a78bfa',    AMPLIFIES:'#34d399', DEPENDS_ON:'#60a5fa',
                        ELABORATES:'#f9a8d4',  EXEMPLIFIES:'#fcd34d', RELATES_TO:'#445070',
                    };

                    function renderRelCards() {
                        if (!relList) return;
                        relList.innerHTML = relations.length === 0
                            ? '<div style="padding:4px 2px;font-size:10px;color:#445070;">No strong relations detected.</div>'
                            : relations.map((r, i) => {
                                const col    = REL_COLOR[r.rel_type] || '#445070';
                                const chk    = accepted.has(i);
                                const target = existingNodes.find(n => n.node_id === r.target_node_id);
                                const label  = (target?.content || target?.name || r.target_node_id || '').substring(0, 52);
                                return `<div data-rel-idx="${i}" style="display:flex;align-items:flex-start;gap:7px;padding:7px 8px;
                                    background:rgba(255,255,255,0.015);border:1px solid ${chk?col+'44':'#1a2030'};
                                    border-radius:5px;cursor:pointer;">
                                    <div style="margin-top:2px;width:12px;height:12px;border-radius:2px;flex-shrink:0;
                                        border:1px solid ${chk?col:'#2a3550'};background:${chk?col+'33':'transparent'};
                                        display:flex;align-items:center;justify-content:center;font-size:8px;color:${col};">${chk?'✓':''}</div>
                                    <div style="flex:1;min-width:0;">
                                        <div style="display:flex;align-items:center;gap:5px;margin-bottom:2px;">
                                            <span style="font-size:9px;font-weight:700;color:${col};letter-spacing:0.06em;">${r.rel_type}</span>
                                            <span style="font-size:9px;color:#2a3550;">${Math.round((r.confidence??0.75)*100)}%</span>
                                        </div>
                                        <div style="font-size:10px;color:#c8d0e0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${label}</div>
                                        <div style="font-size:9px;color:#8e99b3;margin-top:2px;line-height:1.4;">${r.justification||''}</div>
                                    </div>
                                </div>`;
                            }).join('');

                        relList.querySelectorAll('[data-rel-idx]').forEach(el => {
                            el.onclick = () => {
                                const i = parseInt(el.dataset.relIdx);
                                if (accepted.has(i)) accepted.delete(i); else accepted.add(i);
                                renderRelCards();
                            };
                        });
                    }

                    renderRelCards();
                    if (relDiv) relDiv.style.display = relations.length > 0 ? 'block' : 'none';

                } catch(err) {
                    console.warn('Relation prediction failed:', err);
                    if (relDiv) relDiv.style.display = 'none';
                }
            })();
            
            if (suggestion && suggestion.x !== undefined) {
                // Has position suggestion
                explanationEl.textContent = suggestion.explanation;
                coordsEl.textContent = `x: ${suggestion.x.toFixed(1)} y: ${suggestion.y.toFixed(1)}`;
                
                // Show match confidence if available
                if (suggestion.matches && suggestion.matches.length > 0) {
                    const avgConf = suggestion.matches.reduce((sum, m) => sum + parseInt(m.sim), 0) / suggestion.matches.length;
                    confidenceEl.textContent = `Match quality: ${avgConf.toFixed(0)}%`;
                } else {
                    confidenceEl.textContent = '';
                }
                
                useSuggestionBtn.onclick = () => {
                    xInput.value = suggestion.x.toFixed(1);
                    yInput.value = suggestion.y.toFixed(1);
                    
                    if (!zInput.value) {
                        const absLevel = parseInt(document.getElementById('an-abstraction').value);
                        zInput.value = (absLevel - 3) * 60;
                    }
                    
                    suggestionDiv.style.opacity = '0.7';
                    setTimeout(() => {
                        suggestionDiv.style.display = 'none';
                        suggestionDiv.style.opacity = '1';
                    }, 500);
                    
                    [xInput, yInput].forEach(input => {
                        input.style.background = 'rgba(0,200,160,0.15)';
                        input.style.borderColor = 'var(--concept)';
                        setTimeout(() => {
                            input.style.background = '';
                            input.style.borderColor = '';
                        }, 800);
                    });
                    
                    if (window.clearSuggestedPosition) window.clearSuggestedPosition();
                };
            } else if (suggestion && suggestion.explanation) {
                explanationEl.textContent = suggestion.explanation;
                coordsEl.textContent = 'x: — y: — (manual placement recommended)';
                confidenceEl.textContent = '';
                useSuggestionBtn.style.opacity = '0.5';
                useSuggestionBtn.style.pointerEvents = 'none';
            }
        }, 800);
    });
    
    // Tooltip hover handlers
    explanationEl.addEventListener('mouseenter', (e) => {
        if (currentSuggestion && currentSuggestion.matches && currentSuggestion.matches.length > 0) {
            // Format the detailed match information
            const details = currentSuggestion.matches.map((m, i) => {
                const similarityBar = '█'.repeat(Math.floor(parseInt(m.sim) / 10)) + '░'.repeat(10 - Math.floor(parseInt(m.sim) / 10));
                return `${m.name}\n   ${similarityBar} ${m.sim}% · ${m.type}`;
            }).join('\n\n');
            
            popupEl.textContent = details;
            popupEl.style.display = 'block';
            
            // Position popup near mouse
            const rect = e.target.getBoundingClientRect();
            popupEl.style.left = (rect.right + 20) + 'px';
            popupEl.style.top = (rect.top - 20) + 'px';
        }
    });
    
    explanationEl.addEventListener('mousemove', (e) => {
        // Update popup position to follow mouse
        if (popupEl.style.display === 'block') {
            popupEl.style.left = (e.pageX + 20) + 'px';
            popupEl.style.top = (e.pageY - 100) + 'px';
        }
    });
    
    explanationEl.addEventListener('mouseleave', () => {
        popupEl.style.display = 'none';
    });
    
    // Modal close handlers
    document.getElementById('add-node-close').onclick = () => {
        if (window.clearSuggestedPosition) window.clearSuggestedPosition();
        modal.remove();
    };
    
    document.getElementById('add-node-cancel').onclick = () => {
        if (window.clearSuggestedPosition) window.clearSuggestedPosition();
        modal.remove();
    };
    
    modal.addEventListener('click', e => { 
        if (e.target === modal) {
            if (window.clearSuggestedPosition) window.clearSuggestedPosition();
            modal.remove();
        }
    });

    // Abstraction level slider
    const ABSTRACTION_LABELS = ['', 'Observation', 'Evidence', 'Hypothesis', 'Principle', 'Axiom'];
    const absSlider = document.getElementById('an-abstraction');
    const absVal = document.getElementById('an-abstraction-val');
    
    absSlider.oninput = () => {
        const v = parseInt(absSlider.value);
        absVal.textContent = `${v} — ${ABSTRACTION_LABELS[v]}`;
        
        // Auto-update Z if position fields are empty
        if (!zInput.value) {
            zInput.placeholder = `Auto: ${(v - 3) * 60}`;
        }
    };

    // Submit handler
document.getElementById('add-node-submit').onclick = async () => {
    const content = document.getElementById('an-content').value.trim();
    if (!content) {
        const err = document.getElementById('an-error');
        err.textContent = 'Content is required.';
        err.style.display = 'block';
        return;
    }
    
    const parent_type = document.getElementById('an-type').value;
    const vf = document.getElementById('an-valid-from').value;
    const vt = document.getElementById('an-valid-to').value;
    const xv = document.getElementById('an-x').value;
    const yv = document.getElementById('an-y').value;
    const zv = document.getElementById('an-z').value;
    const abstraction_level = parseInt(document.getElementById('an-abstraction').value);
    const confidence_tier = parseInt(document.getElementById('an-confidence-tier').value);

    const btn = document.getElementById('add-node-submit');
    btn.textContent = 'Creating...';
    btn.disabled = true;

    // Collect accepted relation toggles
    const acceptedRelations = (currentSuggestion?._pendingRels || [])
        .filter((_, i) => currentSuggestion?._relAccepted?.has(i));
    const suggestionWithRels = { ...(currentSuggestion || {}), acceptedRelations };

    const result = await onSubmit({
        content, parent_type,
        valid_from: vf ? parseInt(vf) : null,
        valid_to: vt ? parseInt(vt) : null,
        x: xv !== '' ? parseFloat(xv) : (currentSuggestion?.x ?? null),
        y: yv !== '' ? parseFloat(yv) : (currentSuggestion?.y ?? null),
        z: zv !== '' ? parseFloat(zv) : null,
        abstraction_level,
        confidence_tier,
    }, suggestionWithRels);
    
    if (window.clearSuggestedPosition) window.clearSuggestedPosition();
    modal.remove();
    showFlash(`Node ${result.node_id} created`);
};
 },

showPlacementExplanation(node, suggestionData) {
    // Remove any existing explanation panel
    const existing = document.getElementById('placement-explanation');
    if (existing) existing.remove();
    
    const panel = document.createElement('div');
    panel.id = 'placement-explanation';
    panel.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        width: 360px;
        background: rgba(8,10,16,0.98);
        border: 1px solid var(--concept);
        border-radius: 10px;
        padding: 18px;
        z-index: 1000;
        font-family: 'DM Mono', monospace;
        box-shadow: 0 10px 40px rgba(0,200,160,0.15);
        backdrop-filter: blur(8px);
        animation: slideInRight 0.3s ease-out;
    `;
    
    // Create similarity bars for matches
    const matchDetails = suggestionData.matches ? suggestionData.matches.map(m => {
        const barWidth = parseInt(m.sim);
        const filledBars = Math.floor(barWidth / 10);
        const emptyBars = 10 - filledBars;
        const bar = '█'.repeat(filledBars) + '░'.repeat(emptyBars);
        
        return `
            <div style="margin-bottom: 12px; padding: 8px; background: rgba(255,255,255,0.02); border-radius: 6px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                    <span style="color: #c8d0e0; font-size: 11px;">${m.name}</span>
                    <span style="color: var(--concept); font-size: 10px;">${m.sim}%</span>
                </div>
                <div style="color: #445070; font-family: monospace; font-size: 12px; letter-spacing: 2px;">
                    ${bar}
                </div>
                <div style="color: #445070; font-size: 9px; margin-top: 2px;">${m.type}</div>
            </div>
        `;
    }).join('') : '';
    
    panel.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 14px;">
            <span style="font-size: 16px;">✨</span>
            <span style="color: var(--concept); font-size: 11px; font-weight: 600; letter-spacing: 0.05em; flex:1;">PLACEMENT EXPLANATION</span>
            <button id="close-explanation" style="background:none; border:none; color:#445070; cursor:pointer; font-size:14px;">✕</button>
        </div>
        
        <div style="margin-bottom: 16px; padding: 10px; background: rgba(0,200,160,0.05); border-left: 3px solid var(--concept); border-radius: 4px;">
            <div style="color: #c8d0e0; font-size: 13px; font-weight: 500; margin-bottom: 4px;">${node.content || node.name}</div>
            <div style="color: #8e99b3; font-size: 11px; line-height: 1.6; white-space: pre-wrap;">${suggestionData.explanation}</div>
        </div>
        
        ${matchDetails ? `
            <div style="margin-top: 12px;">
                <div style="color: #445070; font-size: 10px; letter-spacing: 0.05em; margin-bottom: 8px;">MOST SIMILAR CONCEPTS</div>
                ${matchDetails}
            </div>
        ` : ''}
        
        <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid #1e2535; display: flex; gap: 8px; font-size: 10px; color: #445070;">
            <span>📍 Position: ${node.x?.toFixed(1) || '?'}, ${node.y?.toFixed(1) || '?'}, ${node.z?.toFixed(1) || '?'}</span>
        </div>
    `;
    
    document.body.appendChild(panel);
    
    // Add animation keyframes if not present
    if (!document.getElementById('explanation-keyframes')) {
        const style = document.createElement('style');
        style.id = 'explanation-keyframes';
        style.textContent = `
            @keyframes slideInRight {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    // Close button handler
    document.getElementById('close-explanation').onclick = () => panel.remove();
    
    // Auto-dismiss after 15 seconds
    setTimeout(() => {
        if (panel.parentNode) {
            panel.style.animation = 'slideInRight 0.3s reverse';
            setTimeout(() => panel.remove(), 300);
        }
    }, 15000);
},


    // -------------------------
    // Edit Node Modal
    // -------------------------
    renderEditNodeModal(node, onSubmit) {
        const existing = document.getElementById('edit-node-modal');
        if (existing) existing.remove();

        const NODE_TYPES = Object.keys(TYPE_COLORS);
        const currentType = node.parent_type || node.node_type || 'Concept';

        const modal = document.createElement('div');
        modal.id = 'edit-node-modal';
        modal.className = 'creation-modal-overlay';
        modal.innerHTML = `
            <div class="creation-modal">
                <div class="modal-header">
                    <span class="modal-tag">EDIT NODE</span>
                    <span style="font-size:10px;color:#445070;font-family:'DM Mono',monospace;">${node.node_id || ''}</span>
                    <button class="modal-close" id="edit-node-close">&#x2715;</button>
                </div>
                <div class="modal-body">
                    <div class="field-group">
                        <label>Content <span class="req">*</span></label>
                        <textarea id="en-content" rows="4" placeholder="Describe this concept...">${node.content || node.name || ''}</textarea>
                    </div>
                    <div class="field-row">
                        <div class="field-group">
                            <label>Type</label>
                            <select id="en-type">
                                ${NODE_TYPES.map(t => `<option value="${t}" ${t === currentType ? 'selected' : ''}>${t}</option>`).join('')}
                            </select>
                        </div>
                        <div class="field-group">
                            <label>Epoch From <span class="opt">(optional)</span></label>
                            <input type="number" id="en-valid-from" min="1" step="1" value="${node.valid_from != null ? node.valid_from : ''}">
                        </div>
                    </div>
                    <div class="field-group">
                        <label>Epoch To <span class="opt">(optional)</span></label>
                        <input type="number" id="en-valid-to" min="1" step="1" value="${node.valid_to != null ? node.valid_to : ''}">
                    </div>
                    <div id="en-error" class="modal-error" style="display:none"></div>
                </div>
                <div class="modal-footer">
                    <button class="modal-btn-cancel" id="edit-node-cancel">Cancel</button>
                    <button class="modal-btn-confirm" id="edit-node-submit">Save Changes &#x2192;</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        document.getElementById('edit-node-close').onclick  = () => modal.remove();
        document.getElementById('edit-node-cancel').onclick = () => modal.remove();
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

        // Focus textarea so user can start typing immediately
        setTimeout(() => document.getElementById('en-content')?.focus(), 50);

        document.getElementById('edit-node-submit').onclick = async () => {
            const content = document.getElementById('en-content').value.trim();
            if (!content) {
                const err = document.getElementById('en-error');
                err.textContent = 'Content is required.';
                err.style.display = 'block';
                return;
            }
            const btn = document.getElementById('edit-node-submit');
            btn.textContent = 'Saving...';
            btn.disabled = true;

            const vf = document.getElementById('en-valid-from').value;
            const vt = document.getElementById('en-valid-to').value;
            try {
                await onSubmit({
                    content,
                    parent_type: document.getElementById('en-type').value,
                    valid_from: vf ? parseInt(vf) : null,
                    valid_to:   vt ? parseInt(vt) : null,
                });
                modal.remove();
                showFlash('Node updated');
            } catch (err) {
                btn.textContent = 'Save Changes →';
                btn.disabled = false;
                const errEl = document.getElementById('en-error');
                errEl.textContent = 'Save failed — check console.';
                errEl.style.display = 'block';
            }
        };
    },

    // -------------------------
    // Edit Relation Modal
    // -------------------------
    renderEditRelationModal(rel, onSubmit) {
        const existing = document.getElementById('edit-rel-modal');
        if (existing) existing.remove();

        const REL_TYPES      = Object.keys(REL_COLORS).filter(k => !['SUPPORT','CONTRADICT','DEPENDS'].includes(k));
        const EVIDENCE_TYPES = ['theoretical','empirical','anecdotal','simulated','inferred'];
        const SCOPES         = ['institutional','individual','systemic','temporal','cultural'];
        const STATUS_OPTS    = ['CONFIRMED','PROVISIONAL','DISPUTED','DEPRECATED'];

        const curType       = (rel.rel_type || rel.type || 'RELATES_TO').toUpperCase().trim();
        const curStatus     = rel.status || 'CONFIRMED';
        const curWeight     = rel.weight     != null ? rel.weight     : 0.8;
        const curConfidence = rel.confidence != null ? rel.confidence : 0.75;

        const modal = document.createElement('div');
        modal.id = 'edit-rel-modal';
        modal.className = 'creation-modal-overlay';
        modal.innerHTML = `
            <div class="creation-modal creation-modal--wide">
                <div class="modal-header">
                    <span class="modal-tag">EDIT RELATION</span>
                    <button class="modal-close" id="edit-rel-close">&#x2715;</button>
                </div>
                <div class="modal-body">
                    <div class="field-row">
                        <div class="field-group">
                            <label>Relation Type <span class="req">*</span></label>
                            <select id="er-rel-type">
                                ${REL_TYPES.map(t => `<option value="${t}" ${t === curType ? 'selected' : ''}>${t}</option>`).join('')}
                            </select>
                        </div>
                        <div class="field-group">
                            <label>Status</label>
                            <select id="er-status">
                                ${STATUS_OPTS.map(s => `<option value="${s}" ${s === curStatus ? 'selected' : ''}>${s}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="field-group">
                        <label>Justification <span class="opt">(optional)</span></label>
                        <textarea id="er-justification" rows="2">${rel.justification || ''}</textarea>
                    </div>
                    <div class="field-group">
                        <label>Mechanism <span class="opt">(optional)</span></label>
                        <textarea id="er-mechanism" rows="2">${rel.mechanism || ''}</textarea>
                    </div>
                    <div class="field-row">
                        <div class="field-group">
                            <label>Weight</label>
                            <div class="slider-row">
                                <input type="range" id="er-weight" min="0" max="1" step="0.05" value="${curWeight}">
                                <span id="er-weight-val">${parseFloat(curWeight).toFixed(2)}</span>
                            </div>
                        </div>
                        <div class="field-group">
                            <label>Confidence</label>
                            <div class="slider-row">
                                <input type="range" id="er-confidence" min="0" max="1" step="0.05" value="${curConfidence}">
                                <span id="er-confidence-val">${parseFloat(curConfidence).toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                    <div class="field-row">
                        <div class="field-group">
                            <label>Evidence Type <span class="opt">(optional)</span></label>
                            <select id="er-evidence-type">
                                <option value="">&#x2014; none &#x2014;</option>
                                ${EVIDENCE_TYPES.map(t => `<option value="${t}" ${t === rel.evidence_type ? 'selected' : ''}>${t}</option>`).join('')}
                            </select>
                        </div>
                        <div class="field-group">
                            <label>Scope <span class="opt">(optional)</span></label>
                            <select id="er-scope">
                                <option value="">&#x2014; none &#x2014;</option>
                                ${SCOPES.map(s => `<option value="${s}" ${s === rel.scope ? 'selected' : ''}>${s}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="field-row">
                        <div class="field-group">
                            <label>Epoch From <span class="opt">(optional)</span></label>
                            <input type="number" id="er-valid-from" min="1" step="1" value="${rel.valid_from != null ? rel.valid_from : ''}">
                        </div>
                        <div class="field-group">
                            <label>Epoch To <span class="opt">(optional)</span></label>
                            <input type="number" id="er-valid-to" min="1" step="1" value="${rel.valid_to != null ? rel.valid_to : ''}">
                        </div>
                    </div>
                    <div id="er-error" class="modal-error" style="display:none"></div>
                </div>
                <div class="modal-footer">
                    <button class="modal-btn-cancel" id="edit-rel-cancel">Cancel</button>
                    <button class="modal-btn-confirm" id="edit-rel-submit">Save Changes &#x2192;</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const wSlider = document.getElementById('er-weight');
        const wVal    = document.getElementById('er-weight-val');
        wSlider.oninput = () => { wVal.textContent = parseFloat(wSlider.value).toFixed(2); };

        const cSlider = document.getElementById('er-confidence');
        const cVal    = document.getElementById('er-confidence-val');
        cSlider.oninput = () => { cVal.textContent = parseFloat(cSlider.value).toFixed(2); };

        document.getElementById('edit-rel-close').onclick  = () => modal.remove();
        document.getElementById('edit-rel-cancel').onclick = () => modal.remove();
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

        document.getElementById('edit-rel-submit').onclick = async () => {
            const btn = document.getElementById('edit-rel-submit');
            btn.textContent = 'Saving...';
            btn.disabled = true;

            const vf = document.getElementById('er-valid-from').value;
            const vt = document.getElementById('er-valid-to').value;
            await onSubmit({
                rel_type:      document.getElementById('er-rel-type').value,
                status:        document.getElementById('er-status').value,
                justification: document.getElementById('er-justification').value.trim(),
                mechanism:     document.getElementById('er-mechanism').value.trim(),
                weight:        parseFloat(document.getElementById('er-weight').value),
                confidence:    parseFloat(document.getElementById('er-confidence').value),
                evidence_type: document.getElementById('er-evidence-type').value || null,
                scope:         document.getElementById('er-scope').value || null,
                valid_from:    vf ? parseInt(vf) : null,
                valid_to:      vt ? parseInt(vt) : null,
            });
            modal.remove();
            showFlash('Relation updated');
        };
    },

    // -------------------------
    // New Relation Modal
    // -------------------------
    renderRelationModal(sourceNode, targetNode, onSubmit) {
        const existing = document.getElementById('add-rel-modal');
        if (existing) existing.remove();

        const REL_TYPES      = Object.keys(REL_COLORS).filter(k => !['SUPPORT','CONTRADICT','DEPENDS'].includes(k));
        const EVIDENCE_TYPES = ['theoretical','empirical','anecdotal','simulated','inferred'];
        const SCOPES         = ['institutional','individual','systemic','temporal','cultural'];
        const STATUS_OPTS    = ['CONFIRMED','PROVISIONAL','DISPUTED','DEPRECATED'];

        const modal = document.createElement('div');
        modal.id = 'add-rel-modal';
        modal.className = 'creation-modal-overlay';
        modal.innerHTML = `
            <div class="creation-modal creation-modal--wide">
                <div class="modal-header">
                    <span class="modal-tag">NEW RELATION</span>
                    <button class="modal-close" id="add-rel-close">&#x2715;</button>
                </div>
                <div class="relation-nodes-header">
                    <div class="rel-node-chip">${sourceNode.content || sourceNode.name}</div>
                    <div class="rel-arrow">&#x2192;</div>
                    <div class="rel-node-chip">${targetNode.content || targetNode.name}</div>
                </div>
                <div class="modal-body">
                    <div class="field-row">
                        <div class="field-group">
                            <label>Relation Type <span class="req">*</span></label>
                            <select id="ar-rel-type">
                                ${REL_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
                            </select>
                        </div>
                        <div class="field-group">
                            <label>Status</label>
                            <select id="ar-status">
                                ${STATUS_OPTS.map(s => `<option value="${s}" ${s === 'CONFIRMED' ? 'selected' : ''}>${s}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="field-group">
                        <label>Justification <span class="opt">(optional)</span></label>
                        <textarea id="ar-justification" rows="2" placeholder="Why does this relation hold?"></textarea>
                    </div>
                    <div class="field-group">
                        <label>Mechanism <span class="opt">(optional)</span></label>
                        <textarea id="ar-mechanism" rows="2" placeholder="How does this relation work?"></textarea>
                    </div>
                    <div class="field-row">
                        <div class="field-group">
                            <label>Weight</label>
                            <div class="slider-row">
                                <input type="range" id="ar-weight" min="0" max="1" step="0.05" value="0.8">
                                <span id="ar-weight-val">0.80</span>
                            </div>
                        </div>
                        <div class="field-group">
                            <label>Confidence</label>
                            <div class="slider-row">
                                <input type="range" id="ar-confidence" min="0" max="1" step="0.05" value="0.75">
                                <span id="ar-confidence-val">0.75</span>
                            </div>
                        </div>
                    </div>
                    <div class="field-row">
                        <div class="field-group">
                            <label>Evidence Type <span class="opt">(optional)</span></label>
                            <select id="ar-evidence-type">
                                <option value="">&#x2014; none &#x2014;</option>
                                ${EVIDENCE_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
                            </select>
                        </div>
                        <div class="field-group">
                            <label>Scope <span class="opt">(optional)</span></label>
                            <select id="ar-scope">
                                <option value="">&#x2014; none &#x2014;</option>
                                ${SCOPES.map(s => `<option value="${s}">${s}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="field-row">
                        <div class="field-group">
                            <label>Epoch From <span class="opt">(optional)</span></label>
                            <input type="number" id="ar-valid-from" min="1" step="1" placeholder="e.g. 1">
                        </div>
                        <div class="field-group">
                            <label>Epoch To <span class="opt">(optional)</span></label>
                            <input type="number" id="ar-valid-to" min="1" step="1" placeholder="e.g. 3">
                        </div>
                    </div>
                    <div id="ar-error" class="modal-error" style="display:none"></div>
                </div>
                <div class="modal-footer">
                    <button class="modal-btn-cancel" id="add-rel-cancel">Cancel</button>
                    <button class="modal-btn-confirm" id="add-rel-submit">Create Relation &#x2192;</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const wSlider = document.getElementById('ar-weight');
        const wVal    = document.getElementById('ar-weight-val');
        wSlider.oninput = () => { wVal.textContent = parseFloat(wSlider.value).toFixed(2); };

        const cSlider = document.getElementById('ar-confidence');
        const cVal    = document.getElementById('ar-confidence-val');
        cSlider.oninput = () => { cVal.textContent = parseFloat(cSlider.value).toFixed(2); };

        document.getElementById('add-rel-close').onclick  = () => modal.remove();
        document.getElementById('add-rel-cancel').onclick = () => modal.remove();
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

        const REL_COLORS_LOCAL = {
            SUPPORTS:'#00c8a0', CONTRADICTS:'#ff5a5a', HAS_VERSION:'#8896b8',
            TRIGGERS:'#e85090', AMPLIFIES:'#ffa500',   DEPENDS_ON:'#6622aa',
            REQUIRES:'#6622aa', RELATES_TO:'#8896b8'
        };

        document.getElementById('add-rel-submit').onclick = async () => {
            const rel_type = document.getElementById('ar-rel-type').value;
            const btn = document.getElementById('add-rel-submit');
            btn.textContent = 'Creating...';
            btn.disabled = true;

            const vf = document.getElementById('ar-valid-from').value;
            const vt = document.getElementById('ar-valid-to').value;
            await onSubmit({
                node_a:        sourceNode.id,
                node_b:        targetNode.id,
                rel_type,
                color:         REL_COLORS_LOCAL[rel_type] || '#445070',
                status:        document.getElementById('ar-status').value,
                justification: document.getElementById('ar-justification').value.trim(),
                mechanism:     document.getElementById('ar-mechanism').value.trim(),
                weight:        parseFloat(document.getElementById('ar-weight').value),
                confidence:    parseFloat(document.getElementById('ar-confidence').value),
                evidence_type: document.getElementById('ar-evidence-type').value || null,
                scope:         document.getElementById('ar-scope').value || null,
                valid_from:    vf ? parseInt(vf) : null,
                valid_to:      vt ? parseInt(vt) : null,
            });
            modal.remove();
            showFlash(`Relation ${rel_type} created`);
        };
    },

    // -------------------------
    // Relation Inspector
    // -------------------------
    renderRelationInspector(link, sourceNode, targetNode, onDelete) {
        const existing = document.getElementById('relation-inspector');
        if (existing) existing.remove();

        const relType   = (link.rel_type || link.type || '').toUpperCase().trim();
        const relColor  = resolveRelColor(relType);
        const srcName   = sourceNode?.content || sourceNode?.name || '?';
        const tgtName   = targetNode?.content || targetNode?.name || '?';

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
                    </div>
                `).join('')}
            </div>` : `<div style="color:#445070;font-size:11px;font-family:'DM Mono',monospace;margin-bottom:16px;">No metadata</div>`}
            <div style="display:flex;gap:8px;">
                <button id="rel-insp-edit" style="flex:1;padding:9px;border-radius:6px;background:rgba(0,200,160,0.07);border:1px solid rgba(0,200,160,0.3);color:var(--concept);cursor:pointer;font-family:'DM Mono',monospace;font-size:11px;letter-spacing:0.05em;">Edit &#x270E;</button>
                <button id="rel-insp-delete" style="flex:1;padding:9px;border-radius:6px;background:rgba(255,90,90,0.05);border:1px solid rgba(255,90,90,0.25);color:rgba(255,90,90,0.6);cursor:pointer;font-family:'DM Mono',monospace;font-size:11px;letter-spacing:0.05em;">Delete</button>
            </div>
        `;

        document.body.appendChild(panel);

        document.getElementById('rel-insp-close').onclick = () => panel.remove();

        document.getElementById('rel-insp-edit').onclick = () => {
            panel.remove();
            UI.renderEditRelationModal(link, async (updates) => {
                await fetch(`/api/links/${link.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updates),
                });
                window.dispatch('REFRESH');
            });
        };

        const deleteBtn = document.getElementById('rel-insp-delete');
        deleteBtn.onmouseenter = () => {
            deleteBtn.style.background = 'rgba(255,90,90,0.12)';
            deleteBtn.style.color = '#ff5a5a';
            deleteBtn.style.borderColor = '#ff5a5a';
        };
        deleteBtn.onmouseleave = () => {
            deleteBtn.style.background = 'rgba(255,90,90,0.05)';
            deleteBtn.style.color = 'rgba(255,90,90,0.6)';
            deleteBtn.style.borderColor = 'rgba(255,90,90,0.25)';
        };
        deleteBtn.onclick = () => {
            deleteBtn.textContent = 'Confirm delete?';
            deleteBtn.style.background = 'rgba(255,90,90,0.2)';
            deleteBtn.style.color = '#ff5a5a';
            deleteBtn.style.borderColor = '#ff5a5a';
            deleteBtn.onmouseenter = null;
            deleteBtn.onmouseleave = null;
            deleteBtn.onclick = () => onDelete(link.id);
        };
    },

    // -------------------------
    // AI Challenge Panel
    // -------------------------
    async renderAIChallenge(node) {
        const existing = document.getElementById('ai-challenge-panel');
        if (existing) existing.remove();

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
            </div>
        `;

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
                    body: JSON.stringify({
                        content:     node.content || node.name,
                        parent_type: node.parent_type || node.node_type || 'Concept',
                    }),
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
    },

    // -------------------------
    // Node Inspector
    // -------------------------
    renderNodeInspector(node, neighbors, onNodeClick) {
        const el = document.getElementById('node-inspector');

        el.innerHTML = `
            <div class="insp-header">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
                    <h2 style="color:white;margin:0;flex:1;font-size:15px;line-height:1.4;">${node.content || node.name}</h2>
                    <div style="display:flex;gap:6px;flex-shrink:0;">
                        <button onclick="window.__editNode()" style="background:rgba(0,200,160,0.08);border:1px solid rgba(0,200,160,0.3);color:var(--concept);border-radius:5px;padding:4px 10px;font-size:11px;cursor:pointer;white-space:nowrap;font-family:'DM Mono',monospace;">Edit &#x270E;</button>
                        <button onclick="document.getElementById('node-inspector').style.display='none'" style="background:none;border:none;color:#445070;font-size:14px;cursor:pointer;padding:2px 6px;border-radius:4px;">&#x2715;</button>
                    </div>
                </div>
                <span class="code-badge">${node.node_id || ''}</span>
                <div style="font-size:10px;color:#445070;margin-top:4px;font-family:'DM Mono',monospace;">
                    x:${node.x != null ? node.x.toFixed(1) : '—'} y:${node.y != null ? node.y.toFixed(1) : '—'} z:${node.z != null ? node.z.toFixed(1) : '—'}
                </div>
                <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);">
                    <div style="font-size:10px;color:#445070;font-family:'DM Mono',monospace;letter-spacing:0.08em;margin-bottom:6px;">
                        ABSTRACTION — <span style="color:${(node.abstraction_level||3) >= 4 ? '#ffa500' : (node.abstraction_level||3) <= 2 ? '#4488ff' : '#8896b8'}">L${node.abstraction_level||3} ${{1:'Observation',2:'Evidence',3:'Hypothesis',4:'Principle',5:'Axiom'}[node.abstraction_level||3]}</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <input type="range" id="insp-abstraction" min="1" max="5" step="1" value="${node.abstraction_level||3}" style="flex:1;accent-color:var(--concept);cursor:pointer;">
                        <span id="insp-abstraction-val" style="font-size:10px;color:var(--concept);width:14px;text-align:right;font-family:'DM Mono',monospace;">${node.abstraction_level||3}</span>
                        <button id="insp-abstraction-save" style="background:rgba(0,200,160,0.08);border:1px solid rgba(0,200,160,0.3);color:var(--concept);border-radius:4px;padding:3px 10px;font-size:10px;cursor:pointer;font-family:'DM Mono',monospace;white-space:nowrap;">Save Z</button>
                    </div>
                </div>
            </div>

            <div class="neighbor-list">
                ${neighbors.length === 0
                    ? `<div style="color:#445070;font-size:12px;font-family:'DM Mono',monospace;padding:8px 0;">No relations</div>`
                    : neighbors.map((nb, i) => `
                        <div class="neighbor-card">
                            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                                <div onclick="window.__viewRelation(${i})" style="color:${resolveRelColor(nb.rel_type)};font-size:10px;font-weight:600;letter-spacing:0.05em;cursor:pointer;padding:2px 4px 2px 0;">
                                    ${nb.rel_type || '—'} <span style="opacity:0.4;font-size:9px;">&#x25B6;</span>
                                </div>
                                ${nb.rel_id ? `<button onclick="window.__deleteRelation('${nb.rel_id}', '${(nb.name || '').replace(/'/g, '\\&#39;')}')" style="background:none;border:1px solid rgba(255,90,90,0.25);color:rgba(255,90,90,0.5);border-radius:4px;padding:2px 7px;font-size:10px;cursor:pointer;font-family:'DM Mono',monospace;">&#x2715;</button>` : ''}
                            </div>
                            <div onclick="window.__inspectNode('${nb.code}')" style="cursor:pointer;font-weight:bold;color:#c8d0e0;">${nb.name}</div>
                            ${nb.justification ? `<div style="font-size:11px;margin-top:4px;color:#8e99b3;">${nb.justification}</div>` : ''}
                        </div>
                    `).join('')}
            </div>

            <div style="display:flex;gap:8px;margin-top:12px;">
                <button class="ai-btn" onclick="window.dispatch('AI_CHALLENGE', '${node.id || node.node_id}')">&#x26A1; Challenge</button>
                <button id="btn-propose-relations" class="ai-btn" style="color:#00c8a0;border-color:rgba(0,200,160,0.3);">Propose</button>
                <button class="delete-btn" onclick="window.__confirmDelete()">Delete Node</button>
            </div>
        `;

        el.style.display = 'block';

        // Abstraction level slider
        const absSliderInsp = document.getElementById('insp-abstraction');
        const absValInsp    = document.getElementById('insp-abstraction-val');
        if (absSliderInsp) {
            const LEVEL_NAMES = {1:'Obs',2:'Evidence',3:'Hypothesis',4:'Principle',5:'Axiom'};
            absSliderInsp.oninput = () => {
                const v = absSliderInsp.value;
                absValInsp.textContent = v;
            };
            document.getElementById('insp-abstraction-save').onclick = async () => {
                const level = parseInt(absSliderInsp.value);
                const newZ  = (level - 3) * 60; // L1=-120, L2=-60, L3=0, L4=60, L5=120
                await fetch(`/api/nodes/${node.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ abstraction_level: level }),
                });
                node.abstraction_level = level;
                node.z = newZ;
                window.dispatch('MOVE_NODE_Z', { id: node.id, z: newZ, level });
                showFlash(`L${level} → Z ${newZ > 0 ? '+' : ''}${newZ}`);
            };
        }

        window.__inspectNode = (code) => {
            const nb = neighbors.find(n => n.code === code);
            if (nb) onNodeClick(nb);
        };

        window.__viewRelation = (idx) => {
            const nb = neighbors[idx];
            if (!nb) return;
            UI.renderRelationInspector(
                {
                    id: nb.rel_id || null,
                    rel_type: nb.rel_type, type: nb.rel_type,
                    justification: nb.justification, mechanism: nb.mechanism,
                    weight: nb.weight, confidence: nb.confidence,
                    evidence_type: nb.evidence_type, scope: nb.scope,
                    status: nb.status, valid_from: nb.valid_from, valid_to: nb.valid_to,
                    source: { id: node.id }, target: { id: nb.id },
                },
                node,
                { content: nb.name, name: nb.name, id: nb.id },
                async (relId) => {
                    if (!relId) return;
                    await fetch(`/api/links/${relId}`, { method: 'DELETE' });
                    document.getElementById('relation-inspector')?.remove();
                    window.dispatch('REFRESH');
                    showFlash('Relation deleted', true);
                }
            );
        };

        window.__editNode = () => {
            UI.renderEditNodeModal(node, async (updates) => {
                await fetch(`/api/nodes/${node.id || node.node_id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updates),
                });
                window.dispatch('REFRESH');
            });
        };

        window.__deleteRelation = (relId, relName) => {
            const prev = document.getElementById('delete-rel-modal');
            if (prev) prev.remove();

            const modal = document.createElement('div');
            modal.id = 'delete-rel-modal';
            modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';
            modal.innerHTML = `
                <div style="background:#0a0c12;border:1px solid #ff5a5a;border-radius:12px;padding:28px 32px;max-width:360px;width:90%;font-family:'Syne',sans-serif;">
                    <div style="color:#ff5a5a;font-size:11px;letter-spacing:0.1em;margin-bottom:10px;">CONFIRM DELETE RELATION</div>
                    <div style="color:#8e99b3;font-size:12px;margin-bottom:24px;line-height:1.6;">Delete relation to <strong style="color:white">${relName}</strong>? This cannot be undone.</div>
                    <div style="display:flex;gap:10px;">
                        <button id="del-rel-cancel" style="flex:1;padding:10px;border-radius:6px;background:transparent;border:1px solid #161b29;color:#8e99b3;cursor:pointer;font-family:inherit;font-size:13px;">Cancel</button>
                        <button id="del-rel-confirm" style="flex:1;padding:10px;border-radius:6px;background:#ff5a5a22;border:1px solid #ff5a5a;color:#ff5a5a;cursor:pointer;font-family:inherit;font-size:13px;font-weight:600;">Delete</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            document.getElementById('del-rel-cancel').onclick = () => modal.remove();
            document.getElementById('del-rel-confirm').onclick = async () => {
                modal.remove();
                await fetch(`/api/links/${relId}`, { method: 'DELETE' });
                window.dispatch('REFRESH');
                showFlash('Relation deleted', true);
            };
            modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
        };

        window.__confirmDelete = () => {
            const prev = document.getElementById('delete-confirm-modal');
            if (prev) prev.remove();

            const nodeId   = node.id || node.node_id;
            const nodeName = node.content || node.name || 'this node';

            const modal = document.createElement('div');
            modal.id = 'delete-confirm-modal';
            modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';
            modal.innerHTML = `
                <div style="background:#0a0c12;border:1px solid #ff5a5a;border-radius:12px;padding:28px 32px;max-width:380px;width:90%;font-family:'Syne',sans-serif;">
                    <div style="color:#ff5a5a;font-size:11px;letter-spacing:0.1em;margin-bottom:10px;">CONFIRM DELETE</div>
                    <div style="color:white;font-weight:700;font-size:15px;margin-bottom:8px;">${nodeName}</div>
                    <div style="color:#8e99b3;font-size:12px;margin-bottom:24px;line-height:1.6;">This will permanently delete this node and <strong style="color:white">all its relations</strong>. This cannot be undone.</div>
                    <div style="display:flex;gap:10px;">
                        <button id="modal-cancel-btn" style="flex:1;padding:10px;border-radius:6px;background:transparent;border:1px solid #161b29;color:#8e99b3;cursor:pointer;font-family:inherit;font-size:13px;">Cancel</button>
                        <button id="modal-confirm-btn" style="flex:1;padding:10px;border-radius:6px;background:#ff5a5a22;border:1px solid #ff5a5a;color:#ff5a5a;cursor:pointer;font-family:inherit;font-size:13px;font-weight:600;">Delete Node</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            document.getElementById('modal-cancel-btn').onclick = () => modal.remove();
            document.getElementById('modal-confirm-btn').onclick = () => {
                modal.remove();
                window.dispatch('DELETE_NODE', nodeId);
            };
            modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
        };
    },

    // -------------------------
    // Epistemic Log Prompt
    // -------------------------
    renderEpistemicLogPrompt(node, onSave) {
        const existing = document.getElementById('epistemic-log-prompt');
        if (existing) existing.remove();

        const prompt = document.createElement('div');
        prompt.id = 'epistemic-log-prompt';
        prompt.style.cssText = `
            position: fixed;
            bottom: 110px;
            left: 50%;
            transform: translateX(-50%);
            width: 480px;
            background: rgba(8,10,16,0.97);
            border: 1px solid rgba(0,200,160,0.35);
            border-radius: 10px;
            padding: 16px 20px;
            z-index: 500;
            font-family: 'DM Mono', monospace;
            box-shadow: 0 0 40px rgba(0,200,160,0.08);
        `;
        prompt.innerHTML = `
            <div style="font-size:10px;letter-spacing:0.12em;color:var(--concept);margin-bottom:8px;">EPISTEMIC LOG</div>
            <div style="font-size:12px;color:#8e99b3;margin-bottom:10px;">Why did you place <strong style="color:#c8d0e0">${(node.content||node.name||'').slice(0,40)}</strong> here?</div>
            <textarea id="elog-note" rows="2" placeholder="e.g. This contradicts the assumption in Chapter 3, placing it in the tension layer…" style="width:100%;box-sizing:border-box;background:#0c0e16;border:1px solid #1e2535;border-radius:6px;color:#c8d0e0;font-family:'DM Mono',monospace;font-size:12px;padding:8px 10px;resize:none;outline:none;"></textarea>
            <div style="display:flex;gap:8px;margin-top:10px;">
                <button id="elog-skip" style="flex:1;padding:7px;border-radius:6px;background:transparent;border:1px solid #1e2535;color:#445070;cursor:pointer;font-family:'DM Mono',monospace;font-size:11px;">Skip</button>
                <button id="elog-save" style="flex:2;padding:7px;border-radius:6px;background:rgba(0,200,160,0.08);border:1px solid rgba(0,200,160,0.4);color:var(--concept);cursor:pointer;font-family:'DM Mono',monospace;font-size:11px;font-weight:600;">Save Note &#x2192;</button>
            </div>
        `;

        document.body.appendChild(prompt);

        // Auto-focus textarea
        setTimeout(() => prompt.querySelector('#elog-note')?.focus(), 50);

        const dismiss = () => prompt.remove();

        document.getElementById('elog-skip').onclick = dismiss;
        document.getElementById('elog-save').onclick = () => {
            const note = document.getElementById('elog-note').value.trim();
            dismiss();
            if (note) onSave(note);
        };

        // Auto-dismiss after 12s if ignored
        setTimeout(dismiss, 12000);
    },

    // -------------------------
    // AI Analyze Panel — Map Extractor
    // -------------------------
    renderAIAnalyzePanel(existingNodes, onSubmit) {
        const existing = document.getElementById('ai-analyze-panel');
        if (existing) existing.remove();

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
                        Embeddings are stored in Neo4j to power future positioning.
                    </div>
                    <div class="field-group">
                        <label>Text to extract from <span class="req">*</span></label>
                        <textarea id="aap-text" rows="6" placeholder="Paste notes, a hypothesis, a quote, or any passage…"></textarea>
                    </div>

                    <!-- Progress / result area -->
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
            </div>
        `;

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
            btn.textContent = 'Extracting…';
            btn.disabled = true;
            document.getElementById('aap-error').style.display = 'none';
            document.getElementById('aap-fragments').style.display = 'none';

            const progress = document.getElementById('aap-progress');
            progress.style.display = 'block';
            document.getElementById('aap-steps').innerHTML = '';

            setStep('extract', 'Sending text to Map Extractor…');

            try {
                // Call backend Map Extractor endpoint
                setStep('extract', 'Sending text to Map Extractor…');
                const res = await fetch('/api/ai/analyze', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text,
                        existing_node_ids: existingNodes.map(n => n.node_id).filter(Boolean),
                    }),
                });
                if (!res.ok) {
                    const e = await res.json();
                    throw new Error(e.detail || 'API error');
                }
                const result = await res.json();
                setStep('extract', 'Map Extractor complete — 3 fragments extracted', true);

                // Render fragment cards
                const fragsEl = document.getElementById('aap-fragments');
                fragsEl.innerHTML = '';
                fragsEl.style.display = 'flex';

                const fragments = result.fragments || {};
                const activeFrags = {}; // key → checked bool

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
                        </div>
                    `).join('');

                    const pos = frag.position || {};
                    const card = document.createElement('div');
                    card.dataset.fragKey = key;
                    card.style.cssText = `
                        background:rgba(255,255,255,0.02);
                        border:1px solid ${meta.color}44;
                        border-radius:8px;
                        padding:12px 14px;
                        font-family:'DM Mono',monospace;
                        cursor:pointer;
                        transition:border-color 0.15s;
                    `;
                    card.innerHTML = `
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                            <div style="display:flex;align-items:center;gap:6px;">
                                <span style="color:${meta.color};font-size:14px;">${meta.icon}</span>
                                <span style="color:${meta.color};font-size:10px;letter-spacing:0.1em;">${meta.label}</span>
                            </div>
                            <div style="display:flex;align-items:center;gap:8px;">
                                <span style="font-size:9px;color:#445070;">
                                    x:${pos.x ?? '?'} y:${pos.y ?? '?'} z:${pos.z ?? '?'}
                                </span>
                                <div class="frag-checkbox" data-key="${key}"
                                    style="width:16px;height:16px;border-radius:4px;border:1px solid ${meta.color};background:${meta.color}33;display:flex;align-items:center;justify-content:center;color:${meta.color};font-size:11px;">✓</div>
                            </div>
                        </div>
                        <div style="color:#c8d0e0;font-size:12px;line-height:1.6;margin-bottom:${relRows ? '8px' : '0'};">
                            ${frag.content}
                        </div>
                        ${relRows ? `<div style="margin-top:4px;">${relRows}</div>` : ''}
                    `;

                    // Toggle selection
                    card.querySelector('.frag-checkbox').addEventListener('click', (e) => {
                        e.stopPropagation();
                        activeFrags[key] = !activeFrags[key];
                        const cb = card.querySelector('.frag-checkbox');
                        if (activeFrags[key]) {
                            cb.style.background = `${meta.color}33`;
                            cb.style.border = `1px solid ${meta.color}`;
                            cb.innerHTML = '✓';
                            card.style.borderColor = `${meta.color}44`;
                        } else {
                            cb.style.background = 'transparent';
                            cb.style.border = '1px solid #1e2535';
                            cb.innerHTML = '';
                            card.style.borderColor = '#1e2535';
                        }
                    });

                    fragsEl.appendChild(card);
                }

                progress.style.display = 'none';

                // Update footer button
                btn.innerHTML = 'Place Selected Nodes &#x2192;';
                btn.disabled = false;
                btn.onclick = () => {
                    const selected = Object.entries(activeFrags)
                        .filter(([, v]) => v)
                        .map(([k]) => ({ key: k, ...fragments[k] }))
                        .filter(f => f.content);

                    if (selected.length === 0) {
                        const err = document.getElementById('aap-error');
                        err.textContent = 'Select at least one fragment to place.';
                        err.style.display = 'block';
                        return;
                    }

                    panel.remove();
                    // onSubmit receives array of fragments to place
                    onSubmit(selected, result);
                };

            } catch (err) {
                progress.style.display = 'none';
                const errEl = document.getElementById('aap-error');
                errEl.textContent = `Error: ${err.message}`;
                errEl.style.display = 'block';
                btn.textContent = 'Extract & Place ✨';
                btn.disabled = false;
            }
        };
    },

    // -------------------------
    // AI Suggestion Panel (after node placed)
    // -------------------------
    renderAISuggestionPanel(newNode, analysisResult, allNodes, onConfirm) {
        const existing = document.getElementById('ai-suggestion-panel');
        if (existing) existing.remove();

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
            position: fixed;
            top: 20px;
            left: 220px;
            width: 300px;
            background: rgba(8,10,16,0.97);
            border: 1px solid rgba(0,200,160,0.3);
            border-radius: 10px;
            padding: 16px 18px;
            z-index: 300;
            font-family: 'DM Mono', monospace;
            box-shadow: 0 0 40px rgba(0,200,160,0.06);
        `;

        const accepted = new Set(suggestions.map((_, i) => i));

        const render = () => {
            panel.innerHTML = `
                <div style="font-size:10px;letter-spacing:0.12em;color:var(--concept);margin-bottom:10px;">&#x2728; SUGGESTED RELATIONS</div>
                <div style="font-size:11px;color:#8e99b3;margin-bottom:12px;line-height:1.5;">
                    <strong style="color:#c8d0e0">${(newNode.content||'').slice(0,40)}</strong> has been placed on the periphery. Accept or reject suggested connections:
                </div>
                ${suggestions.length === 0
                    ? `<div style="color:#445070;font-size:11px;margin-bottom:12px;">No relation suggestions for existing nodes.</div>`
                    : suggestions.map((sr, i) => `
                        <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;padding:8px;background:rgba(255,255,255,0.02);border:1px solid ${accepted.has(i) ? 'rgba(0,200,160,0.25)' : '#1e2535'};border-radius:6px;cursor:pointer;" data-idx="${i}">
                            <div style="margin-top:1px;width:14px;height:14px;border-radius:3px;border:1px solid ${accepted.has(i) ? 'var(--concept)' : '#445070'};background:${accepted.has(i) ? 'rgba(0,200,160,0.2)' : 'transparent'};flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--concept);">${accepted.has(i) ? '&#x2713;' : ''}</div>
                            <div style="flex:1;min-width:0;">
                                <div style="font-size:10px;font-weight:600;color:${sr.rel_type === 'CONTRADICTS' ? '#ff5a5a' : 'var(--concept)'};letter-spacing:0.05em;margin-bottom:2px;">${sr.rel_type}</div>
                                <div style="font-size:11px;color:#c8d0e0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${sr.target_name}</div>
                                <div style="font-size:10px;color:#445070;margin-top:2px;line-height:1.4;">${sr.justification}</div>
                            </div>
                        </div>
                    `).join('')}
                <div style="display:flex;gap:8px;margin-top:4px;">
                    <button id="asp-dismiss" style="flex:1;padding:7px;border-radius:6px;background:transparent;border:1px solid #1e2535;color:#445070;cursor:pointer;font-size:11px;">Dismiss</button>
                    <button id="asp-confirm" style="flex:2;padding:7px;border-radius:6px;background:rgba(0,200,160,0.08);border:1px solid rgba(0,200,160,0.4);color:var(--concept);cursor:pointer;font-size:11px;font-weight:600;">Create Selected &#x2192;</button>
                </div>
            `;

            panel.querySelectorAll('[data-idx]').forEach(el => {
                el.onclick = () => {
                    const i = parseInt(el.dataset.idx);
                    if (accepted.has(i)) accepted.delete(i); else accepted.add(i);
                    render();
                };
            });

            panel.querySelector('#asp-dismiss').onclick = () => {
                panel.remove();
                onConfirm([]);
            };
            panel.querySelector('#asp-confirm').onclick = () => {
                panel.remove();
                onConfirm(suggestions.filter((_, i) => accepted.has(i)));
            };
        };

        document.body.appendChild(panel);
        render();
    },

    // -------------------------
    // Settings Panel
    // -------------------------
    renderSettingsPanel(onRefresh) {
        const existing = document.getElementById('settings-panel');
        if (existing) { existing.remove(); return; }

        // Work on copies so cancel discards changes
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
                                    </div>
                                `).join('')}
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
                                    </div>
                                `).join('')}
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
                </div>
            `;

            // Collect current state from inputs before re-render
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

            // Delete buttons
            panel.querySelectorAll('[data-nt-delete]').forEach(btn => {
                btn.onclick = () => {
                    const { nt, rt } = snapshot();
                    delete nt[btn.dataset.ntDelete];
                    nodeTypes = nt; relTypes = rt;
                    render();
                };
            });
            panel.querySelectorAll('[data-rt-delete]').forEach(btn => {
                btn.onclick = () => {
                    const { nt, rt } = snapshot();
                    delete rt[btn.dataset.rtDelete];
                    nodeTypes = nt; relTypes = rt;
                    render();
                };
            });

            // Add buttons
            panel.querySelector('#add-node-type').onclick = () => {
                const { nt, rt } = snapshot();
                let newName = 'NewType';
                let i = 2;
                while (nt[newName]) newName = `NewType${i++}`;
                nt[newName] = '#445070';
                nodeTypes = nt; relTypes = rt;
                render();
            };
            panel.querySelector('#add-rel-type').onclick = () => {
                const { nt, rt } = snapshot();
                let newName = 'NEW_RELATION';
                let i = 2;
                while (rt[newName]) newName = `NEW_RELATION_${i++}`;
                rt[newName] = '#445070';
                nodeTypes = nt; relTypes = rt;
                render();
            };

            // Close / cancel
            panel.querySelector('#settings-close').onclick  = () => panel.remove();
            panel.querySelector('#settings-cancel').onclick = () => panel.remove();
            panel.addEventListener('click', e => { if (e.target === panel) panel.remove(); });

            // Save
            panel.querySelector('#settings-save').onclick = () => {
                const { nt, rt } = snapshot();
                saveTypeColors(nt);
                saveRelColors(rt);
                panel.remove();
                UI.initLegends();
                onRefresh();
                showFlash('Settings saved');
            };
        };

        document.body.appendChild(panel);
        render();
    },

    // -------------------------
    // Legends
    // -------------------------
    initLegends() {
        const nLegend = document.getElementById('node-legend');
        const rLegend = document.getElementById('rel-legend');

        nLegend.innerHTML = Object.entries(TYPE_COLORS).map(([type, color]) => `
            <div class="legend-item"><span class="dot" style="background:${color}"></span> ${type}</div>
        `).join('');

        const seen = new Set();
        rLegend.innerHTML = Object.entries(REL_COLORS)
            .filter(([type]) => {
                const base = type.replace(/S$/, '');
                if (seen.has(base)) return false;
                seen.add(base);
                return true;
            })
            .map(([type, color]) => `
                <div class="legend-item"><span class="dot" style="background:${color}"></span> ${type.toLowerCase()}</div>
            `).join('');
    },

    // ─────────────────────────────────────────────────────────────
    // Discussion Node Modal
    // Called after the user has finished picking members in selection
    // mode. `selectedNodes` is an array of full node objects.
    // `onSubmit(title, memberIds)` → async, returns the new node.
    // ─────────────────────────────────────────────────────────────
    renderDiscussionNodeModal(selectedNodes, onSubmit) {
        const existing = document.getElementById('discussion-node-modal');
        if (existing) existing.remove();

        // Build the member chips HTML
        const memberChips = () => selectedNodes.map((n, i) => `
            <div id="disc-chip-${i}" style="
                display:inline-flex; align-items:center; gap:6px;
                background:rgba(232,80,144,0.07); border:1px solid rgba(232,80,144,0.25);
                border-radius:6px; padding:5px 10px; font-size:11px; color:#e85090;
                font-family:'DM Mono',monospace; margin:3px;
            ">
                <span style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
                    title="${(n.content || n.name || '').replace(/"/g,'&quot;')}">
                    ${(n.content || n.name || 'Unnamed').slice(0, 40)}
                </span>
                <button data-disc-remove="${i}" style="
                    background:none; border:none; color:rgba(232,80,144,0.5);
                    cursor:pointer; font-size:12px; padding:0; line-height:1;
                    transition:color 0.15s;
                " title="Remove from discussion">&#x2715;</button>
            </div>
        `).join('');

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

                    <!-- Title field -->
                    <div class="field-group">
                        <label>Discussion Title <span class="req">*</span></label>
                        <input type="text" id="disc-title"
                            placeholder="What is this discussion about?"
                            style="font-size:13px;">
                    </div>

                    <!-- Description (optional context) -->
                    <div class="field-group">
                        <label>Context <span class="opt">(optional — frames the discussion)</span></label>
                        <textarea id="disc-context" rows="2"
                            placeholder="What question, tension, or problem does this discussion address?"></textarea>
                    </div>

                    <!-- Member nodes -->
                    <div class="field-group">
                        <label style="display:flex;align-items:center;justify-content:space-between;">
                            <span>Member Nodes <span class="req">*</span>
                                <span style="color:#445070;font-size:9px;margin-left:6px;">
                                    (${selectedNodes.length} selected)
                                </span>
                            </span>
                        </label>
                        <div id="disc-member-chips" style="
                            min-height:40px; padding:6px;
                            background:#0c0e16; border:1px solid #1e2535; border-radius:6px;
                            display:flex; flex-wrap:wrap; align-items:flex-start;
                        ">
                            ${memberChips()}
                        </div>
                        <div style="font-size:10px;color:#2a3048;margin-top:4px;font-family:'DM Mono',monospace;">
                            DISCUSSES edges will be created from the discussion node to each member.
                            Members stay in their spatial positions.
                        </div>
                    </div>

                    <!-- Abstraction level -->
                    <div class="field-group">
                        <label>Abstraction Level <span class="opt">(1=observation … 5=axiom)</span></label>
                        <div class="slider-row">
                            <input type="range" id="disc-abstraction" min="1" max="5" step="1" value="3">
                            <span id="disc-abstraction-val" style="color:#e85090;width:90px;font-size:10px;flex-shrink:0;">
                                3 — Hypothesis
                            </span>
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
            </div>
        `;

        document.body.appendChild(modal);

        // ── Abstraction slider ──────────────────────────────────────
        const LEVEL_NAMES = { 1:'Observation', 2:'Evidence', 3:'Hypothesis', 4:'Principle', 5:'Axiom' };
        const absSlider = document.getElementById('disc-abstraction');
        const absVal    = document.getElementById('disc-abstraction-val');
        absSlider.oninput = () => {
            const v = absSlider.value;
            absVal.textContent = `${v} — ${LEVEL_NAMES[v]}`;
        };

        // ── Remove member chip ──────────────────────────────────────
        const chipsEl = document.getElementById('disc-member-chips');
        chipsEl.addEventListener('click', e => {
            const idx = e.target.closest('[data-disc-remove]')?.dataset.discRemove;
            if (idx == null) return;
            selectedNodes.splice(parseInt(idx), 1);
            chipsEl.innerHTML = memberChips();
            // Update count label
            modal.querySelector('span.req + span').textContent =
                `(${selectedNodes.length} selected)`;
        });

        // ── Close / cancel ──────────────────────────────────────────
        const close = () => modal.remove();
        document.getElementById('disc-modal-close').onclick  = close;
        document.getElementById('disc-modal-cancel').onclick = close;
        modal.addEventListener('click', e => { if (e.target === modal) close(); });

        // ── Submit ──────────────────────────────────────────────────
        document.getElementById('disc-modal-submit').onclick = async () => {
            const title = document.getElementById('disc-title').value.trim();
            const errEl = document.getElementById('disc-error');

            if (!title) {
                errEl.textContent = 'A discussion title is required.';
                errEl.style.display = 'block';
                document.getElementById('disc-title').focus();
                return;
            }
            if (selectedNodes.length < 2) {
                errEl.textContent = 'A discussion needs at least 2 member nodes.';
                errEl.style.display = 'block';
                return;
            }
            errEl.style.display = 'none';

            const btn = document.getElementById('disc-modal-submit');
            btn.textContent = 'Creating…';
            btn.disabled = true;

            try {
                await onSubmit({
                    title,
                    context:           document.getElementById('disc-context').value.trim(),
                    abstraction_level: parseInt(absSlider.value),
                    memberIds:         selectedNodes.map(n => n.id),
                });
                modal.remove();
            } catch (err) {
                errEl.textContent = `Error: ${err.message}`;
                errEl.style.display = 'block';
                btn.textContent = 'Create Discussion →';
                btn.disabled = false;
            }
        };
    },

    // ─────────────────────────────────────────────────────────────
    // Discussion Selection Mode Banner
    // Shows a persistent bottom banner while the user is picking
    // nodes. `onConfirm(nodes)` / `onCancel()` are callbacks.
    // ─────────────────────────────────────────────────────────────
    showDiscussionSelectionBanner(selectedNodes, onConfirm, onCancel) {
        const existing = document.getElementById('disc-selection-banner');
        if (existing) existing.remove();

        const banner = document.createElement('div');
        banner.id = 'disc-selection-banner';
        banner.style.cssText = `
            position: fixed;
            bottom: 90px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 1000;
            display: flex;
            align-items: center;
            gap: 14px;
            background: rgba(10,12,18,0.95);
            border: 1px solid #e85090;
            border-radius: 10px;
            padding: 12px 20px;
            font-family: 'DM Mono', monospace;
            font-size: 11px;
            box-shadow: 0 0 40px rgba(232,80,144,0.15);
            backdrop-filter: blur(12px);
            pointer-events: auto;
        `;

        const update = () => {
            const count = selectedNodes.length;
            banner.innerHTML = `
                <span style="color:#e85090;letter-spacing:0.1em;font-weight:600;">
                    DISCUSSION MODE
                </span>
                <span style="color:#445070;">—</span>
                <span id="disc-sel-count" style="color:#c8d0e0;">
                    ${count === 0
                        ? 'Click nodes to add members'
                        : `${count} node${count !== 1 ? 's' : ''} selected`}
                </span>
                ${count > 0 ? `
                <div style="display:flex;gap:6px;flex-wrap:wrap;max-width:300px;">
                    ${selectedNodes.slice(0,4).map(n => `
                        <span style="
                            background:rgba(232,80,144,0.08);
                            border:1px solid rgba(232,80,144,0.2);
                            border-radius:4px; padding:2px 8px;
                            color:#e85090; font-size:10px;
                            white-space:nowrap; overflow:hidden;
                            text-overflow:ellipsis; max-width:120px;
                        " title="${(n.content || n.name || '').replace(/"/g,'&quot;')}">
                            ${(n.content || n.name || 'Node').slice(0,20)}
                        </span>
                    `).join('')}
                    ${count > 4 ? `<span style="color:#445070;font-size:10px;align-self:center;">+${count-4} more</span>` : ''}
                </div>` : ''}
                <button id="disc-sel-confirm" style="
                    background: rgba(232,80,144,0.1);
                    border: 1px solid #e85090;
                    color: #e85090;
                    border-radius: 6px;
                    padding: 7px 16px;
                    cursor: ${count >= 2 ? 'pointer' : 'not-allowed'};
                    font-family: 'DM Mono', monospace;
                    font-size: 11px;
                    font-weight: 600;
                    opacity: ${count >= 2 ? '1' : '0.35'};
                    transition: all 0.15s;
                    white-space: nowrap;
                ">Confirm (${count}) &#x2192;</button>
                <button id="disc-sel-cancel" style="
                    background: none;
                    border: 1px solid #1e2535;
                    color: #445070;
                    border-radius: 6px;
                    padding: 7px 12px;
                    cursor: pointer;
                    font-family: 'DM Mono', monospace;
                    font-size: 11px;
                    transition: all 0.15s;
                ">&#x2715; Cancel</button>
            `;

            document.getElementById('disc-sel-confirm').onclick = () => {
                if (selectedNodes.length >= 2) onConfirm([...selectedNodes]);
            };
            document.getElementById('disc-sel-cancel').onclick = () => {
                banner.remove();
                onCancel();
            };
        };

        // Append first so getElementById works inside update()
        document.body.appendChild(banner);
        update();

        // Return an updater so app.js can call it when selection changes
        return update;
    },

    // ─────────────────────────────────────────────────────────────
    // Search
    // ─────────────────────────────────────────────────────────────
    setupSearch(nodes, onSelect) {
        const input   = document.getElementById('node-search');
        const results = document.getElementById('search-results');

        input.oninput = (e) => {
            const val = e.target.value.toLowerCase();
            if (!val) { results.innerHTML = ''; return; }

            const matches = nodes
                .filter(n => (n.content || n.name || '').toLowerCase().includes(val))
                .slice(0, 5);

            results.innerHTML = matches.map(m => `
                <div class="search-item" data-id="${m.id}">${m.content || m.name}</div>
            `).join('');

            results.querySelectorAll('.search-item').forEach(el => {
                el.onclick = () => {
                    onSelect(el.dataset.id);
                    results.innerHTML = '';
                    input.value = '';
                };
            });
        };
    },
};

window.suggestPositionFromGraph = suggestPositionFromGraph;
window.showGraphAwareExplanation = showGraphAwareExplanation;
window.UI = UI;