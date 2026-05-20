import { useEffect, useRef } from 'react';
import type { VolumeManager as VolumeManagerType } from 'react-native-volume-manager';

const NEUTRAL_VOLUME = 0.5;

// Lazy-load so a missing native link doesn't crash the app at import time.
let vm: typeof VolumeManagerType | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  vm = require('react-native-volume-manager').VolumeManager as typeof VolumeManagerType;
} catch {
  if (__DEV__) {
    console.warn('[useVolumeButtons] react-native-volume-manager is not linked. Run expo run:android / expo run:ios to rebuild the native app.');
  }
}

export function useVolumeButtons(options: {
  enabled: boolean;
  onDelta: (delta: number) => void;
}): void {
  const { enabled, onDelta } = options;

  const onDeltaRef = useRef(onDelta);
  onDeltaRef.current = onDelta;

  useEffect(() => {
    if (!enabled || !vm) return;

    void vm.showNativeVolumeUI({ enabled: false });
    // Set music stream to neutral so we can detect button direction.
    void vm.setVolume(NEUTRAL_VOLUME, { type: 'music', showUI: false });

    const subscription = vm.addVolumeListener((result) => {
      // On Android the listener fires for all streams (ring, call, etc.).
      // Only act on music stream events so ring-volume changes don't send spurious deltas.
      if (result.type && result.type !== 'music') return;

      const delta = result.volume - NEUTRAL_VOLUME;
      // Reset immediately so the next press has a neutral baseline.
      void vm!.setVolume(NEUTRAL_VOLUME, { type: 'music', showUI: false });

      // Ignore noise (the reset call itself re-fires with delta ≈ 0).
      if (Math.abs(delta) > 0.01) {
        onDeltaRef.current(delta > 0 ? 0.05 : -0.05);
      }
    });

    return () => {
      subscription.remove();
      void vm!.showNativeVolumeUI({ enabled: true });
    };
  }, [enabled]);
}
