import "./src/env-check";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { colors, ErrorBoundary } from "@jr/ui";
import { Booking, getToken, me } from "./src/api";
import { SplashScreen } from "./src/screens/SplashScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { DashboardScreen } from "./src/screens/DashboardScreen";
import { TripScreen } from "./src/screens/TripScreen";
import { EarningsScreen } from "./src/screens/EarningsScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { NameCaptureScreen } from "./src/screens/NameCaptureScreen";
import { KycOnboardingScreen, KycPendingScreen } from "./src/screens/KycOnboardingScreen";
import { hydrateLang } from "./src/i18n";

type RootStackParamList = {
  Splash: undefined;
  Login: undefined;
  NameCapture: undefined;
  KycOnboarding: undefined;
  KycPending: undefined;
  Dashboard: undefined;
  Trip: { booking: Booking };
  Earnings: undefined;
  Profile: undefined;
};

// A driver is "KYC complete" once they've filled at least the four
// hard-required fields. The server-side accept gate also checks
// `kycVerified` so we know the admin has actually approved.
function hasSubmittedKyc(p: any) {
  return (
    !!p?.licenseNumber &&
    !!p?.vehicleNumber &&
    !!p?.rcNumber &&
    !!p?.insuranceNumber &&
    !!p?.hospitalId &&
    !!p?.hospitalName
  );
}

async function refreshProfile(setter: (p: any) => void) {
  try {
    const r = await me.get();
    if (r?.profile) setter(r.profile);
  } catch { /* ignore — next refresh tick will retry */ }
}

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [hydrated, setHydrated] = useState(false);
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    (async () => {
      await hydrateLang();
      const token = await getToken();
      if (token) {
        // 4s cap — see user-app App.tsx for the rationale (Render cold-starts).
        const TIMEOUT_MS = 4000;
        try {
          const r = await Promise.race<any>([
            me.get(),
            new Promise((_res, rej) => setTimeout(() => rej(new Error("hydrate_timeout")), TIMEOUT_MS))
          ]);
          if (r?.profile) setProfile(r.profile);
        } catch { /* fall through to Login; later refreshes will pick up the session */ }
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
              {() => <LoginScreen onAuthenticated={(p) => setProfile(p)} />}
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
        ) : !hasSubmittedKyc(profile) ? (
          <Stack.Screen name="KycOnboarding">
            {() => (
              <KycOnboardingScreen
                initial={profile}
                onSubmitted={(p) => setProfile(p)}
              />
            )}
          </Stack.Screen>
        ) : !profile.kycVerified ? (
          <Stack.Screen name="KycPending">
            {() => <KycPendingScreen onProfileRefresh={() => void refreshProfile(setProfile)} />}
          </Stack.Screen>
        ) : (
          <>
            <Stack.Screen name="Dashboard">
              {({ navigation }) => (
                <DashboardScreen
                  profile={profile}
                  onLogout={() => setProfile(null)}
                  onTrip={(b) => navigation.navigate("Trip", { booking: b })}
                  onProfile={() => navigation.navigate("Profile")}
                  onEarnings={() => navigation.navigate("Earnings")}
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="Trip">
              {({ route, navigation }) => (
                <TripScreen
                  booking={route.params.booking}
                  onClose={() => navigation.popToTop()}
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="Earnings">
              {({ navigation }) => <EarningsScreen onBack={() => navigation.goBack()} />}
            </Stack.Screen>
            <Stack.Screen name="Profile">
              {({ navigation }) => (
                <ProfileScreen
                  initial={profile}
                  onBack={() => navigation.goBack()}
                  onUpdated={(p) => setProfile(p)}
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
