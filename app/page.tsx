"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Bell,
  CalendarDays,
  CheckCircle2,
  CircleOff,
  Clock3,
  Mail,
  RefreshCcw,
  Trash2,
  Wand2,
} from "lucide-react";

type PassType = "inspire" | "believe" | "enchant" | "explore" | "imagine";
type ParkOption = "either" | "dl" | "dca";
type StatusType = "either" | "dl" | "dca" | "unavailable" | "blocked";
type FrequencyType = "manual" | "1m" | "5m" | "10m" | "15m" | "30m";
type TabKey = "watchlist" | "calendar" | "activity" | "alerts";

type WatchItem = {
  id: string;
  date: string;
  passType: PassType;
  preferredPark: ParkOption;
  frequency: FrequencyType;
  currentStatus: StatusType;
  previousStatus: StatusType | null;
  changedAt: string;
};

type ActivityItem = {
  id: string;
  message: string;
  createdAt: string;
};

type ToastState = {
  kind: "success" | "error";
  message: string;
} | null;

const STORAGE_KEY = "magic-key-monitor-v2";
const ENDPOINT_URL = "/api/magic-key-status";

const PASS_TYPES: Array<{
  id: PassType;
  name: string;
  limit: number;
  accent: string;
  iconPath: string;
}> = [
  {
    id: "inspire",
    name: "Inspire Key",
    limit: 6,
    accent: "from-fuchsia-500 to-violet-500",
    iconPath: "/branding/inspire-icon.png",
  },
  {
    id: "believe",
    name: "Believe Key",
    limit: 6,
    accent: "from-sky-500 to-indigo-500",
    iconPath: "/branding/believe-icon.png",
  },
  {
    id: "enchant",
    name: "Enchant Key",
    limit: 4,
    accent: "from-violet-500 to-pink-500",
    iconPath: "/branding/enchant-icon.png",
  },
  {
    id: "explore",
    name: "Explore Key",
    limit: 4,
    accent: "from-emerald-500 to-teal-500",
    iconPath: "/branding/explore-icon.png",
  },
  {
    id: "imagine",
    name: "Imagine Key",
    limit: 2,
    accent: "from-amber-400 to-orange-500",
    iconPath: "/branding/imagine-icon.png",
  },
];

const FREQUENCIES: Array<{ value: FrequencyType; label: string }> = [
  { value: "manual", label: "Manual only" },
  { value: "1m", label: "Every 1 minute" },
  { value: "5m", label: "Every 5 minutes" },
  { value: "10m", label: "Every 10 minutes" },
  { value: "15m", label: "Every 15 minutes" },
  { value: "30m", label: "Every 30 minutes" },
];

const POLL_MS: Record<FrequencyType, number> = {
  manual: 0,
  "1m": 60_000,
  "5m": 300_000,
  "10m": 600_000,
  "15m": 900_000,
  "30m": 1_800_000,
};

const PARK_OPTIONS: Array<{ value: ParkOption; label: string }> = [
  { value: "either", label: "Either park" },
  { value: "dl", label: "Disneyland only" },
  { value: "dca", label: "California Adventure only" },
];

const STATUS_META: Record<
  StatusType,
  {
    label: string;
    tone: string;
    assetPath?: string;
  }
> = {
  either: {
    label: "Either Park Available",
    tone: "bg-emerald-50 text-emerald-800 border-emerald-200",
    assetPath: "/branding/either-available.png",
  },
  dl: {
    label: "Disneyland Park Available",
    tone: "bg-pink-50 text-pink-800 border-pink-200",
    assetPath: "/branding/disneyland-available.png",
  },
  dca: {
    label: "Disney California Adventure Park Available",
    tone: "bg-cyan-50 text-cyan-800 border-cyan-200",
    assetPath: "/branding/dca-available.png",
  },
  unavailable: {
    label: "No Magic Key Reservations Available",
    tone: "bg-zinc-100 text-zinc-800 border-zinc-200",
  },
  blocked: {
    label: "Blocked Out",
    tone: "bg-slate-100 text-slate-800 border-slate-300",
  },
};

function classNames(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

function formatDate(dateStr: string) {
  const date = new Date(`${dateStr}T12:00:00`);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatTimestamp(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function comparePriority(status: StatusType) {
  if (status === "either") return 4;
  if (status === "dl" || status === "dca") return 3;
  if (status === "unavailable") return 2;
  return 1;
}

function canNotify() {
  return typeof window !== "undefined" && "Notification" in window;
}

function normalizeStatus(value: string): StatusType {
  const normalized = String(value || "").toLowerCase();
  if (["either", "both", "either-park", "either_park"].includes(normalized)) return "either";
  if (["dl", "disneyland"].includes(normalized)) return "dl";
  if (["dca", "californiaadventure", "california-adventure", "adventure"].includes(normalized)) return "dca";
  if (["blocked", "blockout", "blockedout"].includes(normalized)) return "blocked";
  return "unavailable";
}

function StatusBadge({ status }: { status: StatusType }) {
  const meta = STATUS_META[status];

  return (
    <span
      className={classNames(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm",
        meta.tone
      )}
    >
      {meta.assetPath ? (
        <img src={meta.assetPath} alt={meta.label} className="h-4 w-4 object-contain" />
      ) : status === "blocked" ? (
        <CircleOff className="h-4 w-4" />
      ) : (
        <AlertCircle className="h-4 w-4" />
      )}
      {meta.label}
    </span>
  );
}

function PassPill({ passType }: { passType: PassType }) {
  const pass = PASS_TYPES.find((item) => item.id === passType)!;

  return (
    <div className="flex items-center gap-3">
      <img src={pass.iconPath} alt={pass.name} className="h-10 w-10 rounded-2xl object-contain" />
      <div>
        <div className="font-medium">{pass.name}</div>
        <div className="text-sm text-zinc-500">Reservation hold limit: up to {pass.limit}</div>
      </div>
    </div>
  );
}

export default function Home() {
  const [hydrated, setHydrated] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("watchlist");
  const [passType, setPassType] = useState<PassType>("enchant");
  const [preferredPark, setPreferredPark] = useState<ParkOption>("either");
  const [frequency, setFrequency] = useState<FrequencyType>("30m");
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [emailAddress, setEmailAddress] = useState("");
  const [dateInput, setDateInput] = useState("");
  const [watchItems, setWatchItems] = useState<WatchItem[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [lastCheckedAt, setLastCheckedAt] = useState(new Date().toISOString());
  const [lastSyncAt, setLastSyncAt] = useState("");
  const [lastRunSummary, setLastRunSummary] = useState("Ready to sync live Disney data.");
  const [toast, setToast] = useState<ToastState>(null);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      setWatchItems([
        {
          id: crypto.randomUUID(),
          date: "2026-03-20",
          passType: "enchant",
          preferredPark: "either",
          frequency: "30m",
          currentStatus: "unavailable",
          previousStatus: null,
          changedAt: new Date().toISOString(),
        },
      ]);
      setHydrated(true);
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      setPassType(parsed.passType ?? "enchant");
      setPreferredPark(parsed.preferredPark ?? "either");
      setFrequency(parsed.frequency ?? "30m");
      setAlertsEnabled(parsed.alertsEnabled ?? true);
      setEmailEnabled(parsed.emailEnabled ?? false);
      setEmailAddress(parsed.emailAddress ?? "");
      setWatchItems(parsed.watchItems ?? []);
      setActivity(parsed.activity ?? []);
      setLastCheckedAt(parsed.lastCheckedAt ?? new Date().toISOString());
      setLastSyncAt(parsed.lastSyncAt ?? "");
      setLastRunSummary(parsed.lastRunSummary ?? "Ready to sync live Disney data.");
    } catch {
      // ignore broken local storage
    }

    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        passType,
        preferredPark,
        frequency,
        alertsEnabled,
        emailEnabled,
        emailAddress,
        watchItems,
        activity,
        lastCheckedAt,
        lastSyncAt,
        lastRunSummary,
      })
    );
  }, [
    hydrated,
    passType,
    preferredPark,
    frequency,
    alertsEnabled,
    emailEnabled,
    emailAddress,
    watchItems,
    activity,
    lastCheckedAt,
    lastSyncAt,
    lastRunSummary,
  ]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(id);
  }, [toast]);

  const summary = useMemo(() => {
    const counts = { available: 0, unavailable: 0, blocked: 0 };
    watchItems.forEach((item) => {
      if (["either", "dl", "dca"].includes(item.currentStatus)) counts.available += 1;
      else if (item.currentStatus === "blocked") counts.blocked += 1;
      else counts.unavailable += 1;
    });
    return counts;
  }, [watchItems]);

  const upcomingByDate = useMemo(
    () => [...watchItems].sort((a, b) => a.date.localeCompare(b.date)),
    [watchItems]
  );

  async function requestNotifications() {
    if (!canNotify()) return;
    if (Notification.permission === "default") {
      await Notification.requestPermission();
    }
  }

  function pushToast(kind: "success" | "error", message: string) {
    setToast({ kind, message });
  }

  function applyFeedRows(rows: any[], sourceItems: WatchItem[] = watchItems) {
    const checkedAt = new Date().toISOString();
    const feedLookup = new Map<string, StatusType>();

    rows.forEach((row) => {
      const date = row.date;
      const feedPass = row.passType || row.pass || row.key;
      const feedPark = row.preferredPark || row.park || "either";
      const feedStatus = normalizeStatus(row.status || row.availability);

      if (!date || !feedPass) return;
      feedLookup.set(`${date}__${feedPass}__${feedPark}`, feedStatus);
      feedLookup.set(`${date}__${feedPass}__either`, feedStatus);
    });

    const changes: Array<{ item: WatchItem; from: StatusType; to: StatusType }> = [];
    const improved: Array<{ item: WatchItem; to: StatusType }> = [];

    const updated = sourceItems.map((item) => {
      const nextStatus =
        feedLookup.get(`${item.date}__${item.passType}__${item.preferredPark}`) ??
        feedLookup.get(`${item.date}__${item.passType}__either`) ??
        item.currentStatus;

      const changed = nextStatus !== item.currentStatus;
      const gotBetter = comparePriority(nextStatus) > comparePriority(item.currentStatus);

      if (changed) changes.push({ item, from: item.currentStatus, to: nextStatus });
      if (gotBetter) improved.push({ item, to: nextStatus });

      return {
        ...item,
        previousStatus: item.currentStatus,
        currentStatus: nextStatus,
        changedAt: changed ? checkedAt : item.changedAt,
      };
    });

    setWatchItems(updated);
    setLastCheckedAt(checkedAt);
    setLastSyncAt(checkedAt);

    const summaryLine = changes.length
      ? `Live Disney data synced. ${changes.length} watched ${changes.length === 1 ? "date changed" : "dates changed"}.`
      : "Live Disney data synced. No watched dates changed.";

    setLastRunSummary(summaryLine);
    setActivity((prev) =>
      [
        {
          id: crypto.randomUUID(),
          message: summaryLine,
          createdAt: checkedAt,
        },
        ...changes.slice(0, 5).map((change) => ({
          id: crypto.randomUUID(),
          message: `${formatDate(change.item.date)} moved from ${STATUS_META[change.from].label} to ${STATUS_META[change.to].label}.`,
          createdAt: checkedAt,
        })),
        ...prev,
      ].slice(0, 12)
    );

    return { improvedCount: improved.length, changedCount: changes.length };
  }

  async function maybeNotify(improvedCount: number) {
    if (!(alertsEnabled && improvedCount > 0)) return;
    await requestNotifications();
    if (canNotify() && Notification.permission === "granted") {
      new Notification("Magic Key Monitor", {
        body: `${improvedCount} watched ${improvedCount === 1 ? "date has" : "dates have"} a better status now.`,
      });
    }
  }

  async function syncFromEndpoint(showToastMessage = true, sourceItems: WatchItem[] = watchItems) {
    try {
      const response = await fetch(ENDPOINT_URL, { cache: "no-store" });
      if (!response.ok) throw new Error(`Endpoint returned ${response.status}`);

      const payload = await response.json();
      const rows = Array.isArray(payload) ? payload : payload.items ?? [];
      const { improvedCount, changedCount } = applyFeedRows(rows, sourceItems);

      await maybeNotify(improvedCount);

      if (showToastMessage) {
        pushToast(
          "success",
          changedCount
            ? `Live data synced. ${changedCount} watched ${changedCount === 1 ? "date changed" : "dates changed"}.`
            : "Live data synced. No watched dates changed."
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to sync live data.";
      setLastRunSummary(`Live sync failed: ${message}`);
      if (showToastMessage) pushToast("error", `Sync failed: ${message}`);
    }
  }

  function addDate() {
    if (!dateInput) return;

    const duplicate = watchItems.some(
      (item) =>
        item.date === dateInput &&
        item.passType === passType &&
        item.preferredPark === preferredPark
    );

    if (duplicate) {
      pushToast("error", "That exact watched date already exists.");
      return;
    }

    const nextItem: WatchItem = {
      id: crypto.randomUUID(),
      date: dateInput,
      passType,
      preferredPark,
      frequency,
      currentStatus: "unavailable",
      previousStatus: null,
      changedAt: new Date().toISOString(),
    };

    const nextItems = [...watchItems, nextItem];
    setWatchItems(nextItems);
    setDateInput("");
    setActivity((prev) =>
      [
        {
          id: crypto.randomUUID(),
          message: `Added ${formatDate(nextItem.date)} for ${PASS_TYPES.find((p) => p.id === nextItem.passType)?.name}.`,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ].slice(0, 12)
    );

    void syncFromEndpoint(true, nextItems);
  }

  function removeDate(id: string) {
    const target = watchItems.find((item) => item.id === id);
    setWatchItems((prev) => prev.filter((item) => item.id !== id));
    if (target) {
      setActivity((prev) =>
        [
          {
            id: crypto.randomUUID(),
            message: `Removed ${formatDate(target.date)} from your watchlist.`,
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ].slice(0, 12)
      );
    }
  }

  useEffect(() => {
    if (!hydrated) return;
    void syncFromEndpoint(false);
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated || frequency === "manual") return;

    const id = window.setInterval(() => {
      void syncFromEndpoint(false);
    }, POLL_MS[frequency]);

    return () => window.clearInterval(id);
  }, [hydrated, frequency, watchItems]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(236,72,153,0.10),_transparent_30%),radial-gradient(circle_at_right,_rgba(59,130,246,0.10),_transparent_25%),linear-gradient(to_bottom,_#fff7ed,_#ffffff_28%,_#f8fafc)] text-zinc-900">
      {toast ? (
        <div className="fixed right-4 top-4 z-50">
          <div
            className={classNames(
              "rounded-2xl border px-4 py-3 text-sm shadow-lg",
              toast.kind === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            )}
          >
            {toast.message}
          </div>
        </div>
      ) : null}

      <div className="mx-auto max-w-7xl p-4 md:p-8">
        <div className="mb-8 grid items-start gap-4 lg:grid-cols-[1.4fr_1fr]">
          <section className="overflow-hidden rounded-[2rem] bg-white shadow-[0_20px_80px_-30px_rgba(88,28,135,0.35)]">
            <div className="bg-gradient-to-r from-violet-700 via-fuchsia-600 to-sky-500 p-8 text-white">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-sm backdrop-blur">
                <CheckCircle2 className="h-4 w-4" />
                Personal Magic Key reservation watch
              </div>

              <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">
                    Reservation Watch Dashboard
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-white/90 md:text-base">
                    Embedded icons, cleaner UI, and always-on sync from your server endpoint.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  <div className="rounded-3xl bg-white/15 p-4 backdrop-blur">
                    <div className="text-xs uppercase tracking-[0.18em] text-white/70">
                      Tracked dates
                    </div>
                    <div className="mt-2 text-3xl font-semibold">{watchItems.length}</div>
                  </div>
                  <div className="rounded-3xl bg-white/15 p-4 backdrop-blur">
                    <div className="text-xs uppercase tracking-[0.18em] text-white/70">
                      Last live sync
                    </div>
                    <div className="mt-2 text-sm font-medium">
                      {lastSyncAt ? formatTimestamp(lastSyncAt) : "Not synced yet"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[2rem] bg-white p-6 shadow-[0_18px_60px_-30px_rgba(15,23,42,0.35)]">
            <div className="mb-2 flex items-center gap-2 text-lg font-semibold">
              <Wand2 className="h-5 w-5 text-violet-600" />
              Add a watch item
            </div>
            <p className="mb-5 text-sm text-zinc-500">
              Each watched date saves the pass, park preference, and check cadence chosen at add time.
            </p>

            <div className="space-y-3">
              <label className="text-sm font-medium">Pass type</label>
              <div className="grid gap-2">
                {PASS_TYPES.map((pass) => (
                  <button
                    key={pass.id}
                    onClick={() => setPassType(pass.id)}
                    className={classNames(
                      "overflow-hidden rounded-2xl border text-left transition",
                      passType === pass.id
                        ? "border-violet-500 bg-violet-50 shadow-sm"
                        : "border-zinc-200 bg-white hover:bg-zinc-50"
                    )}
                  >
                    <div className={classNames("h-2 bg-gradient-to-r", pass.accent)} />
                    <div className="p-3">
                      <PassPill passType={pass.id} />
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <label className="text-sm font-medium">Date</label>
              <input
                type="date"
                value={dateInput}
                onChange={(e) => setDateInput(e.target.value)}
                className="w-full rounded-2xl border border-zinc-200 px-4 py-3 outline-none focus:border-violet-500"
              />
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Preferred park outcome</label>
                <select
                  value={preferredPark}
                  onChange={(e) => setPreferredPark(e.target.value as ParkOption)}
                  className="w-full rounded-2xl border border-zinc-200 px-4 py-3 outline-none focus:border-violet-500"
                >
                  {PARK_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Check frequency</label>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as FrequencyType)}
                  className="w-full rounded-2xl border border-zinc-200 px-4 py-3 outline-none focus:border-violet-500"
                >
                  {FREQUENCIES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={addDate}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-3 font-medium text-white transition hover:from-violet-700 hover:to-fuchsia-700"
            >
              Add watched date
            </button>
          </section>
        </div>

        <div className="mb-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-[2rem] bg-white p-5 shadow-[0_16px_55px_-30px_rgba(15,23,42,0.30)]">
            <div className="text-sm text-zinc-500">Dates with availability</div>
            <div className="mt-2 text-3xl font-semibold">{summary.available}</div>
          </div>
          <div className="rounded-[2rem] bg-white p-5 shadow-[0_16px_55px_-30px_rgba(15,23,42,0.30)]">
            <div className="text-sm text-zinc-500">No reservations available</div>
            <div className="mt-2 text-3xl font-semibold">{summary.unavailable}</div>
          </div>
          <div className="rounded-[2rem] bg-white p-5 shadow-[0_16px_55px_-30px_rgba(15,23,42,0.30)]">
            <div className="text-sm text-zinc-500">Blocked out</div>
            <div className="mt-2 text-3xl font-semibold">{summary.blocked}</div>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2 rounded-2xl bg-white/90 p-2 shadow-sm">
          {[
            { key: "watchlist", label: "Watchlist" },
            { key: "calendar", label: "Calendar" },
            { key: "activity", label: "Activity" },
            { key: "alerts", label: "Alerts" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as TabKey)}
              className={classNames(
                "rounded-xl px-4 py-2 text-sm font-medium transition",
                activeTab === tab.key ? "bg-violet-600 text-white" : "text-zinc-600 hover:bg-zinc-100"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "watchlist" && (
          <section className="rounded-[2rem] bg-white p-6 shadow-[0_18px_60px_-30px_rgba(15,23,42,0.35)]">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex items-center gap-2 text-lg font-semibold">
                  <CalendarDays className="h-5 w-5 text-violet-600" />
                  Watched dates
                </div>
                <p className="text-sm text-zinc-500">
                  This screen now always syncs from your server endpoint.
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  onClick={requestNotifications}
                  className="flex items-center justify-center gap-2 rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-medium transition hover:bg-zinc-50"
                >
                  <Bell className="h-4 w-4" />
                  Enable notifications
                </button>
                <button
                  onClick={() => void syncFromEndpoint(true)}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-3 text-sm font-medium text-white transition hover:from-violet-700 hover:to-fuchsia-700"
                >
                  <RefreshCcw className="h-4 w-4" />
                  Sync live data
                </button>
              </div>
            </div>

            <div className="mb-5 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm text-violet-800">
              {lastRunSummary}
            </div>

            <div className="mb-5 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-zinc-200 p-4">
                <div className="mb-2 font-medium">How statuses work</div>
                <div className="space-y-2 text-sm text-zinc-600">
                  <div className="flex items-start gap-2">
                    <CircleOff className="mt-0.5 h-4 w-4 text-slate-600" />
                    <span>
                      <strong>Blocked Out</strong> means that pass type is not valid for that date.
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 text-zinc-600" />
                    <span>
                      <strong>No Magic Key Reservations Available</strong> means the pass is valid, but there is no reservation inventory allocated at that moment.
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 p-4">
                <div className="mb-2 font-medium">Auto-refresh behavior</div>
                <div className="text-sm text-zinc-600">
                  Your selected frequency auto-refreshes live data while this page is open. True background checks while the page is closed come next.
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {upcomingByDate.map((item) => {
                const pass = PASS_TYPES.find((row) => row.id === item.passType)!;
                const parkLabel = PARK_OPTIONS.find((row) => row.value === item.preferredPark)?.label;

                return (
                  <div key={item.id} className="overflow-hidden rounded-[2rem] border border-zinc-200 bg-white">
                    <div className={classNames("h-2 bg-gradient-to-r", pass.accent)} />
                    <div className="p-5">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <PassPill passType={item.passType} />
                        <button
                          onClick={() => removeDate(item.id)}
                          className="rounded-xl border border-zinc-200 p-2 text-zinc-500 transition hover:bg-zinc-50"
                          aria-label={`Remove ${item.date}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="mb-3 text-lg font-semibold">{formatDate(item.date)}</div>

                      <StatusBadge status={item.currentStatus} />

                      <div className="mt-4 flex flex-wrap gap-2">
                        <span className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600">
                          {parkLabel}
                        </span>
                        <span className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600">
                          {FREQUENCIES.find((f) => f.value === item.frequency)?.label}
                        </span>
                      </div>

                      <div className="mt-4 text-sm text-zinc-500">
                        Last updated: {formatTimestamp(item.changedAt)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {activeTab === "calendar" && (
          <section className="rounded-[2rem] bg-white p-6 shadow-[0_18px_60px_-30px_rgba(15,23,42,0.35)]">
            <div className="mb-2 flex items-center gap-2 text-lg font-semibold">
              <Clock3 className="h-5 w-5 text-violet-600" />
              Calendar board
            </div>
            <p className="mb-5 text-sm text-zinc-500">
              Quick month-style view of your watched dates.
            </p>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
              {Array.from({ length: 31 }, (_, index) => {
                const day = index + 1;
                const date = `2026-03-${String(day).padStart(2, "0")}`;
                const watched = watchItems.find((item) => item.date === date);

                return (
                  <div
                    key={date}
                    className={classNames(
                      "rounded-[1.5rem] border p-4",
                      watched ? "border-violet-400 bg-violet-50/70" : "border-zinc-200 bg-white"
                    )}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-sm font-medium">{day}</div>
                      {watched ? (
                        <span className="rounded-full bg-violet-600 px-2 py-1 text-[10px] text-white">
                          Watching
                        </span>
                      ) : null}
                    </div>
                    {watched ? (
                      <StatusBadge status={watched.currentStatus} />
                    ) : (
                      <span className="text-xs text-zinc-400">Not watched</span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {activeTab === "activity" && (
          <section className="rounded-[2rem] bg-white p-6 shadow-[0_18px_60px_-30px_rgba(15,23,42,0.35)]">
            <div className="mb-2 text-lg font-semibold">Sync history</div>
            <p className="mb-5 text-sm text-zinc-500">Every sync and every watched-date change lands here.</p>

            <div className="space-y-3">
              {activity.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-200 p-6 text-sm text-zinc-500">
                  No activity yet.
                </div>
              ) : (
                activity.map((entry) => (
                  <div key={entry.id} className="rounded-2xl border border-zinc-200 px-4 py-3">
                    <div className="text-sm font-medium">{entry.message}</div>
                    <div className="mt-1 text-xs text-zinc-500">{formatTimestamp(entry.createdAt)}</div>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {activeTab === "alerts" && (
          <section className="rounded-[2rem] bg-white p-6 shadow-[0_18px_60px_-30px_rgba(15,23,42,0.35)]">
            <div className="mb-2 text-lg font-semibold">Alerts</div>
            <p className="mb-5 text-sm text-zinc-500">
              Notification preferences live here. Automatic background email alerts are not on yet.
            </p>

            <div className="space-y-5">
              <div className="flex items-center justify-between rounded-2xl border border-zinc-200 px-4 py-3">
                <div>
                  <div className="flex items-center gap-2 font-medium">
                    <Bell className="h-4 w-4 text-violet-600" />
                    Browser notifications
                  </div>
                  <div className="text-sm text-zinc-500">
                    Notify me when a watched date gets a better status while this page is in use.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={alertsEnabled}
                  onChange={(e) => setAlertsEnabled(e.target.checked)}
                  className="h-5 w-5"
                />
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-zinc-200 px-4 py-3">
                <div>
                  <div className="flex items-center gap-2 font-medium">
                    <Mail className="h-4 w-4 text-violet-600" />
                    Email alerts placeholder
                  </div>
                  <div className="text-sm text-zinc-500">
                    This is saved now, but true background email delivery comes in the next step.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={emailEnabled}
                  onChange={(e) => setEmailEnabled(e.target.checked)}
                  className="h-5 w-5"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Email address</label>
                <input
                  type="email"
                  value={emailAddress}
                  onChange={(e) => setEmailAddress(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-2xl border border-zinc-200 px-4 py-3 outline-none focus:border-violet-500"
                />
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
