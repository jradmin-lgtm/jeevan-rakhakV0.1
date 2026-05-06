import { useEffect, useState } from "react";
import { clearToken, getToken, setToken, me, auth as authApi } from "./api";

type AuthState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authenticated"; profile: any };

export function useAuth() {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (!token) {
        setState({ status: "anonymous" });
        return;
      }
      try {
        const r = await me.get();
        setState({ status: "authenticated", profile: r.profile });
      } catch {
        await clearToken();
        setState({ status: "anonymous" });
      }
    })();
  }, []);

  const login = async (phone: string, code: string) => {
    const res = await authApi.verifyOtp(phone, "user", code);
    await setToken(res.accessToken);
    setState({ status: "authenticated", profile: res.profile });
  };

  const logout = async () => {
    await clearToken();
    setState({ status: "anonymous" });
  };

  return { state, login, logout };
}
