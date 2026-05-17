import React, { useRef } from 'react';
import { Pressable, Text, StyleSheet, Animated } from 'react-native';

export interface ButtonConfig {
  id: string;
  label: string;
  color?: string;
  isLoading?: boolean;
}

interface Props {
  config: ButtonConfig;
  onTap: (id: string) => void;
}

export function DeckButton({ config, onTap }: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, { toValue: 0.92, useNativeDriver: true, speed: 50 }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20 }).start();
  };

  return (
    <Animated.View style={[styles.wrapper, { transform: [{ scale }] }]}>
      <Pressable
        style={[styles.button, { backgroundColor: config.color ?? '#1E1E2E' }]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={() => onTap(config.id)}
        disabled={config.isLoading}
      >
        <Text style={styles.label} numberOfLines={2}>
          {config.isLoading ? '⏳' : config.label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, margin: 5, aspectRatio: 1 },
  button: {
    flex: 1,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  label: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
});
