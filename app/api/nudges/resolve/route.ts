import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { pickVariant, Variant } from "@/lib/nudge/pickVariant";

type Body = {
  account_id?: string;
  campaign_id?: string | null;
  requested_key?: string;
  fallback_key?: string | null;
  seed?: string | null;
};

function invalidUuid(value: unknown): boolean {
  return typeof value !== "string" || !value.match(/^[0-9a-fA-F-]{36}$/);
}

type ViewRow = {
  account_id: string;
  scope: "account" | "campaign";
  campaign_id: string | null;
  preset_key: string;
  variants: Variant[] | null;
};

async function findPreset(
  client: ReturnType<typeof createAdminClient>,
  accountId: string,
  key: string,
  campaignId: string | null,
): Promise<ViewRow | null> {
  if (campaignId && !invalidUuid(campaignId)) {
    const { data, error } = await client
      .from("v_resolved_preset")
      .select("*")
      .eq("account_id", accountId)
      .eq("preset_key", key)
      .eq("scope", "campaign")
      .eq("campaign_id", campaignId)
      .maybeSingle<ViewRow>();

    if (error) {
      throw error;
    }
    if (data) {
      return data;
    }
  }

  const { data, error } = await client
    .from("v_resolved_preset")
    .select("*")
    .eq("account_id", accountId)
    .eq("preset_key", key)
    .eq("scope", "account")
    .maybeSingle<ViewRow>();

  if (error) {
    throw error;
  }

  return data ?? null;
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as Body | null;

  const accountId = payload?.account_id;
  const campaignId = payload?.campaign_id ?? null;
  const requestedKey = payload?.requested_key;
  const fallbackKey = payload?.fallback_key ?? null;
  const seed = payload?.seed ?? null;

  if (!accountId || invalidUuid(accountId)) {
    return NextResponse.json({ ok: false, error: "invalid_account_id" }, { status: 400 });
  }

  if (!requestedKey || typeof requestedKey !== "string") {
    return NextResponse.json({ ok: false, error: "invalid_requested_key" }, { status: 400 });
  }

  if (campaignId && invalidUuid(campaignId)) {
    return NextResponse.json({ ok: false, error: "invalid_campaign_id" }, { status: 400 });
  }

  const client = createAdminClient();

  let chosen: ViewRow | null = null;

  try {
    chosen = await findPreset(client, accountId, requestedKey, campaignId);
    if (!chosen && fallbackKey) {
      chosen = await findPreset(client, accountId, fallbackKey, campaignId);
    }
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? "resolve_failed" },
      { status: 500 },
    );
  }

  if (!chosen || !Array.isArray(chosen.variants) || chosen.variants.length === 0) {
    return NextResponse.json({ ok: false, error: "preset_not_found" }, { status: 404 });
  }

  const variant = pickVariant(chosen.variants as Variant[], seed ?? undefined);
  if (!variant) {
    return NextResponse.json({ ok: false, error: "variant_not_found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    preset_key: chosen.preset_key,
    variant,
  });
}

