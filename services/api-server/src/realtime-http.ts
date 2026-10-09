/** Bound internal delivery so a sleeping realtime service cannot hold a booking open. */
export async function realtimeRequest(url: string, options: RequestInit): Promise<Response> {
  const response = await fetch(url, { ...options, signal: options.signal ?? AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Realtime delivery failed: HTTP ${response.status} at ${new URL(url).pathname}`);
  return response;
}
