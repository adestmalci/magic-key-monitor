import type { SummaryCounts } from "../../lib/magic-key/types";

export function SummaryCards({ summary }: { summary: SummaryCounts }) {
  return (
    <section className="grid gap-4 sm:grid-cols-3">
      <div className="rounded-[28px] border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="text-sm text-zinc-500">Dates with availability</div>
        <div className="mt-2 text-4xl font-semibold">{summary.available}</div>
      </div>
      <div className="rounded-[28px] border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="text-sm text-zinc-500">No reservations available</div>
        <div className="mt-2 text-4xl font-semibold">{summary.unavailable}</div>
      </div>
      <div className="rounded-[28px] border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="text-sm text-zinc-500">Blocked out</div>
        <div className="mt-2 text-4xl font-semibold">{summary.blocked}</div>
      </div>
    </section>
  );
}
