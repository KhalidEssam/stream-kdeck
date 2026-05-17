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
} from 'react-native';
import { DeckButton, ButtonConfig } from '../components/DeckButton';
import { WebSocketService } from '../services/websocket.service';
import { ButtonAction } from '../types/schema';

interface ButtonDefinition extends ButtonConfig {
  action: ButtonAction;
}

const DEMO_BUTTONS: ButtonDefinition[] = [
  {
    id: 'btn-explain',
    label: 'Explain Error',
    color: '#2D1B69',
    action: {
      kind: 'AI_CLIPBOARD',
      prompt: 'Explain this error clearly and concisely. What is the root cause and how do I fix it?',
      outputMode: 'viewer',
    },
  },
  {
    id: 'btn-grammar',
    label: 'Fix Grammar',
    color: '#0D3B2E',
    action: {
      kind: 'AI_CLIPBOARD',
      prompt: 'Fix all grammar and spelling errors. Return only the corrected text, no commentary.',
      outputMode: 'autopaste',
    },
  },
  {
    id: 'btn-tweet',
    label: 'Write Tweet',
    color: '#1A237E',
    action: {
      kind: 'AI_CLIPBOARD',
      prompt: 'Write a compelling tweet based on this content. Max 280 characters. No hashtags unless relevant.',
      outputMode: 'clipboard',
    },
  },
  {
    id: 'btn-shorten',
    label: 'Make Shorter',
    color: '#2C1654',
    action: {
      kind: 'AI_CLIPBOARD',
      prompt: 'Rewrite this to be shorter and more concise. Cut filler. Keep the core message intact.',
      outputMode: 'autopaste',
    },
  },
  {
    id: 'btn-tests',
    label: 'Write Tests',
    color: '#1B2631',
    action: {
      kind: 'AI_CLIPBOARD',
      prompt: 'Write comprehensive unit tests for this code. Use the same language and testing framework visible in the code.',
      outputMode: 'viewer',
    },
  },
  {
    id: 'btn-translate',
    label: 'Translate ES',
    color: '#1A3C34',
    action: {
      kind: 'AI_CLIPBOARD',
      prompt: 'Translate this text to Spanish. Return only the translation.',
      outputMode: 'clipboard',
    },
  },
];

// Replace with your desktop machine's local IP address during development.
// Find it with: ipconfig (Windows) or ifconfig | grep inet (macOS)
// mDNS auto-discovery replaces this hardcoded IP in the Week 3-4 Core Expansion plan.
const AGENT_URL = 'ws://192.168.1.100:3001';

export function DeckScreen() {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [viewerText, setViewerText] = useState<string | null>(null);
  const wsRef = useRef<WebSocketService | null>(null);

  useEffect(() => {
    const ws = new WebSocketService(AGENT_URL);
    wsRef.current = ws;
    ws.onStatusChange(setStatus);
    ws.onResult((result) => {
      setLoadingId(null);
      if (result.output) setViewerText(result.output);
    });
    return () => ws.disconnect();
  }, []);

  const handleTap = (buttonId: string) => {
    if (status !== 'connected') return;
    const def = DEMO_BUTTONS.find((b) => b.id === buttonId);
    if (!def) return;
    setLoadingId(buttonId);
    wsRef.current?.tap(buttonId, def.action);
  };

  const buttons: ButtonConfig[] = DEMO_BUTTONS.map((b) => ({
    ...b,
    isLoading: b.id === loadingId,
  }));

  const statusColor =
    status === 'connected' ? '#44FF88' : status === 'connecting' ? '#FFB800' : '#FF4444';
  const statusLabel = { connecting: 'Connecting…', connected: 'Connected', disconnected: 'Disconnected' }[status];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />

      <View style={styles.header}>
        <Text style={styles.title}>Control Surface</Text>
        <View style={styles.statusBadge}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
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

      <FlatList
        data={buttons}
        keyExtractor={(item) => item.id}
        numColumns={2}
        renderItem={({ item }) => <DeckButton config={item} onTap={handleTap} />}
        contentContainerStyle={styles.grid}
      />
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
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '600' },
  grid: { padding: 8 },
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
});
