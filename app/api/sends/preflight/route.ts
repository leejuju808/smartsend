import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

type PreflightPayload = {
  campaign_id: string;
  account_id: string;
  lead_id: string;
  to: string;
  sender_email: string;
  subject?: string;
  body?: string;
  idem_key?: string | null;
};

export async function POST(req: Request) {
  const payload = (await req.json()) as PreflightPayload;

  const supabase = createServerClient();
  const { campaign_id, account_id, lead_id, to, sender_email, idem_key } = payload;

  const { data, error } = await supabase.rpc("preflight_check", {
    p_campaign_id: campaign_id,
    p_account_id: account_id,
    p_lead_id: lead_id,
    p_to: to,
    p_sender_email: sender_email,
    p_idem_key: idem_key ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}





