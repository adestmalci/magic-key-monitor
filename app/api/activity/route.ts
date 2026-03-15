import { getSessionUser, persistActivityForUser } from "../../../lib/magic-key/backend";
import type { ActivityItem } from "../../../lib/magic-key/types";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Sign in first to save account activity." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Partial<ActivityItem>;
  if (!body.message || !body.source) {
    return Response.json({ error: "Missing activity details." }, { status: 400 });
  }

  await persistActivityForUser(user.id, {
    source: body.source,
    message: body.message,
    details: Array.isArray(body.details) ? body.details.filter((item): item is string => typeof item === "string") : [],
  });

  return Response.json({ ok: true });
}
