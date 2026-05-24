import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ad Studio",
  description: "Generador personal de anuncios en video",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
