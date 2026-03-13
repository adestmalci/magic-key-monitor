import { clearSessionCookie, getDashboardStateForUser, getSessionUser } from "../../../../lib/magic-key/backend";

export async function GET() {
  const user = await getSessionUser();
  const state = await getDashboardStateForUser(user);
  return Response.json(state, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function DELETE() {
  await clearSessionCookie();
  return Response.json({ ok: true });
}
