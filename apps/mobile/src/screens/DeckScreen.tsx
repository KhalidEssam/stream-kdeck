import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  View,
  FlatList,
  Text,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { AppTile } from '../components/AppTile';
import { AddTileScreen } from './AddTileScreen';
import { WebSocketService } from '../services/websocket.service';
import { TileConfig } from '../types/schema';

// Replace with your desktop machine's local IP address during development.
// Find it with: ipconfig (Windows) or ifconfig | grep inet (macOS)
// mDNS auto-discovery replaces this hardcoded IP in the Week 3-4 Core Expansion plan.
const AGENT_URL = 'ws://192.168.1.5:3001';

type DeckTab = 'ai' | 'apps' | 'shortcuts';

const DECK_TABS: Array<{ key: DeckTab; label: string }> = [
  { key: 'ai', label: 'AI Tools' },
  { key: 'apps', label: 'Apps' },
  { key: 'shortcuts', label: 'Shortcuts' },
];

export function DeckScreen() {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [tiles, setTiles] = useState<TileConfig[] | null>(null); // null = waiting for DECK_CONFIG
  const [activeTab, setActiveTab] = useState<DeckTab>('ai');
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [viewerText, setViewerText] = useState<string | null>(null);
  const [showAddTile, setShowAddTile] = useState(false);
  const [actionTile, setActionTile] = useState<TileConfig | null>(null);
  const [wsService, setWsService] = useState<WebSocketService | null>(null);
  const wsRef = useRef<WebSocketService | null>(null);

  useEffect(() => {
    const ws = new WebSocketService(AGENT_URL);
    wsRef.current = ws;
    setWsService(ws);
    ws.onStatusChange(setStatus);
    ws.onResult((result) => {
      setLoadingId(null);
      if (result.output) setViewerText(result.output);
    });
    ws.onDeckConfig((msg) => {
      setTiles(msg.tiles);
    });
    return () => {
      ws.disconnect();
      wsRef.current = null;
      setWsService(null);
    };
  }, []);

  const handleRefresh = () => {
    setLoadingId(null);
    setViewerText(null);
    setTiles(null);
    wsRef.current?.reconnect();
  };

  const handleTap = (tile: TileConfig) => {
    if (status !== 'connected') return;
    setLoadingId(tile.id);
    wsRef.current?.tap(tile.id, tile.action);
  };

  const handleAddTile = (tile: Omit<TileConfig, 'id'>) => {
    wsRef.current?.addTile(tile);
    // DECK_CONFIG response from agent will update tiles via onDeckConfig callback
  };

  const handleRemoveTile = (tileId: string) => {
    wsRef.current?.removeTile(tileId);
  };

  const handleRequestTileActions = (tile: TileConfig) => {
    setActionTile(tile);
  };

  const handleTogglePinned = () => {
    if (!actionTile || actionTile.id.startsWith('builtin-')) return;
    wsRef.current?.setTilePinned(actionTile.id, !actionTile.pinned);
    setActionTile(null);
  };

  const handleConfirmRemoveTile = () => {
    if (!actionTile || actionTile.id.startsWith('builtin-')) return;
    handleRemoveTile(actionTile.id);
    setActionTile(null);
  };

  const statusColor =
    status === 'connected' ? '#44FF88' : status === 'connecting' ? '#FFB800' : '#FF4444';
  const statusLabel = { connecting: 'Connecting…', connected: 'Connected', disconnected: 'Disconnected' }[status];
  const tabCounts = useMemo(() => {
    const counts: Record<DeckTab, number> = { ai: 0, apps: 0, shortcuts: 0 };
    for (const tile of tiles ?? []) {
      if (tile.kind === 'ai') counts.ai += 1;
      else if (tile.kind === 'shortcut') counts.shortcuts += 1;
      else counts.apps += 1;
    }
    return counts;
  }, [tiles]);
  const visibleTiles = useMemo(() => {
    return (tiles ?? []).filter((tile) => {
      if (activeTab === 'ai') return tile.kind === 'ai';
      if (activeTab === 'shortcuts') return tile.kind === 'shortcut';
      return tile.kind !== 'ai' && tile.kind !== 'shortcut';
    });
  }, [activeTab, tiles]);
  const emptyCopy =
    activeTab === 'ai'
      ? { title: 'No AI tools yet.', hint: 'Reconnect to load the built-in tools.' }
      : activeTab === 'apps'
        ? { title: 'No apps yet.', hint: 'Tap + to add apps, games, or URLs.' }
        : { title: 'No shortcuts yet.', hint: 'Tap + to add keyboard shortcuts.' };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />

      <View style={styles.header}>
        <Text style={styles.title}>Control Surface</Text>
        <TouchableOpacity style={styles.statusBadge} onPress={handleRefresh} activeOpacity={0.7}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
          <Text style={styles.refreshIcon}>↺</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabBar}>
        {DECK_TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.75}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]} numberOfLines={1}>
                {tab.label}
              </Text>
              <Text style={[styles.tabCount, isActive && styles.tabCountActive]}>
                {tabCounts[tab.key]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {viewerText !== null && (
        <View style={styles.viewer}>
          <ScrollView style={styles.viewerScroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.viewerText} selectable>{viewerText}</Text>
          </ScrollView>
          <TouchableOpacity style={styles.viewerDismiss} onPress={() => setViewerText(null)}>
            <Text style={styles.viewerDismissText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}

      {tiles === null ? (
        // Skeleton — waiting for DECK_CONFIG
        <View style={styles.skeletonGrid}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={styles.skeletonTile} />
          ))}
        </View>
      ) : visibleTiles.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>{emptyCopy.title}</Text>
          <Text style={styles.emptyHint}>{emptyCopy.hint}</Text>
        </View>
      ) : (
        <FlatList
          data={visibleTiles}
          keyExtractor={(item) => item.id}
          numColumns={3}
          renderItem={({ item }) => (
            <AppTile
              tile={item}
              isLoading={item.id === loadingId}
              onTap={handleTap}
              onLongPress={handleRequestTileActions}
            />
          )}
          contentContainerStyle={styles.grid}
        />
      )}

      {/* FAB — add tile */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowAddTile(true)} activeOpacity={0.8}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* AddTile modal */}
      <Modal
        visible={showAddTile}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddTile(false)}
      >
        {wsService && (
          <AddTileScreen
            currentTiles={tiles ?? []}
            onAdd={handleAddTile}
            onRemove={handleRemoveTile}
            onDismiss={() => setShowAddTile(false)}
            ws={wsService}
          />
        )}
      </Modal>

      <Modal
        visible={actionTile !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setActionTile(null)}
      >
        <View style={styles.actionsBackdrop}>
          <View style={styles.actionsDialog}>
            <Text style={styles.actionsTitle}>Tile Options</Text>
            <Text style={styles.actionsBody} numberOfLines={2}>
              {actionTile?.label}
            </Text>
            {actionTile?.id.startsWith('builtin-') && (
              <Text style={styles.actionsHint}>Built-in tiles stay fixed.</Text>
            )}
            <View style={styles.actionsList}>
              {!actionTile?.id.startsWith('builtin-') && (
                <TouchableOpacity
                  style={styles.optionButton}
                  onPress={handleTogglePinned}
                  activeOpacity={0.75}
                >
                  <Text style={styles.optionButtonText}>
                    {actionTile?.pinned ? 'Unpin from Top' : 'Pin to Top'}
                  </Text>
                </TouchableOpacity>
              )}
              {!actionTile?.id.startsWith('builtin-') && (
                <TouchableOpacity
                  style={[styles.optionButton, styles.dangerOptionButton]}
                  onPress={handleConfirmRemoveTile}
                  activeOpacity={0.75}
                >
                  <Text style={styles.optionButtonText}>Remove Tile</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.actionsFooter}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setActionTile(null)}
                activeOpacity={0.75}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F14' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', flex: 1 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '600' },
  refreshIcon: { color: '#6B6B8A', fontSize: 16, marginLeft: 2 },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 8,
  },
  tab: {
    flex: 1,
    minHeight: 46,
    borderRadius: 8,
    backgroundColor: '#1A1A2E',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  tabActive: { backgroundColor: '#5B4FE8', borderColor: '#7A70FF' },
  tabText: { color: '#8A8AAA', fontSize: 12, fontWeight: '700' },
  tabTextActive: { color: '#FFFFFF' },
  tabCount: { color: '#6B6B8A', fontSize: 11, fontWeight: '700', marginTop: 2 },
  tabCountActive: { color: 'rgba(255,255,255,0.78)' },
  grid: { padding: 8, paddingBottom: 80 },
  skeletonGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 8 },
  skeletonTile: {
    flex: 1,
    margin: 5,
    aspectRatio: 1,
    minWidth: '30%',
    maxWidth: '32%',
    backgroundColor: '#1E1E2E',
    borderRadius: 14,
    opacity: 0.4,
  },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  emptyHint: { color: '#6B6B8A', fontSize: 13 },
  viewer: {
    margin: 12,
    maxHeight: 200,
    backgroundColor: '#1A1A2E',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  viewerScroll: { padding: 14 },
  viewerText: { color: '#E0E0E0', fontSize: 14, lineHeight: 22 },
  viewerDismiss: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
  },
  viewerDismissText: { color: '#6B6B8A', fontSize: 13, fontWeight: '600' },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#5B4FE8',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#5B4FE8',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  fabText: { color: '#FFFFFF', fontSize: 28, fontWeight: '300', lineHeight: 32 },
  actionsBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  actionsDialog: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#1A1A2E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 18,
  },
  actionsTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  actionsBody: { color: '#AAAACC', fontSize: 14, marginTop: 8 },
  actionsHint: { color: '#6B6B8A', fontSize: 12, marginTop: 8 },
  actionsList: { gap: 10, marginTop: 18 },
  optionButton: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: '#5B4FE8',
  },
  dangerOptionButton: { backgroundColor: '#5A2731' },
  optionButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  actionsFooter: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 },
  cancelButton: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#2A2A3A',
  },
  cancelButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});
