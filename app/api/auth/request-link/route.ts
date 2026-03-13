import { createMagicLink } from "../../../../lib/magic-key/backend";
import { Resend } from "resend";

function buildMagicLink(request: Request, token: string) {
  const url = new URL(request.url);
  return `${url.origin}/auth/verify?token=${encodeURIComponent(token)}`;
}

function emailHtml(link: string) {
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;background:#f5f3ff;padding:24px;">
      <div style="max-width:560px;margin:0 auto;background:white;border-radius:28px;padding:28px;border:1px solid #e9d5ff;">
        <div style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#ec4899,#38bdf8);color:white;border-radius:999px;padding:8px 14px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">
          Magic Key Monitor
        </div>
        <h1 style="margin:18px 0 10px;font-size:28px;line-height:1.2;color:#18181b;">Your sign-in link is ready</h1>
        <p style="margin:0 0 18px;color:#52525b;font-size:15px;">Tap the button below to open your watchlist and keep your Disney syncs dancing in the background.</p>
        <a href="${link}" style="display:inline-block;background:#7c3aed;color:white;text-decoration:none;border-radius:16px;padding:14px 18px;font-weight:700;">Open Magic Key Monitor</a>
        <p style="margin-top:18px;color:#71717a;font-size:13px;">This link expires in 20 minutes.</p>
      </div>
    </div>
  `;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = String(body?.email || "").trim().toLowerCase();

  if (!email) {
    return Response.json({ error: "Please add an email first." }, { status: 400 });
  }

  const { token } = await createMagicLink(email);
  const link = buildMagicLink(request, token);

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return Response.json({
      ok: true,
      previewLink: link,
      message: "Magic link created in preview mode because RESEND_API_KEY is not set.",
    });
  }

  const resend = new Resend(apiKey);
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || "Magic Key Monitor <onboarding@resend.dev>",
    to: email,
    subject: "Your Magic Key Monitor sign-in link",
    html: emailHtml(link),
  });

  return Response.json({ ok: true, message: "Magic link sent." });
}
