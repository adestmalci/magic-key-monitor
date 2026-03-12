import { promises as fs } from "fs";
import path from "path";

export async function GET() {
  const filePath = path.join(process.cwd(), "data", "magic-key-feed.json");
  const raw = await fs.readFile(filePath, "utf8");
  const items = JSON.parse(raw);

  return Response.json(items, {
    headers: { "Cache-Control": "no-store" },
  });
}
