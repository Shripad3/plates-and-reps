import { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SwipeBackGesture } from "@/components/SwipeBackGesture";
import { Card, Section, SectionTitle } from "@/components/ui/Card";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { Skeleton } from "@/components/ui/Skeleton";
import { BodyMap } from "@/components/BodyMap";
import { colors } from "@/lib/theme";
import { analyzeWorkoutTemplate, type AnalysisReport } from "@/lib/workoutAnalysis";

const label = (m: string) => m.charAt(0).toUpperCase() + m.slice(1).replace(/_/g, " ");
const scoreColor = (s: number) => (s >= 70 ? colors.success : s >= 45 ? colors.macro.fat : colors.danger);

function SubScoreBar({ name, value }: { name: string; value: number }) {
  return (
    <View className="mb-3">
      <View className="flex-row justify-between mb-1">
        <Text className="text-slate-300 text-sm">{name}</Text>
        <Text className="text-slate-400 text-sm font-semibold">{value}</Text>
      </View>
      <View className="h-2 bg-surface-elevated rounded-full overflow-hidden">
        <View style={{ width: `${value}%`, height: "100%", backgroundColor: scoreColor(value), borderRadius: 999 }} />
      </View>
    </View>
  );
}

function AnalysisSkeleton() {
  return (
    <View className="px-5" style={{ gap: 16 }}>
      <View className="items-center py-4" style={{ gap: 12 }}>
        <Skeleton width={120} height={120} radius={60} />
        <Skeleton width={200} height={14} />
      </View>
      <Card style={{ gap: 12 }}>
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={12} />)}
      </Card>
      <Skeleton height={240} radius={16} />
      <Card style={{ gap: 10 }}>{[0, 1, 2].map((i) => <Skeleton key={i} height={12} />)}</Card>
    </View>
  );
}

export default function WorkoutAnalysisScreen() {
  // Use a distinct param name (`routineId`, not `templateId`) so this sibling
  // route doesn't collide with template-detail's `templateId` in the same stack
  // and wipe it on back-navigation.
  const { routineId: templateId } = useLocalSearchParams<{ routineId?: string }>();
  const [phase, setPhase] = useState<"loading" | "done" | "limit" | "error">("loading");
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!templateId) { setPhase("error"); setMessage("No workout selected."); return; }
      const result = await analyzeWorkoutTemplate(templateId);
      if (cancelled) return;
      if (result.ok) { setReport(result.report); setPhase("done"); }
      else if (result.code === "LIMIT_REACHED") { setMessage(result.message); setPhase("limit"); }
      else { setMessage(result.message); setPhase("error"); }
    })();
    return () => { cancelled = true; };
  }, [templateId]);

  return (
    <SwipeBackGesture>
      <SafeAreaView className="flex-1 bg-surface" edges={["top"]}>
        <ScreenHeader title="Workout Analysis" />

        {phase === "loading" && <AnalysisSkeleton />}

        {phase === "limit" && (
          <View className="flex-1 items-center justify-center px-8" style={{ gap: 16 }}>
            <Ionicons name="sparkles" size={44} color={colors.brand[400]} />
            <Text className="text-white text-xl font-bold text-center">You're out of free analyses</Text>
            <Text className="text-slate-400 text-center leading-6">{message}</Text>
            <TouchableOpacity className="bg-brand-500 rounded-full px-6 py-3 mt-2" onPress={() => router.push("/paywall" as Href)}>
              <Text className="text-white font-semibold">Upgrade for unlimited reviews</Text>
            </TouchableOpacity>
          </View>
        )}

        {phase === "error" && (
          <View className="flex-1 items-center justify-center px-8" style={{ gap: 12 }}>
            <Ionicons name="alert-circle-outline" size={40} color={colors.text.muted} />
            <Text className="text-slate-300 text-center">{message || "Something went wrong."}</Text>
            <TouchableOpacity className="py-3" onPress={() => router.back()}>
              <Text className="text-brand-400">Go back</Text>
            </TouchableOpacity>
          </View>
        )}

        {phase === "done" && report && <Report report={report} />}
      </SafeAreaView>
    </SwipeBackGesture>
  );
}

function Report({ report }: { report: AnalysisReport }) {
  const { analysis: a, narration: n, workoutName } = report;
  const s = a.subScores;
  const maxVol = Math.max(1, ...a.coverage.trained.map((m) => a.muscleVolume[m] ?? 0));

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      <View className="px-5 pt-2 pb-1">
        <Text className="text-white text-2xl font-bold tracking-tight">{workoutName}</Text>
      </View>

      {/* Hero: score + verdict */}
      <Section className="mt-2">
        <Card className="items-center py-6">
          <ProgressRing
            label="Overall"
            value={`${(a.score / 10).toFixed(1)}`}
            progress={a.score}
            color={scoreColor(a.score)}
            size={128}
            animated
          />
          {n.verdict ? <Text className="text-slate-200 text-center text-base mt-4 leading-6">{n.verdict}</Text> : null}
          <View className="flex-row mt-4" style={{ gap: 20 }}>
            <Stat label="Exercises" value={String(a.exerciseCount)} />
            <Stat label="Sets" value={String(a.totalWorkingSets)} />
            <Stat label="~Min" value={String(a.estDurationMin)} />
          </View>
        </Card>
      </Section>

      {/* Sub-scores */}
      <Section className="mt-6">
        <SectionTitle>Breakdown</SectionTitle>
        <Card>
          <SubScoreBar name="Balance" value={s.balance} />
          <SubScoreBar name="Volume" value={s.volume} />
          <SubScoreBar name="Goal fit" value={s.goalFit} />
          {s.safety != null && <SubScoreBar name="Safety" value={s.safety} />}
          {s.progression != null && <SubScoreBar name="Progression" value={s.progression} />}
        </Card>
      </Section>

      {/* Body map */}
      <Section className="mt-6">
        <SectionTitle>Muscle coverage</SectionTitle>
        <Card>
          <BodyMap intensity={a.bodyMapIntensity} />
          {a.coverage.missing.length > 0 && (
            <Text className="text-slate-400 text-sm mt-3 text-center">
              Not trained: {a.coverage.missing.map(label).join(", ")}
            </Text>
          )}
        </Card>
      </Section>

      {/* Volume by muscle */}
      {a.coverage.trained.length > 0 && (
        <Section className="mt-6">
          <SectionTitle>Volume by muscle</SectionTitle>
          <Card style={{ gap: 10 }}>
            {a.coverage.trained
              .slice()
              .sort((m1, m2) => (a.muscleVolume[m2] ?? 0) - (a.muscleVolume[m1] ?? 0))
              .map((m) => {
                const sets = a.muscleVolume[m] ?? 0;
                return (
                  <View key={m}>
                    <View className="flex-row justify-between mb-1">
                      <Text className="text-slate-300 text-sm">{label(m)}</Text>
                      <Text className="text-slate-400 text-sm">{sets} sets</Text>
                    </View>
                    <View className="h-2 bg-surface-elevated rounded-full overflow-hidden">
                      <View style={{ width: `${(sets / maxVol) * 100}%`, height: "100%", backgroundColor: colors.brand[500], borderRadius: 999 }} />
                    </View>
                  </View>
                );
              })}
          </Card>
        </Section>
      )}

      {/* Balance flags */}
      {a.balance.flags.length > 0 && (
        <Section className="mt-6">
          <SectionTitle>Balance</SectionTitle>
          <Card style={{ gap: 8 }}>
            {a.balance.flags.map((f, i) => (
              <View key={i} className="flex-row items-start" style={{ gap: 8 }}>
                <Ionicons name="swap-horizontal" size={16} color={colors.macro.fat} style={{ marginTop: 2 }} />
                <Text className="text-slate-300 text-sm flex-1">{f}</Text>
              </View>
            ))}
          </Card>
        </Section>
      )}

      {/* Safety */}
      {a.safety.flags.length > 0 && (
        <Section className="mt-6">
          <SectionTitle>Injury watch</SectionTitle>
          <Card style={{ gap: 8 }}>
            {a.safety.flags.map((f, i) => (
              <View key={i} className="flex-row items-start" style={{ gap: 8 }}>
                <Ionicons name="warning-outline" size={16} color={colors.danger} style={{ marginTop: 2 }} />
                <Text className="text-slate-300 text-sm flex-1">
                  <Text className="text-white font-medium">{label(f.injury)}: </Text>
                  {f.exercises.join(", ")}
                </Text>
              </View>
            ))}
          </Card>
        </Section>
      )}

      {/* Progression */}
      {a.progression.some((p) => p.trend !== "insufficient") && (
        <Section className="mt-6">
          <SectionTitle>Progression (last 4 weeks)</SectionTitle>
          <Card style={{ gap: 10 }}>
            {a.progression.filter((p) => p.trend !== "insufficient").map((p) => (
              <View key={p.exercise_id} className="flex-row items-center justify-between">
                <Text className="text-slate-300 text-sm flex-1 mr-2">{p.name}</Text>
                <TrendChip trend={p.trend as "up" | "flat" | "down"} />
              </View>
            ))}
          </Card>
        </Section>
      )}

      {/* Strengths */}
      {n.strengths.length > 0 && (
        <Section className="mt-6">
          <SectionTitle>What's working</SectionTitle>
          <Card style={{ gap: 8 }}>
            {n.strengths.map((t, i) => (
              <View key={i} className="flex-row items-start" style={{ gap: 8 }}>
                <Ionicons name="checkmark-circle" size={16} color={colors.success} style={{ marginTop: 2 }} />
                <Text className="text-slate-300 text-sm flex-1">{t}</Text>
              </View>
            ))}
          </Card>
        </Section>
      )}

      {/* Recommendations */}
      {n.recommendations.length > 0 && (
        <Section className="mt-6">
          <SectionTitle>Top recommendations</SectionTitle>
          <Card style={{ gap: 10 }}>
            {n.recommendations.map((t, i) => (
              <View key={i} className="flex-row items-start" style={{ gap: 10 }}>
                <View className="w-6 h-6 rounded-full bg-brand-500/20 items-center justify-center">
                  <Text className="text-brand-400 text-xs font-bold">{i + 1}</Text>
                </View>
                <Text className="text-slate-200 text-sm flex-1 leading-5">{t}</Text>
              </View>
            ))}
          </Card>
        </Section>
      )}

      <Text className="text-slate-600 text-xs text-center px-8 mt-6">
        General fitness guidance, not medical advice. Estimates are best-effort.
      </Text>
    </ScrollView>
  );
}

function Stat({ label: l, value }: { label: string; value: string }) {
  return (
    <View className="items-center">
      <Text className="text-white text-lg font-bold">{value}</Text>
      <Text className="text-slate-500 text-xs mt-0.5">{l}</Text>
    </View>
  );
}

function TrendChip({ trend }: { trend: "up" | "flat" | "down" }) {
  const cfg = {
    up: { icon: "trending-up" as const, color: colors.success, text: "Progressing" },
    flat: { icon: "remove" as const, color: colors.text.muted, text: "Flat" },
    down: { icon: "trending-down" as const, color: colors.danger, text: "Down" },
  }[trend];
  return (
    <View className="flex-row items-center" style={{ gap: 4 }}>
      <Ionicons name={cfg.icon} size={15} color={cfg.color} />
      <Text style={{ color: cfg.color }} className="text-xs font-medium">{cfg.text}</Text>
    </View>
  );
}
