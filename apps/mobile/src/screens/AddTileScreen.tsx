import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppTile } from '../components/AppTile';
import { TileConfig, Pack } from '../types/schema';
import { WebSocketService } from '../services/websocket.service';
import { GamesTab } from './GamesTab';
import { AiToolsTab } from './AiToolsTab';
import { WorkflowBuilderScreen } from './WorkflowBuilderScreen';

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

type Tab = 'apps' | 'shortcut' | 'ai' | 'games' | 'workflow';

type Modifier = 'ctrl' | 'alt' | 'win' | 'shift';

interface Props {
  currentTiles: TileConfig[];
  onAdd: (tile: Omit<TileConfig, 'id'>) => void;
  onRemove: (tileId: string) => void;
  onDismiss: () => void;
  ws: WebSocketService;
  packRegistry: Pack[] | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

type WorkflowBuilderState =
  | { mode: 'new' }
  | { mode: 'edit'; tile: TileConfig };

export function AddTileScreen({ currentTiles, onAdd, onRemove, onDismiss, ws, packRegistry }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('apps');
  const [builderState, setBuilderState] = useState<WorkflowBuilderState | null>(null);

  const workflowTiles = useMemo(
    () => currentTiles.filter((t) => t.kind === 'workflow'),
    [currentTiles],
  );

  const handleBuilderSave = (tile: Omit<TileConfig, 'id'>) => {
    if (!ws.isConnected()) {
      Alert.alert('Not Connected', 'Connect to the desktop agent before saving a workflow.', [{ text: 'OK' }]);
      return;
    }
    if (builderState?.mode === 'edit') {
      onRemove(builderState.tile.id);
    }
    onAdd(tile);
    setBuilderState(null);
  };

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
        {(['apps', 'shortcut', 'ai', 'games', 'workflow'] as Tab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'apps' ? 'Apps'
                : tab === 'shortcut' ? 'Shortcut'
                : tab === 'ai' ? 'AI Tools'
                : tab === 'games' ? 'Games'
                : 'Workflow'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {activeTab === 'apps' && (
          <AppsTab currentTiles={currentTiles} onAdd={onAdd} onRemove={onRemove} />
        )}
        {activeTab === 'shortcut' && (
          <ShortcutTab currentTiles={currentTiles} onAdd={onAdd} onRemove={onRemove} />
        )}
        {activeTab === 'ai' && (
          <AiToolsTab
            packs={packRegistry ?? []}
            currentTiles={currentTiles}
            onAdd={onAdd}
            onRemove={onRemove}
          />
        )}
        {activeTab === 'games' && (
          <GamesTab
            ws={ws}
            currentTiles={currentTiles}
            onAdd={onAdd}
            onRemove={onRemove}
          />
        )}
        {activeTab === 'workflow' && (
          <WorkflowTab
            workflowTiles={workflowTiles}
            onCreateWorkflow={() => setBuilderState({ mode: 'new' })}
            onEditWorkflow={(tile) => setBuilderState({ mode: 'edit', tile })}
            onRemoveWorkflow={onRemove}
          />
        )}
      </KeyboardAvoidingView>

      <Modal
        visible={builderState !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setBuilderState(null)}
      >
        <WorkflowBuilderScreen
          initialLabel={builderState?.mode === 'edit' ? builderState.tile.label : undefined}
          initialSteps={
            builderState?.mode === 'edit' && builderState.tile.action.kind === 'WORKFLOW'
              ? builderState.tile.action.steps
              : undefined
          }
          onSave={handleBuilderSave}
          onDismiss={() => setBuilderState(null)}
        />
      </Modal>
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

const MODIFIER_KEYS = new Set<Modifier>(MODIFIERS.map((mod) => mod.key));

function shortcutKey(keys: string[]): string {
  const normalized = keys.map((item) => item.toLowerCase().trim()).filter(Boolean);
  const mods = MODIFIERS
    .map((mod) => mod.key)
    .filter((mod) => normalized.includes(mod));
  const regularKeys = normalized
    .filter((item) => !MODIFIER_KEYS.has(item as Modifier))
    .sort();

  return [...mods, ...regularKeys].join('+');
}

function parseShortcutKeys(keys: string[]): { mods: Set<Modifier>; key: string } {
  const mods = new Set<Modifier>();
  let mainKey = '';
  for (const k of keys) {
    if (MODIFIER_KEYS.has(k as Modifier)) mods.add(k as Modifier);
    else mainKey = k;
  }
  return { mods, key: mainKey };
}

function ShortcutTab({ currentTiles, onAdd, onRemove }: Pick<Props, 'currentTiles' | 'onAdd' | 'onRemove'>) {
  const [editingTile, setEditingTile] = useState<TileConfig | null>(null);
  const [mods, setMods] = useState<Set<Modifier>>(new Set());
  const [key, setKey]   = useState('');
  const [label, setLabel] = useState('');

  const shortcutTiles = useMemo(
    () => currentTiles.filter((t) => t.kind === 'shortcut'),
    [currentTiles],
  );

  // Duplicate check excludes the tile currently being edited
  const selectedByShortcut = useMemo<Map<string, string>>(() => {
    const map = new Map<string, string>();
    for (const tile of currentTiles) {
      if (tile.action.kind === 'KEYSTROKE' && tile.id !== editingTile?.id) {
        map.set(shortcutKey(tile.action.keys), tile.id);
      }
    }
    return map;
  }, [currentTiles, editingTile?.id]);

  const startEdit = (tile: TileConfig) => {
    if (tile.action.kind !== 'KEYSTROKE') return;
    const parsed = parseShortcutKeys(tile.action.keys);
    setEditingTile(tile);
    setMods(parsed.mods);
    setKey(parsed.key);
    setLabel(tile.label);
  };

  const cancelEdit = () => {
    setEditingTile(null);
    setMods(new Set());
    setKey('');
    setLabel('');
  };

  const toggleMod = (mod: Modifier) => {
    setMods((prev) => {
      const next = new Set(prev);
      if (next.has(mod)) next.delete(mod); else next.add(mod);
      return next;
    });
  };

  const confirmRemove = (tile: TileConfig) => {
    Alert.alert('Remove Shortcut', `Remove "${tile.label}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => {
        if (editingTile?.id === tile.id) cancelEdit();
        onRemove(tile.id);
      }},
    ]);
  };

  const selectedMods = MODIFIERS.map((item) => item.key).filter((mod) => mods.has(mod));
  const keyList = [...selectedMods, key.toLowerCase().trim()].filter(Boolean);
  const autoLabel = keyList.map((k) => k.charAt(0).toUpperCase() + k.slice(1)).join('+');

  const canAdd = key.trim().length > 0;
  const existingId = canAdd ? selectedByShortcut.get(shortcutKey(keyList)) : undefined;

  const handleSubmit = () => {
    if (!canAdd) return;
    const tileLabel = label.trim() || autoLabel;

    if (editingTile) {
      onRemove(editingTile.id);
      onAdd({ kind: 'shortcut', label: tileLabel, iconId: 'keyboard', color: '#0F2A1A', action: { kind: 'KEYSTROKE', keys: keyList } });
      cancelEdit();
      return;
    }

    if (existingId) {
      onRemove(existingId);
      return;
    }

    onAdd({ kind: 'shortcut', label: tileLabel, iconId: 'keyboard', color: '#0F2A1A', action: { kind: 'KEYSTROKE', keys: keyList } });
    setMods(new Set());
    setKey('');
    setLabel('');
  };

  const submitLabel = editingTile ? 'Update Shortcut' : existingId ? 'Remove Shortcut' : 'Add Shortcut';
  const submitStyle = editingTile ? styles.addBtn : existingId ? styles.removeBtn : styles.addBtn;

  return (
    <ScrollView contentContainerStyle={styles.shortcutContainer} keyboardShouldPersistTaps="handled">

      {/* Existing shortcuts list */}
      {shortcutTiles.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>Your Shortcuts</Text>
          {shortcutTiles.map((tile) => {
            const keysDisplay = tile.action.kind === 'KEYSTROKE'
              ? tile.action.keys.map(k => k.charAt(0).toUpperCase() + k.slice(1)).join('+')
              : '';
            const isEditing = editingTile?.id === tile.id;
            return (
              <View key={tile.id} style={[shortcutListStyles.row, isEditing && shortcutListStyles.rowEditing]}>
                <View style={shortcutListStyles.info}>
                  <Text style={shortcutListStyles.tileLabel} numberOfLines={1}>{tile.label}</Text>
                  <Text style={shortcutListStyles.keys}>{keysDisplay}</Text>
                </View>
                <TouchableOpacity
                  style={[shortcutListStyles.editBtn, isEditing && shortcutListStyles.editBtnActive]}
                  onPress={() => isEditing ? cancelEdit() : startEdit(tile)}
                  activeOpacity={0.75}
                >
                  <Text style={[shortcutListStyles.editBtnText, isEditing && shortcutListStyles.editBtnTextActive]}>
                    {isEditing ? 'Cancel' : 'Edit'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={shortcutListStyles.deleteBtn}
                  onPress={() => confirmRemove(tile)}
                  activeOpacity={0.75}
                >
                  <Text style={shortcutListStyles.deleteBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </>
      )}

      {/* Form */}
      <Text style={[styles.sectionLabel, shortcutTiles.length > 0 && { marginTop: 20 }]}>
        {editingTile ? `Editing "${editingTile.label}"` : 'New Shortcut'}
      </Text>

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
        style={[submitStyle, !canAdd && styles.addBtnDisabled, { marginTop: 16, alignSelf: 'stretch' }]}
        onPress={handleSubmit}
        disabled={!canAdd}
      >
        <Text style={styles.addBtnText}>{submitLabel}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const shortcutListStyles = StyleSheet.create({
  row: {
    flexDirection:  'row',
    alignItems:     'center',
    backgroundColor: '#1A1A2E',
    borderRadius:   12,
    padding:        12,
    gap:            8,
    borderWidth:    1,
    borderColor:    'rgba(255,255,255,0.07)',
    marginBottom:   6,
  },
  rowEditing: { borderColor: '#5B4FE8' },
  info:       { flex: 1 },
  tileLabel:  { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  keys:       { color: '#5B4FE8', fontSize: 11, fontWeight: '700', marginTop: 2 },
  editBtn: {
    backgroundColor: '#2A2A4A',
    borderRadius:    8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  editBtnActive:    { backgroundColor: '#3A2A5A' },
  editBtnText:      { color: '#AAAACC', fontSize: 13, fontWeight: '600' },
  editBtnTextActive: { color: '#FFFFFF' },
  deleteBtn: {
    backgroundColor: '#2A1A1A',
    borderRadius:    8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  deleteBtnText: { color: '#FF6B6B', fontSize: 13, fontWeight: '700' },
});

// ─── Workflow Tab ─────────────────────────────────────────────────────────────

interface WorkflowTabProps {
  workflowTiles: TileConfig[];
  onCreateWorkflow: () => void;
  onEditWorkflow: (tile: TileConfig) => void;
  onRemoveWorkflow: (tileId: string) => void;
}

function WorkflowTab({ workflowTiles, onCreateWorkflow, onEditWorkflow, onRemoveWorkflow }: WorkflowTabProps) {
  const confirmRemove = (tile: TileConfig) => {
    Alert.alert('Remove Workflow', `Remove "${tile.label}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => onRemoveWorkflow(tile.id) },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={workflowTabStyles.container}>
      {workflowTiles.length === 0 && (
        <Text style={workflowTabStyles.description}>
          Run multiple actions in sequence — launch apps, open URLs, send keystrokes, and more.
        </Text>
      )}

      {workflowTiles.map((tile) => (
        <View key={tile.id} style={workflowTabStyles.row}>
          <View style={workflowTabStyles.rowIcon}>
            <Text style={workflowTabStyles.rowIconText}>⛓</Text>
          </View>
          <View style={workflowTabStyles.rowInfo}>
            <Text style={workflowTabStyles.rowLabel} numberOfLines={1}>{tile.label}</Text>
            {tile.action.kind === 'WORKFLOW' && (
              <Text style={workflowTabStyles.rowMeta}>
                {tile.action.steps.length} step{tile.action.steps.length !== 1 ? 's' : ''}
              </Text>
            )}
          </View>
          <TouchableOpacity style={workflowTabStyles.editBtn} onPress={() => onEditWorkflow(tile)} activeOpacity={0.75}>
            <Text style={workflowTabStyles.editBtnText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={workflowTabStyles.deleteBtn} onPress={() => confirmRemove(tile)} activeOpacity={0.75}>
            <Text style={workflowTabStyles.deleteBtnText}>✕</Text>
          </TouchableOpacity>
        </View>
      ))}

      <TouchableOpacity style={workflowTabStyles.createBtn} onPress={onCreateWorkflow}>
        <Text style={workflowTabStyles.createBtnText}>+ New Workflow</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const workflowTabStyles = StyleSheet.create({
  container: { padding: 16, gap: 10 },
  description: {
    color: '#6B6B8A',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A2E',
    borderRadius: 12,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#1E1A3A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconText: { fontSize: 18 },
  rowInfo: { flex: 1 },
  rowLabel: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  rowMeta: { color: '#6B6B8A', fontSize: 12, marginTop: 2 },
  editBtn: {
    backgroundColor: '#2A2A4A',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  editBtnText: { color: '#AAAACC', fontSize: 13, fontWeight: '600' },
  deleteBtn: {
    backgroundColor: '#2A1A1A',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  deleteBtnText: { color: '#FF6B6B', fontSize: 13, fontWeight: '700' },
  createBtn: {
    backgroundColor: '#5B4FE8',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  createBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
});

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
  removeBtn: { backgroundColor: '#5A2731' },
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
