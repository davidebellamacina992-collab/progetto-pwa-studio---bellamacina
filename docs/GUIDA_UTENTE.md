# Guida utente

> Le valutazioni fiscali e civilistiche rilevanti devono essere validate dal commercialista.

## Accesso

Accedi con l'utenza fornita dall'amministratore. Dopo l'accesso seleziona l'azienda su cui lavorare. Se gestisci piu aziende, il nome dell'azienda attiva resta visibile nell'intestazione.

Per cambiare azienda usa **Azienda attiva** nella barra laterale. Il server mostra soltanto le societa associate alla tua utenza, verifica nuovamente la membership al cambio e registra la selezione nell'audit. Tabelle, approvazioni e audit vengono poi ricaricati nel nuovo contesto.

Non condividere la password. Se noti accessi o attivita inattese, informa immediatamente l'amministratore.

## Autenticazione a due fattori

Apri **Sicurezza account**, seleziona **Configura autenticazione**, salva il segreto nell'app TOTP scelta e inserisci il primo codice a 6 cifre. Il segreto viene mostrato una sola volta e resta cifrato nel database.

Quando l'azienda richiede il secondo fattore per gli approvatori, un responsabile puo accedere per completare la configurazione ma non puo approvare, respingere o finalizzare finche la sessione non ha verificato un codice TOTP. Dopo l'attivazione, ogni nuovo accesso richiede password e codice.

## Ruoli

- **Operatore:** prepara bozze e invia richieste; non puo approvare.
- **Responsabile/Supervisore:** revisiona, modifica, approva o respinge.
- **Commercialista/Revisore:** consulta, commenta e valida gli aspetti professionali.
- **Amministratore:** gestisce utenti e configurazioni; non puo alterare il registro di audit.

## Configurazione iniziale

Apri **Configurazione** e completa i cinque passaggi: dati aziendali, impostazione contabile dichiarata, software utilizzato, disponibilita del piano dei conti e dei saldi iniziali, riepilogo.

La bozza viene salvata automaticamente dopo le modifiche. Puoi interrompere e riprendere dalla dashboard. Al 100% lo stato diventa **Pronta per la revisione**: non significa approvata e non attiva calcoli, esportazioni o adempimenti.

Operatori e amministratori possono compilare la bozza. Responsabili e commercialisti possono consultarla. Le valutazioni fiscali e civilistiche devono comunque essere validate dal commercialista.

## Importare il piano dei conti

Apri **Piano dei conti** e seleziona un file CSV codificato in UTF-8. Il file puo usare la virgola o il punto e virgola come separatore. Deve contenere le colonne **codice** e **nome**; puo inoltre contenere **tipo** e **codice_padre**.

Il sistema controlla dimensione, intestazioni, righe, codici duplicati e gerarchia. Un codice padre deve comparire nello stesso file e non sono ammessi cicli. Un esempio interamente fittizio e disponibile in docs/esempi/piano-dei-conti-fittizio.csv.

Il risultato compare nell'anteprima con stato **Bozza**. Se lo stesso contenuto e gia presente per l'azienda attiva, il sistema blocca il duplicato.

Un operatore o amministratore puo selezionare **Invia alla revisione**. Il piano compare nella coda **Approvazioni**: un responsabile verifica riepilogo e anteprima, quindi approva oppure respinge con motivazione. Si applicano MFA, conferma forte e, quando configurato, principio dei quattro occhi.

Se il piano viene respinto, correggi il CSV e caricalo come nuova bozza. La richiesta respinta resta invariata nel registro.

Dopo l'approvazione il responsabile deve eseguire separatamente la finalizzazione digitando **FINALIZZO**. Solo allora il piano diventa immutabile. La finalizzazione non lo collega ancora automaticamente alle registrazioni contabili.

## Creare una richiesta

Nella Fase 1 la creazione di una scrittura dimostrativa e l'invio alla revisione sono disponibili tramite le API protette `/api/drafts` e `/api/drafts/{id}/request-approval`. L'interfaccia guidata per l'operatore viene introdotta con onboarding e anagrafiche nella Fase 2; non e simulata nella dashboard corrente.

Una bozza puo essere modificata. Dopo l'invio, le modifiche sostanziali generano una nuova versione da revisionare.

## Revisionare

La schermata mostra:

- operazione proposta e richiedente;
- valori precedenti e nuovi;
- differenze evidenziate;
- anomalie e avvisi;
- impatto dell'operazione;
- storico delle decisioni.

Il revisore puo **Approva** o **Respingi con motivazione**. La respinta richiede sempre una motivazione utile all'operatore. La modifica guidata della bozza arriva nella Fase 2 ed e mostrata come non disponibile, senza collegamenti fittizi.

Per operazioni ad alto impatto occorre digitare `APPROVO`. Se sono richiesti quattro occhi, la richiesta resta in attesa finche un secondo responsabile distinto non approva.

## Finalizzazione

La finalizzazione e disponibile soltanto quando il numero di approvazioni richiesto e stato raggiunto. Una finalizzazione non rende possibile inviare documenti a terzi o effettuare pagamenti: la piattaforma non offre tali azioni.

Un oggetto finalizzato non e modificabile. Per correggerlo si crea una rettifica collegata, che segue a sua volta il ciclo di approvazione.

## Registro di audit

Apri **Registro di audit** per cercare eventi per data, utente, azienda, azione o oggetto. Il registro documenta anche i valori prima/dopo e la motivazione. Gli eventi non possono essere modificati o eliminati dall'interfaccia.

## Moduli successivi

Selezione del piano operativo, anagrafiche, documenti, prima nota, banche, IVA, personale, cespiti, chiusure, bilancio e controllo di gestione saranno aggiunti negli incrementi successivi e useranno lo stesso flusso di approvazione.

