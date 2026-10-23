"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Company = { id: string; name: string; role: string };

export function CompanySwitcher() {
  const router = useRouter();
  const [items, setItems] = useState<Company[]>([]);
  const [current, setCurrent] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/companies").then(async (response) => {
      if (!response.ok) throw new Error();
      const payload = await response.json() as { currentCompanyId: string; items: Company[] };
      setItems(payload.items); setCurrent(payload.currentCompanyId);
    }).catch(() => setError("Azienda non disponibile"));
  }, []);

  async function select(companyId: string) {
    setError("");
    const previous = current;
    setCurrent(companyId);
    try {
      const response = await fetch("/api/companies/select", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId }) });
      if (!response.ok) throw new Error();
      router.refresh();
    } catch {
      setCurrent(previous); setError("Cambio azienda non riuscito");
    }
  }

  if (error) return <span className="companyMini"><span className="companyAvatar" aria-hidden="true">!</span><span><strong>{error}</strong><small>Riprova dopo l’accesso</small></span></span>;
  return <label className="companyMini"><span className="companyAvatar" aria-hidden="true">A</span><span><strong>Azienda attiva</strong><select aria-label="Azienda attiva" value={current} onChange={(event) => select(event.target.value)} disabled={items.length < 2}>{items.length ? items.map((company) => <option value={company.id} key={company.id}>{company.name}</option>) : <option>Caricamento…</option>}</select></span></label>;
}
