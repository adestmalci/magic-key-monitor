import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET() {
  const data = await resend.emails.send({
    from: "onboarding@resend.dev",
    to: "adestmalci@gmail.com",
    subject: "Magic Key Monitor test",
    html: "<p>Your Magic Key Monitor email is working.</p>",
  });

  return Response.json(data);
}
