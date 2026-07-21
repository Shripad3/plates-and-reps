import { useContext, useEffect } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { BottomTabBarHeightCallbackContext } from "@react-navigation/bottom-tabs";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import type { ComponentProps } from "react";
import type { EdgeInsets } from "react-native-safe-area-context";
import { useNavigationHistoryStore } from "@/stores/navigationHistoryStore";
import { colors, fontSize } from "@/lib/theme";

type IoniconsName = ComponentProps<typeof Ionicons>["name"];

const TAB_META: Record<string, { icon: IoniconsName; iconFocused: IoniconsName; label: string }> = {
  "home/index":      { icon: "home-outline",       iconFocused: "home",        label: "Home"   },
  "nutrition":       { icon: "nutrition-outline",   iconFocused: "nutrition",   label: "Food"   },
  "workouts":        { icon: "barbell-outline",     iconFocused: "barbell",     label: "Train"  },
  "social/index":    { icon: "people-outline",      iconFocused: "people",      label: "Social" },
  "progress/index":  { icon: "trending-up-outline", iconFocused: "trending-up", label: "Stats"  },
};

export const BAR_HEIGHT = 62;
const SCROLL_GAP = 20; // breathing room between last content item and bar top

export function getTabScrollPadding(insets: Pick<EdgeInsets, "bottom">) {
  return BAR_HEIGHT + insets.bottom + SCROLL_GAP;
}

export function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const onHeightChange = useContext(BottomTabBarHeightCallbackContext);
  const pushRoute = useNavigationHistoryStore((s) => s.push);

  // Report 0 to React Navigation so it doesn't add its own padding on top of ours.
  useEffect(() => {
    onHeightChange?.(0);
  }, [onHeightChange]);

  const visibleRoutes = state.routes.filter((route) => TAB_META[route.name]);

  return (
    <View style={[styles.wrapper, { paddingBottom: insets.bottom }]}>
      <View style={styles.bar}>
        {visibleRoutes.map((route) => {
          const meta = TAB_META[route.name];
          const routeIndex = state.routes.findIndex((r) => r.key === route.key);
          const isFocused = state.index === routeIndex;

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={meta.label}
              onPress={() => {
                const event = navigation.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!isFocused && !event.defaultPrevented) {
                  pushRoute(route.name);
                  navigation.navigate(route.name);
                }
              }}
              style={styles.tab}
            >
              <View style={[styles.tabInner, isFocused && styles.tabInnerFocused]}>
                <Ionicons
                  name={isFocused ? meta.iconFocused : meta.icon}
                  size={22}
                  color={isFocused ? colors.brand[400] : colors.text.muted}
                />
                <Text style={[styles.label, isFocused && styles.labelFocused]}>
                  {meta.label}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.surface.border,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    height: BAR_HEIGHT,
    paddingHorizontal: 8,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tabInner: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 18,
    minWidth: 52,
    gap: 2,
  },
  tabInnerFocused: {
    backgroundColor: colors.accentWash,
  },
  label: {
    fontSize: fontSize.caption,
    fontWeight: "600",
    color: colors.text.muted,
    letterSpacing: 0.2,
  },
  labelFocused: {
    color: colors.brand[300],
  },
});
