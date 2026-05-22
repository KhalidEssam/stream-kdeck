import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { TileConfig } from '../types/schema';
import { AppTile } from './AppTile';
import { getTileLayoutPreset } from './tileLayout';
import type { TileLayoutPresetId } from './tileLayout';

const DOT_ROW_HEIGHT = 28;

type PageItem = TileConfig | null; // null = "add" placeholder

interface Props {
  tiles: TileConfig[];
  loadingId: string | null;
  creditsRemaining: number;
  onTap: (tile: TileConfig) => void;
  onLongPress: (tile: TileConfig) => void;
  onAddTile: () => void;
  emptyTitle: string;
  emptyHint: string;
  stateBadges?: Record<string, string | null | undefined>;
  stateActive?: Record<string, boolean | undefined>;
  displayLabels?: Record<string, string | null | undefined>;
  layoutPresetId?: TileLayoutPresetId;
}

export function TileGrid({
  tiles,
  loadingId,
  creditsRemaining,
  onTap,
  onLongPress,
  onAddTile,
  emptyTitle,
  emptyHint,
  stateBadges,
  stateActive,
  displayLabels,
  layoutPresetId = 'standard',
}: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const [gridHeight, setGridHeight] = useState(0);
  const flatListRef = useRef<FlatList<PageItem[]>>(null);
  const [currentPage, setCurrentPage] = useState(0);

  const layoutPreset = getTileLayoutPreset(layoutPresetId);
  const columns = Math.min(10, Math.max(2, Math.round(screenWidth / layoutPreset.idealTileWidth)));
  const tileWidth = screenWidth / columns;
  const tileHeight = tileWidth / layoutPreset.aspectRatio;
  const pageHeight = gridHeight;
  const rows = pageHeight > 0 ? Math.max(1, Math.floor(pageHeight / tileHeight)) : 0;
  const tilesPerPage = columns * rows;

  const pages = React.useMemo((): PageItem[][] => {
    if (tilesPerPage === 0) return [];
    const allItems: PageItem[] = [...tiles, null]; // null = add placeholder
    const result: PageItem[][] = [];
    for (let i = 0; i < allItems.length; i += tilesPerPage) {
      result.push(allItems.slice(i, i + tilesPerPage));
    }
    return result;
  }, [tiles, tilesPerPage]);

  // Reset to page 0 on screen width change (rotation)
  const prevWidthRef = useRef(screenWidth);
  useEffect(() => {
    if (prevWidthRef.current !== screenWidth) {
      prevWidthRef.current = screenWidth;
      flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
      setCurrentPage(0);
    }
  }, [screenWidth]);

  const prevLayoutRef = useRef(layoutPresetId);
  useEffect(() => {
    if (prevLayoutRef.current !== layoutPresetId) {
      prevLayoutRef.current = layoutPresetId;
      flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
      setCurrentPage(0);
    }
  }, [layoutPresetId]);

  // Snap back to last valid page if tiles were removed
  useEffect(() => {
    if (pages.length > 0 && currentPage >= pages.length) {
      const lastPage = pages.length - 1;
      flatListRef.current?.scrollToIndex({ index: lastPage, animated: false });
      setCurrentPage(lastPage);
    }
  }, [pages.length, currentPage]);

  const renderPage = useCallback(
    ({ item: page }: { item: PageItem[] }) => (
      <View
        style={{
          width: screenWidth,
          height: pageHeight,
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignContent: 'flex-start',
        }}
      >
        {page.map((tile, idx) =>
          tile === null ? (
            <TouchableOpacity
              key="__add__"
              style={{ width: tileWidth, height: tileHeight }}
              onPress={onAddTile}
              activeOpacity={0.7}
            >
              <View style={[
                styles.addPlaceholder,
                layoutPreset.density === 'compact' && styles.addPlaceholderCompact,
                layoutPreset.density === 'dense' && styles.addPlaceholderDense,
              ]}>
                <Text style={[
                  styles.addPlus,
                  layoutPreset.density === 'dense' && styles.addPlusDense,
                ]}>+</Text>
                <Text style={[
                  styles.addLabel,
                  layoutPreset.density === 'dense' && styles.addLabelDense,
                ]}>Add</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <View key={tile.id} style={{ width: tileWidth, height: tileHeight }}>
              <AppTile
                tile={tile}
                isLoading={tile.id === loadingId}
                stateBadge={stateBadges?.[tile.id] ?? null}
                stateActive={stateActive?.[tile.id] ?? false}
                displayLabel={displayLabels?.[tile.id] ?? null}
                creditsRemaining={creditsRemaining}
                density={layoutPreset.density}
                onTap={onTap}
                onLongPress={onLongPress}
              />
            </View>
          ),
        )}
      </View>
    ),
    [screenWidth, pageHeight, tileWidth, tileHeight, layoutPreset.density, loadingId, stateBadges, stateActive, displayLabels, creditsRemaining, onTap, onLongPress, onAddTile],
  );

  if (tiles.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>{emptyTitle}</Text>
        <Text style={styles.emptyHint}>{emptyHint}</Text>
        <TouchableOpacity style={styles.addButton} onPress={onAddTile} activeOpacity={0.8}>
          <Text style={styles.addButtonText}>Add Tile</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View
      style={styles.container}
      onLayout={(e) => setGridHeight(e.nativeEvent.layout.height)}
    >
      {gridHeight > 0 && tilesPerPage > 0 && (
        <>
          <FlatList
            ref={flatListRef}
            data={pages}
            keyExtractor={(_, i) => String(i)}
            renderItem={renderPage}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialNumToRender={1}
            windowSize={3}
            getItemLayout={(_, index) => ({
              length: screenWidth,
              offset: screenWidth * index,
              index,
            })}
            onMomentumScrollEnd={(e) => {
              const page = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
              setCurrentPage(page);
            }}
            style={styles.list}
          />
          {pages.length > 1 && (
            <View style={styles.dotRow}>
              {pages.map((_, i) => (
                <View key={i} style={[styles.dot, i === currentPage && styles.dotActive]} />
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { flex: 1 },
  addPlaceholder: {
    flex: 1,
    margin: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A2A4A',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addPlaceholderCompact: { margin: 4, borderRadius: 12 },
  addPlaceholderDense: { margin: 3, borderRadius: 10, gap: 1 },
  addPlus: { color: '#4A4A7A', fontSize: 24, fontWeight: '300' },
  addPlusDense: { fontSize: 18 },
  addLabel: { color: '#4A4A7A', fontSize: 11, fontWeight: '600' },
  addLabelDense: { fontSize: 9 },
  dotRow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: DOT_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2A2A4A',
  },
  dotActive: { backgroundColor: '#5B4FE8', width: 18, borderRadius: 3 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  emptyHint: {
    color: '#6B6B8A',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  addButton: {
    marginTop: 12,
    backgroundColor: '#5B4FE8',
    borderRadius: 10,
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  addButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
