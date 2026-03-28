import type { FrequencyType, ParkOption, PassType, StatusType } from "./types";

export const STORAGE_KEY = "magic-key-monitor-v4";
export const ENDPOINT_URL = "/api/magic-key-status";
export const DISNEY_IMPORT_FRESHNESS_MS = 1000 * 60 * 15;

export const PASS_TYPES: Array<{
  id: PassType;
  name: string;
  short: string;
  accent: string;
  iconPath: string;
}> = [
  {
    id: "inspire",
    name: "Inspire Key",
    short: "Inspire",
    accent: "from-rose-400 to-pink-500",
    iconPath: "/branding/inspire-icon.png",
  },
  {
    id: "believe",
    name: "Believe Key",
    short: "Believe",
    accent: "from-sky-400 to-indigo-500",
    iconPath: "/branding/believe-icon.png",
  },
  {
    id: "enchant",
    name: "Enchant Key",
    short: "Enchant",
    accent: "from-violet-500 to-fuchsia-500",
    iconPath: "/branding/enchant-icon.png",
  },
  {
    id: "explore",
    name: "Explore Key",
    short: "Explore",
    accent: "from-amber-400 to-orange-500",
    iconPath: "/branding/explore-icon.png",
  },
  {
    id: "imagine",
    name: "Imagine Key",
    short: "Imagine",
    accent: "from-cyan-400 to-sky-500",
    iconPath: "/branding/imagine-icon.png",
  },
];

export const PARK_OPTIONS: Array<{
  value: ParkOption;
  label: string;
  iconPath: string;
}> = [
  {
    value: "either",
    label: "Either Park",
    iconPath: "/branding/either-available.png",
  },
  {
    value: "dl",
    label: "Disneyland",
    iconPath: "/branding/disneyland-available.png",
  },
  {
    value: "dca",
    label: "California Adventure",
    iconPath: "/branding/dca-available.png",
  },
];

export const STATUS_META: Record<
  StatusType,
  {
    label: string;
    compactLabel: string;
    tone: string;
    iconPath?: string;
  }
> = {
  either: {
    label: "Either Park Available",
    compactLabel: "Either Park Open",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
    iconPath: "/branding/either-available.png",
  },
  dl: {
    label: "Disneyland Park Available",
    compactLabel: "Disneyland Open",
    tone: "border-pink-200 bg-pink-50 text-pink-800",
    iconPath: "/branding/disneyland-available.png",
  },
  dca: {
    label: "Disney California Adventure Park Available",
    compactLabel: "DCA Open",
    tone: "border-cyan-200 bg-cyan-50 text-cyan-800",
    iconPath: "/branding/dca-available.png",
  },
  unavailable: {
    label: "No Magic Key Reservations Available",
    compactLabel: "No Reservations",
    tone: "border-zinc-200 bg-zinc-100 text-zinc-700",
  },
  blocked: {
    label: "Blocked Out",
    compactLabel: "Blocked Out",
    tone: "border-slate-300 bg-slate-100 text-slate-700",
  },
};

export const FREQUENCIES: Array<{ value: FrequencyType; label: string }> = [
  { value: "manual", label: "Manual only" },
  { value: "5m", label: "Every 5 minutes" },
  { value: "10m", label: "Every 10 minutes" },
  { value: "15m", label: "Every 15 minutes" },
  { value: "30m", label: "Every 30 minutes" },
];

export const POLL_MS: Record<FrequencyType, number> = {
  manual: 0,
  "1m": 60_000,
  "5m": 300_000,
  "10m": 600_000,
  "15m": 900_000,
  "30m": 1_800_000,
};

export function normalizeSupportedFrequency(value: string | null | undefined): FrequencyType {
  if (value === "manual" || value === "5m" || value === "10m" || value === "15m" || value === "30m") {
    return value;
  }

  return "5m";
}
