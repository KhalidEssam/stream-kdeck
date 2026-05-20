import React, { useCallback, useState } from 'react';
import {
  View,
  FlatList,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Dimensions,
} from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;

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

const PAGE_SIZE = 4;

function chunk<T>(arr: T[], size: number): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < arr.length; i += size) pages.push(arr.slice(i, i + size));
  return pages;
}

export function MediaTab({ sessions, platform, ws }: Props) {
  const [activeProcessName, setActiveProcessName] = useState<string | null>(null);
  const [localSessions, setLocalSessions] = useState<MediaSession[]>(sessions);
  const [currentPage, setCurrentPage] = useState(0);
  const [actionSession, setActionSession] = useState<MediaSession | null>(null);

  React.useEffect(() => {
    setLocalSessions(sessions);
  }, [sessions]);

  const activeSession = localSessions.find(s => s.processName === activeProcessName) ?? null;

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

  const handleTap = useCallback((session: MediaSession) => {
    if (session.processName === activeProcessName) {
      const newMuted = !session.muted;
      ws?.sendMediaSetMute(session.processName, newMuted);
      setLocalSessions(prev =>
        prev.map(s => s.processName === session.processName ? { ...s, muted: newMuted } : s),
      );
    } else {
      setActiveProcessName(session.processName);
    }
  }, [activeProcessName, ws]);

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

  const allItems: (MediaSession | 'add')[] = [...localSessions, 'add'];
  const pages = chunk(allItems, PAGE_SIZE);

  const renderPage = ({ item: page }: { item: (MediaSession | 'add')[] }) => (
    <View style={styles.page}>
      {page.map((item) =>
        item === 'add' ? (
          <TouchableOpacity key="add" style={styles.addCard} activeOpacity={0.75}>
            <Text style={styles.addIcon}>＋</Text>
            <Text style={styles.addLabel}>Pin App</Text>
          </TouchableOpacity>
        ) : (
          <MediaAppCard
            key={item.processName}
            session={item}
            isActive={item.processName === activeProcessName}
            onTap={handleTap}
            onLongPress={handleLongPress}
          />
        ),
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <MediaHeroCard session={activeSession} platform={platform} />

      {localSessions.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No audio sources found</Text>
          <Text style={styles.emptyHint}>Play audio on your desktop to see apps here.</Text>
        </View>
      )}

      {localSessions.length > 0 && (
        <>
          <FlatList
            data={pages}
            keyExtractor={(_, i) => String(i)}
            renderItem={renderPage}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              const pageWidth = e.nativeEvent.layoutMeasurement.width;
              const offset = e.nativeEvent.contentOffset.x;
              setCurrentPage(Math.round(offset / pageWidth));
            }}
            contentContainerStyle={styles.listContent}
          />
          {pages.length > 1 && (
            <View style={styles.dots}>
              {pages.map((_, i) => (
                <View key={i} style={[styles.dot, i === currentPage && styles.dotActive]} />
              ))}
            </View>
          )}
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
  page: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    width: SCREEN_WIDTH,
  },
  listContent: { paddingVertical: 4 },
  addCard: {
    backgroundColor: '#1A1A2E',
    borderRadius: 10,
    padding: 8,
    alignItems: 'center',
    width: 76,
    borderWidth: 1,
    borderColor: '#333',
    borderStyle: 'dashed',
  },
  addIcon: { color: '#444', fontSize: 18, marginBottom: 4 },
  addLabel: { color: '#444', fontSize: 8 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: 8 },
  dot: { width: 5, height: 4, borderRadius: 2, backgroundColor: '#333' },
  dotActive: { width: 14, backgroundColor: '#5B4FE8' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  emptyText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
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
