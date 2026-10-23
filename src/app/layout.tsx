import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ProfessionalNotice } from "@/components/professional-notice";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "Contabilità Assistita",
    template: "%s | Contabilità Assistita",
  },
  description:
    "Piattaforma di preparazione e controllo contabile con approvazione umana.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="it">
      <body>
        <a className="skipLink" href="#contenuto-principale">
          Vai al contenuto principale
        </a>
        <ProfessionalNotice />
        {children}
      </body>
    </html>
  );
}
