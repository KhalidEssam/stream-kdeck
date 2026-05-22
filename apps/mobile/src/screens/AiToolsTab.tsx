import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Pack, PackTool, TileConfig } from '../types/schema';

interface Props {
  packs: Pack[];
  currentTiles: TileConfig[];
  onAdd: (tile: Omit<TileConfig, 'id'>) => void;
  onRemove: (tileId: string) => void;
}

export function AiToolsTab({ packs, currentTiles, onAdd, onRemove }: Props) {
  const [selectedPackId, setSelectedPackId] = useState<string | null>(
    packs.length > 0 ? packs[0].id : null,
  );

  const selectedTilesByToolId = useMemo<Map<string, string>>(() => {
    const map = new Map<string, string>();
    for (const tile of currentTiles) {
      if (tile.action.kind === 'AI_CLIPBOARD' && tile.action.toolId) {
        map.set(tile.action.toolId, tile.id);
      }
    }
    return map;
  }, [currentTiles]);

  const activePack = packs.find((p) => p.id === selectedPackId) ?? null;

  const handleToggle = (tool: PackTool) => {
    // command tool support added in Task 3; skip for now to avoid broken UX
    if (tool.kind !== 'ai') return;
    const existingId = selectedTilesByToolId.get(tool.id);
    if (existingId) {
      onRemove(existingId);
    } else {
      onAdd({
        kind: 'ai',
        label: tool.label,
        iconId: tool.icon ?? 'ai',
        color: tool.color,
        action: {
          kind: 'AI_CLIPBOARD',
          toolId: tool.id,
          prompt: '',
          outputMode: tool.outputMode,
        },
      });
    }
  };

  if (packs.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No AI tools available.</Text>
        <Text style={styles.emptySubtext}>Make sure your agent is connected.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.packRow}
      >
        {packs.map((pack) => (
          <TouchableOpacity
            key={pack.id}
            style={[styles.packChip, selectedPackId === pack.id && styles.packChipActive]}
            onPress={() => setSelectedPackId(pack.id)}
          >
            <Text style={styles.packChipIcon}>{pack.icon}</Text>
            <Text style={[styles.packChipLabel, selectedPackId === pack.id && styles.packChipLabelActive]}>
              {pack.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {activePack && (
        <FlatList
          data={activePack.tools}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.toolList}
          renderItem={({ item: tool }) => {
            const selected = selectedTilesByToolId.has(tool.id);
            return (
              <TouchableOpacity
                style={[styles.toolRow, selected && styles.toolRowSelected]}
                onPress={() => handleToggle(tool)}
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
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { color: '#FFFFFF', fontSize: 16, marginBottom: 8 },
  emptySubtext: { color: '#6B6B8A', fontSize: 13, textAlign: 'center' },
  packRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  packChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, backgroundColor: '#1A1A2E', borderWidth: 1, borderColor: '#2A2A45',
  },
  packChipActive: { backgroundColor: '#6C63FF', borderColor: '#6C63FF' },
  packChipIcon: { fontSize: 16 },
  packChipLabel: { color: '#9898B0', fontSize: 13, fontWeight: '500' },
  packChipLabelActive: { color: '#FFFFFF' },
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
