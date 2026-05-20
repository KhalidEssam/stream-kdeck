import { useEffect, useRef } from 'react';
import VolumeManager from 'react-native-volume-manager';

const NEUTRAL_VOLUME = 0.5;

/**
 * Intercepts hardware volume-button presses when `enabled` is true.
 *
 * When active the OS volume HUD is hidden and the system volume is kept at
 * NEUTRAL_VOLUME (0.5).  Each button press nudges the volume away from
 * neutral; the hook detects the direction, resets the volume back to neutral,
 * and fires `onDelta(+0.05)` for volume-up or `onDelta(-0.05)` for
 * volume-down.
 *
 * On cleanup (unmount or `enabled` toggled to false) the listener is removed
 * and the native volume HUD is restored.
 */
export function useVolumeButtons(options: {
  enabled: boolean;
  onDelta: (delta: number) => void;
}): void {
  const { enabled, onDelta } = options;

  // Keep onDelta stable so the effect closure always calls the latest version.
  const onDeltaRef = useRef(onDelta);
  onDeltaRef.current = onDelta;

  useEffect(() => {
    if (!enabled) return;

    // Hide the native OS volume HUD so it doesn't flash on screen.
    void VolumeManager.showNativeVolumeUI({ enabled: false });

    // Set volume to a neutral midpoint so we can detect both up and down.
    void VolumeManager.setVolume(NEUTRAL_VOLUME, { type: 'music' });

    const subscription = VolumeManager.addVolumeListener((result) => {
      const delta = result.volume - NEUTRAL_VOLUME;

      // Reset immediately so the next press can be detected.
      void VolumeManager.setVolume(NEUTRAL_VOLUME, { type: 'music' });

      // Ignore noise (e.g. the reset call itself firing the listener).
      if (Math.abs(delta) > 0.01) {
        onDeltaRef.current(delta > 0 ? 0.05 : -0.05);
      }
    });

    return () => {
      subscription.remove();
      void VolumeManager.showNativeVolumeUI({ enabled: true });
    };
  }, [enabled]);
}
