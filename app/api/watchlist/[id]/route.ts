import { deleteWatchItemForUser, getSessionUser } from "../../../../lib/magic-key/backend";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const removed = await deleteWatchItemForUser(user.id, id);
  return Response.json({ ok: removed });
}
