import { useMemo, useRef, type ReactNode } from "react";
import { View, StyleSheet } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { useAppBack } from "@/hooks/useAppBack";

const EDGE_WIDTH = 28;
const SWIPE_THRESHOLD = 72;

type SwipeBackGestureProps = {
  children: ReactNode;
};

export function SwipeBackGesture({ children }: SwipeBackGestureProps) {
  const handleSwipeBack = useAppBack();
  const startedFromEdgeRef = useRef(false);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX(18)
        .failOffsetY([-24, 24])
        .onBegin((event) => {
          startedFromEdgeRef.current = event.x <= EDGE_WIDTH;
        })
        .onEnd((event) => {
          if (startedFromEdgeRef.current && event.translationX >= SWIPE_THRESHOLD) {
            runOnJS(handleSwipeBack)();
          }
          startedFromEdgeRef.current = false;
        })
        .onFinalize(() => {
          startedFromEdgeRef.current = false;
        }),
    [handleSwipeBack]
  );

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.container}>{children}</View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
