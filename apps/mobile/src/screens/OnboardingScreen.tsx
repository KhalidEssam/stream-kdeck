import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { Pack, PackTool, TileConfig } from '../types/schema';

interface Props {
  packs: Pack[];
  onComplete: (selectedTools: Omit<TileConfig, 'id'>[]) => void;
  onSkip: () => void;
}

export function OnboardingScreen({ packs, onComplete, onSkip }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [chosenPackId, setChosenPackId] = useState<string | null>(null);
  const [deselected, setDeselected] = useState<Set<string>>(new Set());

  const chosenPack = packs.find((p) => p.id === chosenPackId) ?? null;

  const handlePackSelect = (packId: string) => {
    setChosenPackId(packId);
    setDeselected(new Set());
  };

  const handleNext = () => {
    if (chosenPackId) setStep(2);
  };

  const toggleDeselect = (toolId: string) => {
    setDeselected((prev) => {
      const next = new Set(prev);
      if (next.has(toolId)) next.delete(toolId);
      else next.add(toolId);
      return next;
    });
  };

  const handleStart = () => {
    if (!chosenPack) return;
    const selectedTools: Omit<TileConfig, 'id'>[] = chosenPack.tools
      .filter((t) => !deselected.has(t.id) && t.kind === 'ai')
      .map((tool: PackTool) => {
        if (tool.kind !== 'ai') throw new Error('Expected ai tool');
        return {
          kind: 'ai' as const,
          label: tool.label,
          iconId: tool.icon ?? 'ai',
          color: tool.color,
          action: {
            kind: 'AI_CLIPBOARD' as const,
            toolId: tool.id,
            prompt: '',
            outputMode: tool.outputMode,
          },
        };
      });
    onComplete(selectedTools);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />

      {step === 1 && (
        <>
          <View style={styles.header}>
            <Text style={styles.title}>What best describes you?</Text>
            <Text style={styles.subtitle}>We'll pick your starter AI tools.</Text>
          </View>
          <ScrollView contentContainerStyle={styles.packGrid}>
            {packs.map((pack) => (
              <TouchableOpacity
                key={pack.id}
                style={[styles.packCard, chosenPackId === pack.id && styles.packCardSelected]}
                onPress={() => handlePackSelect(pack.id)}
              >
                <Text style={styles.packCardIcon}>{pack.icon}</Text>
                <Text style={styles.packCardName}>{pack.name}</Text>
                <Text style={styles.packCardDesc} numberOfLines={2}>{pack.description}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.primaryBtn, !chosenPackId && styles.primaryBtnDisabled]}
              onPress={handleNext}
              disabled={!chosenPackId}
            >
              <Text style={styles.primaryBtnText}>Next →</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onSkip} style={styles.skipBtn}>
              <Text style={styles.skipText}>Skip for now</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {step === 2 && chosenPack && (
        <>
          <View style={styles.header}>
            <Text style={styles.title}>{chosenPack.icon} {chosenPack.name} tools</Text>
            <Text style={styles.subtitle}>All selected — deselect any you don't want.</Text>
          </View>
          <ScrollView contentContainerStyle={styles.toolList}>
            {chosenPack.tools.map((tool: PackTool) => {
              const selected = !deselected.has(tool.id);
              return (
                <TouchableOpacity
                  key={tool.id}
                  style={[styles.toolRow, selected && styles.toolRowSelected]}
                  onPress={() => toggleDeselect(tool.id)}
                >
                  <View style={styles.toolInfo}>
                    <Text style={styles.toolLabel}>{tool.label}</Text>
                    <Text style={styles.toolMode}>{tool.outputMode}</Text>
                  </View>
                  <View style={[styles.checkBox, selected && styles.checkBoxSelected]}>
                    {selected && <Text style={styles.checkMark}>✓</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <View style={styles.footer}>
            <TouchableOpacity style={styles.primaryBtn} onPress={handleStart}>
              <Text style={styles.primaryBtnText}>Start with these tools</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F14' },
  header: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 20 },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '700', marginBottom: 6 },
  subtitle: { color: '#9898B0', fontSize: 14 },
  packGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 16, gap: 12, paddingBottom: 24,
  },
  packCard: {
    width: '46%', backgroundColor: '#1A1A2E',
    borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#2A2A45',
  },
  packCardSelected: { borderColor: '#6C63FF', backgroundColor: '#1E1A3A' },
  packCardIcon: { fontSize: 28, marginBottom: 8 },
  packCardName: { color: '#FFFFFF', fontSize: 15, fontWeight: '600', marginBottom: 4 },
  packCardDesc: { color: '#6B6B8A', fontSize: 12, lineHeight: 17 },
  footer: { padding: 24, gap: 12 },
  primaryBtn: {
    backgroundColor: '#6C63FF', borderRadius: 12,
    paddingVertical: 16, alignItems: 'center',
  },
  primaryBtnDisabled: { backgroundColor: '#2A2A45' },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  skipBtn: { alignItems: 'center', paddingVertical: 8 },
  skipText: { color: '#6B6B8A', fontSize: 14 },
  toolList: { paddingHorizontal: 16, paddingBottom: 24 },
  toolRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 16,
    backgroundColor: '#1A1A2E', borderRadius: 10, marginBottom: 8,
    borderWidth: 1, borderColor: '#2A2A45',
  },
  toolRowSelected: { borderColor: '#6C63FF', backgroundColor: '#1E1A3A' },
  toolInfo: { flex: 1, gap: 3 },
  toolLabel: { color: '#FFFFFF', fontSize: 15, fontWeight: '500' },
  toolMode: { color: '#6B6B8A', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  checkBox: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, borderColor: '#3A3A55', alignItems: 'center', justifyContent: 'center',
  },
  checkBoxSelected: { backgroundColor: '#6C63FF', borderColor: '#6C63FF' },
  checkMark: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});
