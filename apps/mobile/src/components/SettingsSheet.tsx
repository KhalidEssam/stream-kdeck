import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TILE_LAYOUT_PRESETS } from './tileLayout';
import type { TileLayoutPresetId } from './tileLayout';

interface SettingsSheetProps {
  visible: boolean;
  onDismiss: () => void;
  connected: boolean;
  licensed: boolean | null;
  aiPro: boolean;
  creditsRemaining: number;
  creditQuota: number;
  onRevalidateLicense: () => void;
  onOpenActivationDialog: () => void;
  onNavigateToShortcuts: () => void;
  tileLayoutPresetId: TileLayoutPresetId;
  onTileLayoutChange: (presetId: TileLayoutPresetId) => void;
  onEnterRearrange: () => void;
}

export function SettingsSheet({
  visible,
  onDismiss,
  connected,
  licensed,
  aiPro,
  creditsRemaining,
  creditQuota,
  onRevalidateLicense,
  onOpenActivationDialog,
  onNavigateToShortcuts,
  tileLayoutPresetId,
  onTileLayoutChange,
  onEnterRearrange,
}: SettingsSheetProps) {
  const [revalidating, setRevalidating] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [activationSent, setActivationSent] = useState(false);
  const revalidatingRef = useRef(false);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revalidateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When licensed prop changes while we were revalidating, the LICENSE_STATUS arrived.
  useEffect(() => {
    if (!revalidatingRef.current) return;
    revalidatingRef.current = false;
    setRevalidating(false);
    if (revalidateTimer.current) clearTimeout(revalidateTimer.current);
    showFeedback(licensed !== false ? 'License confirmed.' : 'License invalid — check your key.');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [licensed]);

  // Reset transient state when sheet closes.
  useEffect(() => {
    if (!visible) {
      setRevalidating(false);
      setFeedback(null);
      setActivationSent(false);
      revalidatingRef.current = false;
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
      if (revalidateTimer.current) clearTimeout(revalidateTimer.current);
      if (activationTimer.current) clearTimeout(activationTimer.current);
    }
  }, [visible]);

  function showFeedback(msg: string) {
    setFeedback(msg);
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setFeedback(null), 3000);
  }

  function handleRevalidate() {
    setRevalidating(true);
    revalidatingRef.current = true;
    onRevalidateLicense();
    // Safety timeout — clear spinner if no LICENSE_STATUS arrives within 10s.
    revalidateTimer.current = setTimeout(() => {
      if (!revalidatingRef.current) return;
      revalidatingRef.current = false;
      setRevalidating(false);
      showFeedback('No response from agent.');
    }, 10000);
  }

  function handleOpenActivationDialog() {
    onOpenActivationDialog();
    setActivationSent(true);
    showFeedback('Opening activation dialog on desktop…');
    activationTimer.current = setTimeout(() => setActivationSent(false), 3000);
  }

  const notConnectedLabel = 'Not connected';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Settings</Text>
          <TouchableOpacity onPress={onDismiss} style={styles.closeButton} activeOpacity={0.7}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* License section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>LICENSE</Text>

          {/* Status badges */}
          <View style={styles.badgeRow}>
            <View style={[styles.badge, licensed ? styles.badgeGreen : styles.badgeGray]}>
              <Text style={styles.badgeText}>{licensed ? 'Licensed' : 'Unlicensed'}</Text>
            </View>
            {aiPro && (
              <View style={[styles.badge, styles.badgePurple]}>
                <Text style={styles.badgeText}>AI Pro</Text>
              </View>
            )}
            {creditQuota > 0 && (
              <Text style={styles.creditsText}>
                {creditsRemaining} / {creditQuota} credits
              </Text>
            )}
          </View>

          {/* Feedback message */}
          {feedback && <Text style={styles.feedbackText}>{feedback}</Text>}

          {/* Revalidate button */}
          <TouchableOpacity
            style={[styles.button, (!connected || revalidating) && styles.buttonDisabled]}
            onPress={handleRevalidate}
            activeOpacity={0.75}
            disabled={!connected || revalidating}
          >
            {revalidating ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>
                {connected ? 'Revalidate License' : notConnectedLabel}
              </Text>
            )}
          </TouchableOpacity>

          {/* Enter new key button */}
          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary, (!connected || activationSent) && styles.buttonDisabled]}
            onPress={handleOpenActivationDialog}
            activeOpacity={0.75}
            disabled={!connected || activationSent}
          >
            <Text style={[styles.buttonText, styles.buttonTextSecondary]}>
              {connected ? 'Enter New License Key' : notConnectedLabel}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Deck layout section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DECK LAYOUT</Text>
          <View style={styles.layoutGrid}>
            {TILE_LAYOUT_PRESETS.map((preset) => {
              const active = tileLayoutPresetId === preset.id;
              return (
                <TouchableOpacity
                  key={preset.id}
                  style={[styles.layoutOption, active && styles.layoutOptionActive]}
                  onPress={() => onTileLayoutChange(preset.id)}
                  activeOpacity={0.78}
                >
                  <View style={[
                    styles.layoutPreview,
                    { aspectRatio: preset.aspectRatio },
                    active && styles.layoutPreviewActive,
                  ]}>
                    <View style={styles.previewGlyph} />
                    <View style={[styles.previewLine, preset.density === 'dense' && styles.previewLineDense]} />
                  </View>
                  <View style={styles.layoutOptionText}>
                    <Text style={[styles.layoutLabel, active && styles.layoutLabelActive]}>{preset.label}</Text>
                    <Text style={styles.layoutSummary}>{preset.summary}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity
            style={styles.navRow}
            onPress={onEnterRearrange}
            activeOpacity={0.7}
          >
            <Text style={styles.navRowText}>Rearrange Tiles</Text>
            <Text style={styles.navRowArrow}>→</Text>
          </TouchableOpacity>
        </View>

        {/* Shortcuts section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SHORTCUTS</Text>
          <TouchableOpacity
            style={styles.navRow}
            onPress={onNavigateToShortcuts}
            activeOpacity={0.7}
          >
            <Text style={styles.navRowText}>Context Shortcuts</Text>
            <Text style={styles.navRowArrow}>→</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F14',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E2E',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  closeButton: {
    padding: 4,
  },
  closeButtonText: {
    color: '#6B6B8A',
    fontSize: 18,
  },
  section: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 8,
  },
  sectionTitle: {
    color: '#6B6B8A',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeGreen: {
    backgroundColor: '#1A3A2A',
  },
  badgeGray: {
    backgroundColor: '#2A2A3A',
  },
  badgePurple: {
    backgroundColor: '#2A1A3A',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
  },
  creditsText: {
    color: '#6B6B8A',
    fontSize: 13,
  },
  feedbackText: {
    color: '#A0A0C0',
    fontSize: 13,
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#3B3B5C',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#3B3B5C',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
  },
  buttonTextSecondary: {
    color: '#A0A0C0',
  },
  layoutGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  layoutOption: {
    flexBasis: '48%',
    flexGrow: 1,
    minHeight: 78,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#151525',
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  layoutOptionActive: {
    borderColor: '#6D5DFC',
    backgroundColor: '#211F3E',
  },
  layoutPreview: {
    width: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#343456',
    backgroundColor: '#0F0F14',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: 5,
  },
  layoutPreviewActive: { borderColor: '#8A80FF' },
  previewGlyph: {
    width: 14,
    height: 14,
    borderRadius: 4,
    backgroundColor: '#6D5DFC',
  },
  previewLine: {
    width: '78%',
    height: 3,
    borderRadius: 2,
    backgroundColor: '#4F4F75',
  },
  previewLineDense: { width: '58%' },
  layoutOptionText: { flex: 1, minWidth: 0 },
  layoutLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  layoutLabelActive: { color: '#FFFFFF' },
  layoutSummary: {
    color: '#7E7E9E',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E2E',
  },
  navRowText: {
    color: '#FFFFFF',
    fontSize: 15,
  },
  navRowArrow: {
    color: '#6B6B8A',
    fontSize: 16,
  },
});
