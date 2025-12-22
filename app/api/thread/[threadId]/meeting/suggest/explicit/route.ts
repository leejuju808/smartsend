import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest, { params }: { params: { threadId: string } }) {
  void params.threadId;
  const { lead_tz, options, duration = 30, location = "Google Meet", booking = false } =
    await req.json().catch(() => ({}));

  if (!Array.isArray(options) || options.length === 0) {
    return NextResponse.json({ error: "missing options" }, { status: 400 });
  }

  const leadTz = typeof lead_tz === "string" && lead_tz.length ? lead_tz : "America/New_York";

  const formatter = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      timeZone: leadTz,
      dateStyle: "medium",
      timeStyle: "short",
    });

  const lines = options.map((option: any, index: number) => {
    const startIso = option?.start_utc;
    const endIso = option?.end_utc;
    if (typeof startIso !== "string" || typeof endIso !== "string") {
      return null;
    }

    const base = `${index + 1}) ${formatter(startIso)} → ${formatter(endIso)}`;
    if (booking && typeof option?.url === "string" && option.url.length > 0) {
      return `${base} — Book: ${option.url}`;
    }
    return base;
  });

  const filteredLines = lines.filter((line): line is string => typeof line === "string");

  if (!filteredLines.length) {
    return NextResponse.json({ error: "invalid options" }, { status: 400 });
  }

  const text = [
    `Here are a few options (${duration} min, ${location} — showing in your local time):`,
    ...filteredLines,
    "",
    "If none of these work, share a window and I'll lock it in.",
  ].join("\n");

  return NextResponse.json({ ok: true, text });
}


