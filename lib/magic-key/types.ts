export type PassType = "inspire" | "believe" | "enchant" | "explore" | "imagine";
export type ParkOption = "either" | "dl" | "dca";
export type StatusType = "either" | "dl" | "dca" | "unavailable" | "blocked";
export type FrequencyType = "manual" | "1m" | "5m" | "10m" | "15m" | "30m";
export type TabKey = "watchlist" | "calendar" | "activity" | "alerts";
export type SyncSource = "manual" | "auto" | "startup";

export type FeedRow = {
  date: string;
  passType: PassType;
  preferredPark: ParkOption;
  status: StatusType | string;
};

export type WatchItem = {
  id: string;
  date: string;
  passType: PassType;
  preferredPark: ParkOption;
  currentStatus: StatusType;
  previousStatus: StatusType | null;
  lastCheckedAt: string;
};

export type ActivityItem = {
  id: string;
  createdAt: string;
  source: SyncSource | "system";
  message: string;
};

export type ToastState = {
  kind: "success" | "error";
  message: string;
} | null;

export type SummaryCounts = {
  available: number;
  unavailable: number;
  blocked: number;
};
