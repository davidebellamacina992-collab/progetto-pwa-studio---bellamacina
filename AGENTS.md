# Regole di lavoro del repository

Questo repository realizza una piattaforma di contabilita assistita con supervisione umana. Tutti gli agenti e i contributori devono rispettare le regole seguenti.

## Vincoli non negoziabili

1. Ogni procedura segue: avvio, elaborazione, bozza, revisione umana, approvazione esplicita, finalizzazione, audit.
2. Nessuna operazione definitiva, esportazione, invio, pagamento, firma o chiusura puo aggirare il motore di approvazione.
3. Gli output automatici nascono esclusivamente come `BOZZA` o `DA_APPROVARE`.
4. I dati finalizzati sono immutabili; le correzioni sono rettifiche collegate all'originale.
5. L'audit log e append-only. Nessun ruolo, incluso l'amministratore, puo aggiornarlo o cancellarlo.
6. L'accesso a ogni risorsa deve essere autorizzato sia per ruolo sia per azienda. Non accettare mai un `tenantId` del client senza verificarne l'appartenenza nella sessione.
7. Importi e quantita monetarie usano `Decimal`/`NUMERIC` o centesimi interi, mai `float`.
8. Le regole fiscali sono dati versionati con data di validita; non sono costanti applicative.
9. L'interfaccia e la documentazione utente sono in italiano. Codice e commenti tecnici possono essere in inglese.
10. Non inserire dati reali in log, seed o test. Gli esempi devono essere esplicitamente fittizi.
11. Non lasciare `TODO`, stub o funzionalita dichiarate come concluse se non sono funzionanti.
12. Se manca un requisito, scegliere l'opzione piu prudente e annotarla in `docs/ASSUNZIONI.md`.

## Metodo per fasi

Al termine di ogni fase:

- eseguire lint, controllo tipi, test e build;
- aggiornare `README.md`, `docs/DECISIONI.md` e `docs/ASSUNZIONI.md`;
- descrivere cosa e stato realizzato, verificato e rinviato;
- non avviare un modulo contabile prima che i controlli trasversali da cui dipende siano coperti da test.

## Comandi

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
docker compose up --build
docker compose down
```

Per Prisma:

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

Usare `.env.example` come riferimento e non versionare segreti.


<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
