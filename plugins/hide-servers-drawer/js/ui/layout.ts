// Shared layout constants.
//
// Every row (server, DM, folder) is exactly BAR_WIDTH wide with its ICON_SIZE icon centred
// inside it, and the left-edge selection pill is positioned at left: 0 *within* that row.
// That is deliberate: centring a bare ICON_SIZE-wide icon and pushing the pill to a negative
// left offset would paint it outside its own parent's bounds, relying on overflow: "visible"
// (unreliable on Android, and a ScrollView clips its content regardless). Keeping everything
// inside the row's own box needs no overflow tricks.
export const BAR_WIDTH = 72
export const ICON_SIZE = 48

/** Corner radius an icon morphs to while selected (it's a full circle when not). */
export const SELECTED_RADIUS = 16

// Left-edge pill geometry, shared by every row type so they line up exactly. Measured off
// stock screenshots: the selected pill runs ~83% of the icon's height (~40px against a 48px
// icon), and only its right edge is rounded -- stock draws it 8px wide with the left half
// clipped by the screen edge, which reads as a 4px bar flush to the edge with a rounded cap.
export const PILL_WIDTH = 4
export const PILL_SELECTED_HEIGHT = 40
