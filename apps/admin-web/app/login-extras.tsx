"use client";

import React from "react";

/**
 * Shared dress-up for the two public login pages (admin + hospital).
 * - <LoginAmbience/>: fixed, pointer-events-none backdrop — soft brand glows,
 *   faint grid and an animated ECG lifeline. Pure CSS, no deps; the login
 *   forms themselves are untouched.
 * - <GetAppPanel/>: a quiet exposure block pinned under the login card —
 *   "Get the app" button to the public portal plus a scannable QR. Hidden on
 *   short screens so it can never crowd the form.
 */

export function LoginAmbience() {
  return (
    <div className="lg-amb" aria-hidden>
      <div className="lg-glow" />
      <div className="lg-grid" />
      <svg className="lg-ecg" viewBox="0 0 1200 120" preserveAspectRatio="none">
        <path d="M0 60 H360 l22 0 l14 -44 l20 88 l16 -64 l12 20 H560 l22 0 l14 -44 l20 88 l16 -64 l12 20 H1200" fill="none" />
      </svg>
      <style>{`
        .lg-amb { position: fixed; inset: 0; pointer-events: none; z-index: 0; overflow: hidden; }
        .lg-glow {
          position: absolute; inset: 0;
          background:
            radial-gradient(640px 420px at 12% -6%, rgba(229,50,43,0.10), transparent 65%),
            radial-gradient(560px 400px at 104% 108%, rgba(37,99,235,0.09), transparent 65%),
            radial-gradient(420px 340px at 96% -4%, rgba(15,164,122,0.06), transparent 60%);
          animation: lgDrift 16s ease-in-out infinite alternate;
        }
        @keyframes lgDrift { from { transform: translate3d(0,0,0) scale(1); } to { transform: translate3d(0,-12px,0) scale(1.04); } }
        .lg-grid {
          position: absolute; inset: 0; opacity: 0.55;
          background-image: linear-gradient(rgba(16,22,38,0.035) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(16,22,38,0.035) 1px, transparent 1px);
          background-size: 44px 44px;
          mask-image: radial-gradient(circle at 50% 38%, black, transparent 78%);
        }
        .lg-ecg { position: absolute; left: 0; right: 0; top: 16%; width: 100%; height: 70px; opacity: 0.5; }
        .lg-ecg path {
          stroke: #E5322B; stroke-width: 2.2;
          filter: drop-shadow(0 0 5px rgba(229,50,43,0.55));
          stroke-dasharray: 2600; stroke-dashoffset: 2600;
          animation: lgDraw 4.2s linear infinite;
        }
        @keyframes lgDraw { to { stroke-dashoffset: 0; } }
        @media (prefers-reduced-motion: reduce) { .lg-amb * { animation: none !important; } .lg-ecg path { stroke-dashoffset: 0; } }
      `}</style>
    </div>
  );
}

export function GetAppPanel() {
  return (
    <div className="lg-getapp">
      <img src="/qr-download-apk.png" alt="QR code to download the Jeevan Rakshak app" width={86} height={86} />
      <div className="lg-getapp-txt">
        <strong>Get the Jeevan Rakshak app</strong>
        <span>Scan the QR, or open the download page. Share it with patients and drivers.</span>
        <a href="/qr">Open download page →</a>
      </div>
      <style>{`
        /* Compact corner card (bottom-right): always anchored, never floats in
           dead space between the form and the viewport edge. */
        .lg-getapp {
          position: fixed; right: 22px; bottom: 22px;
          z-index: 2; display: flex; align-items: center; gap: 12px;
          max-width: 330px;
          background: rgba(255,255,255,0.86); backdrop-filter: blur(10px);
          border: 1px solid var(--border, #E6E9F2); border-radius: 15px;
          padding: 12px 14px; box-shadow: 0 10px 30px rgba(16,22,38,0.12);
          animation: lgUp .6s .25s ease-out both;
          transition: transform .2s ease, box-shadow .2s ease;
        }
        .lg-getapp:hover { transform: translateY(-2px); box-shadow: 0 14px 36px rgba(16,22,38,0.16); }
        @keyframes lgUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        .lg-getapp img { border-radius: 9px; border: 1px solid var(--border, #E6E9F2); flex: 0 0 70px; width: 70px; height: 70px; }
        .lg-getapp-txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .lg-getapp-txt strong { font-size: 13px; color: var(--ink, #101626); }
        .lg-getapp-txt span { font-size: 11px; color: var(--muted, #6B7590); line-height: 1.4; }
        .lg-getapp-txt a { font-size: 12px; font-weight: 700; color: var(--accent, #2563EB); margin-top: 2px; }
        /* Never crowd the form: hide on narrow or short viewports. */
        @media (max-height: 600px), (max-width: 720px) { .lg-getapp { display: none; } }
      `}</style>
    </div>
  );
}
