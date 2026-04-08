/**
 * graph-component.js  —  Epistemic Engine v2
 * Renderer : raw Three.js
 * Layout   : d3-force 2D, kept alive at low alpha so springs enforce distances
 */

const THREE = window.THREE;
const d3    = window.d3;

const DEFAULT_TYPE_COLORS = {
    Concept:        '#005c49',
    Observation:    '#a65129',
    Method:         '#6622aa',
    Reference:      '#8c7600',
    DraftFragment:  '#5c667e',
    Event:          '#a33865',
    TESTNODE:       '#334466',
    DiscussionNode: '#7a1040',   // deep rose — visually distinct from all other types
};

const DEFAULT_REL_COLORS = {
    // Logical katman
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
    DEPENDS:     '#ffffff',
    DISCUSSES:   '#b03070',
    // Dynamic katman — Deleuze-Guattari / Derrida
    FRICTION:          '#e85090',
    DETERRITORIALIZES: '#a78bfa',
    RETERRITORIALIZES: '#818cf8',
    OPENS_INTO:        '#c084fc',
    SEDIMENTS_INTO:    '#60a5fa',
    HAUNTS:            '#6366f1',
    CONTAMINATES:      '#f59e0b',
    SUPPLEMENTS:       '#34d399',
    RESONATES_WITH:    '#00c8a0',
    INTENSIFIES:       '#fbbf24',
    SUSPENDS:          '#94a3b8',
};

// Node appearance configuration (no export needed)
const NODE_STYLES = {
    shapes: {
        sphere: 'sphere',
        cube: 'cube',
        octahedron: 'octahedron',
        tetrahedron: 'tetrahedron',
        cone: 'cone'
    },
    materials: {
        matte: 'matte',
        standard: 'standard',
        glossy: 'glossy',
        wireframe: 'wireframe'
    }
};

// Default node style per type
const DEFAULT_NODE_STYLES = {
    Concept: { shape: 'sphere', size: 5.6, material: 'matte' },
    Observation: { shape: 'sphere', size: 5.0, material: 'matte' },
    Method: { shape: 'cube', size: 5.2, material: 'standard' },
    Reference: { shape: 'octahedron', size: 5.0, material: 'matte' },
    DiscussionNode: { shape: 'octahedron', size: 5.95, material: 'glossy' },
    Event: { shape: 'cone', size: 5.3, material: 'standard' },
    DraftFragment: { shape: 'tetrahedron', size: 4.8, material: 'matte' }
};

function loadColors(key, defaults) {
    try {
        const s = localStorage.getItem(key);
        return s ? { ...defaults, ...JSON.parse(s) } : { ...defaults };
    } catch { return { ...defaults }; }
}

export const TYPE_COLORS = loadColors('ee_type_colors', DEFAULT_TYPE_COLORS);
export const REL_COLORS  = loadColors('ee_rel_colors',  DEFAULT_REL_COLORS);

export function saveTypeColors(map) {
    localStorage.setItem('ee_type_colors', JSON.stringify(map));
    Object.keys(TYPE_COLORS).forEach(k => delete TYPE_COLORS[k]);
    Object.assign(TYPE_COLORS, map);
}

export function saveRelColors(map) {
    const expanded = { ...map };
    [['SUPPORT','SUPPORTS'],['CONTRADICT','CONTRADICTS']].forEach(([a,b]) => {
        if (map[b] && !map[a]) expanded[a] = map[b];
        if (map[a] && !map[b]) expanded[b] = map[a];
    });
    localStorage.setItem('ee_rel_colors', JSON.stringify(expanded));
    Object.keys(REL_COLORS).forEach(k => delete REL_COLORS[k]);
    Object.assign(REL_COLORS, expanded);
}

// ─────────────────────────────────────────────
// Edge distance
// weight=1 → BASE exactly; lower weight → longer edge (up to MAX)
// HAS_VERSION → 0 (vertical stack only, no lateral pull)
// ─────────────────────────────────────────────

const BASE_EDGE_DISTANCE = 100;
const MAX_EDGE_DISTANCE  = 320;
const VERSION_Z_STEP     = 80;

export function edgeDistance(link) {
    const type = (link.rel_type || link.relation_type || '').toUpperCase().trim();
    if (type === 'HAS_VERSION') return 0;
    // CONTRADICTS pushes nodes apart — use a much longer spring distance
    if (type === 'CONTRADICTS' || type === 'CONTRADICT') return MAX_EDGE_DISTANCE;
    const w = Math.max(0.05, Math.min(1.0, link.weight ?? 1.0));
    return Math.min(BASE_EDGE_DISTANCE / w, MAX_EDGE_DISTANCE);
}


export function assignVersionZ(nodes, links) {
    const nodeMap  = new Map(nodes.map(n => [n.id, n]));
    const vEdges   = links.filter(l =>
        (l.rel_type || l.relation_type || '').toUpperCase().trim() === 'HAS_VERSION'
    );
    if (!vEdges.length) return;
    const children  = new Map();
    const hasParent = new Set();
    vEdges.forEach(l => {
        const src = l.source?.id ?? l.source;
        const tgt = l.target?.id ?? l.target;
        children.set(src, tgt);
        hasParent.add(tgt);
    });
    const visited = new Set();
    function walk(id, depth) {
        if (visited.has(id)) return;
        visited.add(id);
        const n = nodeMap.get(id);
        // Only offset nodes that are actual children (depth > 0).
        // depth=0 is the root of the chain — it should keep its abstraction-level Z.
        if (n && depth > 0) n.version_z = -depth * VERSION_Z_STEP;
        const child = children.get(id);
        if (child) walk(child, depth + 1);
    }
    children.forEach((_, src) => { if (!hasParent.has(src)) walk(src, 0); });
}

export function zFromAbstractionLevel(level) {
    if (level == null) return 0;
    return (level - 3) * 60;
}

// Z ekseni = ZAMAN
// Year format (>1900): (year - 2000) * 40  →  2000=0, 2010=400, 2020=800
// Period format (small number): period * 80
export function zFromEpoch(epoch) {
    if (epoch == null) return null;
    const e = Number(epoch);
    if (isNaN(e)) return null;
    return e > 1900 ? (e - 2000) * 40 : e * 80;
}

export function randomOnSphere(radius = 200) {
    const theta = 2 * Math.PI * Math.random();
    const phi   = Math.acos(2 * Math.random() - 1);
    return {
        x: radius * Math.sin(phi) * Math.cos(theta),
        y: radius * Math.sin(phi) * Math.sin(theta),
        z: radius * Math.cos(phi),
    };
}

export function hexToRgb(hex) {
    return `${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)}`;
}

// Adjust color brightness (for abstraction level)
function _tintColor(hex, mult) {
    if (!hex || hex.length < 7) return hex;
    try {
        const r = Math.round(parseInt(hex.slice(1,3),16) * mult);
        const g = Math.round(parseInt(hex.slice(3,5),16) * mult);
        const b = Math.round(parseInt(hex.slice(5,7),16) * mult);
        return '#' + [r,g,b].map(v => Math.min(255,v).toString(16).padStart(2,'0')).join('');
    } catch { return hex; }
}

function hexToThreeColor(hex) {
    return new THREE.Color(
        parseInt(hex.slice(1,3),16)/255,
        parseInt(hex.slice(3,5),16)/255,
        parseInt(hex.slice(5,7),16)/255
    );
}

function buildOriginGrid(scene, size = 400, divisions = 10) {
    const step = size / divisions;
    const half = size / 2;
    const pts  = [];
    for (let i = 0; i <= divisions; i++) {
        const t = -half + i * step;
        pts.push(-half, t, 0,  half, t, 0);
        pts.push(t, -half, 0,  t, half, 0);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    scene.add(new THREE.LineSegments(geo,
        new THREE.LineBasicMaterial({ color: 0x1a2035, transparent: true, opacity: 0.25 })
    ));
    const zGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, -half),
        new THREE.Vector3(0, 0,  half),
    ]);
    scene.add(new THREE.Line(zGeo,
        new THREE.LineBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.2 })
    ));
    scene.add(new THREE.Mesh(
        new THREE.SphereGeometry(3),
        new THREE.MeshBasicMaterial({ color: 0x00c8a0 })
    ));
}

function makeLabelSprite(text, colorHex, opacity = 0.9) {
    const canvas  = document.createElement('canvas');
    const ctx     = canvas.getContext('2d');
    // 2× resolution canvas for crisp rendering at distance
    const fontSize = 42;
    const pad      = 18;
    ctx.font = `600 ${fontSize}px Arial`;
    const textW   = ctx.measureText(text).width;
    canvas.width  = textW + pad * 2;
    canvas.height = fontSize + pad * 2;

    // Dark pill background for legibility against any scene color
    const r = canvas.height / 2;
    ctx.fillStyle = 'rgba(5, 6, 8, 0.72)';
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, r);
    ctx.fill();

    // Text
    ctx.fillStyle = `rgba(${hexToRgb(colorHex)},${opacity})`;
    ctx.font = `600 ${fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(canvas),
        depthWrite: false,
        transparent: true,
    }));
    // Scale down from 2× canvas so world units stay the same, but texture is sharper
    sprite.scale.set(canvas.width / 10, canvas.height / 10, 1);
    return sprite;
}

function buildCurvePoints(srcNode, tgtNode, link) {
    const type      = (link.rel_type || link.relation_type || '').toUpperCase().trim();
    const isVersion = type === 'HAS_VERSION';
    const start = new THREE.Vector3(srcNode.x, srcNode.y, srcNode.z);
    const end   = new THREE.Vector3(tgtNode.x, tgtNode.y, tgtNode.z);
    if (isVersion) return [start, end];

    // Layer-based curvature:
    // dynamic relations more curved — implies movement and transformation
    // uncertain relations slightly curved
    // logical straight
    const layer    = link.layer || 'logical';
    const arcMult  = layer === 'dynamic' ? 0.32 : layer === 'uncertain' ? 0.18 : 0.15;

    const mid  = start.clone().lerp(end, 0.5);
    const dir  = end.clone().sub(start);
    const perp = new THREE.Vector3(-dir.y, dir.x, 0).normalize();
    const arc  = Math.min(dir.length() * arcMult, layer === 'dynamic' ? 55 : 30);
    mid.addScaledVector(perp, arc);
    return new THREE.QuadraticBezierCurve3(start, mid, end).getPoints(20);
}

// ─────────────────────────────────────────────
// Similarity clustering force
// Pulls nodes of the same parent_type toward each other's centroid.
// Weak enough not to fight manual placement; strong enough to cluster.
// ─────────────────────────────────────────────

function forceSimilarityCluster(strength = 0.04) {
    let nodes = [];
    function force(alpha) {
        // Group by type — only include unpinned nodes in centroid calculation
        // so manually-placed nodes don't drift toward the group average
        const groups = new Map();
        nodes.forEach(n => {
            const t = n.parent_type || n.node_type || 'unknown';
            if (!groups.has(t)) groups.set(t, []);
            groups.get(t).push(n);
        });
        // For each group, nudge UNPINNED nodes toward the centroid of unpinned peers
        groups.forEach(group => {
            const unpinned = group.filter(n => n.fx == null);
            if (unpinned.length < 2) return;
            const cx = unpinned.reduce((s, n) => s + n.x, 0) / unpinned.length;
            const cy = unpinned.reduce((s, n) => s + n.y, 0) / unpinned.length;
            unpinned.forEach(n => {
                n.vx += (cx - n.x) * strength * alpha;
                n.vy += (cy - n.y) * strength * alpha;
            });
        });
    }
    force.initialize = ns => { nodes = ns; };
    return force;
}

// ADD THIS NEW FUNCTION RIGHT AFTER IT:
function forceRelatedAttraction(strength = 0.06) {
    let nodes = [];
    let links = [];
    
    function force(alpha) {
        // Build adjacency map for quick lookups
        const adjacency = new Map();
        links.forEach(link => {
            const srcId = link.source?.id ?? link.source;
            const tgtId = link.target?.id ?? link.target;
            if (!adjacency.has(srcId)) adjacency.set(srcId, []);
            if (!adjacency.has(tgtId)) adjacency.set(tgtId, []);
            adjacency.get(srcId).push({ target: tgtId, weight: link.weight || 1.0 });
            adjacency.get(tgtId).push({ target: srcId, weight: link.weight || 1.0 });
        });
        
        // For each node, pull toward its connected nodes' positions
        nodes.forEach(node => {
            const neighbors = adjacency.get(node.id) || [];
            if (neighbors.length === 0) return;
            
            let avgX = 0, avgY = 0, totalWeight = 0;
            neighbors.forEach(neighbor => {
                const targetNode = nodes.find(n => n.id === neighbor.target);
                if (targetNode) {
                    const w = neighbor.weight;
                    avgX += targetNode.x * w;
                    avgY += targetNode.y * w;
                    totalWeight += w;
                }
            });
            
            if (totalWeight > 0) {
                const targetX = avgX / totalWeight;
                const targetY = avgY / totalWeight;
                const factor = strength * alpha;
                node.vx += (targetX - node.x) * factor;
                node.vy += (targetY - node.y) * factor;
            }
        });
    }
    
    force.initialize = ns => { nodes = ns; };
    force.links = ls => { links = ls; };
    return force;
}

export function reflowNeighbours(graphHandle, graphData, newNodeId) {
    if (!graphData?.nodes?.length) return;

    const neighbourIds = new Set([newNodeId]);
    graphData.links.forEach(l => {
        const s = l.source?.id ?? l.source;
        const t = l.target?.id ?? l.target;
        if (s === newNodeId) neighbourIds.add(t);
        if (t === newNodeId) neighbourIds.add(s);
    });

    // Unpin neighbours
    graphData.nodes.forEach(n => {
        if (neighbourIds.has(n.id)) {
            delete n.fx;
            delete n.fy;
        }
    });

    const sim = d3.forceSimulation(graphData.nodes)
        .alphaMin(0.005)
        .alphaDecay(0.035)
        .velocityDecay(0.55)
        .force('link', d3.forceLink(graphData.links)
            .id(n => n.id)
            .distance(l => edgeDistance(l))
            .strength(l => {
                const s = l.source?.id ?? l.source;
                const t = l.target?.id ?? l.target;
                if (!neighbourIds.has(s) && !neighbourIds.has(t)) return 0;
                
                const type = (l.rel_type || '').toUpperCase().trim();
                if (type === 'HAS_VERSION') return 0.05;
                
                // Use confidence as strength for predicted relations
                const confidence = l.confidence || l.weight || 1.0;
                return 0.4 + confidence * 0.5;
            })
            .iterations(3)
        )
        .force('charge', d3.forceManyBody().strength(-60).distanceMax(200));

    graphHandle._setSimulation(sim);

    setTimeout(() => {
        graphData.nodes.forEach(n => {
            if (n.x != null) { n.fx = n.x; n.fy = n.y; }
        });
    }, 2500);
}

export function createGraph(containerId, onNodeClick, onLinkClick, onNodeDrag) {

    const container = document.getElementById(containerId);
    const W = container.clientWidth  || window.innerWidth;
    const H = container.clientHeight || window.innerHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(W, H);
    renderer.setClearColor(0x07090f, 1);
    container.appendChild(renderer.domElement);

    const scene  = new THREE.Scene();

    const ambientLight = new THREE.AmbientLight(0x404060);
scene.add(ambientLight);

const mainLight = new THREE.DirectionalLight(0xffffff, 1);
mainLight.position.set(10, 20, 5);
scene.add(mainLight);

    const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 5000);
    camera.position.set(0, 0, 500);

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping  = true;
    controls.dampingFactor  = 0.08;
    controls.rotateSpeed    = 0.5;
    controls.minDistance    = 50;
    controls.maxDistance    = 2000;

    buildOriginGrid(scene);

    const nodeMeshes = new Map();
    const linkMeshes = new Map();

    let _graphData  = { nodes: [], links: [] };
    let _simulation = null;   // kept alive — always ticking at low alpha

    let _dragNode   = null;
    let _dragShiftZ = false;   // true when shift-dragging along Z axis
    let _dragStartZ = 0;       // world Z at drag start
    let _dragStartScreenY = 0; // screen Y at drag start (Z mapped to vertical mouse movement)
    const _dragPlane  = new THREE.Plane();
    const _dragOffset = new THREE.Vector3();

    const raycaster = new THREE.Raycaster();
    raycaster.params.Line.threshold = 3;
    const mouse = new THREE.Vector2();

    function screenToMouse(event) {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x =  ((event.clientX - rect.left) / rect.width)  * 2 - 1;
        mouse.y = -((event.clientY - rect.top)  / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
    }

    function getNodeAt(event) {
        screenToMouse(event);
        const meshes = [...nodeMeshes.values()].map(e => e.group);
        const hits   = raycaster.intersectObjects(meshes, true);
        if (!hits.length) return null;
        let obj = hits[0].object;
        while (obj.parent && obj.parent !== scene) obj = obj.parent;
        for (const [id, entry] of nodeMeshes) {
            if (entry.group === obj) return _graphData.nodes.find(n => n.id === id) || null;
        }
        return null;
    }

    function getLinkAt(event) {
        screenToMouse(event);
        const lines = [...linkMeshes.values()].map(e => e.line);
        const hits  = raycaster.intersectObjects(lines, false);
        if (!hits.length) return null;
        for (const [, entry] of linkMeshes) {
            if (entry.line === hits[0].object) return entry.link;
        }
        return null;
    }

    const tooltip = document.getElementById('tooltip');
    renderer.domElement.addEventListener('mousemove', e => {
        if (_dragNode) return;
        const node = getNodeAt(e);
        if (node) {
            tooltip.style.display = 'block';
            tooltip.style.left = (e.clientX + 14) + 'px';
            tooltip.style.top  = (e.clientY + 14) + 'px';
            tooltip.textContent = node.content || node.name || node.id;
            renderer.domElement.style.cursor = 'pointer';
        } else {
            tooltip.style.display = 'none';
            renderer.domElement.style.cursor = '';
        }
    });

    let _pointerDownAt = null;
    renderer.domElement.addEventListener('pointerdown', e => {
        _pointerDownAt = { x: e.clientX, y: e.clientY };
    });
    renderer.domElement.addEventListener('pointerup', e => {
        if (!_pointerDownAt) return;
        const moved = Math.hypot(e.clientX - _pointerDownAt.x, e.clientY - _pointerDownAt.y);
        _pointerDownAt = null;
        if (moved > 5) return;
        const node = getNodeAt(e);
        if (node) { onNodeClick?.(node); return; }
        const link = getLinkAt(e);
        if (link) { onLinkClick?.(link); }
    });

    // ── Drag ─────────────────────────────────────────────────────────
    // On grab: unpin the node, boost simulation energy so neighbours respond
    // On release: leave node unpinned — simulation settles it naturally
    // The node will drift slightly as springs re-equilibrate; that's correct.
    // Call onNodeDrag so app.js can offer "save position" if the user wants to lock it.

    renderer.domElement.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        const node = getNodeAt(e);
        if (!node) return;
        _dragNode = node;
        _dragShiftZ = e.shiftKey;
        controls.enabled = false;

        // Unpin so the simulation can respond
        delete node.fx;
        delete node.fy;

        if (_simulation) _simulation.alpha(0.3).restart();

        const nodePos = new THREE.Vector3(node.x, node.y, node.z);

        if (_dragShiftZ) {
            // Z drag: map vertical mouse movement to Z world units
            _dragStartZ       = node.z;
            _dragStartScreenY = e.clientY;
        } else {
            _dragPlane.setFromNormalAndCoplanarPoint(
                camera.getWorldDirection(new THREE.Vector3()).negate(),
                nodePos
            );
            screenToMouse(e);
            const hit = new THREE.Vector3();
            raycaster.ray.intersectPlane(_dragPlane, hit);
            _dragOffset.copy(hit).sub(nodePos);
        }
    });

    renderer.domElement.addEventListener('pointermove', e => {
        if (!_dragNode) return;

        if (_dragShiftZ) {
            // Shift-drag: vertical mouse movement maps to Z
            // 1px up = +1 world unit (adjust Z_SENSITIVITY to taste)
            const Z_SENSITIVITY = 1.2;
            const deltaY = _dragStartScreenY - e.clientY; // up = positive Z
            _dragNode.z = _dragStartZ + deltaY * Z_SENSITIVITY;
            _syncNode(_dragNode);
            _rebuildLinksFor(_dragNode.id);
        } else {
            screenToMouse(e);
            const hit = new THREE.Vector3();
            raycaster.ray.intersectPlane(_dragPlane, hit);
            hit.sub(_dragOffset);
            _dragNode.x  = hit.x;
            _dragNode.y  = hit.y;
            _dragNode.fx = hit.x;
            _dragNode.fy = hit.y;
            _syncNode(_dragNode);
            _rebuildLinksFor(_dragNode.id);
        }
    });

    renderer.domElement.addEventListener('pointerup', () => {
        if (!_dragNode) return;
        const node  = _dragNode;
        _dragNode   = null;
        controls.enabled = true;

        if (_dragShiftZ) {
            // Z drag ended — keep Z where it landed, no simulation involvement
            _dragShiftZ = false;
        } else {
            // XY drag ended — release pin, let springs settle
            delete node.fx;
            delete node.fy;
            if (_simulation) _simulation.alpha(0.3).restart();
        }

        onNodeDrag?.(node);
    });

    window.addEventListener('resize', () => {
        const W = container.clientWidth  || window.innerWidth;
        const H = container.clientHeight || window.innerHeight;
        camera.aspect = W / H;
        camera.updateProjectionMatrix();
        renderer.setSize(W, H);
    });

    function _syncNode(node) {
        const e = nodeMeshes.get(node.id);
        if (!e) return;
        e.group.position.set(node.x, node.y, node.z);
        e.labelSprite.position.set(node.x, node.y + e.radius + 8, node.z);
        if (e.ring) e.ring.position.set(node.x, node.y, node.z);
    }

function _addNode(node) {
    const rawType = node.parent_type || node.node_type || 'Concept';
    const type = rawType.charAt(0).toUpperCase() + rawType.slice(1);
    const baseColor = TYPE_COLORS[type] || '#445070';
    
    // Get shape/material/size from node properties (with defaults)
    const shape = node.shape || 'sphere';
    const materialType = node.material || 'matte';
    let size = node.size || 5.6;
    
    // Override with custom color if set
    const customColor = node.node_color;
    const color = customColor || _tintColor(baseColor, 0.6 + ((node.abstraction_level ?? 3) / 5) * 0.4);
    
    // Create geometry based on shape
    let geometry;
    switch(shape) {
        case 'cube':
            geometry = new THREE.BoxGeometry(size, size, size);
            break;
        case 'octahedron':
            geometry = new THREE.OctahedronGeometry(size);
            break;
        case 'tetrahedron':
            geometry = new THREE.TetrahedronGeometry(size);
            break;
        case 'cone':
            geometry = new THREE.ConeGeometry(size * 0.8, size * 1.2, 16);
            break;
        default:
            geometry = new THREE.SphereGeometry(size, 24, 18);
    }
    
    // Create material
    let material;
    switch(materialType) {
        case 'standard':
            material = new THREE.MeshStandardMaterial({
                color: hexToThreeColor(color),
                roughness: 0.5,
                metalness: 0.3
            });
            break;
        case 'glossy':
            material = new THREE.MeshStandardMaterial({
                color: hexToThreeColor(color),
                roughness: 0.2,
                metalness: 0.8
            });
            break;
        case 'wireframe':
            material = new THREE.MeshBasicMaterial({
                color: hexToThreeColor(color),
                wireframe: true
            });
            break;
        default: // matte
            material = new THREE.MeshStandardMaterial({
                color: hexToThreeColor(color),
                roughness: 0.8,
                metalness: 0.05
            });
    }
    
    const group = new THREE.Group();
    group.add(new THREE.Mesh(geometry, material));
    group.position.set(node.x, node.y, node.z);
    scene.add(group);
    
    // Label
    const rawLabel = node.name || node.content || '...';
    const label = rawLabel.length > 19 ? rawLabel.slice(0, 19) + '…' : rawLabel;
    const sprite = makeLabelSprite(label, color);
    sprite.position.set(node.x, node.y + size + 8, node.z);
    scene.add(sprite);
    
    nodeMeshes.set(node.id, { group, labelSprite: sprite, ring: null, radius: size });
}

    // ── Thick time — ontological weight of the relation ────────────────────────────
    // Reflected in bead size and particle density.
    const BONCUK_THRESHOLD = 3.0;
    const BONCUK_MAX_R     = 5.5;
    const BONCUK_MIN_R     = 1.2;

    function _nodeThickScore(node) {
        if (!node) return 1;
        let s = 1;
        try {
            const nid      = node.id || node.node_id;
            const entries  = JSON.parse(localStorage.getItem('drift_log_entries') || '[]');
            const comments = JSON.parse(localStorage.getItem('drift_node_comments') || '{}');
            if (entries.some(e => (e.crystals||[]).some(c => c.nodeId === nid))) s += 1;
            const nc = comments[nid] || [];
            if (nc.some(c => c.type === 'inner')) s += 1;
            if (nc.some(c => c.type === 'outer')) s += 1;
        } catch {}
        if (node.ontology_status === 'deconstructed') s += 1;
        return Math.min(s, 4);
    }

    function _thickScore(src, tgt, link) {
        const typeBonus = {
            HAUNTS:            2.0, OPENS_INTO:        2.0,
            SEDIMENTS_INTO:    1.5, DETERRITORIALIZES: 1.5,
            RETERRITORIALIZES: 1.5, FRICTION:          1.0,
            CONTAMINATES:      1.0, SUPPLEMENTS:       1.0,
            RESONATES_WITH:    0.5, INTENSIFIES:       0.5,
        }[(link.rel_type||'').toUpperCase()] || 0;

        const ontoBonus = {
            deconstructed: 1.5, suspended: 1.0,
            flowing: 0.5,       crystallized: 0,
        }[link.ontology_status || 'crystallized'] || 0;

        return _nodeThickScore(src) + _nodeThickScore(tgt) + typeBonus + ontoBonus;
    }

        function _tubeRadius(w) {
        return 0.325 + w * 1.3;
    }

    function _addLink(link) {
        const srcId = link.source?.id ?? link.source;
        const tgtId = link.target?.id ?? link.target;
        const src   = _graphData.nodes.find(n => n.id === srcId);
        const tgt   = _graphData.nodes.find(n => n.id === tgtId);
        if (!src || !tgt) return;

        const relType = (link.rel_type || link.relation_type || '').toUpperCase().trim();
        const baseHex = link.color || REL_COLORS[relType] || '#445070';
        const conf    = link.confidence ?? 0.75;
        const w       = link.weight ?? 1.0;

        // Layer-based visual grammar:
        // logical → straight, full opacity
        // dynamic  → curved (more bend in buildCurvePoints), medium opacity
        // uncertain → dotted, low opacity
        const layer   = link.layer || 'logical';
        const onto    = link.ontology_status || 'crystallized';

        const ontoOpacity = {
            crystallized:  1.0,
            suspended:     0.55,
            deconstructed: 0.85,
            flowing:       0.35,
        }[onto] || 1.0;

        const layerOpacityMult = {
            logical:   1.0,
            dynamic:   0.75,
            uncertain: 0.45,
        }[layer] || 1.0;

        const alpha = (0.08 + conf * 0.30) * ontoOpacity * layerOpacityMult;

        const curvePoints = buildCurvePoints(src, tgt, link);
        const tr     = _tubeRadius(w);
        const segs   = curvePoints.length > 2 ? 20 : 1;
        const tube   = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curvePoints), segs, tr, 5, false);
        const line   = new THREE.Mesh(tube, new THREE.MeshBasicMaterial({
            color: hexToThreeColor(baseHex),
            transparent: true,
            opacity: alpha,
            depthWrite: false,
        }));
        scene.add(line);

        const last = curvePoints.length - 1;
        const prev = curvePoints.length - 2;
        const arrowDir = new THREE.Vector3()
            .subVectors(curvePoints[last], curvePoints[prev])
            .normalize();
        const arrow = new THREE.Mesh(
            new THREE.ConeGeometry(tr * 2.2, tr * 4.5, 8),
            new THREE.MeshBasicMaterial({
                color: hexToThreeColor(baseHex),
                transparent: true,
                opacity: Math.min(alpha + 0.15, 1.0),
            })
        );
        arrow.position.copy(curvePoints[last]);
        arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), arrowDir);
        scene.add(arrow);

        // ── Thick time ───────────────────────────────────────────────────────────
        const thick = _thickScore(src, tgt, link);

        // Particles — flowing relations fast and many, crystallized slow and few
        const ontoFlowMult = {
            flowing: 2.2, suspended: 1.5, deconstructed: 1.2, crystallized: 0.6,
        }[onto] || 1.0;
        const count = Math.round(1 + w * 2 + thick * 0.7 * ontoFlowMult);
        const pGeo  = new THREE.BufferGeometry();
        pGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
        const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({
            color:       hexToThreeColor(baseHex),
            size:        0.8 + w * 1.2 + thick * 0.12,
            transparent: true,
            opacity:     Math.min(0.7 + thick * 0.04, 0.95),
            depthWrite:  false,
        }));
        const baseSpeed = onto === 'flowing'     ? 0.0040 :
                          onto === 'suspended'   ? 0.0022 :
                          onto === 'crystallized'? 0.0010 : 0.0018;
        particles.userData.offsets = Array.from({ length: count }, (_, i) => i / count);
        particles.userData.speed   = baseSpeed + w * 0.0005 + thick * 0.0002;
        scene.add(particles);

        // Bead — appears at midpoint of edges that cross the threshold
        let boncuk = null;
        if (thick >= BONCUK_THRESHOLD && curvePoints.length > 1) {
            const midPt = curvePoints[Math.floor(curvePoints.length / 2)];
            const bR    = Math.min(BONCUK_MIN_R + (thick - BONCUK_THRESHOLD) * 0.52, BONCUK_MAX_R);
            const bOp   = layer === 'dynamic' ? 0.55 : 0.32;
            boncuk = new THREE.Mesh(
                new THREE.SphereGeometry(bR, 10, 8),
                new THREE.MeshBasicMaterial({
                    color:       hexToThreeColor(baseHex),
                    transparent: true,
                    opacity:     bOp,
                    depthWrite:  false,
                })
            );
            boncuk.position.copy(midPt);
            scene.add(boncuk);
        }

        const lid = link._id || link.id || `${srcId}__${tgtId}__${relType}`;
        link._id  = lid;
        linkMeshes.set(lid, { line, arrow, particles, boncuk, curvePoints, srcId, tgtId, link });
    }

    function _rebuildLinksFor(nodeId) {
        for (const [, entry] of linkMeshes) {
            if (entry.srcId !== nodeId && entry.tgtId !== nodeId) continue;
            const src = _graphData.nodes.find(n => n.id === entry.srcId);
            const tgt = _graphData.nodes.find(n => n.id === entry.tgtId);
            if (!src || !tgt) continue;
            const pts = buildCurvePoints(src, tgt, entry.link);
            entry.curvePoints = pts;
            scene.remove(entry.line);
            entry.line.geometry.dispose();
            const w  = entry.link.weight ?? 1.0;
            const tr = _tubeRadius(w);
            entry.line.geometry = new THREE.TubeGeometry(
                new THREE.CatmullRomCurve3(pts), pts.length > 2 ? 20 : 1, tr, 5, false
            );
            scene.add(entry.line);
            const last = pts.length - 1;
            const prev = pts.length - 2;
            entry.arrow.position.copy(pts[last]);
            entry.arrow.quaternion.setFromUnitVectors(
                new THREE.Vector3(0,1,0),
                new THREE.Vector3().subVectors(pts[last], pts[prev]).normalize()
            );
            // Update bead midpoint
            if (entry.boncuk) {
                const midIdx = Math.floor(pts.length / 2);
                entry.boncuk.position.copy(pts[midIdx]);
            }
        }
    }

    function _clearScene() {
        for (const { group, labelSprite, ring } of nodeMeshes.values()) {
            scene.remove(group); scene.remove(labelSprite);
            if (ring) scene.remove(ring);
        }
        for (const { line, arrow, particles, boncuk } of linkMeshes.values()) {
            scene.remove(line); scene.remove(arrow); scene.remove(particles);
            if (boncuk) scene.remove(boncuk);
            line.geometry?.dispose();
        }
        nodeMeshes.clear();
        linkMeshes.clear();
    }

    function _tickParticles() {
        for (const { particles, curvePoints } of linkMeshes.values()) {
            if (!curvePoints?.length) continue;
            const offsets = particles.userData.offsets;
            const speed   = particles.userData.speed;
            const pos     = particles.geometry.attributes.position;
            const n       = curvePoints.length - 1;
            for (let i = 0; i < offsets.length; i++) {
                offsets[i] = (offsets[i] + speed) % 1;
                const t   = offsets[i];
                const idx = Math.min(Math.floor(t * n), n - 1);
                const f   = t * n - idx;
                const p0  = curvePoints[idx];
                const p1  = curvePoints[idx + 1] || p0;
                pos.setXYZ(i, p0.x + (p1.x-p0.x)*f, p0.y + (p1.y-p0.y)*f, p0.z + (p1.z-p0.z)*f);
            }
            pos.needsUpdate = true;
        }
    }

    function _animate() {
        requestAnimationFrame(_animate);

        // Tick simulation every frame if it has energy
        // alphaMin is 0.005 so it keeps running at near-rest, enforcing spring lengths
        if (_simulation && _simulation.alpha() > _simulation.alphaMin()) {
            _simulation.tick();
            for (const node of _graphData.nodes) _syncNode(node);
            const visited = new Set();
            for (const node of _graphData.nodes) {
                if (visited.has(node.id)) continue;
                visited.add(node.id);
                _rebuildLinksFor(node.id);
            }
        }

        _tickParticles();
        controls.update();
        renderer.render(scene, camera);
    }
    _animate();

    return {
        graphData(data) {
            if (!data) return _graphData;
            _graphData = data;
            _clearScene();
            data.links.forEach(l => {
                if (typeof l.source === 'object' && l.source !== null) l.source = l.source.id;
                if (typeof l.target === 'object' && l.target !== null) l.target = l.target.id;
            });
            data.nodes.forEach(n => _addNode(n));
            data.links.forEach(l => _addLink(l));
            return this;
        },

        cameraPosition(pos, lookAt, duration = 1000) {
            const startPos  = camera.position.clone();
            const startTgt  = controls.target.clone();
            const endPos    = new THREE.Vector3(pos.x, pos.y, pos.z);
            const endTgt    = lookAt ? new THREE.Vector3(lookAt.x, lookAt.y, lookAt.z) : startTgt;
            const t0        = performance.now();
            const fly = () => {
                const t = Math.min((performance.now() - t0) / duration, 1);
                const e = t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
                camera.position.lerpVectors(startPos, endPos, e);
                controls.target.lerpVectors(startTgt, endTgt, e);
                if (t < 1) requestAnimationFrame(fly);
            };
            if (duration > 0) fly();
            else { camera.position.set(pos.x, pos.y, pos.z); }
            return this;
        },

        scene() { return scene; },

        // Called by reflowGraph — hands off the simulation so the render loop ticks it
        _setSimulation(sim) {
            _simulation = sim;
        },

        // Pin a specific node at its current XY (called from app.js save flow)
        pinNode(nodeId) {
            const node = _graphData.nodes.find(n => n.id === nodeId);
            if (node) { node.fx = node.x; node.fy = node.y; }
        },

        // Move a node to a new Z immediately — updates mesh + all connected links
        moveNodeZ(nodeId, newZ) {
            const node = _graphData.nodes.find(n => n.id === nodeId);
            if (!node) return;
            node.z = newZ;
            _syncNode(node);
            _rebuildLinksFor(nodeId);
        },

        // Show or hide all label sprites — called by toggleLabels in app.js
        setLabelsVisible(visible) {
            for (const { labelSprite } of nodeMeshes.values()) {
                labelSprite.visible = visible;
            }
        },

        // Isolation mode: dim everything outside memberIds
        setIsolation(memberIds) {
            const inSet = new Set(memberIds);

            for (const [nodeId, { group, labelSprite }] of nodeMeshes) {
                const isMember = inSet.has(nodeId);
                group.children.forEach((child, i) => {
                    if (child.material) {
                        child.material.transparent = true;
                        // i===0 solid mesh, i===1 wireframe overlay (discussion nodes only)
                        const fullOpacity = i === 0 ? 1.0 : 0.45;
                        child.material.opacity = isMember ? fullOpacity : 0.07;
                    }
                });
                labelSprite.material.opacity = isMember ? 0.9 : 0.0;
            }

            for (const { line, arrow, particles, boncuk, srcId, tgtId, link } of linkMeshes.values()) {
                const isMemberLink = inSet.has(srcId) && inSet.has(tgtId);
                const conf  = link.confidence ?? 0.75;
                const w     = link.weight ?? 1.0;
                const alpha = 0.08 + conf * 0.30;
                if (line.material) {
                    line.material.transparent = true;
                    line.material.opacity = isMemberLink ? alpha : 0.02;
                }
                if (arrow.material) {
                    arrow.material.transparent = true;
                    arrow.material.opacity = isMemberLink ? Math.min(alpha + 0.15, 1.0) : 0.02;
                }
                if (particles.material) {
                    particles.material.transparent = true;
                    particles.material.opacity = isMemberLink ? 0.9 : 0.0;
                }
                if (boncuk?.material) {
                    boncuk.material.transparent = true;
                    boncuk.material.opacity = isMemberLink ? boncuk.material.opacity : 0.0;
                }
            }

            // Compute centroid + bounding radius for camera fly-to
            const members = _graphData.nodes.filter(n => inSet.has(n.id));
            if (!members.length) return { cx: 0, cy: 0, cz: 0, radius: 60 };
            const cx = members.reduce((s, n) => s + (n.x || 0), 0) / members.length;
            const cy = members.reduce((s, n) => s + (n.y || 0), 0) / members.length;
            const cz = members.reduce((s, n) => s + (n.z || 0), 0) / members.length;
            const radius = Math.max(
                60,
                members.reduce((m, n) => Math.max(m, Math.hypot(
                    (n.x||0)-cx, (n.y||0)-cy, (n.z||0)-cz
                )), 0)
            );
            return { cx, cy, cz, radius };
        },

        clearIsolation() {
            for (const { group, labelSprite } of nodeMeshes.values()) {
                group.children.forEach((child, i) => {
                    if (child.material) {
                        child.material.transparent = i !== 0; // wireframe stays transparent
                        child.material.opacity = i === 0 ? 1.0 : 0.45;
                    }
                });
                labelSprite.material.opacity = 0.9;
            }
            for (const { line, arrow, particles, boncuk, link } of linkMeshes.values()) {
                const conf  = link.confidence ?? 0.75;
                const w     = link.weight ?? 1.0;
                const alpha = 0.08 + conf * 0.30;
                if (line.material)      { line.material.opacity = alpha; }
                if (arrow.material)     { arrow.material.opacity = Math.min(alpha + 0.15, 1.0); }
                if (particles.material) { particles.material.opacity = 0.9; }
                if (boncuk?.material)   { boncuk.material.opacity = 0.35; }
            }
        },
    };
}

// ─────────────────────────────────────────────
// reflowGraph
// Builds a simulation that stays alive at low alpha.
// Springs enforce distances; similarity force clusters by type.
// ─────────────────────────────────────────────

export function reflowGraph(graphHandle, graphData) {
    if (!graphData?.nodes?.length) return;

    const nodeCount = graphData.nodes.length;
    // Charge: weak enough that link springs win, strong enough to prevent overlap
    const chargeStr = -Math.min(20 + nodeCount * 1.0, 120);

    // Release only XY pins so the simulation can reflow the 2D layout.
    // Z is epoch/version controlled by the user — never touch it here.
    graphData.nodes.forEach(n => { delete n.fx; delete n.fy; /* keep n.fz / n.z intact */ });

    const sim = d3.forceSimulation(graphData.nodes)
        // alphaMin kept above 0 so the simulation never fully stops —
        // it idles at low energy, continuously enforcing spring lengths
        .alphaMin(0.005)
        .alphaDecay(0.02)
        .velocityDecay(0.45)       // higher damping = less oscillation at rest
        .force('link', d3.forceLink(graphData.links)
            .id(n => n.id)
            .distance(l => edgeDistance(l))
            .strength(l => {
                const t = (l.rel_type || l.relation_type || '').toUpperCase().trim();
                if (t === 'HAS_VERSION') return 0.05;
                // Stronger springs for heavier relations so they enforce distance more firmly
                const w = l.weight ?? 1.0;
                return 0.4 + w * 0.5;  // weight=0 → 0.4,  weight=1 → 0.9
            })
            .iterations(3)
        )
        .force('charge',    d3.forceManyBody().strength(chargeStr))
        .force('center',    d3.forceCenter(0, 0).strength(0.02))
        .force('similarity', forceSimilarityCluster(0.04))
        .force('relatedAttraction', forceRelatedAttraction(0.06));  // ← ADD THIS LINE

            const relatedForce = sim.force('relatedAttraction');
    if (relatedForce && relatedForce.links) {
        relatedForce.links(graphData.links);
    }


    // Hand simulation to the render loop — don't call .stop()
    graphHandle._setSimulation(sim);

    const f1 = document.createElement('div');
    f1.className = 'success-flash';
    f1.textContent = '⬡ Layout running — drag freely';
    document.body.appendChild(f1);
    setTimeout(() => f1.remove(), 2500);
}

const _suggestionLines = [];

export function drawSuggestionVectors(scene, fromNode, toNodes) {
    clearSuggestionVectors(scene);
    toNodes.forEach(({ node, color = '#00c8a0', label = '' }) => {
        const pts = [
            new THREE.Vector3(fromNode.x, fromNode.y, fromNode.z),
            new THREE.Vector3(node.x,     node.y,     node.z),
        ];
        const geo  = new THREE.BufferGeometry().setFromPoints(pts);
        const mat  = new THREE.LineDashedMaterial({
            color: new THREE.Color(color), dashSize: 6, gapSize: 4,
            transparent: true, opacity: 0.55,
        });
        const line = new THREE.Line(geo, mat);
        line.computeLineDistances();
        scene.add(line);
        _suggestionLines.push(line);
        if (label) {
            const mid = pts[0].clone().lerp(pts[1], 0.5);
            mid.y += 8;
            const sprite = makeLabelSprite(label, color);
            sprite.position.copy(mid);
            scene.add(sprite);
            _suggestionLines.push(sprite);
        }
    });
}

export function clearSuggestionVectors(scene) {
    _suggestionLines.forEach(o => scene.remove(o));
    _suggestionLines.length = 0;
}