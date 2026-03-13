import {
  createWatchItemForUser,
  getDashboardStateForUser,
  getSessionUser,
  importWatchItemsForUser,
  readStoredFeed,
} from "../../../lib/magic-key/backend";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const state = await getDashboardStateForUser(user);
  return Response.json({ watchItems: state.watchItems });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const mode = String(body?.mode || "create");

  if (mode === "import" && Array.isArray(body?.items)) {
    await importWatchItemsForUser(user.id, body.items);
    const state = await getDashboardStateForUser(user);
    return Response.json({ watchItems: state.watchItems });
  }

  const rows = await readStoredFeed();
  const result = await createWatchItemForUser(
    user.id,
    {
      date: String(body?.date || ""),
      passType: body?.passType,
      preferredPark: body?.preferredPark,
    },
    rows
  );

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  return Response.json({ item: result.item });
}
