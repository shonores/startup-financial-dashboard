import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Runway Dashboard",
  description: "Startup financial runway tracker — ephemeral data, zero sensitive persistence",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100">
        {children}
      </body>
    </html>
  );
}
