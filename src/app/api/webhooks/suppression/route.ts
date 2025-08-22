import { NextResponse } from "next/server";
import { addSuppression } from "@/server/suppression";

type Generic = { type: "bounce" | "complaint"; email: string; provider?: string; raw?: any };

function parseProvider(body: any): Generic[] {
  const out: Generic[] = [];
  if (Array.isArray(body) && body[0]?.email && body[0]?.event) {
    for (const ev of body) {
      if (ev.event === "bounce") out.push({ type: "bounce", email: ev.email, provider: "sendgrid", raw: ev });
      if (ev.event === "spamreport") out.push({ type: "complaint", email: ev.email, provider: "sendgrid", raw: ev });
    }
    return out;
  }
  if (body?.["event-data"]) {
    const ev = body["event-data"];
    if (ev.event === "bounced") out.push({ type: "bounce", email: ev.recipient, provider: "mailgun", raw: ev });
    if (ev.event === "complained") out.push({ type: "complaint", email: ev.recipient, provider: "mailgun", raw: ev });
    return out;
  }
  if (body?.RecordType && body?.Email) {
    if (body.RecordType === "Bounce") out.push({ type: "bounce", email: body.Email, provider: "postmark", raw: body });
    if (body.RecordType === "SpamComplaint") out.push({ type: "complaint", email: body.Email, provider: "postmark", raw: body });
    return out;
  }
  if (body?.notificationType) {
    const emails: string[] = body?.mail?.destination || [];
    if (body.notificationType === "Bounce") for (const e of emails) out.push({ type: "bounce", email: e, provider: "ses", raw: body });
    if (body.notificationType === "Complaint") for (const e of emails) out.push({ type: "complaint", email: e, provider: "ses", raw: body });
    return out;
  }
  if (body?.type && body?.email) out.push({ type: body.type, email: body.email, raw: body });
  return out;
}

function getUserId(req: Request) {
  return new URL(req.url).searchParams.get("userId");
}

export async function POST(req: Request) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const events = parseProvider(body);
  for (const ev of events) {
    await addSuppression({
      owner: userId,
      email: ev.email,
      reason: ev.type === "complaint" ? "complaint" : "bounce",
      source: "webhook",
      details: ev.raw,
    });
  }
  return NextResponse.json({ ok: true, count: events.length });
}

