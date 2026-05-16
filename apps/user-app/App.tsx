// MINIMAL DIAGNOSTIC BUILD — if you see "Hello Jeevan Rakshak"
// on the screen, the native side is OK and the bug is in the real
// App.tsx code (restored from App.tsx.real). If THIS screen also
// crashes, the native build is broken (Hermes / RN linking).
import React from "react";
import { Text, View, SafeAreaView, StatusBar } from "react-native";

export default function App() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#E5322B" }}>
      <StatusBar barStyle="light-content" backgroundColor="#E5322B" />
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ color: "white", fontSize: 28, fontWeight: "bold", marginBottom: 12 }}>
          Hello Jeevan Rakshak
        </Text>
        <Text style={{ color: "white", fontSize: 14, opacity: 0.85, textAlign: "center" }}>
          Diagnostic build v1.0.2{"\n"}If you see this, native side is OK.
        </Text>
      </View>
    </SafeAreaView>
  );
}
