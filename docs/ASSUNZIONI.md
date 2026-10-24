# Assunzioni

Le assunzioni sono scelte prudenziali e sostituibili; non sono requisiti fiscali.

## Fase 1

1. Il primo rilascio e destinato a installazione interna o ambiente controllato, con una singola istanza applicativa e PostgreSQL dedicato.
2. La registrazione pubblica e disabilitata. Il primo amministratore nasce tramite seed di sviluppo o procedura operativa protetta.
3. Un utente puo appartenere a piu aziende, ma seleziona una sola azienda attiva per volta.
4. I ruoli sono assegnati per azienda, non globalmente.
5. `RESPONSABILE` puo approvare operazioni ordinarie e ad alto impatto; `COMMERCIALISTA` valida e commenta ma non finalizza salvo futura configurazione esplicita.
6. Quando il principio dei quattro occhi e attivo, il richiedente non puo approvare la propria richiesta e gli approvatori devono essere persone distinte.
7. Il principio dei quattro occhi e configurabile per azienda e obbligatorio per una richiesta ad alto impatto quando attivato.
8. La parola di conferma e `APPROVO`, maiuscola e senza spazi aggiuntivi.
9. IP e user agent nell'audit sono metadati di sicurezza; l'accesso e ristretto e la retention sara definita con il titolare del trattamento.
10. I timestamp sono salvati in UTC e mostrati nel fuso dell'utente.
11. L'app non invia email: reset password, inviti e notifiche esterne restano disabilitati finche non saranno progettati con approvazione e provider dedicato.
12. Il seed contiene soltanto societa e persone fittizie e non viene eseguito automaticamente in produzione.
13. La MFA TOTP e obbligatoria per i responsabili per impostazione predefinita; ogni azienda puo disattivare il gate soltanto mediante configurazione amministrativa esplicita.

## Fase 2

1. Operatori e amministratori possono compilare la bozza di onboarding; responsabili e commercialisti la consultano senza modificarla.
2. Il regime contabile viene raccolto come testo dichiarato dall'azienda. Non e una regola fiscale applicativa e non alimenta calcoli finche non sara associato a una regola versionata e approvata.
3. Il raggiungimento del 100% significa soltanto “pronta per la revisione”. La validazione professionale e l'attivazione restano passaggi distinti.
4. Piano dei conti e saldi iniziali vengono indicati nel wizard come disponibili o mancanti. Il piano dei conti si carica in una pagina separata; i saldi iniziali non sono ancora importabili.
5. Il tracciato iniziale del piano dei conti e CSV UTF-8 con separatore virgola o punto e virgola. Codice e nome sono obbligatori; tipo e codice padre sono facoltativi.
6. Il limite prudenziale e 2 MiB e 5.000 conti per file. Il file originale non viene conservato: sono persistiti hash, metadati minimi e righe validate.
7. Due file con lo stesso contenuto non possono essere caricati due volte nella stessa azienda; lo stesso contenuto resta consentito in aziende diverse.
8. Fino all'introduzione del gate dedicato, un import del piano dei conti resta tecnicamente e semanticamente una bozza non utilizzabile.

## Da validare prima della produzione

- politica password e durata sessione;
- obbligatorieta TOTP per ciascun ruolo;
- retention di audit e dati personali;
- backup, RPO e RTO;
- configurazione proxy per IP attendibile;
- procedura per accesso di emergenza e revoca utenti;
- ruoli DB separati e storage cifrato dell'ambiente di destinazione.

