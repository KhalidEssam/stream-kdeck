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
  ScrollView,
} from 'react-native';
import { AppTile } from '../components/AppTile';
import { TileConfig } from '../types/schema';

// ─── Curated Apps ─────────────────────────────────────────────────────────────

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

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'apps' | 'shortcut';

type Modifier = 'ctrl' | 'alt' | 'win' | 'shift';

interface Props {
  currentTiles: TileConfig[];
  onAdd: (tile: Omit<TileConfig, 'id'>) => void;
  onRemove: (tileId: string) => void;
  onDismiss: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AddTileScreen({ currentTiles, onAdd, onRemove, onDismiss }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('apps');

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Add Tiles</Text>
        <TouchableOpacity onPress={onDismiss} style={styles.doneBtn}>
          <Text style={styles.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {(['apps', 'shortcut'] as Tab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'apps' ? 'Apps' : 'Shortcut'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {activeTab === 'apps' && (
          <AppsTab currentTiles={currentTiles} onAdd={onAdd} onRemove={onRemove} />
        )}
        {activeTab === 'shortcut' && (
          <ShortcutTab onAdd={onAdd} />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Apps Tab ─────────────────────────────────────────────────────────────────

function AppsTab({ currentTiles, onAdd, onRemove }: Pick<Props, 'currentTiles' | 'onAdd' | 'onRemove'>) {
  const [search, setSearch] = useState('');
  const [customUrl, setCustomUrl] = useState('');

  const selectedByAppId = useMemo<Map<string, string>>(() => {
    const map = new Map<string, string>();
    for (const tile of currentTiles) {
      if (tile.action.kind === 'APP_LAUNCH') map.set(tile.action.appId, tile.id);
    }
    return map;
  }, [currentTiles]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return q ? CURATED_APPS.filter((a) => a.label.toLowerCase().includes(q)) : CURATED_APPS;
  }, [search]);

  const handleToggle = (item: Omit<TileConfig, 'id'>) => {
    if (item.action.kind !== 'APP_LAUNCH') return;
    const existingId = selectedByAppId.get(item.action.appId);
    if (existingId) onRemove(existingId);
    else onAdd(item);
  };

  const handleAddUrl = () => {
    const url = customUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) return;
    const hostname = (() => { try { return new URL(url).hostname; } catch { return url; } })();
    onAdd({ kind: 'url', label: hostname, iconId: 'globe', action: { kind: 'URL_OPEN', url } });
    setCustomUrl('');
  };

  return (
    <>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          placeholder="Search apps…"
          placeholderTextColor="#6B6B8A"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          returnKeyType="search"
        />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.iconId}
        numColumns={3}
        renderItem={({ item }) => {
          const appId = item.action.kind === 'APP_LAUNCH' ? item.action.appId : '';
          return (
            <AppTile
              tile={{ ...item, id: item.iconId }}
              isSelected={selectedByAppId.has(appId)}
              onTap={() => handleToggle(item)}
            />
          );
        }}
        contentContainerStyle={styles.grid}
        ListEmptyComponent={<Text style={styles.noResults}>No apps match "{search}"</Text>}
      />
      <View style={styles.urlRow}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
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
          style={[styles.addBtn, !customUrl.startsWith('http') && styles.addBtnDisabled]}
          onPress={handleAddUrl}
          disabled={!customUrl.startsWith('http')}
        >
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

// ─── Shortcut Tab ─────────────────────────────────────────────────────────────

const MODIFIERS: { key: Modifier; label: string }[] = [
  { key: 'ctrl',  label: 'Ctrl'  },
  { key: 'alt',   label: 'Alt'   },
  { key: 'win',   label: 'Win ⊞' },
  { key: 'shift', label: 'Shift' },
];

function ShortcutTab({ onAdd }: Pick<Props, 'onAdd'>) {
  const [mods, setMods] = useState<Set<Modifier>>(new Set());
  const [key, setKey]   = useState('');
  const [label, setLabel] = useState('');

  const toggleMod = (mod: Modifier) => {
    setMods((prev) => {
      const next = new Set(prev);
      if (next.has(mod)) next.delete(mod); else next.add(mod);
      return next;
    });
  };

  const keyList = [...Array.from(mods), key.toLowerCase().trim()].filter(Boolean);
  const autoLabel = keyList.map((k) => k.charAt(0).toUpperCase() + k.slice(1)).join('+');

  const canAdd = key.trim().length > 0;

  const handleAdd = () => {
    if (!canAdd) return;
    const tileLabel = label.trim() || autoLabel;
    onAdd({
      kind: 'shortcut',
      label: tileLabel,
      iconId: 'keyboard',
      color: '#0F2A1A',
      action: { kind: 'KEYSTROKE', keys: keyList },
    });
    setMods(new Set());
    setKey('');
    setLabel('');
  };

  return (
    <ScrollView contentContainerStyle={styles.shortcutContainer} keyboardShouldPersistTaps="handled">
      <Text style={styles.sectionLabel}>Modifiers</Text>
      <View style={styles.modRow}>
        {MODIFIERS.map(({ key: mod, label: modLabel }) => (
          <TouchableOpacity
            key={mod}
            style={[styles.modChip, mods.has(mod) && styles.modChipActive]}
            onPress={() => toggleMod(mod)}
          >
            <Text style={[styles.modChipText, mods.has(mod) && styles.modChipTextActive]}>
              {modLabel}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionLabel}>Key</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. c, d, F5, Tab, Enter"
        placeholderTextColor="#6B6B8A"
        value={key}
        onChangeText={(v) => setKey(v.slice(-8))}
        autoCapitalize="none"
        autoCorrect={false}
      />

      {autoLabel.length > 0 && (
        <View style={styles.previewRow}>
          <Text style={styles.previewLabel}>Preview: </Text>
          <Text style={styles.previewValue}>{autoLabel}</Text>
        </View>
      )}

      <Text style={styles.sectionLabel}>Tile label <Text style={styles.optional}>(optional)</Text></Text>
      <TextInput
        style={styles.input}
        placeholder={autoLabel || 'e.g. Mute Mic'}
        placeholderTextColor="#6B6B8A"
        value={label}
        onChangeText={setLabel}
      />

      <TouchableOpacity
        style={[styles.addBtn, !canAdd && styles.addBtnDisabled, { marginTop: 16, alignSelf: 'stretch' }]}
        onPress={handleAdd}
        disabled={!canAdd}
      >
        <Text style={styles.addBtnText}>Add Shortcut</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F14' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', flex: 1 },
  doneBtn: { backgroundColor: '#5B4FE8', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 7 },
  doneBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },

  // Tab bar
  tabBar: { flexDirection: 'row', paddingHorizontal: 12, gap: 8, marginBottom: 8 },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#1A1A2E',
    alignItems: 'center',
  },
  tabActive: { backgroundColor: '#5B4FE8' },
  tabText: { color: '#6B6B8A', fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#FFFFFF' },

  // Shared inputs
  searchRow: { paddingHorizontal: 12, paddingBottom: 8 },
  input: {
    backgroundColor: '#1A1A2E',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 12,
    marginBottom: 8,
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
  addBtn: { backgroundColor: '#5B4FE8', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 },
  addBtnDisabled: { opacity: 0.4 },
  addBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14, textAlign: 'center' },

  // Shortcut tab
  shortcutContainer: { padding: 16, gap: 4 },
  sectionLabel: { color: '#AAAACC', fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 12 },
  optional: { color: '#6B6B8A', fontWeight: '400' },
  modRow: { flexDirection: 'row', gap: 8 },
  modChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#1A1A2E',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  modChipActive: { backgroundColor: '#3A3A6A', borderColor: '#5B4FE8' },
  modChipText: { color: '#6B6B8A', fontWeight: '600', fontSize: 13 },
  modChipTextActive: { color: '#FFFFFF' },
  previewRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  previewLabel: { color: '#6B6B8A', fontSize: 13 },
  previewValue: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});
