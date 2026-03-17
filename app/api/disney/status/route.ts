import { getDisneyStatusForUser, getSessionUser } from "../../../../lib/magic-key/backend";

export async function GET() {
  const user = await getSessionUser();
  const status = await getDisneyStatusForUser(user);
  return Response.json(status, {
    headers: { "Cache-Control": "no-store" },
  });
}
