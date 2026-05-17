import React, { useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  Text,
  View,
  Image,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { TileConfig } from '../types/schema';

// Clearbit logo service — high-quality brand logos, HTTPS, no key required for low volume.
// Maps iconId → domain used to fetch the logo.
const LOGO_DOMAINS: Record<string, string> = {
  spotify:    'spotify.com',
  discord:    'discord.com',
  vscode:     'code.visualstudio.com',
  chrome:     'google.com',
  slack:      'slack.com',
  notion:     'notion.so',
  obs:        'obsproject.com',
  figma:      'figma.com',
  claude:     'anthropic.com',
  github:     'github.com',
  youtube:    'youtube.com',
  twitch:     'twitch.tv',
  whatsapp:   'whatsapp.com',
  steam:      'steampowered.com',
  postman:    'postman.com',
  linear:     'linear.app',
  vercel:     'vercel.com',
};

// Official brand colors — used as icon background in all states.
const BRAND_COLORS: Record<string, string> = {
  spotify:    '#1DB954',
  discord:    '#5865F2',
  vscode:     '#007ACC',
  chrome:     '#4285F4',
  slack:      '#4A154B',
  notion:     '#1F1F1F',
  obs:        '#302E31',
  figma:      '#F24E1E',
  claude:     '#D97757',
  github:     '#24292E',
  youtube:    '#FF0000',
  twitch:     '#9146FF',
  whatsapp:   '#25D366',
  powershell: '#012456',
  terminal:   '#2D2D2D',
  explorer:   '#0078D4',
  steam:      '#1B2838',
  postman:    '#FF6C37',
  linear:     '#5E6AD2',
  vercel:     '#1F1F1F',
};

const TILE_BG: Record<string, string> = {
  ai:       '#1A1A2E',
  app:      '#1E1E2E',
  url:      '#0D2B45',
  shortcut: '#0F2A1A',
};

interface Props {
  tile: TileConfig;
  isLoading?: boolean;
  isSelected?: boolean;
  onTap: (tile: TileConfig) => void;
}

export function AppTile({ tile, isLoading, isSelected, onTap }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const [logoError, setLogoError] = useState(false);

  const handlePressIn = () => {
    Animated.spring(scale, { toValue: 0.92, useNativeDriver: true, speed: 50 }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20 }).start();
  };

  const tileBg = tile.color ?? TILE_BG[tile.kind] ?? '#1E1E2E';
  // AI tiles use the tile's own color as the badge background
  const brandColor = tile.kind === 'ai'
    ? (tile.color ?? '#2D1B69')
    : tile.kind === 'shortcut'
      ? '#1DB954'
      : (BRAND_COLORS[tile.iconId] ?? '#3A3A5C');
  const logoDomain = tile.kind !== 'ai' ? LOGO_DOMAINS[tile.iconId] : undefined;
  const logoUri = logoDomain ? `https://logo.clearbit.com/${logoDomain}` : undefined;
  const showLogo = !!logoUri && !logoError;

  return (
    <Animated.View style={[styles.wrapper, { transform: [{ scale }] }]}>
      <Pressable
        style={[styles.tile, { backgroundColor: tileBg }]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={() => onTap(tile)}
        disabled={isLoading}
      >
        {/* Icon badge */}
        <View style={[styles.iconBadge, { backgroundColor: brandColor }]}>
          {tile.kind === 'ai' ? (
            <Text style={styles.aiIcon}>✦</Text>
          ) : tile.kind === 'shortcut' ? (
            <Text style={styles.shortcutIcon}>⌨</Text>
          ) : showLogo ? (
            <Image
              source={{ uri: logoUri }}
              style={styles.logo}
              onError={() => setLogoError(true)}
            />
          ) : (
            <Text style={styles.fallbackLetter}>
              {tile.label.charAt(0).toUpperCase()}
            </Text>
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

        {/* Selected checkmark */}
        {isSelected && (
          <View style={styles.selectedOverlay}>
            <Text style={styles.checkmark}>✓</Text>
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
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logo: { width: 36, height: 36, resizeMode: 'contain' },
  fallbackLetter: { color: '#FFFFFF', fontSize: 22, fontWeight: '700' },
  aiIcon: { color: '#FFFFFF', fontSize: 26, opacity: 0.9 },
  shortcutIcon: { color: '#FFFFFF', fontSize: 24, opacity: 0.9 },
  label: {
    color: '#CCCCCC',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 6,
  },
  aiBadge: { position: 'absolute', top: 6, right: 6 },
  aiBadgeText: { color: 'rgba(255,255,255,0.6)', fontSize: 10 },
  selectedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(91,79,232,0.35)',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#5B4FE8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: { color: '#FFFFFF', fontSize: 28, fontWeight: '700' },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
