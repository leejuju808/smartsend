import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { campaignId, leadIds, maxAttempts = 3 } = await req.json();
    if (!campaignId || !Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ error: "campaignId and leadIds[] required" }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("retry_failed_leads", {
      p_campaign_id: campaignId,
      p_lead_ids: leadIds,
      p_max_attempts: maxAttempts,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      retriedCount: data?.length ?? 0,
      retriedLeadIds: data?.map((d: any) => d.lead_id) ?? [],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

// app/api/queue/retry-failed/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const { campaign_id, lead_ids, limit = 100, stagger_seconds = 2 } =
      (await req.json()) as {
        campaign_id: string;
        lead_ids?: string[]; // optional: retry specific leads only
        limit?: number;
        stagger_seconds?: number;
      };

    if (!campaign_id) {
      return NextResponse.json(
        { ok: false, error: "campaign_id required" },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY! // server-only
    );

    // 1) Pull failed queue items (optionally filter by lead_ids)
    let query = supabase
      .from("campaign_send_queue")
      .select("id, campaign_id, lead_id, to_email, subject, body, provider, workspace_id")
      .eq("campaign_id", campaign_id)
      .eq("status", "failed")
      .limit(limit);

    if (lead_ids?.length) query = query.in("lead_id", lead_ids);

    const { data: failed, error: e1 } = await query;
    if (e1) throw e1;

    if (!failed || failed.length === 0) {
      return NextResponse.json({
        ok: true,
        requeued: 0,
        message: "No failed items found.",
      });
    }

    // 2) Build fresh queued rows (stagger scheduled_at)
    const now = Date.now();
    const inserts = failed.map((f, i) => ({
      campaign_id: f.campaign_id,
      lead_id: f.lead_id,
      to_email: f.to_email,
      subject: f.subject,
      body: f.body,
      provider: f.provider,
      workspace_id: f.workspace_id,
      scheduled_at: new Date(now + i * stagger_seconds * 1000).toISOString(),
      status: "queued",
      retried_from: f.id,
      retry_count: 0,
      metadata: { reason: "retry_failed", original_id: f.id },
    }));

    const { data: requeued, error: e2 } = await supabase
      .from("campaign_send_queue")
      .insert(inserts)
      .select("id, lead_id");
    if (e2) throw e2;

    // 3) Log events for visibility (if campaign_logs exists and has the right structure)
    if (requeued && requeued.length > 0) {
      // Get org_id from campaign
      let orgId = null;
      if (campaign_id) {
        const { data: campaign } = await supabase
          .from("campaigns")
          .select("org_id")
          .eq("id", campaign_id)
          .maybeSingle();
        orgId = campaign?.org_id || null;
      }

      const logRows = requeued.map((r) => ({
        campaign_id,
        lead_id: r.lead_id,
        org_id: orgId,
        queue_id: r.id,
        event_type: "queued",
        details: { reason: "retry_failed" },
        created_at: new Date().toISOString(),
      }));

      // Try to insert logs (campaign_logs might have different structure)
      try {
        const { error: e3 } = await supabase
          .from("campaign_logs")
          .insert(logRows);
        if (e3) {
          console.warn("Log insert failed:", e3.message);
          // Not fatal, continue
        }
      } catch (logError) {
        console.warn("Could not insert logs:", logError);
        // Continue anyway
      }
    }

    // 4) Update original failed items with retry metadata (optional)
    // Note: This would require an RPC function in the database to increment counters
    // For now, we skip this as it's optional and requires additional setup

    return NextResponse.json({
      ok: true,
      requeued: requeued.length,
    });
  } catch (e: any) {
    console.error("Retry failed error:", e);
    return NextResponse.json(
      { ok: false, error: e.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}