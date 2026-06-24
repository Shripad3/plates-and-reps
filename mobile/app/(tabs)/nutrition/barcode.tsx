import { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
  Modal,
  ActivityIndicator,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import Constants from "expo-constants";
import { router, useLocalSearchParams } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFoodBarcode, useLogFood } from "@/hooks/useNutrition";
import { MEAL_TYPES, type MealType } from "@/constants";
import { todayLocal } from "@/lib/dates";
import type { Food } from "@/types";
import { SwipeBackGesture } from "@/components/SwipeBackGesture";
import { EmptyState } from "@/components/EmptyState";
import { MealDot } from "@/components/ui/IconButton";
import { MEAL_COLORS } from "@/lib/mealColors";

const isExpoGo = Constants.appOwnership === "expo";

function ExpoGoNotice() {
  return (
    <View className="flex-1 bg-surface items-center justify-center px-8">
      <EmptyState
        icon="camera-outline"
        title="Dev build required"
        description="Barcode scanning requires a custom development build. Run npx expo run:ios to build a dev client, then scan barcodes from there."
        actionLabel="Go back"
        onAction={() => router.back()}
      />
    </View>
  );
}

function MealPicker({
  onSelect,
  onBack,
}: {
  onSelect: (meal: MealType) => void;
  onBack: () => void;
}) {
  return (
    <SwipeBackGesture>
    <SafeAreaView className="flex-1 bg-surface">
      <View className="px-5 pt-4 pb-3 flex-row items-center">
        <TouchableOpacity onPress={onBack}>
          <Text className="text-brand-400 text-base">← Back</Text>
        </TouchableOpacity>
      </View>
      <View className="flex-1 px-6 justify-center">
        <Text className="text-white text-2xl font-bold text-center mb-2">
          Which meal?
        </Text>
        <Text className="text-slate-400 text-center mb-8">
          Choose where to log this scanned item.
        </Text>
        <View className="gap-3">
          {MEAL_TYPES.map((meal) => (
            <TouchableOpacity
              key={meal}
              className="bg-surface-card border border-surface-border rounded-xl px-5 py-4 flex-row items-center gap-4"
              onPress={() => onSelect(meal)}
            >
              <MealDot color={MEAL_COLORS[meal]} />
              <Text className="text-white text-lg font-semibold capitalize flex-1">
                {meal}
              </Text>
              <Text className="text-brand-400 text-xl">→</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </SafeAreaView>
    </SwipeBackGesture>
  );
}

function LogConfirmModal({
  food,
  selectedMeal,
  onMealChange,
  onCancel,
  onLog,
  isLogging,
}: {
  food: Food;
  selectedMeal: MealType;
  onMealChange: (meal: MealType) => void;
  onCancel: () => void;
  onLog: () => void;
  isLogging: boolean;
}) {
  return (
    <Modal visible transparent animationType="slide">
      <View className="flex-1 bg-black/70 justify-end">
        <View className="bg-surface rounded-t-3xl px-5 pt-5 pb-10">
          <Text className="text-white text-xl font-bold mb-1">{food.name}</Text>
          {food.brand && (
            <Text className="text-slate-400 text-sm mb-3">{food.brand}</Text>
          )}
          <Text className="text-slate-300 text-sm mb-5">
            {Math.round(food.calories_per_serving)} kcal · {food.protein_g}g P ·{" "}
            {food.carbs_g}g C · {food.fat_g}g F per {food.serving_label}
          </Text>

          <Text className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">
            Log to meal
          </Text>
          <View className="flex-row flex-wrap gap-2 mb-6">
            {MEAL_TYPES.map((meal) => (
              <TouchableOpacity
                key={meal}
                className={`rounded-xl px-4 py-2.5 flex-row items-center gap-2 border ${
                  selectedMeal === meal
                    ? "bg-brand-500 border-brand-500"
                    : "bg-surface-card border-surface-border"
                }`}
                onPress={() => onMealChange(meal)}
              >
                <MealDot color={MEAL_COLORS[meal]} />
                <Text
                  className={`font-medium capitalize ${
                    selectedMeal === meal ? "text-white" : "text-slate-300"
                  }`}
                >
                  {meal}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View className="flex-row gap-3">
            <TouchableOpacity
              className="flex-1 bg-surface-card rounded-xl py-4 items-center"
              onPress={onCancel}
              disabled={isLogging}
            >
              <Text className="text-slate-300 font-semibold">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 bg-brand-500 rounded-xl py-4 items-center"
              onPress={onLog}
              disabled={isLogging}
            >
              {isLogging ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-semibold">Log 1 Serving</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function BarcodeScannerContent() {
  const { date, mealType: initialMealType } = useLocalSearchParams<{
    date: string;
    mealType?: MealType;
  }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [selectedMeal, setSelectedMeal] = useState<MealType | null>(
    initialMealType ?? null
  );
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [pendingFood, setPendingFood] = useState<Food | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);

  const { data: food, isLoading } = useFoodBarcode(scannedCode);
  const logFood = useLogFood();

  useFocusEffect(
    useCallback(() => {
      setScannedCode(null);
      setPendingFood(null);
      setIsCameraReady(false);
      setSelectedMeal(initialMealType ?? null);
      return undefined;
    }, [initialMealType])
  );

  function handleCancelConfirm() {
    setScannedCode(null);
    setPendingFood(null);
  }

  async function handleLogFood() {
    if (!pendingFood || !selectedMeal) return;
    try {
      await logFood.mutateAsync({
        food_id: pendingFood.id,
        food_name: pendingFood.name,
        meal_type: selectedMeal,
        date: date ?? todayLocal(),
        servings: 1,
        calories: pendingFood.calories_per_serving,
        protein_g: pendingFood.protein_g,
        carbs_g: pendingFood.carbs_g,
        fat_g: pendingFood.fat_g,
        log_method: "barcode",
        notes: null,
      });
      setScannedCode(null);
      setPendingFood(null);
      router.back();
    } catch (err: unknown) {
      Alert.alert("Error", (err as Error).message ?? "Could not log food.");
    }
  }

  useEffect(() => {
    if (food && selectedMeal) {
      setPendingFood(food);
    }
  }, [food, selectedMeal]);

  if (!selectedMeal) {
    return (
      <MealPicker
        onSelect={setSelectedMeal}
        onBack={() => router.back()}
      />
    );
  }

  if (!permission) {
    return <View className="flex-1 bg-surface" />;
  }

  if (!permission.granted) {
    return (
      <View className="flex-1 bg-surface items-center justify-center px-6">
        <Text className="text-white text-xl font-bold text-center mb-4">Camera Access Needed</Text>
        <Text className="text-slate-400 text-center mb-6">
          We need camera access to scan food barcodes.
        </Text>
        <TouchableOpacity
          className="bg-brand-500 rounded-xl px-6 py-3.5"
          onPress={requestPermission}
        >
          <Text className="text-white font-semibold">Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SwipeBackGesture>
    <View className="flex-1 bg-black">
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: [
            "ean13",
            "ean8",
            "upc_a",
            "upc_e",
            "code128",
            "code39",
            "code93",
            "codabar",
            "itf14",
            "datamatrix",
            "pdf417",
            "aztec",
            "qr",
          ],
        }}
        onBarcodeScanned={scannedCode ? undefined : ({ data }) => setScannedCode(data)}
        onCameraReady={() => setIsCameraReady(true)}
      />

      <View className="absolute top-14 left-5 right-5 gap-2">
        <TouchableOpacity
          className="bg-black/50 rounded-full px-4 py-2 self-start"
          onPress={() => router.back()}
        >
          <Text className="text-white">← Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="bg-black/60 rounded-xl px-4 py-3 flex-row items-center justify-between"
          onPress={() => {
            setScannedCode(null);
            setPendingFood(null);
            setSelectedMeal(null);
          }}
        >
          <View className="flex-row items-center gap-2">
            <MealDot color={MEAL_COLORS[selectedMeal]} />
            <Text className="text-white font-medium capitalize">
              Logging to {selectedMeal}
            </Text>
          </View>
          <Text className="text-brand-400 text-sm">Change</Text>
        </TouchableOpacity>
      </View>

      {/* Overlay */}
      <View className="absolute inset-0 items-center justify-center pointer-events-none">
        <View className="w-72 h-40 border-2 border-brand-400 rounded-2xl" />
        <Text className="text-white text-sm mt-4 bg-black/50 px-4 py-2 rounded-full">
          {!isCameraReady
            ? "Starting camera…"
            : isLoading
            ? "Looking up food…"
            : scannedCode && !food && !isLoading
            ? "Product not found — try searching manually"
            : "Point camera at barcode"}
        </Text>
      </View>

      {scannedCode && !food && !isLoading && (
        <TouchableOpacity
          className="absolute self-center bottom-28 bg-brand-500/80 rounded-full px-5 py-2"
          onPress={() => { setScannedCode(null); setPendingFood(null); }}
        >
          <Text className="text-white text-sm font-medium">Scan again</Text>
        </TouchableOpacity>
      )}

      {pendingFood && (
        <LogConfirmModal
          food={pendingFood}
          selectedMeal={selectedMeal}
          onMealChange={setSelectedMeal}
          onCancel={handleCancelConfirm}
          onLog={handleLogFood}
          isLogging={logFood.isPending}
        />
      )}
    </View>
    </SwipeBackGesture>
  );
}

export default function BarcodeScannerScreen() {
  if (isExpoGo) return <ExpoGoNotice />;
  return <BarcodeScannerContent />;
}
