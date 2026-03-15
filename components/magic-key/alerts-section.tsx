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
  notificationsStatusMessage,
  notificationsHelpText,
  pushSupported,
  pushConfigured,
  isSendingTestEmail,
  isSendingTestPush,
  accountSaveStatus,
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
  notificationsStatusMessage: string;
  notificationsHelpText: string;
  pushSupported: boolean;
  pushConfigured: boolean;
  isSendingTestEmail: boolean;
  isSendingTestPush: boolean;
  accountSaveStatus: {
    state: "local" | "saving" | "saved" | "error";
    message: string;
  };
  onEmailEnabledChange: (value: boolean) => void;
  onEmailAddressChange: (value: string) => void;
  requestNotifications: () => void | Promise<void>;
  onSendTestEmail: () => void | Promise<void>;
  onSendTestPush: () => void | Promise<void>;
}) {
  const isLocalBuild =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
  const emailTarget = emailAddress || user?.email || "";
  const notificationsButtonLabel = notificationsGranted ? "Notifications enabled" : "Enable notifications";
  const notificationStatusTone = pushEnabled
    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
    : notificationsGranted
      ? "border-violet-200 bg-violet-50 text-violet-900"
      : "border-zinc-200 bg-white text-zinc-700";
  const notificationStatusMessage = pushEnabled
    ? "Closed-app push is ready on this device."
    : !notificationsSupported
      ? notificationsStatusMessage
        : !user
          ? "Notifications are on here. Sign in if you want this device to receive closed-app background alerts."
        : !pushSupported
          ? "Notifications are on, but this browser cannot save a closed-app push subscription."
        : !pushConfigured
          ? isLocalBuild
            ? "This localhost build does not have the deployed push key, so background push only works on the hosted app."
            : "Notifications are allowed, but background push still needs app push configuration."
          : notificationsGranted
            ? "Notifications are allowed. We will finish background push as soon as this device saves its subscription."
            : "Notifications are not enabled yet on this device.";
  const emailToggleLabel = emailEnabled ? "Email alerts on" : "Turn on email alerts";

  return (
    <section className="rounded-[32px] border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2 text-2xl font-semibold text-zinc-900">
        <UserRound className="h-6 w-6 text-violet-600" />
        Account & delivery settings
      </div>

      <p className="mt-2 max-w-3xl text-sm text-zinc-500">
        Keep your sign-in, browser notifications, email alerts, and background push setup in one simple place.
      </p>

      <div
        className={classNames(
          "mt-4 inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium",
          accountSaveStatus.state === "error"
            ? "border-rose-200 bg-rose-50 text-rose-800"
            : accountSaveStatus.state === "saved"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : accountSaveStatus.state === "saving"
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-zinc-200 bg-white text-zinc-700"
        )}
      >
        {accountSaveStatus.message}
      </div>

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
                <div className="flex flex-col gap-3 rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm text-zinc-700 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    Signed in as <span className="font-semibold text-zinc-900">{user.email}</span>
                  </div>
                  <button
                    type="button"
                    onClick={onSignOut}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 text-sm font-semibold text-zinc-700"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600">
                  Your server-side watchlist, delivery preferences, and check cadence now stay tied to this account.
                </div>
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

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onEmailEnabledChange(!emailEnabled)}
                className={classNames(
                  "inline-flex h-11 items-center gap-2 rounded-2xl px-4 text-sm font-semibold transition",
                  emailEnabled
                    ? "border border-violet-200 bg-violet-600 text-white"
                    : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                )}
              >
                <Mail className="h-4 w-4" />
                {emailToggleLabel}
              </button>

              <div
                className={classNames(
                  "inline-flex h-11 items-center rounded-2xl border px-4 text-sm",
                  emailEnabled
                    ? "border-violet-200 bg-violet-50 text-violet-900"
                    : "border-zinc-200 bg-white text-zinc-700"
                )}
              >
                {emailEnabled ? "Email delivery is active" : "Email delivery is paused"}
              </div>
            </div>

            <label className="mt-4 grid gap-2">
              <span className="text-sm text-zinc-700">Delivery email</span>
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="email"
                    value={emailAddress}
                    onChange={(event) => onEmailAddressChange(event.target.value)}
                    placeholder="name@example.com"
                    className="h-12 w-full rounded-2xl border border-zinc-200 bg-white pl-10 pr-4 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                  />
                </div>
                <button
                  type="button"
                  onClick={onSendTestEmail}
                  disabled={!user || !emailTarget || isSendingTestEmail}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 sm:shrink-0"
                >
                  <Mail className="h-4 w-4" />
                  {isSendingTestEmail ? "Sending..." : "Send test email"}
                </button>
              </div>
            </label>
          </div>
        </div>

        <div className="grid content-start gap-4">
          <div className="rounded-[28px] border border-zinc-200 bg-zinc-50 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
              <Bell className="h-4 w-4 text-violet-600" />
              Notifications
            </div>
            <p className="mt-2 text-sm text-zinc-500">
              One permission flow handles both local browser notifications and, when possible, closed-app push on this signed-in device.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={requestNotifications}
                className={classNames(
                  "inline-flex h-11 items-center gap-2 rounded-2xl px-4 text-sm font-semibold transition",
                  notificationsGranted
                    ? "border border-violet-200 bg-violet-600 text-white"
                    : "bg-violet-600 text-white hover:opacity-95"
                )}
              >
                <Bell className="h-4 w-4" />
                {notificationsButtonLabel}
              </button>
              <div
                className={classNames(
                  "inline-flex h-11 items-center rounded-2xl border px-4 text-sm",
                  notificationStatusTone
                )}
              >
                {notificationStatusMessage}
              </div>
            </div>

            {!notificationsSupported && notificationsHelpText ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {notificationsHelpText}
              </div>
            ) : null}

            {alertsEnabled && notificationsGranted ? (
              <div className="mt-4 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600">
                {pushEnabled
                  ? "This device is registered for closed-app push, so watched-date changes can reach you even when the site is closed."
                  : "Local browser alerts are on. If you are signed in and push is configured, this device will also finish closed-app push setup automatically."}
              </div>
            ) : null}

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
                {pushEnabled
                  ? "Closed-app push is active on this device"
                  : !user
                    ? "Sign in to connect this device to background push"
                    : !pushSupported
                      ? "This browser cannot save a web push subscription"
                      : !pushConfigured
                        ? isLocalBuild
                          ? "Push is configured on the hosted app, but this localhost build does not have the public push key."
                          : "Push env vars still need to be configured"
                        : "This device has not saved a push subscription yet"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
