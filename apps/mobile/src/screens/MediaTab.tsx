import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  FlatList,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
} from 'react-native';
import { MediaSession } from '../types/schema';
import { WebSocketService } from '../services/websocket.service';
import { MediaHeroCard } from '../components/MediaHeroCard';
import { MediaAppCard } from '../components/MediaAppCard';
import { useVolumeButtons } from '../hooks/useVolumeButtons';

interface Props {
  sessions: MediaSession[];
  platform: 'win32' | 'darwin' | null;
  ws: WebSocketService | null;
}

function isVisible(s: MediaSession): boolean {
  if (s.pinned) return true;
  return s.volume > 0;
}

export function MediaTab({ sessions, platform, ws }: Props) {
  const [activeProcessName, setActiveProcessName] = useState<string | null>(null);
  const [localSessions, setLocalSessions] = useState<MediaSession[]>(sessions);
  const [actionSession, setActionSession] = useState<MediaSession | null>(null);
  const volumeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    setLocalSessions(sessions);
    setActiveProcessName(prev => {
      if (prev && sessions.some(s => s.processName === prev)) return prev;
      return sessions.find(s => s.volume > 0)?.processName ?? null;
    });
  }, [sessions]);

  const visibleSessions = localSessions.filter(isVisible);
  const activeSession = localSessions.find(s => s.processName === activeProcessName) ?? null;
  const activeCount = visibleSessions.filter(s => s.volume > 0).length;

  const handleDelta = useCallback((delta: number) => {
    if (!activeProcessName || !ws) return;
    ws.sendMediaVolumeDelta(activeProcessName, delta);
    setLocalSessions(prev =>
      prev.map(s =>
        s.processName === activeProcessName
          ? { ...s, volume: Math.max(0, Math.min(1, s.volume + delta)) }
          : s,
      ),
    );
  }, [activeProcessName, ws]);

  useVolumeButtons({ enabled: !!activeProcessName, onDelta: handleDelta });

  const handleVolumeChange = useCallback((volume: number) => {
    if (!activeProcessName || !ws) return;
    setLocalSessions(prev =>
      prev.map(s => s.processName === activeProcessName ? { ...s, volume } : s),
    );
    if (volumeDebounceRef.current) clearTimeout(volumeDebounceRef.current);
    volumeDebounceRef.current = setTimeout(() => {
      ws.sendSetVolume(activeProcessName, volume);
    }, 50);
  }, [activeProcessName, ws]);

  const handleMuteToggle = useCallback(() => {
    if (!activeProcessName || !ws) return;
    const session = localSessions.find(s => s.processName === activeProcessName);
    if (!session) return;
    const newMuted = !session.muted;
    ws.sendMediaSetMute(activeProcessName, newMuted);
    setLocalSessions(prev =>
      prev.map(s => s.processName === activeProcessName ? { ...s, muted: newMuted } : s),
    );
  }, [activeProcessName, ws, localSessions]);

  const handleTap = useCallback((session: MediaSession) => {
    if (session.processName !== activeProcessName) {
      setActiveProcessName(session.processName);
    }
  }, [activeProcessName]);

  const handleLongPress = useCallback((session: MediaSession) => {
    setActionSession(session);
  }, []);

  const handleBringToFront = () => {
    if (!actionSession) return;
    ws?.sendMediaBringToFront(actionSession.processName);
    setActionSession(null);
  };

  const handleTogglePin = () => {
    if (!actionSession) return;
    ws?.sendMediaPinApp(actionSession.processName, actionSession.label, !actionSession.pinned);
    setActionSession(null);
  };

  const hasAnySessions = visibleSessions.length > 0;

  return (
    <View style={styles.container}>
      <MediaHeroCard
        session={activeSession}
        platform={platform}
        onVolumeChange={handleVolumeChange}
        onMuteToggle={handleMuteToggle}
      />

      {!hasAnySessions ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🎵</Text>
          <Text style={styles.emptyText}>Nothing playing right now</Text>
          <Text style={styles.emptyHint}>Start playing audio in any app and it'll appear here</Text>
        </View>
      ) : (
        <>
          <Text style={styles.sectionLabel}>
            ALL SOURCES · {activeCount} ACTIVE
          </Text>
          <FlatList
            data={visibleSessions}
            numColumns={3}
            keyExtractor={(item) => item.processName}
            renderItem={({ item }) => (
              <View style={styles.gridCell}>
                <MediaAppCard
                  session={item}
                  isActive={item.processName === activeProcessName}
                  onTap={handleTap}
                  onLongPress={handleLongPress}
                />
              </View>
            )}
            columnWrapperStyle={styles.row}
            contentContainerStyle={styles.gridContent}
            showsVerticalScrollIndicator={false}
          />
        </>
      )}

      <Modal
        visible={actionSession !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setActionSession(null)}
      >
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{actionSession?.label}</Text>
            <TouchableOpacity style={styles.sheetBtn} onPress={handleTogglePin} activeOpacity={0.75}>
              <Text style={styles.sheetBtnText}>
                {actionSession?.pinned ? 'Unpin App' : 'Pin App'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetBtn} onPress={handleBringToFront} activeOpacity={0.75}>
              <Text style={styles.sheetBtnText}>Bring to Front</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetCancel} onPress={() => setActionSession(null)} activeOpacity={0.7}>
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  sectionLabel: {
    color: '#44446a',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 1.5,
    marginHorizontal: 14,
    marginBottom: 8,
  },
  gridContent: {
    paddingHorizontal: 12,
    paddingBottom: 16,
    gap: 7,
  },
  row: { gap: 7 },
  gridCell: { flex: 1 },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 24,
  },
  emptyIcon: { fontSize: 36 },
  emptyText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  emptyHint: { color: '#6B6B8A', fontSize: 13, textAlign: 'center' },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1A1A2E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
    gap: 10,
  },
  sheetTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  sheetBtn: {
    backgroundColor: '#5B4FE8',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  sheetBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  sheetCancel: { alignItems: 'center', paddingVertical: 8 },
  sheetCancelText: { color: '#555', fontSize: 14 },
});
