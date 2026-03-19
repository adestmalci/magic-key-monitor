import { deleteWatchItemForUser, getSessionUser, updateWatchItemForUser } from "../../../../lib/magic-key/backend";

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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const result = await updateWatchItemForUser(user.id, id, {
    plannerHubId: body?.plannerHubId,
    selectedImportedMemberIds: body?.selectedImportedMemberIds,
    bookingMode: body?.bookingMode,
    eitherParkTieBreaker: body?.eitherParkTieBreaker,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 404 });
  }

  return Response.json({ item: result.item });
}
