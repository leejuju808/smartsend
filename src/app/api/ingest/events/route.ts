import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

type NormalizedEvent = {
  email_id?: string | null;
  campaign_id?: string | null;
  recipient?: string | null;
  subject?: string | null;
  event_type: "sent"|"opened"|"clicked"|"bounced";
  created_at: string;
  clicked_url?: string | null;
  clicked_domain?: string | null;
  clicked_path?: string | null;
};

export async function POST(req: NextRequest) {
  // Optional HMAC verification
  const secret = process.env.INGEST_HMAC_SECRET;
  const raw = await req.text();
  if (secret) {
    const sig = req.headers.get("x-signature") || "";
    const h = crypto.createHmac("sha256", secret).update(raw).digest("hex");
    if (!timingSafeEqual(h, sig)) return NextResponse.json({ ok:false, error: "INVALID_SIGNATURE" }, { status: 401 });
  }

  const body = safeJson(raw);
  if (!body) return NextResponse.json({ ok:false, error: "INVALID_JSON" }, { status: 400 });

  const events = normalizeProviderPayload(body);
  if (events.length === 0) return NextResponse.json({ ok:true, inserted: 0 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return NextResponse.json({ ok:true, inserted: 0, note: "dev/mock" });

  const sb = createClient(supabaseUrl, supabaseKey);
  const { data, error } = await sb.from("email_events").insert(
    events.map(e => ({
      email_id: e.email_id ?? null,
      campaign_id: e.campaign_id ?? null,
      recipient: e.recipient ?? null,
      subject: e.subject ?? null,
      event_type: e.event_type,
      created_at: e.created_at,
      clicked_url: e.clicked_url ?? null,
      clicked_domain: e.clicked_domain ?? null,
      clicked_path: e.clicked_path ?? null,
    }))
  ).select("id");

  if (error) return NextResponse.json({ ok:false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok:true, inserted: data?.length ?? 0 });
}

function timingSafeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function safeJson(str: string) {
  try { return JSON.parse(str); } catch { return null; }
}

function parseUrl(u?: string|null) {
  try {
    if (!u) return { url:null, domain:null, path:null } as const;
    const x = new URL(u);
    return { url: x.toString(), domain: x.hostname, path: x.pathname || "/" } as const;
  } catch { return { url:null, domain:null, path:null } as const; }
}

function normalizeProviderPayload(payload: any): NormalizedEvent[] {
  // Detect provider by shape and map to NormalizedEvent[]
  if (Array.isArray(payload) && payload[0]?.sg_event_id) {
    // Likely SendGrid style webhook array
    return payload.map((e:any)=> {
      const urlFields = parseUrl(e?.url || e?.["url"] || e?.["sg_url"]);
      return {
        email_id: e.smtp-id ?? null,
        campaign_id: e.marketing_campaign_id ?? null,
        recipient: e.email ?? null,
        subject: e.subject ?? null,
        event_type: mapEvent(e.event),
        created_at: toISO(e.timestamp),
        clicked_url: urlFields.url,
        clicked_domain: urlFields.domain,
        clicked_path: urlFields.path,
      };
    }).filter(Boolean) as NormalizedEvent[];
  }
  if (payload?.RecordType && payload?.Recipient) {
    // Postmark single event
    const urlFields = parseUrl(payload?.OriginalLink || payload?.Link || payload?.Metadata?.link);
    return [{
      email_id: payload?.MessageID ?? null,
      campaign_id: payload?.Metadata?.campaign_id ?? null,
      recipient: payload?.Recipient ?? null,
      subject: payload?.Metadata?.subject ?? null,
      event_type: mapEvent(payload?.RecordType),
      created_at: new Date(payload?.ReceivedAt ?? Date.now()).toISOString(),
      clicked_url: urlFields.url,
      clicked_domain: urlFields.domain,
      clicked_path: urlFields.path,
    }];
  }
  if (Array.isArray(payload?.items) && payload?.signature) {
    // Mailgun-like (simplified)
    return payload.items.map((e:any)=> {
      const urlFields = parseUrl(e?.url || e?.message?.headers?.["List-Unsubscribe"]);
      return {
        email_id: e.message?.headers?.["message-id"] ?? null,
        campaign_id: e.tags?.[0] ?? null,
        recipient: e.recipient ?? null,
        subject: e.message?.headers?.subject ?? null,
        event_type: mapEvent(e.event),
        created_at: toISO(e.timestamp),
        clicked_url: urlFields.url,
        clicked_domain: urlFields.domain,
        clicked_path: urlFields.path,
      };
    });
  }
  // Fallback: attempt generic mapping
  const e = payload?.event || payload?.type;
  const r = payload?.recipient || payload?.email;
  if (e && r) {
    return [{ event_type: mapEvent(e), recipient: r, subject: payload?.subject ?? null, created_at: new Date().toISOString() } as NormalizedEvent];
  }
  return [];
}

function mapEvent(ev: string): NormalizedEvent["event_type"] {
  const s = (ev || "").toLowerCase();
  if (s.includes("click")) return "clicked";
  if (s.includes("open")) return "opened";
  if (s.includes("bounce")) return "bounced";
  return "sent";
}

function toISO(ts: any) {
  if (!ts) return new Date().toISOString();
  if (typeof ts === "number") return new Date(ts*1000).toISOString();
  return new Date(ts).toISOString();
}