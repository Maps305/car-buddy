# car-buddy-api

NestJS backend for the Moovah Car Buddy WhatsApp claims agent.

## What's here

| Folder | Role |
| --- | --- |
| `src/whatsapp/` | Cloud API client (send text/buttons/templates, mark read, download media), webhook parser, signature check |
| `src/conversation/` | Webhook controller, per-phone session state, router, customer-facing replies |
| `src/extraction/` | Police report extraction for the **Moovah Motor Accident Police Report (D1)** form, plus rule-based review |
| `src/caimex/` | CAIMEx client (OpenAI-compatible). `chat()` for the agent, `extractStructured()` for schema-validated JSON |
| `src/claims/` | Claims service: drafts, documents, status changes. `claim-transitions.ts` holds the allowed moves; customers and the agent can only submit, cancel a draft, or answer an info request |
| `src/customers/` | Customer + active policy + vehicles lookup by WhatsApp number |
| `src/db/` | Drizzle schema and database module. Migrations live in `drizzle/` |
| `src/media/` | Media storage. `LocalMediaStore` writes to `MEDIA_DIR`; swap for S3/Blob in production |

## Setup

```bash
cd apps/api
npm install
cp .env.example .env
npm run db:up        # Postgres 17 in Docker (docker-compose.yml at repo root)
npm run db:migrate
npm run db:seed      # loads data/demo-customers.json; safe to re-run
```

To use a hosted database (Neon, Supabase), point `DATABASE_URL` at it and skip `db:up`.

Fill in `.env`:

1. **CAIMEx**: create a key at caimex.ai → API keys. Run `npm run models -- gemini` and set `CAIMEX_EXTRACTION_MODEL` to an exact ID that takes images.
2. **WhatsApp**: Meta App Dashboard → WhatsApp → API Setup gives the test number's `WHATSAPP_PHONE_NUMBER_ID`. Add your phone to the recipient list (max 5). Create a System User token (the temporary token expires within a day). App secret is under App settings → Basic.
3. **Demo customer**: put your own WhatsApp number (international format, no +) in `data/demo-customers.json`, then `npm run db:seed`.

## Run locally

```bash
npm run dev
```

Expose it so Meta can reach the webhook, e.g. `cloudflared tunnel --url http://localhost:3000` or `ngrok http 3000`. In Meta → WhatsApp → Configuration set:

- Callback URL: `https://<tunnel>/webhooks/whatsapp`
- Verify token: your `WHATSAPP_VERIFY_TOKEN`
- Subscribe to the `messages` field

## Conversation flow

| Customer sends | State | Result |
| --- | --- | --- |
| "claim", "accident", … | IDLE | Opens claim `CLM-xxxxxx`, asks for the D1 police report photo |
| Photo or PDF | AWAITING_POLICE_REPORT | Downloads and stores it, extracts, replies with summary + **Yes, correct / Send again** buttons |
| Yes, correct | CONFIRMING_POLICE_REPORT | Confirms the document, copies accident date/time/place onto the claim, moves it DRAFT → SUBMITTED |
| "cancel" | any | Closes a draft claim and resets |
| Anything else (text or photo) | IDLE | CAIMEx car-buddy assistant, with the photo if sent |

The webhook answers 200 immediately and processes in the background (`waitUntil` on Vercel). Messages from one number are handled in order; duplicate deliveries are ignored.

## Data

Sessions, processed WhatsApp message IDs (duplicate protection), customers, claims, documents (with extraction and review JSON) and claim events are in Postgres. Every status change and document action writes a `claim_events` row.

Changing the schema: edit `src/db/schema.ts`, run `npm run db:generate`, review the SQL in `drizzle/`, then `npm run db:migrate`. `npm run db:studio` opens a browser view of the tables.

## Not production-ready yet

- Media is stored on local disk; move to S3/Blob/Supabase Storage once hosting is chosen.
- Messages from one number are processed in order within one server instance only.
- Claims are submitted straight after the police report is confirmed; the claim-form conversation and remaining attachments come next.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Compile, watch and run |
| `npm run db:up` / `db:migrate` / `db:seed` | Start local Postgres, apply migrations, load demo customers |
| `npm run db:generate` | Create a migration after changing `src/db/schema.ts` |
| `npm run models -- <filter>` | List CAIMEx model IDs |
| `npm run smoke:extract -- "AEX 1234" report.jpg` | Run police report extraction on a file without WhatsApp |
