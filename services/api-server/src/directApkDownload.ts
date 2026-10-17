/** Only a public APK's browser download capability is returned. Never an OAuth token. */
export function driveDownloadUrl(fileId: string, uuid?: string): string {
  if (!/^[\w-]{10,200}$/.test(fileId)) throw new Error('Invalid Drive APK file ID');
  const url = new URL('https://drive.usercontent.google.com/download');
  url.searchParams.set('id', fileId);
  url.searchParams.set('export', 'download');
  url.searchParams.set('confirm', 't');
  if (uuid !== undefined) {
    if (!/^[\w-]{1,200}$/.test(uuid)) throw new Error('Invalid Drive confirmation');
    url.searchParams.set('uuid', uuid);
  }
  return url.toString();
}
function decodeAttribute(value: string): string {
  return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}
export function confirmationFromHtml(html: string, fileId: string): string {
  const form = html.match(/<form\b[^>]*\bid="download-form"[^>]*>[\s\S]*?<\/form>/i)?.[0];
  if (!form) throw new Error('Drive did not return an APK download or a supported confirmation');
  const action = decodeAttribute(form.match(/\baction="([^"]+)"/i)?.[1] ?? '');
  if (action !== 'https://drive.usercontent.google.com/download') throw new Error('Untrusted Drive confirmation action');
  const fields = new Map<string, string>();
  for (const input of form.matchAll(/<input\b[^>]*>/gi)) {
    const name = input[0].match(/\bname="([^"]+)"/i)?.[1];
    const value = input[0].match(/\bvalue="([^"]*)"/i)?.[1];
    if (name && value !== undefined) {
      if (fields.has(name)) throw new Error('Duplicate Drive confirmation field');
      fields.set(name, decodeAttribute(value));
    }
  }
  if (fields.get('id') !== fileId || fields.get('export') !== 'download' || fields.get('confirm') !== 't') throw new Error('Drive confirmation file identity mismatch');
  return driveDownloadUrl(fileId, fields.get('uuid'));
}
async function prefix(response: Response, maximum = 65_536): Promise<Buffer> {
  if (!response.body) throw new Error('Drive returned an empty response');
  const reader = response.body.getReader();
  const chunks: Buffer[] = []; let length = 0;
  try {
    while (length < maximum) {
      const { done, value } = await reader.read(); if (done) break;
      const chunk = Buffer.from(value).subarray(0, maximum - length); chunks.push(chunk); length += chunk.length;
    }
  } finally { await reader.cancel(); }
  return Buffer.concat(chunks);
}
export async function resolveDirectApk(fileId: string, expectedBytes: number, fetcher: typeof fetch = fetch): Promise<string> {
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes <= 0) throw new Error('APK size is unavailable');
  let url = driveDownloadUrl(fileId);
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetcher(url, { redirect: 'error', headers: { Range: 'bytes=0-4095' }, signal: AbortSignal.timeout(20_000) });
    if (response.status !== 200 && response.status !== 206) { await response.body?.cancel(); throw new Error(`Public APK is unavailable: HTTP ${response.status}`); }
    const bytes = await prefix(response);
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
      const disposition = response.headers.get('content-disposition') ?? '';
      const range = response.headers.get('content-range');
      const length = response.status === 206 ? Number(range?.match(/\/(\d+)$/)?.[1]) : Number(response.headers.get('content-length'));
      if (!/attachment/i.test(disposition) || !/\.apk/i.test(disposition) || length !== expectedBytes) throw new Error('Public APK headers or size mismatch');
      return url;
    }
    if (attempt === 1 || !response.headers.get('content-type')?.includes('text/html')) throw new Error('Drive returned a page instead of an APK');
    url = confirmationFromHtml(bytes.toString('utf8'), fileId);
  }
  throw new Error('Direct APK resolution failed');
}
