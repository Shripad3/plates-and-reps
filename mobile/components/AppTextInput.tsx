import { TextInput, type TextInputProps, StyleSheet } from "react-native";
import { colors, fontSize } from "@/lib/theme";

type Variant = "default" | "compact" | "chat";

const VARIANTS: Record<Variant, object> = {
  default: {
    fontSize: fontSize.body,
    lineHeight: 22,
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: 16,
    minHeight: 48,
  },
  compact: {
    fontSize: fontSize.label,
    lineHeight: 20,
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 12,
    minHeight: 40,
  },
  chat: {
    fontSize: fontSize.body,
    lineHeight: 22,
    paddingTop: 10,
    paddingBottom: 10,
    paddingHorizontal: 0,
    minHeight: 44,
  },
};

type AppTextInputProps = TextInputProps & {
  className?: string;
  variant?: Variant;
};

/** TextInput with line-height/padding that prevents descenders from being clipped. */
export function AppTextInput({
  className = "bg-surface-card text-white rounded-xl border border-surface-border",
  variant = "default",
  style,
  placeholderTextColor = colors.text.muted,
  multiline,
  ...props
}: AppTextInputProps) {
  return (
    <TextInput
      className={className}
      style={[
        VARIANTS[variant],
        multiline ? (variant === "chat" ? styles.multilineChat : styles.multiline) : null,
        style,
      ]}
      placeholderTextColor={placeholderTextColor}
      multiline={multiline}
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  multiline: {
    minHeight: 96,
    textAlignVertical: "top",
  },
  multilineChat: {
    maxHeight: 112,
    textAlignVertical: "top",
  },
});
