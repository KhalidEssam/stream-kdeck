import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  SafeAreaView,
  Modal,
  Switch,
  ScrollView,
  StatusBar,
  Alert,
  Image,
} from 'react-native';
import {
  AppSearchResult,
  IntegrationPlugin,
  IntegrationTool,
  TileConfig,
  WorkflowStep,
  WorkflowStepAction,
} from '../types/schema';
import { WebSocketService } from '../services/websocket.service';
import { getRequiredParams } from '../utils/pluginTools';

// ── Helpers ───────────────────────────────────────────────────────────────────

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function makeStepLabel(action: WorkflowStepAction): string {
  switch (action.kind) {
    case 'APP_LAUNCH': return action.appId;
    case 'EXEC': {
      const parts = action.exePath.replace(/\\/g, '/').split('/');
      return parts[parts.length - 1] ?? action.exePath;
    }
    case 'URL_OPEN': {
      try { return new URL(action.url).hostname; } catch { return action.url; }
    }
    case 'KEYSTROKE':
      return action.keys.map(k => k.charAt(0).toUpperCase() + k.slice(1)).join('+');
    case 'CLIPBOARD_WRITE': {
      const t = action.text;
      return t.length > 24 ? `${t.slice(0, 24)}…` : t;
    }
    case 'SHELL_RUN': {
      const t = action.command;
      return t.length > 24 ? `${t.slice(0, 24)}…` : t;
    }
    case 'INTEGRATION_ACTION':
      return action.actionId;
  }
}

const DELAY_OPTIONS = [0, 500, 1000, 1500, 2000, 3000, 5000, 10000];

// ── Props ─────────────────────────────────────────────────────────────────────

export interface WorkflowBuilderScreenProps {
  initialSteps?: WorkflowStep[];
  initialLabel?: string;
  ws?: WebSocketService | null;
  onSave: (tile: Omit<TileConfig, 'id'>) => void;
  onDismiss: () => void;
}

// ── WorkflowBuilderScreen ─────────────────────────────────────────────────────

export function WorkflowBuilderScreen({
  initialSteps = [],
  initialLabel = '',
  ws,
  onSave,
  onDismiss,
}: WorkflowBuilderScreenProps) {
  const [steps, setSteps] = useState<WorkflowStep[]>(initialSteps);
  const [name, setName] = useState(initialLabel || 'My Workflow');
  const [stopOnError, setStopOnError] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [delayEditId, setDelayEditId] = useState<string | null>(null);

  const handleSave = () => {
    const trimmedName = name.trim() || 'My Workflow';
    onSave({
      kind: 'workflow',
      label: trimmedName,
      iconId: 'workflow',
      action: { kind: 'WORKFLOW', steps, stopOnError },
    });
  };

  const handleAddStep = (action: WorkflowStepAction, labelOverride?: string) => {
    const actionKey = JSON.stringify(action);
    if (action.kind !== 'KEYSTROKE' && steps.some(s => JSON.stringify(s.action) === actionKey)) {
      Alert.alert('Already in workflow', `"${makeStepLabel(action)} (${actionKey})" is already a step in this workflow.`);

      return;
    }
    const step: WorkflowStep = {
      id: uuid(),
      action,
      delayBefore: 0,
      label: labelOverride ?? makeStepLabel(action),
    };
    setSteps(prev => [...prev, step]);
    setShowPicker(false);
  };

  const handleDeleteStep = (id: string) => {
    setSteps(prev => prev.filter(s => s.id !== id));
  };

  const handleSetDelay = (id: string, ms: number) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, delayBefore: ms } : s));
    setDelayEditId(null);
  };

  const moveStep = useCallback((id: string, dir: 'up' | 'down') => {
    setSteps(prev => {
      const idx = prev.findIndex(s => s.id === id);
      const swap = dir === 'up' ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  }, []);

  const renderStep = useCallback(({ item, index }: { item: WorkflowStep; index: number }) => (
    <View style={styles.stepRow}>
      <View style={styles.reorderBtns}>
        <TouchableOpacity onPress={() => moveStep(item.id, 'up')} disabled={index === 0} style={styles.reorderBtn}>
          <Text style={[styles.reorderIcon, index === 0 && styles.reorderIconDisabled]}>▲</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => moveStep(item.id, 'down')} disabled={index === steps.length - 1} style={styles.reorderBtn}>
          <Text style={[styles.reorderIcon, index === steps.length - 1 && styles.reorderIconDisabled]}>▼</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.stepLabel} numberOfLines={1}>{item.label}</Text>
      <TouchableOpacity style={styles.delayBadge} onPress={() => setDelayEditId(item.id)}>
        <Text style={styles.delayText}>
          {item.delayBefore > 0 ? `${item.delayBefore / 1000}s` : '0s'}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => handleDeleteStep(item.id)} style={styles.deleteBtn}>
        <Text style={styles.deleteIcon}>✕</Text>
      </TouchableOpacity>
    </View>
  ), [steps.length, moveStep]);

  const delayStep = steps.find(s => s.id === delayEditId);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onDismiss} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.nameInput}
          value={name}
          onChangeText={setName}
          placeholder="Workflow name"
          placeholderTextColor="#6B6B8A"
          selectTextOnFocus
        />
        <TouchableOpacity
          onPress={handleSave}
          style={[styles.saveBtn, steps.length === 0 && styles.saveBtnDisabled]}
          disabled={steps.length === 0}
        >
          <Text style={styles.saveText}>Save</Text>
        </TouchableOpacity>
      </View>

      {/* Stop-on-error toggle */}
      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>Stop if a step fails</Text>
        <Switch
          value={stopOnError}
          onValueChange={setStopOnError}
          trackColor={{ false: '#3A3A5C', true: '#5B4FE8' }}
          thumbColor="#FFFFFF"
        />
      </View>

      {/* Step list */}
      <FlatList
        data={steps}
        keyExtractor={item => item.id}
        renderItem={renderStep}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={styles.emptyHint}>No steps yet. Tap "+ Add Step" below.</Text>
        }
      />

      {/* Add step */}
      <TouchableOpacity style={styles.addStepBtn} onPress={() => setShowPicker(true)}>
        <Text style={styles.addStepText}>+ Add Step</Text>
      </TouchableOpacity>

      {/* Step picker modal */}
      <Modal
        visible={showPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowPicker(false)}
      >
        <StepPickerSheet
          ws={ws}
          onSelect={handleAddStep}
          onDismiss={() => setShowPicker(false)}
        />
      </Modal>

      {/* Delay picker modal */}
      <Modal
        visible={delayEditId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDelayEditId(null)}
      >
        <View style={styles.delayBackdrop}>
          <View style={styles.delaySheet}>
            <Text style={styles.delayTitle}>
              Delay before &quot;{delayStep?.label}&quot;
            </Text>
            {DELAY_OPTIONS.map(ms => (
              <TouchableOpacity
                key={ms}
                style={[
                  styles.delayOption,
                  delayStep?.delayBefore === ms && styles.delayOptionActive,
                ]}
                onPress={() => delayEditId && handleSetDelay(delayEditId, ms)}
              >
                <Text style={[
                  styles.delayOptionText,
                  delayStep?.delayBefore === ms && styles.delayOptionTextActive,
                ]}>
                  {ms === 0 ? 'No delay' : `${ms / 1000}s`}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.delayCancel}
              onPress={() => setDelayEditId(null)}
            >
              <Text style={styles.delayCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── StepPickerSheet ───────────────────────────────────────────────────────────

type PickerTab = 'apps' | 'plugins' | 'url' | 'keys' | 'clipboard';

const PICKER_TABS: PickerTab[] = ['apps', 'plugins', 'url', 'keys', 'clipboard'];

const PICKER_APPS: { label: string; appId: string }[] = [
  { label: 'VS Code', appId: 'vscode' },
  { label: 'Chrome', appId: 'chrome' },
  { label: 'Spotify', appId: 'spotify' },
  { label: 'Discord', appId: 'discord' },
  { label: 'Slack', appId: 'slack' },
  { label: 'OBS Studio', appId: 'obs' },
  { label: 'Notion', appId: 'notion' },
  { label: 'WhatsApp', appId: 'whatsapp' },
  { label: 'Steam', appId: 'steam' },
  { label: 'File Explorer', appId: 'explorer' },
  { label: 'Terminal', appId: 'terminal' },
  { label: 'PowerShell', appId: 'powershell' },
  { label: 'Figma', appId: 'figma' },
  { label: 'Claude', appId: 'claude' },
  { label: 'GitHub', appId: 'github' },
  { label: 'Postman', appId: 'postman' },
];

const PICKER_MODS = ['ctrl', 'alt', 'shift', 'win'] as const;
type PickerMod = (typeof PICKER_MODS)[number];

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

function actionForPathInput(exePath: string): WorkflowStepAction {
  const trimmed = exePath.trim();
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? { kind: 'URL_OPEN', url: trimmed }
    : { kind: 'EXEC', exePath: trimmed };
}

function labelForPathInput(value: string, fallback?: string): string {
  if (fallback?.trim()) return fallback.trim();
  const normalized = value.replace(/\\/g, '/');
  const parts = normalized.split('/');
  return parts[parts.length - 1] || value;
}

function tabLabel(tab: PickerTab): string {
  switch (tab) {
    case 'apps': return 'Apps';
    case 'plugins': return 'Plugins';
    case 'url': return 'URL';
    case 'keys': return 'Keys';
    case 'clipboard': return 'Clip';
  }
}

function getWorkflowTools(plugin: IntegrationPlugin): IntegrationTool[] {
  return [...plugin.tools]
    .filter((tool) => tool.supportsWorkflows && tool.status !== 'disabled' && tool.status !== 'deprecated')
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

function StepPickerSheet({
  ws,
  onSelect,
  onDismiss,
}: {
  ws?: WebSocketService | null;
  onSelect: (action: WorkflowStepAction, labelOverride?: string) => void;
  onDismiss: () => void;
}) {
  const [tab, setTab] = useState<PickerTab>('apps');
  const [appSearch, setAppSearch] = useState('');
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
  const [plugins, setPlugins] = useState<IntegrationPlugin[]>([]);
  const [installedIds, setInstalledIds] = useState<string[]>([]);
  const [expandedPlugin, setExpandedPlugin] = useState<string | null>(null);
  const [selectedPluginTool, setSelectedPluginTool] = useState<{ plugin: IntegrationPlugin; tool: IntegrationTool } | null>(null);
  const [pluginParams, setPluginParams] = useState<Record<string, string>>({});
  const [url, setUrl] = useState('');
  const [clipText, setClipText] = useState('');
  const [key, setKey] = useState('');
  const [mods, setMods] = useState<Set<PickerMod>>(new Set());

  const canUseAgent = Boolean(ws?.isConnected());

  useEffect(() => {
    if (!ws) return;
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
    if (!ws) return;
    ws.requestPluginCatalog();
    const unsubscribeCatalog = ws.onPluginCatalog(setPlugins);
    const unsubscribeInstalled = ws.onInstalledPlugins(setInstalledIds);

    return () => {
      unsubscribeCatalog();
      unsubscribeInstalled();
    };
  }, [ws]);

  useEffect(() => {
    setDesktopResults([]);
    setSearchedDesktop(false);
    setSearchingDesktop(false);
    setPathValidation(null);
    setValidatingPath(false);
  }, [appSearch, pathMode]);

  const filteredPickerApps = useMemo(() => {
    const query = appSearch.toLowerCase().trim();
    if (pathMode) return [];
    return query ? PICKER_APPS.filter((app) => app.label.toLowerCase().includes(query)) : PICKER_APPS;
  }, [appSearch, pathMode]);

  const installedPlugins = useMemo(
    () => plugins.filter((plugin) => installedIds.includes(plugin.id)),
    [installedIds, plugins],
  );

  const toggleMod = (mod: PickerMod) => {
    setMods(prev => {
      const next = new Set(prev);
      if (next.has(mod)) next.delete(mod); else next.add(mod);
      return next;
    });
  };

  const keyList = [
    ...PICKER_MODS.filter(m => mods.has(m)),
    key.toLowerCase().trim(),
  ].filter(Boolean);

  const handleAppSearchSubmit = () => {
    const query = appSearch.trim();
    if (!query || !canUseAgent) return;
    if (pathMode) {
      setValidatingPath(true);
      setPathValidation(null);
      ws?.validatePath(query);
      return;
    }
    if (query.length < 2) return;
    setSearchingDesktop(true);
    setSearchedDesktop(false);
    ws?.searchApps(query);
  };

  const togglePathMode = () => {
    setPathMode((current) => !current);
    setAppSearch('');
    setDesktopResults([]);
    setSearchedDesktop(false);
    setSearchingDesktop(false);
    setPathValidation(null);
    setValidatingPath(false);
  };

  const handleAddDesktopResult = (item: AppSearchResult) => {
    const action = actionForPathInput(item.exePath);
    onSelect(action, item.name);
  };

  const handleAddPath = () => {
    const value = appSearch.trim();
    if (!pathValidation?.valid || !value) return;
    onSelect(actionForPathInput(value), labelForPathInput(value, pathValidation.label));
  };

  const submitPluginStep = (
    plugin: IntegrationPlugin,
    tool: IntegrationTool,
    resolvedParams: Record<string, unknown>,
  ) => {
    onSelect({
      kind: 'INTEGRATION_ACTION',
      pluginId: plugin.id,
      toolId: tool.id,
      actionId: tool.actionId,
      params: resolvedParams,
    }, `${plugin.name}: ${tool.name}`);
  };

  const handlePluginToolPress = (plugin: IntegrationPlugin, tool: IntegrationTool) => {
    const requiredParams = getRequiredParams(tool);
    if (requiredParams.length === 0) {
      submitPluginStep(plugin, tool, {});
      return;
    }

    const initial: Record<string, string> = {};
    requiredParams.forEach((paramKey) => {
      initial[paramKey] = '';
    });
    setSelectedPluginTool({ plugin, tool });
    setPluginParams(initial);
  };

  const handleSubmitPluginParams = () => {
    if (!selectedPluginTool) return;
    submitPluginStep(selectedPluginTool.plugin, selectedPluginTool.tool, pluginParams);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
      <View style={styles.header}>
        <Text style={pickerStyles.pickerTitle}>Add Step</Text>
        <TouchableOpacity onPress={onDismiss} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>

      <View style={pickerStyles.tabBar}>
        {PICKER_TABS.map(t => (
          <TouchableOpacity
            key={t}
            style={[pickerStyles.tab, tab === t && pickerStyles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[pickerStyles.tabText, tab === t && pickerStyles.tabTextActive]}>
              {tabLabel(t)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={pickerStyles.content} keyboardShouldPersistTaps="handled">
        {tab === 'apps' && (
          <>
            <View style={[pickerStyles.appSearchShell, pathMode && pickerStyles.appSearchShellPath]}>
              <TextInput
                style={pickerStyles.appSearchInput}
                placeholder={pathMode ? 'C:\\Apps\\Custom\\app.exe' : 'Search apps on this PC...'}
                placeholderTextColor="#6B6B8A"
                value={appSearch}
                onChangeText={(value) => {
                  setAppSearch(value);
                  if (pathMode) setPathValidation(null);
                }}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType={pathMode ? 'done' : 'search'}
                onSubmitEditing={handleAppSearchSubmit}
              />
              {(searchingDesktop || validatingPath) ? (
                <ActivityIndicator size="small" color="#B9B5FF" style={pickerStyles.searchSpinner} />
              ) : null}
              <TouchableOpacity
                style={[pickerStyles.searchModeButton, pathMode && pickerStyles.searchModeButtonActive]}
                onPress={togglePathMode}
                activeOpacity={0.78}
              >
                <Text style={[pickerStyles.searchModeButtonText, pathMode && pickerStyles.searchModeButtonTextActive]}>
                  {pathMode ? 'APP' : 'EXE'}
                </Text>
              </TouchableOpacity>
            </View>

            {!canUseAgent ? (
              <Text style={pickerStyles.mutedHint}>Connect to the desktop agent to discover apps or validate executable paths.</Text>
            ) : null}

            {pathMode ? (
              <View style={pickerStyles.section}>
                <Text style={pickerStyles.sectionTitle}>Executable path</Text>
                {pathValidation ? (
                  <View style={[pickerStyles.resultRow, pathValidation.valid && pickerStyles.resultRowSelected]}>
                    <View style={pickerStyles.resultIcon}>
                      {pathValidation.iconBase64 ? (
                        <Image
                          source={{ uri: `data:image/png;base64,${pathValidation.iconBase64}` }}
                          style={pickerStyles.iconImage}
                        />
                      ) : (
                        <Text style={pickerStyles.iconLetter}>
                          {(pathValidation.label ?? 'E').charAt(0).toUpperCase()}
                        </Text>
                      )}
                    </View>
                    <View style={pickerStyles.resultText}>
                      <Text
                        style={[
                          pickerStyles.resultName,
                          !pathValidation.valid && pickerStyles.validationError,
                        ]}
                        numberOfLines={1}
                      >
                        {pathValidation.valid ? pathValidation.label : pathValidation.error}
                      </Text>
                      <Text style={pickerStyles.resultPath} numberOfLines={1}>{appSearch.trim()}</Text>
                    </View>
                    {pathValidation.valid ? (
                      <TouchableOpacity style={pickerStyles.resultButton} onPress={handleAddPath} activeOpacity={0.78}>
                        <Text style={pickerStyles.resultButtonText}>Add</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : !validatingPath && appSearch.trim() ? (
                  <Text style={pickerStyles.noResults}>No executable checked yet.</Text>
                ) : null}
              </View>
            ) : (
              <>
                {appSearch.trim().length > 0 ? (
                  <View style={pickerStyles.section}>
                    <View style={pickerStyles.sectionHeader}>
                      <Text style={pickerStyles.sectionTitle}>Discovered on this PC</Text>
                      {searchingDesktop ? <ActivityIndicator size="small" color="#6B6B8A" /> : null}
                    </View>
                    {desktopResults.length > 0 ? (
                      desktopResults.map((item, index) => (
                        <View key={`${item.source}-${item.exePath}-${index}`} style={pickerStyles.resultRow}>
                          <View style={[pickerStyles.resultIcon, { backgroundColor: SOURCE_COLOR[item.source] }]}>
                            {item.iconBase64 ? (
                              <Image
                                source={{ uri: `data:image/png;base64,${item.iconBase64}` }}
                                style={pickerStyles.iconImage}
                              />
                            ) : (
                              <Text style={pickerStyles.iconLetter}>{item.name.charAt(0).toUpperCase()}</Text>
                            )}
                          </View>
                          <View style={pickerStyles.resultText}>
                            <Text style={pickerStyles.resultName} numberOfLines={1}>{item.name}</Text>
                            <View style={[pickerStyles.sourceBadge, { backgroundColor: SOURCE_COLOR[item.source] }]}>
                              <Text style={pickerStyles.sourceBadgeText}>{SOURCE_LABEL[item.source]}</Text>
                            </View>
                          </View>
                          <TouchableOpacity
                            style={pickerStyles.resultButton}
                            onPress={() => handleAddDesktopResult(item)}
                            activeOpacity={0.78}
                          >
                            <Text style={pickerStyles.resultButtonText}>Add</Text>
                          </TouchableOpacity>
                        </View>
                      ))
                    ) : !searchingDesktop && searchedDesktop ? (
                      <Text style={pickerStyles.noResults}>No desktop matches found.</Text>
                    ) : null}
                  </View>
                ) : null}

                <View style={pickerStyles.section}>
                  <Text style={pickerStyles.sectionTitle}>Presaved on Mobile</Text>
                  {filteredPickerApps.length > 0 ? (
                    <View style={pickerStyles.appGrid}>
                      {filteredPickerApps.map(app => (
                        <TouchableOpacity
                          key={app.appId}
                          style={pickerStyles.appChip}
                          onPress={() => onSelect({ kind: 'APP_LAUNCH', appId: app.appId }, app.label)}
                        >
                          <Text style={pickerStyles.appChipText}>{app.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : (
                    <Text style={pickerStyles.noResults}>No presaved apps match "{appSearch}".</Text>
                  )}
                </View>
              </>
            )}
          </>
        )}

        {tab === 'plugins' && (
          <>
            {installedPlugins.length === 0 ? (
              <View style={pickerStyles.emptyState}>
                <Text style={pickerStyles.emptyTitle}>No installed plugins.</Text>
                <Text style={pickerStyles.emptyBody}>Install plugins from the deck header, then add their tools as workflow steps here.</Text>
              </View>
            ) : installedPlugins.map((plugin) => {
              const workflowTools = getWorkflowTools(plugin);
              return (
                <View key={plugin.id} style={pickerStyles.pluginGroup}>
                  <TouchableOpacity
                    style={pickerStyles.pluginHeader}
                    onPress={() => setExpandedPlugin(expandedPlugin === plugin.id ? null : plugin.id)}
                    activeOpacity={0.78}
                  >
                    <View style={[pickerStyles.pluginIcon, { backgroundColor: plugin.color ?? '#2A2A4A' }]}>
                      <Text style={pickerStyles.pluginIconText}>{plugin.icon.slice(0, 2).toUpperCase()}</Text>
                    </View>
                    <View style={pickerStyles.pluginInfo}>
                      <Text style={pickerStyles.pluginName}>{plugin.name}</Text>
                      <Text style={pickerStyles.pluginMeta}>{workflowTools.length} workflow tools</Text>
                    </View>
                    <Text style={pickerStyles.expandText}>{expandedPlugin === plugin.id ? '-' : '+'}</Text>
                  </TouchableOpacity>

                  {expandedPlugin === plugin.id && workflowTools.map((tool) => {
                    const requiredParams = getRequiredParams(tool);
                    return (
                      <TouchableOpacity
                        key={tool.id}
                        style={pickerStyles.toolRow}
                        onPress={() => handlePluginToolPress(plugin, tool)}
                        activeOpacity={0.78}
                      >
                        <View style={pickerStyles.toolTitleRow}>
                          <Text style={pickerStyles.toolName}>{tool.name}</Text>
                          {requiredParams.length > 0 ? (
                            <Text style={pickerStyles.toolBadge}>Needs input</Text>
                          ) : null}
                        </View>
                        {tool.description ? <Text style={pickerStyles.toolDesc}>{tool.description}</Text> : null}
                        <Text style={pickerStyles.toolActionId}>{tool.actionId}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              );
            })}

            {selectedPluginTool ? (
              <View style={pickerStyles.paramSheet}>
                <Text style={pickerStyles.paramTitle}>Configure {selectedPluginTool.tool.name}</Text>
                {Object.keys(pluginParams).map((paramKey) => (
                  <View key={paramKey}>
                    <Text style={pickerStyles.paramLabel}>{paramKey}</Text>
                    <TextInput
                      style={pickerStyles.paramInput}
                      value={pluginParams[paramKey]}
                      onChangeText={(value) => setPluginParams((prev) => ({ ...prev, [paramKey]: value }))}
                      placeholder={paramKey}
                      placeholderTextColor="#6B6B8A"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                ))}
                <TouchableOpacity style={pickerStyles.addBtn} onPress={handleSubmitPluginParams} activeOpacity={0.8}>
                  <Text style={pickerStyles.addBtnText}>Add Plugin Step</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setSelectedPluginTool(null)} activeOpacity={0.78}>
                  <Text style={pickerStyles.cancelLink}>Cancel</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </>
        )}

        {tab === 'url' && (
          <>
            <Text style={pickerStyles.label}>URL</Text>
            <TextInput
              style={pickerStyles.input}
              placeholder="https://example.com"
              placeholderTextColor="#6B6B8A"
              value={url}
              onChangeText={setUrl}
              autoCapitalize="none"
              keyboardType="url"
            />
            <TouchableOpacity
              style={[pickerStyles.addBtn, !url.startsWith('http') && pickerStyles.addBtnDisabled]}
              onPress={() => {
                if (url.startsWith('http')) onSelect({ kind: 'URL_OPEN', url: url.trim() });
              }}
              disabled={!url.startsWith('http')}
            >
              <Text style={pickerStyles.addBtnText}>Add URL Step</Text>
            </TouchableOpacity>
          </>
        )}

        {tab === 'keys' && (
          <>
            <Text style={pickerStyles.label}>Modifiers</Text>
            <View style={pickerStyles.modRow}>
              {PICKER_MODS.map(mod => (
                <TouchableOpacity
                  key={mod}
                  style={[pickerStyles.modChip, mods.has(mod) && pickerStyles.modChipActive]}
                  onPress={() => toggleMod(mod)}
                >
                  <Text style={[pickerStyles.modChipText, mods.has(mod) && pickerStyles.modChipTextActive]}>
                    {mod.charAt(0).toUpperCase() + mod.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={pickerStyles.label}>Key</Text>
            <TextInput
              style={pickerStyles.input}
              placeholder="e.g. d, F5, Tab"
              placeholderTextColor="#6B6B8A"
              value={key}
              onChangeText={v => setKey(v.slice(-8))}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[pickerStyles.addBtn, keyList.length === 0 && pickerStyles.addBtnDisabled]}
              onPress={() => { if (keyList.length > 0) onSelect({ kind: 'KEYSTROKE', keys: keyList }); }}
              disabled={keyList.length === 0}
            >
              <Text style={pickerStyles.addBtnText}>Add Keystroke Step</Text>
            </TouchableOpacity>
          </>
        )}

        {tab === 'clipboard' && (
          <>
            <Text style={pickerStyles.label}>Text to copy to clipboard</Text>
            <TextInput
              style={[pickerStyles.input, { height: 100, textAlignVertical: 'top', paddingTop: 10 }]}
              multiline
              placeholder="Text to write to clipboard…"
              placeholderTextColor="#6B6B8A"
              value={clipText}
              onChangeText={setClipText}
            />
            <TouchableOpacity
              style={[pickerStyles.addBtn, !clipText.trim() && pickerStyles.addBtnDisabled]}
              onPress={() => { if (clipText.trim()) onSelect({ kind: 'CLIPBOARD_WRITE', text: clipText.trim() }); }}
              disabled={!clipText.trim()}
            >
              <Text style={pickerStyles.addBtnText}>Add Clipboard Step</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F14' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  cancelBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#1A1A2E',
  },
  cancelText: { color: '#AAAACC', fontWeight: '600', fontSize: 13 },
  nameInput: {
    flex: 1,
    backgroundColor: '#1A1A2E',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  saveBtn: {
    backgroundColor: '#5B4FE8',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  toggleLabel: { color: '#AAAACC', fontSize: 14, fontWeight: '500', flex: 1 },

  listContent: { padding: 12, paddingBottom: 88, flexGrow: 1 },
  emptyHint: {
    color: '#6B6B8A',
    textAlign: 'center',
    marginTop: 48,
    fontSize: 14,
  },

  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A2E',
    borderRadius: 10,
    marginBottom: 8,
    paddingVertical: 12,
    paddingRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: 8,
  },
  reorderBtns: { flexDirection: 'column', alignItems: 'center', paddingHorizontal: 8 },
  reorderBtn: { paddingVertical: 3 },
  reorderIcon: { color: '#AAAACC', fontSize: 11, fontWeight: '700' },
  reorderIconDisabled: { color: '#3A3A5C' },
  stepLabel: { flex: 1, color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  delayBadge: {
    backgroundColor: '#2A2A3A',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 36,
    alignItems: 'center',
  },
  delayText: { color: '#AAAACC', fontSize: 12, fontWeight: '700' },
  deleteBtn: { paddingHorizontal: 6, paddingVertical: 4 },
  deleteIcon: { color: '#FF6B6B', fontSize: 14 },

  addStepBtn: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: '#5B4FE8',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  addStepText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },

  delayBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  delaySheet: {
    backgroundColor: '#1A1A2E',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 20,
    paddingBottom: 36,
  },
  delayTitle: { color: '#AAAACC', fontSize: 13, fontWeight: '600', marginBottom: 14 },
  delayOption: {
    paddingVertical: 13,
    borderRadius: 10,
    paddingHorizontal: 16,
    backgroundColor: '#2A2A3A',
    marginBottom: 8,
  },
  delayOptionActive: { backgroundColor: '#5B4FE8' },
  delayOptionText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  delayOptionTextActive: { color: '#FFFFFF' },
  delayCancel: { paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  delayCancelText: { color: '#6B6B8A', fontSize: 14, fontWeight: '600' },
});

const pickerStyles = StyleSheet.create({
  pickerTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700', flex: 1 },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    gap: 6,
    marginBottom: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#1A1A2E',
    alignItems: 'center',
  },
  tabActive: { backgroundColor: '#5B4FE8' },
  tabText: { color: '#6B6B8A', fontSize: 12, fontWeight: '600' },
  tabTextActive: { color: '#FFFFFF' },
  content: { padding: 16, gap: 8 },
  label: { color: '#AAAACC', fontSize: 12, fontWeight: '600', marginBottom: 4, marginTop: 8 },
  input: {
    backgroundColor: '#1A1A2E',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  addBtn: {
    backgroundColor: '#5B4FE8',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  addBtnDisabled: { opacity: 0.4 },
  addBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  appGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  appChip: {
    backgroundColor: '#1A1A2E',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  appChipText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  appSearchShell: {
    minHeight: 46,
    backgroundColor: '#1A1A2E',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 14,
    paddingRight: 6,
  },
  appSearchShellPath: { borderColor: 'rgba(91,79,232,0.6)' },
  appSearchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    paddingVertical: 10,
  },
  searchSpinner: { marginHorizontal: 8 },
  searchModeButton: {
    minWidth: 44,
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 7,
    backgroundColor: '#25253A',
  },
  searchModeButtonActive: { backgroundColor: '#5B4FE8' },
  searchModeButtonText: { color: '#AAAACC', fontSize: 11, fontWeight: '800' },
  searchModeButtonTextActive: { color: '#FFFFFF' },
  mutedHint: { color: '#6B6B8A', fontSize: 12, lineHeight: 17 },
  section: { gap: 8, marginTop: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: '#AAAACC', fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  noResults: { color: '#6B6B8A', fontSize: 12, lineHeight: 18 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#151525',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    gap: 10,
  },
  resultRowSelected: {
    borderColor: 'rgba(91,79,232,0.65)',
    backgroundColor: 'rgba(91,79,232,0.14)',
  },
  resultIcon: {
    width: 38,
    height: 38,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2A2A4A',
    overflow: 'hidden',
  },
  iconImage: { width: 28, height: 28, resizeMode: 'contain' },
  iconLetter: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  resultText: { flex: 1, minWidth: 0, gap: 4 },
  resultName: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  validationError: { color: '#FF8A8A' },
  resultPath: { color: '#6B6B8A', fontSize: 11 },
  resultButton: {
    backgroundColor: '#5B4FE8',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  resultButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  sourceBadge: {
    alignSelf: 'flex-start',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sourceBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 34,
    paddingHorizontal: 18,
    gap: 8,
  },
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
    padding: 12,
    gap: 10,
    backgroundColor: '#1A1A2E',
  },
  pluginIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pluginIconText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  pluginInfo: { flex: 1, minWidth: 0 },
  pluginName: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  pluginMeta: { color: '#6B6B8A', fontSize: 11, marginTop: 2 },
  expandText: { color: '#AAAACC', fontSize: 20, fontWeight: '600' },
  toolRow: {
    padding: 12,
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    backgroundColor: '#151525',
  },
  toolTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toolName: { flex: 1, color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  toolBadge: {
    color: '#CFCBFF',
    fontSize: 10,
    fontWeight: '800',
    backgroundColor: 'rgba(91,79,232,0.24)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  toolDesc: { color: '#AAAACC', fontSize: 12, lineHeight: 17 },
  toolActionId: { color: '#6B6B8A', fontSize: 11, fontWeight: '600' },
  paramSheet: {
    marginTop: 8,
    padding: 12,
    gap: 8,
    backgroundColor: '#151525',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(91,79,232,0.35)',
  },
  paramTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  paramLabel: { color: '#AAAACC', fontSize: 12, fontWeight: '700', marginBottom: 5 },
  paramInput: {
    backgroundColor: '#0F0F14',
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cancelLink: {
    color: '#6B6B8A',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 8,
  },
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
});
