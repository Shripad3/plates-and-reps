import { router } from "expo-router";
import { IconButton } from "@/components/ui/IconButton";

export function CoachHeaderButton() {
  return (
    <IconButton
      icon="sparkles-outline"
      variant="accent"
      accessibilityLabel="Open coach"
      onPress={() => router.push("/chat")}
    />
  );
}
