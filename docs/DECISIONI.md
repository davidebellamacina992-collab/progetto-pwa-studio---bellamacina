# Decisioni architetturali

## D-001 - Monolite modulare Next.js

**Decisione:** usare Next.js App Router per frontend e backend della Fase 1.

**Motivazione:** un solo artefatto semplifica avvio, transazioni e controllo delle autorizzazioni. I servizi di dominio non dipendono da React, per consentire l'estrazione futura di worker o servizi OCR senza riscrivere le regole.

## D-002 - PostgreSQL e Prisma

**Decisione:** PostgreSQL e Prisma con migrazioni versionate.

**Motivazione:** transazioni, vincoli relazionali, tipi `NUMERIC` e indici composti sono adatti a integrita e segregazione multi-azienda. Prisma offre tipizzazione e migrazioni riproducibili.

## D-003 - Controlli tenant nel servizio di dominio

**Decisione:** ogni servizio richiede il contesto dell'utente e verifica `Membership`; gli identificativi ricevuti dal browser non autorizzano l'accesso.

**Motivazione:** i filtri solo nell'interfaccia sono aggirabili con chiamate API dirette.

## D-004 - Audit nella stessa transazione

**Decisione:** la modifica di dominio e il relativo evento di audit sono atomici.

**Motivazione:** evita stati modificati senza tracciamento o eventi che descrivono modifiche fallite.

## D-005 - Audit append-only a piu livelli

**Decisione:** nessuna API di update/delete, restrizioni DB e privilegi separati in produzione.

**Motivazione:** l'assenza di pulsanti non basta a garantire immutabilita. Il database e l'ultimo confine di protezione.

## D-006 - Motore di approvazione generico

**Decisione:** richieste polimorfiche con snapshot JSON, diff calcolabile, rischio e numero di approvazioni richieste.

**Motivazione:** tutti i moduli devono attraversare lo stesso gate verificabile, evitando implementazioni divergenti.

## D-007 - Hash Argon2id e sessioni opache

**Decisione:** password con Argon2id e token casuali conservati nel browser solo come cookie; nel database e salvato il digest.

**Motivazione:** limita il danno in caso di esposizione del database o furto dei token memorizzati.

## D-008 - Nessun motore AI in Fase 1

**Decisione:** non integrare AI finche non esistono casi d'uso documentali reali e dataset di valutazione.

**Motivazione:** il motore di approvazione deve funzionare interamente con regole deterministiche; l'AI futura restera opzionale e suggeritiva.

## D-009 - Webpack per sviluppo e build verificabili su Windows

**Decisione:** usare esplicitamente `next dev --webpack` e `next build --webpack`.

**Motivazione:** Turbopack tenta di creare junction verso il client Prisma. Negli ambienti Windows con policy aziendali o sandbox questa operazione puo essere vietata; Webpack evita quella dipendenza da privilegi senza cambiare il comportamento dell'applicazione.

## D-010 - TOTP locale con segreto cifrato

**Decisione:** implementare TOTP RFC 6238 senza provider esterni; il segreto e casuale, codificato Base32 e cifrato con AES-256-GCM usando una chiave distinta fornita dall'ambiente.

**Motivazione:** gli approvatori necessitano di un fattore indipendente dalla password, ma l'app non deve trasmettere dati o dipendere da servizi esterni. Il gate viene applicato lato server a approvazione, rifiuto e finalizzazione.

## D-011 - Onboarding separato dall'attivazione fiscale

**Decisione:** il wizard salva dati dichiarati dall'utente in una bozza aziendale versionata. Il completamento produce soltanto lo stato `READY_FOR_REVIEW`; non attiva regole fiscali e non finalizza la configurazione.

**Motivazione:** regime e periodicita devono essere verificati prima di guidare calcoli o adempimenti. La separazione impedisce che il semplice completamento di un modulo venga interpretato come validazione professionale.

## D-012 - Salvataggio automatico auditato

**Decisione:** ogni autosalvataggio dell'onboarding passa da un Route Handler protetto, usa l'azienda ricavata dalla sessione, incrementa la versione e aggiunge l'evento di audit nella stessa transazione.

**Motivazione:** garantisce continuita all'utente senza indebolire segregazione, tracciabilita o controllo dei ruoli.

## D-013 - Import CSV validato prima della persistenza

**Decisione:** accettare per il piano dei conti soltanto CSV UTF-8 fino a 2 MiB e 5.000 righe, con intestazioni esplicite, codici univoci e gerarchia priva di riferimenti mancanti o cicli.

**Motivazione:** un file malformato non deve produrre dati parziali o ambigui. Parsing, validazione, persistenza e audit avvengono prima che la bozza sia mostrata all'utente.

## D-014 - Import del piano dei conti nasce in bozza

**Decisione:** ogni import nasce come DRAFT e non puo saltare direttamente a uno stato approvato o finalizzato. Le transizioni successive passano esclusivamente dal gate umano.

**Motivazione:** la sola presenza del file non equivale a validazione professionale. Revisione, approvazione esplicita e finalizzazione auditata restano passaggi distinti.

## D-015 - Motore di approvazione polimorfico con riferimento esclusivo

**Decisione:** estendere la richiesta di approvazione al piano dei conti senza duplicare il motore. Ogni richiesta deve riferirsi a una sola scrittura oppure a una sola importazione, vincolo verificato dal database.

**Motivazione:** conferma forte, quattro occhi, MFA, respinta motivata e audit devono conservare lo stesso significato in tutti i moduli. Le transizioni del piano dei conti e la sua immutabilita dopo la finalizzazione sono protette anche da trigger PostgreSQL.

## D-016 - Anagrafiche versionate nello stesso gate umano

**Decisione:** clienti e fornitori sono oggetti aziendali versionati con stato proprio. Nascono in `DRAFT`, sono identificati almeno da codice fiscale o partita IVA e usano lo stesso motore polimorfico di approvazione.

**Motivazione:** una anagrafica errata condiziona documenti, scadenze e registrazioni successive. Il vincolo di unicita per azienda evita duplicati evidenti; il riferimento esclusivo della richiesta, il filtro tenant e i trigger PostgreSQL impediscono approvazioni ambigue, finalizzazioni dirette e alterazioni successive.

## D-017 - Saldi iniziali come scrittura contabile con provenienza

**Decisione:** importare i saldi iniziali direttamente come `AccountingDraft`, senza creare un secondo motore contabile. La bozza conserva file, hash e piano dei conti finalizzato di origine; gli importi sono convertiti in centesimi interi.

**Motivazione:** i saldi sono una scrittura di apertura e devono rispettare la stessa quadratura, revisione, approvazione e immutabilita delle altre registrazioni. Il collegamento a un piano finalizzato impedisce codici arbitrari e il vincolo univoco sull'hash evita caricamenti duplicati nella stessa azienda.

## D-018 - Gate SQL uniforme per tutte le scritture

**Decisione:** il trigger PostgreSQL delle scritture verifica non solo la quadratura, ma anche la sequenza degli stati e l'esistenza delle decisioni umane coerenti con hash e numero di approvatori richiesto.

**Motivazione:** il controllo applicativo non basta contro chiamate o accessi diretti al database. Piano dei conti, anagrafiche e scritture devono offrire la stessa difesa in profondita.

## D-019 - Selezione operativa versionata e append-only

**Decisione:** rappresentare la scelta del piano dei conti operativo con `ChartSelection`. Ogni scelta nasce in bozza, punta a un piano finalizzato della stessa azienda e attraversa il motore di approvazione; il piano corrente e l'ultima selezione finalizzata.

**Motivazione:** un semplice campo modificabile sull'azienda permetterebbe di sostituire una configurazione contabile senza conservare la decisione precedente. Una sequenza di selezioni immutabili mantiene storia, approvatori, hash e audit e consente correzioni soltanto tramite una nuova proposta.

## Registro di fase

La Fase 1 stabilisce le fondamenta. Le decisioni su OCR, storage, coda e formati di export saranno finalizzate nelle fasi che introducono tali funzioni.

La Fase 2 comprende ora il profilo aziendale guidato, piano dei conti, selezione operativa, anagrafiche e saldi iniziali fino alla finalizzazione umana.

## Verifiche del 23 ottobre 2026

- typecheck TypeScript: superato;
- lint ESLint: superato;
- test automatici del dominio, MFA, isolamento tenant e invarianti DB: 44 su 44 superati;
- migrazione applicata a PostgreSQL embedded: quadratura, immutabilita di testata/righe e audit append-only verificati con operazioni SQL reali;
- test E2E anonimo e banner professionale: 2 su 2 superati con Chrome e server Webpack;
- test E2E di idratazione e invio POST del login sotto CSP con nonce: superato;
- test E2E di protezione delle pagine: visitatore anonimo reindirizzato al login;
- validazione schema Prisma: superata;
- audit dipendenze di produzione: 0 vulnerabilita;
- compilazione Next.js e typecheck di build: superati; l'emissione finale nella cartella di build locale e stata interrotta esclusivamente da `EPERM` del sandbox Windows sulla creazione di directory. La build completa resta da confermare in Docker/CI, non disponibile sull'host corrente.

