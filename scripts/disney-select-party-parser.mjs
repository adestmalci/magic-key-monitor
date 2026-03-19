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

function parseSourceGroup(sectionLabel, passLabel) {
  const combined = `${sectionLabel || ""} ${passLabel || ""}`;
  return /Magic Key/i.test(combined) ? "magic_key" : "ticket_holder";
}

export function extractConnectedMembersFromDocument() {
  const junkPattern =
    /Footer Links|Visit Disney|Related Disney Sites|Parks\s*&\s*Tickets|Things To Do|Places To Stay|Help|Annual Passports|Tickets\s*&\s*Parks/i;

  function normalizedLines(node) {
    const text = (node?.innerText || node?.textContent || "").trim();
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line, index, list) => list.indexOf(line) === index);
  }

  function findSectionLabel(node) {
    let cursor = node;
    while (cursor) {
      let sibling = cursor.previousElementSibling;
      while (sibling) {
        const lines = normalizedLines(sibling);
        const match = lines.find(
          (line) =>
            /Magic Key/i.test(line) ||
            /Ticket Holders?/i.test(line) ||
            /Theme Park Ticket/i.test(line) ||
            /^Tickets?$/i.test(line)
        );
        if (match && !junkPattern.test(match)) return match;
        sibling = sibling.previousElementSibling;
      }
      cursor = cursor.parentElement;
    }
    return "";
  }

  function validateLines(lines) {
    const displayName = lines.find((line) => looksLikeRealMemberName(line)) || "";
    const ageLine = lines.find((line) => /^Age\s*/i.test(line) || /Guest/i.test(line)) || "";
    const passLabel =
      lines.find(
        (line) =>
          (/Magic Key|Ticket/i.test(line) || /Inspire|Believe|Enchant|Explore|Imagine/i.test(line)) &&
          !/Reservation/i.test(line) &&
          !junkPattern.test(line)
      ) || "";

    return {
      displayName,
      ageLine,
      passLabel,
      valid: Boolean(displayName && passLabel),
    };
  }

  function findRowContainer(node) {
    let cursor = node;
    let depth = 0;
    while (cursor && depth < 8) {
      const lines = normalizedLines(cursor);
      const validation = validateLines(lines);
      if (validation.valid && lines.length <= 20 && !lines.some((line) => junkPattern.test(line))) {
        return { node: cursor, lines, ...validation, depth };
      }
      cursor = cursor.parentElement;
      depth += 1;
    }
    return null;
  }

  const seen = new Set();
  return Array.from(document.querySelectorAll('input[type="checkbox"]'))
    .map((input, index) => {
      const row = findRowContainer(input);
      if (!row) return null;
      const sectionLabel = findSectionLabel(row.node) || row.passLabel;
      const sourceGroup = parseSourceGroup(sectionLabel, row.passLabel);
      const rawEligibilityText = row.lines
        .filter((line) => /Reservation/i.test(line) || /No-Shows?/i.test(line))
        .join(" • ");
      const dedupeKey = `${sourceGroup}:${row.displayName.toLowerCase()}:${row.passLabel.toLowerCase()}`;
      if (seen.has(dedupeKey)) return null;
      seen.add(dedupeKey);

      return {
        id: `${sectionLabel || "member"}-${index}`,
        displayName: row.displayName,
        ageLine: row.ageLine,
        entitlementLabel: sectionLabel || "Connected member",
        rawSectionLabel: sectionLabel || "",
        passLabel: row.passLabel,
        rawEligibilityText,
        sourceGroup,
        rawLines: row.lines,
      };
    })
    .filter(Boolean);
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
