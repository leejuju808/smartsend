// File: app/api/send/check/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sbAdmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

type CheckBody = {
  user_id: string;
  recipients: string[]; // emails you intend to send to (pre-filtered by sequence logic)
  // optional: dry_run shows what would be blocked
  dry_run?: boolean;
};

function uniqLower(a: string[]) {
  return Array.from(new Set(a.map((e) => e.trim().toLowerCase()).filter(Boolean)));
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CheckBody;
    if (!body?.user_id) return NextResponse.json({ error: "user_id required" }, { status: 400 });
    const recipients = uniqLower(body.recipients || []);
    const sb = sbAdmin();

    // Load settings
    const { data: settings, error: sErr } = await sb
      .from("sender_settings")
      .select("*")
      .eq("user_id", body.user_id)
      .maybeSingle();
    if (sErr) throw sErr;

    const dailyCap = settings?.daily_cap ?? 50;
    const threshold = settings?.hard_bounce_threshold ?? 5.0;
    const blockOn = settings?.block_on_threshold ?? true;

    // Sent today
    const { data: today } = await sb
      .from("outbound_today")
      .select("sent_today")
      .eq("user_id", body.user_id)
      .maybeSingle();
    const sentToday = today?.sent_today ?? 0;

    // Health (7d)
    const { data: health } = await sb
      .from("sender_health_7d")
      .select("bounce_rate_7d")
      .eq("user_id", body.user_id)
      .maybeSingle();
    const bounceRate = health?.bounce_rate_7d ?? 0;

    // Blocked set from suppressions + bounces (hard)
    const { data: sups } = await sb
      .from("suppressions")
      .select("s_type, value")
      .eq("user_id", body.user_id);

    const blockedEmails = new Set<string>();
    const blockedDomains = new Set<string>();
    const patterns: string[] = [];
    (sups || []).forEach((s) => {
      if (s.s_type === "email") blockedEmails.add(String(s.value).toLowerCase());
      if (s.s_type === "domain") blockedDomains.add(String(s.value).toLowerCase());
      if (s.s_type === "pattern") patterns.push(String(s.value));
    });

    const { data: hardBounces } = await sb
      .from("bounces")
      .select("email, btype")
      .eq("user_id", body.user_id)
      .gte("created_at", new Date(Date.now() - 1000 * 60 * 60 * 24 * 90).toISOString()); // last 90d
    (hardBounces || [])
      .filter((b) => b.btype === "hard")
      .forEach((b) => blockedEmails.add(String(b.email).toLowerCase()));

    const isPatternBlocked = (email: string) => {
      const dom = email.split("@")[1] || "";
      return patterns.some((p) => {
        const rx = new RegExp(
          "^" +
            p
              .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
              .replace(/%/g, ".*")
              .replace(/_/g, ".") +
            "$",
          "i"
        );
        return rx.test(email) || rx.test(dom);
      });
    };

    const domainBlocked = (email: string) => {
      const dom = (email.split("@")[1] || "").toLowerCase();
      return blockedDomains.has(dom);
    };

    const rejected: Record<string, string> = {};
    const allowed: string[] = [];

    for (const e of recipients) {
      if (blockedEmails.has(e)) {
        rejected[e] = "blocked: prior hard bounce / suppressed email";
      } else if (domainBlocked(e)) {
        rejected[e] = "blocked: suppressed domain";
      } else if (isPatternBlocked(e)) {
        rejected[e] = "blocked: suppressed pattern";
      } else {
        allowed.push(e);
      }
    }

    // Cap enforcement
    const remaining = Math.max(0, dailyCap - sentToday);
    const willSend = Math.min(allowed.length, remaining);

    const warnings: string[] = [];
    if (bounceRate >= threshold) {
      warnings.push(`Bounce rate ${bounceRate}% ≥ threshold ${threshold}%.`);
      if (blockOn) {
        return NextResponse.json(
          {
            ok: false,
            reason: "bounce_threshold_exceeded",
            bounce_rate_7d: bounceRate,
            threshold,
            blocked_on_threshold: true,
            sent_today: sentToday,
            daily_cap: dailyCap,
            remaining,
            rejected,
            allowed: [],
            will_send: 0,
          },
          { status: 200 }
        );
      }
    }

    if (remaining <= 0) {
      warnings.push("Daily cap reached.");
    } else if (willSend < allowed.length) {
      warnings.push(`Capped to ${willSend}/${allowed.length} due to daily cap.`);
    }

    return NextResponse.json({
      ok: true,
      sent_today: sentToday,
      daily_cap: dailyCap,
      remaining,
      bounce_rate_7d: bounceRate,
      threshold,
      warnings,
      rejected,
      allowed: body.dry_run ? allowed : allowed.slice(0, willSend),
      will_send: willSend,
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || "server_error" }, { status: 500 });
  }
}
