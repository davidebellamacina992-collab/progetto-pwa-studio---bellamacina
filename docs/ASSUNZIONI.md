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
4. Piano dei conti e saldi iniziali vengono indicati nel wizard come disponibili o mancanti e si importano in pagine separate, sempre come bozze controllate.
5. Il tracciato iniziale del piano dei conti e CSV UTF-8 con separatore virgola o punto e virgola. Codice e nome sono obbligatori; tipo e codice padre sono facoltativi.
6. Il limite prudenziale e 2 MiB e 5.000 conti per file. Il file originale non viene conservato: sono persistiti hash, metadati minimi e righe validate.
7. Due file con lo stesso contenuto non possono essere caricati due volte nella stessa azienda; lo stesso contenuto resta consentito in aziende diverse.
8. Un import del piano dei conti resta non utilizzabile durante bozza, revisione e approvazione. La finalizzazione richiede un'azione separata del responsabile e lo rende immutabile.
9. Possono esistere piu piani finalizzati per la stessa azienda. Il piano operativo e determinato dall'ultima selezione finalizzata; ogni sostituzione crea una nuova selezione versionata e lascia immutabile lo storico.
10. Un piano respinto non viene riaperto: l'operatore corregge il file e crea una nuova bozza, preservando integralmente richiesta e decisione precedenti.
11. Una anagrafica deve contenere almeno un identificativo tra codice fiscale e partita IVA. Gli identificativi sono normalizzati in maiuscolo e univoci nella singola azienda, non globalmente.
12. In questo incremento non vengono verificate banche dati esterne e non viene attribuita validita fiscale agli identificativi: il responsabile ne conferma la correttezza durante la revisione.
13. Una anagrafica respinta o finalizzata non viene sovrascritta. Le correzioni saranno introdotte come nuova versione collegata all'originale prima che documenti e registrazioni inizino a referenziarla.
14. Il tracciato dei saldi iniziali usa `codice, descrizione, dare, avere`; ogni conto compare una sola volta e valorizza un solo lato. Non sono ammessi importi negativi: la posizione contabile e espressa dal lato Dare/Avere.
15. I saldi possono riferirsi soltanto a un piano dei conti gia finalizzato della stessa azienda. La provenienza del singolo import resta distinta dalla selezione globale del piano operativo.
16. L'azienda creata dal seed di sviluppo disattiva il TOTP per consentire una demo immediata con due supervisori fittizi; questa eccezione non e disponibile in produzione.
17. Puo esistere una sola selezione del piano operativo non conclusa per azienda. Una nuova proposta e consentita dopo finalizzazione o rifiuto della precedente.

## Da validare prima della produzione

- politica password e durata sessione;
- obbligatorieta TOTP per ciascun ruolo;
- retention di audit e dati personali;
- backup, RPO e RTO;
- configurazione proxy per IP attendibile;
- procedura per accesso di emergenza e revoca utenti;
- ruoli DB separati e storage cifrato dell'ambiente di destinazione.

