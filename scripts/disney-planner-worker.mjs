import { homedir, hostname } from "node:os";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

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
  const waits = ["domcontentloaded", "load", "commit"];
  let lastError = null;

  for (let index = 0; index < waits.length; index += 1) {
    try {
      await page.goto(url, { waitUntil: waits[index], timeout: 120000 });
      return;
    } catch (error) {
      lastError = error;
      log("navigation retry", {
        label,
        url,
        waitUntil: waits[index],
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

function parsePassType(text) {
  const normalized = String(text || "").toLowerCase();
  if (normalized.includes("inspire")) return "inspire";
  if (normalized.includes("believe")) return "believe";
  if (normalized.includes("enchant")) return "enchant";
  if (normalized.includes("explore")) return "explore";
  if (normalized.includes("imagine")) return "imagine";
  return "";
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

  const members = await page.locator('input[type="checkbox"]').evaluateAll((inputs) => {
    function headingFor(node) {
      let cursor = node;
      while (cursor) {
        let sibling = cursor.previousElementSibling;
        while (sibling) {
          const text = (sibling.textContent || "").trim();
          if (/Magic Key Pass/i.test(text)) return "Magic Key Pass";
          if (/Ticket/i.test(text)) return text;
          sibling = sibling.previousElementSibling;
        }
        cursor = cursor.parentElement;
      }
      return "";
    }

    function extractLines(node) {
      let cursor = node;
      while (cursor) {
        const text = (cursor.innerText || "").trim();
        const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
        if (lines.length >= 3) return lines;
        cursor = cursor.parentElement;
      }
      return [];
    }

    return inputs.map((input, index) => {
      const lines = extractLines(input);
      const heading = headingFor(input);
      const displayName =
        lines.find((line) => !/^Age/i.test(line) && !/Reservation/i.test(line) && !/No-Shows?/i.test(line) && !/View Details/i.test(line)) || "";
      const passLabel =
        lines.find((line) => /Key Pass|Ticket/i.test(line) && !/Reservation/i.test(line)) || "";
      const rawEligibilityText = lines
        .filter((line) => /Reservation/i.test(line) || /No-Shows?/i.test(line))
        .join(" • ");

      return {
        id: `${heading || "member"}-${index}`,
        displayName,
        entitlementLabel: heading || "Connected member",
        passLabel,
        rawEligibilityText,
      };
    });
  });

  if (!members.length) {
    return {
      ok: false,
      status: "paused_mismatch",
      reason: "Disney opened, but no connected party members were found on the select-party page.",
    };
  }

  const importedDisneyMembers = members.map((member) => {
    const entitlementType = /Magic Key/i.test(member.entitlementLabel) ? "magic_key" : "ticket_holder";
    const magicKeyPassType = entitlementType === "magic_key" ? parsePassType(member.passLabel) : "";
    return {
      id: `${member.id}-${member.displayName.replace(/\s+/g, "-").toLowerCase()}`,
      plannerHubId: "primary",
      displayName: member.displayName,
      entitlementType,
      entitlementLabel: member.entitlementLabel,
      passLabel: member.passLabel,
      magicKeyPassType,
      rawEligibilityText: member.rawEligibilityText,
      automatable: entitlementType === "magic_key" && Boolean(magicKeyPassType),
      importedAt: new Date().toISOString(),
    };
  });

  await progress("members_imported", `Imported ${importedDisneyMembers.length} connected Disney members.`);
  return { ok: true, importedDisneyMembers };
}

async function createLocalContext(profileDir, headless = true) {
  ensureLocalProfileDir(profileDir);
  return chromium.launchPersistentContext(profileDir, {
    headless,
    args: ["--disable-http2"],
  });
}

async function handleConnect(job, payload, progress, profileDir) {
  const context = await createLocalContext(profileDir, true);
  const page = context.pages()[0] || (await context.newPage());

  try {
    const login = await maybeLogin(page, payload.disneyEmail, payload.password, progress);
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
      hasLocalSession: true,
      note: "Connected Disney planner hub and imported connected members from the live select-party flow.",
    };
  } finally {
    await context.close();
  }
}

async function handleImport(job, payload, progress, profileDir) {
  const context = await createLocalContext(profileDir, true);
  const page = context.pages()[0] || (await context.newPage());

  try {
    const imported = await scrapeConnectedMembers(page, progress);
    if (!imported.ok) {
      return {
        ok: false,
        status: imported.status,
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
      hasLocalSession: true,
      note: "Imported connected Disney members from the live select-party flow.",
    };
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
