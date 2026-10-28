# Architettura

## Ambito corrente

La Fase 1 costruisce i servizi trasversali: identita, aziende, autorizzazioni, audit e approvazioni. La Fase 2 riusa questi confini per onboarding, piano dei conti e anagrafiche; nessun modulo puo finalizzare direttamente.

## Componenti

- **Web application**: Next.js App Router, React e TypeScript strict. Le pagine server recuperano dati gia filtrati per azienda; le interazioni mutative passano da Route Handler o Server Action validati.
- **Dominio**: servizi TypeScript indipendenti dall'interfaccia implementano transizioni, segregazione dei compiti e produzione degli eventi di audit.
- **Persistenza**: PostgreSQL tramite Prisma. Transizione e audit sono scritti nella stessa transazione.
- **Autenticazione**: credenziali locali con hash Argon2id, sessione in cookie `HttpOnly`, `Secure` in produzione e `SameSite=Strict`.
- **Coda**: Redis e worker saranno introdotti quando inizieranno elaborazioni lunghe. La Fase 1 mantiene il confine applicativo predisposto, senza simulare lavori inesistenti.
- **Storage documenti**: previsto S3 compatibile con hash SHA-256 dalla Fase 3.

## Confini di fiducia

Il browser non e una fonte attendibile. Identita, ruolo e aziende abilitate derivano esclusivamente dalla sessione server. Ogni comando include un contesto autenticato e viene rifiutato prima di interrogare o modificare una risorsa di un'altra azienda.

Il selettore azienda salva nel cookie `HttpOnly` soltanto un identificativo gia verificato contro `Membership`; ogni successiva richiesta ripete comunque la verifica. Un valore cookie alterato non concede accesso e viene ignorato a favore di una membership valida.

## Modello della Fase 1

- `User`: identita globale e credenziali.
- `Company`: tenant logico.
- `Membership`: relazione utente-azienda con ruolo.
- `Session`: sessione revocabile memorizzata tramite digest del token.
- `ApprovalRequest`: oggetto generico da revisionare, snapshot prima/dopo, livello di impatto e stato.
- `ApprovalDecision`: decisione immutabile, motivazione e indice dell'approvatore.
- `AuditLog`: evento append-only con attore, azienda, azione, oggetto, valori prima/dopo, motivo, IP normalizzato e timestamp.

## Modello della Fase 2

- `CompanyOnboarding`: configurazione dichiarata e versionata, senza attivazione fiscale implicita.
- `ChartImport` e `ChartAccountDraftLine`: piano dei conti validato, revisionabile e immutabile dopo la finalizzazione.
- `BusinessPartner`: cliente, fornitore o soggetto misto; identificativi unici per azienda, stato versionato e finalizzazione protetta.
- `ApprovalRequest`: riferimento esclusivo verificato dal database verso scrittura, piano dei conti oppure anagrafica.

## Invarianti

1. Le query di dominio richiedono sempre `companyId` e un'appartenenza valida.
2. L'operatore puo preparare e richiedere, ma non approvare.
3. Con il principio dei quattro occhi attivo, il richiedente non puo approvare la propria richiesta.
4. Una richiesta ad alto impatto richiede conferma testuale esatta.
5. Con quattro occhi attivo, due utenti distinti con ruolo abilitato devono approvare.
6. Solo una richiesta approvata puo essere finalizzata.
7. Ogni mutazione di dominio riuscita genera audit nella stessa transazione.
8. Nessun percorso applicativo aggiorna o cancella `AuditLog`.

## Evoluzione

I moduli futuri aggiungeranno un riferimento tipizzato e mutuamente esclusivo alla richiesta di approvazione e una finalizzazione protetta anche dal database. L'orchestratore eseguira la transizione soltanto dopo aver verificato stato, versione, hash dell'oggetto e autorizzazione corrente.

