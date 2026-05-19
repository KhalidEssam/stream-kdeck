import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  TouchableOpacity,
  TextInput,
  StatusBar,
  GestureResponderEvent,
  InteractionManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebSocketService } from '../services/websocket.service';

const SENSITIVITY_KEY = 'trackpad_sensitivity';
const ORIENTATION_KEY = 'trackpad_orientation';
const KEYBOARD_SENTINEL = ' '; // one space kept in input so backspace shrinks it
type OrientationMode = 'portrait' | 'landscape' | 'landscape-flip';
const SENSITIVITY_MIN = 0.3;
const SENSITIVITY_MAX = 10.0;
const SENSITIVITY_STEP = 0.1;
const SENSITIVITY_DEFAULT = 2.0;
const THROTTLE_MS = 16;
const TAP_MOVEMENT_THRESHOLD = 5;
const LONG_PRESS_DELAY_MS = 500;

interface Props {
  ws: WebSocketService;
  onDismiss: () => void;
}

export function TrackpadScreen({ ws, onDismiss }: Props) {
  const insets = useSafeAreaInsets();
  // Fix 1: wsRef keeps PanResponder closures from going stale when ws prop changes
  const wsRef = useRef(ws);
  wsRef.current = ws;

  const [sensitivity, setSensitivity] = useState(SENSITIVITY_DEFAULT);
  const [showKeyboard, setShowKeyboard] = useState(false);
  // Fix 3: controlled input value
  const [keyboardText, setKeyboardText] = useState(KEYBOARD_SENTINEL);
  const keyboardInputRef = useRef<TextInput>(null);

  // Gesture state refs (not state — no re-render on each frame)
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const totalMovementRef = useRef(0);
  const lastSentRef = useRef(0);
  const isDraggingRef = useRef(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Fix 2: ref so PanResponder always calls the current cancelLongPress
  const cancelLongPressRef = useRef<() => void>(() => {});
  const twoFingerStartRef = useRef<{ x: number; y: number } | null>(null);
  const sensitivityRef = useRef(SENSITIVITY_DEFAULT);
  const [orientation, setOrientation] = useState<OrientationMode>('portrait');
  const orientationRef = useRef<OrientationMode>('portrait');
  // Fix 4: track finger count at gesture start for reliable Android two-finger detection
  const fingerCountRef = useRef(0);
  // tracks whether a two-finger scroll actually fired, to suppress right-click on lift
  const twoFingerScrolledRef = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(SENSITIVITY_KEY)
      .then((val) => {
        if (val !== null) {
          const parsed = parseFloat(val);
          if (!isNaN(parsed)) {
            setSensitivity(parsed);
            sensitivityRef.current = parsed;
          }
        }
      })
      .catch(console.warn);
    AsyncStorage.getItem(ORIENTATION_KEY)
      .then((val) => {
        if (val === 'landscape' || val === 'landscape-flip') {
          setOrientation(val);
          orientationRef.current = val;
        }
      })
      .catch(console.warn);
    // Fix 5: unmount cleanup for longPress timer
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, []);

  // Fix 7: updateSensitivity reads from ref to avoid stale state on rapid presses
  const updateSensitivity = useCallback((delta: number) => {
    const next = sensitivityRef.current + delta;
    const clamped = Math.round(Math.min(SENSITIVITY_MAX, Math.max(SENSITIVITY_MIN, next)) * 10) / 10;
    setSensitivity(clamped);
    sensitivityRef.current = clamped;
    AsyncStorage.setItem(SENSITIVITY_KEY, String(clamped)).catch(console.warn);
  }, []);

  const cycleOrientation = useCallback(() => {
    const next: OrientationMode =
      orientationRef.current === 'portrait' ? 'landscape' :
      orientationRef.current === 'landscape' ? 'landscape-flip' : 'portrait';
    orientationRef.current = next;
    setOrientation(next);
    AsyncStorage.setItem(ORIENTATION_KEY, next).catch(console.warn);
  }, []);

  // Fix 2: cancelLongPress wrapped in useCallback; ref kept in sync below
  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);
  cancelLongPressRef.current = cancelLongPress;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: (evt: GestureResponderEvent) => {
        const touches = evt.nativeEvent.touches;
        totalMovementRef.current = 0;
        twoFingerStartRef.current = null;
        twoFingerScrolledRef.current = false;
        // Fix 4: capture finger count at grant time
        fingerCountRef.current = touches.length;

        if (touches.length === 1) {
          lastPosRef.current = { x: touches[0].pageX, y: touches[0].pageY };

          longPressTimerRef.current = setTimeout(() => {
            if (totalMovementRef.current < TAP_MOVEMENT_THRESHOLD) {
              isDraggingRef.current = true;
              wsRef.current.clickMouse('left', 'down');
            }
            longPressTimerRef.current = null;
          }, LONG_PRESS_DELAY_MS);
        }
      },

      onPanResponderMove: (evt: GestureResponderEvent) => {
        const touches = evt.nativeEvent.touches;
        const now = Date.now();

        if (touches.length === 2) {
          cancelLongPressRef.current();
          const centerX = (touches[0].pageX + touches[1].pageX) / 2;
          const centerY = (touches[0].pageY + touches[1].pageY) / 2;

          if (!twoFingerStartRef.current) {
            twoFingerStartRef.current = { x: centerX, y: centerY };
            return;
          }

          if (now - lastSentRef.current >= THROTTLE_MS) {
            const rawDx = centerX - twoFingerStartRef.current.x;
            const rawDy = centerY - twoFingerStartRef.current.y;
            const dx = Math.round(rawDx * sensitivityRef.current * 2);
            const dy = Math.round(rawDy * sensitivityRef.current * 2);
            if (dx !== 0 || dy !== 0) {
              wsRef.current.scrollMouse(-dx, -dy);
              twoFingerScrolledRef.current = true;
              lastSentRef.current = now;
              twoFingerStartRef.current = { x: centerX, y: centerY };
            }
          }
          return;
        }

        if (touches.length === 1 && lastPosRef.current) {
          const rawDx = touches[0].pageX - lastPosRef.current.x;
          const rawDy = touches[0].pageY - lastPosRef.current.y;

          totalMovementRef.current += Math.abs(rawDx) + Math.abs(rawDy);

          if (totalMovementRef.current > TAP_MOVEMENT_THRESHOLD) {
            cancelLongPressRef.current();
          }

          if (now - lastSentRef.current >= THROTTLE_MS) {
            const scale = sensitivityRef.current * 2;
            const mode = orientationRef.current;
            const dx =
              mode === 'landscape'      ? Math.round( rawDy * scale) :
              mode === 'landscape-flip' ? Math.round(-rawDy * scale) :
                                          Math.round( rawDx * scale);
            const dy =
              mode === 'landscape'      ? Math.round(-rawDx * scale) :
              mode === 'landscape-flip' ? Math.round( rawDx * scale) :
                                          Math.round( rawDy * scale);
            if (dx !== 0 || dy !== 0) {
              wsRef.current.moveMouse(dx, dy);
              lastSentRef.current = now;
            }
          }

          lastPosRef.current = { x: touches[0].pageX, y: touches[0].pageY };
        }
      },

      onPanResponderRelease: (evt: GestureResponderEvent) => {
        cancelLongPressRef.current();
        const changed = evt.nativeEvent.changedTouches;
        twoFingerStartRef.current = null;

        // Two-finger tap → right click (only if no scroll fired during this gesture)
        if (fingerCountRef.current === 2 && totalMovementRef.current < TAP_MOVEMENT_THRESHOLD && !twoFingerScrolledRef.current) {
          wsRef.current.clickMouse('right', 'click');
          lastPosRef.current = null;
          totalMovementRef.current = 0;
          return;
        }

        if (isDraggingRef.current) {
          wsRef.current.clickMouse('left', 'up');
          isDraggingRef.current = false;
        } else if (totalMovementRef.current < TAP_MOVEMENT_THRESHOLD && changed.length === 1) {
          wsRef.current.clickMouse('left', 'click');
        }

        lastPosRef.current = null;
        totalMovementRef.current = 0;
      },

      onPanResponderTerminate: () => {
        cancelLongPressRef.current();
        if (isDraggingRef.current) {
          wsRef.current.clickMouse('left', 'up');
          isDraggingRef.current = false;
        }
        lastPosRef.current = null;
        totalMovementRef.current = 0;
        twoFingerStartRef.current = null;
      },
    }),
  ).current;

  const toggleKeyboard = () => {
    setShowKeyboard((prev) => {
      if (!prev) {
        // Fix 6: use InteractionManager instead of setTimeout for reliable focus
        InteractionManager.runAfterInteractions(() => {
          keyboardInputRef.current?.focus();
        });
      }
      return !prev;
    });
  };

  // Fix 3: controlled input — clear by resetting state; no setNativeProps needed
  const handleKeyboardChange = useCallback((text: string) => {
    if (text.length < KEYBOARD_SENTINEL.length) {
      wsRef.current.tap('keyboard-key', { kind: 'KEYSTROKE', keys: ['Backspace'] });
    } else {
      const newChars = text.slice(KEYBOARD_SENTINEL.length);
      for (const char of newChars) {
        wsRef.current.tap('keyboard-key', { kind: 'KEYSTROKE', keys: [char] });
      }
    }
    setKeyboardText(KEYBOARD_SENTINEL);
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0F" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: 12 + insets.top }]}>
        <TouchableOpacity onPress={onDismiss} style={styles.backButton} activeOpacity={0.7}>
          <Text style={styles.backText}>←  Deck</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Trackpad</Text>
        <TouchableOpacity
          onPress={cycleOrientation}
          style={[styles.keyboardButton, orientation !== 'portrait' && styles.keyboardButtonActive]}
          activeOpacity={0.7}
        >
          <Text style={styles.keyboardIcon}>
            {orientation === 'portrait' ? '📱' : orientation === 'landscape' ? '⬛' : '⬛↩'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={toggleKeyboard}
          style={[styles.keyboardButton, showKeyboard && styles.keyboardButtonActive]}
          activeOpacity={0.7}
        >
          <Text style={styles.keyboardIcon}>⌨</Text>
        </TouchableOpacity>
      </View>

      {/* Gesture surface */}
      <View style={styles.surface} {...panResponder.panHandlers}>
        <Text style={styles.hint}>
          {orientation === 'portrait' ? 'Portrait' : orientation === 'landscape' ? 'Landscape ↺' : 'Landscape ↻'}{'  ·  '}Drag to move  ·  Tap to click
        </Text>
      </View>

      {/* Sensitivity control */}
      <View style={styles.sensitivityRow}>
        <Text style={styles.sensitivityLabel}>Sensitivity</Text>
        <TouchableOpacity
          onPress={() => updateSensitivity(-SENSITIVITY_STEP)}
          style={styles.stepButton}
          activeOpacity={0.7}
        >
          <Text style={styles.stepButtonText}>−</Text>
        </TouchableOpacity>
        <Text style={styles.sensitivityValue}>{sensitivity.toFixed(1)}×</Text>
        <TouchableOpacity
          onPress={() => updateSensitivity(SENSITIVITY_STEP)}
          style={styles.stepButton}
          activeOpacity={0.7}
        >
          <Text style={styles.stepButtonText}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Hidden keyboard capture input */}
      {/* Fix 3: controlled input — value driven by state so no setNativeProps needed */}
      <TextInput
        ref={keyboardInputRef}
        style={styles.hiddenInput}
        value={keyboardText}
        onChangeText={handleKeyboardChange}
        autoCorrect={false}
        autoCapitalize="none"
        spellCheck={false}
        submitBehavior="submit"
        onSubmitEditing={() => {
          wsRef.current.tap('keyboard-key', { kind: 'KEYSTROKE', keys: ['Enter'] });
          keyboardInputRef.current?.blur();
        }}
        onBlur={() => setShowKeyboard(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E2E',
  },
  backButton: {
    paddingRight: 12,
  },
  backText: {
    color: '#5B4FE8',
    fontSize: 16,
  },
  title: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  keyboardButton: {
    paddingLeft: 12,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  keyboardButtonActive: {
    backgroundColor: '#5B4FE8',
  },
  keyboardIcon: {
    fontSize: 20,
    color: '#AAAACC',
  },
  surface: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F0F18',
    margin: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1E1E2E',
  },
  hint: {
    color: '#3A3A5C',
    fontSize: 13,
    textAlign: 'center',
  },
  sensitivityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#1E1E2E',
    gap: 12,
  },
  sensitivityLabel: {
    flex: 1,
    color: '#6B6B8A',
    fontSize: 14,
  },
  stepButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#1E1E2E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepButtonText: {
    color: '#FFFFFF',
    fontSize: 20,
    lineHeight: 24,
  },
  sensitivityValue: {
    color: '#FFFFFF',
    fontSize: 15,
    minWidth: 40,
    textAlign: 'center',
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    width: 1,
    height: 1,
    bottom: 0,
    left: 0,
  },
});
