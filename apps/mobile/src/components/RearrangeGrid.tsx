import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
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
  const [isDragging, setIsDragging] = useState(false);

  const flatListRef = useRef<FlatList<TileConfig[]>>(null);
  const containerRef = useRef<View>(null);

  // JS-thread refs accessed from gesture callbacks
  const localTilesRef = useRef<TileConfig[]>(tiles);
  const currentPageRef = useRef(0);
  const gridPageXRef = useRef(0);
  const gridPageYRef = useRef(0);
  const draggingIndexRef = useRef(-1);
  const hoverSlotRef = useRef(-1);
  const inEdgeZoneRef = useRef<'left' | 'right' | null>(null);
  const edgeFlipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleEdgeFlipRef = useRef<(direction: 'left' | 'right') => void>(() => {});

  // Animated values for the floating tile — setValue() bypasses React re-renders during drag
  const floatX = useRef(new Animated.Value(0)).current;
  const floatY = useRef(new Animated.Value(0)).current;
  const floatScale = useRef(new Animated.Value(1)).current;

  const layoutPreset = getTileLayoutPreset(layoutPresetId);
  const columns = Math.min(10, Math.max(2, Math.round(screenWidth / layoutPreset.idealTileWidth)));
  const tileWidth = screenWidth / columns;
  const tileHeight = tileWidth / layoutPreset.aspectRatio;
  const rows = gridHeight > 0 ? Math.max(1, Math.floor(gridHeight / tileHeight)) : 0;
  const tilesPerPage = columns * rows;

  // Keep tile dimensions accessible inside gesture callbacks without stale closures
  const tileWidthRef = useRef(tileWidth);
  const tileHeightRef = useRef(tileHeight);
  useEffect(() => {
    tileWidthRef.current = tileWidth;
    tileHeightRef.current = tileHeight;
  }, [tileWidth, tileHeight]);

  // Reset local tiles when prop tiles change (e.g. WS update while not dragging)
  useEffect(() => {
    if (draggingId !== null) return;
    localTilesRef.current = tiles;
    setLocalTiles(tiles);
  }, [tiles, draggingId]);

  const pages = useMemo((): TileConfig[][] => {
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
    });
  }, []);

  const onDragStart = useCallback(
    (absX: number, absY: number) => {
      const relX = absX - gridPageXRef.current;
      const relY = absY - gridPageYRef.current;
      const col = Math.min(columns - 1, Math.max(0, Math.floor(relX / tileWidthRef.current)));
      const row = Math.min(rows - 1, Math.max(0, Math.floor(relY / tileHeightRef.current)));
      const slot = row * columns + col + currentPageRef.current * tilesPerPage;
      const tile = localTilesRef.current[slot];
      if (!tile) return;
      draggingIndexRef.current = slot;
      hoverSlotRef.current = slot;
      floatX.setValue(absX - gridPageXRef.current - tileWidthRef.current / 2);
      floatY.setValue(absY - gridPageYRef.current - tileHeightRef.current / 2);
      floatScale.setValue(1);
      setDraggingId(tile.id);
      setIsDragging(true);
      Animated.spring(floatScale, {
        toValue: 1.08,
        damping: 15,
        stiffness: 200,
        useNativeDriver: false,
      }).start();
    },
    [columns, rows, tilesPerPage, floatX, floatY, floatScale],
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
        scheduleEdgeFlipRef.current(direction);
      }, FLIP_DELAY_MS);
    },
    [tilesPerPage],
  );

  useEffect(() => {
    scheduleEdgeFlipRef.current = scheduleEdgeFlip;
  }, [scheduleEdgeFlip]);

  const onDragUpdate = useCallback(
    (absX: number, absY: number) => {
      floatX.setValue(absX - gridPageXRef.current - tileWidthRef.current / 2);
      floatY.setValue(absY - gridPageYRef.current - tileHeightRef.current / 2);

      const relX = absX - gridPageXRef.current;
      const relY = absY - gridPageYRef.current;
      const col = Math.min(columns - 1, Math.max(0, Math.floor(relX / tileWidthRef.current)));
      const row = Math.min(rows - 1, Math.max(0, Math.floor(relY / tileHeightRef.current)));
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
        if (newZone) scheduleEdgeFlipRef.current(newZone);
      }
    },
    [columns, rows, tilesPerPage, floatX, floatY],
  );

  const onDragEnd = useCallback(() => {
    if (edgeFlipTimerRef.current) {
      clearTimeout(edgeFlipTimerRef.current);
      edgeFlipTimerRef.current = null;
    }
    inEdgeZoneRef.current = null;
    floatScale.stopAnimation();
    floatScale.setValue(1);
    setIsDragging(false);
    setDraggingId(null);
    draggingIndexRef.current = -1;
    hoverSlotRef.current = -1;
    onReorder(localTilesRef.current);
  }, [floatScale, onReorder]);

  // All callbacks run on JS thread — no Reanimated worklets needed
  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(LONG_PRESS_MS)
        .runOnJS(true)
        .onStart((e) => { onDragStart(e.absoluteX, e.absoluteY); })
        .onUpdate((e) => { onDragUpdate(e.absoluteX, e.absoluteY); })
        .onEnd(() => { onDragEnd(); })
        .onFinalize(() => { setIsDragging(false); }),
    [onDragStart, onDragUpdate, onDragEnd],
  );

  const draggingTile = draggingId
    ? localTilesRef.current.find((t) => t.id === draggingId) ?? null
    : null;

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

      {isDragging && draggingTile && (
        <Animated.View
          style={[
            styles.floatingTile,
            {
              left: floatX,
              top: floatY,
              width: tileWidth,
              height: tileHeight,
              transform: [{ scale: floatScale }],
            },
          ]}
          pointerEvents="none"
        >
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
  floatingTile: {
    position: 'absolute',
    zIndex: 1000,
    elevation: 10,
  },
});
