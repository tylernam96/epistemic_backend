from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List
from fastapi.responses import FileResponse
from fastapi import HTTPException
from typing import Optional, List


from .database import driver
from .graph_service import GraphService
from app.engines.relation_engine import RelationEngine
from app.engines.event_engine import EventEngine

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

        import google.generativeai as genai
        import json
        
        model = genai.GenerativeModel("gemini-2.5-flash")
        response = model.generate_content(prompt, generation_config={"temperature": 0.3})
        
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
                # Define embed_text here if it's not available globally
        import google.generativeai as genai
        import math
        import os
        
        # Configure Gemini if not already configured
        genai.configure(api_key=os.environ["GEMINI_API_KEY"])
        
        def embed_text(text: str) -> list[float]:
            """Generate embedding for text using Gemini."""
            try:
                result = genai.embed_content(
                    model="models/gemini-embedding-2-preview",
                    content=text[:800],
                )
                vec = result["embedding"]
                norm = math.sqrt(sum(v * v for v in vec)) or 1.0
                return [v / norm for v in vec]
            except Exception as e:
                print(f"Embedding generation error: {e}")
                raise

        # Get embedding for the new content
        embedding = embed_text(data.content)
        
        # Find nodes with embeddings
        nodes_with_embeddings = [n for n in data.existing_nodes if n.get('embedding')]
        
        if not nodes_with_embeddings:
            # Random placement if no embeddings
            import random
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
        
        # Calculate similarities
        similarities = []
        for node in nodes_with_embeddings:
            sim = cosine_similarity(embedding, node['embedding'])
            similarities.append((sim, node))
        
        similarities.sort(key=lambda x: -x[0])
        top_matches = similarities[:5]
        
        # Calculate weighted centroid
        total_weight = 0
        weighted_x = 0
        weighted_y = 0
        
        for sim, node in top_matches:
            weight = max(sim, 0.3)
            weighted_x += (node.get('x', 0) or 0) * weight
            weighted_y += (node.get('y', 0) or 0) * weight
            total_weight += weight
        
        import random
        position = {
            "x": (weighted_x / total_weight) + random.uniform(-15, 15),
            "y": (weighted_y / total_weight) + random.uniform(-15, 15),
            "z": 0
        }
        
        avg_sim = sum(sim for sim, _ in top_matches) / len(top_matches)
        
        # Ask Gemini to explain WHY each top match is similar — one focused
        # prompt for all top matches at once to keep latency low.
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
            explain_resp = _chat_model.generate_content(
                explain_prompt,
                generation_config={"temperature": 0.3},
            )
            raw = explain_resp.text.strip().replace("```json", "").replace("```", "").strip()
            import json as _j
            reasons = _j.loads(raw)
            if not isinstance(reasons, list):
                reasons = []
        except Exception as ex:
            print(f"⚠️  Gemini reason enrichment failed: {ex}")
            reasons = []
        
        # Pad with generic fallback if Gemini returned fewer than expected
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

        # Build a narrative spatial rationale from the top match
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

# Helper function for cosine similarity
def cosine_similarity(a, b):
    if not a or not b or len(a) != len(b):
        return 0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(y * y for y in b) ** 0.5
    if norm_a == 0 or norm_b == 0:
        return 0
    return dot / (norm_a * norm_b)

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
    return GraphService.get_3d_data(graph_id=graph_id)

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

@app.post("/api/nodes")
def create_node(data: NodeCreate):
    import uuid, asyncio, threading

    PREFIX_MAP = {
        "concept": "C", "observation": "O", "method": "M",
        "reference": "R", "draftfragment": "D", "event": "E"
    }
    prefix = PREFIX_MAP.get(data.parent_type.lower().replace(" ", ""), "N")

    # --- Collision-proof node_id ---
    # count(*) breaks when nodes are deleted or created concurrently.
    # Instead, find the highest existing numeric index for this prefix
    # and increment it, then fall back to a short UUID suffix on conflict.
    with driver.session() as session:
        existing = session.run(
            """
            MATCH (n) WHERE n.node_id STARTS WITH $prefix
              AND coalesce(n.graph_id, 'default') = $graph_id
            RETURN n.node_id AS nid
            """,
            {"prefix": prefix, "graph_id": data.graph_id},
        )
        max_n = 0
        for rec in existing:
            nid = rec["nid"] or ""
            # e.g. "C14_v1" → extract "14"
            try:
                num = int(nid[len(prefix):].split("_")[0])
                if num > max_n:
                    max_n = num
            except (ValueError, IndexError):
                pass
        candidate_id = f"{prefix}{max_n + 1}_v1"

        # Create node; if the candidate_id is somehow taken, retry with UUID tag
        for attempt in range(3):
            node_id_to_use = candidate_id if attempt == 0 else f"{prefix}{max_n + 1}_{uuid.uuid4().hex[:6]}"
            try:
                result = session.run(
                    """
                    CREATE (n:Concept)
                    SET n.content = $content,
                        n.parent_type = $parent_type,
                        n.node_type = $parent_type,
                        n.node_id = $node_id,
                        n.version_id = $node_id,
                        n.graph_id = $graph_id,
                        n.valid_from = $valid_from,
                        n.valid_to = $valid_to,
                        n.x = $x,
                        n.y = $y,
                        n.z = $z,
                        n.abstraction_level = $abstraction_level,
                        n.confidence_tier = $confidence_tier,
                        n.embedding = [],
                        n.created_at = datetime()
                    RETURN elementId(n) AS id, n.node_id AS node_id
                    """,
                    {
                        "content":           data.content,
                        "parent_type":       data.parent_type,
                        "node_id":           node_id_to_use,
                        "graph_id":          data.graph_id,
                        "valid_from":        data.valid_from,
                        "valid_to":          data.valid_to,
                        "x":                 data.x,
                        "y":                 data.y,
                        "z":                 data.z,
                        "abstraction_level": data.abstraction_level,
                        "confidence_tier":   data.confidence_tier,
                    },
                )
                record = result.single()
                node_db_id = record["id"]
                node_id    = record["node_id"]
                
                print("🔥 NODE DB ID BEING USED:", node_db_id)

                break
            except Exception as e:
                if "ConstraintValidationFailed" in str(e) and attempt < 2:
                    continue
                raise
                # --- CREATE SUBNODES ---
    if data.subnodes:
        print("🔥 SAVING SUBNODES:", data.subnodes)

        GraphService.save_subnodes(node_db_id, data.subnodes)
    # --- Generate embedding in a background thread so the HTTP response
    #     returns immediately. The embedding will be stored within ~1-2s,
    #     long before the user interacts with the graph again. ---
    def _store_embedding(db_id: str, text: str, nid: str):
        try:
            emb = _embed_text(text)
            with driver.session() as s:
                s.run(
                    "MATCH (n) WHERE elementId(n) = $id SET n.embedding = $emb",
                    {"id": db_id, "emb": emb},
                )
            print(f"✅ Embedding stored for {nid}")
        except Exception as ex:
            print(f"⚠️  Embedding failed for {nid}: {ex}")

    threading.Thread(
        target=_store_embedding,
        args=(node_db_id, data.content, node_id),
        daemon=True,
    ).start()

    return {"status": "created", "id": node_db_id, "node_id": node_id}


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

    with driver.session() as session:
        # ── Collision-proof node_id for DiscussionNode (prefix "DN") ────────
        existing = session.run(
            """
            MATCH (n) WHERE n.node_id STARTS WITH 'DN'
              AND coalesce(n.graph_id, 'default') = $graph_id
            RETURN n.node_id AS nid
            """,
            {"graph_id": data.graph_id},
        )
        max_n = 0
        for rec in existing:
            nid = rec["nid"] or ""
            try:
                num = int(nid[2:].split("_")[0])
                if num > max_n:
                    max_n = num
            except (ValueError, IndexError):
                pass
        candidate_id = f"DN{max_n + 1}_v1"

        # ── Create the discussion node ────────────────────────────────────
        result = session.run(
            """
            CREATE (d:Concept)
            SET d.content          = $title,
                d.parent_type      = 'DiscussionNode',
                d.node_type        = 'DiscussionNode',
                d.node_id          = $node_id,
                d.version_id       = $node_id,
                d.context          = $context,
                d.members          = $members,
                d.graph_id         = $graph_id,
                d.abstraction_level = $abstraction_level,
                d.x                = $x,
                d.y                = $y,
                d.embedding        = [],
                d.created_at       = datetime()
            RETURN elementId(d) AS id, d.node_id AS node_id
            """,
            {
                "title":             data.title.strip(),
                "node_id":           candidate_id,
                "context":           data.context or "",
                "members":           data.member_ids,
                "graph_id":          data.graph_id,
                "abstraction_level": data.abstraction_level,
                # Position: if caller didn't provide one, compute centroid of members
                "x": data.x,
                "y": data.y,
            },
        )
        rec = result.single()
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
        subnode_dicts = [{"title": s.title or "", "description": s.description or "", "strength": s.strength or 50} for s in data.subnodes]
        GraphService.save_subnodes(node_id, subnode_dicts)
    print("Subnodes received:", data.subnodes)
    return {"status": "updated"}

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
        resp = _chat_model.generate_content(
            prompt,
            generation_config={"temperature": 0.3},
        )
        if not resp.candidates or resp.candidates[0].finish_reason.name != "STOP":
            raise HTTPException(status_code=500, detail="Gemini blocked or failed to respond")
        return {"result": resp.text}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- AI ANALYZE: Map Extractor + Embedding Placement ---

import google.generativeai as _genai
import json as _json
import math as _math
import os as _os

_genai.configure(api_key=_os.environ["GEMINI_API_KEY"])
_chat_model  = _genai.GenerativeModel("gemini-2.5-flash")
_embed_model = "models/gemini-embedding-2-preview"

def _cosine_sim(a: list[float], b: list[float]) -> float:
    """Cosine similarity between two equal-length vectors."""
    dot = sum(x * y for x, y in zip(a, b))
    na  = _math.sqrt(sum(x * x for x in a))
    nb  = _math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def _embed_text(text: str) -> list[float]:
    result = _genai.embed_content(
        model="models/gemini-embedding-2-preview",
        content=text[:800],
    )
    vec = result["embedding"]  # 768-dimensional, no prompt tricks needed
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
        "z": round((z / norm) * radius, 2),
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

    resp = _chat_model.generate_content(
    extraction_prompt,
    generation_config={"temperature": 0.2},
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