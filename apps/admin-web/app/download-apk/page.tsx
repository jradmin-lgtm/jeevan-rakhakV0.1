"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Public download portal — jr-admin.vercel.app/download-apk
 * Dark "lifeline" landing: animated ECG heartbeat, brand-red pulse, two cards
 * (Patients / Drivers). Pick one -> enter mobile or email (no anonymous
 * downloads) -> the latest APK streams from the Drive folder via the api-server.
 * Calls go through /api/dl (same-origin, no CORS); the 60 MB file is fetched by
 * navigating straight to the api-server download URL.
 */

type App = "user" | "driver";
type Status = "idle" | "submitting" | "started" | "error";

const APPS: Record<App, { title: string; tag: string; line: string; icon: string; accent: string }> = {
  user: {
    title: "For Patients",
    tag: "Jeevan Rakshak",
    line: "Book an ambulance and track it live to your location in an emergency.",
    icon: "/user-app-icon.png",
    accent: "var(--red)",
  },
  driver: {
    title: "For Drivers",
    tag: "Jeevan Rakshak Driver",
    line: "For verified ambulance drivers — receive trip requests and navigate to patients.",
    icon: "/driver-app-icon.png",
    accent: "var(--teal)",
  },
};

export default function GetPage() {
  const [active, setActive] = useState<App | null>(null);
  const [contact, setContact] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [err, setErr] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // log the visit (best-effort)
  useEffect(() => {
    fetch("/api/dl/visit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      keepalive: true,
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (active) setTimeout(() => inputRef.current?.focus(), 120);
  }, [active]);

  function open(app: App) {
    setActive(app);
    setContact("");
    setStatus("idle");
    setErr("");
  }

  async function submit(app: App) {
    const c = contact.trim();
    if (!c) {
      setErr("Enter your mobile number or email.");
      return;
    }
    setStatus("submitting");
    setErr("");
    try {
      const res = await fetch(`/api/dl/${app}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contact: c }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.fileUrl) {
        setStatus("error");
        setErr(data.message || "Could not start the download. Please try again.");
        return;
      }
      setStatus("started");
      window.location.href = data.fileUrl; // streams the APK (Content-Disposition: attachment)
    } catch {
      setStatus("error");
      setErr("Network error. Please check your connection and try again.");
    }
  }

  return (
    <main className="jr-get">
      {/* React 19 hoists these to <head> */}
      <title>Get the Jeevan Rakshak app</title>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Manrope:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />

      <div className="bg-glow" aria-hidden />
      <div className="bg-grid" aria-hidden />

      <header className="brand">
        <span className="brand-pulse" aria-hidden />
        <span>Jeevan Rakshak</span>
      </header>

      <section className="hero">
        <p className="kicker">EMERGENCY AMBULANCE · BAREILLY</p>
        <h1>
          An ambulance,<br />
          <em>when every second counts.</em>
        </h1>
        <p className="sub">
          Download the app, book in seconds, and track it live to your door.
          Choose your app below.
        </p>

        {/* signature: animated ECG heartbeat */}
        <svg className="ecg" viewBox="0 0 1200 120" preserveAspectRatio="none" aria-hidden>
          <path
            d="M0 60 H360 l22 0 l14 -44 l20 88 l16 -64 l12 20 H560 l22 0 l14 -44 l20 88 l16 -64 l12 20 H1200"
            fill="none"
          />
        </svg>
      </section>

      <section className="cards">
        {(Object.keys(APPS) as App[]).map((app) => {
          const a = APPS[app];
          const isActive = active === app;
          return (
            <article
              key={app}
              className={`card${isActive ? " open" : ""}`}
              style={{ ["--accent" as any]: a.accent }}
            >
              <div className="card-top">
                <img className="app-icon" src={a.icon} alt={`${a.tag} icon`} width={92} height={92} />
                <div>
                  <h2>{a.title}</h2>
                  <span className="app-name">{a.tag}</span>
                </div>
              </div>
              <p className="card-line">{a.line}</p>

              {!isActive ? (
                <button className="cta" onClick={() => open(app)}>
                  Download <span aria-hidden>→</span>
                </button>
              ) : status === "started" ? (
                <div className="done">
                  <strong>Starting download…</strong>
                  <span>
                    When it finishes, open the file and allow <em>install from unknown sources</em> to set it up.
                  </span>
                  <button className="link" onClick={() => open(app)}>
                    Download again
                  </button>
                </div>
              ) : (
                <form
                  className="gate"
                  onSubmit={(e) => {
                    e.preventDefault();
                    submit(app);
                  }}
                >
                  <label htmlFor={`c-${app}`}>Mobile number or email to download</label>
                  <input
                    id={`c-${app}`}
                    ref={inputRef}
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    placeholder="e.g. 98XXXXXXXX or you@email.com"
                    autoComplete="off"
                    inputMode="text"
                  />
                  {err ? <p className="err">{err}</p> : null}
                  <button className="cta" type="submit" disabled={status === "submitting"}>
                    {status === "submitting" ? "Preparing…" : "Get the app"}
                  </button>
                  <p className="fineprint">We use this only to share the app and important updates.</p>
                </form>
              )}
            </article>
          );
        })}
      </section>

      <footer className="foot">
        <p>
          Android only · installs by sideload (allow “install from unknown sources”). In a life-threatening
          emergency you can also call <strong>108</strong> — this app does not replace official emergency services.
        </p>
        <p>
          <a href="/privacy">Privacy</a> · <a href="/delete-account">Delete account</a> · Made with care for Bareilly
        </p>
      </footer>

      <style>{`
        :root {
          --bg: #060A14; --bg2: #0A1020;
          --ink: #EAF0FB; --muted: #8C99B4;
          --red: #FF4744; --red-deep: #E5322B; --teal: #2FD3BE;
          --line: rgba(255,255,255,0.10);
          --display: "Bricolage Grotesque", "Manrope", sans-serif;
          --body: "Manrope", -apple-system, BlinkMacSystemFont, sans-serif;
        }
        .jr-get {
          position: fixed; inset: 0; overflow-y: auto;
          background: radial-gradient(1200px 700px at 50% -10%, #11203f 0%, var(--bg2) 45%, var(--bg) 100%);
          color: var(--ink); font-family: var(--body);
          padding: 28px 20px 56px; display: flex; flex-direction: column; align-items: center;
          -webkit-font-smoothing: antialiased;
        }
        .bg-glow {
          position: fixed; inset: 0; pointer-events: none; z-index: 0;
          background:
            radial-gradient(520px 320px at 18% 8%, rgba(255,71,68,0.18), transparent 70%),
            radial-gradient(560px 360px at 86% 24%, rgba(47,211,190,0.12), transparent 70%);
          animation: drift 14s ease-in-out infinite alternate;
        }
        @keyframes drift { from { transform: translate3d(0,0,0) scale(1); } to { transform: translate3d(0,-14px,0) scale(1.05); } }
        .bg-grid {
          position: fixed; inset: 0; pointer-events: none; z-index: 0; opacity: 0.5;
          background-image: linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px);
          background-size: 46px 46px; mask-image: radial-gradient(circle at 50% 30%, black, transparent 80%);
        }
        .jr-get > *:not(.bg-glow):not(.bg-grid) { position: relative; z-index: 1; width: 100%; max-width: 860px; }

        .brand { display: flex; align-items: center; gap: 10px; font-family: var(--display); font-weight: 700; letter-spacing: -0.01em; font-size: 18px; opacity: 0; animation: rise .7s .05s both; }
        .brand-pulse { width: 11px; height: 11px; border-radius: 50%; background: var(--red); box-shadow: 0 0 0 0 rgba(255,71,68,0.6); animation: beat 1.6s infinite; }
        @keyframes beat { 0% { box-shadow: 0 0 0 0 rgba(255,71,68,0.55);} 70% { box-shadow: 0 0 0 12px rgba(255,71,68,0);} 100% { box-shadow: 0 0 0 0 rgba(255,71,68,0);} }

        .hero { text-align: center; margin: 46px 0 14px; }
        .kicker { font-size: 12px; letter-spacing: 0.22em; color: var(--muted); margin: 0 0 14px; opacity: 0; animation: rise .7s .12s both; }
        .hero h1 { font-family: var(--display); font-weight: 800; font-size: clamp(34px, 7vw, 62px); line-height: 1.02; letter-spacing: -0.03em; margin: 0; opacity: 0; animation: rise .8s .18s both; }
        .hero h1 em { font-style: normal; background: linear-gradient(100deg, var(--red), #ff8a6b 60%, var(--teal)); -webkit-background-clip: text; background-clip: text; color: transparent; }
        .hero .sub { color: var(--muted); font-size: clamp(15px, 2.4vw, 18px); max-width: 540px; margin: 18px auto 0; opacity: 0; animation: rise .8s .26s both; }
        .ecg { display: block; width: 100%; height: 84px; margin: 26px auto 0; opacity: 0; animation: rise .8s .34s both; }
        .ecg path { stroke: url(#x); stroke: var(--red); stroke-width: 2.4; filter: drop-shadow(0 0 6px rgba(255,71,68,0.7)); stroke-dasharray: 2600; stroke-dashoffset: 2600; animation: draw 3.4s linear infinite; }
        @keyframes draw { to { stroke-dashoffset: 0; } }

        .cards { display: grid; gap: 18px; grid-template-columns: 1fr; margin-top: 30px; }
        @media (min-width: 720px) { .cards { grid-template-columns: 1fr 1fr; } }
        .card {
          background: rgba(255,255,255,0.035); border: 1px solid var(--line); border-radius: 20px;
          padding: 22px; backdrop-filter: blur(8px); overflow: hidden; position: relative;
          opacity: 0; animation: rise .7s both; transition: transform .25s ease, border-color .25s ease, box-shadow .25s ease;
        }
        .card:nth-child(1) { animation-delay: .42s; } .card:nth-child(2) { animation-delay: .5s; }
        .card::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 3px; background: linear-gradient(90deg, var(--accent), transparent); }
        .card:hover { transform: translateY(-4px); border-color: color-mix(in srgb, var(--accent) 55%, var(--line)); box-shadow: 0 18px 50px rgba(0,0,0,0.4), 0 0 0 1px color-mix(in srgb, var(--accent) 20%, transparent); }
        .card-top { display: flex; align-items: center; gap: 14px; }
        .app-icon { border-radius: 22px; box-shadow: 0 10px 26px rgba(0,0,0,0.5); border: 1px solid var(--line); }
        .card h2 { font-family: var(--display); font-weight: 700; font-size: 22px; margin: 0; letter-spacing: -0.01em; }
        .app-name { color: var(--muted); font-size: 13px; }
        .card-line { color: #c2cce0; font-size: 15px; line-height: 1.55; margin: 16px 0 18px; }

        .cta {
          width: 100%; border: 0; cursor: pointer; border-radius: 13px; padding: 14px 18px;
          font-family: var(--body); font-weight: 700; font-size: 16px; color: #fff;
          background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 92%, #fff 0%), color-mix(in srgb, var(--accent) 78%, #000 12%));
          box-shadow: 0 10px 26px color-mix(in srgb, var(--accent) 35%, transparent); transition: filter .2s, transform .1s;
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
        }
        .cta:hover { filter: brightness(1.08); } .cta:active { transform: translateY(1px); }
        .cta:disabled { filter: grayscale(.3) brightness(.85); cursor: progress; }

        .gate { display: flex; flex-direction: column; gap: 9px; animation: rise .35s both; }
        .gate label { font-size: 12.5px; color: var(--muted); letter-spacing: .01em; }
        .gate input {
          width: 100%; border-radius: 12px; border: 1px solid var(--line); background: rgba(0,0,0,0.25);
          color: var(--ink); padding: 13px 14px; font-size: 16px; font-family: var(--body); outline: none;
          transition: border-color .2s, box-shadow .2s;
        }
        .gate input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent); }
        .gate .err { color: #ff9a8a; font-size: 13px; margin: 0; }
        .gate .fineprint { color: var(--muted); font-size: 11.5px; margin: 4px 0 0; line-height: 1.4; }

        .done { display: flex; flex-direction: column; gap: 8px; animation: rise .35s both; }
        .done strong { font-family: var(--display); font-size: 17px; color: var(--accent); }
        .done span { color: #c2cce0; font-size: 14px; line-height: 1.5; }
        .link { align-self: flex-start; background: none; border: 0; color: var(--muted); text-decoration: underline; cursor: pointer; font-size: 13px; padding: 2px 0; }

        .foot { text-align: center; margin-top: 40px; color: var(--muted); font-size: 12.5px; line-height: 1.7; max-width: 620px; opacity: 0; animation: rise .8s .6s both; }
        .foot a { color: #b9c4dc; }
        .foot strong { color: var(--ink); }

        @keyframes rise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @media (prefers-reduced-motion: reduce) { * { animation: none !important; } .ecg path { stroke-dashoffset: 0; } }
      `}</style>
    </main>
  );
}
