// Diagnostic harness — see apps/user-app/index.js for the rationale.
import { registerRootComponent } from "expo";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

let App;
let importError = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  App = require("./App").default;
} catch (e) {
  importError = e instanceof Error ? e : new Error(String(e));
}

function ErrorApp() {
  const e = importError;
  return React.createElement(
    View,
    { style: styles.root },
    React.createElement(
      ScrollView,
      { contentContainerStyle: styles.scroll },
      React.createElement(Text, { style: styles.title }, "Driver app import failed"),
      React.createElement(Text, { style: styles.sub }, "Share this whole screen with the developer:"),
      React.createElement(
        View,
        { style: styles.box },
        React.createElement(
          Text,
          { style: styles.errName },
          (e && e.name ? e.name + ": " : "Error: ") + (e && e.message ? e.message : "(no message)")
        ),
        e && e.stack
          ? React.createElement(Text, { style: styles.errStack }, String(e.stack).slice(0, 2400))
          : null
      )
    )
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#B92520" },
  scroll: { padding: 20, paddingTop: 48 },
  title: { color: "white", fontSize: 22, fontWeight: "700" },
  sub: { color: "white", marginTop: 6, opacity: 0.9 },
  box: { marginTop: 16, padding: 12, backgroundColor: "rgba(0,0,0,0.3)", borderRadius: 8 },
  errName: { color: "white", fontSize: 14, fontWeight: "700" },
  errStack: { color: "white", fontSize: 10, marginTop: 8, fontFamily: "monospace" }
});

registerRootComponent(importError ? ErrorApp : App);
