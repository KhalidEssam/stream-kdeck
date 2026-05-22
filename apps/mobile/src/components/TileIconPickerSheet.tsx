import React, { useMemo, useState } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppTile } from './AppTile';
import type { TileConfig, TileIconOverride } from '../types/schema';

const ICON_PRESETS = [
  '✦',
  '⚡',
  '▶',
  '●',
  '◆',
  '△',
  '♪',
  '⌘',
  '</>',
  '#',
  'AI',
  'OBS',
  '🎙️',
  '🎬',
  '📋',
  '🧠',
  '🎮',
  '💡',
];

interface TileIconPickerSheetProps {
  tile: TileConfig;
  onSave: (customIcon?: TileIconOverride) => void;
  onDismiss: () => void;
}

function isImageUri(value: string): boolean {
  return /^https?:\/\/\S{3,4096}$/i.test(value) ||
    /^data:image\/(png|jpeg|jpg|webp|gif);base64,[a-z0-9+/=]{16,200000}$/i.test(value);
}

function iconKind(value: string): 'emoji' | 'glyph' {
  return /[^\x00-\x7F]/.test(value) ? 'emoji' : 'glyph';
}

function buildGlyphIcon(value: string): TileIconOverride | undefined {
  const next = value.trim().slice(0, 8);
  return next ? { kind: iconKind(next), value: next } : undefined;
}

export function TileIconPickerSheet({ tile, onSave, onDismiss }: TileIconPickerSheetProps) {
  const initialMode = tile.customIcon?.kind === 'image' ? 'image' : 'glyph';
  const [mode, setMode] = useState<'glyph' | 'image'>(initialMode);
  const [glyph, setGlyph] = useState(
    tile.customIcon?.kind === 'glyph' || tile.customIcon?.kind === 'emoji'
      ? tile.customIcon.value
      : '',
  );
  const [imageUri, setImageUri] = useState(tile.customIcon?.kind === 'image' ? tile.customIcon.uri : '');
  const [imagePreviewFailed, setImagePreviewFailed] = useState(false);

  const resolvedIcon = useMemo<TileIconOverride | undefined>(() => {
    if (mode === 'image') {
      const uri = imageUri.trim();
      return isImageUri(uri) ? { kind: 'image', uri } : undefined;
    }

    return buildGlyphIcon(glyph);
  }, [glyph, imageUri, mode]);

  const previewTile: TileConfig = {
    ...tile,
    customIcon: resolvedIcon ?? tile.customIcon,
  };
  const imageInvalid = mode === 'image' && imageUri.trim().length > 0 && !resolvedIcon;
  const saveDisabled = !resolvedIcon;

  const handlePreset = (value: string) => {
    setMode('glyph');
    setGlyph(value);
  };

  const handleSave = () => {
    if (!resolvedIcon) return;
    onSave(resolvedIcon);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onDismiss} style={styles.headerButton} activeOpacity={0.75}>
          <Text style={styles.headerButtonText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Tile Icon</Text>
        <TouchableOpacity
          onPress={handleSave}
          style={[styles.saveButton, saveDisabled && styles.saveButtonDisabled]}
          activeOpacity={0.75}
          disabled={saveDisabled}
        >
          <Text style={styles.saveButtonText}>Save</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.previewRow}>
          <View style={styles.previewTile}>
            <AppTile
              tile={previewTile}
              creditsRemaining={tile.kind === 'ai' ? undefined : 0}
              onTap={() => undefined}
              density="regular"
            />
          </View>
          <View style={styles.previewText}>
            <Text style={styles.previewTitle} numberOfLines={1}>{tile.label}</Text>
            <Text style={styles.previewBody}>Pick something recognizable at a glance.</Text>
          </View>
        </View>

        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[styles.modeButton, mode === 'glyph' && styles.modeButtonActive]}
            onPress={() => setMode('glyph')}
            activeOpacity={0.75}
          >
            <Text style={[styles.modeButtonText, mode === 'glyph' && styles.modeButtonTextActive]}>Glyph</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeButton, mode === 'image' && styles.modeButtonActive]}
            onPress={() => setMode('image')}
            activeOpacity={0.75}
          >
            <Text style={[styles.modeButtonText, mode === 'image' && styles.modeButtonTextActive]}>Image URL</Text>
          </TouchableOpacity>
        </View>

        {mode === 'glyph' ? (
          <>
            <Text style={styles.sectionLabel}>Presets</Text>
            <View style={styles.presetGrid}>
              {ICON_PRESETS.map((preset) => (
                <TouchableOpacity
                  key={preset}
                  style={[styles.presetButton, glyph === preset && styles.presetButtonActive]}
                  onPress={() => handlePreset(preset)}
                  activeOpacity={0.75}
                >
                  <Text style={styles.presetText}>{preset}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionLabel}>Custom glyph or emoji</Text>
            <TextInput
              style={styles.input}
              value={glyph}
              onChangeText={(value) => setGlyph(value.slice(0, 8))}
              placeholder="e.g. 🎥, OBS, ✦"
              placeholderTextColor="#6B6B8A"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </>
        ) : (
          <>
            <Text style={styles.sectionLabel}>Image URL</Text>
            <TextInput
              style={styles.input}
              value={imageUri}
              onChangeText={(value) => {
                setImageUri(value);
                setImagePreviewFailed(false);
              }}
              placeholder="https://example.com/icon.png"
              placeholderTextColor="#6B6B8A"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            {imageInvalid ? <Text style={styles.errorText}>Use an http(s) URL or a data:image URI.</Text> : null}
            {resolvedIcon?.kind === 'image' && !imagePreviewFailed ? (
              <View style={styles.imagePreviewRow}>
                <Image
                  source={{ uri: resolvedIcon.uri }}
                  style={styles.imagePreview}
                  onError={() => setImagePreviewFailed(true)}
                />
                <Text style={styles.imagePreviewText}>Image preview</Text>
              </View>
            ) : null}
          </>
        )}

        <TouchableOpacity style={styles.resetButton} onPress={() => onSave(undefined)} activeOpacity={0.75}>
          <Text style={styles.resetButtonText}>Use Default Icon</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F14' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  headerButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#1A1A2E',
  },
  headerButtonText: { color: '#AAAACC', fontSize: 13, fontWeight: '700' },
  title: { flex: 1, color: '#FFFFFF', fontSize: 17, fontWeight: '800', textAlign: 'center' },
  saveButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#5B4FE8',
  },
  saveButtonDisabled: { opacity: 0.42 },
  saveButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  content: { padding: 16, gap: 14 },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#151525',
  },
  previewTile: { width: 92, height: 92 },
  previewText: { flex: 1, minWidth: 0, gap: 4 },
  previewTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  previewBody: { color: '#8A8AAA', fontSize: 12, lineHeight: 17 },
  modeRow: { flexDirection: 'row', gap: 8 },
  modeButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 9,
    alignItems: 'center',
    backgroundColor: '#1A1A2E',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  modeButtonActive: { backgroundColor: '#5B4FE8', borderColor: '#7A70FF' },
  modeButtonText: { color: '#8A8AAA', fontSize: 13, fontWeight: '800' },
  modeButtonTextActive: { color: '#FFFFFF' },
  sectionLabel: {
    color: '#AAAACC',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginTop: 4,
  },
  presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  presetButton: {
    width: 54,
    height: 46,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A1A2E',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  presetButtonActive: {
    backgroundColor: '#24214A',
    borderColor: '#6D5DFC',
  },
  presetText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  input: {
    minHeight: 46,
    borderRadius: 10,
    paddingHorizontal: 13,
    color: '#FFFFFF',
    fontSize: 15,
    backgroundColor: '#1A1A2E',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  errorText: { color: '#FF8A8A', fontSize: 12, lineHeight: 17 },
  imagePreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#151525',
  },
  imagePreview: { width: 42, height: 42, borderRadius: 8 },
  imagePreviewText: { color: '#AAAACC', fontSize: 12, fontWeight: '700' },
  resetButton: {
    marginTop: 4,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3A3A5C',
  },
  resetButtonText: { color: '#AAAACC', fontSize: 13, fontWeight: '800' },
});
