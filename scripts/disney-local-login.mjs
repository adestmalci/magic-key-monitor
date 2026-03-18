import { homedir } from "node:os";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const PROFILE_URL = "https://disneyland.disney.go.com/profile/";
const DEFAULT_LOCAL_PROFILE_DIR =
  process.env.MAGIC_KEY_LOCAL_PROFILE_DIR ||
  path.join(homedir(), "Library", "Application Support", "Magic Key Monitor", "disney-profile");

mkdirSync(DEFAULT_LOCAL_PROFILE_DIR, { recursive: true });

const context = await chromium.launchPersistentContext(DEFAULT_LOCAL_PROFILE_DIR, {
  headless: false,
  args: ["--disable-http2"],
});

const page = context.pages()[0] || (await context.newPage());
await page.goto(PROFILE_URL, { waitUntil: "domcontentloaded", timeout: 120000 });

console.log("[disney-local-login] Opened Disney profile with the local worker browser profile.");
console.log("[disney-local-login] Sign in, complete any one-time code, confirm the page looks right, then close the browser window.");

context.on("close", () => {
  process.exit(0);
});

await new Promise(() => {});
