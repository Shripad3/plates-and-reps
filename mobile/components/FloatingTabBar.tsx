import { useContext, useEffect } from "react";
import { View, Text, Pressable, Platform, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { BottomTabBarHeightCallbackContext } from "@react-navigation/bottom-tabs";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import type { ComponentProps } from "react";
import type { EdgeInsets } from "react-native-safe-area-context";
import { useNavigationHistoryStore } from "@/stores/navigationHistoryStore";
import { colors } from "@/lib/theme";

type IoniconsName = ComponentProps<typeof Ionicons>["name"];

const TAB_META: Record<string, { icon: IoniconsName; iconFocused: IoniconsName; label: string }> = {
  "home/index": { icon: "home-outline", iconFocused: "home", label: "Home" },
  "nutrition/index": { icon: "nutrition-outline", iconFocused: "nutrition", label: "Food" },
  "workouts/index": { icon: "barbell-outline", iconFocused: "barbell", label: "Train" },
  "social/index": { icon: "people-outline", iconFocused: "people", label: "Social" },
  "progress/index": { icon: "trending-up-outline", iconFocused: "trending-up", label: "Stats" },
};

export const BAR_HEIGHT = 62;
const HORIZONTAL_MARGIN = 20;
const BAR_BOTTOM_GAP = 12;
const SCROLL_GAP = 12;

export function getTabScrollPadding(insets: Pick<EdgeInsets, "bottom">) {
  return BAR_HEIGHT + Math.max(insets.bottom, BAR_BOTTOM_GAP) + SCROLL_GAP;
}

export function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const onHeightChange = useContext(BottomTabBarHeightCallbackContext);
  const pushRoute = useNavigationHistoryStore((s) => s.push);
  const bottom = Math.max(insets.bottom, BAR_BOTTOM_GAP);
  const totalHeight = BAR_HEIGHT + bottom + SCROLL_GAP;

  useEffect(() => {
    onHeightChange?.(totalHeight);
  }, [onHeightChange, totalHeight]);

  const visibleRoutes = state.routes.filter((route) => TAB_META[route.name]);

  return (
    <View pointerEvents="box-none" style={[styles.wrapper, { bottom }]}>
      <View style={[styles.bar, { marginHorizontal: HORIZONTAL_MARGIN }]}>
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
    backgroundColor: "transparent",
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    height: BAR_HEIGHT,
    backgroundColor: colors.surface.card,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.surface.border,
    paddingHorizontal: 6,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.22,
        shadowRadius: 10,
      },
      android: {
        elevation: 8,
      },
    }),
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
    backgroundColor: "rgba(249, 115, 22, 0.14)",
  },
  label: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.text.muted,
    letterSpacing: 0.2,
  },
  labelFocused: {
    color: colors.brand[300],
  },
});
