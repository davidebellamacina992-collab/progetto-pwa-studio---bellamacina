import type { Metadata } from "next";
import { BrandMark } from "@/components/brand-mark";
import { LoginForm } from "@/components/login-form";

export const metadata: Metadata = { title: "Accedi" };

export default function LoginPage() {
  return (
    <main id="contenuto-principale" className="loginPage">
      <section className="loginIntro" aria-label="Presentazione">
        <div className="loginBrand"><BrandMark /><span>Contabilità Assistita</span></div>
        <div className="introCopy">
          <span className="eyebrow light">Controllo umano, sempre</span>
          <h1>La contabilità preparata con cura. Approvata da te.</h1>
          <p>
            Ogni operazione resta in bozza finché una persona autorizzata non la
            controlla e approva esplicitamente.
          </p>
          <ol className="processList" aria-label="Processo di controllo">
            <li><span>1</span>Preparazione verificabile</li>
            <li><span>2</span>Revisione con differenze e anomalie</li>
            <li><span>3</span>Approvazione esplicita e registrata</li>
          </ol>
        </div>
      </section>
      <section className="loginPanel" aria-labelledby="login-title">
        <div className="loginCard">
          <span className="eyebrow">Bentornato</span>
          <h2 id="login-title">Accedi al tuo spazio di lavoro</h2>
          <p>Usa le credenziali assegnate dall’amministratore.</p>
          <LoginForm />
        </div>
        <p className="privacyNote">Sessione protetta · Dati separati per azienda · Attività tracciate</p>
      </section>
    </main>
  );
}
