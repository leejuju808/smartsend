import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  const tokenId = u.searchParams.get("t");
  const target = u.searchParams.get("u");
  
  if (!tokenId || !target) {
    return NextResponse.redirect("https://example.com", 302);
  }

  try {
    const { data: tok, error } = await supabase
      .from("lead_tracking_tokens")
      .select("id, workspace_id, campaign_id, lead_id")
      .eq("id", tokenId)
      .maybeSingle();

    if (!error && tok) {
      const ua = req.headers.get("user-agent") || "";
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";

      await supabase.from("lead_email_events").insert({
        workspace_id: tok.workspace_id,
        campaign_id: tok.campaign_id,
        lead_id: tok.lead_id,
        token_id: tok.id,
        type: "click",
        url: target,
        ua,
        ip: ip || null
      });
    }
  } catch {
    // Continue to redirect even if tracking fails
  }

  // Safe redirect to target
  return NextResponse.redirect(target, 302);
}

