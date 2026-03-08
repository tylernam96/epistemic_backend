const THREE = window.THREE;

// --- Defaults ---
const DEFAULT_TYPE_COLORS = {
    Concept:       '#005c49',
    Observation:   '#a65129',
    Method:        '#6622aa',
    Reference:     '#8c7600',
    DraftFragment: '#5c667e',
    Event:         '#a33865'
};

const DEFAULT_REL_COLORS = {
    SUPPORT:     '#00c8a0',
    SUPPORTS:    '#00c8a0',
    CONTRADICT:  '#ff5a5a',
    CONTRADICTS: '#ff5a5a',
    HAS_VERSION: '#8896b8',
    TRIGGERS:    '#e85090',
    AMPLIFIES:   '#ffa500',
    DEPENDS_ON:  '#6622aa',
    REQUIRES:    '#6622aa',
    RELATES_TO:  '#8896b8',
    DEPENDS:     '#ffffff'
};

// Load from localStorage, falling back to defaults
function loadColors(key, defaults) {
    try {
        const stored = localStorage.getItem(key);
        return stored ? { ...defaults, ...JSON.parse(stored) } : { ...defaults };
    } catch { return { ...defaults }; }
}

export function saveTypeColors(map) {
    localStorage.setItem('ee_type_colors', JSON.stringify(map));
    Object.keys(TYPE_COLORS).forEach(k => delete TYPE_COLORS[k]);
    Object.assign(TYPE_COLORS, map);
}

export function saveRelColors(map) {
    // Keep aliased pairs in sync (SUPPORT/SUPPORTS etc.)
    const expanded = { ...map };
    const ALIASES = [['SUPPORT','SUPPORTS'],['CONTRADICT','CONTRADICTS']];
    ALIASES.forEach(([a, b]) => {
        if (map[b] && !map[a]) expanded[a] = map[b];
        if (map[a] && !map[b]) expanded[b] = map[a];
    });
    localStorage.setItem('ee_rel_colors', JSON.stringify(expanded));
    Object.keys(REL_COLORS).forEach(k => delete REL_COLORS[k]);
    Object.assign(REL_COLORS, expanded);
}

// Color map for Nodes — mutable, loaded from localStorage
export const TYPE_COLORS = loadColors('ee_type_colors', DEFAULT_TYPE_COLORS);

// Color map for Relations — mutable, loaded from localStorage
export const REL_COLORS = loadColors('ee_rel_colors', DEFAULT_REL_COLORS);

// Random position on a sphere surface — for nodes with no saved coordinates
export function randomOnSphere(radius = 200) {
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    return {
        x: radius * Math.sin(phi) * Math.cos(theta),
        y: radius * Math.sin(phi) * Math.sin(theta),
        z: radius * Math.cos(phi)
    };
}

function buildOriginGrid(scene, size = 300, divisions = 10) {
    const step = size / divisions;
    const halfSize = size / 2;

    function addGrid(plane) {
        const points = [];
        for (let i = 0; i <= divisions; i++) {
            const t = -halfSize + i * step;
            if (plane === 'XZ') {
                points.push(new THREE.Vector3(-halfSize, 0, t), new THREE.Vector3(halfSize, 0, t));
                points.push(new THREE.Vector3(t, 0, -halfSize), new THREE.Vector3(t, 0, halfSize));
            } else if (plane === 'XY') {
                points.push(new THREE.Vector3(-halfSize, t, 0), new THREE.Vector3(halfSize, t, 0));
                points.push(new THREE.Vector3(t, -halfSize, 0), new THREE.Vector3(t, halfSize, 0));
            } else if (plane === 'YZ') {
                points.push(new THREE.Vector3(0, -halfSize, t), new THREE.Vector3(0, halfSize, t));
                points.push(new THREE.Vector3(0, t, -halfSize), new THREE.Vector3(0, t, halfSize));
            }
        }
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(0x1a2035), transparent: true, opacity: 0.35 });
        scene.add(new THREE.LineSegments(geo, mat));
    }

    addGrid('XZ'); addGrid('XY'); addGrid('YZ');

    // Axis lines: X=red, Y=green, Z=blue
    [[new THREE.Vector3(-halfSize,0,0), new THREE.Vector3(halfSize,0,0), 0xff5a5a],
     [new THREE.Vector3(0,-halfSize,0), new THREE.Vector3(0,halfSize,0), 0x44cc88],
     [new THREE.Vector3(0,0,-halfSize), new THREE.Vector3(0,0,halfSize), 0x4488ff]
    ].forEach(([start, end, color]) => {
        const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
        scene.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xff00ff, transparent: true, opacity: 0.3 })));    });

    // Dot at origin
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(3), new THREE.MeshBasicMaterial({ color: 0x00c8a0 })));
}

export function createGraph(containerId, onNodeClick, onLinkClick, onNodeDrag) {
    const Graph = ForceGraph3D()(document.getElementById(containerId))
        .backgroundColor('#07090f')

        // --- DISABLE PHYSICS ENTIRELY ---
        .d3Force('charge', null)
        .d3Force('center', null)
        .d3AlphaDecay(1)
        .d3VelocityDecay(1)
        .warmupTicks(1)      // ADD THIS
        .cooldownTicks(1)    // ADD THIS

        .nodeVal(4)

        // --- NODE STYLING (depth-scaled) ---
        .nodeThreeObject(node => {
            const group = new THREE.Group();

            const rawType = node.parent_type || node.node_type || null;
            const type = rawType ? rawType.charAt(0).toUpperCase() + rawType.slice(1) : 'Concept';
            const color = TYPE_COLORS[type] || '#445070';

            // Depth scaling: distance from origin → smaller + more transparent at periphery
            const dist = Math.sqrt((node.x||0)**2 + (node.y||0)**2 + (node.z||0)**2);
            const maxDist = 250;
            const t = Math.min(dist / maxDist, 1); // 0=center, 1=edge
            const radius  = 8 - t * 4;             // 8 at center, 4 at edge
            const opacity = 0.95 - t * 0.45;       // 0.95 at center, 0.5 at edge

            const sphere = new THREE.Mesh(
                new THREE.SphereGeometry(radius),
                new THREE.MeshBasicMaterial({ color, transparent: true, opacity })
            );

            // Suggestion glow ring (only shown when node is a pending suggestion)
            if (node.__suggested) {
                const ring = new THREE.Mesh(
                    new THREE.TorusGeometry(radius + 3, 1, 8, 32),
                    new THREE.MeshBasicMaterial({ color: 0x00c8a0, transparent: true, opacity: 0.6 })
                );
                ring.rotation.x = Math.PI / 2;
                group.add(ring);
            }

            group.add(sphere);

            const rawLabel = node.name || node.content || '...';
            const label = rawLabel.length > 24 ? rawLabel.slice(0, 24) + '…' : rawLabel;
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const fontSize = Math.round(22 - t * 6); // 22px center → 16px edge
            ctx.font = `${fontSize}px Arial`;
            const textWidth = ctx.measureText(label).width;
            canvas.width  = textWidth + 20;
            canvas.height = fontSize + 16;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = `rgba(${hexToRgb(color)},${opacity})`;
            ctx.font = `${fontSize}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, canvas.width / 2, canvas.height / 2);

            const texture = new THREE.CanvasTexture(canvas);
            const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false, transparent: true }));
            sprite.position.set(0, radius + 6, 0);
            sprite.scale.set(canvas.width / 10, canvas.height / 10, 1);
            group.add(sprite);

            return group;
        })
        .nodeThreeObjectExtend(false)

        // --- DRAG ---
        .onNodeDragEnd((node) => {
            // Pin at final drag position
            node.fx = node.x;
            node.fy = node.y;
            node.fz = node.z;
            if (onNodeDrag) onNodeDrag(node);
        })

        // --- LINK STYLING ---
        .linkColor(l => {
            const rawType = l.rel_type || l.relation_type || '';
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

    setTimeout(() => {
        const scene = Graph.scene();
        if (scene) buildOriginGrid(scene, 300, 10);
    }, 100);

    return Graph;
}

// -------------------------
// Helpers
// -------------------------
export function hexToRgb(hex) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return `${r},${g},${b}`;
}

// Suggestion vectors — dashed lines from a ghost node to suggested targets
const _suggestionLines = [];

export function drawSuggestionVectors(scene, fromNode, toNodes) {
    clearSuggestionVectors(scene);
    toNodes.forEach(({ node, color = '#00c8a0', label = '' }) => {
        const points = [
            new THREE.Vector3(fromNode.x, fromNode.y, fromNode.z),
            new THREE.Vector3(node.x,     node.y,     node.z),
        ];
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const mat = new THREE.LineDashedMaterial({
            color: new THREE.Color(color),
            dashSize: 6, gapSize: 4,
            transparent: true, opacity: 0.55,
        });
        const line = new THREE.Line(geo, mat);
        line.computeLineDistances();
        scene.add(line);
        _suggestionLines.push(line);

        // Floating label at midpoint
        if (label) {
            const mid = new THREE.Vector3(
                (fromNode.x + node.x) / 2,
                (fromNode.y + node.y) / 2 + 8,
                (fromNode.z + node.z) / 2,
            );
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            ctx.font = '18px Arial';
            canvas.width  = ctx.measureText(label).width + 16;
            canvas.height = 28;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = color;
            ctx.font = '18px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, canvas.width / 2, canvas.height / 2);
            const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
                map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false,
            }));
            sprite.position.copy(mid);
            sprite.scale.set(canvas.width / 8, canvas.height / 8, 1);
            scene.add(sprite);
            _suggestionLines.push(sprite);
        }
    });
}

export function clearSuggestionVectors(scene) {
    _suggestionLines.forEach(obj => scene.remove(obj));
    _suggestionLines.length = 0;
}