from flask import Flask, render_template, request, jsonify
from collections import defaultdict, deque
from waitress import serve
import json

app = Flask(__name__)

# Ford-Fulkerson Algorithm Implementation
class Graph:
    def __init__(self, vertices):
        self.V = vertices
        self.graph = defaultdict(lambda: defaultdict(int))
        self.flow = defaultdict(lambda: defaultdict(int))
    
    def add_edge(self, u, v, capacity):
        """Add an edge with capacity"""
        self.graph[u][v] += capacity
    
    def set_flow(self, u, v, flow_value):
        """Set the flow on an edge"""
        self.flow[u][v] = flow_value
    
    def get_flow(self, u, v):
        """Get the flow on an edge"""
        return self.flow[u][v]
    
    def can_send_flow(self, u, v, flow_value):
        """Check if we can send flow through this edge"""
        capacity = self.graph[u][v]
        current_flow = self.flow[u][v]
        return current_flow + flow_value <= capacity
    
    def bfs_path_exists(self, source, sink, parent):
        """Check if there's an augmenting path using BFS"""
        visited = set([source])
        queue = deque([source])
        
        while queue:
            u = queue.popleft()
            
            for v in self.graph[u]:
                # Check if we can still send flow (residual capacity > 0)
                residual_capacity = self.graph[u][v] - self.flow[u][v]
                if v not in visited and residual_capacity > 0:
                    visited.add(v)
                    queue.append(v)
                    parent[v] = u
                    if v == sink:
                        return True
        
        return False
    
    def ford_fulkerson_max_flow(self, source, sink):
        """Calculate maximum flow using Ford-Fulkerson method"""
        parent = {}
        max_flow_value = 0
        
        while self.bfs_path_exists(source, sink, parent):
            # Find minimum residual capacity along the path
            path_flow = float('inf')
            s = sink
            while s != source:
                path_flow = min(path_flow, 
                              self.graph[parent[s]][s] - self.flow[parent[s]][s])
                s = parent[s]
            
            # Update flow values along the path
            v = sink
            while v != source:
                u = parent[v]
                self.flow[u][v] += path_flow
                self.flow[v][u] -= path_flow
                v = parent[v]
            
            max_flow_value += path_flow
            parent = {}
        
        return max_flow_value
    
    def verify_maximum_flow(self, source, sink, user_flow):
        """Verify if user's flow is the maximum flow"""
        # Create a fresh graph for verification
        test_graph = Graph(self.V)
        
        # Copy the graph structure
        for u in self.graph:
            for v in self.graph[u]:
                test_graph.add_edge(u, v, self.graph[u][v])
        
        # Set user's flow
        for u in user_flow:
            for v in user_flow[u]:
                test_graph.set_flow(u, v, user_flow[u][v])
        
        # Calculate the actual max flow with user's configuration
        test_graph_flow_only = Graph(self.V)
        for u in self.graph:
            for v in self.graph[u]:
                test_graph_flow_only.add_edge(u, v, self.graph[u][v])
        
        actual_max_flow = test_graph_flow_only.ford_fulkerson_max_flow(source, sink)
        
        # Calculate user's flow value
        user_flow_value = 0
        for u in user_flow:
            for v in user_flow[u]:
                if user_flow[u][v] > 0:
                    # Only count outgoing edges from source
                    if u == source:
                        user_flow_value += user_flow[u][v]
        
        # Check if flow conservation is satisfied
        for node in range(self.V):
            if node != source and node != sink:
                inflow = sum(user_flow[u].get(node, 0) for u in user_flow)
                outflow = sum(user_flow[node].get(v, 0) for v in range(self.V))
                if inflow != outflow:
                    return False, 0, actual_max_flow
        
        return user_flow_value == actual_max_flow, user_flow_value, actual_max_flow

# Define game levels
LEVELS = [
    {
        "id": 1,
        "name": "Chemin Simple",
        "description": "Trouvez le flux maximum à travers un graphe linéaire simple",
        "nodes": 4,
        "edges": [
            {"from": 0, "to": 1, "capacity": 10},
            {"from": 1, "to": 2, "capacity": 5},
            {"from": 2, "to": 3, "capacity": 15}
        ],
        "source": 0,
        "sink": 3
    },
    {
        "id": 2,
        "name": "Chemins Parallèles",
        "description": "Deux chemins vers le puits - distribuez le flux efficacement",
        "nodes": 4,
        "edges": [
            {"from": 0, "to": 1, "capacity": 10},
            {"from": 0, "to": 2, "capacity": 10},
            {"from": 1, "to": 3, "capacity": 10},
            {"from": 2, "to": 3, "capacity": 10}
        ],
        "source": 0,
        "sink": 3
    },
    {
        "id": 3,
        "name": "Réseau Mixte",
        "description": "Plusieurs chemins avec des capacités différentes",
        "nodes": 5,
        "edges": [
            {"from": 0, "to": 1, "capacity": 16},
            {"from": 0, "to": 2, "capacity": 12},
            {"from": 1, "to": 2, "capacity": 9},
            {"from": 1, "to": 3, "capacity": 12},
            {"from": 2, "to": 1, "capacity": 3},
            {"from": 2, "to": 4, "capacity": 20},
            {"from": 3, "to": 2, "capacity": 7},
            {"from": 3, "to": 4, "capacity": 7},
            {"from": 4, "to": 3, "capacity": 4}
        ],
        "source": 0,
        "sink": 4
    },
    {
        "id": 4,
        "name": "Réseau Complexe",
        "description": "Graphe plus complexe avec des goulets d'étranglement",
        "nodes": 6,
        "edges": [
            {"from": 0, "to": 1, "capacity": 10},
            {"from": 0, "to": 2, "capacity": 10},
            {"from": 1, "to": 3, "capacity": 4},
            {"from": 1, "to": 4, "capacity": 8},
            {"from": 2, "to": 4, "capacity": 9},
            {"from": 3, "to": 5, "capacity": 10},
            {"from": 4, "to": 3, "capacity": 6},
            {"from": 4, "to": 5, "capacity": 10},
            {"from": 5, "to": 2, "capacity": 2}
        ],
        "source": 0,
        "sink": 5
    },
    {
        "id": 5,
        "name": "Défi Expert",
        "description": "Grand réseau avec plusieurs interdépendances",
        "nodes": 7,
        "edges": [
            {"from": 0, "to": 1, "capacity": 9},
            {"from": 0, "to": 2, "capacity": 5},
            {"from": 1, "to": 3, "capacity": 4},
            {"from": 1, "to": 4, "capacity": 8},
            {"from": 2, "to": 1, "capacity": 4},
            {"from": 2, "to": 5, "capacity": 8},
            {"from": 3, "to": 6, "capacity": 10},
            {"from": 4, "to": 3, "capacity": 3},
            {"from": 4, "to": 5, "capacity": 4},
            {"from": 5, "to": 4, "capacity": 2},
            {"from": 5, "to": 6, "capacity": 10},
            {"from": 6, "to": 4, "capacity": 2}
        ],
        "source": 0,
        "sink": 6
    }
]

@app.route('/')
def index():
    return render_template('index.html', levels=LEVELS)

@app.route('/api/level/<int:level_id>')
def get_level(level_id):
    """Get level data"""
    level = next((l for l in LEVELS if l['id'] == level_id), None)
    if not level:
        return jsonify({"error": "Level not found"}), 404
    return jsonify(level)

@app.route('/api/verify', methods=['POST'])
def verify_flow():
    """Verify if the user's flow configuration is the maximum flow"""
    data = request.json
    level_id = data.get('level_id')
    user_flows = data.get('flows', {})
    
    # Handle custom graphs
    if level_id == 'custom':
        custom_level = data.get('level_data')
        if not custom_level:
            return jsonify({"error": "Custom level data required"}), 400
        level = custom_level
    else:
        level = next((l for l in LEVELS if l['id'] == level_id), None)
        if not level:
            return jsonify({"error": "Level not found"}), 404
    
    # Build the graph
    graph = Graph(level['nodes'])
    for edge in level['edges']:
        graph.add_edge(edge['from'], edge['to'], edge['capacity'])
    
    # Convert user flows to proper format
    user_flow_dict = defaultdict(lambda: defaultdict(int))
    for flow_id, flow_value in user_flows.items():
        parts = flow_id.split('-')
        if len(parts) == 2:
            u, v = int(parts[0]), int(parts[1])
            user_flow_dict[u][v] = flow_value
    
    # Verify the flow
    is_valid, user_flow_value, actual_max_flow = graph.verify_maximum_flow(
        level['source'], level['sink'], user_flow_dict
    )
    
    return jsonify({
        "is_valid": is_valid,
        "user_flow": user_flow_value,
        "max_flow": actual_max_flow,
        "message": "✓ Correct! Vous avez trouvé le flux maximum!" if is_valid 
                   else f"✗ Pas tout à fait. Vous avez {user_flow_value} unités, mais le flux maximum est {actual_max_flow}"
    })

@app.route('/api/hint/<int:level_id>')
def get_hint(level_id):
    """Get a hint for the level"""
    hints = {
        1: "Rappelez-vous: le flux à travers un chemin est limité par l'arc de capacité minimale (goulet d'étranglement)",
        2: "Essayez de répartir le flux équitablement entre les deux chemins de la source",
        3: "Trouvez les arcs de goulet d'étranglement qui limitent le flux total",
        4: "Recherchez les arcs qui apparaissent dans plusieurs chemins - ils sont critiques",
        5: "C'est un vrai problème de flux maximum - vous devez trouver tous les chemins d'augmentation"
    }
    return jsonify({"hint": hints.get(level_id, "Aucun indice disponible")})

if __name__ == '__main__':
    print("🚀 Serveur démarré sur http://localhost:8080")
    serve(app, host='0.0.0.0', port=8080)
