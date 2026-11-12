import type { Metadata } from "next";
// Fonts come from npm packages and are bundled with the app, so nothing is
// downloaded at build time or from a third party at run time.
import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Karet",
  description:
    "Self-hostable analytics platform with configurable dashboards and a data flow graph editor.",
  metadataBase: new URL("http://localhost:3000"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
