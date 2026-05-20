/**
 * Tests for useVolumeButtons hook.
 *
 * Because this project has no @testing-library/react-hooks or react-dom, we
 * test by capturing the useEffect callback via a React mock and executing it
 * synchronously, which gives us the same guarantees as renderHook.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockAddVolumeListener = jest.fn();
const mockRemoveListener = jest.fn();
const mockShowNativeVolumeUI = jest.fn();
const mockSetVolume = jest.fn();
const mockVolumeManager = {
  addVolumeListener: mockAddVolumeListener,
  showNativeVolumeUI: mockShowNativeVolumeUI,
  setVolume: mockSetVolume,
};

jest.mock('react-native-volume-manager', () => ({
  __esModule: true,
  VolumeManager: mockVolumeManager,
  default: mockVolumeManager,
}));

// Capture the effect callback so we can invoke it directly in each test.
type EffectCallback = () => (() => void) | void;
let capturedEffect: EffectCallback | null = null;
let capturedDeps: unknown[] | null = null;

jest.mock('react', () => {
  const actual = jest.requireActual<typeof import('react')>('react');
  return {
    ...actual,
    useEffect: (fn: EffectCallback, deps?: unknown[]) => {
      capturedEffect = fn;
      capturedDeps = deps ?? null;
    },
    // Provide a minimal useRef that works without a React renderer/dispatcher.
    useRef: <T>(initial: T) => ({ current: initial } as { current: T }),
  };
});

// ─── Import under test (after mocks are registered) ───────────────────────────

import { useVolumeButtons } from './useVolumeButtons';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * "Render" the hook: calls the hook function (which triggers our mock useEffect)
 * then runs the captured effect synchronously.
 *
 * Returns a cleanup function mirroring `unmount()` from renderHook.
 */
function renderHook(options: Parameters<typeof useVolumeButtons>[0]): {
  unmount: () => void;
  rerender: (newOptions: Parameters<typeof useVolumeButtons>[0]) => void;
} {
  capturedEffect = null;
  capturedDeps = null;

  useVolumeButtons(options);

  let cleanup: (() => void) | void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const effect = capturedEffect as any as (() => (() => void) | void) | null;
  if (effect) {
    cleanup = effect();
  }

  return {
    unmount: () => {
      if (typeof cleanup === 'function') cleanup();
    },
    rerender: (newOptions) => {
      if (typeof cleanup === 'function') cleanup();
      capturedEffect = null;
      capturedDeps = null;
      useVolumeButtons(newOptions);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const newEffect = capturedEffect as any as (() => (() => void) | void) | null;
      if (newEffect) {
        cleanup = newEffect();
      }
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useVolumeButtons', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Restore the default mock return value after clearAllMocks resets it.
    mockAddVolumeListener.mockReturnValue({ remove: mockRemoveListener });
  });

  it('does not register listener when disabled', () => {
    renderHook({ enabled: false, onDelta: jest.fn() });
    expect(mockAddVolumeListener).not.toHaveBeenCalled();
  });

  it('registers listener and hides HUD when enabled', () => {
    renderHook({ enabled: true, onDelta: jest.fn() });
    expect(mockAddVolumeListener).toHaveBeenCalled();
    expect(mockShowNativeVolumeUI).toHaveBeenCalledWith({ enabled: false });
  });

  it('calls onDelta(+0.05) when volume increases above neutral', () => {
    const onDelta = jest.fn();
    renderHook({ enabled: true, onDelta });

    const listener = mockAddVolumeListener.mock.calls[0][0] as (r: { volume: number }) => void;
    listener({ volume: 0.6 });

    expect(onDelta).toHaveBeenCalledWith(0.05);
  });

  it('calls onDelta(-0.05) when volume decreases below neutral', () => {
    const onDelta = jest.fn();
    renderHook({ enabled: true, onDelta });

    const listener = mockAddVolumeListener.mock.calls[0][0] as (r: { volume: number }) => void;
    listener({ volume: 0.4 });

    expect(onDelta).toHaveBeenCalledWith(-0.05);
  });

  it('resets volume to neutral after each button press', () => {
    renderHook({ enabled: true, onDelta: jest.fn() });

    const listener = mockAddVolumeListener.mock.calls[0][0] as (r: { volume: number }) => void;
    // The initial setVolume call on mount + one reset inside the listener.
    const callsBefore = mockSetVolume.mock.calls.length;
    listener({ volume: 0.6 });
    expect(mockSetVolume.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('removes listener and restores HUD on cleanup', () => {
    const { unmount } = renderHook({ enabled: true, onDelta: jest.fn() });
    unmount();
    expect(mockRemoveListener).toHaveBeenCalled();
    expect(mockShowNativeVolumeUI).toHaveBeenCalledWith({ enabled: true });
  });

  it('does not call onDelta for noise (volume exactly at neutral)', () => {
    const onDelta = jest.fn();
    renderHook({ enabled: true, onDelta });

    const listener = mockAddVolumeListener.mock.calls[0][0] as (r: { volume: number }) => void;
    listener({ volume: 0.5 });

    expect(onDelta).not.toHaveBeenCalled();
  });
});
