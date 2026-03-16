"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AddWatchForm } from "../components/magic-key/add-watch-form";
import { ActivitySection } from "../components/magic-key/activity-section";
import { AlertsSection } from "../components/magic-key/alerts-section";
import { CalendarSection } from "../components/magic-key/calendar-section";
import { HeroSection } from "../components/magic-key/hero-section";
import { MickeyRain } from "../components/magic-key/mickey-rain";
import { ReservationAssistSection } from "../components/magic-key/reservation-assist-section";
import { TabsNav } from "../components/magic-key/tabs-nav";
import { WatchlistSection } from "../components/magic-key/watchlist-section";
import { ENDPOINT_URL, FREQUENCIES, normalizeSupportedFrequency, PARK_OPTIONS, PASS_TYPES, POLL_MS, STATUS_META, STORAGE_KEY } from "../lib/magic-key/config";
import type {
  ActivityItem,
  BookingMode,
  DashboardUserState,
  ImportedDisneyMember,
  FeedRow,
  FrequencyType,
  ParkOption,
  PassType,
  PlannerHubConnectionState,
  PlannerHubBookingState,
  ReservationAssistState,
  SessionUser,
  StatusType,
  SyncMeta,
  SyncSource,
  TabKey,
  ToastState,
  WatchItem,
} from "../lib/magic-key/types";
import { createDefaultPlannerHubBooking, createDefaultReservationAssist } from "../lib/magic-key/types";
import {
  buildMonthCalendarRows,
  buildFeedLookup,
  canNotify,
  canUsePushManager,
  classNames,
  currentMonthKey,
  formatWatchDate,
  monthKeyFromDate,
  needsIosHomeScreenNotifications,
  nextMonthKey,
  normalizeStatus,
  previousMonthKey,
  resolveWatchItemStatus,
  syncMetaFromHeaders,
  urlBase64ToUint8Array,
} from "../lib/magic-key/utils";
import { createDefaultPlannerHubConnection } from "../lib/magic-key/types";

const DEFAULT_SYNC_META: SyncMeta = {
  lastSuccessfulSyncAt: "",
  lastAttemptedSyncAt: "",
  lastBackgroundRunAt: "",
  lastBackgroundRunMessage: "",
  lastWorkerPollAt: "",
  lastWorkerPollMessage: "",
  mode: "snapshot-fallback",
  stale: false,
  message: "Ready to sync Disney data.",
  lastError: "",
};
const ACTIVITY_RETENTION_MS = 1000 * 60 * 60 * 6;
const ACTIVITY_PRUNE_INTERVAL_MS = 1000 * 60;

function pruneActivityItems(items: ActivityItem[], now = Date.now()) {
  return items
    .filter((item) => {
      const createdAt = Date.parse(item.createdAt);
      if (!Number.isFinite(createdAt)) return false;
      return now - createdAt <= ACTIVITY_RETENTION_MS;
    })
    .slice(0, 40);
}

export default function Home() {
  const [hydrated, setHydrated] = useState(false);
  const [hasStartedInitialSync, setHasStartedInitialSync] = useState(false);
  const [hasLoadedServerState, setHasLoadedServerState] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("watchlist");

  const [passType, setPassType] = useState<PassType>("enchant");
  const [preferredPark, setPreferredPark] = useState<ParkOption>("either");
  const [syncFrequency, setSyncFrequency] = useState<FrequencyType>("5m");

  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [emailAddress, setEmailAddress] = useState("");
  const [reservationAssist, setReservationAssist] = useState<ReservationAssistState>(createDefaultReservationAssist());
  const [plannerHubBooking, setPlannerHubBooking] = useState<PlannerHubBookingState>(createDefaultPlannerHubBooking());
  const [plannerHubConnection, setPlannerHubConnection] = useState<PlannerHubConnectionState>(createDefaultPlannerHubConnection());
  const [importedDisneyMembers, setImportedDisneyMembers] = useState<ImportedDisneyMember[]>([]);
  const [authEmail, setAuthEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [pushPublicKey, setPushPublicKey] = useState("");
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);
  const [isSendingTestPush, setIsSendingTestPush] = useState(false);
  const [accountSaveState, setAccountSaveState] = useState<"local" | "saving" | "saved" | "error">("local");
  const [accountSaveMessage, setAccountSaveMessage] = useState("This wishboard is currently local to this browser.");

  const [dateInput, setDateInput] = useState("");
  const [watchItems, setWatchItems] = useState<WatchItem[]>([]);
  const [feedRows, setFeedRows] = useState<FeedRow[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState("");
  const [lastRunSummary, setLastRunSummary] = useState("Ready to sync Disney data.");
  const [syncMeta, setSyncMeta] = useState<SyncMeta>(DEFAULT_SYNC_META);
  const [displayedMonth, setDisplayedMonth] = useState(currentMonthKey());
  const [pickerMonth, setPickerMonth] = useState(currentMonthKey());
  const [toast, setToast] = useState<ToastState>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const syncLockRef = useRef(false);
  const watchItemsRef = useRef<WatchItem[]>([]);
  const alertsEnabledRef = useRef(false);
  const lastSyncAtRef = useRef("");
  const sessionUserRef = useRef<SessionUser | null>(null);
  const importedLocalRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const passTypeSyncReadyRef = useRef(false);

  useEffect(() => {
    watchItemsRef.current = watchItems;
  }, [watchItems]);

  useEffect(() => {
    alertsEnabledRef.current = alertsEnabled;
  }, [alertsEnabled]);

  useEffect(() => {
    lastSyncAtRef.current = lastSyncAt;
  }, [lastSyncAt]);

  useEffect(() => {
    sessionUserRef.current = sessionUser;
  }, [sessionUser]);

  const pushToast = useCallback((kind: "success" | "error", message: string) => {
    setToast({ kind, message });
    window.clearTimeout((window as Window & { __toastTimer?: number }).__toastTimer);
    (window as Window & { __toastTimer?: number }).__toastTimer = window.setTimeout(() => {
      setToast(null);
    }, 3500);
  }, []);

  const prependActivity = useCallback(
    (source: SyncSource | "system", message: string, details?: string[], trigger?: string) => {
    setActivity((current) =>
      pruneActivityItems([
        {
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          source,
          trigger,
          message,
          details,
        },
        ...current,
      ])
    );
    },
    []
  );

  const needsIosInstallForNotifications = needsIosHomeScreenNotifications();
  const notificationsSupported = canNotify();
  const notificationsGranted = notificationsSupported && Notification.permission === "granted";
  const notificationsStatusMessage = !notificationsSupported
    ? needsIosInstallForNotifications
      ? "On iPhone, add this site to your Home Screen to enable notifications."
      : "This browser does not support notifications."
    : notificationsGranted
      ? "Permission granted on this browser"
      : "Permission not granted yet";
  const notificationsHelpText = needsIosInstallForNotifications
    ? "Open this site in Safari, tap Share, choose Add to Home Screen, then open it from your Home Screen and try again."
    : "";

  const applyDashboardState = useCallback((data: DashboardUserState) => {
    setSessionUser(data.user);
    setPushPublicKey(data.pushPublicKey || "");
    setSyncMeta(data.syncMeta || DEFAULT_SYNC_META);
    setReservationAssist(data.reservationAssist || createDefaultReservationAssist(data.user?.email || ""));
    setPlannerHubBooking(data.plannerHubBooking || createDefaultPlannerHubBooking());
    setPlannerHubConnection(data.plannerHubConnection || createDefaultPlannerHubConnection(data.user?.email || ""));
    setImportedDisneyMembers(Array.isArray(data.importedDisneyMembers) ? data.importedDisneyMembers : []);

    if (data.syncMeta?.lastSuccessfulSyncAt) {
      setLastSyncAt(data.syncMeta.lastSuccessfulSyncAt);
      setLastRunSummary(data.syncMeta.message || "Ready to sync Disney data.");
    }

    if (data.user) {
      setAlertsEnabled(data.preferences.alertsEnabled);
      setPushEnabled(data.preferences.pushEnabled);
      setEmailEnabled(data.preferences.emailEnabled);
      setEmailAddress(data.preferences.emailAddress || data.user.email);
      setSyncFrequency(normalizeSupportedFrequency(data.preferences.syncFrequency));
      setAuthEmail(data.user.email);
      setWatchItems(data.watchItems);
      setActivity(pruneActivityItems(data.activity || []));
      setAccountSaveState("saved");
      setAccountSaveMessage(`Account settings are synced for ${data.user.email}.`);
    } else {
      setReservationAssist((current) => ({
        ...createDefaultReservationAssist(),
        ...current,
      }));
      setPlannerHubBooking(createDefaultPlannerHubBooking());
      setPlannerHubConnection(createDefaultPlannerHubConnection());
      setImportedDisneyMembers([]);
      setAccountSaveState("local");
      setAccountSaveMessage("This wishboard is currently local to this browser.");
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
      setSyncFrequency(normalizeSupportedFrequency(parsed.syncFrequency));
      setAlertsEnabled(parsed.alertsEnabled ?? false);
      setEmailEnabled(parsed.emailEnabled ?? false);
      setEmailAddress(parsed.emailAddress ?? "");
      setReservationAssist(
        parsed.reservationAssist
          ? {
              ...createDefaultReservationAssist(parsed.reservationAssist?.plannerHubEmail ?? ""),
              ...parsed.reservationAssist,
            }
          : createDefaultReservationAssist()
      );
      setPlannerHubBooking(
        parsed.plannerHubBooking
          ? {
              ...createDefaultPlannerHubBooking(),
              ...parsed.plannerHubBooking,
            }
          : createDefaultPlannerHubBooking()
      );
      setPlannerHubConnection(
        parsed.plannerHubConnection
          ? {
              ...createDefaultPlannerHubConnection(parsed.plannerHubConnection?.disneyEmail ?? ""),
              ...parsed.plannerHubConnection,
            }
          : createDefaultPlannerHubConnection()
      );
      setImportedDisneyMembers(Array.isArray(parsed.importedDisneyMembers) ? parsed.importedDisneyMembers : []);
      setFeedRows(parsed.feedRows ?? []);
      setActivity(pruneActivityItems(Array.isArray(parsed.activity) ? parsed.activity : []));
      setLastSyncAt(parsed.lastSyncAt ?? "");
      setLastRunSummary(parsed.lastRunSummary ?? "Ready to sync Disney data.");
      setDisplayedMonth(parsed.displayedMonth ?? currentMonthKey());
      setPickerMonth(parsed.pickerMonth ?? parsed.displayedMonth ?? currentMonthKey());

      const nextWatchItems = Array.isArray(parsed.watchItems)
        ? parsed.watchItems.map((item: WatchItem & { changedAt?: string }) => ({
            ...item,
            previousStatus: item.previousStatus ?? null,
            currentStatus: normalizeStatus(String(item.currentStatus)),
            lastCheckedAt: item.lastCheckedAt ?? item.changedAt ?? parsed.lastSyncAt ?? "",
            plannerHubId: item.plannerHubId || "primary",
            selectedImportedMemberIds: Array.isArray(item.selectedImportedMemberIds)
              ? item.selectedImportedMemberIds.filter((value): value is string => typeof value === "string")
              : [],
            bookingMode: (item.bookingMode as BookingMode) === "watch_and_attempt" ? "watch_and_attempt" : "watch_only",
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

    const activityToPersist = pruneActivityItems(activity);
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
        reservationAssist,
        plannerHubBooking,
        plannerHubConnection,
        importedDisneyMembers,
        watchItems,
        feedRows,
        activity: activityToPersist,
        lastSyncAt,
        lastRunSummary,
        displayedMonth,
        pickerMonth,
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
    reservationAssist,
    plannerHubBooking,
    plannerHubConnection,
    importedDisneyMembers,
    watchItems,
    feedRows,
    activity,
    lastSyncAt,
    lastRunSummary,
    displayedMonth,
    pickerMonth,
    hydrated,
  ]);

  useEffect(() => {
    if (!hydrated) return;

    const interval = window.setInterval(() => {
      setActivity((current) => pruneActivityItems(current));
    }, ACTIVITY_PRUNE_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [hydrated]);

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

    setAccountSaveState("saving");
    setAccountSaveMessage(`Saving account preferences for ${sessionUser.email}...`);

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      void fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailEnabled,
          emailAddress,
          alertsEnabled,
          pushEnabled,
          syncFrequency,
          reservationAssist,
          plannerHubBooking,
          plannerHubConnection,
          importedDisneyMembers,
        }),
      })
        .then(async (response) => {
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(data.error || "We couldn't save your account settings.");
          }

          setAccountSaveState("saved");
          setAccountSaveMessage(`Account settings are synced for ${sessionUser.email}.`);
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "We couldn't save your account settings.";
          setAccountSaveState("error");
          setAccountSaveMessage(message);
        });
    }, 300);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [hydrated, hasLoadedServerState, sessionUser, emailEnabled, emailAddress, alertsEnabled, pushEnabled, syncFrequency, reservationAssist, plannerHubBooking, plannerHubConnection, importedDisneyMembers]);

  const syncFeed = useCallback(
    async (source: SyncSource = "manual", logActivity = true, trigger = "") => {
      if (syncLockRef.current) return;

      syncLockRef.current = true;
      setIsSyncing(true);

      try {
        const refresh = source === "manual" || !logActivity ? "&refresh=1" : "";
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
        const attemptedAt = nextMeta.lastAttemptedSyncAt || new Date().toISOString();
        const syncedAt = nextMeta.lastSuccessfulSyncAt || lastSyncAtRef.current;

        let changedCount = 0;
        const changedItems: Array<{
          date: string;
          passType: PassType;
          status: StatusType;
          previousStatus: StatusType;
        }> = [];

        setFeedRows(rows);
        setSyncMeta((current) => ({
          ...current,
          ...nextMeta,
          lastAttemptedSyncAt: new Date().toISOString(),
        }));

        setWatchItems((current) =>
          current.map((item) => {
            const nextStatus = resolveWatchItemStatus(item, lookup, importedDisneyMembers);
            const changed = nextStatus !== item.currentStatus;

            if (changed) {
              changedCount += 1;
              changedItems.push({
                date: item.date,
                passType: item.passType,
                status: nextStatus,
                previousStatus: item.currentStatus,
              });
            }

            return {
              ...item,
              previousStatus: changed ? item.currentStatus : item.previousStatus,
              currentStatus: nextStatus,
              lastCheckedAt: attemptedAt || syncedAt || item.lastCheckedAt,
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
        const activityDetails = changedItems.map((item) => {
          const passName = PASS_TYPES.find((row) => row.id === item.passType)?.name ?? item.passType;
          return `${passName} • ${formatWatchDate(item.date)} • ${STATUS_META[item.previousStatus].compactLabel} -> ${STATUS_META[item.status].compactLabel}`;
        });

        setLastRunSummary(summary);

        if (logActivity && source !== "startup") {
          prependActivity(source, summary, activityDetails, trigger);

          if (sessionUserRef.current && source === "manual") {
            void fetch("/api/activity", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                source,
                trigger,
                message: summary,
                details: activityDetails,
              }),
            }).catch(() => undefined);
          }
        }

        if (alertsEnabledRef.current && changedItems.length > 0 && canNotify() && Notification.permission === "granted") {
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
          prependActivity("system", message, [], trigger || "Sync request failed");

          if (sessionUserRef.current && source === "manual") {
            void fetch("/api/activity", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                source: "system",
                trigger: trigger || "Sync request failed",
                message,
                details: [],
              }),
            }).catch(() => undefined);
          }
        }

        if (source === "manual") {
          pushToast("error", message);
        }
      } finally {
        syncLockRef.current = false;
        setIsSyncing(false);
      }
    },
    [importedDisneyMembers, prependActivity, pushToast]
  );

  useEffect(() => {
    if (!hydrated || hasStartedInitialSync) return;
    setHasStartedInitialSync(true);
    void syncFeed("startup", false, "Initial page load");
  }, [hydrated, hasStartedInitialSync, syncFeed]);

  useEffect(() => {
    if (!hydrated || syncFrequency === "manual") return;
    const frequencyLabel =
      FREQUENCIES.find((row) => row.value === syncFrequency)?.label.toLowerCase() ?? "scheduled refresh";

    const interval = window.setInterval(() => {
      void syncFeed("auto", watchItemsRef.current.length > 0, `Scheduled ${frequencyLabel}`);
    }, POLL_MS[syncFrequency]);

    return () => window.clearInterval(interval);
  }, [hydrated, syncFrequency, syncFeed]);

  useEffect(() => {
    if (!hydrated) return;
    if (!passTypeSyncReadyRef.current) {
      passTypeSyncReadyRef.current = true;
      return;
    }
    if (document.visibilityState !== "visible") return;
    void syncFeed("auto", false, "Selected key changed");
  }, [hydrated, passType, syncFeed]);

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

  const pickerStatusByDate = useMemo(() => {
    const next = new Map<string, StatusType>();

    for (const row of feedRows) {
      if (row.passType !== passType || row.preferredPark !== "either") continue;
      next.set(row.date, normalizeStatus(String(row.status)));
    }

    return next;
  }, [feedRows, passType]);

  const pickerMonthBounds = useMemo(() => {
    const months = Array.from(pickerStatusByDate.keys()).map((date) => date.slice(0, 7)).sort();
    const fallback = currentMonthKey();

    return {
      min: months[0] ?? fallback,
      max: months[months.length - 1] ?? fallback,
    };
  }, [pickerStatusByDate]);

  useEffect(() => {
    if (pickerMonth < pickerMonthBounds.min) {
      setPickerMonth(pickerMonthBounds.min);
      return;
    }

    if (pickerMonth > pickerMonthBounds.max) {
      setPickerMonth(pickerMonthBounds.max);
    }
  }, [pickerMonth, pickerMonthBounds]);

  const selectedDateStatus = useMemo(() => {
    if (!dateInput) return null;
    return pickerStatusByDate.get(dateInput) ?? null;
  }, [dateInput, pickerStatusByDate]);

  const pickerRows = useMemo(() => {
    return buildMonthCalendarRows(pickerMonth).map((row) =>
      row.map((cell) => {
        if (!cell) return null;

        const status = pickerStatusByDate.get(cell.date) ?? "unavailable";

        return {
          ...cell,
          status,
          disabled: status === "blocked",
          selected: cell.date === dateInput,
        };
      })
    );
  }, [pickerMonth, pickerStatusByDate, dateInput]);

  const calendarRows = useMemo(() => {
    return buildMonthCalendarRows(displayedMonth);
  }, [displayedMonth]);

  const addWatchItemFromSelection = useCallback(async ({
    date,
    passType,
    preferredPark,
    syncFrequency: nextFrequency,
  }: {
    date: string;
    passType: PassType;
    preferredPark: ParkOption;
    syncFrequency: FrequencyType;
  }) => {
    if (!date) {
      pushToast("error", "Choose a date first.");
      return;
    }

    if (nextFrequency !== syncFrequency) {
      setSyncFrequency(nextFrequency);
    }

    const duplicate = watchItems.some(
      (item) =>
        item.date === date && item.passType === passType && item.preferredPark === preferredPark
    );

    if (duplicate) {
      pushToast("error", "That watched date already exists.");
      return;
    }

    const lookup = buildFeedLookup(feedRows);
    const nextStatus = resolveWatchItemStatus(
      {
        date,
        passType,
        preferredPark,
        selectedImportedMemberIds: [],
      },
      lookup,
      importedDisneyMembers
    );

    if (nextStatus === "blocked") {
      pushToast("error", "That date is blocked out for the selected key.");
      return;
    }

    let nextItem: WatchItem = {
      id: crypto.randomUUID(),
      date,
      passType,
      preferredPark,
      currentStatus: nextStatus,
      previousStatus: null,
      lastCheckedAt: lastSyncAt,
      plannerHubId: "primary",
      selectedImportedMemberIds: [],
      bookingMode: "watch_only",
    };

    if (sessionUser) {
      const response = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, passType, preferredPark }),
      });

      const data = await response.json();
      if (!response.ok) {
        pushToast("error", data.error || "We couldn't save that watched date yet.");
        return;
      }

      nextItem = data.item;
      setAccountSaveState("saved");
      setAccountSaveMessage(`Wishboard changes are saved to ${sessionUser.email}.`);
    }

    setWatchItems((current) => [...current, nextItem]);
    setDisplayedMonth(monthKeyFromDate(date));
    setDateInput("");

    prependActivity(
      "system",
      `Added watched date: ${formatWatchDate(nextItem.date)} • ${
        PASS_TYPES.find((item) => item.id === passType)?.name
      } • ${PARK_OPTIONS.find((item) => item.value === preferredPark)?.label}`,
      [`Check frequency • ${nextFrequency}`]
    );

    if (sessionUser) {
      void fetch("/api/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "system",
          message: `Added watched date: ${formatWatchDate(nextItem.date)} • ${
            PASS_TYPES.find((item) => item.id === passType)?.name
          } • ${PARK_OPTIONS.find((item) => item.value === preferredPark)?.label}`,
          details: [`Check frequency • ${nextFrequency}`],
        }),
      }).catch(() => undefined);
    }

    pushToast("success", sessionUser ? "Watched date saved to your account." : "Watched date added.");
  }, [feedRows, importedDisneyMembers, lastSyncAt, prependActivity, pushToast, sessionUser, syncFrequency, watchItems]);

  const addWatchItem = useCallback(async () => {
    await addWatchItemFromSelection({
      date: dateInput,
      passType,
      preferredPark,
      syncFrequency,
    });
  }, [addWatchItemFromSelection, dateInput, passType, preferredPark, syncFrequency]);

  const removeWatchItem = useCallback(
    async (id: string) => {
      const item = watchItems.find((row) => row.id === id);

      if (sessionUser) {
        const response = await fetch(`/api/watchlist/${id}`, {
          method: "DELETE",
        });
        if (!response.ok) {
          pushToast("error", "We couldn't remove that watched date from your account yet.");
          setAccountSaveState("error");
          setAccountSaveMessage("A saved wishboard change did not reach your account.");
          return;
        }
        setAccountSaveState("saved");
        setAccountSaveMessage(`Wishboard changes are saved to ${sessionUser.email}.`);
      }

      setWatchItems((current) => current.filter((row) => row.id !== id));

      if (item) {
        prependActivity(
          "system",
          `Removed watched date: ${formatWatchDate(item.date)} • ${
            PASS_TYPES.find((row) => row.id === item.passType)?.name
          }`
        );

        if (sessionUser) {
          void fetch("/api/activity", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              source: "system",
              message: `Removed watched date: ${formatWatchDate(item.date)} • ${
                PASS_TYPES.find((row) => row.id === item.passType)?.name
              }`,
              details: [],
            }),
          }).catch(() => undefined);
        }
      }
    },
    [watchItems, prependActivity, pushToast, sessionUser]
  );

  const updateWatchItemBooking = useCallback(
    async (
      id: string,
      patch: Partial<Pick<WatchItem, "plannerHubId" | "selectedImportedMemberIds" | "bookingMode">>
    ) => {
      const applyLocal = (item: WatchItem) => {
        const nextItem = {
          ...item,
          plannerHubId: patch.plannerHubId ?? item.plannerHubId,
          selectedImportedMemberIds: patch.selectedImportedMemberIds ?? item.selectedImportedMemberIds,
          bookingMode: patch.bookingMode ?? item.bookingMode,
        };

        return {
          ...nextItem,
          currentStatus: resolveWatchItemStatus(nextItem, buildFeedLookup(feedRows), importedDisneyMembers),
        };
      };

      if (sessionUser) {
        const response = await fetch(`/api/watchlist/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          pushToast("error", data.error || "We couldn't update that booking target yet.");
          setAccountSaveState("error");
          setAccountSaveMessage("A booking-target change did not reach your account.");
          return;
        }

        setWatchItems((current) => current.map((item) => (item.id === id ? data.item : item)));
        setAccountSaveState("saved");
        setAccountSaveMessage(`Wishboard changes are saved to ${sessionUser.email}.`);
        return;
      }

      setWatchItems((current) => current.map((item) => (item.id === id ? applyLocal(item) : item)));
    },
    [feedRows, importedDisneyMembers, pushToast, sessionUser]
  );

  const connectDisneyPlannerHub = useCallback(
    async (disneyEmail: string, password: string) => {
      if (!sessionUser) {
        pushToast("error", "Sign in first so the Disney planner hub can stay connected to your account.");
        return false;
      }

      const response = await fetch("/api/disney/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disneyEmail, password }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        pushToast("error", data.error || "We couldn't queue the Disney connection.");
        return false;
      }

      setAccountSaveState("saved");
      setAccountSaveMessage(`Disney planner hub is queued for ${sessionUser.email}.`);
      await loadDashboardState();
      pushToast("success", "Disney connection queued. The worker will capture the session and import connected members.");
      return true;
    },
    [loadDashboardState, pushToast, sessionUser]
  );

  const importConnectedDisneyMembers = useCallback(async () => {
    if (!sessionUser) {
      pushToast("error", "Sign in first so the Disney member import can stay tied to your account.");
      return false;
    }

    const response = await fetch("/api/disney/import", {
      method: "POST",
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      pushToast("error", data.error || "We couldn't queue the Disney member import.");
      return false;
    }

    setAccountSaveState("saved");
    setAccountSaveMessage(`Disney import is queued for ${sessionUser.email}.`);
    await loadDashboardState();
    pushToast("success", "Disney member import queued.");
    return true;
  }, [loadDashboardState, pushToast, sessionUser]);

  const resetDisneyPlannerHub = useCallback(async () => {
    if (!sessionUser) {
      pushToast("error", "Sign in first so the Disney planner hub reset stays tied to your account.");
      return false;
    }

    const response = await fetch("/api/disney/reset", {
      method: "POST",
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      pushToast("error", data.error || "We couldn't reset the Disney planner hub yet.");
      return false;
    }

    await loadDashboardState();
    pushToast("success", "Disney planner hub reset.");
    return true;
  }, [loadDashboardState, pushToast, sessionUser]);

  const syncPushSubscription = useCallback(
    async (createIfMissing: boolean) => {
      if (!sessionUser || !pushPublicKey || !canUsePushManager()) {
        return false;
      }

      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;

        let subscription = await registration.pushManager.getSubscription();
        if (!subscription && createIfMissing) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(pushPublicKey),
          });
        }

        if (!subscription) {
          setPushEnabled(false);
          return false;
        }

        const response = await fetch("/api/push-subscriptions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(subscription),
        });

        if (!response.ok) {
          throw new Error("Push subscription sync failed.");
        }

        setPushEnabled(true);
        setAlertsEnabled(true);
        return true;
      } catch {
        setPushEnabled(false);
        return false;
      }
    },
    [pushPublicKey, sessionUser]
  );

  const requestNotifications = useCallback(async () => {
    if (!canNotify()) {
      pushToast(
        "error",
        needsIosHomeScreenNotifications()
          ? "On iPhone, add this site to your Home Screen in Safari, then open it there to enable notifications."
          : "Browser notifications are not available here."
      );
      return;
    }

    const permission = await Notification.requestPermission();

    if (permission !== "granted") {
      setAlertsEnabled(false);
      pushToast("error", "Notifications were not enabled.");
      return;
    }

    setAlertsEnabled(true);

    if (!sessionUser || !pushPublicKey || !canUsePushManager()) {
      pushToast("success", "Browser notifications enabled.");
      return;
    }

    const synced = await syncPushSubscription(true);
    if (synced) {
      pushToast("success", "Background push is ready for this signed-in device.");
      return;
    }

    pushToast("success", "Browser notifications are enabled. Background push still needs this device to finish setup.");
  }, [pushPublicKey, pushToast, sessionUser, syncPushSubscription]);

  useEffect(() => {
    if (!sessionUser || !pushPublicKey || !canUsePushManager()) return;
    if (!canNotify() || Notification.permission !== "granted") return;
    void syncPushSubscription(false);
  }, [pushPublicKey, sessionUser, syncPushSubscription]);

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
      setAuthMessage(data.error || "We couldn't send the magic link yet.");
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
    if (sessionUser && canUsePushManager()) {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = await registration?.pushManager.getSubscription();

        if (subscription) {
          await fetch("/api/push-subscriptions", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: subscription.endpoint }),
          });
          await subscription.unsubscribe().catch(() => undefined);
        }
      } catch {
        // Best-effort cleanup for the current device.
      }
    }

    await fetch("/api/auth/session", { method: "DELETE" });
    setSessionUser(null);
    setPushEnabled(false);
    setAuthMessage("");
    setAccountSaveState("local");
    setAccountSaveMessage("This wishboard is now local to this browser.");
    pushToast("success", "Signed out. Your local view is still here if you want to keep browsing.");
  }, [pushToast, sessionUser]);

  const sendTestEmail = useCallback(async () => {
    setIsSendingTestEmail(true);

    try {
      const response = await fetch("/api/test-email", {
        method: "POST",
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        pushToast("error", data.error || "We couldn't send the test email.");
        return;
      }

      pushToast("success", data.preview ? "Preview email generated successfully." : data.message || "Test email sent.");
    } finally {
      setIsSendingTestEmail(false);
    }
  }, [pushToast]);

  const sendTestPush = useCallback(async () => {
    setIsSendingTestPush(true);

    try {
      const response = await fetch("/api/test-push", {
        method: "POST",
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        pushToast("error", data.error || "We couldn't send the test push.");
        return;
      }

      pushToast("success", data.message || "Test push sent.");
    } finally {
      setIsSendingTestPush(false);
    }
  }, [pushToast]);

  const tabs: Array<{ id: TabKey; label: string }> = [
    { id: "watchlist", label: "Watchlist" },
    { id: "calendar", label: "Calendar" },
    { id: "activity", label: "Activity" },
    { id: "reserve", label: "Reserve" },
    { id: "alerts", label: "Account" },
  ];

  return (
    <main className="relative min-h-screen bg-transparent text-zinc-950">
      <MickeyRain />
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-8 md:px-8 lg:px-10">
        <section>
          <HeroSection />
        </section>

        <section>
          <AddWatchForm
            passType={passType}
            onPassTypeChange={setPassType}
            dateInput={dateInput}
            onDateInputChange={setDateInput}
            preferredPark={preferredPark}
            onPreferredParkChange={setPreferredPark}
            syncFrequency={syncFrequency}
            onSyncFrequencyChange={setSyncFrequency}
            pickerMonth={pickerMonth}
            pickerRows={pickerRows}
            selectedDateStatus={selectedDateStatus}
            canGoPreviousMonth={pickerMonth > pickerMonthBounds.min}
            canGoNextMonth={pickerMonth < pickerMonthBounds.max}
            onPreviousMonth={() => setPickerMonth(previousMonthKey(pickerMonth))}
            onNextMonth={() => setPickerMonth(nextMonthKey(pickerMonth))}
            watchCount={watchItems.length}
            summary={summary}
            lastSyncAt={lastSyncAt}
            syncMeta={syncMeta}
            onAddWatchItem={() => void addWatchItem()}
          />
        </section>

        <TabsNav activeTab={activeTab} tabs={tabs} onTabChange={setActiveTab} />

        {activeTab === "watchlist" && (
          <WatchlistSection
            watchItems={watchItems}
            lastRunSummary={lastRunSummary}
            isSyncing={isSyncing}
            syncFrequency={syncFrequency}
            lastSyncAt={lastSyncAt}
            sessionEmail={sessionUser?.email ?? null}
            saveStatus={{ state: accountSaveState, message: accountSaveMessage }}
            onManualSync={() => void syncFeed("manual", true, "Manual sync button")}
            onRemoveWatchItem={(id: string) => void removeWatchItem(id)}
          />
        )}

        {activeTab === "calendar" && (
          <CalendarSection
            displayedMonth={displayedMonth}
            calendarRows={calendarRows}
            watchedByDate={watchedByDate}
            defaultPassType={passType}
            defaultPreferredPark={preferredPark}
            defaultSyncFrequency={syncFrequency}
            onQuickWatch={(payload) => void addWatchItemFromSelection(payload)}
            onPreviousMonth={() => setDisplayedMonth(previousMonthKey(displayedMonth))}
            onNextMonth={() => setDisplayedMonth(nextMonthKey(displayedMonth))}
          />
        )}

        {activeTab === "activity" && <ActivitySection activity={activity} />}

        {activeTab === "reserve" && (
          <ReservationAssistSection
            reservationAssist={reservationAssist}
            plannerHubBooking={plannerHubBooking}
            plannerHubConnection={plannerHubConnection}
            importedDisneyMembers={importedDisneyMembers}
            syncMeta={syncMeta}
            sessionUser={sessionUser}
            watchItems={watchItems}
            feedRows={feedRows}
            onReservationAssistChange={(patch) =>
              setReservationAssist((current) => ({
                ...current,
                ...patch,
              }))
            }
            onPlannerHubBookingChange={(patch) =>
              setPlannerHubBooking((current) => ({
                ...current,
                ...patch,
              }))
            }
            onPlannerHubConnectionChange={(patch) =>
              setPlannerHubConnection((current) => ({
                ...current,
                ...patch,
              }))
            }
            onWatchItemBookingChange={(id, patch) => void updateWatchItemBooking(id, patch)}
            onConnectDisney={(disneyEmail, password) => connectDisneyPlannerHub(disneyEmail, password)}
            onImportConnectedMembers={() => importConnectedDisneyMembers()}
            onResetDisneyConnection={() => resetDisneyPlannerHub()}
            onRefreshState={() => void loadDashboardState()}
          />
        )}

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
            notificationsSupported={notificationsSupported}
            notificationsGranted={notificationsGranted}
            notificationsStatusMessage={notificationsStatusMessage}
            notificationsHelpText={notificationsHelpText}
            pushSupported={canUsePushManager()}
            pushConfigured={Boolean(pushPublicKey)}
            isSendingTestEmail={isSendingTestEmail}
            isSendingTestPush={isSendingTestPush}
            accountSaveStatus={{ state: accountSaveState, message: accountSaveMessage }}
            onEmailEnabledChange={setEmailEnabled}
            emailAddress={emailAddress}
            onEmailAddressChange={setEmailAddress}
            onSendTestEmail={() => void sendTestEmail()}
            onSendTestPush={() => void sendTestPush()}
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
