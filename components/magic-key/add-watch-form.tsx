import { ChevronLeft, ChevronRight } from "lucide-react";
import { FREQUENCIES, PARK_OPTIONS, PASS_TYPES, STATUS_META } from "../../lib/magic-key/config";
import type { FrequencyType, ParkOption, PassType, StatusType, SyncMeta } from "../../lib/magic-key/types";
import { classNames, formatMonthLabel, formatSyncTime, formatWatchDate, type CalendarCell } from "../../lib/magic-key/utils";
import { StatusIcon } from "./icons";

type PickerCell = (CalendarCell & {
  status: StatusType;
  disabled: boolean;
  selected: boolean;
}) | null;

export function AddWatchForm({
  passType,
  onPassTypeChange,
  dateInput,
  onDateInputChange,
  preferredPark,
  onPreferredParkChange,
  syncFrequency,
  onSyncFrequencyChange,
  pickerMonth,
  pickerRows,
  selectedDateStatus,
  canGoPreviousMonth,
  canGoNextMonth,
  onPreviousMonth,
  onNextMonth,
  watchCount,
  lastSyncAt,
  syncMeta,
  onAddWatchItem,
}: {
  passType: PassType;
  onPassTypeChange: (value: PassType) => void;
  dateInput: string;
  onDateInputChange: (value: string) => void;
  preferredPark: ParkOption;
  onPreferredParkChange: (value: ParkOption) => void;
  syncFrequency: FrequencyType;
  onSyncFrequencyChange: (value: FrequencyType) => void;
  pickerMonth: string;
  pickerRows: PickerCell[][];
  selectedDateStatus: StatusType | null;
  canGoPreviousMonth: boolean;
  canGoNextMonth: boolean;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  watchCount: number;
  lastSyncAt: string;
  syncMeta: SyncMeta;
  onAddWatchItem: () => void;
}) {
  const legend: StatusType[] = ["blocked", "unavailable", "dl", "dca", "either"];
  const selectionDisabled = selectedDateStatus === "blocked";
  const modeLabel = syncMeta.stale ? "Showing last good snapshot" : "Live Disney mode";
  const detailLabel = syncMeta.stale
    ? "Live refresh missed a beat, so your latest good Disney snapshot is still in place."
    : "Latest Disney availability is loaded and ready for your watchlist.";

  function cellClasses(cell: Exclude<PickerCell, null>) {
    const base = "min-h-[62px] rounded-[22px] border px-2.5 py-2.5 text-left transition sm:min-h-[68px]";

    if (cell.disabled) {
      return classNames(
        base,
        "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
      );
    }

    if (cell.selected) {
      return classNames(base, "border-violet-500 bg-violet-600 text-white shadow-md shadow-violet-200");
    }

    if (cell.status === "either") {
      return classNames(base, "border-emerald-200 bg-emerald-50 text-emerald-900 hover:border-emerald-300");
    }

    if (cell.status === "dl") {
      return classNames(base, "border-pink-200 bg-pink-50 text-pink-900 hover:border-pink-300");
    }

    if (cell.status === "dca") {
      return classNames(base, "border-cyan-200 bg-cyan-50 text-cyan-900 hover:border-cyan-300");
    }

    return classNames(base, "border-zinc-200 bg-zinc-100 text-zinc-700 hover:border-zinc-300");
  }

  return (
    <div className="rounded-[36px] border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-col gap-1">
        <div className="text-lg font-semibold text-zinc-900">Add watched date</div>
        <div className="text-sm text-zinc-500">Choose a key, then pick a date from the calendar.</div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_320px]">
        <div className="rounded-[30px] border border-zinc-200 bg-zinc-50/80 p-3.5 sm:p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-zinc-700">Choose a date</div>

            <div className="inline-flex items-center gap-1.5 rounded-2xl border border-zinc-200 bg-white p-1 shadow-sm shadow-zinc-200/40">
              <button
                type="button"
                onClick={onPreviousMonth}
                disabled={!canGoPreviousMonth}
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-zinc-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Previous picker month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <div className="min-w-[138px] px-2 text-center text-sm font-semibold text-zinc-900">
                {formatMonthLabel(pickerMonth)}
              </div>

              <button
                type="button"
                onClick={onNextMonth}
                disabled={!canGoNextMonth}
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-zinc-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Next picker month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-7 gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
              <div key={label} className="px-1 py-1 text-center">
                {label}
              </div>
            ))}
          </div>

          <div className="mt-1 grid gap-2">
            {pickerRows.map((row, rowIndex) => (
              <div key={rowIndex} className="grid grid-cols-7 gap-2">
                {row.map((cell, cellIndex) => {
                  if (!cell) {
                    return <div key={`${rowIndex}-${cellIndex}`} className="min-h-[62px] sm:min-h-[68px]" />;
                  }

                  return (
                    <button
                      key={cell.date}
                      type="button"
                      disabled={cell.disabled}
                      onClick={() => onDateInputChange(cell.date)}
                      className={cellClasses(cell)}
                    >
                      <div className="text-base font-semibold sm:text-[17px]">{cell.day}</div>
                      <div
                        className={classNames(
                          "mt-2 flex items-center justify-center",
                          cell.selected ? "text-white/90" : cell.disabled ? "text-slate-400" : "text-current"
                        )}
                      >
                        <StatusIcon
                          status={cell.status}
                          size="h-3.5 w-3.5 sm:h-4 sm:w-4"
                          className={classNames(
                            cell.selected ? "text-white" : cell.disabled ? "text-slate-400" : undefined
                          )}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-[24px] border border-zinc-200 bg-white/80 px-3 py-3">
            <div className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Calendar legend
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {legend.map((status) => (
                <div
                  key={status}
                  className={classNames(
                    "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium",
                    STATUS_META[status].tone
                  )}
                >
                  <StatusIcon status={status} size="h-3.5 w-3.5" />
                  {STATUS_META[status].label}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="flex min-h-[150px] flex-col items-center justify-center rounded-[24px] border border-zinc-200 bg-white/80 p-4 text-center shadow-sm shadow-zinc-200/50">
              <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">Tracked dates</div>
              <div className="mt-2 text-3xl font-semibold text-zinc-900">{watchCount}</div>
            </div>
            <div className="flex min-h-[150px] flex-col items-center justify-center rounded-[24px] border border-zinc-200 bg-white/80 p-4 text-center shadow-sm shadow-zinc-200/50">
              <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">Last live sync</div>
              <div className="mt-2 text-base font-semibold text-zinc-900">{formatSyncTime(lastSyncAt)}</div>
              <div className="mt-2 inline-flex rounded-full bg-violet-100 px-3 py-1 text-[11px] font-medium text-violet-800">
                {modeLabel}
              </div>
              <div className="mt-2 max-w-[24ch] text-xs leading-5 text-zinc-600">{detailLabel}</div>
            </div>
          </div>
        </div>

        <aside className="grid content-start gap-3">
          <div className="rounded-[28px] border border-zinc-200 bg-zinc-50/80 p-3.5">
            <div className="text-sm font-medium text-zinc-700">Choose your key</div>
            <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-5 xl:grid-cols-2">
              {PASS_TYPES.map((pass) => (
                <button
                  key={pass.id}
                  type="button"
                  onClick={() => onPassTypeChange(pass.id)}
                  className={classNames(
                    "rounded-[22px] border px-3 py-2.5 text-center transition",
                    passType === pass.id
                      ? "border-violet-400 bg-violet-50 shadow-sm"
                      : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50"
                  )}
                >
                  <div className="mx-auto flex h-8 w-8 items-center justify-center">
                    <img src={pass.iconPath} alt={pass.name} className="h-7 w-7 object-contain" />
                  </div>
                  <div className="mt-2 text-sm font-medium text-zinc-900">{pass.short}</div>
                  <div className="text-xs text-zinc-500">Key</div>
                </button>
              ))}
            </div>
          </div>

          <div
            className={classNames(
              "rounded-[24px] border px-4 py-3 text-sm",
              selectionDisabled
                ? "border-slate-200 bg-slate-100 text-slate-700"
                : "border-violet-200 bg-violet-50 text-violet-900"
            )}
          >
            {dateInput ? (
              <>
                <span className="font-semibold">{formatWatchDate(dateInput)}</span>
                {" • "}
                {selectedDateStatus ? STATUS_META[selectedDateStatus].label : "Waiting for sync"}
              </>
            ) : (
              "Choose a date from the calendar to add it to your wishboard."
            )}
          </div>

          <div className="rounded-[28px] border border-zinc-200 bg-zinc-50/80 p-3.5">
            <div className="text-sm font-medium text-zinc-700">Preferred Park</div>
            <div className="mt-3 grid gap-2.5 sm:grid-cols-3 xl:grid-cols-1">
              {PARK_OPTIONS.map((park) => (
                <button
                  key={park.value}
                  type="button"
                  onClick={() => onPreferredParkChange(park.value)}
                  className={classNames(
                    "flex items-center justify-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-medium transition",
                    preferredPark === park.value
                      ? "border-violet-400 bg-violet-50 text-violet-900 shadow-sm"
                      : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
                  )}
                >
                  <img src={park.iconPath} alt="" className="h-4 w-4 object-contain" />
                  {park.label}
                </button>
              ))}
            </div>
          </div>

          <label className="grid gap-2 rounded-[28px] border border-zinc-200 bg-zinc-50/80 p-3.5">
            <span className="text-sm font-medium text-zinc-700">Check frequency</span>
            <select
              value={syncFrequency}
              onChange={(event) => onSyncFrequencyChange(event.target.value as FrequencyType)}
              className="h-11 rounded-2xl border border-zinc-200 bg-white px-4 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            >
              {FREQUENCIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={onAddWatchItem}
            disabled={!dateInput || selectionDisabled}
            className="h-11 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 text-sm font-semibold text-white shadow-lg shadow-violet-200 transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Add watched date
          </button>
        </aside>
      </div>
    </div>
  );
}
