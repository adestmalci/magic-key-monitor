import { readFile } from "node:fs/promises";
import path from "node:path";
import { toImportedDisneyMembers } from "./disney-select-party-parser.mjs";

const FIXTURE_PATH = path.join(process.cwd(), "tmp", "disney-select-party-members.json");

async function run() {
  const fixture = JSON.parse(await readFile(FIXTURE_PATH, "utf8"));
  const extracted = fixture.extracted || [];
  const imported = toImportedDisneyMembers(extracted);
  const magicKeyCount = imported.filter((member) => member.entitlementType === "magic_key").length;
  const ticketHolderCount = imported.filter((member) => member.entitlementType === "ticket_holder").length;
  const combinedText = imported
    .map((member) => `${member.displayName} ${member.passLabel} ${member.entitlementLabel} ${member.rawSectionLabel}`)
    .join("\n");

  if (imported.length !== 3) {
    throw new Error(`Expected 3 imported members from fixture, got ${imported.length}.`);
  }
  if (magicKeyCount !== 2) {
    throw new Error(`Expected 2 Magic Key members from fixture, got ${magicKeyCount}.`);
  }
  if (ticketHolderCount !== 1) {
    throw new Error(`Expected 1 ticket holder from fixture, got ${ticketHolderCount}.`);
  }
  if (/Footer Links|Visit Disney|Parks\s*&\s*Tickets|Related Disney Sites|function\s*\(|_satellite/i.test(combinedText)) {
    throw new Error("Fixture parser output still contains bogus Disney footer/navigation text.");
  }

  console.log("Disney select-party parser fixture passed.");
  console.log(JSON.stringify({ magicKeyCount, ticketHolderCount, imported }, null, 2));
}

run().catch((error) => {
  console.error("[test-disney-select-party-parser] fatal", error);
  process.exit(1);
});
