This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Scheduler Setup

This project is set up to keep the website on Vercel while running background syncs from GitHub Actions every 5 minutes.

Add these GitHub repository secrets before enabling the workflow:

- `MAGIC_KEY_APP_URL`
  - Your deployed app URL, for example `https://your-app.vercel.app`
- `CRON_SECRET`
  - Must match the `CRON_SECRET` value used by the app environment on Vercel

The workflow file lives at [`.github/workflows/sync-magic-key.yml`](./.github/workflows/sync-magic-key.yml).

## Disney Worker Setup (Railway)

Disney connect/import is intended to run on a dedicated Railway worker service, not on GitHub Actions.

The repo includes:

- [`Dockerfile`](./Dockerfile)
  - Builds the worker image with Playwright + Chromium
- [`railway.toml`](./railway.toml)
  - Tells Railway to use the Docker build
- `npm run worker:disney`
  - Starts the long-lived Disney worker loop

Add these environment variables to the Railway worker service:

- `MAGIC_KEY_APP_URL`
  - Your deployed Vercel app URL, for example `https://magic-key-monitor.vercel.app`
- `WORKER_SECRET`
  - Shared secret used only by the Disney worker endpoints
- `NODE_ENV=production`

Add the matching `WORKER_SECRET` to Vercel as well so these endpoints can authenticate the Railway worker:

- `/api/disney/worker/claim`
- `/api/disney/worker/progress`
- `/api/disney/worker/report`

During migration, worker endpoints still accept `CRON_SECRET` as a fallback, but the intended long-term split is:

- `CRON_SECRET`
  - GitHub Actions -> `/api/cron/sync`
- `WORKER_SECRET`
  - Railway Disney worker -> `/api/disney/worker/*`

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
