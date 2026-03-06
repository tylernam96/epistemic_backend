from app.graph_service import GraphService
from app.analysis import AnalysisService

class EventEngine:
    @staticmethod
    def monitor_thresholds():
        # Get current state
        data = GraphService.get_3d_data()
        centrality_scores = AnalysisService.calculate_centrality(data)
        
        alerts = []
        
        # 1. Check for Centrality (Node Importance > Y)
        for node in centrality_scores:
            if node['score'] > 0.5: # Example threshold
                alerts.append({
                    "event": "CENTRALITY_SPIKE",
                    "node_id": node['node_id'],
                    "action": "Suggest structural reorganization"
                })

        # 2. Check for Contradiction Density (Example logic)
        contradictions = [e for e in data['edges'] if e['type'] == 'CONTRADICTS']
        if len(contradictions) > 10: # Example threshold
            alerts.append({
                "event": "EPISTEMIC_TENSION",
                "message": "High contradiction volume detected in cluster."
            })

        return alerts