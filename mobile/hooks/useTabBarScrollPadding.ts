import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getTabScrollPadding } from "@/components/FloatingTabBar";

export function useTabBarScrollPadding() {
  const insets = useSafeAreaInsets();
  return getTabScrollPadding(insets);
}
