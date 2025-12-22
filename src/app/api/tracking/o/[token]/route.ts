import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// 1x1 transparent PNG
const PNG = Uint8Array.from([
  0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x00,0x00,0x00,0x0d,0x49,0x48,0x44,0x52,
  0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x01,0x08,0x06,0x00,0x00,0x00,0x1f,0x15,0xc4,
  0x89,0x00,0x00,0x00,0x0a,0x49,0x44,0x41,0x54,0x78,0x9c,0x63,0x00,0x01,0x00,0x00,
  0x05,0x00,0x01,0x0d,0x0a,0x2d,0xb4,0x00,0x00,0x00,0x00,0x49,0x45,0x4e,0x44,0xae,
  0x42,0x60,0x82
]);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const tokenId = params.token;

    const { data: tok, error } = await supabase
      .from("lead_tracking_tokens")
      .select("id, workspace_id, campaign_id, lead_id")
      .eq("id", tokenId)
      .maybeSingle();

    if (error || !tok) {
      return new NextResponse(PNG, { 
        status: 200, 
        headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } 
      });
    }

    const ua = _req.headers.get("user-agent") || "";
    const ip = _req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";

    await supabase.from("lead_email_events").insert({
      workspace_id: tok.workspace_id,
      campaign_id: tok.campaign_id,
      lead_id: tok.lead_id,
      token_id: tok.id,
      type: "open",
      ua,
      ip: ip || null
    });

    return new NextResponse(PNG, { 
      status: 200, 
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } 
    });
  } catch {
    return new NextResponse(PNG, { 
      status: 200, 
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } 
    });
  }
}

