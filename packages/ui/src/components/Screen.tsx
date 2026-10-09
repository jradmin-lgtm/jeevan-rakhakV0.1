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
  refreshControl?: React.ReactElement<RefreshControlProps>;
};

function ScreenInner({ children, scroll = true, padding = "lg", style, bg, refreshControl, header, footer }: Props) {
  const pad = padding === 0 ? 0 : space[padding];
  const Container = scroll ? ScrollView : View;
  return (
    <SafeAreaView style={[styles.safe, bg ? { backgroundColor: bg } : null]}>
      <StatusBar barStyle="dark-content" backgroundColor={bg ?? colors.bg} />
      {header ? <View style={styles.header}>{header}</View> : null}
      <Container
        contentContainerStyle={scroll ? [{ padding: pad, gap: space.lg }, style] : undefined}
        style={!scroll ? [{ flex: 1, padding: pad, gap: space.lg }, style] : { flex: 1 }}
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
  header: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.sm },
  footer: { paddingHorizontal: space.lg, paddingVertical: space.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border }
});

export const Screen = memo(ScreenInner);
