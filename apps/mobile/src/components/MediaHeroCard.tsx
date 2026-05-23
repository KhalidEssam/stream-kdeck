import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  PanResponder,
  TouchableOpacity,
} from 'react-native';
import { MediaSession } from '../types/schema';

interface Props {
  session: MediaSession | null;
  platform: 'win32' | 'darwin' | null;
  onVolumeChange: (volume: number) => void;
  onMuteToggle: () => void;
}

const AVATAR_PALETTE = ['#5B4FE8', '#E85B7F', '#4FC8E8', '#E8A84F', '#7FE85B', '#B84FE8'];

function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}

function AppIcon({ session, size }: { session: MediaSession; size: number }) {
  if (session.iconBase64) {
    return (
      <Image
        source={{ uri: `data:image/png;base64,${session.iconBase64}` }}
        style={{ width: size, height: size, borderRadius: size * 0.22 }}
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.22,
        backgroundColor: avatarColor(session.processName),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#fff', fontSize: size * 0.45, fontWeight: '700' }}>
        {session.label.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

const THUMB_RADIUS = 7;

export function MediaHeroCard({ session, platform, onVolumeChange, onMuteToggle }: Props) {
  const [sliderWidth, setSliderWidth] = useState(0);
  const sliderWidthRef = useRef(0);
  const controlsDisabled = session?.pinned === true && session.active === false;

  const panResponder = useMemo(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        if (controlsDisabled || sliderWidthRef.current === 0) return;
        onVolumeChange(Math.max(0, Math.min(1, e.nativeEvent.locationX / sliderWidthRef.current)));
      },
      onPanResponderMove: (e) => {
        if (controlsDisabled || sliderWidthRef.current === 0) return;
        onVolumeChange(Math.max(0, Math.min(1, e.nativeEvent.locationX / sliderWidthRef.current)));
      },
    }),
  [controlsDisabled, onVolumeChange]);

  if (!session) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Tap an app to control its volume</Text>
      </View>
    );
  }

  const isPinnedOffline = session.pinned && session.active === false;
  const isMuted = session.muted && !isPinnedOffline;
  const vol = session.volume;
  const fillPct = `${Math.round(vol * 100)}%` as `${number}%`;
  const thumbLeft = Math.max(0, vol * sliderWidth - THUMB_RADIUS);

  return (
    <View style={[styles.card, isMuted && styles.cardMuted, isPinnedOffline && styles.cardPinnedOffline]}>
      {/* Top row: icon + name + mute button */}
      <View style={styles.topRow}>
        <View style={[styles.iconWrap, isMuted && styles.iconWrapMuted]}>
          <AppIcon session={session} size={48} />
        </View>
        <View style={styles.meta}>
          <Text style={[styles.name, isMuted && styles.nameMuted]} numberOfLines={1}>
            {session.label}
          </Text>
          <Text style={[styles.status, isMuted && styles.statusMuted]}>
            {isPinnedOffline ? 'pinned idle - controls wake when audio starts' : isMuted ? 'muted - tap to unmute' : 'tap card below to switch'}
          </Text>
          {platform === 'darwin' && session.processName === 'system' && (
            <Text style={styles.macNote}>Per-app volume: Windows only</Text>
          )}
        </View>
        <TouchableOpacity
          style={[styles.muteBtn, isMuted && styles.muteBtnActive, isPinnedOffline && styles.muteBtnDisabled]}
          onPress={onMuteToggle}
          disabled={isPinnedOffline}
          activeOpacity={0.75}
        >
          <Text style={styles.muteIcon}>{isMuted ? '🔇' : '🔊'}</Text>
        </TouchableOpacity>
      </View>

      {/* Slider row */}
      <View style={[styles.sliderRow, (isMuted || isPinnedOffline) && styles.sliderRowMuted]}>
        <Text style={styles.sliderEdge}>0</Text>
        <View
          style={styles.sliderHitArea}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            sliderWidthRef.current = w;
            setSliderWidth(w);
          }}
          {...panResponder.panHandlers}
        >
          <View style={styles.sliderTrack}>
            <View
              style={[
                styles.sliderFill,
                { width: fillPct, backgroundColor: isMuted ? '#882222' : '#5B4FE8' },
              ]}
            />
          </View>
          {sliderWidth > 0 && (
            <View style={[styles.sliderThumb, { left: thumbLeft }]} />
          )}
        </View>
        <Text style={styles.sliderEdge}>100</Text>
        <Text style={[styles.volPct, isMuted && styles.volPctMuted]}>
          {Math.round(vol * 100)}%
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2e2e50',
    padding: 16,
    marginHorizontal: 12,
    marginBottom: 12,
    gap: 14,
  },
  cardMuted: {
    borderColor: '#441a1a',
    backgroundColor: '#160d0d',
  },
  cardPinnedOffline: {
    borderColor: '#2a2a44',
    backgroundColor: '#12121f',
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    marginHorizontal: 12,
    marginBottom: 12,
  },
  emptyText: { color: '#6B6B8A', fontSize: 13 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: { flexShrink: 0 },
  iconWrapMuted: { opacity: 0.5 },
  meta: { flex: 1, gap: 2 },
  name: { color: '#fff', fontSize: 15, fontWeight: '700' },
  nameMuted: { color: '#ff6666' },
  status: { color: '#555577', fontSize: 10 },
  statusMuted: { color: '#663333' },
  macNote: { color: '#6B6B8A', fontSize: 9, marginTop: 2 },
  muteBtn: {
    width: 34,
    height: 34,
    backgroundColor: '#1e1e38',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2e2e50',
    flexShrink: 0,
  },
  muteBtnActive: {
    backgroundColor: '#1a0d0d',
    borderColor: '#441a1a',
  },
  muteBtnDisabled: { opacity: 0.45 },
  muteIcon: { fontSize: 15 },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sliderRowMuted: { opacity: 0.45 },
  sliderEdge: { color: '#444', fontSize: 9, minWidth: 8, textAlign: 'center' },
  sliderHitArea: {
    flex: 1,
    height: 28,
    justifyContent: 'center',
  },
  sliderTrack: {
    height: 6,
    backgroundColor: '#1e1e38',
    borderRadius: 3,
  },
  sliderFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    borderRadius: 3,
  },
  sliderThumb: {
    position: 'absolute',
    top: 7,
    width: THUMB_RADIUS * 2,
    height: THUMB_RADIUS * 2,
    borderRadius: THUMB_RADIUS,
    backgroundColor: '#fff',
    shadowColor: '#5B4FE8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 4,
  },
  volPct: { color: '#5B4FE8', fontSize: 12, fontWeight: '700', minWidth: 32, textAlign: 'right' },
  volPctMuted: { color: '#ff4444' },
});
