import "./src/env-check";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { colors, ErrorBoundary, AppDialogHost, configureGoogleSignIn, signOutFromGoogle } from "@jr/ui";
import { Booking, getToken, me, clearToken, getCachedProfile, setCachedProfile } from "./src/api";
import { SplashScreen } from "./src/screens/SplashScreen";
import { GoogleLoginScreen } from "./src/screens/GoogleLoginScreen";
import { ProfileSetupScreen } from "./src/screens/ProfileSetupScreen";
import { DashboardScreen } from "./src/screens/DashboardScreen";
import { TripScreen } from "./src/screens/TripScreen";
import { TripHistoryScreen } from "./src/screens/TripHistoryScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { SupportScreen } from "./src/screens/SupportScreen";
import { KycOnboardingScreen, KycPendingScreen } from "./src/screens/KycOnboardingScreen";
import { hydrateLang } from "./src/i18n";
import { registerPushToken, teardownPushDismissHandlers } from "./src/push";

type GooglePending = {
  idToken: string;
  google: { email: string; name: string | null; picture: string | null; sub: string };
};

type RootStackParamList = {
  Splash: undefined;
  Login: undefined;
  ProfileSetup: undefined;
  KycOnboarding: undefined;
  KycPending: undefined;
  Dashboard: undefined;
  Trip: { booking: Booking };
  TripHistory: undefined;
  Profile: undefined;
  Support: undefined;
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
    if (r?.profile) { setter(r.profile); void setCachedProfile(r.profile); }
  } catch { /* ignore — next refresh tick will retry */ }
}

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [hydrated, setHydrated] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [googlePending, setGooglePending] = useState<GooglePending | null>(null);

  useEffect(() => {
    (async () => {
      await hydrateLang();
      try { configureGoogleSignIn(); } catch { /* dev-only — see user-app for rationale */ }
      const token = await getToken();
      if (token) {
        // v1.1.0 (CR#12 / CR#5B): a valid token means logged-in. Render from
        // the cached profile immediately (no Google re-pick, no KYC re-prompt)
        // and refresh /me in the background. 4s cap — see user-app for the
        // Render cold-start rationale. Only an explicit 401 drops to Login.
        const cached = await getCachedProfile();
        if (cached) setProfile(cached);
        const TIMEOUT_MS = 4000;
        try {
          const r = await Promise.race<any>([
            me.get(),
            new Promise((_res, rej) => setTimeout(() => rej(new Error("hydrate_timeout")), TIMEOUT_MS))
          ]);
          if (r?.profile) { setProfile(r.profile); void setCachedProfile(r.profile); }
        } catch (e: any) {
          if (e?.status === 401) { await clearToken(); setProfile(null); }
          /* else keep cached session; later refreshes pick it up */
        }
      }
      setHydrated(true);
    })();
  }, []);

  // v1.1.0 push: register the FCM token once authenticated so a new SOS /
  // booking wakes the driver even with the app backgrounded/killed.
  useEffect(() => {
    if (profile) void registerPushToken();
  }, [profile]);
  // v1.2.8: tear down the silent dismiss-on-death listeners ONLY on app
  // unmount — NOT on every profile change (the previous [profile]-scoped
  // cleanup was removing the dismiss handler on each re-render/profile update,
  // leaving nothing to clear a stale tray notification).
  useEffect(() => () => { teardownPushDismissHandlers(); }, []);

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
        <AppDialogHost />
        <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
        {!profile && !googlePending ? (
          <>
            <Stack.Screen name="Splash">
              {({ navigation }) => <SplashScreen onDone={() => navigation.replace("Login")} />}
            </Stack.Screen>
            <Stack.Screen name="Login">
              {() => (
                <GoogleLoginScreen
                  onAuthenticated={(p) => { setProfile(p); void setCachedProfile(p); }}
                  onProfileSetupRequired={(input) => setGooglePending(input)}
                />
              )}
            </Stack.Screen>
          </>
        ) : googlePending ? (
          <Stack.Screen name="ProfileSetup">
            {() => (
              <ProfileSetupScreen
                idToken={googlePending.idToken}
                google={googlePending.google}
                onSetupComplete={(p) => {
                  setProfile(p);
                  void setCachedProfile(p);
                  setGooglePending(null);
                }}
                onBack={() => setGooglePending(null)}
              />
            )}
          </Stack.Screen>
        ) : !profile.kycVerified && !hasSubmittedKyc(profile) ? (
          // CR#5B: routing keys off kycVerified FIRST. An admin-approved
          // driver always reaches the Dashboard (final branch) — even after
          // reinstall/login and even if a cached KYC field looks blank.
          // Only un-approved drivers are routed through KYC: onboarding if
          // they haven't submitted, pending review if they have.
          <Stack.Screen name="KycOnboarding">
            {() => (
              <KycOnboardingScreen
                initial={profile}
                onSubmitted={(p) => { setProfile(p); void setCachedProfile(p); }}
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
                  onLogout={async () => {
                    await clearToken();
                    await signOutFromGoogle();
                    setProfile(null);
                  }}
                  onTrip={(b) => navigation.navigate("Trip", { booking: b })}
                  onProfile={() => navigation.navigate("Profile")}
                  onEarnings={() => navigation.navigate("TripHistory")}
                  onSupport={() => navigation.navigate("Support")}
                  onProfileRefresh={() => void refreshProfile(setProfile)}
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
            <Stack.Screen name="TripHistory">
              {({ navigation }) => <TripHistoryScreen onBack={() => navigation.goBack()} />}
            </Stack.Screen>
            <Stack.Screen name="Profile">
              {({ navigation }) => (
                <ProfileScreen
                  initial={profile}
                  onBack={() => navigation.goBack()}
                  onUpdated={(p) => { setProfile(p); void setCachedProfile(p); }}
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="Support">
              {({ navigation }) => <SupportScreen onBack={() => navigation.goBack()} />}
            </Stack.Screen>
          </>
        )}
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
