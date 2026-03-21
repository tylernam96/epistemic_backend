from app.database import driver
from app.graph_service import GraphService


class RelationEngine:
    @staticmethod
    def create_intentional_link(node_a: str, node_b: str, rel_type: str, justification: str = "", 
                                 mechanism: str = "", color: str = "#00c8a0", weight: float = 1.0, 
                                 valid_from: str = None, valid_to: str = None):
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
            r.created_by = 'USER',
            r.valid_from = $valid_from,
            r.valid_to = $valid_to
        RETURN r
        """
        # CRITICAL: Populate the params dictionary
        params = {
            "id_a": node_a,
            "id_b": node_b,
            "rel_type": rel_type.upper(),
            "justification": justification,
            "mechanism": mechanism,
            "color": color,
            "weight": weight,
            "valid_from": valid_from,
            "valid_to": valid_to
        }
        with driver.session() as session:
            session.run(query, params)

    @staticmethod
    def suggest_ai_link(node_a: str, node_b: str, reason: str):
        """Creates a low-weight 'Pending' link for user review."""
        query = """
        MATCH (a), (b)
        WHERE elementId(a) = $id_a AND elementId(b) = $id_b
        MERGE (a)-[r:SUGGESTED]->(b)
        SET r.weight = 0.3, r.status = 'PENDING', r.reason = $reason
        RETURN r
        """
        # ... execute via driver ...
    @staticmethod
    def propose(node_id: str):
        try:
            neighbors = GraphService.get_neighbors(node_id)
        except Exception:
            neighbors = []

        proposals = []

        # --- Simple safe logic (won’t break anything) ---
        for n in neighbors:
            target_id = n.get("id") or n.get("node_id") or n.get("code")

            if not target_id or target_id == node_id:
                continue

            proposals.append({
                "target": target_id,
                "rel_type": "RELATES_TO",
                "confidence": 0.5,
                "justification": "Based on shared graph neighborhood"
            })

        return proposals