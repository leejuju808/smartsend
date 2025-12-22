/**
 * Step 6 (Roofing Homeowner Outreach) — CSV cleaner for a SINGLE locked city.
 *
 * Locked scope:
 * - City: Boise
 * - State: ID
 *
 * Input CSV requirements (case-insensitive headers accepted):
 * - Required: name, email, address, city, state
 * - Optional: zip
 *
 * Output:
 * - Writes a cleaned CSV with exact columns:
 *   name,email,address,city,state,zip
 * - Prints a summary report to stdout.
 *
 * What this enforces:
 * - Residential-ish addresses only (best-effort heuristics)
 * - No apartments/condos (best-effort heuristics)
 * - No role emails (info@, support@, etc.)
 * - No .gov or .edu
 * - One email per address + no duplicate emails
 * - Only Boise, ID rows
 *
 * Note: This does NOT perform third-party email verification (ZeroBounce/NeverBounce).
 * Run verification externally and re-run this script after removing invalid emails.
 */
import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

const LOCKED_CITY = "Boise";
const LOCKED_STATE = "ID";

type InputRow = Record<string, any>;

type CleanRow = {
  name: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip?: string;
};

function normalizeHeader(h: string) {
  return String(h ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function toStr(v: any) {
  return String(v ?? "").trim();
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isValidEmailFormat(email: string) {
  // intentionally conservative; rejects many weird edge cases
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isRoleEmail(email: string) {
  const local = email.split("@")[0] || "";
  return /^(info|support|sales|admin|administrator|hello|contact|team|careers|jobs|hr|billing|accounts|accounting|marketing|office|press|media|legal|privacy|security|noreply|no-reply|donotreply|do-not-reply)(\+|$)/i.test(
    local
  );
}

function isGovOrEdu(email: string) {
  const domain = (email.split("@")[1] || "").toLowerCase();
  return domain.endsWith(".gov") || domain.endsWith(".edu");
}

function normalizeCity(v: string) {
  return v.trim().replace(/\s+/g, " ");
}

function normalizeState(v: string) {
  return v.trim().toUpperCase();
}

function normalizeAddressKey(address: string, city: string, state: string, zip?: string) {
  return `${address}`.trim().toLowerCase().replace(/\s+/g, " ") +
    "|" +
    `${city}`.trim().toLowerCase() +
    "|" +
    `${state}`.trim().toUpperCase() +
    "|" +
    `${zip ?? ""}`.trim();
}

function looksLikeApartmentOrCondo(address: string) {
  const a = address.toLowerCase();
  // best-effort: reject obvious multi-unit markers
  return (
    /\b(apt|apartment|unit|ste|suite|condo|condominium)\b/.test(a) ||
    /\b(bldg|building)\b/.test(a) ||
    /\b(floor|fl)\b/.test(a) ||
    /[#]\s*\w+/.test(a)
  );
}

function looksLikeNonResidential(address: string) {
  const a = address.toLowerCase();
  return (
    /\bp\.?\s*o\.?\s*box\b/.test(a) ||
    /\bbox\b/.test(a) && /\bpo\b/.test(a) ||
    /\b(warehouse|industrial|plaza|mall|suite)\b/.test(a)
  );
}

function csvEscape(value: string) {
  const v = value ?? "";
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function writeCsv(rows: CleanRow[]) {
  const header = ["name", "email", "address", "city", "state", "zip"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.name),
        csvEscape(r.email),
        csvEscape(r.address),
        csvEscape(r.city),
        csvEscape(r.state),
        csvEscape(r.zip ?? ""),
      ].join(",")
    );
  }
  return lines.join("\n") + "\n";
}

function usageAndExit(code = 1) {
  // eslint-disable-next-line no-console
  console.error(
    [
      "Usage:",
      "  tsx scripts/step6-clean-roofing-homeowners-boise.ts <input.csv> <output.csv>",
      "",
      "Example:",
      "  tsx scripts/step6-clean-roofing-homeowners-boise.ts ./in.csv ./out.cleaned.csv",
    ].join("\n")
  );
  process.exit(code);
}

async function main() {
  const input = process.argv[2];
  const output = process.argv[3];
  if (!input || !output) usageAndExit(1);

  const inputPath = path.resolve(process.cwd(), input);
  const outputPath = path.resolve(process.cwd(), output);

  const raw = fs.readFileSync(inputPath, "utf8");
  const records = parse(raw, { columns: true, skip_empty_lines: true, trim: true }) as InputRow[];

  if (!records.length) {
    // eslint-disable-next-line no-console
    console.error("Input CSV has no rows.");
    process.exit(2);
  }

  // Map headers -> canonical keys (case-insensitive)
  const originalHeaders = Object.keys(records[0] ?? {});
  const headerMap = new Map<string, string>(); // canonical -> original
  for (const h of originalHeaders) {
    const norm = normalizeHeader(h);
    if (!headerMap.has(norm)) headerMap.set(norm, h);
  }

  const required = ["name", "email", "address", "city", "state"] as const;
  for (const req of required) {
    if (!headerMap.has(req)) {
      // eslint-disable-next-line no-console
      console.error(`Missing required column: ${req}`);
      // eslint-disable-next-line no-console
      console.error(`Found headers: ${originalHeaders.join(", ")}`);
      process.exit(3);
    }
  }

  const zipHeader = headerMap.get("zip") ?? headerMap.get("postal") ?? headerMap.get("postal_code") ?? headerMap.get("zipcode");

  const seenEmail = new Set<string>();
  const seenAddress = new Set<string>();

  const removed: Record<string, number> = {
    missing_required: 0,
    invalid_email_format: 0,
    role_email: 0,
    gov_or_edu: 0,
    wrong_city_state: 0,
    apartment_or_condo: 0,
    non_residential: 0,
    duplicate_email: 0,
    duplicate_address: 0,
  };

  const cleaned: CleanRow[] = [];

  for (const row of records) {
    const name = toStr(row[headerMap.get("name")!]);
    const emailRaw = toStr(row[headerMap.get("email")!]);
    const address = toStr(row[headerMap.get("address")!]);
    const city = normalizeCity(toStr(row[headerMap.get("city")!]));
    const state = normalizeState(toStr(row[headerMap.get("state")!]));
    const zip = zipHeader ? toStr(row[zipHeader]) : "";

    if (!name || !emailRaw || !address || !city || !state) {
      removed.missing_required++;
      continue;
    }

    const email = normalizeEmail(emailRaw);
    if (!isValidEmailFormat(email)) {
      removed.invalid_email_format++;
      continue;
    }
    if (isRoleEmail(email)) {
      removed.role_email++;
      continue;
    }
    if (isGovOrEdu(email)) {
      removed.gov_or_edu++;
      continue;
    }

    // Lock scope to Boise, ID
    if (city.toLowerCase() !== LOCKED_CITY.toLowerCase() || state !== LOCKED_STATE) {
      removed.wrong_city_state++;
      continue;
    }

    if (looksLikeApartmentOrCondo(address)) {
      removed.apartment_or_condo++;
      continue;
    }
    if (looksLikeNonResidential(address)) {
      removed.non_residential++;
      continue;
    }

    if (seenEmail.has(email)) {
      removed.duplicate_email++;
      continue;
    }

    const addrKey = normalizeAddressKey(address, city, state, zip);
    if (seenAddress.has(addrKey)) {
      removed.duplicate_address++;
      continue;
    }

    seenEmail.add(email);
    seenAddress.add(addrKey);

    cleaned.push({
      name,
      email,
      address,
      city: LOCKED_CITY,
      state: LOCKED_STATE,
      zip: zip || undefined,
    });
  }

  fs.writeFileSync(outputPath, writeCsv(cleaned), "utf8");

  // eslint-disable-next-line no-console
  console.log(
    [
      "Step 6 cleaner (Boise, ID) — Summary",
      `Input rows: ${records.length}`,
      `Output rows: ${cleaned.length}`,
      "",
      "Removed:",
      ...Object.entries(removed).map(([k, v]) => `- ${k}: ${v}`),
      "",
      `Wrote: ${outputPath}`,
    ].join("\n")
  );

  // Hard stop guidance: if outside target range, fail CI-style
  if (cleaned.length < 100 || cleaned.length > 150) {
    // eslint-disable-next-line no-console
    console.warn(
      `WARNING: Output lead count (${cleaned.length}) is outside the Step 6 target (100–150).`
    );
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});









