/**
 * ui.js — barrel file
 * Assembles all UI modules into a single `UI` object matching
 * the shape app.js already depends on. No behaviour changes.
 */

// ── Utils
export { showFlash }                     from './ui/utils/flash.js';
export { resolveRelColor,
         cosineSimilarity }              from './ui/utils/colors.js';
export { suggestPositionFromGraph,
         showGraphAwareExplanation,
         repelFromOverlap,
         placeOpposite,
         suggestPositionFromSimilarity,
         showPlacementExplanation }      from './ui/utils/placement.js';

// ── Modals
import { renderAddNodeModal,
         renderEditNodeModal }           from './ui/modals/node-modal.js';
import { renderRelationModal,
         renderEditRelationModal }       from './ui/modals/relation-modal.js';
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

// ── showPlacementExplanation
import { showPlacementExplanation }      from './ui/utils/placement.js';

// ── Link mode status (too small for its own file)
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
};

// Expose on window so inline onclick handlers in inspector HTML work
window.UI = UI;

// Legacy globals still referenced via window.*
import { suggestPositionFromGraph,
         showGraphAwareExplanation }     from './ui/utils/placement.js';
window.suggestPositionFromGraph  = suggestPositionFromGraph;
window.showGraphAwareExplanation = showGraphAwareExplanation;