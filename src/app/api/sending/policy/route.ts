import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

const CAPS = { free: 50, pro: 500 } as const;

function getUserId(req: Request) {
  const url = new URL(req.url);
  return url.searchParams.get("userId");
}

function isQuietNow(tz: string, start: number, end: number) {
  const now = new Date();
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "2-digit",
      hour12: false,
    }).format(now)
  );
  const inRange = start <= end ? hour >= start && hour < end : hour >= start || hour < end;
  const resume = new Date(now);
  if (inRange) {
    const daysAdd = end <= hour ? 1 : 0;
    resume.setUTCDate(resume.getUTCDate() + daysAdd);
    resume.setUTCHours(end, 0, 0, 0);
  }
  return { active: inRange, resumeAtISO: resume.toISOString() };
}

export async function GET(req: Request) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = createAdminClient();
  const { data: prof, error } = await sb
    .from("profiles")
    .select("subscription_status, tz, quiet_start, quiet_end")
    .eq("id", userId)
    .single();
  if (error || !prof) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const plan = (prof as any).subscription_status === "pro" ? "pro" : "free";
  const limit = CAPS[plan as keyof typeof CAPS];

  const today = new Date().toISOString().slice(0, 10);
  const { data: cnt } = await sb
    .from("daily_send_counters")
    .select("count")
    .eq("user_id", userId)
    .eq("day", today)
    .maybeSingle();

  const usedToday = (cnt as any)?.count ?? 0;
  const quiet = isQuietNow((prof as any).tz || "America/Los_Angeles", (prof as any).quiet_start ?? 21, (prof as any).quiet_end ?? 6);

  return NextResponse.json({
    plan,
    limit,
    usedToday,
    remaining: Math.max(0, limit - usedToday),
    atCap: usedToday >= limit,
    quiet,
  });
}

