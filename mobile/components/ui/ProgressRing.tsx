import { useEffect } from "react";
import { View, Text } from "react-native";
import Svg, { Circle } from "react-native-svg";
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { colors } from "@/lib/theme";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type ProgressRingProps = {
  label: string;
  value: string;
  progress: number;
  color: string;
  /** bg-700 hue-matched track color. Defaults to surface.border. */
  trackColor?: string;
  size?: number;
  /** When true the arc springs from its previous position to the new progress on every change. */
  animated?: boolean;
};

export function ProgressRing({
  label,
  value,
  progress,
  color,
  trackColor = colors.surface.border,
  size = 64,
  animated = false,
}: ProgressRingProps) {
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const exceeded = progress > 100;
  const pct = Math.min(Math.max(progress, 0), 100);
  const targetOffset = circumference - (pct / 100) * circumference;
  const activeColor = exceeded ? colors.danger : color;

  // Start at the full offset (empty ring) when animated so it springs in on mount.
  // Start at the target offset when static so there's no flash.
  const animOffset = useSharedValue(animated ? circumference : targetOffset);

  useEffect(() => {
    if (animated) {
      animOffset.value = withSpring(targetOffset, {
        damping: 18,
        stiffness: 90,
        mass: 1,
      });
    } else {
      animOffset.value = targetOffset;
    }
  }, [targetOffset]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: animOffset.value,
  }));

  return (
    <View className="items-center flex-1">
      <View style={{ width: size, height: size }} className="items-center justify-center mb-2">
        <Svg width={size} height={size} style={{ position: "absolute" }}>
          {/* Track — hue-matched bg-700 shade, visible even at 0% */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={trackColor}
            strokeWidth={stroke}
            fill="none"
          />
          {/* Fill arc — animated via shared value */}
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={activeColor}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={circumference}
            animatedProps={animatedProps}
            strokeLinecap="round"
            rotation={-90}
            origin={`${size / 2}, ${size / 2}`}
          />
        </Svg>
        <Text
          style={{
            fontSize: 13,
            fontWeight: "700",
            color: exceeded ? colors.danger : colors.text.primary,
            letterSpacing: -0.3,
          }}
        >
          {exceeded ? "Over" : `${Math.round(pct)}%`}
        </Text>
      </View>
      <Text style={{ fontSize: 11, color: colors.text.muted }}>{label}</Text>
      <Text
        style={{
          fontSize: 13,
          fontWeight: "700",
          color: exceeded ? colors.danger : colors.text.primary,
          marginTop: 2,
        }}
      >
        {value}
      </Text>
    </View>
  );
}
