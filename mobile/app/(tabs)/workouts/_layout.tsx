import { Stack } from "expo-router";
import { colors } from "@/lib/theme";

export default function WorkoutsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="templates" />
      <Stack.Screen name="template-detail" />
      <Stack.Screen name="create-template" />
      <Stack.Screen name="session-detail" />
      <Stack.Screen name="analysis" />
      <Stack.Screen name="analyze-picker" />
    </Stack>
  );
}
