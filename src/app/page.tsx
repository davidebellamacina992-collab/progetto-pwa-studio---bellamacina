import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { requirePageSession } from "@/lib/page-auth";
import { db } from "@/lib/db";
import { onboardingProgress } from "@/lib/onboarding";

export default async function DashboardPage() {
  const context = await requirePageSession();
  const onboarding = await db.companyOnboarding.findUnique({ where: { companyId: context.companyId } });
  const setupProgress = onboarding ? onboardingProgress(onboarding) : 0;
  return (
    <AppShell currentPath="/">
      <div className="pageHeading">
        <div>
          <span className="eyebrow">Cosa devo fare oggi</span>
          <h1>Buongiorno</h1>
          <p>Qui trovi soltanto attività e scadenze della società selezionata.</p>
        </div>
        <span className="button primary disabledButton" aria-disabled="true" title="Disponibile nella fase successiva">
          Avvia una procedura · Fase successiva
        </span>
      </div>

      <section className="metricGrid" aria-label="Riepilogo attività">
        <Link className="metricCard emphasis" href="/approvazioni">
          <span className="metricIcon" aria-hidden="true">✓</span>
          <span><strong>0</strong><small>Da approvare</small></span>
          <span aria-hidden="true">→</span>
        </Link>
        <article className="metricCard">
          <span className="metricIcon amber" aria-hidden="true">!</span>
          <span><strong>0</strong><small>Anomalie aperte</small></span>
        </article>
        <article className="metricCard">
          <span className="metricIcon blue" aria-hidden="true">◷</span>
          <span><strong>0</strong><small>Scadenze vicine</small></span>
        </article>
        <article className="metricCard">
          <span className="metricIcon green" aria-hidden="true">○</span>
          <span><strong>—</strong><small>Chiusura del mese</small></span>
        </article>
      </section>

      <div className="contentGrid">
        <section className="panel" aria-labelledby="priority-title">
          <div className="panelHeader">
            <div>
              <span className="eyebrow">Priorità</span>
              <h2 id="priority-title">Attività in evidenza</h2>
            </div>
            <StatusBadge tone="success">Tutto sotto controllo</StatusBadge>
          </div>
          <EmptyState
            title="Nessuna attività urgente"
            description="Le nuove bozze, anomalie o richieste di approvazione compariranno qui."
          />
        </section>

        <aside className="panel onboardingPanel" aria-labelledby="setup-title">
          <span className="eyebrow">Configurazione iniziale</span>
          <h2 id="setup-title">Completa il profilo aziendale</h2>
          <p>Inserisci regime, periodicità IVA e piano dei conti prima di usare i moduli contabili.</p>
          <div className="progressTrack" aria-label={`Avanzamento: ${setupProgress}%`}>
            <span style={{ width: `${setupProgress}%` }} />
          </div>
          <div className="progressLabel"><span>{setupProgress === 100 ? "Pronta per la revisione" : setupProgress > 0 ? "In corso" : "Non iniziato"}</span><strong>{setupProgress}%</strong></div>
          <Link className="button secondary full" href="/onboarding">{setupProgress > 0 ? "Continua configurazione" : "Inizia configurazione"}</Link>
        </aside>
      </div>

      <section className="principleStrip" aria-labelledby="human-loop-title">
        <div>
          <span className="principleIcon" aria-hidden="true">◎</span>
          <div><h2 id="human-loop-title">Prima il controllo, poi l’azione</h2><p>Nessuna operazione definitiva avviene senza approvazione esplicita.</p></div>
        </div>
        <ol className="flowMini" aria-label="Flusso obbligatorio">
          <li>Bozza</li><li>Revisione</li><li>Approvazione</li><li>Finalizzazione</li>
        </ol>
      </section>
    </AppShell>
  );
}
