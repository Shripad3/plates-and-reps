import { Alert } from "react-native";
import { navigateToPaywall } from "@/lib/navigateToPaywall";

export function isLimitReachedError(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  if (code === "LIMIT_REACHED") return true;
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();
  return (
    msg.includes("LIMIT_REACHED") ||
    lower.includes("daily limit") ||
    lower.includes("limit reached") ||
    lower.includes("free tier")
  );
}

export function showLimitReachedAlert(featureLabel: string) {
  Alert.alert(
    "Daily limit reached",
    `You've used all your free ${featureLabel} for today. Upgrade to Premium for unlimited access.`,
    [
      { text: "Not now", style: "cancel" },
      { text: "Upgrade", onPress: navigateToPaywall },
    ]
  );
}
