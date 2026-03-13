# HANDOFF_CURRENT

## Current focus
- Generate and stabilize `data/magic-key-feed.json` from Disney's working JSON endpoints for this repo.

## Current status
- Confirmed the correct repo root is `magic-key-monitor` on `main`.
- Present scripts: `scripts/fetch-disney-api.mjs`, `scripts/inspect-disney-magic-key.mjs`, `scripts/inspect-disney-magic-key-firefox.mjs`.
- `scripts/fetch-disney-api.mjs` returns HTTP 200 for both `get-passes` and `get-availability`.
- Direct Disney JSON responses appear to contain the usable Magic Key availability data by pass and park.
- Chromium Playwright currently fails on page load with `net::ERR_HTTP2_PROTOCOL_ERROR`.
- Firefox Playwright succeeds and confirms the page triggers the relevant Disney API calls.
- `app/api/magic-key-status/route.ts` reads from `data/magic-key-feed.json` rather than fetching Disney live at request time.
- `data/magic-key-feed.json` already exists and currently uses rows with `date`, `passType`, `preferredPark`, and `status`.
- `app/page.tsx` is already wired to match feed rows by date, pass type, and preferred park, with fallback support for normalized status values.
- Untracked items currently include `app/page.tsx.bak.20260312-163706`, `docs/`, and `scripts/`.

## Next steps
- Inspect `tmp/get-passes.json` and `tmp/get-availability.json` to confirm the exact Disney response shape.
- Add or update a generator script that writes `data/magic-key-feed.json` from Disney's direct JSON endpoints.
- Prefer direct API fetches over rendered-page scraping for status generation.
- Review untracked files and `.gitignore` before committing.
