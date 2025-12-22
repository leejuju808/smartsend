import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/utils/supabase/server";
import {
  createServiceSupabase,
  resolveViewMembershipRole,
  type ServiceSupabaseClient,
} from "../../_shared";

type QueueRequestBody = {
  campaign_id?: string;
  limit?: number;
  dryRun?: boolean;
};

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: QueueRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!body.campaign_id) {
    return NextResponse.json({ ok: false, error: "campaign_id_required" }, { status: 400 });
  }

  const limit = body.limit != null ? Number(body.limit) : undefined;
  if (Number.isNaN(limit ?? 0) || (limit ?? 0) < 0) {
    return NextResponse.json({ ok: false, error: "invalid_limit" }, { status: 400 });
  }

  const service = createServiceSupabase();

  const { data: view, error: viewError } = await service
    .from("saved_views")
    .select("id, account_id, name, filter, owner_id")
    .eq("id", params.id)
    .maybeSingle();

  if (viewError || !view) {
    return NextResponse.json({ ok: false, error: "view_not_found" }, { status: 404 });
  }

  const role = await resolveViewMembershipRole(service, params.id, user.id, view.owner_id);
  if (!role) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  if (body.dryRun && role === "viewer") {
    // Viewers can preview the counts, but cannot queue real jobs.
  } else if (!["owner", "editor"].includes(role)) {
    return NextResponse.json({ ok: false, error: "insufficient_role" }, { status: 403 });
  }

  const { data: leadRows, error: leadError } = await service.rpc("rpc_view_lead_ids", {
    p_view_id: params.id,
  });

  if (leadError) {
    return NextResponse.json({ ok: false, error: "lead_resolve_failed" }, { status: 400 });
  }

  let leadIds = (leadRows ?? []).map((row: any) => row.lead_id).filter(Boolean);
  if (limit != null) {
    leadIds = leadIds.slice(0, limit);
  }

  if (body.dryRun) {
    const preview = await calculatePreview(service, body.campaign_id, leadIds);
    return NextResponse.json({ ok: true, preview });
  }

  const { data: job, error: jobError } = await service
    .from("saved_view_jobs")
    .insert({
      account_id: view.account_id,
      view_id: view.id,
      kind: "queue_campaign",
      status: "running",
      requested_by: user.id,
      params: {
        campaign_id: body.campaign_id,
        limit,
        total_resolved: leadIds.length,
      },
    })
    .select("id")
    .single();

  if (jobError) {
    return NextResponse.json({ ok: false, error: "job_log_failed" }, { status: 500 });
  }

  let inserted = 0;
  try {
    inserted = await upsertAudience(service, view.account_id, body.campaign_id, leadIds);

    if (job?.id) {
      await service
        .from("saved_view_jobs")
        .update({
          status: "done",
          result: {
            campaign_id: body.campaign_id,
            inserted,
            total_attempted: leadIds.length,
          },
        })
        .eq("id", job.id);
    }
  } catch (error: any) {
    if (job?.id) {
      await service
        .from("saved_view_jobs")
        .update({
          status: "failed",
          result: {
            campaign_id: body.campaign_id,
            inserted,
            total_attempted: leadIds.length,
            error: error?.message ?? "unknown_error",
          },
        })
        .eq("id", job.id);
    }

    return NextResponse.json({ ok: false, error: "queue_failed" }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    added: inserted,
    campaign_id: body.campaign_id,
  });
}

async function calculatePreview(
  service: ServiceSupabaseClient,
  campaignId: string,
  leadIds: string[]
) {
  if (leadIds.length === 0) {
    return { total: 0, duplicates: 0, to_add: 0 };
  }

  const { data: existingRows } = await service
    .from("campaign_audience")
    .select("lead_id")
    .eq("campaign_id", campaignId)
    .in("lead_id", leadIds);

  const existingSet = new Set((existingRows ?? []).map((row: any) => row.lead_id));

  return {
    total: leadIds.length,
    duplicates: existingSet.size,
    to_add: leadIds.filter((id) => !existingSet.has(id)).length,
  };
}

async function upsertAudience(
  service: ServiceSupabaseClient,
  accountId: string,
  campaignId: string,
  leadIds: string[]
) {
  if (leadIds.length === 0) {
    return 0;
  }

  const chunkSize = 1000;
  let inserted = 0;

  for (let i = 0; i < leadIds.length; i += chunkSize) {
    const chunk = leadIds.slice(i, i + chunkSize).map((leadId) => ({
      account_id: accountId,
      campaign_id: campaignId,
      lead_id: leadId,
      source: "saved_view",
    }));

    const { error, count } = await service
      .from("campaign_audience")
      .upsert(chunk, {
        onConflict: "campaign_id,lead_id",
        ignoreDuplicates: true,
        count: "exact",
      });

    if (error) {
      throw error;
    }

    inserted += count ?? 0;
  }

  return inserted;
}

