import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "./brand-mark";
import { CompanySwitcher } from "./company-switcher";
import { LogoutButton } from "./logout-button";

const navigation = [
  { href: "/", label: "Oggi", icon: "⌂" },
  { href: "/approvazioni", label: "Approvazioni", icon: "✓" },
  { href: "/audit", label: "Registro attività", icon: "≡" },
  { href: "/sicurezza", label: "Sicurezza account", icon: "◈" },
] as const;

export function AppShell({
  children,
  currentPath,
}: {
  children: ReactNode;
  currentPath: string;
}) {
  return (
    <div className="appFrame">
      <aside className="sidebar" aria-label="Navigazione principale">
        <Link href="/" className="brand" aria-label="Contabilità Assistita, pagina iniziale">
          <BrandMark />
          <span>
            <strong>Contabilità</strong>
            <small>Assistita</small>
          </span>
        </Link>
        <nav className="mainNav">
          {navigation.map((item) => {
            const isCurrent =
              item.href === "/"
                ? currentPath === "/"
                : currentPath.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={isCurrent ? "navItem active" : "navItem"}
                aria-current={isCurrent ? "page" : undefined}
              >
                <span className="navIcon" aria-hidden="true">
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
          <span className="navItem disabled" aria-disabled="true">
            <span className="navIcon" aria-hidden="true">▦</span>
            Servizi <small>Fase successiva</small>
          </span>
        </nav>
        <div className="sidebarFooter">
          <CompanySwitcher />
          <span className="textLink disabledText" aria-disabled="true">Impostazioni · Fase successiva</span>
        </div>
      </aside>
      <div className="pageColumn">
        <header className="topbar">
          <div>
            <span className="eyebrow">Area di lavoro protetta</span>
          </div>
          <div className="topActions">
            <span className="helpLink disabledText" aria-disabled="true">Glossario · Fase successiva</span>
            <LogoutButton />
          </div>
        </header>
        <main id="contenuto-principale" className="mainContent">
          {children}
        </main>
      </div>
    </div>
  );
}
