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


# ---------------------------------------------------------------------------
# Module-level helpers (defined once, not recreated per _build_node call)
# ---------------------------------------------------------------------------

def _safe_float(val):
    try:
        return float(val) if val is not None else None
    except (ValueError, TypeError):
        return None


def _safe_int(val):
    try:
        return int(val) if val is not None else None
    except (ValueError, TypeError):
        return None


def _coerce_epoch(val):
    if val is None:
        return None
    if isinstance(val, int):
        return val
    try:
        return int(val)
    except (ValueError, TypeError):
        return None


def _resolve_type(labels):
    for label in labels:
        if label in NODE_TYPES:
            return label, False
        if label in VERSION_PARENT:
            return VERSION_PARENT[label], True
    return "Concept", False


def _build_node(node, subnodes=None):
    props = dict(node)
    labels = list(node.labels)
    node_type, is_version = _resolve_type(labels)

    name = (
        props.get("content") or
        props.get("name") or
        props.get("node_id") or
        "Unnamed"
    )

    return {
        "id":                node.element_id,
        "name":              name,
        "content":           props.get("content", ""),
        "node_id":           props.get("node_id", ""),
        "node_type":         node_type,
        "parent_type":       props.get("parent_type", node_type),
        "is_version":        is_version,
        "valid_from":        _coerce_epoch(props.get("valid_from")),
        "valid_to":          _coerce_epoch(props.get("valid_to")),
        "x":                 _safe_float(props.get("x")),
        "y":                 _safe_float(props.get("y")),
        "z":                 _safe_float(props.get("z")),
        "abstraction_level": _safe_int(props.get("abstraction_level")),
        "confidence_tier":   _safe_int(props.get("confidence_tier")),
        "embedding":         props.get("embedding", []),
        "graph_id":          props.get("graph_id", "default"),
        "subnodes":          subnodes or [],
        "title":             props.get("title", ""),
        "pinned":            props.get("pinned", False),
        "shape":             props.get("shape", "sphere"),
        "material":          props.get("material", "matte"),
        "size":              _safe_float(props.get("size")) or 5.6,
        "node_color":        props.get("node_color"),
    }


class GraphService:

    @staticmethod
    def save_subnodes(node_id: str, subnodes: list):
        """Replace all HAS_SUBNODE relationships for a node atomically."""
        with driver.session() as session:
            session.execute_write(GraphService._write_subnodes, node_id, subnodes)

    @staticmethod
    def _write_subnodes(tx, node_id: str, subnodes: list):
        # Delete all existing subnodes in one shot
        tx.run("""
            MATCH (n)-[r:HAS_SUBNODE]->(s)
            WHERE elementId(n) = $node_id
            DETACH DELETE s
        """, node_id=node_id)

        # Filter empties up front, then batch-create with UNWIND
        clean = [
            {
                "title":       (sub.get("title") or "").strip(),
                "description": (sub.get("description") or "").strip(),
                "strength":    int(sub.get("strength") or 50),
            }
            for sub in subnodes
            if (sub.get("title") or "").strip() or (sub.get("description") or "").strip()
        ]

        if clean:
            tx.run("""
                MATCH (n) WHERE elementId(n) = $node_id
                UNWIND $subnodes AS sub
                CREATE (n)-[:HAS_SUBNODE {strength: sub.strength}]->(s:Subnode {
                    title:       sub.title,
                    name:        sub.title,
                    description: sub.description,
                    content:     sub.description,
                    strength:    sub.strength,
                    is_subnode:  true
                })
            """, node_id=node_id, subnodes=clean)

    @staticmethod
    def get_3d_data(limit: int = 500, graph_id: str = "default"):
        with driver.session() as session:
            return session.execute_read(GraphService._fetch_3d_data, limit, graph_id)

    @staticmethod
    def get_neighbors(node_id: str):
        with driver.session() as session:
            return session.execute_read(GraphService._fetch_neighbors, node_id)

    @staticmethod
    def _fetch_neighbors(tx, node_id: str):
        # Use elementId() index lookup; avoid the OR by doing a UNION-style
        # coalesce — Neo4j can short-circuit the elementId branch efficiently.
        result = tx.run("""
            MATCH (n)
            WHERE elementId(n) = $eid OR n.node_id = $nid
            WITH n LIMIT 1
            MATCH (n)-[r]-(m)
            WHERE NOT coalesce(m.is_subnode, false) AND NOT m:Subnode
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
            name = (
                record["neighbor_content"] or
                record["neighbor_name"] or
                record["neighbor_node_id"] or
                "Unnamed"
            )
            neighbors.append({
                "rel_id":        record["rel_id"],
                "rel_type":      raw_type.upper().strip(),
                "direction":     "out" if record["is_outgoing"] else "in",
                "id":            record["neighbor_eid"],
                "code":          record["neighbor_node_id"],
                "name":          name,
                "justification": record["justification"] or "",
                "mechanism":     record["mechanism"] or "",
                "weight":        record["weight"],
                "confidence":    record["confidence"],
                "evidence_type": record["evidence_type"] or "",
                "scope":         record["scope"] or "",
                "status":        record["status"] or "",
                "valid_from":    _coerce_epoch(record["valid_from"]),
                "valid_to":      _coerce_epoch(record["valid_to"]),
            })
        return neighbors

    @staticmethod
    def _fetch_3d_data(tx, limit, graph_id="default"):
        # ------------------------------------------------------------------ #
        # Single query: fetch nodes + their subnodes together using COLLECT.  #
        # Eliminates the original 3-query round-trips and the Python merge    #
        # loop. The OPTIONAL MATCH means nodes without subnodes still appear. #
        # ------------------------------------------------------------------ #
        nodes_result = tx.run("""
            MATCH (n)
            WHERE coalesce(n.graph_id, 'default') = $graph_id
              AND NOT coalesce(n.is_subnode, false)
              AND NOT n:Subnode
            WITH n
            LIMIT $limit
            OPTIONAL MATCH (n)-[sr:HAS_SUBNODE]->(s)
            WITH n,
                 collect(CASE WHEN s IS NOT NULL THEN {
                     title:       coalesce(s.title, s.name),
                     description: coalesce(s.description, s.content),
                     strength:    coalesce(s.strength, sr.strength, 50)
                 } END) AS raw_subnodes
            RETURN n,
                   [sub IN raw_subnodes WHERE sub IS NOT NULL] AS subnodes
        """, limit=limit, graph_id=graph_id)

        nodes_map = {}
        for record in nodes_result:
            node = record["n"]
            node_id = node.element_id
            built = _build_node(node)
            built["subnodes"] = record["subnodes"] or []
            nodes_map[node_id] = built

        # ------------------------------------------------------------------ #
        # Relationships query — exclude subnodes on both ends via label check #
        # (label index is faster than a property predicate).                  #
        # ------------------------------------------------------------------ #
        rels_result = tx.run("""
            MATCH (n)-[r]->(m)
            WHERE coalesce(n.graph_id, 'default') = $graph_id
              AND coalesce(m.graph_id, 'default') = $graph_id
              AND NOT n:Subnode
              AND NOT m:Subnode
            RETURN
                r.relation_type    AS relation_type,
                type(r)            AS rel_label,
                elementId(r)       AS rel_eid,
                elementId(n)       AS source,
                elementId(m)       AS target,
                r.weight           AS weight,
                r.confidence       AS confidence,
                r.status           AS status,
                r.justification    AS justification,
                r.color            AS color,
                r.valid_from       AS valid_from,
                r.valid_to         AS valid_to
            LIMIT $limit
        """, limit=limit, graph_id=graph_id)

        links = []
        for record in rels_result:
            raw_type = record["relation_type"] or record["rel_label"]
            links.append({
                "id":            record["rel_eid"],
                "source":        record["source"],
                "target":        record["target"],
                "type":          record["rel_label"],
                "rel_type":      raw_type,
                "weight":        record["weight"] or 1.0,
                "confidence":    record["confidence"] or 0.75,
                "status":        record["status"] or "",
                "justification": record["justification"] or "",
                "color":         record["color"] or "",
                "valid_from":    _coerce_epoch(record["valid_from"]),
                "valid_to":      _coerce_epoch(record["valid_to"]),
            })

        return {
            "nodes": list(nodes_map.values()),
            "links": links,
        }