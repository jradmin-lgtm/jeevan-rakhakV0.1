import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Text } from "./Text";
import { colors, space } from "../tokens";

type Props = { children: React.ReactNode };
type State = { error: Error | null; info: string };

/**
 * Top-level error boundary. If anything in the React tree throws during
 * render / lifecycle, displays the message + stack on-screen instead of
 * letting Android show "app keeps stopping". Critical for diagnosing
 * production-only crashes without adb logcat.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, info: "" };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    this.setState({ info: info.componentStack ?? "" });
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.root}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text variant="title" tone="inverse" weight="bold">App crashed</Text>
          <Text variant="small" tone="inverse" style={{ marginTop: space.sm, opacity: 0.9 }}>
            Share this with the developer:
          </Text>
          <View style={styles.box}>
            <Text variant="small" tone="inverse" weight="bold">
              {this.state.error.name}: {this.state.error.message}
            </Text>
            {this.state.error.stack ? (
              <Text variant="tiny" tone="inverse" style={{ marginTop: space.sm }}>
                {this.state.error.stack.slice(0, 1800)}
              </Text>
            ) : null}
            {this.state.info ? (
              <Text variant="tiny" tone="inverse" style={{ marginTop: space.sm, opacity: 0.85 }}>
                {this.state.info.slice(0, 800)}
              </Text>
            ) : null}
          </View>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.danger },
  scroll: { padding: space.lg, paddingTop: space.xxl + space.lg, gap: space.md },
  box: { backgroundColor: "rgba(0,0,0,0.25)", padding: space.md, borderRadius: 8 }
});
