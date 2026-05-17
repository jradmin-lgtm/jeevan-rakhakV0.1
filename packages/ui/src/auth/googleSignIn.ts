/**
 * Tiny shared wrapper around `@react-native-google-signin/google-signin` so
 * the user app and driver app present a single consistent API to the rest of
 * the app code.
 *
 * Why a wrapper?
 *  1. We only ever care about the ID token (we verify it server-side); the
 *     library returns a richer object that's easy to mis-handle.
 *  2. Both apps need identical `configure()` semantics — wire the webClientId
 *     once at app startup, then `signIn()` / `signOut()` from anywhere.
 *  3. Error normalisation — Play Services bubbles up native error codes that
 *     are awful for product code to branch on. We map them into a small,
 *     stable enum.
 *
 * v1.1.0 — the `webClientId` is the audience the server expects on every
 * ID token. Wired via `app.json` `extra.googleWebClientId`, read via
 * `expo-constants`.
 */
import {
  GoogleSignin,
  statusCodes
} from "@react-native-google-signin/google-signin";
import Constants from "expo-constants";

export type JrSignInError =
  | "cancelled"
  | "in_progress"
  | "play_services_unavailable"
  | "no_id_token"
  | "not_configured"
  | "unknown";

export class JrGoogleSignInError extends Error {
  code: JrSignInError;
  cause?: unknown;
  constructor(code: JrSignInError, message: string, cause?: unknown) {
    super(message);
    this.code = code;
    this.cause = cause;
  }
}

let _configured = false;

/**
 * Configure the underlying library exactly once. Safe to call multiple times;
 * we no-op after the first successful call. Reads the Web Client ID baked in
 * via `app.json` `extra.googleWebClientId`. Throws if missing — calling
 * `signIn()` without configure() is the most common cause of silent failures.
 */
export function configureGoogleSignIn(): void {
  if (_configured) return;
  const webClientId =
    (Constants.expoConfig?.extra as any)?.googleWebClientId ??
    (Constants.manifestExtra as any)?.googleWebClientId ??
    "";
  if (!webClientId) {
    throw new JrGoogleSignInError(
      "not_configured",
      "Missing googleWebClientId — set it in app.json under expo.extra."
    );
  }
  GoogleSignin.configure({
    webClientId,
    // We never call native APIs that need offline access (no refresh token,
    // no Drive/Calendar scopes). Plain `profile` + `email` is enough.
    offlineAccess: false,
    forceCodeForRefreshToken: false,
    scopes: ["profile", "email"]
  });
  _configured = true;
}

/**
 * Triggers the native Google account picker, returns the ID token + the
 * Google profile (email/name/picture) so the caller can POST to the server.
 *
 * Caller is responsible for handling the typed errors below — the common
 * "user pressed Back" case maps to `cancelled` so screens can no-op
 * silently rather than showing a scary alert.
 */
export async function signInWithGoogle(): Promise<{
  idToken: string;
  email: string;
  name: string | null;
  picture: string | null;
  sub: string | null;
}> {
  configureGoogleSignIn();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    // v12+ of @react-native-google-signin/google-signin returns a tagged
    // union { type: 'success', data: User } | { type: 'cancelled' }.
    // Older versions returned User directly. Read both shapes so a peer-dep
    // upgrade in either app doesn't break sign-in silently.
    const res = (await GoogleSignin.signIn()) as any;
    const user = res?.type === "success" ? res.data : res;
    if (!user || res?.type === "cancelled") {
      throw new JrGoogleSignInError("cancelled", "Sign-in cancelled.");
    }
    if (!user.idToken) {
      throw new JrGoogleSignInError("no_id_token", "Google did not return an ID token.");
    }
    return {
      idToken: user.idToken,
      email: user.user?.email ?? "",
      name: user.user?.name ?? null,
      picture: user.user?.photo ?? null,
      sub: user.user?.id ?? null
    };
  } catch (err: any) {
    if (err instanceof JrGoogleSignInError) throw err;
    const code: string | undefined = err?.code;
    if (code === statusCodes.SIGN_IN_CANCELLED) {
      throw new JrGoogleSignInError("cancelled", "Sign-in cancelled.", err);
    }
    if (code === statusCodes.IN_PROGRESS) {
      throw new JrGoogleSignInError("in_progress", "Sign-in already in progress.", err);
    }
    if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      throw new JrGoogleSignInError(
        "play_services_unavailable",
        "Google Play Services isn't available or up to date on this device.",
        err
      );
    }
    throw new JrGoogleSignInError("unknown", err?.message ?? "Google sign-in failed.", err);
  }
}

/**
 * Best-effort sign-out + revoke. Used by the in-app Logout button so the next
 * Google picker doesn't default to the previous account. Swallows errors
 * because a failed sign-out shouldn't trap the user inside the app.
 */
export async function signOutFromGoogle(): Promise<void> {
  try {
    configureGoogleSignIn();
    await GoogleSignin.signOut();
  } catch {
    /* ignore — logout is fire-and-forget by design */
  }
}
