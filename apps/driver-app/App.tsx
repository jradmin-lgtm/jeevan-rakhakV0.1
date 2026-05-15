import "./src/env-check";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { colors } from "@jr/ui";
import { Booking, getToken, me } from "./src/api";
import { SplashScreen } from "./src/screens/SplashScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { DashboardScreen } from "./src/screens/DashboardScreen";
import { TripScreen } from "./src/screens/TripScreen";
import { EarningsScreen } from "./src/screens/EarningsScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";

type RootStackParamList = {
  Splash: undefined;
  Login: undefined;
  Dashboard: undefined;
  Trip: { booking: Booking };
  Earnings: undefined;
  Profile: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [hydrated, setHydrated] = useState(false);
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (token) {
        try {
          const r = await me.get();
          setProfile(r.profile);
        } catch { /* invalid token */ }
      }
      setHydrated(true);
    })();
  }, []);

  if (!hydrated) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
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
  );
}
