import React, { useEffect } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { Screen, Text, colors, useFadeIn } from "@jr/ui";

export function SplashScreen({ onDone }: { onDone: () => void }) {
  const fade = useFadeIn();
  useEffect(() => {
    const t = setTimeout(onDone, 900);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <Screen scroll={false} bg={colors.primary} padding={0}>
      <View style={styles.center}>
        <Animated.View style={[styles.dot, fade]}>
          <Text variant="title" tone="inverse" weight="bold">JR</Text>
        </Animated.View>
        <Animated.View style={[fade, { gap: 4, alignItems: "center" }]}>
          <Text variant="title" tone="inverse">Jeevan Rakshak</Text>
          <Text variant="body" tone="inverse" align="center" style={{ opacity: 0.85 }}>
            Emergency ambulance, on demand.
          </Text>
        </Animated.View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 24 },
  dot: {
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center"
  }
});
