import { Sparkles } from "lucide-react";
import { formatSyncTime } from "../../lib/magic-key/utils";
import type { SyncMeta } from "../../lib/magic-key/types";

export function HeroSection({
  watchCount,
  lastSyncAt,
  lastRunSummary,
  syncMeta,
}: {
  watchCount: number;
  lastSyncAt: string;
  lastRunSummary: string;
  syncMeta: SyncMeta;
}) {
  return (
    <div className="rounded-[36px] bg-gradient-to-br from-violet-700 via-fuchsia-600 to-sky-500 p-8 text-white shadow-xl shadow-violet-200/60">
      <div className="flex h-full flex-col justify-between gap-8">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-medium backdrop-blur">
            <Sparkles className="h-4 w-4" />
            Disneyland Magic Key live tracker
          </div>
          <h1 className="mt-5 text-4xl font-bold leading-tight sm:text-5xl">
            Disneyland Magic Key Wishboard
          </h1>
          <p className="mt-4 max-w-xl text-sm text-white/90 sm:text-base">
            Track the dates you care about, sync Disney availability live, and keep your Magic Key watchlist clean and easy to read.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-[28px] bg-white/16 p-5 backdrop-blur">
            <div className="text-xs uppercase tracking-[0.22em] text-white/75">Tracked dates</div>
            <div className="mt-2 text-4xl font-semibold">{watchCount}</div>
          </div>
          <div className="rounded-[28px] bg-white/16 p-5 backdrop-blur">
            <div className="text-xs uppercase tracking-[0.22em] text-white/75">Last live sync</div>
            <div className="mt-2 text-lg font-semibold">{formatSyncTime(lastSyncAt)}</div>
            <div className="mt-1 text-xs text-white/75">{lastRunSummary}</div>
            <div className="mt-3 inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white/90">
              {syncMeta.stale ? "Snapshot sparkle mode" : "Live Disney mode"}
            </div>
            <div className="mt-2 text-xs text-white/80">{syncMeta.message}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
