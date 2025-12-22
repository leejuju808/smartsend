import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyUnsubToken } from "@/lib/unsub";
import { updateLeadScore } from "@/lib/lead-scoring";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const emailParam = new URL(req.url).searchParams.get("e") ?? "";
  const token = new URL(req.url).searchParams.get("t");

  let decoded = "";
  try {
    decoded = Buffer.from(emailParam, "base64").toString("utf8");
  } catch {
    decoded = "";
  }

  if (!decoded) {
    return new NextResponse("Invalid unsubscribe link.", { status: 400 });
  }

  let tokenPayload: ReturnType<typeof verifyUnsubToken> = null;
  if (token) {
    tokenPayload = verifyUnsubToken(token);
    if (!tokenPayload || tokenPayload.e.toLowerCase() !== decoded.toLowerCase()) {
      return new NextResponse("Invalid unsubscribe token.", { status: 400 });
    }
  }

  await supabase.from("deliverability_events").insert({
    provider: "http",
    event_type: "unsubscribe",
    rcpt_email: decoded.toLowerCase(),
    meta: {
      source: "one-click",
      token_present: Boolean(token),
      token_valid: Boolean(tokenPayload),
      campaign_id: tokenPayload?.c ?? null,
    },
  });

  // BLOCK 181: Increment unsubscribe counter for deliverability tracking
  if (tokenPayload?.c) {
    try {
      // Get campaign to find account_id and from_email
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("account_id, from_email, workspace_id")
        .eq("id", tokenPayload.c)
        .maybeSingle();

      if (campaign?.account_id && campaign?.from_email) {
        const senderDomain = campaign.from_email.split('@')[1]?.toLowerCase();
        if (senderDomain) {
          await supabase.rpc('increment_unsubscribe', {
            acc: campaign.account_id,
            dom: senderDomain
          }).catch(err => {
            console.error('Error incrementing unsubscribe counter:', err);
          });
        }
      }

      // Block 8850: Update lead score for unsubscribe
      if (campaign?.workspace_id) {
        const { data: lead } = await supabase
          .from("leads")
          .select("id")
          .eq("email", decoded.toLowerCase())
          .eq("workspace_id", campaign.workspace_id)
          .maybeSingle();

        if (lead?.id) {
          updateLeadScore(lead.id, "unsubscribe", campaign.workspace_id);
        }
      }
    } catch (err) {
      console.error('Error tracking unsubscribe for deliverability:', err);
    }
  }

  return new NextResponse("You're unsubscribed. 👍", { status: 200 });
}


