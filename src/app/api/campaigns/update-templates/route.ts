import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/service";
import { getActiveWorkspaceId } from "@/lib/workspaces/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: Request) {
  try {
    const { campaignId, subject_tpl, text_tpl, html_tpl } = await req.json();
    if (!campaignId) return new NextResponse("Missing campaignId", { status: 400 });

    const ws = await getActiveWorkspaceId();
    const supabase = createServerClient();
    
    // Get user for audit log
    const routeSupabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await routeSupabase.auth.getUser();
    
    // Get old values for audit log
    const { data: oldCampaign } = await supabase
      .from("campaigns")
      .select("subject_tpl, text_tpl, html_tpl")
      .eq("id", campaignId)
      .eq("workspace_id", ws)
      .single();

    const { error } = await supabase
      .from("campaigns")
      .update({
        subject_tpl: subject_tpl ?? null,
        text_tpl: text_tpl ?? null,
        html_tpl: html_tpl ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", campaignId)
      .eq("workspace_id", ws);

    if (error) return new NextResponse(error.message, { status: 500 });

    // Log audit event
    if (user) {
      const fields: string[] = [];
      const meta: any = {};
      
      if (oldCampaign?.subject_tpl !== subject_tpl) {
        fields.push("subject");
        meta.subject_chars_before = oldCampaign?.subject_tpl?.length || 0;
        meta.subject_chars_after = subject_tpl?.length || 0;
      }
      
      if (oldCampaign?.text_tpl !== text_tpl) {
        fields.push("text");
        meta.text_chars_before = oldCampaign?.text_tpl?.length || 0;
        meta.text_chars_after = text_tpl?.length || 0;
      }
      
      if (oldCampaign?.html_tpl !== html_tpl) {
        fields.push("html");
        meta.html_chars_before = oldCampaign?.html_tpl?.length || 0;
        meta.html_chars_after = html_tpl?.length || 0;
      }

      if (fields.length > 0) {
        await routeSupabase.rpc("log_audit", {
          p_actor: user.id,
          p_campaign: campaignId,
          p_entity_type: "template",
          p_entity: campaignId,
          p_action: "edit_template",
          p_meta: { fields, ...meta }
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return new NextResponse(e?.message ?? "Bad Request", { status: 400 });
  }
}
