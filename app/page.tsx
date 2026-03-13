"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AddWatchForm } from "../components/magic-key/add-watch-form";
import { ActivitySection } from "../components/magic-key/activity-section";
import { AlertsSection } from "../components/magic-key/alerts-section";
import { CalendarSection } from "../components/magic-key/calendar-section";
import { HeroSection } from "../components/magic-key/hero-section";
import { SummaryCards } from "../components/magic-key/summary-cards";
import { TabsNav } from "../components/magic-key/tabs-nav";
import { WatchlistSection } from "../components/magic-key/watchlist-section";
import { ENDPOINT_URL, PARK_OPTIONS, PASS_TYPES, POLL_MS, STATUS_META, STORAGE_KEY } from "../lib/magic-key/config";
import type {
  ActivityItem,
  DashboardUserState,
  FeedRow,
  FrequencyType,
  ParkOption,
  PassType,
  SessionUser,
  StatusType,
  SyncMeta,
  SyncSource,
  TabKey,
  ToastState,
  WatchItem,
} from "../lib/magic-key/types";
import {
  buildFeedLookup,
  canNotify,
  canUsePushManager,
  classNames,
  currentMonthKey,
  formatWatchDate,
  monthKeyFromDate,
  nextMonthKey,
  normalizeStatus,
  previousMonthKey,
  resolveStatus,
  syncMetaFromHeaders,
  urlBase64ToUint8Array,
} from "../lib/magic-key/utils";

const DEFAULT_SYNC_META: SyncMeta = {
  lastSuccessfulSyncAt: "",
  lastAttemptedSyncAt: "",
  mode: "snapshot-fallback",
  stale: false,
  message: "Ready to sync Disney data.",
  lastError: "",
};

export default function Home() {
  const [hydrated, setHydrated] = useState(false);
  const [hasStartedInitialSync, setHasStartedInitialSync] = useState(false);
  const [hasLoadedServerState, setHasLoadedServerState] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("watchlist");

  const [passType, setPassType] = useState<PassType>("enchant");
  const [preferredPark, setPreferredPark] = useState<ParkOption>("either");
  const [syncFrequency, setSyncFrequency] = useState<FrequencyType>("1m");

  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [emailAddress, setEmailAddress] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [pushPublicKey, setPushPublicKey] = useState("");

  const [dateInput, setDateInput] = useState("");
  const [watchItems, setWatchItems] = useState<WatchItem[]>([]);
  const [feedRows, setFeedRows] = useState<FeedRow[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState("");
  const [lastRunSummary, setLastRunSummary] = useState("Ready to sync Disney data.");
  const [syncMeta, setSyncMeta] = useState<SyncMeta>(DEFAULT_SYNC_META);
  const [displayedMonth, setDisplayedMonth] = useState(currentMonthKey());
  const [toast, setToast] = useState<ToastState>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const syncLockRef = useRef(false);
  const watchItemsRef = useRef<WatchItem[]>([]);
  const importedLocalRef = useRef(false);

  useEffect(() => {
    watchItemsRef.current = watchItems;
  }, [watchItems]);

  const pushToast = useCallback((kind: "success" | "error", message: string) => {
    setToast({ kind, message });
    window.clearTimeout((window as Window & { __toastTimer?: number }).__toastTimer);
    (window as Window & { __toastTimer?: number }).__toastTimer = window.setTimeout(() => {
      setToast(null);
    }, 3500);
  }, []);

  const prependActivity = useCallback((source: SyncSource | "system", message: string) => {
    setActivity((current) =>
      [
        {
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          source,
          message,
        },
        ...current,
      ].slice(0, 40)
    );
  }, []);

  const applyDashboardState = useCallback((data: DashboardUserState) => {
    setSessionUser(data.user);
    setPushPublicKey(data.pushPublicKey || "");
    setSyncMeta(data.syncMeta || DEFAULT_SYNC_META);

    if (data.syncMeta?.lastSuccessfulSyncAt) {
      setLastSyncAt(data.syncMeta.lastSuccessfulSyncAt);
      setLastRunSummary(data.syncMeta.message || "Ready to sync Disney data.");
    }

    if (data.user) {
      setAlertsEnabled(data.preferences.alertsEnabled);
      setPushEnabled(data.preferences.pushEnabled);
      setEmailEnabled(data.preferences.emailEnabled);
      setEmailAddress(data.preferences.emailAddress || data.user.email);
      setSyncFrequency(data.preferences.syncFrequency);
      setAuthEmail(data.user.email);
      setWatchItems(data.watchItems);
    }
  }, []);

  const loadDashboardState = useCallback(async () => {
    const response = await fetch("/api/auth/session", { cache: "no-store" });
    if (!response.ok) return;

    const data: DashboardUserState = await response.json();

    if (
      data.user &&
      data.watchItems.length === 0 &&
      watchItemsRef.current.length > 0 &&
      !importedLocalRef.current
    ) {
      importedLocalRef.current = true;
      await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "import",
          items: watchItemsRef.current,
        }),
      });

      const secondPass = await fetch("/api/auth/session", { cache: "no-store" });
      if (secondPass.ok) {
        applyDashboardState(await secondPass.json());
        setHasLoadedServerState(true);
        return;
      }
    }

    applyDashboardState(data);
    setHasLoadedServerState(true);
  }, [applyDashboardState]);

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
      setLastRunSummary(parsed.lastRunSummary ?? "Ready to sync Disney data.");
      setDisplayedMonth(parsed.displayedMonth ?? currentMonthKey());

      const nextWatchItems = Array.isArray(parsed.watchItems)
        ? parsed.watchItems.map((item: WatchItem & { changedAt?: string }) => ({
            ...item,
            previousStatus: item.previousStatus ?? null,
            currentStatus: normalizeStatus(String(item.currentStatus)),
            lastCheckedAt: item.lastCheckedAt ?? item.changedAt ?? parsed.lastSyncAt ?? "",
          }))
        : [];

      setWatchItems(nextWatchItems);
      watchItemsRef.current = nextWatchItems;
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

  useEffect(() => {
    if (!hydrated) return;
    void loadDashboardState();
  }, [hydrated, loadDashboardState]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const auth = params.get("auth");

    if (auth === "success") {
      pushToast("success", "Magic link approved. Your watchlist is now traveling with your account.");
      void loadDashboardState();
    } else if (auth === "invalid") {
      pushToast("error", "That sign-in link has already twinkled out.");
    }

    if (auth) {
      params.delete("auth");
      const next = params.toString();
      window.history.replaceState({}, "", next ? `/?${next}` : "/");
    }
  }, [loadDashboardState, pushToast]);

  useEffect(() => {
    if (!hydrated || !hasLoadedServerState || !sessionUser) return;

    void fetch("/api/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        emailEnabled,
        emailAddress,
        alertsEnabled,
        pushEnabled,
        syncFrequency,
      }),
    });
  }, [hydrated, hasLoadedServerState, sessionUser, emailEnabled, emailAddress, alertsEnabled, pushEnabled, syncFrequency]);

  const syncFeed = useCallback(
    async (source: SyncSource = "manual", logActivity = true) => {
      if (syncLockRef.current) return;

      syncLockRef.current = true;
      setIsSyncing(true);

      try {
        const refresh = source === "manual" ? "&refresh=1" : "";
        const response = await fetch(`${ENDPOINT_URL}?t=${Date.now()}${refresh}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Sync failed with status ${response.status}`);
        }

        const rawRows = await response.json();
        const rows: FeedRow[] = Array.isArray(rawRows) ? rawRows : [];
        const lookup = buildFeedLookup(rows);
        const nextMeta = syncMetaFromHeaders(response.headers);
        const syncedAt = nextMeta.lastSuccessfulSyncAt || lastSyncAt;

        let changedCount = 0;
        const changedItems: Array<{ date: string; passType: PassType; status: StatusType }> = [];

        setFeedRows(rows);
        setSyncMeta((current) => ({
          ...current,
          ...nextMeta,
          lastAttemptedSyncAt: new Date().toISOString(),
        }));

        setWatchItems((current) =>
          current.map((item) => {
            const nextStatus = resolveStatus(item, lookup);
            const changed = nextStatus !== item.currentStatus;

            if (changed) {
              changedCount += 1;
              changedItems.push({
                date: item.date,
                passType: item.passType,
                status: nextStatus,
              });
            }

            return {
              ...item,
              previousStatus: changed ? item.currentStatus : item.previousStatus,
              currentStatus: nextStatus,
              lastCheckedAt: syncedAt || item.lastCheckedAt,
            };
          })
        );

        if (syncedAt) {
          setLastSyncAt(syncedAt);
        }

        const prefix =
          source === "manual"
            ? "Wishboard manually refreshed."
            : source === "auto"
              ? "Wishboard auto-refreshed."
              : "Wishboard refreshed.";

        const summary =
          changedCount === 0
            ? `${prefix} ${nextMeta.message}`
            : `${prefix} ${changedCount} watched ${changedCount === 1 ? "date changed" : "dates changed"}. ${nextMeta.message}`;

        setLastRunSummary(summary);

        if (logActivity && source !== "startup") {
          prependActivity(source, summary);
        }

        if (alertsEnabled && changedItems.length > 0 && canNotify() && Notification.permission === "granted") {
          const first = changedItems[0];
          const passName = PASS_TYPES.find((item) => item.id === first.passType)?.name ?? first.passType;
          const statusLabel = STATUS_META[first.status].compactLabel;

          new Notification("Magic Key update", {
            body: `${passName} • ${formatWatchDate(first.date)} • ${statusLabel}`,
          });
        }

        if (source === "manual") {
          pushToast(nextMeta.stale ? "error" : "success", nextMeta.message);
        }
      } catch {
        const message = "Disney's live sync twinkled out before we could refresh.";
        setLastRunSummary(message);

        if (logActivity && source !== "startup") {
          prependActivity("system", message);
        }

        if (source === "manual") {
          pushToast("error", message);
        }
      } finally {
        syncLockRef.current = false;
        setIsSyncing(false);
      }
    },
    [alertsEnabled, lastSyncAt, prependActivity, pushToast]
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
          PASS_TYPES.findIndex((row) => row.id === a.passType) -
            PASS_TYPES.findIndex((row) => row.id === b.passType)
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

  const addWatchItem = useCallback(async () => {
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

    let nextItem: WatchItem = {
      id: crypto.randomUUID(),
      date: dateInput,
      passType,
      preferredPark,
      currentStatus: nextStatus,
      previousStatus: null,
      lastCheckedAt: lastSyncAt,
    };

    if (sessionUser) {
      const response = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: dateInput, passType, preferredPark }),
      });

      const data = await response.json();
      if (!response.ok) {
        pushToast("error", data.error || "We couldn't save that watched date yet.");
        return;
      }

      nextItem = data.item;
    }

    setWatchItems((current) => [...current, nextItem]);
    setDisplayedMonth(monthKeyFromDate(dateInput));
    setDateInput("");

    prependActivity(
      "system",
      `Added watched date: ${formatWatchDate(nextItem.date)} • ${
        PASS_TYPES.find((item) => item.id === passType)?.name
      } • ${PARK_OPTIONS.find((item) => item.value === preferredPark)?.label}`
    );

    pushToast("success", sessionUser ? "Watched date saved to your account." : "Watched date added.");
  }, [dateInput, watchItems, passType, preferredPark, feedRows, lastSyncAt, prependActivity, pushToast, sessionUser]);

  const removeWatchItem = useCallback(
    async (id: string) => {
      const item = watchItems.find((row) => row.id === id);

      if (sessionUser) {
        await fetch(`/api/watchlist/${id}`, {
          method: "DELETE",
        });
      }

      setWatchItems((current) => current.filter((row) => row.id !== id));

      if (item) {
        prependActivity(
          "system",
          `Removed watched date: ${formatWatchDate(item.date)} • ${
            PASS_TYPES.find((row) => row.id === item.passType)?.name
          }`
        );
      }
    },
    [watchItems, prependActivity, sessionUser]
  );

  const requestNotifications = useCallback(async () => {
    if (!canNotify()) {
      pushToast("error", "Browser notifications are not available here.");
      return;
    }

    const permission = await Notification.requestPermission();

    if (permission !== "granted") {
      setAlertsEnabled(false);
      pushToast("error", "Notifications were not enabled.");
      return;
    }

    setAlertsEnabled(true);
    pushToast("success", "Browser notifications enabled.");

    if (!sessionUser || !pushPublicKey || !canUsePushManager()) {
      return;
    }

    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      const existingSubscription = await registration.pushManager.getSubscription();
      const subscription =
        existingSubscription ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(pushPublicKey),
        }));

      await fetch("/api/push-subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription),
      });

      setPushEnabled(true);
      pushToast("success", "Background push is ready for this signed-in device.");
    } catch {
      pushToast("error", "Notifications are on, but this browser could not finish push setup.");
    }
  }, [pushPublicKey, pushToast, sessionUser]);

  const requestMagicLink = useCallback(async () => {
    if (!authEmail.trim()) {
      pushToast("error", "Add your email first so we know where to send the magic link.");
      return;
    }

    const response = await fetch("/api/auth/request-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: authEmail }),
    });

    const data = await response.json();
    if (!response.ok) {
      pushToast("error", data.error || "We couldn't send the magic link yet.");
      return;
    }

    if (data.previewLink) {
      await navigator.clipboard.writeText(data.previewLink).catch(() => undefined);
      setAuthMessage("Preview mode is active, so the sign-in link was copied to your clipboard.");
      return;
    }

    setAuthMessage("Check your inbox for the sign-in link.");
    pushToast("success", "Magic link sent.");
  }, [authEmail, pushToast]);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/session", { method: "DELETE" });
    setSessionUser(null);
    setPushEnabled(false);
    setAuthMessage("");
    pushToast("success", "Signed out. Your local view is still here if you want to keep browsing.");
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
          <HeroSection
            watchCount={watchItems.length}
            lastSyncAt={lastSyncAt}
            lastRunSummary={lastRunSummary}
            syncMeta={syncMeta}
          />

          <AddWatchForm
            passType={passType}
            onPassTypeChange={setPassType}
            dateInput={dateInput}
            onDateInputChange={setDateInput}
            preferredPark={preferredPark}
            onPreferredParkChange={setPreferredPark}
            syncFrequency={syncFrequency}
            onSyncFrequencyChange={setSyncFrequency}
            onAddWatchItem={() => void addWatchItem()}
          />
        </section>

        <SummaryCards summary={summary} />

        <TabsNav activeTab={activeTab} tabs={tabs} onTabChange={setActiveTab} />

        {activeTab === "watchlist" && (
          <WatchlistSection
            alertsEnabled={alertsEnabled}
            watchItems={watchItems}
            lastRunSummary={lastRunSummary}
            isSyncing={isSyncing}
            syncFrequency={syncFrequency}
            lastSyncAt={lastSyncAt}
            onRequestNotifications={requestNotifications}
            onManualSync={() => void syncFeed("manual", true)}
            onRemoveWatchItem={(id: string) => void removeWatchItem(id)}
          />
        )}

        {activeTab === "calendar" && (
          <CalendarSection
            displayedMonth={displayedMonth}
            calendarRows={calendarRows}
            watchedByDate={watchedByDate}
            onPreviousMonth={() => setDisplayedMonth(previousMonthKey(displayedMonth))}
            onNextMonth={() => setDisplayedMonth(nextMonthKey(displayedMonth))}
          />
        )}

        {activeTab === "activity" && <ActivitySection activity={activity} />}

        {activeTab === "alerts" && (
          <AlertsSection
            user={sessionUser}
            authEmail={authEmail}
            onAuthEmailChange={setAuthEmail}
            onRequestMagicLink={() => void requestMagicLink()}
            authMessage={authMessage}
            onSignOut={() => void signOut()}
            alertsEnabled={alertsEnabled}
            pushEnabled={pushEnabled}
            requestNotifications={() => void requestNotifications()}
            emailEnabled={emailEnabled}
            onEmailEnabledChange={setEmailEnabled}
            emailAddress={emailAddress}
            onEmailAddressChange={setEmailAddress}
          />
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
