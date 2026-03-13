import {
  getSessionUser,
  removePushSubscriptionForUser,
  upsertPushSubscriptionForUser,
} from "../../../lib/magic-key/backend";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  await upsertPushSubscriptionForUser(user.id, body);
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const endpoint = String(body?.endpoint || "");
  if (!endpoint) return Response.json({ error: "Missing endpoint." }, { status: 400 });

  await removePushSubscriptionForUser(user.id, endpoint);
  return Response.json({ ok: true });
}
