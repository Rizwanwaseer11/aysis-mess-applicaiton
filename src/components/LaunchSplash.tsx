import { useEffect, useRef } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import * as SplashScreen from "expo-splash-screen";
import BrandLogo from "./BrandLogo";
import { colors } from "../theme";

// Keep the native background until our first branded frame is laid out.
void SplashScreen.preventAutoHideAsync().catch(() => {});

export default function LaunchSplash({ onDone }: { onDone: () => void }) {
  const { width, height } = useWindowDimensions();
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.94)).current;
  useEffect(() => {
    let disposed = false;
    let animation: Animated.CompositeAnimation | undefined;
    // Never trap the keeper on the intro if a platform animation is interrupted.
    const deadline = setTimeout(onDone, 3000);
    void AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => true)
      .then((reduced) => {
        if (disposed) return;
        if (reduced) {
          opacity.setValue(1);
          scale.setValue(1);
        }
        animation = Animated.sequence([
          Animated.parallel([
            Animated.timing(opacity, {
              toValue: 1,
              duration: reduced ? 0 : 500,
              useNativeDriver: Platform.OS !== "web",
            }),
            Animated.timing(scale, {
              toValue: 1,
              duration: reduced ? 0 : 600,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: Platform.OS !== "web",
            }),
          ]),
          Animated.delay(reduced ? 350 : 550),
          Animated.timing(opacity, {
            toValue: 0,
            duration: reduced ? 0 : 350,
            useNativeDriver: Platform.OS !== "web",
          }),
        ]);
        animation.start(({ finished }) => {
          if (finished && !disposed) onDone();
        });
      });
    return () => {
      disposed = true;
      clearTimeout(deadline);
      animation?.stop();
    };
  }, [onDone, opacity, scale]);
  return (
    <View
      testID="launch-splash"
      style={styles.screen}
      onLayout={() => {
        void SplashScreen.hideAsync().catch(() => {});
      }}
    >
      <Animated.View
        style={[styles.brand, { opacity, transform: [{ scale }] }]}
      >
        <BrandLogo width={Math.min(width - 64, height < 450 ? 220 : 300)} />
        <View style={styles.accent} />
        <Text accessibilityRole="header" style={styles.title}>
          Aysis Mess Tracking
        </Text>
      </Animated.View>
    </View>
  );
}
const styles = StyleSheet.create({
  screen: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 100,
    backgroundColor: colors.page,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  brand: { alignItems: "center", gap: 24, maxWidth: "100%" },
  accent: {
    width: 48,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "600",
    textAlign: "center",
    letterSpacing: 0.5,
    flexShrink: 1,
  },
});
