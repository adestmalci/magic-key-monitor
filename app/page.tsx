"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Bell,
  CalendarDays,
  Castle,
  CheckCircle2,
  CircleOff,
  Clock3,
  Database,
  Download,
  FileJson,
  Image as ImageIcon,
  Mail,
  Mountain,
  Plus,
  Radio,
  RefreshCcw,
  Sparkles,
  Smartphone,
  Trash2,
  Upload,
  Wand2,
} from "lucide-react";

type PassType = "inspire" | "believe" | "enchant" | "explore" | "imagine";
type ParkOption = "either" | "dl" | "dca";
type StatusType = "either" | "dl" | "dca" | "unavailable" | "blocked";
type FrequencyType = "manual" | "15m" | "30m" | "1h" | "4h";

type WatchItem = {
  id: string;
  date: string;
  passType: PassType;
  preferredPark: ParkOption;
  frequency: FrequencyType;
  currentStatus: StatusType;
  previousStatus: StatusType | null;
  changedAt: string;
  notes?: string;
};

type ActivityItem = {
  id: string;
  type: string;
  message: string;
  createdAt: string;
};

type AssetsState = {
  heroImage: string;
  magicKeyLogo: string;
  dlIcon: string;
  dcaIcon: string;
  passIcons: Record<PassType, string>;
};

const PASS_TYPES = [
  { id: "inspire", name: "Inspire Key", limit: 6, accent: "from-fuchsia-500 to-violet-500", short: "I" },
  { id: "believe", name: "Believe Key", limit: 6, accent: "from-sky-500 to-indigo-500", short: "B" },
  { id: "enchant", name: "Enchant Key", limit: 4, accent: "from-violet-500 to-pink-500", short: "E" },
  { id: "explore", name: "Explore Key", limit: 4, accent: "from-emerald-500 to-teal-500", short: "X" },
  { id: "imagine", name: "Imagine Key", limit: 2, accent: "from-amber-400 to-orange-500", short: "M" },
] as const;

const FREQUENCIES = [
  { value: "manual", label: "Manual only" },
  { value: "15m", label: "Every 15 minutes" },
  { value: "30m", label: "Every 30 minutes" },
  { value: "1h", label: "Every 1 hour" },
  { value: "4h", label: "Every 4 hours" },
] as const;

const PARK_OPTIONS = [
  { value: "either", label: "Either park" },
  { value: "dl", label: "Disneyland only" },
  { value: "dca", label: "California Adventure only" },
] as const;

const STATUS_STYLES: Record<
  StatusType,
  { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }
> = {
  either: {
    label: "Either park available",
    icon: CheckCircle2,
    tone: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  dl: {
    label: "Disneyland only",
    icon: Castle,
    tone: "bg-blue-50 text-blue-700 border-blue-200",
  },
  dca: {
    label: "California Adventure only",
    icon: Mountain,
    tone: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
  unavailable: {
    label: "No reservation availability",
    icon: AlertCircle,
    tone: "bg-amber-50 text-amber-700 border-amber-200",
  },
  blocked: {
    label: "Blocked out",
    icon: CircleOff,
    tone: "bg-zinc-100 text-zinc-700 border-zinc-200",
  },
};

const ASSET_DEFAULTS: AssetsState = {
  heroImage: "",
  magicKeyLogo: "",
  dlIcon: "",
  dcaIcon: "",
  passIcons: {
    inspire: "",
    believe: "",
    enchant: "",
    explore: "",
    imagine: "",
  },
};

const SAMPLE_FEED = `[
  {
    "date": "2026-03-20",
    "passType": "enchant",
    "preferredPark": "either",
    "status": "either"
  }
]`;

const STORAGE_KEY = "magic-key-monitor-v1";

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

function createSeed(str: string) {
  let value = 0;
  for (let i = 0; i < str.length; i += 1) {
    value = (value * 31 + str.charCodeAt(i)) % 1000003;
  }
  return value;
}

function getAllowedStatuses(preferredPark: ParkOption): StatusType[] {
  if (preferredPark === "either") return ["either", "dl", "dca", "unavailable", "blocked"];
  if (preferredPark === "dl") return ["dl", "either", "unavailable", "blocked"];
  return ["dca", "either", "unavailable", "blocked"];
}

function simulateStatus({
  passType,
  date,
  preferredPark,
  cycle,
}: {
  passType: PassType;
  date: string;
  preferredPark: ParkOption;
  cycle: number;
}): StatusType {
  const allowed = getAllowedStatuses(preferredPark);
  const seed = createSeed(`${passType}-${date}-${preferredPark}`);
  const step = createSeed(`${date}-${passType}`) % allowed.length;
  const index = (seed + cycle * step + cycle) % allowed.length;
  return allowed[index];
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

function buildLookup(items: WatchItem[]) {
  const lookup = new Map<string, StatusType>();
  items.forEach((item) => {
    lookup.set(`${item.date}__${item.passType}__${item.preferredPark}`, item.currentStatus);
    lookup.set(`${item.date}__${item.passType}__either`, item.currentStatus);
  });
  return lookup;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function PassBadge({
  passType,
  assets,
}: {
  passType: PassType;
  assets: AssetsState;
}) {
  const pass = PASS_TYPES.find((row) => row.id === passType);
  const src = assets.passIcons[passType];

  if (src) {
    return <img src={src} alt={`${pass?.name} icon`} className="h-10 w-10 rounded-2xl object-cover shadow-sm" />;
  }

  return (
    <div className={classNames("flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br text-sm font-semibold text-white shadow-sm", pass?.accent)}>
      {pass?.short}
    </div>
  );
}

function ParkBadge({
  park,
  assets,
}: {
  park: ParkOption;
  assets: AssetsState;
}) {
  if (park === "dl" && assets.dlIcon) {
    return <img src={assets.dlIcon} alt="Disneyland icon" className="h-5 w-5 rounded-full object-contain" />;
  }
  if (park === "dca" && assets.dcaIcon) {
    return <img src={assets.dcaIcon} alt="California Adventure icon" className="h-5 w-5 rounded-full object-contain" />;
  }
  if (park === "dl") return <Castle className="h-4 w-4" />;
  if (park === "dca") return <Mountain className="h-4 w-4" />;
  return <CheckCircle2 className="h-4 w-4" />;
}

function SectionCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={classNames("rounded-[2rem] border-0 bg-white/90 shadow-[0_18px_60px_-30px_rgba(15,23,42,0.35)]", className)}>
      {children}
    </div>
  );
}

function SmallStat({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <SectionCard className="shadow-[0_16px_55px_-30px_rgba(15,23,42,0.30)]">
      <div className="p-5">
        <div className="text-sm text-zinc-500">{label}</div>
        <div className="mt-2 text-3xl font-semibold">{value}</div>
      </div>
    </SectionCard>
  );
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<"watchlist" | "calendar" | "activity" | "alerts" | "assets">("watchlist");
  const [passType, setPassType] = useState<PassType>("enchant");
  const [preferredPark, setPreferredPark] = useState<ParkOption>("either");
  const [frequency, setFrequency] = useState<FrequencyType>("30m");
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [emailAddress, setEmailAddress] = useState("");
  const [dateInput, setDateInput] = useState("");
  const [watchItems, setWatchItems] = useState<WatchItem[]>([]);
  const [cycle, setCycle] = useState(1);
  const [lastCheckedAt, setLastCheckedAt] = useState(new Date().toISOString());
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [lastRunSummary, setLastRunSummary] = useState("Ready to check your watched dates.");
  const [assets, setAssets] = useState<AssetsState>(ASSET_DEFAULTS);
  const [liveMode, setLiveMode] = useState(false);
  const [endpointUrl, setEndpointUrl] = useState("/api/magic-key-status");
  const [lastSyncAt, setLastSyncAt] = useState("");
  const [syncError, setSyncError] = useState("");
  const [manualFeedJson, setManualFeedJson] = useState(SAMPLE_FEED);

  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const starter: WatchItem[] = [
        {
          id: crypto.randomUUID(),
          date: "2026-03-20",
          passType: "enchant",
          preferredPark: "either",
          frequency: "30m",
          currentStatus: "either",
          previousStatus: null,
          changedAt: new Date().toISOString(),
          notes: "Starter watch",
        },
        {
          id: crypto.randomUUID(),
          date: "2026-03-23",
          passType: "enchant",
          preferredPark: "dl",
          frequency: "30m",
          currentStatus: "dl",
          previousStatus: null,
          changedAt: new Date().toISOString(),
          notes: "Starter watch",
        },
      ];
      setWatchItems(starter);
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
      setCycle(parsed.cycle ?? 1);
      setLastCheckedAt(parsed.lastCheckedAt ?? new Date().toISOString());
      setActivity(parsed.activity ?? []);
      setLastRunSummary(parsed.lastRunSummary ?? "Ready to check your watched dates.");
      setAssets(parsed.assets ?? ASSET_DEFAULTS);
      setLiveMode(parsed.liveMode ?? false);
      setEndpointUrl(parsed.endpointUrl ?? "/api/magic-key-status");
      setLastSyncAt(parsed.lastSyncAt ?? "");
      setSyncError(parsed.syncError ?? "");
      setManualFeedJson(parsed.manualFeedJson ?? SAMPLE_FEED);
    } catch {
      // ignore broken local storage
    }
  }, []);

  useEffect(() => {
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
        cycle,
        lastCheckedAt,
        activity,
        lastRunSummary,
        assets,
        liveMode,
        endpointUrl,
        lastSyncAt,
        syncError,
        manualFeedJson,
      })
    );
  }, [
    passType,
    preferredPark,
    frequency,
    alertsEnabled,
    emailEnabled,
    emailAddress,
    watchItems,
    cycle,
    lastCheckedAt,
    activity,
    lastRunSummary,
    assets,
    liveMode,
    endpointUrl,
    lastSyncAt,
    syncError,
    manualFeedJson,
  ]);

  const summary = useMemo(() => {
    const counts = { available: 0, unavailable: 0, blocked: 0 };
    watchItems.forEach((item) => {
      if (["either", "dl", "dca"].includes(item.currentStatus)) counts.available += 1;
      else if (item.currentStatus === "blocked") counts.blocked += 1;
      else counts.unavailable += 1;
    });
    return counts;
  }, [watchItems]);

  const upcomingByDate = useMemo(() => {
    return [...watchItems].sort((a, b) => a.date.localeCompare(b.date));
  }, [watchItems]);

  const watchLookup = useMemo(() => buildLookup(watchItems), [watchItems]);

  async function requestNotifications() {
    if (!canNotify()) return;
    if (Notification.permission === "default") {
      await Notification.requestPermission();
    }
  }

  function updateAsset(field: keyof AssetsState, value: string) {
    if (field === "passIcons") return;
    setAssets((prev) => ({ ...prev, [field]: value }));
  }

  function updatePassAsset(passId: PassType, value: string) {
    setAssets((prev) => ({
      ...prev,
      passIcons: {
        ...prev.passIcons,
        [passId]: value,
      },
    }));
  }

  async function applyAssetUpload(field: keyof Omit<AssetsState, "passIcons">, file?: File) {
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    updateAsset(field, dataUrl);
  }

  async function applyPassAssetUpload(passId: PassType, file?: File) {
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    updatePassAsset(passId, dataUrl);
  }

  function addDate() {
    if (!dateInput) return;

    const duplicate = watchItems.some(
      (item) => item.date === dateInput && item.passType === passType && item.preferredPark === preferredPark
    );
    if (duplicate) return;

    const initialStatus = simulateStatus({ passType, date: dateInput, preferredPark, cycle });

    const next: WatchItem = {
      id: crypto.randomUUID(),
      date: dateInput,
      passType,
      preferredPark,
      frequency,
      currentStatus: initialStatus,
      previousStatus: null,
      changedAt: new Date().toISOString(),
      notes: "Added from watchlist",
    };

    setWatchItems((prev) => [...prev, next]);
    setActivity((prev) =>
      [
        {
          id: crypto.randomUUID(),
          type: "watch-added",
          message: `Added ${formatDate(dateInput)} for ${
            PASS_TYPES.find((p) => p.id === passType)?.name
          } · ${PARK_OPTIONS.find((p) => p.value === preferredPark)?.label}`,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ].slice(0, 12)
    );
    setLastRunSummary(`Added ${formatDate(dateInput)} with ${PARK_OPTIONS.find((p) => p.value === preferredPark)?.label}.`);
    setDateInput("");
  }

  function removeDate(targetId: string) {
    const item = watchItems.find((row) => row.id === targetId);
    setWatchItems((prev) => prev.filter((d) => d.id !== targetId));
    if (item) {
      setActivity((prev) =>
        [
          {
            id: crypto.randomUUID(),
            type: "watch-removed",
            message: `Removed ${formatDate(item.date)} from your watchlist.`,
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ].slice(0, 12)
      );
    }
  }

  function processFeedRows(rows: any[], sourceLabel: string) {
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

    const updated = watchItems.map((item) => {
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
      ? `${sourceLabel} complete. ${changes.length} watched ${changes.length === 1 ? "date changed" : "dates changed"}.`
      : `${sourceLabel} complete. No watched dates changed.`;

    setLastRunSummary(summaryLine);
    setActivity((prev) =>
      [
        {
          id: crypto.randomUUID(),
          type: "live-sync",
          message: `${summaryLine} ${rows.length} feed ${rows.length === 1 ? "row" : "rows"} processed.`,
          createdAt: checkedAt,
        },
        ...changes.slice(0, 5).map((change) => ({
          id: crypto.randomUUID(),
          type: "status-change",
          message: `${formatDate(change.item.date)} moved from ${STATUS_STYLES[change.from].label} to ${STATUS_STYLES[change.to].label}.`,
          createdAt: checkedAt,
        })),
        ...prev,
      ].slice(0, 12)
    );

    return { improved };
  }

  async function maybeNotify(improved: Array<{ item: WatchItem; to: StatusType }>, body: string) {
    if (!(alertsEnabled && improved.length > 0)) return;
    await requestNotifications();
    if (canNotify() && Notification.permission === "granted") {
      new Notification("Magic Key Monitor", { body });
    }
  }

  async function syncFromEndpoint() {
    if (!endpointUrl) {
      setSyncError("Add your endpoint URL first.");
      return;
    }

    try {
      setSyncError("");
      const response = await fetch(endpointUrl, { cache: "no-store" });
      if (!response.ok) throw new Error(`Endpoint returned ${response.status}`);
      const payload = await response.json();
      const rows = Array.isArray(payload) ? payload : payload.items ?? [];
      const { improved } = processFeedRows(rows, "Live sync");
      await maybeNotify(
        improved,
        `${improved.length} watched ${improved.length === 1 ? "date has" : "dates have"} a better live status now.`
      );
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Unable to sync from endpoint.");
    }
  }

  async function syncFromManualJson() {
    try {
      setSyncError("");
      const parsed = JSON.parse(manualFeedJson);
      const rows = Array.isArray(parsed) ? parsed : parsed.items ?? [];
      const { improved } = processFeedRows(rows, "Manual JSON sync");
      await maybeNotify(
        improved,
        `${improved.length} watched ${improved.length === 1 ? "date has" : "dates have"} a better imported status now.`
      );
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Invalid JSON feed.");
    }
  }

  async function runCheckNow() {
    if (liveMode && endpointUrl) {
      await syncFromEndpoint();
      return;
    }

    const nextCycle = cycle + 1;
    const checkedAt = new Date().toISOString();
    const changes: Array<{ item: WatchItem; from: StatusType; to: StatusType }> = [];
    const improved: Array<{ item: WatchItem; to: StatusType }> = [];

    const updated = watchItems.map((item) => {
      const nextStatus = simulateStatus({
        passType: item.passType,
        date: item.date,
        preferredPark: item.preferredPark,
        cycle: nextCycle,
      });

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
    setCycle(nextCycle);
    setLastCheckedAt(checkedAt);

    const summaryLine = changes.length
      ? `Check complete. ${changes.length} watched ${changes.length === 1 ? "date changed" : "dates changed"}.`
      : "Check complete. No watched dates changed this round.";

    setLastRunSummary(summaryLine);
    setActivity((prev) =>
      [
        {
          id: crypto.randomUUID(),
          type: "check-run",
          message: summaryLine,
          createdAt: checkedAt,
        },
        ...changes.slice(0, 5).map((change) => ({
          id: crypto.randomUUID(),
          type: "status-change",
          message: `${formatDate(change.item.date)} moved from ${STATUS_STYLES[change.from].label} to ${STATUS_STYLES[change.to].label}.`,
          createdAt: checkedAt,
        })),
        ...prev,
      ].slice(0, 12)
    );

    await maybeNotify(
      improved,
      `${improved.length} watched ${improved.length === 1 ? "date has" : "dates have"} a better status now.`
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(236,72,153,0.10),_transparent_30%),radial-gradient(circle_at_right,_rgba(59,130,246,0.10),_transparent_25%),linear-gradient(to_bottom,_#fff7ed,_#ffffff_28%,_#f8fafc)] text-zinc-900">
      <div className="mx-auto max-w-7xl p-4 md:p-8">
        <div className="mb-8 grid items-start gap-4 lg:grid-cols-[1.5fr_1fr]">
          <SectionCard className="overflow-hidden shadow-[0_20px_80px_-30px_rgba(88,28,135,0.35)]">
            <div className="relative overflow-hidden bg-gradient-to-r from-violet-700 via-fuchsia-600 to-sky-500 p-8 text-white">
              {assets.heroImage ? (
                <img src={assets.heroImage} alt="Hero art" className="absolute inset-0 h-full w-full object-cover opacity-20" />
              ) : null}
              <div className="relative z-10">
                <div className="mb-4 flex items-center gap-3">
                  {assets.magicKeyLogo ? (
                    <img src={assets.magicKeyLogo} alt="Magic Key logo" className="h-10 rounded-xl object-contain" />
                  ) : (
                    <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-sm backdrop-blur">
                      <Sparkles className="h-4 w-4" />
                      Personal Magic Key reservation watch
                    </div>
                  )}
                </div>

                <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
                  <div>
                    <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">Reservation Watch Dashboard</h1>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-white/90 md:text-base">
                      Track your selected dates, set the park outcome you want, and run checks against demo logic, imported JSON, or your own live endpoint.
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                    <div className="rounded-3xl bg-white/15 p-4 backdrop-blur">
                      <div className="text-xs uppercase tracking-[0.18em] text-white/70">Tracked dates</div>
                      <div className="mt-2 text-3xl font-semibold">{watchItems.length}</div>
                    </div>
                    <div className="rounded-3xl bg-white/15 p-4 backdrop-blur">
                      <div className="text-xs uppercase tracking-[0.18em] text-white/70">Last check</div>
                      <div className="mt-2 text-sm font-medium">{formatTimestamp(lastCheckedAt)}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard>
            <div className="p-6">
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
                      <div className="flex items-center gap-3 p-3">
                        <PassBadge passType={pass.id} assets={assets} />
                        <div>
                          <div className="font-medium">{pass.name}</div>
                          <div className="text-sm text-zinc-500">Reservation hold limit: up to {pass.limit}</div>
                        </div>
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
                <Plus className="h-4 w-4" />
                Add watched date
              </button>
            </div>
          </SectionCard>
        </div>

        <div className="mb-8 grid gap-4 md:grid-cols-3">
          <SmallStat label="Dates with availability" value={summary.available} />
          <SmallStat label="No availability" value={summary.unavailable} />
          <SmallStat label="Blocked out" value={summary.blocked} />
        </div>

        <div className="mb-4 flex flex-wrap gap-2 rounded-2xl bg-white/90 p-2 shadow-sm">
          {[
            { key: "watchlist", label: "Watchlist" },
            { key: "calendar", label: "Calendar" },
            { key: "activity", label: "Activity" },
            { key: "alerts", label: "Alerts" },
            { key: "assets", label: "Assets + Live" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
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
          <SectionCard>
            <div className="p-6">
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-lg font-semibold">
                    <CalendarDays className="h-5 w-5 text-violet-600" />
                    Watched dates
                  </div>
                  <p className="text-sm text-zinc-500">Each card keeps the exact park and pass you chose when you added it.</p>
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
                    onClick={runCheckNow}
                    className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-3 text-sm font-medium text-white transition hover:from-violet-700 hover:to-fuchsia-700"
                  >
                    <RefreshCcw className="h-4 w-4" />
                    {liveMode && endpointUrl ? "Sync live data" : "Run check now"}
                  </button>
                </div>
              </div>

              <div className="mb-5 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm text-violet-800">
                {lastRunSummary}
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {upcomingByDate.map((item) => {
                  const config = STATUS_STYLES[item.currentStatus];
                  const Icon = config.icon;
                  const itemPass = PASS_TYPES.find((row) => row.id === item.passType);
                  const itemPark = PARK_OPTIONS.find((row) => row.value === item.preferredPark);

                  return (
                    <div key={item.id} className="overflow-hidden rounded-[2rem] border border-zinc-200 bg-white">
                      <div className={classNames("h-2 bg-gradient-to-r", itemPass?.accent)} />
                      <div className="p-5">
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <PassBadge passType={item.passType} assets={assets} />
                            <div>
                              <div className="text-sm text-zinc-500">{itemPass?.name}</div>
                              <div className="text-lg font-semibold">{formatDate(item.date)}</div>
                            </div>
                          </div>

                          <button
                            onClick={() => removeDate(item.id)}
                            className="rounded-xl border border-zinc-200 p-2 text-zinc-500 transition hover:bg-zinc-50"
                            aria-label={`Remove ${item.date}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        <div className={classNames("inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm", config.tone)}>
                          <Icon className="h-4 w-4" />
                          {config.label}
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600">
                            <ParkBadge park={item.preferredPark} assets={assets} />
                            {itemPark?.label}
                          </span>
                          <span className="inline-flex items-center rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600">
                            {FREQUENCIES.find((f) => f.value === item.frequency)?.label}
                          </span>
                          {item.previousStatus && item.previousStatus !== item.currentStatus ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-600 px-3 py-1 text-xs text-white">
                              Changed
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-4 text-sm text-zinc-500">Last updated: {formatTimestamp(item.changedAt)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </SectionCard>
        )}

        {activeTab === "calendar" && (
          <SectionCard>
            <div className="p-6">
              <div className="mb-2 flex items-center gap-2 text-lg font-semibold">
                <Clock3 className="h-5 w-5 text-violet-600" />
                Calendar board
              </div>
              <p className="mb-5 text-sm text-zinc-500">A phone-friendly board showing watched dates against the month layout.</p>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
                {Array.from({ length: 28 }, (_, index) => {
                  const day = index + 1;
                  const date = `2026-03-${String(day).padStart(2, "0")}`;
                  const watched = watchItems.find((item) => item.date === date);
                  const status =
                    watched?.currentStatus ??
                    watchLookup.get(`${date}__${passType}__${preferredPark}`) ??
                    simulateStatus({ passType, date, preferredPark: "either", cycle });

                  const config = STATUS_STYLES[status];
                  const Icon = config.icon;

                  return (
                    <div
                      key={date}
                      className={classNames(
                        "rounded-[1.75rem] border p-4",
                        watched ? "border-violet-400 bg-violet-50/70" : "border-zinc-200 bg-white"
                      )}
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <div className="text-sm font-medium">{day}</div>
                        {watched ? <span className="rounded-full bg-violet-600 px-2 py-1 text-[10px] text-white">Watching</span> : null}
                      </div>
                      <div className={classNames("inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs", config.tone)}>
                        <Icon className="h-3.5 w-3.5" />
                        {config.label}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </SectionCard>
        )}

        {activeTab === "activity" && (
          <SectionCard>
            <div className="p-6">
              <div className="mb-2 text-lg font-semibold">Check history</div>
              <p className="mb-5 text-sm text-zinc-500">Every run and every changed watched date lands here.</p>

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
            </div>
          </SectionCard>
        )}

        {activeTab === "alerts" && (
          <SectionCard>
            <div className="p-6">
              <div className="mb-2 text-lg font-semibold">Alerts and delivery</div>
              <p className="mb-5 text-sm text-zinc-500">Notification-ready settings for phone-style use.</p>

              <div className="space-y-5">
                <div className="flex items-center justify-between rounded-2xl border border-zinc-200 px-4 py-3">
                  <div>
                    <div className="flex items-center gap-2 font-medium">
                      <Smartphone className="h-4 w-4 text-violet-600" />
                      Device notifications
                    </div>
                    <div className="text-sm text-zinc-500">Use browser notifications when a watched date gets a better status.</div>
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
                      Email delivery toggle
                    </div>
                    <div className="text-sm text-zinc-500">Store your email now and connect a sender later.</div>
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
            </div>
          </SectionCard>
        )}

        {activeTab === "assets" && (
          <SectionCard>
            <div className="p-6">
              <div className="mb-2 flex items-center gap-2 text-lg font-semibold">
                <ImageIcon className="h-5 w-5 text-violet-600" />
                Assets and live feed
              </div>
              <p className="mb-5 text-sm text-zinc-500">
                Use your own local or hosted images for the look, and connect the app to your own status endpoint.
              </p>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Hero image URL</label>
                  <input
                    value={assets.heroImage}
                    onChange={(e) => updateAsset("heroImage", e.target.value)}
                    placeholder="/images/hero.jpg"
                    className="w-full rounded-2xl border border-zinc-200 px-4 py-3 outline-none focus:border-violet-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Magic Key logo URL</label>
                  <input
                    value={assets.magicKeyLogo}
                    onChange={(e) => updateAsset("magicKeyLogo", e.target.value)}
                    placeholder="/images/magic-key-logo.png"
                    className="w-full rounded-2xl border border-zinc-200 px-4 py-3 outline-none focus:border-violet-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Disneyland park icon URL</label>
                  <input
                    value={assets.dlIcon}
                    onChange={(e) => updateAsset("dlIcon", e.target.value)}
                    placeholder="/images/disneyland-icon.png"
                    className="w-full rounded-2xl border border-zinc-200 px-4 py-3 outline-none focus:border-violet-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">DCA park icon URL</label>
                  <input
                    value={assets.dcaIcon}
                    onChange={(e) => updateAsset("dcaIcon", e.target.value)}
                    placeholder="/images/dca-icon.png"
                    className="w-full rounded-2xl border border-zinc-200 px-4 py-3 outline-none focus:border-violet-500"
                  />
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {[
                  { key: "heroImage", label: "Upload hero image" },
                  { key: "magicKeyLogo", label: "Upload Magic Key logo" },
                  { key: "dlIcon", label: "Upload Disneyland icon" },
                  { key: "dcaIcon", label: "Upload DCA icon" },
                ].map((assetField) => (
                  <div key={assetField.key} className="rounded-2xl border border-zinc-200 p-4">
                    <div className="mb-3 font-medium">{assetField.label}</div>
                    <input
                      ref={(el) => {
                        fileRefs.current[assetField.key] = el;
                      }}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) =>
                        applyAssetUpload(assetField.key as keyof Omit<AssetsState, "passIcons">, e.target.files?.[0] || undefined)
                      }
                    />
                    <button
                      type="button"
                      onClick={() => fileRefs.current[assetField.key]?.click()}
                      className="flex items-center gap-2 rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-medium transition hover:bg-zinc-50"
                    >
                      <Upload className="h-4 w-4" />
                      Choose image
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                {PASS_TYPES.map((pass) => (
                  <div key={pass.id} className="space-y-2 rounded-2xl border border-zinc-200 p-4">
                    <div className="flex items-center gap-3">
                      <PassBadge passType={pass.id} assets={assets} />
                      <div className="font-medium">{pass.name}</div>
                    </div>

                    <input
                      value={assets.passIcons[pass.id]}
                      onChange={(e) => updatePassAsset(pass.id, e.target.value)}
                      placeholder={`/images/${pass.id}-icon.png`}
                      className="w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-violet-500"
                    />

                    <input
                      ref={(el) => {
                        fileRefs.current[`pass-${pass.id}`] = el;
                      }}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => applyPassAssetUpload(pass.id, e.target.files?.[0] || undefined)}
                    />

                    <button
                      type="button"
                      onClick={() => fileRefs.current[`pass-${pass.id}`]?.click()}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-medium transition hover:bg-zinc-50"
                    >
                      <Upload className="h-4 w-4" />
                      Upload icon
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-3xl border border-zinc-200 p-5">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 font-medium">
                      <Radio className="h-4 w-4 text-violet-600" />
                      Live data mode
                    </div>
                    <div className="text-sm text-zinc-500">
                      When enabled, Run check now will fetch status rows from your own endpoint instead of the demo engine.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={liveMode}
                    onChange={(e) => setLiveMode(e.target.checked)}
                    className="h-5 w-5"
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Endpoint URL</label>
                    <input
                      value={endpointUrl}
                      onChange={(e) => setEndpointUrl(e.target.value)}
                      placeholder="/api/magic-key-status"
                      className="w-full rounded-2xl border border-zinc-200 px-4 py-3 outline-none focus:border-violet-500"
                    />
                  </div>

                  <div className="flex items-end">
                    <button
                      onClick={syncFromEndpoint}
                      className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-3 font-medium text-white transition hover:from-violet-700 hover:to-fuchsia-700"
                    >
                      <Download className="h-4 w-4" />
                      Sync now
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-zinc-200 p-4">
                    <div className="mb-2 flex items-center gap-2 font-medium">
                      <Database className="h-4 w-4 text-violet-600" />
                      Expected feed shape
                    </div>
                    <pre className="overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-zinc-600">{SAMPLE_FEED}</pre>
                  </div>

                  <div className="rounded-2xl border border-zinc-200 p-4 text-sm text-zinc-600">
                    <div className="font-medium text-zinc-900">Last live sync</div>
                    <div className="mt-2">{lastSyncAt ? formatTimestamp(lastSyncAt) : "No live sync yet."}</div>
                    {syncError ? (
                      <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700">
                        {syncError}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-3xl border border-zinc-200 p-5">
                <div className="mb-3 flex items-center gap-2 font-medium">
                  <FileJson className="h-4 w-4 text-violet-600" />
                  Manual JSON feed
                </div>
                <div className="text-sm text-zinc-500">Use this to test the live pipeline before building your endpoint further.</div>
                <textarea
                  value={manualFeedJson}
                  onChange={(e) => setManualFeedJson(e.target.value)}
                  className="mt-3 min-h-[180px] w-full rounded-2xl border border-zinc-200 p-3 text-sm outline-none focus:border-violet-500"
                />
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={syncFromManualJson}
                    className="flex items-center gap-2 rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-medium transition hover:bg-zinc-50"
                  >
                    <Download className="h-4 w-4" />
                    Import JSON feed
                  </button>
                </div>
              </div>
            </div>
          </SectionCard>
        )}
      </div>
    </div>
  );
}
