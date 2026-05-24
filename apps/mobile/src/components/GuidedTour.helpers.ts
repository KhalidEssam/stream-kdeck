export interface SpotlightRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const PADDING = 10;
const RADIUS = 12;
const TOOLTIP_CLEARANCE = 160;

/**
 * Builds an SVG path string with an evenodd fill-rule hole.
 * Outer path = full screen rectangle.
 * Inner path = rounded rectangle over the target element (with PADDING).
 * Result: screen is dark except for the spotlight cutout.
 */
export function buildSpotlightPath(
  screen: { width: number; height: number },
  rect: SpotlightRect | null,
): string {
  const { width: sw, height: sh } = screen;
  const outer = `M0,0 H${sw} V${sh} H0 Z`;
  if (!rect) return outer;

  const x = rect.x - PADDING;
  const y = rect.y - PADDING;
  const w = rect.width + PADDING * 2;
  const h = rect.height + PADDING * 2;
  const r = RADIUS;

  const hole =
    `M${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r}` +
    ` V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h}` +
    ` H${x + r} Q${x},${y + h} ${x},${y + h - r}` +
    ` V${y + r} Q${x},${y} ${x + r},${y} Z`;

  return `${outer} ${hole}`;
}

export interface TooltipStyle {
  top?: number;
  bottom?: number;
  left: number;
  right: number;
}

/**
 * Returns absolute positioning style for the tooltip card.
 * Tries the preferred side; falls back to opposite if clearance < TOOLTIP_CLEARANCE.
 * "above" → bottom-anchored (tooltip sits above the spotlight).
 * "below" → top-anchored (tooltip sits below the spotlight).
 */
export function resolveTooltipStyle(
  rect: SpotlightRect,
  preferred: 'above' | 'below',
  screenHeight: number,
): TooltipStyle {
  const py = rect.y - PADDING;           // top of spotlight box
  const pyBottom = rect.y + rect.height + PADDING; // bottom of spotlight box

  const spaceAbove = py - 8;
  const spaceBelow = screenHeight - pyBottom - 8;

  const useAbove =
    preferred === 'above'
      ? spaceAbove >= TOOLTIP_CLEARANCE
      : spaceBelow < TOOLTIP_CLEARANCE;

  if (useAbove) {
    return { bottom: screenHeight - py + 8, left: 16, right: 16 };
  }
  return { top: pyBottom + 8, left: 16, right: 16 };
}
