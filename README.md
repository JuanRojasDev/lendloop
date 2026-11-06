# LendLoop

Borrow what you need. Lend what you don't.

A neighborhood tool-lending board: neighbors list tools, request them for a date range, and n8n handles notifications and overdue reminders.

Built with Next.js (App Router), TypeScript, Clerk, Convex, n8n and Tailwind CSS.

## Architecture

```
Browser ── Clerk JWT ──▶ Convex functions ── rules, data
                              │  ▲
              signed webhook  │  │  signed HTTP (overdue list, write-backs, failures)
                              ▼  │
                             n8n
```

- **Next.js** renders the UI. `proxy.ts` redirects signed-out visitors away from private pages, but that is only a convenience.
- **Convex** holds the data and every rule. Each public function checks the caller, so calling the API directly gives the same result as using the UI.
- **n8n** sends notifications and runs the daily reminder. It never touches the database: it talks to Convex through three signed HTTP routes in `convex/http.ts`.

### Automation flows

| Workflow | Trigger | What it does |
|---|---|---|
| Request notification | Convex calls the webhook when a loan is created or changes status | Verifies the signature, answers 202, notifies the right person, writes the result back |
| Overdue reminders | Every day at 9:00 UTC, or the "Run now" trigger | Fetches overdue loans, reminds each borrower, writes the result back |
| Error handler | Any failed run of the two above | Reports the failure to Convex, where it shows on the Admin page |

Notifications use a mock channel: the message goes to the n8n execution log. Each loan shows its automation history, for example "Reminder sent 2 days ago".

## Local setup

You need Node.js 22 or later, Docker and a free [Clerk](https://clerk.com) account. Convex can run locally without an account.

1. Install dependencies:

   ```bash
   npm install
   ```

2. In the Clerk dashboard, create an application and add a JWT template from the **Convex** preset. Keep the name `convex`. Copy the template's Issuer URL.

3. Create `.env.local` with your Clerk keys from **API keys**:

   ```
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
   CLERK_SECRET_KEY=sk_test_...
   ```

4. Start Convex and leave it running. It adds the Convex variables to `.env.local`.

   ```bash
   npx convex dev
   ```

   On the first run, deployment fails until the issuer is set. Set it and Convex retries by itself:

   ```bash
   npx convex env set CLERK_JWT_ISSUER_DOMAIN https://your-instance.clerk.accounts.dev
   ```

5. Create the n8n environment file and generate two secrets:

   ```bash
   cp .env.n8n.example .env.n8n
   openssl rand -hex 32
   openssl rand -hex 32
   ```

   Put them in `.env.n8n`, then give Convex the same values:

   ```bash
   npx convex env set CONVEX_TO_N8N_SECRET <first secret>
   npx convex env set N8N_TO_CONVEX_SECRET <second secret>
   npx convex env set N8N_NOTIFY_WEBHOOK_URL http://localhost:5678/webhook/lendloop-notify
   ```

6. Start n8n. It imports and publishes the workflows from `n8n/workflows` on startup.

   ```bash
   docker compose up -d
   ```

7. Start the app and open http://localhost:3000:

   ```bash
   npm run dev
   ```

### Try the rest

- **Load demo data:** nine listings with photos, five neighbors and a few loans. It replaces existing listings and loans, and keeps real sign-ins.

  ```bash
  npx convex run seed:demo
  ```

- **Make someone an admin:** sign in once, find the user's `_id` in the Convex dashboard (`npx convex dashboard`), then run:

  ```bash
  npx convex run users:setRole '{"userId":"<id>","role":"admin"}'
  ```

- **Try the overdue reminder:** the app refuses past dates, so create a loan with the demo helper and run the workflow:

  ```bash
  npx convex run seed:overdueLoan '{"toolId":"<id>","borrowerId":"<id>"}'
  docker compose exec -e N8N_RUNNERS_BROKER_PORT=5690 n8n n8n execute --id lendloopRemind01
  ```

- **Run the tests:**

  ```bash
  npm test
  ```

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `.env.local` | Clerk frontend key |
| `CLERK_SECRET_KEY` | `.env.local` | Clerk server key |
| `NEXT_PUBLIC_CONVEX_URL` | `.env.local` | Added by `npx convex dev` |
| `CLERK_JWT_ISSUER_DOMAIN` | Convex | Issuer that Convex trusts |
| `CONVEX_TO_N8N_SECRET` | Convex and `.env.n8n` | Signs webhooks from Convex to n8n |
| `N8N_TO_CONVEX_SECRET` | Convex and `.env.n8n` | Signs requests from n8n to Convex |
| `N8N_NOTIFY_WEBHOOK_URL` | Convex | n8n webhook address |
| `CONVEX_SITE_URL` | `.env.n8n` | Convex HTTP routes, as n8n reaches them |

## Security decisions

**Access control**

- Roles live in the Convex `users` table. Clients cannot pass a role, and `users:setRole` is internal, so an admin can only be created from the CLI or the dashboard.
- Every function takes the user from the verified Clerk token, never from an argument. The tests call the functions directly as other users to confirm this.
- Only the owner decides a request or marks a loan as returned. Only the borrower cancels a request.
- Approving a loan and checking for conflicts happen in one Convex mutation, which runs as a transaction, so two approvals cannot double-book a tool.

**Integration**

- Each direction has its own secret, so a leak on one side does not let an attacker forge the other.
- Requests carry an HMAC-SHA256 signature and a timestamp, and anything older than five minutes is rejected. Requests to Convex also sign the method and path, so a signature for one route does not work on another.
- Signatures are compared in constant time. Failed checks all return the same 401.
- Secrets are read from environment variables. The exported workflows contain only references such as `$env.N8N_TO_CONVEX_SECRET`.
- n8n only listens on `127.0.0.1` in the Compose file. Code nodes need `$env`, so anyone with n8n editor access can read those secrets: that editor must stay private.

**Reliability**

- Write-backs use a unique idempotency key: `notify:<loan>:<event>` or `reminder:<loan>:<date>`. A retry updates the same record, and a `sent` record is never downgraded.
- Convex retries a failed webhook with exponential backoff, four attempts in total, then marks the event `failed` so it shows on the loan.
- HTTP nodes in n8n retry three times. Anything that still fails reaches the error workflow and appears on the Admin page.

**Data minimization**

- The public page gets only the tool name and category, with no owner details. Its pictures are fixed category photos, because a listing photo could show someone's home.
- Uploads require a signed-in user. Convex checks the stored file's declared type and size, and removes anything that isn't a JPG, PNG or WebP under 5 MB. Files are served from the Convex domain, so an upload can't run on the app's origin.
- The app stores a first name and the Clerk identifier. It does not store emails.
- n8n receives the fields needed for one message: tool, dates, status, and the recipient's first name and opaque ID. The other party's data is not sent.
- Listings use a soft delete so loan history stays intact.

## Demo content

The product photos in `public/photos` are AI-generated placeholders, and the neighbors are fictional.

## What I would change for production

- Replace the mock channel with a real one, such as email through a transactional provider. That means n8n would need an address: I would have it look that up from Clerk by user ID at send time, rather than copy emails into Convex.
- Host n8n behind HTTPS, with authentication on the editor, a Postgres database, queue mode and external task runners.
- Move secrets to a secrets manager and support rotation by accepting two valid secrets during the change.
- Add rate limiting on the HTTP routes, uploads and loan requests, and check image contents rather than the declared type.
- Add a Content Security Policy and remove stored images when a listing is deleted.
- Log automation failures to an alerting tool, so someone hears about them without opening the Admin page.
- Add end-to-end tests for the main flows and run them in CI.
- Store dates with the neighborhood's time zone. Today "overdue" is calculated in UTC.
- Add pagination: lists currently stop at 100 to 200 rows.
- Add a Trusted Lender audit trail, and a dispute path for when a lender does not mark a tool as returned.
