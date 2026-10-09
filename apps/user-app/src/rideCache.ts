import AsyncStorage from "@react-native-async-storage/async-storage";
import { createRideCache } from "@jr/ui";
import { getCachedProfile, type Booking } from "./api";

export const rideCache = createRideCache<Booking>(AsyncStorage, "jr.user.active-ride", async () => (await getCachedProfile())?.id ?? null);
