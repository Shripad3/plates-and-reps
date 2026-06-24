import { useState } from "react";
import { View, Text, LayoutChangeEvent } from "react-native";
import Svg, { Polyline, Circle, Line } from "react-native-svg";
import type { BodyMetric } from "@/types";
import { colors } from "@/lib/theme";

const CHART_HEIGHT = 168;
const PADDING = { top: 14, right: 12, bottom: 28, left: 40 };

type WeightLineChartProps = {
  metrics: BodyMetric[];
  goalWeightKg?: number | null;
  maxPoints?: number;
};

export function WeightLineChart({
  metrics,
  goalWeightKg,
  maxPoints = 30,
}: WeightLineChartProps) {
  const [chartWidth, setChartWidth] = useState(0);
  const data = metrics.slice(-maxPoints);
  const weights = data.map((m) => m.weight_kg!);

  function onLayout(event: LayoutChangeEvent) {
    setChartWidth(event.nativeEvent.layout.width);
  }

  if (data.length < 2 || chartWidth === 0) {
    return <View onLayout={onLayout} style={{ height: CHART_HEIGHT }} />;
  }

  let minWeight = Math.min(...weights);
  let maxWeight = Math.max(...weights);
  if (goalWeightKg != null) {
    minWeight = Math.min(minWeight, goalWeightKg);
    maxWeight = Math.max(maxWeight, goalWeightKg);
  }

  const paddingKg = 2;
  const range = Math.max(maxWeight - minWeight, 1);
  const plotWidth = chartWidth - PADDING.left - PADDING.right;
  const plotHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;

  function yForWeight(weight: number) {
    const normalized = (weight - (minWeight - paddingKg)) / (range + paddingKg * 2);
    return PADDING.top + (1 - normalized) * plotHeight;
  }

  const points = data.map((m, index) => {
    const x =
      PADDING.left +
      (data.length === 1 ? plotWidth / 2 : (index / (data.length - 1)) * plotWidth);
    const y = yForWeight(m.weight_kg!);
    return { x, y, metric: m };
  });

  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(" ");

  const goalY = goalWeightKg != null ? yForWeight(goalWeightKg) : null;
  const firstDate = data[0].date;
  const lastDate = data[data.length - 1].date;

  return (
    <View onLayout={onLayout}>
      <Svg width={chartWidth} height={CHART_HEIGHT}>
        <Line
          x1={PADDING.left}
          y1={PADDING.top + plotHeight}
          x2={chartWidth - PADDING.right}
          y2={PADDING.top + plotHeight}
          stroke={colors.surface.elevated}
          strokeWidth={1}
        />
        <Line
          x1={PADDING.left}
          y1={PADDING.top}
          x2={PADDING.left}
          y2={PADDING.top + plotHeight}
          stroke={colors.surface.elevated}
          strokeWidth={1}
        />

        {goalY != null && (
          <Line
            x1={PADDING.left}
            y1={goalY}
            x2={chartWidth - PADDING.right}
            y2={goalY}
            stroke={colors.brand[300]}
            strokeWidth={1.5}
            strokeDasharray="6 4"
            opacity={0.85}
          />
        )}

        <Polyline
          points={polylinePoints}
          fill="none"
          stroke={colors.brand[400]}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {points.map((point, index) => (
          <Circle
            key={`${point.metric.id}-${index}`}
            cx={point.x}
            cy={point.y}
            r={index === points.length - 1 ? 5 : 3.5}
            fill={index === points.length - 1 ? colors.brand[300] : colors.brand[500]}
            stroke={colors.background}
            strokeWidth={1.5}
          />
        ))}
      </Svg>

      <View className="flex-row justify-between px-1 -mt-1">
        <Text className="text-slate-500 text-xs">
          {new Date(firstDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </Text>
        {goalWeightKg != null && (
          <Text className="text-brand-300/80 text-xs">Goal {goalWeightKg} kg</Text>
        )}
        <Text className="text-slate-500 text-xs">
          {new Date(lastDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </Text>
      </View>
    </View>
  );
}
