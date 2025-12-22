import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

async function assertAuthenticated() {
  const client = createRouteHandlerClient({ cookies });
  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  if (error) {
    throw new Error(error.message);
  }

  if (!user) {
    const err = new Error("unauthorized");
    // @ts-expect-error augment error with status
    err.status = 401;
    throw err;
  }

  return { client, user };
}

async function ensureCampaignAccess(client: SupabaseClient<any, "public", any>, campaignId: string) {
  const { data: isMember, error } = await client.rpc("is_campaign_member", {
    p_campaign: campaignId,
    p_roles: ["owner", "editor", "viewer"],
  });

  if (error) {
    const err = new Error(error.message);
    // @ts-expect-error augment error with status
    err.status = 500;
    throw err;
  }

  if (!isMember) {
    const err = new Error("forbidden");
    // @ts-expect-error augment error with status
    err.status = 403;
    throw err;
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const campaignId = url.searchParams.get("campaignId");

    if (!campaignId) {
      return NextResponse.json({ error: "campaignId is required" }, { status: 400 });
    }

    const { client } = await assertAuthenticated();
    await ensureCampaignAccess(client, campaignId);

    const { data, error } = await client
      .from("saved_filters")
      .select("id,name,params")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { campaign_id: campaignId, name, params } = body ?? {};

    if (!campaignId || !name || params === undefined) {
      return NextResponse.json({ error: "campaign_id, name, and params are required" }, { status: 400 });
    }

    const { client, user } = await assertAuthenticated();
    await ensureCampaignAccess(client, campaignId);

    const payload = {
      id: body.id ?? undefined,
      campaign_id: campaignId,
      name,
      params,
      user_id: user.id,
    };

    const { data, error } = await client
      .from("saved_filters")
      .upsert(payload, { onConflict: "user_id,campaign_id,name" })
      .select("id,name,params")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { id } = body ?? {};

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const { client } = await assertAuthenticated();

    const { data: existing, error: fetchError } = await client
      .from("saved_filters")
      .select("id,campaign_id")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!existing) {
      return NextResponse.json({ ok: true });
    }

    await ensureCampaignAccess(client, existing.campaign_id);

    const { error } = await client.from("saved_filters").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}

