import { NextResponse } from "next/server";
import { consumeMagicLink, setSessionCookie } from "../../../lib/magic-key/backend";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";

  const sessionToken = await consumeMagicLink(token);
  if (!sessionToken) {
    return NextResponse.redirect(new URL("/?auth=invalid", request.url));
  }

  await setSessionCookie(sessionToken);
  return NextResponse.redirect(new URL("/?auth=success", request.url));
}
