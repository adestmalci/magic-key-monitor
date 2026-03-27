import { evaluateWatchItemsAgainstFeed, readBackendState, recordActivityForUser, writeBackendState } from "../../../../lib/magic-key/backend";
import { PASS_TYPES, STATUS_META } from "../../../../lib/magic-key/config";
import { syncLiveFeed } from "../../../../lib/magic-key/live-sync";
import { sendAlertsForChanges } from "../../../../lib/magic-key/notifications";
import { formatWatchDate } from "../../../../lib/magic-key/utils";

function isReservableStatus(status: string) {
  return status === "dl" || status === "dca" || status === "either";
}

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
        trigger: "Background scheduler heartbeat",
        message: summary,
        details: changes.map(({ item, previousStatus, currentStatus }) => {
          const passName = PASS_TYPES.find((row) => row.id === item.passType)?.name ?? item.passType;
          return `${passName} • ${formatWatchDate(item.date)} • ${STATUS_META[previousStatus].compactLabel} -> ${STATUS_META[currentStatus].compactLabel}`;
        }),
        createdAt: syncMeta.lastSuccessfulSyncAt || new Date().toISOString(),
      });

      for (const change of changes) {
        if (!isReservableStatus(change.currentStatus) || isReservableStatus(change.previousStatus)) {
          continue;
        }

        const passName = PASS_TYPES.find((row) => row.id === change.item.passType)?.name ?? change.item.passType;
        recordActivityForUser(evaluation.state, userId, {
          source: "auto",
          trigger: "Backend availability detection",
          message: `Scheduler detected new availability for ${passName} on ${formatWatchDate(change.item.date)} and started delivery.`,
          details: [`${STATUS_META[change.currentStatus].compactLabel} became available on this scheduler heartbeat.`],
          createdAt: syncMeta.lastSuccessfulSyncAt || new Date().toISOString(),
        });
      }
    }

    evaluation.state.syncMeta = {
      ...evaluation.state.syncMeta,
      lastBackgroundRunAt: new Date().toISOString(),
      lastBackgroundRunMessage: `Background scheduler finished. ${syncMeta.message}`,
    };

    await writeBackendState(evaluation.state);
    const deliverySummaries = await sendAlertsForChanges(evaluation.state, evaluation.changesByUser);

    if (deliverySummaries.length > 0) {
      const latestState = await readBackendState();
      const deliveryAt = syncMeta.lastSuccessfulSyncAt || new Date().toISOString();

      for (const summary of deliverySummaries) {
        const changes = evaluation.changesByUser.get(summary.userId) ?? [];
        if (changes.length === 0) continue;

        const details: string[] = [];

        if (summary.email.attempted) {
          details.push(`Email: ${summary.email.ok ? "sent" : "failed"} • ${summary.email.message}`);
        } else {
          details.push("Email: skipped");
        }

        if (summary.push.attempted) {
          details.push(`Push: ${summary.push.ok ? "sent" : "failed"} • ${summary.push.message}`);
        } else {
          details.push("Push: skipped");
        }

        recordActivityForUser(latestState, summary.userId, {
          source: "auto",
          trigger: "Alert delivery fanout",
          message: `Watched-date delivery ran for ${changes.length} changed ${changes.length === 1 ? "date" : "dates"} on this scheduler heartbeat.`,
          details,
          createdAt: deliveryAt,
        });
      }

      await writeBackendState(latestState);
    }

    return Response.json({
      ok: true,
      syncMeta,
      changedUsers: evaluation.changesByUser.size,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown cron sync failure.";
    console.error("Cron sync failed:", error);

    try {
      const { readBackendState, writeBackendState } = await import("../../../../lib/magic-key/backend");
      const state = await readBackendState();
      const failureAt = new Date().toISOString();

      for (const user of state.users) {
        recordActivityForUser(state, user.id, {
          source: "auto",
          trigger: "Background scheduler heartbeat",
          message: "Wishboard auto-refresh failed before the latest scheduler run could complete.",
          details: [message],
          createdAt: failureAt,
        });
      }

      state.syncMeta = {
        ...state.syncMeta,
        lastBackgroundRunAt: failureAt,
        lastBackgroundRunMessage: `Background scheduler failed: ${message}`,
      };
      await writeBackendState(state);
    } catch (secondaryError) {
      console.error("Could not record background scheduler failure:", secondaryError);
    }

    return Response.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
