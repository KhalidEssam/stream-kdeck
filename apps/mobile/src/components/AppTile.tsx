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
  custom:     '#2D5A27',
};

const TILE_BG: Record<string, string> = {
  ai:       '#1A1A2E',
  app:      '#1E1E2E',
  url:      '#0D2B45',
  shortcut: '#0F2A1A',
  custom:   '#0A2010',
  workflow: '#1E1A3A',
  integration: '#1A1A2E',
};

interface Props {
  tile: TileConfig;
  isLoading?: boolean;
  isSelected?: boolean;
  stateBadge?: string | null;
  stateActive?: boolean;
  displayLabel?: string | null;
  creditsRemaining?: number;
  onTap: (tile: TileConfig) => void;
  onLongPress?: (tile: TileConfig) => void;
}

export function AppTile({
  tile,
  isLoading,
  isSelected,
  stateBadge,
  stateActive,
  displayLabel,
  creditsRemaining,
  onTap,
  onLongPress,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const didLongPress = useRef(false);
  const [logoError, setLogoError] = useState(false);

  const handlePressIn = () => {
    didLongPress.current = false;
    Animated.spring(scale, { toValue: 0.92, useNativeDriver: true, speed: 50 }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20 }).start();
  };

  const handlePress = () => {
    if (didLongPress.current) {
      didLongPress.current = false;
      return;
    }
    onTap(tile);
  };

  const handleLongPress = () => {
    if (!onLongPress) return;
    didLongPress.current = true;
    onLongPress(tile);
  };

  const tileBg = tile.color ?? TILE_BG[tile.kind] ?? '#1E1E2E';
  // AI tiles use the tile's own color as the badge background
  const brandColor =
    tile.kind === 'ai'
      ? (tile.color ?? '#2D1B69')
      : tile.kind === 'shortcut'
        ? '#1A3A1A'
        : (BRAND_COLORS[tile.iconId] ?? BRAND_COLORS[tile.kind] ?? '#3A3A5C');
  const showBase64 = !!tile.iconBase64;
  const logoDomain =
    !showBase64 && tile.kind !== 'ai' && tile.kind !== 'shortcut' && tile.kind !== 'custom'
      ? LOGO_DOMAINS[tile.iconId]
      : undefined;
  const logoUri = logoDomain ? `https://logo.clearbit.com/${logoDomain}` : undefined;
  const showLogo = !!logoUri && !logoError;

  return (
    <Animated.View style={[styles.wrapper, { transform: [{ scale }] }]}>
      <Pressable
        style={[styles.tile, { backgroundColor: tileBg }]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        onLongPress={handleLongPress}
        delayLongPress={3000}
        disabled={isLoading}
      >
        {/* Icon badge */}
        <View style={[styles.iconBadge, { backgroundColor: brandColor }]}>
          {tile.kind === 'ai' ? (
            <Text style={styles.aiIcon}>✦</Text>
          ) : tile.kind === 'shortcut' ? (
            <Text style={styles.shortcutIcon}>⌨</Text>
          ) : showBase64 ? (
            <Image
              source={{ uri: `data:image/png;base64,${tile.iconBase64}` }}
              style={styles.logo}
            />
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

        {tile.kind === 'integration' && stateActive ? (
          <View style={styles.liveDot} />
        ) : null}

        {/* Label */}
        <Text style={styles.label} numberOfLines={2}>
          {displayLabel ?? tile.label}
        </Text>

        {/* AI badge + credit counter */}
        {tile.kind === 'ai' && creditsRemaining !== undefined && (
          <View style={styles.creditBadge}>
            <Text
              style={[
                styles.creditBadgeText,
                creditsRemaining === 0 && styles.creditBadgeEmpty,
              ]}
            >
              {creditsRemaining}
            </Text>
          </View>
        )}
        {tile.kind === 'ai' && creditsRemaining === undefined && (
          <View style={styles.aiBadge}>
            <Text style={styles.aiBadgeText}>✦</Text>
          </View>
        )}

        {tile.pinned && (
          <View style={styles.pinBadge}>
            <Text style={styles.pinBadgeText}>PIN</Text>
          </View>
        )}

        {tile.kind === 'workflow' && (
          <View style={styles.workflowBadge}>
            <Text style={styles.workflowBadgeText}>⛓</Text>
          </View>
        )}

        {tile.kind === 'integration' && stateBadge ? (
          <View style={styles.stateBadge}>
            <Text style={styles.stateBadgeText} numberOfLines={1}>{stateBadge}</Text>
          </View>
        ) : null}

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
  creditBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
  },
  creditBadgeText: { color: '#AAAACC', fontSize: 9, fontWeight: '800' },
  creditBadgeEmpty: { color: '#FF6B6B' },
  pinBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  pinBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' },
  workflowBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 5,
    backgroundColor: '#1A1A2E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  workflowBadgeText: { fontSize: 10 },
  liveDot: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FF3B30',
    borderWidth: 2,
    borderColor: '#1A1A2E',
  },
  stateBadge: {
    position: 'absolute',
    bottom: 5,
    left: 6,
    right: 6,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 3,
    backgroundColor: 'rgba(0,0,0,0.48)',
    alignItems: 'center',
  },
  stateBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' },
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
