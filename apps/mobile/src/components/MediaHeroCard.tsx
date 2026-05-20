import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Animated,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { MediaSession } from '../types/schema';

interface Props {
  session: MediaSession | null;
  platform: 'win32' | 'darwin' | null;
}

const RING_SIZE = 72;
const RADIUS = 28;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function MediaHeroCard({ session, platform }: Props) {
  const animVol = useRef(new Animated.Value(session?.volume ?? 0)).current;

  useEffect(() => {
    if (session) {
      Animated.timing(animVol, {
        toValue: session.volume,
        duration: 120,
        useNativeDriver: false,
      }).start();
    }
  }, [session?.volume, animVol]);

  if (!session) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Tap an app below to control its volume</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.ringContainer}>
        <Svg width={RING_SIZE} height={RING_SIZE} style={styles.svg}>
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RADIUS}
            stroke="#2A2040"
            strokeWidth={5}
            fill="none"
          />
        </Svg>
        <AnimatedArc volume={session.volume} muted={session.muted} />
        <View style={styles.iconWrapper}>
          {session.iconBase64 ? (
            <Image
              source={{ uri: `data:image/png;base64,${session.iconBase64}` }}
              style={styles.icon}
            />
          ) : (
            <Text style={styles.iconFallback}>🔊</Text>
          )}
        </View>
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>{session.label}</Text>
        <Text style={[styles.volume, session.muted && styles.volumeMuted]}>
          {session.muted ? '🔇 Muted' : `${Math.round(session.volume * 100)}%`}
        </Text>
        {!session.muted && (
          <Text style={styles.hint}>vol buttons active</Text>
        )}
        {platform === 'darwin' && session.processName === 'system' && (
          <Text style={styles.macNote}>Per-app volume: Windows only</Text>
        )}
      </View>
    </View>
  );
}

function AnimatedArc({ volume, muted }: { volume: number; muted: boolean }) {
  const arc = CIRCUMFERENCE * Math.max(0, Math.min(1, volume));
  const gap = CIRCUMFERENCE - arc;
  return (
    <Svg width={RING_SIZE} height={RING_SIZE} style={StyleSheet.absoluteFill}>
      <Circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RADIUS}
        stroke={muted ? '#FF4444' : '#5B4FE8'}
        strokeWidth={5}
        fill="none"
        strokeDasharray={`${arc} ${gap}`}
        strokeLinecap="round"
        rotation={-90}
        origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1030',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#5B4FE8',
    padding: 14,
    marginHorizontal: 12,
    marginBottom: 10,
    gap: 16,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    marginHorizontal: 12,
    marginBottom: 10,
  },
  emptyText: {
    color: '#6B6B8A',
    fontSize: 13,
  },
  ringContainer: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  svg: {
    position: 'absolute',
  },
  iconWrapper: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 6,
  },
  iconFallback: {
    fontSize: 24,
  },
  info: {
    flex: 1,
    gap: 3,
  },
  name: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  volume: {
    color: '#9B8FFF',
    fontSize: 13,
    fontWeight: '600',
  },
  volumeMuted: {
    color: '#FF4444',
  },
  hint: {
    color: '#555577',
    fontSize: 10,
  },
  macNote: {
    color: '#6B6B8A',
    fontSize: 9,
    marginTop: 2,
  },
});
