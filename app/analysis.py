import networkx as nx
from app.database import driver

class AnalysisService:
    @staticmethod
    def calculate_centrality(graph_data: dict):
        """
        Converts Neo4j data to NetworkX to calculate PageRank.
        """
        G = nx.DiGraph()
        
        for edge in graph_data['edges']:
            G.add_edge(edge['source'], edge['target'])
            
        # Calculate PageRank (Importance)
        pagerank = nx.pagerank(G)
        
        # Format for the API
        return [
            {"node_id": node, "score": score, "metric": "pagerank"}
            for node, score in pagerank.items()
        ]

    @staticmethod
    def detect_drift(snapshot_a: dict, snapshot_b: dict):
        """
        Logic to compare two graph states and identify 'epistemic drift'.
        """
        # Placeholder: Compare set differences in edges between time T1 and T2
        set_a = {(e['source'], e['target']) for e in snapshot_a['edges']}
        set_b = {(e['source'], e['target']) for e in snapshot_b['edges']}
        
        new_connections = set_b - set_a
        broken_connections = set_a - set_b
        
        return {
            "drift_index": len(new_connections) / (len(set_a) or 1),
            "new_paths": list(new_connections)
        }
class RelationEngine:
    @staticmethod
    def reinforce_edges(source_label: str, target_label: str, increment: float = 0.1):
        """
        Hebbian-style reinforcement: 
        If two concepts are frequently linked or mentioned together, increase weight.
        """
        query = """
        MATCH (a)-[r:RELATION]->(b)
        WHERE labels(a) CONTAINS $s_label AND labels(b) CONTAINS $t_label
        SET r.weight = collect(r.weight, 0.5) + $inc
        SET r.last_activated = datetime()
        RETURN count(r)
        """
        with driver.session() as session:
            session.run(query, s_label=source_label, t_label=target_label, inc=increment)

    @staticmethod
    def apply_decay(decay_rate: float = 0.05):
        """
        Sparse enforcement:
        Edges that haven't been 'activated' recently lose weight.
        """
        query = """
        MATCH ()-[r:RELATION]->()
        WHERE r.last_activated < datetime() - duration('P7D')
        SET r.weight = r.weight - $decay
        WITH r WHERE r.weight <= 0
        DELETE r
        """
        with driver.session() as session:
            session.run(query, decay=decay_rate)    