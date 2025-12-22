// app/api/settings/notifications/route.ts
// Block 8640 — Notification Settings API (Hot Lead Alerts + Daily Digest)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      {
        notify_hot_leads: true,
        notify_daily_digest: true,
        digest_hour_local: 18,
      },
      { status: 200 }
    );
  }

  const { data } = await supabase
    .from("notification_settings")
    .select("*")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!data) {
    return NextResponse.json(
      {
        notify_hot_leads: true,
        notify_daily_digest: true,
        digest_hour_local: 18,
      },
      { status: 200 }
    );
  }

  return NextResponse.json(
    {
      notify_hot_leads: data.notify_hot_leads,
      notify_daily_digest: data.notify_daily_digest,
      digest_hour_local: data.digest_hour_local,
    },
    { status: 200 }
  );
}

export async function PUT(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  let body: {
    notify_hot_leads?: boolean;
    notify_daily_digest?: boolean;
    digest_hour_local?: number;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400 }
    );
  }

  const notify_hot_leads =
    typeof body.notify_hot_leads === "boolean"
      ? body.notify_hot_leads
      : true;
  const notify_daily_digest =
    typeof body.notify_daily_digest === "boolean"
      ? body.notify_daily_digest
      : true;
  const digest_hour_local =
    typeof body.digest_hour_local === "number"
      ? Math.min(Math.max(body.digest_hour_local, 0), 23)
      : 18;

  const payload = {
    owner_id: user.id,
    notify_hot_leads,
    notify_daily_digest,
    digest_hour_local,
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await supabase
    .from("notification_settings")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (existing?.id) {
    await supabase
      .from("notification_settings")
      .update(payload)
      .eq("id", existing.id);
  } else {
    await supabase.from("notification_settings").insert(payload);
  }

  return NextResponse.json(
    { notify_hot_leads, notify_daily_digest, digest_hour_local },
    { status: 200 }
  );
}



