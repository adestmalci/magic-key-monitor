import { claimNextPlannerHubJob, isAuthorizedWorkerRequest } from "../../../../../lib/magic-key/backend";

export async function POST(request: Request) {
  if (!isAuthorizedWorkerRequest(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const claimed = await claimNextPlannerHubJob();
  return Response.json({ ok: true, job: claimed?.job ?? null, payload: claimed?.payload ?? null });
}
