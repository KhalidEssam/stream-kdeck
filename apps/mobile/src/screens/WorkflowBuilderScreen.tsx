import React, { useState, useCallback } from 'react';
import {
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
} from 'react-native';
import { TileConfig, WorkflowStep, WorkflowStepAction } from '../types/schema';

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
  }
}

const DELAY_OPTIONS = [0, 500, 1000, 1500, 2000, 3000, 5000, 10000];

// ── Props ─────────────────────────────────────────────────────────────────────

export interface WorkflowBuilderScreenProps {
  initialSteps?: WorkflowStep[];
  initialLabel?: string;
  onSave: (tile: Omit<TileConfig, 'id'>) => void;
  onDismiss: () => void;
}

// ── WorkflowBuilderScreen ─────────────────────────────────────────────────────

export function WorkflowBuilderScreen({
  initialSteps = [],
  initialLabel = '',
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

  const handleAddStep = (action: WorkflowStepAction) => {
    const step: WorkflowStep = {
      id: uuid(),
      action,
      delayBefore: 0,
      label: makeStepLabel(action),
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

type PickerTab = 'apps' | 'url' | 'keys' | 'clipboard';

const PICKER_APPS: { label: string; appId: string }[] = [
  { label: 'VS Code',       appId: 'vscode' },
  { label: 'Chrome',        appId: 'chrome' },
  { label: 'Spotify',       appId: 'spotify' },
  { label: 'Discord',       appId: 'discord' },
  { label: 'Slack',         appId: 'slack' },
  { label: 'OBS Studio',    appId: 'obs' },
  { label: 'Notion',        appId: 'notion' },
  { label: 'WhatsApp',      appId: 'whatsapp' },
  { label: 'Steam',         appId: 'steam' },
  { label: 'File Explorer', appId: 'explorer' },
  { label: 'Terminal',      appId: 'terminal' },
  { label: 'PowerShell',    appId: 'powershell' },
  { label: 'Figma',         appId: 'figma' },
  { label: 'Claude',        appId: 'claude' },
  { label: 'GitHub',        appId: 'github' },
  { label: 'Postman',       appId: 'postman' },
];

const PICKER_MODS = ['ctrl', 'alt', 'shift', 'win'] as const;
type PickerMod = (typeof PICKER_MODS)[number];

function StepPickerSheet({
  onSelect,
  onDismiss,
}: {
  onSelect: (action: WorkflowStepAction) => void;
  onDismiss: () => void;
}) {
  const [tab, setTab] = useState<PickerTab>('apps');
  const [url, setUrl] = useState('');
  const [clipText, setClipText] = useState('');
  const [key, setKey] = useState('');
  const [mods, setMods] = useState<Set<PickerMod>>(new Set());

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
        {(['apps', 'url', 'keys', 'clipboard'] as PickerTab[]).map(t => (
          <TouchableOpacity
            key={t}
            style={[pickerStyles.tab, tab === t && pickerStyles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[pickerStyles.tabText, tab === t && pickerStyles.tabTextActive]}>
              {t === 'apps' ? 'Apps' : t === 'url' ? 'URL' : t === 'keys' ? 'Keys' : 'Clipboard'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={pickerStyles.content} keyboardShouldPersistTaps="handled">
        {tab === 'apps' && (
          <View style={pickerStyles.appGrid}>
            {PICKER_APPS.map(app => (
              <TouchableOpacity
                key={app.appId}
                style={pickerStyles.appChip}
                onPress={() => onSelect({ kind: 'APP_LAUNCH', appId: app.appId })}
              >
                <Text style={pickerStyles.appChipText}>{app.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
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
    gap: 8,
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
  tabText: { color: '#6B6B8A', fontSize: 13, fontWeight: '600' },
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
