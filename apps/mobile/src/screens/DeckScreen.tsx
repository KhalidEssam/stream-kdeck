import React, { useEffect, useState, useRef } from 'react';
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

export function DeckScreen() {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [tiles, setTiles] = useState<TileConfig[] | null>(null); // null = waiting for DECK_CONFIG
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [viewerText, setViewerText] = useState<string | null>(null);
  const [showAddTile, setShowAddTile] = useState(false);
  const wsRef = useRef<WebSocketService | null>(null);

  useEffect(() => {
    const ws = new WebSocketService(AGENT_URL);
    wsRef.current = ws;
    ws.onStatusChange(setStatus);
    ws.onResult((result) => {
      setLoadingId(null);
      if (result.output) setViewerText(result.output);
    });
    ws.onDeckConfig((msg) => {
      setTiles(msg.tiles);
    });
    return () => ws.disconnect();
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

  const statusColor =
    status === 'connected' ? '#44FF88' : status === 'connecting' ? '#FFB800' : '#FF4444';
  const statusLabel = { connecting: 'Connecting…', connected: 'Connected', disconnected: 'Disconnected' }[status];

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
      ) : tiles.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No tiles yet.</Text>
          <Text style={styles.emptyHint}>Tap + to add apps and shortcuts.</Text>
        </View>
      ) : (
        <FlatList
          data={tiles}
          keyExtractor={(item) => item.id}
          numColumns={3}
          renderItem={({ item }) => (
            <AppTile
              tile={item}
              isLoading={item.id === loadingId}
              onTap={handleTap}
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
        <AddTileScreen
          currentTiles={tiles ?? []}
          onAdd={handleAddTile}
          onRemove={handleRemoveTile}
          onDismiss={() => setShowAddTile(false)}
        />
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
});
