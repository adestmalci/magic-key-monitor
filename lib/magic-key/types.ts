export type PassType = "inspire" | "believe" | "enchant" | "explore" | "imagine";
export type ParkOption = "either" | "dl" | "dca";
export type ParkTieBreaker = "" | "dl" | "dca";
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
export type DisneyWorkerJobStatus = "queued" | "processing" | "completed" | "failed";
export type LocalWorkerDeviceStatus = "inactive" | "active" | "stale";
export type DisneyWorkerPhase =
  | "queued"
  | "started"
  | "disney_open"
  | "email_step"
  | "password_step"
  | "select_party"
  | "members_imported"
  | "session_captured"
  | "completed"
  | "failed"
  | "paused_login"
  | "paused_mismatch";
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
  eitherParkTieBreaker: ParkTieBreaker;
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
  lastBookingJobId: string;
  lastBookingQueuedAt: string;
  lastBookingStartedAt: string;
  lastBookingFinishedAt: string;
  lastBookingStatus: DisneyWorkerJobStatus | "booked" | "";
  lastBookingMessage: string;
  lastBookingError: string;
  lastBookedWatchItemId: string;
  lastResultMessage: string;
  lastRequiredActionMessage: string;
};

export type PlannerHubConnectionState = {
  plannerHubId: string;
  disneyEmail: string;
  status: DisneyPlannerConnectionStatus;
  activeDeviceId: string;
  activeDeviceName: string;
  activeDevicePlatform: string;
  activeDeviceStatus: LocalWorkerDeviceStatus | "";
  activeDeviceLastSeenAt: string;
  latestJobStatus: DisneyWorkerJobStatus | "";
  latestPhase: DisneyWorkerPhase | "";
  latestPhaseMessage: string;
  latestPhaseAt: string;
  latestJobUpdatedAt: string;
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
  lastImportJobId: string;
  lastImportQueuedAt: string;
  lastImportStartedAt: string;
  lastImportFinishedAt: string;
  lastImportStatus: DisneyWorkerJobStatus | "failed" | "";
  lastImportMessage: string;
  lastImportError: string;
  lastImportedMemberCount: number;
  hasEncryptedSession: boolean;
  hasLocalSession: boolean;
  importedMemberCount: number;
};

export type DisneyWorkerEvent = {
  phase: DisneyWorkerPhase;
  at: string;
  message: string;
};

export type DisneyWorkerJobDiagnostics = {
  extractedRowCount: number;
  acceptedMemberCount: number;
  rejectedMemberCount: number;
  rejectionReasons: string[];
  pageUrl: string;
  targetWatchDate?: string;
  targetMemberIds?: string[];
  partySelectionCount?: number;
};

export type DisneyWorkerJob = {
  id: string;
  plannerHubId: string;
  assignedDeviceId: string;
  type: DisneyWorkerJobType;
  status: DisneyWorkerJobStatus;
  phase: DisneyWorkerPhase;
  targetWatchItemId?: string;
  targetWatchDate?: string;
  targetMemberIds?: string[];
  queuedAt: string;
  startedAt: string;
  updatedAt: string;
  finishedAt: string;
  lastMessage: string;
  lastError: string;
  reportedBy: string;
  attemptCount: number;
  events: DisneyWorkerEvent[];
  diagnostics: DisneyWorkerJobDiagnostics | null;
};

export type LocalWorkerDevice = {
  id: string;
  deviceName: string;
  platform: string;
  status: LocalWorkerDeviceStatus;
  lastCheckInAt: string;
  lastSeenAt: string;
  lastJobId: string;
  lastJobPhase: DisneyWorkerPhase | "";
  lastJobMessage: string;
  claimedPlannerHubId: string;
  localProfilePath: string;
  hasLocalSession: boolean;
};

export type ImportedDisneyMember = {
  id: string;
  plannerHubId: string;
  displayName: string;
  entitlementType: DisneyEntitlementType;
  sourceGroup: DisneyEntitlementType;
  entitlementLabel: string;
  rawSectionLabel: string;
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

export type SchedulerHealth = "never_seen" | "healthy" | "delayed" | "stale";

export type DashboardUserState = {
  user: SessionUser | null;
  preferences: UserPreferences;
  reservationAssist: ReservationAssistState;
  plannerHubBooking: PlannerHubBookingState;
  plannerHubConnection: PlannerHubConnectionState;
  latestDisneyJob: DisneyWorkerJob | null;
  latestConnectJob: DisneyWorkerJob | null;
  latestImportJob: DisneyWorkerJob | null;
  latestBookingJob: DisneyWorkerJob | null;
  importedDisneyMembers: ImportedDisneyMember[];
  localWorkerDevices: LocalWorkerDevice[];
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
    lastBookingJobId: "",
    lastBookingQueuedAt: "",
    lastBookingStartedAt: "",
    lastBookingFinishedAt: "",
    lastBookingStatus: "",
    lastBookingMessage: "",
    lastBookingError: "",
    lastBookedWatchItemId: "",
    lastResultMessage: "",
    lastRequiredActionMessage: "",
  };
}

export function createDefaultPlannerHubConnection(disneyEmail = ""): PlannerHubConnectionState {
  return {
    plannerHubId: "primary",
    disneyEmail,
    status: "disconnected",
    activeDeviceId: "",
    activeDeviceName: "",
    activeDevicePlatform: "",
    activeDeviceStatus: "",
    activeDeviceLastSeenAt: "",
    latestJobStatus: "",
    latestPhase: "",
    latestPhaseMessage: "",
    latestPhaseAt: "",
    latestJobUpdatedAt: "",
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
    lastImportJobId: "",
    lastImportQueuedAt: "",
    lastImportStartedAt: "",
    lastImportFinishedAt: "",
    lastImportStatus: "",
    lastImportMessage: "",
    lastImportError: "",
    lastImportedMemberCount: 0,
    hasEncryptedSession: false,
    hasLocalSession: false,
    importedMemberCount: 0,
  };
}
