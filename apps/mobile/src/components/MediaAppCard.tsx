import React from 'react';
import { TouchableOpacity, View, Text, Image, StyleSheet } from 'react-native';
import { MediaSession } from '../types/schema';

interface Props {
  session: MediaSession;
  isActive: boolean;
  onTap: (session: MediaSession) => void;
  onLongPress: (session: MediaSession) => void;
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
        style={{ width: size, height: size, borderRadius: size * 0.25 }}
      />
    );
  }
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size * 0.25, backgroundColor: avatarColor(session.processName) },
      ]}
    >
      <Text style={[styles.avatarLetter, { fontSize: size * 0.45 }]}>
        {session.label.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

export function MediaAppCard({ session, isActive, onTap, onLongPress }: Props) {
  const isPinnedOffline = session.pinned && session.active === false;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        isActive && styles.cardActive,
        session.muted && !isPinnedOffline && styles.cardMuted,
        isPinnedOffline && styles.cardPinned,
      ]}
      onPress={() => onTap(session)}
      onLongPress={() => onLongPress(session)}
      activeOpacity={0.75}
    >
      <View style={styles.iconWrap}>
        <AppIcon session={session} size={32} />
      </View>
      <Text style={[styles.label, isActive && styles.labelActive]} numberOfLines={1}>
        {session.label}
      </Text>
      {isPinnedOffline ? (
        <Text style={styles.pinnedLabel}>📌</Text>
      ) : session.muted ? (
        <Text style={styles.mutedLabel}>🔇</Text>
      ) : (
        <Text style={[styles.volLabel, isActive && styles.volLabelActive]}>
          {Math.round(session.volume * 100)}%
        </Text>
      )}
      {!isPinnedOffline && (
        <View style={styles.miniBar}>
          <View
            style={[
              styles.miniBarFill,
              {
                width: `${Math.round(session.volume * 100)}%`,
                backgroundColor: session.muted ? '#ff444466' : isActive ? '#5B4FE8' : '#3a3a6a',
              },
            ]}
          />
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: '#111120',
    borderRadius: 10,
    padding: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1a1a2e',
    minWidth: 0,
  },
  cardActive: {
    backgroundColor: '#13133a',
    borderColor: '#5B4FE8',
  },
  cardMuted: {
    opacity: 0.5,
    backgroundColor: '#130d0d',
    borderColor: '#1a1010',
  },
  cardPinned: {
    backgroundColor: '#0c0c18',
    borderColor: '#22223a',
    borderStyle: 'dashed',
  },
  iconWrap: {
    marginBottom: 5,
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    color: '#fff',
    fontWeight: '700',
  },
  label: {
    color: '#888',
    fontSize: 9,
    fontWeight: '600',
    textAlign: 'center',
    width: '100%',
    marginBottom: 2,
  },
  labelActive: { color: '#fff' },
  volLabel: { color: '#555', fontSize: 9, marginBottom: 3 },
  volLabelActive: { color: '#9b8fff' },
  mutedLabel: { fontSize: 9, marginBottom: 3 },
  pinnedLabel: { fontSize: 9, marginBottom: 3, color: '#555' },
  miniBar: {
    width: '100%',
    height: 2,
    backgroundColor: '#1e1e38',
    borderRadius: 1,
    overflow: 'hidden',
  },
  miniBarFill: {
    height: '100%',
    borderRadius: 1,
  },
});
