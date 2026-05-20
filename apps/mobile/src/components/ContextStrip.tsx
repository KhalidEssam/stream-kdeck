import React, { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ContextShortcut, ContextShortcutsMessage, TileConfig } from '../types/schema';

type StripTab = 'global' | 'app';

interface Props {
  msg: ContextShortcutsMessage | null;
  globalTiles: TileConfig[];
  onTapShortcut: (shortcut: ContextShortcut) => void;
  onTapGlobalTile: (tile: TileConfig) => void;
  onAddShortcut: (shortcut: Omit<ContextShortcut, 'id'>) => void;
  onAddGlobal: () => void;
}

const STRIP_HEIGHT = 120;
const MODIFIERS = ['Ctrl', 'Shift', 'Alt', 'Meta'];

export function ContextStrip({
  msg,
  globalTiles,
  onTapShortcut,
  onTapGlobalTile,
  onAddShortcut,
  onAddGlobal,
}: Props) {
  const [activeTab, setActiveTab] = useState<StripTab>('global');
  const [showAddForm, setShowAddForm] = useState(false);
  const [addLabel, setAddLabel] = useState('');
  const [addKeys, setAddKeys] = useState<string[]>([]);
  const [addKeyInput, setAddKeyInput] = useState('');

  const hasAppShortcuts = !!(msg && msg.shortcuts.length > 0);

  // Auto-switch when focused app changes
  useEffect(() => {
    if (hasAppShortcuts) {
      setActiveTab('app');
    } else {
      setActiveTab('global');
    }
  }, [msg?.processName]);

  // If the app context clears, fall back to global
  useEffect(() => {
    if (!hasAppShortcuts && activeTab === 'app') {
      setActiveTab('global');
    }
  }, [hasAppShortcuts]);

  const handleSaveShortcut = () => {
    if (!addLabel.trim() || addKeys.length === 0) return;
    onAddShortcut({ label: addLabel.trim(), keys: addKeys, description: '' });
    setAddLabel('');
    setAddKeys([]);
    setAddKeyInput('');
    setShowAddForm(false);
  };

  const toggleModifier = (mod: string) => {
    setAddKeys((prev) =>
      prev.includes(mod) ? prev.filter((k) => k !== mod) : [...prev, mod],
    );
  };

  const handleKeyInputSubmit = () => {
    const k = addKeyInput.trim();
    if (k && !addKeys.includes(k)) setAddKeys((prev) => [...prev, k]);
    setAddKeyInput('');
  };

  const appTabLabel = msg?.appLabel ?? 'App';

  const renderGlobalTile = ({ item }: { item: TileConfig }) => (
    <TouchableOpacity style={styles.tile} onPress={() => onTapGlobalTile(item)} activeOpacity={0.7}>
      <Text style={styles.tileKeys} numberOfLines={1}>
        {item.action.kind === 'KEYSTROKE'
          ? item.action.keys.map(k => k.charAt(0).toUpperCase() + k.slice(1)).join('+')
          : item.label}
      </Text>
      <Text style={styles.tileLabel} numberOfLines={2}>{item.label}</Text>
    </TouchableOpacity>
  );

  const renderAppShortcut = ({ item }: { item: ContextShortcut }) => (
    <TouchableOpacity style={styles.tile} onPress={() => onTapShortcut(item)} activeOpacity={0.7}>
      <Text style={styles.tileKeys}>{item.keys.join('+')}</Text>
      <Text style={styles.tileLabel} numberOfLines={2}>{item.label}</Text>
    </TouchableOpacity>
  );

  const addGlobalTile = (
    <TouchableOpacity style={[styles.tile, styles.addTile]} onPress={onAddGlobal} activeOpacity={0.7}>
      <Text style={styles.addTileIcon}>+</Text>
      <Text style={styles.tileLabel}>Add</Text>
    </TouchableOpacity>
  );

  const addAppTile = (
    <TouchableOpacity style={[styles.tile, styles.addTile]} onPress={() => setShowAddForm(true)} activeOpacity={0.7}>
      <Text style={styles.addTileIcon}>+</Text>
      <Text style={styles.tileLabel}>Add</Text>
    </TouchableOpacity>
  );

  return (
    <>
      <View style={styles.strip}>
        {/* Tab row */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'global' && styles.tabActive]}
            onPress={() => setActiveTab('global')}
            activeOpacity={0.75}
          >
            <Text style={[styles.tabText, activeTab === 'global' && styles.tabTextActive]}>
              Global
            </Text>
            {activeTab === 'global' && <View style={styles.tabIndicator} />}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === 'app' && styles.tabActive, !hasAppShortcuts && styles.tabDisabled]}
            onPress={() => hasAppShortcuts && setActiveTab('app')}
            activeOpacity={hasAppShortcuts ? 0.75 : 1}
          >
            <Text style={[styles.tabText, activeTab === 'app' && styles.tabTextActive, !hasAppShortcuts && styles.tabTextDisabled]}>
              {appTabLabel}
            </Text>
            {activeTab === 'app' && <View style={styles.tabIndicator} />}
          </TouchableOpacity>
        </View>

        {/* Content */}
        {activeTab === 'global' ? (
          <FlatList
            data={globalTiles}
            keyExtractor={(item) => item.id}
            renderItem={renderGlobalTile}
            horizontal
            showsHorizontalScrollIndicator={false}
            ListFooterComponent={addGlobalTile}
            contentContainerStyle={styles.list}
            fadingEdgeLength={32}
          />
        ) : (
          <FlatList
            data={msg?.shortcuts ?? []}
            keyExtractor={(item) => item.id}
            renderItem={renderAppShortcut}
            horizontal
            showsHorizontalScrollIndicator={false}
            ListFooterComponent={addAppTile}
            contentContainerStyle={styles.list}
            fadingEdgeLength={32}
          />
        )}
      </View>

      <Modal
        visible={showAddForm}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddForm(false)}
      >
        <View style={styles.formBackdrop}>
          <View style={styles.formSheet}>
            <Text style={styles.formTitle}>Add Shortcut for {msg?.appLabel}</Text>

            <Text style={styles.formLabel}>Label</Text>
            <TextInput
              style={styles.formInput}
              value={addLabel}
              onChangeText={setAddLabel}
              placeholder="e.g. Push to Talk"
              placeholderTextColor="#555"
            />

            <Text style={styles.formLabel}>Modifiers</Text>
            <View style={styles.modifierRow}>
              {MODIFIERS.map((mod) => (
                <TouchableOpacity
                  key={mod}
                  style={[styles.modifierChip, addKeys.includes(mod) && styles.modifierChipActive]}
                  onPress={() => toggleModifier(mod)}
                >
                  <Text style={[styles.modifierText, addKeys.includes(mod) && styles.modifierTextActive]}>
                    {mod}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.formLabel}>Key</Text>
            <TextInput
              style={styles.formInput}
              value={addKeyInput}
              onChangeText={setAddKeyInput}
              onSubmitEditing={handleKeyInputSubmit}
              placeholder="e.g. M  then press return"
              placeholderTextColor="#555"
              autoCapitalize="none"
            />
            {addKeys.length > 0 && (
              <Text style={styles.keysPreview}>{addKeys.join(' + ')}</Text>
            )}

            <TouchableOpacity style={styles.saveButton} onPress={handleSaveShortcut} activeOpacity={0.8}>
              <Text style={styles.saveButtonText}>Save Shortcut</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelButton} onPress={() => setShowAddForm(false)}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  strip: {
    position:        'absolute',
    bottom:          0,
    left:            0,
    right:           0,
    height:          STRIP_HEIGHT,
    backgroundColor: '#13132A',
    borderTopWidth:  1,
    borderTopColor:  'rgba(91,79,232,0.4)',
    paddingBottom:   8,
  },

  // Tab row
  tabRow: {
    flexDirection:     'row',
    paddingHorizontal: 12,
    paddingTop:        6,
    paddingBottom:     2,
    gap:               4,
  },
  tab: {
    paddingHorizontal: 10,
    paddingVertical:   4,
    position:          'relative',
  },
  tabActive: {},
  tabDisabled: { opacity: 0.35 },
  tabText: {
    color:      '#6B6B8A',
    fontSize:   11,
    fontWeight: '700',
  },
  tabTextActive:   { color: '#FFFFFF' },
  tabTextDisabled: { color: '#6B6B8A' },
  tabIndicator: {
    position:        'absolute',
    bottom:          0,
    left:            10,
    right:           10,
    height:          2,
    borderRadius:    1,
    backgroundColor: '#5B4FE8',
  },

  // Tiles
  list:  { paddingHorizontal: 10, gap: 6 },
  tile: {
    width:           72,
    backgroundColor: '#1E1E35',
    borderRadius:    10,
    alignItems:      'center',
    justifyContent:  'center',
    paddingHorizontal: 4,
    paddingVertical: 8,
    gap:             4,
    minHeight:       62,
  },
  addTile:     { borderWidth: 1, borderColor: '#2A2A4A', borderStyle: 'dashed' },
  addTileIcon: { color: '#4A4A7A', fontSize: 20 },
  tileKeys:    { color: '#5B4FE8', fontSize: 9, fontWeight: '700', textAlign: 'center' },
  tileLabel:   { color: '#CCCCEE', fontSize: 10, textAlign: 'center' },

  // Add-shortcut form
  formBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  formSheet: {
    backgroundColor:     '#1A1A2E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding:             24,
    paddingBottom:       40,
  },
  formTitle:    { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginBottom: 16 },
  formLabel:    { color: '#8888AA', fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 12 },
  formInput: {
    backgroundColor: '#0F0F1E',
    borderRadius:    8,
    padding:         12,
    color:           '#FFFFFF',
    fontSize:        14,
    borderWidth:     1,
    borderColor:     '#2A2A4A',
  },
  modifierRow:        { flexDirection: 'row', gap: 8 },
  modifierChip: {
    paddingHorizontal: 12,
    paddingVertical:   8,
    borderRadius:      8,
    backgroundColor:   '#0F0F1E',
    borderWidth:       1,
    borderColor:       '#2A2A4A',
  },
  modifierChipActive: { backgroundColor: '#5B4FE8', borderColor: '#5B4FE8' },
  modifierText:       { color: '#8888AA', fontSize: 13, fontWeight: '600' },
  modifierTextActive: { color: '#FFFFFF' },
  keysPreview:  { color: '#5B4FE8', fontSize: 12, marginTop: 6 },
  saveButton: {
    backgroundColor: '#5B4FE8',
    borderRadius:    10,
    paddingVertical: 14,
    alignItems:      'center',
    marginTop:       20,
  },
  saveButtonText:   { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  cancelButton:     { alignItems: 'center', paddingVertical: 12 },
  cancelButtonText: { color: '#6B6B8A', fontSize: 14 },
});
