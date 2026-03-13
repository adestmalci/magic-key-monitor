import { mkdir, writeFile } from "node:fs/promises";

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

function normalizePassType(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/-pass$/, "")
    .replace(/-key$/, "")
    .replace(/-key-pass$/, "")
    .replace(/[^a-z]/g, "");
}

function normalizeFacility(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (raw === "DLR_DP") return "dl";
  if (raw === "DLR_CA") return "dca";
  return null;
}

function statusForPark(state, park) {
  const entry = state[park];
  if (!entry) return "unavailable";
  if (entry.available) return park;
  if (entry.blocked) return "blocked";
  return "unavailable";
}

function statusForEither(state) {
  const dl = state.dl;
  const dca = state.dca;

  if (dl?.available && dca?.available) return "either";
  if (dl?.available) return "dl";
  if (dca?.available) return "dca";
  if (dl?.blocked && dca?.blocked) return "blocked";
  return "unavailable";
}

function collectFacilities(day) {
  if (Array.isArray(day?.facilities)) {
    return day.facilities.map((facility) => ({
      facility: normalizeFacility(facility.facilityName || facility.facilityId),
      available: Boolean(facility.available),
      blocked: Boolean(facility.blocked),
    }));
  }

  if (day?.facilityId || day?.facilityName) {
    const slots = Array.isArray(day.slots) ? day.slots : [];
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

function sortRows(rows) {
  const preferredOrder = { either: 0, dl: 1, dca: 2 };
  const passOrder = { inspire: 0, believe: 1, enchant: 2, explore: 3, imagine: 4 };

  return rows.sort((a, b) => {
    return (
      a.date.localeCompare(b.date) ||
      (passOrder[a.passType] ?? 99) - (passOrder[b.passType] ?? 99) ||
      (preferredOrder[a.preferredPark] ?? 99) - (preferredOrder[b.preferredPark] ?? 99)
    );
  });
}

const [passesResponse, availabilityResponse] = await Promise.all([
  fetch(PASSES_URL, { headers }),
  fetch(AVAILABILITY_URL, { headers }),
]);

if (!passesResponse.ok) {
  throw new Error(`get-passes failed: ${passesResponse.status}`);
}

if (!availabilityResponse.ok) {
  throw new Error(`get-availability failed: ${availabilityResponse.status}`);
}

const passesJson = await passesResponse.json();
const availabilityJson = await availabilityResponse.json();

await mkdir("tmp", { recursive: true });
await mkdir("data", { recursive: true });

await writeFile("tmp/get-passes.latest.json", JSON.stringify(passesJson, null, 2), "utf8");
await writeFile(
  "tmp/get-availability.latest.json",
  JSON.stringify(availabilityJson, null, 2),
  "utf8"
);

const supportedPasses = Array.isArray(passesJson?.["supported-passes"])
  ? passesJson["supported-passes"]
  : [];

const passIdsByIndex = supportedPasses.map((item) => item?.passId).filter(Boolean);
const rows = [];
const seen = new Set();

for (let index = 0; index < availabilityJson.length; index += 1) {
  const item = availabilityJson[index] ?? {};
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

    const nextRows = [
      {
        date,
        passType,
        preferredPark: "either",
        status: statusForEither(state),
      },
      {
        date,
        passType,
        preferredPark: "dl",
        status: statusForPark(state, "dl"),
      },
      {
        date,
        passType,
        preferredPark: "dca",
        status: statusForPark(state, "dca"),
      },
    ];

    for (const row of nextRows) {
      const key = `${row.date}__${row.passType}__${row.preferredPark}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
  }
}

const sortedRows = sortRows(rows);

await writeFile("data/magic-key-feed.json", JSON.stringify(sortedRows, null, 2) + "\n", "utf8");

const summary = sortedRows.reduce(
  (acc, row) => {
    acc.total += 1;
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  },
  { total: 0 }
);

console.log("Wrote data/magic-key-feed.json");
console.log(JSON.stringify(summary, null, 2));
