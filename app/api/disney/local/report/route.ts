import { completePlannerHubJob, getUserIdFromLocalWorkerRequest } from "../../../../../lib/magic-key/backend";

export async function POST(request: Request) {
  const userId = getUserIdFromLocalWorkerRequest(request);
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const jobId = String(body?.jobId || "");
  if (!jobId) {
    return Response.json({ error: "Missing planner-hub job id." }, { status: 400 });
  }

  await completePlannerHubJob(jobId, {
    ok: Boolean(body?.ok),
    status: body?.status,
    importedDisneyMembers: Array.isArray(body?.importedDisneyMembers) ? body.importedDisneyMembers : undefined,
    sessionState: body?.sessionState,
    encryptedSessionState: typeof body?.encryptedSessionState === "string" ? body.encryptedSessionState : undefined,
    lastAuthFailureReason: typeof body?.lastAuthFailureReason === "string" ? body.lastAuthFailureReason : "",
    lastRequiredActionMessage: typeof body?.lastRequiredActionMessage === "string" ? body.lastRequiredActionMessage : "",
    note: typeof body?.note === "string" ? body.note : "",
    reportedBy: typeof body?.reportedBy === "string" ? body.reportedBy : `local-device:${userId}`,
    deviceId: typeof body?.deviceId === "string" ? body.deviceId : "",
    hasLocalSession: typeof body?.hasLocalSession === "boolean" ? body.hasLocalSession : undefined,
  });

  return Response.json({ ok: true });
}
