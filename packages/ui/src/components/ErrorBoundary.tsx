import React from "react";
import { Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "./Text";
import { colors, space } from "../tokens";

type Props = { children: React.ReactNode };
type State = { error: Error | null; details: boolean };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, details: false };
  static getDerivedStateFromError(error: Error): Partial<State> { return { error }; }
  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return <View style={styles.root}><ScrollView contentContainerStyle={styles.scroll}>
      <Text variant="title">This screen could not open</Text>
      <Text tone="secondary">Try again. If this continues, close and reopen the app. Your confirmed ride remains saved with the ambulance team.</Text>
      <Text variant="small" tone="secondary">यह स्क्रीन नहीं खुल सकी। फिर प्रयास करें या ऐप बंद करके दोबारा खोलें।</Text>
      <Pressable accessibilityRole="button" onPress={() => this.setState({ error: null, details: false })} style={styles.retry}><Text weight="semi" tone="inverse" align="center">Try again · फिर प्रयास करें</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: this.state.details }} onPress={() => this.setState({ details: !this.state.details })} style={styles.details}><Text variant="small">{this.state.details ? "Hide details" : "Show details for support"}</Text></Pressable>
      {this.state.details ? <View style={styles.box}>
        <Text variant="small">{Platform.OS} {String(Platform.Version)}</Text>
        <Text variant="small" selectable>{this.state.error.name}: {this.state.error.message.slice(0, 400)}</Text>
      </View> : null}
    </ScrollView></View>;
  }
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: space.xl, paddingTop: 72, gap: space.lg, flexGrow: 1, justifyContent: "center" },
  retry: { minHeight: 52, justifyContent: "center", padding: space.md, borderRadius: 12, backgroundColor: colors.textPrimary },
  details: { minHeight: 48, justifyContent: "center" },
  box: { padding: space.md, borderRadius: 12, gap: space.sm, backgroundColor: colors.bg }
});
