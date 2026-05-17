import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { AppTile } from '../components/AppTile';
import { TileConfig } from '../types/schema';

const CURATED_APPS: Omit<TileConfig, 'id'>[] = [
  { kind: 'app', label: 'Spotify',       iconId: 'spotify',    action: { kind: 'APP_LAUNCH', appId: 'spotify' } },
  { kind: 'app', label: 'OBS Studio',    iconId: 'obs',        action: { kind: 'APP_LAUNCH', appId: 'obs' } },
  { kind: 'app', label: 'VS Code',       iconId: 'vscode',     action: { kind: 'APP_LAUNCH', appId: 'vscode' } },
  { kind: 'app', label: 'Chrome',        iconId: 'chrome',     action: { kind: 'APP_LAUNCH', appId: 'chrome' } },
  { kind: 'app', label: 'Discord',       iconId: 'discord',    action: { kind: 'APP_LAUNCH', appId: 'discord' } },
  { kind: 'app', label: 'WhatsApp',      iconId: 'whatsapp',   action: { kind: 'APP_LAUNCH', appId: 'whatsapp' } },
  { kind: 'app', label: 'Slack',         iconId: 'slack',      action: { kind: 'APP_LAUNCH', appId: 'slack' } },
  { kind: 'app', label: 'Notion',        iconId: 'notion',     action: { kind: 'APP_LAUNCH', appId: 'notion' } },
  { kind: 'app', label: 'Figma',         iconId: 'figma',      action: { kind: 'APP_LAUNCH', appId: 'figma' } },
  { kind: 'app', label: 'Claude',        iconId: 'claude',     action: { kind: 'APP_LAUNCH', appId: 'claude' } },
  { kind: 'app', label: 'GitHub',        iconId: 'github',     action: { kind: 'APP_LAUNCH', appId: 'github' } },
  { kind: 'app', label: 'YouTube',       iconId: 'youtube',    action: { kind: 'APP_LAUNCH', appId: 'youtube' } },
  { kind: 'app', label: 'Twitch',        iconId: 'twitch',     action: { kind: 'APP_LAUNCH', appId: 'twitch' } },
  { kind: 'app', label: 'PowerShell',    iconId: 'powershell', action: { kind: 'APP_LAUNCH', appId: 'powershell' } },
  { kind: 'app', label: 'Terminal',      iconId: 'terminal',   action: { kind: 'APP_LAUNCH', appId: 'terminal' } },
  { kind: 'app', label: 'File Explorer', iconId: 'explorer',   action: { kind: 'APP_LAUNCH', appId: 'explorer' } },
  { kind: 'app', label: 'Steam',         iconId: 'steam',      action: { kind: 'APP_LAUNCH', appId: 'steam' } },
  { kind: 'app', label: 'Postman',       iconId: 'postman',    action: { kind: 'APP_LAUNCH', appId: 'postman' } },
  { kind: 'app', label: 'Linear',        iconId: 'linear',     action: { kind: 'APP_LAUNCH', appId: 'linear' } },
  { kind: 'app', label: 'Vercel',        iconId: 'vercel',     action: { kind: 'APP_LAUNCH', appId: 'vercel' } },
];

interface Props {
  currentTiles: TileConfig[];
  onAdd: (tile: Omit<TileConfig, 'id'>) => void;
  onRemove: (tileId: string) => void;
  onDismiss: () => void;
}

export function AddTileScreen({ currentTiles, onAdd, onRemove, onDismiss }: Props) {
  const [search, setSearch] = useState('');
  const [customUrl, setCustomUrl] = useState('');

  // Build a set of appIds that are already in the grid so we can show selected state.
  const selectedByAppId = useMemo<Map<string, string>>(() => {
    const map = new Map<string, string>(); // appId → tileId
    for (const tile of currentTiles) {
      if (tile.action.kind === 'APP_LAUNCH') {
        map.set(tile.action.appId, tile.id);
      }
    }
    return map;
  }, [currentTiles]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return CURATED_APPS;
    return CURATED_APPS.filter((app) => app.label.toLowerCase().includes(q));
  }, [search]);

  const handleToggleApp = (item: Omit<TileConfig, 'id'>) => {
    if (item.action.kind !== 'APP_LAUNCH') return;
    const existingId = selectedByAppId.get(item.action.appId);
    if (existingId) {
      onRemove(existingId);
    } else {
      onAdd(item);
    }
    // Stay on screen so users can toggle multiple apps
  };

  const handleAddUrl = () => {
    const url = customUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) return;
    const hostname = (() => {
      try { return new URL(url).hostname; } catch { return url; }
    })();
    onAdd({ kind: 'url', label: hostname, iconId: 'globe', action: { kind: 'URL_OPEN', url } });
    setCustomUrl('');
  };

  const selectedCount = selectedByAppId.size;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Add Tiles</Text>
            <Text style={styles.subtitle}>
              {selectedCount === 0 ? 'Tap to add' : `${selectedCount} selected — tap to toggle`}
            </Text>
          </View>
          <TouchableOpacity onPress={onDismiss} style={styles.doneBtn}>
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search apps…"
            placeholderTextColor="#6B6B8A"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            returnKeyType="search"
          />
        </View>

        {/* Curated grid */}
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.iconId}
          numColumns={3}
          renderItem={({ item }) => {
            const appId = item.action.kind === 'APP_LAUNCH' ? item.action.appId : '';
            const selected = selectedByAppId.has(appId);
            return (
              <AppTile
                tile={{ ...item, id: item.iconId }}
                isSelected={selected}
                onTap={() => handleToggleApp(item)}
              />
            );
          }}
          contentContainerStyle={styles.grid}
          ListEmptyComponent={
            <Text style={styles.noResults}>No apps match "{search}"</Text>
          }
        />

        {/* Custom URL row */}
        <View style={styles.urlRow}>
          <TextInput
            style={styles.urlInput}
            placeholder="https://custom-url.com"
            placeholderTextColor="#6B6B8A"
            value={customUrl}
            onChangeText={setCustomUrl}
            autoCapitalize="none"
            keyboardType="url"
            returnKeyType="done"
            onSubmitEditing={handleAddUrl}
          />
          <TouchableOpacity
            style={[styles.addUrlBtn, !customUrl.startsWith('http') && styles.addUrlBtnDisabled]}
            onPress={handleAddUrl}
            disabled={!customUrl.startsWith('http')}
          >
            <Text style={styles.addUrlText}>Add</Text>
          </TouchableOpacity>
        </View>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F14' },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', flex: 1 },
  subtitle: { color: '#6B6B8A', fontSize: 12, marginTop: 2 },
  doneBtn: {
    backgroundColor: '#5B4FE8',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  doneBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  searchRow: { paddingHorizontal: 12, paddingBottom: 8 },
  searchInput: {
    backgroundColor: '#1A1A2E',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  grid: { paddingHorizontal: 8, paddingBottom: 8 },
  noResults: { color: '#6B6B8A', textAlign: 'center', marginTop: 32, fontSize: 14 },
  urlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    gap: 8,
  },
  urlInput: {
    flex: 1,
    backgroundColor: '#1A1A2E',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 13,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  addUrlBtn: {
    backgroundColor: '#5B4FE8',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  addUrlBtnDisabled: { opacity: 0.4 },
  addUrlText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
});
