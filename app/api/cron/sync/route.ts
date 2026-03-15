import { evaluateWatchItemsAgainstFeed, recordActivityForUser, writeBackendState } from "../../../../lib/magic-key/backend";
import { PASS_TYPES, STATUS_META } from "../../../../lib/magic-key/config";
import { syncLiveFeed } from "../../../../lib/magic-key/live-sync";
import { sendAlertsForChanges } from "../../../../lib/magic-key/notifications";
import { formatWatchDate } from "../../../../lib/magic-key/utils";

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

    for (const userId of evaluation.evaluatedUserIds) {
      const changes = evaluation.changesByUser.get(userId) ?? [];
      const summary =
        changes.length === 0
          ? `Wishboard auto-refreshed. ${syncMeta.message}`
          : `Wishboard auto-refreshed. ${changes.length} watched ${
              changes.length === 1 ? "date changed" : "dates changed"
            }. ${syncMeta.message}`;

      recordActivityForUser(evaluation.state, userId, {
        source: "auto",
        message: summary,
        details: changes.map(({ item, previousStatus, currentStatus }) => {
          const passName = PASS_TYPES.find((row) => row.id === item.passType)?.name ?? item.passType;
          return `${passName} • ${formatWatchDate(item.date)} • ${STATUS_META[previousStatus].compactLabel} -> ${STATUS_META[currentStatus].compactLabel}`;
        }),
        createdAt: syncMeta.lastSuccessfulSyncAt || new Date().toISOString(),
      });
    }

    await writeBackendState(evaluation.state);
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
