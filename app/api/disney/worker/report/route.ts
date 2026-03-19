import { completePlannerHubJob, isAuthorizedWorkerRequest, readBackendState } from "../../../../../lib/magic-key/backend";
import { sendPlannerHubBookingStatusEmailForUser } from "../../../../../lib/magic-key/notifications";

export async function POST(request: Request) {
  if (!isAuthorizedWorkerRequest(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const jobId = String(body?.jobId || "");

  if (!jobId) {
    return Response.json({ error: "Missing planner-hub job id." }, { status: 400 });
  }

  try {
    const result = await completePlannerHubJob(jobId, {
      ok: Boolean(body?.ok),
      status: body?.status,
      importedDisneyMembers: Array.isArray(body?.importedDisneyMembers) ? body.importedDisneyMembers : undefined,
      diagnostics: body?.diagnostics ?? null,
      sessionState: body?.sessionState,
      encryptedSessionState: typeof body?.encryptedSessionState === "string" ? body.encryptedSessionState : undefined,
      lastAuthFailureReason: typeof body?.lastAuthFailureReason === "string" ? body.lastAuthFailureReason : "",
      lastRequiredActionMessage:
        typeof body?.lastRequiredActionMessage === "string" ? body.lastRequiredActionMessage : "",
      note: typeof body?.note === "string" ? body.note : "",
      reportedBy: typeof body?.reportedBy === "string" ? body.reportedBy : "",
    });

    if (
      result.jobType === "booking" &&
      result.targetWatchDate &&
      (result.status === "paused_login" || result.status === "paused_mismatch" || result.status === "failed")
    ) {
      const state = await readBackendState();
      await sendPlannerHubBookingStatusEmailForUser(state, result.userId, {
        watchDate: result.targetWatchDate,
        status: result.status,
        summary: result.resultMessage || "The latest Disney booking attempt needs attention.",
        nextStep:
          result.requiredActionMessage ||
          (result.status === "paused_mismatch"
            ? "Refresh the connected party and reselect the Magic Key targets before the next attempt."
            : result.status === "paused_login"
              ? "Reconnect Disney on your Mac before the next attempt."
              : "Open Reserve to review the latest booking result."),
      });
    }
    console.info("[disney-worker-report]", {
      jobId,
      ok: Boolean(body?.ok),
      status: body?.status,
      reason:
        typeof body?.lastAuthFailureReason === "string"
          ? body.lastAuthFailureReason
          : typeof body?.lastRequiredActionMessage === "string"
            ? body.lastRequiredActionMessage
            : typeof body?.note === "string"
              ? body.note
              : "",
      reportedBy: typeof body?.reportedBy === "string" ? body.reportedBy : "",
    });

    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "We couldn't record the Disney worker result.";
    return Response.json({ error: message }, { status: 400 });
  }
}
