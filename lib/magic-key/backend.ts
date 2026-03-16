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
  DisneyWorkerJobType,
  FeedRow,
  FrequencyType,
  ImportedDisneyMember,
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
  type: DisneyWorkerJobType;
  status: "pending" | "processing" | "completed" | "failed";
  disneyEmail: string;
  createdAt: string;
  claimedAt: string;
  completedAt: string;
  attempts: number;
  lastError: string;
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

  if (next.lastJobType !== "" && next.lastJobType !== "connect" && next.lastJobType !== "import" && next.lastJobType !== "booking") {
    next.lastJobType = "";
  }

  return next;
}

function currentAppUrlForDiagnostics() {
  return (process.env.MAGIC_KEY_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
}

function buildPlannerHubJobDiagnostics(state: BackendState): PlannerHubJobDiagnostics {
  const pendingJobs = state.plannerHubJobs.filter((entry) => entry.status === "pending");
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

  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const next = item as Partial<ImportedDisneyMember>;
      const magicKeyPassType =
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
        entitlementType: next.entitlementType === "ticket_holder" ? "ticket_holder" : "magic_key",
        entitlementLabel: typeof next.entitlementLabel === "string" ? next.entitlementLabel : "",
        passLabel: typeof next.passLabel === "string" ? next.passLabel : "",
        magicKeyPassType,
        rawEligibilityText: typeof next.rawEligibilityText === "string" ? next.rawEligibilityText : "",
        automatable: Boolean(next.automatable),
        importedAt: typeof next.importedAt === "string" ? next.importedAt : new Date().toISOString(),
      };
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
    version: 1,
    users: [],
    preferences: [],
    watchItems: [],
    activity: [],
    magicLinks: [],
    pushSubscriptions: [],
    plannerHubSecrets: [],
    plannerHubJobs: [],
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
    const createdAt = Date.parse(record.createdAt);
    if (!Number.isFinite(createdAt)) return false;
    return now - createdAt <= JOB_RETENTION_MS;
  });
}

function pruneBackendState(state: BackendState): BackendState {
  return {
    ...state,
    activity: pruneActivityItems(state.activity),
    magicLinks: pruneMagicLinks(state.magicLinks),
    plannerHubJobs: prunePlannerHubJobs(state.plannerHubJobs),
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
    plannerHubJobs: prunePlannerHubJobs(Array.isArray(parsed.plannerHubJobs) ? parsed.plannerHubJobs : []),
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
      importedDisneyMembers: [],
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
  if (synchronizePlannerHubConnectionState(state, user.id, preferences)) {
    await writeBackendState(state);
  }
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
    importedDisneyMembers: preferences.importedDisneyMembers,
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
  const state = await readBackendState();
  const preferences = getPreferencesFromState(state, userId);
  const user = getUserFromState(state, userId);

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
      ...preferences.plannerHubConnection,
      ...(patch.plannerHubConnection ?? {}),
    },
    patch.plannerHubConnection?.disneyEmail ??
      patch.reservationAssist?.plannerHubEmail ??
      user?.email ??
      preferences.plannerHubConnection?.disneyEmail ??
      preferences.reservationAssist?.plannerHubEmail ??
      ""
  );
  preferences.importedDisneyMembers =
    patch.importedDisneyMembers === undefined
      ? normalizeImportedDisneyMembers(preferences.importedDisneyMembers)
      : normalizeImportedDisneyMembers(patch.importedDisneyMembers);
  preferences.savedReservationParties =
    patch.savedReservationParties === undefined
      ? normalizeSavedReservationParties(preferences.savedReservationParties)
      : normalizeSavedReservationParties(patch.savedReservationParties);

  await writeBackendState(state);

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

function isPlannerHubJobStale(job: PlannerHubJobRecord | null) {
  if (!job) return true;
  const reference = job.claimedAt || job.createdAt;
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
        lastAuthFailureReason: job.lastError || "The Disney worker could not finish the last planner-hub job.",
        lastRequiredActionMessage: "Reconnect Disney and try the planner-hub flow again.",
      },
      connection.disneyEmail
    );
    return true;
  }

  if (
    !job ||
    job.status === "completed" ||
    ((job.status === "pending" || job.status === "processing") && isPlannerHubJobStale(job))
  ) {
    upsertPlannerHubSecretRecord(state, userId, connection.plannerHubId || "primary", {
      encryptedPendingPassword: "",
    });
    preferences.plannerHubConnection = normalizePlannerHubConnection(
      {
        ...connection,
        status: "failed",
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
  state.plannerHubJobs = state.plannerHubJobs.filter(
    (existingJob) =>
      !(
        existingJob.userId === userId &&
        existingJob.plannerHubId === plannerHubId &&
        existingJob.type === "connect" &&
        (existingJob.status === "pending" || existingJob.status === "processing")
      )
  );
  const job: PlannerHubJobRecord = {
    id: randomUUID(),
    userId,
    plannerHubId,
    type: "connect",
    status: "pending",
    disneyEmail,
    createdAt: now,
    claimedAt: "",
    completedAt: "",
    attempts: 0,
    lastError: "",
  };

  upsertPlannerHubSecretRecord(state, userId, plannerHubId, {
    encryptedPendingPassword: encryptSensitiveValue(password),
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
      lastJobId: job.id,
      lastJobType: "connect",
      lastQueuedJobId: job.id,
      lastRequiredActionMessage: "Worker is connecting to Disney and capturing session state.",
      lastAuthFailureReason: "",
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
  const secret = getPlannerHubSecretRecord(state, userId, plannerHubId);

  if (!secret?.encryptedSessionState) {
    throw new Error("Disney session is not connected yet.");
  }

  const now = new Date().toISOString();
  const job: PlannerHubJobRecord = {
    id: randomUUID(),
    userId,
    plannerHubId,
    type: "import",
    status: "pending",
    disneyEmail: preferences.plannerHubConnection.disneyEmail || preferences.reservationAssist.plannerHubEmail,
    createdAt: now,
    claimedAt: "",
    completedAt: "",
    attempts: 0,
    lastError: "",
  };

  state.plannerHubJobs.push(job);
  preferences.plannerHubConnection = normalizePlannerHubConnection(
    {
      ...preferences.plannerHubConnection,
      status: "importing",
      lastJobId: job.id,
      lastJobType: "import",
      lastQueuedJobId: job.id,
      lastRequiredActionMessage: "Worker is importing the current Disney connected members.",
      lastAuthFailureReason: "",
    },
    preferences.plannerHubConnection.disneyEmail
  );

  await writeBackendState(state);
  return job;
}

export async function claimNextPlannerHubJob(): Promise<PlannerHubClaimResult> {
  const state = await readBackendState();
  const pollAt = new Date().toISOString();
  const diagnostics = buildPlannerHubJobDiagnostics(state);
  let job: PlannerHubJobRecord | undefined = state.plannerHubJobs.find((entry) => entry.status === "pending");
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
      job.completedAt = new Date().toISOString();
      job.lastError = "Disney password handoff expired before the worker claimed it.";

      const preferences = getPreferencesFromState(state, job.userId);
      upsertPlannerHubSecretRecord(state, job.userId, job.plannerHubId, {
        encryptedPendingPassword: "",
      });
      preferences.plannerHubConnection = normalizePlannerHubConnection(
        {
          ...preferences.plannerHubConnection,
          status: "paused_login",
          lastJobId: job.id,
          lastJobType: "connect",
          lastQueuedJobId: job.id,
          lastAuthFailureReason: "Disney password handoff expired before connection could begin.",
          lastRequiredActionMessage: "Reconnect Disney so the worker can capture a fresh session.",
        },
        preferences.plannerHubConnection.disneyEmail
      );
      await writeBackendState(state);
      job = state.plannerHubJobs.find((entry) => entry.status === "pending");
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
  job.attempts += 1;
  state.syncMeta = {
    ...state.syncMeta,
    lastWorkerPollAt: pollAt,
    lastWorkerPollMessage: `Disney worker claimed the queued ${job.type} job for ${job.disneyEmail || "the planner hub"}.`,
  };

  const preferences = getPreferencesFromState(state, job.userId);
  preferences.plannerHubConnection = normalizePlannerHubConnection(
    {
      ...preferences.plannerHubConnection,
      lastClaimedJobId: job.id,
      lastJobId: job.id,
      lastJobType: job.type,
      lastRequiredActionMessage: `Disney worker claimed the ${job.type} job and is now processing it.`,
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

export async function completePlannerHubJob(
  jobId: string,
  payload: {
    ok: boolean;
    status: DisneyPlannerConnectionStatus;
    importedDisneyMembers?: ImportedDisneyMember[];
    encryptedSessionState?: string;
    sessionState?: unknown;
    lastAuthFailureReason?: string;
    lastRequiredActionMessage?: string;
    note?: string;
    reportedBy?: string;
  }
) {
  const state = await readBackendState();
  const job = findPlannerHubJob(state, jobId);
  if (!job) {
    throw new Error("Planner hub job not found.");
  }

  const preferences = getPreferencesFromState(state, job.userId);
  const now = new Date().toISOString();
  const importedMembers = normalizeImportedDisneyMembers(payload.importedDisneyMembers);
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

  const nextConnection = normalizePlannerHubConnection(
    {
      ...preferences.plannerHubConnection,
      disneyEmail: job.disneyEmail || preferences.plannerHubConnection.disneyEmail,
      status: payload.status,
      lastImportedAt: importedMembers.length > 0 ? now : preferences.plannerHubConnection.lastImportedAt,
      lastAuthFailureReason: payload.lastAuthFailureReason ?? "",
      lastRequiredActionMessage: payload.lastRequiredActionMessage ?? "",
      lastJobId: job.id,
      lastJobType: job.type,
      lastReportedJobId: job.id,
      lastWorkerResultAt: now,
      lastWorkerResultSource: payload.reportedBy ?? "",
      hasEncryptedSession: Boolean(encryptedSessionState) || preferences.plannerHubConnection.hasEncryptedSession,
      importedMemberCount: importedMembers.length > 0 ? importedMembers.length : preferences.importedDisneyMembers.length,
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
        payload.status === "connected"
          ? "connected"
          : payload.status === "paused_login"
            ? "needs_login"
            : payload.status === "paused_mismatch"
              ? "connected"
              : payload.status === "failed"
                ? "unknown"
                : preferences.reservationAssist.sessionStatus,
      partyProofCaptured:
        importedMembers.length > 0 ? importedMembers.some((member) => member.automatable) : preferences.reservationAssist.partyProofCaptured,
      flowProofCaptured:
        payload.status === "connected" ? true : preferences.reservationAssist.flowProofCaptured,
      lastVerifiedAt: now,
      lastVerifiedFlowNote: payload.note ?? preferences.reservationAssist.lastVerifiedFlowNote,
    },
    nextConnection.disneyEmail
  );

  job.status = payload.ok ? "completed" : "failed";
  job.completedAt = now;
  job.lastError = payload.ok ? "" : payload.lastAuthFailureReason || payload.lastRequiredActionMessage || "Planner hub worker failed.";
  state.syncMeta = {
    ...state.syncMeta,
    lastWorkerPollAt: now,
    lastWorkerPollMessage: payload.ok
      ? `Disney worker finished the ${job.type} job for ${job.disneyEmail || "the planner hub"}.`
      : payload.lastAuthFailureReason || payload.lastRequiredActionMessage || "Disney worker finished with a failure state.",
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

export function isAuthorizedWorkerRequest(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return true;

  const authHeader = request.headers.get("authorization");
  const headerSecret = request.headers.get("x-cron-secret");
  const bearer = authHeader?.replace(/^Bearer\s+/i, "");
  return bearer === expected || headerSecret === expected;
}

export async function persistActivityForUser(
  userId: string,
  entry: Pick<ActivityItem, "source" | "trigger" | "message" | "details"> & { createdAt?: string }
) {
  const state = await readBackendState();
  recordActivityForUser(state, userId, entry);
  await writeBackendState(state);
}
