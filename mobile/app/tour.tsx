import { useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
  StyleSheet,
  LayoutChangeEvent,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors } from "@/lib/theme";

// Bump the version whenever the tour content changes so returning users see
// the refreshed tour once (v2 adds the workout-analysis + AI meal-plan slides).
export const TOUR_SEEN_KEY = "app_tour_seen_v2";

type Slide = {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  badge: string | null;
  title: string;
  body: string;
};

const SLIDES: Slide[] = [
  {
    icon: "barbell",
    iconBg: colors.brand[500],
    badge: null,
    title: "Welcome to Plates & Reps",
    body: "Your all-in-one fitness companion. Track food, log workouts, and get AI-powered coaching — all in one place.",
  },
  {
    icon: "restaurant",
    iconBg: "#3B82C4",
    badge: "Food tab",
    title: "Track every meal",
    body: "Log food by searching, scanning a barcode, snapping a photo, or by voice — then get an AI meal plan built around your calorie and macro targets.",
  },
  {
    icon: "barbell-outline",
    iconBg: colors.brand[600] ?? colors.brand[500],
    badge: "Train tab",
    title: "Build your routines",
    body: "Create workout routines and log your sets and reps, with rest timers running automatically. Your strength history is always a tap away.",
  },
  {
    icon: "body-outline",
    iconBg: "#0EA5E9",
    badge: "New",
    title: "Get your workouts analyzed",
    body: "Pick any routine and let AI score it — a muscle-coverage body map, balance and volume breakdown, and clear tips to make it better.",
  },
  {
    icon: "chatbubble-ellipses",
    iconBg: "#7C3AED",
    badge: "AI Coach",
    title: "Ask your coach anything",
    body: "Your coach knows your goals, nutrition, routines, and workout history. Ask it to log food, check your macros, or get advice any time.",
  },
  {
    icon: "trending-up",
    iconBg: "#059669",
    badge: "Stats tab",
    title: "Watch yourself improve",
    body: "Log your weight, track body measurements, and keep your streak alive. Your charts update automatically as you log.",
  },
  {
    icon: "people",
    iconBg: "#D97706",
    badge: "Social tab",
    title: "Stay accountable",
    body: "Share milestones and see what your friends are achieving. A little community goes a long way.",
  },
  {
    icon: "checkmark-circle",
    iconBg: "#059669",
    badge: null,
    title: "You're all set",
    body: "Start by logging your first meal or workout. Your coach is ready whenever you need it.",
  },
];

function markSeen() {
  AsyncStorage.setItem(TOUR_SEEN_KEY, "1").catch(() => {});
}

function done() {
  markSeen();
  router.back();
}

export default function TourScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [slideHeight, setSlideHeight] = useState(0);

  const isLast = activeIndex === SLIDES.length - 1;

  function onScrollAreaLayout(e: LayoutChangeEvent) {
    setSlideHeight(e.nativeEvent.layout.height);
  }

  function onScroll(e: { nativeEvent: { contentOffset: { x: number } } }) {
    const index = Math.round(e.nativeEvent.contentOffset.x / width);
    setActiveIndex(index);
  }

  function goNext() {
    if (isLast) {
      done();
      return;
    }
    const next = activeIndex + 1;
    scrollRef.current?.scrollTo({ x: next * width, animated: true });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top", "bottom"]}>
      {/* Skip */}
      {!isLast && (
        <TouchableOpacity
          onPress={done}
          style={[styles.skipButton, { top: insets.top + 12 }]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      )}

      {/* Scroll area — measured so slides get explicit height */}
      <View style={{ flex: 1 }} onLayout={onScrollAreaLayout}>
        {slideHeight > 0 && (
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={onScroll}
            style={{ flex: 1 }}
          >
            {SLIDES.map((slide, i) => (
              <View
                key={i}
                style={{ width, height: slideHeight, paddingHorizontal: 28, justifyContent: "center" }}
              >
                {/* Icon */}
                <View style={styles.iconHalo}>
                  <View style={[styles.iconCard, { backgroundColor: slide.iconBg }]}>
                    <Ionicons name={slide.icon} size={52} color={colors.white} />
                  </View>
                </View>

                {/* Badge */}
                {slide.badge && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{slide.badge}</Text>
                  </View>
                )}

                <Text style={styles.title}>{slide.title}</Text>
                <Text style={styles.body}>{slide.body}</Text>
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Bottom controls */}
      <View style={styles.bottom}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === activeIndex ? styles.dotActive : styles.dotInactive]}
            />
          ))}
        </View>

        <TouchableOpacity onPress={goNext} style={styles.cta}>
          <Text style={styles.ctaText}>{isLast ? "Let's go" : "Next"}</Text>
          {!isLast && (
            <Ionicons name="arrow-forward" size={18} color={colors.white} style={{ marginLeft: 6 }} />
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  skipButton: {
    position: "absolute",
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  skipText: {
    color: colors.text.muted,
    fontSize: 15,
  },
  iconHalo: {
    alignSelf: "center",
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 36,
  },
  iconCard: {
    width: 110,
    height: 110,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: colors.accentWash,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 14,
  },
  badgeText: {
    color: colors.brand[400],
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.text.primary,
    letterSpacing: -0.8,
    marginBottom: 14,
    lineHeight: 34,
  },
  body: {
    fontSize: 16,
    color: colors.text.muted,
    lineHeight: 26,
  },
  bottom: {
    paddingHorizontal: 28,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 20,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 7,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 22,
    backgroundColor: colors.brand[400],
  },
  dotInactive: {
    width: 6,
    backgroundColor: colors.surface.border,
  },
  cta: {
    backgroundColor: colors.brand[500],
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: {
    color: colors.white,
    fontSize: 17,
    fontWeight: "700",
  },
});
