import { getSessionUser, queuePlannerHubImportJob } from "../../../../lib/magic-key/backend";

export async function POST() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const job = await queuePlannerHubImportJob(user.id);
    return Response.json({ ok: true, jobId: job.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "We couldn't queue the Disney member import yet.";
    return Response.json({ error: message }, { status: 400 });
  }
}
