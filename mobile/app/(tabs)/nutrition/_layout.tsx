import { Stack } from "expo-router";
import { colors } from "@/lib/theme";

export default function NutritionLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="log" />
      <Stack.Screen name="barcode" />
    </Stack>
  );
}
