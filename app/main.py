from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List
from neo4j.time import DateTime
import uuid as _uuid
import json as _json_mod
import json
import zlib

from .database import driver
from .graph_service import GraphService
from app.engines.relation_engine import RelationEngine
from app.engines.event_engine import EventEngine

def serialize_node(obj):
    """Convert Neo4j types to JSON-serializable types."""
    if isinstance(obj, DateTime):
        return obj.iso_format()  # Convert Neo4j DateTime to ISO string
    if hasattr(obj, 'isoformat'):  # Python datetime
        return obj.isoformat()
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")

app = FastAPI(title="Epistemic Engine API")

app.mount("/static", StaticFiles(directory="static"), name="static")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
def shutdown_db_client():
    driver.close()

class GraphAwarePlacementRequest(BaseModel):
    content: str
    parent_type: str
    node_id: Optional[str] = None
    existing_nodes: List[dict]
    existing_relations: List[dict]

@app.post("/api/placement/analyze-graph")
async def analyze_graph_for_placement(data: GraphAwarePlacementRequest):
    """Use Gemini to understand the entire graph and suggest optimal placement."""
    try:
        # Build a much richer graph description WITHOUT using graph_summary
        graph_description = []
        
        # Calculate graph statistics from the data we have
        node_types = {}
        relation_types = {}
        
        for node in data.existing_nodes:
            n_type = node.get('parent_type', node.get('node_type', 'Concept'))
            node_types[n_type] = node_types.get(n_type, 0) + 1
        
        for rel in data.existing_relations:
            r_type = rel.get('rel_type', rel.get('type', 'RELATES_TO'))
            relation_types[r_type] = relation_types.get(r_type, 0) + 1
        
        # First, describe the graph structure using calculated stats
        graph_description.append(f"GRAPH OVERVIEW:")
        graph_description.append(f"- Total nodes: {len(data.existing_nodes)}")
        graph_description.append(f"- Total relations: {len(data.existing_relations)}")
        graph_description.append(f"- Node types: {node_types}")
        graph_description.append(f"- Relation types: {relation_types}")
        graph_description.append("")
        
        # Then describe each node in detail
        graph_description.append(f"DETAILED NODES (showing {len(data.existing_nodes)} most relevant):")
        for node in data.existing_nodes:
            # Build relation maps for this node
            node_id = node.get('node_id') or node.get('id', '?')
            outgoing = []
            incoming = []
            
            # Find relations for this node from the existing_relations list
            for rel in data.existing_relations:
                source = rel.get('source') or rel.get('source_id') or rel.get('node_a')
                target = rel.get('target') or rel.get('target_id') or rel.get('node_b')
                rel_type = rel.get('rel_type') or rel.get('type', 'RELATES_TO')
                
                if source == node_id:
                    outgoing.append(f"{rel_type}→{target}")
                if target == node_id:
                    incoming.append(f"{source}→{rel_type}")
            
            node_desc = [
                f"\nNode: {node_id}",
                f"Content: {node.get('content', node.get('name', ''))}",
                f"Type: {node.get('parent_type', node.get('node_type', 'Concept'))}",
                f"Abstraction Level: {node.get('abstraction_level', 3)}",
                f"Position: ({node.get('x', 0):.1f}, {node.get('y', 0):.1f}, {node.get('z', 0):.1f})"
            ]
            
            # Add outgoing relations
            if outgoing:
                node_desc.append(f"Outgoing: {', '.join(outgoing[:5])}")
            
            # Add incoming relations
            if incoming:
                node_desc.append(f"Incoming: {', '.join(incoming[:5])}")
            
            graph_description.append("\n".join(node_desc))
        
        graph_context = "\n".join(graph_description)
        
        prompt = f"""You are an expert knowledge graph architect. You need to place a new concept into an existing knowledge graph in a way that reflects its conceptual relationships.

NEW CONCEPT: "{data.content}"
NEW CONCEPT TYPE: {data.parent_type}

EXISTING GRAPH STRUCTURE:
{graph_context}

Analyze the ENTIRE graph structure and the new concept to determine:

1. **CONCEPTUAL ALIGNMENT**: What existing nodes is this most conceptually related to? Look for:
   - Direct thematic connections (similar topics, concepts, or ideas)
   - Hierarchical relationships (is this a specific instance of a broader concept?)
   - Supporting/contradicting relationships (does this support or challenge existing ideas?)
   - Temporal/causal chains (does this follow from or lead to other concepts?)
   - Semantic similarity (even if words differ, is the meaning related?)

2. **POSITION SUGGESTION**: Based on the graph topology, suggest an (x, y) position that:
   - Places the node near conceptually similar nodes (closer for stronger relationships)
   - Respects the existing graph's spatial organization
   - Creates meaningful spatial relationships (e.g., between opposing concepts)
   - Use the existing positions as a guide for what the space means

3. **RELATIONSHIP PREDICTIONS**: What specific relationships should exist between this new node and existing nodes?
   - Be specific about the relationship type
   - Provide a clear justification
   - Include confidence level

Return a JSON object with your analysis:

{{
  "position": {{
    "x": float,
    "y": float,
    "z": float
  }},
  "reasoning": {{
    "primary_influences": [
      {{
        "node_id": "string",
        "influence_weight": float,
        "reason": "string"
      }}
    ],
    "cluster_placement": "string",
    "spatial_rationale": "string"
  }},
  "predicted_relations": [
    {{
      "target_node_id": "string",
      "rel_type": "SUPPORTS|CONTRADICTS|REQUIRES|TRIGGERS|AMPLIFIES|DEPENDS_ON|ELABORATES|EXEMPLIFIES|RELATES_TO",
      "confidence": float,
      "justification": "string"
    }}
  ]
}}

Be thorough in your analysis. Look for subtle connections. If the new concept relates to existing nodes, SAY SO. Don't return empty relations unless truly unrelated."""

        import json
        
        response = _client.models.generate_content(
            model=_CHAT_MODEL,
            contents=prompt,
            config={"temperature": 0.3},
        )
        
        text = response.text.strip()
        text = text.replace("```json", "").replace("```", "").strip()
        
        result = json.loads(text)
        return result
        
    except Exception as e:
        print(f"Graph analysis error: {e}")
        import traceback
        traceback.print_exc()
        return await fallback_placement(data)

async def fallback_placement(data: GraphAwarePlacementRequest):
    """Fallback to embedding-based placement when graph analysis fails."""
    try:
        import math
        import random

        embedding = _embed_text(data.content)

        nodes_with_embeddings = [n for n in data.existing_nodes if n.get('embedding')]

        if not nodes_with_embeddings:
            return {
                "position": {
                    "x": random.uniform(-200, 200),
                    "y": random.uniform(-200, 200),
                    "z": 0
                },
                "reasoning": {
                    "primary_influences": [],
                    "cluster_placement": "random",
                    "spatial_rationale": "No existing nodes with embeddings found. Using random placement."
                },
                "predicted_relations": []
            }

        similarities = sorted(
            [(_cosine_sim(embedding, n['embedding']), n) for n in nodes_with_embeddings],
            key=lambda x: -x[0]
        )
        top_matches = similarities[:5]

        total_weight = 0
        weighted_x = 0
        weighted_y = 0
        for sim, node in top_matches:
            weight = max(sim, 0.3)
            weighted_x += (node.get('x', 0) or 0) * weight
            weighted_y += (node.get('y', 0) or 0) * weight
            total_weight += weight

        position = {
            "x": (weighted_x / total_weight) + random.uniform(-15, 15),
            "y": (weighted_y / total_weight) + random.uniform(-15, 15),
            "z": 0
        }

        avg_sim = sum(sim for sim, _ in top_matches) / len(top_matches)
        top3 = top_matches[:3]

        comparison_lines = "\n".join(
            f"{i+1}. \"{(n.get('content') or n.get('name') or '')[:120]}\" — cosine similarity {sim:.2f}"
            for i, (sim, n) in enumerate(top3)
        )
        explain_prompt = f"""You are analyzing why a new concept is semantically similar to existing knowledge-graph nodes.

New concept: \"{data.content[:200]}\"

Most similar existing nodes (by embedding cosine similarity):
{comparison_lines}

For EACH existing node, write exactly ONE sentence explaining the specific conceptual relationship — 
what shared idea, mechanism, theme, or implication makes them similar. 
Be concrete and specific to the actual content, not generic.
Do NOT say "they are similar" or restate the similarity score.

Respond ONLY with a JSON array of strings, one per node, in the same order:
["reason for node 1", "reason for node 2", "reason for node 3"]"""

        reasons = []
        try:
            explain_resp = _client.models.generate_content(
                model=_CHAT_MODEL,
                contents=explain_prompt,
                config={"temperature": 0.3},
            )
            raw = explain_resp.text.strip().replace("```json", "").replace("```", "").strip()
            reasons = _json_mod.loads(raw)
            if not isinstance(reasons, list):
                reasons = []
        except Exception as ex:
            print(f"⚠️  Gemini reason enrichment failed: {ex}")
            reasons = []

        while len(reasons) < len(top3):
            reasons.append(f"Shares conceptual territory at {top3[len(reasons)][0]:.0%} similarity")

        influences = []
        for i, (sim, node) in enumerate(top3):
            node_label = (node.get('content') or node.get('name') or node.get('node_id') or '')[:60]
            influences.append({
                "node_id": node_label,
                "influence_weight": sim,
                "reason": reasons[i],
            })

        top_label = (top3[0][1].get('content') or top3[0][1].get('name') or '')[:60] if top3 else 'existing nodes'
        spatial_rationale = (
            f"Placed near '{top_label}' and related nodes "
            f"({avg_sim:.0%} average semantic overlap). "
            f"{reasons[0] if reasons else ''}"
        )

        return {
            "position": position,
            "reasoning": {
                "primary_influences": influences,
                "cluster_placement": "embedding + AI reasoning",
                "spatial_rationale": spatial_rationale,
            },
            "predicted_relations": []
        }

    except Exception as e:
        print(f"Fallback placement error: {e}")
        import random
        return {
            "position": {
                "x": random.uniform(-200, 200),
                "y": random.uniform(-200, 200),
                "z": 0
            },
            "reasoning": {
                "primary_influences": [],
                "cluster_placement": "fallback random",
                "spatial_rationale": "Error in analysis. Using random placement."
            },
            "predicted_relations": []
        }

# Helper function for cosine similarity — canonical version is _cosine_sim() below.

# --- MODELS ---



class NodeCreate(BaseModel):
    content: str
    parent_type: str
    graph_id: str = "default"
    valid_from: Optional[int] = None
    valid_to: Optional[int] = None
    x: Optional[float] = None
    y: Optional[float] = None
    z: Optional[float] = None
    abstraction_level: Optional[int] = None  # 1–5: 5=axiom, 3=hypothesis, 1=observation
    confidence_tier: Optional[int] = None    # 0–3: 0=Speculative … 3=Confirmed
    subnodes: Optional[List[dict]] = []
        # Add these new fields:
    shape: Optional[str] = "sphere"      # sphere, cube, octahedron, tetrahedron, cone
    material: Optional[str] = "matte"    # matte, standard, glossy, wireframe
    size: Optional[float] = 5.6          # 3.0 to 12.0
    node_color: Optional[str] = None     # hex color like "#ff6600"

class SubnodeUpdate(BaseModel):
    id: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    strength: Optional[int] = None


class NodeUpdate(BaseModel):
    content: Optional[str] = None
    title: Optional[str] = None  # ← add this
    node_id: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    z: Optional[float] = None
    abstraction_level: Optional[int] = None
    confidence_tier: Optional[int] = None
    placement_note: Optional[str] = None
    subnodes: Optional[List[SubnodeUpdate]] = None
    shape: Optional[str] = None
    material: Optional[str] = None
    size: Optional[float] = None
    node_color: Optional[str] = None

class LinkRequest(BaseModel):
    node_a: str
    node_b: str
    rel_type: str
    justification: str = ""
    mechanism: str = ""
    color: str = "#00c8a0"
    weight: float = 1.0
    confidence: Optional[float] = None
    evidence_type: Optional[str] = None
    scope: Optional[str] = None
    status: str = "CONFIRMED"
    relation_id: Optional[str] = None
    valid_from: Optional[int] = None
    valid_to: Optional[int] = None

# ── Discussion Node model ─────────────────────────────────────────────────
class DiscussionNodeCreate(BaseModel):
    title: str                          # human-readable name / topic
    context: str = ""                   # optional framing text
    member_ids: List[str]               # element IDs of member nodes
    graph_id: str = "default"
    abstraction_level: Optional[int] = 3
    x: Optional[float] = None
    y: Optional[float] = None

# --- READ OPERATIONS ---

@app.get("/")
async def read_root():
    return FileResponse("static/index.html")

@app.get("/graph/3d-json")
def get_graph_data(graph_id: str = "default"):
    data = GraphService.get_3d_data(graph_id=graph_id)
    # GraphService._fetch_3d_data always returns a plain dict; no Pydantic
    # coercion needed. Strip any residual bytes values defensively.
    data["nodes"] = [
        {k: v for k, v in node.items() if not isinstance(v, bytes)}
        for node in (data.get("nodes") or [])
    ]
    return data

@app.get("/api/graphs")
def list_graphs():
    """Return all distinct graph_id values in the DB."""
    with driver.session() as session:
        result = session.run(
            """MATCH (n)
            RETURN DISTINCT coalesce(n.graph_id, 'default') AS graph_id
            ORDER BY graph_id"""
        )
        ids = [r["graph_id"] for r in result]
    return {"graphs": ids}

@app.post("/api/graphs/stamp")
def stamp_existing_nodes(graph_id: str = "default"):
    """Stamp all nodes that have no graph_id. Run once to tag existing data."""
    with driver.session() as session:
        result = session.run(
            """MATCH (n) WHERE n.graph_id IS NULL
            SET n.graph_id = $graph_id
            RETURN count(n) AS stamped""",
            {"graph_id": graph_id}
        )
        stamped = result.single()["stamped"]
    return {"status": "ok", "stamped": stamped, "graph_id": graph_id}

@app.get("/graph/node/{node_id}/neighbors")
def get_node_neighbors(node_id: str):
    query = """
    MATCH (n)-[r:RELATION]-(neighbor)
    WHERE elementId(n) = $node_id
    RETURN neighbor.content AS name,
           neighbor.node_id AS code,
           type(r) AS connection_kind,
           r.relation_type AS rel_type,
           r.justification AS justification,
           r.color AS color,
           elementId(neighbor) AS neighbor_id,
           elementId(r) AS rel_id
    """
    with driver.session() as session:
        result = session.run(query, {"node_id": node_id})
        return [dict(record) for record in result]
class RelationProposalRequest(BaseModel):
    node_id: str
# --- WRITE OPERATIONS ---

@app.post("/api/relations/propose")
def propose_relations(req: RelationProposalRequest):
    try:
        # Lazy import so nothing breaks if engine evolves
        from app.engines.relation_engine import RelationEngine

        proposals = RelationEngine.propose(req.node_id)

        return {
            "proposals": proposals
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

_PREFIX_MAP = {
    "concept": "C", "observation": "O", "method": "M",
    "reference": "R", "draftfragment": "D", "event": "E"
}

@app.post("/api/nodes")
def create_node(data: NodeCreate):
    if not data.content or not data.content.strip():
        raise HTTPException(status_code=422, detail="content is required and cannot be empty")
    import threading

    if data.subnodes:
        original_count = len(data.subnodes)
        data.subnodes = [
            s for s in data.subnodes
            if s and (s.get("title") or s.get("description") or s.get("content"))
        ]
        if not data.subnodes:
            data.subnodes = []
        if original_count != len(data.subnodes):
            print(f"Filtered out {original_count - len(data.subnodes)} empty subnodes")

    prefix = _PREFIX_MAP.get(data.parent_type.lower().replace(" ", ""), "N")

    # Single atomic transaction: Cypher finds the max numeric suffix and creates
    # the node in one round-trip. No Python loop, no separate read query.
    def _create(tx):
        result = tx.run(
            """
            OPTIONAL MATCH (existing:Concept)
            WHERE existing.node_id STARTS WITH $prefix
              AND coalesce(existing.graph_id, 'default') = $graph_id
            WITH coalesce(
                   max(toInteger(split(substring(existing.node_id, $plen), '_')[0])),
                   0
                 ) + 1 AS next_n
            CREATE (n:Concept)
            SET n.content           = $content,
                n.parent_type       = $parent_type,
                n.node_type         = $parent_type,
                n.node_id           = $prefix + toString(next_n) + '_v1',
                n.version_id        = $prefix + toString(next_n) + '_v1',
                n.graph_id          = $graph_id,
                n.valid_from        = $valid_from,
                n.valid_to          = $valid_to,
                n.x                 = $x,
                n.y                 = $y,
                n.z                 = $z,
                n.abstraction_level = $abstraction_level,
                n.confidence_tier   = $confidence_tier,
                n.embedding         = [],
                n.created_at        = datetime(),
                n.shape             = $shape,
                n.material          = $material,
                n.size              = $size,
                n.node_color        = $node_color
            RETURN elementId(n) AS id, n.node_id AS node_id
            """,
            {
                "prefix":            prefix,
                "plen":              len(prefix),
                "graph_id":          data.graph_id,
                "content":           data.content,
                "parent_type":       data.parent_type,
                "valid_from":        data.valid_from,
                "valid_to":          data.valid_to,
                "x":                 data.x,
                "y":                 data.y,
                "z":                 data.z,
                "abstraction_level": data.abstraction_level,
                "confidence_tier":   data.confidence_tier,
                "shape":             data.shape or "sphere",
                "material":          data.material or "matte",
                "size":              data.size or 5.6,
                "node_color":        data.node_color,
            },
        )
        return result.single()

    import uuid as _uuid_mod
    from neo4j.exceptions import ConstraintError

    _base_params = {
        "prefix":            prefix,
        "plen":              len(prefix),
        "graph_id":          data.graph_id,
        "content":           data.content,
        "parent_type":       data.parent_type,
        "valid_from":        data.valid_from,
        "valid_to":          data.valid_to,
        "x":                 data.x,
        "y":                 data.y,
        "z":                 data.z,
        "abstraction_level": data.abstraction_level,
        "confidence_tier":   data.confidence_tier,
        "shape":             data.shape or "sphere",
        "material":          data.material or "matte",
        "size":              data.size or 5.6,
        "node_color":        data.node_color,
    }

    def _create_with_uuid(tx):
        """Fallback: guaranteed-unique UUID-based node_id."""
        result = tx.run(
            """
            CREATE (n:Concept)
            SET n.content           = $content,
                n.parent_type       = $parent_type,
                n.node_type         = $parent_type,
                n.node_id           = $node_id,
                n.version_id        = $node_id,
                n.graph_id          = $graph_id,
                n.valid_from        = $valid_from,
                n.valid_to          = $valid_to,
                n.x                 = $x,
                n.y                 = $y,
                n.z                 = $z,
                n.abstraction_level = $abstraction_level,
                n.confidence_tier   = $confidence_tier,
                n.embedding         = [],
                n.created_at        = datetime(),
                n.shape             = $shape,
                n.material          = $material,
                n.size              = $size,
                n.node_color        = $node_color
            RETURN elementId(n) AS id, n.node_id AS node_id
            """,
            {**_base_params, "node_id": f"{prefix}{_uuid_mod.uuid4().hex[:8]}"},
        )
        return result.single()

    record = None
    with driver.session() as session:
        try:
            record = session.execute_write(_create)
        except ConstraintError:
            # Two concurrent requests computed the same sequential ID before
            # either committed. UUID suffix is always unique.
            print(f"Constraint collision on {prefix} node_id — retrying with UUID suffix")
            record = session.execute_write(_create_with_uuid)

    node_db_id = record["id"]
    node_id    = record["node_id"]
    print(f"Node created: {node_id}")

    if data.subnodes:
        valid_subnodes = [
            s for s in data.subnodes
            if (s.get("title") or "").strip()
            or (s.get("description") or "").strip()
            or (s.get("content") or "").strip()
        ]
        if valid_subnodes:
            print(f"Saving {len(valid_subnodes)} valid subnodes")
            GraphService.save_subnodes(node_db_id, valid_subnodes)

    def _store_embedding(db_id: str, text: str, nid: str):
        try:
            emb = [float(v) for v in _embed_text(text)]
            with driver.session() as s:
                s.run(
                    "MATCH (n) WHERE elementId(n) = $id SET n.embedding = $emb",
                    {"id": db_id, "emb": emb},
                )
            print(f"Embedding stored for {nid}")
        except Exception as ex:
            print(f"Embedding failed for {nid}: {ex}")

    threading.Thread(
        target=_store_embedding,
        args=(node_db_id, data.content, node_id),
        daemon=True,
    ).start()

    return {"status": "created", "id": node_db_id, "node_id": node_id}

def normalize_embedding(embedding):
    if not embedding:
        return []
    return [float(v) for v in embedding]
 
@app.post("/api/relations/predict")
def predict_relations(data: dict):
    """Predict relations between a new node and existing nodes."""
    try:
        content = data.get("content", "")
        parent_type = data.get("parent_type", "Concept")
        existing_nodes = data.get("existing_nodes", [])
        
        if not content or not existing_nodes:
            return {"relations": []}
        
        # Build a summary of existing nodes (limit to 15 for API limits)
        nodes_summary = []
        for n in existing_nodes[:15]:
            node_content = n.get('content', '')[:100]
            if node_content:
                nodes_summary.append(f"- ID: {n.get('node_id')} | Type: {n.get('parent_type', 'Concept')} | Content: {node_content}")
        
        nodes_text = "\n".join(nodes_summary)
        
        prompt = f"""You are analyzing a new concept to be added to a knowledge graph.

NEW CONCEPT: "{content}"
TYPE: {parent_type}

EXISTING NODES:
{nodes_text}

Suggest up to 3 relationships between the new concept and the most relevant existing nodes.
Consider: SUPPORTS, CONTRADICTS, REQUIRES, TRIGGERS, AMPLIFIES, DEPENDS_ON, RELATES_TO

Return ONLY valid JSON in this exact format (no other text, no markdown):
{{
  "relations": [
    {{
      "target_node_id": "the node_id from above",
      "rel_type": "SUPPORTS",
      "confidence": 0.85,
      "justification": "Brief explanation why"
    }}
  ]
}}


If no meaningful relations exist, return {{"relations": []}}"""

        response = _client.models.generate_content(
            model=_CHAT_MODEL,
            contents=prompt,
            config={"temperature": 0.3},
        )
        text = response.text.strip()
        # Clean up markdown if present
        text = text.replace("```json", "").replace("```", "").strip()
        
        result = json.loads(text)
        
        for rel in result.get("relations", []):
            if not isinstance(rel.get("confidence"), (int, float)):
                rel["confidence"] = 0.7  # explicit fallback only when truly missing

            if "relations" not in result:
                result = {"relations": []}

        # Validate the response structure
        if "relations" not in result:
            result = {"relations": []}
        
        print(f"🔮 Predicted {len(result['relations'])} relations for '{content[:50]}'")
        return result
        
    except Exception as e:
        print(f"❌ Relation prediction error: {e}")
        import traceback
        traceback.print_exc()
        return {"relations": []}

# ── Discussion Node creation ──────────────────────────────────────────────
@app.post("/api/discussion-nodes")
def create_discussion_node(data: DiscussionNodeCreate):
    """
    Creates a DiscussionNode and DISCUSSES edges to every member atomically.

    The node is stored as a regular :Concept with parent_type='DiscussionNode'
    so it participates in the existing graph pipeline without any schema changes.
    Member node_ids are stored both as a `members` array property (for fast
    look-up) and as DISCUSSES edges (for graph traversal).
    """
    import uuid

    if not data.title.strip():
        raise HTTPException(status_code=422, detail="title is required")
    if len(data.member_ids) < 2:
        raise HTTPException(status_code=422, detail="at least 2 member_ids required")

    def _create_discussion(tx):
        result = tx.run(
            """
            OPTIONAL MATCH (existing)
            WHERE existing.node_id STARTS WITH 'DN'
              AND coalesce(existing.graph_id, 'default') = $graph_id
            WITH coalesce(
                   max(toInteger(split(substring(existing.node_id, 2), '_')[0])),
                   0
                 ) + 1 AS next_n
            CREATE (d:Concept)
            SET d.content           = $title,
                d.parent_type       = 'DiscussionNode',
                d.node_type         = 'DiscussionNode',
                d.node_id           = 'DN' + toString(next_n) + '_v1',
                d.version_id        = 'DN' + toString(next_n) + '_v1',
                d.context           = $context,
                d.members           = $members,
                d.graph_id          = $graph_id,
                d.abstraction_level = $abstraction_level,
                d.x                 = $x,
                d.y                 = $y,
                d.embedding         = [],
                d.created_at        = datetime()
            RETURN elementId(d) AS id, d.node_id AS node_id
            """,
            {
                "title":             data.title.strip(),
                "context":           data.context or "",
                "members":           data.member_ids,
                "graph_id":          data.graph_id,
                "abstraction_level": data.abstraction_level,
                "x": data.x,
                "y": data.y,
            },
        )
        return result.single()

    with driver.session() as session:
        rec = session.execute_write(_create_discussion)
        disc_id  = rec["id"]
        disc_nid = rec["node_id"]

        # ── If no explicit position, set centroid of member nodes ─────────
        if data.x is None or data.y is None:
            pos_result = session.run(
                """
                MATCH (n) WHERE elementId(n) IN $ids
                RETURN avg(coalesce(n.x, 0)) AS cx, avg(coalesce(n.y, 0)) AS cy
                """,
                {"ids": data.member_ids},
            )
            pos = pos_result.single()
            if pos:
                import random as _rnd
                cx = (pos["cx"] or 0) + _rnd.uniform(-20, 20)
                cy = (pos["cy"] or 0) + _rnd.uniform(-20, 20)
                session.run(
                    "MATCH (d) WHERE elementId(d) = $id SET d.x = $x, d.y = $y",
                    {"id": disc_id, "x": cx, "y": cy},
                )

        # ── Create DISCUSSES edges to every member ────────────────────────
        session.run(
            """
            MATCH (d) WHERE elementId(d) = $disc_id
            MATCH (m) WHERE elementId(m) IN $member_ids
            MERGE (d)-[r:RELATION]->(m)
            SET r.relation_type = 'DISCUSSES',
                r.weight        = 0.6,
                r.confidence    = 1.0,
                r.status        = 'CONFIRMED',
                r.created_at    = datetime()
            """,
            {"disc_id": disc_id, "member_ids": data.member_ids},
        )

    return {
        "status":   "created",
        "id":       disc_id,
        "node_id":  disc_nid,
        "members":  len(data.member_ids),
    }


@app.post("/api/links")
def create_link(data: LinkRequest):
    query = """
    MATCH (a), (b)
    WHERE elementId(a) = $id_a AND elementId(b) = $id_b
    MERGE (a)-[r:RELATION]->(b)
    SET r.relation_type = $rel_type,
        r.justification = $justification,
        r.mechanism = $mechanism,
        r.color = $color,
        r.weight = $weight,
        r.confidence = $confidence,
        r.evidence_type = $evidence_type,
        r.scope = $scope,
        r.status = $status,
        r.relation_id = $relation_id,
        r.created_at = datetime(),
        r.valid_from = $valid_from,
        r.valid_to = $valid_to
    RETURN elementId(r) as id
    """
    params = {
        "id_a": data.node_a,
        "id_b": data.node_b,
        "rel_type": data.rel_type.upper(),
        "justification": data.justification,
        "mechanism": data.mechanism,
        "color": data.color,
        "weight": data.weight,
        "confidence": data.confidence,
        "evidence_type": data.evidence_type,
        "scope": data.scope,
        "status": data.status,
        "relation_id": data.relation_id,
        "valid_from": data.valid_from,
        "valid_to": data.valid_to,
    }
    with driver.session() as session:
        result = session.run(query, params)
        return {"status": "linked", "id": result.single()["id"]}

@app.patch("/api/nodes/{node_id}")
def update_node(node_id: str, data: NodeUpdate):
    props = {k: v for k, v in data.dict().items() if v is not None and k != 'subnodes'}
    props.pop("z", None)
    
    with driver.session() as session:
        # Update main node
        if props:
            session.run(
                "MATCH (n) WHERE elementId(n) = $node_id SET n += $props",
                {"node_id": node_id, "props": props}
            )
        
        # Handle subnodes
    if data.subnodes is not None:
        subnode_dicts = [
            {"title": s.title or "", "description": s.description or "", "strength": s.strength or 50}
            for s in data.subnodes
            if (s.title or "").strip() or (s.description or "").strip()
        ]
        if subnode_dicts:  # only call if there's actually something to save
            GraphService.save_subnodes(node_id, subnode_dicts)

@app.delete("/api/nodes/{node_id}")
def delete_node(node_id: str):
    query = "MATCH (n) WHERE elementId(n) = $node_id DETACH DELETE n"
    with driver.session() as session:
        session.run(query, {"node_id": node_id})
    return {"status": "deleted"}

@app.delete("/api/links/{rel_id}")
def delete_relation(rel_id: str):
    query = "MATCH ()-[r]-() WHERE elementId(r) = $rel_id DELETE r"
    with driver.session() as session:
        session.run(query, {"rel_id": rel_id})
    return {"status": "link removed"}

class LinkUpdate(BaseModel):
    rel_type: Optional[str] = None
    justification: Optional[str] = None
    mechanism: Optional[str] = None
    weight: Optional[float] = None
    confidence: Optional[float] = None
    evidence_type: Optional[str] = None
    scope: Optional[str] = None
    status: Optional[str] = None
    valid_from: Optional[int] = None
    valid_to: Optional[int] = None

@app.patch("/api/links/{rel_id}")
def update_link(rel_id: str, data: LinkUpdate):
    query = """
    MATCH ()-[r]-() WHERE elementId(r) = $rel_id
    SET r += $props
    RETURN elementId(r) AS id
    """
    props = {k: v for k, v in data.dict().items() if v is not None}
    with driver.session() as session:
        session.run(query, {"rel_id": rel_id, "props": props})
    return {"status": "updated"}

class EmbeddingStore(BaseModel):
    embedding: List[float]

@app.post("/api/nodes/{node_id}/embedding")
def store_node_embedding(node_id: str, payload: EmbeddingStore):
    """Store a pre-computed embedding vector on an existing node."""
    embedding = normalize_embedding(payload.embedding)  # ← Use helper

    query = """
    MATCH (n) WHERE elementId(n) = $node_id
    SET n.embedding = $embedding
    RETURN n.node_id AS node_id
    """
    with driver.session() as session:
        result = session.run(query, {"node_id": node_id, "embedding": payload.embedding})
        rec = result.single()
    return {"status": "stored", "node_id": rec["node_id"] if rec else None}

# Add this endpoint to main.py to backfill embeddings
@app.post("/api/backfill-embeddings")
async def backfill_embeddings():
    """Generate embeddings for all nodes that don't have them yet."""
    # Read phase — collect nodes missing embeddings
    with driver.session() as session:
        result = session.run("""
            MATCH (n)
            WHERE n.embedding IS NULL OR size(n.embedding) = 0
            RETURN elementId(n) AS id,
                   coalesce(n.content, n.name, '') AS content,
                   n.node_id AS node_id
        """)
        nodes = [dict(r) for r in result]

    processed, skipped, failed = 0, 0, 0
    for node in nodes:
        content = (node.get("content") or "").strip()
        if not content:
            skipped += 1
            continue
        try:
            embedding = _embed_text(content)
            embedding = normalize_embedding(embedding)  # ← Use helper

            # Write phase — separate session per node to avoid long-lived transactions
            with driver.session() as session:
                session.run(
                    "MATCH (n) WHERE elementId(n) = $id SET n.embedding = $embedding",
                    {"id": node["id"], "embedding": embedding},
                )
            print(f"✅ Backfilled embedding for {node.get('node_id', node['id'])}")
            processed += 1
        except Exception as e:
            print(f"❌ Failed for {node.get('node_id', node['id'])}: {e}")
            failed += 1

    return {"status": "complete", "processed": processed, "skipped": skipped, "failed": failed}

# --- ENGINE & AI OPERATIONS ---

@app.get("/engine/events")
def check_engine_events():
    return EventEngine.monitor_thresholds()

@app.post("/engine/decay")
def trigger_decay():
    RelationEngine.apply_decay()
    return {"status": "decay applied"}

@app.post("/engine/ai/challenge")
def ai_challenge_node(node_id: str):
    return {"suggestions": ["Contradicts C14", "Supports Hypothesis A"]}

class EmbedRequest(BaseModel):
    text: str

@app.post("/api/embed")
def get_embedding(data: EmbedRequest):
    """Generate embedding for text and return it."""
    try:
        embedding = _embed_text(data.text)
        return {"embedding": embedding}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class ChallengeRequest(BaseModel):
    content: str
    parent_type: Optional[str] = None

@app.get("/api/nodes/embeddings")
def get_node_embeddings(graph_id: str = "default"):
    """Get minimal node data with embeddings for placement suggestions.
    This is separate from /graph/3d-json to keep the main graph response fast.
    """
    try:
        with driver.session() as session:
            result = session.run("""
                MATCH (n:Concept)
                WHERE coalesce(n.graph_id, 'default') = $graph_id
                  AND NOT n:Subnode
                  AND NOT n:GraphSnapshot                                 
                  AND n.embedding IS NOT NULL
                  AND size(n.embedding) > 0
                RETURN n.node_id AS node_id,
                       n.content AS content,
                       n.parent_type AS parent_type,
                       n.x AS x,
                       n.y AS y,
                       n.z AS z,
                       n.embedding AS embedding
                LIMIT 500
            """, {"graph_id": graph_id})
            
            nodes = []
            for r in result:
                nodes.append({
                    "id": r["node_id"],
                    "node_id": r["node_id"],
                    "content": r["content"] or "",
                    "parent_type": r["parent_type"] or "Concept",
                    "x": r["x"] if r["x"] is not None else 0,
                    "y": r["y"] if r["y"] is not None else 0,
                    "z": r["z"] if r["z"] is not None else 0,
                    "embedding": r["embedding"] or []
                })
            
            print(f"📊 Embeddings endpoint: returning {len(nodes)} nodes with embeddings")
            return {"nodes": nodes}
            
    except Exception as e:
        print(f"❌ Error in /api/nodes/embeddings: {e}")
        import traceback
        traceback.print_exc()
        return {"nodes": [], "error": str(e)}

@app.post("/api/ai/challenge")
def ai_challenge(data: ChallengeRequest):
    prompt = f"""You are an adversarial epistemic auditor in a knowledge graph tool. Stress-test the given concept with four sections:

COUNTERARGUMENT
The strongest challenge or alternative framing.

HIDDEN ASSUMPTIONS
Unstated premises this concept depends on.

FALSIFICATION CONDITIONS
What evidence would significantly weaken or refute this.

EPISTEMIC RATING
One of: WEAK / CONTESTED / SOLID / ROBUST — one-line justification.

Be direct. No hedging. No markdown formatting.

Concept: "{data.content}"
Node type: {data.parent_type or 'Concept'}"""

    try:
        resp = _client.models.generate_content(
            model=_CHAT_MODEL,
            contents=prompt,
            config={"temperature": 0.3},
        )
        if not resp.candidates or resp.candidates[0].finish_reason.name != "STOP":
            raise HTTPException(status_code=500, detail="Gemini blocked or failed to respond")
        return {"result": resp.text}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- AI ANALYZE: Map Extractor + Embedding Placement ---

import json as _json
import math as _math
import os as _os
from google import genai

_GCP_PROJECT  = _os.environ.get("GCP_PROJECT_ID", "your-gcp-project-id")
_GCP_LOCATION = _os.environ.get("GCP_LOCATION", "us-central1")

_client = genai.Client(
    vertexai=True,
    project=_GCP_PROJECT,
    location=_GCP_LOCATION,
)

_CHAT_MODEL  = "gemini-2.5-flash"
_EMBED_MODEL = "publishers/google/models/text-embedding-004"

def _cosine_sim(a: list[float], b: list[float]) -> float:
    """Cosine similarity between two equal-length vectors."""
    dot = sum(x * y for x, y in zip(a, b))
    na  = _math.sqrt(sum(x * x for x in a))
    nb  = _math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def _embed_text(text: str) -> list[float]:
    result = _client.models.embed_content(
        model=_EMBED_MODEL,
        contents=text[:800],
    )
    vec = result.embeddings[0].values
    norm = _math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]

def _embedding_to_3d(embedding: list[float], radius: float = 180.0) -> dict:
    """
    Project the first 3 PCA-like components of the embedding onto a sphere
    of the given radius.  Using dims 0,1,2 gives a stable, deterministic
    position that reflects semantic content.
    """
    x, y, z = embedding[0], embedding[1], embedding[2]
    norm = _math.sqrt(x*x + y*y + z*z) or 1.0
    return {
        "x": round((x / norm) * radius, 2),
        "y": round((y / norm) * radius, 2),
        "z": None,
    }



class AIAnalyzeRequest(BaseModel):
    text: str
    existing_node_ids: Optional[List[str]] = None  # limit comparison set


@app.post("/api/ai/analyze")
def ai_analyze(data: AIAnalyzeRequest):
    """
    MAP EXTRACTOR pipeline:
    1. Send text to Claude asking for: 1 core concept, 1 supporting observation,
       1 counter-argument (if any), and relations to existing graph nodes.
    2. Generate a semantic embedding for each extracted fragment.
    3. Compare embeddings to existing-node embeddings from Neo4j to find
       the most similar existing nodes (fallback if Claude's node_ids are wrong).
    4. Compute a 3D position from the embedding.
    5. Return structured result to the frontend.
    """
    text = data.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")

    # ---- 1. Fetch existing nodes with embeddings from Neo4j ----
    with driver.session() as session:
        result = session.run("""
            MATCH (n)
            WHERE n.embedding IS NOT NULL AND size(n.embedding) > 0
            RETURN elementId(n) AS id, n.node_id AS node_id,
                   n.content AS content, n.parent_type AS parent_type,
                   n.embedding AS embedding,
                   n.x AS x, n.y AS y, n.z AS z
            LIMIT 200
        """)
        existing_nodes = [dict(r) for r in result]

    node_list_str = "\n".join(
        f"{n['node_id']}: {(n.get('content') or '')[:80]}"
        for n in existing_nodes[:80]
    ) or "(no existing nodes)"

    # ---- 2. Call Claude as Map Extractor ----
    extraction_prompt = f"""You are a Map Extractor for a knowledge graph.

    Given the text below, extract:
    1. CORE CONCEPT — the primary, most atomic idea (1 sentence)
    2. SUPPORTING OBSERVATION — an empirical or contextual note that supports the concept (1 sentence; null if none)
    3. COUNTER-ARGUMENT — the strongest challenge or opposing framing (1 sentence; null if none)

    Then for EACH extracted item, suggest up to 2 relations to existing graph nodes.
    Also suggest relations BETWEEN the extracted fragments themselves.

    Existing graph nodes:
    {node_list_str}

    Respond ONLY with a JSON object — no markdown, no preamble:
    {{
    "core_concept": {{
        "content": "...",
        "parent_type": "Concept",
        "suggested_relations": [
        {{"node_id": "<exact node_id from list>", "rel_type": "SUPPORTS|CONTRADICTS|REQUIRES|TRIGGERS|AMPLIFIES|DEPENDS_ON|RELATES_TO", "justification": "one sentence"}}
        ]
    }},
    "observation": {{
        "content": "..." | null,
        "parent_type": "Observation",
        "suggested_relations": []
    }},
    "counter_argument": {{
        "content": "..." | null,
        "parent_type": "Concept",
        "suggested_relations": []
    }},
    "cross_relations": [
        {{
        "from_fragment": "core_concept|observation|counter_argument",
        "to_fragment":   "core_concept|observation|counter_argument",
        "rel_type": "SUPPORTS|CONTRADICTS|REQUIRES|TRIGGERS|AMPLIFIES|DEPENDS_ON|RELATES_TO",
        "justification": "one sentence"
        }}
    ]
    }}

    Text to analyze:
    \"\"\"{text}\"\"\""""

    resp = _client.models.generate_content(
        model=_CHAT_MODEL,
        contents=extraction_prompt,
        config={"temperature": 0.2},
    )

    if not resp.candidates or resp.candidates[0].finish_reason.name != "STOP":
        raise HTTPException(status_code=500, detail="Gemini blocked or failed to respond")

    raw = resp.text.strip().replace("```json", "").replace("```", "").strip()
    print("RAW GEMINI RESPONSE:", raw)  # add this temporarily

    extraction = _json.loads(raw)

    # ---- 3. Generate embeddings for each extracted fragment ----
    fragments = {}
    for key in ("core_concept", "observation", "counter_argument"):
        frag = extraction.get(key, {})
        content = frag.get("content") if isinstance(frag, dict) else None
        if content:
            embedding = _embed_text(content)
            pos       = _embedding_to_3d(embedding, radius=180.0)
            fragments[key] = {
                **frag,
                "embedding": embedding,
                "position": pos,
            }

    # ---- 4. Enhance relation suggestions via embedding similarity ----
    # If an existing node's node_id wasn't recognised, fall back to
    # top-2 cosine-similar nodes from the live DB embeddings.
    for key, frag in fragments.items():
        validated_rels = []
        for sr in (frag.get("suggested_relations") or []):
            # Check if the node_id exists in the fetched nodes
            matched = next((n for n in existing_nodes if n["node_id"] == sr["node_id"]), None)
            if matched:
                validated_rels.append({**sr, "target_db_id": matched["id"]})

        # Top-2 similarity fallback if we have embeddings
        if existing_nodes:
            frag_emb = frag["embedding"]
            sims = []
            for n in existing_nodes:
                emb = n.get("embedding")
                if not emb or len(emb) != len(frag_emb):
                    continue
                sim = _cosine_sim(frag_emb, emb)
                sims.append((sim, n))
            sims.sort(key=lambda x: -x[0])
            seen_ids = {r["node_id"] for r in validated_rels}
            for sim_score, n in sims[:2]:
                if n["node_id"] not in seen_ids and sim_score > 0.75:
                    validated_rels.append({
                        "node_id":     n["node_id"],
                        "target_db_id": n["id"],
                        "rel_type":    "RELATES_TO",
                        "justification": f"Semantic similarity {sim_score:.2f} — automatically detected",
                        "auto": True,
                    })
                    seen_ids.add(n["node_id"])

        frag["suggested_relations"] = validated_rels

    # ---- 5. Return structured payload ----
    return {
        "status": "ok",
        "source_text": text[:300],
        "fragments": fragments,   # core_concept, observation, counter_argument
    }

# ─────────────────────────────────────────────────────────────────────────────
# SNAPSHOT / TIMELINE / ROLLBACK
#
# A GraphSnapshot is a lightweight Neo4j node that stores a full JSON blob of
# the graph at a point in time.  It is NOT part of the graph topology — it sits
# beside it as a plain :GraphSnapshot node.
#
# POST /api/snapshots          → create a snapshot of the current graph
# GET  /api/snapshots          → list all snapshots (timeline)
# POST /api/rollback/{snap_id} → restore graph to a snapshot
# ─────────────────────────────────────────────────────────────────────────────



class SnapshotCreate(BaseModel):
    label: str = ""          # human-readable description, e.g. "Node C14 added"
    graph_id: str = "default"

@app.post("/api/snapshots")
def create_snapshot(data: SnapshotCreate):
    import uuid
    from neo4j.time import DateTime

    def serialize_datetime(obj):
        if isinstance(obj, DateTime):
            return obj.iso_format()
        raise TypeError(f"Object of type {type(obj)} is not JSON serializable")

    snap_id = str(uuid.uuid4())
    
    # Get current graph data
    graph_data = GraphService.get_3d_data(graph_id=data.graph_id)
    
    # Convert to JSON string
    json_str = json.dumps({
        "nodes": graph_data.get("nodes", []),
        "links": graph_data.get("links", [])
    }, default=serialize_datetime)
    
    # Compress the blob (reduces size by 70-80%)
    compressed_blob = zlib.compress(json_str.encode('utf-8'))
    
    node_count = len(graph_data.get("nodes", []))
    link_count = len(graph_data.get("links", []))
    
    original_size = len(json_str)
    compressed_size = len(compressed_blob)
    print(f"📸 Snapshot {snap_id}: {original_size} -> {compressed_size} bytes ({100 - (compressed_size/original_size*100):.0f}% smaller)")
    
    def _create_snapshot(tx):
        tx.run("""
            CREATE (s:GraphSnapshot {
                snap_id: $snap_id,
                graph_id: $graph_id,
                label: $label,
                blob: $blob,
                node_count: $node_count,
                link_count: $link_count,
                created_at: datetime()
            })
        """, snap_id=snap_id, graph_id=data.graph_id, 
            label=data.label or f"Snapshot {snap_id[:8]}",
            blob=compressed_blob,  # Store compressed
            node_count=node_count, 
            link_count=link_count)
    
    with driver.session() as session:
        session.execute_write(_create_snapshot)
    
    return {"status": "created", "snap_id": snap_id}

@app.get("/api/snapshots/{snap_id}/blob")
def get_snapshot_blob(snap_id: str):
    with driver.session() as session:
        result = session.run(
            "MATCH (s:GraphSnapshot {snap_id: $snap_id}) RETURN s.blob AS blob, s.label AS label, toString(s.created_at) AS created_at",
            {"snap_id": snap_id}
        )
        record = result.single()
    if not record:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    
    blob_data = record["blob"]
    
    # Check if blob is compressed (bytes) or string
    try:
        if isinstance(blob_data, bytes):
            # Decompress the blob
            decompressed = zlib.decompress(blob_data)
            graph = json.loads(decompressed.decode('utf-8'))
        else:
            # Old format - string
            graph = json.loads(blob_data) if blob_data else {"nodes": [], "links": []}
    except Exception as e:
        print(f"Error decompressing blob: {e}")
        graph = {"nodes": [], "links": []}

    return {
        "snap_id": snap_id,
        "label": record["label"],
        "created_at": record["created_at"],
        "graph": graph,
    }

@app.get("/api/snapshots")
def list_snapshots(graph_id: str = "default"):
    from neo4j.exceptions import SessionExpired, ServiceUnavailable
    from neo4j.time import DateTime  # ← make sure this is here

    def _fetch(tx):
        result = tx.run(
            """
            MATCH (s:GraphSnapshot {graph_id: $graph_id})
            RETURN s.snap_id    AS snap_id,
                   s.label      AS label,
                   s.node_count AS node_count,
                   s.link_count AS link_count,
                   s.created_at AS created_at
            ORDER BY s.created_at DESC
            """,
            graph_id=graph_id
        )
        snapshots = []
        for r in result:
            created_at = r["created_at"]
            if isinstance(created_at, DateTime):
                created_at = created_at.iso_format()
            snapshots.append({
                "snap_id": r["snap_id"],
                "label": r["label"],
                "node_count": r["node_count"],
                "link_count": r["link_count"],
                "created_at": created_at,
            })
        return snapshots

    try:
        with driver.session() as session:
            snapshots = session.execute_read(_fetch)
        return {"snapshots": snapshots}
    except (SessionExpired, ServiceUnavailable) as e:
        print(f"⚠️ Neo4j connection error in list_snapshots: {e}")
        return {"snapshots": []}



@app.get("/api/debug/unnamed")
def debug_unnamed_nodes(graph_id: str = "default"):
    """Find nodes with no content/name — helps identify phantom nodes."""
    with driver.session() as session:
        result = session.run(
            """
            MATCH (n)
            WHERE coalesce(n.graph_id, 'default') = $graph_id
              AND (n.content IS NULL OR trim(n.content) = '')
              AND NOT n:GraphSnapshot
            RETURN elementId(n) AS id,
                   labels(n)    AS labels,
                   n            AS props
            LIMIT 50
            """,
            {"graph_id": graph_id}
        )
        return {"nodes": [{"id": r["id"], "labels": r["labels"], "props": dict(r["props"])} for r in result]}

@app.post("/api/rollback/{snap_id}")
def rollback_to_snapshot(snap_id: str, graph_id: str = "default"):
    """
    Restore the graph to the state captured in the given snapshot.

    Strategy:
    1. Load the snapshot blob.
    2. Delete all current Concept nodes (and their relations) for this graph_id.
    3. Re-create every node and relation from the blob.

    This intentionally leaves GraphSnapshot nodes untouched.
    """
    # 1. Fetch snapshot
    with driver.session() as session:
        result = session.run(
            "MATCH (s:GraphSnapshot {snap_id: $snap_id}) RETURN s.blob AS blob",
            {"snap_id": snap_id}
        )
        record = result.single()
    if not record:
        raise HTTPException(status_code=404, detail="Snapshot not found")

    blob_raw = record["blob"]
    if isinstance(blob_raw, bytes):
        blob_raw = zlib.decompress(blob_raw)

    graph_data = _json_mod.loads(blob_raw)
    nodes      = graph_data.get("nodes", [])
    links      = graph_data.get("links", [])

    with driver.session() as session:
        # 2. Wipe current graph (Concept nodes only — leave snapshots alone)
        session.run(
            """
            MATCH (n:Concept)
            WHERE coalesce(n.graph_id, 'default') = $graph_id
            DETACH DELETE n
            """,
            {"graph_id": graph_id}
        )

        # 3. Re-create nodes — batch with UNWIND (one round-trip)
        node_rows = [
            {
                "content":           node.get("content") or node.get("name") or "",
                "parent_type":       node.get("parent_type") or node.get("node_type") or "Concept",
                "node_id":           node.get("node_id") or node.get("id") or str(_uuid.uuid4()),
                "graph_id":          graph_id,
                "valid_from":        node.get("valid_from"),
                "valid_to":          node.get("valid_to"),
                "x":                 node.get("x"),
                "y":                 node.get("y"),
                "z":                 node.get("z"),
                "abstraction_level": node.get("abstraction_level"),
                "confidence_tier":   node.get("confidence_tier"),
                "embedding":         node.get("embedding") or [],
            }
            for node in nodes
        ]
        session.run(
            """
            UNWIND $rows AS row
            CREATE (n:Concept)
            SET n.content           = row.content,
                n.parent_type       = row.parent_type,
                n.node_type         = row.parent_type,
                n.node_id           = row.node_id,
                n.version_id        = row.node_id,
                n.graph_id          = row.graph_id,
                n.valid_from        = row.valid_from,
                n.valid_to          = row.valid_to,
                n.x                 = row.x,
                n.y                 = row.y,
                n.z                 = row.z,
                n.abstraction_level = row.abstraction_level,
                n.confidence_tier   = row.confidence_tier,
                n.embedding         = row.embedding,
                n.created_at        = datetime()
            """,
            {"rows": node_rows},
        )

        # 4. Re-create relations — 3d-json uses "source" and "target" as element IDs,
        #    but after recreation those IDs change. We stored node_id on each node,
        #    so we look up source/target by resolving them against the node list.
        node_id_by_old_id = { n.get("id"): n.get("node_id") for n in nodes }

        for link in links:
            # 3d-json represents source/target as element IDs (strings or dicts)
            raw_src = link.get("source") or link.get("source_node_id") or link.get("node_id_a")
            raw_tgt = link.get("target") or link.get("target_node_id") or link.get("node_id_b")
            # source/target may be dicts if the frontend serialised them that way
            if isinstance(raw_src, dict): raw_src = raw_src.get("id") or raw_src.get("node_id")
            if isinstance(raw_tgt, dict): raw_tgt = raw_tgt.get("id") or raw_tgt.get("node_id")

            # Resolve to stable node_ids
            src_nid = node_id_by_old_id.get(raw_src) or raw_src
            tgt_nid = node_id_by_old_id.get(raw_tgt) or raw_tgt
            if not src_nid or not tgt_nid:
                continue
            session.run(
                """
                MATCH (a:Concept {node_id: $src, graph_id: $graph_id})
                MATCH (b:Concept {node_id: $tgt, graph_id: $graph_id})
                MERGE (a)-[r:RELATION]->(b)
                SET r.relation_type = $rel_type,
                    r.weight        = $weight,
                    r.confidence    = $confidence,
                    r.justification = $justification,
                    r.color         = $color,
                    r.status        = $status,
                    r.created_at    = datetime()
                """,
                {
                    "src":          src_nid,
                    "tgt":          tgt_nid,
                    "graph_id":     graph_id,
                    "rel_type":     link.get("rel_type") or link.get("relation_type") or "RELATES_TO",
                    "weight":       link.get("weight") or 1.0,
                    "confidence":   link.get("confidence") or 0.75,
                    "justification": link.get("justification") or "",
                    "color":        link.get("color") or "#00c8a0",
                    "status":       link.get("status") or "CONFIRMED",
                }
            )

    return {"status": "restored", "snap_id": snap_id, "nodes": len(nodes), "links": len(links)}