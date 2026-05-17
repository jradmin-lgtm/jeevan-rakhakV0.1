import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Jeevan Rakshak — Operations",
  description: "Live operations dashboard for emergency ambulance dispatch",
  // Next 13+ picks up `app/icon.png` + `app/apple-icon.png` automatically;
  // these explicit links keep older crawlers + Slack unfurls happy.
  icons: {
    icon: "/icon.png",
    apple: "/icon.png"
  },
  manifest: undefined
};

export const viewport: Viewport = {
  themeColor: "#E5322B",
  width: "device-width",
  initialScale: 1
};

// Open prop type — see comment in (admin)/layout.tsx for the
// @types/react 19.0.x typed-routes incompatibility this works around.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function RootLayout({ children }: any) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
