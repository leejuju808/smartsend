// app/api/bounce-webhook/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

// ⚠️ Use service key because provider webhooks bypass auth
const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  if (!json) return NextResponse.json({ ok: false }, { status: 400 });

  const { email, reason, campaignId } = json;

  if (!email) return NextResponse.json({ ok: false }, { status: 400 });

  // 1) find lead by email
  const { data: lead } = await supabase
    .from("leads")
    .select("*")
    .eq("email", email)
    .single();

  if (!lead) {
    return NextResponse.json({ ok: true }); // nothing to do
  }

  // 2) insert bounce log (upsert by checking if exists first)
  const { data: existing } = await supabase
    .from("email_bounces")
    .select("id")
    .eq("lead_id", lead.id)
    .eq("campaign_id", campaignId ?? null)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("email_bounces")
      .update({
        reason,
        raw_payload: json,
      })
      .eq("id", existing.id);
  } else {
    await supabase.from("email_bounces").insert({
      lead_id: lead.id,
      campaign_id: campaignId ?? null,
      reason,
      raw_payload: json,
    });
  }

  // 3) mark lead as bounced
  await supabase
    .from("leads")
    .update({ bounced: true })
    .eq("id", lead.id);

  // 4) Notify workspace owner about bounce
  if (lead.workspace_id) {
    try {
      // Get workspace owner
      const { data: workspace } = await supabase
        .from("workspaces")
        .select("owner_id")
        .eq("id", lead.workspace_id)
        .maybeSingle();

      if (workspace?.owner_id) {
        await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/notifications/create`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user_id: workspace.owner_id,
            workspace_id: lead.workspace_id,
            type: "bounce",
            title: "Email Bounced",
            body: `Message to ${lead.email} bounced`,
            link: `/leads/${lead.id}`,
          }),
        }).catch((err) => {
          console.error("Failed to send bounce notification:", err);
        });
      }
    } catch (err) {
      console.error("Error sending bounce notification:", err);
    }
  }

  return NextResponse.json({ ok: true });
}

