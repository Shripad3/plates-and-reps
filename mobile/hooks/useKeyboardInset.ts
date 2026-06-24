import { useEffect, useRef, useState } from "react";
import { Animated, Keyboard, Platform, type KeyboardEvent } from "react-native";

function animateInset(
  animated: Animated.Value,
  toValue: number,
  event?: KeyboardEvent
) {
  Animated.timing(animated, {
    toValue,
    duration: Platform.OS === "ios" ? (event?.duration ?? 250) : 200,
    useNativeDriver: false,
  }).start();
}

export function useKeyboardInset(enabled = true) {
  const animatedInset = useRef(new Animated.Value(0)).current;
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setKeyboardHeight(0);
      animatedInset.setValue(0);
      return;
    }

    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, (event) => {
      const height = event.endCoordinates.height;
      setKeyboardHeight(height);
      animateInset(animatedInset, height, event);
    });
    const hideSub = Keyboard.addListener(hideEvent, (event) => {
      setKeyboardHeight(0);
      animateInset(animatedInset, 0, event);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [animatedInset, enabled]);

  return { keyboardHeight, animatedInset };
}
