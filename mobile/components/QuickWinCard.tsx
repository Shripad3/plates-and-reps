import { useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { Card, Section } from "@/components/ui/Card";
import { useLogFood } from "@/hooks/useNutrition";
import { todayLocal } from "@/lib/dates";
import { colors } from "@/lib/theme";

type QuickFood = {
  id: string;
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  icon: keyof typeof Ionicons.glyphMap;
};

const QUICK_WIN_FOODS: QuickFood[] = [
  { id: "coffee", name: "Coffee", calories: 2, protein_g: 0.3, carbs_g: 0, fat_g: 0, icon: "cafe-outline" },
  { id: "banana", name: "Banana", calories: 105, protein_g: 1.3, carbs_g: 27, fat_g: 0.4, icon: "nutrition-outline" },
  { id: "greek-yogurt", name: "Greek yogurt", calories: 100, protein_g: 17, carbs_g: 6, fat_g: 0.7, icon: "restaurant-outline" },
  { id: "protein-shake", name: "Protein shake", calories: 160, protein_g: 30, carbs_g: 4, fat_g: 3, icon: "barbell-outline" },
];

type Props = {
  onLogged?: () => void;
};

export function QuickWinCard({ onLogged }: Props) {
  const logFood = useLogFood();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);

  const celebScale = useSharedValue(0.85);
  const celebOpacity = useSharedValue(0);

  const celebStyle = useAnimatedStyle(() => ({
    transform: [{ scale: celebScale.value }],
    opacity: celebOpacity.value,
  }));

  function handleTap(food: QuickFood) {
    if (loadingId || succeeded) return;
    setLoadingId(food.id);

    logFood.mutate(
      {
        food_id: null,
        food_name: food.name,
        meal_type: "snack",
        date: todayLocal(),
        servings: 1,
        calories: food.calories,
        protein_g: food.protein_g,
        carbs_g: food.carbs_g,
        fat_g: food.fat_g,
        log_method: "manual",
        notes: null,
      },
      {
        onSuccess: () => {
          setLoadingId(null);
          setSucceeded(true);
          celebScale.value = withSequence(
            withTiming(1.06, { duration: 180 }),
            withTiming(1, { duration: 150 })
          );
          celebOpacity.value = withTiming(1, { duration: 200 });
          onLogged?.();
        },
        onError: () => {
          setLoadingId(null);
        },
      }
    );
  }

  return (
    <Section className="mt-6">
      <Card>
        <Text style={{ fontSize: 17, fontWeight: "700", color: "#F2EFE9", letterSpacing: -0.3, marginBottom: 4 }}>Get an instant win</Text>
        <Text style={{ fontSize: 12, color: "#6B7178", marginBottom: 16 }}>
          Log your first meal in one tap to start your streak.
        </Text>

        {succeeded ? (
          <Animated.View style={celebStyle} className="flex-row items-center gap-3 py-1">
            <View className="w-10 h-10 rounded-xl bg-brand-500/12 items-center justify-center">
              <Text style={{ fontSize: 20 }}>🔥</Text>
            </View>
            <View className="flex-1">
              <Text className="text-white font-semibold">Day 1 streak started!</Text>
              <Text className="text-slate-400 text-xs mt-0.5">
                Come back tomorrow to keep it going.
              </Text>
            </View>
          </Animated.View>
        ) : (
          <View className="gap-2">
            {[QUICK_WIN_FOODS.slice(0, 2), QUICK_WIN_FOODS.slice(2, 4)].map((row, ri) => (
              <View key={ri} className="flex-row gap-2">
                {row.map((food) => {
                  const loading = loadingId === food.id;
                  const disabled = !!loadingId;
                  return (
                    <TouchableOpacity
                      key={food.id}
                      className={`flex-1 flex-row items-center gap-2 rounded-xl px-3 py-2.5 border border-surface-border bg-surface-elevated ${disabled && !loading ? "opacity-40" : ""}`}
                      onPress={() => handleTap(food)}
                      disabled={disabled}
                      activeOpacity={0.7}
                    >
                      {loading ? (
                        <ActivityIndicator size="small" color={colors.brand[400]} />
                      ) : (
                        <Ionicons name={food.icon} size={16} color={colors.brand[400]} />
                      )}
                      <View className="flex-1">
                        <Text className="text-white text-xs font-medium" numberOfLines={1}>
                          {food.name}
                        </Text>
                        <Text className="text-slate-500 text-[10px]">{food.calories} kcal</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        )}
      </Card>
    </Section>
  );
}
