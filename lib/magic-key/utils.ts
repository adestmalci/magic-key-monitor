import type { FeedRow, ImportedDisneyMember, StatusType, SyncMeta, WatchItem } from "./types";

export type CalendarCell = {
  date: string;
  day: number;
};

export function classNames(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

export function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function monthKeyFromDate(dateStr: string) {
  return dateStr.slice(0, 7);
}

export function formatWatchDate(dateStr: string) {
  const date = new Date(`${dateStr}T12:00:00`);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

export function formatSyncTime(iso: string) {
  if (!iso) return "Waiting for live sync";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatActivityTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function comparePriority(status: StatusType) {
  if (status === "either") return 4;
  if (status === "dl" || status === "dca") return 3;
  if (status === "unavailable") return 2;
  return 1;
}

export function normalizeStatus(value: string): StatusType {
  const normalized = String(value || "").trim().toLowerCase();

  if (["either", "both", "either-park", "either_park"].includes(normalized)) return "either";
  if (["dl", "disneyland"].includes(normalized)) return "dl";
  if (["dca", "californiaadventure", "california-adventure", "adventure"].includes(normalized))
    return "dca";
  if (["blocked", "blockout", "blockedout"].includes(normalized)) return "blocked";
  return "unavailable";
}

export function canNotify() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function canUsePushManager() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

export function needsIosHomeScreenNotifications() {
  if (typeof window === "undefined") return false;

  const userAgent = window.navigator.userAgent || "";
  const isAppleMobile = /iPhone|iPad|iPod/i.test(userAgent);
  const isSafari =
    /Safari/i.test(userAgent) &&
    !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|YaBrowser/i.test(userAgent);
  const standalone =
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);

  return isAppleMobile && isSafari && !standalone;
}

export function nextMonthKey(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const next = new Date(year, month, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
}

export function previousMonthKey(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const prev = new Date(year, month - 2, 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
}

export function buildMonthCalendarRows(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const leadingBlanks = firstDay.getDay();

  const cells: Array<CalendarCell | null> = [];

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

  const rows: Array<Array<CalendarCell | null>> = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }

  return rows;
}

export function buildFeedLookup(rows: FeedRow[]) {
  const lookup = new Map<string, StatusType>();

  for (const row of rows) {
    if (!row?.date || !row?.passType || !row?.preferredPark) continue;
    const key = `${row.date}__${row.passType}__${row.preferredPark}`;
    lookup.set(key, normalizeStatus(String(row.status ?? "")));
  }

  return lookup;
}

export function resolveStatus(
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

function intersectStatuses(statuses: StatusType[]): StatusType {
  if (statuses.length === 0) return "unavailable";
  if (statuses.some((status) => status === "blocked")) return "blocked";
  if (statuses.every((status) => status === "either")) return "either";

  const allowsDl = statuses.every((status) => status === "either" || status === "dl");
  const allowsDca = statuses.every((status) => status === "either" || status === "dca");

  if (allowsDl && allowsDca) return "either";
  if (allowsDl) return "dl";
  if (allowsDca) return "dca";
  return "unavailable";
}

export function resolveWatchItemStatus(
  item: Pick<WatchItem, "date" | "passType" | "preferredPark" | "selectedImportedMemberIds">,
  lookup: Map<string, StatusType>,
  importedMembers: ImportedDisneyMember[]
): StatusType {
  const selectedMemberIds = Array.isArray(item.selectedImportedMemberIds) ? item.selectedImportedMemberIds : [];
  const selectedMembers = selectedMemberIds
    .map((id) => importedMembers.find((member) => member.id === id))
    .filter(
      (member): member is ImportedDisneyMember =>
        member !== undefined && member.automatable && Boolean(member.magicKeyPassType)
    );

  if (selectedMembers.length === 0) {
    return resolveStatus(item, lookup);
  }

  return intersectStatuses(
    selectedMembers.map((member) =>
      resolveStatus(
        {
          date: item.date,
          passType: member.magicKeyPassType as WatchItem["passType"],
          preferredPark: item.preferredPark,
        },
        lookup
      )
    )
  );
}

export function syncMetaFromHeaders(headers: Headers): SyncMeta {
  const mode = headers.get("X-Magic-Key-Source");
  return {
    lastSuccessfulSyncAt: headers.get("X-Magic-Key-Last-Successful-Sync") || "",
    lastAttemptedSyncAt: headers.get("X-Magic-Key-Last-Attempted-Sync") || "",
    lastBackgroundRunAt: headers.get("X-Magic-Key-Last-Background-Run") || "",
    lastBackgroundRunMessage: headers.get("X-Magic-Key-Last-Background-Message") || "",
    lastWorkerPollAt: headers.get("X-Magic-Key-Last-Worker-Poll") || "",
    lastWorkerPollMessage: headers.get("X-Magic-Key-Last-Worker-Message") || "",
    mode: mode === "live-disney" || mode === "snapshot-fallback" || mode === "cached" ? mode : "snapshot-fallback",
    stale: headers.get("X-Magic-Key-Stale") === "1",
    message: headers.get("X-Magic-Key-Status") || "Pixie dust is standing by for the next live sync.",
    lastError: "",
  };
}

export function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}
