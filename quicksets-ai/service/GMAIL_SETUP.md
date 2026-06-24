# QuickSets Gmail Inbox

The Gmail integration routes unread messages by subject:

- `LOG`: authenticates the supplied QuickSets account, validates sets against existing exercise templates, saves valid exercise sessions, and replies with a success/failure summary.
- `CHAT`: sends the email body to OpenAI and replies with the generated answer.
- Any other subject: sends no reply and only marks the message read.

Command matching is case-insensitive and based on the beginning of the subject. Common reply prefixes are ignored, so `Re: CHAT` and `Fwd: LOG` still work. Successful `LOG` and `CHAT` messages receive the `QuickSetsProcessed` label and are marked read.

The service checks immediately in normal mode, then adapts its polling speed:

- Normal mode checks every three minutes.
- A successful `CHAT` or `LOG` reply switches polling to every 15 seconds.
- Active mode lasts for ten minutes from the most recently processed command.
- Each new successful command reply extends active mode by another ten minutes.

## LOG email format

The first three non-empty lines must be:

1. QuickSets email address
2. QuickSets password
3. Workout date in month/day/year format, using `/` or `-`

After that, list an existing exercise name followed by one set per line. Set values follow the fields enabled on that exercise template in this order:

```text
reps x weight x distance x duration
```

Only enabled fields are included. Bare weights default to pounds and bare distances default to miles. Explicit weight and distance units are converted into the template's configured units.

```text
sethahales@gmail.com
password
6/11/2026
Pushups
12
12
11
Bench Press
12x145
10x155
Sprints
400mx2:20
400mx2:19
```

LOG bodies are not printed to the server console because they contain QuickSets credentials. A malformed exercise block is not partially saved. Sessions include the Gmail message ID so retries do not create duplicates.

## One-time authorization

1. Put the downloaded Google OAuth client file at `service/credentials.json`.
2. From the `service` directory, run:

   ```powershell
   npm run gmail:authorize
   ```

3. Sign into `quicksetscoach@gmail.com` in the browser window.
4. Confirm that `service/token.json` was created.

Both credential files are ignored by Git and must be copied securely to the production server.

## Manual inbox check

Run one poll without starting the web service:

```powershell
npm run gmail:check
```

## Optional environment variables

- `GMAIL_ACCOUNT_EMAIL`: account required by the authorization script. Defaults to `quicksetscoach@gmail.com`.
- `GMAIL_CREDENTIALS_PATH`: alternate path to the OAuth client JSON file.
- `GMAIL_TOKEN_PATH`: alternate path to the saved OAuth token.
- `GMAIL_POLLING_ENABLED=false`: disables polling.
- `GMAIL_NORMAL_POLL_INTERVAL_MS`: normal polling interval. Defaults to `180000` milliseconds.
- `GMAIL_ACTIVE_POLL_INTERVAL_MS`: active polling interval. Defaults to `15000` milliseconds.
- `GMAIL_ACTIVE_WINDOW_MS`: active polling duration after the latest successful command. Defaults to `600000` milliseconds.
- `GMAIL_MAX_MESSAGES_PER_POLL`: maximum messages handled per check. Defaults to `50`.
- `GMAIL_INBOX_QUERY`: alternate Gmail search query.
- `GMAIL_PROCESSED_LABEL`: alternate processed-label name.
- `OPENAI_EMAIL_MODEL`: model used for `CHAT`. Defaults to `OPENAI_IMPORT_MODEL`, then `gpt-4o-mini`.
