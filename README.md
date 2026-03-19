This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Scheduler Setup

This project is set up to keep the website on Vercel while running background watchlist syncs from `cron-job.org`.

Use `cron-job.org` to hit the deployed scheduler endpoint every 5 minutes:

- URL
  - `https://your-app.vercel.app/api/cron/sync`
- Method
  - `GET`
- Custom header
  - `x-cron-secret: <CRON_SECRET>`

The app route accepts either:

- `x-cron-secret: <CRON_SECRET>`
- `Authorization: Bearer <CRON_SECRET>`

`cron-job.org` supports arbitrary custom headers, so the simplest setup is:

1. Create a job in `cron-job.org`
2. Set it to run every 5 minutes
3. Point it at `https://your-app.vercel.app/api/cron/sync`
4. Add header `x-cron-secret` with the same `CRON_SECRET` value used by the app on Vercel

The scheduler is considered healthy only when the scheduler actually reaches:

- `GET /api/cron/sync`

If `cron-job.org` stops before the request reaches the backend, the app will keep showing the last recorded scheduler heartbeat until it becomes delayed or stale.

### Required app environment variable

- `CRON_SECRET`
  - Set this in Vercel
  - Reuse the exact same value in the `cron-job.org` custom header

### Recommended cron-job.org settings

- Frequency: every 5 minutes
- Timeout: leave the default unless you have a reason to change it
- Follow redirects: enabled
- Notifications: enabled for failures

### What success looks like

A healthy run returns HTTP `200` with JSON similar to:

```json
{ "ok": true }
```

The top sync strip in the app should then update:

- `Live Calendar: ...`
- `Auto Scheduler: ...`

The `Auto Scheduler` time is the scheduler heartbeat. It is intentionally separate from the live calendar time.

## Disney Worker Setup (Local macOS)

Disney connect/import now targets a local macOS worker instead of GitHub Actions.

The local flow is:

1. Pair a Mac from the `Reserve` tab.
2. Paste the pairing payload into the macOS tray app.
3. Start the local worker on that Mac.
4. Use `Open Disney local login` once per Mac when you need to establish the dedicated Disney session/profile.
5. Queue Disney connect/import jobs from `Reserve`; the active Mac claims them automatically.

### Local worker scripts

- `npm run worker:disney:local`
  - Starts the long-lived local Disney worker loop
- `npm run worker:disney:login`
  - Opens the dedicated local Playwright browser profile in a visible Disney login window

### Local worker environment variables

The local worker expects:

- `MAGIC_KEY_APP_URL`
  - Your deployed Vercel app URL, for example `https://magic-key-monitor.vercel.app`
- `MAGIC_KEY_LOCAL_WORKER_TOKEN`
  - Pairing token created from the `Reserve` tab
- `MAGIC_KEY_LOCAL_DEVICE_ID`
  - Device id from the pairing payload
- `MAGIC_KEY_LOCAL_DEVICE_NAME`
  - Friendly name for that Mac, for example `Arya MacBook`
- `MAGIC_KEY_LOCAL_PROFILE_DIR`
  - Persistent Disney browser profile directory on that Mac

### macOS tray app starter

The repo includes a starter macOS menu bar app at:

- [`macos/MagicKeyDisneyWorkerTray`](./macos/MagicKeyDisneyWorkerTray)

You can run it with:

```bash
cd macos/MagicKeyDisneyWorkerTray
swift run
```

Paste the pairing payload from `Reserve`, then use:

- `Start worker`
- `Open Disney local login`

to establish the local device flow.

### Legacy cloud worker files

The existing Railway/GitHub worker files remain in the repo for compatibility and future cloud work, but the intended v1 path is now:

- local macOS Disney worker for connect/import
- `cron-job.org` only for background watchlist sync

## Hosted Storage Setup

For local development, the app falls back to the JSON files in `data/`.

For hosted deployments like Vercel, use Supabase so background syncs and account state are not written to the read-only deployment filesystem.

1. Create a Supabase project.
2. Run [`supabase/schema.sql`](./supabase/schema.sql) in the Supabase SQL editor.
3. Add these environment variables to Vercel:
   - `SUPABASE_URL`
     - Your Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY`
     - The service role key from Supabase project settings
   - `SUPABASE_STORAGE_TABLE`
     - Optional, defaults to `magic_key_store`

The hosted store keeps two JSON blobs:

- `backend-state`
  - users, preferences, watchlist, magic links, push subscriptions, sync metadata
- `feed`
  - the latest normalized Magic Key feed rows

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
