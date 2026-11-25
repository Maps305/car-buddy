# car-buddy-api

NestJS backend for the Moovah Car Buddy WhatsApp claims agent.

## What's here

| Folder | Role |
| --- | --- |
| `src/whatsapp/` | Cloud API client (send text/buttons/templates, mark read, download media), webhook parser, signature check |
| `src/conversation/` | Webhook controller, per-phone session state, router, customer-facing replies |
| `src/extraction/` | Police report extraction for the **Moovah Motor Accident Police Report (D1)** form, plus rule-based review |
| `src/caimex/` | CAIMEx client (OpenAI-compatible). `chat()` for the agent, `extractStructured()` for schema-validated JSON |
| `src/customers/` | Demo customer lookup by WhatsApp number from `data/demo-customers.json` |
| `src/media/` | Media storage. `LocalMediaStore` writes to `MEDIA_DIR`; swap for S3/Blob in production |

## Setup

```bash
cd apps/api
npm install
cp .env.example .env
```

Fill in `.env`:

1. **CAIMEx**: create a key at caimex.ai → API keys. Run `npm run models -- gemini` and set `CAIMEX_EXTRACTION_MODEL` to an exact ID that takes images.
2. **WhatsApp**: Meta App Dashboard → WhatsApp → API Setup gives the test number's `WHATSAPP_PHONE_NUMBER_ID`. Add your phone to the recipient list (max 5). Create a System User token (the temporary token expires within a day). App secret is under App settings → Basic.
3. **Demo customer**: put your own WhatsApp number (international format, no +) in `data/demo-customers.json`.

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
| Yes, correct | CONFIRMING_POLICE_REPORT | Marks report confirmed, tells customer a processor will review |
| "cancel" | any | Resets |
| Anything else (text or photo) | IDLE | CAIMEx car-buddy assistant, with the photo if sent |

The webhook answers 200 immediately and processes in the background (`waitUntil` on Vercel). Messages from one number are handled in order; duplicate deliveries are ignored.

## Not production-ready yet

- Sessions, duplicate tracking and claims live in memory. They are lost on restart and not shared between instances. Move to Postgres before running more than one instance or deploying serverless.
- Media is stored on local disk.
- Customers come from a JSON file.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Compile, watch and run |
| `npm run models -- <filter>` | List CAIMEx model IDs |
| `npm run smoke:extract -- "AEX 1234" report.jpg` | Run police report extraction on a file without WhatsApp |
