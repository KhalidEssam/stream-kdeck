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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebSocketService } from '../services/websocket.service';

const SENSITIVITY_KEY = 'trackpad_sensitivity';
const SENSITIVITY_MIN = 0.3;
const SENSITIVITY_MAX = 3.0;
const SENSITIVITY_STEP = 0.1;
const SENSITIVITY_DEFAULT = 1.0;
const THROTTLE_MS = 16;
const TAP_MOVEMENT_THRESHOLD = 5;
const LONG_PRESS_DELAY_MS = 500;

interface Props {
  ws: WebSocketService;
  onDismiss: () => void;
}

export function TrackpadScreen({ ws, onDismiss }: Props) {
  const [sensitivity, setSensitivity] = useState(SENSITIVITY_DEFAULT);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const keyboardInputRef = useRef<TextInput>(null);

  // Gesture state refs (not state — no re-render on each frame)
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const totalMovementRef = useRef(0);
  const lastSentRef = useRef(0);
  const isDraggingRef = useRef(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const twoFingerStartRef = useRef<{ x: number; y: number } | null>(null);
  const sensitivityRef = useRef(SENSITIVITY_DEFAULT);

  useEffect(() => {
    AsyncStorage.getItem(SENSITIVITY_KEY).then((val) => {
      if (val !== null) {
        const parsed = parseFloat(val);
        if (!isNaN(parsed)) {
          setSensitivity(parsed);
          sensitivityRef.current = parsed;
        }
      }
    });
  }, []);

  const updateSensitivity = useCallback((next: number) => {
    const clamped = Math.round(Math.min(SENSITIVITY_MAX, Math.max(SENSITIVITY_MIN, next)) * 10) / 10;
    setSensitivity(clamped);
    sensitivityRef.current = clamped;
    AsyncStorage.setItem(SENSITIVITY_KEY, String(clamped));
  }, []);

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: (evt: GestureResponderEvent) => {
        const touches = evt.nativeEvent.touches;
        totalMovementRef.current = 0;
        twoFingerStartRef.current = null;

        if (touches.length === 1) {
          lastPosRef.current = { x: touches[0].pageX, y: touches[0].pageY };

          longPressTimerRef.current = setTimeout(() => {
            if (totalMovementRef.current < TAP_MOVEMENT_THRESHOLD) {
              isDraggingRef.current = true;
              ws.clickMouse('left', 'down');
            }
            longPressTimerRef.current = null;
          }, LONG_PRESS_DELAY_MS);
        }
      },

      onPanResponderMove: (evt: GestureResponderEvent) => {
        const touches = evt.nativeEvent.touches;
        const now = Date.now();

        if (touches.length === 2) {
          cancelLongPress();
          const centerX = (touches[0].pageX + touches[1].pageX) / 2;
          const centerY = (touches[0].pageY + touches[1].pageY) / 2;

          if (!twoFingerStartRef.current) {
            twoFingerStartRef.current = { x: centerX, y: centerY };
            return;
          }

          if (now - lastSentRef.current >= THROTTLE_MS) {
            const rawDx = centerX - twoFingerStartRef.current.x;
            const rawDy = centerY - twoFingerStartRef.current.y;
            const dx = Math.round(rawDx * sensitivityRef.current);
            const dy = Math.round(rawDy * sensitivityRef.current);
            if (dx !== 0 || dy !== 0) {
              ws.scrollMouse(-dx, -dy);
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
            cancelLongPress();
          }

          if (now - lastSentRef.current >= THROTTLE_MS) {
            const dx = Math.round(rawDx * sensitivityRef.current);
            const dy = Math.round(rawDy * sensitivityRef.current);
            if (dx !== 0 || dy !== 0) {
              ws.moveMouse(dx, dy);
              lastSentRef.current = now;
            }
          }

          lastPosRef.current = { x: touches[0].pageX, y: touches[0].pageY };
        }
      },

      onPanResponderRelease: (evt: GestureResponderEvent) => {
        cancelLongPress();
        const changed = evt.nativeEvent.changedTouches;
        twoFingerStartRef.current = null;

        // Two-finger tap → right click
        if (changed.length === 2 && totalMovementRef.current < TAP_MOVEMENT_THRESHOLD) {
          ws.clickMouse('right', 'click');
          lastPosRef.current = null;
          totalMovementRef.current = 0;
          return;
        }

        if (isDraggingRef.current) {
          ws.clickMouse('left', 'up');
          isDraggingRef.current = false;
        } else if (totalMovementRef.current < TAP_MOVEMENT_THRESHOLD && changed.length === 1) {
          ws.clickMouse('left', 'click');
        }

        lastPosRef.current = null;
        totalMovementRef.current = 0;
      },

      onPanResponderTerminate: () => {
        cancelLongPress();
        if (isDraggingRef.current) {
          ws.clickMouse('left', 'up');
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
        setTimeout(() => keyboardInputRef.current?.focus(), 50);
      }
      return !prev;
    });
  };

  const handleKeyboardChange = (text: string) => {
    if (!text) return;
    const char = text[text.length - 1];
    ws.tap('keyboard-key', { kind: 'KEYSTROKE', keys: [char] });
    keyboardInputRef.current?.clear?.();
    (keyboardInputRef.current as any)?.setNativeProps?.({ text: '' });
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0F" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onDismiss} style={styles.backButton} activeOpacity={0.7}>
          <Text style={styles.backText}>←  Deck</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Trackpad</Text>
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
        <Text style={styles.hint}>Drag to move  ·  Tap to click  ·  2-finger scroll</Text>
      </View>

      {/* Sensitivity control */}
      <View style={styles.sensitivityRow}>
        <Text style={styles.sensitivityLabel}>Sensitivity</Text>
        <TouchableOpacity
          onPress={() => updateSensitivity(sensitivity - SENSITIVITY_STEP)}
          style={styles.stepButton}
          activeOpacity={0.7}
        >
          <Text style={styles.stepButtonText}>−</Text>
        </TouchableOpacity>
        <Text style={styles.sensitivityValue}>{sensitivity.toFixed(1)}×</Text>
        <TouchableOpacity
          onPress={() => updateSensitivity(sensitivity + SENSITIVITY_STEP)}
          style={styles.stepButton}
          activeOpacity={0.7}
        >
          <Text style={styles.stepButtonText}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Hidden keyboard capture input */}
      <TextInput
        ref={keyboardInputRef}
        style={styles.hiddenInput}
        onChangeText={handleKeyboardChange}
        autoCorrect={false}
        autoCapitalize="none"
        spellCheck={false}
        blurOnSubmit={false}
        onBlur={() => setShowKeyboard(false)}
      />
    </SafeAreaView>
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
