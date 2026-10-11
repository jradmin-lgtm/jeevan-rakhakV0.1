import React, { memo } from "react";
import { RefreshControlProps, SafeAreaView, ScrollView, StatusBar, StyleSheet, View, ViewStyle } from "react-native";
import { colors, space } from "../tokens";

type Props = {
  children: React.ReactNode;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  scroll?: boolean;
  padding?: keyof typeof space | 0;
  style?: ViewStyle;
  bg?: string;
  lightStatusBar?: boolean;
  refreshControl?: React.ReactElement<RefreshControlProps>;
};

function ScreenInner({ children, scroll = true, padding = "lg", style, bg, refreshControl, header, footer, lightStatusBar = false }: Props) {
  const pad = padding === 0 ? 0 : space[padding];
  const Container = scroll ? ScrollView : View;
  return (
    <SafeAreaView style={[styles.safe, bg ? { backgroundColor: bg } : null]}>
      <StatusBar barStyle={lightStatusBar ? "light-content" : "dark-content"} backgroundColor={bg ?? colors.bg} />
      {header ? <View style={styles.header}>{header}</View> : null}
      <Container
        contentContainerStyle={scroll ? [styles.content, { padding: pad, gap: space.md }, style] : undefined}
        style={!scroll ? [styles.content, { flex: 1, padding: pad, gap: space.md }, style] : { flex: 1 }}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        refreshControl={scroll ? refreshControl : undefined}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </Container>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { width: "100%", maxWidth: 640, alignSelf: "center" },
  header: { width: "100%", maxWidth: 640, alignSelf: "center", paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.sm },
  footer: { width: "100%", maxWidth: 640, alignSelf: "center", paddingHorizontal: space.lg, paddingVertical: space.sm, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border }
});

export const Screen = memo(ScreenInner);
