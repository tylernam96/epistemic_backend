const THREE = window.THREE;


// Color map for Nodes
export const TYPE_COLORS = {
    Concept: '#005c49', 
    Observation: '#a65129', 
    Method: '#6622aa',
    Reference: '#8c7600', 
    DraftFragment: '#5c667e', 
    Event: '#a33865'
};

// Color map for Relations
export const REL_COLORS = {
    SUPPORT: '#00c8a0',      // Green
    CONTRADICT: '#ff5a5a',   // Red
    HAS_VERSION: '#8896b8',  // Grey
    TRIGGERS: '#e85090',     // Pink
    AMPLIFIES: '#ffa500',    // Orange
    DEPENDS_ON: '#6622aa',   // Purple
    DEPENDS: '#ffffff'       // White
};

export function createGraph(containerId, onNodeClick, onLinkClick) {
    // Initialize the graph first
    const Graph = ForceGraph3D()(document.getElementById(containerId))
        .backgroundColor('#07090f')
        
        // --- NODE STYLING ---
        .nodeThreeObject(node => {
            // Use the global THREE object loaded from the CDN in index.html

            const group = new THREE.Group();

            // 1. Create the Sphere
            // 1. Explicitly check parent_type first as per your DB structure
            const rawType = node.parent_type || node.node_type || null;
            if (!rawType) {
    console.warn('Node missing parent_type:', node); // 👈 tells you exactly which nodes are broken
}

            // 2. Ensure the first letter is Capitalized to match TYPE_COLORS keys
            const type = rawType.charAt(0).toUpperCase() + rawType.slice(1);
            const color = TYPE_COLORS[type] || '#445070';
            const sphere = new THREE.Mesh(
                new THREE.SphereGeometry(5),
                new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.9 })
            );
            group.add(sphere);

            // 2. Add Text Label using a Canvas Sprite
            const rawLabel = node.name || node.content || '...';
            const label = rawLabel.length > 20 ? rawLabel.slice(0, 20) + '…' : rawLabel;
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            context.font = '24px Arial';
            const textWidth = context.measureText(label).width;
            
            canvas.width = textWidth + 20;
            canvas.height = 40;
            context.clearRect(0, 0, canvas.width, canvas.height); // 👈 transparent background
            // context.fillStyle = color;
            // context.fillRect(0, 0, canvas.width, canvas.height);
            context.fillStyle = color;
            context.font = '24px Arial';
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.fillText(label, canvas.width / 2, canvas.height / 2);

            const texture = new THREE.CanvasTexture(canvas);
            const spriteMaterial = new THREE.SpriteMaterial({ map: texture, depthWrite: false, transparent:true });
            const sprite = new THREE.Sprite(spriteMaterial);
            sprite.position.set(0, 12, 0); // Position above sphere
            sprite.scale.set(canvas.width/10, canvas.height/10, 1);
            
            group.add(sprite);
            return group;
        })
        .nodeThreeObjectExtend(false) // Custom objects only
        
        // --- LINK/RELATION STYLING ---
        .linkColor(l => {
            const rawType = l.rel_type || l.relation_type || "";
            const type = rawType.toUpperCase().trim();
            return REL_COLORS[type] || '#445070'; 
        })
        .linkWidth(1)
        .linkDirectionalParticles(2) 
        .linkDirectionalParticleSpeed(0.003)
        .linkDirectionalArrowLength(3.5)
        .linkDirectionalArrowRelPos(1)
        
        // --- EVENTS ---
        .onNodeClick(onNodeClick)
        .onLinkClick(onLinkClick);

    return Graph;
}