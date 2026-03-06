from .database import driver

# Configuration for Epistemic Node Types
NODE_TYPES = {
    "Concept":       "ConceptVersion",
    "Observation":   "ObservationVersion",
    "Method":        "MethodVersion",
    "Reference":     "ReferenceVersion",
    "DraftFragment": "DraftFragmentVersion",
    "Event":         "EventVersion",
}
VERSION_PARENT = {v: k for k, v in NODE_TYPES.items()}

class GraphService:
    @staticmethod
    def get_3d_data(limit: int = 500):
        with driver.session() as session:
            return session.execute_read(GraphService._fetch_3d_data, limit)

    @staticmethod
    def _fetch_3d_data(tx, limit):
        # Fetch ALL nodes so isolated nodes (no relations) still appear
        nodes_result = tx.run("MATCH (n) RETURN n LIMIT $limit", limit=limit)
        nodes_map = {}
        for record in nodes_result:
            node = record['n']
            nodes_map[node.element_id] = _build_node(node)

        # Fetch all relationships separately
        rels_result = tx.run("MATCH (n)-[r]->(m) RETURN n, r, m LIMIT $limit", limit=limit)
        links = []
        for record in rels_result:
            rel = record['r']
            rel_props = dict(rel)
            raw_type = rel_props.get("relation_type") or rel.type

            links.append({
                "id":            rel.element_id,
                "source":        record['n'].element_id,
                "target":        record['m'].element_id,
                "type":          rel.type,
                "rel_type":      raw_type,
                "weight":        rel_props.get("weight", 1.0),
                "justification": rel_props.get("justification", ""),
                "color":         rel_props.get("color", ""),
                "valid_from":    _coerce_epoch(rel_props.get("valid_from")),
                "valid_to":      _coerce_epoch(rel_props.get("valid_to")),
            })

        return {
            "nodes": list(nodes_map.values()),
            "links": links
        }


# --- HELPER UTILITIES ---

def _resolve_type(labels):
    for label in labels:
        if label in NODE_TYPES:
            return label, False
        if label in VERSION_PARENT:
            return VERSION_PARENT[label], True
    return "Concept", False


def _build_node(node):
    props  = dict(node)
    labels = list(node.labels)
    node_type, is_version = _resolve_type(labels)

    name = (
        props.get("content") or
        props.get("name") or
        props.get("node_id") or
        "Unnamed"
    )

    return {
        "id":          node.element_id,
        "name":        name,
        "content":     props.get("content", ""),
        "node_id":     props.get("node_id", ""),
        "node_type":   node_type,
        "parent_type": props.get("parent_type", node_type),
        "is_version":  is_version,
        "valid_from":  _coerce_epoch(props.get("valid_from")),
        "valid_to":    _coerce_epoch(props.get("valid_to")),
        "props":       props
    }


def _coerce_epoch(val):
    """Coerces valid_from/valid_to to an integer epoch, or None."""
    if val is None:
        return None
    if isinstance(val, int):
        return val
    # Handle any leftover Neo4j date objects or strings gracefully
    try:
        return int(val)
    except (ValueError, TypeError):
        return None