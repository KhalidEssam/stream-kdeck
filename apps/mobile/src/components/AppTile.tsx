import React, { useEffect, useRef, useState } from 'react';
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
import type { TileDensity } from './tileLayout';

// Clearbit logo service — high-quality brand logos, HTTPS, no key required for low volume.
// Maps iconId → domain used to fetch the logo.
const LOGO_DOMAINS: Record<string, string> = {
  spotify: 'spotify.com',
  discord: 'discord.com',
  vscode: 'code.visualstudio.com',
  chrome: 'google.com',
  slack: 'slack.com',
  notion: 'notion.so',
  obs: 'obsproject.com',
  figma: 'figma.com',
  claude: 'anthropic.com',
  github: 'github.com',
  youtube: 'youtube.com',
  twitch: 'twitch.tv',
  whatsapp: 'whatsapp.com',
  steam: 'steampowered.com',
  postman: 'postman.com',
  linear: 'linear.app',
  vercel: 'vercel.com',
};

// Official brand colors — used as icon background in all states.
const BRAND_COLORS: Record<string, string> = {
  spotify: '#1DB954',
  discord: '#5865F2',
  vscode: '#007ACC',
  chrome: '#4285F4',
  slack: '#4A154B',
  notion: '#1F1F1F',
  obs: '#302E31',
  figma: '#F24E1E',
  claude: '#D97757',
  github: '#24292E',
  youtube: '#FF0000',
  twitch: '#9146FF',
  whatsapp: '#25D366',
  powershell: '#012456',
  terminal: '#2D2D2D',
  explorer: '#0078D4',
  steam: '#1B2838',
  postman: '#FF6C37',
  linear: '#5E6AD2',
  vercel: '#1F1F1F',
  custom: '#2D5A27',
};

const ICON_FALLBACKS: Record<string, string> = {
  spotify: '♪',
  discord: 'DC',
  vscode: '</>',
  chrome: '◎',
  slack: '#',
  notion: 'N',
  obs: 'OBS',
  figma: 'F',
  claude: '✦',
  github: 'GH',
  youtube: '▶',
  twitch: 'TW',
  whatsapp: '☎',
  powershell: '>_',
  terminal: '$',
  explorer: '▣',
  steam: 'ST',
  postman: 'PM',
  linear: '◆',
  vercel: '△',
  ai: '✦',
  shortcut: '⌨',
  workflow: '⛓',
  integration: '⚡',
  url: '↗',
  custom: '◇',
};

const TILE_BG: Record<string, string> = {
  ai: '#1A1A2E',
  app: '#1E1E2E',
  url: '#0D2B45',
  shortcut: '#0F2A1A',
  custom: '#0A2010',
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
  density?: TileDensity;
  isRearranging?: boolean;
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
  density = 'regular',
  isRearranging = false,
  onTap,
  onLongPress,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const wobble = useRef(new Animated.Value(0)).current;
  const wobbleLoop = useRef<Animated.CompositeAnimation | null>(null);
  const didLongPress = useRef(false);
  const [logoError, setLogoError] = useState(false);
  const [customImageError, setCustomImageError] = useState(false);

  useEffect(() => {
    if (isRearranging) {
      wobbleLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(wobble, { toValue: 1, duration: 90, useNativeDriver: true }),
          Animated.timing(wobble, { toValue: -1, duration: 90, useNativeDriver: true }),
          Animated.timing(wobble, { toValue: 0, duration: 90, useNativeDriver: true }),
        ]),
      );
      wobbleLoop.current.start();
    } else {
      wobbleLoop.current?.stop();
      wobble.setValue(0);
    }
    return () => { wobbleLoop.current?.stop(); };
  }, [isRearranging, wobble]);

  const wobbleRotate = wobble.interpolate({
    inputRange: [-1, 1],
    outputRange: ['-1.5deg', '1.5deg'],
  });

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
  const isCompact = density === 'compact';
  const isDense = density === 'dense';
  const customImageUri = tile.customIcon?.kind === 'image' ? tile.customIcon.uri : undefined;
  const customText =
    tile.customIcon?.kind === 'glyph' || tile.customIcon?.kind === 'emoji'
      ? tile.customIcon.value
      : undefined;
  const fallbackGlyphCandidate =
    ICON_FALLBACKS[tile.iconId] ??
    ICON_FALLBACKS[tile.kind] ??
    tile.label.trim().charAt(0).toUpperCase();
  const fallbackGlyph = fallbackGlyphCandidate || '?';
  const logoSource = showBase64 && !logoError
    ? { uri: `data:image/png;base64,${tile.iconBase64}` }
    : showLogo
      ? { uri: logoUri }
      : null;

  useEffect(() => {
    setLogoError(false);
  }, [logoUri]);

  useEffect(() => {
    setCustomImageError(false);
  }, [customImageUri]);

  return (
    <Animated.View style={[
      styles.wrapper,
      isCompact && styles.wrapperCompact,
      isDense && styles.wrapperDense,
      { transform: [{ scale }, { rotate: wobbleRotate }] },
    ]}>
      <Pressable
        style={[
          styles.tile,
          isCompact && styles.tileCompact,
          isDense && styles.tileDense,
          { backgroundColor: tileBg },
        ]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        onLongPress={handleLongPress}
        delayLongPress={1000}
        disabled={isLoading}
      >
        {/* Icon badge */}
        <View style={[
          styles.iconBadge,
          isCompact && styles.iconBadgeCompact,
          isDense && styles.iconBadgeDense,
          { backgroundColor: brandColor },
        ]}>
          {customImageUri && !customImageError ? (
            <>
              <Text style={[styles.fallbackLetter, isCompact && styles.fallbackLetterCompact, isDense && styles.fallbackLetterDense]}>
                {fallbackGlyph}
              </Text>
              <Image
                source={{ uri: customImageUri }}
                style={[
                  styles.logo,
                  styles.logoOverlay,
                  isCompact && styles.logoCompact,
                  isDense && styles.logoDense,
                ]}
                onError={() => setCustomImageError(true)}
              />
            </>
          ) : customText ? (
            <Text
              style={[
                styles.customIconText,
                isCompact && styles.customIconTextCompact,
                isDense && styles.customIconTextDense,
              ]}
              numberOfLines={1}
            >
              {customText}
            </Text>
          ) : (
            <>
              <Text style={[styles.fallbackLetter, isCompact && styles.fallbackLetterCompact, isDense && styles.fallbackLetterDense]}>
                {fallbackGlyph}
              </Text>
              {logoSource ? (
                <Image
                  source={logoSource}
                  style={[
                    styles.logo,
                    styles.logoOverlay,
                    isCompact && styles.logoCompact,
                    isDense && styles.logoDense,
                  ]}
                  onError={() => setLogoError(true)}
                />
              ) : null}
            </>
          )}
        </View>

        {tile.kind === 'integration' && stateActive ? (
          <View style={styles.liveDot} />
        ) : null}

        {/* Label */}
        <Text
          style={[styles.label, isCompact && styles.labelCompact, isDense && styles.labelDense]}
          numberOfLines={isDense ? 1 : 2}
        >
          {displayLabel ?? tile.label}
        </Text>

        {/* AI badge + credit counter */}
        {tile.kind === 'ai' && creditsRemaining !== undefined && (
          <View style={[styles.creditBadge, isDense && styles.creditBadgeDense]}>
            <Text
              style={[
                styles.creditBadgeText,
                isDense && styles.creditBadgeTextDense,
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
          <View style={[styles.pinBadge, isDense && styles.pinBadgeDense]}>
            <Text style={[styles.pinBadgeText, isDense && styles.pinBadgeTextDense]}>PIN</Text>
          </View>
        )}

        {tile.kind === 'workflow' && (
          <View style={[styles.workflowBadge, isDense && styles.workflowBadgeDense]}>
            <Text style={[styles.workflowBadgeText, isDense && styles.workflowBadgeTextDense]}>⛓</Text>
          </View>
        )}

        {tile.kind === 'integration' && stateBadge ? (
          <View style={[styles.stateBadge, isDense && styles.stateBadgeDense]}>
            <Text style={[styles.stateBadgeText, isDense && styles.stateBadgeTextDense]} numberOfLines={1}>{stateBadge}</Text>
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
  wrapper: { flex: 1, margin: 5 },
  wrapperCompact: { margin: 4 },
  wrapperDense: { margin: 3 },
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
  tileCompact: { borderRadius: 12, padding: 6 },
  tileDense: { borderRadius: 10, padding: 4 },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  iconBadgeCompact: { width: 38, height: 38, borderRadius: 10 },
  iconBadgeDense: { width: 28, height: 28, borderRadius: 7 },
  logo: { width: 36, height: 36, resizeMode: 'contain' },
  logoOverlay: { position: 'absolute' },
  logoCompact: { width: 28, height: 28 },
  logoDense: { width: 21, height: 21 },
  fallbackLetter: { color: '#FFFFFF', fontSize: 22, fontWeight: '700' },
  fallbackLetterCompact: { fontSize: 18 },
  fallbackLetterDense: { fontSize: 14 },
  customIconText: { color: '#FFFFFF', fontSize: 25, fontWeight: '800' },
  customIconTextCompact: { fontSize: 21 },
  customIconTextDense: { fontSize: 16 },
  aiIcon: { color: '#FFFFFF', fontSize: 26, opacity: 0.9 },
  aiIconCompact: { fontSize: 21 },
  aiIconDense: { fontSize: 16 },
  shortcutIcon: { color: '#FFFFFF', fontSize: 24, opacity: 0.9 },
  shortcutIconCompact: { fontSize: 20 },
  shortcutIconDense: { fontSize: 15 },
  label: {
    color: '#CCCCCC',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 6,
  },
  labelCompact: { fontSize: 10, marginTop: 4 },
  labelDense: { fontSize: 8, marginTop: 2, fontWeight: '700' },
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
  creditBadgeDense: {
    top: 3,
    right: 3,
    minWidth: 16,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  creditBadgeText: { color: '#AAAACC', fontSize: 9, fontWeight: '800' },
  creditBadgeTextDense: { fontSize: 8 },
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
  pinBadgeDense: {
    top: 3,
    left: 3,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  pinBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' },
  pinBadgeTextDense: { fontSize: 7 },
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
  workflowBadgeDense: {
    bottom: 3,
    right: 3,
    width: 14,
    height: 14,
    borderRadius: 4,
  },
  workflowBadgeText: { fontSize: 10 },
  workflowBadgeTextDense: { fontSize: 8 },
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
  stateBadgeDense: {
    bottom: 3,
    left: 4,
    right: 4,
    borderRadius: 5,
    paddingHorizontal: 3,
    paddingVertical: 2,
  },
  stateBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' },
  stateBadgeTextDense: { fontSize: 7 },
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
