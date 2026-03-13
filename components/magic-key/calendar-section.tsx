"use client";

import { ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { PARK_OPTIONS, PASS_TYPES } from "../../lib/magic-key/config";
import type { WatchItem } from "../../lib/magic-key/types";
import { formatMonthLabel, type CalendarCell } from "../../lib/magic-key/utils";
import { PassIcon, ParkIcon } from "./icons";
import { StatusBadge } from "./status-badge";

export function CalendarSection({
  displayedMonth,
  calendarRows,
  watchedByDate,
  onPreviousMonth,
  onNextMonth,
}: {
  displayedMonth: string;
  calendarRows: Array<Array<CalendarCell | null>>;
  watchedByDate: Map<string, WatchItem[]>;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
}) {
  return (
    <section className="rounded-[32px] border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-2xl font-semibold text-zinc-900">
            <Clock3 className="h-6 w-6 text-violet-600" />
            Calendar board
          </div>

          <p className="mt-2 text-sm text-zinc-500">
            Real calendar layout with month label, weekday headers, watched park, pass icon, and live status.
          </p>
        </div>

        <div className="inline-flex items-center gap-2 self-start rounded-2xl border border-zinc-200 bg-zinc-50 p-2">
          <button
            type="button"
            onClick={onPreviousMonth}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-zinc-700 transition hover:bg-white"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <div className="min-w-[180px] px-3 text-center text-sm font-semibold text-zinc-900">
            {formatMonthLabel(displayedMonth)}
          </div>

          <button
            type="button"
            onClick={onNextMonth}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-zinc-700 transition hover:bg-white"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-7 gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
          <div key={label} className="px-2 py-1">
            {label}
          </div>
        ))}
      </div>

      <div className="mt-3 grid gap-3">
        {calendarRows.map((row, rowIndex: number) => (
          <div key={rowIndex} className="grid grid-cols-7 gap-3">
            {row.map((cell, cellIndex: number) => {
              if (!cell) {
                return (
                  <div
                    key={`${rowIndex}-${cellIndex}`}
                    className="min-h-[150px] rounded-[24px] border border-transparent"
                  />
                );
              }

              const items = watchedByDate.get(cell.date) ?? [];

              return (
                <div
                  key={cell.date}
                  className={
                    items.length > 0
                      ? "min-h-[150px] rounded-[24px] border border-violet-300 bg-violet-50/50 p-3 shadow-sm transition"
                      : "min-h-[150px] rounded-[24px] border border-zinc-200 bg-white p-3 shadow-sm transition"
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-lg font-semibold text-zinc-900">{cell.day}</div>

                    {items.length > 0 && (
                      <span className="rounded-full bg-violet-600 px-2.5 py-1 text-[11px] font-semibold text-white">
                        Watching
                      </span>
                    )}
                  </div>

                  {items.length === 0 ? (
                    <div className="mt-6 text-sm text-zinc-400">Not watched</div>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {items.slice(0, 2).map((item) => {
                        const pass = PASS_TYPES.find((row) => row.id === item.passType)!;
                        const park = PARK_OPTIONS.find((row) => row.value === item.preferredPark)!;

                        return (
                          <div
                            key={item.id}
                            className="rounded-2xl border border-white/70 bg-white/80 p-2.5 shadow-sm"
                          >
                            <div className="flex items-center gap-2 text-xs font-medium text-zinc-700">
                              <PassIcon passType={item.passType} size="h-4 w-4" />
                              <span>{pass.short}</span>
                            </div>

                            <div className="mt-2">
                              <StatusBadge status={item.currentStatus} compact />
                            </div>

                            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] text-zinc-700">
                              <ParkIcon park={item.preferredPark} size="h-3.5 w-3.5" />
                              {park.label}
                            </div>
                          </div>
                        );
                      })}

                      {items.length > 2 && (
                        <div className="text-xs text-zinc-500">
                          +{items.length - 2} more watched items
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
