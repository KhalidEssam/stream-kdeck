import React, {
  forwardRef,
  useRef,
  useEffect,
  useImperativeHandle,
} from 'react';
import { Animated, View, Text, StyleSheet, PanResponder } from 'react-native';

const FAB_SIZE = 64;
const REST_RIGHT = -(FAB_SIZE / 2); // -32: half off screen
const SNAP_RIGHT = 16;              // fully visible, 16px from right edge
const SNAP_THRESHOLD = (REST_RIGHT + SNAP_RIGHT) / 2; // -8: true midpoint

export interface PeekFabHandle {
  resetToPeeking: () => void;
}

interface Props {
  onPress: () => void;
  showBadge: boolean;
  tourRef?: React.RefObject<View | null>;
}

export const PeekFab = forwardRef<PeekFabHandle, Props>(function PeekFab(
  { onPress, showBadge, tourRef },
  ref,
) {
  const rightOffset = useRef(new Animated.Value(REST_RIGHT)).current;
  const currentRightRef = useRef(REST_RIGHT);
  const isExpandedRef = useRef(false);
  const panStartRight = useRef(REST_RIGHT);
  const hasInteracted = useRef(false);
  const isDraggingRef = useRef(false);
  // keep onPress stable inside PanResponder closure
  const onPressRef = useRef(onPress);
  onPressRef.current = onPress;

  const rotation = rightOffset.interpolate({
    inputRange: [REST_RIGHT, SNAP_RIGHT],
    outputRange: ['-12deg', '0deg'],
    extrapolate: 'clamp',
  });

  // counter-rotation keeps the + upright while the button is tilted
  const counterRotation = rightOffset.interpolate({
    inputRange: [REST_RIGHT, SNAP_RIGHT],
    outputRange: ['12deg', '0deg'],
    extrapolate: 'clamp',
  });

  const snapToRef = useRef((toValue: number) => {
    isExpandedRef.current = toValue === SNAP_RIGHT;
    currentRightRef.current = toValue;
    Animated.spring(rightOffset, {
      toValue,
      tension: 80,
      friction: 10,
      useNativeDriver: false,
    }).start();
  });

  const playWiggle = () => {
    if (hasInteracted.current || isDraggingRef.current) return;
    Animated.sequence([
      Animated.timing(rightOffset, { toValue: REST_RIGHT - 6, duration: 120, useNativeDriver: false }),
      Animated.timing(rightOffset, { toValue: REST_RIGHT,     duration: 120, useNativeDriver: false }),
      Animated.timing(rightOffset, { toValue: REST_RIGHT - 3, duration: 100, useNativeDriver: false }),
      Animated.timing(rightOffset, { toValue: REST_RIGHT,     duration: 100, useNativeDriver: false }),
    ]).start();
  };

  useEffect(() => {
    const initialTimer = setTimeout(playWiggle, 1200);
    const interval = setInterval(playWiggle, 8000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, []);

  useImperativeHandle(ref, () => ({
    resetToPeeking: () => snapToRef.current(REST_RIGHT),
  }));

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        hasInteracted.current = true;
        isDraggingRef.current = true;
        panStartRight.current = currentRightRef.current;
      },
      onPanResponderMove: (_, { dx }) => {
        // dragging left (negative dx) moves the button rightward on screen
        const newRight = Math.max(
          REST_RIGHT,
          Math.min(SNAP_RIGHT, panStartRight.current - dx)
        );
        rightOffset.setValue(newRight);
        currentRightRef.current = newRight;
      },
      onPanResponderRelease: (_, { dx }) => {
        isDraggingRef.current = false;
        const moved = Math.abs(dx);
        if (moved < 5) {
          // treat as tap
          if (!isExpandedRef.current) {
            snapToRef.current(SNAP_RIGHT);
          } else {
            onPressRef.current();
          }
        } else {
          // snap based on threshold
          if (currentRightRef.current >= SNAP_THRESHOLD) {
            snapToRef.current(SNAP_RIGHT);
          } else {
            snapToRef.current(REST_RIGHT);
          }
        }
      },
    }),
  ).current;

  return (
    <Animated.View
      ref={tourRef as any} // Animated.View ref type diverges from View; cast is safe for .measure()
      style={[
        styles.fab,
        { right: rightOffset, transform: [{ rotate: rotation }] },
      ]}
      accessibilityRole="button"
      accessibilityLabel="Add tile"
      {...panResponder.panHandlers}
    >
      <Animated.View style={{ transform: [{ rotate: counterRotation }] }}>
        <Text style={styles.plus}>+</Text>
      </Animated.View>
      {showBadge && <View style={styles.badge} />}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 132,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: 20,
    backgroundColor: '#5B4FE8',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#5B4FE8',
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.25)',
  },
  plus: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 32,
    includeFontPadding: false,
  },
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#5B4FE8',
  },
});
