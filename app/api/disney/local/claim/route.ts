import { claimNextPlannerHubJobForLocalDevice, getUserIdFromLocalWorkerRequest } from "../../../../../lib/magic-key/backend";

export async function POST(request: Request) {
  const userId = getUserIdFromLocalWorkerRequest(request);
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const deviceId = String(body?.deviceId || "").trim();
  const deviceName = String(body?.deviceName || "My Mac").trim() || "My Mac";
  const platform = String(body?.platform || "macos").trim() || "macos";
  const localProfilePath = String(body?.localProfilePath || "").trim();
  const hasLocalSession = typeof body?.hasLocalSession === "boolean" ? body.hasLocalSession : undefined;

  if (!deviceId) {
    return Response.json({ error: "Missing local device id." }, { status: 400 });
  }

  const claimed = await claimNextPlannerHubJobForLocalDevice(userId, {
    deviceId,
    deviceName,
    platform,
    localProfilePath,
    hasLocalSession,
  });
  return Response.json({
    ok: true,
    job: claimed?.job ?? null,
    payload: claimed?.payload ?? null,
    diagnostics: claimed?.diagnostics ?? null,
  });
}
