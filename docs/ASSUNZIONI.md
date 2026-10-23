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

## Da validare prima della produzione

- politica password e durata sessione;
- obbligatorieta TOTP per ciascun ruolo;
- retention di audit e dati personali;
- backup, RPO e RTO;
- configurazione proxy per IP attendibile;
- procedura per accesso di emergenza e revoca utenti;
- ruoli DB separati e storage cifrato dell'ambiente di destinazione.

