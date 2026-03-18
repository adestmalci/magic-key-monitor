import { getSessionUser, issueLocalWorkerPairingToken } from "../../../../../lib/magic-key/backend";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const deviceName = String(body?.deviceName || "My Mac").trim() || "My Mac";

  try {
    const pairing = await issueLocalWorkerPairingToken(user.id, deviceName);
    return Response.json({
      ok: true,
      token: pairing.token,
      deviceId: pairing.deviceId,
      deviceName: pairing.deviceName,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "We couldn't create a local worker pairing token.";
    return Response.json({ error: message }, { status: 400 });
  }
}
