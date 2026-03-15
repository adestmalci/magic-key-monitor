"use client";

import { ChevronLeft, ChevronRight, Clock3, X } from "lucide-react";
import { useState } from "react";
import { FREQUENCIES, PARK_OPTIONS, PASS_TYPES } from "../../lib/magic-key/config";
import type { FrequencyType, ParkOption, PassType, WatchItem } from "../../lib/magic-key/types";
import { classNames, formatMonthLabel, type CalendarCell } from "../../lib/magic-key/utils";
import { PassIcon, ParkIcon } from "./icons";
import { StatusBadge } from "./status-badge";

function QuickWatchFields({
  compact = false,
  quickPassType,
  quickPreferredPark,
  quickSyncFrequency,
  onPassTypeChange,
  onPreferredParkChange,
  onSyncFrequencyChange,
}: {
  compact?: boolean;
  quickPassType: PassType;
  quickPreferredPark: ParkOption;
  quickSyncFrequency: FrequencyType;
  onPassTypeChange: (value: PassType) => void;
  onPreferredParkChange: (value: ParkOption) => void;
  onSyncFrequencyChange: (value: FrequencyType) => void;
}) {
  return (
    <>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
        Choose your key
      </div>
      <div className={classNames("mt-2 grid gap-1.5", compact ? "grid-cols-3" : "grid-cols-5")}>
        {PASS_TYPES.map((pass) => (
          <button
            key={pass.id}
            type="button"
            onClick={() => onPassTypeChange(pass.id)}
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
      <div className={classNames("mt-2 grid gap-2", compact ? "grid-cols-1" : "grid-cols-3")}>
        {PARK_OPTIONS.map((park) => (
          <button
            key={park.value}
            type="button"
            onClick={() => onPreferredParkChange(park.value)}
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
          onChange={(event) => onSyncFrequencyChange(event.target.value as FrequencyType)}
          className="h-10 rounded-2xl border border-white/80 bg-white px-3 text-sm text-zinc-800 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
        >
          {FREQUENCIES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

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

  const expandedDateLabel = expandedDate
    ? new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(`${expandedDate}T12:00:00`))
    : "";

  return (
    <section className="rounded-[32px] border border-zinc-200 bg-white p-4 shadow-sm sm:p-6">
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

      <div className="mt-6 grid grid-cols-7 gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500 sm:gap-3 sm:text-xs sm:tracking-[0.18em]">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
          <div key={label} className="px-1 py-1 text-center sm:px-2">
            {label}
          </div>
        ))}
      </div>

      <div className="mt-2 grid gap-1.5 sm:mt-3 sm:gap-3">
        {calendarRows.map((row, rowIndex: number) => (
          <div key={rowIndex} className="grid grid-cols-7 gap-1.5 sm:gap-3">
            {row.map((cell, cellIndex: number) => {
              if (!cell) {
                return (
                  <div
                    key={`${rowIndex}-${cellIndex}`}
                    className="min-h-[110px] rounded-[20px] border border-transparent sm:min-h-[150px] sm:rounded-[24px]"
                  />
                );
              }

              const items = watchedByDate.get(cell.date) ?? [];
              const isExpanded = expandedDate === cell.date;

              return (
                <div
                  key={cell.date}
                  className={classNames(
                    "relative min-h-[110px] rounded-[20px] p-2.5 shadow-sm transition sm:min-h-[150px] sm:rounded-[24px] sm:p-3",
                    items.length > 0
                      ? "border border-violet-300 bg-violet-50/50"
                      : "border border-zinc-200 bg-white",
                    isExpanded && "z-20"
                  )}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="text-base font-semibold text-zinc-900 sm:text-lg">{cell.day}</div>

                    {items.length > 0 && (
                      <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-semibold text-white sm:px-2.5 sm:py-1 sm:text-[11px]">
                        Watching
                      </span>
                    )}
                  </div>

                  {items.length === 0 ? (
                    <div className="mt-5 flex justify-center sm:mt-6">
                      <button
                        type="button"
                        onClick={() => openQuickWatch(cell.date)}
                        className="mx-auto inline-flex h-7 w-fit items-center justify-center rounded-2xl border border-violet-200 bg-violet-50 px-3 text-xs font-medium text-violet-900 transition hover:bg-violet-100 sm:h-9 sm:px-4 sm:text-sm"
                      >
                        Watch
                      </button>

                      {isExpanded ? (
                        <div
                          className={classNames(
                            "absolute top-[78px] z-30 hidden w-[260px] rounded-[24px] border border-violet-200 bg-white p-3 shadow-xl shadow-violet-100 md:block",
                            cellIndex >= 4 ? "right-0" : "left-0"
                          )}
                        >
                          <QuickWatchFields
                            quickPassType={quickPassType}
                            quickPreferredPark={quickPreferredPark}
                            quickSyncFrequency={quickSyncFrequency}
                            onPassTypeChange={setQuickPassType}
                            onPreferredParkChange={setQuickPreferredPark}
                            onSyncFrequencyChange={setQuickSyncFrequency}
                          />

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
                    <div className="mt-2 space-y-1.5 sm:mt-3 sm:space-y-2">
                      {items.slice(0, 2).map((item) => {
                        const pass = PASS_TYPES.find((row) => row.id === item.passType)!;
                        const park = PARK_OPTIONS.find((row) => row.value === item.preferredPark)!;

                        return (
                          <div
                            key={item.id}
                            className="rounded-2xl border border-white/70 bg-white/80 p-2 shadow-sm sm:p-2.5"
                          >
                            <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-700 sm:gap-2 sm:text-xs">
                              <PassIcon passType={item.passType} size="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                              <span>{pass.short}</span>
                            </div>

                            <div className="mt-1.5 sm:mt-2">
                              <StatusBadge status={item.currentStatus} compact />
                            </div>

                            <div className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] text-zinc-700 sm:mt-2 sm:gap-1.5 sm:text-[11px]">
                              <ParkIcon park={item.preferredPark} size="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                              {park.label}
                            </div>
                          </div>
                        );
                      })}

                      {items.length > 2 && (
                        <div className="text-[11px] text-zinc-500 sm:text-xs">
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

      {expandedDate ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-zinc-950/20 px-4 pb-4 pt-20 md:hidden">
          <div className="w-full max-w-md rounded-[28px] border border-violet-200 bg-white p-4 shadow-2xl shadow-violet-200/40">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Quick watch
                </div>
                <div className="mt-1 text-sm font-semibold text-zinc-900">{expandedDateLabel}</div>
              </div>
              <button
                type="button"
                onClick={() => setExpandedDate(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-700"
                aria-label="Close quick watch"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4">
              <QuickWatchFields
                compact
                quickPassType={quickPassType}
                quickPreferredPark={quickPreferredPark}
                quickSyncFrequency={quickSyncFrequency}
                onPassTypeChange={setQuickPassType}
                onPreferredParkChange={setQuickPreferredPark}
                onSyncFrequencyChange={setQuickSyncFrequency}
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!expandedDate) return;
                  setExpandedDate(null);
                  onQuickWatch({
                    date: expandedDate,
                    passType: quickPassType,
                    preferredPark: quickPreferredPark,
                    syncFrequency: quickSyncFrequency,
                  });
                }}
                className="inline-flex h-11 items-center justify-center rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 text-sm font-semibold text-white shadow-md shadow-violet-200"
              >
                Save watch
              </button>
              <button
                type="button"
                onClick={() => setExpandedDate(null)}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
