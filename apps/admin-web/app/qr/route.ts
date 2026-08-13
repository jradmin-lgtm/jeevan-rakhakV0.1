import { NextResponse } from "next/server";

/**
 * QR redirector. The QR code shared with drivers/patients (and the one
 * shown on the admin + hospital login pages) can encode THIS stable URL
 * instead of a final destination directly — repointing it later is a
 * QR_REDIRECT_TARGET env var change, not a reprint/reshare of the QR image.
 */
const DEFAULT_TARGET = "https://jr-admin.vercel.app/download-apk";

export function GET() {
  const target = process.env.QR_REDIRECT_TARGET || DEFAULT_TARGET;
  return NextResponse.redirect(target);
}
