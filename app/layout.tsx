import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Weekly · Inteli Academy",
  description: "Redação automática de IA orientada por engajamento para o Instagram do Inteli Academy."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
