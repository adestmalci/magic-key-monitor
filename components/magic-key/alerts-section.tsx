"use client";

import { Bell, LogOut, Mail, Send, Smartphone, UserRound } from "lucide-react";
import { classNames } from "../../lib/magic-key/utils";

export function AlertsSection({
  user,
  authEmail,
  onAuthEmailChange,
  onRequestMagicLink,
  authMessage,
  onSignOut,
  alertsEnabled,
  pushEnabled,
  emailEnabled,
  emailAddress,
  notificationsSupported,
  notificationsGranted,
  pushSupported,
  pushConfigured,
  isSendingTestEmail,
  isSendingTestPush,
  onEmailEnabledChange,
  onEmailAddressChange,
  requestNotifications,
  onSendTestEmail,
  onSendTestPush,
}: {
  user: { email: string } | null;
  authEmail: string;
  onAuthEmailChange: (value: string) => void;
  onRequestMagicLink: () => void;
  authMessage: string;
  onSignOut: () => void;
  alertsEnabled: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  emailAddress: string;
  notificationsSupported: boolean;
  notificationsGranted: boolean;
  pushSupported: boolean;
  pushConfigured: boolean;
  isSendingTestEmail: boolean;
  isSendingTestPush: boolean;
  onEmailEnabledChange: (value: boolean) => void;
  onEmailAddressChange: (value: string) => void;
  requestNotifications: () => void | Promise<void>;
  onSendTestEmail: () => void | Promise<void>;
  onSendTestPush: () => void | Promise<void>;
}) {
  const emailTarget = emailAddress || user?.email || "";

  return (
    <section className="rounded-[32px] border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2 text-2xl font-semibold text-zinc-900">
        <UserRound className="h-6 w-6 text-violet-600" />
        Account & delivery settings
      </div>

      <p className="mt-2 max-w-3xl text-sm text-zinc-500">
        Keep your sign-in, browser notifications, email alerts, and background push setup in one simple place.
      </p>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="grid gap-4">
          <div className="rounded-[28px] border border-zinc-200 bg-zinc-50 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
              <UserRound className="h-4 w-4 text-violet-600" />
              Signed-in account
            </div>
            <p className="mt-2 text-sm text-zinc-500">
              Sign in with a magic link if you want your watchlist, saved preferences, and background delivery settings to follow you across devices.
            </p>

            {user ? (
              <div className="mt-4 space-y-4">
                <div className="rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm text-zinc-700">
                  Signed in as <span className="font-semibold text-zinc-900">{user.email}</span>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600">
                  Your server-side watchlist, delivery preferences, and check cadence now stay tied to this account.
                </div>
                <button
                  type="button"
                  onClick={onSignOut}
                  className="inline-flex h-11 items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <label className="grid gap-2">
                  <span className="text-sm text-zinc-700">Email address</span>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                    <input
                      type="email"
                      value={authEmail}
                      onChange={(event) => onAuthEmailChange(event.target.value)}
                      placeholder="name@example.com"
                      className="h-12 w-full rounded-2xl border border-zinc-200 bg-white pl-10 pr-4 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                    />
                  </div>
                </label>
                <button
                  type="button"
                  onClick={onRequestMagicLink}
                  className="inline-flex h-11 items-center gap-2 rounded-2xl bg-violet-600 px-4 text-sm font-semibold text-white"
                >
                  <Send className="h-4 w-4" />
                  Email me a sign-in link
                </button>
                <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600">
                  Browser notifications can still work on this device without signing in, but account sign-in is what keeps your setup synced across devices.
                </div>
                {authMessage ? <div className="text-sm text-zinc-600">{authMessage}</div> : null}
              </div>
            )}
          </div>

          <div className="rounded-[28px] border border-zinc-200 bg-zinc-50 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
              <Mail className="h-4 w-4 text-violet-600" />
              Email alerts
            </div>
            <p className="mt-2 text-sm text-zinc-500">
              Use this email for watched-date changes. Sign in if you want the address and preference to stay attached to your account everywhere.
            </p>

            <label className="mt-4 flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={emailEnabled}
                onChange={(event) => onEmailEnabledChange(event.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 text-violet-600"
              />
              Send me an email when watched dates change
            </label>

            <label className="mt-4 grid gap-2">
              <span className="text-sm text-zinc-700">Delivery email</span>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <input
                  type="email"
                  value={emailAddress}
                  onChange={(event) => onEmailAddressChange(event.target.value)}
                  placeholder="name@example.com"
                  className="h-12 w-full rounded-2xl border border-zinc-200 bg-white pl-10 pr-4 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                />
              </div>
            </label>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onSendTestEmail}
                disabled={!user || !emailTarget || isSendingTestEmail}
                className="inline-flex h-11 items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Mail className="h-4 w-4" />
                {isSendingTestEmail ? "Sending..." : "Send test email"}
              </button>

              <div
                className={classNames(
                  "inline-flex h-11 items-center rounded-2xl border px-4 text-sm",
                  emailEnabled
                    ? "border-violet-200 bg-violet-50 text-violet-900"
                    : "border-zinc-200 bg-white text-zinc-700"
                )}
              >
                {emailEnabled ? "Email alerts enabled" : "Email alerts are currently off"}
              </div>
            </div>
          </div>
        </div>

        <div className="grid content-start gap-4">
          <div className="rounded-[28px] border border-zinc-200 bg-zinc-50 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
              <Bell className="h-4 w-4 text-violet-600" />
              Browser notifications
            </div>
            <p className="mt-2 text-sm text-zinc-500">
              These work on this browser when you grant permission. They are useful for active sessions even if you are not signed in.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={requestNotifications}
                disabled={!notificationsSupported}
                className="inline-flex h-11 items-center gap-2 rounded-2xl bg-violet-600 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Bell className="h-4 w-4" />
                {notificationsGranted ? "Notifications enabled" : "Enable notifications"}
              </button>
              <div
                className={classNames(
                  "inline-flex h-11 items-center rounded-2xl border px-4 text-sm",
                  notificationsGranted
                    ? "border-violet-200 bg-violet-50 text-violet-900"
                    : "border-zinc-200 bg-white text-zinc-700"
                )}
              >
                {!notificationsSupported
                  ? "This browser does not support notifications"
                  : notificationsGranted
                    ? "Permission granted on this browser"
                    : "Permission not granted yet"}
              </div>
            </div>

            {alertsEnabled && notificationsGranted ? (
              <div className="mt-4 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600">
                Local in-browser alerts are on. These can still appear while this tab is open even if you are not signed in.
              </div>
            ) : null}
          </div>

          <div className="rounded-[28px] border border-zinc-200 bg-zinc-50 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
              <Smartphone className="h-4 w-4 text-violet-600" />
              Background push
            </div>
            <p className="mt-2 text-sm text-zinc-500">
              Closed-app push needs a signed-in account, a supported browser, notification permission, and a registered push subscription on this device. Some phones may also require adding the app to the home screen first.
            </p>

            <div
              className={classNames(
                "mt-4 rounded-2xl border px-4 py-3 text-sm",
                pushEnabled
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : !user
                    ? "border-amber-200 bg-amber-50 text-amber-900"
                    : !pushSupported
                      ? "border-zinc-200 bg-white text-zinc-700"
                      : !pushConfigured
                        ? "border-zinc-200 bg-white text-zinc-700"
                        : notificationsGranted
                          ? "border-zinc-200 bg-white text-zinc-700"
                          : "border-amber-200 bg-amber-50 text-amber-900"
              )}
            >
              {pushEnabled
                ? "Background push is ready on this browser."
                : !user
                  ? "Sign in first if you want this device to participate in background push delivery."
                  : !pushSupported
                    ? "This browser does not support web push subscriptions."
                    : !pushConfigured
                      ? "Push delivery is missing VAPID configuration in the app environment."
                      : notificationsGranted
                        ? "Notifications are allowed, but this device still needs a saved push subscription."
                        : "Enable browser notifications first so this device can finish push setup."}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onSendTestPush}
                disabled={!user || !pushEnabled || isSendingTestPush}
                className="inline-flex h-11 items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Smartphone className="h-4 w-4" />
                {isSendingTestPush ? "Sending..." : "Send test push"}
              </button>

              <div
                className={classNames(
                  "inline-flex h-11 items-center rounded-2xl border px-4 text-sm",
                  pushEnabled
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-zinc-200 bg-white text-zinc-700"
                )}
              >
                {pushEnabled ? "This device is subscribed for push" : "No saved push subscription yet"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
