import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { nextAtHour } from "@/lib/sto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const runtime = "nodejs";

/**
 * Body:
 * {
 *   campaignId: uuid,
 *   leadIds: uuid[],
 *   startAt?: ISO string (default now),
 *   orgId?: uuid|null,
 * }
 * Creates send_queue rows per (lead x step) with scheduled_at = startAt + delay_hours
 */
export async function POST(req: Request) {
  try {
    const { campaignId, leadIds, startAt } = await req.json();
    if (!campaignId || !Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ error: "campaignId and leadIds[] required" }, { status: 400 });
    }

    const sb = createClient(url, service, { auth: { persistSession: false } });

    const { data: steps, error: stepErr } = await sb
      .from("campaign_steps")
      .select("id, step_no, delay_hours, subject, body")
      .eq("campaign_id", campaignId)
      .order("step_no", { ascending: true });

    if (stepErr) return NextResponse.json({ error: stepErr.message }, { status: 500 });
    if (!steps || steps.length === 0) return NextResponse.json({ error: "No steps configured" }, { status: 400 });

    // Pre-fetch all variants for all steps
    const stepIds = steps.map((s: any) => s.id);
    const { data: allVariants } = await sb
      .from("campaign_step_variants")
      .select("*")
      .in("step_id", stepIds);

    const variantsByStepId = new Map<string, any[]>();
    (allVariants || []).forEach((v: any) => {
      if (!variantsByStepId.has(v.step_id)) {
        variantsByStepId.set(v.step_id, []);
      }
      variantsByStepId.get(v.step_id)!.push(v);
    });

    const { data: campaignMeta } = await sb
      .from("campaigns")
      .select("default_tz")
      .eq("id", campaignId)
      .maybeSingle();

    const fallbackTz = campaignMeta?.default_tz ?? "America/Los_Angeles";

    const stoProfiles = new Map<
      string,
      { best_hour: number | null; best_hour_conf: number | null; tz: string | null }
    >();
    const leadTz = new Map<string, string | null>();
    const leadList = Array.from(new Set(leadIds));

    if (leadList.length) {
      const { data: stoRows } = await sb
        .from("lead_sto_profiles")
        .select("lead_id,best_hour,best_hour_conf,tz")
        .eq("campaign_id", campaignId)
        .in("lead_id", leadList);
      (stoRows ?? []).forEach((row: any) =>
        stoProfiles.set(row.lead_id, {
          best_hour: row.best_hour,
          best_hour_conf: row.best_hour_conf,
          tz: row.tz,
        })
      );

      const { data: leadRows } = await sb
        .from("campaign_leads")
        .select("id, timezone")
        .in("id", leadList);
      (leadRows ?? []).forEach((row: any) =>
        leadTz.set(row.id, row.timezone ?? null)
      );
    }

    const base = startAt ? new Date(startAt) : new Date();
    const rows: any[] = [];
    const now = new Date();

    for (const leadId of leadIds) {
      for (const s of steps) {
        // Step 1: Fetch all variants for this step
        let variants = variantsByStepId.get(s.id) || [];

        // Step 2: If no variants → use base step as variant A (auto-create)
        if (variants.length === 0) {
          const { data: baseStep } = await sb
            .from("campaign_steps")
            .select("*")
            .eq("id", s.id)
            .single();

          if (baseStep) {
            const { data: vA, error: vAErr } = await sb
              .from("campaign_step_variants")
              .insert({
                step_id: s.id,
                variant_key: "A",
                subject: baseStep.subject || baseStep.subject_template || "",
                body: baseStep.body || baseStep.body_html_template || baseStep.body_html || "",
                delay_hours: baseStep.delay_hours || baseStep.offset_days ? (baseStep.offset_days * 24) : null,
              })
              .select()
              .single();

            if (!vAErr && vA) {
              variants = [vA];
              variantsByStepId.set(s.id, variants);
            }
          }
        }

        // Step 3: Randomly assign a variant
        const chosen = variants[Math.floor(Math.random() * variants.length)];

        // Step 4: Save assignment (if not already assigned)
        if (chosen) {
          const { error: assignErr } = await sb
            .from("lead_step_assignments")
            .upsert({
              lead_id: leadId,
              step_id: s.id,
              variant_id: chosen.id,
            }, {
              onConflict: "lead_id,step_id",
            });

          // Continue even if assignment fails (might already exist)
        }

        const scheduled = new Date(base.getTime() + (Number(chosen?.delay_hours || s.delay_hours || 0)) * 3600_000);
        const earliest = scheduled > now ? scheduled : now;

        let scheduled_at: string | null = scheduled > now ? scheduled.toISOString() : null;
        let status: "queued" | "scheduled" = scheduled > now ? "scheduled" : "queued";

        const sto = stoProfiles.get(leadId);
        const tz =
          sto?.tz ??
          leadTz.get(leadId) ??
          fallbackTz;

        if (
          sto &&
          sto.best_hour !== null &&
          (sto.best_hour_conf ?? 0) >= 0.2 &&
          tz
        ) {
          let candidate = nextAtHour(tz, sto.best_hour);
          while (candidate < earliest) {
            candidate = new Date(candidate.getTime() + 86_400_000);
          }
          scheduled_at = candidate.toISOString();
          status = "scheduled";
        }

        // Step 5: Use variant's subject/body in queue creation
        rows.push({
          campaign_id: campaignId,
          lead_id: leadId,
          subject: chosen?.subject || s.subject || "",
          body: chosen?.body || s.body || "",
          status,
          step_no: s.step_no,
          scheduled_at,
          variant_id: chosen?.id || null,
        });
      }
    }

    // Bulk insert in chunks
    const chunk = 1000;
    for (let i = 0; i < rows.length; i += chunk) {
      const slice = rows.slice(i, i + chunk);
      const { error } = await sb.from("send_queue").insert(slice);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, enqueued: rows.length, stepsPerLead: steps.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Schedule failed" }, { status: 500 });
  }
}


