# HANDOFF_CURRENT

## Current source of truth
- Treat the latest committed code on `main` as reality.
- The current baseline commit is `cbe49d4` (`Align sync timestamps and stabilize mickey cursor`).
- Treat `/Users/aryadestmalci/Desktop/disney.txt` as history and product intent, not proof that a change landed.

## Current production architecture
- App hosting: Vercel
- Background scheduler: GitHub Actions every 5 minutes via `.github/workflows/sync-magic-key.yml`
- Persistent hosted state: Supabase table `magic_key_store`
- Fallback snapshot/seed data: `data/magic-key-feed.json`

## Current app state
- The dashboard UI is split into reusable sections under `components/magic-key/` and builds successfully with `npm run build`.
- `app/api/magic-key-status/route.ts` now supports live refresh behavior with cached/snapshot fallback while preserving the existing feed row body shape.
- The client still consumes rows in the same contract: `date`, `passType`, `preferredPark`, `status`.
- Browser notifications, background push plumbing, email delivery hooks, server-backed activity, and signed-in watchlist/preferences persistence are implemented.
- iPhone/Home Screen notification guidance is implemented in the UI.
- The top calendar/add-watch flow includes the custom pass-aware picker with blocked dates greyed out and unavailable dates still watchable.
- The page includes the Mickey background effect and the current Mickey cursor treatment.

## What is now hosted and persistent
- Users / sessions
- Saved watchlist items
- Saved preferences
- Push subscriptions
- Recent activity history
- Sync metadata
- Stored feed snapshot / latest good feed

## Checklist status
- `Q2` Backend live sync: implemented with hosted persistence and 5-minute background scheduling.
- `Q4` Phone push notifications: implemented in code, with final behavior dependent on device subscription and supported browser/Home Screen context.
- `Q5` Email alerts: implemented in code, with real sending dependent on valid Resend sender authorization.
- `Q6` Saved preferences / persistence: implemented.
- `Q7` Account / alerts UI cleanup: implemented.
- `Q8` Grey out blocked dates in the picker: implemented.
- `Q9` Correct blocked vs unavailable logic: implemented.
- `Q10` Split the large page into reusable components: implemented.

## Current operational caveats
- `data/magic-key-feed.json` is no longer the primary production database. It remains useful as local fallback/seed data and as a backup snapshot artifact.
- GitHub Actions is limited to a 5-minute schedule, so hosted background checks are every 5 minutes, not every minute.
- Resend sender authorization still has to be valid in production or magic-link/email sending can fail with an authorization error.
- Closed-app push still requires:
  - a supported browser/device context
  - notification permission granted
  - a saved push subscription for the signed-in device
- When Disney live fetch fails, the app is expected to show the latest check time while honestly indicating that it is showing the last good snapshot.

## Recommended next steps
1. Verify the latest deployed Vercel build reflects the cursor/timestamp fixes from `cbe49d4`.
2. Confirm the Activity tab trigger labels match observed sync behavior in production.
3. If desired, commit the handoff docs and optionally the current `data/magic-key-feed.json` snapshot so future devices / Codex sessions inherit the latest written context.
4. If email sending still shows authorization errors, fix the Resend sender/domain configuration.
