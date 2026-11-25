# car-buddy-web

Claims desk for Moovah staff: claims processors and assessors review claims submitted through the Car Buddy WhatsApp assistant.

## Run

The API (`apps/api`) must be running first, with `JWT_SECRET` set and staff seeded (`npm run db:seed` there).

```bash
cd apps/web
npm install
cp .env.example .env.local   # API_URL, default http://localhost:3000
npm run dev                  # http://localhost:3001
```

Log in with an account from `apps/api/data/demo-staff.json` and the `SEED_STAFF_PASSWORD` you seeded:

| Email | Role |
| --- | --- |
| processor@carbuddy.test | Claims processor |
| assessor@carbuddy.test | Assessor |
| assessor2@carbuddy.test | Assessor |

## Pages

| Route | What it shows |
| --- | --- |
| `/login` | Staff login |
| `/claims` | Queue with status tabs. Assessors only see claims assigned to them |
| `/claims/[id]` | Police report photo beside the fields read from it (low-confidence fields amber, missing ones red), police outcome, parties, assessment, history, and the next actions for your role |

The browser never talks to the API directly: pages and form actions call it server-side with the session cookie, and document images go through `/api/documents/...`.

## Claim flow

New → In review → Assessor assigned → Being assessed → Awaiting decision → Approved or Rejected.
A processor can also mark a claim as waiting on the customer, then resume review. Customer notifications and the repair authorisation letter come in the next phase.
