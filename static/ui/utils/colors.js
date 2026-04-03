import { REL_COLORS } from '../../graph-component.js';

// Dinamik ilişki renkleri — graph-component'e bağımlı değil
const DYNAMIC_COLORS = {
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

// Ontolojik statü → görsel stil
export const ONTOLOGY_STYLES = {
    crystallized:  { dash: null,        opacity: 1.0,  width: 1.5 },
    suspended:     { dash: [4, 4],      opacity: 0.7,  width: 1.0 },
    deconstructed: { dash: [2, 6],      opacity: 0.85, width: 2.0 },
    flowing:       { dash: [8, 4, 2, 4], opacity: 0.5,  width: 1.0 },
};

export function resolveRelColor(rawType) {
    if (!rawType) return '#445070';
    const upper = rawType.toUpperCase().trim();
    return DYNAMIC_COLORS[upper] || REL_COLORS[upper] || '#445070';
}

export function resolveRelStyle(layer, ontologyStatus) {
    // Mantıksal → düz çizgi
    // Dinamik → eğri (graph-component'te quadratic bezier)
    // Belirsiz → noktalı, soluk
    const style = ONTOLOGY_STYLES[ontologyStatus] || ONTOLOGY_STYLES.crystallized;
    return {
        ...style,
        curve: layer === 'dynamic' ? 0.3 : (layer === 'uncertain' ? 0.15 : 0),
    };
}

export function cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
        dot  += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
    }
    magA = Math.sqrt(magA);
    magB = Math.sqrt(magB);
    if (magA === 0 || magB === 0) return 0;
    return dot / (magA * magB);
}