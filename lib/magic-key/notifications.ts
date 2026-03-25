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

function createBookingStatusEmailHtml(
  email: string,
  payload: {
    watchDate: string;
    status: "booked" | "paused_login" | "paused_mismatch" | "failed";
    summary: string;
    nextStep: string;
  }
) {
  const title =
    payload.status === "booked"
      ? "A Disney reservation attempt succeeded"
      : payload.status === "paused_login"
        ? "A Disney reservation attempt needs login attention"
        : payload.status === "paused_mismatch"
          ? "A Disney reservation attempt paused because the party changed"
          : "A Disney reservation attempt failed";

  return `
    <div style="background:#f5f3ff;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#18181b;">
      <div style="max-width:620px;margin:0 auto;background:white;border-radius:28px;padding:28px;border:1px solid #e9d5ff;">
        <div style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#ec4899,#38bdf8);color:white;border-radius:999px;padding:8px 14px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">
          Magic Key Monitor
        </div>
        <h1 style="margin:18px 0 10px;font-size:28px;line-height:1.2;">${title}</h1>
        <p style="margin:0 0 20px;color:#52525b;font-size:15px;">
          ${email}, here is the latest booking update for ${formatWatchDate(payload.watchDate)}.
        </p>
        <div style="border:1px solid #e4e4e7;border-radius:20px;padding:16px;background:#fafafa;">
          <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#71717a;">Latest booking status</div>
          <div style="margin-top:8px;font-size:20px;font-weight:700;color:#18181b;">${payload.summary}</div>
          <div style="margin-top:12px;font-size:14px;color:#3f3f46;">${payload.nextStep}</div>
        </div>
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

async function sendEmail(to: string, subject: string, html: string) {
  const resend = getResendClient();
  if (!resend) {
    return {
      ok: true as const,
      preview: true as const,
      message: "Preview mode is active because RESEND_API_KEY is not set.",
    };
  }

  const from = process.env.RESEND_FROM_EMAIL || "Magic Key Monitor <onboarding@resend.dev>";
  await resend.emails.send({
    from,
    to,
    subject,
    html,
  });

  return {
    ok: true as const,
    preview: false as const,
    message: `Email sent to ${to}.`,
  };
}

async function sendPushToUser(
  state: Awaited<ReturnType<typeof import("./backend").readBackendState>>,
  userId: string,
  payload: string
) {
  if (!configureWebPush()) {
    return {
      ok: false as const,
      message: "Push delivery is not configured yet.",
      sent: 0,
    };
  }

  const subscriptions = getPushSubscriptionsForUser(state, userId);
  if (subscriptions.length === 0) {
    return {
      ok: false as const,
      message: "No push subscription is registered for this account yet.",
      sent: 0,
    };
  }

  let sent = 0;

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          expirationTime: subscription.expirationTime,
          keys: subscription.keys,
        },
        payload
      );
      sent += 1;
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

  if (sent === 0) {
    return {
      ok: false as const,
      message: "Push delivery could not reach any active subscriptions.",
      sent,
    };
  }

  return {
    ok: true as const,
    message: `Push sent to ${sent} linked ${sent === 1 ? "device" : "devices"}.`,
    sent,
  };
}

export async function sendTestEmailForUser(
  state: Awaited<ReturnType<typeof import("./backend").readBackendState>>,
  userId: string
) {
  const user = getUserFromState(state, userId);
  if (!user) {
    return { ok: false as const, message: "We couldn't find that signed-in account." };
  }

  const preferences = getPreferencesFromState(state, userId);
  const emailTarget = preferences.emailAddress || user.email;
  if (!emailTarget) {
    return { ok: false as const, message: "Add an email address first." };
  }

  return sendEmail(
    emailTarget,
    "Your Magic Key Monitor test email",
    createEmailHtml(emailTarget, [
      {
        item: {
          id: "preview",
          userId,
          date: new Date().toISOString().slice(0, 10),
          passType: "enchant",
          preferredPark: "either",
          eitherParkTieBreaker: "dl",
          plannerHubId: "primary",
          selectedImportedMemberIds: [],
          bookingMode: "watch_only",
          currentStatus: "either",
          previousStatus: "unavailable",
          lastCheckedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        previousStatus: "unavailable",
        currentStatus: "either",
      },
    ])
  );
}

export async function sendTestPushForUser(
  state: Awaited<ReturnType<typeof import("./backend").readBackendState>>,
  userId: string
) {
  return sendPushToUser(
    state,
    userId,
    JSON.stringify({
      title: "Magic Key Monitor",
      body: "Your test push arrived. Linked devices for this account should receive it.",
      url: "/?tab=alerts",
    })
  );
}

export async function sendAlertsForChanges(
  state: Awaited<ReturnType<typeof import("./backend").readBackendState>>,
  changesByUser: Map<string, AlertChange[]>
) {
  for (const [userId, changes] of changesByUser.entries()) {
    const user = getUserFromState(state, userId);
    if (!user || changes.length === 0) continue;

    const preferences = getPreferencesFromState(state, userId);
    const emailTarget = preferences.emailAddress || user.email;

    if (preferences.emailEnabled && emailTarget) {
      await sendEmail(
        emailTarget,
        `${changes.length} Magic Key update${changes.length === 1 ? "" : "s"}`,
        createEmailHtml(emailTarget, changes)
      );
    }

    if (preferences.pushEnabled) {
      await sendPushToUser(state, userId, createPushPayload(changes));
    }
  }
}

export async function sendPlannerHubBookingStatusEmailForUser(
  state: Awaited<ReturnType<typeof import("./backend").readBackendState>>,
  userId: string,
  payload: {
    watchDate: string;
    status: "booked" | "paused_login" | "paused_mismatch" | "failed";
    summary: string;
    nextStep: string;
  }
) {
  const user = getUserFromState(state, userId);
  if (!user) {
    return { ok: false as const, message: "We couldn't find that signed-in account." };
  }

  const preferences = getPreferencesFromState(state, userId);
  const emailTarget = preferences.emailAddress || user.email;

  if (!preferences.emailEnabled || !emailTarget) {
    return { ok: false as const, message: "Email alerts are disabled for this account." };
  }

  const subject =
    payload.status === "booked"
      ? `Disney booking confirmed for ${formatWatchDate(payload.watchDate)}`
      : payload.status === "paused_login"
        ? `Disney booking needs login attention for ${formatWatchDate(payload.watchDate)}`
        : payload.status === "paused_mismatch"
          ? `Disney party changed before booking ${formatWatchDate(payload.watchDate)}`
          : `Disney booking failed for ${formatWatchDate(payload.watchDate)}`;

  return sendEmail(emailTarget, subject, createBookingStatusEmailHtml(emailTarget, payload));
}
