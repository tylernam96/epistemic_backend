from .database import driver

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
    def get_neighbors(node_id: str):
        with driver.session() as session:
            return session.execute_read(GraphService._fetch_neighbors, node_id)

    @staticmethod
    def _fetch_neighbors(tx, node_id: str):
        # Match by elementId (Neo4j internal) or node_id property
        result = tx.run("""
            MATCH (n)
            WHERE elementId(n) = $eid OR n.node_id = $nid
            WITH n
            MATCH (n)-[r]-(m)
            RETURN
                elementId(r)       AS rel_id,
                r.relation_type    AS rel_type_prop,
                type(r)            AS rel_type_label,
                startNode(r) = n   AS is_outgoing,
                elementId(m)       AS neighbor_eid,
                m.node_id          AS neighbor_node_id,
                m.content          AS neighbor_content,
                m.name             AS neighbor_name,
                r.justification    AS justification,
                r.mechanism        AS mechanism,
                r.weight           AS weight,
                r.confidence       AS confidence,
                r.evidence_type    AS evidence_type,
                r.scope            AS scope,
                r.status           AS status,
                r.valid_from       AS valid_from,
                r.valid_to         AS valid_to
        """, eid=node_id, nid=node_id)

        neighbors = []
        for record in result:
            raw_type = record["rel_type_prop"] or record["rel_type_label"] or "RELATES_TO"
            name = record["neighbor_content"] or record["neighbor_name"] or record["neighbor_node_id"] or "Unnamed"
            neighbors.append({
                "rel_id":       record["rel_id"],
                "rel_type":     raw_type.upper().strip(),
                "direction":    "out" if record["is_outgoing"] else "in",
                "id":           record["neighbor_eid"],
                "code":         record["neighbor_node_id"],
                "name":         name,
                "justification": record["justification"] or "",
                "mechanism":    record["mechanism"] or "",
                "weight":       record["weight"],
                "confidence":   record["confidence"],
                "evidence_type": record["evidence_type"] or "",
                "scope":        record["scope"] or "",
                "status":       record["status"] or "",
                "valid_from":   _coerce_epoch(record["valid_from"]),
                "valid_to":     _coerce_epoch(record["valid_to"]),
            })
        return neighbors

    @staticmethod
    def _fetch_3d_data(tx, limit):
        # All nodes including isolated ones
        nodes_result = tx.run("MATCH (n) RETURN n LIMIT $limit", limit=limit)
        nodes_map = {}
        for record in nodes_result:
            node = record['n']
            nodes_map[node.element_id] = _build_node(node)

        # All relationships
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


def _resolve_type(labels):
    for label in labels:
        if label in NODE_TYPES:
            return label, False
        if label in VERSION_PARENT:
            return VERSION_PARENT[label], True
    return "Concept", False


def _build_node(node):
    props = dict(node)
    labels = list(node.labels)
    node_type, is_version = _resolve_type(labels)

    name = (
        props.get("content") or
        props.get("name") or
        props.get("node_id") or
        "Unnamed"
    )

    # x/y/z — return as float if present, else None (frontend handles missing coords)
    def _float(val):
        try:
            return float(val) if val is not None else None
        except (ValueError, TypeError):
            return None

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
        "x":           _float(props.get("x")),
        "y":           _float(props.get("y")),
        "z":           _float(props.get("z")),
        "props":       props
    }


def _coerce_epoch(val):
    if val is None:
        return None
    if isinstance(val, int):
        return val
    try:
        return int(val)
    except (ValueError, TypeError):
        return None