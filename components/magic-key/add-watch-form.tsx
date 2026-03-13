import { FREQUENCIES, PARK_OPTIONS, PASS_TYPES } from "../../lib/magic-key/config";
import type { FrequencyType, ParkOption, PassType } from "../../lib/magic-key/types";
import { classNames } from "../../lib/magic-key/utils";

export function AddWatchForm({
  passType,
  onPassTypeChange,
  dateInput,
  onDateInputChange,
  preferredPark,
  onPreferredParkChange,
  syncFrequency,
  onSyncFrequencyChange,
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
  onAddWatchItem: () => void;
}) {
  return (
    <div className="rounded-[36px] border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="text-lg font-semibold text-zinc-900">Add watched date</div>

      <div className="mt-5">
        <div className="text-sm font-medium text-zinc-700">Choose Your Key</div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {PASS_TYPES.map((pass) => (
            <button
              key={pass.id}
              type="button"
              onClick={() => onPassTypeChange(pass.id)}
              className={classNames(
                "rounded-[22px] border px-3 py-3 text-center transition",
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

      <div className="mt-5 grid gap-5">
        <label className="grid gap-2">
          <span className="text-sm font-medium text-zinc-700">Date</span>
          <input
            type="date"
            value={dateInput}
            onChange={(event) => onDateInputChange(event.target.value)}
            className="h-12 rounded-2xl border border-zinc-200 bg-white px-4 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
          />
        </label>

        <div className="grid gap-2">
          <div className="text-sm font-medium text-zinc-700">Preferred Park</div>
          <div className="grid gap-3 sm:grid-cols-3">
            {PARK_OPTIONS.map((park) => (
              <button
                key={park.value}
                type="button"
                onClick={() => onPreferredParkChange(park.value)}
                className={classNames(
                  "flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition",
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

        <label className="grid gap-2">
          <span className="text-sm font-medium text-zinc-700">Check frequency</span>
          <select
            value={syncFrequency}
            onChange={(event) => onSyncFrequencyChange(event.target.value as FrequencyType)}
            className="h-12 rounded-2xl border border-zinc-200 bg-white px-4 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
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
          className="h-12 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 text-sm font-semibold text-white shadow-lg shadow-violet-200 transition hover:opacity-95"
        >
          Add watched date
        </button>
      </div>
    </div>
  );
}
