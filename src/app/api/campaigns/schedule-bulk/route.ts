// app/api/campaigns/schedule-bulk/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { renderTemplate } from "@/lib/templating";
import { getDefaultSender } from "@/lib/defaultSender";

function randHex(len=24){const b=crypto.getRandomValues(new Uint8Array(len));return Array.from(b).map(x=>x.toString(16).padStart(2,"0")).join("");}

type Variant = { key: string; weight_pct: number; subject_template: string; html_template: string };

export async function POST(req: NextRequest) {
  const { listId, campaignId, subjectTemplate, htmlTemplate, scheduledAt, variants } = await req.json();
  if (!listId || !subjectTemplate || !htmlTemplate || !scheduledAt) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, 
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { 
      cookies: { 
        get: (name: string) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {}
      } 
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get user's default sender
  const sender = await getDefaultSender(user.id);
  const fromEmail = sender || (process.env.NEXT_PUBLIC_DEFAULT_FROM ?? "SmartSend <no-reply@yourdomain.com>");

  // If variants were passed, upsert them so analytics view can use them
  if (variants?.length) {
    // normalize weights to sum 100 (MVP: trust caller; or rescale here)
    await supabase.from("campaign_variants").delete().eq("campaign_id", campaignId);
    await supabase.from("campaign_variants").insert(
      (variants as Variant[]).map(v => ({ campaign_id: campaignId, ...v }))
    );
  }

  // get contacts in list who are not suppressed
  const { data: contacts, error } = await supabase
    .from("v_list_active_contacts")
    .select("*")
    .eq("user_id", user.id)
    .eq("list_id", listId)
    .limit(50000); // safety cap
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const jobs = (contacts ?? []).map(c => {
    let vId: string | null = null;
    let subj = subjectTemplate;
    let html = htmlTemplate;

    // Client-side deterministic variant pick (fallback)
    if (variants?.length) {
      const seed = `${campaignId}:${c.id || c.email}`;
      const bucket = Number.parseInt(crypto.createHash('md5').update(seed).digest('hex').slice(0,8), 16) % 100;
      let acc = 0; 
      let chosen: Variant | null = null;
      for (const v of variants as Variant[]) { 
        acc += v.weight_pct; 
        if (bucket < acc) { 
          chosen = v; 
          break; 
        } 
      }
      if (chosen) {
        subj = chosen.subject_template; 
        html = chosen.html_template;
        // Note: For perfect campaign-variant attribution, you can resolve variant_id by 
        // inserting variants first, then loading them (select id,key), picking deterministically 
        // client-side, and setting variant_id accordingly.
      }
    }

    const data = {
      contact: {
        email: c.email,
        first_name: c.first_name,
        last_name: c.last_name,
        company: c.company,
        custom: c.custom || {}
      }
    };
    const subject = renderTemplate(subj, data);
    const body = renderTemplate(html, data);

    return {
      user_id: user.id,
      campaign_id: campaignId,
      variant_id: vId, // if you resolved exact id, set it; else omit and rely on sequence tests for now
      to_email: c.email,
      subject,
      body_html: body,
      scheduled_at: new Date(scheduledAt).toISOString(),
      unsub_token: null,            // filled by scheduleEmail earlier; optional here
      tracking_token: randHex(16),
      from_email: fromEmail,
      contact_id: c.id ?? null
    };
  });

  // insert in batches of 1000
  for (let i=0;i<jobs.length;i+=1000) {
    const batch = jobs.slice(i,i+1000);
    if (batch.length) {
      const { error: insErr } = await supabase.from("email_jobs").insert(batch);
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true, enqueued: jobs.length });
}