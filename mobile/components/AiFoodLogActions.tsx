import { useState } from "react";
import { View, Text, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { Audio } from "expo-av";
import { router } from "expo-router";
import { analyzeFoodPhoto, transcribeVoiceLog } from "@/lib/api";
import { useLogFood } from "@/hooks/useNutrition";
import { MEAL_TYPES, type MealType } from "@/constants";
import { captureError } from "@/lib/errorReporting";
import { isLimitReachedError, showLimitReachedAlert } from "@/lib/limitErrors";
import { resolveVoiceItemMacros } from "@/lib/voiceNutrition";
import { colors } from "@/lib/theme";

type IoniconsName = ComponentProps<typeof Ionicons>["name"];

type AiFoodLogActionsProps = {
  date: string;
};

function pickMealType(onPick: (meal: MealType) => void) {
  Alert.alert("Which meal?", "Choose where to log these items.", [
    ...MEAL_TYPES.map((meal) => ({
      text: meal.charAt(0).toUpperCase() + meal.slice(1),
      onPress: () => onPick(meal),
    })),
    { text: "Cancel", style: "cancel" },
  ]);
}

function ToolbarAction({
  icon,
  label,
  onPress,
  loading = false,
  active = false,
  danger = false,
  disabled = false,
}: {
  icon: IoniconsName;
  label: string;
  onPress: () => void;
  loading?: boolean;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  const iconColor = danger ? colors.danger : active ? colors.brand[400] : colors.text.secondary;
  const labelColor = danger ? "text-red-400" : active ? "text-brand-400" : "text-slate-400";

  return (
    <TouchableOpacity
      className="flex-1 items-center py-3 gap-1.5"
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
    >
      <View
        className={`w-10 h-10 rounded-xl items-center justify-center ${
          danger ? "bg-red-500/15" : active ? "bg-brand-500/15" : "bg-surface-elevated"
        }`}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.brand[400]} />
        ) : (
          <Ionicons name={icon} size={20} color={iconColor} />
        )}
      </View>
      <Text className={`text-xs font-medium ${labelColor}`}>{label}</Text>
    </TouchableOpacity>
  );
}

export function AiFoodLogActions({ date }: AiFoodLogActionsProps) {
  const logFood = useLogFood();
  const [isPhotoLoading, setIsPhotoLoading] = useState(false);
  const [isVoiceLoading, setIsVoiceLoading] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);

  async function logAnalyzedItems(
    items: Array<{
      food_id?: string | null;
      name: string;
      calories: number;
      protein_g: number;
      carbs_g: number;
      fat_g: number;
      servings?: number;
      meal_type: MealType;
      log_method: "photo_ai" | "voice";
    }>
  ) {
    for (const item of items) {
      await logFood.mutateAsync({
        food_id: item.food_id ?? null,
        food_name: item.name,
        meal_type: item.meal_type,
        date,
        servings: item.servings ?? 1,
        calories: item.calories,
        protein_g: item.protein_g,
        carbs_g: item.carbs_g,
        fat_g: item.fat_g,
        log_method: item.log_method,
        notes: null,
      });
    }
    Alert.alert("Logged", `Added ${items.length} item${items.length === 1 ? "" : "s"} to your diary.`);
  }

  async function handlePhotoLog() {
    setIsPhotoLoading(true);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Camera needed", "Allow camera access to log food from photos.");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 1,
        allowsEditing: false,
      });

      if (result.canceled || !result.assets[0]?.uri) return;

      // Re-encode to JPEG before sending. iPhone cameras in High Efficiency
      // mode capture HEIC, which the vision model and our server-side validator
      // reject — ImagePicker forwards that as image/heic and the photo log
      // fails ("image_url must be a base64-encoded image").
      const rendered = await ImageManipulator.manipulate(result.assets[0].uri).renderAsync();
      const jpeg = await rendered.saveAsync({
        compress: 0.65,
        format: SaveFormat.JPEG,
        base64: true,
      });
      if (!jpeg.base64) return;

      const items = await analyzeFoodPhoto(jpeg.base64, "image/jpeg");
      if (items.length === 0) {
        Alert.alert("No food found", "Could not identify food in that photo. Try again with better lighting.");
        return;
      }

      pickMealType((meal) => {
        Alert.alert(
          "Log these items?",
          items.map((i) => `• ${i.name} (${Math.round(i.calories)} kcal)`).join("\n"),
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Log",
              onPress: async () => {
                try {
                  await logAnalyzedItems(
                    items.map((item) => ({
                      name: item.name,
                      calories: item.calories,
                      protein_g: item.protein_g,
                      carbs_g: item.carbs_g,
                      fat_g: item.fat_g,
                      meal_type: meal,
                      log_method: "photo_ai",
                    }))
                  );
                } catch (error) {
                  captureError(error, { scope: "photo-log" });
                  Alert.alert("Error", (error as Error).message);
                }
              },
            },
          ]
        );
      });
    } catch (error) {
      captureError(error, { scope: "photo-analysis" });
      if (isLimitReachedError(error)) {
        showLimitReachedAlert("photo food logs");
      } else {
        Alert.alert("Photo log failed", (error as Error).message);
      }
    } finally {
      setIsPhotoLoading(false);
    }
  }

  async function startVoiceRecording() {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Microphone needed", "Allow microphone access for voice logging.");
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      setRecording(rec);
    } catch (error) {
      captureError(error, { scope: "voice-record-start" });
      Alert.alert("Error", "Could not start recording.");
    }
  }

  async function stopVoiceRecording() {
    if (!recording) return;
    setIsVoiceLoading(true);
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);

      if (!uri) throw new Error("No recording found.");

      const parsed = await transcribeVoiceLog(uri);
      if (parsed.items.length === 0) {
        Alert.alert(
          "No food detected",
          parsed.transcript
            ? `Heard: "${parsed.transcript}"\n\nTry describing food and meal more clearly.`
            : "Try saying something like: Log 2 eggs and toast for breakfast."
        );
        return;
      }

      const resolved = await Promise.all(parsed.items.map(resolveVoiceItemMacros));

      Alert.alert(
        "Log voice entry?",
        `${parsed.transcript}\n\n` +
          resolved
            .map(
              (i) =>
                `• ${i.food_name} — ${Math.round(i.calories)} kcal (${i.protein_g.toFixed(0)}p ${i.carbs_g.toFixed(0)}c ${i.fat_g.toFixed(0)}f)`
            )
            .join("\n"),
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Log",
            onPress: async () => {
              try {
                await logAnalyzedItems(
                  parsed.items.map((item, index) => {
                    const macros = resolved[index];
                    return {
                      food_id: macros.food_id,
                      name: macros.food_name,
                      calories: macros.calories,
                      protein_g: macros.protein_g,
                      carbs_g: macros.carbs_g,
                      fat_g: macros.fat_g,
                      servings: macros.servings,
                      meal_type: item.meal_type as MealType,
                      log_method: "voice" as const,
                    };
                  })
                );
              } catch (error) {
                captureError(error, { scope: "voice-log" });
                Alert.alert("Error", (error as Error).message);
              }
            },
          },
        ]
      );
    } catch (error) {
      captureError(error, { scope: "voice-analysis" });
      if (isLimitReachedError(error)) {
        showLimitReachedAlert("voice food logs");
      } else {
        Alert.alert("Voice log failed", (error as Error).message);
      }
    } finally {
      setIsVoiceLoading(false);
    }
  }

  function handleVoicePress() {
    if (recording) {
      stopVoiceRecording();
      return;
    }
    startVoiceRecording();
  }

  function handleScan() {
    router.push({ pathname: "/(tabs)/nutrition/barcode", params: { date } });
  }

  return (
    <View className="mx-5 mb-4 bg-surface-card border border-surface-border rounded-xl flex-row">
      <ToolbarAction
        icon="barcode-outline"
        label="Scan"
        onPress={handleScan}
        disabled={!!recording}
      />
      <View className="w-px bg-surface-border my-3" />
      <ToolbarAction
        icon="camera-outline"
        label="Photo"
        onPress={handlePhotoLog}
        loading={isPhotoLoading}
        disabled={!!recording}
      />
      <View className="w-px bg-surface-border my-3" />
      <ToolbarAction
        icon={recording ? "stop-circle-outline" : "mic-outline"}
        label={recording ? "Stop" : "Voice"}
        onPress={handleVoicePress}
        loading={isVoiceLoading && !recording}
        active={recording}
        danger={recording}
        disabled={isPhotoLoading}
      />
    </View>
  );
}
