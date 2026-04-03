/**
 * ui.js — barrel file
 * Assembles all UI modules into a single `UI` object.
 */

// ── Utils — re-exported for external consumers
export { showFlash }                     from './ui/utils/flash.js';
export { resolveRelColor,
         cosineSimilarity,
         resolveRelStyle,
         ONTOLOGY_STYLES }               from './ui/utils/colors.js';
export { repelFromOverlap,
         placeOpposite,
         suggestPositionFromSimilarity } from './ui/utils/placement.js';

// ── Placement — imported (not re-exported) so we can attach to window.*
import { showPlacementExplanation,
         suggestPositionFromGraph,
         showGraphAwareExplanation }     from './ui/utils/placement.js';

// ── Modals
import { renderAddNodeModal,
         renderEditNodeModal }           from './ui/modals/node-modal.js';
import { renderRelationModal,
         renderEditRelationModal,
         DYNAMIC_REL_TYPES,
         REL_STATUS_ONTOLOGY }          from './ui/modals/relation-modal.js';
import { renderDiscussionNodeModal,
         showDiscussionSelectionBanner } from './ui/modals/discussion-modal.js';

// ── Panels
import { renderNodeInspector }           from './ui/panels/node-inspector.js';
import { renderRelationInspector }       from './ui/panels/relation-inspector.js';
import { renderAIChallenge }             from './ui/panels/ai-challenge.js';
import { renderAIAnalyzePanel,
         renderAISuggestionPanel }       from './ui/modals/ai-modal.js';
import { renderSettingsPanel }           from './ui/panels/settings-panel.js';

// ── HUD
import { renderEpistemicLogPrompt }      from './ui/hud/epistemic-log.js';
import { setupSearch, initLegends }      from './ui/hud/search.js';
import { openDriftCapture,
         openDriftArchive,
         linkCrystalToNode,
         getTimeLayersForNode,
         openTimeLayerPanel }            from './ui/hud/drift-log.js';

// ── Re-export dynamic relation types for external consumers
export { DYNAMIC_REL_TYPES, REL_STATUS_ONTOLOGY };

// ── Link mode status
function setLinkModeStatus(msg) {
    const el = document.getElementById('link-mode-indicator');
    if (!el) return;
    if (msg) { el.style.display = 'block'; el.innerText = msg; }
    else     { el.style.display = 'none'; }
}

// ── Assembled UI object
export const UI = {
    setLinkModeStatus,
    renderAddNodeModal,
    renderEditNodeModal,
    renderRelationModal,
    renderEditRelationModal,
    renderDiscussionNodeModal,
    showDiscussionSelectionBanner,
    renderNodeInspector,
    renderRelationInspector,
    renderAIChallenge,
    renderAIAnalyzePanel,
    renderAISuggestionPanel,
    renderSettingsPanel,
    renderEpistemicLogPrompt,
    showPlacementExplanation,
    setupSearch,
    initLegends,
    openDriftCapture,
    openDriftArchive,
    linkCrystalToNode,
    getTimeLayersForNode,
    openTimeLayerPanel,
};

// Expose on window so inline onclick handlers in inspector HTML work
window.UI = UI;

// Legacy globals referenced via window.* in app.js
window.suggestPositionFromGraph  = suggestPositionFromGraph;
window.showGraphAwareExplanation = showGraphAwareExplanation;