import { getSessionUser, upsertPreferencesForUser } from "../../../lib/magic-key/backend";

export async function PUT(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const next = await upsertPreferencesForUser(user.id, {
    emailEnabled: body?.emailEnabled,
    emailAddress: body?.emailAddress,
    alertsEnabled: body?.alertsEnabled,
    pushEnabled: body?.pushEnabled,
    syncFrequency: body?.syncFrequency,
    reservationAssist: body?.reservationAssist,
    plannerHubBooking: body?.plannerHubBooking,
    plannerHubConnection: body?.plannerHubConnection,
    importedDisneyMembers: body?.importedDisneyMembers,
    savedReservationParties: body?.savedReservationParties,
  });

  return Response.json(next);
}
