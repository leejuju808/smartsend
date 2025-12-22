// app/api/smartsend/campaigns/upsert/route.ts
// Block 8170 — ensure provider + provider_account_id are stored

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { ok: false, error: "Not authenticated" },
      { status: 401 }
    );
  }

  const body = await req.json().catch(() => null);

  const id = body?.id ?? null;
  const name = (body?.name ?? "").trim();
  const subject = body?.subject ?? null;
  const body_html = body?.body_html ?? null;
  const provider = body?.provider ?? null;
  const provider_account_id = body?.provider_account_id ?? null;

  if (!name) {
    return NextResponse.json(
      { ok: false, error: "Campaign name is required" },
      { status: 400 }
    );
  }

  if (!provider_account_id || !provider) {
    return NextResponse.json(
      { ok: false, error: "Sender account is required" },
      { status: 400 }
    );
  }

  // TODO: fetch org_id from your context if needed
  const orgId = null;

  const payload: any = {
    org_id: orgId,
    owner_id: user.id,
    name,
    subject,
    body_html,
    provider,
    provider_account_id,
  };

  let query = supabase.from("campaigns");

  if (id) {
    query = query.update(payload).eq("id", id).select("*").maybeSingle();
  } else {
    query = query.insert(payload).select("*").maybeSingle();
  }

  const { data, error } = await query;

  if (error) {
    console.error("Campaign upsert error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to save campaign" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, campaign: data });
}

































































