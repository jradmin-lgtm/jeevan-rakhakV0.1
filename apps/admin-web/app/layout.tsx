import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Jeevan Rakshak — Operations",
  description: "Live operations dashboard for emergency ambulance dispatch"
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
