import { evaluateWatchItemsAgainstFeed } from "../../../../lib/magic-key/backend";
import { syncLiveFeed } from "../../../../lib/magic-key/live-sync";
import { sendAlertsForChanges } from "../../../../lib/magic-key/notifications";

function isAuthorized(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return true;

  const authHeader = request.headers.get("authorization");
  const headerSecret = request.headers.get("x-cron-secret");
  const bearer = authHeader?.replace(/^Bearer\s+/i, "");
  return bearer === expected || headerSecret === expected;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { rows, syncMeta } = await syncLiveFeed();
    const evaluation = await evaluateWatchItemsAgainstFeed(rows);
    await sendAlertsForChanges(evaluation.state, evaluation.changesByUser);

    return Response.json({
      ok: true,
      syncMeta,
      changedUsers: evaluation.changesByUser.size,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown cron sync failure.";
    console.error("Cron sync failed:", error);

    return Response.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
