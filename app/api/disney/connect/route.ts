import { getSessionUser, queuePlannerHubConnectJob } from "../../../../lib/magic-key/backend";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const disneyEmail = String(body?.disneyEmail || user.email || "").trim().toLowerCase();
  const password = String(body?.password || "");

  if (!disneyEmail) {
    return Response.json({ error: "Add the Disney planner email first." }, { status: 400 });
  }

  if (!password) {
    return Response.json({ error: "Add the Disney password so the worker can capture the session." }, { status: 400 });
  }

  try {
    const job = await queuePlannerHubConnectJob(user.id, disneyEmail, password);
    console.info("[disney-connect] queued", {
      userId: user.id,
      jobId: job.id,
      plannerHubId: job.plannerHubId,
      type: job.type,
    });
    return Response.json({ ok: true, jobId: job.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "We couldn't queue the Disney connection yet.";
    return Response.json({ error: message }, { status: 400 });
  }
}
