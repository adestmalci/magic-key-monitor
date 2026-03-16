export type PassType = "inspire" | "believe" | "enchant" | "explore" | "imagine";
export type ParkOption = "either" | "dl" | "dca";
export type StatusType = "either" | "dl" | "dca" | "unavailable" | "blocked";
export type FrequencyType = "manual" | "1m" | "5m" | "10m" | "15m" | "30m";
export type TabKey = "watchlist" | "calendar" | "activity" | "reserve" | "alerts";
export type SyncSource = "manual" | "auto" | "startup";
export type SyncMode = "live-disney" | "snapshot-fallback" | "cached";
export type ReservationSessionStatus = "unknown" | "checking" | "connected" | "needs_login" | "expired";
export type ReservationHandoffOutcome =
  | ""
  | "worked"
  | "needed_login"
  | "party_mismatch"
  | "flow_changed";
export type BookingMode = "watch_only" | "watch_and_attempt";
export type PlannerHubBookingStatus =
  | "idle"
  | "armed"
  | "paused_login"
  | "paused_mismatch"
  | "attempting"
  | "booked"
  | "failed";
export type DisneyPlannerConnectionStatus =
  | "disconnected"
  | "pending_connect"
  | "connected"
  | "importing"
  | "paused_login"
  | "paused_mismatch"
  | "failed";
export type DisneyWorkerJobType = "connect" | "import" | "booking";
export type DisneyEntitlementType = "magic_key" | "ticket_holder";

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
  plannerHubId: string;
  selectedImportedMemberIds: string[];
  bookingMode: BookingMode;
};

export type ActivityItem = {
  id: string;
  createdAt: string;
  source: SyncSource | "system";
  trigger?: string;
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

export type ReservationAssistState = {
  plannerHubEmail: string;
  plannerHubLabel: string;
  sessionStatus: ReservationSessionStatus;
  lastVerifiedAt: string;
  lastVerifiedFlowNote: string;
  lastHandoffAt: string;
  lastHandoffTargetLabel: string;
  lastHandoffOutcome: ReservationHandoffOutcome;
  mixedKeyRuleConfirmed: boolean;
  plannerHubConfirmed: boolean;
  partyProofCaptured: boolean;
  flowProofCaptured: boolean;
  confirmProofCaptured: boolean;
  stepTwoVerified: boolean;
};

export type PlannerHubBookingState = {
  plannerHubId: string;
  enabled: boolean;
  status: PlannerHubBookingStatus;
  lastAttemptedAt: string;
  lastResultMessage: string;
  lastRequiredActionMessage: string;
};

export type PlannerHubConnectionState = {
  plannerHubId: string;
  disneyEmail: string;
  status: DisneyPlannerConnectionStatus;
  lastImportedAt: string;
  lastAuthFailureReason: string;
  lastRequiredActionMessage: string;
  lastJobId: string;
  lastJobType: DisneyWorkerJobType | "";
  lastQueuedJobId: string;
  lastClaimedJobId: string;
  lastReportedJobId: string;
  lastWorkerResultAt: string;
  lastWorkerResultSource: string;
  hasEncryptedSession: boolean;
  importedMemberCount: number;
};

export type ImportedDisneyMember = {
  id: string;
  plannerHubId: string;
  displayName: string;
  entitlementType: DisneyEntitlementType;
  entitlementLabel: string;
  passLabel: string;
  magicKeyPassType: PassType | "";
  rawEligibilityText: string;
  automatable: boolean;
  importedAt: string;
};

export type SavedReservationPartyMember = {
  id: string;
  displayName: string;
  passLabel: string;
  passTypeTag: string;
  limitingNote: string;
};

export type SavedReservationParty = {
  id: string;
  plannerHubId: string;
  name: string;
  notes: string;
  members: SavedReservationPartyMember[];
  createdAt: string;
  updatedAt: string;
};

export type SyncMeta = {
  lastSuccessfulSyncAt: string;
  lastAttemptedSyncAt: string;
  lastBackgroundRunAt: string;
  lastBackgroundRunMessage: string;
  lastWorkerPollAt: string;
  lastWorkerPollMessage: string;
  mode: SyncMode;
  stale: boolean;
  message: string;
  lastError: string;
};

export type DashboardUserState = {
  user: SessionUser | null;
  preferences: UserPreferences;
  reservationAssist: ReservationAssistState;
  plannerHubBooking: PlannerHubBookingState;
  plannerHubConnection: PlannerHubConnectionState;
  importedDisneyMembers: ImportedDisneyMember[];
  savedReservationParties: SavedReservationParty[];
  watchItems: WatchItem[];
  activity: ActivityItem[];
  syncMeta: SyncMeta;
  pushPublicKey: string;
};

export function createDefaultReservationAssist(plannerHubEmail = ""): ReservationAssistState {
  return {
    plannerHubEmail,
    plannerHubLabel: "",
    sessionStatus: "unknown",
    lastVerifiedAt: "",
    lastVerifiedFlowNote: "",
    lastHandoffAt: "",
    lastHandoffTargetLabel: "",
    lastHandoffOutcome: "",
    mixedKeyRuleConfirmed: false,
    plannerHubConfirmed: false,
    partyProofCaptured: false,
    flowProofCaptured: false,
    confirmProofCaptured: false,
    stepTwoVerified: false,
  };
}

export function createDefaultPlannerHubBooking(): PlannerHubBookingState {
  return {
    plannerHubId: "primary",
    enabled: false,
    status: "idle",
    lastAttemptedAt: "",
    lastResultMessage: "",
    lastRequiredActionMessage: "",
  };
}

export function createDefaultPlannerHubConnection(disneyEmail = ""): PlannerHubConnectionState {
  return {
    plannerHubId: "primary",
    disneyEmail,
    status: "disconnected",
    lastImportedAt: "",
    lastAuthFailureReason: "",
    lastRequiredActionMessage: "",
    lastJobId: "",
    lastJobType: "",
    lastQueuedJobId: "",
    lastClaimedJobId: "",
    lastReportedJobId: "",
    lastWorkerResultAt: "",
    lastWorkerResultSource: "",
    hasEncryptedSession: false,
    importedMemberCount: 0,
  };
}
