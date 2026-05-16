import "./src/env-check";
import React, { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { colors, ErrorBoundary } from "@jr/ui";
import { Booking, getToken, me } from "./src/api";
import { SplashScreen } from "./src/screens/SplashScreen";
import { LoginOtpScreen } from "./src/screens/LoginOtpScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { BookAmbulanceScreen } from "./src/screens/BookAmbulanceScreen";
import { LiveTrackingScreen } from "./src/screens/LiveTrackingScreen";
import { HistoryScreen } from "./src/screens/HistoryScreen";
import { MedicalProfileScreen } from "./src/screens/MedicalProfileScreen";
import { SosScreen } from "./src/screens/SosScreen";
import { NameCaptureScreen } from "./src/screens/NameCaptureScreen";

type RootStackParamList = {
  Splash: undefined;
  Login: undefined;
  NameCapture: undefined;
  Home: undefined;
  Book: undefined;
  Track: { booking: Booking };
  History: undefined;
  Profile: undefined;
  Sos: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [hydrated, setHydrated] = useState(false);
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (token) {
        // Render free-tier dynos cold-start in ~30s. Cap the wait at 4s so the
        // user sees the Login screen instead of staring at a spinner. If the
        // backend responds later, HomeScreen's own refresh() picks up the
        // hydrated profile next.
        const TIMEOUT_MS = 4000;
        try {
          const r = await Promise.race<any>([
            me.get(),
            new Promise((_res, rej) => setTimeout(() => rej(new Error("hydrate_timeout")), TIMEOUT_MS))
          ]);
          if (r?.profile) setProfile(r.profile);
        } catch {
          /* token still valid client-side; the cached session lets login skip if profile lands later */
        }
      }
      setHydrated(true);
    })();
  }, []);

  if (!hydrated) {
    return (
      <ErrorBoundary>
        <SafeAreaProvider>
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        </SafeAreaProvider>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
        {!profile ? (
          <>
            <Stack.Screen name="Splash">
              {({ navigation }) => <SplashScreen onDone={() => navigation.replace("Login")} />}
            </Stack.Screen>
            <Stack.Screen name="Login">
              {() => (
                <LoginOtpScreen
                  onAuthenticated={(p) => setProfile(p)}
                />
              )}
            </Stack.Screen>
          </>
        ) : !profile.name || String(profile.name).trim().length < 2 ? (
          <Stack.Screen name="NameCapture">
            {() => (
              <NameCaptureScreen
                initialName={profile.name}
                onSaved={(p) => setProfile(p)}
              />
            )}
          </Stack.Screen>
        ) : (
          <>
            <Stack.Screen name="Home">
              {({ navigation }) => (
                <HomeScreen
                  profile={profile}
                  onLogout={() => setProfile(null)}
                  onBook={() => navigation.navigate("Book")}
                  onSos={() => navigation.navigate("Sos")}
                  onTrack={(b) => navigation.navigate("Track", { booking: b })}
                  onHistory={() => navigation.navigate("History")}
                  onProfile={() => navigation.navigate("Profile")}
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="Book">
              {({ navigation }) => (
                <BookAmbulanceScreen
                  onCancel={() => navigation.goBack()}
                  onBooked={(b) => navigation.replace("Track", { booking: b })}
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="Track">
              {({ route, navigation }) => (
                <LiveTrackingScreen
                  booking={route.params.booking}
                  onClose={() => navigation.popToTop()}
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="History">
              {({ navigation }) => (
                <HistoryScreen
                  onBack={() => navigation.goBack()}
                  onOpen={(b) => navigation.navigate("Track", { booking: b })}
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="Profile">
              {({ navigation }) => (
                <MedicalProfileScreen
                  initial={profile}
                  onBack={() => navigation.goBack()}
                  onUpdated={(p) => setProfile(p)}
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="Sos">
              {({ navigation }) => (
                <SosScreen
                  onBack={() => navigation.goBack()}
                  onBooked={(b) => navigation.replace("Track", { booking: b })}
                />
              )}
            </Stack.Screen>
          </>
        )}
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
