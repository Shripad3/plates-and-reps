import type { ReactNode } from "react";
import { Animated, type StyleProp, type ViewStyle } from "react-native";
import { useKeyboardInset } from "@/hooks/useKeyboardInset";

type AnimatedKeyboardAvoidingViewProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  className?: string;
  enabled?: boolean;
  /** Extra space above the keyboard (e.g. safe area). Keep small to avoid big jumps. */
  extraOffset?: number;
};

/**
 * Smooth keyboard avoidance synced to the system keyboard animation.
 * Prefer this over KeyboardAvoidingView for modals and forms.
 */
export function AnimatedKeyboardAvoidingView({
  children,
  style,
  className,
  enabled = true,
  extraOffset = 0,
}: AnimatedKeyboardAvoidingViewProps) {
  const { animatedInset } = useKeyboardInset(enabled);

  const paddingBottom = Animated.add(animatedInset, extraOffset);

  return (
    <Animated.View className={className} style={[style, { paddingBottom }]}>
      {children}
    </Animated.View>
  );
}
