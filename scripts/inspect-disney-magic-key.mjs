import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const url = "https://disneyland.disney.go.com/passes/blockout-dates/";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1600, height: 2400 },
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
});

const network = [];

page.on("response", async (response) => {
  const request = response.request();
  const resourceType = request.resourceType();

  if (resourceType === "xhr" || resourceType === "fetch") {
    network.push({
      url: response.url(),
      status: response.status(),
      resourceType,
      contentType: response.headers()["content-type"] || "",
    });
  }
});

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForTimeout(8000);

const passNames = [
  "Inspire Key",
  "Believe Key",
  "Enchant Key",
  "Explore Key",
  "Imagine Key",
];

for (const passName of passNames) {
  const locator = page.getByText(passName, { exact: true }).first();
  try {
    await locator.click({ timeout: 3000 });
    await page.waitForTimeout(1500);
  } catch {
    // ignore for now
  }
}

await mkdir("tmp", { recursive: true });

const html = await page.content();
const text = await page.locator("body").innerText();

await writeFile("tmp/disney-magic-key-rendered.html", html, "utf8");
await writeFile("tmp/disney-magic-key-rendered.txt", text, "utf8");
await writeFile("tmp/disney-network.json", JSON.stringify(network, null, 2), "utf8");
await page.screenshot({ path: "tmp/disney-magic-key-rendered.png", fullPage: true });

console.log("Saved:");
console.log("  tmp/disney-magic-key-rendered.html");
console.log("  tmp/disney-magic-key-rendered.txt");
console.log("  tmp/disney-network.json");
console.log("  tmp/disney-magic-key-rendered.png");

await browser.close();
