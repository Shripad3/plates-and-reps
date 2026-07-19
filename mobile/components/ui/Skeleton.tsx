import { useEffect } from "react";
import { View, type DimensionValue, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { colors } from "@/lib/theme";

type SkeletonProps = {
  width?: DimensionValue;
  height?: DimensionValue;
  /** Corner radius in px. Pass a large value (e.g. 999) for pills/circles. */
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * A single pulsing placeholder block. Compose these inside a plain <View>
 * layout to mirror the real screen's structure while its data loads.
 */
export function Skeleton({ width = "100%", height = 16, radius = 8, style }: SkeletonProps) {
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.85, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius, backgroundColor: colors.surface.border },
        style,
        animatedStyle,
      ]}
    />
  );
}

/** Convenience circle (avatars, rings). */
export function SkeletonCircle({ size = 40, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  return <Skeleton width={size} height={size} radius={size / 2} style={style} />;
}

/**
 * A stack of text-line placeholders. The last line is shortened to read as a
 * paragraph. Wrap in a <View> if you need custom spacing.
 */
export function SkeletonText({
  lines = 3,
  lineHeight = 12,
  gap = 8,
  lastWidth = "60%",
}: {
  lines?: number;
  lineHeight?: number;
  gap?: number;
  lastWidth?: DimensionValue;
}) {
  return (
    <View style={{ gap }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={lineHeight}
          radius={lineHeight / 2}
          width={i === lines - 1 ? lastWidth : "100%"}
        />
      ))}
    </View>
  );
}
