import { firefox } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const url = "https://disneyland.disney.go.com/passes/blockout-dates/";

const browser = await firefox.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1600, height: 2400 },
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:146.0) Gecko/20100101 Firefox/146.0",
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

await mkdir("tmp", { recursive: true });

const html = await page.content();
const text = await page.locator("body").innerText();

await writeFile("tmp/disney-magic-key-rendered-firefox.html", html, "utf8");
await writeFile("tmp/disney-magic-key-rendered-firefox.txt", text, "utf8");
await writeFile("tmp/disney-network-firefox.json", JSON.stringify(network, null, 2), "utf8");
await page.screenshot({ path: "tmp/disney-magic-key-rendered-firefox.png", fullPage: true });

console.log("Saved firefox outputs.");
await browser.close();
