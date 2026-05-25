import React, { useEffect, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  View,
  Text,
  TextInput,
  Image,
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
import { AppSearchResult, ButtonAction, IntegrationPlugin, TileConfig, Pack } from '../types/schema';
import { WebSocketService } from '../services/websocket.service';
import { AiToolsTab } from './AiToolsTab';
import { WorkflowBuilderScreen } from './WorkflowBuilderScreen';
import {
  getPluginToolViews,
  getRequiredParams,
} from '../utils/pluginTools';
import type { IntegrationTileAction, PluginToolView } from '../utils/pluginTools';

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

type Tab = 'apps' | 'shortcut' | 'ai' | 'workflow' | 'plugins';

type Modifier = 'ctrl' | 'alt' | 'win' | 'shift';

interface Props {
  currentTiles: TileConfig[];
  onAdd: (tile: Omit<TileConfig, 'id'>) => void;
  onRemove: (tileId: string) => void;
  onDismiss: () => void;
  ws: WebSocketService;
  packRegistry: Pack[] | null;
  initialTab?: Tab;
}

// ─── Component ────────────────────────────────────────────────────────────────

type WorkflowBuilderState =
  | { mode: 'new' }
  | { mode: 'edit'; tile: TileConfig };

export function AddTileScreen({ currentTiles, onAdd, onRemove, onDismiss, ws, packRegistry, initialTab = 'apps' }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [builderState, setBuilderState] = useState<WorkflowBuilderState | null>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

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
        {(['apps', 'shortcut', 'ai', 'workflow', 'plugins'] as Tab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'apps' ? 'Apps'
                : tab === 'shortcut' ? 'Shortcut'
                : tab === 'ai' ? 'AI Tools'
                : tab === 'workflow' ? 'Workflow'
                : 'Plugins'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {activeTab === 'apps' && (
          <AppsTab ws={ws} currentTiles={currentTiles} onAdd={onAdd} onRemove={onRemove} />
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
        {activeTab === 'workflow' && (
          <WorkflowTab
            workflowTiles={workflowTiles}
            onCreateWorkflow={() => setBuilderState({ mode: 'new' })}
            onEditWorkflow={(tile) => setBuilderState({ mode: 'edit', tile })}
            onRemoveWorkflow={onRemove}
          />
        )}
        {activeTab === 'plugins' && (
          <PluginsTabContent
            wsService={ws}
            currentTiles={currentTiles}
            onAddTile={onAdd}
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
          ws={ws}
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

const SOURCE_LABEL: Record<AppSearchResult['source'], string> = {
  startmenu: 'App',
  windows: 'Windows',
  filesystem: 'Folder',
  steam: 'Steam',
  epic: 'Epic',
};

const SOURCE_COLOR: Record<AppSearchResult['source'], string> = {
  startmenu: '#4A4A6A',
  windows: '#0078D4',
  filesystem: '#2D5A27',
  steam: '#1B2838',
  epic: '#0060CC',
};

function actionForPath(exePath: string): ButtonAction {
  const trimmed = exePath.trim();
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? { kind: 'URL_OPEN', url: trimmed }
    : { kind: 'EXEC', exePath: trimmed };
}

function actionKey(action: ButtonAction): string {
  if (action.kind === 'EXEC') return `EXEC:${action.exePath.toLowerCase()}`;
  if (action.kind === 'URL_OPEN') return `URL_OPEN:${action.url.toLowerCase()}`;
  return JSON.stringify(action);
}

function AppsTab({ ws, currentTiles, onAdd, onRemove }: Pick<Props, 'ws' | 'currentTiles' | 'onAdd' | 'onRemove'>) {
  const [search, setSearch] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [pathMode, setPathMode] = useState(false);
  const [desktopResults, setDesktopResults] = useState<AppSearchResult[]>([]);
  const [searchingDesktop, setSearchingDesktop] = useState(false);
  const [searchedDesktop, setSearchedDesktop] = useState(false);
  const [validatingPath, setValidatingPath] = useState(false);
  const [pathValidation, setPathValidation] = useState<{
    valid: boolean;
    label?: string;
    iconBase64?: string;
    error?: string;
  } | null>(null);

  const selectedByAppId = useMemo<Map<string, string>>(() => {
    const map = new Map<string, string>();
    for (const tile of currentTiles) {
      if (tile.action.kind === 'APP_LAUNCH') map.set(tile.action.appId, tile.id);
    }
    return map;
  }, [currentTiles]);

  const selectedByAction = useMemo<Map<string, string>>(() => {
    const map = new Map<string, string>();
    for (const tile of currentTiles) {
      if (tile.action.kind === 'EXEC' || tile.action.kind === 'URL_OPEN') {
        map.set(actionKey(tile.action), tile.id);
      }
    }
    return map;
  }, [currentTiles]);

  useEffect(() => {
    const unsubscribeSearch = ws.onSearchAppsResult((msg) => {
      setDesktopResults(msg.results);
      setSearchingDesktop(false);
      setSearchedDesktop(true);
    });
    const unsubscribeValidate = ws.onValidatePathResult((msg) => {
      setPathValidation(msg);
      setValidatingPath(false);
    });

    return () => {
      unsubscribeSearch();
      unsubscribeValidate();
    };
  }, [ws]);

  useEffect(() => {
    setDesktopResults([]);
    setSearchedDesktop(false);
    setSearchingDesktop(false);
    setPathValidation(null);
    setValidatingPath(false);
  }, [pathMode, search]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (pathMode) return [];
    return q ? CURATED_APPS.filter((a) => a.label.toLowerCase().includes(q)) : CURATED_APPS;
  }, [pathMode, search]);

  const handleToggleCurated = (item: Omit<TileConfig, 'id'>) => {
    if (item.action.kind !== 'APP_LAUNCH') return;
    const existingId = selectedByAppId.get(item.action.appId);
    if (existingId) onRemove(existingId);
    else onAdd(item);
  };

  const tileForDesktopResult = (item: AppSearchResult): Omit<TileConfig, 'id'> => ({
    kind: 'custom',
    label: item.name,
    iconId: 'custom',
    iconBase64: item.iconBase64,
    action: actionForPath(item.exePath),
  });

  const handleToggleDesktopResult = (item: AppSearchResult) => {
    const tile = tileForDesktopResult(item);
    const existingId = selectedByAction.get(actionKey(tile.action));
    if (existingId) onRemove(existingId);
    else onAdd(tile);
  };

  const handleTogglePath = () => {
    const nextPath = search.trim();
    if (!pathValidation?.valid || !pathValidation.label || !nextPath) return;
    const tile: Omit<TileConfig, 'id'> = {
      kind: 'custom',
      label: pathValidation.label,
      iconId: 'custom',
      iconBase64: pathValidation.iconBase64,
      action: actionForPath(nextPath),
    };
    const existingId = selectedByAction.get(actionKey(tile.action));
    if (existingId) {
      onRemove(existingId);
    } else {
      onAdd(tile);
      setSearch('');
      setPathValidation(null);
    }
  };

  const handleSearchSubmit = () => {
    const nextQuery = search.trim();
    if (!nextQuery) return;
    if (pathMode) {
      setValidatingPath(true);
      setPathValidation(null);
      ws.validatePath(nextQuery);
      return;
    }
    if (nextQuery.length < 2) return;
    setSearchingDesktop(true);
    setSearchedDesktop(false);
    ws.searchApps(nextQuery);
  };

  const togglePathMode = () => {
    setPathMode((current) => !current);
    setSearch('');
    setDesktopResults([]);
    setSearchedDesktop(false);
    setSearchingDesktop(false);
    setPathValidation(null);
    setValidatingPath(false);
  };

  const handleAddUrl = () => {
    const url = customUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) return;
    const hostname = (() => { try { return new URL(url).hostname; } catch { return url; } })();
    onAdd({ kind: 'url', label: hostname, iconId: 'globe', action: { kind: 'URL_OPEN', url } });
    setCustomUrl('');
  };

  return (
    <View style={styles.appsContainer}>
      <View style={styles.searchRow}>
        <View style={[styles.appSearchShell, pathMode && styles.appSearchShellPath]}>
          <TextInput
            style={styles.appSearchInput}
            placeholder={pathMode ? 'C:\\Games\\MyGame\\game.exe' : 'Search apps and games...'}
            placeholderTextColor="#6B6B8A"
            value={search}
            onChangeText={(value) => {
              setSearch(value);
              if (pathMode) setPathValidation(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType={pathMode ? 'done' : 'search'}
            onSubmitEditing={handleSearchSubmit}
          />
          {(searchingDesktop || validatingPath) && (
            <ActivityIndicator size="small" color="#B9B5FF" style={styles.searchSpinner} />
          )}
          <TouchableOpacity
            style={[styles.searchModeButton, pathMode && styles.searchModeButtonActive]}
            onPress={togglePathMode}
            activeOpacity={0.78}
          >
            <Text style={[styles.searchModeButtonText, pathMode && styles.searchModeButtonTextActive]}>
              {pathMode ? 'APP' : 'EXE'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.appsScrollContent} keyboardShouldPersistTaps="handled">
        {pathMode ? (
          <View style={styles.appSection}>
            <Text style={styles.appSectionTitle}>Executable path</Text>
            {pathValidation ? (
              <View style={[styles.resultRow, pathValidation.valid && styles.resultRowSelected]}>
                <View style={styles.resultIcon}>
                  {pathValidation.iconBase64 ? (
                    <Image
                      source={{ uri: `data:image/png;base64,${pathValidation.iconBase64}` }}
                      style={styles.iconImage}
                    />
                  ) : (
                    <Text style={styles.iconLetter}>
                      {(pathValidation.label ?? 'E').charAt(0).toUpperCase()}
                    </Text>
                  )}
                </View>
                <View style={styles.resultText}>
                  <Text
                    style={[
                      styles.resultName,
                      !pathValidation.valid && styles.validationError,
                    ]}
                    numberOfLines={1}
                  >
                    {pathValidation.valid ? pathValidation.label : pathValidation.error}
                  </Text>
                  <Text style={styles.resultPath} numberOfLines={1}>{search.trim()}</Text>
                </View>
                {pathValidation.valid && (() => {
                  const action = actionForPath(search.trim());
                  const isSelected = selectedByAction.has(actionKey(action));
                  return (
                    <TouchableOpacity
                      style={[styles.resultButton, isSelected && styles.removeButton]}
                      onPress={handleTogglePath}
                      activeOpacity={0.78}
                    >
                      <Text style={styles.resultButtonText}>{isSelected ? 'Remove' : 'Add'}</Text>
                    </TouchableOpacity>
                  );
                })()}
              </View>
            ) : !validatingPath && search.trim() ? (
              <Text style={styles.noResults}>No executable checked yet.</Text>
            ) : null}
          </View>
        ) : (
          <>
            {search.trim().length > 0 && (
              <View style={styles.appSection}>
                <View style={styles.appSectionHeader}>
                  <Text style={styles.appSectionTitle}>Discovered on this PC</Text>
                  {searchingDesktop ? <ActivityIndicator size="small" color="#6B6B8A" /> : null}
                </View>
                {desktopResults.length > 0 ? (
                  desktopResults.map((item, index) => {
                    const tile = tileForDesktopResult(item);
                    const isSelected = selectedByAction.has(actionKey(tile.action));
                    return (
                      <View
                        key={`${item.source}-${item.exePath}-${index}`}
                        style={[styles.resultRow, isSelected && styles.resultRowSelected]}
                      >
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
                            <Text style={styles.sourceBadgeText}>{SOURCE_LABEL[item.source]}</Text>
                          </View>
                        </View>
                        <TouchableOpacity
                          style={[styles.resultButton, isSelected && styles.removeButton]}
                          onPress={() => handleToggleDesktopResult(item)}
                          activeOpacity={0.78}
                        >
                          <Text style={styles.resultButtonText}>{isSelected ? 'Remove' : 'Add'}</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })
                ) : !searchingDesktop && searchedDesktop ? (
                  <Text style={styles.noResults}>No desktop matches found.</Text>
                ) : null}
              </View>
            )}

            <View style={styles.appSection}>
              <Text style={styles.appSectionTitle}>Presaved on Mobile</Text>
              {filtered.length > 0 ? (
                <View style={styles.appTileGrid}>
                  {filtered.map((item) => {
                    const appId = item.action.kind === 'APP_LAUNCH' ? item.action.appId : '';
                    return (
                      <View key={item.iconId} style={styles.appTileCell}>
                        <AppTile
                          tile={{ ...item, id: item.iconId }}
                          isSelected={selectedByAppId.has(appId)}
                          onTap={() => handleToggleCurated(item)}
                        />
                      </View>
                    );
                  })}
                </View>
              ) : (
                <Text style={styles.noResults}>No presaved apps match "{search}".</Text>
              )}
            </View>
          </>
        )}
        {!pathMode && (
      <View style={styles.urlRow}>
        <TextInput
          style={styles.inlineInput}
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
          activeOpacity={0.78}
        >
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>
        )}
      </ScrollView>
    </View>
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

function PluginsTabContent({
  wsService,
  currentTiles,
  onAddTile,
}: {
  wsService: WebSocketService;
  currentTiles: TileConfig[];
  onAddTile: (tile: Omit<TileConfig, 'id'>) => void;
}) {
  const [plugins, setPlugins] = useState<IntegrationPlugin[]>([]);
  const [installedIds, setInstalledIds] = useState<string[]>([]);
  const [expandedPlugin, setExpandedPlugin] = useState<string | null>(null);
  const [selectedConfig, setSelectedConfig] = useState<{ plugin: IntegrationPlugin; tool: PluginToolView } | null>(null);
  const [params, setParams] = useState<Record<string, string>>({});

  useEffect(() => {
    wsService.requestPluginCatalog();
    const unsubCatalog = wsService.onPluginCatalog(setPlugins);
    const unsubInstalled = wsService.onInstalledPlugins(setInstalledIds);
    return () => {
      unsubCatalog();
      unsubInstalled();
    };
  }, [wsService]);

  const installedPlugins = useMemo(
    () => plugins.filter((plugin) => installedIds.includes(plugin.id)),
    [installedIds, plugins],
  );

  const existingIntegrationActions = useMemo(
    () => currentTiles
      .map((tile) => tile.action)
      .filter((action): action is IntegrationTileAction => action.kind === 'INTEGRATION_ACTION'),
    [currentTiles],
  );

  const isToolOnDeck = (plugin: IntegrationPlugin, tool: PluginToolView): boolean => {
    return existingIntegrationActions.some((action) => {
      if (action.pluginId !== plugin.id) return false;
      return action.toolId === tool.id || tool.selectedActionIds.includes(action.actionId);
    });
  };

  const submitTile = (
    plugin: IntegrationPlugin,
    tool: PluginToolView,
    resolvedParams: Record<string, unknown>,
  ) => {
    onAddTile({
      kind: 'integration',
      label: tool.tileLabel,
      iconId: plugin.icon,
      color: tool.color ?? plugin.color,
      action: {
        kind: 'INTEGRATION_ACTION',
        pluginId: plugin.id,
        toolId: tool.id,
        actionId: tool.deckActionId,
        params: resolvedParams,
      },
    });
    setSelectedConfig(null);
    setParams({});
  };

  const handleAddTool = (plugin: IntegrationPlugin, tool: PluginToolView) => {
    const requiredParams = getRequiredParams(tool);
    if (requiredParams.length === 0 && isToolOnDeck(plugin, tool)) {
      return;
    }

    if (requiredParams.length === 0) {
      submitTile(plugin, tool, {});
      return;
    }

    const initial: Record<string, string> = {};
    requiredParams.forEach((key) => {
      initial[key] = '';
    });
    setSelectedConfig({ plugin, tool });
    setParams(initial);
  };

  const handleSubmitConfigured = () => {
    if (!selectedConfig) return;
    submitTile(selectedConfig.plugin, selectedConfig.tool, params);
  };

  if (installedPlugins.length === 0) {
    return (
      <View style={pluginTabStyles.emptyState}>
        <Text style={pluginTabStyles.emptyTitle}>No installed plugins.</Text>
        <Text style={pluginTabStyles.emptyBody}>Open the Plugin Library from the deck header to install integrations.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={pluginTabStyles.container} keyboardShouldPersistTaps="handled">
      {installedPlugins.map((plugin) => {
        const toolViews = getPluginToolViews(plugin);
        return (
          <View key={plugin.id} style={pluginTabStyles.pluginGroup}>
            <TouchableOpacity
              style={pluginTabStyles.pluginHeader}
              onPress={() => setExpandedPlugin(expandedPlugin === plugin.id ? null : plugin.id)}
              activeOpacity={0.78}
            >
              <View style={[pluginTabStyles.pluginIcon, { backgroundColor: plugin.color ?? '#2A2A4A' }]}>
                <Text style={pluginTabStyles.pluginIconText}>{plugin.icon.slice(0, 2).toUpperCase()}</Text>
              </View>
              <View style={pluginTabStyles.pluginInfo}>
                <Text style={pluginTabStyles.pluginName}>{plugin.name}</Text>
                <Text style={pluginTabStyles.pluginMeta}>{toolViews.length} tools</Text>
              </View>
              <Text style={pluginTabStyles.expandText}>{expandedPlugin === plugin.id ? '-' : '+'}</Text>
            </TouchableOpacity>

            {expandedPlugin === plugin.id && toolViews.map((tool) => {
              const requiredParams = getRequiredParams(tool);
              const selected = isToolOnDeck(plugin, tool);
              const disabled = selected && requiredParams.length === 0;
              return (
                <TouchableOpacity
                  key={tool.id}
                  style={[
                    pluginTabStyles.toolRow,
                    selected && pluginTabStyles.toolRowSelected,
                    disabled && pluginTabStyles.toolRowDisabled,
                  ]}
                  onPress={() => handleAddTool(plugin, tool)}
                  activeOpacity={0.78}
                  disabled={disabled}
                >
                  <View style={pluginTabStyles.toolTitleRow}>
                    <Text style={pluginTabStyles.toolName}>{tool.displayName}</Text>
                    {selected ? (
                      <Text style={pluginTabStyles.selectedToolBadge}>
                        {disabled ? 'Added' : 'Configured'}
                      </Text>
                    ) : null}
                  </View>
                  {tool.description ? <Text style={pluginTabStyles.toolDesc}>{tool.description}</Text> : null}
                  <View style={pluginTabStyles.toolBadgeRow}>
                    {tool.supportsState ? <Text style={pluginTabStyles.toolBadge}>State badge</Text> : null}
                    {tool.deckActionId !== tool.actionId ? <Text style={pluginTabStyles.toolBadge}>Toggle</Text> : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        );
      })}

      {selectedConfig ? (
        <View style={pluginTabStyles.paramSheet}>
          <Text style={pluginTabStyles.paramTitle}>Configure {selectedConfig.tool.displayName}</Text>
          {Object.keys(params).map((key) => (
            <View key={key}>
              <Text style={pluginTabStyles.paramLabel}>{key}</Text>
              <TextInput
                style={pluginTabStyles.paramInput}
                value={params[key]}
                onChangeText={(value) => setParams((prev) => ({ ...prev, [key]: value }))}
                placeholder={key}
                placeholderTextColor="#6B6B8A"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          ))}
          <TouchableOpacity style={pluginTabStyles.confirmBtn} onPress={handleSubmitConfigured} activeOpacity={0.8}>
            <Text style={pluginTabStyles.confirmBtnText}>Add to Deck</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setSelectedConfig(null)} activeOpacity={0.78}>
            <Text style={pluginTabStyles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </ScrollView>
  );
}

const pluginTabStyles = StyleSheet.create({
  container: { padding: 12, paddingBottom: 28, gap: 8 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 8 },
  emptyTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', textAlign: 'center' },
  emptyBody: { color: '#6B6B8A', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  pluginGroup: {
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    backgroundColor: '#11111A',
  },
  pluginHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A2E',
    padding: 12,
    gap: 10,
  },
  pluginIcon: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  pluginIconText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  pluginInfo: { flex: 1 },
  pluginName: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  pluginMeta: { color: '#6B6B8A', fontSize: 11, marginTop: 2, fontWeight: '700' },
  expandText: { color: '#AAAACC', fontSize: 18, fontWeight: '800', width: 24, textAlign: 'center' },
  toolRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    backgroundColor: '#11111A',
  },
  toolRowSelected: {
    backgroundColor: '#191936',
    borderWidth: 1,
    borderColor: '#5B4FE8',
  },
  toolRowDisabled: { opacity: 0.82 },
  toolTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toolName: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  toolDesc: { color: '#8A8AAA', fontSize: 12, lineHeight: 17, marginTop: 3 },
  selectedToolBadge: {
    marginLeft: 'auto',
    backgroundColor: '#263A2F',
    color: '#7BFFA8',
    fontSize: 10,
    fontWeight: '900',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  toolBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  toolBadge: {
    alignSelf: 'flex-start',
    marginTop: 7,
    backgroundColor: '#252548',
    color: '#B9B5FF',
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  paramSheet: {
    marginTop: 8,
    padding: 14,
    backgroundColor: '#1A1A2E',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  paramTitle: { color: '#FFFFFF', fontWeight: '800', fontSize: 15, marginBottom: 10 },
  paramLabel: { color: '#AAAACC', fontSize: 12, fontWeight: '700', marginBottom: 5, marginTop: 8 },
  paramInput: {
    backgroundColor: '#0F0F14',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#FFFFFF',
  },
  confirmBtn: { backgroundColor: '#5B4FE8', borderRadius: 10, padding: 13, alignItems: 'center', marginTop: 16 },
  confirmBtnText: { color: '#FFFFFF', fontWeight: '800' },
  cancelText: { color: '#6B6B8A', textAlign: 'center', marginTop: 12, padding: 8, fontWeight: '700' },
});

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
  tabBar: { flexDirection: 'row', paddingHorizontal: 10, gap: 5, marginBottom: 8 },
  tab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderRadius: 8,
    backgroundColor: '#1A1A2E',
    alignItems: 'center',
  },
  tabActive: { backgroundColor: '#5B4FE8' },
  tabText: { color: '#6B6B8A', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  tabTextActive: { color: '#FFFFFF' },

  // Shared inputs
  searchRow: { paddingHorizontal: 12, paddingBottom: 8 },
  appsContainer: { flex: 1 },
  appSearchShell: {
    minHeight: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#1A1A2E',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    paddingRight: 5,
  },
  appSearchShellPath: {
    borderColor: '#5B4FE8',
    backgroundColor: '#17172A',
  },
  appSearchInput: {
    flex: 1,
    minHeight: 44,
    color: '#FFFFFF',
    fontSize: 14,
    paddingVertical: 9,
    paddingRight: 8,
  },
  searchSpinner: { marginHorizontal: 6 },
  searchModeButton: {
    height: 34,
    minWidth: 44,
    borderRadius: 8,
    backgroundColor: '#252548',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 9,
  },
  searchModeButtonActive: { backgroundColor: '#5B4FE8' },
  searchModeButtonText: { color: '#B9B5FF', fontSize: 11, fontWeight: '900' },
  searchModeButtonTextActive: { color: '#FFFFFF' },
  appsScrollContent: { paddingHorizontal: 12, paddingBottom: 28 },
  appSection: {
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  appSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  appSectionTitle: {
    color: '#AAAACC',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  appTileGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 },
  appTileCell: { width: '33.333%', aspectRatio: 1 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 58,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: '#11111A',
    marginBottom: 7,
  },
  resultRowSelected: { borderColor: '#5B4FE8', backgroundColor: '#191936' },
  resultIcon: {
    width: 38,
    height: 38,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2D5A27',
    overflow: 'hidden',
  },
  iconImage: { width: 31, height: 31, resizeMode: 'contain' },
  iconLetter: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  resultText: { flex: 1, minWidth: 0, gap: 4 },
  resultName: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  resultPath: { color: '#6B6B8A', fontSize: 11 },
  sourceBadge: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sourceBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  resultButton: {
    backgroundColor: '#5B4FE8',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  removeButton: { backgroundColor: '#5A2731' },
  resultButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },
  validationError: { color: '#FF6B6B' },
  inlineInput: {
    flex: 1,
    backgroundColor: '#1A1A2E',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 14,
  },
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
  noResults: { color: '#6B6B8A', textAlign: 'center', marginTop: 32, fontSize: 14 },
  urlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 0,
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
