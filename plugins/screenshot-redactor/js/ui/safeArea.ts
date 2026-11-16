/**
 * The shared bottom-padding hook (`shared/ui/safeArea.ts`), re-exported so this plugin's pages
 * keep importing it from here. Fix it there, not here: every plugin uses the same one.
 */
export { useBottomPadding } from '../../../../shared/ui/safeArea'
