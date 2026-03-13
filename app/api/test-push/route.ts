import { getSessionUser, readBackendState } from "../../../lib/magic-key/backend";
import { sendTestPushForUser } from "../../../lib/magic-key/notifications";

export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Sign in first to send a test push." }, { status: 401 });
  }

  const state = await readBackendState();
  const result = await sendTestPushForUser(state, user.id);

  if (!result.ok) {
    return Response.json({ error: result.message }, { status: 400 });
  }

  return Response.json({
    ok: true,
    sent: result.sent,
    message: result.message,
  });
}
