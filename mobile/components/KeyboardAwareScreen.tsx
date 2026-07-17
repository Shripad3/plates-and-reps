import type { ComponentProps, ReactNode } from "react";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

type KeyboardAwareScrollViewProps = ComponentProps<typeof KeyboardAwareScrollView>;

type Props = KeyboardAwareScrollViewProps & {
  children: ReactNode;
};

/**
 * App-wide scroll container for any screen containing text inputs.
 * Keeps the focused field above the keyboard automatically. Requires
 * <KeyboardProvider> at the app root (see app/_layout.tsx).
 *
 * Use this instead of a raw ScrollView on input screens. Do NOT nest it
 * inside a KeyboardAvoidingView — it handles avoidance itself.
 */
export function KeyboardAwareScreen({
  children,
  contentContainerStyle,
  bottomOffset = 20,
  keyboardShouldPersistTaps = "handled",
  showsVerticalScrollIndicator = false,
  ...props
}: Props) {
  return (
    <KeyboardAwareScrollView
      bottomOffset={bottomOffset}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      contentContainerStyle={[{ paddingBottom: 40 }, contentContainerStyle]}
      {...props}
    >
      {children}
    </KeyboardAwareScrollView>
  );
}
