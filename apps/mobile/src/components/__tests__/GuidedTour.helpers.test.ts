import { buildSpotlightPath, resolveTooltipStyle } from '../GuidedTour.helpers';

const SCREEN = { width: 390, height: 844 };

describe('buildSpotlightPath', () => {
  it('returns a single closed path when rect is null', () => {
    const path = buildSpotlightPath(SCREEN, null);
    // One "Z" means one sub-path (full-screen rect, no hole)
    expect(path.split('Z').filter(Boolean)).toHaveLength(1);
    expect(path).toMatch(/^M0,0/);
  });

  it('returns two closed sub-paths when rect is provided', () => {
    const path = buildSpotlightPath(SCREEN, { x: 50, y: 100, width: 200, height: 80 });
    // Two "Z" means outer rect + inner hole
    expect(path.split('Z').filter(Boolean)).toHaveLength(2);
  });

  it('applies PADDING=10 to the hole coordinates', () => {
    // rect.x = 50, so hole starts at x = 50 - 10 = 40; with RADIUS=12 the first M is at 52
    const path = buildSpotlightPath(SCREEN, { x: 50, y: 100, width: 200, height: 80 });
    // x - PADDING + RADIUS = 50 - 10 + 12 = 52; y - PADDING = 90
    expect(path).toContain('M52,90');
  });

  it('full-screen path uses correct screen dimensions', () => {
    const path = buildSpotlightPath(SCREEN, null);
    expect(path).toContain(`H${SCREEN.width}`);
    expect(path).toContain(`V${SCREEN.height}`);
  });
});

describe('resolveTooltipStyle', () => {
  // rect at y=300, height=50 → spaceAbove = (300-10)-8 = 282, spaceBelow = 844-(300+50+10)-8 = 476
  const rectMiddle = { x: 10, y: 300, width: 100, height: 50 };

  // rect near top → spaceAbove = (50-10)-8 = 32 < 160
  const rectNearTop = { x: 10, y: 50, width: 100, height: 50 };

  // rect near bottom → spaceBelow = 844-(700+50+10)-8 = 76 < 160
  const rectNearBottom = { x: 10, y: 700, width: 100, height: 50 };

  it('returns bottom-anchored style when preferred=above and space is sufficient', () => {
    const style = resolveTooltipStyle(rectMiddle, 'above', SCREEN.height);
    expect(style).toHaveProperty('bottom');
    expect(style).not.toHaveProperty('top');
    expect(style.left).toBe(16);
    expect(style.right).toBe(16);
  });

  it('falls back to top-anchored style when preferred=above but space < 160', () => {
    const style = resolveTooltipStyle(rectNearTop, 'above', SCREEN.height);
    expect(style).toHaveProperty('top');
    expect(style).not.toHaveProperty('bottom');
  });

  it('returns top-anchored style when preferred=below and space is sufficient', () => {
    const style = resolveTooltipStyle(rectMiddle, 'below', SCREEN.height);
    expect(style).toHaveProperty('top');
    expect(style).not.toHaveProperty('bottom');
  });

  it('falls back to bottom-anchored style when preferred=below but space < 160', () => {
    const style = resolveTooltipStyle(rectNearBottom, 'below', SCREEN.height);
    expect(style).toHaveProperty('bottom');
    expect(style).not.toHaveProperty('top');
  });

  it('bottom value positions tooltip just above the spotlight', () => {
    // spaceAbove is sufficient; bottom = screenHeight - (rect.y - PADDING) + 8
    // = 844 - (300 - 10) + 8 = 844 - 290 + 8 = 562
    const style = resolveTooltipStyle(rectMiddle, 'above', SCREEN.height);
    expect(style.bottom).toBe(562);
  });

  it('top value positions tooltip just below the spotlight', () => {
    // top = rect.y + rect.height + PADDING + 8 = 300 + 50 + 10 + 8 = 368
    const style = resolveTooltipStyle(rectMiddle, 'below', SCREEN.height);
    expect(style.top).toBe(368);
  });
});
