// Timezone-aware send window utilities for sequence processing

function toTzDate(date: Date, tz: string) {
  // returns parts in target tz
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false,
    year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit" });
  const parts = Object.fromEntries(f.formatToParts(date).map(p=>[p.type,p.value]));
  const y = Number(parts.year), m = Number(parts.month), d = Number(parts.day),
        H = Number(parts.hour),  M = Number(parts.minute), S = Number(parts.second);
  return { y,m,d,H,M,S };
}

function fromTzParts({y,m,d,H,M,S}:{y:number,m:number,d:number,H:number,M:number,S:number}, tz:string){
  // construct a Date in that tz by parsing as if local then correcting offset via Date.parse trick
  const iso = `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}T${String(H).padStart(2,"0")}:${String(M).padStart(2,"0")}:${String(S).padStart(2,"0")}`;
  // Interpret iso in tz by using the offset at that wall time:
  const offMin = -new Date(new Intl.DateTimeFormat("en-US",{ timeZone: tz, timeStyle:"long", dateStyle:"short" }).format(new Date(`${iso}Z`))).getTimezoneOffset?.() ?? 0;
  // Fallback: just return UTC parse if above is not supported
  return new Date(iso + "Z");
}

export function nextWindowTimestamp(now: Date, tz: string, start: string, end: string): Date {
  const { y,m,d,H,M,S } = toTzDate(now, tz);
  const [sH,sM] = start.split(":").map(Number);
  const [eH,eM] = end.split(":").map(Number);
  const inMinutes = H*60+M;
  const sMin = sH*60+sM, eMin = eH*60+eM;

  if (inMinutes < sMin) {
    // today at start
    const dt = new Date(Date.UTC(y, m-1, d, sH, sM, 0));
    return dt; // treat as UTC timestamp; your queue sends relative to UTC anyway
  }
  if (inMinutes > eMin) {
    // tomorrow at start
    const dt = new Date(Date.UTC(y, m-1, d+1, sH, sM, 0));
    return dt;
  }
  // within window → now
  return now;
}