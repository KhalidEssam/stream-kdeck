import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IntegrationPlugin, PluginConnectionStatusMessage } from '../types/schema';
import { WebSocketService } from '../services/websocket.service';

interface Props {
  plugin: IntegrationPlugin | null;
  wsService: WebSocketService | null;
  onDismiss: () => void;
}

export function PluginConnectionScreen({ plugin, wsService, onDismiss }: Props) {
  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState('4455');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!wsService || !plugin) return;
    const unsub = wsService.onPluginConnectionStatus((msg: PluginConnectionStatusMessage) => {
      if (msg.pluginId !== plugin.id) return;
      if (msg.status === 'connected') {
        setStatus('success');
        setErrorMsg('');
      } else {
        setStatus('error');
        setErrorMsg(msg.error ?? 'Connection failed');
      }
    });
    return unsub;
  }, [plugin, wsService]);

  useEffect(() => {
    if (plugin) {
      setStatus('idle');
      setErrorMsg('');
    }
  }, [plugin]);

  const handleSave = () => {
    if (!wsService || !plugin) return;
    setStatus('saving');
    setErrorMsg('');
    wsService.sendSetPluginConnection(plugin.id, {
      host: host.trim() || 'localhost',
      port: Number.parseInt(port, 10) || 4455,
      password,
    });
  };

  if (!plugin) return null;

  return (
    <Modal visible={!!plugin} animationType="slide" presentationStyle="pageSheet" onRequestClose={onDismiss}>
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onDismiss} activeOpacity={0.78}>
              <Text style={styles.back}>Back</Text>
            </TouchableOpacity>
            <Text style={styles.title} numberOfLines={1}>Connect {plugin.name}</Text>
            <View style={styles.headerSpacer} />
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Host</Text>
            <TextInput
              style={styles.input}
              value={host}
              onChangeText={setHost}
              placeholder="localhost"
              placeholderTextColor="#6B6B8A"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.label}>Port</Text>
            <TextInput
              style={styles.input}
              value={port}
              onChangeText={setPort}
              placeholder="4455"
              placeholderTextColor="#6B6B8A"
              keyboardType="numeric"
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Optional"
              placeholderTextColor="#6B6B8A"
              secureTextEntry
              autoCapitalize="none"
            />

            {status === 'error' ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
            {status === 'success' ? <Text style={styles.successText}>Connected successfully.</Text> : null}

            <TouchableOpacity
              style={[styles.saveBtn, status === 'saving' && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={status === 'saving'}
              activeOpacity={0.8}
            >
              {status === 'saving' ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.saveBtnText}>Save and Connect</Text>
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.hint}>
            In OBS, open Tools, then WebSocket Server Settings. Enable the server and use the same port and password here.
          </Text>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F14' },
  keyboard: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  back: { color: '#AAAACC', fontSize: 15, fontWeight: '700', width: 56 },
  title: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', flex: 1, textAlign: 'center' },
  headerSpacer: { width: 56 },
  form: { padding: 20 },
  label: { color: '#AAAACC', fontSize: 13, fontWeight: '700', marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: '#1A1A2E',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: '#FFFFFF',
    fontSize: 15,
  },
  errorText: { color: '#FF6B6B', fontSize: 13, lineHeight: 18, marginTop: 14 },
  successText: { color: '#7AEB9A', fontSize: 13, fontWeight: '700', marginTop: 14 },
  saveBtn: { backgroundColor: '#5B4FE8', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 24 },
  saveBtnDisabled: { opacity: 0.65 },
  saveBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  hint: { color: '#6B6B8A', fontSize: 12, lineHeight: 18, paddingHorizontal: 20 },
});
