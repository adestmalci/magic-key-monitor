import { chromium } from "playwright";

const APP_URL = (process.env.MAGIC_KEY_APP_URL || "").replace(/\/$/, "");
const CRON_SECRET = process.env.CRON_SECRET || "";
const SELECT_PARTY_URL = "https://disneyland.disney.go.com/entry-reservation/add/select-party/";
const PROFILE_URL = "https://disneyland.disney.go.com/profile/";

if (!APP_URL) {
  throw new Error("Missing MAGIC_KEY_APP_URL");
}

if (!CRON_SECRET) {
  throw new Error("Missing CRON_SECRET");
}

async function api(path, init = {}) {
  const response = await fetch(`${APP_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${CRON_SECRET}`,
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

function log(message, details) {
  if (details) {
    console.log(`[disney-worker] ${message}`, details);
    return;
  }
  console.log(`[disney-worker] ${message}`);
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

async function maybeLogin(page, email, password) {
  await page.goto(PROFILE_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForTimeout(1500);

  await fillFirst(page, ['input[type="email"]', 'input[name="email"]', 'input[placeholder*="Email" i]'], email);
  await clickFirst(page, ["button:has-text('Continue')", "button:has-text('Next')"]);
  await page.waitForTimeout(1500);

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

async function scrapeConnectedMembers(page) {
  await page.goto(SELECT_PARTY_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
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

  return { ok: true, importedDisneyMembers };
}

async function handleConnect(job, payload) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const login = await maybeLogin(page, payload.disneyEmail, payload.password);
    if (!login.ok) {
      return {
        ok: false,
        status: login.status,
        lastAuthFailureReason: login.reason,
        lastRequiredActionMessage: "Refresh the Disney planner hub manually and reconnect.",
        note: login.reason,
      };
    }

    const imported = await scrapeConnectedMembers(page);
    if (!imported.ok) {
      return {
        ok: false,
        status: imported.status,
        lastAuthFailureReason: imported.reason,
        lastRequiredActionMessage: imported.reason,
        note: imported.reason,
      };
    }

    return {
      ok: true,
      status: "connected",
      importedDisneyMembers: imported.importedDisneyMembers,
      sessionState: await context.storageState(),
      note: "Connected Disney planner hub and imported connected members from the live select-party flow.",
    };
  } finally {
    await browser.close();
  }
}

async function handleImport(job, payload) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: payload.sessionState || undefined,
  });
  const page = await context.newPage();

  try {
    const imported = await scrapeConnectedMembers(page);
    if (!imported.ok) {
      return {
        ok: false,
        status: imported.status,
        lastAuthFailureReason: imported.reason,
        lastRequiredActionMessage:
          imported.status === "paused_login"
            ? "Disney session expired. Reconnect the planner hub."
            : imported.reason,
        note: imported.reason,
      };
    }

    return {
      ok: true,
      status: "connected",
      importedDisneyMembers: imported.importedDisneyMembers,
      sessionState: await context.storageState(),
      note: "Imported connected Disney members from the live select-party flow.",
    };
  } finally {
    await browser.close();
  }
}

async function run() {
  const expectJob = process.env.WORKER_EXPECT_JOB === "1";
  log("starting", { appUrl: APP_URL, expectJob });
  while (true) {
    const claimed = await api("/api/disney/worker/claim", { method: "POST" });
    log("claim response", {
      appUrl: APP_URL,
      claimedJobId: claimed?.job?.id || null,
      claimedJobType: claimed?.job?.type || null,
      diagnostics: claimed?.diagnostics || null,
    });

    if (!claimed?.job) {
      if (expectJob) {
        throw new Error(
          `Expected a planner-hub job on ${APP_URL}, but claim returned none. Diagnostics: ${JSON.stringify(
            claimed?.diagnostics || {}
          )}`
        );
      }
      log("no pending job found");
      break;
    }

    let result;
    try {
      log("processing job", {
        jobId: claimed.job.id,
        jobType: claimed.job.type,
        disneyEmail: claimed.job.disneyEmail,
      });
      result =
        claimed.job.type === "connect"
          ? await handleConnect(claimed.job, claimed.payload)
          : await handleImport(claimed.job, claimed.payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Disney worker failed unexpectedly.";
      result = {
        ok: false,
        status: "failed",
        lastAuthFailureReason: message,
        lastRequiredActionMessage: message,
        note: message,
      };
    }

    log("reporting job result", {
      jobId: claimed.job.id,
      jobType: claimed.job.type,
      ok: result.ok,
      status: result.status,
      reason: result.lastAuthFailureReason || result.lastRequiredActionMessage || result.note || "",
    });
    await api("/api/disney/worker/report", {
      method: "POST",
      body: JSON.stringify({
        jobId: claimed.job.id,
        reportedBy: `github-actions:${APP_URL}`,
        ...result,
      }),
    });
    log("report succeeded", {
      jobId: claimed.job.id,
      jobType: claimed.job.type,
      ok: result.ok,
      status: result.status,
      reason: result.lastAuthFailureReason || result.lastRequiredActionMessage || result.note || "",
    });

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
  }
}

await run().catch((error) => {
  console.error("[disney-worker] fatal", error);
  process.exit(1);
});
