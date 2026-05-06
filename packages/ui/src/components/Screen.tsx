import React, { memo } from "react";
import { RefreshControlProps, SafeAreaView, ScrollView, StatusBar, StyleSheet, View, ViewStyle } from "react-native";
import { colors, space } from "../tokens";

type Props = {
  children: React.ReactNode;
  scroll?: boolean;
  padding?: keyof typeof space | 0;
  style?: ViewStyle;
  bg?: string;
  refreshControl?: React.ReactElement<RefreshControlProps>;
};

function ScreenInner({ children, scroll = true, padding = "lg", style, bg, refreshControl }: Props) {
  const pad = padding === 0 ? 0 : space[padding];
  const Container = scroll ? ScrollView : View;
  return (
    <SafeAreaView style={[styles.safe, bg ? { backgroundColor: bg } : null]}>
      <StatusBar barStyle="dark-content" backgroundColor={bg ?? colors.bg} />
      <Container
        contentContainerStyle={scroll ? [{ padding: pad, gap: space.lg }, style] : undefined}
        style={!scroll ? [{ flex: 1, padding: pad, gap: space.lg }, style] : undefined}
        refreshControl={scroll ? refreshControl : undefined}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </Container>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg }
});

export const Screen = memo(ScreenInner);
