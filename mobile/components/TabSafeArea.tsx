import type { ReactNode } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { SwipeBackGesture } from "@/components/SwipeBackGesture";

/** Tab screens — skip bottom safe area; floating tab bar handles that inset. */
export function TabSafeArea({ children }: { children: ReactNode }) {
  return (
    <SwipeBackGesture>
      <SafeAreaView className="flex-1 bg-surface" edges={["top", "left", "right"]}>
        {children}
      </SafeAreaView>
    </SwipeBackGesture>
  );
}
