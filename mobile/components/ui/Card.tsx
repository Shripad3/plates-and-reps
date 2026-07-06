import type { ReactNode } from "react";
import { View, Text, type ViewProps, type StyleProp, type ViewStyle } from "react-native";

/** Section 6 card roles. Hero = full-width focal card, Tile = square-ish grid cell, ListRow = full-width list item. */
export type CardVariant = "hero" | "tile" | "list-row";

const RADIUS: Record<CardVariant, number> = {
  hero: 20,
  tile: 12,
  "list-row": 8,
};

type CardProps = Omit<ViewProps, "style"> & {
  children: ReactNode;
  /** Section 5 radius-by-role. Defaults to "hero" (r20). */
  variant?: CardVariant;
  padded?: boolean;
  className?: string;
  style?: StyleProp<ViewStyle>;
};

export function Card({
  children,
  variant = "hero",
  padded = true,
  className = "",
  style,
  ...props
}: CardProps) {
  return (
    <View
      style={[{ borderRadius: RADIUS[variant] }, style]}
      className={`bg-surface-card border border-surface-border ${padded ? "p-4" : ""} ${className}`}
      {...props}
    >
      {children}
    </View>
  );
}

export function Section({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <View className={`px-5 ${className}`}>{children}</View>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{
        fontSize: 11,
        fontWeight: "700",
        color: "#A8AEB4",
        letterSpacing: 1.2,
        textTransform: "uppercase",
        marginBottom: 12,
      }}
    >
      {children}
    </Text>
  );
}
