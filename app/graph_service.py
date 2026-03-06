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
        """
        Uses execute_read to provide a robust, self-healing connection.
        This prevents neo4j.exceptions.SessionExpired errors.
        """
        with driver.session() as session:
            # execute_read handles retries automatically
            return session.execute_read(GraphService._fetch_3d_data, limit)

    @staticmethod
    def _fetch_3d_data(tx, limit):
        """Internal transaction function for 3D data."""
        query = """
        MATCH (n)-[r]->(m)
        RETURN n, r, m
        LIMIT $limit
        """
        result = tx.run(query, limit=limit)
        nodes_map = {}
        links = []

        for record in result:
            source_node = record['n']
            target_node = record['m']
            rel = record['r']

            s_id = source_node.element_id
            if s_id not in nodes_map:
                nodes_map[s_id] = _build_node(source_node)

            t_id = target_node.element_id
            if t_id not in nodes_map:
                nodes_map[t_id] = _build_node(target_node)

            rel_props = dict(rel)
            
            # Logic to find the relation type (CONTRADICTS, SUPPORTS, etc.)
            # We check the property 'relation_type' first, then the Neo4j Relationship Type
            raw_type = rel_props.get("relation_type") or rel.type
            
            links.append({
                "id":            rel.element_id,
                "source":        s_id,
                "target":        t_id,
                "type":          rel.type, # The raw Neo4j type (e.g., RELATION)
                "rel_type":      raw_type, # The epistemic type (e.g., CONTRADICTS)
                "weight":        rel_props.get("weight", 1.0),
                "justification": rel_props.get("justification", ""),
                "color":         rel_props.get("color", ""), # Fallback for DB-defined colors
                "valid_from":    _coerce_date(rel_props.get("valid_from")),
            })

        return {
            "nodes": list(nodes_map.values()),
            "links": links
        }

# --- HELPER UTILITIES ---

def _resolve_type(labels):
    """Return (node_type, is_version) based on Neo4j Labels."""
    for label in labels:
        if label in NODE_TYPES:
            return label, False
        if label in VERSION_PARENT:
            return VERSION_PARENT[label], True
    return "Concept", False # Default to Concept if unknown

def _build_node(node):
    """Parses a Neo4j node into a flat JSON object for the 3D-force-graph."""
    props  = dict(node)
    labels = list(node.labels)
    node_type, is_version = _resolve_type(labels)

    # UI Mapping: Name used for labels/search
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
        "valid_from":  _coerce_date(props.get("valid_from")),
        "props":       props # Keep raw props for the inspector
    }

def _coerce_date(val):
    """Ensures Neo4j dates are strings for JSON serialization."""
    if val is None:
        return None
    if hasattr(val, 'iso_format'):
        return val.iso_format()
    # Handle Neo4j internal datetime objects
    if hasattr(val, 'to_native'):
        return val.to_native().isoformat()
    return str(val)