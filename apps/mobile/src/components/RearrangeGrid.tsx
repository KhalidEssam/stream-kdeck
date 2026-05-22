import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { TileConfig } from '../types/schema';
import { AppTile } from './AppTile';
import { getTileLayoutPreset } from './tileLayout';
import type { TileLayoutPresetId } from './tileLayout';

const LONG_PRESS_MS = 400;
const EDGE_RATIO = 0.15;
const FLIP_DELAY_MS = 500;

interface Props {
  tiles: TileConfig[];
  onReorder: (newOrder: TileConfig[]) => void;
  loadingId: string | null;
  creditsRemaining: number;
  onTap: (tile: TileConfig) => void;
  stateBadges?: Record<string, string | null | undefined>;
  stateActive?: Record<string, boolean | undefined>;
  displayLabels?: Record<string, string | null | undefined>;
  layoutPresetId?: TileLayoutPresetId;
}

export function RearrangeGrid({
  tiles,
  onReorder,
  loadingId,
  creditsRemaining,
  onTap,
  stateBadges,
  stateActive,
  displayLabels,
  layoutPresetId = 'standard',
}: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const [gridHeight, setGridHeight] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [localTiles, setLocalTiles] = useState<TileConfig[]>(tiles);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const flatListRef = useRef<FlatList<TileConfig[]>>(null);
  const containerRef = useRef<View>(null);

  // JS-thread refs accessed from runOnJS callbacks
  const localTilesRef = useRef<TileConfig[]>(tiles);
  const currentPageRef = useRef(0);
  const gridPageXRef = useRef(0);
  const gridPageYRef = useRef(0);
  const draggingIndexRef = useRef(-1);
  const hoverSlotRef = useRef(-1);
  const inEdgeZoneRef = useRef<'left' | 'right' | null>(null);
  const edgeFlipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Shared values for UI-thread animation
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const isDragging = useSharedValue(false);
  const tileSizeW = useSharedValue(0);
  const tileSizeH = useSharedValue(0);
  const containerPageX = useSharedValue(0);
  const containerPageY = useSharedValue(0);

  const layoutPreset = getTileLayoutPreset(layoutPresetId);
  const columns = Math.min(10, Math.max(2, Math.round(screenWidth / layoutPreset.idealTileWidth)));
  const tileWidth = screenWidth / columns;
  const tileHeight = tileWidth / layoutPreset.aspectRatio;
  const rows = gridHeight > 0 ? Math.max(1, Math.floor(gridHeight / tileHeight)) : 0;
  const tilesPerPage = columns * rows;

  // Keep shared values in sync with layout-derived sizes
  useEffect(() => {
    tileSizeW.value = tileWidth;
    tileSizeH.value = tileHeight;
  }, [tileWidth, tileHeight, tileSizeW, tileSizeH]);

  // Reset local tiles when prop tiles change (e.g. WS update while not dragging)
  useEffect(() => {
    if (draggingId !== null) return; // don't clobber ongoing drag
    localTilesRef.current = tiles;
    setLocalTiles(tiles);
  }, [tiles, draggingId]);

  const pages = React.useMemo((): TileConfig[][] => {
    if (tilesPerPage === 0) return [];
    const result: TileConfig[][] = [];
    for (let i = 0; i < localTiles.length; i += tilesPerPage) {
      result.push(localTiles.slice(i, i + tilesPerPage));
    }
    return result;
  }, [localTiles, tilesPerPage]);

  const measureContainer = useCallback(() => {
    containerRef.current?.measure((_x, _y, _w, _h, pageX, pageY) => {
      gridPageXRef.current = pageX;
      gridPageYRef.current = pageY;
      containerPageX.value = pageX;
      containerPageY.value = pageY;
    });
  }, [containerPageX, containerPageY]);

  // ── JS-thread callbacks (called via runOnJS) ──────────────────────────────

  const onDragStart = useCallback(
    (absX: number, absY: number) => {
      const relX = absX - gridPageXRef.current;
      const relY = absY - gridPageYRef.current;
      const col = Math.min(columns - 1, Math.max(0, Math.floor(relX / tileWidth)));
      const row = Math.min(rows - 1, Math.max(0, Math.floor(relY / tileHeight)));
      const slot = row * columns + col + currentPageRef.current * tilesPerPage;
      const tile = localTilesRef.current[slot];
      if (!tile) return;
      draggingIndexRef.current = slot;
      hoverSlotRef.current = slot;
      setDraggingId(tile.id);
      isDragging.value = true;
    },
    [columns, rows, tileWidth, tileHeight, tilesPerPage, isDragging],
  );

  const scheduleEdgeFlip = useCallback(
    (direction: 'left' | 'right') => {
      edgeFlipTimerRef.current = setTimeout(() => {
        if (inEdgeZoneRef.current !== direction) return;
        const total = Math.ceil(localTilesRef.current.length / tilesPerPage);
        const next =
          direction === 'right'
            ? Math.min(currentPageRef.current + 1, total - 1)
            : Math.max(currentPageRef.current - 1, 0);
        if (next !== currentPageRef.current) {
          flatListRef.current?.scrollToIndex({ index: next, animated: true });
          currentPageRef.current = next;
          setCurrentPage(next);
        }
        scheduleEdgeFlip(direction);
      }, FLIP_DELAY_MS);
    },
    [tilesPerPage],
  );

  const onDragUpdate = useCallback(
    (absX: number, absY: number) => {
      const relX = absX - gridPageXRef.current;
      const relY = absY - gridPageYRef.current;
      const col = Math.min(columns - 1, Math.max(0, Math.floor(relX / tileWidth)));
      const row = Math.min(rows - 1, Math.max(0, Math.floor(relY / tileHeight)));
      const hover = row * columns + col + currentPageRef.current * tilesPerPage;

      if (
        hover !== hoverSlotRef.current &&
        hover >= 0 &&
        hover < localTilesRef.current.length
      ) {
        const next = [...localTilesRef.current];
        const [item] = next.splice(draggingIndexRef.current, 1);
        next.splice(hover, 0, item);
        draggingIndexRef.current = hover;
        hoverSlotRef.current = hover;
        localTilesRef.current = next;
        setLocalTiles(next);
      }

      const sw = Dimensions.get('window').width;
      const newZone: 'left' | 'right' | null =
        absX < sw * EDGE_RATIO ? 'left' : absX > sw * (1 - EDGE_RATIO) ? 'right' : null;
      if (newZone !== inEdgeZoneRef.current) {
        inEdgeZoneRef.current = newZone;
        if (edgeFlipTimerRef.current) {
          clearTimeout(edgeFlipTimerRef.current);
          edgeFlipTimerRef.current = null;
        }
        if (newZone) scheduleEdgeFlip(newZone);
      }
    },
    [columns, rows, tileWidth, tileHeight, tilesPerPage, scheduleEdgeFlip],
  );

  const onDragEnd = useCallback(() => {
    if (edgeFlipTimerRef.current) {
      clearTimeout(edgeFlipTimerRef.current);
      edgeFlipTimerRef.current = null;
    }
    inEdgeZoneRef.current = null;
    isDragging.value = false;
    setDraggingId(null);
    draggingIndexRef.current = -1;
    hoverSlotRef.current = -1;
    onReorder(localTilesRef.current);
  }, [isDragging, onReorder]);

  // ── Gesture ────────────────────────────────────────────────────────────────

  const panGesture = Gesture.Pan()
    .activateAfterLongPress(LONG_PRESS_MS)
    .onStart((e) => {
      'worklet';
      runOnJS(onDragStart)(e.absoluteX, e.absoluteY);
    })
    .onUpdate((e) => {
      'worklet';
      dragX.value = e.absoluteX;
      dragY.value = e.absoluteY;
      runOnJS(onDragUpdate)(e.absoluteX, e.absoluteY);
    })
    .onEnd(() => {
      'worklet';
      runOnJS(onDragEnd)();
    })
    .onFinalize(() => {
      'worklet';
      isDragging.value = false;
    });

  // ── Floating overlay style (UI thread) ────────────────────────────────────

  const floatingStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: dragX.value - containerPageX.value - tileSizeW.value / 2,
    top: dragY.value - containerPageY.value - tileSizeH.value / 2,
    width: tileSizeW.value,
    height: tileSizeH.value,
    zIndex: 1000,
    elevation: 10,
    opacity: isDragging.value ? 1 : 0,
    transform: [
      { scale: withSpring(isDragging.value ? 1.08 : 1, { damping: 15, stiffness: 200 }) },
    ],
  }));

  const draggingTile = draggingId
    ? localTilesRef.current.find((t) => t.id === draggingId) ?? null
    : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  const renderPage = useCallback(
    ({ item: page }: { item: TileConfig[] }) => (
      <View
        style={{
          width: screenWidth,
          height: gridHeight,
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignContent: 'flex-start',
        }}
      >
        {page.map((tile) => (
          <View
            key={tile.id}
            style={{ width: tileWidth, height: tileHeight, opacity: tile.id === draggingId ? 0.25 : 1 }}
          >
            <AppTile
              tile={tile}
              isLoading={tile.id === loadingId}
              stateBadge={stateBadges?.[tile.id] ?? null}
              stateActive={stateActive?.[tile.id] ?? false}
              displayLabel={displayLabels?.[tile.id] ?? null}
              creditsRemaining={creditsRemaining}
              density={layoutPreset.density}
              isRearranging={tile.id !== draggingId}
              onTap={onTap}
              onLongPress={() => {}}
            />
          </View>
        ))}
      </View>
    ),
    [
      screenWidth, gridHeight, tileWidth, tileHeight, draggingId,
      loadingId, stateBadges, stateActive, displayLabels,
      creditsRemaining, layoutPreset.density, onTap,
    ],
  );

  return (
    <View
      style={styles.container}
      ref={containerRef}
      onLayout={(e) => {
        setGridHeight(e.nativeEvent.layout.height);
        measureContainer();
      }}
    >
      <GestureDetector gesture={panGesture}>
        <View style={styles.gestureArea}>
          {gridHeight > 0 && tilesPerPage > 0 && (
            <FlatList
              ref={flatListRef}
              data={pages}
              keyExtractor={(_, i) => String(i)}
              renderItem={renderPage}
              horizontal
              pagingEnabled
              scrollEnabled={false}
              showsHorizontalScrollIndicator={false}
              initialNumToRender={1}
              windowSize={3}
              getItemLayout={(_, index) => ({
                length: screenWidth,
                offset: screenWidth * index,
                index,
              })}
            />
          )}
        </View>
      </GestureDetector>

      {draggingTile && (
        <Animated.View style={floatingStyle} pointerEvents="none">
          <AppTile
            tile={draggingTile}
            isLoading={false}
            stateBadge={null}
            stateActive={false}
            displayLabel={null}
            creditsRemaining={creditsRemaining}
            density={layoutPreset.density}
            isRearranging={false}
            onTap={() => {}}
            onLongPress={() => {}}
          />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  gestureArea: { flex: 1 },
});
