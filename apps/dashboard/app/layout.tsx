import type { Metadata } from "next";
import "@rep/ui/styles.css";
import { AuthProvider } from "@/contexts/auth-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "Real Estate Platform — Dashboard",
  description: "Panel de gestión interno",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className="h-full">
      <body className="du-app min-h-full">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
