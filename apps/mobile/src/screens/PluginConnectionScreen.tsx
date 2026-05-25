import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
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
  const [connectedName, setConnectedName] = useState('');
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!wsService || !plugin) return;
    const unsub = wsService.onPluginConnectionStatus((msg: PluginConnectionStatusMessage) => {
      if (msg.pluginId !== plugin.id) return;
      if (msg.status === 'connected') {
        setStatus('success');
        setErrorMsg('');
        setConnectedName(msg.providerAccountName ?? msg.displayName ?? '');
        stopStatusPolling();
      } else if (msg.status === 'error' || msg.status === 'expired') {
        setStatus('error');
        setErrorMsg(msg.error ?? (msg.status === 'expired' ? 'Connection expired' : 'Connection failed'));
        stopStatusPolling();
      } else {
        setStatus('idle');
        setErrorMsg('');
        setConnectedName('');
      }
    });
    return unsub;
  }, [plugin, wsService]);

  useEffect(() => {
    if (!wsService || !plugin) return;
    const unsub = wsService.onPluginOAuthStart((msg) => {
      if (msg.pluginId !== plugin.id) return;
      Linking.openURL(msg.authorizeUrl)
        .then(() => startStatusPolling())
        .catch((err) => {
          setStatus('error');
          setErrorMsg(err instanceof Error ? err.message : 'Could not open authorization page');
        });
    });
    return unsub;
  }, [plugin, wsService]);

  useEffect(() => {
    if (plugin) {
      setStatus('idle');
      setErrorMsg('');
      setConnectedName('');
      if (plugin.connectorType === 'oauth2') {
        wsService?.sendGetPluginConnectionStatus(plugin.id);
      }
    }
    return stopStatusPolling;
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

  const handleOAuthConnect = () => {
    if (!wsService || !plugin) return;
    setStatus('saving');
    setErrorMsg('');
    wsService.sendStartPluginOAuth(plugin.id);
  };

  const handleDisconnect = () => {
    if (!wsService || !plugin) return;
    setStatus('saving');
    setErrorMsg('');
    wsService.sendDisconnectPlugin(plugin.id);
  };

  const startStatusPolling = () => {
    if (!wsService || !plugin) return;
    stopStatusPolling();
    wsService.sendGetPluginConnectionStatus(plugin.id);
    pollIntervalRef.current = setInterval(() => {
      wsService.sendGetPluginConnectionStatus(plugin.id);
    }, 3000);
    pollTimeoutRef.current = setTimeout(stopStatusPolling, 5 * 60 * 1000);
  };

  function stopStatusPolling() {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  }

  if (!plugin) return null;

  const needsConnector = plugin.requiresConnector && plugin.connectorType !== 'none';

  return (
    <Modal visible={!!plugin} animationType="slide" presentationStyle="pageSheet" onRequestClose={onDismiss}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onDismiss} activeOpacity={0.78}>
            <Text style={styles.back}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>Connect {plugin.name}</Text>
          <View style={styles.headerSpacer} />
        </View>

        {!needsConnector ? (
          <View style={styles.noSetup}>
            <Text style={styles.noSetupText}>No setup required for {plugin.name}.</Text>
            <TouchableOpacity style={styles.saveBtn} onPress={onDismiss} activeOpacity={0.8}>
              <Text style={styles.saveBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        ) : plugin.connectorType === 'oauth2' ? (
          <View style={styles.noSetup}>
            <Text style={styles.noSetupText}>
              {status === 'success'
                ? `Connected${connectedName ? ` as ${connectedName}` : ''}.`
                : `Connect your ${plugin.name} account.`}
            </Text>
            {status === 'error' ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
            <TouchableOpacity
              style={[styles.saveBtn, status === 'saving' && styles.saveBtnDisabled]}
              onPress={handleOAuthConnect}
              disabled={status === 'saving'}
              activeOpacity={0.8}
            >
              {status === 'saving' ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.saveBtnText}>{status === 'success' ? 'Reconnect' : 'Connect Account'}</Text>
              )}
            </TouchableOpacity>
            {status === 'success' ? (
              <TouchableOpacity style={styles.secondaryBtn} onPress={handleDisconnect} activeOpacity={0.8}>
                <Text style={styles.secondaryBtnText}>Disconnect</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : plugin.connectorType === 'local-websocket' ? (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
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
              Enter the WebSocket host, port, and optional password for {plugin.name}.
            </Text>
          </KeyboardAvoidingView>
        ) : (
          <View style={styles.noSetup}>
            <Text style={styles.noSetupText}>
              Connector type "{plugin.connectorType}" is not yet supported in this version.
            </Text>
            <TouchableOpacity style={styles.saveBtn} onPress={onDismiss} activeOpacity={0.8}>
              <Text style={styles.saveBtnText}>Back</Text>
            </TouchableOpacity>
          </View>
        )}
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
  secondaryBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  secondaryBtnText: { color: '#AAAACC', fontWeight: '800', fontSize: 15 },
  hint: { color: '#6B6B8A', fontSize: 12, lineHeight: 18, paddingHorizontal: 20 },
  noSetup: { flex: 1, padding: 20, justifyContent: 'flex-start' },
  noSetupText: { color: '#AAAACC', fontSize: 15, lineHeight: 22, marginTop: 8 },
});
