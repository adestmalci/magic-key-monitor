import { completePlannerHubJob, isAuthorizedWorkerRequest } from "../../../../../lib/magic-key/backend";

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
    await completePlannerHubJob(jobId, {
      ok: Boolean(body?.ok),
      status: body?.status,
      importedDisneyMembers: Array.isArray(body?.importedDisneyMembers) ? body.importedDisneyMembers : undefined,
      sessionState: body?.sessionState,
      encryptedSessionState: typeof body?.encryptedSessionState === "string" ? body.encryptedSessionState : undefined,
      lastAuthFailureReason: typeof body?.lastAuthFailureReason === "string" ? body.lastAuthFailureReason : "",
      lastRequiredActionMessage:
        typeof body?.lastRequiredActionMessage === "string" ? body.lastRequiredActionMessage : "",
      note: typeof body?.note === "string" ? body.note : "",
    });

    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "We couldn't record the Disney worker result.";
    return Response.json({ error: message }, { status: 400 });
  }
}
