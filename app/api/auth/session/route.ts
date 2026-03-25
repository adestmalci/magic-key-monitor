import { clearSessionCookie, getDashboardStateForUser, getSessionUser } from "../../../../lib/magic-key/backend";

export async function GET(request: Request) {
  const user = await getSessionUser();
  const currentDeviceId = request.headers.get("x-browser-device-id") || "";
  const state = await getDashboardStateForUser(user, currentDeviceId);
  return Response.json(state, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function DELETE() {
  await clearSessionCookie();
  return Response.json({ ok: true });
}
