import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type StoredRecord<T> = {
  key: string;
  value: T;
};

type StoredValueOptions<T> = {
  storageKey: string;
  localPath: string;
  createDefault: () => T;
};

const DATA_DIR = path.join(process.cwd(), "data");
const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, "") || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_STORAGE_TABLE = process.env.SUPABASE_STORAGE_TABLE || "magic_key_store";

function hasRemoteStorageConfig() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

async function ensureLocalDirectory(localPath: string) {
  await mkdir(path.dirname(localPath), { recursive: true });
}

async function readLocalValue<T>(localPath: string): Promise<T | null> {
  try {
    const raw = await readFile(localPath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeLocalValue<T>(localPath: string, value: T) {
  await ensureLocalDirectory(localPath);
  await writeFile(localPath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

async function requestSupabase<T>(query: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${SUPABASE_STORAGE_TABLE}${query}`, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase storage request failed (${response.status}): ${body || "No response body."}`);
  }

  if (response.status === 204) {
    return null as T;
  }

  return (await response.json()) as T;
}

async function readRemoteValue<T>(storageKey: string): Promise<T | null> {
  const keyFilter = encodeURIComponent(storageKey);
  const rows = await requestSupabase<StoredRecord<T>[]>(
    `?select=key,value&key=eq.${keyFilter}&limit=1`,
    {
      method: "GET",
    }
  );

  return Array.isArray(rows) && rows.length > 0 ? rows[0].value : null;
}

async function writeRemoteValue<T>(storageKey: string, value: T) {
  await requestSupabase(
    "?on_conflict=key",
    {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify([
        {
          key: storageKey,
          value,
          updated_at: new Date().toISOString(),
        },
      ]),
    }
  );
}

export async function readStoredValue<T>({
  storageKey,
  localPath,
  createDefault,
}: StoredValueOptions<T>): Promise<T> {
  if (hasRemoteStorageConfig()) {
    const remoteValue = await readRemoteValue<T>(storageKey);
    if (remoteValue !== null) {
      return remoteValue;
    }

    const seededValue = (await readLocalValue<T>(localPath)) ?? createDefault();
    await writeRemoteValue(storageKey, seededValue);
    return seededValue;
  }

  const localValue = await readLocalValue<T>(localPath);
  if (localValue !== null) {
    return localValue;
  }

  const nextValue = createDefault();
  await writeLocalValue(localPath, nextValue);
  return nextValue;
}

export async function writeStoredValue<T>({
  storageKey,
  localPath,
  value,
}: {
  storageKey: string;
  localPath: string;
  value: T;
}) {
  if (hasRemoteStorageConfig()) {
    await writeRemoteValue(storageKey, value);
    return;
  }

  await writeLocalValue(localPath, value);
}

export function getDataPath(filename: string) {
  return path.join(DATA_DIR, filename);
}
