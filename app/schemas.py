from pydantic import BaseModel
from typing import List, Optional

class NodeBase(BaseModel):
    id: str
    label: str
    properties: dict = {}

class EdgeBase(BaseModel):
    source: str
    target: str
    type: str

class AnalysisResult(BaseModel):
    node_id: str
    score: float
    metric: str  # e.g., "pagerank", "betweenness"

class ForceGraphNode(BaseModel):
    id: str
    name: str
    group: int = 1

class ForceGraphLink(BaseModel):
    source: str
    target: str

class ForceGraphData(BaseModel):
    nodes: List[ForceGraphNode]
    links: List[ForceGraphLink]    