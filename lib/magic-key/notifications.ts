import webpush from "web-push";
import { Resend } from "resend";
import { formatWatchDate } from "./utils";
import { PASS_TYPES, STATUS_META } from "./config";
import {
  getPreferencesFromState,
  getPushSubscriptionsForUser,
  getUserFromState,
  removePushSubscriptionForUser,
} from "./backend";
import type { AlertChange } from "./backend";

function createEmailHtml(email: string, changes: AlertChange[]) {
  const cards = changes
    .map(({ item, previousStatus, currentStatus }) => {
      const pass = PASS_TYPES.find((row) => row.id === item.passType)?.name ?? item.passType;
      return `
        <tr>
          <td style="padding: 0 0 14px;">
            <div style="border:1px solid #e4e4e7;border-radius:20px;padding:16px;background:#fafafa;">
              <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#71717a;">${pass}</div>
              <div style="margin-top:8px;font-size:20px;font-weight:700;color:#18181b;">${formatWatchDate(item.date)}</div>
              <div style="margin-top:10px;font-size:14px;color:#3f3f46;">
                ${STATUS_META[previousStatus].compactLabel} -> ${STATUS_META[currentStatus].compactLabel}
              </div>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  return `
    <div style="background:#f5f3ff;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#18181b;">
      <div style="max-width:620px;margin:0 auto;background:white;border-radius:28px;padding:28px;border:1px solid #e9d5ff;">
        <div style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#ec4899,#38bdf8);color:white;border-radius:999px;padding:8px 14px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">
          Magic Key Monitor
        </div>
        <h1 style="margin:18px 0 10px;font-size:28px;line-height:1.2;">A little Disney magic moved on your watchlist</h1>
        <p style="margin:0 0 20px;color:#52525b;font-size:15px;">
          ${email}, your watchlist changed. We kept the latest details below so you can jump back in quickly.
        </p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${cards}</table>
      </div>
    </div>
  `;
}

function createPushPayload(changes: AlertChange[]) {
  const first = changes[0];
  const pass = PASS_TYPES.find((row) => row.id === first.item.passType)?.short ?? first.item.passType;
  const suffix = changes.length > 1 ? ` +${changes.length - 1} more` : "";
  return JSON.stringify({
    title: "Magic Key Monitor",
    body: `${pass} • ${formatWatchDate(first.item.date)} changed to ${STATUS_META[first.currentStatus].compactLabel}${suffix}`,
    url: "/",
  });
}

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

export async function sendAlertsForChanges(
  state: Awaited<ReturnType<typeof import("./backend").readBackendState>>,
  changesByUser: Map<string, AlertChange[]>
) {
  const resend = getResendClient();
  const pushReady = configureWebPush();
  const from = process.env.RESEND_FROM_EMAIL || "Magic Key Monitor <onboarding@resend.dev>";

  for (const [userId, changes] of changesByUser.entries()) {
    const user = getUserFromState(state, userId);
    if (!user || changes.length === 0) continue;

    const preferences = getPreferencesFromState(state, userId);
    const emailTarget = preferences.emailAddress || user.email;

    if (preferences.emailEnabled && resend && emailTarget) {
      await resend.emails.send({
        from,
        to: emailTarget,
        subject: `${changes.length} Magic Key update${changes.length === 1 ? "" : "s"}`,
        html: createEmailHtml(emailTarget, changes),
      });
    }

    if (preferences.pushEnabled && pushReady) {
      const subscriptions = getPushSubscriptionsForUser(state, userId);

      for (const subscription of subscriptions) {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              expirationTime: subscription.expirationTime,
              keys: subscription.keys,
            },
            createPushPayload(changes)
          );
        } catch (error: unknown) {
          const statusCode =
            typeof error === "object" && error !== null && "statusCode" in error
              ? Number((error as { statusCode?: number }).statusCode)
              : 0;
          if (statusCode === 404 || statusCode === 410) {
            await removePushSubscriptionForUser(userId, subscription.endpoint);
          }
        }
      }
    }
  }
}
