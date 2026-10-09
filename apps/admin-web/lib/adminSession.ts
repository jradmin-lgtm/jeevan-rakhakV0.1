const TTL_MS = 8 * 60 * 60 * 1000;
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const decode = (text: string) => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), char => char.charCodeAt(0));
async function signingKey(secret: string) {
  if (!secret || secret.startsWith("dev-")) throw new Error("JR_ADMIN_SESSION_SECRET must be configured securely");
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
export async function createAdminSession(secret: string): Promise<string> {
  const payload = encode(new TextEncoder().encode(JSON.stringify({ expires: Date.now() + TTL_MS, nonce: encode(crypto.getRandomValues(new Uint8Array(16))) })));
  const signature = await crypto.subtle.sign("HMAC", await signingKey(secret), new TextEncoder().encode(payload));
  return `${payload}.${encode(new Uint8Array(signature))}`;
}
export async function verifyAdminSession(token: string | undefined, secret: string, now = Date.now()): Promise<boolean> {
  if (!token || token.length > 1024) return false;
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return false;
    const [payload, signature] = parts;
    if (!await crypto.subtle.verify("HMAC", await signingKey(secret), decode(signature), new TextEncoder().encode(payload))) return false;
    const value = JSON.parse(new TextDecoder().decode(decode(payload)));
    return Number.isFinite(value.expires) && value.expires > now && value.expires <= now + TTL_MS && typeof value.nonce === "string";
  } catch (error) { console.warn("Invalid admin session", error instanceof Error ? error.name : "invalid_token"); return false; }
}
