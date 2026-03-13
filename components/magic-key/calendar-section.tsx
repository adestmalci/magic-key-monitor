"use client";

import { ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { useState } from "react";
import { FREQUENCIES, PARK_OPTIONS, PASS_TYPES } from "../../lib/magic-key/config";
import type { FrequencyType, ParkOption, PassType, WatchItem } from "../../lib/magic-key/types";
import { classNames, formatMonthLabel, type CalendarCell } from "../../lib/magic-key/utils";
import { PassIcon, ParkIcon } from "./icons";
import { StatusBadge } from "./status-badge";

export function CalendarSection({
  displayedMonth,
  calendarRows,
  watchedByDate,
  defaultPassType,
  defaultPreferredPark,
  defaultSyncFrequency,
  onQuickWatch,
  onPreviousMonth,
  onNextMonth,
}: {
  displayedMonth: string;
  calendarRows: Array<Array<CalendarCell | null>>;
  watchedByDate: Map<string, WatchItem[]>;
  defaultPassType: PassType;
  defaultPreferredPark: ParkOption;
  defaultSyncFrequency: FrequencyType;
  onQuickWatch: (payload: {
    date: string;
    passType: PassType;
    preferredPark: ParkOption;
    syncFrequency: FrequencyType;
  }) => void;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
}) {
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [quickPassType, setQuickPassType] = useState<PassType>(defaultPassType);
  const [quickPreferredPark, setQuickPreferredPark] = useState<ParkOption>(defaultPreferredPark);
  const [quickSyncFrequency, setQuickSyncFrequency] = useState<FrequencyType>(defaultSyncFrequency);

  function openQuickWatch(date: string) {
    setExpandedDate((current) => (current === date ? null : date));
    setQuickPassType(defaultPassType);
    setQuickPreferredPark(defaultPreferredPark);
    setQuickSyncFrequency(defaultSyncFrequency);
  }

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
              const isExpanded = expandedDate === cell.date;

              return (
                <div
                  key={cell.date}
                  className={classNames(
                    "relative min-h-[150px] rounded-[24px] p-3 shadow-sm transition",
                    items.length > 0
                      ? "border border-violet-300 bg-violet-50/50"
                      : "border border-zinc-200 bg-white",
                    isExpanded && "z-20"
                  )}
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
                    <div className="mt-6">
                      <div className="text-sm text-zinc-400">Not watched</div>
                      <button
                        type="button"
                        onClick={() => openQuickWatch(cell.date)}
                        className="mt-3 inline-flex h-9 items-center justify-center rounded-2xl border border-violet-200 bg-violet-50 px-4 text-sm font-medium text-violet-900 transition hover:bg-violet-100"
                      >
                        Watch
                      </button>

                      {isExpanded ? (
                        <div
                          className={classNames(
                            "absolute top-[92px] z-30 w-[260px] rounded-[24px] border border-violet-200 bg-white p-3 shadow-xl shadow-violet-100",
                            cellIndex >= 4 ? "right-0" : "left-0"
                          )}
                        >
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                            Choose your key
                          </div>
                          <div className="mt-2 grid grid-cols-5 gap-1.5">
                            {PASS_TYPES.map((pass) => (
                              <button
                                key={pass.id}
                                type="button"
                                onClick={() => setQuickPassType(pass.id)}
                                className={classNames(
                                  "rounded-2xl border px-1.5 py-2 text-center transition",
                                  quickPassType === pass.id
                                    ? "border-violet-400 bg-white shadow-sm"
                                    : "border-white/80 bg-white/70 hover:border-violet-200"
                                )}
                              >
                                <div className="mx-auto flex h-7 w-7 items-center justify-center">
                                  <PassIcon passType={pass.id} size="h-6 w-6" />
                                </div>
                                <div className="mt-1 text-[10px] font-medium text-zinc-800">{pass.short}</div>
                              </button>
                            ))}
                          </div>

                          <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                            Preferred park
                          </div>
                          <div className="mt-2 grid grid-cols-3 gap-2">
                            {PARK_OPTIONS.map((park) => (
                              <button
                                key={park.value}
                                type="button"
                                onClick={() => setQuickPreferredPark(park.value)}
                                className={classNames(
                                  "flex flex-col items-center justify-center rounded-2xl border px-2 py-2 text-center transition",
                                  quickPreferredPark === park.value
                                    ? "border-violet-400 bg-white shadow-sm"
                                    : "border-white/80 bg-white/70 hover:border-violet-200"
                                )}
                              >
                                <ParkIcon park={park.value} size="h-4 w-4" />
                                <span className="mt-1 text-[9px] font-medium text-zinc-700">{park.label}</span>
                              </button>
                            ))}
                          </div>

                          <label className="mt-3 grid gap-1.5">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                              Check frequency
                            </span>
                            <select
                              value={quickSyncFrequency}
                              onChange={(event) => setQuickSyncFrequency(event.target.value as FrequencyType)}
                              className="h-10 rounded-2xl border border-white/80 bg-white px-3 text-sm text-zinc-800 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                            >
                              {FREQUENCIES.map((item) => (
                                <option key={item.value} value={item.value}>
                                  {item.label}
                                </option>
                              ))}
                            </select>
                          </label>

                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setExpandedDate(null);
                                onQuickWatch({
                                  date: cell.date,
                                  passType: quickPassType,
                                  preferredPark: quickPreferredPark,
                                  syncFrequency: quickSyncFrequency,
                                });
                              }}
                              className="inline-flex h-9 flex-1 items-center justify-center rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 text-sm font-semibold text-white shadow-md shadow-violet-200"
                            >
                              Save watch
                            </button>
                            <button
                              type="button"
                              onClick={() => setExpandedDate(null)}
                              className="inline-flex h-9 items-center justify-center rounded-2xl border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700"
                            >
                              Close
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
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
