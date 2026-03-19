function parsePassType(text) {
  const normalized = String(text || "").toLowerCase();
  if (normalized.includes("inspire")) return "inspire";
  if (normalized.includes("believe")) return "believe";
  if (normalized.includes("enchant")) return "enchant";
  if (normalized.includes("explore")) return "explore";
  if (normalized.includes("imagine")) return "imagine";
  return "";
}

function looksLikeRealMemberName(text) {
  const value = String(text || "").trim();
  if (!value) return false;
  if (value.length > 80) return false;
  if (/\.com\b/i.test(value)) return false;
  if (/[_{}\[\];]/.test(value)) return false;
  if (/function\s*\(|_satellite|querySelector|setTimeout|return\s*\(/i.test(value)) return false;
  if (/Magic Key|Ticket|Reservation|No-Shows?|View Details|Related Disney Sites|Visit Disney|Age\s*\d/i.test(value)) return false;
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  return words.every((word) => /^[A-Za-z'.-]+$/.test(word));
}

function parseSourceGroupFromPassLabel(passLabel) {
  return /ticket/i.test(String(passLabel || "")) ? "ticket_holder" : "magic_key";
}

function normalizeLines(lines) {
  return lines
    .map((line) => String(line || "").trim())
    .filter(Boolean)
    .filter((line, index, list) => list.indexOf(line) === index);
}

export function extractConnectedMembersFromLines(rows) {
  const seen = new Set();
  return rows
    .map((row, index) => {
      const lines = normalizeLines(Array.isArray(row) ? row : []);
      if (!lines.length) return null;

      const displayName = lines.find((line) => looksLikeRealMemberName(line)) || "";
      const ageLine = lines.find((line) => /^Age\s*/i.test(line) || /Guest/i.test(line)) || "";
      const passLabel =
        lines.find(
          (line) =>
            (/Magic Key|Ticket/i.test(line) || /Inspire|Believe|Enchant|Explore|Imagine/i.test(line)) &&
            !/Reservation/i.test(line) &&
            !/Footer Links|Visit Disney|Parks\s*&\s*Tickets|Related Disney Sites/i.test(line)
        ) || "";

      if (!displayName || !passLabel) return null;

      const sourceGroup = parseSourceGroupFromPassLabel(passLabel);
      const dedupeKey = `${sourceGroup}:${displayName.toLowerCase()}:${passLabel.toLowerCase()}`;
      if (seen.has(dedupeKey)) return null;
      seen.add(dedupeKey);

      return {
        id: `member-${index}`,
        displayName,
        ageLine,
        entitlementLabel: sourceGroup === "magic_key" ? "Magic Key Pass" : "Ticket holder",
        rawSectionLabel: sourceGroup === "magic_key" ? "Magic Key Pass" : "Ticket holder",
        passLabel,
        rawEligibilityText: lines
          .filter((line) => /Reservation/i.test(line) || /No-Shows?/i.test(line))
          .join(" • "),
        sourceGroup,
        rawLines: lines,
      };
    })
    .filter(Boolean);
}

export async function extractConnectedMembersFromPage(page) {
  const rowLocator = page.locator(".sectionContainer");
  const rowCount = await rowLocator.count();
  const rows = [];

  for (let index = 0; index < rowCount; index += 1) {
    const text = await rowLocator.nth(index).innerText().catch(() => "");
    rows.push(
      text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    );
  }

  return extractConnectedMembersFromLines(rows);
}

export function toImportedDisneyMembers(extractedMembers, plannerHubId = "primary") {
  return extractedMembers.map((member) => {
    const entitlementType = member.sourceGroup === "ticket_holder" ? "ticket_holder" : "magic_key";
    const magicKeyPassType = entitlementType === "magic_key" ? parsePassType(member.passLabel) : "";
    return {
      id: `${member.id}-${member.displayName.replace(/\s+/g, "-").toLowerCase()}`,
      plannerHubId,
      displayName: member.displayName,
      entitlementType,
      sourceGroup: entitlementType,
      entitlementLabel: member.entitlementLabel,
      rawSectionLabel: member.rawSectionLabel || "",
      passLabel: member.passLabel,
      magicKeyPassType,
      rawEligibilityText: member.rawEligibilityText || "",
      automatable: entitlementType === "magic_key" && Boolean(magicKeyPassType),
      importedAt: new Date().toISOString(),
    };
  });
}
