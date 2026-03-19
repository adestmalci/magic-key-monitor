import type { SyncMeta, TabKey } from "../../lib/magic-key/types";
import { classNames, formatSyncTime } from "../../lib/magic-key/utils";

export function TabsNav({
  activeTab,
  tabs,
  onTabChange,
  syncMeta,
  lastSyncAt,
}: {
  activeTab: TabKey;
  tabs: Array<{ id: TabKey; label: string }>;
  onTabChange: (tab: TabKey) => void;
  syncMeta: SyncMeta;
  lastSyncAt: string;
}) {
  const liveCalendarAt = syncMeta.lastAttemptedSyncAt || lastSyncAt;
  const schedulerAt = syncMeta.lastBackgroundRunAt;
  const schedulerLagMs = schedulerAt ? Date.now() - new Date(schedulerAt).getTime() : Number.POSITIVE_INFINITY;
  const schedulerTone = !schedulerAt
    ? "text-zinc-500"
    : schedulerLagMs <= 1000 * 60 * 12
      ? "text-emerald-700"
      : "text-amber-700";

  return (
    <section className="rounded-[28px] border border-zinc-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={classNames(
                "rounded-2xl px-5 py-3 text-sm font-medium transition",
                activeTab === tab.id ? "bg-violet-600 text-white shadow" : "text-zinc-600 hover:bg-zinc-100"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <div className="flex items-center gap-2 text-zinc-700">
            <span className="font-semibold text-zinc-900">Live Calendar:</span>
            <span>{formatSyncTime(liveCalendarAt)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-zinc-900">Auto Scheduler:</span>
            <span className={schedulerTone}>{schedulerAt ? formatSyncTime(schedulerAt) : "Not seen yet"}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
