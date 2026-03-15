export type PassType = "inspire" | "believe" | "enchant" | "explore" | "imagine";
export type ParkOption = "either" | "dl" | "dca";
export type StatusType = "either" | "dl" | "dca" | "unavailable" | "blocked";
export type FrequencyType = "manual" | "1m" | "5m" | "10m" | "15m" | "30m";
export type TabKey = "watchlist" | "calendar" | "activity" | "alerts";
export type SyncSource = "manual" | "auto" | "startup";
export type SyncMode = "live-disney" | "snapshot-fallback" | "cached";

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
  details?: string[];
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

export type SessionUser = {
  id: string;
  email: string;
};

export type UserPreferences = {
  emailEnabled: boolean;
  emailAddress: string;
  alertsEnabled: boolean;
  pushEnabled: boolean;
  syncFrequency: FrequencyType;
};

export type SyncMeta = {
  lastSuccessfulSyncAt: string;
  lastAttemptedSyncAt: string;
  mode: SyncMode;
  stale: boolean;
  message: string;
  lastError: string;
};

export type DashboardUserState = {
  user: SessionUser | null;
  preferences: UserPreferences;
  watchItems: WatchItem[];
  activity: ActivityItem[];
  syncMeta: SyncMeta;
  pushPublicKey: string;
};
