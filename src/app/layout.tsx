import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

/* As duas fontes do design system (LANDING-DESIGN-SYSTEM.md §2.1), self-hosted.
   A Inter Variable carrega todo o corpo; a Display fica reservada aos títulos
   e aos números grandes das métricas. */
const inter = localFont({
  src: "./fonts/inter-variable.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});

const interDisplay = localFont({
  src: "./fonts/inter-display-semibold.woff2",
  variable: "--font-inter-display",
  weight: "600",
  display: "swap",
});

/* Fustat (OFL, ver fonts/Fustat-OFL.txt) — a voz da marca: wordmark e títulos.
   Recortada para o latim (o original traz o árabe e pesa 172 KB; o recorte, 27 KB),
   com o eixo de peso inteiro. Fora do texto pequeno de propósito: ver globals.css. */
const fustat = localFont({
  src: "./fonts/fustat-variable.woff2",
  variable: "--font-fustat",
  weight: "200 800",
  display: "swap",
});

const title = "MEIagente · assistente do microempreendedor";
const description =
  "Agente de IA que prepara orçamento, minuta de contrato e mensagem para o cliente do MEI, sempre com a sua aprovação.";

/* Ícones e imagem de prévia, quando existirem, são arquivos nesta pasta
   (convenção do Next: favicon.ico, icon.png, opengraph-image.png). */
export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "MEIagente",
    locale: "pt_BR",
    type: "website",
  },
  twitter: { card: "summary_large_image", title, description },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${interDisplay.variable} ${fustat.variable}`}>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
