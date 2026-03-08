from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List
from fastapi.responses import FileResponse

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

# --- MODELS ---

class NodeCreate(BaseModel):
    content: str
    parent_type: str
    valid_from: Optional[int] = None
    valid_to: Optional[int] = None
    x: Optional[float] = None
    y: Optional[float] = None
    z: Optional[float] = None

class NodeUpdate(BaseModel):
    content: Optional[str] = None
    node_id: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    z: Optional[float] = None

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

# --- READ OPERATIONS ---

@app.get("/")
async def read_root():
    return FileResponse("static/index.html")

@app.get("/graph/3d-json")
def get_graph_data():
    return GraphService.get_3d_data()

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

# --- WRITE OPERATIONS ---

@app.post("/api/nodes")
def create_node(data: NodeCreate):
    PREFIX_MAP = {
        "concept": "C", "observation": "O", "method": "M",
        "reference": "R", "draftfragment": "D", "event": "E"
    }
    prefix = PREFIX_MAP.get(data.parent_type.lower().replace(" ", ""), "N")
    query = """
    MATCH (existing)
    WITH count(existing) AS total
    CREATE (n:Concept)
    SET n.content = $content,
        n.parent_type = $parent_type,
        n.node_type = $parent_type,
        n.node_id = $prefix + toString(total + 1) + '_v1',
        n.version_id = $prefix + toString(total + 1) + '_v1',
        n.valid_from = $valid_from,
        n.valid_to = $valid_to,
        n.x = $x,
        n.y = $y,
        n.z = $z,
        n.embedding = [],
        n.created_at = datetime()
    RETURN elementId(n) AS id, n.node_id AS node_id
    """
    params = {
        "content": data.content,
        "parent_type": data.parent_type,
        "prefix": prefix,
        "valid_from": data.valid_from,
        "valid_to": data.valid_to,
        "x": data.x,
        "y": data.y,
        "z": data.z,
    }
    with driver.session() as session:
        result = session.run(query, params)
        record = result.single()
        return {"status": "created", "id": record["id"], "node_id": record["node_id"]}

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
    query = """
    MATCH (n) WHERE elementId(n) = $node_id
    SET n += $props
    RETURN n
    """
    props = {k: v for k, v in data.dict().items() if v is not None}
    with driver.session() as session:
        session.run(query, {"node_id": node_id, "props": props})
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


# --- AI ANALYZE: Map Extractor + Embedding Placement ---

import google.generativeai as _genai
import json as _json
import math as _math
import os as _os

_genai.configure(api_key=_os.environ["GEMINI_API_KEY"])
_chat_model  = _genai.GenerativeModel("gemini-2.5-flash")
_embed_model = "models/gemini-embedding-001"

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
        model="models/gemini-embedding-001",
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

Then, for EACH extracted item (that is not null), suggest up to 2 existing graph nodes it relates to.

Existing graph nodes:
{node_list_str}

Respond ONLY with a JSON object matching this exact schema — no markdown, no preamble:
{{
  "core_concept": {{
    "content": "...",
    "parent_type": "Concept",
    "suggested_relations": [
      {{"node_id": "<exact node_id>", "rel_type": "SUPPORTS|CONTRADICTS|REQUIRES|TRIGGERS|AMPLIFIES|DEPENDS_ON|RELATES_TO", "justification": "one sentence"}}
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
  }}
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