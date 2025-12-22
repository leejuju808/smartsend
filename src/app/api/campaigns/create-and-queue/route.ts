import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { renderTemplate, leadCtx } from "@/lib/merge/renderTemplate";

const Schema = z.object({
  name: z.string().min(2),
  subject: z.string().min(1),
  body_html: z.string().min(1),
  sender_profile_id: z.string().uuid().optional(),
  schedule_at: z.string().datetime(),         // ISO string
  daily_limit: z.number().int().min(1).max(2000),
  lead_ids: z.array(z.string().uuid()).min(1)
});

function normalizeMarketKey(city: string | null | undefined, state: string | null | undefined) {
  const c = String(city || "").trim();
  const s = String(state || "").trim();
  if (!c || !s) return null;
  return `${c.toLowerCase()}, ${s.toUpperCase()}`;
}

export async function POST(req: Request) {
  const json = await req.json();
  const parsed = Schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { name, subject, body_html, sender_profile_id, schedule_at, daily_limit, lead_ids } = parsed.data;

  // Identify user (from auth cookie)
  const supabase = createClient();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch leads (emails) and ensure ownership
  const { data: leads, error: leadsErr } = await supabaseAdmin
    .from("leads")
    .select("id,email,first_name,last_name,company,title,city,state")
    .in("id", lead_ids)
    .eq("user_id", user.id);

  if (leadsErr) return NextResponse.json({ error: leadsErr.message }, { status: 500 });
  if (!leads?.length) return NextResponse.json({ error: "No leads found" }, { status: 400 });

  // Filter out suppressed emails (defense-in-depth)
  const { data: suppressed } = await supabaseAdmin
    .from("suppressions")
    .select("email")
    .eq("user_id", user.id);
  const block = new Set((suppressed ?? []).map(r => r.email.toLowerCase()));
  const leadsToQueue = leads.filter(l => !block.has(l.email.toLowerCase()));
  
  if (leadsToQueue.length === 0) {
    return NextResponse.json({ error: "All leads are suppressed" }, { status: 400 });
  }
  
  const suppressedCount = leads.length - leadsToQueue.length;

  // Block 267700: One campaign = one city (infer dominant city/state and only enqueue that market)
  const marketCounts = new Map<string, { key: string; city: string; state: string; n: number }>();
  for (const l of leadsToQueue) {
    const key = normalizeMarketKey((l as any).city, (l as any).state);
    if (!key) continue;
    const city = String((l as any).city || "").trim();
    const state = String((l as any).state || "").trim();
    const cur = marketCounts.get(key);
    marketCounts.set(key, { key, city, state, n: (cur?.n ?? 0) + 1 });
  }

  const dominantMarket =
    Array.from(marketCounts.values()).sort((a, b) => b.n - a.n)[0] ?? null;

  const marketCity = dominantMarket?.city ?? null;
  const marketState = dominantMarket?.state ?? null;
  const marketKey = dominantMarket?.key ?? null;

  const leadsInMarket =
    marketKey
      ? leadsToQueue.filter((l) => normalizeMarketKey((l as any).city, (l as any).state) === marketKey)
      : leadsToQueue;

  const excludedOutsideMarket = leadsToQueue.length - leadsInMarket.length;

  if (leadsInMarket.length === 0) {
    return NextResponse.json(
      {
        error:
          "No leads match a single city/state. Add city/state to your leads, or select leads from one city.",
      },
      { status: 400 }
    );
  }

  // Get current org_id from profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("current_org_id")
    .eq("id", user.id)
    .single();

  // 1) Create campaign
  const { data: campaign, error: campErr } = await supabaseAdmin
    .from("campaigns")
    .insert([{
      user_id: user.id,
      name,
      subject,
      body_html,
      sender_profile_id: sender_profile_id ?? null,
      schedule_at: schedule_at,
      daily_limit,
      org_id: profile?.current_org_id || null,
      market_city: marketCity,
      market_state: marketState,
      market_key: marketKey
    }])
    .select("*")
    .single();

  if (campErr) return NextResponse.json({ error: campErr.message }, { status: 500 });

  // 2) Join rows (only for non-suppressed leads)
  const joinRows = leadsInMarket.map(l => ({ campaign_id: campaign.id, lead_id: l.id }));
  const { error: joinErr } = await supabaseAdmin.from("campaign_leads").insert(joinRows);
  if (joinErr) return NextResponse.json({ error: joinErr.message }, { status: 500 });

  // 3) Check if A/B testing is enabled for this campaign
  const { data: abVariants } = await supabaseAdmin
    .from("ab_variants")
    .select("id, variant_label, subject, body")
    .eq("campaign_id", campaign.id);

  const hasABTesting = abVariants && abVariants.length > 0;

  // 3) Enqueue (scheduled) - pre-render templates per lead (only non-suppressed)
  // Note: For A/B testing, we assign variants during queue creation
  const queueRows = await Promise.all(leadsInMarket.map(async (l) => {
    const ctx = leadCtx({ 
      first_name: (l as any).first_name,
      last_name: (l as any).last_name,
      company: (l as any).company,
      title: (l as any).title,
      city: (l as any).city,
      state: (l as any).state,
      email: (l as any).email
    });

    let finalSubject = renderTemplate(subject, ctx);
    let finalBody = renderTemplate(body_html, ctx);
    let abVariantId = null;

    // Assign A/B variant if testing is enabled
    if (hasABTesting) {
      const zipCode = (l as any).zip_code || null;
      const { data: assignedVariant } = await supabaseAdmin.rpc("assign_ab_variant", {
        p_campaign_id: campaign.id,
        p_lead_id: l.id,
        p_zip_code: zipCode,
      });

      if (assignedVariant) {
        const variant = abVariants.find((v: any) => v.id === assignedVariant);
        if (variant) {
          finalSubject = renderTemplate(variant.subject, ctx);
          finalBody = renderTemplate(variant.body, ctx);
          abVariantId = variant.id;
        }
      }
    }

    return {
      campaign_id: campaign.id,
      lead_id: l.id,
      to_email: l.email,
      subject: finalSubject,
      body_html: finalBody,
      status: "queued",
      scheduled_at: schedule_at,
      ab_variant_id: abVariantId,
    };
  }));

  const { error: queueErr } = await supabaseAdmin.from("send_queue").insert(queueRows);
  if (queueErr) return NextResponse.json({ error: queueErr.message }, { status: 500 });

  return NextResponse.json({ 
    campaignId: campaign.id, 
    queued: queueRows.length,
    suppressed: suppressedCount,
    excluded_outside_market: excludedOutsideMarket,
    market: marketKey ? `${marketCity}, ${marketState}` : null
  }, { status: 201 });
}

