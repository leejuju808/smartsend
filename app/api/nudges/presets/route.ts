import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

const VALID_SCOPES = new Set<"account" | "campaign">(["account", "campaign"]);
const VALID_CHANNELS = new Set<"email" | "reply">(["email", "reply"]);

type Body = {
  account_id?: string;
  scope?: "account" | "campaign";
  campaign_id?: string | null;
  key?: string;
  label?: string;
  channel?: "email" | "reply";
  status?: "active" | "archived";
};

function invalidUuid(value: unknown): boolean {
  return typeof value !== "string" || !value.match(/^[0-9a-fA-F-]{36}$/);
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as Body | null;

  const accountId = payload?.account_id;
  const scope = payload?.scope ?? "account";
  const campaignId = payload?.campaign_id ?? null;
  const key = payload?.key;
  const label = payload?.label ?? key ?? "General";
  const channel = payload?.channel ?? "email";
  const status = payload?.status ?? "active";

  if (!accountId || invalidUuid(accountId)) {
    return NextResponse.json({ ok: false, error: "invalid_account_id" }, { status: 400 });
  }

  if (!VALID_SCOPES.has(scope)) {
    return NextResponse.json({ ok: false, error: "invalid_scope" }, { status: 400 });
  }

  if (!key || typeof key !== "string" || !key.trim()) {
    return NextResponse.json({ ok: false, error: "invalid_key" }, { status: 400 });
  }

  if (scope === "campaign" && invalidUuid(campaignId)) {
    return NextResponse.json({ ok: false, error: "campaign_id_required" }, { status: 400 });
  }

  if (!VALID_CHANNELS.has(channel)) {
    return NextResponse.json({ ok: false, error: "invalid_channel" }, { status: 400 });
  }

  if (status !== "active" && status !== "archived") {
    return NextResponse.json({ ok: false, error: "invalid_status" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const query = supabase
    .from("nudge_presets")
    .select("id")
    .eq("account_id", accountId)
    .eq("scope", scope)
    .eq("key", key)
    .limit(1);

  if (campaignId) {
    query.eq("campaign_id", campaignId);
  } else {
    query.is("campaign_id", null);
  }

  const { data: existing, error: lookupError } = await query.single().catch((err: any) => {
    if (err?.code === "PGRST116") {
      return { data: null, error: null };
    }
    return { data: null, error: err };
  });

  if (lookupError) {
    return NextResponse.json({ ok: false, error: lookupError.message ?? "lookup_failed" }, { status: 500 });
  }

  if (existing?.id) {
    const { data, error } = await supabase
      .from("nudge_presets")
      .update({
        label,
        channel,
        status,
        campaign_id: campaignId,
        updated_at: now,
      })
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, preset: data });
  }

  const { data, error } = await supabase
    .from("nudge_presets")
    .insert({
      account_id: accountId,
      scope,
      campaign_id: campaignId,
      key,
      label,
      channel,
      status,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, preset: data });
}

