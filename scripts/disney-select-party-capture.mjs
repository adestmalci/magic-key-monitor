import { homedir } from "node:os";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { extractConnectedMembersFromPage, toImportedDisneyMembers } from "./disney-select-party-parser.mjs";

const SELECT_PARTY_URL = "https://disneyland.disney.go.com/entry-reservation/add/select-party/";
const PROFILE_URL = "https://disneyland.disney.go.com/profile/";
const DEFAULT_LOCAL_PROFILE_DIR =
  process.env.MAGIC_KEY_LOCAL_PROFILE_DIR ||
  path.join(homedir(), "Library", "Application Support", "Magic Key Monitor", "disney-profile");

const OUTPUT_DIR = path.join(process.cwd(), "tmp");

await mkdir(OUTPUT_DIR, { recursive: true });

const context = await chromium.launchPersistentContext(DEFAULT_LOCAL_PROFILE_DIR, {
  headless: false,
  args: ["--disable-http2"],
});

const page = context.pages()[0] || (await context.newPage());
await page.goto(SELECT_PARTY_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForTimeout(6000);

const currentUrl = page.url();
if (currentUrl.includes("/profile")) {
  console.log("[disney-select-party-capture] Disney redirected to profile/login.");
  console.log("[disney-select-party-capture] Sign in if needed, then rerun the capture command.");
}

const html = await page.content();
const text = await page.locator("body").innerText();
const extracted = await extractConnectedMembersFromPage(page);
const imported = toImportedDisneyMembers(extracted);
const shadowSnapshot = await page.evaluate(() => {
  const host = document.querySelector("tnp-reservations-spa");
  const root = host?.shadowRoot;
  return {
    hostFound: Boolean(host),
    shadowFound: Boolean(root),
    shadowHtml: root?.innerHTML || "",
    shadowText: root?.innerText || root?.textContent || "",
  };
});

await writeFile(path.join(OUTPUT_DIR, "disney-select-party-rendered.html"), html, "utf8");
await writeFile(path.join(OUTPUT_DIR, "disney-select-party-rendered.txt"), text, "utf8");
await writeFile(path.join(OUTPUT_DIR, "disney-select-party-shadow.html"), shadowSnapshot.shadowHtml, "utf8");
await writeFile(path.join(OUTPUT_DIR, "disney-select-party-shadow.txt"), shadowSnapshot.shadowText, "utf8");
await writeFile(
  path.join(OUTPUT_DIR, "disney-select-party-members.json"),
  JSON.stringify(
    {
      url: currentUrl,
      shadowFound: shadowSnapshot.shadowFound,
      extracted,
      imported,
    },
    null,
    2
  ),
  "utf8"
);
await page.screenshot({ path: path.join(OUTPUT_DIR, "disney-select-party-rendered.png"), fullPage: true });

console.log("Saved:");
console.log("  tmp/disney-select-party-rendered.html");
console.log("  tmp/disney-select-party-rendered.txt");
console.log("  tmp/disney-select-party-shadow.html");
console.log("  tmp/disney-select-party-shadow.txt");
console.log("  tmp/disney-select-party-members.json");
console.log("  tmp/disney-select-party-rendered.png");

await context.close();
