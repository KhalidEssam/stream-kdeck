import React, { useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  Text,
  View,
  Image,
  ActivityIndicator,
  StyleSheet,
  ImageSourcePropType,
} from 'react-native';
import { TileConfig } from '../types/schema';

// Map of appId → bundled icon. Add entries here as PNGs are added to assets/icons/.
const ICON_MAP: Record<string, ImageSourcePropType> = {
  // e.g. spotify: require('../../assets/icons/spotify.png'),
};

const TILE_COLORS: Record<string, string> = {
  ai: '#2D1B69',
  app: '#1E1E2E',
  url: '#0D2B45',
};

interface Props {
  tile: TileConfig;
  isLoading?: boolean;
  onTap: (tile: TileConfig) => void;
}

export function AppTile({ tile, isLoading, onTap }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const [iconError, setIconError] = useState(false);

  const handlePressIn = () => {
    Animated.spring(scale, { toValue: 0.92, useNativeDriver: true, speed: 50 }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20 }).start();
  };

  const bgColor = tile.color ?? TILE_COLORS[tile.kind] ?? '#1E1E2E';
  const iconSource = ICON_MAP[tile.iconId];
  const showFallback = !iconSource || iconError;

  return (
    <Animated.View style={[styles.wrapper, { transform: [{ scale }] }]}>
      <Pressable
        style={[styles.tile, { backgroundColor: bgColor }]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={() => onTap(tile)}
        disabled={isLoading}
      >
        {/* Icon area */}
        <View style={styles.iconArea}>
          {showFallback ? (
            <View style={[styles.fallbackIcon, { backgroundColor: bgColor }]}>
              <Text style={styles.fallbackLetter}>
                {tile.label.charAt(0).toUpperCase()}
              </Text>
            </View>
          ) : (
            <Image
              source={iconSource}
              style={styles.icon}
              onError={() => setIconError(true)}
            />
          )}
        </View>

        {/* Label */}
        <Text style={styles.label} numberOfLines={2}>
          {tile.label}
        </Text>

        {/* AI badge */}
        {tile.kind === 'ai' && (
          <View style={styles.aiBadge}>
            <Text style={styles.aiBadgeText}>✦</Text>
          </View>
        )}

        {/* Loading overlay */}
        {isLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="small" color="#FFFFFF" />
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, margin: 5, aspectRatio: 1 },
  tile: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    overflow: 'hidden',
  },
  iconArea: { flex: 1, alignItems: 'center', justifyContent: 'center', width: '100%' },
  icon: { width: 40, height: 40, resizeMode: 'contain' },
  fallbackIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackLetter: { color: '#FFFFFF', fontSize: 22, fontWeight: '700' },
  label: {
    color: '#CCCCCC',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 4,
  },
  aiBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
  },
  aiBadgeText: { color: 'rgba(255,255,255,0.6)', fontSize: 10 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
