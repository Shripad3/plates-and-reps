import { View, Text } from "react-native";
import Svg, { Circle } from "react-native-svg";

type ProgressRingProps = {
  label: string;
  value: string;
  progress: number;
  color: string;
  size?: number;
};

export function ProgressRing({
  label,
  value,
  progress,
  color,
  size = 56,
}: ProgressRingProps) {
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(Math.max(progress, 0), 100);
  const offset = circumference - (pct / 100) * circumference;

  return (
    <View className="items-center flex-1">
      <View style={{ width: size, height: size }} className="items-center justify-center mb-1.5">
        <Svg width={size} height={size} style={{ position: "absolute" }}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#1F2630"
            strokeWidth={stroke}
            fill="none"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            rotation={-90}
            origin={`${size / 2}, ${size / 2}`}
          />
        </Svg>
        <Text className="text-white text-xs font-bold">{Math.round(pct)}%</Text>
      </View>
      <Text className="text-slate-400 text-xs">{label}</Text>
      <Text className="text-white text-xs font-semibold mt-0.5">{value}</Text>
    </View>
  );
}
