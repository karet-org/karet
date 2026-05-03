import type { Metadata } from "next";
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
