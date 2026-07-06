import type { ReactNode } from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/Button";
import { colors, fontSize } from "@/lib/theme";

type IoniconsName = ComponentProps<typeof Ionicons>["name"];

type EmptyStateProps = {
  icon?: IoniconsName;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Compact mode: tighter padding + smaller icon, for inline use within lists. */
  compact?: boolean;
  children?: ReactNode;
};

export function EmptyState({
  icon = "ellipse-outline",
  title,
  description,
  actionLabel,
  onAction,
  compact = false,
  children,
}: EmptyStateProps) {
  const iconSize = compact ? 32 : 52;
  const iconRadius = compact ? 10 : 16;
  const glyphSize = compact ? 16 : 24;

  return (
    <View
      style={{
        alignItems: "center",
        paddingVertical: compact ? 16 : 48,
        paddingHorizontal: compact ? 12 : 20,
      }}
    >
      {/* Icon container */}
      <View
        style={{
          width: iconSize,
          height: iconSize,
          borderRadius: iconRadius,
          backgroundColor: colors.surface.elevated,
          borderWidth: 1,
          borderColor: colors.surface.border,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: compact ? 10 : 16,
        }}
      >
        <Ionicons name={icon} size={glyphSize} color={colors.brand[400]} />
      </View>

      {/* Headline */}
      <Text
        style={{
          fontSize: compact ? fontSize.label : fontSize.body,
          fontWeight: "700",
          color: compact ? colors.text.secondary : colors.text.primary,
          textAlign: "center",
          marginBottom: 4,
          letterSpacing: -0.2,
        }}
      >
        {title}
      </Text>

      {/* Subtext */}
      {description ? (
        <Text
          style={{
            fontSize: fontSize.label,
            color: colors.text.muted,
            textAlign: "center",
            lineHeight: 20,
            marginBottom: actionLabel ? 20 : 0,
          }}
        >
          {description}
        </Text>
      ) : null}

      {/* Primary CTA — only action available in empty state */}
      {actionLabel && onAction ? (
        <Button variant="primary" label={actionLabel} onPress={onAction} size="md" />
      ) : null}

      {children}
    </View>
  );
}
