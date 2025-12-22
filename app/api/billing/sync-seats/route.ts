import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const schema = z.object({
  accountId: z.string().uuid().optional(),
});

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  let accountId: string | null = null;

  if (contentType.includes("application/json")) {
    const payload = schema.parse(await req.json().catch(() => ({})));
    accountId = payload.accountId ?? null;
  }

  if (!accountId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("account_id")
      .eq("id", user.id)
      .maybeSingle();

    accountId = profile?.account_id ?? null;
  }

  if (!accountId) {
    return NextResponse.json({ ok: false, error: "Account not found" }, { status: 400 });
  }

  const admin = createServiceClient();
  const { data: member } = await admin
    .from("team_members")
    .select("role")
    .eq("account_id", accountId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member || !["owner", "admin"].includes(member.role)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const seatSyncUrl = process.env.SEAT_SYNC_URL;
  const seatSyncSecret = process.env.SEAT_SYNC_SECRET;

  if (!seatSyncUrl || !seatSyncSecret) {
    return NextResponse.json({ ok: false, error: "Seat sync not configured" }, { status: 500 });
  }

  const res = await fetch(seatSyncUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: seatSyncSecret,
    },
    body: JSON.stringify({ account_id: accountId }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return NextResponse.json({ ok: false, error: "Sync failed", detail }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}




