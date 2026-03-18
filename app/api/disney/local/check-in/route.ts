import { checkInLocalWorkerDevice, getUserIdFromLocalWorkerRequest } from "../../../../../lib/magic-key/backend";

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
  const hasLocalSession = Boolean(body?.hasLocalSession);

  if (!deviceId) {
    return Response.json({ error: "Missing local device id." }, { status: 400 });
  }

  try {
    const result = await checkInLocalWorkerDevice(userId, {
      deviceId,
      deviceName,
      platform,
      localProfilePath,
      hasLocalSession,
    });
    return Response.json({ ok: true, device: result.device });
  } catch (error) {
    const message = error instanceof Error ? error.message : "We couldn't record the local device check-in.";
    return Response.json({ error: message }, { status: 400 });
  }
}
