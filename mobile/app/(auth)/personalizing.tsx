import { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  Easing,
} from "react-native-reanimated";
import { colors } from "@/lib/theme";

const PHRASES = [
  "Analyzing your goal…",
  "Calculating your daily calorie intake…",
  "Working out your macro split…",
  "Setting your water target…",
  "Tailoring your plan to you…",
  "Finalizing your plan…",
];

const PHRASE_INTERVAL_MS = 1600;
const MIN_DURATION_MS = PHRASE_INTERVAL_MS * PHRASES.length;

function Dot({ delay }: { delay: number }) {
  const scale = useSharedValue(0.6);

  useEffect(() => {
    scale.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 350, easing: Easing.out(Easing.quad) }),
          withTiming(0.6, { duration: 350, easing: Easing.in(Easing.quad) })
        ),
        -1
      )
    );
  }, [delay, scale]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: 0.4 + scale.value * 0.6,
  }));

  return (
    <Animated.View
      style={[style, { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand[500] }]}
    />
  );
}

export default function PersonalizingScreen() {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const opacity = useSharedValue(1);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(100, {
      duration: MIN_DURATION_MS,
      easing: Easing.inOut(Easing.cubic),
    });

    const interval = setInterval(() => {
      opacity.value = withSequence(
        withTiming(0, { duration: 250 }),
        withTiming(1, { duration: 250 })
      );
      setTimeout(() => {
        setPhraseIndex((i) => (i + 1) % PHRASES.length);
      }, 250);
    }, PHRASE_INTERVAL_MS);

    const timeout = setTimeout(() => {
      router.replace("/(auth)/plan-summary");
    }, MIN_DURATION_MS);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const textStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const progressStyle = useAnimatedStyle(() => ({ width: `${progress.value}%` }));

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-white text-2xl font-bold mb-10 text-center">
          Personalizing your plan
        </Text>
        <Animated.Text
          style={textStyle}
          className="text-slate-300 text-base text-center mb-8"
        >
          {PHRASES[phraseIndex]}
        </Animated.Text>
        <View className="flex-row gap-2 mb-10">
          <Dot delay={0} />
          <Dot delay={150} />
          <Dot delay={300} />
        </View>
        <View className="w-full h-1.5 bg-surface-elevated rounded-full overflow-hidden">
          <Animated.View
            style={[progressStyle, { height: "100%", backgroundColor: colors.brand[500] }]}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
