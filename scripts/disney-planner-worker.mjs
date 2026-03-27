import { homedir, hostname } from "node:os";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { inspectConnectedMembersFromPage, toImportedDisneyMembers } from "./disney-select-party-parser.mjs";

const DEFAULT_APP_URL = (process.env.MAGIC_KEY_APP_URL || "").replace(/\/$/, "");
const DEFAULT_LOCAL_WORKER_TOKEN = process.env.MAGIC_KEY_LOCAL_WORKER_TOKEN || "";
const DEFAULT_LOCAL_DEVICE_ID = process.env.MAGIC_KEY_LOCAL_DEVICE_ID || "";
const DEFAULT_LOCAL_DEVICE_NAME = process.env.MAGIC_KEY_LOCAL_DEVICE_NAME || hostname();
const DEFAULT_LOCAL_PROFILE_DIR =
  process.env.MAGIC_KEY_LOCAL_PROFILE_DIR ||
  path.join(homedir(), "Library", "Application Support", "Magic Key Monitor", "disney-profile");
const DEFAULT_WORKER_SECRET = process.env.WORKER_SECRET || process.env.CRON_SECRET || "";
const SELECT_PARTY_URL = "https://disneyland.disney.go.com/entry-reservation/add/select-party/";
const PROFILE_URL = "https://disneyland.disney.go.com/profile/";
const DISNEY_HOME_URL = "https://disneyland.disney.go.com/";
const BOOKING_PHASE_TIMEOUT_MS = {
  select_party: 1000 * 75,
  members_imported: 1000 * 45,
};

class DisneyBookingStepTimeoutError extends Error {
  constructor(phase, timeoutMs) {
    const stepLabel =
      phase === "select_party"
        ? "Disney select-party"
        : phase === "members_imported"
          ? "the post-selection confirmation step"
          : "the Disney booking flow";
    super(`${stepLabel} stopped responding before the booking attempt could finish.`);
    this.name = "DisneyBookingStepTimeoutError";
    this.phase = phase;
    this.timeoutMs = timeoutMs;
  }
}

function assertWorkerEnv(appUrl, workerSecret) {
  if (!appUrl) throw new Error("Missing MAGIC_KEY_APP_URL");
  if (!workerSecret) throw new Error("Missing WORKER_SECRET");
}

function assertLocalWorkerEnv(appUrl, localWorkerToken, deviceId) {
  if (!appUrl) throw new Error("Missing MAGIC_KEY_APP_URL");
  if (!localWorkerToken) throw new Error("Missing MAGIC_KEY_LOCAL_WORKER_TOKEN");
  if (!deviceId) throw new Error("Missing MAGIC_KEY_LOCAL_DEVICE_ID");
}

function log(message, details) {
  if (details) {
    console.log(`[disney-worker] ${message}`, details);
    return;
  }
  console.log(`[disney-worker] ${message}`);
}

function normalizeMemberMatchValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function createWorkerApi({ appUrl, workerSecret }) {
  assertWorkerEnv(appUrl, workerSecret);

  async function api(path, init = {}) {
    const response = await fetch(`${appUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${workerSecret}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || `Worker API failed for ${path}`);
    }
    return body;
  }

  async function reportProgress(jobId, phase, message, reportedBy) {
    log("reporting progress", { jobId, phase, message });
    await api("/api/disney/worker/progress", {
      method: "POST",
      body: JSON.stringify({ jobId, phase, message, reportedBy }),
    });
  }

  async function reportFinal(jobId, result, reportedBy) {
    log("reporting job result", {
      jobId,
      ok: result.ok,
      status: result.status,
      reason: result.lastAuthFailureReason || result.lastRequiredActionMessage || result.note || "",
    });
    await api("/api/disney/worker/report", {
      method: "POST",
      body: JSON.stringify({
        jobId,
        reportedBy,
        ...result,
      }),
    });
    log("report succeeded", {
      jobId,
      ok: result.ok,
      status: result.status,
      reason: result.lastAuthFailureReason || result.lastRequiredActionMessage || result.note || "",
    });
  }

  return { api, reportProgress, reportFinal };
}

function hasLocalSession(profileDir) {
  try {
    if (!existsSync(profileDir)) return false;
    return readdirSync(profileDir).length > 0;
  } catch {
    return false;
  }
}

function ensureLocalProfileDir(profileDir) {
  mkdirSync(profileDir, { recursive: true });
  return profileDir;
}

function createLocalWorkerApi({ appUrl, localWorkerToken, deviceId, deviceName, localProfilePath }) {
  assertLocalWorkerEnv(appUrl, localWorkerToken, deviceId);

  async function api(pathname, init = {}) {
    const response = await fetch(`${appUrl}${pathname}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${localWorkerToken}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || `Local worker API failed for ${pathname}`);
    }
    return body;
  }

  async function checkIn() {
    return api("/api/disney/local/check-in", {
      method: "POST",
      body: JSON.stringify({
        deviceId,
        deviceName,
        platform: "macos",
        localProfilePath,
        hasLocalSession: hasLocalSession(localProfilePath),
      }),
    });
  }

  async function claim() {
    return api("/api/disney/local/claim", {
      method: "POST",
      body: JSON.stringify({
        deviceId,
        deviceName,
        platform: "macos",
        localProfilePath,
        hasLocalSession: hasLocalSession(localProfilePath),
      }),
    });
  }

  async function reportProgress(jobId, phase, message, reportedBy, sessionPresent) {
    log("reporting progress", { jobId, phase, message, deviceId });
    await api("/api/disney/local/progress", {
      method: "POST",
      body: JSON.stringify({
        jobId,
        phase,
        message,
        reportedBy,
        deviceId,
        hasLocalSession: sessionPresent,
      }),
    });
  }

  async function reportFinal(jobId, result, reportedBy) {
    log("reporting job result", {
      jobId,
      ok: result.ok,
      status: result.status,
      deviceId,
      reason: result.lastAuthFailureReason || result.lastRequiredActionMessage || result.note || "",
    });
    await api("/api/disney/local/report", {
      method: "POST",
      body: JSON.stringify({
        jobId,
        reportedBy,
        deviceId,
        hasLocalSession: result.hasLocalSession,
        ...result,
      }),
    });
    log("report succeeded", {
      jobId,
      ok: result.ok,
      status: result.status,
      deviceId,
      reason: result.lastAuthFailureReason || result.lastRequiredActionMessage || result.note || "",
    });
  }

  return { checkIn, claim, reportProgress, reportFinal };
}

async function clickFirst(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      if (await locator.isVisible({ timeout: 1000 })) {
        await locator.click({ timeout: 1000 });
        return true;
      }
    } catch {
      // try next selector
    }
  }
  return false;
}

async function fillFirst(page, selectors, value) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      if (await locator.isVisible({ timeout: 1000 })) {
        await locator.fill(value, { timeout: 1000 });
        return true;
      }
    } catch {
      // try next selector
    }
  }
  return false;
}

async function gotoWithRetry(page, url, label) {
  const waits = [
    { waitUntil: "commit", timeout: 45000 },
    { waitUntil: "domcontentloaded", timeout: 30000 },
    { waitUntil: "load", timeout: 30000 },
  ];
  let lastError = null;

  for (let index = 0; index < waits.length; index += 1) {
    try {
      const strategy = waits[index];
      await page.goto(url, { waitUntil: strategy.waitUntil, timeout: strategy.timeout });

      // Disney pages can hang forever on later load events even after the navigation
      // has already committed to the correct destination. Treat a committed page as
      // good enough and only best-effort the later load state.
      try {
        await page.waitForLoadState("domcontentloaded", { timeout: 5000 });
      } catch {
        // Keep going; the page may still be usable even if Disney never settles.
      }
      return;
    } catch (error) {
      lastError = error;
      log("navigation retry", {
        label,
        url,
        waitUntil: waits[index].waitUntil,
        error: error instanceof Error ? error.message : String(error),
      });
      await page.waitForTimeout(1500 * (index + 1));
      try {
        await page.goto(DISNEY_HOME_URL, { waitUntil: "commit", timeout: 60000 });
      } catch {
        // Keep retrying the intended page even if the reset navigation fails.
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Could not open ${label}.`);
}

async function maybeLogin(page, email, password, progress) {
  await progress("disney_open", "Opening Disney profile.");
  await gotoWithRetry(page, PROFILE_URL, "Disney profile");
  await page.waitForTimeout(1500);

  const filledEmail = await fillFirst(page, ['input[type="email"]', 'input[name="email"]', 'input[placeholder*="Email" i]'], email);
  if (filledEmail) {
    await progress("email_step", `Submitted planner email ${email}.`);
    await clickFirst(page, ["button:has-text('Continue')", "button:has-text('Next')"]);
    await page.waitForTimeout(1500);
  }

  const sawOtpPrompt =
    (await page.locator("text=/one-time code/i").count().catch(() => 0)) > 0 ||
    (await page.locator("text=/Having trouble logging in/i").count().catch(() => 0)) > 0;

  const filledPassword = await fillFirst(
    page,
    ['input[type="password"]', 'input[name="password"]', 'input[placeholder*="Password" i]'],
    password
  );

  if (!filledPassword) {
    if (sawOtpPrompt) {
      return { ok: false, status: "paused_login", reason: "Disney asked for a one-time code or fresh login." };
    }
    return { ok: false, status: "paused_login", reason: "Disney login could not be completed automatically." };
  }

  await progress("password_step", "Submitted Disney password step.");
  await clickFirst(page, ["button:has-text('Log In')", "button:has-text('Continue')"]);
  await page.waitForTimeout(3000);

  const stillNeedsLogin =
    page.url().includes("/profile") &&
    ((await page.locator('input[type="password"]').count().catch(() => 0)) > 0 ||
      (await page.locator("text=/one-time code/i").count().catch(() => 0)) > 0);

  if (stillNeedsLogin) {
    return { ok: false, status: "paused_login", reason: "Disney still required login or a one-time code after submit." };
  }

  return { ok: true };
}

async function scrapeConnectedMembers(page, progress) {
  await progress("select_party", "Opening Disney select-party to import connected members.");
  await gotoWithRetry(page, SELECT_PARTY_URL, "Disney select-party");
  await page.waitForTimeout(3000);

  const url = page.url();
  if (url.includes("/profile")) {
    return {
      ok: false,
      status: "paused_login",
      reason: "Disney redirected to profile/login instead of the select-party screen.",
    };
  }

  const inspection = await inspectConnectedMembersFromPage(page);
  const validMembers = inspection.extractedMembers.filter((member) => member && member.displayName && member.passLabel);
  const diagnostics = {
    extractedRowCount: inspection.extractedRowCount,
    acceptedMemberCount: validMembers.length,
    rejectedMemberCount: inspection.rejectedRows.length,
    rejectionReasons: inspection.rejectedRows.map((row) => row.reason),
    pageUrl: inspection.pageUrl,
  };

  if (!validMembers.length) {
    return {
      ok: false,
      status: "paused_mismatch",
      reason: "Disney opened, but no connected party members were found on the select-party page.",
      diagnostics,
    };
  }

  const importedDisneyMembers = toImportedDisneyMembers(validMembers, "primary");

  await progress("members_imported", `Imported ${importedDisneyMembers.length} connected Disney members.`);
  return { ok: true, importedDisneyMembers, diagnostics };
}

async function checkVisibleCheckbox(row) {
  const input = row.locator('input[type="checkbox"]').first();
  if ((await input.count()) > 0) {
    try {
      await input.check({ force: true, timeout: 1500 });
      return true;
    } catch {
      try {
        await input.click({ force: true, timeout: 1500 });
        return true;
      } catch {
        // fall through
      }
    }
  }

  const label = row.locator("label").first();
  if ((await label.count()) > 0) {
    try {
      await label.click({ force: true, timeout: 1500 });
      return true;
    } catch {
      // fall through
    }
  }

  try {
    await row.click({ force: true, timeout: 1500 });
    return true;
  } catch {
    return false;
  }
}

async function selectBookingTargetRows(page, selectedMembers) {
  const rowLocator = page.locator(".sectionContainer");
  const rowCount = await rowLocator.count();
  const matchedMembers = [];
  const missingMembers = [];

  for (const member of selectedMembers) {
    const targetName = normalizeMemberMatchValue(member.displayName);
    const targetPass = normalizeMemberMatchValue(member.passLabel);
    let matched = false;

    for (let index = 0; index < rowCount; index += 1) {
      const row = rowLocator.nth(index);
      const rowText = normalizeMemberMatchValue(await row.innerText().catch(() => ""));
      if (!rowText.includes(targetName) || !rowText.includes(targetPass)) continue;
      if (!await checkVisibleCheckbox(row)) continue;
      matchedMembers.push(member);
      matched = true;
      break;
    }

    if (!matched) {
      missingMembers.push(member);
    }
  }

  return { matchedMembers, missingMembers };
}

async function clickBookingContinue(page) {
  const selectors = [
    "button:has-text('Continue')",
    "button:has-text('Next')",
    "button:has-text('Review')",
    "button:has-text('Confirm')",
    "button:has-text('Reserve')",
    "[data-testid*='continue']",
    "[data-testid*='Continue']",
  ];

  for (const selector of selectors) {
    const button = page.locator(selector).first();
    try {
      if (await button.isVisible({ timeout: 1000 })) {
        await button.click({ timeout: 1500 });
        await page.waitForTimeout(2500);
        return true;
      }
    } catch {
      // try next selector
    }
  }

  return false;
}

async function determineBookingOutcome(page) {
  const url = page.url();
  const bodyText = normalizeMemberMatchValue(await page.locator("body").innerText().catch(() => ""));

  if (/one-time code|log in|login/i.test(bodyText) || url.includes("/profile")) {
    return {
      ok: false,
      status: "paused_login",
      reason: "Disney asked for a fresh login before the booking attempt could finish.",
    };
  }

  if (
    /reservation confirmed|you're all set|reservation booked|see your plans|view your plans/i.test(bodyText) ||
    /confirmation|confirm-reservation|reserve\/confirmation/i.test(url)
  ) {
    return {
      ok: true,
      status: "booked",
      note: "Disney confirmed the reservation booking attempt.",
    };
  }

  if (!url.includes("/entry-reservation/add/select-party/")) {
    return {
      ok: true,
      status: "connected",
      note: "Booking attempt advanced past Disney's select-party step, but no confirmation screen was detected automatically.",
    };
  }

  return {
    ok: false,
    status: "paused_mismatch",
    reason: "Disney did not advance past the select-party step after choosing the targeted Magic Key members.",
  };
}

async function createLocalContext(profileDir, headless = false) {
  ensureLocalProfileDir(profileDir);
  return chromium.launchPersistentContext(profileDir, {
    headless,
    args: ["--disable-http2"],
  });
}

async function handleConnect(job, payload, progress, profileDir) {
  const context = await createLocalContext(profileDir, false);
  const page = context.pages()[0] || (await context.newPage());

  try {
    let login = { ok: true };

    if (payload.password) {
      login = await maybeLogin(page, payload.disneyEmail, payload.password, progress);
    } else {
      await progress("disney_open", "Opening Disney profile with the local session on this Mac.");
      await gotoWithRetry(page, PROFILE_URL, "Disney profile");
      await page.waitForTimeout(1500);

      const stillNeedsLogin =
        page.url().includes("/profile") &&
        ((await page.locator('input[type="password"]').count().catch(() => 0)) > 0 ||
          (await page.locator('input[type="email"]').count().catch(() => 0)) > 0 ||
          (await page.locator("text=/one-time code/i").count().catch(() => 0)) > 0);

      if (stillNeedsLogin) {
        login = {
          ok: false,
          status: "paused_login",
          reason: "This Mac still needs a live Disney sign-in before it can continue.",
        };
      }
    }

    if (!login.ok) {
      return {
        ok: false,
        status: login.status,
        hasLocalSession: false,
        lastAuthFailureReason: login.reason,
        lastRequiredActionMessage: "Refresh the Disney planner hub manually and reconnect.",
        note: login.reason,
      };
    }

    const imported = await scrapeConnectedMembers(page, progress);
    if (!imported.ok) {
      return {
        ok: false,
        status: imported.status,
        diagnostics: imported.diagnostics,
        lastAuthFailureReason: imported.reason,
        lastRequiredActionMessage: imported.reason,
        note: imported.reason,
      };
    }

    await progress("session_captured", "Encrypted Disney browser session captured.");

    return {
      ok: true,
      status: "connected",
      importedDisneyMembers: imported.importedDisneyMembers,
      diagnostics: imported.diagnostics,
      hasLocalSession: true,
      note: "Connected Disney planner hub and imported connected members from the live select-party flow.",
    };
  } finally {
    await context.close();
  }
}

async function handleImport(job, payload, progress, profileDir) {
  const context = await createLocalContext(profileDir, false);
  const page = context.pages()[0] || (await context.newPage());

  try {
    const imported = await scrapeConnectedMembers(page, progress);
    if (!imported.ok) {
      return {
        ok: false,
        status: imported.status,
        diagnostics: imported.diagnostics,
        hasLocalSession: imported.status !== "paused_login",
        lastAuthFailureReason: imported.reason,
        lastRequiredActionMessage:
          imported.status === "paused_login"
            ? "Disney session expired. Reconnect the planner hub."
            : imported.reason,
        note: imported.reason,
      };
    }

    await progress("session_captured", "Updated encrypted Disney browser session state.");

    return {
      ok: true,
      status: "connected",
      importedDisneyMembers: imported.importedDisneyMembers,
      diagnostics: imported.diagnostics,
      hasLocalSession: true,
      note: "Imported connected Disney members from the live select-party flow.",
    };
  } finally {
    await context.close();
  }
}

async function handleBooking(job, payload, progress, profileDir) {
  const context = await createLocalContext(profileDir, false);
  const page = context.pages()[0] || (await context.newPage());

  try {
    const runBookingStep = async (phase, task) => {
      const timeoutMs = BOOKING_PHASE_TIMEOUT_MS[phase] || 1000 * 60;
      let timeoutId;
      try {
        return await Promise.race([
          task(),
          new Promise((_, reject) => {
            timeoutId = setTimeout(async () => {
              try {
                await context.close();
              } catch {
                // ignore close errors during timeout recovery
              }
              reject(new DisneyBookingStepTimeoutError(phase, timeoutMs));
            }, timeoutMs);
          }),
        ]);
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    };

    const imported = await runBookingStep("select_party", () => scrapeConnectedMembers(page, progress));
    if (!imported.ok) {
      return {
        ok: false,
        status: imported.status,
        diagnostics: {
          ...(imported.diagnostics || {}),
          targetWatchDate: payload.bookingTarget?.watchDate || "",
          targetMemberIds: payload.bookingTarget?.selectedMembers?.map((member) => member.id) || [],
          partySelectionCount: payload.bookingTarget?.selectedMembers?.length || 0,
        },
        hasLocalSession: imported.status !== "paused_login",
        lastAuthFailureReason: imported.reason,
        lastRequiredActionMessage: imported.reason,
        note: imported.reason,
      };
    }

    const selectedMembers = Array.isArray(payload.bookingTarget?.selectedMembers)
      ? payload.bookingTarget.selectedMembers.filter((member) => member?.entitlementType === "magic_key" && member?.automatable)
      : [];

    if (!selectedMembers.length) {
      return {
        ok: false,
        status: "paused_mismatch",
        diagnostics: {
          ...(imported.diagnostics || {}),
          targetWatchDate: payload.bookingTarget?.watchDate || "",
          targetMemberIds: [],
          partySelectionCount: 0,
        },
        hasLocalSession: true,
        lastAuthFailureReason: "No eligible imported Magic Key targets were selected for this watched date.",
        lastRequiredActionMessage: "Choose at least one eligible imported Magic Key member before attempting booking.",
        note: "No eligible imported Magic Key targets were selected for this watched date.",
      };
    }

    const currentMembersByFingerprint = new Map(
      imported.importedDisneyMembers.map((member) => [
        `${normalizeMemberMatchValue(member.displayName)}::${normalizeMemberMatchValue(member.passLabel)}`,
        member,
      ])
    );
    const staleTargets = selectedMembers.filter(
      (member) =>
        !currentMembersByFingerprint.has(
          `${normalizeMemberMatchValue(member.displayName)}::${normalizeMemberMatchValue(member.passLabel)}`
        )
    );

    if (staleTargets.length > 0) {
      return {
        ok: false,
        status: "paused_mismatch",
        diagnostics: {
          ...(imported.diagnostics || {}),
          targetWatchDate: payload.bookingTarget?.watchDate || "",
          targetMemberIds: selectedMembers.map((member) => member.id),
          partySelectionCount: selectedMembers.length,
          rejectionReasons: [
            ...(imported.diagnostics?.rejectionReasons || []),
            `Selected targets are no longer present: ${staleTargets.map((member) => member.displayName).join(", ")}`,
          ],
        },
        hasLocalSession: true,
        lastAuthFailureReason: "The selected Magic Key members no longer match Disney's live select-party page.",
        lastRequiredActionMessage: "Refresh the connected Disney party and reselect the member targets for this watched date.",
        note: "The selected Magic Key members no longer match Disney's live select-party page.",
      };
    }

    const selection = await runBookingStep("select_party", () => selectBookingTargetRows(page, selectedMembers));
    const bookingDiagnostics = {
      ...(imported.diagnostics || {}),
      targetWatchDate: payload.bookingTarget?.watchDate || "",
      targetMemberIds: selectedMembers.map((member) => member.id),
      partySelectionCount: selection.matchedMembers.length,
      rejectedMemberCount: (imported.diagnostics?.rejectedMemberCount || 0) + selection.missingMembers.length,
      rejectionReasons: [
        ...(imported.diagnostics?.rejectionReasons || []),
        ...selection.missingMembers.map((member) => `Could not select booking row for ${member.displayName}.`),
      ],
      pageUrl: page.url(),
    };

    if (selection.missingMembers.length > 0) {
      return {
        ok: false,
        status: "paused_mismatch",
        diagnostics: bookingDiagnostics,
        hasLocalSession: true,
        lastAuthFailureReason: "Disney did not expose all of the selected Magic Key targets on the live select-party page.",
        lastRequiredActionMessage: "Refresh the connected Disney party and reselect the targeted members before trying this booking again.",
        note: `Disney could not select ${selection.missingMembers.length} targeted Magic Key member(s).`,
      };
    }

    await progress(
      "members_imported",
      `Matched ${selection.matchedMembers.length} targeted Magic Key member${selection.matchedMembers.length === 1 ? "" : "s"} for ${payload.bookingTarget?.watchDate || "the watched date"}.`
    );

    const { advanced, outcome } = await runBookingStep("members_imported", async () => ({
      advanced: await clickBookingContinue(page),
      outcome: await determineBookingOutcome(page),
    }));

    if (!advanced && !outcome.ok) {
      return {
        ok: false,
        status: "paused_mismatch",
        diagnostics: bookingDiagnostics,
        hasLocalSession: true,
        lastAuthFailureReason: "Disney did not expose a continue path after the targeted party members were selected.",
        lastRequiredActionMessage: "Open the watched date manually and confirm that Disney still offers the next booking step for this party.",
        note: "Disney did not expose a continue path after the targeted party members were selected.",
        importedDisneyMembers: imported.importedDisneyMembers,
      };
    }

    return {
      ok: outcome.ok,
      status: outcome.status,
      diagnostics: {
        ...bookingDiagnostics,
        pageUrl: page.url(),
      },
      hasLocalSession: true,
      importedDisneyMembers: imported.importedDisneyMembers,
      lastAuthFailureReason: outcome.ok ? "" : outcome.reason,
      lastRequiredActionMessage:
        outcome.ok
          ? ""
          : outcome.status === "paused_login"
            ? "Reconnect Disney on the active Mac before retrying this booking attempt."
            : outcome.reason,
      note: outcome.ok ? outcome.note : outcome.reason,
    };
  } catch (error) {
    if (error instanceof DisneyBookingStepTimeoutError) {
      return {
        ok: false,
        status: "failed",
        hasLocalSession: true,
        lastAuthFailureReason: error.message,
        lastRequiredActionMessage:
          "Refresh status, then retry the booking if Disney is still available. If the worker keeps timing out, reconnect Disney on the active Mac first.",
        note: error.message,
      };
    }
    throw error;
  } finally {
    await context.close();
  }
}

export async function runWorker({
  appUrl = DEFAULT_APP_URL,
  workerSecret = DEFAULT_WORKER_SECRET,
  localWorkerToken = DEFAULT_LOCAL_WORKER_TOKEN,
  deviceId = DEFAULT_LOCAL_DEVICE_ID,
  deviceName = DEFAULT_LOCAL_DEVICE_NAME,
  localProfilePath = DEFAULT_LOCAL_PROFILE_DIR,
  expectJob = false,
  loop = false,
} = {}) {
  const localMode = Boolean(localWorkerToken && deviceId);
  const legacyApi = localMode ? null : createWorkerApi({ appUrl, workerSecret });
  const localApi = localMode
    ? createLocalWorkerApi({ appUrl, localWorkerToken, deviceId, deviceName, localProfilePath })
    : null;
  const reportedBy = localMode ? `local-device:${deviceName}@${hostname()}` : `worker-service:${appUrl}`;

  log("starting", { appUrl, expectJob, loop, localMode, deviceId: localMode ? deviceId : undefined, deviceName: localMode ? deviceName : undefined });

  do {
    if (localApi) {
      await localApi.checkIn();
    }

    const claimed = localApi
      ? await localApi.claim()
      : await legacyApi.api("/api/disney/worker/claim", { method: "POST" });
    log("claim response", {
      appUrl,
      claimedJobId: claimed?.job?.id || null,
      claimedJobType: claimed?.job?.type || null,
      diagnostics: claimed?.diagnostics || null,
    });

    if (!claimed?.job) {
      if (expectJob) {
        throw new Error(
          `Expected a planner-hub job on ${appUrl}, but claim returned none. Diagnostics: ${JSON.stringify(
            claimed?.diagnostics || {}
          )}`
        );
      }

      log("no pending job found", { appUrl });
      if (loop) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }
      break;
    }

    let result;
    try {
      log("processing job", {
        jobId: claimed.job.id,
        jobType: claimed.job.type,
        disneyEmail: claimed.job.disneyEmail,
      });

      const progress = async (phase, message) => {
        await (localApi
          ? localApi.reportProgress(claimed.job.id, phase, message, reportedBy, hasLocalSession(localProfilePath))
          : legacyApi.reportProgress(claimed.job.id, phase, message, reportedBy));
      };

      result =
        claimed.job.type === "connect"
          ? await handleConnect(claimed.job, claimed.payload, progress, localProfilePath)
          : claimed.job.type === "booking"
            ? await handleBooking(claimed.job, claimed.payload, progress, localProfilePath)
            : await handleImport(claimed.job, claimed.payload, progress, localProfilePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Disney worker failed unexpectedly.";
      result = {
        ok: false,
        status: "failed",
        hasLocalSession: hasLocalSession(localProfilePath),
        lastAuthFailureReason: message,
        lastRequiredActionMessage: message,
        note: message,
      };
    }

    await (localApi
      ? localApi.reportFinal(claimed.job.id, result, reportedBy)
      : legacyApi.reportFinal(claimed.job.id, result, reportedBy));

    if (expectJob) {
      if (!result.ok) {
        throw new Error(
          `Disney worker processed job ${claimed.job.id} but ended in ${result.status}: ${
            result.lastAuthFailureReason || result.lastRequiredActionMessage || result.note || "Unknown reason."
          }`
        );
      }
      break;
    }

    if (!loop) {
      break;
    }
  } while (true);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runWorker({
    expectJob: process.env.WORKER_EXPECT_JOB === "1",
    loop: process.argv.includes("--loop") || process.env.WORKER_LOOP === "1",
  }).catch((error) => {
    console.error("[disney-worker] fatal", error);
    process.exit(1);
  });
}
