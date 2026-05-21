import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IntegrationPlugin } from '../types/schema';
import { WebSocketService } from '../services/websocket.service';

const INSTALL_ACK_TIMEOUT_MS = 15000;

interface Props {
  visible: boolean;
  wsService: WebSocketService | null;
  onDismiss: () => void;
  onOpenDetail: (plugin: IntegrationPlugin) => void;
}

export function PluginLibraryScreen({ visible, wsService, onDismiss, onOpenDetail }: Props) {
  const [plugins, setPlugins] = useState<IntegrationPlugin[]>([]);
  const [installedIds, setInstalledIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [pendingPluginId, setPendingPluginId] = useState<string | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const pendingPluginIdRef = useRef<string | null>(null);
  const pendingOperationRef = useRef<'install' | 'uninstall' | null>(null);
  const pendingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPendingTimeout = () => {
    if (!pendingTimeoutRef.current) return;
    clearTimeout(pendingTimeoutRef.current);
    pendingTimeoutRef.current = null;
  };

  const finishPending = (pluginId: string) => {
    if (pendingPluginIdRef.current !== pluginId) return;
    clearPendingTimeout();
    pendingPluginIdRef.current = null;
    pendingOperationRef.current = null;
    setPendingPluginId(null);
  };

  const startPending = (plugin: IntegrationPlugin, operation: 'install' | 'uninstall') => {
    clearPendingTimeout();
    pendingPluginIdRef.current = plugin.id;
    pendingOperationRef.current = operation;
    setPendingPluginId(plugin.id);
    pendingTimeoutRef.current = setTimeout(() => {
      finishPending(plugin.id);
      setInstallError(`Timed out waiting for ${plugin.name}. Restart the desktop agent and try again.`);
    }, INSTALL_ACK_TIMEOUT_MS);
  };

  useEffect(() => {
    if (!wsService || !visible) return;
    wsService.requestPluginCatalog();
    const unsubCatalog = wsService.onPluginCatalog(setPlugins);
    const unsubInstalled = wsService.onInstalledPlugins((ids) => {
      setInstalledIds(ids);
      const pendingId = pendingPluginIdRef.current;
      const pendingOperation = pendingOperationRef.current;
      if (!pendingId || !pendingOperation) return;
      if (pendingOperation === 'install' && ids.includes(pendingId)) finishPending(pendingId);
      if (pendingOperation === 'uninstall' && !ids.includes(pendingId)) finishPending(pendingId);
    });
    const unsubInstallStatus = wsService.onPluginInstallStatus((msg) => {
      finishPending(msg.pluginId);
      if (msg.status === 'error') {
        setInstallError(msg.error ?? 'Plugin install failed.');
        return;
      }

      setInstallError(null);
      setInstalledIds((prev) => {
        if (msg.status === 'installed') {
          return prev.includes(msg.pluginId) ? prev : [...prev, msg.pluginId];
        }
        return prev.filter((id) => id !== msg.pluginId);
      });
    });
    return () => {
      unsubCatalog();
      unsubInstalled();
      unsubInstallStatus();
      clearPendingTimeout();
    };
  }, [wsService, visible]);

  const categories = useMemo(
    () => Array.from(new Set(plugins.map((plugin) => plugin.category))).sort(),
    [plugins],
  );

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return plugins.filter((plugin) => {
      const matchesQuery = !normalizedQuery
        || plugin.name.toLowerCase().includes(normalizedQuery)
        || plugin.description?.toLowerCase().includes(normalizedQuery);
      const matchesCategory = !category || plugin.category === category;
      return matchesQuery && matchesCategory;
    });
  }, [category, plugins, query]);

  const toggleInstall = (plugin: IntegrationPlugin, installed: boolean) => {
    if (!wsService) return;
    if (!wsService.isConnected()) {
      setInstallError('Desktop agent is not connected.');
      return;
    }
    setInstallError(null);
    startPending(plugin, installed ? 'uninstall' : 'install');
    if (installed) wsService.sendUninstallPlugin(plugin.id);
    else wsService.sendInstallPlugin(plugin.id);
  };

  const renderPlugin = ({ item }: { item: IntegrationPlugin }) => {
    const installed = installedIds.includes(item.id);
    const pending = pendingPluginId === item.id;
    return (
      <TouchableOpacity style={styles.card} onPress={() => onOpenDetail(item)} activeOpacity={0.78}>
        <View style={[styles.iconBox, { backgroundColor: item.color ?? '#2A2A4A' }]}>
          <Text style={styles.iconText}>{item.icon.slice(0, 2).toUpperCase()}</Text>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
          {item.description ? (
            <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
          ) : null}
          <Text style={styles.cardMeta} numberOfLines={1}>{item.category} / {item.publisher}</Text>
        </View>
        <TouchableOpacity
          style={[styles.ctaBtn, installed ? styles.ctaBtnInstalled : styles.ctaBtnAvailable]}
          onPress={(event) => {
            event.stopPropagation();
            if (installed) onOpenDetail(item);
            else toggleInstall(item, installed);
          }}
          disabled={pending}
          activeOpacity={0.78}
        >
          {pending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.ctaBtnText}>{installed ? 'Open' : 'Install'}</Text>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onDismiss}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Plugins</Text>
          <TouchableOpacity onPress={onDismiss} style={styles.doneBtn} activeOpacity={0.78}>
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={styles.search}
          placeholder="Search plugins"
          placeholderTextColor="#6B6B8A"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <View style={styles.chips}>
          <TouchableOpacity
            style={[styles.chip, !category && styles.chipActive]}
            onPress={() => setCategory(null)}
            activeOpacity={0.78}
          >
            <Text style={[styles.chipText, !category && styles.chipTextActive]}>All</Text>
          </TouchableOpacity>
          {categories.map((item) => (
            <TouchableOpacity
              key={item}
              style={[styles.chip, category === item && styles.chipActive]}
              onPress={() => setCategory(category === item ? null : item)}
              activeOpacity={0.78}
            >
              <Text style={[styles.chipText, category === item && styles.chipTextActive]}>
                {item.charAt(0).toUpperCase() + item.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {installError ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{installError}</Text>
          </View>
        ) : null}

        <FlatList
          data={filtered}
          keyExtractor={(plugin) => plugin.id}
          renderItem={renderPlugin}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>No plugins found.</Text>}
        />
      </SafeAreaView>
    </Modal>
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
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', flex: 1 },
  doneBtn: { backgroundColor: '#2A2A4A', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  doneBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  search: {
    marginHorizontal: 12,
    marginBottom: 10,
    borderRadius: 10,
    backgroundColor: '#1A1A2E',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    color: '#FFFFFF',
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 8, marginBottom: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: '#1A1A2E' },
  chipActive: { backgroundColor: '#5B4FE8' },
  chipText: { color: '#8A8AAA', fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: '#FFFFFF' },
  errorBanner: {
    marginHorizontal: 12,
    marginBottom: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#5A2731',
    backgroundColor: '#24151B',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  errorText: { color: '#FF8A9A', fontSize: 12, fontWeight: '700', lineHeight: 17 },
  list: { paddingHorizontal: 12, paddingBottom: 32 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A2E',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    padding: 12,
    marginBottom: 8,
    gap: 12,
  },
  iconBox: { width: 44, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  iconText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  cardBody: { flex: 1 },
  cardName: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  cardDesc: { color: '#8A8AAA', fontSize: 12, lineHeight: 17, marginTop: 2 },
  cardMeta: { color: '#5E5E78', fontSize: 11, fontWeight: '700', marginTop: 4 },
  ctaBtn: { minWidth: 72, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, alignItems: 'center' },
  ctaBtnAvailable: { backgroundColor: '#5B4FE8' },
  ctaBtnInstalled: { backgroundColor: '#2A2A4A' },
  ctaBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },
  empty: { color: '#6B6B8A', textAlign: 'center', marginTop: 42, fontSize: 14 },
});
