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

## D-014 - Import del piano dei conti bloccato in bozza

**Decisione:** in questo incremento ogni import nasce come DRAFT e un vincolo del database impedisce qualunque altro stato. Non esiste ancora una API di approvazione o attivazione del piano.

**Motivazione:** la sola presenza del file non equivale a validazione professionale. Il vincolo sara modificato soltanto insieme al futuro gate di revisione, approvazione esplicita e finalizzazione auditata.

## Registro di fase

La Fase 1 stabilisce le fondamenta. Le decisioni su OCR, storage, coda e formati di export saranno finalizzate nelle fasi che introducono tali funzioni.

La Fase 2 comprende ora il profilo aziendale guidato e l'import controllato del piano dei conti in bozza. Anagrafiche e gate di approvazione della configurazione restano incrementi successivi della stessa fase.

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

