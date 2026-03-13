import { evaluateWatchItemsAgainstFeed, getSessionUser } from "../../../lib/magic-key/backend";
import { getFeedForRequest } from "../../../lib/magic-key/live-sync";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("refresh") === "1";

  const { rows, syncMeta } = await getFeedForRequest({
    forceRefresh,
    maxAgeMs: forceRefresh ? 0 : 55_000,
  });

  if (forceRefresh && syncMeta.mode === "live-disney") {
    await evaluateWatchItemsAgainstFeed(rows);
  }

  const headers = new Headers({
    "Cache-Control": "no-store, max-age=0",
    "X-Magic-Key-Source": syncMeta.mode,
    "X-Magic-Key-Stale": syncMeta.stale ? "1" : "0",
    "X-Magic-Key-Last-Successful-Sync": syncMeta.lastSuccessfulSyncAt || "",
    "X-Magic-Key-Status": syncMeta.message,
  });

  const sessionUser = await getSessionUser();
  if (sessionUser) {
    headers.set("X-Magic-Key-Viewer", sessionUser.email);
  }

  return Response.json(rows, { headers });
}
