import type { ReactNode } from "react";
import { View, Text } from "react-native";
import Svg, { Circle, Rect, Ellipse, G } from "react-native-svg";
import { colors } from "@/lib/theme";

/**
 * Stylised front/back muscle map. Each muscle group is a simple SVG zone whose
 * fill is driven by the analysis engine's per-muscle intensity (0 = untrained →
 * 5 = high volume). Rendered entirely on-device with react-native-svg — no
 * external assets or services. Not anatomically exact by design; it reads as a
 * clean heatmap of what a workout hits.
 */

// Heat ramp: untrained (surface) → brand orange. Indexed by intensity 0..5.
const HEAT = ["#232B33", "#4A3326", "#7A4327", "#B0552B", "#E8743B", "#FF8A4C"];
const BASE = colors.surface.elevated;

function heat(intensity: number): string {
  const i = Math.max(0, Math.min(5, Math.round(intensity)));
  return i === 0 ? BASE : HEAT[i];
}

type Intensity = Record<string, number>;

/** One muscle zone; falls back to base colour when the group has no volume. */
function Zone({ m, intensity, children }: { m: string; intensity: Intensity; children: (fill: string) => ReactNode }) {
  return <>{children(heat(intensity[m] ?? 0))}</>;
}

function FrontFigure({ intensity }: { intensity: Intensity }) {
  return (
    <Svg width={120} height={230} viewBox="0 0 120 230">
      {/* base silhouette */}
      <G>
        <Circle cx={60} cy={16} r={11} fill={BASE} />
        <Rect x={40} y={32} width={40} height={74} rx={14} fill={BASE} />
        <Rect x={22} y={40} width={14} height={64} rx={7} fill={BASE} />
        <Rect x={84} y={40} width={14} height={64} rx={7} fill={BASE} />
        <Rect x={42} y={108} width={15} height={108} rx={7} fill={BASE} />
        <Rect x={63} y={108} width={15} height={108} rx={7} fill={BASE} />
      </G>
      {/* shoulders */}
      <Zone m="shoulders" intensity={intensity}>{(f) => <><Ellipse cx={37} cy={44} rx={9} ry={8} fill={f} /><Ellipse cx={83} cy={44} rx={9} ry={8} fill={f} /></>}</Zone>
      {/* chest */}
      <Zone m="chest" intensity={intensity}>{(f) => <><Rect x={41} y={40} width={17} height={20} rx={6} fill={f} /><Rect x={62} y={40} width={17} height={20} rx={6} fill={f} /></>}</Zone>
      {/* biceps */}
      <Zone m="biceps" intensity={intensity}>{(f) => <><Ellipse cx={29} cy={64} rx={6} ry={11} fill={f} /><Ellipse cx={91} cy={64} rx={6} ry={11} fill={f} /></>}</Zone>
      {/* forearms */}
      <Zone m="forearms" intensity={intensity}>{(f) => <><Ellipse cx={29} cy={92} rx={6} ry={11} fill={f} /><Ellipse cx={91} cy={92} rx={6} ry={11} fill={f} /></>}</Zone>
      {/* core */}
      <Zone m="core" intensity={intensity}>{(f) => <Rect x={50} y={63} width={20} height={40} rx={6} fill={f} />}</Zone>
      {/* quads */}
      <Zone m="quads" intensity={intensity}>{(f) => <><Rect x={43} y={112} width={13} height={50} rx={6} fill={f} /><Rect x={64} y={112} width={13} height={50} rx={6} fill={f} /></>}</Zone>
      {/* calves */}
      <Zone m="calves" intensity={intensity}>{(f) => <><Rect x={44} y={176} width={11} height={38} rx={5} fill={f} /><Rect x={65} y={176} width={11} height={38} rx={5} fill={f} /></>}</Zone>
    </Svg>
  );
}

function BackFigure({ intensity }: { intensity: Intensity }) {
  return (
    <Svg width={120} height={230} viewBox="0 0 120 230">
      <G>
        <Circle cx={60} cy={16} r={11} fill={BASE} />
        <Rect x={40} y={32} width={40} height={74} rx={14} fill={BASE} />
        <Rect x={22} y={40} width={14} height={64} rx={7} fill={BASE} />
        <Rect x={84} y={40} width={14} height={64} rx={7} fill={BASE} />
        <Rect x={42} y={108} width={15} height={108} rx={7} fill={BASE} />
        <Rect x={63} y={108} width={15} height={108} rx={7} fill={BASE} />
      </G>
      {/* rear delts */}
      <Zone m="shoulders" intensity={intensity}>{(f) => <><Ellipse cx={37} cy={44} rx={9} ry={8} fill={f} /><Ellipse cx={83} cy={44} rx={9} ry={8} fill={f} /></>}</Zone>
      {/* back (lats/traps) */}
      <Zone m="back" intensity={intensity}>{(f) => <Rect x={42} y={40} width={36} height={34} rx={8} fill={f} />}</Zone>
      {/* triceps */}
      <Zone m="triceps" intensity={intensity}>{(f) => <><Ellipse cx={29} cy={64} rx={6} ry={11} fill={f} /><Ellipse cx={91} cy={64} rx={6} ry={11} fill={f} /></>}</Zone>
      {/* forearms */}
      <Zone m="forearms" intensity={intensity}>{(f) => <><Ellipse cx={29} cy={92} rx={6} ry={11} fill={f} /><Ellipse cx={91} cy={92} rx={6} ry={11} fill={f} /></>}</Zone>
      {/* glutes */}
      <Zone m="glutes" intensity={intensity}>{(f) => <Rect x={44} y={104} width={32} height={22} rx={10} fill={f} />}</Zone>
      {/* hamstrings */}
      <Zone m="hamstrings" intensity={intensity}>{(f) => <><Rect x={43} y={130} width={13} height={44} rx={6} fill={f} /><Rect x={64} y={130} width={13} height={44} rx={6} fill={f} /></>}</Zone>
      {/* calves */}
      <Zone m="calves" intensity={intensity}>{(f) => <><Rect x={44} y={178} width={11} height={38} rx={5} fill={f} /><Rect x={65} y={178} width={11} height={38} rx={5} fill={f} /></>}</Zone>
    </Svg>
  );
}

export function BodyMap({ intensity }: { intensity: Intensity }) {
  return (
    <View>
      <View className="flex-row justify-around items-start">
        <View className="items-center">
          <FrontFigure intensity={intensity} />
          <Text className="text-slate-400 text-xs mt-1">Front</Text>
        </View>
        <View className="items-center">
          <BackFigure intensity={intensity} />
          <Text className="text-slate-400 text-xs mt-1">Back</Text>
        </View>
      </View>
      {/* legend */}
      <View className="flex-row items-center justify-center mt-3" style={{ gap: 6 }}>
        <Text className="text-slate-500 text-[10px]">Less</Text>
        {HEAT.map((c) => (
          <View key={c} style={{ width: 16, height: 8, borderRadius: 2, backgroundColor: c }} />
        ))}
        <Text className="text-slate-500 text-[10px]">More</Text>
      </View>
    </View>
  );
}
