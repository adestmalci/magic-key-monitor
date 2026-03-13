"use client";

import { Bell, Mail } from "lucide-react";

export function AlertsSection({
  alertsEnabled,
  emailEnabled,
  emailAddress,
  setEmailEnabled,
  setEmailAddress,
  requestNotifications,
}: any) {
  return (
    <section className="rounded-[32px] border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2 text-2xl font-semibold text-zinc-900">
        <Bell className="h-6 w-6 text-violet-600" />
        Alerts & saved preferences
      </div>

      <p className="mt-2 text-sm text-zinc-500">
        These settings are saved in this browser for now.
      </p>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-[28px] border border-zinc-200 bg-zinc-50 p-5">
          <div className="text-sm font-semibold text-zinc-900">Browser notifications</div>
          <p className="mt-2 text-sm text-zinc-500">
            Get alerts when a watched date improves.
          </p>

          <div className="mt-4 flex items-center justify-between gap-4">
            <div className="text-sm text-zinc-700">
              {alertsEnabled ? "Enabled" : "Disabled"}
            </div>

            <button
              type="button"
              onClick={requestNotifications}
              className="inline-flex h-11 items-center gap-2 rounded-2xl bg-violet-600 px-4 text-sm font-semibold text-white"
            >
              <Bell className="h-4 w-4" />
              Turn on
            </button>
          </div>
        </div>

        <div className="rounded-[28px] border border-zinc-200 bg-zinc-50 p-5">
          <div className="text-sm font-semibold text-zinc-900">Email preference</div>
          <p className="mt-2 text-sm text-zinc-500">
            Saved locally in this browser for now.
          </p>

          <label className="mt-4 flex items-center gap-3 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={emailEnabled}
              onChange={(event) => setEmailEnabled(event.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 text-violet-600"
            />
            Keep email alerts enabled
          </label>

          <label className="mt-4 grid gap-2">
            <span className="text-sm text-zinc-700">Email address</span>

            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                type="email"
                value={emailAddress}
                onChange={(event) => setEmailAddress(event.target.value)}
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
