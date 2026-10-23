import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { TotpSettings } from "@/components/totp-settings";
import { requirePageSession } from "@/lib/page-auth";

export const metadata: Metadata = { title: "Sicurezza account" };

export default async function SecurityPage() {
  await requirePageSession();
  return <AppShell currentPath="/sicurezza"><div className="pageHeading compact"><div><span className="eyebrow">Account</span><h1>Sicurezza</h1><p>Proteggi le approvazioni con un secondo fattore indipendente dalla password.</p></div></div><TotpSettings /></AppShell>;
}
