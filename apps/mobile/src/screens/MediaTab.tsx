import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  View,
  FlatList,
  Image,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
} from 'react-native';
import { AppSearchResult, MediaSession } from '../types/schema';
import { WebSocketService } from '../services/websocket.service';
import { MediaHeroCard } from '../components/MediaHeroCard';
import { MediaAppCard } from '../components/MediaAppCard';
import { useVolumeButtons } from '../hooks/useVolumeButtons';

interface Props {
  sessions: MediaSession[];
  platform: 'win32' | 'darwin' | null;
  ws: WebSocketService | null;
  onSessionsChange?: (sessions: MediaSession[]) => void;
}

function isVisible(s: MediaSession): boolean {
  if (s.pinned) return true;
  return s.volume > 0;
}

const SOURCE_LABEL: Record<AppSearchResult['source'], string> = {
  startmenu: 'Start',
  windows: 'Windows',
  filesystem: 'File',
  steam: 'Steam',
  epic: 'Epic',
};

const SOURCE_COLOR: Record<AppSearchResult['source'], string> = {
  startmenu: '#5B4FE8',
  windows: '#2F80ED',
  filesystem: '#6B6B8A',
  steam: '#171A21',
  epic: '#2B2B2B',
};

function mediaProcessNameForResult(item: AppSearchResult): string | null {
  if (item.processName) return item.processName;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(item.exePath)) return null;
  const fileName = item.exePath.split(/[\\/]+/).pop() ?? '';
  return fileName.toLowerCase().endsWith('.exe') ? fileName : null;
}

export function MediaTab({ sessions, platform, ws, onSessionsChange }: Props) {
  const [activeProcessName, setActiveProcessName] = useState<string | null>(null);
  const [localSessions, setLocalSessions] = useState<MediaSession[]>(sessions);
  const [actionSession, setActionSession] = useState<MediaSession | null>(null);
  const [showPinSearch, setShowPinSearch] = useState(false);
  const [pinSearch, setPinSearch] = useState('');
  const [pinResults, setPinResults] = useState<AppSearchResult[]>([]);
  const [searchingPins, setSearchingPins] = useState(false);
  const [searchedPins, setSearchedPins] = useState(false);
  const volumeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    setLocalSessions(sessions);
    setActiveProcessName(prev => {
      if (prev && sessions.some(s => s.processName === prev)) return prev;
      return sessions.find(s => s.active !== false && s.volume > 0)?.processName
        ?? sessions.find(s => s.pinned)?.processName
        ?? null;
    });
  }, [sessions]);

  const visibleSessions = localSessions.filter(isVisible);
  const activeSession = localSessions.find(s => s.processName === activeProcessName) ?? null;
  const activeCount = visibleSessions.filter(s => s.active !== false && s.volume > 0).length;
  const pinnedProcessNames = new Set(
    localSessions.filter(s => s.pinned).map(s => s.processName.toLowerCase()),
  );

  const setOptimisticSessions = useCallback((updater: (sessions: MediaSession[]) => MediaSession[]) => {
    setLocalSessions(prev => {
      const next = updater(prev);
      onSessionsChange?.(next);
      return next;
    });
  }, [onSessionsChange]);

  React.useEffect(() => {
    ws?.requestMediaState();
  }, [ws]);

  React.useEffect(() => {
    if (!ws || !showPinSearch) return undefined;
    return ws.onSearchAppsResult((msg) => {
      setPinResults(msg.results);
      setSearchingPins(false);
      setSearchedPins(true);
    });
  }, [showPinSearch, ws]);

  React.useEffect(() => {
    if (!showPinSearch || !ws) return undefined;
    const query = pinSearch.trim();
    if (query.length < 2) {
      setPinResults([]);
      setSearchingPins(false);
      setSearchedPins(false);
      return undefined;
    }

    const timeout = setTimeout(() => {
      setSearchingPins(true);
      setSearchedPins(false);
      ws.searchApps(query);
    }, 400);
    return () => clearTimeout(timeout);
  }, [pinSearch, showPinSearch, ws]);

  const handleDelta = useCallback((delta: number) => {
    if (!activeProcessName || activeSession?.active === false || !ws) return;
    ws.sendMediaVolumeDelta(activeProcessName, delta);
    setOptimisticSessions(prev =>
      prev.map(s =>
        s.processName === activeProcessName
          ? { ...s, volume: Math.max(0, Math.min(1, s.volume + delta)) }
          : s,
      ),
    );
  }, [activeProcessName, activeSession?.active, setOptimisticSessions, ws]);

  useVolumeButtons({ enabled: !!activeProcessName && !!activeSession && activeSession.active !== false, onDelta: handleDelta });

  const handleVolumeChange = useCallback((volume: number) => {
    if (!activeProcessName || !ws) return;
    const session = localSessions.find(s => s.processName === activeProcessName);
    if (!session || session.active === false) return;
    setOptimisticSessions(prev =>
      prev.map(s => s.processName === activeProcessName ? { ...s, volume } : s),
    );
    if (volumeDebounceRef.current) clearTimeout(volumeDebounceRef.current);
    volumeDebounceRef.current = setTimeout(() => {
      ws.sendSetVolume(activeProcessName, volume);
    }, 50);
  }, [activeProcessName, localSessions, setOptimisticSessions, ws]);

  const handleMuteToggle = useCallback(() => {
    if (!activeProcessName || !ws) return;
    const session = localSessions.find(s => s.processName === activeProcessName);
    if (!session || session.active === false) return;
    const newMuted = !session.muted;
    ws.sendMediaSetMute(activeProcessName, newMuted);
    setOptimisticSessions(prev =>
      prev.map(s => s.processName === activeProcessName ? { ...s, muted: newMuted } : s),
    );
  }, [activeProcessName, ws, localSessions, setOptimisticSessions]);

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
    ws?.sendMediaPinApp(
      actionSession.processName,
      actionSession.label,
      !actionSession.pinned,
      actionSession.iconBase64,
    );
    const shouldPin = !actionSession.pinned;
    setOptimisticSessions(prev => {
      if (shouldPin) {
        return prev.map(s =>
          s.processName === actionSession.processName
            ? { ...s, pinned: true }
            : s,
        );
      }
      return prev
        .map(s =>
          s.processName === actionSession.processName && s.active
            ? { ...s, pinned: false }
            : s,
        )
        .filter(s => s.processName !== actionSession.processName || s.active);
    });
    ws?.requestMediaState();
    setActionSession(null);
  };

  const openPinSearch = () => {
    setShowPinSearch(true);
    setPinSearch('');
    setPinResults([]);
    setSearchingPins(false);
    setSearchedPins(false);
  };

  const closePinSearch = () => {
    setShowPinSearch(false);
    setPinSearch('');
    setPinResults([]);
    setSearchingPins(false);
    setSearchedPins(false);
  };

  const handlePinResult = (item: AppSearchResult) => {
    const processName = mediaProcessNameForResult(item);
    if (!processName || !ws) return;

    ws.sendMediaPinApp(processName, item.name, true, item.iconBase64);
    setOptimisticSessions(prev => {
      const existing = prev.find(s => s.processName.toLowerCase() === processName.toLowerCase());
      if (existing) {
        return prev.map(s =>
          s.processName.toLowerCase() === processName.toLowerCase()
            ? { ...s, label: item.name, iconBase64: item.iconBase64 ?? s.iconBase64, pinned: true }
            : s,
        );
      }
      return [
        ...prev,
        {
          processName,
          label: item.name,
          iconBase64: item.iconBase64,
          volume: 0,
          muted: false,
          pinned: true,
          active: false,
        },
      ];
    });
    setActiveProcessName(processName);
    ws.requestMediaState();
    closePinSearch();
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
          <Text style={styles.emptyHint}>Start playing audio or pin an app to keep it here</Text>
          <TouchableOpacity
            style={[styles.pinAppButton, !ws && styles.pinAppButtonDisabled]}
            onPress={openPinSearch}
            disabled={!ws}
            activeOpacity={0.78}
          >
            <Text style={styles.pinAppButtonText}>+ Pin App</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>
              ALL SOURCES · {activeCount} ACTIVE
            </Text>
            <TouchableOpacity
              style={[styles.pinAppButtonSmall, !ws && styles.pinAppButtonDisabled]}
              onPress={openPinSearch}
              disabled={!ws}
              activeOpacity={0.78}
            >
              <Text style={styles.pinAppButtonSmallText}>+ Pin App</Text>
            </TouchableOpacity>
          </View>
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
        visible={showPinSearch}
        transparent
        animationType="fade"
        onRequestClose={closePinSearch}
      >
        <View style={styles.sheetBackdrop}>
          <View style={styles.pinSheet}>
            <View style={styles.pinSheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>Pin media app</Text>
                <Text style={styles.pinSheetHint}>Pinned apps stay visible when silent.</Text>
              </View>
              <TouchableOpacity onPress={closePinSearch} style={styles.closeBtn} activeOpacity={0.75}>
                <Text style={styles.closeBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.searchShell}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search installed apps..."
                placeholderTextColor="#6B6B8A"
                value={pinSearch}
                onChangeText={setPinSearch}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                onSubmitEditing={() => {
                  const query = pinSearch.trim();
                  if (query.length < 2 || !ws) return;
                  setSearchingPins(true);
                  setSearchedPins(false);
                  ws.searchApps(query);
                }}
              />
              {searchingPins ? <ActivityIndicator size="small" color="#B9B5FF" /> : null}
            </View>
            <FlatList
              data={pinResults}
              keyExtractor={(item, index) => `${item.source}-${item.exePath}-${index}`}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.pinResultsContent}
              renderItem={({ item }) => {
                const processName = mediaProcessNameForResult(item);
                const isPinned = !!processName && pinnedProcessNames.has(processName.toLowerCase());
                const canPin = !!processName && !isPinned;
                return (
                  <View style={[styles.resultRow, isPinned && styles.resultRowSelected]}>
                    <View style={[styles.resultIcon, { backgroundColor: SOURCE_COLOR[item.source] }]}>
                      {item.iconBase64 ? (
                        <Image
                          source={{ uri: `data:image/png;base64,${item.iconBase64}` }}
                          style={styles.iconImage}
                        />
                      ) : (
                        <Text style={styles.iconLetter}>{item.name.charAt(0).toUpperCase()}</Text>
                      )}
                    </View>
                    <View style={styles.resultText}>
                      <Text style={styles.resultName} numberOfLines={1}>{item.name}</Text>
                      <View style={[styles.sourceBadge, { backgroundColor: SOURCE_COLOR[item.source] }]}>
                        <Text style={styles.sourceBadgeText}>
                          {processName ? SOURCE_LABEL[item.source] : 'No media process'}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={[styles.resultButton, !canPin && styles.resultButtonDisabled]}
                      onPress={() => handlePinResult(item)}
                      disabled={!canPin}
                      activeOpacity={0.78}
                    >
                      <Text style={styles.resultButtonText}>{isPinned ? 'Pinned' : 'Pin'}</Text>
                    </TouchableOpacity>
                  </View>
                );
              }}
              ListEmptyComponent={
                !searchingPins && searchedPins ? (
                  <Text style={styles.noResults}>No media-capable matches found.</Text>
                ) : pinSearch.trim().length < 2 ? (
                  <Text style={styles.noResults}>Type at least 2 characters.</Text>
                ) : null
              }
            />
          </View>
        </View>
      </Modal>

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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 14,
    marginBottom: 8,
    gap: 12,
  },
  sectionLabel: {
    color: '#44446a',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 1.5,
    flex: 1,
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
  pinAppButton: {
    marginTop: 8,
    backgroundColor: '#5B4FE8',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  pinAppButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  pinAppButtonSmall: {
    backgroundColor: '#1e1e38',
    borderWidth: 1,
    borderColor: '#2e2e50',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  pinAppButtonSmallText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  pinAppButtonDisabled: { opacity: 0.45 },
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
  pinSheet: {
    maxHeight: '78%',
    backgroundColor: '#1A1A2E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
    gap: 12,
  },
  pinSheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  pinSheetHint: { color: '#6B6B8A', fontSize: 12, marginTop: -2 },
  closeBtn: {
    borderWidth: 1,
    borderColor: '#2e2e50',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  closeBtnText: { color: '#B9B5FF', fontSize: 12, fontWeight: '700' },
  searchShell: {
    minHeight: 46,
    backgroundColor: '#10101F',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#242442',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    paddingVertical: 10,
  },
  pinResultsContent: {
    gap: 8,
    paddingBottom: 8,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#111120',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#20203A',
    padding: 10,
  },
  resultRowSelected: { borderColor: '#5B4FE8', backgroundColor: '#191936' },
  resultIcon: {
    width: 38,
    height: 38,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  iconImage: { width: '100%', height: '100%' },
  iconLetter: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  resultText: { flex: 1, minWidth: 0, gap: 4 },
  resultName: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  sourceBadge: {
    alignSelf: 'flex-start',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sourceBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' },
  resultButton: {
    backgroundColor: '#5B4FE8',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 64,
    alignItems: 'center',
  },
  resultButtonDisabled: { opacity: 0.45, backgroundColor: '#2A2A3F' },
  resultButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  noResults: { color: '#6B6B8A', fontSize: 13, textAlign: 'center', paddingVertical: 18 },
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
