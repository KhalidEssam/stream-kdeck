import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  Modal,
  Linking,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TileGrid } from '../components/TileGrid';
import { AddTileScreen } from './AddTileScreen';
import { AuthScreen } from './AuthScreen';
import { LicenseGateScreen } from './LicenseGateScreen';
import { WebSocketService } from '../services/websocket.service';
import type { ConnectionErrorInfo } from '../services/websocket.service';
import {
  ButtonAction,
  IntegrationPlugin,
  IntegrationStateMessage,
  TileConfig,
  Pack,
  PackRegistryMessage,
  MediaSession,
} from '../types/schema';
import { supabase } from '../lib/supabase';
import { ContextStrip } from '../components/ContextStrip';
import { ContextShortcutsMessage, ContextShortcut } from '../types/schema';
import { ContextShortcutsScreen } from './ContextShortcutsScreen';
import { TrackpadScreen } from './TrackpadScreen';
import { discoverAgent, normalizeAgentWsUrl } from '../services/discovery.service';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { OnboardingScreen } from './OnboardingScreen';
import { WorkflowBuilderScreen } from './WorkflowBuilderScreen';
import { WorkflowStep, WorkflowStepAction } from '../types/schema';
import { PeekFab, PeekFabHandle } from '../components/PeekFab';
import { MediaTab } from './MediaTab';
import { SettingsSheet } from '../components/SettingsSheet';
import { PluginLibraryScreen } from './PluginLibraryScreen';
import { PluginDetailScreen } from './PluginDetailScreen';
import { PluginConnectionScreen } from './PluginConnectionScreen';

const UPGRADE_URL =
  process.env.EXPO_PUBLIC_UPGRADE_URL ?? 'https://placeholder-website.example/upgrade';
const AGENT_URL_STORAGE_KEY = 'kdeck.agentUrl';

type DeckTab = 'ai' | 'apps' | 'media';

const DECK_TABS: Array<{ key: DeckTab; label: string }> = [
  { key: 'ai', label: 'AI Tools' },
  { key: 'apps', label: 'Apps' },
  { key: 'media', label: 'Media' },
];

function getManualInputFromAgentUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.port && parsed.port !== '3001'
      ? `${parsed.hostname}:${parsed.port}`
      : parsed.hostname;
  } catch {
    return url.replace(/^wss?:\/\//i, '').replace(/\/$/, '');
  }
}

export function DeckScreen() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [licensed, setLicensed] = useState<boolean | null>(null);
  const [creditsRemaining, setCreditsRemaining] = useState(0);
  const [creditQuota, setCreditQuota] = useState(0);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [tiles, setTiles] = useState<TileConfig[] | null>(null); // null = waiting for DECK_CONFIG
  const [activeTab, setActiveTab] = useState<DeckTab>('ai');
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [viewerText, setViewerText] = useState<string | null>(null);
  const [showAddTile, setShowAddTile] = useState(false);
  const [addTileInitialTab, setAddTileInitialTab] = useState<'apps' | 'plugins'>('apps');
  const [actionTile, setActionTile] = useState<TileConfig | null>(null);
  const [showUpsell, setShowUpsell] = useState(false);
  const [wsService, setWsService] = useState<WebSocketService | null>(null);
  const wsRef = useRef<WebSocketService | null>(null);
  const peekFabRef = useRef<PeekFabHandle>(null);
  const retryCancelRef = useRef<(() => void) | null>(null);
  const [agentUrl, setAgentUrl]             = useState<string | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<ConnectionErrorInfo | null>(null);
  const [discoveryAttempt, setDiscoveryAttempt] = useState(0);
  const [contextMsg, setContextMsg] = useState<ContextShortcutsMessage | null>(null);
  const [aiPro, setAiPro] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showContextSettings, setShowContextSettings] = useState(false);
  const [showTrackpad, setShowTrackpad] = useState(false);
  const [packRegistry, setPackRegistry] = useState<Pack[] | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [convertingTile, setConvertingTile] = useState<TileConfig | null>(null);
  const [mediaSessions, setMediaSessions] = useState<MediaSession[]>([]);
  const [mediaPlatform, setMediaPlatform] = useState<'win32' | 'darwin' | null>(null);
  const [manualIpInput, setManualIpInput] = useState('');
  const [showPluginLibrary, setShowPluginLibrary] = useState(false);
  const [selectedPlugin, setSelectedPlugin] = useState<IntegrationPlugin | null>(null);
  const [showPluginDetail, setShowPluginDetail] = useState(false);
  const [showPluginConnection, setShowPluginConnection] = useState(false);
  const [installedPluginIds, setInstalledPluginIds] = useState<string[]>([]);
  const [integrationStates, setIntegrationStates] = useState<Map<string, IntegrationStateMessage['states']>>(new Map());

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthenticated(!!session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthenticated(!!session);
      if (!session) {
        setLicensed(null);
        setAiPro(false);
        setCreditsRemaining(0);
        setCreditQuota(0);
        setTiles(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Effect 1: reconnect to a saved agent first, then fall back to mDNS discovery.
  useEffect(() => {
    let cancelled = false;

    const stopDiscovery = () => {
      retryCancelRef.current?.();
      retryCancelRef.current = null;
    };

    const startDiscovery = () => {
      if (cancelled) return;

      const cancel = discoverAgent(
        (url) => {
          retryCancelRef.current = null;
          if (!cancelled) setAgentUrl(url);
        },
        (msg) => {
          retryCancelRef.current = null;
          if (!cancelled) setDiscoveryError(msg);
        },
      );
      retryCancelRef.current = cancel;
    };

    stopDiscovery();
    setAgentUrl(null);
    setDiscoveryError(null);
    setConnectionError(null);
    if (!authenticated) {
      return () => {
        cancelled = true;
        stopDiscovery();
      };
    }

    AsyncStorage.getItem(AGENT_URL_STORAGE_KEY)
      .then((savedUrl) => {
        if (cancelled) return;

        const normalizedUrl = normalizeAgentWsUrl(savedUrl ?? undefined);
        if (normalizedUrl) {
          setManualIpInput(getManualInputFromAgentUrl(normalizedUrl));
          setAgentUrl(normalizedUrl);
          return;
        }

        startDiscovery();
      })
      .catch(() => {
        startDiscovery();
      });

    return () => {
      cancelled = true;
      stopDiscovery();
    };
  }, [authenticated, discoveryAttempt]);

  // Effect 2: connect WebSocket once discovery succeeds
  useEffect(() => {
    if (!agentUrl) return;

    setConnectionError(null);
    const ws = new WebSocketService(agentUrl);
    wsRef.current = ws;
    setWsService(ws);
    ws.onStatusChange((nextStatus) => {
      setStatus(nextStatus);
      if (nextStatus === 'connected') {
        setConnectionError(null);
        setManualIpInput(getManualInputFromAgentUrl(agentUrl));
        void AsyncStorage.setItem(AGENT_URL_STORAGE_KEY, agentUrl);
        ws.requestLicenseStatus();
      }
    });
    const unsubscribeConnectionError = ws.onConnectionError(setConnectionError);
    ws.onResult((result) => {
      setLoadingId(null);
      if (result.output) setViewerText(result.output);
    });
    ws.onDeckConfig((msg) => {
      setTiles(msg.tiles);
    });
    const unsubscribeLicense = ws.onLicenseStatus((msg) => {
      setLicensed(msg.licensed);
      setCreditsRemaining(msg.creditsRemaining);
      setCreditQuota(msg.creditQuota);
      setAiPro(msg.aiPro);
    });
    const unsubscribeQuota = ws.onAiQuotaExceeded(() => {
      setLoadingId(null);
      setCreditsRemaining(0);
      setShowUpsell(true);
    });
    const unsubscribeContext = ws.onContextShortcuts((msg) => {
      setContextMsg(msg.shortcuts.length > 0 ? msg : null);
    });
    const unsubscribePackRegistry = ws.onPackRegistry((msg: PackRegistryMessage) => {
      setPackRegistry(msg.packs);
      AsyncStorage.getItem('onboarded').then((val) => {
        if (!val && msg.packs.length > 0) setShowOnboarding(true);
      });
    });
    const unsubscribeMedia = ws.onMediaState((msg) => {
      setMediaSessions(msg.sessions);
      setMediaPlatform(msg.platform);
    });
    const unsubscribeInstalledPlugins = ws.onInstalledPlugins((ids) => setInstalledPluginIds(ids));
    const unsubscribeIntegrationState = ws.onIntegrationState((msg) => {
      setIntegrationStates((prev) => new Map(prev).set(msg.pluginId, msg.states));
    });

    return () => {
      unsubscribeLicense();
      unsubscribeConnectionError();
      unsubscribeQuota();
      unsubscribeContext();
      unsubscribePackRegistry();
      unsubscribeMedia();
      unsubscribeInstalledPlugins();
      unsubscribeIntegrationState();
      setContextMsg(null);
      setAiPro(false);
      setInstalledPluginIds([]);
      setIntegrationStates(new Map());
      ws.disconnect();
      wsRef.current = null;
      setWsService(null);
    };
  }, [agentUrl]);

  const handleRefresh = () => {
    setLoadingId(null);
    setViewerText(null);
    setTiles(null);
    setLicensed(null);
    setAiPro(false);
    setStatus('connecting');
    setDiscoveryError(null);
    setConnectionError(null);
    wsRef.current?.disconnect();
    setAgentUrl(null);
    setDiscoveryAttempt((attempt) => attempt + 1);
  };

  const handleChangeAgent = () => {
    retryCancelRef.current?.();
    retryCancelRef.current = null;
    setLoadingId(null);
    setViewerText(null);
    setTiles(null);
    setLicensed(null);
    setAiPro(false);
    setStatus('connecting');
    setDiscoveryError(null);
    setConnectionError(null);
    wsRef.current?.disconnect();
    setAgentUrl(null);
    void AsyncStorage.removeItem(AGENT_URL_STORAGE_KEY).finally(() => {
      setDiscoveryAttempt((attempt) => attempt + 1);
    });
  };

  const handleConnectManual = () => {
    const url = normalizeAgentWsUrl(manualIpInput.trim());
    if (!url) {
      Alert.alert('Invalid address', 'Enter the desktop IP, e.g. 192.168.1.10');
      return;
    }
    retryCancelRef.current?.();
    retryCancelRef.current = null;
    setDiscoveryError(null);
    setConnectionError(null);
    setStatus('connecting');
    setAgentUrl(url);
  };

  const handleTap = (tile: TileConfig) => {
    if (status !== 'connected') return;
    if (tile.action.kind === 'AI_CLIPBOARD' && creditsRemaining <= 0) {
      setShowUpsell(true);
      return;
    }
    setLoadingId(tile.id);
    wsRef.current?.tap(tile.id, tile.action);
  };

  const handleAddTile = (tile: Omit<TileConfig, 'id'>) => {
    if (!wsRef.current?.isConnected()) {
      Alert.alert('Not Connected', 'Connect to the desktop agent before adding tiles.');
      return;
    }
    wsRef.current.addTile(tile);
    // DECK_CONFIG response from agent will update tiles via onDeckConfig callback
  };

  const handleOpenAddTile = (initialTab: 'apps' | 'plugins' = 'apps') => {
    setAddTileInitialTab(initialTab);
    setShowAddTile(true);
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

  const handleContextShortcutTap = (shortcut: ContextShortcut) => {
    wsRef.current?.tap(`ctx-${shortcut.id}`, { kind: 'KEYSTROKE', keys: shortcut.keys });
  };

  const handleAddContextShortcut = (shortcut: Omit<ContextShortcut, 'id'>) => {
    if (!contextMsg) return;
    wsRef.current?.addContextShortcut(
      contextMsg.processName,
      contextMsg.appLabel,
      contextMsg.iconId,
      shortcut,
    );
  };

  const handleConfirmRemoveTile = () => {
    if (!actionTile || actionTile.id.startsWith('builtin-')) return;
    handleRemoveTile(actionTile.id);
    setActionTile(null);
  };

  const handleConvertToWorkflow = () => {
    if (!actionTile || actionTile.action.kind === 'AI_CLIPBOARD' || actionTile.action.kind === 'WORKFLOW') return;
    setConvertingTile(actionTile);
    setActionTile(null);
  };

  const handleRequestActivation = () => {
    wsRef.current?.openActivationDialog();
  };

  const handleOnboardingComplete = (selectedTools: Omit<TileConfig, 'id'>[]) => {
    selectedTools.forEach((tile) => wsRef.current?.addTile(tile));
    void AsyncStorage.setItem('onboarded', 'true');
    setShowOnboarding(false);
  };

  const handleOnboardingSkip = () => {
    void AsyncStorage.setItem('onboarded', 'true');
    setShowOnboarding(false);
  };

  const statusColor =
    status === 'connected' ? '#44FF88' : status === 'connecting' ? '#FFB800' : '#FF4444';
  const statusLabel = { connecting: 'Connecting…', connected: 'Connected', disconnected: 'Disconnected' }[status];
  const globalShortcutTiles = useMemo(
    () => (tiles ?? []).filter(t => t.kind === 'shortcut'),
    [tiles],
  );

  const tabCounts = useMemo(() => {
    const counts: Record<DeckTab, number> = { ai: 0, apps: 0, media: 0 };
    for (const tile of tiles ?? []) {
      if (tile.kind === 'ai') counts.ai += 1;
      else if (tile.kind !== 'shortcut') counts.apps += 1;
    }
    counts.media = mediaSessions.filter(s => s.volume > 0).length;
    return counts;
  }, [tiles, mediaSessions]);
  const visibleTiles = useMemo(() => {
    return (tiles ?? [])
      .filter((tile) => activeTab === 'ai' ? tile.kind === 'ai' : tile.kind !== 'ai' && tile.kind !== 'shortcut')
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  }, [activeTab, tiles]);
  const getStateBadge = (action: ButtonAction): string | null => {
    if (action.kind !== 'INTEGRATION_ACTION') return null;
    const states = integrationStates.get(action.pluginId) ?? [];
    const streaming = states.find((state) => state.key === 'streaming');
    if (streaming?.value === true) return typeof streaming.label === 'string' ? streaming.label : 'Live';
    const recording = states.find((state) => state.key === 'recording');
    if (recording?.value === true) return typeof recording.label === 'string' ? recording.label : 'Recording';
    const scene = states.find((state) => state.key === 'scene');
    return typeof scene?.label === 'string' && scene.label ? scene.label : null;
  };
  const tileStateBadges = useMemo(() => {
    const badges: Record<string, string | null> = {};
    for (const tile of visibleTiles) {
      badges[tile.id] = getStateBadge(tile.action);
    }
    return badges;
  }, [integrationStates, visibleTiles]);
  const emptyCopy = activeTab === 'ai'
    ? { title: 'No AI tools yet.', hint: 'Reconnect to load the built-in tools.' }
    : { title: 'No apps yet.', hint: 'Tap + to add apps, shortcuts, or workflows.' };

  if (authenticated === null) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
        <View style={styles.centerFill}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!authenticated) {
    return <AuthScreen onAuthenticated={() => setAuthenticated(true)} />;
  }

  if (authenticated && !agentUrl && !discoveryError) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color="#5B4FE8" style={{ marginBottom: 16 }} />
          <Text style={styles.loadingText}>Looking for KDeck agent…</Text>
          <Text style={[styles.loadingText, { fontSize: 12, marginTop: 8, color: '#6B6B8A', textAlign: 'center', paddingHorizontal: 32 }]}>
            Make sure your desktop and phone are on the same WiFi network.
          </Text>

          <Text style={styles.manualDivider}>— or connect manually —</Text>
          <TextInput
            style={styles.ipInput}
            value={manualIpInput}
            onChangeText={setManualIpInput}
            placeholder="192.168.x.x"
            placeholderTextColor="#555566"
            keyboardType="numbers-and-punctuation"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleConnectManual}
          />
          <TouchableOpacity
            style={[styles.button, { marginTop: 10, paddingHorizontal: 28 }]}
            onPress={handleConnectManual}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>Connect</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (discoveryError) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
        <View style={styles.centerFill}>
          <Text style={styles.loadingText}>Agent not found</Text>
          <Text style={[styles.loadingText, { fontSize: 13, marginTop: 8, color: '#6B6B8A', textAlign: 'center', paddingHorizontal: 32 }]}>
            {discoveryError}
          </Text>
          <TouchableOpacity
            style={[styles.button, { marginTop: 24, paddingHorizontal: 28 }]}
            onPress={() => {
              retryCancelRef.current?.();
              setDiscoveryError(null);
              setDiscoveryAttempt((attempt) => attempt + 1);
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>Retry</Text>
          </TouchableOpacity>

          <Text style={styles.manualDivider}>— or connect manually —</Text>
          <TextInput
            style={styles.ipInput}
            value={manualIpInput}
            onChangeText={setManualIpInput}
            placeholder="192.168.x.x"
            placeholderTextColor="#555566"
            keyboardType="numbers-and-punctuation"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleConnectManual}
          />
          <TouchableOpacity
            style={[styles.button, { marginTop: 10, paddingHorizontal: 28 }]}
            onPress={handleConnectManual}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>Connect</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (licensed === null && status === 'connected') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
        <View style={styles.centerFill}>
          <Text style={styles.loadingText}>Checking license...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (licensed === false) {
    return <LicenseGateScreen onRequestActivation={handleRequestActivation} />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />

      <View style={styles.header}>
        <Text style={styles.title}>KDeck</Text>
        {status === 'connected' && (
          <TouchableOpacity onPress={() => setShowPluginLibrary(true)} style={styles.pluginsBtn} activeOpacity={0.75}>
            <Text style={styles.pluginsBtnText}>Plugins</Text>
          </TouchableOpacity>
        )}
        {status === 'connected' && (
          <TouchableOpacity onPress={() => setShowTrackpad(true)} style={{ paddingHorizontal: 8 }} activeOpacity={0.7}>
            <Text style={{ fontSize: 20 }}>🖱</Text>
          </TouchableOpacity>
        )}
        {wsService && (
          <TouchableOpacity onPress={() => setShowSettings(true)} style={{ paddingHorizontal: 8 }} activeOpacity={0.7}>
            <Text style={{ color: '#6B6B8A', fontSize: 18 }}>⚙</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.statusBadge} onPress={handleRefresh} activeOpacity={0.7}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
          <Text style={styles.refreshIcon}>↺</Text>
        </TouchableOpacity>
      </View>

      {status === 'disconnected' && connectionError && (
        <View style={styles.connectionErrorBanner}>
          <Text style={styles.connectionErrorTitle}>Could not connect to agent</Text>
          <Text style={styles.connectionErrorBody} selectable>
            {connectionError.url} - {connectionError.message}
          </Text>
          <View style={styles.connectionErrorActions}>
            <TouchableOpacity
              style={styles.connectionErrorButton}
              onPress={handleRefresh}
              activeOpacity={0.78}
            >
              <Text style={styles.connectionErrorButtonText}>Retry</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.connectionErrorButton, styles.connectionErrorButtonSecondary]}
              onPress={handleChangeAgent}
              activeOpacity={0.78}
            >
              <Text style={styles.connectionErrorButtonText}>Change IP</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

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

      {activeTab === 'media' ? (
        <MediaTab
          sessions={mediaSessions}
          platform={mediaPlatform}
          ws={wsService}
        />
      ) : tiles === null ? (
        // Skeleton — waiting for DECK_CONFIG
        <View style={styles.skeletonGrid}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={styles.skeletonTile} />
          ))}
        </View>
      ) : (
        <View style={styles.tileGridContainer}>
          <TileGrid
            tiles={visibleTiles}
            loadingId={loadingId}
            creditsRemaining={creditsRemaining}
            onTap={handleTap}
            onLongPress={handleRequestTileActions}
            onAddTile={() => handleOpenAddTile()}
            emptyTitle={emptyCopy.title}
            emptyHint={emptyCopy.hint}
            stateBadges={tileStateBadges}
          />
        </View>
      )}

      {/* FAB — add tile */}
      <PeekFab
        ref={peekFabRef}
        onPress={() => handleOpenAddTile()}
        showBadge={!!packRegistry?.length}
      />

      {/* AddTile modal */}
      <Modal
        visible={showAddTile}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setShowAddTile(false);
          peekFabRef.current?.resetToPeeking();
        }}
      >
        {wsService && (
          <AddTileScreen
            currentTiles={tiles ?? []}
            onAdd={handleAddTile}
            onRemove={handleRemoveTile}
            onDismiss={() => {
              setShowAddTile(false);
              peekFabRef.current?.resetToPeeking();
            }}
            ws={wsService}
            packRegistry={packRegistry}
            initialTab={addTileInitialTab}
          />
        )}
      </Modal>

      <PluginLibraryScreen
        visible={showPluginLibrary}
        wsService={wsService}
        onDismiss={() => setShowPluginLibrary(false)}
        onOpenDetail={(plugin) => {
          setSelectedPlugin(plugin);
          setShowPluginLibrary(false);
          setShowPluginDetail(true);
        }}
      />

      <PluginDetailScreen
        plugin={showPluginDetail ? selectedPlugin : null}
        installedIds={installedPluginIds}
        onDismiss={() => setShowPluginDetail(false)}
        onInstall={(pluginId) => wsService?.sendInstallPlugin(pluginId)}
        onUninstall={(pluginId) => wsService?.sendUninstallPlugin(pluginId)}
        onConnect={(plugin) => {
          setSelectedPlugin(plugin);
          setShowPluginDetail(false);
          setShowPluginConnection(true);
        }}
        onAddTools={(plugin) => {
          setSelectedPlugin(plugin);
          setShowPluginDetail(false);
          handleOpenAddTile('plugins');
        }}
      />

      <PluginConnectionScreen
        plugin={showPluginConnection ? selectedPlugin : null}
        wsService={wsService}
        onDismiss={() => setShowPluginConnection(false)}
      />

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
              {!actionTile?.id.startsWith('builtin-') &&
                actionTile?.kind !== 'workflow' &&
                actionTile?.action.kind !== 'AI_CLIPBOARD' && (
                <TouchableOpacity
                  style={styles.optionButton}
                  onPress={handleConvertToWorkflow}
                  activeOpacity={0.75}
                >
                  <Text style={styles.optionButtonText}>Convert to Workflow</Text>
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

      <Modal
        visible={showUpsell}
        animationType="slide"
        transparent
        onRequestClose={() => setShowUpsell(false)}
      >
        <View style={styles.upsellBackdrop}>
          <View style={styles.upsellSheet}>
            <Text style={styles.upsellTitle}>Credits Exhausted</Text>
            <Text style={styles.upsellBody}>
              You have used all your AI credits for this month. Upgrade to AI Pro for more
              credits/month.
            </Text>
            <TouchableOpacity
              style={styles.upsellButton}
              onPress={() => {
                setShowUpsell(false);
                Linking.openURL(UPGRADE_URL);
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.upsellButtonText}>Upgrade to AI Pro</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.upsellDismiss}
              onPress={() => setShowUpsell(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.upsellDismissText}>Not now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <SettingsSheet
        visible={showSettings}
        onDismiss={() => setShowSettings(false)}
        connected={status === 'connected'}
        licensed={licensed}
        aiPro={aiPro}
        creditsRemaining={creditsRemaining}
        creditQuota={creditQuota}
        onRevalidateLicense={() => wsService?.revalidateLicense()}
        onOpenActivationDialog={() => wsService?.openActivationDialog()}
        onNavigateToShortcuts={() => {
          setShowSettings(false);
          setShowContextSettings(true);
        }}
      />

      <Modal
        visible={showContextSettings}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowContextSettings(false)}
      >
        {wsService && (
          <ContextShortcutsScreen
            ws={wsService}
            onDismiss={() => setShowContextSettings(false)}
          />
        )}
      </Modal>

      <Modal
        visible={showTrackpad}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowTrackpad(false)}
      >
        {wsService && (
          <TrackpadScreen ws={wsService} onDismiss={() => setShowTrackpad(false)} />
        )}
      </Modal>

      <ContextStrip
        msg={contextMsg}
        globalTiles={globalShortcutTiles}
        onTapShortcut={handleContextShortcutTap}
        onTapGlobalTile={handleTap}
        onAddShortcut={handleAddContextShortcut}
        onAddGlobal={() => handleOpenAddTile()}
      />

      <Modal visible={showOnboarding} animationType="slide">
        <OnboardingScreen
          packs={packRegistry ?? []}
          onComplete={handleOnboardingComplete}
          onSkip={handleOnboardingSkip}
        />
      </Modal>

      <Modal
        visible={convertingTile !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setConvertingTile(null)}
      >
          {convertingTile && (
            <WorkflowBuilderScreen
              initialLabel={convertingTile.label}
              initialSteps={[{
                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                action: convertingTile.action as WorkflowStepAction,
                delayBefore: 0,
                label: convertingTile.label,
              }]}
              onSave={(tile) => {
                if (!wsRef.current?.isConnected()) {
                  Alert.alert('Not Connected', 'Connect to the desktop agent before saving.');
                  return;
                }
                handleRemoveTile(convertingTile.id);
                handleAddTile(tile);
                setConvertingTile(null);
              }}
              onDismiss={() => setConvertingTile(null)}
            />
          )}
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F14' },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: '#6B6B8A', fontSize: 14 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', flex: 1 },
  pluginsBtn: {
    backgroundColor: '#1A1A2E',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginRight: 4,
  },
  pluginsBtnText: { color: '#AAAACC', fontSize: 12, fontWeight: '800' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '600' },
  refreshIcon: { color: '#6B6B8A', fontSize: 16, marginLeft: 2 },
  connectionErrorBanner: {
    marginHorizontal: 12,
    marginBottom: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#5A2731',
    backgroundColor: '#24151B',
    padding: 12,
  },
  connectionErrorTitle: { color: '#FF6B7A', fontSize: 13, fontWeight: '800', marginBottom: 4 },
  connectionErrorBody: { color: '#C8B8BE', fontSize: 12, lineHeight: 17 },
  connectionErrorActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  connectionErrorButton: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: '#5B4FE8',
    paddingVertical: 9,
    alignItems: 'center',
  },
  connectionErrorButtonSecondary: { backgroundColor: '#3A3348' },
  connectionErrorButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
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
  tileGridContainer: { flex: 1, paddingBottom: 120 },
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
  upsellBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  upsellSheet: {
    backgroundColor: '#1A1A2E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 28,
    paddingBottom: 40,
  },
  upsellTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', marginBottom: 10 },
  upsellBody: { color: '#888888', fontSize: 14, lineHeight: 22, marginBottom: 24 },
  upsellButton: {
    backgroundColor: '#5B4FE8',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  upsellButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  upsellDismiss: { alignItems: 'center', paddingVertical: 8 },
  upsellDismissText: { color: '#555555', fontSize: 14 },
  button: {
    backgroundColor: '#5B4FE8',
    borderRadius:    10,
    paddingVertical: 14,
    alignItems:      'center',
  },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  manualDivider: { color: '#44445A', fontSize: 12, marginTop: 32, marginBottom: 14 },
  ipInput: {
    backgroundColor: '#1A1A2E',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3A3A55',
    color: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    width: 220,
    textAlign: 'center',
    letterSpacing: 1,
  },
});
