import { useEffect, useRef } from 'react';
import type { VolumeManager as VolumeManagerType } from 'react-native-volume-manager';

const NEUTRAL_VOLUME = 0.5;

// Lazy-load the native module so a missing link doesn't crash the app at import time.
let vm: typeof VolumeManagerType | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  vm = require('react-native-volume-manager').VolumeManager as typeof VolumeManagerType;
} catch {
  // Native module not linked — volume button interception will be unavailable.
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
    void vm.setVolume(NEUTRAL_VOLUME, { type: 'music' });

    const subscription = vm.addVolumeListener((result) => {
      const delta = result.volume - NEUTRAL_VOLUME;
      void vm!.setVolume(NEUTRAL_VOLUME, { type: 'music' });
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
