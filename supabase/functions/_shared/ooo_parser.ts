// deno-lint-ignore-file no-explicit-any

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

const DOW = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export function nextDow(dow: number, from = new Date()): Date {
  const d = new Date(from);
  const diff = (dow + 7 - d.getDay()) % 7 || 7;
  d.setDate(d.getDate() + diff);
  d.setHours(9, 0, 0, 0);
  return d;
}

export function parseReturnDate(text: string): Date | null {
  const s = text.toLowerCase();

  const reDmy =
    /(?:\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s*(\d{4})?)/i;
  const reMdy =
    /(?:\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:,\s*(\d{4}))?)/i;
  const reSlash = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/;
  const reIso = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/;

  const now = new Date();
  const yearDefault = now.getFullYear();

  let m: RegExpMatchArray | null;

  if ((m = s.match(reDmy))) {
    const day = parseInt(m[1], 10);
    const mon = MONTHS.findIndex((n) => n.startsWith(m![2].toLowerCase().slice(0, 3)));
    const year = m[3]
      ? parseInt(m[3], 10)
      : (new Date().getMonth() > mon ? yearDefault + 1 : yearDefault);
    return new Date(Date.UTC(year, mon, day, 17, 0, 0));
  }

  if ((m = s.match(reMdy))) {
    const mon = MONTHS.findIndex((n) => n.startsWith(m![1].toLowerCase().slice(0, 3)));
    const day = parseInt(m[2], 10);
    const year = m[3]
      ? parseInt(m[3], 10)
      : (new Date().getMonth() > mon ? yearDefault + 1 : yearDefault);
    return new Date(Date.UTC(year, mon, day, 17, 0, 0));
  }

  if ((m = s.match(reSlash))) {
    const month = parseInt(m[1], 10) - 1;
    const day = parseInt(m[2], 10);
    let year = m[3] ? parseInt(m[3], 10) : yearDefault;
    if (year < 100) year += 2000;
    return new Date(Date.UTC(year, month, day, 17, 0, 0));
  }

  if ((m = s.match(reIso))) {
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    const day = parseInt(m[3], 10);
    return new Date(Date.UTC(year, month, day, 17, 0, 0));
  }

  const weekdayHits = [
    ["monday", "lunes", "lundi", "montag", "maandag", "segunda"],
    ["tuesday", "martes", "mardi", "dienstag", "dinsdag", "terca", "terça"],
    ["wednesday", "miercoles", "miércoles", "mercredi", "mittwoch", "woensdag", "quarta"],
    ["thursday", "jueves", "jeudi", "donnerstag", "donderdag", "quinta"],
    ["friday", "viernes", "vendredi", "freitag", "vrijdag", "sexta"],
    ["saturday", "sabado", "sábado", "samedi", "samstag", "zaterdag", "sabado"],
    ["sunday", "domingo", "dimanche", "sonntag", "zondag", "domingo"],
  ];

  const blob = s.replace(/[^\p{L}\p{N}\s:\/-]/gu, " ");

  for (let i = 0; i < weekdayHits.length; i++) {
    for (const w of weekdayHits[i]) {
      if (
        blob.includes(`next ${w}`) ||
        blob.includes(`back ${w}`) ||
        blob.includes(`return ${w}`) ||
        blob.includes(`regreso ${w}`) ||
        blob.includes(`retorno ${w}`)
      ) {
        return nextDow(i);
      }
    }
  }

  const rel = s.match(
    /\b(in|for|hasta|ate|até)\s+(\d{1,2})\s+(day|days|dia|dias|week|weeks|semana|semanas)\b/,
  );
  if (rel) {
    const [, , amtStr, unit] = rel;
    const amt = parseInt(amtStr, 10);
    const d = new Date();
    d.setHours(9, 0, 0, 0);
    if (unit.startsWith("day") || unit.startsWith("dia")) {
      d.setDate(d.getDate() + amt);
    } else {
      d.setDate(d.getDate() + amt * 7);
    }
    return d;
  }

  return null;
}

export { DOW, MONTHS };





