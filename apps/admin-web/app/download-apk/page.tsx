"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Public download portal · jr-admin.vercel.app/download-apk
 * Dark "lifeline" landing: animated ECG heartbeat, brand-red pulse, two cards
 * (Patients / Drivers). Pick one -> enter mobile or email (no anonymous
 * downloads) -> the latest APK streams from the Drive folder via the api-server.
 * One-tap English/Hindi toggle (persisted in localStorage). On-page feedback
 * form posts to /api/dl/feedback and lands in admin "App installs".
 * No em-dashes anywhere in user-facing text (project rule).
 */

type App = "user" | "driver";
type Status = "idle" | "submitting" | "started" | "error";
type Lang = "en" | "hi";

const LANG_KEY = "jr.dl.lang";

const STR = {
  en: {
    kicker: "CURRENTLY LIVE IN BAREILLY · MORE CITIES COMING SOON",
    h1a: "An ambulance,",
    h1b: "when every second counts.",
    sub: "Download the app, book in seconds, and track it live to your door. Choose your app below.",
    userTitle: "For Patients",
    userLine: "Book an ambulance and track it live to your location in an emergency.",
    driverTitle: "For Drivers",
    driverLine: "For verified ambulance drivers · receive trip requests and navigate to patients.",
    download: "Download",
    gateLabel: "Mobile number or email to download",
    gatePh: "e.g. 98XXXXXXXX or you@email.com",
    gateBtn: "Get the app",
    gateBusy: "Preparing…",
    gateFine: "We use this only to share the app and important updates.",
    gateErr: "Enter your mobile number or email.",
    netErr: "Network error. Please check your connection and try again.",
    dlFail: "Could not start the download. Please try again.",
    started: "✓ Download started. Check your notifications",
    step1a: "Open the downloaded ", step1b: ".apk", step1c: " file",
    step2a: "If asked, allow ", step2b: "install from unknown sources", step2c: ", then tap Install",
    step3a: "Open the app and sign in with Google", step3b: "", step3c: "",
    didnt: "Didn’t start?",
    tryAgain: "Try again",
    startOver: "Start over",
    fbTitle: "Questions or feedback?",
    fbIntro: "Type your message and hit send. It reaches our team directly.",
    fbMsgPh: "Write your message here…",
    fbContactPh: "Mobile or email for a reply (optional)",
    fbSend: "Send message",
    fbSending: "Sending…",
    fbShort: "Please write a short message first.",
    fbFail: "Could not send. Please try again.",
    fbDone: "✓ Message sent. Thank you!",
    fbDoneP: "A real person from the Jeevan Rakshak team reads every message.",
    fbDoneReply: " We will get back to you on the contact you shared.",
    fbOr: "Prefer email? Write to",
    foot1a: "Android only · installs by sideload (allow “install from unknown sources”). In a life-threatening emergency you can also call ",
    foot1b: ". This app does not replace official emergency services.",
    privacy: "Privacy",
    delAcc: "Delete account",
    made: "Made with care for Bareilly",
  },
  hi: {
    kicker: "अभी बरेली में उपलब्ध · और शहर जल्द आ रहे हैं",
    h1a: "एम्बुलेंस,",
    h1b: "जब हर सेकंड कीमती है।",
    sub: "ऐप डाउनलोड करें, सेकंडों में बुक करें और एम्बुलेंस को लाइव ट्रैक करें। नीचे अपना ऐप चुनें।",
    userTitle: "मरीज़ों के लिए",
    userLine: "आपात स्थिति में एम्बुलेंस बुक करें और उसे अपने पते तक लाइव ट्रैक करें।",
    driverTitle: "ड्राइवरों के लिए",
    driverLine: "सत्यापित एम्बुलेंस ड्राइवरों के लिए · ट्रिप अनुरोध पाएँ और मरीज़ तक पहुँचें।",
    download: "डाउनलोड करें",
    gateLabel: "डाउनलोड के लिए मोबाइल नंबर या ईमेल",
    gatePh: "जैसे 98XXXXXXXX या you@email.com",
    gateBtn: "ऐप पाएँ",
    gateBusy: "तैयार हो रहा है…",
    gateFine: "इसका उपयोग केवल ऐप और ज़रूरी अपडेट भेजने के लिए होगा।",
    gateErr: "अपना मोबाइल नंबर या ईमेल लिखें।",
    netErr: "नेटवर्क समस्या। कृपया कनेक्शन देखकर फिर कोशिश करें।",
    dlFail: "डाउनलोड शुरू नहीं हो सका। कृपया फिर कोशिश करें।",
    started: "✓ डाउनलोड शुरू हो गया। अपनी नोटिफिकेशन देखें",
    step1a: "डाउनलोड की गई ", step1b: ".apk", step1c: " फ़ाइल खोलें",
    step2a: "पूछे जाने पर ", step2b: "अनजान स्रोत से इंस्टॉल", step2c: " की अनुमति दें, फिर Install दबाएँ",
    step3a: "ऐप खोलें और Google से साइन इन करें", step3b: "", step3c: "",
    didnt: "शुरू नहीं हुआ?",
    tryAgain: "फिर कोशिश करें",
    startOver: "दोबारा शुरू करें",
    fbTitle: "कोई सवाल या सुझाव?",
    fbIntro: "अपना संदेश लिखें और भेजें। यह सीधे हमारी टीम तक पहुँचेगा।",
    fbMsgPh: "अपना संदेश यहाँ लिखें…",
    fbContactPh: "जवाब के लिए मोबाइल या ईमेल (वैकल्पिक)",
    fbSend: "संदेश भेजें",
    fbSending: "भेजा जा रहा है…",
    fbShort: "कृपया पहले एक छोटा संदेश लिखें।",
    fbFail: "भेजा नहीं जा सका। कृपया फिर कोशिश करें।",
    fbDone: "✓ संदेश भेज दिया गया। धन्यवाद!",
    fbDoneP: "जीवन रक्षक टीम का एक सदस्य हर संदेश पढ़ता है।",
    fbDoneReply: " आपके दिए संपर्क पर हम जवाब देंगे।",
    fbOr: "ईमेल करना चाहें? लिखें",
    foot1a: "केवल Android · साइडलोड से इंस्टॉल होता है (“अनजान स्रोत से इंस्टॉल” की अनुमति दें)। जानलेवा आपात स्थिति में आप ",
    foot1b: " पर भी कॉल कर सकते हैं। यह ऐप आधिकारिक आपातकालीन सेवाओं का विकल्प नहीं है।",
    privacy: "गोपनीयता",
    delAcc: "खाता हटाएँ",
    made: "बरेली के लिए प्यार से बनाया गया",
  },
} as const;

export default function DownloadApkPage() {
  const [lang, setLang] = useState<Lang>("en");
  const [active, setActive] = useState<App | null>(null);
  const [contact, setContact] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [err, setErr] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  // feedback form (low-friction: written + sent on the page, no mail app needed)
  const [fbMsg, setFbMsg] = useState("");
  const [fbContact, setFbContact] = useState("");
  const [fbStatus, setFbStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [fbErr, setFbErr] = useState("");

  const t = STR[lang];
  const APPS: Record<App, { title: string; tag: string; line: string; icon: string; accent: string }> = {
    user: { title: t.userTitle, tag: "Jeevan Rakshak", line: t.userLine, icon: "/user-app-icon.png", accent: "var(--red)" },
    driver: { title: t.driverTitle, tag: "Jeevan Rakshak Driver", line: t.driverLine, icon: "/driver-app-icon.png", accent: "var(--teal)" },
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved === "hi" || saved === "en") setLang(saved);
    } catch { /* ignored */ }
    fetch("/api/dl/visit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      keepalive: true,
    }).catch(() => {});
  }, []);

  function switchLang(next: Lang) {
    setLang(next);
    try { localStorage.setItem(LANG_KEY, next); } catch { /* ignored */ }
  }

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
      setErr(t.gateErr);
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
        setErr(data.message || t.dlFail);
        return;
      }
      setStatus("started");
      window.location.href = data.fileUrl; // streams the APK (Content-Disposition: attachment)
    } catch {
      setStatus("error");
      setErr(t.netErr);
    }
  }

  async function sendFeedback() {
    const m = fbMsg.trim();
    if (m.length < 5) {
      setFbErr(t.fbShort);
      return;
    }
    setFbStatus("sending");
    setFbErr("");
    try {
      const res = await fetch("/api/dl/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: m, contact: fbContact.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFbStatus("error");
        setFbErr(data.message || t.fbFail);
        return;
      }
      setFbStatus("sent");
    } catch {
      setFbStatus("error");
      setFbErr(t.netErr);
    }
  }

  return (
    <main className="jr-get">
      {/* React 19 hoists these to <head> */}
      <title>Get the Jeevan Rakshak app</title>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Manrope:wght@400;500;600;700&family=Noto+Sans+Devanagari:wght@400;600;700&display=swap"
        rel="stylesheet"
      />

      <div className="bg-glow" aria-hidden />
      <div className="bg-grid" aria-hidden />

      <header className="topbar">
        <div className="brand">
          <span className="brand-pulse" aria-hidden />
          <span>Jeevan Rakshak</span>
        </div>
        <div className="lang" role="group" aria-label="Language">
          <button className={lang === "en" ? "on" : ""} onClick={() => switchLang("en")}>English</button>
          <button className={lang === "hi" ? "on" : ""} onClick={() => switchLang("hi")}>हिंदी</button>
        </div>
      </header>

      <section className="hero">
        <p className="kicker">{t.kicker}</p>
        <h1>
          {t.h1a}
          <br />
          <em>{t.h1b}</em>
        </h1>
        <p className="sub">{t.sub}</p>

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
                  {t.download} <span aria-hidden>→</span>
                </button>
              ) : status === "started" ? (
                <div className="done">
                  <div className="dlbar" aria-hidden>
                    <span />
                  </div>
                  <strong>{t.started}</strong>
                  <ol className="next">
                    <li>{t.step1a}<em>{t.step1b}</em>{t.step1c}</li>
                    <li>{t.step2a}<em>{t.step2b}</em>{t.step2c}</li>
                    <li>{t.step3a}</li>
                  </ol>
                  <span className="hint">
                    {t.didnt}{" "}
                    <button className="link" onClick={() => submit(app)}>
                      {t.tryAgain}
                    </button>{" "}
                    ·{" "}
                    <button className="link" onClick={() => open(app)}>
                      {t.startOver}
                    </button>
                  </span>
                </div>
              ) : (
                <form
                  className="gate"
                  onSubmit={(e) => {
                    e.preventDefault();
                    submit(app);
                  }}
                >
                  <label htmlFor={`c-${app}`}>{t.gateLabel}</label>
                  <input
                    id={`c-${app}`}
                    ref={inputRef}
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    placeholder={t.gatePh}
                    autoComplete="off"
                    inputMode="text"
                  />
                  {err ? <p className="err">{err}</p> : null}
                  <button className="cta" type="submit" disabled={status === "submitting"}>
                    {status === "submitting" ? t.gateBusy : t.gateBtn}
                  </button>
                  <p className="fineprint">{t.gateFine}</p>
                </form>
              )}
            </article>
          );
        })}
      </section>

      <section className="contact" style={{ ["--accent" as any]: "var(--red)" }}>
        <h3>{t.fbTitle}</h3>
        {fbStatus === "sent" ? (
          <div className="fb-done">
            <strong>{t.fbDone}</strong>
            <p>
              {t.fbDoneP}
              {fbContact.trim() ? t.fbDoneReply : ""}
            </p>
          </div>
        ) : (
          <form
            className="fb"
            onSubmit={(e) => {
              e.preventDefault();
              sendFeedback();
            }}
          >
            <p>{t.fbIntro}</p>
            <textarea
              value={fbMsg}
              onChange={(e) => setFbMsg(e.target.value)}
              placeholder={t.fbMsgPh}
              rows={3}
              maxLength={2000}
            />
            <input
              value={fbContact}
              onChange={(e) => setFbContact(e.target.value)}
              placeholder={t.fbContactPh}
              autoComplete="off"
            />
            {fbErr ? <p className="err">{fbErr}</p> : null}
            <button className="cta" type="submit" disabled={fbStatus === "sending"}>
              {fbStatus === "sending" ? t.fbSending : t.fbSend}
            </button>
            <p className="fineprint">
              {t.fbOr}{" "}
              <a href="mailto:contact.jeevanrakshak@gmail.com?subject=Jeevan%20Rakshak%20app">
                contact.jeevanrakshak@gmail.com
              </a>
            </p>
          </form>
        )}
      </section>

      <footer className="foot">
        <p>
          {t.foot1a}
          <strong>108</strong>
          {t.foot1b}
        </p>
        <p>
          <a href="/privacy">{t.privacy}</a> · <a href="/delete-account">{t.delAcc}</a> · {t.made}
        </p>
      </footer>

      <style>{`
        :root {
          --bg: #060A14; --bg2: #0A1020;
          --ink: #EAF0FB; --muted: #8C99B4;
          --red: #FF4744; --red-deep: #E5322B; --teal: #2FD3BE;
          --line: rgba(255,255,255,0.10);
          --display: "Bricolage Grotesque", "Noto Sans Devanagari", "Manrope", sans-serif;
          --body: "Manrope", "Noto Sans Devanagari", -apple-system, BlinkMacSystemFont, sans-serif;
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

        .topbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; opacity: 0; animation: rise .7s .05s both; }
        .brand { display: flex; align-items: center; gap: 10px; font-family: var(--display); font-weight: 700; letter-spacing: -0.01em; font-size: 18px; }
        .brand-pulse { width: 11px; height: 11px; border-radius: 50%; background: var(--red); box-shadow: 0 0 0 0 rgba(255,71,68,0.6); animation: beat 1.6s infinite; }
        @keyframes beat { 0% { box-shadow: 0 0 0 0 rgba(255,71,68,0.55);} 70% { box-shadow: 0 0 0 12px rgba(255,71,68,0);} 100% { box-shadow: 0 0 0 0 rgba(255,71,68,0);} }
        .lang { display: inline-flex; border: 1px solid var(--line); border-radius: 999px; overflow: hidden; background: rgba(255,255,255,0.04); }
        .lang button { border: 0; background: transparent; color: var(--muted); font-family: var(--body); font-weight: 700; font-size: 13.5px; padding: 8px 14px; cursor: pointer; transition: background .2s, color .2s; }
        .lang button.on { background: var(--red); color: #fff; }

        .hero { text-align: center; margin: 46px 0 14px; }
        .kicker { font-size: 12px; letter-spacing: 0.18em; color: var(--muted); margin: 0 0 14px; opacity: 0; animation: rise .7s .12s both; }
        .hero h1 { font-family: var(--display); font-weight: 800; font-size: clamp(34px, 7vw, 62px); line-height: 1.08; letter-spacing: -0.03em; margin: 0; opacity: 0; animation: rise .8s .18s both; }
        .hero h1 em { font-style: normal; background: linear-gradient(100deg, var(--red), #ff8a6b 60%, var(--teal)); -webkit-background-clip: text; background-clip: text; color: transparent; }
        .hero .sub { color: var(--muted); font-size: clamp(15px, 2.4vw, 18px); max-width: 540px; margin: 18px auto 0; opacity: 0; animation: rise .8s .26s both; }
        .ecg { display: block; width: 100%; height: 84px; margin: 26px auto 0; opacity: 0; animation: rise .8s .34s both; }
        .ecg path { stroke: var(--red); stroke-width: 2.4; filter: drop-shadow(0 0 6px rgba(255,71,68,0.7)); stroke-dasharray: 2600; stroke-dashoffset: 2600; animation: draw 3.4s linear infinite; }
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

        .done { display: flex; flex-direction: column; gap: 10px; animation: rise .35s both; }
        .done strong { font-family: var(--display); font-size: 17px; color: var(--accent); }
        .done span { color: #c2cce0; font-size: 14px; line-height: 1.5; }
        .dlbar { height: 4px; border-radius: 99px; background: rgba(255,255,255,0.08); overflow: hidden; }
        .dlbar span { display: block; height: 100%; width: 40%; border-radius: 99px; padding: 0;
          background: linear-gradient(90deg, transparent, var(--accent), transparent);
          animation: dlslide 1.4s ease-in-out infinite; }
        @keyframes dlslide { from { transform: translateX(-110%); } to { transform: translateX(360%); } }
        .next { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 7px; }
        .next li { color: #c2cce0; font-size: 14px; line-height: 1.5; opacity: 0; animation: rise .4s both; }
        .next li:nth-child(1) { animation-delay: .05s; } .next li:nth-child(2) { animation-delay: .18s; } .next li:nth-child(3) { animation-delay: .3s; }
        .next em { color: var(--ink); font-style: normal; font-weight: 700; }
        .hint { color: var(--muted); font-size: 13px; }
        .link { background: none; border: 0; color: var(--muted); text-decoration: underline; cursor: pointer; font-size: 13px; padding: 2px 0; }

        .contact {
          margin-top: 34px; text-align: center; padding: 26px 22px;
          background: rgba(255,255,255,0.035); border: 1px solid var(--line); border-radius: 20px;
          backdrop-filter: blur(8px); opacity: 0; animation: rise .8s .55s both;
        }
        .contact h3 { font-family: var(--display); font-weight: 700; font-size: 21px; margin: 0 0 4px; letter-spacing: -0.01em; }
        .contact p { color: var(--muted); font-size: 14px; margin: 6px 0 4px; }
        .fb { display: flex; flex-direction: column; gap: 10px; max-width: 520px; margin: 0 auto; text-align: left; }
        .fb p { text-align: center; }
        .fb textarea, .fb input {
          width: 100%; border-radius: 12px; border: 1px solid var(--line); background: rgba(0,0,0,0.25);
          color: var(--ink); padding: 13px 14px; font-size: 16px; font-family: var(--body); outline: none;
          transition: border-color .2s, box-shadow .2s; resize: vertical;
        }
        .fb textarea:focus, .fb input:focus { border-color: var(--red); box-shadow: 0 0 0 3px color-mix(in srgb, var(--red) 22%, transparent); }
        .fb .err { color: #ff9a8a; font-size: 13px; margin: 0; text-align: left; }
        .fb .fineprint { color: var(--muted); font-size: 12px; margin: 4px 0 0; }
        .fb .fineprint a { color: #b9c4dc; }
        .fb-done { display: flex; flex-direction: column; gap: 6px; animation: rise .35s both; }
        .fb-done strong { font-family: var(--display); font-size: 18px; color: var(--teal); }

        .foot { text-align: center; margin-top: 40px; color: var(--muted); font-size: 12.5px; line-height: 1.7; max-width: 620px; opacity: 0; animation: rise .8s .6s both; }
        .foot a { color: #b9c4dc; }
        .foot strong { color: var(--ink); }

        @keyframes rise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @media (prefers-reduced-motion: reduce) { * { animation: none !important; } .ecg path { stroke-dashoffset: 0; } }
      `}</style>
    </main>
  );
}
