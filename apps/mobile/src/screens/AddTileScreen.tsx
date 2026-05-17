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
  onAdd: (tile: Omit<TileConfig, 'id'>) => void;
  onDismiss: () => void;
}

export function AddTileScreen({ onAdd, onDismiss }: Props) {
  const [search, setSearch] = useState('');
  const [customUrl, setCustomUrl] = useState('');

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return CURATED_APPS;
    return CURATED_APPS.filter((app) => app.label.toLowerCase().includes(q));
  }, [search]);

  const handleSelectApp = (tile: Omit<TileConfig, 'id'>) => {
    onAdd(tile);
    onDismiss();
  };

  const handleAddUrl = () => {
    const url = customUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) return;
    const hostname = (() => {
      try { return new URL(url).hostname; } catch { return url; }
    })();
    onAdd({ kind: 'url', label: hostname, iconId: 'globe', action: { kind: 'URL_OPEN', url } });
    onDismiss();
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Add Tile</Text>
          <TouchableOpacity onPress={onDismiss} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕</Text>
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
          renderItem={({ item }) => (
            <AppTile
              tile={{ ...item, id: item.iconId }}
              onTap={() => handleSelectApp(item)}
            />
          )}
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
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', flex: 1 },
  closeBtn: { padding: 8 },
  closeText: { color: '#6B6B8A', fontSize: 18 },
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
