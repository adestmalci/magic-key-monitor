import { getSessionUser, resetPlannerHubConnection } from "../../../../lib/magic-key/backend";

export async function POST() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await resetPlannerHubConnection(user.id);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "We couldn't reset the Disney planner hub yet.";
    return Response.json({ error: message }, { status: 400 });
  }
}
