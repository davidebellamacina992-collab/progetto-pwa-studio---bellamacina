# Contabilita Assistita

Piattaforma web interna per preparare, controllare e sottoporre ad approvazione procedure contabili. L'applicazione assiste l'utente, ma non sostituisce il commercialista e non compie autonomamente operazioni definitive o verso terzi.

> Le valutazioni fiscali e civilistiche rilevanti devono essere validate dal commercialista.

## Stato del progetto

La **Fase 1 - Fondamenta** realizza l'infrastruttura trasversale su cui poggeranno tutti i moduli successivi:

- applicazione Next.js in TypeScript;
- PostgreSQL e modello dati Prisma;
- autenticazione locale con password Argon2 e sessioni sicure;
- autenticazione TOTP cifrata, obbligatoria per gli approvatori per impostazione predefinita;
- ruoli e autorizzazione per azienda;
- audit log append-only;
- motore di approvazione generico con diff, respinta motivata e conferma rafforzata;
- interfaccia italiana per dashboard, richieste e registro di audit;
- test automatici dei divieti di bypass.

La **Fase 2 è in corso**. Sono disponibili cinque incrementi verificabili:

- wizard di onboarding aziendale in cinque passaggi;
- salvataggio automatico esclusivamente come bozza;
- avanzamento visibile in dashboard;
- segregazione per azienda, autorizzazione per ruolo e audit di ogni salvataggio;
- importazione del piano dei conti da CSV UTF-8 con anteprima, controlli strutturali e gerarchici;
- hash SHA-256 e blocco dei caricamenti duplicati per azienda;
- conservazione delle righe importate esclusivamente come BOZZA, protetta anche da un vincolo del database;
- segregazione per azienda, autorizzazione per ruolo e audit atomico del caricamento;
- invio del piano dei conti alla revisione umana tramite il motore di approvazione condiviso;
- approvazione forte, eventuale doppia approvazione, respinta motivata e finalizzazione separata;
- immutabilita di testata e righe finalizzate garantita anche da trigger PostgreSQL;
- creazione guidata di anagrafiche cliente, fornitore o miste, sempre come bozza;
- identificativi normalizzati, duplicati bloccati per azienda e separazione multi-tenant;
- revisione, approvazione forte, eventuale doppia approvazione e finalizzazione delle anagrafiche;
- anagrafiche finalizzate immutabili anche contro tentativi SQL diretti;
- importazione dei saldi iniziali da CSV collegata a un piano dei conti finalizzato;
- conversione esatta in centesimi, quadratura Dare/Avere bloccante e verifica dei codici conto;
- provenienza tramite nome file, SHA-256 e piano selezionato, con duplicati bloccati per azienda;
- saldi acquisiti come scrittura in bozza e sottoposti allo stesso gate umano;
- stato `PRONTA_PER_REVISIONE` al completamento, senza attivazione o finalizzazione automatica.

Gli altri import e la selezione del piano operativo saranno i prossimi incrementi della Fase 2.

## Avvio in 5 minuti con Docker

Prerequisiti: Docker Desktop con Docker Compose.

```bash
copy .env.example .env
docker compose up --build
```

Prima dell'avvio genera una chiave MFA e inseriscila in `.env` come `MFA_ENCRYPTION_KEY`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

La chiave va conservata nel secret manager dell'ambiente: perderla rende irrecuperabili i segreti TOTP gia registrati.

Aprire `http://localhost:3000`. Il container applicativo applica le migrazioni. Il dataset fittizio non viene caricato automaticamente; esclusivamente in sviluppo si puo eseguire `docker compose exec app npm run db:seed`.

Per arrestare:

```bash
docker compose down
```

Per eliminare anche i volumi locali usare `docker compose down -v` soltanto quando la perdita dei dati di sviluppo e intenzionale.

## Avvio per sviluppo

Prerequisiti: Node.js 22+, npm e PostgreSQL 16+.

```bash
copy .env.example .env
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

## Accesso dimostrativo locale

Dopo `npm run db:seed` sono disponibili esclusivamente utenze fittizie `*.test`:

- `operatore@example.test` prepara e invia le bozze;
- `supervisore1@example.test` e `supervisore2@example.test` eseguono le due approvazioni;
- `commercialista@example.test` consulta i dati.

La password e il valore di `SEED_DEMO_PASSWORD`; se non impostato, soltanto in sviluppo, e `CambiaSubito!2026`. L'azienda dimostrativa mantiene il principio dei quattro occhi ma disattiva il TOTP per rendere eseguibile la demo locale. In ambienti reali il seed e bloccato e il TOTP degli approvatori resta attivo per impostazione predefinita.

## Verifiche

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
```

I test E2E avviano l'app in modalita sviluppo e usano Google Chrome installato sul sistema. I flussi autenticati completi richiedono anche il database di test configurato in `.env`.

Ultima verifica locale (28 ottobre 2026): typecheck, lint e 69 test automatici superati; schema Prisma valido. Le sei migrazioni sono state eseguite realmente su PostgreSQL embedded (PGlite), inclusi gate di stato, immutabilita e provenienza dei saldi iniziali. La build e i test E2E vengono eseguiti anche dalla pipeline GitHub.

## Principio operativo

Ogni azione ad effetto definitivo attraversa la macchina a stati:

`BOZZA -> DA_APPROVARE -> APPROVATO -> FINALIZZATO`

Le transizioni possono includere `RESPINTO` o `ANNULLATO`. Per le azioni ad alto impatto l'approvatore deve digitare `APPROVO`; quando l'azienda abilita il principio dei quattro occhi, un secondo approvatore distinto deve confermare. Ogni transizione produce un evento di audit.

## Documentazione

- `docs/ARCHITETTURA.md`: componenti, confini e modello dati.
- `docs/DECISIONI.md`: decisioni architetturali motivate.
- `docs/ASSUNZIONI.md`: scelte prudenziali dovute a requisiti mancanti.
- `docs/GUIDA_UTENTE.md`: guida della Fase 1.
- `docs/SICUREZZA.md`: minacce, controlli e limiti.
- `docs/FLUSSO_APPROVAZIONI.md`: regole e diagramma del gate umano.

