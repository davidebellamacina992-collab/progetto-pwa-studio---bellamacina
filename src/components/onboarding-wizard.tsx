"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type VatPeriodicityValue = "MONTHLY" | "QUARTERLY" | "NOT_APPLICABLE";
export type OnboardingDraftView = {
  countryCode: string | null;
  legalForm: string | null;
  accountingRegime: string | null;
  vatPeriodicity: VatPeriodicityValue | null;
  managementSoftware: string | null;
  hasChartOfAccounts: boolean | null;
  hasOpeningBalances: boolean | null;
  currentStep: number;
  status: "IN_PROGRESS" | "READY_FOR_REVIEW";
  version: number;
} | null;

type Draft = {
  countryCode: string;
  legalForm: string;
  accountingRegime: string;
  vatPeriodicity: VatPeriodicityValue | "";
  managementSoftware: string;
  hasChartOfAccounts: boolean | null;
  hasOpeningBalances: boolean | null;
};

const steps = ["Azienda", "Contabilità", "Software", "Dati iniziali", "Riepilogo"];

function initialDraft(profile: OnboardingDraftView): Draft {
  return {
    countryCode: profile?.countryCode ?? "",
    legalForm: profile?.legalForm ?? "",
    accountingRegime: profile?.accountingRegime ?? "",
    vatPeriodicity: profile?.vatPeriodicity ?? "",
    managementSoftware: profile?.managementSoftware ?? "",
    hasChartOfAccounts: profile?.hasChartOfAccounts ?? null,
    hasOpeningBalances: profile?.hasOpeningBalances ?? null
  };
}

function progressOf(draft: Draft) {
  const values = [draft.countryCode, draft.legalForm, draft.accountingRegime, draft.vatPeriodicity,
    draft.managementSoftware, draft.hasChartOfAccounts, draft.hasOpeningBalances];
  return Math.round((values.filter((value) => value !== "" && value !== null).length / values.length) * 100);
}

export function OnboardingWizard({ initialProfile, canEdit }: { initialProfile: OnboardingDraftView; canEdit: boolean }) {
  const [draft, setDraft] = useState(() => initialDraft(initialProfile));
  const [step, setStep] = useState(initialProfile?.currentStep ?? 1);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const revision = useRef(0);
  const progress = useMemo(() => progressOf(draft), [draft]);

  function change<K extends keyof Draft>(key: K, value: Draft[K]) {
    revision.current += 1;
    setDraft((current) => ({ ...current, [key]: value }));
    setDirty(true);
  }

  function move(nextStep: number) {
    revision.current += 1;
    setStep(Math.min(5, Math.max(1, nextStep)));
    setDirty(true);
  }

  useEffect(() => {
    if (!dirty || !canEdit) return;
    const savedRevision = revision.current;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSaveState("saving");
      try {
        const response = await fetch("/api/onboarding", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            countryCode: draft.countryCode.trim().toUpperCase() || null,
            legalForm: draft.legalForm.trim() || null,
            accountingRegime: draft.accountingRegime.trim() || null,
            vatPeriodicity: draft.vatPeriodicity || null,
            managementSoftware: draft.managementSoftware.trim() || null,
            hasChartOfAccounts: draft.hasChartOfAccounts,
            hasOpeningBalances: draft.hasOpeningBalances,
            currentStep: step
          }),
          signal: controller.signal
        });
        if (!response.ok) throw new Error("Salvataggio non riuscito");
        if (revision.current === savedRevision) setDirty(false);
        setSaveState("saved");
      } catch (error) {
        if ((error as Error).name !== "AbortError") setSaveState("error");
      }
    }, 800);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [canEdit, dirty, draft, step]);

  return (
    <section className="panel wizardPanel" aria-labelledby="onboarding-title">
      <div className="panelHeader">
        <div>
          <span className="eyebrow">Configurazione iniziale · Bozza</span>
          <h1 id="onboarding-title">Profilo aziendale guidato</h1>
        </div>
        <span className="saveIndicator" role="status">
          {saveState === "saving" ? "Salvataggio…" : saveState === "saved" ? "Bozza salvata" : saveState === "error" ? "Errore: riprova modificando un campo" : ""}
        </span>
      </div>

      <div className="progressTrack" aria-label={`Avanzamento: ${progress}%`}><span style={{ width: `${progress}%` }} /></div>
      <div className="progressLabel"><span>{progress === 100 ? "Pronta per la revisione" : "Compilazione in corso"}</span><strong>{progress}%</strong></div>

      <ol className="wizardSteps" aria-label="Passaggi dell’onboarding">
        {steps.map((label, index) => (
          <li key={label} className={step === index + 1 ? "active" : step > index + 1 ? "done" : ""}>
            <button type="button" onClick={() => move(index + 1)} aria-current={step === index + 1 ? "step" : undefined}>
              <span>{index + 1}</span>{label}
            </button>
          </li>
        ))}
      </ol>

      {!canEdit && <p className="formNotice">Il tuo ruolo consente la consultazione. La bozza può essere modificata da operatori e amministratori.</p>}

      <div className="wizardBody">
        {step === 1 && <>
          <h2>Dati generali</h2>
          <p>Indica il Paese e la forma giuridica così come risultano dai documenti societari.</p>
          <div className="formGrid">
            <label className="field"><span>Codice Paese</span><input maxLength={2} value={draft.countryCode} disabled={!canEdit} onChange={(event) => change("countryCode", event.target.value.toUpperCase())} placeholder="IT" /></label>
            <label className="field"><span>Forma giuridica</span><input value={draft.legalForm} disabled={!canEdit} onChange={(event) => change("legalForm", event.target.value)} placeholder="Come indicata nei documenti societari" /></label>
          </div>
        </>}
        {step === 2 && <>
          <h2>Impostazione contabile dichiarata</h2>
          <p>Queste informazioni non attivano calcoli fiscali: saranno sottoposte a revisione professionale.</p>
          <div className="formGrid">
            <label className="field"><span>Regime contabile</span><input value={draft.accountingRegime} disabled={!canEdit} onChange={(event) => change("accountingRegime", event.target.value)} placeholder="Descrizione dichiarata dall’azienda" /></label>
            <label className="field"><span>Periodicità IVA</span><select value={draft.vatPeriodicity} disabled={!canEdit} onChange={(event) => change("vatPeriodicity", event.target.value as Draft["vatPeriodicity"])}><option value="">Da indicare</option><option value="MONTHLY">Mensile</option><option value="QUARTERLY">Trimestrale</option><option value="NOT_APPLICABLE">Non applicabile</option></select></label>
          </div>
        </>}
        {step === 3 && <>
          <h2>Software attualmente utilizzato</h2>
          <p>Serve a preparare in seguito un profilo di importazione compatibile.</p>
          <label className="field"><span>Gestionale o strumento</span><input value={draft.managementSoftware} disabled={!canEdit} onChange={(event) => change("managementSoftware", event.target.value)} placeholder="Nome e, se nota, versione" /></label>
        </>}
        {step === 4 && <>
          <h2>Dati di partenza disponibili</h2>
          <p>Indica cosa è già disponibile. Nessun file viene ancora importato in questo passaggio.</p>
          <fieldset className="choiceGroup" disabled={!canEdit}><legend>Piano dei conti disponibile?</legend><label><input type="radio" checked={draft.hasChartOfAccounts === true} onChange={() => change("hasChartOfAccounts", true)} /> Sì</label><label><input type="radio" checked={draft.hasChartOfAccounts === false} onChange={() => change("hasChartOfAccounts", false)} /> No</label></fieldset>
          <fieldset className="choiceGroup" disabled={!canEdit}><legend>Saldi iniziali disponibili?</legend><label><input type="radio" checked={draft.hasOpeningBalances === true} onChange={() => change("hasOpeningBalances", true)} /> Sì</label><label><input type="radio" checked={draft.hasOpeningBalances === false} onChange={() => change("hasOpeningBalances", false)} /> No</label></fieldset>
        </>}
        {step === 5 && <>
          <h2>Riepilogo della bozza</h2>
          <dl className="summaryList">
            <div><dt>Paese</dt><dd>{draft.countryCode || "Da completare"}</dd></div>
            <div><dt>Forma giuridica</dt><dd>{draft.legalForm || "Da completare"}</dd></div>
            <div><dt>Regime dichiarato</dt><dd>{draft.accountingRegime || "Da completare"}</dd></div>
            <div><dt>Periodicità IVA</dt><dd>{draft.vatPeriodicity === "MONTHLY" ? "Mensile" : draft.vatPeriodicity === "QUARTERLY" ? "Trimestrale" : draft.vatPeriodicity === "NOT_APPLICABLE" ? "Non applicabile" : "Da completare"}</dd></div>
            <div><dt>Gestionale</dt><dd>{draft.managementSoftware || "Da completare"}</dd></div>
          </dl>
          <p className="formNotice"><strong>Nessuna configurazione è definitiva.</strong> Al 100% la bozza diventa pronta per la revisione; approvazione e attivazione saranno passaggi separati.</p>
        </>}
      </div>

      <div className="wizardActions">
        <button className="button secondary" type="button" disabled={step === 1} onClick={() => move(step - 1)}>Indietro</button>
        {step < 5 && <button className="button primary" type="button" onClick={() => move(step + 1)}>Salva e continua</button>}
      </div>
    </section>
  );
}
