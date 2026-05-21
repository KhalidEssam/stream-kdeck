import React from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IntegrationPlugin } from '../types/schema';

interface Props {
  plugin: IntegrationPlugin | null;
  installedIds: string[];
  onDismiss: () => void;
  onInstall: (pluginId: string) => void;
  onUninstall: (pluginId: string) => void;
  onConnect: (plugin: IntegrationPlugin) => void;
  onAddTools: (plugin: IntegrationPlugin) => void;
}

export function PluginDetailScreen({
  plugin,
  installedIds,
  onDismiss,
  onInstall,
  onUninstall,
  onConnect,
  onAddTools,
}: Props) {
  if (!plugin) return null;

  const installed = installedIds.includes(plugin.id);

  return (
    <Modal visible={!!plugin} animationType="slide" presentationStyle="pageSheet" onRequestClose={onDismiss}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onDismiss} activeOpacity={0.78}>
            <Text style={styles.back}>Back</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.iconBox, { backgroundColor: plugin.color ?? '#2A2A4A' }]}>
            <Text style={styles.iconText}>{plugin.icon.slice(0, 2).toUpperCase()}</Text>
          </View>
          <Text style={styles.name}>{plugin.name}</Text>
          <Text style={styles.meta}>{plugin.publisher} / v{plugin.version}</Text>
          {plugin.description ? <Text style={styles.desc}>{plugin.description}</Text> : null}

          {plugin.requiresConnector ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Connection</Text>
              <Text style={styles.infoValue}>{plugin.connectorType ?? 'required'}</Text>
            </View>
          ) : null}

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Platforms</Text>
            <Text style={styles.infoValue}>{plugin.supportedPlatforms.join(', ')}</Text>
          </View>

          <Text style={styles.sectionTitle}>Tools ({plugin.tools.length})</Text>
          {plugin.tools.map((tool) => (
            <View key={tool.id} style={styles.toolRow}>
              <Text style={styles.toolName}>{tool.name}</Text>
              {tool.description ? <Text style={styles.toolDesc}>{tool.description}</Text> : null}
              <View style={styles.toolBadges}>
                {tool.supportsWorkflows ? <Text style={styles.badge}>Workflow</Text> : null}
                {tool.supportsState ? <Text style={styles.badge}>State</Text> : null}
                {tool.requiresConfirmation ? <Text style={styles.badgeWarn}>Confirm</Text> : null}
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={styles.footer}>
          {!installed ? (
            <TouchableOpacity style={styles.primaryBtn} onPress={() => onInstall(plugin.id)} activeOpacity={0.8}>
              <Text style={styles.primaryBtnText}>Install</Text>
            </TouchableOpacity>
          ) : (
            <>
              {plugin.requiresConnector ? (
                <TouchableOpacity style={styles.secondaryBtn} onPress={() => onConnect(plugin)} activeOpacity={0.8}>
                  <Text style={styles.secondaryBtnText}>Configure Connection</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={styles.primaryBtn} onPress={() => onAddTools(plugin)} activeOpacity={0.8}>
                <Text style={styles.primaryBtnText}>Add Tools to Deck</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dangerBtn} onPress={() => onUninstall(plugin.id)} activeOpacity={0.8}>
                <Text style={styles.dangerBtnText}>Remove Plugin</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F14' },
  header: { paddingHorizontal: 16, paddingVertical: 12 },
  back: { color: '#AAAACC', fontSize: 15, fontWeight: '700' },
  content: { padding: 20, paddingBottom: 8 },
  iconBox: {
    width: 72,
    height: 72,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    alignSelf: 'center',
  },
  iconText: { color: '#FFFFFF', fontWeight: '800', fontSize: 24 },
  name: { color: '#FFFFFF', fontSize: 24, fontWeight: '800', textAlign: 'center' },
  meta: { color: '#6B6B8A', fontSize: 13, textAlign: 'center', marginTop: 4, marginBottom: 14 },
  desc: { color: '#AAAACC', fontSize: 14, lineHeight: 21, marginBottom: 16 },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
    gap: 16,
  },
  infoLabel: { color: '#6B6B8A', fontSize: 13, fontWeight: '700' },
  infoValue: { color: '#AAAACC', fontSize: 13, flex: 1, textAlign: 'right' },
  sectionTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', marginTop: 22, marginBottom: 10 },
  toolRow: {
    backgroundColor: '#1A1A2E',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    padding: 12,
    marginBottom: 8,
  },
  toolName: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  toolDesc: { color: '#8A8AAA', fontSize: 12, lineHeight: 17, marginTop: 3 },
  toolBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  badge: {
    backgroundColor: '#252548',
    color: '#B9B5FF',
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeWarn: {
    backgroundColor: '#3A2632',
    color: '#FFB36B',
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  footer: { padding: 16, gap: 10 },
  primaryBtn: { backgroundColor: '#5B4FE8', borderRadius: 10, padding: 14, alignItems: 'center' },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  secondaryBtn: { backgroundColor: '#2A2A4A', borderRadius: 10, padding: 14, alignItems: 'center' },
  secondaryBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  dangerBtn: { padding: 12, alignItems: 'center' },
  dangerBtnText: { color: '#FF6B6B', fontSize: 14, fontWeight: '700' },
});
