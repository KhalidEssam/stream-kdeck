import React from 'react';
import {
  TouchableOpacity,
  View,
  Text,
  Image,
  StyleSheet,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { MediaSession } from '../types/schema';

interface Props {
  session: MediaSession;
  isActive: boolean;
  onTap: (session: MediaSession) => void;
  onLongPress: (session: MediaSession) => void;
}

const RING_SIZE = 36;
const RADIUS = 13;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function ringColor(isActive: boolean, muted: boolean): string {
  if (muted) return '#FF4444';
  if (isActive) return '#5B4FE8';
  return '#3A3A5A';
}

export function MediaAppCard({ session, isActive, onTap, onLongPress }: Props) {
  const arc = CIRCUMFERENCE * Math.max(0, Math.min(1, session.volume));
  const gap = CIRCUMFERENCE - arc;

  return (
    <TouchableOpacity
      style={[styles.card, isActive && styles.cardActive, session.muted && styles.cardMuted]}
      onPress={() => onTap(session)}
      onLongPress={() => onLongPress(session)}
      activeOpacity={0.75}
    >
      <View style={styles.ringContainer}>
        <Svg width={RING_SIZE} height={RING_SIZE} style={styles.svg}>
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RADIUS}
            stroke="#2A2040"
            strokeWidth={3}
            fill="none"
          />
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RADIUS}
            stroke={ringColor(isActive, session.muted)}
            strokeWidth={3}
            fill="none"
            strokeDasharray={`${arc} ${gap}`}
            strokeLinecap="round"
            rotation={-90}
            origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
          />
        </Svg>
        {session.iconBase64 ? (
          <Image
            source={{ uri: `data:image/png;base64,${session.iconBase64}` }}
            style={styles.icon}
          />
        ) : (
          <Text style={styles.iconFallback}>🔊</Text>
        )}
      </View>
      <Text style={[styles.label, isActive && styles.labelActive]} numberOfLines={1}>
        {session.label}
      </Text>
      <Text style={[styles.volume, session.muted && styles.volumeMuted]}>
        {session.muted ? '🔇' : `${Math.round(session.volume * 100)}%`}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1A1A2E',
    borderRadius: 10,
    padding: 8,
    alignItems: 'center',
    width: 76,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  cardActive: {
    backgroundColor: '#1E1030',
    borderColor: '#5B4FE8',
  },
  cardMuted: {
    opacity: 0.55,
  },
  ringContainer: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  svg: {
    position: 'absolute',
  },
  icon: {
    width: 20,
    height: 20,
    borderRadius: 4,
  },
  iconFallback: {
    fontSize: 14,
  },
  label: {
    color: '#888AAA',
    fontSize: 8,
    fontWeight: '600',
    textAlign: 'center',
    width: '100%',
  },
  labelActive: {
    color: '#FFFFFF',
  },
  volume: {
    color: '#555',
    fontSize: 7,
    marginTop: 2,
  },
  volumeMuted: {
    color: '#FF4444',
  },
});
