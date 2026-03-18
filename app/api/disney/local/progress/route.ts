import { getUserIdFromLocalWorkerRequest, reportPlannerHubJobProgress } from "../../../../../lib/magic-key/backend";
import type { DisneyWorkerPhase } from "../../../../../lib/magic-key/types";

const allowedPhases = new Set<DisneyWorkerPhase>([
  "queued",
  "started",
  "disney_open",
  "email_step",
  "password_step",
  "select_party",
  "members_imported",
  "session_captured",
  "completed",
  "failed",
  "paused_login",
  "paused_mismatch",
]);

export async function POST(request: Request) {
  const userId = getUserIdFromLocalWorkerRequest(request);
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const jobId = String(body?.jobId || "");
  const phase = String(body?.phase || "");
  const message = String(body?.message || "");
  const reportedBy = typeof body?.reportedBy === "string" ? body.reportedBy : "";
  const deviceId = typeof body?.deviceId === "string" ? body.deviceId : "";
  const hasLocalSession = typeof body?.hasLocalSession === "boolean" ? body.hasLocalSession : undefined;

  if (!jobId || !phase || !message) {
    return Response.json({ error: "Missing Disney local progress fields." }, { status: 400 });
  }
  if (!allowedPhases.has(phase as DisneyWorkerPhase)) {
    return Response.json({ error: "Invalid Disney worker phase." }, { status: 400 });
  }

  await reportPlannerHubJobProgress(jobId, {
    phase: phase as DisneyWorkerPhase,
    message,
    reportedBy: reportedBy || `local-device:${userId}`,
    deviceId,
    hasLocalSession,
  });
  return Response.json({ ok: true });
}
