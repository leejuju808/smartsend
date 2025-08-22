// Minimal IANA validator + cheap TLD->TZ guesses
const IANA = new Set([
  // Common ones; add more as needed
  "America/Los_Angeles","America/Denver","America/Chicago","America/New_York",
  "Europe/London","Europe/Dublin","Europe/Paris","Europe/Berlin","Europe/Madrid","Europe/Rome","Europe/Amsterdam",
  "Europe/Warsaw","Europe/Stockholm","Europe/Copenhagen","Europe/Oslo","Europe/Helsinki",
  "Europe/Athens","Europe/Istanbul",
  "Asia/Jerusalem","Asia/Dubai","Asia/Kolkata","Asia/Singapore","Asia/Hong_Kong","Asia/Tokyo","Asia/Seoul",
  "Australia/Sydney","Australia/Melbourne","Pacific/Auckland",
  "America/Toronto","America/Vancouver","America/Mexico_City",
  "America/Sao_Paulo","America/Bogota","America/Santiago","America/Buenos_Aires",
  "Africa/Johannesburg","Africa/Cairo","Africa/Lagos"
]);

const CC_TZ: Record<string,string> = {
  uk:"Europe/London", ie:"Europe/Dublin", fr:"Europe/Paris", de:"Europe/Berlin", es:"Europe/Madrid",
  it:"Europe/Rome", nl:"Europe/Amsterdam", se:"Europe/Stockholm", no:"Europe/Oslo", dk:"Europe/Copenhagen",
  fi:"Europe/Helsinki", pl:"Europe/Warsaw", tr:"Europe/Istanbul", gr:"Europe/Athens",
  il:"Asia/Jerusalem", ae:"Asia/Dubai", sa:"Asia/Riyadh",
  in:"Asia/Kolkata", sg:"Asia/Singapore", hk:"Asia/Hong_Kong", jp:"Asia/Tokyo", kr:"Asia/Seoul",
  au:"Australia/Sydney", nz:"Pacific/Auckland",
  ca:"America/Toronto", mx:"America/Mexico_City", br:"America/Sao_Paulo", ar:"America/Buenos_Aires",
  cl:"America/Santiago", co:"America/Bogota", za:"Africa/Johannesburg", eg:"Africa/Cairo", ng:"Africa/Lagos"
  // default: US -> handled by fallback
};

export function isIana(tz?: string | null) {
  return !!tz && IANA.has(tz);
}

export function guessTzFromEmail(email: string): string | null {
  const dom = (email.split("@")[1] || "").toLowerCase();
  const tld = (dom.split(".").pop() || "").toLowerCase(); // e.g., "uk"
  if (CC_TZ[tld]) return CC_TZ[tld];
  // Large US/global providers → no signal: null
  return null;
}

