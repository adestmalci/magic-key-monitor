import { getUserIdFromLocalWorkerRequest, queuePlannerHubImportJob } from "../../../../../lib/magic-key/backend";

export async function POST(request: Request) {
  const userId = getUserIdFromLocalWorkerRequest(request);
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const job = await queuePlannerHubImportJob(userId);
    console.info("[disney-local-import] queued", {
      userId,
      jobId: job.id,
      plannerHubId: job.plannerHubId,
      type: job.type,
    });
    return Response.json({ ok: true, jobId: job.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "We couldn't queue the Disney member import from this Mac yet.";
    return Response.json({ error: message }, { status: 400 });
  }
}
