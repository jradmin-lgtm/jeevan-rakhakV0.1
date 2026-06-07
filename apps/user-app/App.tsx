import "./src/env-check";
import React, { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { colors, ErrorBoundary, AppDialogHost, configureGoogleSignIn, signOutFromGoogle } from "@jr/ui";
import { Booking, getToken, me, clearToken, getCachedProfile, setCachedProfile } from "./src/api";
import { SplashScreen } from "./src/screens/SplashScreen";
import { GoogleLoginScreen } from "./src/screens/GoogleLoginScreen";
import { ProfileSetupScreen } from "./src/screens/ProfileSetupScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { BookAmbulanceScreen } from "./src/screens/BookAmbulanceScreen";
import { LiveTrackingScreen } from "./src/screens/LiveTrackingScreen";
import { HistoryScreen } from "./src/screens/HistoryScreen";
import { MedicalProfileScreen } from "./src/screens/MedicalProfileScreen";
import { SosScreen } from "./src/screens/SosScreen";
import { PaymentScreen } from "./src/screens/PaymentScreen";
import { SupportScreen } from "./src/screens/SupportScreen";
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
  Home: undefined;
  Book: undefined;
  Track: { booking: Booking };
  History: undefined;
  Profile: undefined;
  Sos: undefined;
  Payment: { booking: Booking };
  Support: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [hydrated, setHydrated] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [googlePending, setGooglePending] = useState<GooglePending | null>(null);

  useEffect(() => {
    (async () => {
      // Load persisted language preference before anything renders so the
      // splash + login already speak the user's language. ~5ms AsyncStorage
      // read; doesn't extend perceived boot time.
      await hydrateLang();
      // Configure Google Sign-In once at boot. Cheap; idempotent. The
      // actual native prompt is only triggered when the user taps the
      // Continue with Google button.
      try {
        configureGoogleSignIn();
      } catch {
        /* missing webClientId only surfaces in dev — caught and ignored so
         * the rest of the app still boots. The login screen also re-tries
         * configure() lazily, so a real misconfiguration surfaces there. */
      }
      const token = await getToken();
      if (token) {
        // v1.1.0 (CR#12): a valid stored token means the user is logged in.
        // Render Home immediately from the cached profile (no Google re-pick)
        // and refresh /me in the background. Render free-tier dynos cold-start
        // in ~30s, so we don't block boot on the network. We only drop to the
        // Login screen on an explicit 401 (token actually invalid) — handled
        // below — or when there's no token at all.
        const cached = await getCachedProfile();
        if (cached) setProfile(cached);
        const TIMEOUT_MS = 4000;
        try {
          const r = await Promise.race<any>([
            me.get(),
            new Promise((_res, rej) => setTimeout(() => rej(new Error("hydrate_timeout")), TIMEOUT_MS))
          ]);
          if (r?.profile) {
            setProfile(r.profile);
            void setCachedProfile(r.profile);
          }
        } catch (e: any) {
          // 401 = token genuinely invalid (revoked / rotated secret) → sign
          // out so the user re-authenticates. Any other error (timeout, cold
          // start, offline) keeps the cached session and retries later.
          if (e?.status === 401) {
            await clearToken();
            setProfile(null);
          }
          /* else: keep cached profile; HomeScreen.refresh() picks up later */
        }
      }
      setHydrated(true);
    })();
  }, []);

  // v1.1.0 push: once we have an authenticated profile, register the FCM
  // token so status updates reach the patient even when backgrounded.
  useEffect(() => {
    if (profile) void registerPushToken();
  }, [profile]);
  // v1.2.8: tear down the silent dismiss-on-death listeners ONLY on app
  // unmount — not on every profile change (which was removing the handler).
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
        ) : (
          <>
            <Stack.Screen name="Home">
              {({ navigation }) => (
                <HomeScreen
                  profile={profile}
                  onLogout={async () => {
                    // v1.0.13: clear JWT, sign out of Google so the next
                    // sign-in shows the account picker afresh. Both calls
                    // swallow errors — logout is fire-and-forget.
                    await clearToken();
                    await signOutFromGoogle();
                    setProfile(null);
                  }}
                  onBook={() => navigation.navigate("Book")}
                  onSos={() => navigation.navigate("Sos")}
                  onTrack={(b) => navigation.navigate("Track", { booking: b })}
                  onHistory={() => navigation.navigate("History")}
                  onProfile={() => navigation.navigate("Profile")}
                  onSupport={() => navigation.navigate("Support")}
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
                  onPayment={(b) => navigation.replace("Payment", { booking: b })}
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="Payment">
              {({ route, navigation }) => (
                <PaymentScreen
                  booking={route.params.booking}
                  onPaid={() => navigation.popToTop()}
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
                  onUpdated={(p) => { setProfile(p); void setCachedProfile(p); }}
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
