import { mkdir, writeFile } from "node:fs/promises";

const headers = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  accept: "application/json, text/plain, */*",
  referer: "https://disneyland.disney.go.com/passes/blockout-dates/",
};

const endpoints = [
  {
    name: "get-passes",
    url: "https://disneyland.disney.go.com/passes/blockout-dates/api/get-passes/",
  },
  {
    name: "get-availability",
    url:
      "https://disneyland.disney.go.com/passes/blockout-dates/api/get-availability/?product-types=inspire-key-pass,believe-key-pass,enchant-key-pass,explore-key-pass,imagine-key-pass&destinationId=DLR&numMonths=14",
  },
];

await mkdir("tmp", { recursive: true });

for (const endpoint of endpoints) {
  const response = await fetch(endpoint.url, { headers });
  const text = await response.text();

  console.log(`\n=== ${endpoint.name} ===`);
  console.log(`status: ${response.status}`);
  console.log(`content-type: ${response.headers.get("content-type")}`);

  await writeFile(`tmp/${endpoint.name}.json`, text, "utf8");
  console.log(`saved: tmp/${endpoint.name}.json`);
}
