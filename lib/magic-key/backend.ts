import { cookies } from "next/headers";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildFeedLookup, resolveStatus } from "./utils";
import type {
  DashboardUserState,
  FeedRow,
  FrequencyType,
  SessionUser,
  SyncMeta,
  UserPreferences,
  WatchItem,
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
};

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

type BackendState = {
  version: number;
  users: StoredUser[];
  preferences: StoredPreferences[];
  watchItems: StoredWatchItem[];
  magicLinks: MagicLinkRecord[];
  pushSubscriptions: PushSubscriptionRecord[];
  syncMeta: SyncMeta;
};

export type AlertChange = {
  item: StoredWatchItem;
  previousStatus: StoredWatchItem["currentStatus"];
  currentStatus: StoredWatchItem["currentStatus"];
};

const DATA_DIR = path.join(process.cwd(), "data");
const STATE_PATH = path.join(DATA_DIR, "magic-key-backend.json");
const FEED_PATH = path.join(DATA_DIR, "magic-key-feed.json");
const SESSION_COOKIE = "magic_key_session";

const DEFAULT_SYNC_META: SyncMeta = {
  lastSuccessfulSyncAt: "",
  lastAttemptedSyncAt: "",
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
    syncFrequency: "1m",
  };
}

function defaultState(): BackendState {
  return {
    version: 1,
    users: [],
    preferences: [],
    watchItems: [],
    magicLinks: [],
    pushSubscriptions: [],
    syncMeta: DEFAULT_SYNC_META,
  };
}

function secretFor(name: string, fallback: string) {
  return process.env[name] || fallback;
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
  if (signPayload(body) !== signature) return null;

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
  await mkdir(DATA_DIR, { recursive: true });

  try {
    await readFile(STATE_PATH, "utf8");
  } catch {
    await writeFile(STATE_PATH, JSON.stringify(defaultState(), null, 2) + "\n", "utf8");
  }
}

export async function readBackendState(): Promise<BackendState> {
  await ensureBackendState();
  const raw = await readFile(STATE_PATH, "utf8");
  const parsed = JSON.parse(raw) as Partial<BackendState>;

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
    magicLinks: Array.isArray(parsed.magicLinks) ? parsed.magicLinks : [],
    pushSubscriptions: Array.isArray(parsed.pushSubscriptions) ? parsed.pushSubscriptions : [],
  };
}

export async function writeBackendState(state: BackendState) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(STATE_PATH, JSON.stringify(state, null, 2) + "\n", "utf8");
}

export async function readStoredFeed(): Promise<FeedRow[]> {
  const raw = await readFile(FEED_PATH, "utf8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

export async function writeStoredFeed(rows: FeedRow[]) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(FEED_PATH, JSON.stringify(rows, null, 2) + "\n", "utf8");
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

  if (existing) return existing;

  const created: StoredPreferences = {
    userId,
    lastEvaluatedAt: "",
    ...defaultPreferences(),
  };
  state.preferences.push(created);
  return created;
}

export function getWatchItemsForUser(state: BackendState, userId: string) {
  return state.watchItems.filter((item) => item.userId === userId);
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
      watchItems: [],
      syncMeta: state.syncMeta,
      pushPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "",
    };
  }

  const preferences = getPreferencesFromState(state, user.id);
  return {
    user: { id: user.id, email: user.email },
    preferences: {
      emailEnabled: preferences.emailEnabled,
      emailAddress: preferences.emailAddress,
      alertsEnabled: preferences.alertsEnabled,
      pushEnabled: preferences.pushEnabled,
      syncFrequency: preferences.syncFrequency,
    },
    watchItems: getWatchItemsForUser(state, user.id).map((item) => ({
      id: item.id,
      date: item.date,
      passType: item.passType,
      preferredPark: item.preferredPark,
      currentStatus: item.currentStatus,
      previousStatus: item.previousStatus,
      lastCheckedAt: item.lastCheckedAt,
    })),
    syncMeta: state.syncMeta,
    pushPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "",
  };
}

export async function upsertPreferencesForUser(
  userId: string,
  patch: Partial<UserPreferences>
): Promise<UserPreferences> {
  const state = await readBackendState();
  const preferences = getPreferencesFromState(state, userId);

  preferences.emailEnabled = patch.emailEnabled ?? preferences.emailEnabled;
  preferences.emailAddress = patch.emailAddress ?? preferences.emailAddress;
  preferences.alertsEnabled = patch.alertsEnabled ?? preferences.alertsEnabled;
  preferences.pushEnabled = patch.pushEnabled ?? preferences.pushEnabled;
  preferences.syncFrequency = patch.syncFrequency ?? preferences.syncFrequency;

  await writeBackendState(state);

  return {
    emailEnabled: preferences.emailEnabled,
    emailAddress: preferences.emailAddress,
    alertsEnabled: preferences.alertsEnabled,
    pushEnabled: preferences.pushEnabled,
    syncFrequency: preferences.syncFrequency,
  };
}

export async function createWatchItemForUser(
  userId: string,
  payload: Pick<WatchItem, "date" | "passType" | "preferredPark">,
  lastKnownFeed: FeedRow[]
) {
  const state = await readBackendState();
  const lookup = buildFeedLookup(lastKnownFeed);
  const nextStatus = resolveStatus(payload, lookup);
  const now = new Date().toISOString();

  const duplicate = state.watchItems.find(
    (item) =>
      item.userId === userId &&
      item.date === payload.date &&
      item.passType === payload.passType &&
      item.preferredPark === payload.preferredPark
  );

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
    lastCheckedAt: state.syncMeta.lastSuccessfulSyncAt || now,
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
      currentStatus: resolveStatus(item, lookup),
      previousStatus: item.previousStatus ?? null,
      lastCheckedAt: item.lastCheckedAt || state.syncMeta.lastSuccessfulSyncAt || now,
      createdAt: now,
      updatedAt: now,
    });
  }

  await writeBackendState(state);
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
  const changesByUser = new Map<string, AlertChange[]>();

  for (const user of state.users) {
    const preferences = getPreferencesFromState(state, user.id);

    if (!shouldEvaluateFrequency(preferences.lastEvaluatedAt, preferences.syncFrequency)) {
      continue;
    }

    const items = getWatchItemsForUser(state, user.id);
    const userChanges: AlertChange[] = [];

    for (const item of items) {
      const nextStatus = resolveStatus(item, lookup);
      const previousStatus = item.currentStatus;

      if (nextStatus !== previousStatus) {
        userChanges.push({ item, previousStatus, currentStatus: nextStatus });
      }

      item.previousStatus = nextStatus !== previousStatus ? previousStatus : item.previousStatus;
      item.currentStatus = nextStatus;
      item.lastCheckedAt = state.syncMeta.lastSuccessfulSyncAt || nowIso;
      item.updatedAt = nowIso;
    }

    preferences.lastEvaluatedAt = nowIso;

    if (userChanges.length > 0) {
      changesByUser.set(user.id, userChanges);
    }
  }

  await writeBackendState(state);
  return { state, changesByUser };
}
