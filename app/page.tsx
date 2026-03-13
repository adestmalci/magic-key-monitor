"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleOff,
  Clock3,
  Mail,
  RefreshCcw,
  Sparkles,
  Trash2,
} from "lucide-react";

type PassType = "inspire" | "believe" | "enchant" | "explore" | "imagine";
type ParkOption = "either" | "dl" | "dca";
type StatusType = "either" | "dl" | "dca" | "unavailable" | "blocked";
type FrequencyType = "manual" | "1m" | "5m" | "10m" | "15m" | "30m";
type TabKey = "watchlist" | "calendar" | "activity" | "alerts";
type SyncSource = "manual" | "auto" | "startup";

type FeedRow = {
  date: string;
  passType: PassType;
  preferredPark: ParkOption;
  status: StatusType | string;
};

type WatchItem = {
  id: string;
  date: string;
  passType: PassType;
  preferredPark: ParkOption;
  currentStatus: StatusType;
  previousStatus: StatusType | null;
  lastCheckedAt: string;
};

type ActivityItem = {
  id: string;
  createdAt: string;
  source: SyncSource | "system";
  message: string;
};

type ToastState = {
  kind: "success" | "error";
  message: string;
} | null;

const STORAGE_KEY = "magic-key-monitor-v4";
const ENDPOINT_URL = "/api/magic-key-status";

const PASS_TYPES: Array<{
  id: PassType;
  name: string;
  short: string;
  accent: string;
  iconPath: string;
}> = [
  {
    id: "inspire",
    name: "Inspire Key",
    short: "Inspire",
    accent: "from-rose-400 to-pink-500",
    iconPath: "/branding/inspire-icon.png",
  },
  {
    id: "believe",
    name: "Believe Key",
    short: "Believe",
    accent: "from-sky-400 to-indigo-500",
    iconPath: "/branding/believe-icon.png",
  },
  {
    id: "enchant",
    name: "Enchant Key",
    short: "Enchant",
    accent: "from-violet-500 to-fuchsia-500",
    iconPath: "/branding/enchant-icon.png",
  },
  {
    id: "explore",
    name: "Explore Key",
    short: "Explore",
    accent: "from-amber-400 to-orange-500",
    iconPath: "/branding/explore-icon.png",
  },
  {
    id: "imagine",
    name: "Imagine Key",
    short: "Imagine",
    accent: "from-cyan-400 to-sky-500",
    iconPath: "/branding/imagine-icon.png",
  },
];

const PARK_OPTIONS: Array<{
  value: ParkOption;
  label: string;
  iconPath: string;
}> = [
  {
    value: "either",
    label: "Either Park",
    iconPath: "/branding/either-available.png",
  },
  {
    value: "dl",
    label: "Disneyland",
    iconPath: "/branding/disneyland-available.png",
  },
  {
    value: "dca",
    label: "California Adventure",
    iconPath: "/branding/dca-available.png",
  },
];

const STATUS_META: Record<
  StatusType,
  {
    label: string;
    compactLabel: string;
    tone: string;
    iconPath?: string;
  }
> = {
  either: {
    label: "Either Park Available",
    compactLabel: "Either Park Open",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
    iconPath: "/branding/either-available.png",
  },
  dl: {
    label: "Disneyland Park Available",
    compactLabel: "Disneyland Open",
    tone: "border-pink-200 bg-pink-50 text-pink-800",
    iconPath: "/branding/disneyland-available.png",
  },
  dca: {
    label: "Disney California Adventure Park Available",
    compactLabel: "DCA Open",
    tone: "border-cyan-200 bg-cyan-50 text-cyan-800",
    iconPath: "/branding/dca-available.png",
  },
  unavailable: {
    label: "No Magic Key Reservations Available",
    compactLabel: "No Reservations",
    tone: "border-zinc-200 bg-zinc-100 text-zinc-700",
  },
  blocked: {
    label: "Blocked Out",
    compactLabel: "Blocked Out",
    tone: "border-slate-300 bg-slate-100 text-slate-700",
  },
};

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

function classNames(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthKeyFromDate(dateStr: string) {
  return dateStr.slice(0, 7);
}

function formatWatchDate(dateStr: string) {
  const date = new Date(`${dateStr}T12:00:00`);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

function formatSyncTime(iso: string) {
  if (!iso) return "Waiting for live sync";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatActivityTime(iso: string) {
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

function normalizeStatus(value: string): StatusType {
  const normalized = String(value || "").trim().toLowerCase();

  if (["either", "both", "either-park", "either_park"].includes(normalized)) return "either";
  if (["dl", "disneyland"].includes(normalized)) return "dl";
  if (["dca", "californiaadventure", "california-adventure", "adventure"].includes(normalized))
    return "dca";
  if (["blocked", "blockout", "blockedout"].includes(normalized)) return "blocked";
  return "unavailable";
}

function canNotify() {
  return typeof window !== "undefined" && "Notification" in window;
}

function nextMonthKey(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const next = new Date(year, month, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
}

function previousMonthKey(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const prev = new Date(year, month - 2, 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
}

function buildFeedLookup(rows: FeedRow[]) {
  const lookup = new Map<string, StatusType>();

  for (const row of rows) {
    if (!row?.date || !row?.passType || !row?.preferredPark) continue;
    const key = `${row.date}__${row.passType}__${row.preferredPark}`;
    lookup.set(key, normalizeStatus(String(row.status ?? "")));
  }

  return lookup;
}

function resolveStatus(
  item: Pick<WatchItem, "date" | "passType" | "preferredPark">,
  lookup: Map<string, StatusType>
): StatusType {
  const exact = lookup.get(`${item.date}__${item.passType}__${item.preferredPark}`);
  if (exact) return exact;

  const either = lookup.get(`${item.date}__${item.passType}__either`);
  if (either) {
    if (item.preferredPark === "dl" && either === "either") return "dl";
    if (item.preferredPark === "dca" && either === "either") return "dca";
    return either;
  }

  return "unavailable";
}

function PassIcon({ passType, size = "h-5 w-5" }: { passType: PassType; size?: string }) {
  const pass = PASS_TYPES.find((item) => item.id === passType)!;
  return <img src={pass.iconPath} alt={pass.name} className={classNames(size, "object-contain")} />;
}

function ParkIcon({ park, size = "h-4 w-4" }: { park: ParkOption | StatusType; size?: string }) {
  const path =
    park === "either"
      ? "/branding/either-available.png"
      : park === "dl"
        ? "/branding/disneyland-available.png"
        : park === "dca"
          ? "/branding/dca-available.png"
          : undefined;

  if (!path) return null;
  return <img src={path} alt="" className={classNames(size, "object-contain")} />;
}

function StatusBadge({
  status,
  compact = false,
}: {
  status: StatusType;
  compact?: boolean;
}) {
  const meta = STATUS_META[status];

  return (
    <span
      className={classNames(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium",
        meta.tone,
        compact && "px-2.5 py-1 text-xs"
      )}
    >
      {meta.iconPath ? (
        <img src={meta.iconPath} alt="" className={compact ? "h-3.5 w-3.5 object-contain" : "h-4 w-4 object-contain"} />
      ) : status === "blocked" ? (
        <CircleOff className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
      ) : null}
      {compact ? meta.compactLabel : meta.label}
    </span>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[28px] border border-zinc-200 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-violet-50 text-violet-600">
        <Sparkles className="h-6 w-6" />
      </div>
      <h3 className="text-lg font-semibold text-zinc-900">{title}</h3>
      <p className="mt-2 text-sm text-zinc-500">{body}</p>
    </div>
  );
}

export default function Home() {
  const [hydrated, setHydrated] = useState(false);
  const [hasStartedInitialSync, setHasStartedInitialSync] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("watchlist");

  const [passType, setPassType] = useState<PassType>("enchant");
  const [preferredPark, setPreferredPark] = useState<ParkOption>("either");
  const [syncFrequency, setSyncFrequency] = useState<FrequencyType>("1m");

  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [emailAddress, setEmailAddress] = useState("");

  const [dateInput, setDateInput] = useState("");
  const [watchItems, setWatchItems] = useState<WatchItem[]>([]);
  const [feedRows, setFeedRows] = useState<FeedRow[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState("");
  const [lastRunSummary, setLastRunSummary] = useState("Ready to sync live Disney data.");
  const [displayedMonth, setDisplayedMonth] = useState(currentMonthKey());
  const [toast, setToast] = useState<ToastState>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const syncLockRef = useRef(false);

  const pushToast = useCallback((kind: "success" | "error", message: string) => {
    setToast({ kind, message });
    window.clearTimeout((window as Window & { __toastTimer?: number }).__toastTimer);
    (window as Window & { __toastTimer?: number }).__toastTimer = window.setTimeout(() => {
      setToast(null);
    }, 3000);
  }, []);

  const prependActivity = useCallback((source: SyncSource | "system", message: string) => {
    setActivity((current) => [
      {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        source,
        message,
      },
      ...current,
    ].slice(0, 40));
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      setDisplayedMonth(currentMonthKey());
      setHydrated(true);
      return;
    }

    try {
      const parsed = JSON.parse(raw);

      setActiveTab(parsed.activeTab ?? "watchlist");
      setPassType(parsed.passType ?? "enchant");
      setPreferredPark(parsed.preferredPark ?? "either");
      setSyncFrequency(parsed.syncFrequency ?? "1m");
      setAlertsEnabled(parsed.alertsEnabled ?? false);
      setEmailEnabled(parsed.emailEnabled ?? false);
      setEmailAddress(parsed.emailAddress ?? "");
      setFeedRows(parsed.feedRows ?? []);
      setActivity(parsed.activity ?? []);
      setLastSyncAt(parsed.lastSyncAt ?? "");
      setLastRunSummary(parsed.lastRunSummary ?? "Ready to sync live Disney data.");
      setDisplayedMonth(parsed.displayedMonth ?? currentMonthKey());

      const nextWatchItems = Array.isArray(parsed.watchItems)
        ? parsed.watchItems.map((item: WatchItem & { changedAt?: string }) => ({
            ...item,
            previousStatus: item.previousStatus ?? null,
            currentStatus: normalizeStatus(item.currentStatus),
            lastCheckedAt: item.lastCheckedAt ?? item.changedAt ?? parsed.lastSyncAt ?? "",
          }))
        : [];

      setWatchItems(nextWatchItems);
    } catch {
      setDisplayedMonth(currentMonthKey());
    }

    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        activeTab,
        passType,
        preferredPark,
        syncFrequency,
        alertsEnabled,
        emailEnabled,
        emailAddress,
        watchItems,
        feedRows,
        activity,
        lastSyncAt,
        lastRunSummary,
        displayedMonth,
      })
    );
  }, [
    activeTab,
    passType,
    preferredPark,
    syncFrequency,
    alertsEnabled,
    emailEnabled,
    emailAddress,
    watchItems,
    feedRows,
    activity,
    lastSyncAt,
    lastRunSummary,
    displayedMonth,
    hydrated,
  ]);

  const syncFeed = useCallback(
    async (source: SyncSource = "manual", logActivity = true) => {
      if (syncLockRef.current) return;

      syncLockRef.current = true;
      setIsSyncing(true);

      try {
        const response = await fetch(`${ENDPOINT_URL}?t=${Date.now()}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Sync failed with status ${response.status}`);
        }

        const rawRows = await response.json();
        const rows: FeedRow[] = Array.isArray(rawRows) ? rawRows : [];
        const lookup = buildFeedLookup(rows);
        const syncedAt = new Date().toISOString();

        let changedCount = 0;
        const newlyBetter: Array<{ date: string; passType: PassType; status: StatusType }> = [];

        setFeedRows(rows);

        setWatchItems((current) =>
          current.map((item) => {
            const nextStatus = resolveStatus(item, lookup);
            const changed = nextStatus !== item.currentStatus;

            if (changed) {
              changedCount += 1;

              if (comparePriority(nextStatus) > comparePriority(item.currentStatus)) {
                newlyBetter.push({
                  date: item.date,
                  passType: item.passType,
                  status: nextStatus,
                });
              }
            }

            return {
              ...item,
              previousStatus: changed ? item.currentStatus : item.previousStatus,
              currentStatus: nextStatus,
              lastCheckedAt: syncedAt,
            };
          })
        );

        setLastSyncAt(syncedAt);

        const prefix =
          source === "manual"
            ? "Live Disney data manually synced."
            : source === "auto"
              ? "Live Disney data auto-synced."
              : "Live Disney data synced.";

        const summary =
          changedCount === 0
            ? `${prefix} No watched dates changed.`
            : `${prefix} ${changedCount} watched ${changedCount === 1 ? "date changed" : "dates changed"}.`;

        setLastRunSummary(summary);

        if (logActivity && source !== "startup") {
          prependActivity(source, summary);
        }

        if (alertsEnabled && newlyBetter.length > 0 && canNotify() && Notification.permission === "granted") {
          const first = newlyBetter[0];
          const passName = PASS_TYPES.find((item) => item.id === first.passType)?.name ?? first.passType;
          const statusLabel = STATUS_META[first.status].compactLabel;

          new Notification("Magic Key update", {
            body: `${passName} • ${formatWatchDate(first.date)} • ${statusLabel}`,
          });
        }

        if (source === "manual") {
          pushToast("success", "Live Disney data manually synced.");
        }
      } catch (error) {
        const message = "Live Disney data sync failed.";
        setLastRunSummary(message);

        if (logActivity && source !== "startup") {
          prependActivity("system", message);
        }

        if (source === "manual") {
          pushToast("error", "Live sync failed.");
        }
      } finally {
        syncLockRef.current = false;
        setIsSyncing(false);
      }
    },
    [alertsEnabled, prependActivity, pushToast]
  );

  useEffect(() => {
    if (!hydrated || hasStartedInitialSync) return;
    setHasStartedInitialSync(true);
    void syncFeed("startup", false);
  }, [hydrated, hasStartedInitialSync, syncFeed]);

  useEffect(() => {
    if (!hydrated || syncFrequency === "manual") return;

    const interval = window.setInterval(() => {
      void syncFeed("auto", true);
    }, POLL_MS[syncFrequency]);

    return () => window.clearInterval(interval);
  }, [hydrated, syncFrequency, syncFeed]);

  const summary = useMemo(() => {
    const counts = { available: 0, unavailable: 0, blocked: 0 };

    for (const item of watchItems) {
      if (["either", "dl", "dca"].includes(item.currentStatus)) counts.available += 1;
      else if (item.currentStatus === "blocked") counts.blocked += 1;
      else counts.unavailable += 1;
    }

    return counts;
  }, [watchItems]);

  const watchedByDate = useMemo(() => {
    const next = new Map<string, WatchItem[]>();

    for (const item of watchItems) {
      const bucket = next.get(item.date) ?? [];
      bucket.push(item);
      next.set(item.date, bucket);
    }

    for (const [key, value] of next.entries()) {
      value.sort((a, b) => {
        return (
          a.date.localeCompare(b.date) ||
          PASS_TYPES.findIndex((row) => row.id === a.passType) - PASS_TYPES.findIndex((row) => row.id === b.passType)
        );
      });
      next.set(key, value);
    }

    return next;
  }, [watchItems]);

  const calendarRows = useMemo(() => {
    const [year, month] = displayedMonth.split("-").map(Number);
    const firstDay = new Date(year, month - 1, 1);
    const daysInMonth = new Date(year, month, 0).getDate();
    const leadingBlanks = firstDay.getDay();

    const cells: Array<{ date: string; day: number } | null> = [];

    for (let i = 0; i < leadingBlanks; i += 1) {
      cells.push(null);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push({
        date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        day,
      });
    }

    while (cells.length % 7 !== 0) {
      cells.push(null);
    }

    const rows: Array<Array<{ date: string; day: number } | null>> = [];
    for (let i = 0; i < cells.length; i += 7) {
      rows.push(cells.slice(i, i + 7));
    }

    return rows;
  }, [displayedMonth]);

  const addWatchItem = useCallback(() => {
    if (!dateInput) {
      pushToast("error", "Choose a date first.");
      return;
    }

    const duplicate = watchItems.some(
      (item) =>
        item.date === dateInput && item.passType === passType && item.preferredPark === preferredPark
    );

    if (duplicate) {
      pushToast("error", "That watched date already exists.");
      return;
    }

    const lookup = buildFeedLookup(feedRows);
    const nextStatus = resolveStatus(
      {
        date: dateInput,
        passType,
        preferredPark,
      },
      lookup
    );

    const nextItem: WatchItem = {
      id: crypto.randomUUID(),
      date: dateInput,
      passType,
      preferredPark,
      currentStatus: nextStatus,
      previousStatus: null,
      lastCheckedAt: lastSyncAt,
    };

    setWatchItems((current) => [...current, nextItem]);
    setDisplayedMonth(monthKeyFromDate(dateInput));
    setDateInput("");
    prependActivity("system", `Added watched date: ${formatWatchDate(nextItem.date)} • ${PASS_TYPES.find((item) => item.id === passType)?.name} • ${PARK_OPTIONS.find((item) => item.value === preferredPark)?.label}`);
    pushToast("success", "Watched date added.");
  }, [dateInput, watchItems, passType, preferredPark, feedRows, lastSyncAt, prependActivity, pushToast]);

  const removeWatchItem = useCallback(
    (id: string) => {
      const item = watchItems.find((row) => row.id === id);
      setWatchItems((current) => current.filter((row) => row.id !== id));

      if (item) {
        prependActivity("system", `Removed watched date: ${formatWatchDate(item.date)} • ${PASS_TYPES.find((row) => row.id === item.passType)?.name}`);
      }
    },
    [watchItems, prependActivity]
  );

  const requestNotifications = useCallback(async () => {
    if (!canNotify()) {
      pushToast("error", "Browser notifications are not available here.");
      return;
    }

    const permission = await Notification.requestPermission();

    if (permission === "granted") {
      setAlertsEnabled(true);
      pushToast("success", "Browser notifications enabled.");
      return;
    }

    setAlertsEnabled(false);
    pushToast("error", "Notifications were not enabled.");
  }, [pushToast]);

  const tabs: Array<{ id: TabKey; label: string }> = [
    { id: "watchlist", label: "Watchlist" },
    { id: "calendar", label: "Calendar" },
    { id: "activity", label: "Activity" },
    { id: "alerts", label: "Alerts" },
  ];

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-8 md:px-8 lg:px-10">
        <section className="grid gap-6 lg:grid-cols-[1.35fr_0.9fr]">
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
                  <div className="mt-2 text-4xl font-semibold">{watchItems.length}</div>
                </div>
                <div className="rounded-[28px] bg-white/16 p-5 backdrop-blur">
                  <div className="text-xs uppercase tracking-[0.22em] text-white/75">Last live sync</div>
                  <div className="mt-2 text-lg font-semibold">{formatSyncTime(lastSyncAt)}</div>
                  <div className="mt-1 text-xs text-white/75">{lastRunSummary}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[36px] border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="text-lg font-semibold text-zinc-900">Add watched date</div>
            <div className="mt-5">
              <div className="text-sm font-medium text-zinc-700">Choose Your Key</div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
                {PASS_TYPES.map((pass) => (
                  <button
                    key={pass.id}
                    type="button"
                    onClick={() => setPassType(pass.id)}
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
                  onChange={(event) => setDateInput(event.target.value)}
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
                      onClick={() => setPreferredPark(park.value)}
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
                  onChange={(event) => setSyncFrequency(event.target.value as FrequencyType)}
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
                onClick={addWatchItem}
                className="h-12 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 text-sm font-semibold text-white shadow-lg shadow-violet-200 transition hover:opacity-95"
              >
                Add watched date
              </button>
            </div>
          </div>
        </section>

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

        <section className="rounded-[28px] border border-zinc-200 bg-white p-2 shadow-sm">
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={classNames(
                  "rounded-2xl px-5 py-3 text-sm font-medium transition",
                  activeTab === tab.id
                    ? "bg-violet-600 text-white shadow"
                    : "text-zinc-600 hover:bg-zinc-100"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </section>

        {activeTab === "watchlist" && (
          <section className="rounded-[32px] border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex items-center gap-2 text-2xl font-semibold text-zinc-900">
                  <CalendarDays className="h-6 w-6 text-violet-600" />
                  Watched dates
                </div>
                <p className="mt-2 text-sm text-zinc-500">
                  Successful sync times now drive the dashboard timestamp and every card timestamp below.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={requestNotifications}
                  className="inline-flex h-11 items-center gap-2 rounded-2xl border border-zinc-200 px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
                >
                  <Bell className="h-4 w-4" />
                  Enable notifications
                </button>

                <button
                  type="button"
                  onClick={() => void syncFeed("manual", true)}
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
                                onClick={() => removeWatchItem(item.id)}
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
                                {FREQUENCIES.find((row) => row.value === syncFrequency)?.label}
                              </span>
                            </div>

                            <div className="mt-5 text-sm text-zinc-500">
                              Last updated: {formatSyncTime(item.lastCheckedAt || lastSyncAt)}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === "calendar" && (
          <section className="rounded-[32px] border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2 text-2xl font-semibold text-zinc-900">
                  <Clock3 className="h-6 w-6 text-violet-600" />
                  Calendar board
                </div>
                <p className="mt-2 text-sm text-zinc-500">
                  Real calendar layout with month label, weekday headers, watched park, pass icon, and current live status.
                </p>
              </div>

              <div className="inline-flex items-center gap-2 self-start rounded-2xl border border-zinc-200 bg-zinc-50 p-2">
                <button
                  type="button"
                  onClick={() => setDisplayedMonth(previousMonthKey(displayedMonth))}
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
                  onClick={() => setDisplayedMonth(nextMonthKey(displayedMonth))}
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
              {calendarRows.map((row, rowIndex) => (
                <div key={rowIndex} className="grid grid-cols-7 gap-3">
                  {row.map((cell, cellIndex) => {
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
                        className={classNames(
                          "min-h-[150px] rounded-[24px] border p-3 shadow-sm transition",
                          items.length > 0
                            ? "border-violet-300 bg-violet-50/50"
                            : "border-zinc-200 bg-white"
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
                                    <img src={park.iconPath} alt="" className="h-3.5 w-3.5 object-contain" />
                                    {park.label}
                                  </div>
                                </div>
                              );
                            })}

                            {items.length > 2 && (
                              <div className="text-xs text-zinc-500">+{items.length - 2} more watched items</div>
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
        )}

        {activeTab === "activity" && (
          <section className="rounded-[32px] border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2 text-2xl font-semibold text-zinc-900">
              <RefreshCcw className="h-6 w-6 text-violet-600" />
              Sync history
            </div>
            <p className="mt-2 text-sm text-zinc-500">
              Manual and automatic syncs are labeled differently so the history is easier to read.
            </p>

            <div className="mt-6">
              {activity.length === 0 ? (
                <EmptyState
                  title="No sync activity yet"
                  body="Your sync history will appear here after you manually sync or after an automatic interval runs."
                />
              ) : (
                <div className="space-y-3">
                  {activity.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col gap-2 rounded-[24px] border border-zinc-200 bg-zinc-50 p-4 md:flex-row md:items-center md:justify-between"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={classNames(
                              "rounded-full px-2.5 py-1 text-xs font-semibold",
                              item.source === "manual"
                                ? "bg-violet-100 text-violet-800"
                                : item.source === "auto"
                                  ? "bg-sky-100 text-sky-800"
                                  : "bg-zinc-200 text-zinc-700"
                            )}
                          >
                            {item.source === "manual"
                              ? "Manual sync"
                              : item.source === "auto"
                                ? "Auto sync"
                                : item.source === "startup"
                                  ? "Startup sync"
                                  : "System"}
                          </span>
                          <span className="text-xs text-zinc-500">{formatActivityTime(item.createdAt)}</span>
                        </div>
                        <div className="mt-2 text-sm text-zinc-800">{item.message}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === "alerts" && (
          <section className="rounded-[32px] border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2 text-2xl font-semibold text-zinc-900">
              <Bell className="h-6 w-6 text-violet-600" />
              Alerts & saved preferences
            </div>
            <p className="mt-2 text-sm text-zinc-500">
              These settings are saved in your browser so you do not need to re-enter them every time.
            </p>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="rounded-[28px] border border-zinc-200 bg-zinc-50 p-5">
                <div className="text-sm font-semibold text-zinc-900">Browser notifications</div>
                <p className="mt-2 text-sm text-zinc-500">
                  Get alerts when a watched date improves.
                </p>
                <div className="mt-4 flex items-center justify-between gap-4">
                  <div className="text-sm text-zinc-700">
                    {alertsEnabled ? "Enabled" : "Disabled"}
                  </div>
                  <button
                    type="button"
                    onClick={requestNotifications}
                    className="inline-flex h-11 items-center gap-2 rounded-2xl bg-violet-600 px-4 text-sm font-semibold text-white"
                  >
                    <Bell className="h-4 w-4" />
                    Turn on
                  </button>
                </div>
              </div>

              <div className="rounded-[28px] border border-zinc-200 bg-zinc-50 p-5">
                <div className="text-sm font-semibold text-zinc-900">Email preference</div>
                <p className="mt-2 text-sm text-zinc-500">
                  Saved locally in this browser for now.
                </p>

                <label className="mt-4 flex items-center gap-3 text-sm text-zinc-700">
                  <input
                    type="checkbox"
                    checked={emailEnabled}
                    onChange={(event) => setEmailEnabled(event.target.checked)}
                    className="h-4 w-4 rounded border-zinc-300 text-violet-600"
                  />
                  Keep email alerts enabled
                </label>

                <label className="mt-4 grid gap-2">
                  <span className="text-sm text-zinc-700">Email address</span>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                    <input
                      type="email"
                      value={emailAddress}
                      onChange={(event) => setEmailAddress(event.target.value)}
                      placeholder="name@example.com"
                      className="h-12 w-full rounded-2xl border border-zinc-200 bg-white pl-10 pr-4 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                    />
                  </div>
                </label>
              </div>
            </div>
          </section>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-5 right-5 z-50">
          <div
            className={classNames(
              "rounded-2xl border px-4 py-3 text-sm font-medium shadow-lg",
              toast.kind === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            )}
          >
            {toast.message}
          </div>
        </div>
      )}
    </main>
  );
}
