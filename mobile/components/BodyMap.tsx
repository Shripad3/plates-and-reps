import { View, Text } from "react-native";
import Svg, { Path } from "react-native-svg";
import { colors } from "@/lib/theme";
import { BODY, type BodySide } from "./bodyMapData";

export type BodySex = "male" | "female";

/**
 * Anatomical front/back muscle map. Each muscle is filled by the analysis
 * engine's per-muscle intensity (0 = untrained → 5 = high volume) on a
 * gray→orange heatmap. Rendered on-device with react-native-svg using vendored
 * MIT-licensed anatomy paths (bodyMapData.ts) — no external assets or services.
 */

// Heat ramp: untrained (surface) → brand orange, indexed by intensity 0..5.
const HEAT = ["#232B33", "#4A3326", "#7A4327", "#B0552B", "#E8743B", "#FF8A4C"];
const BASE = colors.surface.elevated;
const OUTLINE = colors.surface.border;

function heat(intensity: number): string {
  const i = Math.max(0, Math.min(5, Math.round(intensity)));
  return i === 0 ? BASE : HEAT[i];
}

type Intensity = Record<string, number>;

// Library muscle slug → our MUSCLE_GROUPS key. Slugs not listed (head, neck,
// hands, feet, knees, adductors, tibialis, hair…) render as plain body.
const SLUG_TO_GROUP: Record<string, string> = {
  chest: "chest",
  deltoids: "shoulders",
  biceps: "biceps",
  triceps: "triceps",
  forearm: "forearms",
  abs: "core",
  obliques: "core",
  quadriceps: "quads",
  calves: "calves",
  trapezius: "back",
  "upper-back": "back",
  "lower-back": "back",
  gluteal: "glutes",
  hamstring: "hamstrings",
};

function fillFor(slug: string, intensity: Intensity): string {
  const group = SLUG_TO_GROUP[slug];
  return group ? heat(intensity[group] ?? 0) : BASE;
}

function Figure({ side, intensity }: { side: BodySide; intensity: Intensity }) {
  return (
    <Svg width={118} height={236} viewBox={side.viewBox}>
      {side.parts.map((part, i) => {
        const fill = fillFor(part.slug, intensity);
        const ds = [...(part.path.left ?? []), ...(part.path.right ?? []), ...(part.path.common ?? [])];
        return ds.map((d, j) => <Path key={`${i}-${j}`} d={d} fill={fill} />);
      })}
      <Path d={side.outline} fill="none" stroke={OUTLINE} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </Svg>
  );
}

export function BodyMap({ intensity, sex = "male" }: { intensity: Intensity; sex?: BodySex }) {
  const model = BODY[sex];
  return (
    <View>
      <View className="flex-row justify-around items-start">
        <View className="items-center">
          <Figure side={model.front} intensity={intensity} />
          <Text className="text-slate-400 text-xs mt-1">Front</Text>
        </View>
        <View className="items-center">
          <Figure side={model.back} intensity={intensity} />
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
