"use client";

import { Bell, LogOut, Mail, Send, UserRound } from "lucide-react";

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
        <Bell className="h-6 w-6 text-violet-600" />
        Alerts & saved preferences
      </div>

      <p className="mt-2 text-sm text-zinc-500">Keep your account, email alerts, and closed-app push preferences in one place.</p>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-[28px] border border-zinc-200 bg-zinc-50 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
            <UserRound className="h-4 w-4 text-violet-600" />
            Account
          </div>
          <p className="mt-2 text-sm text-zinc-500">
            Sign in with a magic link so your watchlist and background alerts follow you across devices.
          </p>

          {user ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm text-zinc-700">
                Signed in as <span className="font-semibold text-zinc-900">{user.email}</span>
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
              {authMessage ? <div className="text-sm text-zinc-600">{authMessage}</div> : null}
            </div>
          )}
        </div>

        <div className="rounded-[28px] border border-zinc-200 bg-zinc-50 p-5">
          <div className="text-sm font-semibold text-zinc-900">Delivery preferences</div>
          <p className="mt-2 text-sm text-zinc-500">
            Toggle email alerts and browser push. Closed-app push needs a signed-in account plus supported browser setup.
          </p>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={requestNotifications}
              className="inline-flex h-11 items-center gap-2 rounded-2xl bg-violet-600 px-4 text-sm font-semibold text-white"
            >
              <Bell className="h-4 w-4" />
              {alertsEnabled ? "Notifications on" : "Enable push"}
            </button>
            <div className="inline-flex h-11 items-center rounded-2xl border border-zinc-200 bg-white px-4 text-sm text-zinc-700">
              {pushEnabled ? "Background push ready" : "Background push not ready yet"}
            </div>
          </div>

          <label className="mt-4 flex items-center gap-3 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={emailEnabled}
              onChange={(event) => onEmailEnabledChange(event.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 text-violet-600"
            />
            Send me a styled email when watched dates change
          </label>

          <label className="mt-4 grid gap-2">
            <span className="text-sm text-zinc-700">Email address</span>

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
    </section>
  );
}
