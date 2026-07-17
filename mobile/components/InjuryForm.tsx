import { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { AppTextInput } from "@/components/AppTextInput";
import { Button } from "@/components/ui/Button";
import { INJURY_AREAS, INJURY_MOVEMENTS } from "@/constants";
import { colors } from "@/lib/theme";
import type { InjuryInfo } from "@/lib/aiPlan";

function labelize(v: string): string {
  return v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className={`rounded-full px-3.5 py-2 mr-2 mb-2 border ${
        active ? "bg-brand-500 border-brand-500" : "bg-surface-card border-surface-border"
      }`}
    >
      <Text className={`text-sm ${active ? "text-white font-medium" : "text-slate-300"}`}>
        {labelize(label)}
      </Text>
    </TouchableOpacity>
  );
}

export function InjuryForm({
  onSubmit,
  onSkip,
  submitting = false,
  saveLabel = "Save",
}: {
  onSubmit: (info: InjuryInfo) => void;
  onSkip: () => void;
  submitting?: boolean;
  saveLabel?: string;
}) {
  const [areas, setAreas] = useState<string[]>([]);
  const [movements, setMovements] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  function handleSave() {
    onSubmit({
      status: "provided",
      areas,
      avoidMovements: movements,
      notes: notes.trim(),
    });
  }

  return (
    <View>
      <Text className="text-slate-400 text-sm mb-2">Any injured or sensitive areas?</Text>
      <View className="flex-row flex-wrap mb-4">
        {INJURY_AREAS.map((a) => (
          <Chip key={a} label={a} active={areas.includes(a)} onPress={() => toggle(areas, setAreas, a)} />
        ))}
      </View>

      <Text className="text-slate-400 text-sm mb-2">Movements to avoid?</Text>
      <View className="flex-row flex-wrap mb-4">
        {INJURY_MOVEMENTS.map((m) => (
          <Chip key={m} label={m} active={movements.includes(m)} onPress={() => toggle(movements, setMovements, m)} />
        ))}
      </View>

      <Text className="text-slate-400 text-sm mb-1.5">Anything else? (optional)</Text>
      <AppTextInput
        placeholder="e.g. Left shoulder impingement, avoid heavy overhead work"
        placeholderTextColor={colors.text.muted}
        value={notes}
        onChangeText={setNotes}
        multiline
      />

      <View className="mt-5 gap-2">
        <Button label={saveLabel} onPress={handleSave} loading={submitting} fullWidth />
        <TouchableOpacity className="py-3 items-center" onPress={onSkip} disabled={submitting}>
          <Text className="text-slate-400 text-sm">Skip for now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
