import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  useWindowDimensions,
  PanResponder,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BAR_HEIGHT } from "@/components/FloatingTabBar";
import { colors } from "@/lib/theme";

const STORAGE_KEY = "floating_chat_position";
const BUTTON_SIZE = 56;
const EDGE_INSET = 14;
const TAP_SLOP = 8;

type Edge = "left" | "right" | "top" | "bottom";

type SavedPosition = {
  edge: Edge;
  offset: number;
};

type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type Position = { x: number; y: number };

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function snapToEdge(
  x: number,
  y: number,
  bounds: Bounds
): { x: number; y: number; edge: Edge; offset: number } {
  const centerX = x + BUTTON_SIZE / 2;
  const centerY = y + BUTTON_SIZE / 2;

  const distLeft = centerX - bounds.minX;
  const distRight = bounds.maxX + BUTTON_SIZE - centerX;
  const distTop = centerY - bounds.minY;
  const distBottom = bounds.maxY + BUTTON_SIZE - centerY;

  const distances = [distLeft, distRight, distTop, distBottom];
  const nearestEdge = distances.indexOf(Math.min(...distances));

  if (nearestEdge === 0) {
    const snappedY = clamp(y, bounds.minY, bounds.maxY);
    return {
      x: bounds.minX,
      y: snappedY,
      edge: "left",
      offset: snappedY - bounds.minY,
    };
  }

  if (nearestEdge === 1) {
    const snappedY = clamp(y, bounds.minY, bounds.maxY);
    return {
      x: bounds.maxX,
      y: snappedY,
      edge: "right",
      offset: snappedY - bounds.minY,
    };
  }

  if (nearestEdge === 2) {
    const snappedX = clamp(x, bounds.minX, bounds.maxX);
    return {
      x: snappedX,
      y: bounds.minY,
      edge: "top",
      offset: snappedX - bounds.minX,
    };
  }

  const snappedX = clamp(x, bounds.minX, bounds.maxX);
  return {
    x: snappedX,
    y: bounds.maxY,
    edge: "bottom",
    offset: snappedX - bounds.minX,
  };
}

function positionFromSaved(saved: SavedPosition, bounds: Bounds): Position {
  const maxOffsetY = bounds.maxY - bounds.minY;
  const maxOffsetX = bounds.maxX - bounds.minX;
  const offsetY = clamp(saved.offset, 0, maxOffsetY);
  const offsetX = clamp(saved.offset, 0, maxOffsetX);

  switch (saved.edge) {
    case "left":
      return { x: bounds.minX, y: bounds.minY + offsetY };
    case "right":
      return { x: bounds.maxX, y: bounds.minY + offsetY };
    case "top":
      return { x: bounds.minX + offsetX, y: bounds.minY };
    case "bottom":
      return { x: bounds.minX + offsetX, y: bounds.maxY };
  }
}

const DEFAULT_POSITION: SavedPosition = { edge: "right", offset: 120 };

export function FloatingChatButton() {
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const bounds = useMemo<Bounds>(() => {
    const tabBarBottom = Math.max(insets.bottom, 12);
    const bottomReserved = BAR_HEIGHT + tabBarBottom + 16;
    return {
      minX: insets.left + EDGE_INSET,
      minY: insets.top + EDGE_INSET,
      maxX: screenWidth - BUTTON_SIZE - insets.right - EDGE_INSET,
      maxY: screenHeight - BUTTON_SIZE - bottomReserved,
    };
  }, [insets.bottom, insets.left, insets.right, insets.top, screenHeight, screenWidth]);

  const [ready, setReady] = useState(false);
  const savedPositionRef = useRef<SavedPosition>(DEFAULT_POSITION);
  const dragOriginRef = useRef<Position>({ x: 0, y: 0 });

  const [position, setPosition] = useState<Position>(() =>
    positionFromSaved(DEFAULT_POSITION, {
      minX: EDGE_INSET,
      minY: EDGE_INSET,
      maxX: 300,
      maxY: 600,
    })
  );
  const positionRef = useRef(position);
  positionRef.current = position;

  const persistPosition = useCallback(async (saved: SavedPosition) => {
    savedPositionRef.current = saved;
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {
      // non-critical
    }
  }, []);

  const openChat = useCallback(() => {
    router.push("/chat");
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadPosition() {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw && !cancelled) {
          const saved = JSON.parse(raw) as SavedPosition;
          if (saved?.edge && typeof saved.offset === "number") {
            savedPositionRef.current = saved;
          }
        }
      } catch {
        // use default
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    loadPosition();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    setPosition(positionFromSaved(savedPositionRef.current, bounds));
  }, [bounds, ready]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2,
        onPanResponderGrant: () => {
          dragOriginRef.current = positionRef.current;
        },
        onPanResponderMove: (_, gesture) => {
          setPosition({
            x: clamp(
              dragOriginRef.current.x + gesture.dx,
              bounds.minX,
              bounds.maxX
            ),
            y: clamp(
              dragOriginRef.current.y + gesture.dy,
              bounds.minY,
              bounds.maxY
            ),
          });
        },
        onPanResponderRelease: (_, gesture) => {
          if (
            Math.abs(gesture.dx) < TAP_SLOP &&
            Math.abs(gesture.dy) < TAP_SLOP
          ) {
            openChat();
            return;
          }

          const current = {
            x: clamp(
              dragOriginRef.current.x + gesture.dx,
              bounds.minX,
              bounds.maxX
            ),
            y: clamp(
              dragOriginRef.current.y + gesture.dy,
              bounds.minY,
              bounds.maxY
            ),
          };

          const snapped = snapToEdge(current.x, current.y, bounds);
          setPosition({ x: snapped.x, y: snapped.y });
          persistPosition({ edge: snapped.edge, offset: snapped.offset });
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [bounds, openChat, persistPosition]
  );

  if (!ready) return null;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <View
        {...panResponder.panHandlers}
        style={[
          styles.button,
          {
            transform: [
              { translateX: position.x },
              { translateY: position.y },
            ],
          },
        ]}
      >
        <Text style={styles.emoji}>🤖</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    position: "absolute",
    top: 0,
    left: 0,
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    backgroundColor: "rgba(99, 102, 241, 0.92)",
    borderWidth: 1,
    borderColor: "rgba(165, 180, 252, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    ...Platform.select({
      ios: {
        shadowColor: colors.shadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.22,
        shadowRadius: 8,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  emoji: {
    fontSize: 26,
  },
});
