import React, { useEffect, useState } from 'react';
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ContextProfileSummary,
  ContextShortcut,
  ContextShortcutsMessage,
} from '../types/schema';
import { WebSocketService } from '../services/websocket.service';

interface Props {
  ws: WebSocketService;
  onDismiss: () => void;
}

const MODIFIERS = ['Ctrl', 'Shift', 'Alt', 'Meta'];

export function ContextShortcutsScreen({ ws, onDismiss }: Props) {
  const [profiles, setProfiles] = useState<ContextProfileSummary[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<ContextShortcutsMessage | null>(null);
  const [showAddApp, setShowAddApp] = useState(false);
  const [showAddShortcut, setShowAddShortcut] = useState(false);

  // Add-app form state
  const [newAppLabel, setNewAppLabel] = useState('');
  const [newProcessName, setNewProcessName] = useState('');
  const [newShortcutLabel, setNewShortcutLabel] = useState('');
  const [newShortcutKeys, setNewShortcutKeys] = useState<string[]>([]);
  const [newKeyInput, setNewKeyInput] = useState('');

  // Add-shortcut form state
  const [addLabel, setAddLabel] = useState('');
  const [addKeys, setAddKeys] = useState<string[]>([]);
  const [addKeyInput, setAddKeyInput] = useState('');

  useEffect(() => {
    const unsub = ws.onContextProfiles((msg) => {
      setProfiles(msg.profiles);
    });
    ws.requestContextProfiles();
    return unsub;
  }, [ws]);

  function closeAddShortcutForm() {
    setAddLabel('');
    setAddKeys([]);
    setAddKeyInput('');
    setShowAddShortcut(false);
  }

  function closeSelectedProfile() {
    closeAddShortcutForm();
    setSelectedProfile(null);
  }

  const handleSelectProfile = (summary: ContextProfileSummary) => {
    closeAddShortcutForm();
    setSelectedProfile({
      type:        'CONTEXT_SHORTCUTS',
      processName: summary.processName,
      appLabel:    summary.appLabel,
      iconId:      summary.iconId,
      shortcuts:   summary.shortcuts,
    });
  };

  const handleRemoveShortcut = (shortcutId: string) => {
    if (!selectedProfile) return;
    ws.removeContextShortcut(selectedProfile.processName, shortcutId);
    // Refresh profiles to get updated shortcut list
    const unsub = ws.onContextProfiles((msg) => {
      const updated = msg.profiles.find((p) => p.processName === selectedProfile.processName);
      if (updated) {
        setSelectedProfile({
          type:        'CONTEXT_SHORTCUTS',
          processName: updated.processName,
          appLabel:    updated.appLabel,
          iconId:      updated.iconId,
          shortcuts:   updated.shortcuts,
        });
      }
      setProfiles(msg.profiles);
      unsub();
    });
    ws.requestContextProfiles();
  };

  const handleAddShortcut = () => {
    if (!selectedProfile || !addLabel.trim() || addKeys.length === 0) return;
    ws.addContextShortcut(selectedProfile.processName, selectedProfile.appLabel, selectedProfile.iconId, {
      label: addLabel.trim(),
      keys: addKeys,
      description: '',
    });
    closeAddShortcutForm();
    // Refresh to show new shortcut
    const unsub = ws.onContextProfiles((msg) => {
      const updated = msg.profiles.find((p) => p.processName === selectedProfile.processName);
      if (updated) {
        setSelectedProfile({
          type:        'CONTEXT_SHORTCUTS',
          processName: updated.processName,
          appLabel:    updated.appLabel,
          iconId:      updated.iconId,
          shortcuts:   updated.shortcuts,
        });
      }
      setProfiles(msg.profiles);
      unsub();
    });
    ws.requestContextProfiles();
  };

  const handleAddApp = () => {
    if (!newAppLabel.trim() || !newProcessName.trim() || !newShortcutLabel.trim() || newShortcutKeys.length === 0) return;
    ws.addContextShortcut(newProcessName.trim(), newAppLabel.trim(), 'custom', {
      label: newShortcutLabel.trim(),
      keys: newShortcutKeys,
      description: '',
    });
    setNewAppLabel('');
    setNewProcessName('');
    setNewShortcutLabel('');
    setNewShortcutKeys([]);
    setShowAddApp(false);
    ws.requestContextProfiles();
  };

  const toggleModifier = (mod: string, keys: string[], setKeys: (k: string[]) => void) => {
    setKeys(keys.includes(mod) ? keys.filter((k) => k !== mod) : [...keys, mod]);
  };

  const renderProfile = ({ item }: { item: ContextProfileSummary }) => (
    <TouchableOpacity style={styles.row} onPress={() => handleSelectProfile(item)} activeOpacity={0.75}>
      <View style={styles.rowIcon}>
        <Text style={styles.rowIconText}>{item.appLabel[0]}</Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowLabel}>{item.appLabel}</Text>
        <Text style={styles.rowSub}>{item.shortcutCount} shortcuts · {item.source === 'user' ? 'Manual' : 'AI'}</Text>
      </View>
      <Text style={styles.rowChevron}>›</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onDismiss}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Context Shortcuts</Text>
      </View>

      <FlatList
        data={profiles}
        keyExtractor={(item) => item.processName}
        renderItem={renderProfile}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No profiles yet. Focus a known app to auto-generate shortcuts.</Text>}
        ListFooterComponent={
          <TouchableOpacity style={styles.addAppRow} onPress={() => setShowAddApp(true)} activeOpacity={0.75}>
            <Text style={styles.addAppText}>+ Add app manually</Text>
          </TouchableOpacity>
        }
      />

      {/* Profile detail modal */}
      <Modal visible={selectedProfile !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeSelectedProfile}>
        {selectedProfile && (
          <SafeAreaView style={styles.container}>
            <View style={styles.header}>
              <TouchableOpacity onPress={closeSelectedProfile}>
                <Text style={styles.back}>←</Text>
              </TouchableOpacity>
              <Text style={styles.title}>{selectedProfile.appLabel}</Text>
            </View>
            <FlatList
              data={selectedProfile.shortcuts}
              keyExtractor={(s) => s.id}
              contentContainerStyle={styles.list}
              renderItem={({ item }: { item: ContextShortcut }) => (
                <View style={styles.shortcutRow}>
                  <View style={styles.shortcutBody}>
                    <Text style={styles.shortcutLabel}>{item.label}</Text>
                    <Text style={styles.shortcutKeys}>{item.keys.join(' + ')}</Text>
                  </View>
                  <TouchableOpacity onPress={() => handleRemoveShortcut(item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.deleteBtn}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}
              ListFooterComponent={
                <TouchableOpacity style={styles.addAppRow} onPress={() => setShowAddShortcut(true)} activeOpacity={0.75}>
                  <Text style={styles.addAppText}>+ Add shortcut</Text>
                </TouchableOpacity>
              }
            />
            {showAddShortcut && (
              <View style={styles.inlineFormBackdrop}>
                <View style={styles.formSheet}>
                  <Text style={styles.formTitle}>Add Shortcut</Text>
                  <TextInput style={styles.formInput} value={addLabel} onChangeText={setAddLabel} placeholder="Label" placeholderTextColor="#555" />
                  <View style={styles.modifierRow}>
                    {MODIFIERS.map((mod) => (
                      <TouchableOpacity key={mod} style={[styles.chip, addKeys.includes(mod) && styles.chipActive]} onPress={() => toggleModifier(mod, addKeys, setAddKeys)}>
                        <Text style={[styles.chipText, addKeys.includes(mod) && styles.chipTextActive]}>{mod}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TextInput style={styles.formInput} value={addKeyInput} onChangeText={setAddKeyInput} onSubmitEditing={() => { if (addKeyInput.trim()) { setAddKeys((k) => [...k, addKeyInput.trim()]); setAddKeyInput(''); } }} placeholder="Key (press return to add)" placeholderTextColor="#555" autoCapitalize="none" />
                  {addKeys.length > 0 && <Text style={styles.preview}>{addKeys.join(' + ')}</Text>}
                  <TouchableOpacity style={styles.saveButton} onPress={handleAddShortcut}><Text style={styles.saveText}>Save</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.cancelBtn} onPress={closeAddShortcutForm}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
                </View>
              </View>
            )}
          </SafeAreaView>
        )}
      </Modal>

      {/* Add app modal */}
      <Modal visible={showAddApp} transparent animationType="slide" onRequestClose={() => setShowAddApp(false)}>
        <View style={styles.formBackdrop}>
          <View style={styles.formSheet}>
            <Text style={styles.formTitle}>Add App Manually</Text>
            <TextInput style={styles.formInput} value={newAppLabel} onChangeText={setNewAppLabel} placeholder="App name (e.g. Photoshop)" placeholderTextColor="#555" />
            <TextInput style={styles.formInput} value={newProcessName} onChangeText={setNewProcessName} placeholder="Process name (e.g. Photoshop.exe)" placeholderTextColor="#555" autoCapitalize="none" />
            <Text style={styles.hint}>Find the process name in Task Manager → Details tab</Text>
            <TextInput style={styles.formInput} value={newShortcutLabel} onChangeText={setNewShortcutLabel} placeholder="First shortcut label" placeholderTextColor="#555" />
            <View style={styles.modifierRow}>
              {MODIFIERS.map((mod) => (
                <TouchableOpacity key={mod} style={[styles.chip, newShortcutKeys.includes(mod) && styles.chipActive]} onPress={() => toggleModifier(mod, newShortcutKeys, setNewShortcutKeys)}>
                  <Text style={[styles.chipText, newShortcutKeys.includes(mod) && styles.chipTextActive]}>{mod}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={styles.formInput} value={newKeyInput} onChangeText={setNewKeyInput} onSubmitEditing={() => { if (newKeyInput.trim()) { setNewShortcutKeys((k) => [...k, newKeyInput.trim()]); setNewKeyInput(''); } }} placeholder="Key" placeholderTextColor="#555" autoCapitalize="none" />
            {newShortcutKeys.length > 0 && <Text style={styles.preview}>{newShortcutKeys.join(' + ')}</Text>}
            <TouchableOpacity style={styles.saveButton} onPress={handleAddApp}><Text style={styles.saveText}>Add App</Text></TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAddApp(false)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#0F0F14' },
  header:       { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  back:         { color: '#5B4FE8', fontSize: 20 },
  title:        { color: '#FFFFFF', fontSize: 18, fontWeight: '700', flex: 1 },
  list:         { padding: 12 },
  row: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: '#1A1A2E',
    borderRadius:    10,
    padding:         12,
    marginBottom:    8,
    gap:             12,
  },
  rowIcon: {
    width:           36,
    height:          36,
    borderRadius:    8,
    backgroundColor: '#5B4FE8',
    alignItems:      'center',
    justifyContent:  'center',
  },
  rowIconText:  { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  rowBody:      { flex: 1 },
  rowLabel:     { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  rowSub:       { color: '#6B6B8A', fontSize: 12, marginTop: 2 },
  rowChevron:   { color: '#4A4A6A', fontSize: 18 },
  addAppRow:    { padding: 16, alignItems: 'center' },
  addAppText:   { color: '#5B4FE8', fontSize: 14, fontWeight: '600' },
  empty:        { color: '#6B6B8A', fontSize: 13, textAlign: 'center', padding: 24 },
  shortcutRow:  { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A2E', borderRadius: 10, padding: 12, marginBottom: 8 },
  shortcutBody: { flex: 1 },
  shortcutLabel: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  shortcutKeys:  { color: '#5B4FE8', fontSize: 11, marginTop: 2 },
  deleteBtn:    { color: '#6B6B8A', fontSize: 14, padding: 4 },
  formBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  inlineFormBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end', zIndex: 1, elevation: 1 },
  formSheet:    { backgroundColor: '#1A1A2E', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  formTitle:    { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginBottom: 16 },
  formInput:    { backgroundColor: '#0F0F1E', borderRadius: 8, padding: 12, color: '#FFFFFF', fontSize: 14, borderWidth: 1, borderColor: '#2A2A4A', marginBottom: 10 },
  hint:         { color: '#6B6B8A', fontSize: 11, marginBottom: 10 },
  modifierRow:  { flexDirection: 'row', gap: 8, marginBottom: 10 },
  chip:         { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#0F0F1E', borderWidth: 1, borderColor: '#2A2A4A' },
  chipActive:   { backgroundColor: '#5B4FE8', borderColor: '#5B4FE8' },
  chipText:     { color: '#8888AA', fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: '#FFFFFF' },
  preview:      { color: '#5B4FE8', fontSize: 12, marginBottom: 8 },
  saveButton:   { backgroundColor: '#5B4FE8', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  saveText:     { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  cancelBtn:    { alignItems: 'center', paddingVertical: 12 },
  cancelText:   { color: '#6B6B8A', fontSize: 14 },
});
