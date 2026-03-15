import { CalendarDays, Clock3, RefreshCcw, Trash2 } from "lucide-react";
import { FREQUENCIES, PARK_OPTIONS, PASS_TYPES } from "../../lib/magic-key/config";
import type { FrequencyType, WatchItem } from "../../lib/magic-key/types";
import { formatSyncTime, formatWatchDate, classNames } from "../../lib/magic-key/utils";
import { EmptyState } from "./empty-state";
import { ParkIcon, PassIcon } from "./icons";
import { StatusBadge } from "./status-badge";

export function WatchlistSection({
  watchItems,
  lastRunSummary,
  isSyncing,
  syncFrequency,
  lastSyncAt,
  sessionEmail,
  saveStatus,
  onManualSync,
  onRemoveWatchItem,
}: {
  watchItems: WatchItem[];
  lastRunSummary: string;
  isSyncing: boolean;
  syncFrequency: FrequencyType;
  lastSyncAt: string;
  sessionEmail: string | null;
  saveStatus: {
    state: "local" | "saving" | "saved" | "error";
    message: string;
  };
  onManualSync: () => void;
  onRemoveWatchItem: (id: string) => void;
}) {
  const frequencyLabel = FREQUENCIES.find((row) => row.value === syncFrequency)?.label ?? "Manual only";

  return (
    <section className="rounded-[32px] border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-2xl font-semibold text-zinc-900">
            <CalendarDays className="h-6 w-6 text-violet-600" />
            Watched dates
          </div>
          <p className="mt-2 text-sm text-zinc-500">
            Keep your wishboard tidy here, then run a live sync whenever you want a fresh Disney check.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <div
              className={classNames(
                "inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium",
                sessionEmail
                  ? "border-violet-200 bg-violet-50 text-violet-900"
                  : "border-zinc-200 bg-white text-zinc-700"
              )}
            >
              {sessionEmail ? `Saved to ${sessionEmail}` : "Local to this browser"}
            </div>
            <div
              className={classNames(
                "inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium",
                saveStatus.state === "error"
                  ? "border-rose-200 bg-rose-50 text-rose-800"
                  : saveStatus.state === "saved"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : saveStatus.state === "saving"
                      ? "border-amber-200 bg-amber-50 text-amber-800"
                      : "border-zinc-200 bg-white text-zinc-700"
              )}
            >
              {saveStatus.message}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onManualSync}
            disabled={isSyncing}
            className="inline-flex h-11 items-center gap-2 rounded-2xl bg-violet-600 px-4 text-sm font-semibold text-white shadow-lg shadow-violet-200 transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <RefreshCcw className={classNames("h-4 w-4", isSyncing && "animate-spin")} />
            {isSyncing ? "Syncing..." : "Sync live data"}
          </button>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm text-violet-900">
        {lastRunSummary}
      </div>

      <div className="mt-6">
        {watchItems.length === 0 ? (
          <EmptyState
            title="No watched dates yet"
            body="Add your first date above and the dashboard will stay empty by default until you choose something to watch."
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {watchItems
              .slice()
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((item) => {
                const pass = PASS_TYPES.find((row) => row.id === item.passType)!;
                const park = PARK_OPTIONS.find((row) => row.value === item.preferredPark)!;

                return (
                  <article
                    key={item.id}
                    className="overflow-hidden rounded-[28px] border border-zinc-200 bg-white shadow-sm"
                  >
                    <div className={classNames("h-2 bg-gradient-to-r", pass.accent)} />
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2 text-sm font-medium text-zinc-600">
                            <PassIcon passType={item.passType} />
                            {pass.name}
                          </div>
                          <div className="mt-3 text-3xl font-semibold text-zinc-950">
                            {formatWatchDate(item.date)}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => onRemoveWatchItem(item.id)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-200 text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-900"
                          aria-label="Remove watched date"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <StatusBadge status={item.currentStatus} />
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-sm text-zinc-700">
                          <ParkIcon park={item.preferredPark} />
                          {park.label}
                        </span>
                        <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-sm text-zinc-700">
                          <Clock3 className="h-4 w-4" />
                          {frequencyLabel}
                        </span>
                      </div>

                      <div className="mt-5 text-sm text-zinc-500">
                        Last checked: {formatSyncTime(item.lastCheckedAt || lastSyncAt)}
                      </div>
                    </div>
                  </article>
                );
              })}
          </div>
        )}
      </div>
    </section>
  );
}
