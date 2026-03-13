"use client";

import { Bell, LogOut, Mail, Send, UserRound } from "lucide-react";
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
  onEmailEnabledChange,
  onEmailAddressChange,
  requestNotifications,
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
  onEmailEnabledChange: (value: boolean) => void;
  onEmailAddressChange: (value: string) => void;
  requestNotifications: () => void | Promise<void>;
}) {
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
                className="inline-flex h-11 items-center gap-2 rounded-2xl bg-violet-600 px-4 text-sm font-semibold text-white"
              >
                <Bell className="h-4 w-4" />
                {alertsEnabled ? "Notifications enabled" : "Enable notifications"}
              </button>
              <div
                className={classNames(
                  "inline-flex h-11 items-center rounded-2xl border px-4 text-sm",
                  alertsEnabled
                    ? "border-violet-200 bg-violet-50 text-violet-900"
                    : "border-zinc-200 bg-white text-zinc-700"
                )}
              >
                {alertsEnabled ? "Permission granted on this browser" : "Permission not granted yet"}
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-zinc-200 bg-zinc-50 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
              <Bell className="h-4 w-4 text-violet-600" />
              Background push
            </div>
            <p className="mt-2 text-sm text-zinc-500">
              Closed-app push needs a signed-in account, a supported browser, and a registered push subscription on this device.
            </p>

            <div
              className={classNames(
                "mt-4 rounded-2xl border px-4 py-3 text-sm",
                pushEnabled
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : user
                    ? "border-zinc-200 bg-white text-zinc-700"
                    : "border-amber-200 bg-amber-50 text-amber-900"
              )}
            >
              {pushEnabled
                ? "Background push is ready on this browser."
                : user
                  ? "You are signed in, but this browser still needs push permission/subscription setup."
                  : "Sign in first if you want this device to participate in background push delivery."}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
