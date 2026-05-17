import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { AppSearchResult, ButtonAction, TileConfig } from '../types/schema';
import { WebSocketService } from '../services/websocket.service';

const SOURCE_LABEL: Record<AppSearchResult['source'], string> = {
  startmenu: 'App',
  windows: 'Windows',
  filesystem: 'Folder',
  steam: 'Steam',
  epic: 'Epic',
};

const SOURCE_COLOR: Record<AppSearchResult['source'], string> = {
  startmenu: '#4A4A6A',
  windows: '#0078D4',
  filesystem: '#2D5A27',
  steam: '#1B2838',
  epic: '#0060CC',
};

function actionForPath(exePath: string): ButtonAction {
  const trimmed = exePath.trim();
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? { kind: 'URL_OPEN', url: trimmed }
    : { kind: 'EXEC', exePath: trimmed };
}

function actionKey(action: ButtonAction): string {
  if (action.kind === 'EXEC') return `EXEC:${action.exePath.toLowerCase()}`;
  if (action.kind === 'URL_OPEN') return `URL_OPEN:${action.url.toLowerCase()}`;
  return JSON.stringify(action);
}

interface Props {
  ws: WebSocketService;
  currentTiles: TileConfig[];
  onAdd: (tile: Omit<TileConfig, 'id'>) => void;
  onRemove: (tileId: string) => void;
}

export function GamesTab({ ws, currentTiles, onAdd, onRemove }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AppSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [pastePath, setPastePath] = useState('');
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<{
    valid: boolean;
    label?: string;
    iconBase64?: string;
    error?: string;
  } | null>(null);

  const selectedByAction = useMemo<Map<string, string>>(() => {
    const map = new Map<string, string>();
    for (const tile of currentTiles) {
      if (tile.kind !== 'custom') continue;
      map.set(actionKey(tile.action), tile.id);
    }
    return map;
  }, [currentTiles]);

  useEffect(() => {
    const unsubscribeSearch = ws.onSearchAppsResult((msg) => {
      setResults(msg.results);
      setSearching(false);
      setSearched(true);
    });
    const unsubscribeValidate = ws.onValidatePathResult((msg) => {
      setValidation(msg);
      setValidating(false);
    });

    return () => {
      unsubscribeSearch();
      unsubscribeValidate();
    };
  }, [ws]);

  const handleSearch = () => {
    const nextQuery = query.trim();
    if (!nextQuery || searching) return;
    setSearching(true);
    setResults([]);
    setSearched(false);
    ws.searchApps(nextQuery);
  };

  const handleValidate = () => {
    const nextPath = pastePath.trim();
    if (!nextPath || validating) return;
    setValidating(true);
    setValidation(null);
    ws.validatePath(nextPath);
  };

  const tileForResult = (item: AppSearchResult): Omit<TileConfig, 'id'> => {
    return {
      kind: 'custom',
      label: item.name,
      iconId: 'custom',
      iconBase64: item.iconBase64,
      action: actionForPath(item.exePath),
    };
  };

  const handleToggleResult = (item: AppSearchResult) => {
    const tile = tileForResult(item);
    const existingId = selectedByAction.get(actionKey(tile.action));
    if (existingId) {
      onRemove(existingId);
      return;
    }
    onAdd(tile);
  };

  const handleTogglePath = () => {
    const nextPath = pastePath.trim();
    if (!validation?.valid || !validation.label || !nextPath) return;
    const tile: Omit<TileConfig, 'id'> = {
      kind: 'custom',
      label: validation.label,
      iconId: 'custom',
      iconBase64: validation.iconBase64,
      action: actionForPath(nextPath),
    };
    const existingId = selectedByAction.get(actionKey(tile.action));
    if (existingId) {
      onRemove(existingId);
    } else {
      onAdd(tile);
      setPastePath('');
      setValidation(null);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Games and Apps</Text>
        <View style={styles.row}>
          <TextInput
            style={styles.input}
            placeholder="Cyberpunk, Spotify, Slack..."
            placeholderTextColor="#6B6B8A"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={handleSearch}
          />
          <TouchableOpacity
            style={[styles.button, !query.trim() && styles.buttonDisabled]}
            onPress={handleSearch}
            disabled={!query.trim() || searching}
          >
            {searching ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>Search</Text>
            )}
          </TouchableOpacity>
        </View>

        {results.length > 0 && (
          <FlatList
            data={results}
            keyExtractor={(item, index) => `${item.source}-${item.exePath}-${index}`}
            keyboardShouldPersistTaps="handled"
            style={styles.resultsList}
            renderItem={({ item }) => {
              const tile = tileForResult(item);
              const isSelected = selectedByAction.has(actionKey(tile.action));
              return (
                <View style={[styles.resultRow, isSelected && styles.resultRowSelected]}>
                  <View style={styles.resultIcon}>
                    {item.iconBase64 ? (
                      <Image
                        source={{ uri: `data:image/png;base64,${item.iconBase64}` }}
                        style={styles.iconImage}
                      />
                    ) : (
                      <Text style={styles.iconLetter}>{item.name.charAt(0).toUpperCase()}</Text>
                    )}
                  </View>
                  <View style={styles.resultText}>
                    <Text style={styles.resultName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <View style={[styles.sourceBadge, { backgroundColor: SOURCE_COLOR[item.source] }]}>
                      <Text style={styles.sourceBadgeText}>{SOURCE_LABEL[item.source]}</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[styles.addButton, isSelected && styles.removeButton]}
                    onPress={() => handleToggleResult(item)}
                  >
                    <Text style={styles.addButtonText}>{isSelected ? 'Remove' : 'Add'}</Text>
                  </TouchableOpacity>
                </View>
              );
            }}
          />
        )}

        {!searching && searched && results.length === 0 && (
          <Text style={styles.noResults}>No matches found.</Text>
        )}
      </View>

      <View style={styles.divider} />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Executable Path</Text>
        <View style={styles.row}>
          <TextInput
            style={styles.input}
            placeholder={'C:\\Games\\MyGame\\game.exe'}
            placeholderTextColor="#6B6B8A"
            value={pastePath}
            onChangeText={(text) => {
              setPastePath(text);
              setValidation(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleValidate}
          />
          <TouchableOpacity
            style={[styles.button, !pastePath.trim() && styles.buttonDisabled]}
            onPress={handleValidate}
            disabled={!pastePath.trim() || validating}
          >
            {validating ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>Check</Text>
            )}
          </TouchableOpacity>
        </View>

        {validation && (
          <View style={styles.validationRow}>
            {validation.iconBase64 ? (
              <Image
                source={{ uri: `data:image/png;base64,${validation.iconBase64}` }}
                style={styles.validationIcon}
              />
            ) : null}
            <Text
              style={[
                styles.validationText,
                validation.valid ? styles.validationOk : styles.validationError,
              ]}
              numberOfLines={1}
            >
              {validation.valid ? validation.label : validation.error}
            </Text>
            {validation.valid && (() => {
              const action = actionForPath(pastePath.trim());
              const isSelected = selectedByAction.has(actionKey(action));
              return (
                <TouchableOpacity
                  style={[styles.addButton, isSelected && styles.removeButton]}
                  onPress={handleTogglePath}
                >
                  <Text style={styles.addButtonText}>{isSelected ? 'Remove' : 'Add'}</Text>
                </TouchableOpacity>
              );
            })()}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  section: { paddingHorizontal: 12, paddingVertical: 10 },
  sectionTitle: {
    color: '#AAAACC',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  row: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    backgroundColor: '#1A1A2E',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  button: {
    backgroundColor: '#5B4FE8',
    borderRadius: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 76,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  resultsList: { marginTop: 10, maxHeight: 260 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    gap: 10,
  },
  resultRowSelected: { backgroundColor: 'rgba(91,79,232,0.12)' },
  resultIcon: {
    width: 36,
    height: 36,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2D5A27',
    overflow: 'hidden',
  },
  iconImage: { width: 30, height: 30, resizeMode: 'contain' },
  iconLetter: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  resultText: { flex: 1, gap: 4 },
  resultName: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  sourceBadge: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sourceBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  addButton: {
    backgroundColor: '#5B4FE8',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  removeButton: { backgroundColor: '#5A2731' },
  addButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },
  noResults: { color: '#6B6B8A', textAlign: 'center', marginTop: 16, fontSize: 13 },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: 12,
  },
  validationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 8,
  },
  validationIcon: { width: 28, height: 28, resizeMode: 'contain' },
  validationText: { flex: 1, fontSize: 13, fontWeight: '600' },
  validationOk: { color: '#4CAF50' },
  validationError: { color: '#F44336' },
});
