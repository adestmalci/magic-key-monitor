import { readBackendState, readStoredFeed, writeBackendState, writeStoredFeed } from "./backend";
import type { FeedRow, PassType, ParkOption, SyncMeta, SyncMode } from "./types";

type DisneyFacility = {
  facilityName?: string;
  facilityId?: string;
  available?: boolean;
  blocked?: boolean;
};

type DisneySlot = {
  available?: boolean;
  blocked?: boolean;
  unavailableReason?: string;
};

type DisneyDay = {
  date?: string;
  facilities?: DisneyFacility[];
  facilityId?: string;
  facilityName?: string;
  slots?: DisneySlot[];
};

type DisneyAvailabilityEntry = {
  passType?: string;
  "calendar-availabilities"?: DisneyDay[];
  calendarAvailabilities?: DisneyDay[];
  availabilities?: DisneyDay[];
};

type DisneyPassSupport = {
  passId?: string;
};

const headers = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  accept: "application/json, text/plain, */*",
  referer: "https://disneyland.disney.go.com/passes/blockout-dates/",
};

const PASSES_URL =
  "https://disneyland.disney.go.com/passes/blockout-dates/api/get-passes/";

const AVAILABILITY_URL =
  "https://disneyland.disney.go.com/passes/blockout-dates/api/get-availability/?product-types=inspire-key-pass,believe-key-pass,enchant-key-pass,explore-key-pass,imagine-key-pass&destinationId=DLR&numMonths=14";

const PASS_ORDER = [
  "inspire-key-pass",
  "believe-key-pass",
  "enchant-key-pass",
  "explore-key-pass",
  "imagine-key-pass",
];

function normalizePassType(value: unknown): PassType | null {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/-pass$/, "")
    .replace(/-key-pass$/, "")
    .replace(/-key$/, "")
    .replace(/[^a-z]/g, "");

  if (
    normalized === "inspire" ||
    normalized === "believe" ||
    normalized === "enchant" ||
    normalized === "explore" ||
    normalized === "imagine"
  ) {
    return normalized;
  }

  return null;
}

function normalizeFacility(value: unknown): "dl" | "dca" | null {
  const raw = String(value || "").trim().toUpperCase();
  if (raw === "DLR_DP") return "dl";
  if (raw === "DLR_CA") return "dca";
  return null;
}

function statusForPark(
  state: Record<"dl" | "dca", { available: boolean; blocked: boolean }>,
  park: "dl" | "dca"
) {
  const entry = state[park];
  if (!entry) return "unavailable";
  if (entry.available) return park;
  if (entry.blocked) return "blocked";
  return "unavailable";
}

function statusForEither(state: Record<"dl" | "dca", { available: boolean; blocked: boolean }>) {
  const dl = state.dl;
  const dca = state.dca;

  if (dl.available && dca.available) return "either";
  if (dl.available) return "dl";
  if (dca.available) return "dca";
  if (dl.blocked && dca.blocked) return "blocked";
  return "unavailable";
}

function collectFacilities(day: DisneyDay) {
  if (Array.isArray(day?.facilities)) {
    return day.facilities.map((facility) => ({
      facility: normalizeFacility(facility.facilityName || facility.facilityId),
      available: Boolean(facility.available),
      blocked: Boolean(facility.blocked),
    }));
  }

  if (day?.facilityId || day?.facilityName) {
    const slots = Array.isArray(day?.slots) ? day.slots : [];
    const available = slots.some((slot) => slot?.available === true);
    const blocked =
      slots.length > 0 &&
      slots.every((slot) => slot?.blocked === true || slot?.unavailableReason === "BLOCKED");

    return [
      {
        facility: normalizeFacility(day.facilityId || day.facilityName),
        available,
        blocked,
      },
    ];
  }

  return [];
}

function sortRows(rows: FeedRow[]) {
  const preferredOrder: Record<ParkOption, number> = {
    either: 0,
    dl: 1,
    dca: 2,
  };

  const passOrder: Record<PassType, number> = {
    inspire: 0,
    believe: 1,
    enchant: 2,
    explore: 3,
    imagine: 4,
  };

  return rows.sort((a, b) => {
    return (
      a.date.localeCompare(b.date) ||
      passOrder[a.passType] - passOrder[b.passType] ||
      preferredOrder[a.preferredPark] - preferredOrder[b.preferredPark]
    );
  });
}

export async function fetchLiveFeed(): Promise<FeedRow[]> {
  const [passesResponse, availabilityResponse] = await Promise.all([
    fetch(PASSES_URL, { headers, cache: "no-store" }),
    fetch(AVAILABILITY_URL, { headers, cache: "no-store" }),
  ]);

  if (!passesResponse.ok) {
    throw new Error(`get-passes failed: ${passesResponse.status}`);
  }

  if (!availabilityResponse.ok) {
    throw new Error(`get-availability failed: ${availabilityResponse.status}`);
  }

  const passesJson = await passesResponse.json();
  const availabilityJson = await availabilityResponse.json();

  const supportedPasses: DisneyPassSupport[] = Array.isArray(passesJson?.["supported-passes"])
    ? passesJson["supported-passes"]
    : [];

  const normalizedAvailability: DisneyAvailabilityEntry[] = Array.isArray(availabilityJson)
    ? availabilityJson
    : [];

  const passIdsByIndex = supportedPasses.map((item) => item?.passId).filter(Boolean);
  const rows: FeedRow[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < normalizedAvailability.length; index += 1) {
    const item = normalizedAvailability[index] ?? {};
    const rawPassId = item.passType || passIdsByIndex[index] || PASS_ORDER[index] || "";
    const passType = normalizePassType(rawPassId);

    if (!passType) continue;

    const days =
      item["calendar-availabilities"] ||
      item.calendarAvailabilities ||
      item.availabilities ||
      [];

    for (const day of days) {
      const date = day?.date;
      if (!date) continue;

      const facilities = collectFacilities(day);
      const state = {
        dl: { available: false, blocked: false },
        dca: { available: false, blocked: false },
      };

      for (const facility of facilities) {
        if (!facility.facility) continue;
        state[facility.facility] = {
          available: facility.available,
          blocked: facility.blocked,
        };
      }

      const nextRows: FeedRow[] = [
        { date, passType, preferredPark: "either", status: statusForEither(state) },
        { date, passType, preferredPark: "dl", status: statusForPark(state, "dl") },
        { date, passType, preferredPark: "dca", status: statusForPark(state, "dca") },
      ];

      for (const row of nextRows) {
        const key = `${row.date}__${row.passType}__${row.preferredPark}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push(row);
      }
    }
  }

  return sortRows(rows);
}

function makeMeta(
  mode: SyncMode,
  stale: boolean,
  lastError: string,
  lastSuccessfulSyncAt: string,
  previousMeta?: Partial<SyncMeta>
): SyncMeta {
  if (mode === "live-disney") {
    return {
      lastAttemptedSyncAt: new Date().toISOString(),
      lastSuccessfulSyncAt,
      lastBackgroundRunAt: previousMeta?.lastBackgroundRunAt || "",
      lastBackgroundRunMessage: previousMeta?.lastBackgroundRunMessage || "",
      lastWorkerPollAt: previousMeta?.lastWorkerPollAt || "",
      lastWorkerPollMessage: previousMeta?.lastWorkerPollMessage || "",
      mode,
      stale,
      message: "Fresh pixie dust just arrived from Disney.",
      lastError,
    };
  }

  if (mode === "cached") {
    return {
      lastAttemptedSyncAt: new Date().toISOString(),
      lastSuccessfulSyncAt,
      lastBackgroundRunAt: previousMeta?.lastBackgroundRunAt || "",
      lastBackgroundRunMessage: previousMeta?.lastBackgroundRunMessage || "",
      lastWorkerPollAt: previousMeta?.lastWorkerPollAt || "",
      lastWorkerPollMessage: previousMeta?.lastWorkerPollMessage || "",
      mode,
      stale,
      message: "Serving the latest saved castle snapshot while your wishboard stays ready.",
      lastError,
    };
  }

  return {
    lastAttemptedSyncAt: new Date().toISOString(),
    lastSuccessfulSyncAt,
    lastBackgroundRunAt: previousMeta?.lastBackgroundRunAt || "",
    lastBackgroundRunMessage: previousMeta?.lastBackgroundRunMessage || "",
    lastWorkerPollAt: previousMeta?.lastWorkerPollAt || "",
    lastWorkerPollMessage: previousMeta?.lastWorkerPollMessage || "",
    mode,
    stale,
    message: "Disney's live feed took a brief nap, so we're showing the last good snapshot.",
    lastError,
  };
}

export async function getFeedForRequest(options?: { forceRefresh?: boolean; maxAgeMs?: number }) {
  const forceRefresh = options?.forceRefresh ?? false;
  const maxAgeMs = options?.maxAgeMs ?? 55_000;
  const state = await readBackendState();

  if (
    !forceRefresh &&
    state.syncMeta.lastSuccessfulSyncAt &&
    Date.now() - new Date(state.syncMeta.lastSuccessfulSyncAt).getTime() < maxAgeMs
  ) {
    const cachedRows = await readStoredFeed();
    state.syncMeta = makeMeta(
      "cached",
      state.syncMeta.stale,
      state.syncMeta.lastError,
      state.syncMeta.lastSuccessfulSyncAt,
      state.syncMeta
    );
    await writeBackendState(state);
    return { rows: cachedRows, syncMeta: state.syncMeta };
  }

  return syncLiveFeed();
}

export async function syncLiveFeed() {
  const state = await readBackendState();
  const attemptedAt = new Date().toISOString();

  try {
    const rows = await fetchLiveFeed();
    await writeStoredFeed(rows);
    state.syncMeta = {
      ...state.syncMeta,
      lastAttemptedSyncAt: attemptedAt,
      lastSuccessfulSyncAt: attemptedAt,
      mode: "live-disney",
      stale: false,
      message: "Fresh pixie dust just arrived from Disney.",
      lastError: "",
    };
    await writeBackendState(state);
    return { rows, syncMeta: state.syncMeta };
  } catch (error) {
    const rows = await readStoredFeed();
    state.syncMeta = {
      ...state.syncMeta,
      lastAttemptedSyncAt: attemptedAt,
      lastSuccessfulSyncAt: state.syncMeta.lastSuccessfulSyncAt,
      mode: "snapshot-fallback",
      stale: true,
      message: "Disney's live feed took a brief nap, so we're showing the last good snapshot.",
      lastError: error instanceof Error ? error.message : "Live sync failed.",
    };
    await writeBackendState(state);
    return { rows, syncMeta: state.syncMeta };
  }
}
