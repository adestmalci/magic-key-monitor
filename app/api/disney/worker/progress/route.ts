import { isAuthorizedWorkerRequest, reportPlannerHubJobProgress } from "../../../../../lib/magic-key/backend";

export async function POST(request: Request) {
  if (!isAuthorizedWorkerRequest(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const jobId = String(body?.jobId || "");
  const phase = String(body?.phase || "");
  const message = String(body?.message || "");
  const reportedBy = typeof body?.reportedBy === "string" ? body.reportedBy : "";

  if (!jobId) {
    return Response.json({ error: "Missing planner-hub job id." }, { status: 400 });
  }

  if (!phase || !message) {
    return Response.json({ error: "Missing Disney worker phase update." }, { status: 400 });
  }

  try {
    await reportPlannerHubJobProgress(jobId, {
      phase: phase as never,
      message,
      reportedBy,
    });
    console.info("[disney-worker-progress]", {
      jobId,
      phase,
      message,
      reportedBy,
    });
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "We couldn't record the Disney worker progress update.";
    return Response.json({ error: message }, { status: 400 });
  }
}
