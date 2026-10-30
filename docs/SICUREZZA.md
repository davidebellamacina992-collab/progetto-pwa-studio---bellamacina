# Sicurezza e privacy

## Obiettivi della Fase 1

- impedire accessi anonimi alle funzioni operative;
- impedire letture e modifiche tra aziende;
- applicare ruoli e segregazione dei compiti lato server;
- rendere dimostrabile ogni transizione;
- impedire la finalizzazione senza approvazione valida;
- proteggere credenziali, sessioni e dati sensibili.

## Controlli applicativi

- password con Argon2id e confronto resistente a timing attack;
- segreto TOTP casuale cifrato con AES-256-GCM e codice richiesto a ogni nuovo accesso quando attivo;
- gate MFA sulle decisioni dei responsabili quando configurato dall'azienda;
- token di sessione casuale, cookie `HttpOnly`, `SameSite=Strict`, `Secure` in produzione;
- scadenza, revoca e rotazione delle sessioni;
- validazione Zod degli input con limiti di tipo, formato e lunghezza;
- autorizzazione su azienda e ruolo per ogni endpoint;
- controllo `Origin`/CSRF per richieste mutative basate su cookie;
- CSP con nonce casuale per richiesta e `strict-dynamic`, anti-framing, `nosniff` e referrer policy;
- rate limit su autenticazione e azioni sensibili;
- messaggi di errore che non rivelano esistenza account o dettagli interni;
- query tramite ORM senza SQL costruito da input.

## Audit append-only

L'applicazione espone soltanto creazione e lettura. In produzione il ruolo DB applicativo deve ricevere `INSERT` e `SELECT` sulla tabella audit, senza `UPDATE`, `DELETE` o `TRUNCATE`. Un trigger DB blocca ulteriormente modifiche e cancellazioni. Backup e accessi amministrativi al DB devono essere tracciati fuori dall'applicazione.

Ogni evento include l'hash dell'evento precedente per la propria azienda, cosi da rendere rilevabili alterazioni della catena. La catena hash non equivale a un archivio WORM o a un ancoraggio esterno, da valutare dopo la definizione dei requisiti di conservazione.

## Multi-tenant

Ogni tabella di dominio include `companyId` direttamente o attraverso una relazione non ambigua. Gli indici unici includono il tenant quando l'unicita e aziendale. I test verificano lettura, modifica, approvazione e finalizzazione con identificativi appartenenti a un'altra azienda.

## Privacy e log

- minimizzare dati personali e metadati;
- non inserire payload contabili o credenziali nei log infrastrutturali;
- mascherare errori e identificatori sensibili;
- usare dati fittizi in seed e test;
- configurare retention, accesso ed esportazione prima della produzione;
- cifrare traffico con TLS e affidare la cifratura a riposo all'infrastruttura gestita o ai volumi cifrati.

## File e integrazioni

Il primo caricamento della Fase 3 accetta esclusivamente XML FatturaPA UTF-8 fino a 10 MiB. Il parser richiede la radice FatturaPA, rifiuta DTD ed entita, calcola SHA-256, separa lo storage per azienda e blocca duplicati nello stesso tenant. I file non vengono eseguiti ne inviati a integrazioni esterne. Prima della produzione restano obbligatorie scansione malware, quarantena, cifratura del volume, backup e retention configurata.

## Gestione segreti

I segreti risiedono esclusivamente in variabili d'ambiente o secret manager. `.env` non va versionato. Le chiavi devono essere distinte per ambiente e ruotate in caso di sospetta esposizione.

## Verifiche richieste prima del rilascio

- test di bypass tramite API diretta;
- test di isolamento aziendale e matrice ruoli;
- test di CSRF, session fixation e rate limit;
- test dei vettori TOTP, cifratura autenticata e gate MFA;
- test browser che verifica idratazione e invio POST del login sotto la CSP effettiva;
- scansione dipendenze e immagini container;
- verifica configurazione TLS, cookie e proxy;
- prova documentata di backup e ripristino;
- revisione DPIA/registro trattamenti con il responsabile privacy.

## Segnalazione vulnerabilita

Non inserire vulnerabilita o dati sensibili in issue pubbliche. Usare il canale interno definito dall'organizzazione e includere passi minimi di riproduzione, impatto e versione coinvolta.

