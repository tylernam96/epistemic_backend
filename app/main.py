from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List
from fastapi.responses import FileResponse

# Internal imports
from .database import driver
from .graph_service import GraphService
from app.engines.relation_engine import RelationEngine
from app.engines.event_engine import EventEngine

app = FastAPI(title="Epistemic Engine API")

# --- CONFIGURATION ---
app.mount("/static", StaticFiles(directory="static"), name="static")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_methods=["*"], # Expanded to allow POST, DELETE, PUT
    allow_headers=["*"],
)

@app.on_event("shutdown")
def shutdown_db_client():
    driver.close()

# --- MODELS (Schemas for your ton of options) ---

class NodeUpdate(BaseModel):
    content: Optional[str] = None
    node_id: Optional[str] = None # The 'C13_v2' style ID

class LinkRequest(BaseModel):
    node_a: str
    node_b: str
    rel_type: str
    justification: str = ""
    mechanism: str = ""
    color: str = "#00c8a0"
    weight: float = 1.0
    valid_from: Optional[str] = None
    valid_to: Optional[str] = None

# --- READ OPERATIONS (Fetching Data) ---

@app.get("/")
async def read_root():
    return FileResponse("static/index.html")

# 2. Then mount the rest of the static folder
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/graph/3d-json")
def get_graph_data():
    """Main feed for the 3D-force-graph."""
    return GraphService.get_3d_data()

@app.get("/graph/node/{node_id}/neighbors")
def get_node_neighbors(node_id: str):
    """Used for the Node Inspector panel."""
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

# --- WRITE OPERATIONS (CRUD) ---

@app.post("/api/links")
def create_link(data: LinkRequest):
    """Creates a new relation between two existing nodes."""
    query = """
    MATCH (a), (b)
    WHERE elementId(a) = $id_a AND elementId(b) = $id_b
    MERGE (a)-[r:RELATION]->(b)
    SET r.relation_type = $rel_type,
        r.justification = $justification,
        r.mechanism = $mechanism,
        r.color = $color,
        r.weight = $weight,
        r.status = 'CONFIRMED',
        r.created_at = datetime(),
        r.valid_from = $valid_from
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
        "valid_from": data.valid_from or datetime.now().isoformat()
    }
    with driver.session() as session:
        result = session.run(query, params)
        return {"status": "linked", "id": result.single()["id"]}

@app.patch("/api/nodes/{node_id}")
def update_node(node_id: str, data: NodeUpdate):
    """Update properties of a concept node."""
    query = """
    MATCH (n) WHERE elementId(n) = $node_id
    SET n += $props
    RETURN n
    """
    # Filter out None values to avoid overwriting existing data with nulls
    props = {k: v for k, v in data.dict().items() if v is not None}
    with driver.session() as session:
        session.run(query, {"node_id": node_id, "props": props})
    return {"status": "updated"}

@app.delete("/api/nodes/{node_id}")
def delete_node(node_id: str):
    """Deletes a node and all its connected relations (DETACH)."""
    query = "MATCH (n) WHERE elementId(n) = $node_id DETACH DELETE n"
    with driver.session() as session:
        session.run(query, {"node_id": node_id})
    return {"status": "deleted"}

@app.delete("/api/links/{rel_id}")
def delete_relation(rel_id: str):
    """Deletes a specific relation by its internal ID."""
    query = "MATCH ()-[r]-() WHERE elementId(r) = $rel_id DELETE r"
    with driver.session() as session:
        session.run(query, {"rel_id": rel_id})
    return {"status": "link removed"}

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
    """
    Placeholder for your AI logic. 
    You would fetch the node content, send it to an LLM, 
    and return suggestions for new links or contradictions.
    """
    # Logic goes here...
    return {"suggestions": ["Contradicts C14", "Supports Hypothesis A"]}