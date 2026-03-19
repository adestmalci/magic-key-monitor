import { cookies } from "next/headers";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { normalizeSupportedFrequency } from "./config";
import { getDataPath, readStoredValue, writeStoredValue } from "./storage";
import { buildFeedLookup, resolveWatchItemStatus } from "./utils";
import type {
  ActivityItem,
  BookingMode,
  DashboardUserState,
  DisneyPlannerConnectionStatus,
  DisneyWorkerEvent,
  DisneyWorkerJob,
  DisneyWorkerJobDiagnostics,
  DisneyWorkerJobStatus,
  DisneyWorkerPhase,
  DisneyWorkerJobType,
  FeedRow,
  FrequencyType,
  ImportedDisneyMember,
  LocalWorkerDevice,
  LocalWorkerDeviceStatus,
  PlannerHubConnectionState,
  PlannerHubBookingState,
  ReservationHandoffOutcome,
  ReservationAssistState,
  SavedReservationParty,
  SessionUser,
  SyncMeta,
  UserPreferences,
  WatchItem,
} from "./types";
import {
  createDefaultPlannerHubBooking,
  createDefaultPlannerHubConnection,
  createDefaultReservationAssist,
} from "./types";

type StoredUser = SessionUser & {
  createdAt: string;
  lastSignedInAt: string;
};

type StoredWatchItem = WatchItem & {
  userId: string;
  createdAt: string;
  updatedAt: string;
};

type StoredPreferences = UserPreferences & {
  userId: string;
  lastEvaluatedAt: string;
  reservationAssist: ReservationAssistState;
  plannerHubBooking: PlannerHubBookingState;
  plannerHubConnection: PlannerHubConnectionState;
  importedDisneyMembers: ImportedDisneyMember[];
  savedReservationParties: SavedReservationParty[];
};

type PlannerHubSecretRecord = {
  id: string;
  userId: string;
  plannerHubId: string;
  encryptedSessionState: string;
  encryptedPendingPassword: string;
  updatedAt: string;
};

type PlannerHubJobRecord = {
  id: string;
  userId: string;
  plannerHubId: string;
  assignedDeviceId: string;
  type: DisneyWorkerJobType;
  status: DisneyWorkerJobStatus;
  phase: DisneyWorkerPhase;
  disneyEmail: string;
  queuedAt: string;
  claimedAt: string;
  startedAt: string;
  updatedAt: string;
  finishedAt: string;
  attempts: number;
  reportedBy: string;
  lastMessage: string;
  lastError: string;
  events: DisneyWorkerEvent[];
  diagnostics: DisneyWorkerJobDiagnostics | null;
};

type LocalWorkerDeviceRecord = LocalWorkerDevice & {
  userId: string;
};

export type PlannerHubJobDiagnostics = {
  appUrl: string;
  pendingJobCount: number;
  processingJobCount: number;
  latestPendingJobId: string;
  latestProcessingJobId: string;
};

type PlannerHubClaimResult = {
  job: {
    id: string;
    type: DisneyWorkerJobType;
    userId: string;
    plannerHubId: string;
    disneyEmail: string;
  };
  payload: {
    disneyEmail: string;
    password: string;
    sessionState: unknown;
  };
  diagnostics: PlannerHubJobDiagnostics;
} | null;

type MagicLinkRecord = {
  id: string;
  userId: string;
  email: string;
  nonceHash: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string;
};

type PushSubscriptionRecord = {
  id: string;
  userId: string;
  endpoint: string;
  expirationTime: number | null;
  keys: {
    auth: string;
    p256dh: string;
  };
  createdAt: string;
  updatedAt: string;
};

type StoredActivityItem = ActivityItem & {
  userId: string;
};

type BackendState = {
  version: number;
  users: StoredUser[];
  preferences: StoredPreferences[];
  watchItems: StoredWatchItem[];
  activity: StoredActivityItem[];
  magicLinks: MagicLinkRecord[];
  pushSubscriptions: PushSubscriptionRecord[];
  plannerHubSecrets: PlannerHubSecretRecord[];
  plannerHubJobs: PlannerHubJobRecord[];
  localWorkerDevices: LocalWorkerDeviceRecord[];
  syncMeta: SyncMeta;
};

export type AlertChange = {
  item: StoredWatchItem;
  previousStatus: StoredWatchItem["currentStatus"];
  currentStatus: StoredWatchItem["currentStatus"];
};

const STATE_PATH = getDataPath("magic-key-backend.json");
const FEED_PATH = getDataPath("magic-key-feed.json");
const SESSION_COOKIE = "magic_key_session";
const MAGIC_LINK_RETENTION_MS = 1000 * 60 * 60 * 24 * 7;
const ACTIVITY_RETENTION_MS = 1000 * 60 * 60 * 6;
const MAX_ACTIVITY_ITEMS_PER_USER = 40;
const JOB_RETENTION_MS = 1000 * 60 * 60 * 24 * 7;
const DISNEY_PENDING_PASSWORD_TTL_MS = 1000 * 60 * 15;
const PLANNER_HUB_JOB_STALE_MS = 1000 * 60 * 10;
const LOCAL_DEVICE_STALE_MS = 1000 * 60 * 10;
const LOCAL_WORKER_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30;

const DEFAULT_SYNC_META: SyncMeta = {
  lastSuccessfulSyncAt: "",
  lastAttemptedSyncAt: "",
  lastBackgroundRunAt: "",
  lastBackgroundRunMessage: "",
  lastWorkerPollAt: "",
  lastWorkerPollMessage: "",
  mode: "snapshot-fallback",
  stale: false,
  message: "Pixie dust is standing by for the next live sync.",
  lastError: "",
};

function defaultPreferences(): UserPreferences {
  return {
    emailEnabled: false,
    emailAddress: "",
    alertsEnabled: false,
    pushEnabled: false,
    syncFrequency: "5m",
  };
}

function normalizeReservationAssist(
  value: Partial<ReservationAssistState> | null | undefined,
  plannerHubEmail = ""
): ReservationAssistState {
  const next = {
    ...createDefaultReservationAssist(plannerHubEmail),
    ...(value ?? {}),
  };

  if (!next.plannerHubEmail) {
    next.plannerHubEmail = plannerHubEmail;
  }

  if (
    next.sessionStatus !== "unknown" &&
    next.sessionStatus !== "checking" &&
    next.sessionStatus !== "connected" &&
    next.sessionStatus !== "needs_login" &&
    next.sessionStatus !== "expired"
  ) {
    next.sessionStatus = "unknown";
  }

  if (
    next.lastHandoffOutcome !== "" &&
    next.lastHandoffOutcome !== "worked" &&
    next.lastHandoffOutcome !== "needed_login" &&
    next.lastHandoffOutcome !== "party_mismatch" &&
    next.lastHandoffOutcome !== "flow_changed"
  ) {
    next.lastHandoffOutcome = "" as ReservationHandoffOutcome;
  }

  return next;
}

function normalizePlannerHubBooking(
  value: Partial<PlannerHubBookingState> | null | undefined
): PlannerHubBookingState {
  const next = {
    ...createDefaultPlannerHubBooking(),
    ...(value ?? {}),
  };

  if (
    next.status !== "idle" &&
    next.status !== "armed" &&
    next.status !== "paused_login" &&
    next.status !== "paused_mismatch" &&
    next.status !== "attempting" &&
    next.status !== "booked" &&
    next.status !== "failed"
  ) {
    next.status = "idle";
  }

  if (!next.plannerHubId) {
    next.plannerHubId = "primary";
  }

  return next;
}

function normalizePlannerHubConnection(
  value: Partial<PlannerHubConnectionState> | null | undefined,
  disneyEmail = ""
): PlannerHubConnectionState {
  const next = {
    ...createDefaultPlannerHubConnection(disneyEmail),
    ...(value ?? {}),
  };

  if (!next.plannerHubId) {
    next.plannerHubId = "primary";
  }

  if (!next.disneyEmail) {
    next.disneyEmail = disneyEmail;
  }

  if (
    next.status !== "disconnected" &&
    next.status !== "pending_connect" &&
    next.status !== "connected" &&
    next.status !== "importing" &&
    next.status !== "paused_login" &&
    next.status !== "paused_mismatch" &&
    next.status !== "failed"
  ) {
    next.status = "disconnected";
  }

  if (
    next.activeDeviceStatus !== "" &&
    next.activeDeviceStatus !== "inactive" &&
    next.activeDeviceStatus !== "active" &&
    next.activeDeviceStatus !== "stale"
  ) {
    next.activeDeviceStatus = "";
  }

  if (next.lastJobType !== "" && next.lastJobType !== "connect" && next.lastJobType !== "import" && next.lastJobType !== "booking") {
    next.lastJobType = "";
  }

  if (
    next.latestJobStatus !== "" &&
    next.latestJobStatus !== "queued" &&
    next.latestJobStatus !== "processing" &&
    next.latestJobStatus !== "completed" &&
    next.latestJobStatus !== "failed"
  ) {
    next.latestJobStatus = "";
  }

  if (
    next.lastImportStatus !== "" &&
    next.lastImportStatus !== "queued" &&
    next.lastImportStatus !== "processing" &&
    next.lastImportStatus !== "completed" &&
    next.lastImportStatus !== "failed"
  ) {
    next.lastImportStatus = "";
  }

  if (
    next.latestPhase !== "" &&
    next.latestPhase !== "queued" &&
    next.latestPhase !== "started" &&
    next.latestPhase !== "disney_open" &&
    next.latestPhase !== "email_step" &&
    next.latestPhase !== "password_step" &&
    next.latestPhase !== "select_party" &&
    next.latestPhase !== "members_imported" &&
    next.latestPhase !== "session_captured" &&
    next.latestPhase !== "completed" &&
    next.latestPhase !== "failed" &&
    next.latestPhase !== "paused_login" &&
    next.latestPhase !== "paused_mismatch"
  ) {
    next.latestPhase = "";
  }

  return next;
}

function normalizeLocalWorkerDeviceStatus(value: unknown): LocalWorkerDeviceStatus {
  return value === "active" || value === "stale" ? value : "inactive";
}

function normalizeLocalWorkerDevices(value: unknown): LocalWorkerDeviceRecord[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const next = item as Partial<LocalWorkerDeviceRecord>;
      return {
        id: typeof next.id === "string" && next.id ? next.id : randomUUID(),
        userId: typeof next.userId === "string" ? next.userId : "",
        deviceName: typeof next.deviceName === "string" && next.deviceName ? next.deviceName : "My Mac",
        platform: typeof next.platform === "string" ? next.platform : "macos",
        status: normalizeLocalWorkerDeviceStatus(next.status),
        lastCheckInAt: typeof next.lastCheckInAt === "string" ? next.lastCheckInAt : "",
        lastSeenAt: typeof next.lastSeenAt === "string" ? next.lastSeenAt : "",
        lastJobId: typeof next.lastJobId === "string" ? next.lastJobId : "",
        lastJobPhase:
          next.lastJobPhase === "queued" ||
          next.lastJobPhase === "started" ||
          next.lastJobPhase === "disney_open" ||
          next.lastJobPhase === "email_step" ||
          next.lastJobPhase === "password_step" ||
          next.lastJobPhase === "select_party" ||
          next.lastJobPhase === "members_imported" ||
          next.lastJobPhase === "session_captured" ||
          next.lastJobPhase === "completed" ||
          next.lastJobPhase === "failed" ||
          next.lastJobPhase === "paused_login" ||
          next.lastJobPhase === "paused_mismatch"
            ? next.lastJobPhase
            : "",
        lastJobMessage: typeof next.lastJobMessage === "string" ? next.lastJobMessage : "",
        claimedPlannerHubId: typeof next.claimedPlannerHubId === "string" ? next.claimedPlannerHubId : "primary",
        localProfilePath: typeof next.localProfilePath === "string" ? next.localProfilePath : "",
        hasLocalSession: Boolean(next.hasLocalSession),
      };
    });
}

function normalizeDisneyWorkerEvents(value: unknown): DisneyWorkerEvent[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const next = item as Partial<DisneyWorkerEvent>;
      const phase = next.phase;
      return {
        phase:
          phase === "queued" ||
          phase === "started" ||
          phase === "disney_open" ||
          phase === "email_step" ||
          phase === "password_step" ||
          phase === "select_party" ||
          phase === "members_imported" ||
          phase === "session_captured" ||
          phase === "completed" ||
          phase === "failed" ||
          phase === "paused_login" ||
          phase === "paused_mismatch"
            ? phase
            : "queued",
        at: typeof next.at === "string" ? next.at : new Date().toISOString(),
        message: typeof next.message === "string" ? next.message : "",
      };
    });
}

function normalizeDisneyWorkerJobDiagnostics(value: unknown): DisneyWorkerJobDiagnostics | null {
  if (!value || typeof value !== "object") return null;
  const next = value as Partial<DisneyWorkerJobDiagnostics>;
  return {
    extractedRowCount: typeof next.extractedRowCount === "number" ? next.extractedRowCount : 0,
    acceptedMemberCount: typeof next.acceptedMemberCount === "number" ? next.acceptedMemberCount : 0,
    rejectedMemberCount: typeof next.rejectedMemberCount === "number" ? next.rejectedMemberCount : 0,
    rejectionReasons: Array.isArray(next.rejectionReasons)
      ? next.rejectionReasons.filter((item): item is string => typeof item === "string" && Boolean(item))
      : [],
    pageUrl: typeof next.pageUrl === "string" ? next.pageUrl : "",
  };
}

function normalizePlannerHubJobRecord(value: Partial<PlannerHubJobRecord> | null | undefined): PlannerHubJobRecord {
  const queuedAt = typeof value?.queuedAt === "string" && value.queuedAt ? value.queuedAt : new Date().toISOString();
  const status =
    value?.status === "queued" ||
    value?.status === "processing" ||
    value?.status === "completed" ||
    value?.status === "failed"
      ? value.status
      : "queued";
  const phase =
    value?.phase === "queued" ||
    value?.phase === "started" ||
    value?.phase === "disney_open" ||
    value?.phase === "email_step" ||
    value?.phase === "password_step" ||
    value?.phase === "select_party" ||
    value?.phase === "members_imported" ||
    value?.phase === "session_captured" ||
    value?.phase === "completed" ||
    value?.phase === "failed" ||
    value?.phase === "paused_login" ||
    value?.phase === "paused_mismatch"
      ? value.phase
      : status === "failed"
        ? "failed"
        : status === "completed"
          ? "completed"
          : "queued";

  return {
    id: typeof value?.id === "string" ? value.id : randomUUID(),
    userId: typeof value?.userId === "string" ? value.userId : "",
    plannerHubId: typeof value?.plannerHubId === "string" && value.plannerHubId ? value.plannerHubId : "primary",
    assignedDeviceId: typeof value?.assignedDeviceId === "string" ? value.assignedDeviceId : "",
    type:
      value?.type === "connect" || value?.type === "import" || value?.type === "booking"
        ? value.type
        : "connect",
    status,
    phase,
    disneyEmail: typeof value?.disneyEmail === "string" ? value.disneyEmail : "",
    queuedAt,
    claimedAt: typeof value?.claimedAt === "string" ? value.claimedAt : "",
    startedAt: typeof value?.startedAt === "string" ? value.startedAt : "",
    updatedAt: typeof value?.updatedAt === "string" && value.updatedAt ? value.updatedAt : queuedAt,
    finishedAt: typeof value?.finishedAt === "string" ? value.finishedAt : "",
    attempts: typeof value?.attempts === "number" ? value.attempts : 0,
    reportedBy: typeof value?.reportedBy === "string" ? value.reportedBy : "",
    lastMessage: typeof value?.lastMessage === "string" ? value.lastMessage : "",
    lastError: typeof value?.lastError === "string" ? value.lastError : "",
    events: normalizeDisneyWorkerEvents(value?.events),
    diagnostics: normalizeDisneyWorkerJobDiagnostics(value?.diagnostics),
  };
}

function currentAppUrlForDiagnostics() {
  return (process.env.MAGIC_KEY_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
}

function buildPlannerHubJobDiagnostics(state: BackendState): PlannerHubJobDiagnostics {
  const pendingJobs = state.plannerHubJobs.filter((entry) => entry.status === "queued");
  const processingJobs = state.plannerHubJobs.filter((entry) => entry.status === "processing");

  return {
    appUrl: currentAppUrlForDiagnostics(),
    pendingJobCount: pendingJobs.length,
    processingJobCount: processingJobs.length,
    latestPendingJobId: pendingJobs[0]?.id || "",
    latestProcessingJobId: processingJobs[0]?.id || "",
  };
}

function normalizeImportedDisneyMembers(value: unknown): ImportedDisneyMember[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const junkPattern =
    /Footer Links|Visit Disney|Related Disney Sites|Parks\s*&\s*Tickets|Things To Do|Places To Stay|Help|Annual Passports|Tickets\s*&\s*Parks/i;
  const looksLikeRealName = (value: string) => {
    const text = value.trim();
    if (!text || text.length > 80) return false;
    if (junkPattern.test(text)) return false;
    if (/\.com\b/i.test(text)) return false;
    if (/[_{}\[\];]/.test(text)) return false;
    if (/function\s*\(|_satellite|querySelector|setTimeout|return\s*\(/i.test(text)) return false;
    if (/Magic Key|Ticket|Reservation|No-Shows?|View Details|Age\s*\d/i.test(text)) return false;
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length < 2) return false;
    return words.every((word) => /^[A-Za-z'.-]+$/.test(word));
  };

  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const next = item as Partial<ImportedDisneyMember>;
      const entitlementType: ImportedDisneyMember["entitlementType"] =
        next.entitlementType === "ticket_holder" ? "ticket_holder" : "magic_key";
      const sourceGroup: ImportedDisneyMember["sourceGroup"] =
        next.sourceGroup === "ticket_holder" ? "ticket_holder" : "magic_key";
      const magicKeyPassType: ImportedDisneyMember["magicKeyPassType"] =
        next.magicKeyPassType === "inspire" ||
        next.magicKeyPassType === "believe" ||
        next.magicKeyPassType === "enchant" ||
        next.magicKeyPassType === "explore" ||
        next.magicKeyPassType === "imagine"
          ? next.magicKeyPassType
          : "";

      return {
        id: typeof next.id === "string" ? next.id : randomUUID(),
        plannerHubId: typeof next.plannerHubId === "string" && next.plannerHubId ? next.plannerHubId : "primary",
        displayName: typeof next.displayName === "string" ? next.displayName : "",
        entitlementType,
        sourceGroup,
        entitlementLabel: typeof next.entitlementLabel === "string" ? next.entitlementLabel : "",
        rawSectionLabel: typeof next.rawSectionLabel === "string" ? next.rawSectionLabel : "",
        passLabel: typeof next.passLabel === "string" ? next.passLabel : "",
        magicKeyPassType,
        rawEligibilityText: typeof next.rawEligibilityText === "string" ? next.rawEligibilityText : "",
        automatable: Boolean(next.automatable),
        importedAt: typeof next.importedAt === "string" ? next.importedAt : new Date().toISOString(),
      };
    })
    .filter((member) => {
      if (!looksLikeRealName(member.displayName)) return false;
      if (junkPattern.test(member.entitlementLabel || "")) return false;
      if (junkPattern.test(member.passLabel || "")) return false;
      if (junkPattern.test(member.rawSectionLabel || "")) return false;
      if (!member.passLabel.trim()) return false;
      if (member.sourceGroup === "magic_key" && !member.magicKeyPassType) return false;
      const dedupeKey = `${member.sourceGroup}:${member.displayName.toLowerCase()}:${member.passLabel.toLowerCase()}`;
      if (seen.has(dedupeKey)) return false;
      seen.add(dedupeKey);
      return true;
    });
}

function normalizeSavedReservationParties(value: unknown): SavedReservationParty[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const next = item as Partial<SavedReservationParty>;
      return {
        id: typeof next.id === "string" ? next.id : randomUUID(),
        plannerHubId: typeof next.plannerHubId === "string" && next.plannerHubId ? next.plannerHubId : "primary",
        name: typeof next.name === "string" ? next.name : "",
        notes: typeof next.notes === "string" ? next.notes : "",
        members: Array.isArray(next.members)
          ? next.members
              .filter((member) => member && typeof member === "object")
              .map((member) => {
                const nextMember = member as SavedReservationParty["members"][number];
                return {
                  id: typeof nextMember.id === "string" ? nextMember.id : randomUUID(),
                  displayName: typeof nextMember.displayName === "string" ? nextMember.displayName : "",
                  passLabel: typeof nextMember.passLabel === "string" ? nextMember.passLabel : "",
                  passTypeTag: typeof nextMember.passTypeTag === "string" ? nextMember.passTypeTag : "",
                  limitingNote: typeof nextMember.limitingNote === "string" ? nextMember.limitingNote : "",
                };
              })
          : [],
        createdAt: typeof next.createdAt === "string" ? next.createdAt : new Date().toISOString(),
        updatedAt: typeof next.updatedAt === "string" ? next.updatedAt : new Date().toISOString(),
      };
    });
}

function normalizeBookingMode(value: unknown): BookingMode {
  return value === "watch_and_attempt" ? "watch_and_attempt" : "watch_only";
}

function normalizeSelectedImportedMemberIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item)) : [];
}

function defaultState(): BackendState {
  return {
    version: 3,
    users: [],
    preferences: [],
    watchItems: [],
    activity: [],
    magicLinks: [],
    pushSubscriptions: [],
    plannerHubSecrets: [],
    plannerHubJobs: [],
    localWorkerDevices: [],
    syncMeta: DEFAULT_SYNC_META,
  };
}

function pruneMagicLinks(records: MagicLinkRecord[], now = Date.now()) {
  return records.filter((record) => {
    const expiryTime = Date.parse(record.expiresAt);
    const usedTime = record.usedAt ? Date.parse(record.usedAt) : NaN;

    if (Number.isFinite(usedTime)) {
      return now - usedTime <= MAGIC_LINK_RETENTION_MS;
    }

    if (Number.isFinite(expiryTime)) {
      return now - expiryTime <= MAGIC_LINK_RETENTION_MS;
    }

    return false;
  });
}

function pruneActivityItems(records: StoredActivityItem[], now = Date.now()) {
  const filtered = records.filter((record) => {
    const createdAt = Date.parse(record.createdAt);
    return Number.isFinite(createdAt) && now - createdAt <= ACTIVITY_RETENTION_MS;
  });

  const counts = new Map<string, number>();
  return filtered
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .filter((record) => {
      const nextCount = (counts.get(record.userId) ?? 0) + 1;
      counts.set(record.userId, nextCount);
      return nextCount <= MAX_ACTIVITY_ITEMS_PER_USER;
    });
}

function prunePlannerHubJobs(records: PlannerHubJobRecord[], now = Date.now()) {
  return records.filter((record) => {
    const queuedAt = Date.parse(record.queuedAt);
    if (!Number.isFinite(queuedAt)) return false;
    return now - queuedAt <= JOB_RETENTION_MS;
  });
}

function refreshLocalWorkerDevices(records: LocalWorkerDeviceRecord[], now = Date.now()) {
  return records.map((record) => {
    const seenAt = Date.parse(record.lastSeenAt || record.lastCheckInAt);
    const isStale = Number.isFinite(seenAt) ? now - seenAt > LOCAL_DEVICE_STALE_MS : false;
    const nextStatus: LocalWorkerDeviceStatus = isStale ? "stale" : record.status === "active" ? "active" : "inactive";
    return {
      ...record,
      status: nextStatus,
    };
  });
}

function pruneBackendState(state: BackendState): BackendState {
  return {
    ...state,
    activity: pruneActivityItems(state.activity),
    magicLinks: pruneMagicLinks(state.magicLinks),
    plannerHubJobs: prunePlannerHubJobs(state.plannerHubJobs),
    localWorkerDevices: refreshLocalWorkerDevices(state.localWorkerDevices),
  };
}

function secretFor(name: string, fallback: string) {
  const configured = process.env[name];
  if (configured) return configured;

  if (process.env.NODE_ENV === "production") {
    throw new Error(`${name} must be configured in production.`);
  }

  return fallback;
}

function getDisneySessionKey() {
  const raw = process.env.DISNEY_SESSION_SECRET || "";
  if (!raw) {
    throw new Error("Disney session encryption is not configured yet.");
  }
  return createHash("sha256").update(raw).digest();
}

function encryptSensitiveValue(value: string) {
  const iv = randomBytes(12);
  const key = getDisneySessionKey();
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString("base64url"),
    tag: tag.toString("base64url"),
    data: ciphertext.toString("base64url"),
  });
}

function decryptSensitiveValue(payload: string) {
  const parsed = JSON.parse(payload) as { iv?: string; tag?: string; data?: string };
  if (!parsed.iv || !parsed.tag || !parsed.data) {
    throw new Error("Encrypted Disney payload is invalid.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getDisneySessionKey(),
    Buffer.from(parsed.iv, "base64url")
  );
  decipher.setAuthTag(Buffer.from(parsed.tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(parsed.data, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function encodeBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payload: string) {
  return createHmac("sha256", secretFor("MAGIC_KEY_AUTH_SECRET", "magic-key-local-secret"))
    .update(payload)
    .digest("base64url");
}

function createSignedToken(payload: Record<string, unknown>) {
  const body = encodeBase64Url(JSON.stringify(payload));
  const signature = signPayload(body);
  return `${body}.${signature}`;
}

function verifySignedToken<T>(token: string): T | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expectedSignature = signPayload(body);
  const actual = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  try {
    const parsed = JSON.parse(decodeBase64Url(body)) as T & { exp?: number };
    if (typeof parsed.exp === "number" && parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

type LocalWorkerTokenPayload = {
  kind: "local_disney_worker";
  sub: string;
  exp: number;
};

function createLocalWorkerToken(userId: string) {
  return createSignedToken({
    kind: "local_disney_worker",
    sub: userId,
    exp: Date.now() + LOCAL_WORKER_TOKEN_TTL_MS,
  });
}

function verifyLocalWorkerToken(token: string) {
  const parsed = verifySignedToken<LocalWorkerTokenPayload>(token);
  if (!parsed || parsed.kind !== "local_disney_worker" || typeof parsed.sub !== "string") {
    return null;
  }
  return parsed;
}

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function ensureBackendState() {
  await readStoredValue({
    storageKey: "backend-state",
    localPath: STATE_PATH,
    createDefault: defaultState,
  });
}

export async function readBackendState(): Promise<BackendState> {
  const parsed = (await readStoredValue<Partial<BackendState>>({
    storageKey: "backend-state",
    localPath: STATE_PATH,
    createDefault: defaultState,
  })) as Partial<BackendState>;

  return {
    ...defaultState(),
    ...parsed,
    syncMeta: {
      ...DEFAULT_SYNC_META,
      ...(parsed.syncMeta ?? {}),
    },
    users: Array.isArray(parsed.users) ? parsed.users : [],
    preferences: Array.isArray(parsed.preferences) ? parsed.preferences : [],
    watchItems: Array.isArray(parsed.watchItems) ? parsed.watchItems : [],
    activity: pruneActivityItems(Array.isArray(parsed.activity) ? parsed.activity : []),
    magicLinks: pruneMagicLinks(Array.isArray(parsed.magicLinks) ? parsed.magicLinks : []),
    pushSubscriptions: Array.isArray(parsed.pushSubscriptions) ? parsed.pushSubscriptions : [],
    plannerHubSecrets: Array.isArray(parsed.plannerHubSecrets) ? parsed.plannerHubSecrets : [],
    plannerHubJobs: prunePlannerHubJobs(
      Array.isArray(parsed.plannerHubJobs) ? parsed.plannerHubJobs.map((job) => normalizePlannerHubJobRecord(job)) : []
    ),
    localWorkerDevices: refreshLocalWorkerDevices(
      Array.isArray(parsed.localWorkerDevices) ? normalizeLocalWorkerDevices(parsed.localWorkerDevices) : []
    ),
  };
}

export async function writeBackendState(state: BackendState) {
  await writeStoredValue({
    storageKey: "backend-state",
    localPath: STATE_PATH,
    value: pruneBackendState(state),
  });
}

export async function readStoredFeed(): Promise<FeedRow[]> {
  const parsed = await readStoredValue<unknown>({
    storageKey: "feed",
    localPath: FEED_PATH,
    createDefault: () => [],
  });
  return Array.isArray(parsed) ? parsed : [];
}

export async function writeStoredFeed(rows: FeedRow[]) {
  await writeStoredValue({
    storageKey: "feed",
    localPath: FEED_PATH,
    value: rows,
  });
}

export function frequencyToMs(frequency: FrequencyType) {
  if (frequency === "manual") return Number.POSITIVE_INFINITY;
  if (frequency === "1m") return 60_000;
  if (frequency === "5m") return 300_000;
  if (frequency === "10m") return 600_000;
  if (frequency === "15m") return 900_000;
  return 1_800_000;
}

export function getUserFromState(state: BackendState, userId: string) {
  return state.users.find((user) => user.id === userId) ?? null;
}

export function getPreferencesFromState(state: BackendState, userId: string): StoredPreferences {
  const existing = state.preferences.find((item) => item.userId === userId);
  const user = getUserFromState(state, userId);

  if (existing) {
    existing.syncFrequency = normalizeSupportedFrequency(existing.syncFrequency);
    existing.reservationAssist = normalizeReservationAssist(existing.reservationAssist, user?.email ?? "");
    existing.plannerHubBooking = normalizePlannerHubBooking(existing.plannerHubBooking);
    existing.plannerHubConnection = normalizePlannerHubConnection(
      existing.plannerHubConnection,
      existing.reservationAssist?.plannerHubEmail || user?.email || ""
    );
    existing.importedDisneyMembers = normalizeImportedDisneyMembers(existing.importedDisneyMembers);
    existing.savedReservationParties = normalizeSavedReservationParties(existing.savedReservationParties);
    return existing;
  }

  const created: StoredPreferences = {
    userId,
    lastEvaluatedAt: "",
    ...defaultPreferences(),
    reservationAssist: normalizeReservationAssist(null),
    plannerHubBooking: normalizePlannerHubBooking(null),
    plannerHubConnection: normalizePlannerHubConnection(null, user?.email ?? ""),
    importedDisneyMembers: [],
    savedReservationParties: [],
  };
  state.preferences.push(created);
  return created;
}

export function getWatchItemsForUser(state: BackendState, userId: string) {
  return state.watchItems.filter((item) => item.userId === userId);
}

export function getActivityForUser(state: BackendState, userId: string) {
  return state.activity
    .filter((item) => item.userId === userId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function recordActivityForUser(
  state: BackendState,
  userId: string,
  entry: Pick<ActivityItem, "source" | "trigger" | "message" | "details"> & { createdAt?: string }
) {
  state.activity.unshift({
    id: randomUUID(),
    userId,
    createdAt: entry.createdAt || new Date().toISOString(),
    source: entry.source,
    trigger: entry.trigger,
    message: entry.message,
    details: entry.details,
  });
  state.activity = pruneActivityItems(state.activity);
}

export async function getSessionUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = verifySignedToken<{ userId: string; email: string; exp: number }>(token);
  if (!payload?.userId || !payload?.email) return null;

  const state = await readBackendState();
  return getUserFromState(state, payload.userId);
}

export async function createMagicLink(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const state = await readBackendState();
  const now = new Date().toISOString();

  let user = state.users.find((item) => item.email === normalizedEmail) ?? null;
  if (!user) {
    user = {
      id: randomUUID(),
      email: normalizedEmail,
      createdAt: now,
      lastSignedInAt: "",
    };
    state.users.push(user);
  }

  getPreferencesFromState(state, user.id);

  const nonce = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 20).toISOString();

  state.magicLinks.push({
    id: randomUUID(),
    userId: user.id,
    email: user.email,
    nonceHash: hashValue(nonce),
    createdAt: now,
    expiresAt,
    usedAt: "",
  });

  await writeBackendState(state);

  const token = createSignedToken({
    userId: user.id,
    email: user.email,
    nonce,
    exp: Date.now() + 1000 * 60 * 20,
  });

  return { user, token, expiresAt };
}

export async function consumeMagicLink(token: string) {
  const payload = verifySignedToken<{ userId: string; email: string; nonce: string; exp: number }>(token);
  if (!payload?.userId || !payload?.email || !payload?.nonce) return null;

  const state = await readBackendState();
  const record = state.magicLinks.find(
    (item) =>
      item.userId === payload.userId &&
      item.email === payload.email &&
      item.usedAt === "" &&
      item.expiresAt > new Date().toISOString() &&
      item.nonceHash === hashValue(payload.nonce)
  );

  if (!record) return null;

  record.usedAt = new Date().toISOString();
  const user = getUserFromState(state, payload.userId);
  if (!user) return null;

  user.lastSignedInAt = new Date().toISOString();
  await writeBackendState(state);

  return createSignedToken({
    userId: user.id,
    email: user.email,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/",
  });
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
}

export async function getDashboardStateForUser(user: StoredUser | null): Promise<DashboardUserState> {
  const state = await readBackendState();

  if (!user) {
    return {
      user: null,
      preferences: defaultPreferences(),
      reservationAssist: createDefaultReservationAssist(),
      plannerHubBooking: createDefaultPlannerHubBooking(),
      plannerHubConnection: createDefaultPlannerHubConnection(),
      latestDisneyJob: null,
      latestConnectJob: null,
      latestImportJob: null,
      importedDisneyMembers: [],
      localWorkerDevices: [],
      savedReservationParties: [],
      watchItems: [],
      activity: [],
      syncMeta: state.syncMeta,
      pushPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "",
    };
  }

  const preferences = getPreferencesFromState(state, user.id);
  preferences.reservationAssist = normalizeReservationAssist(preferences.reservationAssist, user.email);
  preferences.plannerHubBooking = normalizePlannerHubBooking(preferences.plannerHubBooking);
  preferences.plannerHubConnection = normalizePlannerHubConnection(
    preferences.plannerHubConnection,
    preferences.reservationAssist?.plannerHubEmail || user.email
  );
  preferences.importedDisneyMembers = normalizeImportedDisneyMembers(preferences.importedDisneyMembers);
  preferences.savedReservationParties = normalizeSavedReservationParties(preferences.savedReservationParties);
  preferences.plannerHubConnection = applyActiveDeviceToConnection(
    preferences.plannerHubConnection,
    getActiveLocalWorkerDevice(state, user.id)
  );
  if (synchronizePlannerHubConnectionState(state, user.id, preferences)) {
    await writeBackendState(state);
  }
  const latestDisneyJob = getLatestPlannerHubJobForUser(
    state,
    user.id,
    preferences.plannerHubConnection.plannerHubId || "primary"
  );
  const latestConnectJob = getLatestPlannerHubJobForUserByType(
    state,
    user.id,
    preferences.plannerHubConnection.plannerHubId || "primary",
    "connect"
  );
  const latestImportJob = getLatestPlannerHubJobForUserByType(
    state,
    user.id,
    preferences.plannerHubConnection.plannerHubId || "primary",
    "import"
  );
  return {
    user: { id: user.id, email: user.email },
    preferences: {
      emailEnabled: preferences.emailEnabled,
      emailAddress: preferences.emailAddress,
      alertsEnabled: preferences.alertsEnabled,
      pushEnabled: preferences.pushEnabled,
      syncFrequency: normalizeSupportedFrequency(preferences.syncFrequency),
    },
    reservationAssist: preferences.reservationAssist,
    plannerHubBooking: preferences.plannerHubBooking,
    plannerHubConnection: preferences.plannerHubConnection,
    latestDisneyJob: serializePlannerHubJob(latestDisneyJob),
    latestConnectJob: serializePlannerHubJob(latestConnectJob),
    latestImportJob: serializePlannerHubJob(latestImportJob),
    importedDisneyMembers: preferences.importedDisneyMembers,
    localWorkerDevices: getLocalWorkerDevicesForUser(state, user.id).map(({ userId: _userId, ...device }) => device),
    savedReservationParties: preferences.savedReservationParties,
    watchItems: getWatchItemsForUser(state, user.id).map((item) => ({
      id: item.id,
      date: item.date,
      passType: item.passType,
      preferredPark: item.preferredPark,
      currentStatus: item.currentStatus,
      previousStatus: item.previousStatus,
      lastCheckedAt: item.lastCheckedAt,
      plannerHubId: item.plannerHubId || "primary",
      selectedImportedMemberIds: normalizeSelectedImportedMemberIds((item as WatchItem & { selectedImportedMemberIds?: string[] }).selectedImportedMemberIds),
      bookingMode: normalizeBookingMode(item.bookingMode),
    })),
    activity: getActivityForUser(state, user.id).map((item) => ({
      id: item.id,
      createdAt: item.createdAt,
      source: item.source,
      trigger: item.trigger,
      message: item.message,
      details: item.details,
    })),
    syncMeta: state.syncMeta,
    pushPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "",
  };
}

export async function resetPlannerHubConnection(userId: string) {
  const state = await readBackendState();
  const preferences = getPreferencesFromState(state, userId);
  const plannerHubId = preferences.plannerHubConnection.plannerHubId || "primary";
  const disneyEmail =
    preferences.plannerHubConnection.disneyEmail || preferences.reservationAssist.plannerHubEmail || "";
  const activeDevice = getActiveLocalWorkerDevice(state, userId);

  state.plannerHubJobs = state.plannerHubJobs.filter(
    (job) => !(job.userId === userId && job.plannerHubId === plannerHubId)
  );

  upsertPlannerHubSecretRecord(state, userId, plannerHubId, {
    encryptedSessionState: "",
    encryptedPendingPassword: "",
  });

  preferences.plannerHubConnection = normalizePlannerHubConnection(
    {
      ...createDefaultPlannerHubConnection(disneyEmail),
      plannerHubId,
      disneyEmail,
      activeDeviceId: activeDevice?.id || "",
      activeDeviceName: activeDevice?.deviceName || "",
      activeDevicePlatform: activeDevice?.platform || "",
      activeDeviceStatus: activeDevice?.status || "",
      activeDeviceLastSeenAt: activeDevice?.lastSeenAt || activeDevice?.lastCheckInAt || "",
      hasLocalSession: activeDevice?.hasLocalSession ?? false,
    },
    disneyEmail
  );
  preferences.plannerHubBooking = normalizePlannerHubBooking({
    ...createDefaultPlannerHubBooking(),
    plannerHubId,
  });
  preferences.importedDisneyMembers = [];
  preferences.reservationAssist = normalizeReservationAssist(
    {
      ...preferences.reservationAssist,
      plannerHubEmail: disneyEmail,
      sessionStatus: "unknown",
      lastVerifiedFlowNote: "",
      lastHandoffAt: "",
      lastHandoffTargetLabel: "",
      lastHandoffOutcome: "",
      partyProofCaptured: false,
      flowProofCaptured: false,
      confirmProofCaptured: false,
      stepTwoVerified: false,
    },
    disneyEmail
  );

  const lookup = buildFeedLookup(await readStoredFeed());
  state.watchItems = state.watchItems.map((item) => {
    if (item.userId !== userId || item.plannerHubId !== plannerHubId) return item;
    const nextItem: StoredWatchItem = {
      ...item,
      plannerHubId,
      selectedImportedMemberIds: [],
      bookingMode: "watch_only",
      updatedAt: new Date().toISOString(),
    };
    return {
      ...nextItem,
      currentStatus: resolveWatchItemStatus(nextItem, lookup, preferences.importedDisneyMembers),
    };
  });

  await writeBackendState(state);
}

export async function upsertPreferencesForUser(
  userId: string,
  patch: Partial<UserPreferences> & {
    reservationAssist?: Partial<ReservationAssistState>;
    plannerHubBooking?: Partial<PlannerHubBookingState>;
    plannerHubConnection?: Partial<PlannerHubConnectionState>;
    importedDisneyMembers?: ImportedDisneyMember[];
    savedReservationParties?: SavedReservationParty[];
  }
): Promise<{
  preferences: UserPreferences;
  reservationAssist: ReservationAssistState;
  plannerHubBooking: PlannerHubBookingState;
  plannerHubConnection: PlannerHubConnectionState;
  importedDisneyMembers: ImportedDisneyMember[];
  savedReservationParties: SavedReservationParty[];
}> {
  const workingState = await readBackendState();
  const preferences = getPreferencesFromState(workingState, userId);
  const user = getUserFromState(workingState, userId);
  const currentConnection = preferences.plannerHubConnection;

  preferences.emailEnabled = patch.emailEnabled ?? preferences.emailEnabled;
  preferences.emailAddress = patch.emailAddress ?? preferences.emailAddress;
  preferences.alertsEnabled = patch.alertsEnabled ?? preferences.alertsEnabled;
  preferences.pushEnabled = patch.pushEnabled ?? preferences.pushEnabled;
  preferences.syncFrequency = normalizeSupportedFrequency(patch.syncFrequency ?? preferences.syncFrequency);
  preferences.reservationAssist = normalizeReservationAssist(
    {
      ...preferences.reservationAssist,
      ...(patch.reservationAssist ?? {}),
    },
    user?.email ?? preferences.reservationAssist?.plannerHubEmail ?? ""
  );
  preferences.plannerHubBooking = normalizePlannerHubBooking({
    ...preferences.plannerHubBooking,
    ...(patch.plannerHubBooking ?? {}),
  });
  preferences.plannerHubConnection = normalizePlannerHubConnection(
    {
      ...currentConnection,
      plannerHubId: patch.plannerHubConnection?.plannerHubId ?? currentConnection.plannerHubId,
      disneyEmail: patch.plannerHubConnection?.disneyEmail ?? currentConnection.disneyEmail,
    },
    patch.plannerHubConnection?.disneyEmail ??
      patch.reservationAssist?.plannerHubEmail ??
      user?.email ??
      currentConnection?.disneyEmail ??
      preferences.reservationAssist?.plannerHubEmail ??
      ""
  );
  // Imported members are worker-owned. Keep the freshest backend copy instead of
  // letting autosaved client state erase an import result that just landed.
  preferences.importedDisneyMembers = normalizeImportedDisneyMembers(preferences.importedDisneyMembers);
  preferences.savedReservationParties =
    patch.savedReservationParties === undefined
      ? normalizeSavedReservationParties(preferences.savedReservationParties)
      : normalizeSavedReservationParties(patch.savedReservationParties);

  // Preference autosaves should not clobber planner-hub jobs/secrets written by
  // adjacent Disney connect/import requests. Reapply the patched preferences onto
  // the freshest state snapshot right before writing.
  const latestState = await readBackendState();
  const latestPreferences = getPreferencesFromState(latestState, userId);
  latestPreferences.emailEnabled = preferences.emailEnabled;
  latestPreferences.emailAddress = preferences.emailAddress;
  latestPreferences.alertsEnabled = preferences.alertsEnabled;
  latestPreferences.pushEnabled = preferences.pushEnabled;
  latestPreferences.syncFrequency = preferences.syncFrequency;
  latestPreferences.reservationAssist = preferences.reservationAssist;
  latestPreferences.plannerHubBooking = preferences.plannerHubBooking;
  latestPreferences.plannerHubConnection = applyActiveDeviceToConnection(
    preferences.plannerHubConnection,
    getActiveLocalWorkerDevice(latestState, userId)
  );
  latestPreferences.importedDisneyMembers = preferences.importedDisneyMembers;
  latestPreferences.savedReservationParties = preferences.savedReservationParties;

  await writeBackendState(latestState);

  return {
    preferences: {
      emailEnabled: preferences.emailEnabled,
      emailAddress: preferences.emailAddress,
      alertsEnabled: preferences.alertsEnabled,
      pushEnabled: preferences.pushEnabled,
      syncFrequency: normalizeSupportedFrequency(preferences.syncFrequency),
    },
    reservationAssist: preferences.reservationAssist,
    plannerHubBooking: preferences.plannerHubBooking,
    plannerHubConnection: preferences.plannerHubConnection,
    importedDisneyMembers: preferences.importedDisneyMembers,
    savedReservationParties: preferences.savedReservationParties,
  };
}

export async function createWatchItemForUser(
  userId: string,
  payload: Pick<WatchItem, "date" | "passType" | "preferredPark">,
  lastKnownFeed: FeedRow[]
) {
  const state = await readBackendState();
  const lookup = buildFeedLookup(lastKnownFeed);
  const preferences = getPreferencesFromState(state, userId);
  const nextStatus = resolveWatchItemStatus(
    { ...payload, selectedImportedMemberIds: [] },
    lookup,
    preferences.importedDisneyMembers
  );
  const now = new Date().toISOString();

  const duplicate = state.watchItems.find(
    (item) =>
      item.userId === userId &&
      item.date === payload.date &&
      item.passType === payload.passType &&
      item.preferredPark === payload.preferredPark
  );
  const checkedAt = state.syncMeta.lastAttemptedSyncAt || state.syncMeta.lastSuccessfulSyncAt || now;

  if (duplicate) {
    return {
      ok: false as const,
      error: "That watched date already exists for this account.",
    };
  }

  const nextItem: StoredWatchItem = {
    id: randomUUID(),
    userId,
    date: payload.date,
    passType: payload.passType,
    preferredPark: payload.preferredPark,
    currentStatus: nextStatus,
    previousStatus: null,
    lastCheckedAt: checkedAt,
    plannerHubId: "primary",
    selectedImportedMemberIds: [],
    bookingMode: "watch_only",
    createdAt: now,
    updatedAt: now,
  };

  state.watchItems.push(nextItem);
  await writeBackendState(state);

  return {
    ok: true as const,
    item: {
      id: nextItem.id,
      date: nextItem.date,
      passType: nextItem.passType,
      preferredPark: nextItem.preferredPark,
      currentStatus: nextItem.currentStatus,
      previousStatus: nextItem.previousStatus,
      lastCheckedAt: nextItem.lastCheckedAt,
      plannerHubId: nextItem.plannerHubId,
      selectedImportedMemberIds: nextItem.selectedImportedMemberIds,
      bookingMode: nextItem.bookingMode,
    },
  };
}

export async function deleteWatchItemForUser(userId: string, id: string) {
  const state = await readBackendState();
  const nextItems = state.watchItems.filter((item) => !(item.userId === userId && item.id === id));
  const removed = nextItems.length !== state.watchItems.length;
  state.watchItems = nextItems;
  await writeBackendState(state);
  return removed;
}

export async function importWatchItemsForUser(userId: string, items: WatchItem[]) {
  const feed = await readStoredFeed();
  const lookup = buildFeedLookup(feed);
  const state = await readBackendState();
  const preferences = getPreferencesFromState(state, userId);
  const existingKeys = new Set(
    state.watchItems
      .filter((item) => item.userId === userId)
      .map((item) => `${item.date}__${item.passType}__${item.preferredPark}`)
  );

  const now = new Date().toISOString();

  for (const item of items) {
    const key = `${item.date}__${item.passType}__${item.preferredPark}`;
    if (existingKeys.has(key)) continue;

    state.watchItems.push({
      id: item.id || randomUUID(),
      userId,
      date: item.date,
      passType: item.passType,
      preferredPark: item.preferredPark,
      currentStatus: resolveWatchItemStatus(
        {
          ...item,
          selectedImportedMemberIds: normalizeSelectedImportedMemberIds((item as WatchItem & { selectedImportedMemberIds?: string[] }).selectedImportedMemberIds),
        },
        lookup,
        preferences.importedDisneyMembers
      ),
      previousStatus: item.previousStatus ?? null,
      lastCheckedAt: item.lastCheckedAt || state.syncMeta.lastAttemptedSyncAt || state.syncMeta.lastSuccessfulSyncAt || now,
      plannerHubId: item.plannerHubId || "primary",
      selectedImportedMemberIds: normalizeSelectedImportedMemberIds((item as WatchItem & { selectedImportedMemberIds?: string[] }).selectedImportedMemberIds),
      bookingMode: normalizeBookingMode(item.bookingMode),
      createdAt: now,
      updatedAt: now,
    });
  }

  await writeBackendState(state);
}

export async function updateWatchItemForUser(
  userId: string,
  id: string,
  patch: Partial<Pick<WatchItem, "plannerHubId" | "selectedImportedMemberIds" | "bookingMode">>
) {
  const state = await readBackendState();
  const item = state.watchItems.find((row) => row.userId === userId && row.id === id);

  if (!item) {
    return {
      ok: false as const,
      error: "That watched date could not be found.",
    };
  }

  item.plannerHubId = typeof patch.plannerHubId === "string" && patch.plannerHubId ? patch.plannerHubId : item.plannerHubId || "primary";
  item.selectedImportedMemberIds =
    patch.selectedImportedMemberIds === undefined
      ? normalizeSelectedImportedMemberIds(item.selectedImportedMemberIds)
      : normalizeSelectedImportedMemberIds(patch.selectedImportedMemberIds);
  item.bookingMode = patch.bookingMode ? normalizeBookingMode(patch.bookingMode) : normalizeBookingMode(item.bookingMode);
  item.updatedAt = new Date().toISOString();

  const lookup = buildFeedLookup(await readStoredFeed());
  const preferences = getPreferencesFromState(state, userId);
  item.currentStatus = resolveWatchItemStatus(item, lookup, preferences.importedDisneyMembers);

  await writeBackendState(state);

  return {
    ok: true as const,
    item: {
      id: item.id,
      date: item.date,
      passType: item.passType,
      preferredPark: item.preferredPark,
      currentStatus: item.currentStatus,
      previousStatus: item.previousStatus,
      lastCheckedAt: item.lastCheckedAt,
      plannerHubId: item.plannerHubId,
      selectedImportedMemberIds: item.selectedImportedMemberIds,
      bookingMode: item.bookingMode,
    },
  };
}

export async function upsertPushSubscriptionForUser(
  userId: string,
  subscription: {
    endpoint: string;
    expirationTime?: number | null;
    keys?: {
      auth?: string;
      p256dh?: string;
    };
  }
) {
  const state = await readBackendState();
  const existing = state.pushSubscriptions.find(
    (item) => item.userId === userId && item.endpoint === subscription.endpoint
  );
  const now = new Date().toISOString();

  if (existing) {
    existing.expirationTime = subscription.expirationTime ?? null;
    existing.keys = {
      auth: subscription.keys?.auth ?? existing.keys.auth,
      p256dh: subscription.keys?.p256dh ?? existing.keys.p256dh,
    };
    existing.updatedAt = now;
  } else {
    state.pushSubscriptions.push({
      id: randomUUID(),
      userId,
      endpoint: subscription.endpoint,
      expirationTime: subscription.expirationTime ?? null,
      keys: {
        auth: subscription.keys?.auth ?? "",
        p256dh: subscription.keys?.p256dh ?? "",
      },
      createdAt: now,
      updatedAt: now,
    });
  }

  const preferences = getPreferencesFromState(state, userId);
  preferences.pushEnabled = true;
  preferences.alertsEnabled = true;

  await writeBackendState(state);
}

export async function removePushSubscriptionForUser(userId: string, endpoint: string) {
  const state = await readBackendState();
  state.pushSubscriptions = state.pushSubscriptions.filter(
    (item) => !(item.userId === userId && item.endpoint === endpoint)
  );

  const stillHasPush = state.pushSubscriptions.some((item) => item.userId === userId);
  const preferences = getPreferencesFromState(state, userId);
  preferences.pushEnabled = stillHasPush;

  await writeBackendState(state);
}

export function getPushSubscriptionsForUser(state: BackendState, userId: string) {
  return state.pushSubscriptions.filter((item) => item.userId === userId);
}

export function shouldEvaluateFrequency(lastEvaluatedAt: string, frequency: FrequencyType, now = Date.now()) {
  if (frequency === "manual") return false;
  if (!lastEvaluatedAt) return true;
  return now - new Date(lastEvaluatedAt).getTime() >= frequencyToMs(frequency);
}

export async function evaluateWatchItemsAgainstFeed(rows: FeedRow[]) {
  const state = await readBackendState();
  const lookup = buildFeedLookup(rows);
  const nowIso = new Date().toISOString();
  const checkedAt =
    state.syncMeta.lastAttemptedSyncAt || state.syncMeta.lastSuccessfulSyncAt || nowIso;
  const changesByUser = new Map<string, AlertChange[]>();
  const evaluatedUserIds: string[] = [];

  for (const user of state.users) {
    const preferences = getPreferencesFromState(state, user.id);

    if (!shouldEvaluateFrequency(preferences.lastEvaluatedAt, preferences.syncFrequency)) {
      continue;
    }

    const items = getWatchItemsForUser(state, user.id);
    const userChanges: AlertChange[] = [];
    evaluatedUserIds.push(user.id);
    const importedMembers = preferences.importedDisneyMembers;

    for (const item of items) {
      const nextStatus = resolveWatchItemStatus(item, lookup, importedMembers);
      const previousStatus = item.currentStatus;

      if (nextStatus !== previousStatus) {
        userChanges.push({ item, previousStatus, currentStatus: nextStatus });
      }

      item.previousStatus = nextStatus !== previousStatus ? previousStatus : item.previousStatus;
      item.currentStatus = nextStatus;
      item.lastCheckedAt = checkedAt;
      item.updatedAt = nowIso;
    }

    preferences.lastEvaluatedAt = nowIso;

    if (userChanges.length > 0) {
      changesByUser.set(user.id, userChanges);
    }
  }

  await writeBackendState(state);
  return { state, changesByUser, evaluatedUserIds };
}

function getPlannerHubSecretRecord(state: BackendState, userId: string, plannerHubId = "primary") {
  return state.plannerHubSecrets.find((item) => item.userId === userId && item.plannerHubId === plannerHubId) ?? null;
}

function getLocalWorkerDevicesForUser(state: BackendState, userId: string) {
  return state.localWorkerDevices.filter((item) => item.userId === userId);
}

function getLocalWorkerDevice(state: BackendState, userId: string, deviceId: string) {
  return state.localWorkerDevices.find((item) => item.userId === userId && item.id === deviceId) ?? null;
}

function getActiveLocalWorkerDevice(state: BackendState, userId: string) {
  const devices = getLocalWorkerDevicesForUser(state, userId);
  return (
    devices
      .filter((device) => device.status === "active")
      .sort((left, right) => Date.parse(right.lastSeenAt || right.lastCheckInAt) - Date.parse(left.lastSeenAt || left.lastCheckInAt))[0] ??
    null
  );
}

function markOtherDevicesInactive(state: BackendState, userId: string, activeDeviceId: string) {
  for (const device of state.localWorkerDevices) {
    if (device.userId !== userId || device.id === activeDeviceId) continue;
    if (device.status !== "stale") {
      device.status = "inactive";
    }
  }
}

function upsertLocalWorkerDevice(
  state: BackendState,
  userId: string,
  patch: Pick<LocalWorkerDeviceRecord, "id" | "deviceName" | "platform" | "localProfilePath"> &
    Partial<
      Pick<
        LocalWorkerDeviceRecord,
        "status" | "lastCheckInAt" | "lastSeenAt" | "lastJobId" | "lastJobPhase" | "lastJobMessage" | "claimedPlannerHubId" | "hasLocalSession"
      >
    >
) {
  let record = getLocalWorkerDevice(state, userId, patch.id);
  if (!record) {
    record = normalizeLocalWorkerDevices([{ userId, ...patch }])[0];
    state.localWorkerDevices.push(record);
  }

  record.deviceName = patch.deviceName || record.deviceName || "My Mac";
  record.platform = patch.platform || record.platform || "macos";
  record.localProfilePath = patch.localProfilePath || record.localProfilePath;
  record.status = patch.status ? normalizeLocalWorkerDeviceStatus(patch.status) : record.status;
  record.lastCheckInAt = patch.lastCheckInAt ?? record.lastCheckInAt;
  record.lastSeenAt = patch.lastSeenAt ?? record.lastSeenAt;
  record.lastJobId = patch.lastJobId ?? record.lastJobId;
  record.lastJobPhase = patch.lastJobPhase ?? record.lastJobPhase;
  record.lastJobMessage = patch.lastJobMessage ?? record.lastJobMessage;
  record.claimedPlannerHubId = patch.claimedPlannerHubId ?? record.claimedPlannerHubId;
  record.hasLocalSession = patch.hasLocalSession ?? record.hasLocalSession;

  return record;
}

function isPendingPasswordFresh(record: PlannerHubSecretRecord | null) {
  if (!record?.encryptedPendingPassword) return false;
  return Date.now() - Date.parse(record.updatedAt) <= DISNEY_PENDING_PASSWORD_TTL_MS;
}

function upsertPlannerHubSecretRecord(
  state: BackendState,
  userId: string,
  plannerHubId: string,
  patch: Partial<Pick<PlannerHubSecretRecord, "encryptedSessionState" | "encryptedPendingPassword">>
) {
  const now = new Date().toISOString();
  let record = getPlannerHubSecretRecord(state, userId, plannerHubId);

  if (!record) {
    record = {
      id: randomUUID(),
      userId,
      plannerHubId,
      encryptedSessionState: "",
      encryptedPendingPassword: "",
      updatedAt: now,
    };
    state.plannerHubSecrets.push(record);
  }

  if (patch.encryptedSessionState !== undefined) {
    record.encryptedSessionState = patch.encryptedSessionState;
  }
  if (patch.encryptedPendingPassword !== undefined) {
    record.encryptedPendingPassword = patch.encryptedPendingPassword;
  }
  record.updatedAt = now;
  return record;
}

function findPlannerHubJob(state: BackendState, id: string) {
  return state.plannerHubJobs.find((job) => job.id === id) ?? null;
}

function getLatestPlannerHubJobForUser(state: BackendState, userId: string, plannerHubId = "primary") {
  return (
    state.plannerHubJobs
      .filter((job) => job.userId === userId && job.plannerHubId === plannerHubId)
      .sort((a, b) => Date.parse(b.updatedAt || b.queuedAt) - Date.parse(a.updatedAt || a.queuedAt))[0] ?? null
  );
}

function getLatestPlannerHubJobForUserByType(
  state: BackendState,
  userId: string,
  plannerHubId: string,
  type: DisneyWorkerJobType
) {
  return (
    state.plannerHubJobs
      .filter((job) => job.userId === userId && job.plannerHubId === plannerHubId && job.type === type)
      .sort((a, b) => Date.parse(b.updatedAt || b.queuedAt) - Date.parse(a.updatedAt || a.queuedAt))[0] ?? null
  );
}

function serializePlannerHubJob(job: PlannerHubJobRecord | null): DisneyWorkerJob | null {
  if (!job) return null;
  return {
    id: job.id,
    plannerHubId: job.plannerHubId,
    assignedDeviceId: job.assignedDeviceId,
    type: job.type,
    status: job.status,
    phase: job.phase,
    queuedAt: job.queuedAt,
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
    finishedAt: job.finishedAt,
    lastMessage: job.lastMessage,
    lastError: job.lastError,
    reportedBy: job.reportedBy,
    attemptCount: job.attempts,
    events: job.events,
    diagnostics: job.diagnostics,
  };
}

function applyActiveDeviceToConnection(
  connection: PlannerHubConnectionState,
  device: LocalWorkerDeviceRecord | null
): PlannerHubConnectionState {
  return normalizePlannerHubConnection(
    {
      ...connection,
      activeDeviceId: device?.id || "",
      activeDeviceName: device?.deviceName || "",
      activeDevicePlatform: device?.platform || "",
      activeDeviceStatus: device?.status || "",
      activeDeviceLastSeenAt: device?.lastSeenAt || device?.lastCheckInAt || "",
      hasLocalSession: device?.hasLocalSession ?? connection.hasLocalSession,
    },
    connection.disneyEmail
  );
}

function appendJobEvent(job: PlannerHubJobRecord, phase: DisneyWorkerPhase, message: string, at = new Date().toISOString()) {
  job.phase = phase;
  job.updatedAt = at;
  job.lastMessage = message;
  job.events = [...normalizeDisneyWorkerEvents(job.events), { phase, at, message }];
}

function isPlannerHubJobStale(job: PlannerHubJobRecord | null) {
  if (!job) return true;
  const reference = job.claimedAt || job.queuedAt;
  return Date.now() - Date.parse(reference) > PLANNER_HUB_JOB_STALE_MS;
}

function synchronizePlannerHubConnectionState(
  state: BackendState,
  userId: string,
  preferences: StoredPreferences
) {
  const connection = preferences.plannerHubConnection;
  if (connection.status !== "pending_connect" && connection.status !== "importing") {
    return false;
  }

  const job = connection.lastJobId ? findPlannerHubJob(state, connection.lastJobId) : null;

  if (job?.status === "failed") {
    preferences.plannerHubConnection = normalizePlannerHubConnection(
      {
        ...connection,
        status: "failed",
        latestJobStatus: "failed",
        latestPhase: job.phase || "failed",
        latestPhaseMessage: job.lastMessage || job.lastError || "The last Disney worker attempt failed.",
        latestPhaseAt: job.updatedAt || job.finishedAt || job.claimedAt || job.queuedAt,
        latestJobUpdatedAt: job.updatedAt || job.finishedAt || job.claimedAt || job.queuedAt,
        lastAuthFailureReason: job.lastError || "The Disney worker could not finish the last planner-hub job.",
        lastRequiredActionMessage: "Reconnect Disney and try the planner-hub flow again.",
        lastReportedJobId: job.id,
      },
      connection.disneyEmail
    );
    return true;
  }

  if (
    !job ||
    job.status === "completed" ||
    ((job.status === "queued" || job.status === "processing") && isPlannerHubJobStale(job))
  ) {
    upsertPlannerHubSecretRecord(state, userId, connection.plannerHubId || "primary", {
      encryptedPendingPassword: "",
    });
    preferences.plannerHubConnection = normalizePlannerHubConnection(
      {
        ...connection,
        status: "failed",
        latestJobStatus: job?.status || "failed",
        latestPhase: job?.phase || "failed",
        latestPhaseMessage:
          job?.lastMessage ||
          job?.lastError ||
          `The Disney ${connection.status === "importing" ? "import" : "connection"} job is no longer active.`,
        latestPhaseAt: job?.updatedAt || job?.finishedAt || job?.claimedAt || job?.queuedAt || "",
        latestJobUpdatedAt: job?.updatedAt || job?.finishedAt || job?.claimedAt || job?.queuedAt || "",
        lastAuthFailureReason:
          job?.lastError ||
          `The Disney ${connection.status === "importing" ? "import" : "connection"} job is no longer active.`,
        lastRequiredActionMessage:
          connection.status === "importing"
            ? "Refresh Disney or reconnect the planner hub before importing members again."
            : "Reconnect Disney so the worker can capture a fresh planner session.",
      },
      connection.disneyEmail
    );
    return true;
  }

  return false;
}

export async function queuePlannerHubConnectJob(userId: string, disneyEmail: string, password: string) {
  if (!process.env.DISNEY_SESSION_SECRET) {
    throw new Error("DISNEY_SESSION_SECRET is not configured yet.");
  }

  const state = await readBackendState();
  const preferences = getPreferencesFromState(state, userId);
  const now = new Date().toISOString();
  const plannerHubId = preferences.plannerHubConnection.plannerHubId || "primary";
  const activeDevice = getActiveLocalWorkerDevice(state, userId);
  state.plannerHubJobs = state.plannerHubJobs.filter(
    (existingJob) =>
      !(
        existingJob.userId === userId &&
        existingJob.plannerHubId === plannerHubId &&
        existingJob.type === "connect" &&
        (existingJob.status === "queued" || existingJob.status === "processing")
      )
  );
  const job: PlannerHubJobRecord = {
    id: randomUUID(),
    userId,
    plannerHubId,
    assignedDeviceId: activeDevice?.id || "",
    type: "connect",
    status: "queued",
    phase: "queued",
    disneyEmail,
    queuedAt: now,
    claimedAt: "",
    startedAt: "",
    updatedAt: now,
    finishedAt: "",
    attempts: 0,
    reportedBy: "",
    lastMessage: "Disney connection queued and waiting for the worker.",
    lastError: "",
    events: [{ phase: "queued", at: now, message: "Disney connection queued and waiting for the worker." }],
    diagnostics: null,
  };

  upsertPlannerHubSecretRecord(state, userId, plannerHubId, {
    encryptedPendingPassword: password ? encryptSensitiveValue(password) : "",
  });
  state.plannerHubJobs.push(job);

  preferences.reservationAssist = normalizeReservationAssist(
    {
      ...preferences.reservationAssist,
      plannerHubEmail: disneyEmail,
      plannerHubConfirmed: true,
      lastVerifiedAt: now,
      lastVerifiedFlowNote: "Queued Disney planner-hub connection.",
    },
    disneyEmail
  );
  preferences.plannerHubConnection = normalizePlannerHubConnection(
    {
      ...preferences.plannerHubConnection,
      disneyEmail,
      status: "pending_connect",
      latestJobStatus: "queued",
      latestPhase: "queued",
      latestPhaseMessage: "Disney connection queued and waiting for the worker.",
      latestPhaseAt: now,
      latestJobUpdatedAt: now,
      lastJobId: job.id,
      lastJobType: "connect",
      lastQueuedJobId: job.id,
      lastRequiredActionMessage: activeDevice
        ? `Local Disney worker on ${activeDevice.deviceName} is connecting and capturing session state.`
        : "Open the local Disney worker on one of your Macs so it can claim this queued connection.",
      lastAuthFailureReason: "",
      activeDeviceId: activeDevice?.id || preferences.plannerHubConnection.activeDeviceId,
      activeDeviceName: activeDevice?.deviceName || preferences.plannerHubConnection.activeDeviceName,
      activeDevicePlatform: activeDevice?.platform || preferences.plannerHubConnection.activeDevicePlatform,
      activeDeviceStatus: activeDevice?.status || preferences.plannerHubConnection.activeDeviceStatus,
      activeDeviceLastSeenAt:
        activeDevice?.lastSeenAt || activeDevice?.lastCheckInAt || preferences.plannerHubConnection.activeDeviceLastSeenAt,
    },
    disneyEmail
  );

  await writeBackendState(state);
  return job;
}

export async function queuePlannerHubImportJob(userId: string) {
  const state = await readBackendState();
  const preferences = getPreferencesFromState(state, userId);
  const plannerHubId = preferences.plannerHubConnection.plannerHubId || "primary";
  const activeDevice = getActiveLocalWorkerDevice(state, userId);

  const now = new Date().toISOString();
  const job: PlannerHubJobRecord = {
    id: randomUUID(),
    userId,
    plannerHubId,
    assignedDeviceId: activeDevice?.id || "",
    type: "import",
    status: "queued",
    phase: "queued",
    disneyEmail: preferences.plannerHubConnection.disneyEmail || preferences.reservationAssist.plannerHubEmail,
    queuedAt: now,
    claimedAt: "",
    startedAt: "",
    updatedAt: now,
    finishedAt: "",
    attempts: 0,
    reportedBy: "",
    lastMessage: "Disney member import queued and waiting for the worker.",
    lastError: "",
    events: [{ phase: "queued", at: now, message: "Disney member import queued and waiting for the worker." }],
    diagnostics: null,
  };

  state.plannerHubJobs.push(job);
  preferences.plannerHubConnection = normalizePlannerHubConnection(
    {
      ...preferences.plannerHubConnection,
      status: "importing",
      latestJobStatus: "queued",
      latestPhase: "queued",
      latestPhaseMessage: "Disney member import queued and waiting for the worker.",
      latestPhaseAt: now,
      latestJobUpdatedAt: now,
      lastJobId: job.id,
      lastJobType: "import",
      lastQueuedJobId: job.id,
      lastRequiredActionMessage: activeDevice
        ? `Local Disney worker on ${activeDevice.deviceName} is importing the current connected members.`
        : "Open the local Disney worker on one of your Macs so it can claim this queued import.",
      lastAuthFailureReason: "",
      lastImportJobId: job.id,
      lastImportQueuedAt: now,
      lastImportStatus: "queued",
      lastImportMessage: "Disney member import queued and waiting for the worker.",
      lastImportError: "",
      activeDeviceId: activeDevice?.id || preferences.plannerHubConnection.activeDeviceId,
      activeDeviceName: activeDevice?.deviceName || preferences.plannerHubConnection.activeDeviceName,
      activeDevicePlatform: activeDevice?.platform || preferences.plannerHubConnection.activeDevicePlatform,
      activeDeviceStatus: activeDevice?.status || preferences.plannerHubConnection.activeDeviceStatus,
      activeDeviceLastSeenAt:
        activeDevice?.lastSeenAt || activeDevice?.lastCheckInAt || preferences.plannerHubConnection.activeDeviceLastSeenAt,
    },
    preferences.plannerHubConnection.disneyEmail
  );

  await writeBackendState(state);
  return job;
}

export async function issueLocalWorkerPairingToken(userId: string, deviceName = "My Mac") {
  return {
    token: createLocalWorkerToken(userId),
    deviceId: randomUUID(),
    deviceName,
  };
}

export async function checkInLocalWorkerDevice(
  userId: string,
  payload: {
    deviceId: string;
    deviceName: string;
    platform: string;
    localProfilePath: string;
    hasLocalSession?: boolean;
  }
) {
  const state = await readBackendState();
  const preferences = getPreferencesFromState(state, userId);
  const now = new Date().toISOString();
  const device = upsertLocalWorkerDevice(state, userId, {
    id: payload.deviceId,
    deviceName: payload.deviceName,
    platform: payload.platform,
    localProfilePath: payload.localProfilePath,
    status: "active",
    lastCheckInAt: now,
    lastSeenAt: now,
    claimedPlannerHubId: preferences.plannerHubConnection.plannerHubId || "primary",
    hasLocalSession: payload.hasLocalSession ?? preferences.plannerHubConnection.hasLocalSession,
  });
  markOtherDevicesInactive(state, userId, device.id);
  preferences.plannerHubConnection = applyActiveDeviceToConnection(preferences.plannerHubConnection, device);
  preferences.plannerHubConnection = normalizePlannerHubConnection(
    {
      ...preferences.plannerHubConnection,
      hasLocalSession: payload.hasLocalSession ?? preferences.plannerHubConnection.hasLocalSession,
      latestPhaseMessage:
        preferences.plannerHubConnection.status === "pending_connect" || preferences.plannerHubConnection.status === "importing"
          ? preferences.plannerHubConnection.latestPhaseMessage
          : `Local Disney worker on ${device.deviceName} is ready on this account.`,
      latestJobUpdatedAt: now,
    },
    preferences.plannerHubConnection.disneyEmail
  );
  state.syncMeta = {
    ...state.syncMeta,
    lastWorkerPollAt: now,
    lastWorkerPollMessage: `Local Disney worker on ${device.deviceName} checked in.`,
  };
  await writeBackendState(state);
  return { device };
}

export async function claimNextPlannerHubJobForLocalDevice(
  userId: string,
  payload: {
    deviceId: string;
    deviceName: string;
    platform: string;
    localProfilePath: string;
    hasLocalSession?: boolean;
  }
): Promise<PlannerHubClaimResult> {
  const state = await readBackendState();
  const pollAt = new Date().toISOString();
  const preferences = getPreferencesFromState(state, userId);
  const diagnostics = buildPlannerHubJobDiagnostics(state);
  const device = upsertLocalWorkerDevice(state, userId, {
    id: payload.deviceId,
    deviceName: payload.deviceName,
    platform: payload.platform,
    localProfilePath: payload.localProfilePath,
    status: "active",
    lastCheckInAt: pollAt,
    lastSeenAt: pollAt,
    claimedPlannerHubId: preferences.plannerHubConnection.plannerHubId || "primary",
    hasLocalSession: payload.hasLocalSession ?? preferences.plannerHubConnection.hasLocalSession,
  });
  markOtherDevicesInactive(state, userId, device.id);
  preferences.plannerHubConnection = applyActiveDeviceToConnection(preferences.plannerHubConnection, device);

  let job = state.plannerHubJobs.find((entry) => entry.userId === userId && entry.status === "queued");
  if (!job) {
    state.syncMeta = {
      ...state.syncMeta,
      lastWorkerPollAt: pollAt,
      lastWorkerPollMessage: `Local Disney worker on ${device.deviceName} checked in, but no queued planner-hub job was waiting.`,
    };
    preferences.plannerHubConnection = normalizePlannerHubConnection(
      {
        ...preferences.plannerHubConnection,
        latestJobUpdatedAt: pollAt,
      },
      preferences.plannerHubConnection.disneyEmail
    );
    await writeBackendState(state);
    return null;
  }

  if (job.type === "connect") {
    const secret = getPlannerHubSecretRecord(state, job.userId, job.plannerHubId);
    if (secret?.encryptedPendingPassword && !isPendingPasswordFresh(secret)) {
      job.status = "failed";
      job.phase = "failed";
      job.finishedAt = pollAt;
      job.updatedAt = pollAt;
      job.lastMessage = "Disney password handoff expired before the local worker claimed it.";
      job.lastError = job.lastMessage;
      job.events = [...normalizeDisneyWorkerEvents(job.events), { phase: "failed", at: pollAt, message: job.lastMessage }];
      upsertPlannerHubSecretRecord(state, job.userId, job.plannerHubId, {
        encryptedPendingPassword: "",
      });
      preferences.plannerHubConnection = normalizePlannerHubConnection(
        {
          ...preferences.plannerHubConnection,
          status: "paused_login",
          latestJobStatus: "failed",
          latestPhase: "paused_login",
          latestPhaseMessage: "Stored Disney password handoff expired before this Mac claimed the job.",
          latestPhaseAt: pollAt,
          latestJobUpdatedAt: pollAt,
          lastAuthFailureReason: "Stored Disney password handoff expired before this Mac claimed the job.",
          lastRequiredActionMessage: "Connect Disney again or refresh the local session on this Mac.",
          lastReportedJobId: job.id,
        },
        preferences.plannerHubConnection.disneyEmail
      );
      await writeBackendState(state);
      return null;
    }
  }

  job.assignedDeviceId = device.id;
  job.status = "processing";
  job.claimedAt = pollAt;
  job.startedAt = job.startedAt || pollAt;
  job.attempts += 1;
  appendJobEvent(job, "started", `Local worker on ${device.deviceName} started the ${job.type} job.`, pollAt);
  device.lastJobId = job.id;
  device.lastJobPhase = "started";
  device.lastJobMessage = `Started ${job.type} job.`;
  state.syncMeta = {
    ...state.syncMeta,
    lastWorkerPollAt: pollAt,
    lastWorkerPollMessage: `Local Disney worker on ${device.deviceName} claimed the ${job.type} job.`,
  };
  preferences.plannerHubConnection = normalizePlannerHubConnection(
    {
      ...preferences.plannerHubConnection,
      status: job.type === "import" ? "importing" : "pending_connect",
      latestJobStatus: "processing",
      latestPhase: "started",
      latestPhaseMessage: `Local worker on ${device.deviceName} started the ${job.type} job.`,
      latestPhaseAt: pollAt,
      latestJobUpdatedAt: pollAt,
      lastClaimedJobId: job.id,
      lastJobId: job.id,
      lastJobType: job.type,
      lastRequiredActionMessage: `Local Disney worker on ${device.deviceName} is processing this job.`,
      lastImportJobId: job.type === "import" ? job.id : preferences.plannerHubConnection.lastImportJobId,
      lastImportStartedAt: job.type === "import" ? pollAt : preferences.plannerHubConnection.lastImportStartedAt,
      lastImportStatus: job.type === "import" ? "processing" : preferences.plannerHubConnection.lastImportStatus,
      lastImportMessage:
        job.type === "import"
          ? `Local worker on ${device.deviceName} started the import job.`
          : preferences.plannerHubConnection.lastImportMessage,
      lastImportError: job.type === "import" ? "" : preferences.plannerHubConnection.lastImportError,
      activeDeviceId: device.id,
      activeDeviceName: device.deviceName,
      activeDevicePlatform: device.platform,
      activeDeviceStatus: device.status,
      activeDeviceLastSeenAt: device.lastSeenAt,
      hasLocalSession: device.hasLocalSession,
    },
    preferences.plannerHubConnection.disneyEmail
  );
  const secret = getPlannerHubSecretRecord(state, job.userId, job.plannerHubId);
  await writeBackendState(state);

  return {
    job: {
      id: job.id,
      type: job.type,
      userId: job.userId,
      plannerHubId: job.plannerHubId,
      disneyEmail: job.disneyEmail,
    },
    payload: {
      disneyEmail: job.disneyEmail || preferences.plannerHubConnection.disneyEmail,
      password:
        job.type === "connect" && secret?.encryptedPendingPassword
          ? decryptSensitiveValue(secret.encryptedPendingPassword)
          : "",
      sessionState: null,
    },
    diagnostics,
  };
}

export async function claimNextPlannerHubJob(): Promise<PlannerHubClaimResult> {
  const state = await readBackendState();
  const pollAt = new Date().toISOString();
  const diagnostics = buildPlannerHubJobDiagnostics(state);
  let job: PlannerHubJobRecord | undefined = state.plannerHubJobs.find((entry) => entry.status === "queued");
  if (!job) {
    state.syncMeta = {
      ...state.syncMeta,
      lastWorkerPollAt: pollAt,
      lastWorkerPollMessage: "Disney worker checked in, but no queued planner-hub job was waiting.",
    };
    await writeBackendState(state);
    return null;
  }

  if (job.type === "connect") {
    const secret = getPlannerHubSecretRecord(state, job.userId, job.plannerHubId);
    if (!isPendingPasswordFresh(secret)) {
      job.status = "failed";
      job.phase = "failed";
      job.finishedAt = new Date().toISOString();
      job.updatedAt = job.finishedAt;
      job.lastMessage = "Disney password handoff expired before the worker claimed it.";
      job.lastError = "Disney password handoff expired before the worker claimed it.";
      job.events = [
        ...normalizeDisneyWorkerEvents(job.events),
        { phase: "failed", at: job.finishedAt, message: job.lastMessage },
      ];

      const preferences = getPreferencesFromState(state, job.userId);
      upsertPlannerHubSecretRecord(state, job.userId, job.plannerHubId, {
        encryptedPendingPassword: "",
      });
      preferences.plannerHubConnection = normalizePlannerHubConnection(
        {
          ...preferences.plannerHubConnection,
          status: "paused_login",
          latestJobStatus: "failed",
          latestPhase: "paused_login",
          latestPhaseMessage: "Disney password handoff expired before connection could begin.",
          latestPhaseAt: job.finishedAt,
          latestJobUpdatedAt: job.finishedAt,
          lastJobId: job.id,
          lastJobType: "connect",
          lastQueuedJobId: job.id,
          lastReportedJobId: job.id,
          lastAuthFailureReason: "Disney password handoff expired before connection could begin.",
          lastRequiredActionMessage: "Reconnect Disney so the worker can capture a fresh session.",
        },
        preferences.plannerHubConnection.disneyEmail
      );
      await writeBackendState(state);
      job = state.plannerHubJobs.find((entry) => entry.status === "queued");
      if (!job) {
        state.syncMeta = {
          ...state.syncMeta,
          lastWorkerPollAt: pollAt,
          lastWorkerPollMessage: "Disney worker checked in, but the queued planner-hub password handoff had already expired.",
        };
        await writeBackendState(state);
        return null;
      }
    }
  }

  if (!job) return null;

  job.status = "processing";
  job.claimedAt = new Date().toISOString();
  job.startedAt = job.startedAt || job.claimedAt;
  job.attempts += 1;
  appendJobEvent(job, "started", `Worker started the ${job.type} job for ${job.disneyEmail || "the planner hub"}.`, job.claimedAt);
  state.syncMeta = {
    ...state.syncMeta,
    lastWorkerPollAt: pollAt,
    lastWorkerPollMessage: `Disney worker claimed the queued ${job.type} job for ${job.disneyEmail || "the planner hub"}.`,
  };

  const preferences = getPreferencesFromState(state, job.userId);
  preferences.plannerHubConnection = normalizePlannerHubConnection(
    {
      ...preferences.plannerHubConnection,
      status: job.type === "import" ? "importing" : "pending_connect",
      latestJobStatus: "processing",
      latestPhase: "started",
      latestPhaseMessage: `Worker started the ${job.type} job for ${job.disneyEmail || "the planner hub"}.`,
      latestPhaseAt: job.claimedAt,
      latestJobUpdatedAt: job.claimedAt,
      lastClaimedJobId: job.id,
      lastJobId: job.id,
      lastJobType: job.type,
      lastRequiredActionMessage: `Disney worker claimed the ${job.type} job and is now processing it.`,
      lastImportJobId: job.type === "import" ? job.id : preferences.plannerHubConnection.lastImportJobId,
      lastImportStartedAt: job.type === "import" ? job.claimedAt : preferences.plannerHubConnection.lastImportStartedAt,
      lastImportStatus: job.type === "import" ? "processing" : preferences.plannerHubConnection.lastImportStatus,
      lastImportMessage:
        job.type === "import"
          ? `Disney worker started the import job for ${job.disneyEmail || "the planner hub"}.`
          : preferences.plannerHubConnection.lastImportMessage,
      lastImportError: job.type === "import" ? "" : preferences.plannerHubConnection.lastImportError,
    },
    preferences.plannerHubConnection.disneyEmail
  );
  const secret = getPlannerHubSecretRecord(state, job.userId, job.plannerHubId);
  await writeBackendState(state);

  return {
    job: {
      id: job.id,
      type: job.type,
      userId: job.userId,
      plannerHubId: job.plannerHubId,
      disneyEmail: job.disneyEmail,
    },
    payload: {
      disneyEmail: job.disneyEmail || preferences.plannerHubConnection.disneyEmail,
      password:
        job.type === "connect" && secret?.encryptedPendingPassword
          ? decryptSensitiveValue(secret.encryptedPendingPassword)
          : "",
      sessionState:
        secret?.encryptedSessionState ? JSON.parse(decryptSensitiveValue(secret.encryptedSessionState)) : null,
    },
    diagnostics,
  };
}

export async function reportPlannerHubJobProgress(
  jobId: string,
  payload: {
    phase: DisneyWorkerPhase;
    message: string;
    reportedBy?: string;
    deviceId?: string;
    hasLocalSession?: boolean;
  }
) {
  const state = await readBackendState();
  const job = findPlannerHubJob(state, jobId);
  if (!job) {
    throw new Error("Planner hub job not found.");
  }

  const now = new Date().toISOString();
  const preferences = getPreferencesFromState(state, job.userId);
  appendJobEvent(job, payload.phase, payload.message, now);
  job.status =
    payload.phase === "completed" || payload.phase === "failed" || payload.phase === "paused_login" || payload.phase === "paused_mismatch"
      ? job.status
      : "processing";
  job.reportedBy = payload.reportedBy || job.reportedBy;

  const nextConnectionStatus: DisneyPlannerConnectionStatus =
    payload.phase === "paused_login"
      ? "paused_login"
      : payload.phase === "paused_mismatch"
        ? "paused_mismatch"
        : payload.phase === "completed"
          ? "connected"
          : payload.phase === "failed"
            ? "failed"
            : job.type === "import"
              ? "importing"
            : "pending_connect";

  const device = payload.deviceId ? getLocalWorkerDevice(state, job.userId, payload.deviceId) : null;
  if (device) {
    job.assignedDeviceId = device.id;
    device.lastSeenAt = now;
    device.lastJobId = job.id;
    device.lastJobPhase = payload.phase;
    device.lastJobMessage = payload.message;
    device.status = "active";
    if (payload.hasLocalSession !== undefined) {
      device.hasLocalSession = payload.hasLocalSession;
    }
    markOtherDevicesInactive(state, job.userId, device.id);
  }

  preferences.plannerHubConnection = normalizePlannerHubConnection(
    {
      ...preferences.plannerHubConnection,
      status: nextConnectionStatus,
      latestJobStatus: job.status,
      latestPhase: payload.phase,
      latestPhaseMessage: payload.message,
      latestPhaseAt: now,
      latestJobUpdatedAt: now,
      lastJobId: job.id,
      lastJobType: job.type,
      lastClaimedJobId: preferences.plannerHubConnection.lastClaimedJobId || job.id,
      lastRequiredActionMessage:
        payload.phase === "paused_login"
          ? "Disney needs a fresh login or one-time code before the worker can continue."
          : payload.phase === "paused_mismatch"
            ? "Disney opened, but the expected planner flow or party no longer matched."
            : preferences.plannerHubConnection.lastRequiredActionMessage,
      lastImportJobId: job.type === "import" ? job.id : preferences.plannerHubConnection.lastImportJobId,
      lastImportStartedAt:
        job.type === "import" ? job.startedAt || now : preferences.plannerHubConnection.lastImportStartedAt,
      lastImportStatus: job.type === "import" ? job.status : preferences.plannerHubConnection.lastImportStatus,
      lastImportMessage: job.type === "import" ? payload.message : preferences.plannerHubConnection.lastImportMessage,
      lastImportError:
        job.type === "import" && (payload.phase === "paused_login" || payload.phase === "paused_mismatch" || payload.phase === "failed")
          ? payload.message
          : job.type === "import"
            ? preferences.plannerHubConnection.lastImportError
            : preferences.plannerHubConnection.lastImportError,
      activeDeviceId: device?.id || preferences.plannerHubConnection.activeDeviceId,
      activeDeviceName: device?.deviceName || preferences.plannerHubConnection.activeDeviceName,
      activeDevicePlatform: device?.platform || preferences.plannerHubConnection.activeDevicePlatform,
      activeDeviceStatus: device?.status || preferences.plannerHubConnection.activeDeviceStatus,
      activeDeviceLastSeenAt: device?.lastSeenAt || preferences.plannerHubConnection.activeDeviceLastSeenAt,
      hasLocalSession: payload.hasLocalSession ?? device?.hasLocalSession ?? preferences.plannerHubConnection.hasLocalSession,
    },
    preferences.plannerHubConnection.disneyEmail || job.disneyEmail
  );

  state.syncMeta = {
    ...state.syncMeta,
    lastWorkerPollAt: now,
    lastWorkerPollMessage: payload.message,
  };

  await writeBackendState(state);
}

export async function completePlannerHubJob(
  jobId: string,
  payload: {
    ok: boolean;
    status: DisneyPlannerConnectionStatus;
    importedDisneyMembers?: ImportedDisneyMember[];
    diagnostics?: DisneyWorkerJobDiagnostics | null;
    encryptedSessionState?: string;
    sessionState?: unknown;
    lastAuthFailureReason?: string;
    lastRequiredActionMessage?: string;
    note?: string;
    reportedBy?: string;
    deviceId?: string;
    hasLocalSession?: boolean;
  }
) {
  const state = await readBackendState();
  const job = findPlannerHubJob(state, jobId);
  if (!job) {
    throw new Error("Planner hub job not found.");
  }

  const preferences = getPreferencesFromState(state, job.userId);
  const now = new Date().toISOString();
  const rawImportedMembers = Array.isArray(payload.importedDisneyMembers) ? payload.importedDisneyMembers : [];
  const importedMembers = normalizeImportedDisneyMembers(rawImportedMembers);
  const diagnostics = normalizeDisneyWorkerJobDiagnostics(payload.diagnostics);
  const sanitizedAwayCount = Math.max(0, rawImportedMembers.length - importedMembers.length);
  if (diagnostics) {
    diagnostics.acceptedMemberCount = importedMembers.length;
    diagnostics.rejectedMemberCount = Math.max(diagnostics.rejectedMemberCount, sanitizedAwayCount);
    if (sanitizedAwayCount > 0) {
      diagnostics.rejectionReasons = Array.from(
        new Set([...diagnostics.rejectionReasons, `${sanitizedAwayCount} extracted row(s) were rejected during normalization.`])
      );
    }
  }
  const importCollapsedToZero =
    job.type === "import" &&
    payload.ok &&
    rawImportedMembers.length > 0 &&
    importedMembers.length === 0;
  const effectiveOk = importCollapsedToZero ? false : payload.ok;
  const effectiveStatus: DisneyPlannerConnectionStatus = importCollapsedToZero ? "paused_mismatch" : payload.status;
  const effectiveFailureReason = importCollapsedToZero
    ? "All extracted rows were rejected during normalization."
    : payload.lastAuthFailureReason || "";
  const effectiveRequiredActionMessage = importCollapsedToZero
    ? "The worker saw Disney rows, but they were all rejected during normalization. Check import diagnostics."
    : payload.lastRequiredActionMessage || "";
  const effectiveNote = importCollapsedToZero
    ? "Import finished with zero valid members after normalization."
    : payload.note || "";
  const encryptedSessionState =
    payload.encryptedSessionState ??
    (payload.sessionState ? encryptSensitiveValue(JSON.stringify(payload.sessionState)) : "");

  if (encryptedSessionState) {
    upsertPlannerHubSecretRecord(state, job.userId, job.plannerHubId, {
      encryptedSessionState,
      encryptedPendingPassword: "",
    });
  } else if (job.type === "connect") {
    upsertPlannerHubSecretRecord(state, job.userId, job.plannerHubId, {
      encryptedPendingPassword: "",
    });
  }

  if (importedMembers.length > 0) {
    preferences.importedDisneyMembers = importedMembers;
  }

  const device = payload.deviceId ? getLocalWorkerDevice(state, job.userId, payload.deviceId) : null;
  if (device) {
    job.assignedDeviceId = device.id;
    device.lastSeenAt = now;
    device.lastJobId = job.id;
    device.lastJobPhase =
      payload.status === "connected"
        ? "completed"
        : payload.status === "paused_login"
          ? "paused_login"
          : payload.status === "paused_mismatch"
            ? "paused_mismatch"
            : "failed";
    device.lastJobMessage =
      payload.note ||
      effectiveFailureReason ||
      effectiveRequiredActionMessage ||
      (effectiveOk ? "Disney worker finished successfully." : "Disney worker failed closed.");
    device.status = "active";
    if (payload.hasLocalSession !== undefined) {
      device.hasLocalSession = payload.hasLocalSession;
    } else if (effectiveStatus === "connected") {
      device.hasLocalSession = true;
    }
    markOtherDevicesInactive(state, job.userId, device.id);
  }

  const nextConnection = normalizePlannerHubConnection(
    {
      ...preferences.plannerHubConnection,
      disneyEmail: job.disneyEmail || preferences.plannerHubConnection.disneyEmail,
      status: effectiveStatus,
      latestJobStatus: effectiveOk ? "completed" : "failed",
      latestPhase:
        effectiveStatus === "connected"
          ? "completed"
          : effectiveStatus === "paused_login"
            ? "paused_login"
            : effectiveStatus === "paused_mismatch"
              ? "paused_mismatch"
              : "failed",
      latestPhaseMessage:
        effectiveNote ||
        effectiveFailureReason ||
        effectiveRequiredActionMessage ||
        (effectiveOk ? "Disney worker finished successfully." : "Disney worker failed closed."),
      latestPhaseAt: now,
      latestJobUpdatedAt: now,
      lastImportedAt: importedMembers.length > 0 ? now : preferences.plannerHubConnection.lastImportedAt,
      lastAuthFailureReason: effectiveFailureReason,
      lastRequiredActionMessage: effectiveRequiredActionMessage,
      lastJobId: job.id,
      lastJobType: job.type,
      lastReportedJobId: job.id,
      lastWorkerResultAt: now,
      lastWorkerResultSource: payload.reportedBy ?? "",
      hasEncryptedSession: Boolean(encryptedSessionState) || preferences.plannerHubConnection.hasEncryptedSession,
      hasLocalSession:
        payload.hasLocalSession ??
        device?.hasLocalSession ??
        (effectiveStatus === "connected" || preferences.plannerHubConnection.hasLocalSession),
      importedMemberCount: importedMembers.length > 0 ? importedMembers.length : preferences.importedDisneyMembers.length,
      lastImportJobId: job.type === "import" ? job.id : preferences.plannerHubConnection.lastImportJobId,
      lastImportQueuedAt: job.type === "import" ? job.queuedAt : preferences.plannerHubConnection.lastImportQueuedAt,
      lastImportStartedAt:
        job.type === "import" ? job.startedAt || preferences.plannerHubConnection.lastImportStartedAt : preferences.plannerHubConnection.lastImportStartedAt,
      lastImportFinishedAt: job.type === "import" ? now : preferences.plannerHubConnection.lastImportFinishedAt,
      lastImportStatus:
        job.type === "import"
          ? effectiveOk
            ? "completed"
            : "failed"
          : preferences.plannerHubConnection.lastImportStatus,
      lastImportMessage:
        job.type === "import"
          ? effectiveNote ||
            effectiveFailureReason ||
            effectiveRequiredActionMessage ||
            (effectiveOk ? `Imported ${importedMembers.length} connected Disney members.` : "Disney import failed.")
          : preferences.plannerHubConnection.lastImportMessage,
      lastImportError:
        job.type === "import"
          ? effectiveOk
            ? ""
            : effectiveFailureReason || effectiveRequiredActionMessage || effectiveNote
          : preferences.plannerHubConnection.lastImportError,
      lastImportedMemberCount:
        job.type === "import" ? importedMembers.length : preferences.plannerHubConnection.lastImportedMemberCount,
      activeDeviceId: device?.id || preferences.plannerHubConnection.activeDeviceId,
      activeDeviceName: device?.deviceName || preferences.plannerHubConnection.activeDeviceName,
      activeDevicePlatform: device?.platform || preferences.plannerHubConnection.activeDevicePlatform,
      activeDeviceStatus: device?.status || preferences.plannerHubConnection.activeDeviceStatus,
      activeDeviceLastSeenAt: device?.lastSeenAt || preferences.plannerHubConnection.activeDeviceLastSeenAt,
    },
    job.disneyEmail || preferences.plannerHubConnection.disneyEmail
  );
  preferences.plannerHubConnection = nextConnection;

  preferences.reservationAssist = normalizeReservationAssist(
    {
      ...preferences.reservationAssist,
      plannerHubEmail: nextConnection.disneyEmail,
      plannerHubConfirmed: Boolean(nextConnection.disneyEmail),
      sessionStatus:
        effectiveStatus === "connected"
          ? "connected"
          : effectiveStatus === "paused_login"
            ? "needs_login"
            : effectiveStatus === "paused_mismatch"
              ? "connected"
              : effectiveStatus === "failed"
                ? "unknown"
                : preferences.reservationAssist.sessionStatus,
      partyProofCaptured:
        importedMembers.length > 0 ? importedMembers.some((member) => member.automatable) : preferences.reservationAssist.partyProofCaptured,
      flowProofCaptured:
        effectiveStatus === "connected" ? true : preferences.reservationAssist.flowProofCaptured,
      lastVerifiedAt: now,
      lastVerifiedFlowNote: effectiveNote || preferences.reservationAssist.lastVerifiedFlowNote,
    },
    nextConnection.disneyEmail
  );

  job.status = effectiveOk ? "completed" : "failed";
  job.phase =
    effectiveStatus === "connected"
      ? "completed"
      : effectiveStatus === "paused_login"
        ? "paused_login"
        : effectiveStatus === "paused_mismatch"
          ? "paused_mismatch"
          : "failed";
  job.finishedAt = now;
  job.updatedAt = now;
  job.reportedBy = payload.reportedBy || job.reportedBy;
  job.lastMessage =
    effectiveNote ||
    effectiveFailureReason ||
    effectiveRequiredActionMessage ||
    (effectiveOk ? "Disney worker finished successfully." : "Disney worker failed closed.");
  job.lastError = effectiveOk ? "" : effectiveFailureReason || effectiveRequiredActionMessage || "Planner hub worker failed.";
  job.diagnostics = diagnostics;
  job.events = [
    ...normalizeDisneyWorkerEvents(job.events),
    {
      phase: job.phase,
      at: now,
      message: job.lastMessage,
    },
  ];
  state.syncMeta = {
    ...state.syncMeta,
    lastWorkerPollAt: now,
    lastWorkerPollMessage: effectiveOk
      ? `Disney worker finished the ${job.type} job for ${job.disneyEmail || "the planner hub"}.`
      : effectiveFailureReason || effectiveRequiredActionMessage || "Disney worker finished with a failure state.",
  };

  await writeBackendState(state);
}

export async function getPlannerHubDiagnosticsForUser(userId: string) {
  const state = await readBackendState();
  const preferences = getPreferencesFromState(state, userId);
  return {
    diagnostics: buildPlannerHubJobDiagnostics(state),
    connection: preferences.plannerHubConnection,
  };
}

export async function getDisneyStatusForUser(user: StoredUser | null) {
  const state = await readBackendState();
  const preferences = user ? getPreferencesFromState(state, user.id) : null;
  const plannerHubConnection = user
    ? applyActiveDeviceToConnection(preferences!.plannerHubConnection, getActiveLocalWorkerDevice(state, user.id))
    : createDefaultPlannerHubConnection();
  const reservationAssist = user ? preferences!.reservationAssist : createDefaultReservationAssist();
  const importedDisneyMembers = user ? preferences!.importedDisneyMembers : [];
  const latestDisneyJob = user
    ? getLatestPlannerHubJobForUser(state, user.id, plannerHubConnection.plannerHubId || "primary")
    : null;
  const latestConnectJob = user
    ? getLatestPlannerHubJobForUserByType(state, user.id, plannerHubConnection.plannerHubId || "primary", "connect")
    : null;
  const latestImportJob = user
    ? getLatestPlannerHubJobForUserByType(state, user.id, plannerHubConnection.plannerHubId || "primary", "import")
    : null;

  return {
    plannerHubConnection,
    reservationAssist,
    importedDisneyMembers,
    localWorkerDevices: user ? getLocalWorkerDevicesForUser(state, user.id).map(({ userId: _userId, ...device }) => device) : [],
    syncMeta: state.syncMeta,
    latestDisneyJob: serializePlannerHubJob(latestDisneyJob),
    latestConnectJob: serializePlannerHubJob(latestConnectJob),
    latestImportJob: serializePlannerHubJob(latestImportJob),
  };
}

export function isAuthorizedWorkerRequest(request: Request) {
  const workerSecret = process.env.WORKER_SECRET;
  const legacyCronSecret = process.env.CRON_SECRET;
  const acceptedSecrets = [workerSecret, legacyCronSecret].filter(Boolean) as string[];
  if (!acceptedSecrets.length) return true;

  const authHeader = request.headers.get("authorization");
  const headerSecret = request.headers.get("x-cron-secret");
  const bearer = authHeader?.replace(/^Bearer\s+/i, "");
  return acceptedSecrets.includes(bearer || "") || acceptedSecrets.includes(headerSecret || "");
}

export function getUserIdFromLocalWorkerRequest(request: Request) {
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.replace(/^Bearer\s+/i, "");
  const token = bearer || request.headers.get("x-local-worker-token") || "";
  const payload = verifyLocalWorkerToken(token);
  return payload?.sub || null;
}

export async function persistActivityForUser(
  userId: string,
  entry: Pick<ActivityItem, "source" | "trigger" | "message" | "details"> & { createdAt?: string }
) {
  const state = await readBackendState();
  recordActivityForUser(state, userId, entry);
  await writeBackendState(state);
}
