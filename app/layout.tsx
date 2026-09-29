import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Barrier Brain",
  description: "Assess temporary infrastructure before deployment. Barrier Brain site impact assessment prototype.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#F9F6EF" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
